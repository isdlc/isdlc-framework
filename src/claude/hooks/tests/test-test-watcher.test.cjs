'use strict';

/**
 * iSDLC Test Watcher - Test Suite (CJS)
 * =======================================
 * Unit tests for src/claude/hooks/test-watcher.js
 *
 * The test-watcher hook is a PostToolUse hook that monitors Bash tool executions
 * for test commands. When a test command is detected, it parses the result for
 * pass/fail, updates the iteration counter in state.json, checks for circuit
 * breaker conditions, and outputs guidance to the agent.
 *
 * IMPORTANT: PostToolUse hooks receive tool_result in the input JSON:
 * {
 *   "tool_name": "Bash",
 *   "tool_input": { "command": "npm test" },
 *   "tool_result": "output of the command..."
 * }
 *
 * IMPORTANT: Hooks use CommonJS require() but the project package.json has
 * "type": "module". We copy the hook + lib/common.js to the temp test directory
 * (which is outside the ESM package scope) so Node treats .js files as CJS.
 *
 * Run: node --test src/claude/hooks/tests/test-test-watcher.test.cjs
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir,
    writeState,
    readState,
    runHook
} = require('./hook-test-utils.cjs');

/** Source paths */
const hookSrcPath = path.resolve(__dirname, '..', 'test-watcher.cjs');
const commonSrcPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');

/**
 * Copy the hook file and its lib/common.cjs dependency into the temp test dir.
 * Returns the absolute path to the copied hook file.
 */
function installHook() {
    const testDir = getTestDir();
    const libDir = path.join(testDir, 'lib');
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }
    fs.copyFileSync(commonSrcPath, path.join(libDir, 'common.cjs'));
    const hookDest = path.join(testDir, 'test-watcher.cjs');
    fs.copyFileSync(hookSrcPath, hookDest);
    return hookDest;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a PostToolUse Bash input with command and result.
 * @param {string} command - The bash command
 * @param {string} output - The command output (tool_result)
 * @param {number} [exitCode] - Optional exit code embedded in result
 */
function bashTestInput(command, output, exitCode) {
    const input = {
        tool_name: 'Bash',
        tool_input: { command }
    };
    if (exitCode !== undefined) {
        // Embed exit code in a structured result object
        input.tool_result = { output, exitCode };
    } else {
        input.tool_result = output;
    }
    return input;
}

/**
 * Base state for a phase with test_iteration enabled.
 * Uses phase 06-implementation which has test_iteration.enabled: true in the
 * iteration-requirements.json config.
 *
 * NOTE: active_workflow is required — test-watcher exits silently when
 * no active workflow exists (to avoid noise during casual test runs).
 */
function baseTestState(extras) {
    return {
        current_phase: '06-implementation',
        iteration_enforcement: { enabled: true },
        active_workflow: {
            type: 'feature',
            current_phase: '06-implementation',
            current_phase_index: 5
        },
        phases: {
            '06-implementation': {
                status: 'in_progress',
                ...((extras && extras.phase) || {})
            }
        }
    };
}

/**
 * State with an existing test_iteration that has failed N times.
 */
