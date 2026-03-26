/**
 * Unit tests for src/core/analyze/finalization-chain.js — Finalization Chain
 *
 * Tests 6-step trigger chain, provider classification, sync/async.
 * Requirements: REQ-0112 FR-001..004
 *
 * Test ID prefix: FC- (Finalization Chain)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getFinalizationChain,
  getProviderNeutralSteps,
  getAsyncSteps
} from '../../../src/core/analyze/finalization-chain.js';

// ---------------------------------------------------------------------------
// FR-001: Finalization Chain (AC-001-01..02)
// ---------------------------------------------------------------------------

describe('FR-001: Finalization Chain', () => {
  it('FC-01: chain has exactly 7 steps (AC-001-01, REQ-GH-208)', () => {
    const chain = getFinalizationChain();
    assert.equal(chain.length, 7);
  });

  it('FC-02: steps are in correct order (AC-001-01, REQ-GH-208)', () => {
    const chain = getFinalizationChain();
    const ids = chain.map(s => s.id);
    assert.deepEqual(ids, [
      'meta_status_update', 'backlog_marker_update', 'github_sync',
      'sizing_computation', 'memory_writeback', 'async_enrichment',
      'task_breakdown_write'
    ]);
  });

  it('FC-03: depends_on forms correct dependency chain (AC-001-02)', () => {
    const chain = getFinalizationChain();
    assert.deepEqual(chain[0].depends_on, []);
    assert.deepEqual(chain[1].depends_on, ['meta_status_update']);
    assert.deepEqual(chain[2].depends_on, ['meta_status_update']);
    assert.deepEqual(chain[3].depends_on, ['meta_status_update']);
    assert.deepEqual(chain[4].depends_on, ['meta_status_update']);
    assert.deepEqual(chain[5].depends_on, ['memory_writeback']);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Step Schema (AC-002-01..03)
// ---------------------------------------------------------------------------

describe('FR-002: Step Schema', () => {
  it('FC-04: each step has required fields (AC-002-01)', () => {
    const chain = getFinalizationChain();
    for (const step of chain) {
      assert.equal(typeof step.id, 'string', `step missing id`);
      assert.equal(typeof step.order, 'number', `${step.id} missing order`);
      assert.equal(typeof step.action, 'string', `${step.id} missing action`);
      assert.ok(Array.isArray(step.depends_on), `${step.id} missing depends_on`);
      assert.equal(typeof step.provider_specific, 'boolean', `${step.id} missing provider_specific`);
      assert.equal(typeof step.fail_open, 'boolean', `${step.id} missing fail_open`);
      assert.equal(typeof step.async, 'boolean', `${step.id} missing async`);
    }
  });

  it('FC-05: steps 1-3 are synchronous (AC-002-02)', () => {
    const chain = getFinalizationChain();
    assert.equal(chain[0].async, false);
    assert.equal(chain[1].async, false);
    assert.equal(chain[2].async, false);
  });

  it('FC-06: steps 4-6 are asynchronous (AC-002-03)', () => {
    const chain = getFinalizationChain();
    assert.equal(chain[3].async, true);
    assert.equal(chain[4].async, true);
    assert.equal(chain[5].async, true);
  });

  it('FC-07: order fields are sequential 1-6', () => {
    const chain = getFinalizationChain();
    for (let i = 0; i < chain.length; i++) {
      assert.equal(chain[i].order, i + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-003: Provider Classification (AC-003-01..03)
// ---------------------------------------------------------------------------

describe('FR-003: Provider Classification', () => {
  it('FC-08: github_sync is provider-specific (AC-003-02)', () => {
    const chain = getFinalizationChain();
    const step = chain.find(s => s.id === 'github_sync');
    assert.equal(step.provider_specific, true);
  });

  it('FC-09: meta_status_update, backlog_marker_update, sizing_computation are provider-neutral (AC-003-01)', () => {
    const chain = getFinalizationChain();
    for (const id of ['meta_status_update', 'backlog_marker_update', 'sizing_computation']) {
      const step = chain.find(s => s.id === id);
      assert.equal(step.provider_specific, false, `${id} should be provider-neutral`);
    }
  });

  it('FC-10: memory_writeback and async_enrichment are provider-neutral (AC-003-03)', () => {
    const chain = getFinalizationChain();
    for (const id of ['memory_writeback', 'async_enrichment']) {
      const step = chain.find(s => s.id === id);
      assert.equal(step.provider_specific, false, `${id} should be provider-neutral`);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-004: Registry Functions (AC-004-01..03)
// ---------------------------------------------------------------------------

describe('FR-004: Registry Functions', () => {
  it('FC-11: getProviderNeutralSteps returns 6 steps (AC-004-02, REQ-GH-208)', () => {
    const neutral = getProviderNeutralSteps();
    assert.equal(neutral.length, 6);
    const ids = neutral.map(s => s.id);
    assert.ok(!ids.includes('github_sync'));
    assert.ok(ids.includes('task_breakdown_write'));
  });

  it('FC-12: getAsyncSteps returns 3 steps (AC-004-03)', () => {
    const asyncSteps = getAsyncSteps();
    assert.equal(asyncSteps.length, 3);
    const ids = asyncSteps.map(s => s.id);
    assert.deepEqual(ids, ['sizing_computation', 'memory_writeback', 'async_enrichment']);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('Finalization Chain Immutability', () => {
  it('FC-13: chain is frozen', () => {
    const chain = getFinalizationChain();
    assert.ok(Object.isFrozen(chain));
  });

  it('FC-14: individual steps are frozen', () => {
    const chain = getFinalizationChain();
    for (const step of chain) {
      assert.ok(Object.isFrozen(step), `step ${step.id} should be frozen`);
    }
  });

  it('FC-15: depends_on arrays are frozen', () => {
    const chain = getFinalizationChain();
    for (const step of chain) {
      assert.ok(Object.isFrozen(step.depends_on), `${step.id}.depends_on should be frozen`);
    }
  });
});

// ---------------------------------------------------------------------------
// REQ-GH-208: tasks.md in Finalization Chain (FR-003 AC-003-01)
// ---------------------------------------------------------------------------

describe('REQ-GH-208: tasks.md artifact in finalization chain', () => {
  it('FC-16: finalization chain includes tasks.md artifact reference (FR-003 AC-003-01)', () => {
    const chain = getFinalizationChain();
    const hasTasksRef = chain.some(step =>
      step.action.toLowerCase().includes('tasks.md') ||
      step.id.includes('task')
    );
    assert.ok(hasTasksRef, 'At least one step should reference tasks.md');
  });

  it('FC-17: tasks.md artifact step is guarded for non-light tiers (FR-002 AC-002-05, FR-003 AC-003-01)', () => {
    const chain = getFinalizationChain();
    const taskStep = chain.find(step =>
      step.action.toLowerCase().includes('tasks.md') ||
      step.id.includes('task')
    );
    assert.ok(taskStep, 'Task step should exist');
    assert.equal(taskStep.fail_open, true, 'Task artifact step should be fail-open (guarded)');
  });

  it('FC-18: finalization chain immutability preserved after update (FR-003 AC-003-01)', () => {
    const chain = getFinalizationChain();
    assert.ok(Object.isFrozen(chain), 'Chain should be frozen');
    for (const step of chain) {
      assert.ok(Object.isFrozen(step), `step ${step.id} should be frozen`);
    }
  });
});
