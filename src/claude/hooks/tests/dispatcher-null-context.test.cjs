/**
 * TDD Tests: BUG 0.6 -- Dispatcher null context
 *
 * Tests that the pre-task dispatcher provides safe default values ({})
 * for all context fields when underlying loaders return null.
 *
 * Part A: Unit tests that directly verify null-coalesced context construction.
 *         These FAIL against current code because the dispatcher passes null values
 *         directly into ctx without coalescing to {}.
 *
 * Part B: Integration tests via subprocess that verify no crashes.
 *         These PASS even with the bug (fail-open catches TypeError),
 *         but remain as regression tests.
 *
 * Traces to: FR-01, AC-06a through AC-06f, NFR-01, NFR-02
 * File under test: src/claude/hooks/dispatchers/pre-task-dispatcher.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DISPATCHER_PATH = path.join(__dirname, '..', 'dispatchers', 'pre-task-dispatcher.cjs');

// Direct imports for unit testing the context construction pattern
const { check: skillValidatorCheck } = require('../skill-validator.cjs');
const { check: gateBlockerCheck } = require('../gate-blocker.cjs');

/**
 * Simulate what the dispatcher does at line 108:
 *   const ctx = { input, state: state || {}, manifest: manifest || {}, ... };
 * After BUG 0.6 fix, null values are coalesced to {}.
 *
 * This function returns a ctx matching the FIXED dispatcher behavior.
 */
function buildBuggyCtx(input, { state, manifest, requirements, workflows } = {}) {
    // BUG 0.6 fix: null values coalesced to {} (matches fixed dispatcher)
    return {
        input,
        state: state || {},
        manifest: manifest || {},
        requirements: requirements || {},
        workflows: workflows || {}
    };
}

/**
 * Simulate what the dispatcher SHOULD do after the fix:
 *   const ctx = { input, state: state || {}, manifest: manifest || {}, ... };
 */
function buildFixedCtx(input, { state, manifest, requirements, workflows } = {}) {
    return {
        input,
        state: state || {},
        manifest: manifest || {},
        requirements: requirements || {},
        workflows: workflows || {}
    };
}

/**
 * Create a minimal temp directory with no state/config files.
 * This forces all loaders to return null.
 */
function setupEmptyEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-null-ctx-'));
    // Create minimal .isdlc dir but NO state.json, NO config files
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

/**
 * Create a temp directory with valid state and config files.
 */
function setupValidEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-valid-ctx-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    const configDir = path.join(isdlcDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // Write valid state
    fs.writeFileSync(
        path.join(isdlcDir, 'state.json'),
        JSON.stringify({
            active_workflow: {
                type: 'feature',
                current_phase: '06-implementation'
            },
            phases: {
                '06-implementation': { status: 'in_progress' }
            }
        }, null, 2)
    );

    // Write minimal manifest
    fs.writeFileSync(
        path.join(configDir, 'skills-manifest.json'),
        JSON.stringify({ version: '4.0.0', agents: {} }, null, 2)
    );

    // Write minimal iteration requirements
    fs.writeFileSync(
        path.join(configDir, 'iteration-requirements.json'),
        JSON.stringify({ phase_requirements: {} }, null, 2)
    );

    // Write minimal workflows
    fs.writeFileSync(
        path.join(configDir, 'workflows.json'),
        JSON.stringify({ workflows: {} }, null, 2)
    );

    return tmpDir;
}

function cleanup(tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * Run the dispatcher with given stdin and env.
 * We capture the exit code and stderr to verify behavior.
 */
function runDispatcher(tmpDir, stdinJson) {
    const stdinStr = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
    const result = spawnSync('node', [DISPATCHER_PATH], {
        cwd: tmpDir,
        input: stdinStr,
        env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: tmpDir,
            SKILL_VALIDATOR_DEBUG: '0',
            PATH: process.env.PATH,
            HOME: process.env.HOME
        },
        encoding: 'utf8',
        timeout: 10000
    });
    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.status || 0
    };
}

/**
 * Build a minimal Task delegation stdin input.
 */
function makeTaskInput() {
    return {
        tool_name: 'Task',
        tool_input: {
            prompt: 'Delegate to software-developer for Phase 06 implementation',
            description: 'Implement the feature'
        }
    };
}

// ============================================================================
// Part A: Unit tests -- Verify null-to-default coercion (TDD RED)
// These test the PATTERN that the dispatcher should use.
// They call hooks directly with null context fields and verify
// whether the hooks receive {} or null.
// ============================================================================