function failedIterationState(iteration, maxIter, extras) {
    return baseTestState({
        phase: {
            iteration_requirements: {
                test_iteration: {
                    required: true,
                    completed: false,
                    current_iteration: iteration || 1,
                    max_iterations: maxIter || 10,
                    failures_count: iteration || 1,
                    identical_failure_count: 0,
                    last_test_result: 'failed',
                    last_test_command: 'npm test',
                    history: [],
                    started_at: '2026-01-01T00:00:00.000Z',
                    ...((extras && extras.test_iteration) || {})
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('test-watcher.js', () => {
    let hookPath;

    beforeEach(() => {
        setupTestEnv();
        hookPath = installHook();
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    // -----------------------------------------------------------------------
    // 1. Non-Bash tool passes through
    // -----------------------------------------------------------------------
    it('passes through non-Bash tools (e.g., Task)', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const result = await runHook(hookPath, {
            tool_name: 'Task',
            tool_input: { prompt: 'Run the test suite' },
            tool_result: 'Done'
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Non-Bash tool should pass through silently');
    });

    // -----------------------------------------------------------------------
    // 2. Bash command that's not a test
    // -----------------------------------------------------------------------
    it('passes through Bash commands that are not test commands (e.g., npm install)', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const result = await runHook(hookPath, bashTestInput('npm install', 'added 150 packages'));
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Non-test Bash command should pass through');
    });

    // -----------------------------------------------------------------------
    // 3. npm test with passing output - records success
    // -----------------------------------------------------------------------
    it('records success in state when npm test passes', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'Test Suites: 5 passed, 5 total\nTests: 20 passed, 0 failed, 20 total\nAll tests passed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'Should output success message');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.ok(iterState, 'test_iteration state should be created');
        assert.equal(iterState.completed, true);
        assert.equal(iterState.status, 'success');
        assert.equal(iterState.last_test_result, 'passed');
    });

    // -----------------------------------------------------------------------
    // 4. npm test with failing output - records failure
    // -----------------------------------------------------------------------
    it('records failure in state when npm test fails', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'Tests: 3 failed, 17 passed, 20 total\nFAIL src/auth.test.js\nError: Expected true to be false';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS FAILED'), 'Should output failure message');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.completed, false);
        assert.equal(iterState.last_test_result, 'failed');
        assert.ok(iterState.failures_count >= 1);
    });

    // -----------------------------------------------------------------------
    // 5. pytest detected as test command
    // -----------------------------------------------------------------------
    it('detects pytest as a test command', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = '5 passed in 2.1s\nAll tests passed';
        const result = await runHook(hookPath, bashTestInput('pytest tests/', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'pytest should be detected as test command');
    });

    // -----------------------------------------------------------------------
    // 6. go test detected as test command
    // -----------------------------------------------------------------------
    it('detects go test as a test command', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'ok  \tgithub.com/user/repo\t0.5s\n3 passing\nPASSED';
        const result = await runHook(hookPath, bashTestInput('go test ./...', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'go test should be detected');
    });

    // -----------------------------------------------------------------------
    // 7. cargo test detected as test command
    // -----------------------------------------------------------------------
    it('detects cargo test as a test command', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'test result: ok. 10 passed; 0 failed; 0 ignored\nAll tests passed';
        const result = await runHook(hookPath, bashTestInput('cargo test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'cargo test should be detected');
    });

    // -----------------------------------------------------------------------
    // 8. jest detected as test command
    // -----------------------------------------------------------------------
    it('detects jest as a test command', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'Tests: 8 passed, 0 failed, 8 total\nAll tests passed';
        const result = await runHook(hookPath, bashTestInput('jest --coverage', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'jest should be detected');
    });

    // -----------------------------------------------------------------------
    // 9. First failure creates iteration state
    // -----------------------------------------------------------------------
    it('creates iteration state on first test failure', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'FAIL src/app.test.js\n1 failed, 4 passed\nError: assertion failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.ok(iterState, 'test_iteration should be created');
        assert.equal(iterState.current_iteration, 1);
        assert.equal(iterState.completed, false);
        assert.equal(iterState.last_test_result, 'failed');
        assert.ok(iterState.started_at, 'Should have started_at timestamp');
        assert.ok(Array.isArray(iterState.history), 'Should have history array');
        assert.equal(iterState.history.length, 1);
        assert.equal(iterState.history[0].result, 'FAILED');
    });

    // -----------------------------------------------------------------------
    // 10. Second failure increments iteration counter
    // -----------------------------------------------------------------------
    it('increments iteration counter on subsequent failures', async () => {
        cleanupTestEnv();
        setupTestEnv(failedIterationState(2, 10));
        hookPath = installHook();

        const output = 'FAIL src/app.test.js\n1 failed\nTypeError: Cannot read property';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.current_iteration, 3, 'Should increment from 2 to 3');
        assert.equal(iterState.completed, false);
    });

    // -----------------------------------------------------------------------
    // 11. Success after failure marks completed=true, status="success"
    // -----------------------------------------------------------------------
    it('marks iteration as completed with status "success" after passing tests', async () => {
        cleanupTestEnv();
        setupTestEnv(failedIterationState(3, 10));
        hookPath = installHook();

        const output = 'All tests passed\nTests: 10 passed, 0 failed, 10 total';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'Should announce success');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.completed, true);
        assert.equal(iterState.status, 'success');
        assert.equal(iterState.last_test_result, 'passed');
        assert.ok(iterState.completed_at, 'Should have completed_at timestamp');
    });

    // -----------------------------------------------------------------------
    // 12. Max iterations exceeded triggers escalation
    // -----------------------------------------------------------------------
    it('escalates when max iterations are exceeded', async () => {
        // Set current_iteration to 9, max_iterations to 10 -- next failure will be #10 = max
        cleanupTestEnv();
        setupTestEnv(failedIterationState(9, 10));
        hookPath = installHook();

        const output = 'FAIL\n1 failed\nError: Something broken';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('MAX ITERATIONS EXCEEDED'), 'Should announce max iterations');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.completed, true);
        assert.equal(iterState.status, 'escalated');
        assert.equal(iterState.escalation_reason, 'max_iterations');
    });

    // -----------------------------------------------------------------------
    // 13. Enforcement disabled - no state changes
    // -----------------------------------------------------------------------
    it('passes through without state changes when enforcement is disabled', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: false },
            active_workflow: { type: 'feature', current_phase: '06-implementation' },
            phases: {
                '06-implementation': { status: 'in_progress' }
            }
        });
        hookPath = installHook();

        const output = 'FAIL\n3 failed\nError: bad';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Should be silent when enforcement disabled');

        const state = readState();
        // Should NOT have created iteration_requirements
        assert.ok(
            !state.phases['06-implementation'].iteration_requirements,
            'Should not create iteration state when enforcement disabled'
        );
    });

    // -----------------------------------------------------------------------
    // 14. Exit code extraction from structured tool_result
    // -----------------------------------------------------------------------
    it('detects failure from exitCode in structured tool_result', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        // No output but exit code 1 -- should be detected as failure
        const result = await runHook(hookPath, bashTestInput('npm test', '', 1));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.last_test_result, 'failed', 'Should detect failure from exit code');
    });

    // -----------------------------------------------------------------------
    // 15. Output with "FAIL" keyword detected as failure
    // -----------------------------------------------------------------------
    it('detects failure from FAIL keyword in output', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'FAIL src/components/Button.test.js\n  Expected: true\n  Received: false';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.last_test_result, 'failed', 'Should detect FAIL keyword');
    });

    // -----------------------------------------------------------------------
    // 16. Output with "Tests: 5 passed, 0 failed" detected as success
    // -----------------------------------------------------------------------
    it('detects success from "Tests: N passed, 0 failed" pattern', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'Tests: 5 passed, 0 failed, 5 total\nTime: 2.5s';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'Should detect success pattern');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.last_test_result, 'passed');
        assert.equal(iterState.completed, true);
        assert.equal(iterState.status, 'success');
    });

    // -----------------------------------------------------------------------
    // 17. No state.json - passes through silently
    // -----------------------------------------------------------------------
    it('passes through when state.json does not exist', async () => {
        cleanupTestEnv();
        const testDir = setupTestEnv();
        hookPath = installHook();
        fs.unlinkSync(path.join(testDir, '.isdlc', 'state.json'));

        const output = 'FAIL\n1 failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Should pass through when no state');
    });

    // -----------------------------------------------------------------------
    // 17b. No active_workflow - passes through silently (no iteration noise)
    // -----------------------------------------------------------------------
    it('passes through silently when no active_workflow exists', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            // No active_workflow — casual test run outside SDLC workflow
            phases: {
                '06-implementation': { status: 'in_progress' }
            }
        });
        hookPath = installHook();

        const output = 'FAIL\n3 failed\nError: assertion failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Should pass through silently without active workflow');

        // Should NOT modify state
        const state = readState();
        assert.ok(
            !state.phases['06-implementation'].iteration_requirements,
            'Should not create iteration state when no active workflow'
        );
    });

    // -----------------------------------------------------------------------
    // 18. vitest detected as test command
    // -----------------------------------------------------------------------
    it('detects vitest as a test command', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'Tests: 12 passed, 0 failed\nAll tests passed';
        const result = await runHook(hookPath, bashTestInput('vitest run', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'vitest should be detected');
    });

    // -----------------------------------------------------------------------
    // 19. mvn test detected as test command
    // -----------------------------------------------------------------------
    it('detects mvn test as a test command', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'BUILD SUCCESS\nTests run: 25, Failures: 0, Errors: 0';
        const result = await runHook(hookPath, bashTestInput('mvn test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'mvn test should be detected');
    });

    // -----------------------------------------------------------------------
    // 20. History entry is recorded for each test run
    // -----------------------------------------------------------------------
    it('records history entry with correct fields for each test run', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'FAIL src/app.test.js\n2 failed\nError: assertion failed';
        await runHook(hookPath, bashTestInput('npm test', output));

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.history.length, 1);
        const entry = iterState.history[0];
        assert.equal(entry.iteration, 1);
        assert.equal(entry.result, 'FAILED');
        assert.equal(entry.command, 'npm test');
        assert.ok(entry.timestamp, 'History entry should have timestamp');
        assert.ok(entry.error, 'History entry should have error');
    });

    // -----------------------------------------------------------------------
    // 21. Phase without test_iteration enabled passes through
    // -----------------------------------------------------------------------
    it('passes through for a phase with test_iteration disabled', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '01-requirements',
            iteration_enforcement: { enabled: true },
            active_workflow: { type: 'feature', current_phase: '01-requirements' },
            phases: {
                '01-requirements': { status: 'in_progress' }
            }
        });
        hookPath = installHook();

        const output = 'FAIL\n1 failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Phase without test_iteration enabled should pass through');
    });

    // -----------------------------------------------------------------------
    // 22. Exit code in string format "exited with code 1"
    // -----------------------------------------------------------------------
    it('extracts exit code from string "exited with code 1" in tool_result', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'npm test exited with code 1';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.last_test_result, 'failed', 'Should detect failure from "exited with code 1"');
    });

    // -----------------------------------------------------------------------
    // 23. Failure output message contains remaining iterations
    // -----------------------------------------------------------------------
    it('failure output includes remaining iterations count', async () => {
        cleanupTestEnv();
        setupTestEnv(failedIterationState(3, 10));
        hookPath = installHook();

        const output = 'FAIL\n1 failed\nError: broken';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        // current_iteration was 3, will become 4, remaining = 10-4 = 6
        assert.ok(result.stdout.includes('4/10'), 'Should show iteration 4/10');
        assert.ok(result.stdout.includes('Remaining iterations: 6'), 'Should show remaining iterations');
    });

    // -----------------------------------------------------------------------
    // 24. Success output mentions constitutional validation next step
    // -----------------------------------------------------------------------
    it('success output mentions constitutional validation as next step', async () => {
        cleanupTestEnv();
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'All tests passed\nTests: 5 passed, 0 failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('Constitutional validation required'),
            'Success message should mention constitutional validation as next step');
    });

    // -----------------------------------------------------------------------
    // 25. iteration_config.testing_max overrides max_iterations from requirements
    // -----------------------------------------------------------------------
    it('uses iteration_config.testing_max from state.json when present', async () => {
        cleanupTestEnv();
        // Set iteration_config with testing_max=3 (lower than default 10)
        setupTestEnv({
            ...baseTestState(),
            iteration_config: {
                implementation_max: 5,
                testing_max: 3,
                circuit_breaker_threshold: 2,
                escalation_behavior: 'pause',
                configured_at: '2026-02-07T14:30:00Z'
            }
        });
        hookPath = installHook();

        // First failure — should create state with max_iterations=3
        const output = 'FAIL src/app.test.js\n1 failed\nError: assertion failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.max_iterations, 3, 'max_iterations should be 3 from iteration_config.testing_max');
        assert.ok(result.stdout.includes('1/3'), 'Output should show iteration 1/3');
        assert.ok(result.stdout.includes('Remaining iterations: 2'), 'Should show 2 remaining');
    });

    // -----------------------------------------------------------------------
    // 26. iteration_config.circuit_breaker_threshold overrides requirements
    // -----------------------------------------------------------------------
    it('uses iteration_config.circuit_breaker_threshold from state.json', async () => {
        cleanupTestEnv();
        // Set circuit_breaker_threshold=2 (lower than default 3)
        // Set up state with 1 identical failure already recorded, threshold=2 means next identical triggers
        setupTestEnv({
            ...failedIterationState(1, 10, {
                test_iteration: {
                    identical_failure_count: 1,
                    history: [
                        { iteration: 1, result: 'FAILED', error: 'TypeError: x is not a function' }
                    ]
                }
            }),
            iteration_config: {
                implementation_max: 5,
                testing_max: 10,
                circuit_breaker_threshold: 2,
                escalation_behavior: 'pause',
                configured_at: '2026-02-07T14:30:00Z'
            }
        });
        hookPath = installHook();

        // Same error repeated — should trigger circuit breaker at threshold=2
        const output = 'FAIL\n1 failed\nTypeError: x is not a function';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('CIRCUIT BREAKER TRIGGERED'),
            'Circuit breaker should trigger at threshold=2 from iteration_config');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.status, 'escalated');
        assert.equal(iterState.escalation_reason, 'circuit_breaker');
    });

    // -----------------------------------------------------------------------
    // 27. Without iteration_config, falls back to iteration-requirements.json
    // -----------------------------------------------------------------------
    it('falls back to iteration-requirements.json when iteration_config is absent', async () => {
        cleanupTestEnv();
        // No iteration_config in state — should use default from requirements (10)
        setupTestEnv(baseTestState());
        hookPath = installHook();

        const output = 'FAIL src/app.test.js\n1 failed\nError: something broke';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        // Default from iteration-requirements.json for 06-implementation is 10
        assert.equal(iterState.max_iterations, 10,
            'Should use max_iterations from iteration-requirements.json when no iteration_config');
    });

    // -----------------------------------------------------------------------
    // 28. iteration_config without configured_at is ignored
    // -----------------------------------------------------------------------
    it('ignores iteration_config without configured_at timestamp', async () => {
        cleanupTestEnv();
        // iteration_config present but missing configured_at — should be treated as absent
        setupTestEnv({
            ...baseTestState(),
            iteration_config: {
                implementation_max: 2,
                testing_max: 2,
                circuit_breaker_threshold: 1
                // No configured_at — getIterationConfig returns null
            }
        });
        hookPath = installHook();

        const output = 'FAIL src/app.test.js\n1 failed\nError: assertion failed';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        // Should NOT use testing_max=2, should fall back to requirements default (10)
        assert.equal(iterState.max_iterations, 10,
            'Should ignore iteration_config without configured_at and use requirements default');
    });

    // -----------------------------------------------------------------------
    // 29. Max iterations escalation respects iteration_config.testing_max
    // -----------------------------------------------------------------------
    it('escalates at iteration_config.testing_max instead of requirements max', async () => {
        cleanupTestEnv();
        // testing_max=3, current_iteration=2 — next failure (#3) should trigger max exceeded
        setupTestEnv({
            ...failedIterationState(2, 3),
            iteration_config: {
                implementation_max: 5,
                testing_max: 3,
                circuit_breaker_threshold: 5,
                escalation_behavior: 'pause',
                configured_at: '2026-02-07T14:30:00Z'
            }
        });
        hookPath = installHook();

        const output = 'FAIL\n1 failed\nError: Something broken';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('MAX ITERATIONS EXCEEDED'),
            'Should escalate at testing_max=3');

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.completed, true);
        assert.equal(iterState.status, 'escalated');
        assert.equal(iterState.escalation_reason, 'max_iterations');
    });

    // -----------------------------------------------------------------------
    // 30. Existing iteration state max_iterations is preserved (not overwritten)
    // -----------------------------------------------------------------------
    it('does not overwrite max_iterations on existing iteration state', async () => {
        cleanupTestEnv();
        // Pre-existing iterState has max_iterations=10, iteration_config has testing_max=3
        // Since iterState already exists, max_iterations should stay at 10
        setupTestEnv({
            ...failedIterationState(2, 10),
            iteration_config: {
                implementation_max: 5,
                testing_max: 3,
                circuit_breaker_threshold: 2,
                escalation_behavior: 'pause',
                configured_at: '2026-02-07T14:30:00Z'
            }
        });
        hookPath = installHook();

        const output = 'FAIL\n1 failed\nError: another failure';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);

        const state = readState();
        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        // max_iterations should remain 10 because iterState already existed
        assert.equal(iterState.max_iterations, 10,
            'Should preserve existing max_iterations when iterState already exists');
    });
});

