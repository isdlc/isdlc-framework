#!/usr/bin/env node
/**
 * iSDLC Test Watcher - PostToolUse Hook
 * ======================================
 * Monitors Bash tool executions for test commands and tracks iteration state.
 *
 * When a test command is detected:
 * 1. Parses the result for pass/fail
 * 2. Updates iteration counter in state.json
 * 3. Checks for circuit breaker (identical failures)
 * 4. Outputs iteration guidance to the agent
 *
 * Version: 1.2.0
 */

const {
    debugLog,
    getTimestamp,
    loadIterationRequirements: loadIterationRequirementsFromCommon,
    resolveCoverageThreshold
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

/**
 * ATDD skip patterns - used to detect orphan skipped tests
 */
const SKIP_PATTERNS = [
    /it\.skip\s*\(/,
    /test\.skip\s*\(/,
    /describe\.skip\s*\(/,
    /@pytest\.mark\.skip/,
    /@Disabled/,
    /@Ignore/,
    /t\.Skip\s*\(/,
    /\bxit\s*\(/,
    /\bxdescribe\s*\(/,
    /\bxcontext\s*\(/,
    /\.only\s*\(/  // Also flag .only() as potential issue
];

/**
 * Test command patterns
 */
const TEST_COMMAND_PATTERNS = [
    /npm\s+test/i,
    /npm\s+run\s+test/i,
    /yarn\s+test/i,
    /pnpm\s+test/i,
    /pytest/i,
    /python\s+-m\s+pytest/i,
    /go\s+test/i,
    /cargo\s+test/i,
    /mvn\s+test/i,
    /gradle\s+test/i,
    /dotnet\s+test/i,
    /jest/i,
    /mocha/i,
    /vitest/i,
    /phpunit/i,
    /rspec/i,
    /bundle\s+exec\s+rspec/i,
    /npm\s+run\s+test:unit/i,
    /npm\s+run\s+test:integration/i,
    /npm\s+run\s+test:e2e/i,
    /npm\s+run\s+e2e/i,
    /cypress\s+run/i,
    /playwright\s+test/i
];

/**
 * Failure patterns in test output
 */
const FAILURE_PATTERNS = [
    /(\d+)\s+fail(ed|ing|ure)?/i,
    /FAIL\b/,
    /FAILED\b/,
    /Error:/i,
    /AssertionError/i,
    /TypeError:/i,
    /ReferenceError:/i,
    /SyntaxError:/i,
    /Tests:\s+\d+\s+failed/i,
    /FAILURES!/,
    /pytest.*(\d+)\s+failed/i,
    /FAIL\s+\[/,
    /--- FAIL:/,
    /✖|✗/,
    /npm ERR!/i,
    /error Command failed/i,
    /exited with code [1-9]/i
];

/**
 * Coverage patterns - regex to extract coverage percentage from common test runners
 */
const COVERAGE_PATTERNS = [
    // Jest/Vitest: "Statements   : 85.71%"
    { name: 'jest-statements', pattern: /Statements\s*:\s*(\d+\.?\d*)%/ },
    // Jest/Vitest: "Lines        : 90.00%"
    { name: 'jest-lines', pattern: /Lines\s*:\s*(\d+\.?\d*)%/ },
    // pytest-cov: "TOTAL    100    15    85%"
    { name: 'pytest-cov', pattern: /TOTAL\s+\d+\s+\d+\s+(\d+)%/ },
    // Go: "coverage: 82.5% of statements"
    { name: 'go-coverage', pattern: /coverage:\s*(\d+\.?\d*)%/ },
    // Generic: "85.5% coverage" or "85.5% covered"
    { name: 'generic', pattern: /(\d+\.?\d*)%\s*(?:coverage|covered)/ }
];

/**
 * Parse coverage percentage from test output.
 * Returns first match from COVERAGE_PATTERNS.
 * @param {string} output - Test command output
 * @returns {{ found: boolean, percentage: number|null }}
 */
function parseCoverage(output) {
    if (!output || typeof output !== 'string') {
        return { found: false, percentage: null };
    }

    for (const { pattern } of COVERAGE_PATTERNS) {
        const match = output.match(pattern);
        if (match) {
            return { found: true, percentage: parseFloat(match[1]) };
        }
    }

    return { found: false, percentage: null };
}

/**
 * Success patterns in test output
 */
const SUCCESS_PATTERNS = [
    /All tests passed/i,
    /Tests:\s+\d+\s+passed,\s+\d+\s+total/,
    /(\d+)\s+passing/i,
    /OK \(\d+ tests?\)/i,
    /\bPASSED\b/,
    /0 failures/i,
    /pytest.*(\d+)\s+passed.*0 failed/i,
    /ok\s+\d+\s+tests/i,
    /BUILD SUCCESS/i,
    /✓|✔/,
    /Test Suites:.*passed.*0 failed/i,
    /Tests:.*passed.*0 failed/i
];

/**
 * Detect if command is a test command
 */
function isTestCommand(command) {
    if (!command) return false;
    return TEST_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Parse test result from output
 */
function parseTestResult(output, exitCode) {
    if (!output) {
        return { passed: exitCode === 0, error: exitCode === 0 ? null : 'No output, non-zero exit' };
    }

    // Check for explicit success patterns first
    for (const pattern of SUCCESS_PATTERNS) {
        if (pattern.test(output)) {
            // But also verify no failure patterns
            let hasFailure = false;
            for (const failPattern of FAILURE_PATTERNS) {
                if (failPattern.test(output)) {
                    // Check if failure count is 0
                    const failMatch = output.match(/(\d+)\s+fail/i);
                    if (failMatch && parseInt(failMatch[1]) > 0) {
                        hasFailure = true;
                        break;
                    }
                }
            }
            if (!hasFailure) {
                return { passed: true };
            }
        }
    }

    // Check for failures
    for (const pattern of FAILURE_PATTERNS) {
        if (pattern.test(output)) {
            const match = output.match(/(\d+)\s+fail/i);
            return {
                passed: false,
                failures: match ? parseInt(match[1]) : 1,
                error: extractErrorMessage(output)
            };
        }
    }

    // If no patterns matched, use exit code
    if (exitCode !== undefined && exitCode !== null) {
        return {
            passed: exitCode === 0,
            error: exitCode === 0 ? null : `Exit code: ${exitCode}`
        };
    }

    // BUG-0007: Return inconclusive when no patterns matched and no exit code available.
    // Previously this defaulted to { passed: false }, causing false circuit breaker trips.
    return { passed: null, inconclusive: true, error: 'Unable to determine test result' };
}

/**
 * Extract error message from output
 */
function extractErrorMessage(output) {
    const lines = output.split('\n');

    // Try to find first meaningful error line
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 10 && trimmed.length < 300) {
            if (/error:|fail|assert|exception|TypeError|ReferenceError/i.test(trimmed)) {
                return trimmed;
            }
        }
    }

    // Try to find any line with FAIL
    for (const line of lines) {
        const trimmed = line.trim();
        if (/FAIL|✖|✗/.test(trimmed) && trimmed.length < 200) {
            return trimmed;
        }
    }

    return 'Test failure (check output for details)';
}

/**
 * Extract user-configured iteration config from state.json.
 * Returns null if not present or not configured (no configured_at timestamp).
 * @param {object} state - Parsed state.json
 * @returns {object|null} iteration_config or null
 */
function getIterationConfig(state) {
    const config = state && state.iteration_config;
    if (!config || !config.configured_at) return null;
    return config;
}

/**
 * Load iteration requirements (local fallback)
 */
function loadIterationRequirements() {
    const { getProjectRoot } = require('./lib/common.cjs');
    const projectRoot = getProjectRoot();
    const configPaths = [
        path.join(projectRoot, '.claude', 'hooks', 'config', 'iteration-requirements.json'),
        path.join(projectRoot, '.isdlc', 'config', 'iteration-requirements.json')
    ];

    for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
            try {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

/**
 * Normalize an error string for comparison by stripping volatile parts.
 * This enables the circuit breaker to catch semantically identical errors
 * that differ only in line numbers, timestamps, or memory addresses.
 * @param {string} error - The error string to normalize
 * @returns {string} Normalized error string
 */
function normalizeErrorForComparison(error) {
    if (!error || typeof error !== 'string') return '';
    return error
        // 1. Strip ISO 8601 timestamps (most specific — contains T delimiter + colons)
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, 'TIMESTAMP')
        // 2. Strip common date formats (e.g., 2026-02-11 10:30:00)
        .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
        // 3. Strip stack trace file paths with parentheses (e.g., at Object.<anonymous> (/path/to/file.js:42:13))
        .replace(/at\s+.*?\(.*?\)/g, 'at STACK')
        // 4. Strip stack trace file paths without parentheses (e.g., at /path/to/file.js:42:13)
        .replace(/at\s+\/.*?:\d+:\d+/g, 'at STACK')
        // 5. Strip line:column references — general fallback, must run LAST among colon patterns
        .replace(/:\d+:\d+/g, ':X:X')
        // 6. Strip memory addresses (e.g., 0x7fff5fbff8c0)
        .replace(/0x[0-9a-fA-F]+/g, '0xADDR')
        // 7. Collapse whitespace + trim
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Check for identical failure (circuit breaker)
 */
function isIdenticalFailure(currentError, history) {
    if (!history || history.length === 0) return false;

    // Get last 2 errors
    const recentErrors = history.slice(-2).map(h => h.error).filter(e => e);

    if (recentErrors.length < 2) return false;

    // Check if all recent errors match current (using normalized comparison)
    const normalizedCurrent = normalizeErrorForComparison(currentError);
    return recentErrors.every(e => normalizeErrorForComparison(e) === normalizedCurrent);
}

/**
 * Detect skipped tests in output (for ATDD mode)
 */
function detectSkippedTests(output) {
    if (!output) return { count: 0, details: [] };

    const skippedDetails = [];
    let totalSkipped = 0;

    // Jest/Vitest skipped count
    const jestSkipMatch = output.match(/Tests:.*?(\d+)\s+skipped/i);
    if (jestSkipMatch) {
        totalSkipped = parseInt(jestSkipMatch[1]);
    }

    // pytest skipped count
    const pytestSkipMatch = output.match(/(\d+)\s+skipped/i);
    if (pytestSkipMatch && !jestSkipMatch) {
        totalSkipped = parseInt(pytestSkipMatch[1]);
    }

    // Mocha pending
    const mochaPendingMatch = output.match(/(\d+)\s+pending/i);
    if (mochaPendingMatch) {
        totalSkipped = Math.max(totalSkipped, parseInt(mochaPendingMatch[1]));
    }

    // Try to extract individual skipped test names
    const lines = output.split('\n');
    for (const line of lines) {
        // Jest/Vitest: "○ skipped test name"
        if (/^\s*○\s+/.test(line) || /\bskipped\b/i.test(line)) {
            const testNameMatch = line.match(/○\s+(.+)/) || line.match(/skipped\s+(.+)/i);
            if (testNameMatch) {
                skippedDetails.push(testNameMatch[1].trim());
            }
        }
        // pytest: "SKIPPED [1] test_file.py::test_name"
        if (/SKIPPED\s+\[/.test(line)) {
            const testNameMatch = line.match(/SKIPPED\s+\[\d+\]\s+(.+)/);
            if (testNameMatch) {
                skippedDetails.push(testNameMatch[1].trim());
            }
        }
    }

    return {
        count: totalSkipped,
        details: skippedDetails
    };
}

/**
 * Check if ATDD mode is active
 */
function isATDDMode(state) {
    return state?.active_workflow?.atdd_mode === true;
}

/**
 * Extract exit code from tool result if available
 */
function extractExitCode(toolResult) {
    if (typeof toolResult === 'object' && toolResult !== null) {
        if ('exitCode' in toolResult) return toolResult.exitCode;
        if ('exit_code' in toolResult) return toolResult.exit_code;
        if ('code' in toolResult) return toolResult.code;
    }

    // Try to extract from string output
    if (typeof toolResult === 'string') {
        const match = toolResult.match(/exit(?:ed)?\s+(?:with\s+)?(?:code\s+)?(\d+)/i);
        if (match) return parseInt(match[1]);
    }

    return undefined;
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stdout?: string, stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Only process Bash tool results
        if (input.tool_name !== 'Bash') {
            return { decision: 'allow' };
        }

        const command = input.tool_input?.command;
        const result = typeof input.tool_result === 'string'
            ? input.tool_result
            : JSON.stringify(input.tool_result || '');
        const exitCode = extractExitCode(input.tool_result);

        // Check if this is a test command
        if (!isTestCommand(command)) {
            return { decision: 'allow' };
        }

        debugLog('Test command detected:', command);

        // Load state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, skipping');
            return { decision: 'allow' };
        }

        // Check if iteration enforcement is enabled
        if (state.iteration_enforcement?.enabled === false) {
            return { decision: 'allow' };
        }

        // Only track test iterations during an active SDLC workflow.
        const activeWorkflow = state.active_workflow;
        if (!activeWorkflow) {
            debugLog('No active workflow, skipping test iteration tracking');
            return { decision: 'allow' };
        }
        const currentPhase = (activeWorkflow && activeWorkflow.current_phase) || state.current_phase;
        if (!currentPhase) {
            return { decision: 'allow' };
        }

        // Load requirements (prefer ctx.requirements, fallback to local loader) and apply workflow overrides
        const requirements = ctx.requirements || loadIterationRequirementsFromCommon() || loadIterationRequirements();
        let phaseReq = requirements?.phase_requirements?.[currentPhase];
        if (activeWorkflow && phaseReq && requirements.workflow_overrides) {
            const overrides = requirements.workflow_overrides[activeWorkflow.type]?.[currentPhase];
            if (overrides) {
                phaseReq = { ...phaseReq };
                if (overrides.test_iteration) {
                    phaseReq.test_iteration = { ...phaseReq.test_iteration, ...overrides.test_iteration };
                }
            }
        }
        if (!phaseReq?.test_iteration?.enabled) {
            debugLog('Test iteration not enabled for phase:', currentPhase);
            return { decision: 'allow' };
        }

        // Parse test result
        const testResult = parseTestResult(result, exitCode);
        debugLog('Test result:', testResult);

        // Initialize phase state if needed
        if (!state.phases) state.phases = {};
        if (!state.phases[currentPhase]) state.phases[currentPhase] = { status: 'in_progress' };
        if (!state.phases[currentPhase].iteration_requirements) {
            state.phases[currentPhase].iteration_requirements = {};
        }

        // Get or initialize test iteration state
        // Priority chain: state.json iteration_config > iteration-requirements.json > hardcoded default
        const iterConfig = getIterationConfig(state);
        let iterState = state.phases[currentPhase].iteration_requirements.test_iteration;
        if (!iterState) {
            const maxIter = (iterConfig && iterConfig.testing_max) ||
                            (phaseReq && phaseReq.test_iteration && phaseReq.test_iteration.max_iterations) ||
                            10;
            iterState = {
                required: true,
                completed: false,
                current_iteration: 0,
                max_iterations: maxIter,
                failures_count: 0,
                identical_failure_count: 0,
                history: [],
                started_at: getTimestamp()
            };
        }

        // BUG-0007: Determine result classification (PASSED / FAILED / INCONCLUSIVE)
        const resultClassification = testResult.inconclusive ? 'INCONCLUSIVE'
            : testResult.passed ? 'PASSED' : 'FAILED';

        // Create history entry
        const historyEntry = {
            iteration: iterState.current_iteration + 1,
            timestamp: getTimestamp(),
            command: command,
            result: resultClassification,
            failures: testResult.failures || 0,
            error: testResult.error || null
        };

        // Update iteration state
        iterState.current_iteration += 1;
        iterState.last_test_result = resultClassification.toLowerCase();
        iterState.last_test_command = command;
        iterState.last_test_at = getTimestamp();
        iterState.history.push(historyEntry);

        let outputMessage = '';

        if (testResult.inconclusive) {
            // BUG-0007: INCONCLUSIVE — do NOT increment failure counts or trigger circuit breaker.
            // The test output could not be parsed. This is a warning, not an error.
            debugLog('Test result INCONCLUSIVE - skipping circuit breaker');

            if (iterState.current_iteration >= iterState.max_iterations) {
                // Max iterations exceeded even with inconclusive results
                iterState.completed = true;
                iterState.status = 'escalated';
                iterState.escalation_reason = 'max_iterations';
                iterState.escalation_details = `Exceeded ${iterState.max_iterations} iterations without success`;

                outputMessage = `\n\n\u26a0\ufe0f MAX ITERATIONS EXCEEDED (${iterState.max_iterations})\n` +
                    `Last result was INCONCLUSIVE (test output could not be parsed).\n` +
                    `Reason: ${testResult.error}\n\n` +
                    `ACTION REQUIRED: Verify the test command is correct and produces parseable output.`;
            } else {
                const remaining = iterState.max_iterations - iterState.current_iteration;

                outputMessage = `\n\n\u26a0\ufe0f TEST RESULT INCONCLUSIVE (iteration ${iterState.current_iteration}/${iterState.max_iterations})\n` +
                    `The test output could not be parsed as pass or fail.\n` +
                    `Reason: ${testResult.error}\n` +
                    `Remaining iterations: ${remaining}\n\n` +
                    `Please verify the test command produces recognizable output.\n` +
                    `This result does NOT count as a failure and will NOT trigger the circuit breaker.`;
            }

        } else if (testResult.passed) {
            // SUCCESS — but check coverage before marking complete
            iterState.identical_failure_count = 0;

            debugLog('Tests PASSED - checking coverage');

            // Coverage enforcement (fail-open: only activates when coverage data is present)
            // BUG-0054-GH-52: Resolve intensity-aware coverage threshold
            const rawCoverage = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
            const coverageThreshold = resolveCoverageThreshold(rawCoverage, state);
            const coverage = parseCoverage(result);
            iterState.coverage = {
                found: coverage.found,
                percentage: coverage.percentage,
                threshold: coverageThreshold || null,
                met: !coverage.found || !coverageThreshold || coverage.percentage >= coverageThreshold
            };

            let coverageWarning = '';
            if (coverage.found && coverageThreshold && coverage.percentage < coverageThreshold) {
                // Coverage below threshold — don't mark completed, keep iterating
                debugLog(`Coverage ${coverage.percentage}% below threshold ${coverageThreshold}%`);

                const remaining = iterState.max_iterations - iterState.current_iteration;
                if (remaining <= 0) {
                    // Max iterations exhausted with coverage below threshold — escalate
                    iterState.completed = true;
                    iterState.status = 'escalated';
                    iterState.escalation_reason = 'coverage_below_threshold';
                    iterState.escalation_details = `Coverage ${coverage.percentage}% below ${coverageThreshold}% after ${iterState.max_iterations} iterations`;

                    outputMessage = `\n\n🚨 COVERAGE BELOW THRESHOLD (${coverage.percentage}% < ${coverageThreshold}%)\n` +
                        `Max iterations (${iterState.max_iterations}) exhausted.\n\n` +
                        `ACTION REQUIRED: Escalate to human review.\n` +
                        `Add tests to improve coverage above ${coverageThreshold}%.`;
                } else {
                    coverageWarning = `\n\n⚠️ COVERAGE WARNING: ${coverage.percentage}% is below the required ${coverageThreshold}%.\n` +
                        `Remaining iterations: ${remaining}\n` +
                        `Add more tests to reach ${coverageThreshold}% coverage, then re-run tests.`;

                    outputMessage = `\n\n⚠️ TESTS PASSED but COVERAGE INSUFFICIENT (iteration ${iterState.current_iteration}/${iterState.max_iterations})\n` +
                        `Coverage: ${coverage.percentage}% (required: ${coverageThreshold}%)` +
                        coverageWarning;
                }
            } else {
                // Coverage met or not applicable — mark complete
                iterState.completed = true;
                iterState.status = 'success';
                iterState.completed_at = getTimestamp();

                debugLog('Tests PASSED - iteration complete');

                let coverageNote = '';
                if (coverage.found) {
                    coverageNote = `\nCoverage: ${coverage.percentage}%` + (coverageThreshold ? ` (threshold: ${coverageThreshold}%)` : '');
                } else if (coverageThreshold) {
                    coverageNote = `\nNote: No coverage data detected in output. Run tests with coverage flag (e.g., --coverage) to enable coverage enforcement.`;
                }

                // Check for ATDD mode and skipped tests
                const atddMode = isATDDMode(state);
                const skippedInfo = detectSkippedTests(result);

                let atddWarning = '';
                if (atddMode && skippedInfo.count > 0) {
                    // In ATDD mode, skipped tests are NOT allowed at gate
                    atddWarning = `\n\n⚠️ ATDD MODE WARNING: ${skippedInfo.count} skipped test(s) detected!\n` +
                        `In ATDD mode, ALL acceptance tests must be implemented (no test.skip() allowed).\n` +
                        `Skipped tests:\n${skippedInfo.details.slice(0, 5).map(t => `  - ${t}`).join('\n')}\n` +
                        (skippedInfo.details.length > 5 ? `  ... and ${skippedInfo.details.length - 5} more\n` : '') +
                        `\nYou must unskip and implement these tests before advancing the gate.`;

                    // Update state with ATDD skip info
                    if (!state.phases[currentPhase].atdd_validation) {
                        state.phases[currentPhase].atdd_validation = {};
                    }
                    state.phases[currentPhase].atdd_validation.orphan_skips_detected = skippedInfo.count;
                    state.phases[currentPhase].atdd_validation.orphan_skip_details = skippedInfo.details;
                }

                // Build constitutional article list from phase requirements
                const constArticles = phaseReq.constitutional_validation?.articles;
                const constArticleNote = constArticles
                    ? `Read docs/isdlc/constitution.md and validate artifacts against these articles: ${constArticles.join(', ')}\n` +
                      `Update state.json → phases.${currentPhase}.constitutional_validation when complete.`
                    : `Check iteration-requirements.json for applicable constitutional articles.`;

                outputMessage = `\n\n✅ TESTS PASSED (iteration ${iterState.current_iteration})\n` +
                    `Test iteration requirement: SATISFIED` +
                    coverageNote +
                    atddWarning +
                    `\n\nNEXT STEP: Constitutional validation required.\n` +
                    constArticleNote;
            }

        } else {
            // FAILURE
            iterState.failures_count = (iterState.failures_count || 0) + 1;

            // Check circuit breaker
            // Priority chain: state.json iteration_config > iteration-requirements.json > hardcoded default
            const circuitBreakerThreshold = (iterConfig && iterConfig.circuit_breaker_threshold) ||
                                            (phaseReq && phaseReq.test_iteration && phaseReq.test_iteration.circuit_breaker_threshold) ||
                                            3;
            if (isIdenticalFailure(testResult.error, iterState.history)) {
                iterState.identical_failure_count = (iterState.identical_failure_count || 0) + 1;
            } else {
                iterState.identical_failure_count = 1;
            }

            if (iterState.identical_failure_count >= circuitBreakerThreshold) {
                // Circuit breaker triggered
                iterState.completed = true;
                iterState.status = 'escalated';
                iterState.escalation_reason = 'circuit_breaker';
                iterState.escalation_details = `Same error repeated ${circuitBreakerThreshold} times`;

                outputMessage = `\n\n🚨 CIRCUIT BREAKER TRIGGERED\n` +
                    `Same error repeated ${circuitBreakerThreshold} times.\n` +
                    `Error: ${testResult.error}\n\n` +
                    `ACTION REQUIRED: Escalate to human review.\n` +
                    `The autonomous iteration loop cannot resolve this issue.`;

            } else if (iterState.current_iteration >= iterState.max_iterations) {
                // Max iterations exceeded
                iterState.completed = true;
                iterState.status = 'escalated';
                iterState.escalation_reason = 'max_iterations';
                iterState.escalation_details = `Exceeded ${iterState.max_iterations} iterations without success`;

                outputMessage = `\n\n🚨 MAX ITERATIONS EXCEEDED (${iterState.max_iterations})\n` +
                    `Last error: ${testResult.error}\n\n` +
                    `ACTION REQUIRED: Escalate to human review.\n` +
                    `The autonomous iteration loop has exhausted all attempts.`;

            } else {
                // Continue iteration
                const remaining = iterState.max_iterations - iterState.current_iteration;

                outputMessage = `\n\n❌ TESTS FAILED (iteration ${iterState.current_iteration}/${iterState.max_iterations})\n` +
                    `Remaining iterations: ${remaining}\n` +
                    `Error: ${testResult.error}\n\n` +
                    `MANDATORY: You are in an active iteration loop. You MUST:\n` +
                    `1. Read the test output above carefully\n` +
                    `2. Identify the root cause of the failure\n` +
                    `3. Fix the failing code or tests\n` +
                    `4. Re-run the SAME test command: ${command}\n\n` +
                    `DO NOT attempt to advance the phase, delegate to other agents, or skip this step.`;
            }
        }

        // Save updated state in memory
        state.phases[currentPhase].iteration_requirements.test_iteration = iterState;

        return {
            decision: 'allow',
            stdout: outputMessage || undefined,
            stateModified: true
        };

    } catch (error) {
        debugLog('Error in test-watcher:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use (+ helpers for direct testing)
// BUG-0007: Added parseTestResult to exports for direct unit testing
module.exports = { check, normalizeErrorForComparison, isIdenticalFailure, parseCoverage, parseTestResult };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, writeState: writeStateFn, loadManifest, loadIterationRequirements: loadReqs, loadWorkflowDefinitions } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) { process.exit(0); }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadReqs();
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
