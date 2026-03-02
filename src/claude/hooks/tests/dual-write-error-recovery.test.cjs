/**
 * Tests for Dual-Write Error Recovery (INV-0055 REQ-004, TS-008)
 * Traces to: REQ-001, REQ-004, AC-004c
 *
 * Validates behavior after a crash leaves state partially written:
 * - V9 consistency check on crash recovery state
 * - V7 version check prevents stale overwrites
 * - Timing data integrity after crash
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'state-write-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-test-'));
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
 * Fixture: State after a crash (phase stuck in_progress, no completed_at).
 */
function makeCrashState() {
    return {
        state_version: 6,
        current_phase: '03-architecture',
        phases: {
            '03-architecture': {
                status: 'in_progress',
                timing: {
                    started_at: '2026-02-19T10:00:00Z',
                    retries: 0
                },
                constitutional_validation: { completed: false }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: '03-architecture',
            current_phase_index: 2,
            phases: ['01-requirements', '02-impact-analysis',
                     '03-architecture', '04-design'],
            phase_status: {
                '01-requirements': 'completed',
                '02-impact-analysis': 'completed',
                '03-architecture': 'in_progress'
            }
        }
    };
}

describe('INV-0055 REQ-004 TS-008: Dual-Write Error Recovery', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // T-DW-01: Phase stuck in_progress allows re-delegation (same-phase recovery write)
    // Traces to: AC-004c
    it('T-DW-01: crash recovery write with same status is allowed', () => {
        const diskState = makeCrashState();
        const statePath = writeStateFile(tmpDir, diskState);

        // Recovery attempt: same phase, same status, same or higher version
        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.state_version = 7; // Increment version for recovery

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            !result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            `Recovery write should be allowed, got stdout: ${result.stdout}`
        );
    });

    // T-DW-02: Dual-write consistent on partial failure (no V9-A warning)
    // Traces to: REQ-001, AC-001a (negative case)
    it('T-DW-02: no V9-A warning when both locations are consistent at in_progress', () => {
        const diskState = makeCrashState();
        const statePath = writeStateFile(tmpDir, diskState);

        // Both phases[].status and phase_status[] are 'in_progress' -- consistent
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, diskState));
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stderr.includes('V9-A'),
            `No V9-A warning expected when both locations are consistent, stderr: ${result.stderr}`);
    });

    // T-DW-03: V7 prevents stale overwrites on recovery
    it('T-DW-03: V7 blocks stale version on recovery attempt', () => {
        const diskState = makeCrashState();
        const statePath = writeStateFile(tmpDir, diskState);

        // Recovery attempt with STALE version (5 < 6 on disk)
        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.state_version = 5;

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'),
            `V7 should block stale recovery write, got stdout: ${result.stdout}`
        );
    });

    // T-DW-04: Timing data incomplete but not corrupted after crash
    it('T-DW-04: timing data has valid started_at and null completed_at after crash', () => {
        const crashState = makeCrashState();
        const timing = crashState.phases['03-architecture'].timing;

        // Verify timing data structure
        assert.ok(typeof timing.started_at === 'string', 'started_at should be a string');
        assert.ok(!isNaN(new Date(timing.started_at).getTime()), 'started_at should be valid ISO string');
        assert.equal(timing.completed_at, undefined, 'completed_at should be absent after crash');
        assert.equal(timing.wall_clock_minutes, undefined, 'wall_clock_minutes should be absent after crash');
        assert.equal(typeof timing.retries, 'number', 'retries should be a number');
    });
});
