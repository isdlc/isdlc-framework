/**
 * Tests for Multi-Phase Boundary State Consistency (INV-0055 REQ-004, TS-005)
 * Traces to: REQ-002, REQ-004, AC-002a, AC-002c, AC-004b
 *
 * Validates that state writes across phase boundaries (STEP 3e -> STEP 3c-prime)
 * are correctly handled by V8 Check 3 (phases[].status regression) and
 * that forward transitions are allowed.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'state-write-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

function writeStateFile(tmpDir, state) {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return statePath;
}

function runHook(tmpDir, stdinJson) {
    const stdinStr = typeof stdinJson === 'string'
        ? stdinJson : JSON.stringify(stdinJson);
    const result = spawnSync('node', [HOOK_PATH], {
        input: stdinStr,
        cwd: tmpDir,
        env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: tmpDir,
            SKILL_VALIDATOR_DEBUG: 'true'
        },
        encoding: 'utf8',
        timeout: 5000
    });
    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.status || 0
    };
}

function makeWriteStdinWithContent(filePath, content) {
    return {
        tool_name: 'Write',
        tool_input: {
            file_path: filePath,
            content: typeof content === 'string'
                ? content : JSON.stringify(content, null, 2)
        }
    };
}

/**
 * Fixture: State after STEP 3e (Phase N completed, Phase N+1 pending, index incremented).
 */
function makeBoundaryState(afterStep) {
    if (afterStep === '3e') {
        return {
            state_version: 6,
            current_phase: '03-architecture', // Not yet updated
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'pending' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '03-architecture',
                current_phase_index: 3, // Incremented in 3e
                phases: ['01-requirements', '02-impact-analysis',
                         '03-architecture', '04-design'],
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'pending'
                }
            }
        };
    }
    if (afterStep === '3c-prime') {
        return {
            state_version: 7,
            current_phase: '04-design',
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'in_progress' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '04-design',
                current_phase_index: 3,
                phases: ['01-requirements', '02-impact-analysis',
                         '03-architecture', '04-design'],
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'in_progress'
                }
            }
        };
    }
    throw new Error(`Unknown afterStep: ${afterStep}`);
}

describe('INV-0055 REQ-004 TS-005: Multi-Phase Boundary State Consistency', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // T-MP-01: V8 Check 3 blocks phases[].status regression (completed -> pending)
    // Traces to: AC-002a, AC-004b
    it('T-MP-01: V8 Check 3 blocks phases[].status regression completed -> pending', () => {
        // Disk has Phase 03 as completed
        const diskState = makeBoundaryState('3e');
        const statePath = writeStateFile(tmpDir, diskState);

        // Incoming tries to regress Phase 03 back to pending (illegitimate)
        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.phases['03-architecture'].status = 'pending';
        incomingState.active_workflow.phase_status['03-architecture'] = 'pending';

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'),
            `V8 Check 3 should block phases[].status regression, got stdout: ${result.stdout}`
        );
    });

    // T-MP-02: Forward transition pending -> in_progress is allowed by V8 after 3c-prime
    // Traces to: AC-002c
    it('T-MP-02: V8 allows forward transition pending -> in_progress', () => {
        // Disk has Phase 04 as pending (after STEP 3e)
        const diskState = makeBoundaryState('3e');
        const statePath = writeStateFile(tmpDir, diskState);

        // Incoming activates Phase 04 (STEP 3c-prime writes)
        const incomingState = makeBoundaryState('3c-prime');

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            !result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            `V8 should allow forward transition, got stdout: ${result.stdout}`
        );
    });

    // T-MP-03: Forward transition pending to in_progress is allowed by V8 Check 3
    // Isolates V8 Check 3 (phases[].status only, no phase_status regression)
    it('T-MP-03: V8 Check 3 allows phases[].status forward transition', () => {
        const diskState = {
            state_version: 6,
            current_phase: '04-design',
            phases: {
                '04-design': { status: 'pending' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '04-design',
                current_phase_index: 3,
                phase_status: { '04-design': 'pending' }
            }
        };
        const statePath = writeStateFile(tmpDir, diskState);

        const incomingState = {
            state_version: 7,
            current_phase: '04-design',
            phases: {
                '04-design': { status: 'in_progress' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '04-design',
                current_phase_index: 3,
                phase_status: { '04-design': 'in_progress' }
            }
        };

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            !result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            `V8 Check 3 should allow forward transition, got stdout: ${result.stdout}`
        );
    });

    // T-MP-04: State version increments across boundary writes
    it('T-MP-04: state version increments across boundary writes', () => {
        // First write: STEP 3e (version 5 on disk, version 6 incoming)
        const diskState1 = {
            state_version: 5,
            current_phase: '03-architecture',
            phases: { '03-architecture': { status: 'in_progress' } },
            active_workflow: {
                type: 'feature',
                current_phase: '03-architecture',
                current_phase_index: 2,
                phase_status: { '03-architecture': 'in_progress' }
            }
        };
        const statePath = writeStateFile(tmpDir, diskState1);

        const incomingState1 = {
            state_version: 6,
            current_phase: '03-architecture',
            phases: { '03-architecture': { status: 'completed' } },
            active_workflow: {
                type: 'feature',
                current_phase: '03-architecture',
                current_phase_index: 3,
                phase_status: { '03-architecture': 'completed' }
            }
        };

        const result1 = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState1));
        assert.equal(result1.exitCode, 0);
        assert.ok(
            !result1.stdout.includes('"continue":false') && !result1.stdout.includes('"continue": false'),
            'First boundary write (version 6 >= 5) should be allowed'
        );

        // Simulate the first write landing on disk
        writeStateFile(tmpDir, incomingState1);

        // Second write: STEP 3c-prime (version 6 on disk, version 7 incoming)
        const incomingState2 = {
            state_version: 7,
            current_phase: '04-design',
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'in_progress' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '04-design',
                current_phase_index: 3,
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'in_progress'
                }
            }
        };

        const result2 = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState2));
        assert.equal(result2.exitCode, 0);
        assert.ok(
            !result2.stdout.includes('"continue":false') && !result2.stdout.includes('"continue": false'),
            'Second boundary write (version 7 >= 6) should be allowed'
        );
    });
});
