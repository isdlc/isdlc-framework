#!/usr/bin/env node
/**
 * iSDLC Skill Observability - PreToolUse Observability Hook
 * =========================================================
 * Intercepts Task tool calls and observes agent delegation patterns.
 * All delegations are allowed — skill IDs serve as event identifiers
 * for logging and visibility, not access-control tokens.
 * Cross-platform Node.js implementation
 *
 * This hook receives JSON input via stdin with the structure:
 * {
 *   "tool_name": "Task",
 *   "tool_input": {
 *     "subagent_type": "software-developer",
 *     "prompt": "...",
 *     "description": "..."
 *   }
 * }
 *
 * Output:
 * - Exit 0 with no output: Allow the tool call (always)
 *
 * Version: 3.1.0
 */

const {
    readState,
    loadManifest,
    loadExternalManifest,
    normalizeAgentName,
    debugLog,
    PHASE_PREFIXES
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
 * @returns {{ decision: 'allow' }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Only validate Task tool calls (agent delegation)
        const toolName = input.tool_name;
        debugLog('Tool name:', toolName);

        if (toolName !== 'Task') {
            debugLog('Not a Task tool call, allowing');
            return { decision: 'allow' };
        }

        // Extract tool_input
        const toolInput = input.tool_input;
        if (!toolInput) {
            debugLog('No tool_input, allowing');
            return { decision: 'allow' };
        }

        // Extract target agent from subagent_type
        let targetAgent = toolInput.subagent_type;
        if (!targetAgent) {
            debugLog('No subagent_type specified, allowing');
            return { decision: 'allow' };
        }

        debugLog('Target agent (raw):', targetAgent);

        // Normalize agent name
        targetAgent = normalizeAgentName(targetAgent);
        debugLog('Target agent (normalized):', targetAgent);

        // Load state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json found, allowing (fail-open)');
            return { decision: 'allow' };
        }

        // Check if enforcement is enabled
        const enforcement = state.skill_enforcement || {};
        if (enforcement.enabled === false) {
            debugLog('Enforcement disabled, allowing');
            return { decision: 'allow' };
        }

        // Get enforcement mode and fail behavior
        const enforcementMode = enforcement.mode || 'strict';
        const failBehavior = enforcement.fail_behavior || 'allow';
        debugLog('Enforcement mode:', enforcementMode);

        // Get current phase — BUG-0005 (AC-03d): prefer active_workflow.current_phase
        const currentPhase = state.active_workflow?.current_phase || state.current_phase || PHASE_PREFIXES.REQUIREMENTS;
        debugLog('Current phase:', currentPhase);

        // Load manifest
        const manifest = ctx.manifest;
        if (!manifest) {
            debugLog('No manifest found, allowing (fail-open per fail_behavior:', failBehavior + ')');
            // In observe mode, fail_behavior: 'block' is irrelevant — always allow
            return { decision: 'allow' };
        }

        // Check if agent exists in manifest
        if (!manifest.ownership || !manifest.ownership[targetAgent]) {
            // Check external manifest for recognition
            const externalManifest = loadExternalManifest();
            if (externalManifest && externalManifest.skills) {
                debugLog(`Agent '${targetAgent}' not in framework manifest, but external manifest loaded with ${Object.keys(externalManifest.skills).length} skills`);
            } else {
                debugLog(`Agent '${targetAgent}' not found in manifest`);
            }
            // Unknown agent - this might be a non-SDLC agent, allow
            return { decision: 'allow' };
        }

        // Get agent's designated phase
        const agentPhase = manifest.ownership[targetAgent].phase;
        debugLog('Agent phase:', agentPhase);

        // Validate authorization
        let isAuthorized = false;

        // Orchestrator is always authorized (phase = "all")
        if (agentPhase === 'all') {
            isAuthorized = true;
            debugLog('Agent is orchestrator, always authorized');
        }
        // Setup agents are always authorized (phase = "setup")
        // These run during /discover before any workflow phase
        else if (agentPhase === 'setup') {
            isAuthorized = true;
            debugLog('Agent is setup agent, always authorized');
        }
        // Agent's phase matches current phase
        else if (agentPhase === currentPhase) {
            isAuthorized = true;
            debugLog('Agent phase matches current phase');
        } else {
            debugLog(`Agent phase (${agentPhase}) does not match current phase (${currentPhase})`);
        }

        // Handle based on authorization result and enforcement mode
        if (isAuthorized) {
            debugLog('Authorization: ALLOWED');
            return { decision: 'allow' };
        }

        // Cross-phase usage detected — observe but always allow
        debugLog('Authorization: CROSS-PHASE (observed, allowed)');

        switch (enforcementMode) {
            case 'observe':
                debugLog('OBSERVE: Agent allowed (observability mode)');
                break;
            case 'strict':
                debugLog('OBSERVE: Agent allowed (strict mode — now observability-only)');
                break;
            case 'warn':
                debugLog('OBSERVE: Agent allowed (warn mode)');
                break;
            case 'audit':
                debugLog('OBSERVE: Agent allowed (audit mode)');
                break;
            default:
                debugLog('OBSERVE: Agent allowed (observability mode)');
        }

        return { decision: 'allow' };

    } catch (error) {
        debugLog('Error in skill-validator:', error.message);
        // Fail open on errors
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin } = require('./lib/common.cjs');

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
            const ctx = { input, state, manifest, requirements: null, workflows: null };

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
