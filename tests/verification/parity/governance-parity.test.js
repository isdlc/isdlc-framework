/**
 * Parity Test: Governance Checkpoints — REQ-0118
 *
 * Compares governance models and validateCheckpoint() outcomes between
 * Claude hooks and Codex governance.
 *
 * Strict: same block/allow decisions for identical inputs, all Claude hooks
 *         have a Codex classification (enforceable or gap).
 * Flexible: violation message wording.
 *
 * Test ID prefix: PAR-GOV-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getHookRegistration } from '../../../src/providers/claude/hooks.js';
import { getGovernanceModel, validateCheckpoint } from '../../../src/providers/codex/governance.js';

describe('Governance parity (REQ-0118 FR-002)', () => {
  const model = getGovernanceModel();
  const hooks = getHookRegistration();

  // PAR-GOV-01: All Claude governance hooks (PreToolUse/PostToolUse) are classified
  // in Codex governance model. Notification hooks (e.g. context-injector) are UX
  // features, not governance checkpoints, and are excluded from this check.
  it('PAR-GOV-01: all Claude governance hooks have Codex governance classification', () => {
    const allCodexCheckpoints = [
      ...model.enforceable.map(e => e.claude_hook),
      ...model.gaps.map(g => g.claude_hook)
    ];

    const governanceHooks = hooks.filter(
      h => h.event === 'PreToolUse' || h.event === 'PostToolUse'
    );

    assert.ok(governanceHooks.length > 0, 'Must have at least 1 governance hook');

    for (const hook of governanceHooks) {
      // Each Claude governance hook name should appear as a substring of a claude_hook field
      const classified = allCodexCheckpoints.some(
        cp => cp.includes(hook.name)
      );
      assert.ok(classified,
        `Claude governance hook "${hook.name}" not classified in Codex governance model`);
    }
  });

  // PAR-GOV-02: Governance model covers enforceable + gap = all checkpoints
  it('PAR-GOV-02: governance model has enforceable and gaps arrays', () => {
    assert.ok(Array.isArray(model.enforceable), 'Must have enforceable array');
    assert.ok(Array.isArray(model.gaps), 'Must have gaps array');
    assert.ok(model.enforceable.length > 0, 'Must have at least 1 enforceable checkpoint');
    assert.ok(model.gaps.length > 0, 'Must have at least 1 gap');
  });

  // PAR-GOV-03: Strict — valid state produces valid=true (same outcome as Claude allow)
  it('PAR-GOV-03: valid phase transition produces valid=true', () => {
    const validState = {
      current_phase: '01-requirements',
      phases: { '01-requirements': { status: 'in-progress' } }
    };
    const result = validateCheckpoint('02-architecture', validState);
    assert.equal(result.valid, true, 'Valid transition must be allowed');
    assert.equal(result.violations.length, 0, 'No violations for valid transition');
  });

  // PAR-GOV-04: Strict — invalid state produces valid=false (same outcome as Claude block)
  it('PAR-GOV-04: skipping phases produces valid=false', () => {
    const invalidState = {
      current_phase: '01-requirements',
      phases: { '01-requirements': { status: 'in-progress' } }
    };
    const result = validateCheckpoint('05-test-strategy', invalidState);
    assert.equal(result.valid, false, 'Skipping phases must be blocked');
    assert.ok(result.violations.length > 0, 'Must have at least 1 violation');
  });

  // PAR-GOV-05: Strict — null state produces valid=false
  it('PAR-GOV-05: null state produces valid=false', () => {
    const result = validateCheckpoint('01-requirements', null);
    assert.equal(result.valid, false, 'Null state must fail validation');
    assert.ok(result.violations.length > 0);
  });

  // PAR-GOV-06: Strict — missing current_phase produces valid=false
  it('PAR-GOV-06: missing current_phase produces valid=false', () => {
    const result = validateCheckpoint('02-architecture', { phases: {} });
    assert.equal(result.valid, false, 'Missing current_phase must fail');
  });

  // PAR-GOV-07: Flexible — violation messages are strings (wording not compared)
  it('PAR-GOV-07: violation messages are strings (flexible wording)', () => {
    const result = validateCheckpoint('05-test-strategy', {
      current_phase: '01-requirements',
      phases: { '01-requirements': { status: 'in-progress' } }
    });
    for (const v of result.violations) {
      assert.equal(typeof v.checkpoint, 'string');
      assert.equal(typeof v.message, 'string');
      assert.ok(v.message.length > 0, 'Violation message must not be empty');
    }
  });

  // PAR-GOV-08: Same-phase transition is always valid
  it('PAR-GOV-08: same-phase transition is valid', () => {
    const state = {
      current_phase: '03-design',
      phases: { '03-design': { status: 'in-progress' } }
    };
    const result = validateCheckpoint('03-design', state);
    assert.equal(result.valid, true);
  });
});
