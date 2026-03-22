/**
 * Unit tests for src/core/discover/skill-distillation.js — Skill Distillation Config
 *
 * Tests distillation config, reconciliation rules, and source priority.
 * Requirements: REQ-0106 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02)
 *
 * Test ID prefix: SD- (Skill Distillation)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCE_PRIORITY,
  getDistillationConfig,
  getReconciliationRules
} from '../../../src/core/discover/skill-distillation.js';

// ---------------------------------------------------------------------------
// FR-001: Reconciliation Rules (AC-001-01..03)
// ---------------------------------------------------------------------------

describe('FR-001: Reconciliation Rules', () => {
  it('SD-01: SOURCE_PRIORITY defines user > project > framework (AC-001-01)', () => {
    assert.ok(Array.isArray(SOURCE_PRIORITY));
    assert.deepEqual(SOURCE_PRIORITY, ['user', 'project', 'framework']);
  });

  it('SD-02: reconciliation rules define stale detection (AC-001-02)', () => {
    const rules = getReconciliationRules();
    assert.ok(Array.isArray(rules));
    assert.ok(rules.length > 0);
    // At least one rule about stale handling
    const staleRule = rules.find(r => r.id === 'stale_detection');
    assert.ok(staleRule, 'Should have a stale_detection rule');
    assert.equal(typeof staleRule.description, 'string');
  });

  it('SD-03: reconciliation rules preserve user-owned skills (AC-001-03)', () => {
    const rules = getReconciliationRules();
    const userRule = rules.find(r => r.id === 'user_owned_preservation');
    assert.ok(userRule, 'Should have a user_owned_preservation rule');
    assert.equal(typeof userRule.description, 'string');
  });

  it('SD-03b: reconciliation rules are frozen', () => {
    const rules = getReconciliationRules();
    assert.ok(Object.isFrozen(rules));
  });
});

// ---------------------------------------------------------------------------
// FR-002: Distillation Config (AC-002-01..02)
// ---------------------------------------------------------------------------

describe('FR-002: Distillation Config', () => {
  it('SD-04: config has sources, priority_order, stale_action, user_owned_fields (AC-002-01)', () => {
    const config = getDistillationConfig();
    assert.ok(Array.isArray(config.sources));
    assert.ok(Array.isArray(config.priority_order));
    assert.equal(typeof config.stale_action, 'string');
    assert.ok(Array.isArray(config.user_owned_fields));
  });

  it('SD-05: config is frozen (AC-002-02)', () => {
    const config = getDistillationConfig();
    assert.ok(Object.isFrozen(config));
  });

  it('SD-05b: stale_action is one of remove|warn|keep', () => {
    const config = getDistillationConfig();
    assert.ok(['remove', 'warn', 'keep'].includes(config.stale_action));
  });

  it('SD-06: SOURCE_PRIORITY is frozen', () => {
    assert.ok(Object.isFrozen(SOURCE_PRIORITY));
  });

  it('SD-07: SOURCE_PRIORITY rejects mutation', () => {
    assert.throws(
      () => { SOURCE_PRIORITY[0] = 'hacked'; },
      TypeError
    );
  });
});
