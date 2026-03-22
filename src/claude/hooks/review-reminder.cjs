#!/usr/bin/env node
/**
 * iSDLC Review Reminder - PostToolUse[Bash] Hook
 * ================================================
 * Displays a reminder when code_review is disabled but team_size > 1.
 * Triggers only on `git commit` commands.
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Version: 1.1.0
 */

const {
    debugLog
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
 * Check if a command is a git commit variant
 * @param {string} command - The bash command string
 * @returns {boolean}
 */
function isGitCommit(command) {
    return /\bgit\s+commit\b/.test(command);
}

/**
 * Extract code review config from state object.
 * @param {object} state - Parsed state.json
 * @returns {{ enabled: boolean, team_size: number }}
 */
function extractCodeReviewConfig(state) {
    if (state && state.code_review) {
        return {
            enabled: state.code_review.enabled === true,
            team_size: typeof state.code_review.team_size === 'number'
                ? state.code_review.team_size
                : 1
        };
    }
    return { enabled: false, team_size: 1 };
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stdout?: string }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Only trigger on git commit commands
        const command = (input.tool_input && input.tool_input.command) || '';
        if (!isGitCommit(command)) {
            return { decision: 'allow' };
        }

        // Extract code review configuration from state
        const config = extractCodeReviewConfig(ctx.state);

        // Only warn if disabled AND team > 1
        if (!config.enabled && config.team_size > 1) {
            const message = 'Manual code review is currently bypassed. ' +
                'If your team has grown beyond 1 developer, consider enabling it ' +
                'by setting code_review.enabled to true in .isdlc/state.json.';
            return { decision: 'allow', stdout: JSON.stringify({ warning: message }) };
        }

        return { decision: 'allow' };

    } catch (e) {
        debugLog('review-reminder error:', e.message);
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