// ---------------------------------------------------------------------------
// Fuzzy Circuit Breaker Tests (WI-6)
// ---------------------------------------------------------------------------

describe('normalizeErrorForComparison -- fuzzy circuit breaker', () => {
    /**
     * Import normalizeErrorForComparison and isIdenticalFailure directly
     * from test-watcher.cjs (they are now exported alongside check).
     */
    const { normalizeErrorForComparison, isIdenticalFailure } = require(hookSrcPath);

    // -------------------------------------------------------------------
    // 31. Returns empty string for null/undefined input
    // -------------------------------------------------------------------
    it('returns empty string for null input', () => {
        assert.equal(normalizeErrorForComparison(null), '');
    });

    it('returns empty string for undefined input', () => {
        assert.equal(normalizeErrorForComparison(undefined), '');
    });

    it('returns empty string for non-string input', () => {
        assert.equal(normalizeErrorForComparison(42), '');
        assert.equal(normalizeErrorForComparison({}), '');
        assert.equal(normalizeErrorForComparison(true), '');
    });

    it('returns empty string for empty string input', () => {
        assert.equal(normalizeErrorForComparison(''), '');
    });

    // -------------------------------------------------------------------
    // 32. Strips line:column references
    // -------------------------------------------------------------------
    it('strips line:column references (:42:13 -> :X:X)', () => {
        const input = 'Error at file.js:42:13 something failed';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes(':42:13'), 'Should strip :42:13');
        assert.ok(result.includes(':X:X'), 'Should replace with :X:X');
    });

    it('strips multiple line:column references', () => {
        const input = 'Error at file.js:42:13 and file.js:100:5';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes(':42:13'), 'Should strip first reference');
        assert.ok(!result.includes(':100:5'), 'Should strip second reference');
        assert.equal((result.match(/:X:X/g) || []).length, 2, 'Should have two :X:X replacements');
    });

    // -------------------------------------------------------------------
    // 33. Strips ISO 8601 timestamps
    // -------------------------------------------------------------------
    it('strips ISO 8601 timestamps', () => {
        const input = 'Error at 2026-02-11T10:30:00.000Z: connection failed';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes('2026-02-11'), 'Should strip ISO date');
        assert.ok(result.includes('TIMESTAMP'), 'Should replace with TIMESTAMP');
    });

    it('strips ISO 8601 timestamps without milliseconds', () => {
        const input = 'Error at 2026-02-11T10:30:00Z: connection failed';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes('2026-02-11'), 'Should strip ISO date without ms');
        assert.ok(result.includes('TIMESTAMP'), 'Should replace with TIMESTAMP');
    });

    // -------------------------------------------------------------------
    // 34. Strips common date formats
    // -------------------------------------------------------------------
    it('strips common date formats (YYYY-MM-DD HH:MM:SS)', () => {
        const input = 'Error logged at 2026-02-11 10:30:00 in module X';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes('2026-02-11'), 'Should strip date');
        assert.ok(result.includes('TIMESTAMP'), 'Should replace with TIMESTAMP');
    });

    // -------------------------------------------------------------------
    // 35. Strips stack trace paths
    // -------------------------------------------------------------------
    it('strips stack trace paths with parenthesized form', () => {
        const input = 'at Object.<anonymous> (/path/to/file.js:42:13)';
        const result = normalizeErrorForComparison(input);
        assert.ok(result.includes('at STACK'), 'Should replace stack trace with at STACK');
        assert.ok(!result.includes('/path/to/file.js'), 'Should strip file path');
    });

    it('strips stack trace paths without parentheses', () => {
        const input = 'at /Users/dev/project/src/index.js:99:5';
        const result = normalizeErrorForComparison(input);
        assert.ok(result.includes('at STACK'), 'Should replace non-paren stack trace');
        assert.ok(!result.includes('/Users/dev'), 'Should strip file path');
    });

    // -------------------------------------------------------------------
    // 36. Strips memory addresses
    // -------------------------------------------------------------------
    it('strips memory addresses (0x7fff5fbff8c0 -> 0xADDR)', () => {
        const input = 'Segfault at address 0x7fff5fbff8c0';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes('0x7fff5fbff8c0'), 'Should strip memory address');
        assert.ok(result.includes('0xADDR'), 'Should replace with 0xADDR');
    });

    it('strips multiple memory addresses', () => {
        const input = 'Error: 0xDEADBEEF vs 0xCAFEBABE';
        const result = normalizeErrorForComparison(input);
        assert.ok(!result.includes('0xDEADBEEF'), 'Should strip first address');
        assert.ok(!result.includes('0xCAFEBABE'), 'Should strip second address');
        assert.equal((result.match(/0xADDR/g) || []).length, 2, 'Should have two 0xADDR replacements');
    });

    // -------------------------------------------------------------------
    // 37. Collapses whitespace
    // -------------------------------------------------------------------
    it('collapses multiple spaces into single space', () => {
        const input = 'Error:   multiple    spaces   here';
        const result = normalizeErrorForComparison(input);
        assert.equal(result, 'Error: multiple spaces here');
    });

    it('collapses tabs and newlines into single space', () => {
        const input = 'Error:\ttab\nand\nnewline';
        const result = normalizeErrorForComparison(input);
        assert.equal(result, 'Error: tab and newline');
    });

    it('trims leading and trailing whitespace', () => {
        const input = '  Error: something  ';
        const result = normalizeErrorForComparison(input);
        assert.equal(result, 'Error: something');
    });

    // -------------------------------------------------------------------
    // 38. isIdenticalFailure matches errors differing only in line numbers
    // -------------------------------------------------------------------
    it('isIdenticalFailure matches errors that differ only in line numbers', () => {
        const currentError = 'TypeError: Cannot read property at file.js:50:10';
        const history = [
            { iteration: 1, error: 'TypeError: Cannot read property at file.js:42:13' },
            { iteration: 2, error: 'TypeError: Cannot read property at file.js:45:8' }
        ];
        assert.ok(isIdenticalFailure(currentError, history),
            'Should match errors that differ only in line:column references');
    });

    it('isIdenticalFailure matches errors that differ only in timestamps', () => {
        const currentError = 'Connection timeout at 2026-02-11T12:00:00.000Z';
        const history = [
            { iteration: 1, error: 'Connection timeout at 2026-02-10T08:30:00.000Z' },
            { iteration: 2, error: 'Connection timeout at 2026-02-11T10:15:00.000Z' }
        ];
        assert.ok(isIdenticalFailure(currentError, history),
            'Should match errors that differ only in ISO timestamps');
    });

    it('isIdenticalFailure matches errors that differ only in memory addresses', () => {
        const currentError = 'Segfault at 0xDEADBEEF in module X';
        const history = [
            { iteration: 1, error: 'Segfault at 0xCAFEBABE in module X' },
            { iteration: 2, error: 'Segfault at 0x12345678 in module X' }
        ];
        assert.ok(isIdenticalFailure(currentError, history),
            'Should match errors that differ only in memory addresses');
    });

    it('isIdenticalFailure does NOT match genuinely different errors', () => {
        const currentError = 'TypeError: Cannot read property x of undefined';
        const history = [
            { iteration: 1, error: 'ReferenceError: y is not defined' },
            { iteration: 2, error: 'SyntaxError: Unexpected token' }
        ];
        assert.ok(!isIdenticalFailure(currentError, history),
            'Should NOT match genuinely different errors');
    });

    it('isIdenticalFailure returns false when history has fewer than 2 entries', () => {
        const currentError = 'Error: something broke';
        assert.ok(!isIdenticalFailure(currentError, []),
            'Empty history should return false');
        assert.ok(!isIdenticalFailure(currentError, [{ iteration: 1, error: 'Error: something broke' }]),
            'Single history entry should return false');
    });

    it('isIdenticalFailure returns false for null/empty history', () => {
        assert.ok(!isIdenticalFailure('Error', null), 'null history should return false');
        assert.ok(!isIdenticalFailure('Error', undefined), 'undefined history should return false');
    });

    // -------------------------------------------------------------------
    // 39. Integration: fuzzy circuit breaker triggers through check()
    // -------------------------------------------------------------------
    it('fuzzy circuit breaker triggers via check() for errors differing only in line numbers', () => {
        // Require check from the source module
        const { check: checkFn } = require(hookSrcPath);

        // Build state with 2 prior identical-ish failures (different line numbers)
        const state = {
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation',
                current_phase_index: 5
            },
            phases: {
                '06-implementation': {
                    status: 'in_progress',
                    iteration_requirements: {
                        test_iteration: {
                            required: true,
                            completed: false,
                            current_iteration: 2,
                            max_iterations: 10,
                            failures_count: 2,
                            identical_failure_count: 2,
                            last_test_result: 'failed',
                            last_test_command: 'npm test',
                            history: [
                                { iteration: 1, result: 'FAILED', error: 'TypeError: x is not a function at file.js:10:5' },
                                { iteration: 2, result: 'FAILED', error: 'TypeError: x is not a function at file.js:20:8' }
                            ],
                            started_at: '2026-01-01T00:00:00.000Z'
                        }
                    }
                }
            }
        };

        // Build requirements that enable test_iteration for 06-implementation
        const requirements = {
            phase_requirements: {
                '06-implementation': {
                    test_iteration: {
                        enabled: true,
                        max_iterations: 10,
                        circuit_breaker_threshold: 3
                    }
                }
            }
        };

        // Third failure with same error but different line number
        const input = {
            tool_name: 'Bash',
            tool_input: { command: 'npm test' },
            tool_result: 'FAIL\n1 failed\nTypeError: x is not a function at file.js:35:12'
        };

        const result = checkFn({ input, state, requirements });
        assert.equal(result.decision, 'allow');
        assert.ok(result.stdout.includes('CIRCUIT BREAKER TRIGGERED'),
            'Fuzzy circuit breaker should trigger for errors differing only in line numbers');

        const iterState = state.phases['06-implementation'].iteration_requirements.test_iteration;
        assert.equal(iterState.status, 'escalated');
        assert.equal(iterState.escalation_reason, 'circuit_breaker');
    });
});

