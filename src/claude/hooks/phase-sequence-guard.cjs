#!/usr/bin/env node
/**
 * iSDLC Phase Sequence Guard - PreToolUse[Task] Hook
 * ====================================================
 * Blocks out-of-order phase delegation. The target phase of a delegation
 * must match the current workflow phase.
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-03, AC-03, AC-03a, AC-03b, AC-03c, AC-03d
 * Version: 1.1.0
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

        if (input.tool_name !== 'Task') {
            return { decision: 'allow' };
        }

        // Detect if this is a phase delegation
        const delegation = detectPhaseDelegation(input);
        if (!delegation.isDelegation) {
            debugLog('Not a phase delegation, allowing');
            return { decision: 'allow' };
        }

        debugLog('Phase delegation detected -> target:', delegation.targetPhase);

        // Read state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            return { decision: 'allow' };
        }

        if (!state.active_workflow) {
            debugLog('No active workflow, allowing');
            return { decision: 'allow' };
        }

        const currentPhase = state.active_workflow.current_phase;
        if (!currentPhase) {
            debugLog('No current phase set, allowing');
            return { decision: 'allow' };
        }

        const targetPhase = delegation.targetPhase;
        if (!targetPhase) {
            debugLog('No target phase detected, allowing (fail-open)');
            return { decision: 'allow' };
        }

        // Allow if target matches current
        if (targetPhase === currentPhase) {
            debugLog('Target phase matches current phase, allowing');
            return { decision: 'allow' };
        }

        // Extract gate number from current phase (e.g., '03-architecture' -> '03')
        const gateMatch = currentPhase.match(/^(\d+)/);
        const gateNumber = gateMatch ? gateMatch[1] : '??';

        // Block: out-of-order phase delegation
        const agentLabel = delegation.agentName || 'unknown';
        logHookEvent('phase-sequence-guard', 'block', {
            phase: currentPhase,
            agent: agentLabel,
            reason: `Target phase '${targetPhase}' does not match current '${currentPhase}'`
        });

        const stopReason =
            `OUT-OF-ORDER PHASE DELEGATION: Attempting to delegate to phase ` +
            `'${targetPhase}' (agent: ${agentLabel}), but the current workflow ` +
            `phase is '${currentPhase}'.\n\n` +
            `Phases must execute in the order defined by the workflow. You cannot ` +
            `skip ahead or go back to a previous phase without advancing through ` +
            `the gate.\n\n` +
            `To proceed correctly:\n` +
            `- Complete the current phase '${currentPhase}' and pass GATE-${gateNumber}\n` +
            `- Then the orchestrator will advance to the next phase automatically\n\n` +
            `Current phase: ${currentPhase}\n` +
            `Target phase:  ${targetPhase}`;

        return { decision: 'block', stopReason };

    } catch (error) {
        debugLog('Error in phase-sequence-guard:', error.message);
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
