#!/usr/bin/env node
/**
 * iSDLC Walkthrough Tracker - PostToolUse[Task] Hook
 * ====================================================
 * Warns when a /discover workflow completes without the constitution
 * walkthrough being recorded as completed.
 *
 * OBSERVATIONAL ONLY: outputs warnings to stderr, never blocks.
 *
 * Performance budget: < 50ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-06, AC-06, AC-06a, AC-06b, AC-06c
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent,
    normalizeAgentName
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
 * @returns {{ decision: 'allow', stderr?: string }}
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

        // Check if this is a discover orchestrator task
        const toolInput = input.tool_input || {};
        const subagentType = toolInput.subagent_type || '';
        const normalized = normalizeAgentName(subagentType);

        if (normalized !== 'discover-orchestrator') {
            return { decision: 'allow' };
        }

        // Check if the task completed (has a result)
        const toolResult = input.tool_result;
        if (!toolResult) {
            debugLog('No tool_result, task may not be complete yet');
            return { decision: 'allow' };
        }

        debugLog('Discover orchestrator task completion detected');

        // Read state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            return { decision: 'allow' };
        }

        // Check discovery_context
        const discoveryContext = state.discovery_context;
        if (!discoveryContext) {
            debugLog('No discovery_context in state, skipping');
            return { decision: 'allow' };
        }

        if (discoveryContext.walkthrough_completed === true) {
            debugLog('Walkthrough completed, silent');
            return { decision: 'allow' };
        }

        // Warn: walkthrough not completed
        logHookEvent('walkthrough-tracker', 'warn', {
            reason: 'Discovery completed without constitution walkthrough'
        });

        const stderrMsg =
            `[walkthrough-tracker] WARNING: Discovery completed without constitution walkthrough.\n` +
            `  The /discover command completed, but the constitution walkthrough step was not\n` +
            `  recorded as completed (discovery_context.walkthrough_completed is not true).\n` +
            `  The walkthrough ensures the user reviews and approves the project constitution\n` +
            `  before starting SDLC work. Consider running the walkthrough manually.`;

        return { decision: 'allow', stderr: stderrMsg };

    } catch (error) {
        debugLog('Error in walkthrough-tracker:', error.message);
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
