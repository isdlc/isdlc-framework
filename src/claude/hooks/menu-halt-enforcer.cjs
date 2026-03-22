#!/usr/bin/env node
/**
 * iSDLC Menu Halt Enforcer - PostToolUse[Task] Hook
 * ===================================================
 * Detects when an agent presents an interactive menu but continues
 * generating output instead of stopping and waiting for user input.
 *
 * Performance budget: < 100ms
 * Fail-open: always (PostToolUse is observational only)
 *
 * Traces to: FR-03, AC-03a through AC-03f
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
 * Minimum characters after a menu prompt to consider it a violation.
 * Short text after a menu (whitespace, closing tags) is not a violation.
 */
const POST_MENU_THRESHOLD = 200;

/**
 * Menu pattern definitions with their trigger regex and end-of-menu markers.
 */
const MENU_PATTERNS = [
    {
        name: 'arc-menu',
        // A/R/C menu: text containing [A] AND [R] AND [C]
        test: (text) => /\[A\]/.test(text) && /\[R\]/.test(text) && /\[C\]/.test(text),
        // The last occurrence of a selection prompt
        endMarker: /\[C\]\s*(?:Continue|Confirm|Complete)[^\n]*/gi
    },
    {
        name: 'numbered-menu',
        // Numbered menu with "Enter selection" prompt
        test: (text) => /\[\d+\]/.test(text) && /enter\s+selection/i.test(text),
        endMarker: /enter\s+selection[^\n]*/gi
    },
    {
        name: 'backlog-picker',
        // Backlog picker with [O] Other option
        test: (text) => /\[O\]\s*Other/i.test(text) && /\[\d+\]/.test(text),
        endMarker: /\[O\]\s*Other[^\n]*/gi
    }
];

/**
 * Check if output contains a menu followed by significant additional text.
 * @param {string} text - Task output text
 * @returns {{ violation: boolean, menuType: string, extraChars: number }}
 */
function detectMenuHaltViolation(text) {
    if (!text || typeof text !== 'string') {
        return { violation: false, menuType: '', extraChars: 0 };
    }

    for (const pattern of MENU_PATTERNS) {
        if (!pattern.test(text)) continue;

        // Find the last occurrence of the end marker
        let lastIndex = -1;
        let match;
        const regex = new RegExp(pattern.endMarker.source, pattern.endMarker.flags);
        while ((match = regex.exec(text)) !== null) {
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex === -1) {
            // Menu detected but no end marker found -- check from last menu element
            // Use last [C] or last "Enter selection" or last [O] Other
            const fallbacks = [/\[C\][^\n]*/g, /enter\s+selection[^\n]*/gi, /\[O\]\s*Other[^\n]*/gi];
            for (const fb of fallbacks) {
                let m;
                while ((m = fb.exec(text)) !== null) {
                    const idx = m.index + m[0].length;
                    if (idx > lastIndex) lastIndex = idx;
                }
            }
        }

        if (lastIndex > 0) {
            const after = text.substring(lastIndex).trim();
            if (after.length > POST_MENU_THRESHOLD) {
                return {
                    violation: true,
                    menuType: pattern.name,
                    extraChars: after.length
                };
            }
        }
    }

    return { violation: false, menuType: '', extraChars: 0 };
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

        // Extract task output
        const output = (input.tool_result && input.tool_result.text) ||
                       (input.tool_result && typeof input.tool_result === 'string' ? input.tool_result : '') ||
                       '';

        if (!output) {
            return { decision: 'allow' };
        }

        const result = detectMenuHaltViolation(output);
        if (!result.violation) {
            return { decision: 'allow' };
        }

        logHookEvent('menu-halt-enforcer', 'warn', {
            reason: `Menu type '${result.menuType}' followed by ${result.extraChars} chars of output`
        });

        const stderr =
            `MENU HALT VIOLATION: Agent continued generating ${result.extraChars} characters ` +
            `of output after presenting an interactive menu (${result.menuType}). ` +
            `The agent should STOP and wait for user input after displaying menu options.`;

        return { decision: 'allow', stderr };

    } catch (error) {
        debugLog('Error in menu-halt-enforcer:', error.message);
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
