#!/usr/bin/env node
/**
 * iSDLC Phase Transition Enforcer - PostToolUse[Task] Hook
 * =========================================================
 * Detects "Would you like to proceed?" patterns in agent output
 * and warns that automatic transitions should be used instead.
 *
 * Performance budget: < 100ms
 * Fail-open: always (PostToolUse is observational only)
 *
 * Traces to: FR-01, AC-01a through AC-01h
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0091: Bridge-first delegation to core workflow
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
 * Permission-asking patterns that indicate an agent is not auto-advancing.
 * Case-insensitive matching.
 */
const PERMISSION_PATTERNS = [
    /would you like to proceed/i,
    /ready to advance/i,
    /should I continue/i,
    /shall we proceed/i,
    /do you want me to move forward/i,
    /want me to go ahead/i
];

/**
 * Check if text contains any permission-asking patterns.
 * @param {string} text - Text to scan
 * @returns {{ found: boolean, pattern: string }} Result
 */
function detectPermissionAsking(text) {
    if (!text || typeof text !== 'string') {
        return { found: false, pattern: '' };
    }
    for (const regex of PERMISSION_PATTERNS) {
        const match = text.match(regex);
        if (match) {
            return { found: true, pattern: match[0] };
        }
    }
    return { found: false, pattern: '' };
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stderr?: string }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Extract task output/result text
        const output = (input.tool_result && input.tool_result.text) ||
                       (input.tool_result && typeof input.tool_result === 'string' ? input.tool_result : '') ||
                       '';

        if (!output || typeof output !== 'string') {
            return { decision: 'allow' };
        }

        // Check for permission-asking patterns
        const result = detectPermissionAsking(output);
        if (!result.found) {
            return { decision: 'allow' };
        }

        // Only warn if there is an active workflow
        const state = ctx.state;
        if (!state || !state.active_workflow) {
            debugLog('Permission pattern found but no active workflow, skipping');
            return { decision: 'allow' };
        }

        const phase = (state.active_workflow && state.active_workflow.current_phase) || 'unknown';

        // Log and warn
        logHookEvent('phase-transition-enforcer', 'warn', {
            phase,
            reason: `Permission-asking pattern detected: '${result.pattern}'`
        });

        const stderr =
            `TRANSITION WARNING: Agent asked for permission to proceed. ` +
            `Phase transitions should be automatic when gates pass. ` +
            `Pattern detected: '${result.pattern}'`;

        return { decision: 'allow', stderr };

    } catch (error) {
        debugLog('Error in phase-transition-enforcer:', error.message);
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
