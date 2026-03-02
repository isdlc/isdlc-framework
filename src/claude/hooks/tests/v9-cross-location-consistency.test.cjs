/**
 * Tests for V9 Cross-Location Consistency Check (INV-0055 REQ-001)
 * Traces to: REQ-001, AC-001a through AC-001f, NFR-001
 *
 * Validates that checkCrossLocationConsistency() detects divergence
 * between mirrored state.json fields and warns on stderr without blocking.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'state-write-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v9-test-'));
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

// Base state fixture with consistent fields
const baseState = {
    state_version: 10,
    current_phase: '03-architecture',
    phases: {
        '01-requirements': {
            status: 'completed',
            constitutional_validation: { completed: true, iterations_used: 1 }
        },
        '02-impact-analysis': {
            status: 'completed',
            constitutional_validation: { completed: true, iterations_used: 1 }
        },
        '03-architecture': {
            status: 'in_progress',
            constitutional_validation: { completed: false }
        }
    },
    active_workflow: {
        type: 'feature',
        current_phase: '03-architecture',
        current_phase_index: 2,
        phases: [
            '01-requirements',
            '02-impact-analysis',
            '03-architecture',
            '04-design'
        ],
        phase_status: {
            '01-requirements': 'completed',
            '02-impact-analysis': 'completed',
            '03-architecture': 'in_progress'
        }
    }
};

describe('INV-0055 REQ-001: V9 Cross-Location Consistency Check', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // T-V9-01: No warning when phases[N].status matches phase_status[N] (V9-A consistent)
    it('T-V9-01: no V9-A warning when phases[N].status matches phase_status[N]', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stderr.includes('V9-A'), `Should not emit V9-A warning, stderr: ${result.stderr}`);
    });

    // T-V9-02: Warn when phases[N].status diverges from phase_status[N] (V9-A divergent)
    // Traces to: AC-001a
    it('T-V9-02: V9-A warns when phases[N].status diverges from phase_status[N]', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        // Create divergence: phases says completed, phase_status says in_progress
        state.phases['03-architecture'].status = 'completed';
        state.active_workflow.phase_status['03-architecture'] = 'in_progress';
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(result.stderr.includes('V9-A WARNING'), `Should emit V9-A warning, stderr: ${result.stderr}`);
        assert.ok(result.stderr.includes('03-architecture'), 'Warning should contain phase key');
        assert.ok(result.stderr.includes('completed'), 'Warning should contain phases[].status value');
        assert.ok(result.stderr.includes('in_progress'), 'Warning should contain phase_status[] value');
        // Should NOT block (V9 is observational)
        assert.ok(!result.stdout.includes('"continue":false') && !result.stdout.includes('"continue": false'),
            'V9 should never block writes');
    });

    // T-V9-03: No warning when current_phase matches aw.current_phase (V9-B consistent)
    it('T-V9-03: no V9-B warning when current_phase matches aw.current_phase', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stderr.includes('V9-B'), `Should not emit V9-B warning, stderr: ${result.stderr}`);
    });

    // T-V9-04: Warn when current_phase diverges from aw.current_phase (V9-B divergent)
    // Traces to: AC-001b
    it('T-V9-04: V9-B warns when current_phase diverges from aw.current_phase', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        state.current_phase = '03-architecture';
        state.active_workflow.current_phase = '04-design';
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(result.stderr.includes('V9-B WARNING'), `Should emit V9-B warning, stderr: ${result.stderr}`);
        assert.ok(result.stderr.includes('03-architecture'), 'Warning should contain top-level current_phase');
        assert.ok(result.stderr.includes('04-design'), 'Warning should contain aw.current_phase');
    });

    // T-V9-05: No warning when phases[index] matches current_phase (V9-C consistent)
    it('T-V9-05: no V9-C warning when phases[index] matches current_phase', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        // phases[2] = '03-architecture', current_phase = '03-architecture' -- consistent
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stderr.includes('V9-C'), `Should not emit V9-C warning, stderr: ${result.stderr}`);
    });

    // T-V9-06: Warn when phases[index] diverges from current_phase (V9-C genuine mismatch)
    // Does NOT match the intermediate state pattern (prevExpectedPhase != awCurrentPhase)
    it('T-V9-06: V9-C warns on genuine phase index mismatch', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        // Set index to 2 but current_phase to something NOT at index 1
        // phases[2] = '03-architecture', current_phase = '04-design'
        // phases[1] = '02-impact-analysis' != '04-design' -- not intermediate
        state.active_workflow.current_phase = '04-design';
        state.current_phase = '04-design'; // Keep V9-B consistent to isolate V9-C
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(result.stderr.includes('V9-C WARNING'), `Should emit V9-C warning, stderr: ${result.stderr}`);
    });

    // T-V9-07: No warning when active_workflow is missing (fail-open)
    // Traces to: AC-001d
    it('T-V9-07: no V9 warnings when active_workflow is missing', () => {
        const state = {
            state_version: 10,
            current_phase: '03-architecture',
            phases: {
                '03-architecture': { status: 'in_progress' }
            }
            // No active_workflow
        };
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stderr.includes('V9-A'), 'No V9-A warning without active_workflow');
        assert.ok(!result.stderr.includes('V9-B'), 'No V9-B warning without active_workflow');
        assert.ok(!result.stderr.includes('V9-C'), 'No V9-C warning without active_workflow');
    });

    // T-V9-08: No warning when phases is missing (fail-open)
    // Traces to: AC-001d
    it('T-V9-08: no V9 warnings when phases is missing', () => {
        const state = {
            state_version: 10,
            current_phase: '03-architecture',
            active_workflow: {
                type: 'feature',
                current_phase: '03-architecture',
                current_phase_index: 2,
                phases: ['01-requirements', '02-impact-analysis', '03-architecture'],
                phase_status: { '03-architecture': 'in_progress' }
            }
            // No phases
        };
        const statePath = writeStateFile(tmpDir, state);
        const result = runHook(tmpDir, makeWriteStdinWithContent(statePath, state));
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stderr.includes('V9-A'), 'No V9-A warning without phases');
    });

    // T-V9-09: V9 runs on Edit events (reads from disk)
    // Traces to: AC-001e
    it('T-V9-09: V9 runs on Edit events and reads from disk', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        // Create divergence on disk
        state.phases['03-architecture'].status = 'completed';
        state.active_workflow.phase_status['03-architecture'] = 'in_progress';
        const statePath = writeStateFile(tmpDir, state);
        // Edit event: no content in tool_input, V9 reads from disk
        const editStdin = {
            tool_name: 'Edit',
            tool_input: { file_path: statePath }
        };
        const result = runHook(tmpDir, editStdin);
        assert.equal(result.exitCode, 0);
        assert.ok(result.stderr.includes('V9-A WARNING'), `V9 should detect divergence on Edit, stderr: ${result.stderr}`);
    });

    // T-V9-10: Fail-open on malformed JSON content
    // Traces to: AC-001f
    it('T-V9-10: no crash and no V9 warnings on malformed JSON content', () => {
        const state = JSON.parse(JSON.stringify(baseState));
        const statePath = writeStateFile(tmpDir, state);
        const stdin = {
            tool_name: 'Write',
            tool_input: {
                file_path: statePath,
                content: 'not valid json {'
            }
        };
        const result = runHook(tmpDir, stdin);
        assert.equal(result.exitCode, 0, 'Should not crash on malformed JSON');
        assert.ok(!result.stderr.includes('V9-A'), 'No V9-A warning on malformed JSON');
        assert.ok(!result.stderr.includes('V9-B'), 'No V9-B warning on malformed JSON');
        assert.ok(!result.stderr.includes('V9-C'), 'No V9-C warning on malformed JSON');
    });
});
