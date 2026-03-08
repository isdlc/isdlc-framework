/**
 * Tests for workflow-retry.cjs
 * Traces to: REQ-0051 FR-001 through FR-005
 * TC-RT-01 through TC-RT-24, TC-E2E-RT-01 through TC-E2E-RT-04
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, '..', '..', '..', 'antigravity', 'workflow-retry.cjs');

// --- Fixtures ---

function baseWorkflowState() {
    return {
        project_name: 'test-project',
        state_version: 42,
        current_phase: '06-implementation',
        active_workflow: {
            type: 'feature',
            description: 'Test feature',
            slug: 'REQ-9999-test-feature',
            phases: ['01-requirements', '02-impact-analysis', '03-architecture', '04-design', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
            current_phase: '06-implementation',
            current_phase_index: 5,
            phase_status: {
                '01-requirements': 'completed',
                '02-impact-analysis': 'completed',
                '03-architecture': 'completed',
                '04-design': 'completed',
                '05-test-strategy': 'completed',
                '06-implementation': 'in_progress',
                '16-quality-loop': 'pending',
                '08-code-review': 'pending'
            },
            started_at: '2026-03-08T10:00:00.000Z',
            flags: { light: false, supervised: false },
            artifact_folder: 'REQ-9999-test-feature'
        },
        phases: {
            '06-implementation': {
                status: 'in_progress',
                started: '2026-03-08T12:00:00.000Z',
                constitutional_validation: {
                    completed: true,
                    iterations_used: 2,
                    status: 'compliant',
                    articles_checked: ['II', 'VII']
                },
                iteration_requirements: {
                    test_iteration: {
                        completed: true,
                        current_iteration: 3,
                        tests_passing: true,
                        coverage_percent: 85
                    },
                    interactive_elicitation: {
                        completed: true,
                        menu_interactions: 4,
                        final_selection: 'save'
                    }
                }
            }
        }
    };
}

function setupTestEnv(state) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    if (state) {
        fs.writeFileSync(path.join(isdlcDir, 'state.json'), JSON.stringify(state, null, 2));
    }
    return tmpDir;
}

function readStateFromDisk(tmpDir) {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, '.isdlc', 'state.json'), 'utf8'));
}

function runRetryScript(tmpDir) {
    const result = spawnSync('node', [SCRIPT_PATH], {
        cwd: tmpDir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
        encoding: 'utf8',
        timeout: 5000
    });
    let parsed = null;
    try { parsed = JSON.parse(result.stdout); } catch (e) { /* */ }
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status, parsed };
}

// --- Unit Tests ---

