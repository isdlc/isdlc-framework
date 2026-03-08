/**
 * Tests for workflow-rollback.cjs
 * Traces to: REQ-0052 FR-001 through FR-007
 * TC-RB-01 through TC-RB-27, TC-E2E-RB-01 through TC-E2E-RB-04
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, '..', '..', '..', 'antigravity', 'workflow-rollback.cjs');

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
                    test_iteration: { completed: true, current_iteration: 1 },
                    interactive_elicitation: { completed: true, menu_interactions: 3 }
                }
            },
            '02-impact-analysis': {
                status: 'completed',
                constitutional_validation: { completed: true, iterations_used: 1, status: 'compliant' }
            },
            '03-architecture': {
                status: 'completed',
                constitutional_validation: { completed: true, iterations_used: 1, status: 'compliant' }
            },
            '04-design': {
                status: 'completed',
                constitutional_validation: { completed: true, iterations_used: 1, status: 'compliant' }
            },
            '05-test-strategy': {
                status: 'completed',
                constitutional_validation: { completed: true, iterations_used: 1, status: 'compliant' }
            },
            '06-implementation': {
                status: 'in_progress',
                constitutional_validation: { completed: true, iterations_used: 2, status: 'compliant' },
                iteration_requirements: {
                    test_iteration: { completed: true, current_iteration: 3 },
                    interactive_elicitation: { completed: true, menu_interactions: 4 }
                }
            }
        }
    };
}

function lightModeState() {
    return {
        project_name: 'test-project',
        state_version: 20,
        current_phase: '06-implementation',
        active_workflow: {
            type: 'feature',
            description: 'Light feature',
            slug: 'REQ-8888-light-feature',
            phases: ['00-quick-scan', '01-requirements', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
            current_phase: '06-implementation',
            current_phase_index: 3,
            phase_status: {
                '00-quick-scan': 'completed',
                '01-requirements': 'completed',
                '05-test-strategy': 'completed',
                '06-implementation': 'in_progress',
                '16-quality-loop': 'pending',
                '08-code-review': 'pending'
            },
            flags: { light: true, supervised: false }
        },
        phases: {}
    };
}

function setupTestEnv(state) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
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

function runRollbackScript(tmpDir, args = []) {
    const result = spawnSync('node', [SCRIPT_PATH, ...args], {
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

describe('workflow-rollback unit tests', () => {
    let tmpDir;

    beforeEach(() => { tmpDir = setupTestEnv(baseWorkflowState()); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    // 2.1 Rollback State Changes

    // TC-RB-01
    it('TC-RB-01: sets current_phase to target phase', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.current_phase, '01-requirements');
    });

    // TC-RB-02
    it('TC-RB-02: sets current_phase_index to target index', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.current_phase_index, 0);
    });

    // TC-RB-03
    it('TC-RB-03: target phase status set to in_progress', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.phase_status['01-requirements'], 'in_progress');
    });

    // TC-RB-04
    it('TC-RB-04: subsequent phases set to pending', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.phase_status['02-impact-analysis'], 'pending');
        assert.equal(state.active_workflow.phase_status['03-architecture'], 'pending');
        assert.equal(state.active_workflow.phase_status['04-design'], 'pending');
        assert.equal(state.active_workflow.phase_status['05-test-strategy'], 'pending');
        assert.equal(state.active_workflow.phase_status['06-implementation'], 'pending');
    });

    // TC-RB-05
    it('TC-RB-05: clears iteration state for target phase', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        const phase = state.phases['01-requirements'];
        assert.equal(phase.constitutional_validation, undefined);
        assert.equal(phase.iteration_requirements?.test_iteration, undefined);
        assert.equal(phase.iteration_requirements?.interactive_elicitation, undefined);
    });

    // TC-RB-06
    it('TC-RB-06: clears iteration state for all subsequent phases', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        for (const phase of ['02-impact-analysis', '03-architecture', '04-design', '05-test-strategy', '06-implementation']) {
            if (state.phases[phase]) {
                assert.equal(state.phases[phase].constitutional_validation, undefined, `${phase} constitutional_validation should be cleared`);
            }
        }
    });

    // TC-RB-07
    it('TC-RB-07: bumps state_version', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.ok(state.state_version >= 43);
    });

    // TC-RB-08
    it('TC-RB-08: no files deleted from disk', () => {
        // Create some mock artifact files
        const artifactDir = path.join(tmpDir, 'docs', 'requirements', 'REQ-9999-test-feature');
        fs.mkdirSync(artifactDir, { recursive: true });
        fs.writeFileSync(path.join(artifactDir, 'requirements-spec.md'), '# Req Spec');
        fs.writeFileSync(path.join(artifactDir, 'architecture-overview.md'), '# Arch');

        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);

        assert.ok(fs.existsSync(path.join(artifactDir, 'requirements-spec.md')));
        assert.ok(fs.existsSync(path.join(artifactDir, 'architecture-overview.md')));
    });

    // 2.2 Error Handling

    // TC-RB-09
    it('TC-RB-09: returns ERROR when no active workflow', () => {
        const state = { project_name: 'test', state_version: 10, phases: {} };
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.parsed.result, 'ERROR');
        assert.ok(result.parsed.message.includes('No active workflow'));
    });

    // TC-RB-10
    it('TC-RB-10: rejects target phase not in workflow phases', () => {
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(lightModeState(), null, 2));

        const result = runRollbackScript(tmpDir, ['--to-phase', '03-architecture', '--confirm']);
        assert.equal(result.parsed.result, 'ERROR');
        assert.ok(result.parsed.message.includes('not in this workflow'));
    });

    // TC-RB-11
    it('TC-RB-11: rejects rollback to current phase', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '06-implementation', '--confirm']);
        assert.equal(result.parsed.result, 'ERROR');
        assert.ok(result.parsed.message.includes('retry'));
    });

    // TC-RB-12
    it('TC-RB-12: rejects forward rollback', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '08-code-review', '--confirm']);
        assert.equal(result.parsed.result, 'ERROR');
        assert.ok(result.parsed.message.includes('Cannot rollback forward'));
    });

    // TC-RB-13
    it('TC-RB-13: rejects missing --to-phase argument', () => {
        const result = runRollbackScript(tmpDir, ['--confirm']);
        assert.equal(result.parsed.result, 'ERROR');
        assert.ok(result.parsed.message.includes('--to-phase'));
    });

    // 2.3 User Confirmation

    // TC-RB-14
    it('TC-RB-14: --confirm flag skips confirmation', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.parsed.result, 'ROLLED_BACK');
    });

    // TC-RB-15
    it('TC-RB-15: without --confirm, output includes confirmation info', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements']);
        assert.equal(result.parsed.result, 'CONFIRM_REQUIRED');
        assert.ok(result.parsed.phases_to_reset);
        assert.ok(result.parsed.phases_to_reset.length > 0);
    });

    // TC-RB-16
    it('TC-RB-16: declined confirmation makes no state changes', () => {
        const originalState = readStateFromDisk(tmpDir);
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements']); // no --confirm
        const afterState = readStateFromDisk(tmpDir);
        assert.equal(afterState.state_version, originalState.state_version);
        assert.equal(afterState.active_workflow.current_phase, originalState.active_workflow.current_phase);
    });

    // 2.4 Recovery Feedback

    // TC-RB-17
    it('TC-RB-17: output includes from_phase and to_phase', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.parsed.from_phase, '06-implementation');
        assert.equal(result.parsed.to_phase, '01-requirements');
    });

    // TC-RB-18
    it('TC-RB-18: output includes phases_reset list', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.ok(Array.isArray(result.parsed.phases_reset));
        assert.ok(result.parsed.phases_reset.length > 0);
        // Each entry should have phase, old_status, new_status
        const first = result.parsed.phases_reset[0];
        assert.ok('phase' in first);
        assert.ok('old_status' in first);
        assert.ok('new_status' in first);
    });

    // TC-RB-19
    it('TC-RB-19: output includes artifacts_preserved true', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.parsed.artifacts_preserved, true);
    });

    // TC-RB-20
    it('TC-RB-20: output includes rollback_count', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(typeof result.parsed.rollback_count, 'number');
    });

    // TC-RB-21
    it('TC-RB-21: feedback message lists reset phases', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.ok(result.parsed.message.includes('pending'));
    });

    // 2.5 Rollback Count Tracking

    // TC-RB-22
    it('TC-RB-22: first rollback sets rollback_count to 1', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.rollback_count, 1);
    });

    // TC-RB-23
    it('TC-RB-23: second rollback increments to 2', () => {
        const state = baseWorkflowState();
        state.active_workflow.rollback_count = 1;
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const newState = readStateFromDisk(tmpDir);
        assert.equal(newState.active_workflow.rollback_count, 2);
    });

    // TC-RB-24 (rollback_count doesn't block gate - structural verification)
    it('TC-RB-24: rollback_count does not block gate', () => {
        const state = baseWorkflowState();
        state.active_workflow.rollback_count = 5;
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.parsed.result, 'ROLLED_BACK');
        assert.equal(readStateFromDisk(tmpDir).active_workflow.rollback_count, 6);
    });

    // 2.6 Recovery Action Flag for Rollback

    // TC-RB-25
    it('TC-RB-25: sets recovery_action with type rollback', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.recovery_action.type, 'rollback');
    });

    // TC-RB-26
    it('TC-RB-26: recovery_action includes target phase', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        assert.equal(state.active_workflow.recovery_action.phase, '01-requirements');
    });

    // TC-RB-27
    it('TC-RB-27: recovery_action includes ISO-8601 timestamp', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);
        const ts = state.active_workflow.recovery_action.timestamp;
        assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts));
    });
});

// --- E2E Tests ---

describe('workflow-rollback E2E tests', () => {
    let tmpDir;

    beforeEach(() => { tmpDir = setupTestEnv(baseWorkflowState()); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    // TC-E2E-RB-01
    it('TC-E2E-RB-01: successful rollback outputs valid JSON', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.exitCode, 0);
        assert.notEqual(result.parsed, null);
        assert.equal(result.parsed.result, 'ROLLED_BACK');
    });

    // TC-E2E-RB-02
    it('TC-E2E-RB-02: rollback with no workflow exits with code 1', () => {
        const state = { project_name: 'test', state_version: 5, phases: {} };
        fs.writeFileSync(path.join(tmpDir, '.isdlc', 'state.json'), JSON.stringify(state, null, 2));

        const result = runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        assert.equal(result.exitCode, 1);
        assert.equal(result.parsed.result, 'ERROR');
    });

    // TC-E2E-RB-03
    it('TC-E2E-RB-03: rollback modifies state.json on disk correctly', () => {
        runRollbackScript(tmpDir, ['--to-phase', '01-requirements', '--confirm']);
        const state = readStateFromDisk(tmpDir);

        // Current phase changed
        assert.equal(state.active_workflow.current_phase, '01-requirements');
        assert.equal(state.active_workflow.current_phase_index, 0);

        // Target phase is in_progress
        assert.equal(state.active_workflow.phase_status['01-requirements'], 'in_progress');

        // Subsequent phases are pending
        assert.equal(state.active_workflow.phase_status['02-impact-analysis'], 'pending');
        assert.equal(state.active_workflow.phase_status['03-architecture'], 'pending');

        // Iteration state cleared for target
        if (state.phases['01-requirements']) {
            assert.equal(state.phases['01-requirements'].constitutional_validation, undefined);
        }

        // state_version bumped
        assert.ok(state.state_version >= 43);
    });

    // TC-E2E-RB-04
    it('TC-E2E-RB-04: rollback to invalid phase exits with error', () => {
        const result = runRollbackScript(tmpDir, ['--to-phase', '99-nonexistent', '--confirm']);
        assert.notEqual(result.exitCode, 0);
        assert.equal(result.parsed.result, 'ERROR');
    });
});