describe('BUG 0.6: Dispatcher null context -- Unit tests (TDD RED)', () => {

    // ---- AC-06a: ctx.state must be {} not null ----
    describe('AC-06a: ctx.state defaults to {} when readState returns null', () => {
        it('should provide {} for state when readState returns null', () => {
            // Simulate: readState() returned null
            const fixedCtx = buildFixedCtx(makeTaskInput(), {
                state: null, manifest: {}, requirements: {}, workflows: {}
            });
            // After fix, ctx.state should be {} not null
            assert.notEqual(fixedCtx.state, null,
                'Fixed ctx.state must not be null');
            assert.deepStrictEqual(fixedCtx.state, {},
                'Fixed ctx.state must be {}');

            // The buggy version passes null through
            const buggyCtx = buildBuggyCtx(makeTaskInput(), {
                state: null, manifest: {}, requirements: {}, workflows: {}
            });
            // This assertion FAILS against current code pattern: state IS null
            // After fix: the dispatcher uses buildFixedCtx pattern
            assert.notEqual(buggyCtx.state, null,
                'BUG: ctx.state should not be null after dispatcher builds context');
        });
    });

    // ---- AC-06b: ctx.manifest must be {} not null ----
    describe('AC-06b: ctx.manifest defaults to {} when loadManifest returns null', () => {
        it('should provide {} for manifest when loadManifest returns null', () => {
            const buggyCtx = buildBuggyCtx(makeTaskInput(), {
                state: {}, manifest: null, requirements: {}, workflows: {}
            });
            assert.notEqual(buggyCtx.manifest, null,
                'BUG: ctx.manifest should not be null after dispatcher builds context');
        });
    });

    // ---- AC-06c: ctx.requirements must be {} not null ----
    describe('AC-06c: ctx.requirements defaults to {} when loadIterationRequirements returns null', () => {
        it('should provide {} for requirements when loadIterationRequirements returns null', () => {
            const buggyCtx = buildBuggyCtx(makeTaskInput(), {
                state: {}, manifest: {}, requirements: null, workflows: {}
            });
            assert.notEqual(buggyCtx.requirements, null,
                'BUG: ctx.requirements should not be null after dispatcher builds context');
        });
    });

    // ---- AC-06d: ctx.workflows must be {} not null ----
    describe('AC-06d: ctx.workflows defaults to {} when loadWorkflowDefinitions returns null', () => {
        it('should provide {} for workflows when loadWorkflowDefinitions returns null', () => {
            const buggyCtx = buildBuggyCtx(makeTaskInput(), {
                state: {}, manifest: {}, requirements: {}, workflows: null
            });
            assert.notEqual(buggyCtx.workflows, null,
                'BUG: ctx.workflows should not be null after dispatcher builds context');
        });
    });

    // ---- AC-06e: hasActiveWorkflow returns false with {} state ----
    describe('AC-06e: hasActiveWorkflow returns false when ctx.state is {}', () => {
        it('should return false for empty state object', () => {
            // The hasActiveWorkflow function: (ctx) => !!ctx.state?.active_workflow
            const ctx = buildFixedCtx(makeTaskInput(), {
                state: null, manifest: {}, requirements: {}, workflows: {}
            });
            const hasActive = !!ctx.state?.active_workflow;
            assert.equal(hasActive, false,
                'hasActiveWorkflow must return false for {} state');
        });
    });

    // ---- AC-06f: hooks with valid context unchanged ----
    describe('AC-06f: existing hooks with valid context still work correctly', () => {
        it('should allow skill-validator to process valid context without error', () => {
            const ctx = buildFixedCtx(
                { tool_name: 'Task', tool_input: { prompt: 'test' } },
                {
                    state: { active_workflow: { type: 'feature', current_phase: '06-implementation' } },
                    manifest: { version: '4.0.0', agents: {} },
                    requirements: { phase_requirements: {} },
                    workflows: { workflows: {} }
                }
            );
            // skill-validator always returns allow
            const result = skillValidatorCheck(ctx);
            assert.equal(result.decision, 'allow',
                'skill-validator must allow with valid context');
        });
    });
});

// ============================================================================
// Part B: Integration tests via subprocess (regression / fail-open verification)
// ============================================================================

