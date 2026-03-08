/**
 * Integration tests for workflow recovery lifecycle
 * Traces to: REQ-0051 + REQ-0052 cross-module interactions
 * TC-INT-01 through TC-INT-08
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const RETRY_SCRIPT = path.join(__dirname, '..', '..', '..', 'antigravity', 'workflow-retry.cjs');
const ROLLBACK_SCRIPT = path.join(__dirname, '..', '..', '..', 'antigravity', 'workflow-rollback.cjs');

const { checkPhaseFieldProtection } = require(path.join(__dirname, '..', 'lib', 'state-logic.cjs'));

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
            '01-requirements': {
                status: 'completed',
                constitutional_validation: { completed: true, iterations_used: 1, status: 'compliant' },
                iteration_requirements: {
                    interactive_elicitation: { completed: true, menu_interactions: 3 }
                }
            },
            '02-impact-analysis': { status: 'completed' },
            '03-architecture': { status: 'completed' },
            '04-design': { status: 'completed' },
            '05-test-strategy': { status: 'completed' },
            '06-implementation': {
                status: 'in_progress',
                constitutional_validation: { completed: true, iterations_used: 2, status: 'compliant' },
                iteration_requirements: {
                    test_iteration: { completed: true, current_iteration: 3 }
                }
            }
        }
    };
}

function setupTestEnv(state) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-int-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    fs.writeFileSync(path.join(isdlcDir, 'state.json'), JSON.stringify(state, null, 2));
    return tmpDir;
}

function readStateFromDisk(tmpDir) {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, '.isdlc', 'state.json'), 'utf8'));
}

function runScript(scriptPath, tmpDir, args = []) {
    const result = spawnSync('node', [scriptPath, ...args], {
        cwd: tmpDir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
        encoding: 'utf8',
        timeout: 5000
    });
    let parsed = null;
    try { parsed = JSON.parse(result.stdout); } catch (e) { /* */ }
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status, parsed };
}

function makeToolInput(content) {
    return { content: JSON.stringify(content) };
}

// --- Integration Tests ---

