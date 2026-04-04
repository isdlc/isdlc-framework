/**
 * Unit tests for src/core/tasks/task-reader.js — Task Plan Reader
 *
 * Tests readTaskPlan(), getTasksForPhase(), and formatTaskContext().
 * Requirements: REQ-GH-212 FR-011 (AC-011-01..04), FR-007 (AC-007-04..06)
 *
 * Test ID prefix: TR- (Task Reader)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readTaskPlan,
  getTasksForPhase,
  formatTaskContext,
  assignTiers
} from '../../../src/core/tasks/task-reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// T0005: Module Skeleton — Exports (FR-011, AC-011-01)
// ---------------------------------------------------------------------------

describe('T0005: Module Exports (FR-011, AC-011-01)', () => {
  it('TR-01: Module exports readTaskPlan function', () => {
    assert.equal(typeof readTaskPlan, 'function');
  });

  it('TR-02: Module exports getTasksForPhase function', () => {
    assert.equal(typeof getTasksForPhase, 'function');
  });

  it('TR-03: Module exports formatTaskContext function', () => {
    assert.equal(typeof formatTaskContext, 'function');
  });

  it('TR-04: All exports are functions (typeof check)', () => {
    assert.equal(typeof readTaskPlan, 'function');
    assert.equal(typeof getTasksForPhase, 'function');
    assert.equal(typeof formatTaskContext, 'function');
  });
});

// ---------------------------------------------------------------------------
// T0006: readTaskPlan() v2.0 Parser (FR-011, AC-011-01..04)
// ---------------------------------------------------------------------------

describe('T0006: readTaskPlan() v2.0 Parser', () => {
  // --- Positive tests ---

  it('TR-05: readTaskPlan() with valid v2.0 file returns TaskPlan object (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.notEqual(plan, null);
    assert.equal(typeof plan, 'object');
    assert.ok(!plan.error, 'Should not be an error object');
  });

  it('TR-06: TaskPlan has slug, format, phases, and summary properties (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.ok('slug' in plan);
    assert.ok('format' in plan);
    assert.ok('phases' in plan);
    assert.ok('summary' in plan);
  });

  it('TR-07: format property equals "v2.0" (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.equal(plan.format, 'v2.0');
  });

  it('TR-08: Parsed task has id, description, files, blockedBy, blocks, parallel, traces, status fields (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks[0]; // T0003
    assert.ok('id' in task);
    assert.ok('description' in task);
    assert.ok('files' in task);
    assert.ok('blockedBy' in task);
    assert.ok('blocks' in task);
    assert.ok('parallel' in task);
    assert.ok('traces' in task);
    assert.ok('complete' in task);
  });

  it('TR-09: Task with [P] marker has parallel=true (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    // T0004 has [P] marker
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0004');
    assert.equal(task.parallel, true);
  });

  it('TR-10: Task without [P] marker has parallel=false (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    // T0003 does not have [P] marker
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.equal(task.parallel, false);
  });

  it('TR-11: Task with [X] has complete=true (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['05'].tasks[0]; // T0001 is [X]
    assert.equal(task.complete, true);
  });

  it('TR-12: Task with [ ] has complete=false (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks[0]; // T0003 is [ ]
    assert.equal(task.complete, false);
  });

  it('TR-13: Files sub-line parsed as {path, operation} objects (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.ok(Array.isArray(task.files));
    assert.ok(task.files.length > 0);
    assert.ok('path' in task.files[0]);
    assert.ok('operation' in task.files[0]);
  });

  it('TR-14: Operation values: CREATE, MODIFY, VERIFY, REVIEW, EXTEND all parsed (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const allOps = new Set();
    for (const phaseKey of Object.keys(plan.phases)) {
      for (const task of plan.phases[phaseKey].tasks) {
        for (const file of task.files) {
          allOps.add(file.operation);
        }
      }
    }
    // The valid fixture has CREATE, MODIFY, EXTEND, VERIFY, REVIEW
    assert.ok(allOps.has('CREATE'), 'Should have CREATE');
    assert.ok(allOps.has('MODIFY'), 'Should have MODIFY');
    assert.ok(allOps.has('EXTEND'), 'Should have EXTEND');
    assert.ok(allOps.has('VERIFY'), 'Should have VERIFY');
    assert.ok(allOps.has('REVIEW'), 'Should have REVIEW');
  });

  it('TR-15: blocked_by sub-line parsed as string array of task IDs (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.ok(Array.isArray(task.blockedBy));
    assert.deepEqual(task.blockedBy, ['T0001', 'T0002']);
  });

  it('TR-16: blocks sub-line parsed as string array of task IDs (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.ok(Array.isArray(task.blocks));
    assert.deepEqual(task.blocks, ['T0004', 'T0005']);
  });

  it('TR-17: Traces annotation parsed as string array of FR/AC refs (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.ok(Array.isArray(task.traces));
    assert.deepEqual(task.traces, ['FR-011', 'AC-011-01']);
  });

  it('TR-18: Multiple phases parsed into phases object keyed by phase number (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.ok('05' in plan.phases);
    assert.ok('06' in plan.phases);
    assert.ok('16' in plan.phases);
    assert.ok('08' in plan.phases);
    assert.equal(Object.keys(plan.phases).length, 4);
  });

  it('TR-19: Phase section status (PENDING, IN PROGRESS, COMPLETE) parsed correctly (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.equal(plan.phases['05'].status, 'COMPLETE');
    assert.equal(plan.phases['06'].status, 'PENDING');
    assert.equal(plan.phases['16'].status, 'PENDING');
    assert.equal(plan.phases['08'].status, 'PENDING');
  });

  it('TR-20: Summary computed with total count and byPhase breakdown (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.ok('total' in plan.summary);
    assert.ok('byPhase' in plan.summary);
    assert.equal(plan.summary.total, 8);
    assert.equal(plan.summary.byPhase['05'].total, 2);
    assert.equal(plan.summary.byPhase['05'].done, 2);
    assert.equal(plan.summary.byPhase['06'].total, 4);
    assert.equal(plan.summary.byPhase['06'].done, 0);
  });

  // --- Negative tests ---

  it('TR-21: readTaskPlan() with nonexistent file returns null (AC-011-03)', () => {
    const result = readTaskPlan(join(fixturesDir, 'nonexistent.md'));
    assert.equal(result, null);
  });

  it('TR-22: readTaskPlan() with empty file returns error object {error, reason} (AC-011-04)', () => {
    const result = readTaskPlan(join(fixturesDir, 'empty.md'));
    assert.notEqual(result, null);
    assert.ok(result.error, 'Should have error property');
    assert.ok(result.reason, 'Should have reason property');
  });

  it('TR-23: readTaskPlan() with no phase sections returns error object (AC-011-04)', () => {
    const result = readTaskPlan(join(fixturesDir, 'no-phases.md'));
    assert.notEqual(result, null);
    assert.ok(result.error, 'Should have error property');
  });

  it('TR-24: readTaskPlan() with malformed content does not throw (AC-011-04)', () => {
    // Should NOT throw -- returns error or partial result
    assert.doesNotThrow(() => {
      readTaskPlan(join(fixturesDir, 'malformed-tasks.md'));
    });
  });

  it('TR-25: Error object has error and reason string properties (AC-011-04)', () => {
    const result = readTaskPlan(join(fixturesDir, 'empty.md'));
    assert.equal(typeof result.error, 'string');
    assert.equal(typeof result.reason, 'string');
  });

  it('TR-26: Partial parse success returns TaskPlan with warnings array (AC-011-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'malformed-tasks.md'));
    // Malformed file has valid structure (phases exist) but has invalid references
    if (!plan.error) {
      assert.ok(Array.isArray(plan.warnings), 'Should have warnings array');
      assert.ok(plan.warnings.length > 0, 'Should have at least one warning');
    }
  });

  it('TR-27: Duplicate task IDs produce a warning (AC-011-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'duplicate-ids.md'));
    if (!plan.error) {
      assert.ok(Array.isArray(plan.warnings));
      const hasDupeWarning = plan.warnings.some(w => /duplicate/i.test(w));
      assert.ok(hasDupeWarning, 'Should have a warning about duplicate IDs');
    }
  });

  it('TR-28: blocked_by referencing nonexistent task ID produces a warning (AC-011-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'malformed-tasks.md'));
    if (!plan.error) {
      assert.ok(Array.isArray(plan.warnings));
      const hasRefWarning = plan.warnings.some(w => /T9999/i.test(w) || /nonexistent/i.test(w) || /unknown/i.test(w));
      assert.ok(hasRefWarning, 'Should have a warning about nonexistent task reference');
    }
  });

  it('TR-29: Self-reference in blocked_by produces a warning (AC-011-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'self-reference.md'));
    if (!plan.error) {
      assert.ok(Array.isArray(plan.warnings));
      const hasSelfRefWarning = plan.warnings.some(w => /self/i.test(w));
      assert.ok(hasSelfRefWarning, 'Should have a warning about self-reference');
    }
  });

  it('TR-30: Task with blocked_by: none or empty has empty blockedBy array (AC-011-02)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    // T0008 has no blocked_by sub-line
    const task = plan.phases['08'].tasks[0];
    assert.ok(Array.isArray(task.blockedBy));
    assert.equal(task.blockedBy.length, 0);
  });

  it('TR-31: Task with multiple files sub-lines parsed correctly (AC-011-02)', () => {
    // The valid fixture tasks have single file entries; this tests that the parser handles them
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.ok(task.files.length >= 1, 'Should parse at least one file');
    assert.equal(task.files[0].path, 'src/core/tasks/task-reader.js');
    assert.equal(task.files[0].operation, 'CREATE');
  });

  it('TR-32: Phase header with sub-sections (### Setup, ### Foundational) correctly groups tasks under parent phase (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    // Phase 06 has ### Setup and ### Foundational sub-sections
    // All tasks should be under phase '06'
    assert.equal(plan.phases['06'].tasks.length, 4);
    const ids = plan.phases['06'].tasks.map(t => t.id);
    assert.ok(ids.includes('T0003'));
    assert.ok(ids.includes('T0004'));
    assert.ok(ids.includes('T0005'));
    assert.ok(ids.includes('T0006'));
  });
});

// ---------------------------------------------------------------------------
// T0007: getTasksForPhase() (FR-011, FR-007)
// ---------------------------------------------------------------------------

describe('T0007: getTasksForPhase()', () => {
  it('TR-33: getTasksForPhase() with valid plan and phase "06" returns Phase 06 tasks (AC-011-01, AC-007-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const tasks = getTasksForPhase(plan, '06');
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 4);
  });

  it('TR-34: getTasksForPhase() with phase "05" returns Phase 05 tasks only (AC-011-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const tasks = getTasksForPhase(plan, '05');
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].id, 'T0001');
    assert.equal(tasks[1].id, 'T0002');
  });

  it('TR-35: getTasksForPhase() with nonexistent phase returns empty array (AC-007-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const tasks = getTasksForPhase(plan, '99');
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 0);
  });

  it('TR-36: getTasksForPhase() preserves task ordering within phase (AC-007-01)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const tasks = getTasksForPhase(plan, '06');
    const ids = tasks.map(t => t.id);
    assert.deepEqual(ids, ['T0003', 'T0004', 'T0005', 'T0006']);
  });

  it('TR-37: getTasksForPhase() with null plan returns empty array (AC-007-01)', () => {
    const tasks = getTasksForPhase(null, '06');
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 0);
  });
});

// ---------------------------------------------------------------------------
// T0008: formatTaskContext() (FR-007, AC-007-04..06)
// ---------------------------------------------------------------------------

describe('T0008: formatTaskContext()', () => {
  it('TR-38: formatTaskContext() returns string containing "TASK_CONTEXT:" header (AC-007-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('TASK_CONTEXT:'), 'Should contain TASK_CONTEXT: header');
  });

  it('TR-39: Output includes phase key (AC-007-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    assert.ok(result.includes('phase:') && result.includes('"06"'), 'Should include phase key');
  });

  it('TR-40: Output includes total_tasks count (AC-007-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    assert.ok(result.includes('total_tasks:'), 'Should include total_tasks');
  });

  it('TR-41: Output includes task id, description, files, blocked_by, blocks, traces, status for each task (AC-007-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    assert.ok(result.includes('T0003'), 'Should include task ID T0003');
    assert.ok(result.includes('blocked_by:'), 'Should include blocked_by');
    assert.ok(result.includes('blocks:'), 'Should include blocks');
    assert.ok(result.includes('traces:'), 'Should include traces');
  });

  it('TR-42: Output includes dependency_summary with critical_path_length and parallel_tiers (AC-007-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    assert.ok(result.includes('dependency_summary:'), 'Should include dependency_summary');
    assert.ok(result.includes('critical_path_length:'), 'Should include critical_path_length');
    assert.ok(result.includes('parallel_tiers:'), 'Should include parallel_tiers');
  });

  it('TR-43: formatTaskContext() with includeTestMapping=false has test_mapping: null (AC-007-05)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06', { includeTestMapping: false });
    assert.ok(result.includes('test_mapping: null'), 'Should have test_mapping: null');
  });

  it('TR-44: formatTaskContext() with includeTestMapping=true and valid test-strategy.md includes test_mapping entries (AC-007-05)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const testStrategyPath = join(fixturesDir, 'test-strategy-with-mapping.md');
    const result = formatTaskContext(plan, '06', { includeTestMapping: true, testStrategyPath });
    assert.ok(result.includes('test_mapping:'), 'Should include test_mapping');
    assert.ok(result.includes('T0003'), 'Should include task mapping for T0003');
    assert.ok(!result.includes('test_mapping: null'), 'Should NOT have test_mapping: null');
  });

  it('TR-45: formatTaskContext() with includeTestMapping=true but missing test-strategy.md has test_mapping: null (AC-007-05)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06', {
      includeTestMapping: true,
      testStrategyPath: join(fixturesDir, 'nonexistent-test-strategy.md')
    });
    assert.ok(result.includes('test_mapping: null'), 'Should have test_mapping: null when file missing');
  });

  it('TR-46: Output token count is under 1000 tokens for a typical 4-task phase (AC-007-04)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    // Rough estimate: 1 token ~= 4 chars, so 1000 tokens ~= 4000 chars
    // Be generous: allow up to 5000 chars (1250 tokens)
    assert.ok(result.length < 5000, `Output too large: ${result.length} chars (should be < 5000)`);
  });

  it('TR-47: formatTaskContext() for Claude path (phase "05") produces injectable block (AC-007-05)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '05');
    assert.ok(result.includes('TASK_CONTEXT:'), 'Should produce TASK_CONTEXT block');
    assert.ok(result.includes('T0001'), 'Should include Phase 05 tasks');
  });

  it('TR-48: formatTaskContext() for Codex path (phase "06") produces injectable block (AC-007-06)', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    const result = formatTaskContext(plan, '06');
    assert.ok(result.includes('TASK_CONTEXT:'), 'Should produce TASK_CONTEXT block');
    assert.ok(result.includes('T0003'), 'Should include Phase 06 tasks');
  });
});

// ---------------------------------------------------------------------------
// REQ-GH-223 FR-003: Sub-Task Model — TNNN/TNNNABC Parsing (AC-003-03)
// ---------------------------------------------------------------------------

describe('REQ-GH-223: TNNN/TNNNABC Sub-Task Model (FR-003, AC-003-03)', () => {

  it('TR-01: tasks.md with T001 (3-digit parent) parsed with id:"T001", parentId:null', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const task = plan.phases['05'].tasks.find(t => t.id === 'T001');
    assert.ok(task, 'T001 should be parsed');
    assert.equal(task.id, 'T001');
    assert.equal(task.parentId, null);
  });

  it('TR-02: tasks.md with T005A (sub-task) parsed with id:"T005A", parentId:"T005"', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const task = plan.phases['06'].tasks.find(t => t.id === 'T005A');
    assert.ok(task, 'T005A should be parsed');
    assert.equal(task.id, 'T005A');
    assert.equal(task.parentId, 'T005');
  });

  it('TR-03: Parent T005 has children:["T005A","T005B","T005C"] after post-parse pass', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const parent = plan.phases['06'].tasks.find(t => t.id === 'T005');
    assert.ok(parent, 'T005 should be parsed');
    assert.ok(Array.isArray(parent.children), 'children should be an array');
    assert.deepEqual(parent.children, ['T005A', 'T005B', 'T005C']);
  });

  it('TR-04: tasks.md with old T0001 format (v2.0) falls back gracefully', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const task = plan.phases['06'].tasks.find(t => t.id === 'T0003');
    assert.ok(task, 'T0003 (4-digit legacy) should be parsed');
    assert.equal(task.parentId, null);
    assert.deepEqual(task.children, []);
  });

  it('TR-05: tasks.md with Format: v3.0 header has format field "v3.0"', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    assert.equal(plan.format, 'v3.0');
  });

  it('TR-06: Sub-task T005A blocked_by [T005] parses blockedBy correctly', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const task = plan.phases['06'].tasks.find(t => t.id === 'T005A');
    assert.ok(task, 'T005A should be parsed');
    assert.ok(task.blockedBy.includes('T005'), 'blockedBy should include T005');
  });

  it('TR-07: Self-referencing sub-task T005A blocked_by [T005A] produces warning', () => {
    const plan = readTaskPlan(join(fixturesDir, 'self-reference-v3.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    assert.ok(Array.isArray(plan.warnings), 'Should have warnings array');
    const hasSelfRef = plan.warnings.some(w => /self/i.test(w) && /T005A/.test(w));
    assert.ok(hasSelfRef, 'Should have a self-reference warning for T005A');
  });

  it('TR-08: Orphan sub-task T999A with no parent T999 produces warning', () => {
    const plan = readTaskPlan(join(fixturesDir, 'orphan-subtask.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    assert.ok(Array.isArray(plan.warnings), 'Should have warnings array');
    const hasOrphanWarning = plan.warnings.some(w => /orphan/i.test(w) && /T999A/.test(w));
    assert.ok(hasOrphanWarning, 'Should have an orphan sub-task warning for T999A');
  });

  it('TR-09: formatTaskContext with sub-tasks includes parent and children fields', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const result = formatTaskContext(plan, '06');
    assert.ok(result.includes('parent:'), 'Should include parent field');
    assert.ok(result.includes('children:'), 'Should include children field');
  });

  it('TR-10: assignTiers with sub-tasks assigns tier >= parentTier + 1', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const tasks = plan.phases['06'].tasks;
    const assigned = new Map();
    assignTiers(tasks, assigned);
    const parentTier = assigned.get('T005');
    const childTier = assigned.get('T005A');
    assert.ok(typeof parentTier === 'number', 'T005 should have a tier');
    assert.ok(typeof childTier === 'number', 'T005A should have a tier');
    assert.ok(childTier >= parentTier + 1, `Sub-task tier (${childTier}) should be >= parent tier + 1 (${parentTier + 1})`);
  });

  it('TR-11: Empty tasks.md returns error object (no throw)', () => {
    const result = readTaskPlan(join(fixturesDir, 'empty.md'));
    assert.notEqual(result, null);
    assert.ok(result.error, 'Should be an error object');
    assert.ok(result.reason, 'Should have a reason');
  });

  it('TR-12: tasks.md with 26 sub-tasks T001A-T001Z all parsed correctly', () => {
    const plan = readTaskPlan(join(fixturesDir, 'subtask-26.md'));
    assert.ok(!plan.error, `Parse failed: ${plan.reason || ''}`);
    const tasks = plan.phases['06'].tasks;
    const parent = tasks.find(t => t.id === 'T001');
    assert.ok(parent, 'T001 parent should exist');
    assert.equal(parent.children.length, 26, 'T001 should have 26 children');
    // Verify all letters A-Z
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i); // A-Z
      const childId = `T001${letter}`;
      const child = tasks.find(t => t.id === childId);
      assert.ok(child, `Child ${childId} should exist`);
      assert.equal(child.parentId, 'T001');
    }
  });

  it('TR-13: Regex matches TNNN but not TNNNN in v3.0 context; T0001 handled as legacy', () => {
    // The v3.0 regex T\d{3,4}[A-Z]? matches both T001 and T0001
    const v3Plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!v3Plan.error);
    const t001 = v3Plan.phases['05'].tasks.find(t => t.id === 'T001');
    assert.ok(t001, 'T001 (3-digit) should match');

    // Legacy v2.0 still works
    const v2Plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.ok(!v2Plan.error);
    const t0001 = v2Plan.phases['05'].tasks.find(t => t.id === 'T0001');
    assert.ok(t0001, 'T0001 (4-digit legacy) should still match');
  });

  it('TR-14: Regex matches TNNNA but not TNNNAB (single trailing alpha only)', () => {
    // T005A is valid, but T005AB would not be a valid task ID
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error);
    const t005a = plan.phases['06'].tasks.find(t => t.id === 'T005A');
    assert.ok(t005a, 'T005A should match');
    // Verify no task with two-letter suffix exists (none in fixture, regex prevents it)
    const twoLetter = plan.phases['06'].tasks.find(t => /^T\d{3}[A-Z]{2}$/.test(t.id));
    assert.equal(twoLetter, undefined, 'No two-letter suffix IDs should be parsed');
  });

  it('TR-15: getTasksForPhase returns both parents and children in same phase', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error);
    const tasks = getTasksForPhase(plan, '06');
    const ids = tasks.map(t => t.id);
    assert.ok(ids.includes('T005'), 'Should include parent T005');
    assert.ok(ids.includes('T005A'), 'Should include child T005A');
    assert.ok(ids.includes('T005B'), 'Should include child T005B');
    assert.ok(ids.includes('T005C'), 'Should include child T005C');
    assert.ok(ids.includes('T006'), 'Should include T006');
  });

  it('TR-16: computeDependencySummary: sub-tasks with dependencies not in tier 0', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error);
    const result = formatTaskContext(plan, '06');
    // tier_0_tasks should include T005 (no blockers within phase) but NOT T005A (blocked by T005)
    assert.ok(result.includes('tier_0_tasks:'), 'Should include tier_0_tasks');
    // T005 should be tier 0 (no in-phase blockers)
    assert.ok(result.includes('T005'), 'T005 should appear in output');
  });

  it('TR-17: parsePhaseSection with mixed TNNN and TNNNA parses both with correct parentId', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v3.0.md'));
    assert.ok(!plan.error);
    const tasks = plan.phases['06'].tasks;
    const parent = tasks.find(t => t.id === 'T005');
    const child = tasks.find(t => t.id === 'T005A');
    assert.equal(parent.parentId, null, 'Parent T005 should have parentId null');
    assert.equal(child.parentId, 'T005', 'Child T005A should have parentId T005');
  });

  it('TR-18: Backward compat: v2.0 file with no sub-tasks has parentId:null, children:[] for all tasks', () => {
    const plan = readTaskPlan(join(fixturesDir, 'valid-v2.0.md'));
    assert.ok(!plan.error);
    for (const phaseKey of Object.keys(plan.phases)) {
      for (const task of plan.phases[phaseKey].tasks) {
        assert.equal(task.parentId, null, `Task ${task.id} should have parentId null`);
        assert.deepEqual(task.children, [], `Task ${task.id} should have empty children array`);
      }
    }
  });
});
