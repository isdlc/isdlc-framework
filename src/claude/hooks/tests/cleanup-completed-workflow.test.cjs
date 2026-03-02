/**
 * Tests for cleanupCompletedWorkflow() in common.cjs
 * Tests: T01-T28 from BUG-0003 test-strategy.md
 *
 * TDD: These tests are written FIRST, before the implementation.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Helper: create temp test environment with .isdlc/state.json
function setupTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cleanup-test-'));
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

// Load common.cjs with CLAUDE_PROJECT_DIR override
function loadCommon(tmpDir) {
  // Clear require cache to get fresh module
  const commonPath = path.join(__dirname, '..', 'lib', 'common.cjs');
  delete require.cache[commonPath];
  process.env.CLAUDE_PROJECT_DIR = tmpDir;
  return require(commonPath);
}

// Fixture: minimal active workflow for feature
function minimalActiveWorkflow() {
  return {
    type: 'fix',
    description: 'Fix state.json cleanup',
    started_at: '2026-02-09T16:00:00Z',
    phases: ['01-requirements', '02-tracing', '05-implementation'],
    current_phase: '05-implementation',
    current_phase_index: 2,
    phase_status: {
      '01-requirements': 'completed',
      '02-tracing': 'completed',
      '05-implementation': 'completed'
    },
    gate_mode: 'strict',
    artifact_prefix: 'BUG',
    artifact_folder: 'BUG-0003-state-json-cleanup',
    counter_used: 3,
    git_branch: {
      name: 'bugfix/BUG-0003-state-json-cleanup',
      created_from: 'main',
      created_at: '2026-02-09T16:20:00Z',
      status: 'merged',
      merged_at: '2026-02-09T18:00:00Z',
      merge_commit: 'abc1234def'
    }
  };
}

// Fixture: bloated state (simulates current bug)
function bloatedState() {
  const skillLog = [];
  for (let i = 1; i <= 25; i++) {
    skillLog.push({
      timestamp: `2026-02-09T${String(i).padStart(2, '0')}:00:00Z`,
      agent: `agent-${i}`,
      description: `entry ${i}`
    });
  }

  return {
    framework_version: '0.1.0-alpha',
    project: { name: 'test-project', discovery_completed: true },
    constitution: { status: 'valid' },
    discovery_context: {
      completed_at: '2026-02-08T11:20:00Z',
      tech_stack: { primary_language: 'javascript' }
    },
    active_workflow: minimalActiveWorkflow(),
    active_agent: 'software-developer',
    current_phase: '05-implementation',
    pending_delegation: { skill: 'isdlc', loaded_at: '2026-02-09T16:00:00Z' },
    pending_escalations: [
      { type: 'gate-blocker', phase: '01-requirements', reason: 'stale' },
      { type: 'gate-blocker', phase: '02-tracing', reason: 'stale' }
    ],
    skill_usage_log: skillLog,
    workflow_history: [
      {
        type: 'feature',
        description: 'Prior feature',
        started_at: '2026-02-08T12:00:00Z',
        completed_at: '2026-02-08T13:00:00Z',
        status: 'completed',
        artifact_folder: 'REQ-0001-prior-feature',
        phases: ['01-requirements', '02-architecture'],
        git_branch: { name: 'feature/REQ-0001', status: 'merged', merge_commit: 'abc1234' }
      }
    ],
    counters: { next_req_id: 6, next_bug_id: 4 },
    phases: {
      '01-requirements': {
        status: 'completed',
        started: '2026-02-09T16:00:00Z',
        completed: '2026-02-09T16:20:00Z',
        gate_passed: '2026-02-09T16:20:00Z',
        artifacts: ['requirements-spec.md']
      },
      '02-tracing': {
        status: 'completed',
        started: '2026-02-09T16:30:00Z',
        completed: '2026-02-09T17:00:00Z',
        gate_passed: '2026-02-09T17:00:00Z',
        artifacts: ['trace-analysis.md']
      },
      '05-implementation': {
        status: 'completed',
        started: '2026-02-09T17:00:00Z',
        completed: '2026-02-09T18:00:00Z',
        gate_passed: null,
        artifacts: []
      },
      '01-requirements-BUG-0002': { status: 'completed', started: '2026-02-09T14:00:00Z' },
      '02-tracing-BUG-0002': { status: 'completed', started: '2026-02-09T14:20:00Z' },
      '01-requirements-REQ-0004': { status: 'completed', started: '2026-02-08T23:00:00Z' }
    },
    blockers: [],
    history: [{ timestamp: '2026-02-08T09:40:58Z', agent: 'setup', action: 'initialized' }],
    fix_workflow_init: { timestamp: '2026-02-09T16:00:00Z', agent: 'orchestrator' },
    '01-requirements-BUG-0003': { status: 'completed', started: '2026-02-09T16:00:00Z' },
    '02-tracing-BUG-0003': { status: 'completed', started: '2026-02-09T16:30:00Z' }
  };
}

describe('cleanupCompletedWorkflow', () => {
  let tmpDir;
  let common;

  beforeEach(() => {
    tmpDir = setupTestEnv();
    common = loadCommon(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.CLAUDE_PROJECT_DIR;
  });

  // =========================================================================
  // Operation 1: Compact and Archive to workflow_history
  // =========================================================================

  describe('Operation 1: Compact and archive to workflow_history', () => {
    it('T01: archives active_workflow to workflow_history with compact fields', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      const result = common.cleanupCompletedWorkflow();
      assert.equal(result, true);

      const cleaned = readStateFromDisk(tmpDir);
      const lastEntry = cleaned.workflow_history[cleaned.workflow_history.length - 1];

      assert.equal(lastEntry.type, 'fix');
      assert.equal(lastEntry.description, 'Fix state.json cleanup');
      assert.equal(lastEntry.started_at, '2026-02-09T16:00:00Z');
      assert.equal(lastEntry.status, 'completed');
      assert.equal(lastEntry.artifact_folder, 'BUG-0003-state-json-cleanup');
      assert.ok(lastEntry.completed_at, 'Should have completed_at');
      assert.deepEqual(lastEntry.phases, ['01-requirements', '02-tracing', '05-implementation']);
      assert.ok(lastEntry.git_branch, 'Should have git_branch');
    });

    it('T02: compact entry excludes verbose fields', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      const lastEntry = cleaned.workflow_history[cleaned.workflow_history.length - 1];

      // These verbose fields should NOT be in the compact entry
      assert.equal(lastEntry.phase_status, undefined);
      assert.equal(lastEntry.current_phase, undefined);
      assert.equal(lastEntry.current_phase_index, undefined);
      assert.equal(lastEntry.gate_mode, undefined);
      assert.equal(lastEntry.counter_used, undefined);
      assert.equal(lastEntry.artifact_prefix, undefined);
    });

    it('T03: compact git_branch includes only name, status, merge_commit', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      const lastEntry = cleaned.workflow_history[cleaned.workflow_history.length - 1];

      assert.deepEqual(Object.keys(lastEntry.git_branch).sort(), ['merge_commit', 'name', 'status']);
      assert.equal(lastEntry.git_branch.name, 'bugfix/BUG-0003-state-json-cleanup');
      assert.equal(lastEntry.git_branch.status, 'merged');
      assert.equal(lastEntry.git_branch.merge_commit, 'abc1234def');
    });

    it('T04: handles active_workflow with no git_branch', () => {
      const state = bloatedState();
      delete state.active_workflow.git_branch;
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      const lastEntry = cleaned.workflow_history[cleaned.workflow_history.length - 1];

      assert.equal(lastEntry.git_branch, null);
    });

    it('T05: appends to existing workflow_history (does not replace)', () => {
      const state = bloatedState();
      // Already has 1 entry in workflow_history
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.workflow_history.length, 2);
      assert.equal(cleaned.workflow_history[0].description, 'Prior feature');
      assert.equal(cleaned.workflow_history[1].description, 'Fix state.json cleanup');
    });

    it('T06: sets completed_at to ISO-8601 timestamp', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      const before = new Date().toISOString();
      common.cleanupCompletedWorkflow();
      const after = new Date().toISOString();

      const cleaned = readStateFromDisk(tmpDir);
      const lastEntry = cleaned.workflow_history[cleaned.workflow_history.length - 1];

      // Verify ISO-8601 format
      assert.ok(lastEntry.completed_at.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), 'Should be ISO-8601');
      assert.ok(lastEntry.completed_at >= before, 'Should be after start of test');
      assert.ok(lastEntry.completed_at <= after, 'Should be before end of test');
    });
  });

  // =========================================================================
  // Operation 2: Null Active Fields
  // =========================================================================

  describe('Operation 2: Null active fields', () => {
    it('T07: sets active_workflow to null', () => {
      writeState(tmpDir, bloatedState());
      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.active_workflow, null);
    });

    it('T08: sets active_agent to null', () => {
      writeState(tmpDir, bloatedState());
      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.active_agent, null);
    });

    it('T09: sets current_phase to null', () => {
      writeState(tmpDir, bloatedState());
      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.current_phase, null);
    });

    it('T10: sets pending_delegation to null', () => {
      writeState(tmpDir, bloatedState());
      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.pending_delegation, null);
    });
  });

  // =========================================================================
  // Operation 3: Prune skill_usage_log
  // =========================================================================

  describe('Operation 3: Prune skill_usage_log', () => {
    it('T11: prunes skill_usage_log to last 20 entries when >20', () => {
      const state = bloatedState(); // Has 25 entries
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.skill_usage_log.length, 20);
      // Should keep entries 6-25 (the last 20)
      assert.equal(cleaned.skill_usage_log[0].agent, 'agent-6');
      assert.equal(cleaned.skill_usage_log[19].agent, 'agent-25');
    });

    it('T12: preserves skill_usage_log when <=20 entries', () => {
      const state = bloatedState();
      state.skill_usage_log = state.skill_usage_log.slice(0, 15); // Only 15 entries
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.skill_usage_log.length, 15);
    });

    it('T13: handles empty skill_usage_log', () => {
      const state = bloatedState();
      state.skill_usage_log = [];
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.deepEqual(cleaned.skill_usage_log, []);
    });

    it('T14: handles missing skill_usage_log', () => {
      const state = bloatedState();
      delete state.skill_usage_log;
      writeState(tmpDir, state);

      // Should not crash
      const result = common.cleanupCompletedWorkflow();
      assert.equal(result, true);
    });
  });

  // =========================================================================
  // Operation 4: Remove Workflow-Specific Phase Keys
  // =========================================================================

  describe('Operation 4: Remove workflow-specific phase keys', () => {
    it('T15: removes phase keys with -REQ- suffix', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.phases['01-requirements-REQ-0004'], undefined);
    });

    it('T16: removes phase keys with -BUG- suffix', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.phases['01-requirements-BUG-0002'], undefined);
      assert.equal(cleaned.phases['02-tracing-BUG-0002'], undefined);
    });

    it('T17: removes phase keys with -UPG- suffix', () => {
      const state = bloatedState();
      state.phases['14-upgrade-plan-UPG-0001'] = { status: 'completed' };
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.phases['14-upgrade-plan-UPG-0001'], undefined);
    });

    it('T18: preserves generic phase keys', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      // Generic keys should still exist (reset, not removed)
      assert.ok(cleaned.phases['01-requirements'] !== undefined, 'Generic 01-requirements should exist');
      assert.ok(cleaned.phases['02-tracing'] !== undefined, 'Generic 02-tracing should exist');
      assert.ok(cleaned.phases['05-implementation'] !== undefined, 'Generic 05-implementation should exist');
    });
  });

  // =========================================================================
  // Operation 5: Reset Generic Phase Keys
  // =========================================================================

  describe('Operation 5: Reset generic phase keys', () => {
    it('T19: resets generic phase keys to clean state', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      const expected = {
        status: 'pending',
        started: null,
        completed: null,
        gate_passed: null,
        artifacts: []
      };

      assert.deepEqual(cleaned.phases['01-requirements'], expected);
    });

    it('T20: resets all generic phase keys, not just one', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      const expected = {
        status: 'pending',
        started: null,
        completed: null,
        gate_passed: null,
        artifacts: []
      };

      assert.deepEqual(cleaned.phases['01-requirements'], expected);
      assert.deepEqual(cleaned.phases['02-tracing'], expected);
      assert.deepEqual(cleaned.phases['05-implementation'], expected);
    });
  });

  // =========================================================================
  // Operation 6: Remove Orphaned Top-Level Keys
  // =========================================================================

  describe('Operation 6: Remove orphaned top-level keys', () => {
    it('T21: removes fix_workflow_init', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.fix_workflow_init, undefined);
    });

    it('T22: removes workflow-suffixed top-level keys', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned['01-requirements-BUG-0003'], undefined);
      assert.equal(cleaned['02-tracing-BUG-0003'], undefined);
    });

    it('T23: preserves canonical keys', () => {
      const state = bloatedState();
      writeState(tmpDir, state);

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      // All canonical keys should be preserved
      assert.ok('project' in cleaned, 'project preserved');
      assert.ok('constitution' in cleaned, 'constitution preserved');
      assert.ok('discovery_context' in cleaned, 'discovery_context preserved');
      assert.ok('counters' in cleaned, 'counters preserved');
      assert.ok('workflow_history' in cleaned, 'workflow_history preserved');
      assert.ok('framework_version' in cleaned, 'framework_version preserved');
      assert.ok('phases' in cleaned, 'phases preserved');
      assert.ok('blockers' in cleaned, 'blockers preserved');
      assert.ok('history' in cleaned, 'history preserved');
      assert.ok('pending_escalations' in cleaned, 'pending_escalations preserved');
      assert.ok('skill_usage_log' in cleaned, 'skill_usage_log preserved');
    });
  });

  // =========================================================================
  // Edge Cases and Safety
  // =========================================================================

  describe('Edge cases and safety', () => {
    it('T24: returns false when no active_workflow', () => {
      const state = bloatedState();
      state.active_workflow = null;
      writeState(tmpDir, state);

      const result = common.cleanupCompletedWorkflow();
      assert.equal(result, false);

      // State should be unchanged
      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.active_agent, 'software-developer');
    });

    it('T25: returns false when state.json missing', () => {
      // Don't write state.json
      fs.rmSync(path.join(tmpDir, '.isdlc', 'state.json'), { force: true });

      const result = common.cleanupCompletedWorkflow();
      assert.equal(result, false);
    });

    it('T26: preserves discovery_context', () => {
      writeState(tmpDir, bloatedState());

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.deepEqual(cleaned.discovery_context, {
        completed_at: '2026-02-08T11:20:00Z',
        tech_stack: { primary_language: 'javascript' }
      });
    });

    it('T27: preserves counters', () => {
      writeState(tmpDir, bloatedState());

      common.cleanupCompletedWorkflow();
      const cleaned = readStateFromDisk(tmpDir);

      assert.deepEqual(cleaned.counters, { next_req_id: 6, next_bug_id: 4 });
    });

    it('T28: single atomic write - state.json is valid JSON with all operations applied', () => {
      writeState(tmpDir, bloatedState());

      const result = common.cleanupCompletedWorkflow();
      assert.equal(result, true);

      // State.json should be valid JSON
      const cleaned = readStateFromDisk(tmpDir);

      // All 6 operations should have been applied
      assert.equal(cleaned.active_workflow, null, 'Op 2: active_workflow null');
      assert.equal(cleaned.active_agent, null, 'Op 2: active_agent null');
      assert.equal(cleaned.current_phase, null, 'Op 2: current_phase null');
      assert.equal(cleaned.pending_delegation, null, 'Op 2: pending_delegation null');
      assert.ok(cleaned.skill_usage_log.length <= 20, 'Op 3: skill_usage_log pruned');
      assert.equal(cleaned.phases['01-requirements-BUG-0002'], undefined, 'Op 4: suffixed keys removed');
      assert.equal(cleaned.phases['01-requirements'].status, 'pending', 'Op 5: generic keys reset');
      assert.equal(cleaned.fix_workflow_init, undefined, 'Op 6: orphaned keys removed');
      assert.ok(cleaned.workflow_history.length >= 2, 'Op 1: history archived');
    });
  });
});
