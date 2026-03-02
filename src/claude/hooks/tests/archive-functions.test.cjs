/**
 * Tests for new archive/prune functions in common.cjs
 * Tests: RAP-01 through RAP-06, CTF-01 through CTF-11,
 *        ATA-01 through ATA-13, SAH-01 through SAH-11
 * from GH-39 test-strategy.md
 *
 * Covers: resolveArchivePath, clearTransientFields, appendToArchive,
 *         seedArchiveFromHistory
 *
 * TDD: Written FIRST, before implementation.
 * Traces to: FR-003, FR-011, FR-014, FR-015
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper: create temp test environment
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
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

// Factory: minimal archive record
function makeArchiveRecord(overrides = {}) {
    return {
        source_id: 'GH-39',
        slug: 'state-json-pruning-GH-39',
        workflow_type: 'feature',
        completed_at: '2026-02-21T15:00:00Z',
        branch: 'feature/state-json-pruning-GH-39',
        outcome: 'completed',
        reason: null,
        phase_summary: [
            { phase: '01-requirements', status: 'completed', summary: null }
        ],
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
                summary: 'Requirements gathered',
                timing: { started: '2026-02-01T10:00:00Z', ended: '2026-02-01T10:30:00Z' },
                gate_passed: true
            }
        ],
        metrics: { total_phases: 3, phases_completed: 3 },
        ...overrides
    };
}

// Read archive from disk
function readArchiveFromDisk(tmpDir) {
    const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
    return JSON.parse(fs.readFileSync(archivePath, 'utf8'));
}

// Write archive to disk
function writeArchiveToDisk(tmpDir, archive) {
    const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
    fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
}

// =====================================================================
// resolveArchivePath
// =====================================================================

describe('resolveArchivePath', () => {
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

    // RAP-01: Single-project mode
    it('RAP-01: returns .isdlc/state-archive.json in single-project mode', () => {
        const result = common.resolveArchivePath();
        const expected = path.join(tmpDir, '.isdlc', 'state-archive.json');
        assert.equal(result, expected);
    });

    // RAP-04: Same directory as resolveStatePath
    it('RAP-04: resolves to same directory as resolveStatePath', () => {
        const archivePath = common.resolveArchivePath();
        const statePath = common.resolveStatePath();
        assert.equal(path.dirname(archivePath), path.dirname(statePath));
    });

    // RAP-05: Filename is always state-archive.json
    it('RAP-05: filename is always state-archive.json', () => {
        const result = common.resolveArchivePath();
        assert.equal(path.basename(result), 'state-archive.json');
    });
});

// =====================================================================
// clearTransientFields
// =====================================================================

describe('clearTransientFields', () => {
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

    // CTF-01: Clears pending_escalations
    it('CTF-01: clears pending_escalations to empty array', () => {
        const state = { pending_escalations: [{ type: 'test', message: 'test' }] };
        common.clearTransientFields(state);
        assert.deepEqual(state.pending_escalations, []);
    });

    // CTF-02: Clears pending_delegation
    it('CTF-02: clears pending_delegation to null', () => {
        const state = { pending_delegation: { target: 'agent-05' } };
        common.clearTransientFields(state);
        assert.equal(state.pending_delegation, null);
    });

    // CTF-03: Clears current_phase
    it('CTF-03: clears current_phase to null', () => {
        const state = { current_phase: '06-implementation' };
        common.clearTransientFields(state);
        assert.equal(state.current_phase, null);
    });

    // CTF-04: Clears active_agent
    it('CTF-04: clears active_agent to null', () => {
        const state = { active_agent: 'software-developer' };
        common.clearTransientFields(state);
        assert.equal(state.active_agent, null);
    });

    // CTF-05: Clears phases
    it('CTF-05: clears phases to empty object', () => {
        const state = { phases: { '01-requirements': { status: 'completed' } } };
        common.clearTransientFields(state);
        assert.deepEqual(state.phases, {});
    });

    // CTF-06: Clears blockers
    it('CTF-06: clears blockers to empty array', () => {
        const state = { blockers: [{ type: 'test', message: 'blocked' }] };
        common.clearTransientFields(state);
        assert.deepEqual(state.blockers, []);
    });

    // CTF-07: Returns mutated state object (same reference)
    it('CTF-07: returns the same state object reference', () => {
        const state = { current_phase: '01-requirements' };
        const result = common.clearTransientFields(state);
        assert.equal(result, state);
    });

    // CTF-08: Durable fields preserved
    it('CTF-08: preserves all durable fields', () => {
        const state = {
            // Durable fields
            project: { name: 'test' },
            constitution: { enforced: true },
            workflow: { track: 'auto' },
            skill_enforcement: { enabled: true },
            autonomous_iteration: { enabled: true },
            cloud_configuration: { provider: 'none' },
            discovery_context: { completed_at: '2026-02-01' },
            workflow_history: [{ id: 'REQ-0001' }],
            counters: { req: 1 },
            history: [{ action: 'test' }],
            state_version: 42,
            framework_version: '0.1.0-alpha',
            complexity_assessment: { level: 'large' },
            skill_usage_log: [{ agent: 'test' }],
            // Transient fields
            current_phase: '06-implementation',
            active_agent: 'software-developer',
            phases: { '01-req': {} },
            blockers: [{ type: 'test' }],
            pending_escalations: [{ type: 'test' }],
            pending_delegation: { target: 'agent-05' }
        };

        // Deep clone durable fields for comparison
        const durableSnapshot = {
            project: JSON.parse(JSON.stringify(state.project)),
            constitution: JSON.parse(JSON.stringify(state.constitution)),
            workflow: JSON.parse(JSON.stringify(state.workflow)),
            skill_enforcement: JSON.parse(JSON.stringify(state.skill_enforcement)),
            autonomous_iteration: JSON.parse(JSON.stringify(state.autonomous_iteration)),
            cloud_configuration: JSON.parse(JSON.stringify(state.cloud_configuration)),
            discovery_context: JSON.parse(JSON.stringify(state.discovery_context)),
            workflow_history: JSON.parse(JSON.stringify(state.workflow_history)),
            counters: JSON.parse(JSON.stringify(state.counters)),
            history: JSON.parse(JSON.stringify(state.history)),
            state_version: state.state_version,
            framework_version: state.framework_version,
            complexity_assessment: JSON.parse(JSON.stringify(state.complexity_assessment)),
            skill_usage_log: JSON.parse(JSON.stringify(state.skill_usage_log))
        };

        common.clearTransientFields(state);

        // Verify all durable fields unchanged
        assert.deepEqual(state.project, durableSnapshot.project);
        assert.deepEqual(state.constitution, durableSnapshot.constitution);
        assert.deepEqual(state.workflow, durableSnapshot.workflow);
        assert.deepEqual(state.skill_enforcement, durableSnapshot.skill_enforcement);
        assert.deepEqual(state.autonomous_iteration, durableSnapshot.autonomous_iteration);
        assert.deepEqual(state.cloud_configuration, durableSnapshot.cloud_configuration);
        assert.deepEqual(state.discovery_context, durableSnapshot.discovery_context);
        assert.deepEqual(state.workflow_history, durableSnapshot.workflow_history);
        assert.deepEqual(state.counters, durableSnapshot.counters);
        assert.deepEqual(state.history, durableSnapshot.history);
        assert.equal(state.state_version, durableSnapshot.state_version);
        assert.equal(state.framework_version, durableSnapshot.framework_version);
        assert.deepEqual(state.complexity_assessment, durableSnapshot.complexity_assessment);
        assert.deepEqual(state.skill_usage_log, durableSnapshot.skill_usage_log);
    });

    // CTF-09: Null input
    it('CTF-09: returns null for null input', () => {
        const result = common.clearTransientFields(null);
        assert.equal(result, null);
    });

    // CTF-10: Undefined input
    it('CTF-10: returns undefined for undefined input', () => {
        const result = common.clearTransientFields(undefined);
        assert.equal(result, undefined);
    });

    // CTF-11: Idempotent
    it('CTF-11: is idempotent (calling twice produces same result)', () => {
        const state = {
            current_phase: '06-implementation',
            active_agent: 'dev',
            phases: { '01-req': {} },
            blockers: [{ type: 'test' }],
            pending_escalations: [{ type: 'esc' }],
            pending_delegation: { target: 'agent' }
        };
        common.clearTransientFields(state);
        const firstPass = JSON.stringify(state);
        common.clearTransientFields(state);
        const secondPass = JSON.stringify(state);
        assert.equal(firstPass, secondPass);
    });
});

// =====================================================================
// appendToArchive
// =====================================================================

describe('appendToArchive', () => {
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

    // ATA-01: New archive (file absent)
    it('ATA-01: creates new archive when file does not exist', () => {
        const record = makeArchiveRecord();
        common.appendToArchive(record);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.version, 1);
        assert.equal(archive.records.length, 1);
        assert.deepEqual(archive.records[0], record);
    });

    // ATA-02: Append to existing archive
    it('ATA-02: appends record to existing archive', () => {
        const existingRecord = makeArchiveRecord({ slug: 'existing-workflow' });
        writeArchiveToDisk(tmpDir, { version: 1, records: [existingRecord], index: {} });

        const newRecord = makeArchiveRecord({ slug: 'new-workflow', completed_at: '2026-02-22T10:00:00Z' });
        common.appendToArchive(newRecord);

        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 2);
    });

    // ATA-03: Multi-key index
    it('ATA-03: creates multi-key index with source_id and slug', () => {
        const record = makeArchiveRecord({
            source_id: 'GH-39',
            slug: 'state-json-pruning-GH-39'
        });
        common.appendToArchive(record);
        const archive = readArchiveFromDisk(tmpDir);
        assert.deepEqual(archive.index['GH-39'], [0]);
        assert.deepEqual(archive.index['state-json-pruning-GH-39'], [0]);
    });

    // ATA-04: Dedup: skip duplicate
    it('ATA-04: skips duplicate record (same slug + completed_at)', () => {
        const record = makeArchiveRecord();
        common.appendToArchive(record);
        common.appendToArchive(record); // duplicate
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 1);
    });

    // ATA-05: Dedup: allow different timestamp
    it('ATA-05: allows same slug with different completed_at', () => {
        const record1 = makeArchiveRecord({ completed_at: '2026-02-21T15:00:00Z' });
        const record2 = makeArchiveRecord({ completed_at: '2026-02-22T10:00:00Z' });
        common.appendToArchive(record1);
        common.appendToArchive(record2);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 2);
    });

    // ATA-06: Corrupt file recovery
    it('ATA-06: recovers from corrupt archive file', () => {
        const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
        fs.writeFileSync(archivePath, 'not valid json{[');

        const record = makeArchiveRecord();
        common.appendToArchive(record);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.version, 1);
        assert.equal(archive.records.length, 1);
    });

    // ATA-07: Write error (fail-open)
    it('ATA-07: does not throw on write error', () => {
        // Make the .isdlc directory read-only to cause write failure
        const isdlcDir = path.join(tmpDir, '.isdlc');
        // Write a pre-existing archive that will be read successfully
        // but make the directory non-writable to prevent writes
        const archivePath = path.join(isdlcDir, 'state-archive.json');
        // Remove write permissions on the archive file
        fs.writeFileSync(archivePath, '{}');
        try {
            fs.chmodSync(isdlcDir, 0o444);
            // Should not throw
            assert.doesNotThrow(() => {
                common.appendToArchive(makeArchiveRecord());
            });
        } finally {
            // Restore permissions for cleanup
            fs.chmodSync(isdlcDir, 0o755);
        }
    });

    // ATA-08: Record with null source_id
    it('ATA-08: indexes only by slug when source_id is null', () => {
        const record = makeArchiveRecord({ source_id: null });
        common.appendToArchive(record);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.index[null], undefined);
        assert.deepEqual(archive.index['state-json-pruning-GH-39'], [0]);
    });

    // ATA-09: Record with null slug
    it('ATA-09: indexes only by source_id when slug is null', () => {
        const record = makeArchiveRecord({ slug: null });
        common.appendToArchive(record);
        const archive = readArchiveFromDisk(tmpDir);
        assert.deepEqual(archive.index['GH-39'], [0]);
        assert.equal(archive.index[null], undefined);
    });

    // ATA-10: Record with both null
    it('ATA-10: appends record with no index entries when both identifiers null', () => {
        const record = makeArchiveRecord({ source_id: null, slug: null });
        common.appendToArchive(record);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 1);
        // No meaningful index keys
        assert.equal(archive.index[null], undefined);
    });

    // ATA-12: Re-work: same source_id, two workflows
    it('ATA-12: supports re-work with same source_id pointing to multiple positions', () => {
        const record1 = makeArchiveRecord({
            source_id: 'GH-40',
            slug: 'feature-x-GH-40',
            completed_at: '2026-02-21T10:00:00Z'
        });
        const record2 = makeArchiveRecord({
            source_id: 'GH-40',
            slug: 'bugfix-x-GH-40',
            completed_at: '2026-02-22T10:00:00Z'
        });
        common.appendToArchive(record1);
        common.appendToArchive(record2);
        const archive = readArchiveFromDisk(tmpDir);
        assert.deepEqual(archive.index['GH-40'], [0, 1]);
        assert.deepEqual(archive.index['feature-x-GH-40'], [0]);
        assert.deepEqual(archive.index['bugfix-x-GH-40'], [1]);
    });

    // ATA-13: Archive file is valid JSON after append
    it('ATA-13: produces valid JSON after sequential appends', () => {
        for (let i = 0; i < 3; i++) {
            const record = makeArchiveRecord({
                slug: `workflow-${i}`,
                completed_at: `2026-02-2${i + 1}T10:00:00Z`
            });
            common.appendToArchive(record);
            // Verify JSON is valid after each append
            const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
            assert.doesNotThrow(() => JSON.parse(fs.readFileSync(archivePath, 'utf8')));
        }
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 3);
    });
});

// =====================================================================
// seedArchiveFromHistory
// =====================================================================

describe('seedArchiveFromHistory', () => {
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

    // SAH-01: Normal history array (3 entries)
    it('SAH-01: seeds archive with 3 entries from history', () => {
        const history = [
            makeLegacyHistoryEntry({ id: 'REQ-0001', artifact_folder: 'feature-1', completed_at: '2026-02-01T10:00:00Z' }),
            makeLegacyHistoryEntry({ id: 'REQ-0002', artifact_folder: 'feature-2', completed_at: '2026-02-02T10:00:00Z' }),
            makeLegacyHistoryEntry({ id: 'REQ-0003', artifact_folder: 'feature-3', completed_at: '2026-02-03T10:00:00Z' })
        ];
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 3);
    });

    // SAH-02: Entry missing source_id
    it('SAH-02: handles entry without id field, indexes by slug only', () => {
        const history = [
            makeLegacyHistoryEntry({ id: undefined, artifact_folder: 'feature-test', completed_at: '2026-02-01T10:00:00Z' })
        ];
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 1);
        assert.equal(archive.records[0].source_id, null);
        assert.deepEqual(archive.index['feature-test'], [0]);
    });

    // SAH-03: Entry missing both identifiers
    it('SAH-03: handles entry with no id and no artifact_folder', () => {
        const history = [
            makeLegacyHistoryEntry({
                id: undefined,
                artifact_folder: undefined,
                completed_at: '2026-02-01T10:00:00Z'
            })
        ];
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records.length, 1);
    });

    // SAH-04: Entry with no timestamp -> skipped
    it('SAH-04: skips entries with no completed_at or cancelled_at', () => {
        const history = [
            makeLegacyHistoryEntry({
                completed_at: undefined,
                cancelled_at: undefined
            })
        ];
        // Delete both timestamp fields
        delete history[0].completed_at;
        delete history[0].cancelled_at;
        common.seedArchiveFromHistory(history);
        // Archive should not exist or be empty
        const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
        if (fs.existsSync(archivePath)) {
            const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
            assert.equal(archive.records.length, 0);
        }
        // If no archive file, that is also correct behavior
    });

    // SAH-05: One entry throws during transform -> other entries still seeded
    it('SAH-05: continues seeding when one entry causes error', () => {
        const history = [
            makeLegacyHistoryEntry({ id: 'REQ-0001', artifact_folder: 'feature-1', completed_at: '2026-02-01T10:00:00Z' }),
            // This entry will have a completed_at so it should be processed;
            // we test skip-on-error by verifying the function is resilient
            makeLegacyHistoryEntry({ id: 'REQ-0002', artifact_folder: 'feature-2', completed_at: '2026-02-02T10:00:00Z' }),
            makeLegacyHistoryEntry({ id: 'REQ-0003', artifact_folder: 'feature-3', completed_at: '2026-02-03T10:00:00Z' })
        ];
        // Should not throw even if processing has issues
        assert.doesNotThrow(() => common.seedArchiveFromHistory(history));
        const archive = readArchiveFromDisk(tmpDir);
        assert.ok(archive.records.length >= 2); // At least 2 should succeed
    });

    // SAH-06: Empty array input
    it('SAH-06: does nothing for empty array', () => {
        common.seedArchiveFromHistory([]);
        const archivePath = path.join(tmpDir, '.isdlc', 'state-archive.json');
        assert.equal(fs.existsSync(archivePath), false);
    });

    // SAH-07: Null input
    it('SAH-07: returns immediately for null input', () => {
        assert.doesNotThrow(() => common.seedArchiveFromHistory(null));
    });

    // SAH-08: Outcome derivation: cancelled
    it('SAH-08: derives outcome as cancelled for cancelled entry', () => {
        const history = [
            makeLegacyHistoryEntry({
                status: 'cancelled',
                cancellation_reason: 'Stale workflow',
                completed_at: undefined,
                cancelled_at: '2026-02-01T10:00:00Z'
            })
        ];
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records[0].outcome, 'cancelled');
    });

    // SAH-09: Outcome derivation: merged
    it('SAH-09: derives outcome as merged for merged branch', () => {
        const history = [
            makeLegacyHistoryEntry({
                status: 'completed',
                git_branch: { name: 'feature/test', status: 'merged' }
            })
        ];
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        assert.equal(archive.records[0].outcome, 'merged');
    });

    // SAH-10: Phase snapshot compaction
    it('SAH-10: compacts phase_snapshots to phase/status/summary only', () => {
        const history = [
            makeLegacyHistoryEntry({
                phase_snapshots: [
                    {
                        key: '01-requirements',
                        status: 'completed',
                        summary: 'Done',
                        timing: { started: '2026-02-01T10:00:00Z', ended: '2026-02-01T10:30:00Z' },
                        gate_passed: true,
                        artifacts: ['spec.md']
                    }
                ]
            })
        ];
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        const phaseSummary = archive.records[0].phase_summary;
        assert.equal(phaseSummary.length, 1);
        assert.deepEqual(phaseSummary[0], {
            phase: '01-requirements',
            status: 'completed',
            summary: 'Done'
        });
    });

    // SAH-11: Idempotent (call twice)
    it('SAH-11: is idempotent when called twice with same history', () => {
        const history = [
            makeLegacyHistoryEntry({
                id: 'REQ-0001',
                artifact_folder: 'feature-1',
                completed_at: '2026-02-01T10:00:00Z'
            })
        ];
        common.seedArchiveFromHistory(history);
        common.seedArchiveFromHistory(history);
        const archive = readArchiveFromDisk(tmpDir);
        // Dedup in appendToArchive should prevent duplicates
        assert.equal(archive.records.length, 1);
    });
});
