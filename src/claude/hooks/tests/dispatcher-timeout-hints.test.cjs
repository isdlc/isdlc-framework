/**
 * TDD Tests: BUG 0.12 -- Phase timeout advisory-only (no enforcement)
 *
 * Tests that when a phase timeout is exceeded, the dispatcher emits a
 * structured JSON degradation hint on stderr alongside the human-readable
 * warning. The hint includes type, phase, elapsed, limit, and recommended
 * actions.
 *
 * TDD RED: These tests FAIL against current code because lines 115-119
 * only emit a text warning via console.error() and logHookEvent().
 * No structured JSON hint is emitted.
 *
 * Traces to: FR-04, AC-12a through AC-12e, NFR-01
 * File under test: src/claude/hooks/dispatchers/pre-task-dispatcher.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DISPATCHER_PATH = path.join(__dirname, '..', 'dispatchers', 'pre-task-dispatcher.cjs');

/**
 * Create a temp environment with state that has an expired phase timeout.
 * @param {number} timeoutMinutes - The timeout limit in minutes
 * @param {number} minutesAgo - How many minutes ago the phase started
 */
function setupTimeoutEnv(timeoutMinutes, minutesAgo) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-timeout-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    const configDir = path.join(isdlcDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // Calculate started_at
    const startedAt = new Date(Date.now() - (minutesAgo * 60000)).toISOString();

    // Write state with an active phase that started in the past
    fs.writeFileSync(
        path.join(isdlcDir, 'state.json'),
        JSON.stringify({
            active_workflow: {
                type: 'feature',
                current_phase: '01-requirements'
            },
            phases: {
                '01-requirements': {
                    status: 'in_progress',
                    started_at: startedAt
                }
            }
        }, null, 2)
    );

    // Write iteration requirements with timeout_minutes
    fs.writeFileSync(
        path.join(configDir, 'iteration-requirements.json'),
        JSON.stringify({
            phase_requirements: {
                '01-requirements': {
                    timeout_minutes: timeoutMinutes
                }
            }
        }, null, 2)
    );

    // Write minimal manifest
    fs.writeFileSync(
        path.join(configDir, 'skills-manifest.json'),
        JSON.stringify({ version: '4.0.0', agents: {} }, null, 2)
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

function makeTaskInput() {
    return {
        tool_name: 'Task',
        tool_input: {
            prompt: 'Continue working on requirements',
            description: 'Requirements work'
        }
    };
}

/**
 * Extract the DEGRADATION_HINT JSON from stderr output.
 * Returns the parsed JSON object or null if not found.
 */
function extractDegradationHint(stderr) {
    const lines = stderr.split('\n');
    for (const line of lines) {
        const match = line.match(/DEGRADATION_HINT:\s*(\{.*\})/);
        if (match) {
            try {
                return JSON.parse(match[1]);
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

// ============================================================================
// BUG 0.12: Phase timeout advisory-only tests
// ============================================================================

describe('BUG 0.12: Phase timeout structured degradation hints', () => {

    // ---- AC-12a: Structured JSON emitted in stderr when timeout exceeded ----
    describe('AC-12a: structured JSON in stderr when timeout exceeded', () => {
        it('should emit DEGRADATION_HINT JSON in stderr when phase timeout exceeded', () => {
            // Phase started 120 minutes ago, timeout is 5 minutes -> exceeded
            const tmpDir = setupTimeoutEnv(5, 120);
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher must exit 0 (fail-open)');

                // The stderr must contain a DEGRADATION_HINT line with valid JSON
                assert.ok(result.stderr.includes('DEGRADATION_HINT'),
                    'stderr must contain DEGRADATION_HINT when timeout exceeded');

                const hint = extractDegradationHint(result.stderr);
                assert.ok(hint !== null,
                    'DEGRADATION_HINT must contain parseable JSON');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-12b: JSON hint includes type, phase, elapsed, limit, actions ----
    describe('AC-12b: JSON hint includes required fields', () => {
        it('should include type, phase, elapsed, limit, and actions in hint', () => {
            const tmpDir = setupTimeoutEnv(5, 120);
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                const hint = extractDegradationHint(result.stderr);
                assert.ok(hint !== null, 'Hint must be parseable');

                assert.equal(hint.type, 'timeout_degradation',
                    'hint.type must be timeout_degradation');
                assert.equal(hint.phase, '01-requirements',
                    'hint.phase must match the current phase');
                assert.equal(typeof hint.elapsed, 'number',
                    'hint.elapsed must be a number');
                assert.ok(hint.elapsed >= 120,
                    'hint.elapsed must reflect actual elapsed time');
                assert.equal(hint.limit, 5,
                    'hint.limit must match the configured timeout_minutes');
                assert.ok(Array.isArray(hint.actions),
                    'hint.actions must be an array');
                assert.ok(hint.actions.length > 0,
                    'hint.actions must not be empty');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-12c: Actions include reduce_debate_rounds and skip_optional_steps ----
    describe('AC-12c: actions include required recommendations', () => {
        it('should include reduce_debate_rounds in actions', () => {
            const tmpDir = setupTimeoutEnv(5, 120);
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                const hint = extractDegradationHint(result.stderr);
                assert.ok(hint !== null, 'Hint must be parseable');
                assert.ok(hint.actions.includes('reduce_debate_rounds'),
                    'actions must include reduce_debate_rounds');
            } finally {
                cleanup(tmpDir);
            }
        });

        it('should include skip_optional_steps in actions', () => {
            const tmpDir = setupTimeoutEnv(5, 120);
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                const hint = extractDegradationHint(result.stderr);
                assert.ok(hint !== null, 'Hint must be parseable');
                assert.ok(hint.actions.includes('skip_optional_steps'),
                    'actions must include skip_optional_steps');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-12d: Fail-open -- errors in hint generation must not block ----
    describe('AC-12d: errors in hint generation do not block (fail-open)', () => {
        it('should exit 0 even when timeout check environment is unusual', () => {
            const tmpDir = setupTimeoutEnv(5, 120);
            try {
                // Even if something goes wrong in the timeout/hint path,
                // the dispatcher must exit 0 (fail-open via try/catch at line 121-124)
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher must always exit 0 (fail-open)');
            } finally {
                cleanup(tmpDir);
            }
        });

        it('should not block when timeout is not exceeded', () => {
            // Phase started 1 minute ago, timeout is 60 minutes -> NOT exceeded
            const tmpDir = setupTimeoutEnv(60, 1);
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0,
                    'Dispatcher must exit 0 when timeout not exceeded');
                // No DEGRADATION_HINT should be emitted when not exceeded
                assert.ok(!result.stderr.includes('DEGRADATION_HINT'),
                    'No DEGRADATION_HINT when timeout not exceeded');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ---- AC-12e: Human-readable warning preserved alongside hint ----
    describe('AC-12e: human-readable warning preserved', () => {
        it('should include TIMEOUT WARNING text alongside DEGRADATION_HINT', () => {
            const tmpDir = setupTimeoutEnv(5, 120);
            try {
                const result = runDispatcher(tmpDir, makeTaskInput());

                // Both the human-readable warning AND the structured hint must be present
                assert.ok(result.stderr.includes('TIMEOUT WARNING'),
                    'Human-readable TIMEOUT WARNING must be preserved');
                assert.ok(result.stderr.includes('DEGRADATION_HINT'),
                    'Structured DEGRADATION_HINT must also be present');

                // Verify the human-readable warning mentions the phase and timing
                assert.ok(result.stderr.includes('01-requirements'),
                    'Warning must mention the phase name');
            } finally {
                cleanup(tmpDir);
            }
        });
    });

    // ==== Edge case: no timeout configured ====
    describe('Edge case: no timeout configured for phase', () => {
        it('should not emit any timeout warnings when no timeout_minutes set', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-no-timeout-'));
            const isdlcDir = path.join(tmpDir, '.isdlc');
            const configDir = path.join(isdlcDir, 'config');
            fs.mkdirSync(configDir, { recursive: true });

            fs.writeFileSync(
                path.join(isdlcDir, 'state.json'),
                JSON.stringify({
                    active_workflow: {
                        type: 'feature',
                        current_phase: '01-requirements'
                    },
                    phases: {
                        '01-requirements': {
                            status: 'in_progress',
                            started_at: new Date(Date.now() - 99999999).toISOString()
                        }
                    }
                }, null, 2)
            );

            // No timeout_minutes in requirements
            fs.writeFileSync(
                path.join(configDir, 'iteration-requirements.json'),
                JSON.stringify({
                    phase_requirements: {
                        '01-requirements': {}
                    }
                }, null, 2)
            );

            fs.writeFileSync(
                path.join(configDir, 'skills-manifest.json'),
                JSON.stringify({ version: '4.0.0', agents: {} }, null, 2)
            );

            fs.writeFileSync(
                path.join(configDir, 'workflows.json'),
                JSON.stringify({ workflows: {} }, null, 2)
            );

            try {
                const result = runDispatcher(tmpDir, makeTaskInput());
                assert.equal(result.exitCode, 0);
                assert.ok(!result.stderr.includes('TIMEOUT WARNING'),
                    'No timeout warning when timeout_minutes not configured');
                assert.ok(!result.stderr.includes('DEGRADATION_HINT'),
                    'No degradation hint when timeout_minutes not configured');
            } finally {
                cleanup(tmpDir);
            }
        });
    });
});