// ---------------------------------------------------------------------------
// BUG-0007: Inconclusive Result Type — parseTestResult() Tests
// ---------------------------------------------------------------------------

/**
 * Build a check() context that will produce an inconclusive result.
 * Output matches NO success/failure patterns, NO exit code available.
 * @param {object} [iterOverrides] - Overrides for the test_iteration state
 * @returns {{ input: object, state: object, requirements: object }}
 */
function buildInconclusiveCtx(iterOverrides) {
    const state = {
        current_phase: '06-implementation',
        iteration_enforcement: { enabled: true },
        active_workflow: {
            type: 'feature',
            current_phase: '06-implementation',
            current_phase_index: 5
        },
        phases: {
            '06-implementation': {
                status: 'in_progress',
                iteration_requirements: {
                    test_iteration: {
                        required: true,
                        completed: false,
                        current_iteration: 0,
                        max_iterations: 10,
                        failures_count: 0,
                        identical_failure_count: 0,
                        history: [],
                        started_at: '2026-01-01T00:00:00.000Z',
                        ...(iterOverrides || {})
                    }
                }
            }
        }
    };

    const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_result: 'Running checks... Done. Summary complete.'
    };

    const requirements = {
        phase_requirements: {
            '06-implementation': {
                test_iteration: {
                    enabled: true,
                    max_iterations: 10,
                    circuit_breaker_threshold: 3
                }
            }
        }
    };

    return { input, state, requirements };
}

