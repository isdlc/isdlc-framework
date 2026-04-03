/**
 * Unit tests for src/core/tasks/task-dispatcher.js — Task Dispatcher
 *
 * Tests computeDispatchPlan(), getNextBatch(), markTaskComplete(),
 * handleTaskFailure(), skipTaskWithDependents(), shouldUseTaskDispatch().
 *
 * Requirements: REQ-GH-220 FR-001, FR-003, FR-004, FR-007, FR-008
 * Test ID prefix: TD- (Task Dispatcher)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';

import {
  computeDispatchPlan,
  getNextBatch,
  markTaskComplete,
  handleTaskFailure,
  skipTaskWithDependents,
  shouldUseTaskDispatch,
  resetRetryCounters
} from '../../../src/core/tasks/task-dispatcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const tmpDir = join(__dirname, '.tmp-dispatch');
const workflowsPath = join(__dirname, '..', '..', '..', 'src', 'isdlc', 'config', 'workflows.json');

function setupTmpFixture(fixtureName) {
  mkdirSync(tmpDir, { recursive: true });
  const src = join(fixturesDir, fixtureName);
  const dest = join(tmpDir, 'tasks.md');
  copyFileSync(src, dest);
  return dest;
}

function cleanupTmp() {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// TD-01: computeDispatchPlan returns tiers (FR-001, AC-001-01, AC-001-02)
// ---------------------------------------------------------------------------

describe('computeDispatchPlan (FR-001)', () => {
  it('TD-01: returns tiers for a phase with tasks', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const plan = computeDispatchPlan(tasksPath, '06');
      assert.ok(plan, 'plan should not be null');
      assert.ok(Array.isArray(plan.tiers), 'tiers should be an array');
      assert.ok(plan.tiers.length >= 2, 'should have at least 2 tiers (T0003 unblocked, T0004/T0005/T0006 blocked)');
      assert.equal(plan.totalTasks, 4, 'Phase 06 has 4 tasks');
      assert.equal(plan.pendingTasks, 4, 'all 4 tasks are pending');

      // Tier 0 should have T0003 (no blockers)
      const tier0Ids = plan.tiers[0].map(t => t.id);
      assert.ok(tier0Ids.includes('T0003'), 'T0003 should be in tier 0 (no blockers)');
    } finally {
      cleanupTmp();
    }
  });

  // TD-02
  it('TD-02: returns null for nonexistent file', () => {
    const plan = computeDispatchPlan('/nonexistent/tasks.md', '06');
    assert.equal(plan, null);
  });

  // TD-03
  it('TD-03: returns null for phase with no tasks', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const plan = computeDispatchPlan(tasksPath, '16');
      assert.equal(plan, null, 'Phase 16 has no tasks in fixture');
    } finally {
      cleanupTmp();
    }
  });
});

// ---------------------------------------------------------------------------
// TD-04..06: getNextBatch (FR-003, AC-003-01, AC-003-02)
// ---------------------------------------------------------------------------

describe('getNextBatch (FR-003)', () => {
  // TD-04
  it('TD-04: returns tier 0 tasks first', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const batch = getNextBatch(tasksPath, '06');
      assert.ok(batch, 'batch should not be null');
      assert.equal(batch.tier, 0, 'should be tier 0');
      const ids = batch.tasks.map(t => t.id);
      assert.ok(ids.includes('T0003'), 'T0003 should be in first batch');
    } finally {
      cleanupTmp();
    }
  });

  // TD-05
  it('TD-05: returns next tier after marking tier 0 complete', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      // Mark T0003 as complete
      markTaskComplete(tasksPath, 'T0003');

      const batch = getNextBatch(tasksPath, '06');
      assert.ok(batch, 'batch should not be null after tier 0 complete');
      // T0004 should now be unblocked (was blocked by T0003)
      const ids = batch.tasks.map(t => t.id);
      assert.ok(ids.includes('T0004'), 'T0004 should be unblocked after T0003 completes');
    } finally {
      cleanupTmp();
    }
  });

  // TD-06
  it('TD-06: returns null when all tasks complete', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      markTaskComplete(tasksPath, 'T0003');
      markTaskComplete(tasksPath, 'T0004');
      markTaskComplete(tasksPath, 'T0005');
      markTaskComplete(tasksPath, 'T0006');

      const batch = getNextBatch(tasksPath, '06');
      assert.equal(batch, null, 'should return null when all tasks complete');
    } finally {
      cleanupTmp();
    }
  });
});

// ---------------------------------------------------------------------------
// TD-07: markTaskComplete (FR-008, AC-008-02, AC-008-03)
// ---------------------------------------------------------------------------

describe('markTaskComplete (FR-008)', () => {
  it('TD-07: updates checkbox and recalculates summary', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      markTaskComplete(tasksPath, 'T0003');
      const content = readFileSync(tasksPath, 'utf8');
      assert.ok(content.includes('- [X] T0003'), 'T0003 should be marked [X]');
    } finally {
      cleanupTmp();
    }
  });
});

// ---------------------------------------------------------------------------
// TD-08..09: handleTaskFailure (FR-007, AC-007-01, AC-007-02)
// ---------------------------------------------------------------------------

describe('handleTaskFailure (FR-007)', () => {
  beforeEach(() => {
    resetRetryCounters();
  });

  // TD-08
  it('TD-08: returns retry on first failure', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const result = handleTaskFailure(tasksPath, 'T0003', 'some error', 3);
      assert.equal(result.action, 'retry');
      assert.equal(result.retryCount, 1);
    } finally {
      cleanupTmp();
    }
  });

  // TD-09
  it('TD-09: returns escalate after max retries', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      handleTaskFailure(tasksPath, 'T0003', 'error 1', 3);
      handleTaskFailure(tasksPath, 'T0003', 'error 2', 3);
      const result = handleTaskFailure(tasksPath, 'T0003', 'error 3', 3);
      assert.equal(result.action, 'escalate');
      assert.equal(result.retryCount, 3);
    } finally {
      cleanupTmp();
    }
  });
});

// ---------------------------------------------------------------------------
// TD-10: skipTaskWithDependents (FR-007, AC-007-03)
// ---------------------------------------------------------------------------

describe('skipTaskWithDependents (FR-007)', () => {
  it('TD-10: marks task and transitive dependents as skipped', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      skipTaskWithDependents(tasksPath, 'T0003', 'test reason');
      const content = readFileSync(tasksPath, 'utf8');
      // T0003 should be skipped
      assert.ok(content.includes('[SKIP]') && content.includes('T0003'), 'T0003 should be marked SKIP');
      // T0004 depends on T0003, should also be skipped
      assert.ok(content.includes('T0004') && content.includes('dependency T0003 skipped'), 'T0004 should be skipped as dependent');
      // T0005 depends on T0003 and T0004, should also be skipped
      assert.ok(content.includes('T0005') && content.includes('dependency T0003 skipped'), 'T0005 should be skipped as transitive dependent');
    } finally {
      cleanupTmp();
    }
  });
});

// ---------------------------------------------------------------------------
// TD-11..13: shouldUseTaskDispatch (FR-004, AC-004-01..04)
// ---------------------------------------------------------------------------

describe('shouldUseTaskDispatch (FR-004)', () => {
  // TD-11
  it('TD-11: returns true for configured phase with enough tasks', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const config = JSON.parse(readFileSync(workflowsPath, 'utf8'));
      // Phase 06 has 4 tasks, min_tasks_for_dispatch defaults to 3
      const result = shouldUseTaskDispatch(config, '06', tasksPath);
      assert.equal(result, true);
    } finally {
      cleanupTmp();
    }
  });

  // TD-12
  it('TD-12: returns false for non-configured phase', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const config = JSON.parse(readFileSync(workflowsPath, 'utf8'));
      const result = shouldUseTaskDispatch(config, '16-quality-loop', tasksPath);
      assert.equal(result, false);
    } finally {
      cleanupTmp();
    }
  });

  // TD-13
  it('TD-13: returns false when tasks.md missing', () => {
    const config = JSON.parse(readFileSync(workflowsPath, 'utf8'));
    const result = shouldUseTaskDispatch(config, '06-implementation', '/nonexistent/tasks.md');
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// TD-14: Parallel tier grouping (FR-003, AC-003-01)
// ---------------------------------------------------------------------------

describe('Parallel tier grouping (FR-003)', () => {
  it('TD-14: tasks with no mutual dependencies are in the same tier', () => {
    const tasksPath = setupTmpFixture('dispatch-test-plan.md');
    try {
      const plan = computeDispatchPlan(tasksPath, '05');
      assert.ok(plan, 'plan should exist for Phase 05');
      // T0001 and T0002 have no blocked_by, should be in same tier
      assert.equal(plan.tiers.length, 1, 'Phase 05 should have 1 tier (both tasks unblocked)');
      assert.equal(plan.tiers[0].length, 2, 'Tier 0 should have 2 parallel tasks');
    } finally {
      cleanupTmp();
    }
  });
});
