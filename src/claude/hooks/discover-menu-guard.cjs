#!/usr/bin/env node
/**
 * iSDLC Discover Menu Guard - PostToolUse[Task] Hook
 * ====================================================
 * Warns when the /discover command presents an incorrect menu.
 * The expected menu has exactly 3 options: New Project, Existing Project,
 * Chat/Explore.
 *
 * OBSERVATIONAL ONLY: outputs warnings to stderr, never blocks.
 *
 * Performance budget: < 50ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-07, AC-07, AC-07a, AC-07b, AC-07c
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent,
    normalizeAgentName
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

const REQUIRED_OPTIONS = [
    /new\s+project/i,
    /existing\s+project/i,
    /chat|explore/i
];

const FORBIDDEN_OPTIONS = [
    /scoped\s+analysis/i,
    /auto[- ]?detect/i
];

const MIN_MENU_TEXT_LENGTH = 50;

/**
 * Check if a Task call is related to discover.
 * @param {object} input - Parsed stdin JSON
 * @returns {boolean}
 */
function isDiscoverTask(input) {
    const toolInput = input.tool_input || {};
    const subagentType = toolInput.subagent_type || '';
    const normalized = normalizeAgentName(subagentType);

    if (normalized === 'discover-orchestrator') {
        return true;
    }

    // Fallback: check prompt/description for discover keyword
    const prompt = (toolInput.prompt || '').toLowerCase();
    const description = (toolInput.description || '').toLowerCase();
    return prompt.includes('discover') || description.includes('discover');
}

/**
 * Extract text content from tool_result.
 * @param {*} toolResult - The tool result (string or object)
 * @returns {string}
 */
function extractText(toolResult) {
    if (typeof toolResult === 'string') return toolResult;
    if (toolResult && typeof toolResult === 'object') {
        return JSON.stringify(toolResult);
    }
    return '';
}

/**
 * Dispatcher-compatible check function.
 * Does NOT need ctx.state — purely inspects input.
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

        if (!isDiscoverTask(input)) {
            return { decision: 'allow' };
        }

        // Extract text from tool_result
        const text = extractText(input.tool_result);
        if (text.length < MIN_MENU_TEXT_LENGTH) {
            debugLog('Text too short to be a menu:', text.length, 'chars');
            return { decision: 'allow' };
        }

        // Check if this looks like a menu (has numbered options)
        if (!/\[\d+\]|\d+\.\s|option\s+\d/i.test(text)) {
            debugLog('No numbered options detected, not a menu');
            return { decision: 'allow' };
        }

        debugLog('Discover menu text detected, validating');

        // Check required options
        const missingOptions = [];
        for (const pattern of REQUIRED_OPTIONS) {
            if (!pattern.test(text)) {
                missingOptions.push(pattern.source);
            }
        }

        // Check forbidden options
        const forbiddenFound = [];
        for (const pattern of FORBIDDEN_OPTIONS) {
            if (pattern.test(text)) {
                forbiddenFound.push(pattern.source);
            }
        }

        // If all required present and no forbidden, menu is correct
        if (missingOptions.length === 0 && forbiddenFound.length === 0) {
            debugLog('Correct 3-option menu detected');
            return { decision: 'allow' };
        }

        // Build stderr warnings
        const stderrParts = [];

        if (missingOptions.length > 0) {
            logHookEvent('discover-menu-guard', 'warn', {
                reason: `Missing menu options: ${missingOptions.join(', ')}`
            });
            stderrParts.push(
                `[discover-menu-guard] WARNING: Incorrect discover menu detected.\n` +
                `  Expected 3 options: [1] New Project, [2] Existing Project, [3] Chat/Explore\n` +
                `  Missing options: ${missingOptions.join(', ')}\n` +
                `  The /discover command should present exactly 3 options. See REQ-0001.`
            );
        }

        if (forbiddenFound.length > 0) {
            logHookEvent('discover-menu-guard', 'warn', {
                reason: `Forbidden menu options found: ${forbiddenFound.join(', ')}`
            });
            stderrParts.push(
                `[discover-menu-guard] WARNING: Incorrect discover menu detected.\n` +
                `  Found removed options: ${forbiddenFound.join(', ')}\n` +
                `  These options were removed in REQ-0001 and should not appear.\n` +
                `  Expected 3 options: [1] New Project, [2] Existing Project, [3] Chat/Explore`
            );
        }

        return { decision: 'allow', stderr: stderrParts.join('\n') };

    } catch (error) {
        debugLog('Error in discover-menu-guard:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check, isDiscoverTask, extractText };

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