/**
 * Extract test_iteration state from context after check() call.
 */
function getIterState(ctx) {
    return ctx.state.phases['06-implementation'].iteration_requirements.test_iteration;
}

describe('parseTestResult -- inconclusive result type (BUG-0007)', () => {
    // TC-INC-01: Inconclusive for unmatched output with no exit code
    it('returns inconclusive when no patterns match and no exit code (AC-1.1)', () => {
        const { parseTestResult } = require(hookSrcPath);
        const output = 'Running checks... Done. Summary complete.';
        const result = parseTestResult(output, undefined);
        assert.equal(result.passed, null, 'passed must be null for inconclusive');
        assert.equal(result.inconclusive, true, 'inconclusive must be true');
        assert.equal(result.error, 'Unable to determine test result');
    });

    // TC-INC-02: Exit code 0 still returns PASSED (not inconclusive)
    it('returns PASSED when exit code is 0 even if no patterns match (AC-1.2)', () => {
        const { parseTestResult } = require(hookSrcPath);
        const output = 'Running checks... Done. Summary complete.';
        const result = parseTestResult(output, 0);
        assert.equal(result.passed, true, 'passed must be true when exitCode is 0');
        assert.ok(!result.inconclusive, 'inconclusive must not be true');
    });

    // TC-INC-03: Exit code non-zero still returns FAILED (not inconclusive)
    it('returns FAILED when exit code is non-zero even if no patterns match (AC-1.2)', () => {
        const { parseTestResult } = require(hookSrcPath);
        const output = 'Running checks... Done. Summary complete.';
        const result = parseTestResult(output, 1);
        assert.equal(result.passed, false, 'passed must be false when exitCode is 1');
        assert.ok(!result.inconclusive, 'inconclusive must not be true');
        assert.equal(result.error, 'Exit code: 1');
    });

    // TC-INC-04: Failure patterns still return FAILED
    it('returns FAILED when failure patterns match, not inconclusive (AC-1.3)', () => {
        const { parseTestResult } = require(hookSrcPath);
        const output = 'FAIL src/app.test.js\n2 failed\nError: assertion failed';
        const result = parseTestResult(output, undefined);
        assert.equal(result.passed, false);
        assert.ok(result.failures >= 1);
        assert.ok(!result.inconclusive, 'inconclusive must not be true when failure patterns match');
    });

    // TC-INC-05: Success patterns still return PASSED
    it('returns PASSED when success patterns match, not inconclusive (AC-1.4)', () => {
        const { parseTestResult } = require(hookSrcPath);
        const output = 'All tests passed\nTests: 5 passed, 0 failed, 5 total';
        const result = parseTestResult(output, undefined);
        assert.equal(result.passed, true);
        assert.ok(!result.inconclusive, 'inconclusive must not be true when success patterns match');
    });

    // TC-INC-05b: Inconclusive property absent on all determinate results
    it('inconclusive is absent or false on all determinate results (AC-1.5)', () => {
        const { parseTestResult } = require(hookSrcPath);

        // PASSED via pattern
        const passResult = parseTestResult('All tests passed', undefined);
        assert.ok(!passResult.inconclusive, 'PASSED result must not be inconclusive');

        // FAILED via pattern
        const failResult = parseTestResult('FAIL\n1 failed\nError: bad', undefined);
        assert.ok(!failResult.inconclusive, 'FAILED result must not be inconclusive');

        // PASSED via exit code 0
        const exit0Result = parseTestResult('some output', 0);
        assert.ok(!exit0Result.inconclusive, 'exit code 0 result must not be inconclusive');

        // FAILED via exit code 1
        const exit1Result = parseTestResult('some output', 1);
        assert.ok(!exit1Result.inconclusive, 'exit code 1 result must not be inconclusive');
    });
});

// ---------------------------------------------------------------------------
// BUG-0007: Inconclusive Result Type — check() Integration Tests
// ---------------------------------------------------------------------------

