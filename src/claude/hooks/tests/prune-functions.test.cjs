/**
 * Tests for existing prune functions in common.cjs (backfill)
 * Tests: PF-01 through PF-18 from GH-39 test-strategy.md
 *
 * Covers: pruneSkillUsageLog, pruneCompletedPhases, pruneHistory,
 *         pruneWorkflowHistory, plus updated default limits (FR-004).
 *
 * TDD: Written FIRST, before implementation changes.
 * Traces to: FR-004 (AC-004-01 through AC-004-04)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper: create temp test environment
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
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

// Generate N skill_usage_log entries
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

// Generate N history entries
function makeHistoryEntries(count, actionLength = 50) {
    const entries = [];
    for (let i = 0; i < count; i++) {
        entries.push({
            timestamp: `2026-02-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
            agent: `agent-${i}`,
            action: 'x'.repeat(actionLength) + `-${i}`
        });
    }
    return entries;
}

// Generate N workflow_history entries
function makeWorkflowHistoryEntries(count, descLength = 50) {
    const entries = [];
    for (let i = 0; i < count; i++) {
        entries.push({
            id: `REQ-${String(i).padStart(4, '0')}`,
            type: 'feature',
            description: 'D'.repeat(descLength),
            artifact_folder: `feature-${i}`,
            started_at: `2026-02-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
            completed_at: `2026-02-01T${String(i % 24).padStart(2, '0')}:30:00Z`,
            status: 'completed',
            git_branch: {
                name: `feature/feature-${i}`,
                created_from: 'main',
                created_at: `2026-02-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
                status: 'merged',
                merged_at: `2026-02-01T${String(i % 24).padStart(2, '0')}:30:00Z`,
                merge_commit: `abc${i}`
            }
        });
    }
    return entries;
}

describe('pruneSkillUsageLog', () => {
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

    // PF-01: Empty skill_usage_log
    it('PF-01: returns state unchanged when skill_usage_log is empty', () => {
        const state = { skill_usage_log: [] };
        const result = common.pruneSkillUsageLog(state);
        assert.equal(result, state);
        assert.equal(result.skill_usage_log.length, 0);
    });

    // PF-02: Below cap (< 50)
    it('PF-02: preserves all entries when below cap', () => {
        const state = { skill_usage_log: makeSkillEntries(10) };
        common.pruneSkillUsageLog(state);
        assert.equal(state.skill_usage_log.length, 10);
    });

    // PF-03: At cap (= 50)
    it('PF-03: preserves all entries when at cap', () => {
        const state = { skill_usage_log: makeSkillEntries(50) };
        common.pruneSkillUsageLog(state);
        assert.equal(state.skill_usage_log.length, 50);
    });

    // PF-04: Above cap (60 entries), FIFO keeps newest 50
    it('PF-04: removes oldest entries when above cap (FIFO)', () => {
        const entries = makeSkillEntries(60);
        const state = { skill_usage_log: entries };
        common.pruneSkillUsageLog(state);
        assert.equal(state.skill_usage_log.length, 50);
        // Should keep the last 50 (FIFO: oldest removed)
        assert.equal(state.skill_usage_log[0].description, 'entry 10');
        assert.equal(state.skill_usage_log[49].description, 'entry 59');
    });

    // PF-05: Non-array skill_usage_log
    it('PF-05: handles non-array skill_usage_log without TypeError', () => {
        const state = { skill_usage_log: null };
        const result = common.pruneSkillUsageLog(state);
        assert.equal(result, state);
    });

    // PF-06: Default maxEntries is 50 (FR-004, AC-004-01)
    it('PF-06: default maxEntries is 50 after FR-004 update', () => {
        const state = { skill_usage_log: makeSkillEntries(60) };
        // Call with only 1 arg (no maxEntries)
        common.pruneSkillUsageLog(state);
        assert.equal(state.skill_usage_log.length, 50);
    });
});

describe('pruneCompletedPhases', () => {
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

    // PF-07: Empty phases
    it('PF-07: returns state unchanged when phases is empty', () => {
        const state = { phases: {} };
        const result = common.pruneCompletedPhases(state);
        assert.equal(result, state);
        assert.deepEqual(state.phases, {});
    });

    // PF-08: Completed phases stripped
    it('PF-08: strips verbose sub-objects from completed phases', () => {
        const state = {
            phases: {
                '01-requirements': {
                    status: 'completed',
                    started: '2026-02-01T10:00:00Z',
                    completed: '2026-02-01T11:00:00Z',
                    gate_passed: true,
                    artifacts: ['spec.md'],
                    iteration_requirements: { test_iteration: { enabled: true } },
                    constitutional_validation: { completed: true },
                    gate_validation: { passed: true },
                    testing_environment: { framework: 'node:test' },
                    verification_summary: { tests_passed: 10 },
                    atdd_validation: { mode: false }
                }
            }
        };
        common.pruneCompletedPhases(state, []);
        const phase = state.phases['01-requirements'];
        // Preserved fields
        assert.equal(phase.status, 'completed');
        assert.equal(phase.started, '2026-02-01T10:00:00Z');
        assert.equal(phase.completed, '2026-02-01T11:00:00Z');
        assert.equal(phase.gate_passed, true);
        assert.deepEqual(phase.artifacts, ['spec.md']);
        // Stripped fields
        assert.equal(phase.iteration_requirements, undefined);
        assert.equal(phase.constitutional_validation, undefined);
        assert.equal(phase.gate_validation, undefined);
        assert.equal(phase.testing_environment, undefined);
        assert.equal(phase.verification_summary, undefined);
        assert.equal(phase.atdd_validation, undefined);
    });

    // PF-09: Protected phases preserved
    it('PF-09: does not strip protected phases', () => {
        const state = {
            phases: {
                '06-implementation': {
                    status: 'completed',
                    gate_passed: true,
                    iteration_requirements: { test_iteration: { enabled: true } }
                }
            }
        };
        common.pruneCompletedPhases(state, ['06-implementation']);
        assert.notEqual(state.phases['06-implementation'].iteration_requirements, undefined);
    });

    // PF-10: _pruned_at timestamp added
    it('PF-10: adds _pruned_at timestamp to stripped phases', () => {
        const state = {
            phases: {
                '01-requirements': {
                    status: 'completed',
                    iteration_requirements: { test_iteration: {} }
                }
            }
        };
        common.pruneCompletedPhases(state, []);
        const phase = state.phases['01-requirements'];
        assert.ok(phase._pruned_at);
        // Validate it is an ISO timestamp
        assert.ok(!isNaN(Date.parse(phase._pruned_at)));
    });
});

describe('pruneHistory', () => {
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

    // PF-11: Below cap (< 100)
    it('PF-11: preserves all entries when below cap', () => {
        const state = { history: makeHistoryEntries(50) };
        common.pruneHistory(state);
        assert.equal(state.history.length, 50);
    });

    // PF-12: Above cap (120 entries)
    it('PF-12: removes oldest entries when above cap', () => {
        const state = { history: makeHistoryEntries(120) };
        common.pruneHistory(state);
        assert.equal(state.history.length, 100);
    });

    // PF-13: Action string truncation
    it('PF-13: truncates action strings longer than 200 chars', () => {
        const state = { history: [{ action: 'x'.repeat(300) }] };
        common.pruneHistory(state);
        assert.equal(state.history[0].action.length, 203); // 200 + '...'
        assert.ok(state.history[0].action.endsWith('...'));
    });

    // PF-14: Short action unchanged
    it('PF-14: does not truncate short action strings', () => {
        const state = { history: [{ action: 'x'.repeat(50) }] };
        common.pruneHistory(state);
        assert.equal(state.history[0].action.length, 50);
    });

    // PF-15: Default maxEntries is 100 (FR-004, AC-004-02)
    it('PF-15: default maxEntries is 100 after FR-004 update', () => {
        const state = { history: makeHistoryEntries(120) };
        // Call with only 1 arg
        common.pruneHistory(state);
        assert.equal(state.history.length, 100);
    });
});

describe('pruneWorkflowHistory', () => {
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

    // PF-16: Below cap (< 50)
    it('PF-16: preserves all entries when below cap', () => {
        const state = { workflow_history: makeWorkflowHistoryEntries(10) };
        common.pruneWorkflowHistory(state);
        assert.equal(state.workflow_history.length, 10);
    });

    // PF-17: Above cap (60 entries)
    it('PF-17: removes oldest entries when above cap', () => {
        const state = { workflow_history: makeWorkflowHistoryEntries(60) };
        common.pruneWorkflowHistory(state);
        assert.equal(state.workflow_history.length, 50);
    });

    // PF-18: git_branch compacted
    it('PF-18: compacts git_branch to name only', () => {
        const state = {
            workflow_history: [{
                id: 'REQ-0001',
                description: 'Test',
                git_branch: {
                    name: 'feature/test',
                    created_from: 'main',
                    created_at: '2026-02-01T10:00:00Z',
                    status: 'merged',
                    merged_at: '2026-02-01T11:00:00Z',
                    merge_commit: 'abc123'
                }
            }]
        };
        common.pruneWorkflowHistory(state);
        assert.deepEqual(state.workflow_history[0].git_branch, { name: 'feature/test' });
    });
});
