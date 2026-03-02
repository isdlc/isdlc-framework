/**
 * Integration tests for archive + prune functions in common.cjs
 * Tests: INT-01 through INT-12 from GH-39 test-strategy.md
 *
 * Multi-function integration tests with real filesystem operations.
 *
 * TDD: Written FIRST, before implementation.
 * Traces to: FR-002, FR-005, FR-009, FR-010, NFR-001 through NFR-010
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper: create temp test environment
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-int-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

// Load common.cjs with CLAUDE_PROJECT_DIR override
function loadCommon(tmpDir) {
    const commonPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');
    delete require.cache[commonPath];
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    return require(commonPath);
}

// Factory: archive record
function makeArchiveRecord(overrides = {}) {
    return {
        source_id: 'GH-39',
        slug: 'state-json-pruning-GH-39',
        workflow_type: 'feature',
        completed_at: '2026-02-21T15:00:00Z',
        branch: 'feature/state-json-pruning-GH-39',
        outcome: 'completed',
        reason: null,
        phase_summary: [{ phase: '01-requirements', status: 'completed', summary: null }],
        metrics: { total_phases: 4 },
        ...overrides
    };
}

// Factory: legacy workflow_history entry
function makeLegacyHistoryEntry(overrides = {}) {
    return {
        id: 'REQ-0001',
        type: 'feature',
        description: 'Test feature',
        artifact_folder: 'feature-test-GH-1',
        started_at: '2026-02-01T10:00:00Z',
        completed_at: '2026-02-01T12:00:00Z',
        status: 'completed',
        git_branch: {
            name: 'feature/test',
            created_from: 'main',
            created_at: '2026-02-01T10:00:00Z',
            status: 'merged',
            merged_at: '2026-02-01T12:00:00Z',
            merge_commit: 'abc123'
        },
        phase_snapshots: [
            {
                key: '01-requirements',
                status: 'completed',
                summary: 'Done',
                timing: { started: '2026-02-01T10:00:00Z', ended: '2026-02-01T10:30:00Z' },
                gate_passed: true
            }
        ],
        metrics: { total_phases: 3, phases_completed: 3 },
        ...overrides
    };
}

// Factory: generate N skill_usage_log entries
function makeSkillEntries(count) {
    const entries = [];
    for (let i = 0; i < count; i++) {
        entries.push({
            timestamp: `2026-02-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
            agent: `agent-${i}`,
            description: `entry ${i}`
        });
    }
    return entries;
}

// Factory: generate N history entries
function makeHistoryEntries(count, actionLength = 50) {
    const entries = [];
    for (let i = 0; i < count; i++) {
        entries.push({
            timestamp: `2026-02-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
            agent: `agent-${i}`,
            action: 'a'.repeat(actionLength) + `-${i}`
        });
    }
    return entries;
}

// Factory: generate N workflow_history entries
function makeWorkflowHistoryEntries(count) {
    const entries = [];
    for (let i = 0; i < count; i++) {
        entries.push(makeLegacyHistoryEntry({
            id: `REQ-${String(i).padStart(4, '0')}`,
            artifact_folder: `feature-${i}`,
            completed_at: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`
        }));
    }
    return entries;
}

// Factory: realistic bloated state
function bloatedState() {
    return {
        // Durable fields
        framework_version: '0.1.0-alpha',
        state_version: 42,
        project: { name: 'test', created: '2026-01-01', is_new_project: false },
        constitution: { enforced: true, path: 'docs/isdlc/constitution.md' },
        workflow: { track: 'auto', track_name: 'Orchestrator-managed' },
        skill_enforcement: { enabled: true, mode: 'observe' },
        autonomous_iteration: { enabled: true, max_iterations: 10 },
        cloud_configuration: { provider: 'none' },
        discovery_context: { completed_at: '2026-02-01', version: '1.0' },
        counters: { req: 10, bug: 5 },
        complexity_assessment: { level: 'large' },
        // Arrays to be pruned
        skill_usage_log: makeSkillEntries(25),
        history: makeHistoryEntries(120),
        workflow_history: makeWorkflowHistoryEntries(18),
        // Transient fields
        current_phase: '08-code-review',
        active_agent: 'code-reviewer',
        phases: {
            '01-requirements': {
                status: 'completed',
                gate_passed: true,
                iteration_requirements: { test: true },
                constitutional_validation: { completed: true }
            },
            '06-implementation': {
                status: 'completed',
                gate_passed: true,
                iteration_requirements: { test: true }
            }
        },
        blockers: [{ type: 'gate', message: 'test' }],
        pending_escalations: [{ type: 'timeout', agent: 'test' }],
        pending_delegation: { target: 'agent-08', phase: '08-code-review' }
    };
}

// Read archive from disk
function readArchiveFromDisk(tmpDir) {
    const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
    return JSON.parse(fs.readFileSync(archivePath, 'utf8'));
}

// =====================================================================
// Full Prune + Clear Sequence
// =====================================================================

describe('Integration: Full Prune + Clear Sequence', () => {
    let tmpDir;
    let common;

    beforeEach(() => {
        tmpDir = setupTestEnv();
        common = loadCommon(tmpDir);
    });

    afterEach(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // INT-01: Full sequence on realistic state
    it('INT-01: full prune + clear sequence on bloated state', () => {
        const state = bloatedState();

        // Run full prune sequence
        common.pruneSkillUsageLog(state);
        common.pruneCompletedPhases(state, []);
        common.pruneHistory(state);
        common.pruneWorkflowHistory(state);
        common.clearTransientFields(state);

        // Verify arrays are FIFO-capped
        assert.ok(state.skill_usage_log.length <= 50);
        assert.ok(state.history.length <= 100);
        assert.ok(state.workflow_history.length <= 50);

        // Verify transient fields cleared
        assert.equal(state.current_phase, null);
        assert.equal(state.active_agent, null);
        assert.deepEqual(state.phases, {});
        assert.deepEqual(state.blockers, []);
        assert.deepEqual(state.pending_escalations, []);
        assert.equal(state.pending_delegation, null);

        // Verify durable fields preserved
        assert.equal(state.framework_version, '0.1.0-alpha');
        assert.equal(state.state_version, 42);
        assert.deepEqual(state.project, { name: 'test', created: '2026-01-01', is_new_project: false });
    });

    // INT-02: Idempotent prune sequence
    it('INT-02: prune sequence is idempotent', () => {
        const state = bloatedState();

        // First pass
        common.pruneSkillUsageLog(state);
        common.pruneCompletedPhases(state, []);
        common.pruneHistory(state);
        common.pruneWorkflowHistory(state);
        common.clearTransientFields(state);
        const firstPass = JSON.parse(JSON.stringify(state));

        // Second pass
        common.pruneSkillUsageLog(state);
        common.pruneCompletedPhases(state, []);
        common.pruneHistory(state);
        common.pruneWorkflowHistory(state);
        common.clearTransientFields(state);

        // Compare: ignore _pruned_at timestamps (they will differ)
        // Normalize both by removing _pruned_at fields
        const normalize = (obj) => {
            const copy = JSON.parse(JSON.stringify(obj));
            if (copy.phases) {
                for (const key of Object.keys(copy.phases)) {
                    delete copy.phases[key]._pruned_at;
                }
            }
            return copy;
        };

        // After clearTransientFields, phases is {}, so _pruned_at is already gone
        assert.deepEqual(state.current_phase, firstPass.current_phase);
        assert.deepEqual(state.active_agent, firstPass.active_agent);
        assert.deepEqual(state.phases, firstPass.phases);
        assert.equal(state.skill_usage_log.length, firstPass.skill_usage_log.length);
        assert.equal(state.history.length, firstPass.history.length);
        assert.equal(state.workflow_history.length, firstPass.workflow_history.length);
    });

    // INT-03: Durable field protection (all 12 fields)
    it('INT-03: all durable fields preserved after full prune + clear', () => {
        const state = bloatedState();
        const durableFields = [
            'framework_version', 'state_version', 'project', 'constitution',
            'workflow', 'skill_enforcement', 'autonomous_iteration',
            'cloud_configuration', 'discovery_context', 'counters',
            'complexity_assessment'
        ];
        const snapshot = {};
        for (const field of durableFields) {
            snapshot[field] = JSON.parse(JSON.stringify(state[field]));
        }

        common.pruneSkillUsageLog(state);
        common.pruneCompletedPhases(state, []);
        common.pruneHistory(state);
        common.pruneWorkflowHistory(state);
        common.clearTransientFields(state);

        for (const field of durableFields) {
            assert.deepEqual(state[field], snapshot[field], `Durable field "${field}" was modified`);
        }
    });

    // INT-04: Prune error does not block clear
    it('INT-04: clearTransientFields runs even when prune encounters bad input', () => {
        const state = {
            skill_usage_log: null,  // non-array
            history: 'not-array',    // wrong type
            workflow_history: null,
            phases: {},
            current_phase: '06-implementation',
            active_agent: 'dev',
            blockers: [{ type: 'test' }],
            pending_escalations: [{ type: 'esc' }],
            pending_delegation: { target: 'agent' }
        };

        // These should not throw
        common.pruneSkillUsageLog(state);
        common.pruneCompletedPhases(state, []);
        common.pruneHistory(state);
        common.pruneWorkflowHistory(state);

        // clearTransientFields should still work
        common.clearTransientFields(state);
        assert.equal(state.current_phase, null);
        assert.equal(state.active_agent, null);
        assert.deepEqual(state.blockers, []);
    });
});

// =====================================================================
// Archive Write Path Integration
// =====================================================================

describe('Integration: Archive Write Path', () => {
    let tmpDir;
    let common;

    beforeEach(() => {
        tmpDir = setupTestEnv();
        common = loadCommon(tmpDir);
    });

    afterEach(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // INT-05: Archive-first-then-prune ordering
    it('INT-05: archive captures pre-prune data, state has post-prune data', () => {
        const state = bloatedState();
        const lastEntry = state.workflow_history[state.workflow_history.length - 1];

        // Build archive record from state BEFORE prune
        const archiveRecord = makeArchiveRecord({
            source_id: lastEntry.id,
            slug: lastEntry.artifact_folder,
            completed_at: lastEntry.completed_at
        });

        // Archive FIRST
        common.appendToArchive(archiveRecord);

        // Then prune
        common.clearTransientFields(state);

        // Verify archive has pre-prune data
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records[0].source_id, lastEntry.id);

        // Verify state has post-prune data
        assert.equal(state.current_phase, null);
        assert.deepEqual(state.phases, {});
    });

    // INT-06: seedArchiveFromHistory + FIFO prune
    it('INT-06: seed archive from history, then FIFO prune state', () => {
        const state = bloatedState();
        const historyBefore = state.workflow_history.length;

        // Seed archive from existing workflow_history
        common.seedArchiveFromHistory(state.workflow_history);

        // Prune the state
        common.pruneWorkflowHistory(state);

        // Archive should have all entries
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, historyBefore);

        // State should be capped
        assert.ok(state.workflow_history.length <= 50);
    });

    // INT-07: Migration flag idempotency (single-entry case)
    // Dedup is O(1): only checks the LAST record in archive.
    // For full idempotency, callers must use a migration flag to avoid re-seeding.
    // This test verifies the single-entry dedup case (same record appended twice).
    it('INT-07: single-entry seed call is idempotent via dedup', () => {
        const history = [
            makeLegacyHistoryEntry({
                id: 'REQ-0001',
                artifact_folder: 'f-1',
                completed_at: '2026-02-01T10:00:00Z'
            })
        ];

        // First seed
        common.seedArchiveFromHistory(history);
        const archive1 = readArchiveFromDisk(tmpDir);
        assert.equal(archive1.records.length, 1);

        // Second seed (simulating migration re-run with single entry)
        // Dedup: last record in archive matches slug + completed_at -> skip
        common.seedArchiveFromHistory(history);
        const archive2 = readArchiveFromDisk(tmpDir);
        assert.equal(archive2.records.length, 1);
    });

    // INT-08: Archive write failure does not block state prune
    it('INT-08: state is still pruned when archive write fails', () => {
        const state = bloatedState();

        // Make archive path unwritable
        const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
        fs.writeFileSync(archivePath, '{}');
        try {
            fs.chmodSync(path.join(tmpDir, '.isdlc'), 0o444);

            // Archive will fail silently (fail-open)
            common.appendToArchive(makeArchiveRecord());

            // State prune should still work
            common.clearTransientFields(state);
            assert.equal(state.current_phase, null);
            assert.deepEqual(state.phases, {});
        } finally {
            fs.chmodSync(path.join(tmpDir, '.isdlc'), 0o755);
        }
    });
});

// =====================================================================
// NFR Validation (Performance and Size)
// =====================================================================

describe('Integration: NFR Validation', () => {
    let tmpDir;
    let common;

    beforeEach(() => {
        tmpDir = setupTestEnv();
        common = loadCommon(tmpDir);
    });

    afterEach(() => {
        delete process.env.CLAUDE_PROJECT_DIR;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // INT-09: Prune performance on realistic state
    it('INT-09: full prune sequence completes within 50ms', () => {
        // Build a realistically sized state
        const state = {
            skill_usage_log: makeSkillEntries(60),
            history: makeHistoryEntries(150),
            workflow_history: makeWorkflowHistoryEntries(20),
            phases: {},
            current_phase: 'test',
            active_agent: 'test',
            blockers: [],
            pending_escalations: [],
            pending_delegation: null
        };
        // Add phases with verbose data
        for (let i = 0; i < 6; i++) {
            state.phases[`0${i + 1}-phase`] = {
                status: 'completed',
                gate_passed: true,
                iteration_requirements: { data: 'x'.repeat(200) },
                constitutional_validation: { data: 'x'.repeat(200) }
            };
        }

        const times = [];
        for (let run = 0; run < 10; run++) {
            const copy = JSON.parse(JSON.stringify(state));
            const start = performance.now();
            common.pruneSkillUsageLog(copy);
            common.pruneCompletedPhases(copy, []);
            common.pruneHistory(copy);
            common.pruneWorkflowHistory(copy);
            common.clearTransientFields(copy);
            times.push(performance.now() - start);
        }

        // Sort and take p95
        times.sort((a, b) => a - b);
        const p95 = times[Math.floor(times.length * 0.95)];
        assert.ok(p95 < 50, `p95 prune time ${p95.toFixed(2)}ms exceeds 50ms threshold`);
    });

    // INT-10: State size after prune
    // NFR-005: pruned state.json with 50 workflow_history entries should be under budget.
    // After pruning: skill_usage_log capped to 50, history capped to 100,
    // workflow_history capped to 50 with git_branch compacted to { name }.
    // The threshold accounts for all arrays combined.
    it('INT-10: pruned state with 50 workflow_history entries is under 50 KB', () => {
        // Create lean workflow_history entries (post-archival: no phase_snapshots)
        const leanEntries = [];
        for (let i = 0; i < 50; i++) {
            leanEntries.push({
                id: `REQ-${String(i).padStart(4, '0')}`,
                type: 'feature',
                description: `Feature ${i}`,
                artifact_folder: `f-${i}`,
                started_at: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
                completed_at: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
                status: 'completed',
                git_branch: {
                    name: `feature/f-${i}`,
                    created_from: 'main',
                    status: 'merged'
                }
            });
        }
        const state = {
            framework_version: '0.1.0-alpha',
            state_version: 42,
            project: { name: 'test', created: '2026-01-01' },
            constitution: { enforced: true },
            workflow: { track: 'auto' },
            skill_enforcement: { enabled: true },
            autonomous_iteration: { enabled: true },
            cloud_configuration: { provider: 'none' },
            discovery_context: { completed_at: '2026-02-01' },
            counters: { req: 50 },
            complexity_assessment: { level: 'large' },
            skill_usage_log: makeSkillEntries(60),
            history: makeHistoryEntries(150),
            workflow_history: leanEntries,
            current_phase: 'test',
            active_agent: 'test',
            phases: {},
            blockers: [],
            pending_escalations: [],
            pending_delegation: null
        };

        common.pruneSkillUsageLog(state);
        common.pruneCompletedPhases(state, []);
        common.pruneHistory(state);
        common.pruneWorkflowHistory(state);
        common.clearTransientFields(state);

        const sizeBytes = Buffer.byteLength(JSON.stringify(state, null, 2));
        // Budget: 50 KB after full prune (50 workflow_history + 100 history + 50 skill_usage_log + durable fields)
        assert.ok(sizeBytes < 51200, `State size ${sizeBytes} bytes exceeds 50 KB threshold`);
    });

    // INT-11: Archive append performance on 200 KB file
    it('INT-11: archive append on 100-record archive completes within 100ms', () => {
        // Build a 100-record archive
        const archive = { version: 1, records: [], index: {} };
        for (let i = 0; i < 100; i++) {
            archive.records.push(makeArchiveRecord({
                source_id: `GH-${i}`,
                slug: `workflow-${i}`,
                completed_at: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
                phase_summary: Array(5).fill({ phase: 'p', status: 'completed', summary: 'x'.repeat(50) }),
                metrics: { total_phases: 5, data: 'x'.repeat(100) }
            }));
        }
        const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
        fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));

        const times = [];
        for (let run = 0; run < 10; run++) {
            const record = makeArchiveRecord({
                slug: `perf-test-${run}`,
                completed_at: `2026-03-${String(run + 1).padStart(2, '0')}T10:00:00Z`
            });
            const start = performance.now();
            common.appendToArchive(record);
            times.push(performance.now() - start);
        }

        times.sort((a, b) => a - b);
        const p95 = times[Math.floor(times.length * 0.95)];
        assert.ok(p95 < 100, `p95 archive append time ${p95.toFixed(2)}ms exceeds 100ms threshold`);
    });

    // INT-12: Monorepo archive isolation
    it('INT-12: archives in separate project dirs do not cross-contaminate', () => {
        // Create two separate temp dirs simulating two projects
        const tmpDir1 = setupTestEnv();
        const tmpDir2 = setupTestEnv();

        try {
            // Load common for project 1
            const common1 = loadCommon(tmpDir1);
            common1.appendToArchive(makeArchiveRecord({ slug: 'project1-workflow' }));

            // Load common for project 2
            const common2 = loadCommon(tmpDir2);
            common2.appendToArchive(makeArchiveRecord({
                slug: 'project2-workflow',
                completed_at: '2026-02-22T10:00:00Z'
            }));

            // Verify isolation
            const archive1 = readArchiveFromDisk(tmpDir1);
            const archive2 = readArchiveFromDisk(tmpDir2);

            assert.equal(archive1.records.length, 1);
            assert.equal(archive1.records[0].slug, 'project1-workflow');
            assert.equal(archive2.records.length, 1);
            assert.equal(archive2.records[0].slug, 'project2-workflow');
        } finally {
            fs.rmSync(tmpDir1, { recursive: true, force: true });
            fs.rmSync(tmpDir2, { recursive: true, force: true });
        }
    });
});