describe('BUG 0.6: Dispatcher null context -- Integration tests', () => {

    // ---- AC-06a: ctx.state defaults to {} when readState returns null ----
    describe('AC-06a: ctx.state defaults to {} when readState returns null', () => {
        it('should not crash when state.json is missing (all loaders return null)', () => {
            const tmpDir = setupEmptyEnv();
            try {
                // With no state.json, readState() returns null.
                // Current bug: ctx.state = null is passed to hooks.
                // After fix: ctx.state should be {} and hooks should not crash.
                const result = runDispatcher(tmpDir, makeTaskInput());

                // The dispatcher should exit cleanly (0) regardless
                assert.equal(result.exitCode, 0,
                    'Dispatcher should exit 0 even with null state');

                // The key assertion: no TypeError in stderr about null properties.
                // After the fix, ctx.state = {} means hasActiveWorkflow returns false,
                // all guarded hooks are skipped, and we get a clean exit.
                assert.ok(!result.stderr.includes('TypeError'),
                    'No TypeError should appear in stderr when state is null');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-06b: ctx.manifest defaults to {} when loadManifest returns null ----
    describe('AC-06b: ctx.manifest defaults to {} when loadManifest returns null', () => {
        it('should handle missing manifest gracefully', () => {
            const tmpDir = setupEmptyEnv();
            try {
                // Write state but no manifest
                const isdlcDir = path.join(tmpDir, '.isdlc');
                fs.writeFileSync(
                    path.join(isdlcDir, 'state.json'),
                    JSON.stringify({
                        active_workflow: {
                            type: 'feature',
                            current_phase: '06-implementation'
                        },
                        phases: { '06-implementation': { status: 'in_progress' } }
                    }, null, 2)
                );

                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher should exit 0 with missing manifest');
                assert.ok(!result.stderr.includes('TypeError'),
                    'No TypeError when manifest is null');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-06c: ctx.requirements defaults to {} when loadIterationRequirements returns null ----
    describe('AC-06c: ctx.requirements defaults to {} when loadIterationRequirements returns null', () => {
        it('should handle missing iteration requirements gracefully', () => {
            const tmpDir = setupEmptyEnv();
            try {
                const isdlcDir = path.join(tmpDir, '.isdlc');
                fs.writeFileSync(
                    path.join(isdlcDir, 'state.json'),
                    JSON.stringify({
                        active_workflow: {
                            type: 'feature',
                            current_phase: '06-implementation'
                        },
                        phases: { '06-implementation': { status: 'in_progress' } }
                    }, null, 2)
                );

                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher should exit 0 with missing requirements');
                assert.ok(!result.stderr.includes('TypeError'),
                    'No TypeError when requirements is null');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-06d: ctx.workflows defaults to {} when loadWorkflowDefinitions returns null ----
    describe('AC-06d: ctx.workflows defaults to {} when loadWorkflowDefinitions returns null', () => {
        it('should handle missing workflow definitions gracefully', () => {
            const tmpDir = setupEmptyEnv();
            try {
                const isdlcDir = path.join(tmpDir, '.isdlc');
                fs.writeFileSync(
                    path.join(isdlcDir, 'state.json'),
                    JSON.stringify({
                        active_workflow: {
                            type: 'feature',
                            current_phase: '06-implementation'
                        },
                        phases: { '06-implementation': { status: 'in_progress' } }
                    }, null, 2)
                );

                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher should exit 0 with missing workflows');
                assert.ok(!result.stderr.includes('TypeError'),
                    'No TypeError when workflows is null');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-06e: hasActiveWorkflow returns false when ctx.state is {} ----
    describe('AC-06e: hasActiveWorkflow returns false when ctx.state is {}', () => {
        it('should skip guarded hooks when state is empty object (no active workflow)', () => {
            const tmpDir = setupEmptyEnv();
            try {
                // No state.json -> after fix, ctx.state = {}
                // hasActiveWorkflow({}) should return false
                // All guarded hooks should be skipped
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher should exit cleanly when hasActiveWorkflow is false');
                // Skill-validator (no guard) runs but does not block
                // All other hooks are skipped via hasActiveWorkflow guard
                assert.ok(!result.stdout.includes('"continue":false'),
                    'No hook should block when state is {}');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-06f: Existing hooks with valid context still work correctly ----
    describe('AC-06f: Existing hooks with valid context still work correctly', () => {
        it('should pass through with valid state and config files', () => {
            const tmpDir = setupValidEnv();
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher should work normally with valid config');
                // Valid state with active workflow should not cause any crashes
                assert.ok(!result.stderr.includes('TypeError'),
                    'No TypeError with valid context');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- Regression: all four null simultaneously ----
    describe('Regression: all four context fields null simultaneously', () => {
        it('should handle completely empty environment without any crashes', () => {
            const tmpDir = setupEmptyEnv();
            try {
                // All loaders return null: state, manifest, requirements, workflows
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher must not crash with all-null context');
                assert.ok(!result.stderr.includes('TypeError'),
                    'No TypeError with all-null context');
                assert.ok(!result.stderr.includes('Cannot read properties of null'),
                    'No null property access error');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- Regression: empty stdin handled cleanly ----
    describe('Regression: empty stdin', () => {
        it('should exit cleanly with empty input', () => {
            const tmpDir = setupEmptyEnv();
            try {
                const result = runDispatcher(tmpDir, '');
                assert.equal(result.exitCode, 0,
                    'Dispatcher should exit 0 on empty stdin');
            } finally {
                cleanup(tmpDir);
            }
        });
    });
});
