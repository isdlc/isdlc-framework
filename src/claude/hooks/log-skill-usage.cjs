#!/usr/bin/env node
/**
 * iSDLC Skill Observability - PostToolUse Logging Hook
 * ====================================================
 * Logs all Task tool invocations to skill_usage_log in state.json
 * Cross-platform Node.js implementation
 *
 * This hook receives JSON input via stdin with the structure:
 * {
 *   "tool_name": "Task",
 *   "tool_input": {
 *     "subagent_type": "software-developer",
 *     "prompt": "...",
 *     "description": "..."
 *   },
 *   "tool_result": "..."
 * }
 *
 * Version: 3.1.0
 */

const {
    loadManifest,
    loadExternalManifest,
    normalizeAgentName,
    getTimestamp,
    debugLog,
    addSkillLogEntry
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0092: Bridge-first delegation to core observability
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'observability.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Extract tool name
        const toolName = input.tool_name;

        // Only log Task tool calls
        if (toolName !== 'Task') {
            return { decision: 'allow' };
        }

        // Extract tool_input
        const toolInput = input.tool_input;
        if (!toolInput) {
            return { decision: 'allow' };
        }

        // Extract target agent from subagent_type
        let targetAgent = toolInput.subagent_type;
        if (!targetAgent) {
            return { decision: 'allow' };
        }

        // Normalize agent name
        targetAgent = normalizeAgentName(targetAgent);

        // Extract description if available
        const description = toolInput.description || 'N/A';

        // Load state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json found, skipping logging');
            return { decision: 'allow' };
        }

        // Check if enforcement is enabled
        const enforcement = state.skill_enforcement || {};
        if (enforcement.enabled === false) {
            debugLog('Enforcement disabled, skipping logging');
            return { decision: 'allow' };
        }

        // Get enforcement mode
        const enforcementMode = enforcement.mode || 'strict';

        // Get current phase — BUG-0005 (AC-03c): prefer active_workflow.current_phase
        const currentPhase = state.active_workflow?.current_phase || state.current_phase || '01-requirements';

        // Load manifest to determine authorization (prefer ctx.manifest)
        const manifest = ctx.manifest || loadManifest();

        // Load external manifest for recognition
        const externalManifest = loadExternalManifest();
        const externalSkillsRegistered = externalManifest && externalManifest.skills
            ? Object.keys(externalManifest.skills).length
            : 0;

        // Determine authorization status
        let status = 'executed';
        let reason = 'allowed';
        let agentPhase = '';

        if (manifest && manifest.ownership && manifest.ownership[targetAgent]) {
            agentPhase = manifest.ownership[targetAgent].phase || '';

            if (agentPhase === 'all') {
                reason = 'authorized-orchestrator';
            } else if (agentPhase === currentPhase) {
                reason = 'authorized-phase-match';
            } else {
                // Cross-phase usage — allowed in all modes (observability model)
                switch (enforcementMode) {
                    case 'observe':
                        status = 'observed';
                        reason = 'cross-phase-usage';
                        break;
                    case 'warn':
                        status = 'warned';
                        reason = 'cross-phase-usage';
                        break;
                    case 'audit':
                        status = 'audited';
                        reason = 'cross-phase-usage';
                        break;
                    case 'strict':
                        // Legacy strict mode — now observability-only
                        status = 'observed';
                        reason = 'cross-phase-usage';
                        break;
                    default:
                        status = 'observed';
                        reason = 'cross-phase-usage';
                }
            }
        }

        // Create log entry
        const logEntry = {
            timestamp: getTimestamp(),
            agent: targetAgent,
            agent_phase: agentPhase,
            current_phase: currentPhase,
            description: description,
            status: status,
            reason: reason,
            enforcement_mode: enforcementMode,
            external_skills_registered: externalSkillsRegistered
        };

        // Append to skill_usage_log in memory
        if (addSkillLogEntry(state, logEntry)) {
            debugLog(`Logged skill usage: ${targetAgent} (${status})`);
            return { decision: 'allow', stateModified: true };
        } else {
            debugLog('Failed to log skill usage');
            return { decision: 'allow' };
        }

    } catch (error) {
        debugLog('Error in log-skill-usage:', error.message);
        // Fail silently on errors
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, writeState: writeStateFn, loadManifest: loadManifestFn, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) { process.exit(0); }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifestFn();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) console.error(result.stderr);
            if (result.stdout) console.log(result.stdout);
            if (result.stateModified && state) {
                writeStateFn(state);
            }
            process.exit(0);
        } catch (e) { process.exit(0); }
    })();
}
