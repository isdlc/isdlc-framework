/**
 * Tests for Supervised Review Redo Timing Preservation (INV-0055 REQ-004, TS-003)
 * Traces to: REQ-003, REQ-004, AC-003a, AC-003b, AC-003c, AC-004a
 *
 * Validates that the V8 supervised redo exception allows legitimate
 * completed -> in_progress regressions during supervised redo, and that
 * timing data (started_at, completed_at, retries) is handled correctly.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'state-write-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redo-test-'));
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
 * Fixture: State representing a completed phase ready for supervised redo.
 */
function makeRedoState() {
    return {
        state_version: 6,
        current_phase: '03-architecture',
        phases: {
            '03-architecture': {
                status: 'completed',
                timing: {
                    started_at: '2026-02-19T10:00:00Z',
                    completed_at: '2026-02-19T10:30:00Z',
                    wall_clock_minutes: 30,
                    retries: 0
                },
                constitutional_validation: { completed: true, iterations_used: 1 }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: '03-architecture',
            current_phase_index: 2,
            phase_status: { '03-architecture': 'completed' },
            supervised_review: {
                phase: '03-architecture',
                status: 'redo_pending',
                redo_count: 1
            }
        }
    };
}

describe('INV-0055 REQ-004 TS-003: Supervised Review Redo Timing', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // T-SR-01: Redo preserves started_at and V8 does not block
    // Traces to: AC-003a, AC-004a
    it('T-SR-01: redo preserves started_at and V8 allows the write', () => {
        const diskState = makeRedoState();
        const statePath = writeStateFile(tmpDir, diskState);

        // Incoming state: status reset to in_progress, started_at preserved
        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.phases['03-architecture'].status = 'in_progress';
        incomingState.phases['03-architecture'].timing.completed_at = null;
        incomingState.active_workflow.phase_status['03-architecture'] = 'in_progress';

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        // V8 should NOT block (supervised redo exception)
        assert.ok(
            !result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            `V8 should allow redo regression, got stdout: ${result.stdout}`
        );
        // Verify started_at is preserved in the incoming state
        assert.equal(
            incomingState.phases['03-architecture'].timing.started_at,
            '2026-02-19T10:00:00Z',
            'started_at should be preserved during redo'
        );
    });

    // T-SR-02: Redo with redo_count > 0 (not redo_pending status) also allowed
    // Traces to: AC-003c
    it('T-SR-02: redo with redo_count > 0 is allowed (alternative redo marker)', () => {
        const diskState = makeRedoState();
        // Use redo_count as the marker instead of redo_pending status
        diskState.active_workflow.supervised_review.status = 'completed';
        diskState.active_workflow.supervised_review.redo_count = 2;
        const statePath = writeStateFile(tmpDir, diskState);

        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.phases['03-architecture'].status = 'in_progress';
        incomingState.phases['03-architecture'].timing.retries = 1;
        incomingState.active_workflow.phase_status['03-architecture'] = 'in_progress';

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            !result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            `V8 should allow redo via redo_count, got stdout: ${result.stdout}`
        );
    });

    // T-SR-03: Redo clears completed_at
    // Traces to: AC-004a
    it('T-SR-03: redo clears completed_at and V8 allows the write', () => {
        const diskState = makeRedoState();
        const statePath = writeStateFile(tmpDir, diskState);

        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.phases['03-architecture'].status = 'in_progress';
        incomingState.phases['03-architecture'].timing.completed_at = null;
        incomingState.phases['03-architecture'].timing.wall_clock_minutes = null;
        incomingState.active_workflow.phase_status['03-architecture'] = 'in_progress';

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        assert.ok(
            !result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            `V8 should allow redo regression, got stdout: ${result.stdout}`
        );
        assert.equal(incomingState.phases['03-architecture'].timing.completed_at, null,
            'completed_at should be cleared during redo');
    });

    // T-SR-04: V8 blocks non-redo status regression (no supervised_review marker)
    // Traces to: AC-003b
    it('T-SR-04: V8 blocks regression without supervised_review marker', () => {
        const diskState = makeRedoState();
        // Remove the supervised_review marker
        delete diskState.active_workflow.supervised_review;
        const statePath = writeStateFile(tmpDir, diskState);

        const incomingState = JSON.parse(JSON.stringify(diskState));
        incomingState.phases['03-architecture'].status = 'in_progress';
        incomingState.active_workflow.phase_status['03-architecture'] = 'in_progress';

        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, incomingState));
        assert.equal(result.exitCode, 0);
        // V8 SHOULD block (no redo marker)
        assert.ok(
            result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'),
            `V8 should block regression without redo marker, got stdout: ${result.stdout}`
        );
    });
});
