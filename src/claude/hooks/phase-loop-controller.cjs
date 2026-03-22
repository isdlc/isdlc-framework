#!/usr/bin/env node
/**
 * iSDLC Phase-Loop Controller - PreToolUse[Task] Hook
 * =====================================================
 * Blocks phase delegation when the orchestrator has not called TaskUpdate
 * to mark the phase as in_progress. Ensures user visibility of progress.
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-01, AC-01, AC-01a, AC-01b, AC-01c
 * BUG-0013: Same-phase bypass added — sub-agent Task calls within the
 *           active phase are no longer falsely blocked.
 * Version: 1.2.0
 */

const {
    debugLog,
    logHookEvent,
    detectPhaseDelegation
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0091: Bridge-first delegation to core workflow
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'workflow.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow'|'block', stopReason?: string, stderr?: string, stdout?: string, stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Only intercept Task tool calls
        if (input.tool_name !== 'Task') {
            return { decision: 'allow' };
        }

        // Detect if this is a phase delegation
        const delegation = detectPhaseDelegation(input);
        if (!delegation.isDelegation) {
            debugLog('Not a phase delegation, allowing');
            return { decision: 'allow' };
        }

        debugLog('Phase delegation detected:', delegation.targetPhase, delegation.agentName);

        // Read state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            return { decision: 'allow' };
        }

        // Check for active workflow
        if (!state.active_workflow) {
            debugLog('No active workflow, allowing');
            return { decision: 'allow' };
        }

        const currentPhase = state.active_workflow.current_phase;
        if (!currentPhase) {
            debugLog('No current phase, allowing');
            return { decision: 'allow' };
        }

        // BUG-0013: Same-phase bypass — sub-agent Task calls within the active
        // phase are legitimate and must not be blocked regardless of phase status.
        // detectPhaseDelegation resolves sub-agents (e.g. symptom-analyzer,
        // execution-path-tracer) to their parent phase; when that matches
        // currentPhase the call is intra-phase, not a cross-phase delegation.
        if (delegation.targetPhase === currentPhase) {
            debugLog('Same-phase delegation detected (targetPhase === currentPhase), allowing');
            logHookEvent('phase-loop-controller', 'same-phase-bypass', {
                phase: currentPhase,
                agent: delegation.agentName || 'unknown',
                reason: 'targetPhase matches currentPhase — intra-phase sub-agent call'
            });
            return { decision: 'allow' };
        }

        // Check phase status
        const phaseState = state.phases && state.phases[currentPhase];
        const phaseStatus = phaseState && phaseState.status;

        if (phaseStatus === 'in_progress' || phaseStatus === 'completed') {
            debugLog('Phase status is', phaseStatus, '- allowing');
            return { decision: 'allow' };
        }

        // Block: phase status is not in_progress
        const agentLabel = delegation.agentName || delegation.targetPhase || 'unknown';
        logHookEvent('phase-loop-controller', 'block', {
            phase: delegation.targetPhase,
            agent: agentLabel,
            reason: `Phase status is '${phaseStatus || 'not set'}', expected 'in_progress'`
        });

        const stopReason =
            `PHASE DELEGATION WITHOUT PROGRESS TRACKING: You are delegating to ` +
            `phase agent '${agentLabel}' for phase '${delegation.targetPhase}', ` +
            `but the phase task has not been marked as in_progress.\n\n` +
            `Before delegating, you MUST:\n` +
            `1. Call TaskCreate to create a task for this phase (if not already created)\n` +
            `2. Call TaskUpdate to set the task status to in_progress\n\n` +
            `This ensures the user can see phase progress via spinners. The phase status ` +
            `in state.json must be "in_progress" before delegation can proceed.\n\n` +
            `Current phase status: ${phaseStatus || 'not set'}`;

        return { decision: 'block', stopReason };

    } catch (error) {
        debugLog('Error in phase-loop-controller:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) {
                process.exit(0);
            }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) {
                console.error(result.stderr);
            }
            if (result.stdout) {
                console.log(result.stdout);
            }
            if (result.decision === 'block' && result.stopReason) {
                const { outputBlockResponse } = require('./lib/common.cjs');
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) {
            process.exit(0);
        }
    })();
}