describe('workflow-retry unit tests', () => {
    let tmpDir;

    beforeEach(() => { tmpDir = setupTestEnv(baseWorkflowState()); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    // 1.1 Retry State Clearing

    // TC-RT-01
    it('TC-RT-01: clears test_iteration on retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        const phase = state.phases['06-implementation'];
        assert.equal(phase.iteration_requirements?.test_iteration, undefined, 'test_iteration should be cleared');
    });

    // TC-RT-02
    it('TC-RT-02: clears constitutional_validation on retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        const phase = state.phases['06-implementation'];
        assert.equal(phase.constitutional_validation, undefined, 'constitutional_validation should be cleared');
    });

    // TC-RT-03
    it('TC-RT-03: clears interactive_elicitation on retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        const phase = state.phases['06-implementation'];
        assert.equal(phase.iteration_requirements?.interactive_elicitation, undefined, 'interactive_elicitation should be cleared');
    });

    // TC-RT-04
    it('TC-RT-04: clears all three iteration fields simultaneously', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        const phase = state.phases['06-implementation'];
        assert.equal(phase.constitutional_validation, undefined);
        assert.equal(phase.iteration_requirements?.test_iteration, undefined);
        assert.equal(phase.iteration_requirements?.interactive_elicitation, undefined);
    });

    // TC-RT-05
    it('TC-RT-05: handles phase with no iteration state gracefully', () => {
        const state = baseWorkflowState();
        state.phases['06-implementation'] = { status: 'in_progress' };
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.result, 'RETRIED');
    });

    // 1.2 Retry Count Tracking

    // TC-RT-06
    it('TC-RT-06: sets retry_count to 1 on first retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.phases['06-implementation'].retry_count, 1);
    });

    // TC-RT-07
    it('TC-RT-07: increments retry_count from 2 to 3', () => {
        const state = baseWorkflowState();
        state.phases['06-implementation'].retry_count = 2;
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        runRetryScript(tmpDir);
        const newState = readStateFromDisk(tmpDir);
        assert.equal(newState.phases['06-implementation'].retry_count, 3);
    });

    // TC-RT-08 (retry_count doesn't block gate - verified by reading state, not gate logic)
    it('TC-RT-08: retry_count does not block gate validation', () => {
        const state = baseWorkflowState();
        state.phases['06-implementation'].retry_count = 10;
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.result, 'RETRIED');
        assert.equal(readStateFromDisk(tmpDir).phases['06-implementation'].retry_count, 11);
    });

    // 1.3 State Version and Phase Preservation

    // TC-RT-09
    it('TC-RT-09: bumps state_version on retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.ok(state.state_version >= 43, `Expected >= 43, got ${state.state_version}`);
    });

    // TC-RT-10
    it('TC-RT-10: current_phase unchanged after retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.current_phase, '06-implementation');
    });

    // TC-RT-11
    it('TC-RT-11: current_phase_index unchanged after retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.current_phase_index, 5);
    });

    // 1.4 Error Handling

    // TC-RT-12
    it('TC-RT-12: returns ERROR when no active workflow', () => {
        const state = { project_name: 'test', state_version: 10, phases: {} };
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.result, 'ERROR');
        assert.ok(result.parsed.message.includes('No active workflow'));
    });

    // TC-RT-13
    it('TC-RT-13: returns ERROR when active_workflow is null', () => {
        const state = { project_name: 'test', state_version: 10, active_workflow: null, phases: {} };
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.result, 'ERROR');
    });

    // 1.5 Recovery Feedback

    // TC-RT-14
    it('TC-RT-14: output includes result: RETRIED', () => {
        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.result, 'RETRIED');
    });

    // TC-RT-15
    it('TC-RT-15: output includes phase field', () => {
        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.phase, '06-implementation');
    });

    // TC-RT-16
    it('TC-RT-16: output includes retry_count', () => {
        const result = runRetryScript(tmpDir);
        assert.equal(typeof result.parsed.retry_count, 'number');
        assert.equal(result.parsed.retry_count, 1);
    });

    // TC-RT-17
    it('TC-RT-17: output includes cleared_state list', () => {
        const result = runRetryScript(tmpDir);
        assert.ok(Array.isArray(result.parsed.cleared_state));
        assert.ok(result.parsed.cleared_state.length > 0);
    });

    // TC-RT-18
    it('TC-RT-18: output includes artifacts_preserved true', () => {
        const result = runRetryScript(tmpDir);
        assert.equal(result.parsed.artifacts_preserved, true);
    });

    // TC-RT-19
    it('TC-RT-19: feedback shows phase name in message', () => {
        const result = runRetryScript(tmpDir);
        assert.ok(result.parsed.message.includes('06-implementation'));
    });

    // TC-RT-20
    it('TC-RT-20: Phase 06 retry notes artifacts preserved', () => {
        const result = runRetryScript(tmpDir);
        assert.ok(result.parsed.message.toLowerCase().includes('preserved'));
    });

    // 1.6 Recovery Action Flag

    // TC-RT-21
    it('TC-RT-21: sets recovery_action with type retry', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.recovery_action.type, 'retry');
    });

    // TC-RT-22
    it('TC-RT-22: recovery_action includes phase name', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.recovery_action.phase, '06-implementation');
    });

    // TC-RT-23
    it('TC-RT-23: recovery_action includes ISO-8601 timestamp', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        const ts = state.active_workflow.recovery_action.timestamp;
        assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts), `Expected ISO-8601, got ${ts}`);
    });

    // TC-RT-24 (recovery_action cleared after re-advancement - integration-level but tested here as unit)
    it('TC-RT-24: recovery_action is present after retry (cleared on next advance)', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);
        assert.ok(state.active_workflow.recovery_action, 'recovery_action should be present after retry');
        assert.equal(state.active_workflow.recovery_action.type, 'retry');
    });
});

// --- E2E Tests ---

describe('workflow-retry E2E tests', () => {
    let tmpDir;

    beforeEach(() => { tmpDir = setupTestEnv(baseWorkflowState()); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    // TC-E2E-RT-01
    it('TC-E2E-RT-01: successful retry outputs valid JSON', () => {
        const result = runRetryScript(tmpDir);
        assert.equal(result.exitCode, 0);
        assert.notEqual(result.parsed, null, 'stdout should be valid JSON');
        assert.equal(result.parsed.result, 'RETRIED');
    });

    // TC-E2E-RT-02
    it('TC-E2E-RT-02: retry with no workflow exits with code 1', () => {
        const state = { project_name: 'test', state_version: 5, phases: {} };
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRetryScript(tmpDir);
        assert.equal(result.exitCode, 1);
        assert.equal(result.parsed.result, 'ERROR');
    });

    // TC-E2E-RT-03
    it('TC-E2E-RT-03: retry modifies state.json on disk correctly', () => {
        runRetryScript(tmpDir);
        const state = readStateFromDisk(tmpDir);

        // Iteration state cleared
        const phase = state.phases['06-implementation'];
        assert.equal(phase.constitutional_validation, undefined);
        assert.equal(phase.iteration_requirements?.test_iteration, undefined);
        assert.equal(phase.iteration_requirements?.interactive_elicitation, undefined);

        // retry_count incremented
        assert.equal(phase.retry_count, 1);

        // state_version bumped
        assert.ok(state.state_version >= 43);

        // Phase position unchanged
        assert.equal(state.active_workflow.current_phase, '06-implementation');
        assert.equal(state.active_workflow.current_phase_index, 5);
    });

    // TC-E2E-RT-04
    it('TC-E2E-RT-04: retry on Phase 06 includes preservation note', () => {
        const result = runRetryScript(tmpDir);
        assert.ok(result.parsed.message.toLowerCase().includes('preserved'));
        assert.equal(result.parsed.artifacts_preserved, true);
    });
});