describe('check() -- inconclusive handling (BUG-0007)', () => {
    // TC-INC-06: History entry records "INCONCLUSIVE" result
    it('records INCONCLUSIVE in history entry, not FAILED (AC-2.1)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx();
        checkFn(ctx);
        const iterState = getIterState(ctx);
        assert.equal(iterState.history.length, 1);
        assert.equal(iterState.history[0].result, 'INCONCLUSIVE');
    });

    // TC-INC-07: failures_count is NOT incremented
    it('does not increment failures_count for inconclusive results (AC-2.2)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx({ failures_count: 2 });
        checkFn(ctx);
        const iterState = getIterState(ctx);
        assert.equal(iterState.failures_count, 2, 'failures_count must remain unchanged');
    });

    // TC-INC-08: identical_failure_count is NOT incremented
    it('does not increment identical_failure_count for inconclusive results (AC-2.3)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx({ identical_failure_count: 2 });
        checkFn(ctx);
        const iterState = getIterState(ctx);
        assert.equal(iterState.identical_failure_count, 2, 'identical_failure_count must remain unchanged');
    });

    // TC-INC-09: Circuit breaker is skipped entirely (CRITICAL — the exact bug scenario)
    it('skips circuit breaker entirely for inconclusive results (AC-2.4)', () => {
        const { check: checkFn } = require(hookSrcPath);
        // Set up state that would trigger circuit breaker if this were a FAILED result:
        // identical_failure_count=2 (threshold=3), two prior identical errors in history
        const ctx = buildInconclusiveCtx({
            current_iteration: 2,
            failures_count: 2,
            identical_failure_count: 2,
            history: [
                { iteration: 1, result: 'FAILED', error: 'Unable to determine test result' },
                { iteration: 2, result: 'FAILED', error: 'Unable to determine test result' }
            ]
        });
        const result = checkFn(ctx);
        const iterState = getIterState(ctx);

        // Circuit breaker must NOT trigger
        assert.ok(!result.stdout.includes('CIRCUIT BREAKER'), 'Circuit breaker must not trigger for inconclusive');
        assert.notEqual(iterState.status, 'escalated', 'Must not escalate');
        assert.equal(iterState.completed, false, 'Must not mark completed');
        // Failure counts must not change
        assert.equal(iterState.failures_count, 2, 'failures_count must not increment');
        assert.equal(iterState.identical_failure_count, 2, 'identical_failure_count must not increment');
    });

    // TC-INC-10: last_test_result set to "inconclusive"
    it('sets last_test_result to "inconclusive" (AC-2.5)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx();
        checkFn(ctx);
        const iterState = getIterState(ctx);
        assert.equal(iterState.last_test_result, 'inconclusive');
    });

    // TC-INC-11: Output message is a warning about unparseable output
    it('outputs a warning about unparseable output, not an error (AC-2.6)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx();
        const result = checkFn(ctx);

        // Must NOT contain error-level messages
        assert.ok(!result.stdout.includes('TESTS FAILED'), 'Must not say TESTS FAILED');
        assert.ok(!result.stdout.includes('CIRCUIT BREAKER'), 'Must not say CIRCUIT BREAKER');
        assert.ok(!result.stdout.includes('MAX ITERATIONS EXCEEDED'), 'Must not say MAX ITERATIONS');

        // Must contain some indication of inconclusive/warning
        const hasWarning = result.stdout.includes('INCONCLUSIVE') ||
                           result.stdout.includes('could not be parsed') ||
                           result.stdout.includes('WARNING') ||
                           result.stdout.includes('verify');
        assert.ok(hasWarning, 'Output should warn about unparseable output');
    });

    // TC-INC-12: current_iteration IS incremented
    it('increments current_iteration for inconclusive results (AC-3.1)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx({ current_iteration: 3 });
        checkFn(ctx);
        const iterState = getIterState(ctx);
        assert.equal(iterState.current_iteration, 4, 'current_iteration must increment from 3 to 4');
    });

    // TC-INC-13: Max iterations check still applies to inconclusive
    it('escalates when max iterations reached with inconclusive results (AC-3.2)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx({ current_iteration: 9, max_iterations: 10 });
        const result = checkFn(ctx);
        const iterState = getIterState(ctx);

        assert.equal(iterState.completed, true);
        assert.equal(iterState.status, 'escalated');
        assert.equal(iterState.escalation_reason, 'max_iterations');
        assert.ok(result.stdout.includes('MAX ITERATIONS') || result.stdout.includes('max iterations'),
            'Should announce max iterations exceeded');
    });

    // TC-INC-14: Escalation reason is "max_iterations" for all-inconclusive exhaustion
    it('uses "max_iterations" escalation reason even when all results were inconclusive (AC-3.3)', () => {
        const { check: checkFn } = require(hookSrcPath);
        const ctx = buildInconclusiveCtx({
            current_iteration: 9,
            max_iterations: 10,
            failures_count: 0,
            identical_failure_count: 0,
            history: Array.from({ length: 9 }, (_, i) => ({
                iteration: i + 1,
                timestamp: '2026-01-01T00:00:00.000Z',
                command: 'npm test',
                result: 'INCONCLUSIVE',
                failures: 0,
                error: 'Unable to determine test result'
            }))
        });
        const result = checkFn(ctx);
        const iterState = getIterState(ctx);

        assert.equal(iterState.escalation_reason, 'max_iterations',
            'Escalation reason must be max_iterations even when all were inconclusive');
        assert.equal(iterState.failures_count, 0,
            'failures_count should still be 0 after all inconclusive runs');
    });
});

// ---------------------------------------------------------------------------
// BUG-0007: Backward Compatibility Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BUG-0054-GH-52: resolveCoverageThreshold unit tests
// Traces to: FR-003, AC-003-01 through AC-003-07, AC-NFR-001-01, AC-NFR-002-01
// ---------------------------------------------------------------------------

