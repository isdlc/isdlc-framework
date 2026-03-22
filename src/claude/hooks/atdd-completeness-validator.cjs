#!/usr/bin/env node
/**
 * iSDLC ATDD Completeness Validator - PostToolUse[Bash] Hook
 * ============================================================
 * When ATDD mode is active, monitors test execution output for
 * priority ordering violations and orphaned skipped tests.
 *
 * Performance budget: < 100ms
 * Fail-open: always (PostToolUse is observational only)
 *
 * Traces to: FR-05, AC-05a through AC-05f
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent
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
 * Patterns that indicate a test execution command.
 */
const TEST_COMMAND_PATTERNS = [
    /\bnode\s+--test\b/,
    /\bnpm\s+test\b/,
    /\bnpx\s+jest\b/,
    /\bnpx\s+vitest\b/,
    /\bnpx\s+mocha\b/,
    /\bpytest\b/,
    /\bcargo\s+test\b/,
    /\bgo\s+test\b/
];

/**
 * Check if a bash command is a test execution.
 * @param {string} command - The bash command
 * @returns {boolean}
 */
function isTestCommand(command) {
    if (!command) return false;
    return TEST_COMMAND_PATTERNS.some(p => p.test(command));
}

/**
 * Extract priority-tagged test results from output.
 * Looks for patterns like "P0:", "P1:", "# P0", "[P0]" in test output.
 * @param {string} output - Test output text
 * @returns {{ p0Pass: number, p0Fail: number, p0Skip: number, p1Pass: number, p1Fail: number, p1Skip: number, p2Pass: number, p2Fail: number, p2Skip: number, p3Pass: number, p3Fail: number, p3Skip: number }}
 */
function extractPriorityResults(output) {
    const results = {
        p0Pass: 0, p0Fail: 0, p0Skip: 0,
        p1Pass: 0, p1Fail: 0, p1Skip: 0,
        p2Pass: 0, p2Fail: 0, p2Skip: 0,
        p3Pass: 0, p3Fail: 0, p3Skip: 0
    };

    if (!output) return results;

    // Count tests by priority from output lines
    const lines = output.split('\n');
    for (const line of lines) {
        for (const level of ['P0', 'P1', 'P2', 'P3']) {
            const key = level.toLowerCase();
            if (line.includes(level) || line.includes(level.toLowerCase())) {
                if (/\bpass/i.test(line) || /\u2713/.test(line) || /ok\b/i.test(line)) {
                    results[key + 'Pass']++;
                } else if (/\bfail/i.test(line) || /\u2717/.test(line) || /not ok\b/i.test(line)) {
                    results[key + 'Fail']++;
                } else if (/\bskip/i.test(line) || /\btodo\b/i.test(line) || /test\.skip/i.test(line)) {
                    results[key + 'Skip']++;
                }
            }
        }
    }

    return results;
}

/**
 * Check for ATDD priority ordering violations.
 * @param {object} results - Priority results from extractPriorityResults
 * @returns {string[]} List of violation descriptions
 */
function checkPriorityViolations(results) {
    const violations = [];

    // P1 tests running before all P0 pass
    const p0Total = results.p0Pass + results.p0Fail + results.p0Skip;
    const p1Total = results.p1Pass + results.p1Fail + results.p1Skip;
    if (p1Total > 0 && results.p0Fail > 0) {
        violations.push(
            `P1 tests running while ${results.p0Fail} P0 test(s) are still failing. ` +
            `Fix P0 tests before implementing P1.`
        );
    }

    // Orphaned P0 skips (P0 tests that should have been implemented)
    if (results.p0Skip > 0 && p0Total > 0) {
        violations.push(
            `${results.p0Skip} P0 test(s) still skipped. ` +
            `P0 (critical) tests should not remain as test.skip().`
        );
    }

    // P2 tests running before all P1 pass
    const p2Total = results.p2Pass + results.p2Fail + results.p2Skip;
    if (p2Total > 0 && results.p1Fail > 0) {
        violations.push(
            `P2 tests running while ${results.p1Fail} P1 test(s) are still failing.`
        );
    }

    return violations;
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

        // Check if this was a test command
        const command = (input.tool_input && input.tool_input.command) || '';
        if (!isTestCommand(command)) {
            return { decision: 'allow' };
        }

        // Check if ATDD mode is active
        const state = ctx.state;
        if (!state || !state.active_workflow) {
            return { decision: 'allow' };
        }

        // ATDD mode check: look in active_workflow options or agent_modifiers
        const atddActive = (state.active_workflow.options && state.active_workflow.options.atdd_mode) ||
                           (state.active_workflow.atdd_mode);
        if (!atddActive) {
            debugLog('ATDD mode not active, skipping');
            return { decision: 'allow' };
        }

        debugLog('ATDD mode active, checking priority ordering');

        // Extract test output
        const output = (input.tool_result && input.tool_result.text) ||
                       (input.tool_result && typeof input.tool_result === 'string' ? input.tool_result : '') ||
                       '';

        const results = extractPriorityResults(output);
        const violations = checkPriorityViolations(results);

        if (violations.length === 0) {
            debugLog('No ATDD priority violations found');
            logHookEvent('atdd-completeness-validator', 'allow', {
                phase: state.active_workflow.current_phase,
                reason: 'Priority ordering correct'
            });
            return { decision: 'allow' };
        }

        logHookEvent('atdd-completeness-validator', 'warn', {
            phase: state.active_workflow.current_phase,
            reason: violations.join('; ')
        });

        const stderr =
            `ATDD PRIORITY VIOLATIONS (${violations.length}):\n` +
            violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n') +
            `\n\nATDD requires strict priority ordering: P0 -> P1 -> P2 -> P3.` +
            `\nAll tests at priority N must pass before implementing priority N+1.`;

        return { decision: 'allow', stderr };

    } catch (error) {
        debugLog('Error in atdd-completeness-validator:', error.message);
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
