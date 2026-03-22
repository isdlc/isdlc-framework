/**
 * Unit tests for src/core/discover/projection-chain.js — Projection Chain
 *
 * Tests 4-step trigger chain and provider classification.
 * Requirements: REQ-0107 FR-001 (AC-001-01..02), FR-002 (AC-002-01..02)
 *
 * Test ID prefix: PC- (Projection Chain)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getProjectionChain,
  getProviderNeutralSteps,
  getProviderSpecificSteps
} from '../../../src/core/discover/projection-chain.js';

// ---------------------------------------------------------------------------
// FR-001: Trigger Chain (AC-001-01..02)
// ---------------------------------------------------------------------------

describe('FR-001: Projection Trigger Chain', () => {
  it('PC-01: chain has exactly 4 steps (AC-001-01)', () => {
    const chain = getProjectionChain();
    assert.equal(chain.length, 4);
  });

  it('PC-02: steps are in correct order (AC-001-01)', () => {
    const chain = getProjectionChain();
    const ids = chain.map(s => s.id);
    assert.deepEqual(ids, [
      'discover_complete', 'skill_generation', 'context_delivery', 'cache_rebuild'
    ]);
  });

  it('PC-03: each step has required fields (AC-001-02)', () => {
    const chain = getProjectionChain();
    for (const step of chain) {
      assert.equal(typeof step.id, 'string', `step missing id`);
      assert.equal(typeof step.trigger_condition, 'string', `step ${step.id} missing trigger_condition`);
      assert.equal(typeof step.action_type, 'string', `step ${step.id} missing action_type`);
      assert.ok(Array.isArray(step.depends_on), `step ${step.id} missing depends_on`);
      assert.equal(typeof step.provider_specific, 'boolean', `step ${step.id} missing provider_specific`);
    }
  });

  it('PC-03b: depends_on forms correct chain', () => {
    const chain = getProjectionChain();
    assert.deepEqual(chain[0].depends_on, []);
    assert.deepEqual(chain[1].depends_on, ['discover_complete']);
    assert.deepEqual(chain[2].depends_on, ['skill_generation']);
    assert.deepEqual(chain[3].depends_on, ['context_delivery']);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Provider Classification (AC-002-01..02)
// ---------------------------------------------------------------------------

describe('FR-002: Provider Classification', () => {
  it('PC-04: discover_complete and skill_generation are provider-neutral (AC-002-01)', () => {
    const chain = getProjectionChain();
    const step1 = chain.find(s => s.id === 'discover_complete');
    const step2 = chain.find(s => s.id === 'skill_generation');
    assert.equal(step1.provider_specific, false);
    assert.equal(step2.provider_specific, false);
  });

  it('PC-05: context_delivery and cache_rebuild are provider-specific (AC-002-02)', () => {
    const chain = getProjectionChain();
    const step3 = chain.find(s => s.id === 'context_delivery');
    const step4 = chain.find(s => s.id === 'cache_rebuild');
    assert.equal(step3.provider_specific, true);
    assert.equal(step4.provider_specific, true);
  });

  it('PC-06: getProviderNeutralSteps returns 2 steps', () => {
    const neutral = getProviderNeutralSteps();
    assert.equal(neutral.length, 2);
    const ids = neutral.map(s => s.id);
    assert.ok(ids.includes('discover_complete'));
    assert.ok(ids.includes('skill_generation'));
  });

  it('PC-07: getProviderSpecificSteps returns 2 steps', () => {
    const specific = getProviderSpecificSteps();
    assert.equal(specific.length, 2);
    const ids = specific.map(s => s.id);
    assert.ok(ids.includes('context_delivery'));
    assert.ok(ids.includes('cache_rebuild'));
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('Projection Chain Immutability', () => {
  it('PC-08: chain is frozen', () => {
    const chain = getProjectionChain();
    assert.ok(Object.isFrozen(chain));
  });

  it('PC-09: individual steps are frozen', () => {
    const chain = getProjectionChain();
    for (const step of chain) {
      assert.ok(Object.isFrozen(step), `step ${step.id} should be frozen`);
    }
  });
});