describe('resolveCoverageThreshold (BUG-0054-GH-52)', () => {
    // Load common.cjs directly for unit testing the resolver function
    const commonPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');

    function loadCommon() {
        delete require.cache[commonPath];
        return require(commonPath);
    }

    // Fixture data
    const TIERED_UNIT = { light: 60, standard: 80, epic: 95 };
    const TIERED_INTEGRATION = { light: 50, standard: 70, epic: 85 };

    function stateWithIntensity(effectiveIntensity) {
        return {
            active_workflow: {
                sizing: {
                    effective_intensity: effectiveIntensity
                }
            }
        };
    }

    // TC-01: Object config, light intensity → 60 (AC-003-01)
    it('TC-01: returns light tier threshold when effective_intensity is light', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(TIERED_UNIT, stateWithIntensity('light'));
        assert.equal(result, 60, 'Light intensity should resolve to 60');
    });

    // TC-02: Object config, standard intensity → 80 (AC-003-02)
    it('TC-02: returns standard tier threshold when effective_intensity is standard', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(TIERED_UNIT, stateWithIntensity('standard'));
        assert.equal(result, 80, 'Standard intensity should resolve to 80');
    });

    // TC-03: Object config, epic intensity → 95 (AC-003-03)
    it('TC-03: returns epic tier threshold when effective_intensity is epic', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(TIERED_UNIT, stateWithIntensity('epic'));
        assert.equal(result, 95, 'Epic intensity should resolve to 95');
    });

    // TC-04: Scalar config (legacy backward compat) → 80 regardless of intensity (AC-003-04, AC-NFR-001-01)
    it('TC-04: returns scalar value directly regardless of intensity (backward compat)', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(80, stateWithIntensity('light'));
        assert.equal(result, 80, 'Scalar 80 should be returned as-is');
    });

    // TC-05: No sizing in state (fix workflow default) → standard (AC-003-05, AC-NFR-002-01)
    it('TC-05: defaults to standard tier when no sizing in state', () => {
        const common = loadCommon();
        const stateNoSizing = { active_workflow: {} };
        const result = common.resolveCoverageThreshold(TIERED_UNIT, stateNoSizing);
        assert.equal(result, 80, 'No sizing should default to standard tier (80)');
    });

    // TC-06: Missing standard key, standard intensity → hardcoded 80 (AC-003-06)
    it('TC-06: falls back to hardcoded 80 when standard key is missing from object', () => {
        const common = loadCommon();
        const noStandard = { light: 60, epic: 95 };
        const result = common.resolveCoverageThreshold(noStandard, stateWithIntensity('standard'));
        assert.equal(result, 80, 'Missing standard key should fall back to hardcoded 80');
    });

    // TC-07: Unknown tier falls back to standard (AC-003-07)
    it('TC-07: falls back to standard value for unknown intensity tier', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(TIERED_UNIT, stateWithIntensity('unknown_tier'));
        assert.equal(result, 80, 'Unknown tier should fall back to standard value (80)');
    });

    // TC-08: Null/undefined coverage config → null
    it('TC-08: returns null when coverage config is null', () => {
        const common = loadCommon();
        assert.equal(common.resolveCoverageThreshold(null, stateWithIntensity('standard')), null);
        assert.equal(common.resolveCoverageThreshold(undefined, stateWithIntensity('standard')), null);
    });

    // TC-09: Custom scalar override (NFR-001)
    it('TC-09: returns custom scalar override regardless of intensity (NFR-001)', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(90, stateWithIntensity('light'));
        assert.equal(result, 90, 'Custom scalar 90 should be returned as-is');
    });

    // TC-10: Empty object fallback → hardcoded 80
    it('TC-10: falls back to hardcoded 80 for empty object', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold({}, stateWithIntensity('standard'));
        assert.equal(result, 80, 'Empty object should fall back to hardcoded 80');
    });

    // Integration coverage thresholds
    it('resolves integration tiered thresholds correctly', () => {
        const common = loadCommon();
        assert.equal(common.resolveCoverageThreshold(TIERED_INTEGRATION, stateWithIntensity('light')), 50);
        assert.equal(common.resolveCoverageThreshold(TIERED_INTEGRATION, stateWithIntensity('standard')), 70);
        assert.equal(common.resolveCoverageThreshold(TIERED_INTEGRATION, stateWithIntensity('epic')), 85);
    });

    // Edge: state is null/undefined
    it('defaults to standard when state is null', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold(TIERED_UNIT, null);
        assert.equal(result, 80, 'Null state should default to standard (80)');
    });

    // Edge: string type falls back to hardcoded 80
    it('falls back to hardcoded 80 for string config value', () => {
        const common = loadCommon();
        const result = common.resolveCoverageThreshold('80', stateWithIntensity('standard'));
        assert.equal(result, 80, 'String value should fall back to hardcoded 80');
    });
});

// ---------------------------------------------------------------------------
// BUG-0054-GH-52: iteration-requirements.json tiered config validation
// Traces to: FR-001 (AC-001-01, AC-001-02), FR-002 (AC-002-01)
// ---------------------------------------------------------------------------

describe('iteration-requirements.json tiered config (BUG-0054-GH-52)', () => {
    const configPath = path.resolve(__dirname, '..', 'config', 'iteration-requirements.json');

    function loadConfig() {
        delete require.cache[configPath];
        return require(configPath);
    }

    // TC-17: Phase 06 has tiered coverage (AC-001-01)
    it('TC-17: Phase 06 min_coverage_percent is a tiered object with correct values', () => {
        const config = loadConfig();
        const coverage = config.phase_requirements['06-implementation'].test_iteration.success_criteria.min_coverage_percent;
        assert.deepEqual(coverage, { light: 60, standard: 80, epic: 95 },
            'Phase 06 should have tiered coverage {light:60, standard:80, epic:95}');
    });

    // TC-18: Phase 16 has tiered coverage (AC-001-02)
    it('TC-18: Phase 16 min_coverage_percent is a tiered object with correct values', () => {
        const config = loadConfig();
        const coverage = config.phase_requirements['16-quality-loop'].test_iteration.success_criteria.min_coverage_percent;
        assert.deepEqual(coverage, { light: 60, standard: 80, epic: 95 },
            'Phase 16 should have tiered coverage {light:60, standard:80, epic:95}');
    });

    // TC-19: Phase 07 has tiered integration coverage (AC-002-01)
    it('TC-19: Phase 07 min_coverage_percent is a tiered object with correct integration values', () => {
        const config = loadConfig();
        const coverage = config.phase_requirements['07-testing'].test_iteration.success_criteria.min_coverage_percent;
        assert.deepEqual(coverage, { light: 50, standard: 70, epic: 85 },
            'Phase 07 should have tiered coverage {light:50, standard:70, epic:85}');
    });
});

// ---------------------------------------------------------------------------
// BUG-0054-GH-52: Integration tests — tiered coverage enforcement
// Traces to: AC-003-01 through AC-003-05, AC-NFR-001-01, AC-NFR-002-01
// ---------------------------------------------------------------------------

