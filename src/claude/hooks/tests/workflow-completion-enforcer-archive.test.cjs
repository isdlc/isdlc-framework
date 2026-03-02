/**
 * Subprocess integration tests for workflow-completion-enforcer.cjs
 * Tests: ENF-01 through ENF-10 from GH-39 test-strategy.md
 *
 * These tests exercise the enforcer as a subprocess using stdin/stdout
 * protocol (Article XI.2), verifying the archive + prune integration.
 *
 * TDD: Written FIRST, before implementation changes.
 * Traces to: FR-005, FR-010, NFR-001, NFR-007
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ENFORCER_PATH = path.resolve(__dirname, '..', 'workflow-completion-enforcer.cjs');

// Helper: create temp test environment with state.json
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enf-archive-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

function writeState(tmpDir, state) {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readStateFromDisk(tmpDir) {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function readArchiveFromDisk(tmpDir) {
    const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
    if (!fs.existsSync(archivePath)) return null;
    return JSON.parse(fs.readFileSync(archivePath, 'utf8'));
}

// Run the enforcer as a subprocess with given input
function runEnforcer(tmpDir, input) {
    const stdinData = JSON.stringify(input);
    try {
        const result = execSync(`node "${ENFORCER_PATH}"`, {
            input: stdinData,
            env: {
                ...process.env,
                CLAUDE_PROJECT_DIR: tmpDir,
                SKILL_VALIDATOR_DEBUG: 'true'
            },
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return { stdout: result.toString(), exitCode: 0 };
    } catch (err) {
        return { stdout: err.stdout?.toString() || '', exitCode: err.status || 1 };
    }
}

// Factory: state with recent completed workflow (no snapshots)
function stateWithRecentCompletion(tmpDir, overrides = {}) {
    const now = new Date();
    const recentTimestamp = now.toISOString();

    return {
        framework_version: '0.1.0-alpha',
        state_version: 42,
        project: { name: 'test' },
        constitution: { enforced: true },
        workflow: { track: 'auto' },
        skill_enforcement: { enabled: true },
        autonomous_iteration: { enabled: true },
        cloud_configuration: { provider: 'none' },
        discovery_context: { completed_at: '2026-02-01' },
        counters: { req: 5 },
        complexity_assessment: { level: 'small' },
        active_workflow: null,  // Workflow completed
        current_phase: '08-code-review',
        active_agent: 'code-reviewer',
        phases: {
            '01-requirements': { status: 'completed', started: '2026-02-01T10:00:00Z', completed: '2026-02-01T10:30:00Z' },
            '06-implementation': { status: 'completed', started: '2026-02-01T10:30:00Z', completed: '2026-02-01T11:00:00Z' }
        },
        blockers: [],
        pending_escalations: [],
        pending_delegation: null,
        skill_usage_log: [],
        history: [],
        workflow_history: [{
            id: 'REQ-0001',
            type: 'feature',
            description: 'Test feature',
            artifact_folder: 'feature-test',
            started_at: '2026-02-01T10:00:00Z',
            completed_at: recentTimestamp,
            status: 'completed',
            phases: ['01-requirements', '06-implementation'],
            git_branch: {
                name: 'feature/test',
                created_from: 'main',
                status: 'merged',
                merged_at: recentTimestamp,
                merge_commit: 'abc123'
            },
            // Missing phase_snapshots and metrics -- triggers enforcer
            ...overrides
        }]
    };
}

// Standard hook input for state.json write
function makeHookInput(tmpDir) {
    return {
        tool_name: 'Write',
        tool_input: {
            file_path: path.join(tmpDir, '.isdlc', 'state.json')
        },
        tool_result: 'ok'
    };
}

describe('Enforcer: Archive Integration (Subprocess)', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ENF-01: Enforcer calls clearTransientFields after prune
    it('ENF-01: transient fields are cleared after enforcer runs', () => {
        const state = stateWithRecentCompletion(tmpDir);
        writeState(tmpDir, state);

        const result = runEnforcer(tmpDir, makeHookInput(tmpDir));
        assert.equal(result.exitCode, 0);

        const finalState = readStateFromDisk(tmpDir);
        assert.equal(finalState.current_phase, null);
        assert.equal(finalState.active_agent, null);
        assert.deepEqual(finalState.phases, {});
        assert.deepEqual(finalState.blockers, []);
        assert.deepEqual(finalState.pending_escalations, []);
        assert.equal(finalState.pending_delegation, null);
    });

    // ENF-02: Enforcer uses updated retention limits
    it('ENF-02: skill_usage_log is capped at 50 after enforcer runs', () => {
        const entries = [];
        for (let i = 0; i < 60; i++) {
            entries.push({ timestamp: '2026-02-01T10:00:00Z', agent: `a-${i}`, description: `e-${i}` });
        }
        const state = stateWithRecentCompletion(tmpDir);
        state.skill_usage_log = entries;
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const finalState = readStateFromDisk(tmpDir);
        assert.equal(finalState.skill_usage_log.length, 50);
    });

    // ENF-03: Enforcer archives completed workflow (merged)
    it('ENF-03: creates archive record for completed merged workflow', () => {
        const state = stateWithRecentCompletion(tmpDir);
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const archive = readArchiveFromDisk(tmpDir);
        assert.ok(archive, 'Archive file should exist');
        assert.equal(archive.records.length, 1);
        assert.equal(archive.records[0].outcome, 'merged');
        assert.equal(archive.records[0].source_id, 'REQ-0001');
        assert.equal(archive.records[0].slug, 'feature-test');
    });

    // ENF-04: Enforcer archives cancelled workflow
    it('ENF-04: creates archive record with outcome=cancelled for cancelled workflow', () => {
        const now = new Date().toISOString();
        const state = stateWithRecentCompletion(tmpDir, {
            status: 'cancelled',
            cancellation_reason: 'Stale workflow',
            completed_at: undefined,
            cancelled_at: now,
            git_branch: { name: 'feature/test', status: 'active' }
        });
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const archive = readArchiveFromDisk(tmpDir);
        assert.ok(archive, 'Archive file should exist');
        assert.equal(archive.records[0].outcome, 'cancelled');
        assert.equal(archive.records[0].reason, 'Stale workflow');
    });

    // ENF-05: Enforcer archives completed with null reason
    it('ENF-05: completed workflow has null reason in archive', () => {
        const state = stateWithRecentCompletion(tmpDir);
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records[0].reason, null);
    });

    // ENF-06: Archive error does not block state write
    it('ENF-06: state is still pruned when archive path is unwritable', () => {
        const state = stateWithRecentCompletion(tmpDir);
        state.current_phase = '06-implementation';
        state.active_agent = 'developer';
        writeState(tmpDir, state);

        // Make the archive file read-only and in a read-only subdir
        // Note: The enforcer should handle this gracefully
        const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
        fs.writeFileSync(archivePath, 'corrupt-data-to-trigger-error');
        // The enforcer should still complete and prune state
        // Even if archive has issues, the enforcer catches errors

        const result = runEnforcer(tmpDir, makeHookInput(tmpDir));
        assert.equal(result.exitCode, 0);

        // State should still be pruned
        const finalState = readStateFromDisk(tmpDir);
        assert.equal(finalState.current_phase, null);
        assert.deepEqual(finalState.phases, {});
    });

    // ENF-07: Guard: already has snapshots -- no prune/archive
    it('ENF-07: skips prune and archive when entry already has snapshots + metrics', () => {
        const now = new Date().toISOString();
        const state = stateWithRecentCompletion(tmpDir, {
            phase_snapshots: [{ key: '01-requirements', status: 'completed' }],
            metrics: { total_phases: 2, phases_completed: 2 }
        });
        state.current_phase = '08-code-review'; // Still has transient data
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const finalState = readStateFromDisk(tmpDir);

        // Should NOT have cleared transient fields (guard exited early)
        assert.equal(finalState.current_phase, '08-code-review');

        // Archive should NOT have been created
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive, null);
    });

    // ENF-08: Guard: stale entry (> 2 min old)
    it('ENF-08: skips remediation for entries older than 2 minutes', () => {
        const staleTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 min ago
        const state = stateWithRecentCompletion(tmpDir);
        state.workflow_history[0].completed_at = staleTimestamp;
        state.current_phase = '06-impl';
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const finalState = readStateFromDisk(tmpDir);

        // Should NOT have cleared transient fields (guard exited early)
        assert.equal(finalState.current_phase, '06-impl');
    });

    // ENF-09: Multi-key index in archive
    it('ENF-09: archive index contains both source_id and slug keys', () => {
        const state = stateWithRecentCompletion(tmpDir);
        writeState(tmpDir, state);

        runEnforcer(tmpDir, makeHookInput(tmpDir));
        const archive = readArchiveFromDisk(tmpDir);
        assert.ok(archive, 'Archive should exist');
        assert.deepEqual(archive.index['REQ-0001'], [0]);
        assert.deepEqual(archive.index['feature-test'], [0]);
    });

    // ENF-10: Full flow: self-heal + prune + clear + archive + write
    it('ENF-10: full flow produces pruned state and archive record', () => {
        const state = stateWithRecentCompletion(tmpDir);
        // Add data to be pruned
        const skillEntries = [];
        for (let i = 0; i < 60; i++) {
            skillEntries.push({ timestamp: '2026-02-01T10:00:00Z', agent: `a-${i}`, description: `e-${i}` });
        }
        state.skill_usage_log = skillEntries;
        state.current_phase = '08-code-review';
        state.active_agent = 'code-reviewer';
        state.blockers = [{ type: 'test' }];
        state.pending_escalations = [{ type: 'esc' }];
        state.pending_delegation = { target: 'agent-08' };
        writeState(tmpDir, state);

        const result = runEnforcer(tmpDir, makeHookInput(tmpDir));
        assert.equal(result.exitCode, 0);
        // Enforcer should not produce stdout (hook protocol)
        assert.equal(result.stdout.trim(), '');

        const finalState = readStateFromDisk(tmpDir);

        // Verify self-heal: snapshots and metrics added
        const lastEntry = finalState.workflow_history[finalState.workflow_history.length - 1];
        assert.ok(Array.isArray(lastEntry.phase_snapshots), 'Should have phase_snapshots');
        assert.ok(lastEntry.metrics, 'Should have metrics');

        // Verify prune: skill_usage_log capped at 50
        assert.equal(finalState.skill_usage_log.length, 50);

        // Verify clear: transient fields reset
        assert.equal(finalState.current_phase, null);
        assert.equal(finalState.active_agent, null);
        assert.deepEqual(finalState.phases, {});
        assert.deepEqual(finalState.blockers, []);
        assert.deepEqual(finalState.pending_escalations, []);
        assert.equal(finalState.pending_delegation, null);

        // Verify archive: record created
        const archive = readArchiveFromDisk(tmpDir);
        assert.ok(archive, 'Archive file should exist');
        assert.equal(archive.records.length, 1);
        assert.equal(archive.records[0].slug, 'feature-test');

        // Verify durable fields preserved
        assert.equal(finalState.framework_version, '0.1.0-alpha');
        assert.deepEqual(finalState.project, { name: 'test' });
    });
});