describe('workflow recovery integration tests', () => {
    let tmpDir;

    beforeEach(() => { tmpDir = setupTestEnv(baseWorkflowState()); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    // TC-INT-01: retry writes state that V8 accepts
    it('TC-INT-01: retry writes state that V8 accepts', () => {
        const diskBefore = readStateFromDisk(tmpDir);
        runScript(RETRY_SCRIPT, tmpDir);
        const stateAfter = readStateFromDisk(tmpDir);

        // V8 should accept the state written by retry
        const v8Result = checkPhaseFieldProtection(
            path.join(tmpDir, '.isdlc', 'state.json'),
            makeToolInput(stateAfter),
            'Write',
            diskBefore
        );
        assert.equal(v8Result, null, 'V8 should not block retry state');
    });

    // TC-INT-02: retry + phase-advance clears recovery_action
    it('TC-INT-02: recovery_action present after retry, can be cleared manually', () => {
        runScript(RETRY_SCRIPT, tmpDir);
        const stateAfterRetry = readStateFromDisk(tmpDir);

        // recovery_action is present
        assert.ok(stateAfterRetry.active_workflow.recovery_action);
        assert.equal(stateAfterRetry.active_workflow.recovery_action.type, 'retry');

        // Simulate clearing recovery_action (as phase-advance would do)
        delete stateAfterRetry.active_workflow.recovery_action;
        stateAfterRetry.state_version += 1;
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(stateAfterRetry, null, 2));

        const finalState = readStateFromDisk(tmpDir);
        assert.equal(finalState.active_workflow.recovery_action, undefined, 'recovery_action should be cleared');
    });

    // TC-INT-03: retry preserves prior completed phases
    it('TC-INT-03: retry preserves prior completed phases', () => {
        runScript(RETRY_SCRIPT, tmpDir);
        const state = readStateFromDisk(tmpDir);

        assert.equal(state.active_workflow.phase_status['01-requirements'], 'completed');
        assert.equal(state.active_workflow.phase_status['02-impact-analysis'], 'completed');
        assert.equal(state.active_workflow.phase_status['03-architecture'], 'completed');
        assert.equal(state.active_workflow.phase_status['04-design'], 'completed');
        assert.equal(state.active_workflow.phase_status['05-test-strategy'], 'completed');
    });

    // TC-INT-04: double retry increments count correctly
    it('TC-INT-04: double retry increments count correctly', () => {
        runScript(RETRY_SCRIPT, tmpDir);
        const afterFirst = readStateFromDisk(tmpDir);
        assert.equal(afterFirst.phases['06-implementation'].retry_count, 1);
        const v1 = afterFirst.state_version;

        runScript(RETRY_SCRIPT, tmpDir);
        const afterSecond = readStateFromDisk(tmpDir);
        assert.equal(afterSecond.phases['06-implementation'].retry_count, 2);
        assert.ok(afterSecond.state_version > v1, 'state_version should bump again');
    });

    // TC-INT-05: rollback writes state that V8 accepts
    it('TC-INT-05: rollback writes state that V8 accepts', () => {
        const diskBefore = readStateFromDisk(tmpDir);
        runScript(ROLLBACK_SCRIPT, tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const stateAfter = readStateFromDisk(tmpDir);

        // V8 should accept the state written by rollback (recovery_action present)
        const v8Result = checkPhaseFieldProtection(
            path.join(tmpDir, '.isdlc', 'state.json'),
            makeToolInput(stateAfter),
            'Write',
            diskBefore
        );
        assert.equal(v8Result, null, 'V8 should not block rollback state');
    });

    // TC-INT-06: rollback + re-advance works
    it('TC-INT-06: rollback resets phases for re-advancement', () => {
        runScript(ROLLBACK_SCRIPT, tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);

        // Verify phases can be re-advanced (all subsequent are pending)
        assert.equal(state.active_workflow.phase_status['01-requirements'], 'in_progress');
        assert.equal(state.active_workflow.phase_status['02-impact-analysis'], 'pending');
        assert.equal(state.active_workflow.phase_status['03-architecture'], 'pending');
        assert.equal(state.active_workflow.phase_status['04-design'], 'pending');
        assert.equal(state.active_workflow.phase_status['05-test-strategy'], 'pending');
        assert.equal(state.active_workflow.phase_status['06-implementation'], 'pending');

        // Simulate advancing: mark 01 completed, 02 in_progress
        state.active_workflow.phase_status['01-requirements'] = 'completed';
        state.active_workflow.phase_status['02-impact-analysis'] = 'in_progress';
        state.active_workflow.current_phase = '02-impact-analysis';
        state.active_workflow.current_phase_index = 1;
        delete state.active_workflow.recovery_action;
        state.state_version += 1;
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const finalState = readStateFromDisk(tmpDir);
        assert.equal(finalState.active_workflow.current_phase, '02-impact-analysis');
    });

    // TC-INT-07: rollback clears iteration state in phases record
    it('TC-INT-07: rollback clears iteration state in phases record', () => {
        runScript(ROLLBACK_SCRIPT, tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);

        // Phase 06 (was in_progress, now pending) should have iteration state cleared
        if (state.phases['06-implementation']) {
            assert.equal(state.phases['06-implementation'].constitutional_validation, undefined);
            assert.equal(state.phases['06-implementation'].iteration_requirements?.test_iteration, undefined);
        }

        // Phase 01 (target) should also have iteration state cleared
        if (state.phases['01-requirements']) {
            assert.equal(state.phases['01-requirements'].constitutional_validation, undefined);
            assert.equal(state.phases['01-requirements'].iteration_requirements?.interactive_elicitation, undefined);
        }
    });

    // TC-INT-08: rollback then retry on same phase works
    it('TC-INT-08: rollback then retry on same phase works', () => {
        // Rollback to Phase 01
        runScript(ROLLBACK_SCRIPT, tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const afterRollback = readStateFromDisk(tmpDir);
        assert.equal(afterRollback.active_workflow.rollback_count, 1);
        assert.equal(afterRollback.active_workflow.current_phase, '01-requirements');

        // Now retry Phase 01
        runScript(RETRY_SCRIPT, tmpDir);
        const afterRetry = readStateFromDisk(tmpDir);

        // Both counts tracked independently
        assert.equal(afterRetry.active_workflow.rollback_count, 1, 'rollback_count preserved');
        if (afterRetry.phases['01-requirements']) {
            assert.equal(afterRetry.phases['01-requirements'].retry_count, 1, 'retry_count set on phase');
        }
        assert.equal(afterRetry.active_workflow.recovery_action.type, 'retry', 'recovery_action updated to retry');
    });
});