describe('integration: tiered coverage enforcement (BUG-0054-GH-52)', () => {
    let hookPath;

    beforeEach(() => {
        setupTestEnv();
        hookPath = installHook();
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    // TC-20: Light workflow, 62% coverage passes (AC-003-01)
    it('TC-20: light workflow with 62% coverage passes threshold (60%)', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation',
                current_phase_index: 5,
                sizing: { effective_intensity: 'light' }
            },
            phases: { '06-implementation': { status: 'in_progress' } }
        });
        hookPath = installHook();

        // Use Jest-style coverage format that parseCoverage recognizes
        const output = 'Tests: 10 passed, 0 failed, 10 total\nAll tests passed\nStatements   : 62%\nBranches     : 50%\nFunctions    : 70%\nLines        : 62%';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        // Should report TESTS PASSED (not coverage failure)
        assert.ok(result.stdout.includes('TESTS PASSED'), 'Should pass with 62% coverage on light tier (threshold: 60%)');
        assert.ok(!result.stdout.includes('COVERAGE WARNING'), 'Should not warn about coverage');
    });

    // TC-21: Standard workflow, 75% coverage fails (AC-003-02)
    it('TC-21: standard workflow with 75% coverage fails threshold (80%)', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation',
                current_phase_index: 5,
                sizing: { effective_intensity: 'standard' }
            },
            phases: { '06-implementation': { status: 'in_progress' } }
        });
        hookPath = installHook();

        const output = 'Tests: 10 passed, 0 failed, 10 total\nAll tests passed\nStatements   : 75%\nBranches     : 70%\nFunctions    : 80%\nLines        : 75%';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('COVERAGE'), 'Should report coverage issue for 75% on standard (threshold: 80%)');
    });

    // TC-22: Epic workflow, 90% coverage fails (AC-003-03)
    it('TC-22: epic workflow with 90% coverage fails threshold (95%)', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation',
                current_phase_index: 5,
                sizing: { effective_intensity: 'epic' }
            },
            phases: { '06-implementation': { status: 'in_progress' } }
        });
        hookPath = installHook();

        const output = 'Tests: 10 passed, 0 failed, 10 total\nAll tests passed\nStatements   : 90%\nBranches     : 85%\nFunctions    : 92%\nLines        : 90%';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('COVERAGE'), 'Should report coverage issue for 90% on epic (threshold: 95%)');
    });

    // TC-23: Fix workflow (no sizing), 75% fails (AC-003-05, AC-NFR-002-01)
    it('TC-23: fix workflow without sizing with 75% coverage fails (standard default: 80%)', async () => {
        cleanupTestEnv();
        setupTestEnv({
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            active_workflow: {
                type: 'fix',
                current_phase: '06-implementation',
                current_phase_index: 3
                // No sizing block — fix workflows have no Phase 00 sizing
            },
            phases: { '06-implementation': { status: 'in_progress' } }
        });
        hookPath = installHook();

        const output = 'Tests: 10 passed, 0 failed, 10 total\nAll tests passed\nStatements   : 75%\nBranches     : 70%\nFunctions    : 80%\nLines        : 75%';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('COVERAGE'), 'Should report coverage issue for 75% on fix workflow (standard default: 80%)');
    });

    // TC-24: Scalar config backward compat, 82% passes (AC-003-04, AC-NFR-001-01)
    it('TC-24: scalar config with 82% coverage passes (backward compat)', async () => {
        cleanupTestEnv();
        // Use a custom iteration-requirements with scalar coverage
        const customState = {
            current_phase: '06-implementation',
            iteration_enforcement: { enabled: true },
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation',
                current_phase_index: 5,
                sizing: { effective_intensity: 'light' }
            },
            phases: { '06-implementation': { status: 'in_progress' } }
        };
        setupTestEnv(customState);
        hookPath = installHook();

        // Overwrite the iteration-requirements.json with scalar values
        const testDir = getTestDir();
        const configPath = path.join(testDir, '.claude', 'hooks', 'config', 'iteration-requirements.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.phase_requirements['06-implementation'].test_iteration.success_criteria.min_coverage_percent = 80;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        const output = 'Tests: 10 passed, 0 failed, 10 total\nAll tests passed\nStatements   : 82%\nBranches     : 80%\nFunctions    : 85%\nLines        : 82%';
        const result = await runHook(hookPath, bashTestInput('npm test', output));
        assert.equal(result.code, 0);
        assert.ok(result.stdout.includes('TESTS PASSED'), 'Should pass with 82% on scalar 80 threshold');
    });
});

// ---------------------------------------------------------------------------
// BUG-0054-GH-52: Behavioral validation tests (prose and documentation)
// Traces to: FR-005 (AC-005-01, AC-005-02), FR-006 (AC-006-01 through AC-006-03), NFR-003
// ---------------------------------------------------------------------------

describe('behavioral: prose and documentation (BUG-0054-GH-52)', () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

    // TC-25: Constitution Article II text unchanged (AC-005-01)
    it('TC-25: Constitution Article II original threshold text is unchanged', () => {
        const constitutionPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
        const content = fs.readFileSync(constitutionPath, 'utf8');
        assert.ok(content.includes('Unit test coverage: >=80%'),
            'Article II must still contain "Unit test coverage: >=80%"');
        assert.ok(content.includes('Integration test coverage: >=70%'),
            'Article II must still contain "Integration test coverage: >=70%"');
    });

    // TC-26: Constitution enforcement note present (AC-005-02)
    it('TC-26: Constitution has enforcement note about intensity-based tiers', () => {
        const constitutionPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
        const content = fs.readFileSync(constitutionPath, 'utf8');
        // The note should be after Article II but before Article III
        const articleIIIdx = content.indexOf('### Article II');
        const articleIIIIdx = content.indexOf('### Article III');
        const sectionBetween = content.substring(articleIIIdx, articleIIIIdx);
        assert.ok(
            sectionBetween.includes('intensity') || sectionBetween.includes('tiered'),
            'Article II section must contain enforcement note about intensity-based or tiered thresholds'
        );
    });

    // TC-27: Software developer agent updated (AC-006-01)
    it('TC-27: Software developer agent does not hardcode 80% as absolute gate requirement', () => {
        const agentPath = path.join(projectRoot, 'src', 'claude', 'agents', '05-software-developer.md');
        const content = fs.readFileSync(agentPath, 'utf8');
        // Check gate-related sections for hardcoded 80%
        // The agent may still reference 80% in non-gate contexts (e.g., as default),
        // but should NOT have it as the sole absolute requirement
        const gateSection = content.includes('intensity') || content.includes('tiered') || content.includes('effective_intensity');
        assert.ok(gateSection,
            'Agent 05 must reference intensity-based or tiered coverage thresholds');
    });

    // TC-28: Quality loop agent updated (AC-006-02)
    it('TC-28: Quality loop agent GATE-16 references intensity tiers', () => {
        const agentPath = path.join(projectRoot, 'src', 'claude', 'agents', '16-quality-loop-engineer.md');
        const content = fs.readFileSync(agentPath, 'utf8');
        assert.ok(
            content.includes('intensity') || content.includes('tiered'),
            'Agent 16 must reference intensity-based or tiered coverage thresholds in GATE-16'
        );
    });

    // TC-29: Integration tester agent updated (AC-006-03)
    it('TC-29: Integration tester agent does not hardcode 70% as absolute gate requirement', () => {
        const agentPath = path.join(projectRoot, 'src', 'claude', 'agents', '06-integration-tester.md');
        const content = fs.readFileSync(agentPath, 'utf8');
        assert.ok(
            content.includes('intensity') || content.includes('tiered'),
            'Agent 06 must reference intensity-based or tiered coverage thresholds'
        );
    });

    // TC-30: No new dependencies (NFR-003)
    it('TC-30: package.json has no new dependencies', () => {
        const pkgPath = path.join(projectRoot, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        // Verify no unexpected deps were added — check specific known deps
        assert.ok(!pkg.dependencies || !pkg.dependencies['coverage-threshold'],
            'No new coverage-threshold dependency should exist');
        // The fix should not add any new devDependencies either
        const devDeps = Object.keys(pkg.devDependencies || {});
        // Baseline check: no c8, istanbul, or similar coverage tools added
        assert.ok(!devDeps.includes('c8'), 'c8 should not be added as devDependency');
        assert.ok(!devDeps.includes('istanbul'), 'istanbul should not be added as devDependency');
    });
});

// ---------------------------------------------------------------------------
// BUG-0007: Backward Compatibility Tests
// ---------------------------------------------------------------------------

describe('backward compatibility (BUG-0007)', () => {
    // TC-INC-17: Module exports unchanged (plus new parseTestResult)
    it('exports all existing functions plus parseTestResult (AC-4.3)', () => {
        const mod = require(hookSrcPath);
        assert.equal(typeof mod.check, 'function', 'check must be exported');
        assert.equal(typeof mod.normalizeErrorForComparison, 'function',
            'normalizeErrorForComparison must be exported');
        assert.equal(typeof mod.isIdenticalFailure, 'function',
            'isIdenticalFailure must be exported');
        assert.equal(typeof mod.parseCoverage, 'function',
            'parseCoverage must be exported');
        assert.equal(typeof mod.parseTestResult, 'function',
            'parseTestResult must be exported (new)');
    });
});
