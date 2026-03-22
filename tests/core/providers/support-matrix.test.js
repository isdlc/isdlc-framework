/**
 * Tests for src/core/providers/support-matrix.js — REQ-0122
 *
 * Tests: getProviderSupportMatrix(), getGovernanceDeltas(), getKnownLimitations()
 *
 * Requirements: FR-001 (AC-001-01..03), FR-002 (AC-002-01..03),
 *               FR-003 (AC-003-01..03), FR-004 (AC-004-01..02)
 *
 * Test ID prefix: SMX-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getProviderSupportMatrix,
  getGovernanceDeltas,
  getKnownLimitations
} from '../../../src/core/providers/support-matrix.js';

import { getGovernanceModel } from '../../../src/providers/codex/governance.js';

// ---------------------------------------------------------------------------
// FR-001: Provider Support Matrix
// ---------------------------------------------------------------------------

describe('getProviderSupportMatrix (REQ-0122 FR-001)', () => {
  it('SMX-01: returns a frozen array (AC-001-01)', () => {
    const matrix = getProviderSupportMatrix();
    assert.ok(Array.isArray(matrix), 'Must be an array');
    assert.ok(Object.isFrozen(matrix), 'Array must be frozen');
  });

  it('SMX-02: each entry has { feature, claude, codex, notes } (AC-001-02)', () => {
    const matrix = getProviderSupportMatrix();
    for (const entry of matrix) {
      assert.ok(Object.isFrozen(entry), `Entry must be frozen: ${entry.feature}`);
      assert.equal(typeof entry.feature, 'string', 'feature must be string');
      assert.equal(typeof entry.claude, 'string', 'claude must be string');
      assert.equal(typeof entry.codex, 'string', 'codex must be string');
      assert.equal(typeof entry.notes, 'string', 'notes must be string');
    }
  });

  it('SMX-03: claude is always "supported" (AC-001-02)', () => {
    const matrix = getProviderSupportMatrix();
    for (const entry of matrix) {
      assert.equal(entry.claude, 'supported', `Claude must be "supported" for ${entry.feature}`);
    }
  });

  it('SMX-04: codex values are valid enum (AC-001-02)', () => {
    const validValues = ['supported', 'partial', 'unsupported'];
    const matrix = getProviderSupportMatrix();
    for (const entry of matrix) {
      assert.ok(
        validValues.includes(entry.codex),
        `Codex value "${entry.codex}" for ${entry.feature} must be one of: ${validValues.join(', ')}`
      );
    }
  });

  it('SMX-05: covers all required features (AC-001-03)', () => {
    const requiredFeatures = [
      'workflow-feature', 'workflow-fix', 'workflow-upgrade',
      'workflow-test-generate', 'workflow-test-run',
      'discover', 'analyze', 'teams-roundtable',
      'memory', 'skills', 'governance'
    ];
    const matrix = getProviderSupportMatrix();
    const featureNames = matrix.map(e => e.feature);
    for (const req of requiredFeatures) {
      assert.ok(featureNames.includes(req), `Missing required feature: ${req}`);
    }
  });

  it('SMX-06: has at least 11 entries (AC-001-03)', () => {
    const matrix = getProviderSupportMatrix();
    assert.ok(matrix.length >= 11, `Expected >= 11 entries, got ${matrix.length}`);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Governance Strength Deltas
// ---------------------------------------------------------------------------

describe('getGovernanceDeltas (REQ-0122 FR-002)', () => {
  it('SMX-07: returns a frozen array (AC-002-01)', () => {
    const deltas = getGovernanceDeltas();
    assert.ok(Array.isArray(deltas), 'Must be an array');
    assert.ok(Object.isFrozen(deltas), 'Array must be frozen');
  });

  it('SMX-08: each entry has { checkpoint, claude_strength, codex_strength, delta } (AC-002-02)', () => {
    const deltas = getGovernanceDeltas();
    for (const entry of deltas) {
      assert.ok(Object.isFrozen(entry), `Entry must be frozen: ${entry.checkpoint}`);
      assert.equal(typeof entry.checkpoint, 'string', 'checkpoint must be string');
      assert.equal(typeof entry.claude_strength, 'string', 'claude_strength must be string');
      assert.equal(typeof entry.codex_strength, 'string', 'codex_strength must be string');
      assert.equal(typeof entry.delta, 'string', 'delta must be string');
    }
  });

  it('SMX-09: claude_strength is always "enforced" (AC-002-02)', () => {
    const deltas = getGovernanceDeltas();
    for (const entry of deltas) {
      assert.equal(entry.claude_strength, 'enforced', `Claude must be "enforced" for ${entry.checkpoint}`);
    }
  });

  it('SMX-10: codex_strength values are valid enum (AC-002-02)', () => {
    const validValues = ['enforced', 'instruction-only', 'none'];
    const deltas = getGovernanceDeltas();
    for (const entry of deltas) {
      assert.ok(
        validValues.includes(entry.codex_strength),
        `Codex strength "${entry.codex_strength}" for ${entry.checkpoint} must be one of: ${validValues.join(', ')}`
      );
    }
  });

  it('SMX-11: delta values are valid enum (AC-002-02)', () => {
    const validValues = ['none', 'degraded', 'absent'];
    const deltas = getGovernanceDeltas();
    for (const entry of deltas) {
      assert.ok(
        validValues.includes(entry.delta),
        `Delta "${entry.delta}" for ${entry.checkpoint} must be one of: ${validValues.join(', ')}`
      );
    }
  });

  it('SMX-12: covers all governance model entries (AC-002-03)', () => {
    const model = getGovernanceModel();
    const deltas = getGovernanceDeltas();
    const deltaCheckpoints = deltas.map(d => d.checkpoint);

    const allCheckpoints = [
      ...model.enforceable.map(e => e.checkpoint),
      ...model.gaps.map(g => g.checkpoint)
    ];

    for (const cp of allCheckpoints) {
      assert.ok(
        deltaCheckpoints.includes(cp),
        `Governance model checkpoint "${cp}" missing from deltas`
      );
    }
  });

  it('SMX-13: enforceable checkpoints have delta "none" (AC-002-03)', () => {
    const model = getGovernanceModel();
    const deltas = getGovernanceDeltas();

    for (const enf of model.enforceable) {
      const delta = deltas.find(d => d.checkpoint === enf.checkpoint);
      assert.ok(delta, `Missing delta for enforceable checkpoint: ${enf.checkpoint}`);
      assert.equal(delta.codex_strength, 'enforced');
      assert.equal(delta.delta, 'none');
    }
  });

  it('SMX-14: gap checkpoints have delta "degraded" or "absent" (AC-002-03)', () => {
    const model = getGovernanceModel();
    const deltas = getGovernanceDeltas();

    for (const gap of model.gaps) {
      const delta = deltas.find(d => d.checkpoint === gap.checkpoint);
      assert.ok(delta, `Missing delta for gap checkpoint: ${gap.checkpoint}`);
      assert.ok(
        ['degraded', 'absent'].includes(delta.delta),
        `Gap checkpoint "${gap.checkpoint}" should have delta "degraded" or "absent", got "${delta.delta}"`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// FR-003: Known Limitations
// ---------------------------------------------------------------------------

describe('getKnownLimitations (REQ-0122 FR-003)', () => {
  it('SMX-15: returns a frozen array (AC-003-01)', () => {
    const limitations = getKnownLimitations();
    assert.ok(Array.isArray(limitations), 'Must be an array');
    assert.ok(Object.isFrozen(limitations), 'Array must be frozen');
  });

  it('SMX-16: each entry has { limitation, impact, mitigation } (AC-003-02)', () => {
    const limitations = getKnownLimitations();
    for (const entry of limitations) {
      assert.ok(Object.isFrozen(entry), `Entry must be frozen: ${entry.limitation}`);
      assert.equal(typeof entry.limitation, 'string', 'limitation must be string');
      assert.equal(typeof entry.impact, 'string', 'impact must be string');
      assert.equal(typeof entry.mitigation, 'string', 'mitigation must be string');
    }
  });

  it('SMX-17: impact values are valid enum (AC-003-02)', () => {
    const validValues = ['low', 'medium', 'high'];
    const limitations = getKnownLimitations();
    for (const entry of limitations) {
      assert.ok(
        validValues.includes(entry.impact),
        `Impact "${entry.impact}" for "${entry.limitation}" must be one of: ${validValues.join(', ')}`
      );
    }
  });

  it('SMX-18: covers required limitations (AC-003-03)', () => {
    const limitations = getKnownLimitations();
    const texts = limitations.map(l => l.limitation.toLowerCase());

    const requiredTopics = ['hook', 'real-time', 'instruction-only', 'elicitation'];
    for (const topic of requiredTopics) {
      const found = texts.some(t => t.includes(topic));
      assert.ok(found, `Must have a limitation mentioning "${topic}"`);
    }
  });

  it('SMX-19: has at least 4 entries (AC-003-03)', () => {
    const limitations = getKnownLimitations();
    assert.ok(limitations.length >= 4, `Expected >= 4 entries, got ${limitations.length}`);
  });
});
