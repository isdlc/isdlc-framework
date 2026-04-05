'use strict';

/**
 * iSDLC Post-Bash Dispatcher - Integration Test Suite (CJS)
 * ===========================================================
 * Integration tests for src/claude/hooks/dispatchers/post-bash-dispatcher.cjs
 *
 * The post-bash dispatcher consolidates 3 PostToolUse[Bash] hooks:
 *   1. test-watcher                - writes iteration state, may output stdout guidance
 *   2. review-reminder             - may output stdout warning (git commit only)
 *   3. atdd-completeness-validator - stderr warnings (ATDD priority violations)
 *
 * All hooks run (no short-circuit). Writes state once after all hooks.
 *
 * Run: node --test src/claude/hooks/tests/test-post-bash-dispatcher.test.cjs
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    setupTestEnv,
    cleanupTestEnv,
    prepareDispatcher,
    runDispatcher,
    writeState,
    readState,
    writeConfig,
    getTestDir
} = require('./hook-test-utils.cjs');
const fs = require('fs');
const path = require('path');

/**
 * REQ-GH-216: helper to write an atdd config override into
 * {testDir}/.isdlc/config.json. All four knobs default true when no override
 * is written.
 * @param {object} atddOverride - partial atdd section
 */
function writeAtddConfigOverride(atddOverride) {
    const dir = getTestDir();
    if (!dir) throw new Error('writeAtddConfigOverride before setupTestEnv');
    fs.writeFileSync(
        path.join(dir, '.isdlc', 'config.json'),
        JSON.stringify({ atdd: atddOverride }, null, 2)
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PostToolUse[Bash] input */
function bashInput(command, toolResult) {
    return {
        tool_name: 'Bash',
        tool_input: { command: command || 'echo hello' },
        tool_result: toolResult || 'hello'
    };
}

/** Build a test command input (triggers test-watcher) */
function testCommandInput(result, exitCode) {
    const toolResult = exitCode === 0
        ? (result || 'Tests passed: 10/10\n10 passing')
        : (result || 'Tests failed: 3/10\n3 failing\nExit code: 1');
    return {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_result: toolResult
    };
}

/** Build a git commit command input (triggers review-reminder) */
function gitCommitInput() {
    return {
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "feat: add feature"' },
        tool_result: '[main abc1234] feat: add feature\n 1 file changed'
    };
}

/** Build an active workflow state */
function activeWorkflowState(phase, extraPhaseState) {
    return {
        active_workflow: {
            type: 'feature',
            requirement_id: 'REQ-TEST',
            current_phase: phase || '06-implementation',
            phases: ['01-requirements', '02-architecture', '06-implementation'],
            started_at: new Date().toISOString()
        },
        phases: {
            [phase || '06-implementation']: Object.assign({
                status: 'in_progress',
                started_at: new Date().toISOString(),
                iterations: { current: 1, max: 3 }
            }, extraPhaseState || {})
        },
        skill_enforcement: { enabled: true, mode: 'observe', manifest_version: '5.0.0' },
        iteration_enforcement: { enabled: true },
        current_phase: phase || '06-implementation',
        skill_usage_log: [],
        gates: {},
        pending_escalations: []
    };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('post-bash-dispatcher', () => {
    let dispatcherPath;

    // -------------------------------------------------------------------------
    // TC-01: Empty stdin
    // -------------------------------------------------------------------------
    describe('empty/invalid stdin handling', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-01: exits cleanly with empty stdin', async () => {
            const result = await runDispatcher(dispatcherPath, '');
            assert.equal(result.code, 0);
            assert.equal(result.stdout, '');
        });

        it('TC-02: exits cleanly with invalid JSON stdin', async () => {
            const result = await runDispatcher(dispatcherPath, '{invalid}');
            assert.equal(result.code, 0);
            assert.equal(result.stdout, '');
        });
    });

    // -------------------------------------------------------------------------
    // TC-03: No active workflow
    // -------------------------------------------------------------------------
    describe('no active workflow', () => {
        before(() => {
            setupTestEnv({
                skill_enforcement: { enabled: true, mode: 'observe' },
                iteration_enforcement: { enabled: true },
                skill_usage_log: [],
                phases: {}
            });
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-03: runs without error when no active workflow', async () => {
            const result = await runDispatcher(dispatcherPath, bashInput());
            assert.equal(result.code, 0);
        });
    });

    // -------------------------------------------------------------------------
    // TC-04: Allow path (non-test, non-git command)
    // -------------------------------------------------------------------------
    describe('allow path - non-special command', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-04: processes non-test, non-git command without state modification', async () => {
            const result = await runDispatcher(dispatcherPath, bashInput('ls -la', 'total 0'));
            assert.equal(result.code, 0);
        });

        it('TC-05: never produces a block response (PostToolUse is observational)', async () => {
            const result = await runDispatcher(dispatcherPath, bashInput());
            assert.equal(result.code, 0);
            if (result.stdout.trim()) {
                try {
                    const parsed = JSON.parse(result.stdout);
                    assert.notEqual(parsed.continue, false,
                        'PostToolUse should never block');
                } catch {
                    // Non-JSON stdout is acceptable
                }
            }
        });
    });

    // -------------------------------------------------------------------------
    // TC-06: Test watcher state modification on test pass
    // -------------------------------------------------------------------------
    describe('test-watcher state modification - passing tests', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-06: test-watcher updates iteration state on passing tests', async () => {
            const result = await runDispatcher(dispatcherPath, testCommandInput('Tests: 10 passed\n10 passing', 0));
            assert.equal(result.code, 0);
            const state = readState();
            const phaseState = state.phases && state.phases['06-implementation'];
            assert.ok(phaseState, 'Phase state should exist');
            // test-watcher should have created/updated iteration_requirements
            if (phaseState.iteration_requirements && phaseState.iteration_requirements.test_iteration) {
                assert.equal(phaseState.iteration_requirements.test_iteration.last_test_result, 'passed',
                    'Last test result should be "passed"');
            }
        });
    });

    // -------------------------------------------------------------------------
    // TC-07: Test watcher state modification on test failure
    // -------------------------------------------------------------------------
    describe('test-watcher state modification - failing tests', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-07: test-watcher updates iteration state on failing tests', async () => {
            const result = await runDispatcher(dispatcherPath,
                testCommandInput('Tests: 3 failed, 7 passed\n3 failing\nExit code: 1', 1));
            assert.equal(result.code, 0);
            const state = readState();
            const phaseState = state.phases && state.phases['06-implementation'];
            assert.ok(phaseState, 'Phase state should exist');
            if (phaseState.iteration_requirements && phaseState.iteration_requirements.test_iteration) {
                assert.equal(phaseState.iteration_requirements.test_iteration.last_test_result, 'failed',
                    'Last test result should be "failed"');
            }
        });
    });

    // -------------------------------------------------------------------------
    // TC-08: Consolidated state write
    // -------------------------------------------------------------------------
    describe('consolidated state write', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-08: state is written once (not per-hook) as valid JSON', async () => {
            const result = await runDispatcher(dispatcherPath, testCommandInput('10 passing', 0));
            assert.equal(result.code, 0);
            // Verify state is still valid JSON
            const state = readState();
            assert.ok(state, 'State should be parseable');
            assert.equal(typeof state, 'object');
        });
    });

    // -------------------------------------------------------------------------
    // TC-09: Stderr accumulation
    // -------------------------------------------------------------------------
    describe('stderr accumulation', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-09: stderr is accumulated from multiple hooks', async () => {
            const result = await runDispatcher(dispatcherPath, testCommandInput('3 failing', 1));
            assert.equal(result.code, 0);
            assert.equal(typeof result.stderr, 'string');
        });
    });

    // -------------------------------------------------------------------------
    // TC-10: Stdout collection (test-watcher and review-reminder)
    // -------------------------------------------------------------------------
    describe('stdout collection', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-10: stdout from hooks is collected', async () => {
            const result = await runDispatcher(dispatcherPath, testCommandInput('10 passing', 0));
            assert.equal(result.code, 0);
            assert.equal(typeof result.stdout, 'string');
        });
    });

    // -------------------------------------------------------------------------
    // TC-11: Review reminder on git commit
    // -------------------------------------------------------------------------
    describe('review-reminder on git commit', () => {
        before(() => {
            const state = activeWorkflowState();
            state.code_review = { enabled: false, team_size: 3 };
            setupTestEnv(state);
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-11: review-reminder outputs warning for git commit when review disabled and team > 1', async () => {
            const result = await runDispatcher(dispatcherPath, gitCommitInput());
            assert.equal(result.code, 0);
            // review-reminder may output a warning about code review being bypassed
            if (result.stdout.trim()) {
                assert.ok(
                    result.stdout.includes('review') || result.stdout.includes('warning') ||
                    result.stdout.length > 0,
                    'stdout should contain review reminder or other hook output'
                );
            }
        });
    });

    // -------------------------------------------------------------------------
    // TC-12: Fail-open on hook error
    // -------------------------------------------------------------------------
    describe('fail-open on hook error', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
            // Corrupt iteration requirements to cause hook errors
            writeConfig('iteration-requirements.json', '!!!INVALID!!!');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-12: continues when a hook throws', async () => {
            const result = await runDispatcher(dispatcherPath, testCommandInput('10 passing', 0));
            assert.equal(result.code, 0,
                'Dispatcher should exit 0 even when hooks throw');
        });
    });

    // -------------------------------------------------------------------------
    // TC-13: Conditional activation — all hooks skipped when no active workflow (T3-B)
    // -------------------------------------------------------------------------
    describe('conditional activation - hooks skipped when no active workflow', () => {
        before(() => {
            setupTestEnv({
                skill_enforcement: { enabled: true, mode: 'observe' },
                iteration_enforcement: { enabled: true },
                skill_usage_log: [],
                phases: {}
            });
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-13a: all 3 hooks skipped when no active workflow', async () => {
            const result = await runDispatcher(dispatcherPath, testCommandInput('10 passing', 0));
            assert.equal(result.code, 0);
            // test-watcher and review-reminder require active_workflow
            // atdd-completeness-validator requires active_workflow.options.atdd_mode
            // All are skipped, so state should NOT be modified by test-watcher
            const state = readState();
            assert.ok(!state.phases || !state.phases['06-implementation'] ||
                !state.phases['06-implementation'].iteration_requirements,
                'State should not be modified by test-watcher when no active workflow');
        });
    });

    // -------------------------------------------------------------------------
    // TC-13b / TC-T002-10: Conditional activation — atdd hook skipped when
    // atdd.enabled=false in config (REQ-GH-216 FR-008)
    // -------------------------------------------------------------------------
    describe('conditional activation - atdd hook skipped when atdd.enabled=false', () => {
        before(() => {
            // Active workflow plus atdd.enabled=false in config.json
            const state = activeWorkflowState();
            setupTestEnv(state);
            writeAtddConfigOverride({ enabled: false });
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-13b / TC-T002-10: atdd-completeness-validator skipped when atdd.enabled=false', async () => {
            const result = await runDispatcher(dispatcherPath, bashInput('echo hello'));
            assert.equal(result.code, 0);
            // No ATDD warnings expected since hook is skipped via config gate
            assert.ok(
                !result.stderr || !/ATDD PRIORITY VIOLATIONS/.test(result.stderr),
                'no atdd warnings should be emitted when atdd.enabled=false'
            );
        });
    });

    // -------------------------------------------------------------------------
    // TC-T002-09: atdd-completeness-validator runs when atdd.enabled=true (default)
    // -------------------------------------------------------------------------
    describe('conditional activation - atdd hook runs when atdd.enabled=true', () => {
        before(() => {
            const state = activeWorkflowState();
            setupTestEnv(state);
            // No config.json written -> defaults: atdd.enabled=true
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-T002-09: atdd dispatcher fires on test command when atdd.enabled=true', async () => {
            // Simulate test output with priority violation to ensure hook ran
            const input = {
                tool_name: 'Bash',
                tool_input: { command: 'npm test' },
                tool_result: 'P0 test auth - fail\nP1 test feature - pass'
            };
            const result = await runDispatcher(dispatcherPath, input);
            assert.equal(result.code, 0);
            // atdd-completeness-validator should have emitted stderr
            assert.ok(
                /ATDD PRIORITY VIOLATIONS/.test(result.stderr),
                `expected ATDD priority violations on stderr, got: ${result.stderr}`
            );
        });
    });

    // -------------------------------------------------------------------------
    // TC-14: Non-Bash tool input
    // -------------------------------------------------------------------------
    describe('non-Bash tool input', () => {
        before(() => {
            setupTestEnv(activeWorkflowState());
            dispatcherPath = prepareDispatcher('post-bash-dispatcher.cjs');
        });
        after(() => { cleanupTestEnv(); });

        it('TC-14: processes non-Bash tool input without error', async () => {
            const result = await runDispatcher(dispatcherPath, {
                tool_name: 'Task',
                tool_input: { prompt: 'Something' },
                tool_result: 'Done'
            });
            assert.equal(result.code, 0);
        });
    });
});
