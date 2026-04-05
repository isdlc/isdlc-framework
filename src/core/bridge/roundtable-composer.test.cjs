'use strict';

/**
 * Tests for src/core/bridge/roundtable-composer.cjs
 * REQ-GH-235 FR-005, AC-005-04
 *
 * Validates the CJS bridge correctly delegates to the ESM runtime-composer
 * module and handles failure modes with fail-open behavior (Article X).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

function requireBridge() {
  // Clear require cache to get a fresh module (resets lazy-loaded ESM cache)
  delete require.cache[require.resolve('./roundtable-composer.cjs')];
  return require('./roundtable-composer.cjs');
}

describe('roundtable-composer bridge (CJS)', () => {
  let bridge;

  beforeEach(() => {
    bridge = requireBridge();
  });

  // -------------------------------------------------------------------------
  // Export validation
  // -------------------------------------------------------------------------

  it('TC-RCB-01: exports all required functions', () => {
    assert.strictEqual(typeof bridge.composeEffectiveStateMachine, 'function');
    assert.strictEqual(typeof bridge.validatePromotionFrontmatter, 'function');
    assert.strictEqual(typeof bridge.detectInsertionConflicts, 'function');
  });

  // -------------------------------------------------------------------------
  // composeEffectiveStateMachine — happy path
  // -------------------------------------------------------------------------

  it('TC-RCB-02: composeEffectiveStateMachine returns effective state machine with no personas', async () => {
    const defaultSM = {
      states: [
        { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'req.template.json', sections: [], allowed_responses: ['Accept', 'Amend'] },
        { name: 'PRESENTING_ARCHITECTURE', presenter: 'Alex', template: 'arch.template.json', sections: [], allowed_responses: ['Accept', 'Amend'] }
      ],
      transitions: []
    };

    const result = await bridge.composeEffectiveStateMachine(defaultSM, []);

    assert.ok(result.effectiveStateMachine, 'should have effectiveStateMachine');
    assert.ok(Array.isArray(result.effectiveStateMachine.states), 'states should be array');
    assert.strictEqual(result.effectiveStateMachine.states.length, 2, 'should preserve default states');
    assert.ok(Array.isArray(result.conflicts), 'conflicts should be array');
    assert.ok(Array.isArray(result.warnings), 'warnings should be array');
    assert.strictEqual(result.conflicts.length, 0, 'no conflicts with no personas');
    assert.strictEqual(result.warnings.length, 0, 'no warnings with no personas');
  });

  it('TC-RCB-03: composeEffectiveStateMachine inserts primary persona state', async () => {
    const defaultSM = {
      states: [
        { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'req.template.json', sections: [], allowed_responses: ['Accept', 'Amend'] },
        { name: 'PRESENTING_ARCHITECTURE', presenter: 'Alex', template: 'arch.template.json', sections: [], allowed_responses: ['Accept', 'Amend'] }
      ],
      transitions: []
    };

    const personaFiles = [{
      path: 'persona-security.md',
      frontmatter: {
        name: 'security_auditor',
        role_type: 'primary',
        owns_state: 'security_review',
        template: 'security.template.json',
        inserts_at: 'after:requirements'
      }
    }];

    const result = await bridge.composeEffectiveStateMachine(defaultSM, personaFiles);

    assert.strictEqual(result.effectiveStateMachine.states.length, 3, 'should have 3 states after insertion');
    assert.strictEqual(result.effectiveStateMachine.states[1].name, 'PRESENTING_SECURITY_REVIEW', 'inserted state should be after requirements');
    assert.strictEqual(result.effectiveStateMachine.states[1].presenter, 'security_auditor');
    assert.strictEqual(result.effectiveStateMachine.states[1].template, 'security.template.json');
  });

  // -------------------------------------------------------------------------
  // composeEffectiveStateMachine — fail-open (Article X)
  // -------------------------------------------------------------------------

  it('TC-RCB-04: composeEffectiveStateMachine returns fallback on null defaultStateMachine', async () => {
    const result = await bridge.composeEffectiveStateMachine(null, []);

    assert.ok(result.effectiveStateMachine, 'should have effectiveStateMachine');
    assert.ok(Array.isArray(result.effectiveStateMachine.states), 'states should be array');
    assert.strictEqual(result.effectiveStateMachine.states.length, 0, 'empty states on null input');
  });

  it('TC-RCB-05: composeEffectiveStateMachine handles null personaFiles gracefully', async () => {
    const defaultSM = {
      states: [
        { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'req.template.json', sections: [], allowed_responses: ['Accept', 'Amend'] }
      ],
      transitions: []
    };

    const result = await bridge.composeEffectiveStateMachine(defaultSM, null);

    assert.strictEqual(result.effectiveStateMachine.states.length, 1, 'should preserve default state');
    assert.strictEqual(result.warnings.length, 0, 'no warnings on null personas');
  });

  // -------------------------------------------------------------------------
  // validatePromotionFrontmatter
  // -------------------------------------------------------------------------

  it('TC-RCB-06: validatePromotionFrontmatter validates valid primary frontmatter', async () => {
    const result = await bridge.validatePromotionFrontmatter({
      role_type: 'primary',
      name: 'test_persona',
      owns_state: 'test_state',
      template: 'test.template.json',
      inserts_at: 'before:architecture'
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('TC-RCB-07: validatePromotionFrontmatter rejects invalid primary frontmatter', async () => {
    const result = await bridge.validatePromotionFrontmatter({
      role_type: 'primary',
      name: 'test_persona'
      // missing owns_state, template, inserts_at
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0, 'should have errors');
  });

  it('TC-RCB-08: validatePromotionFrontmatter passes contributing personas', async () => {
    const result = await bridge.validatePromotionFrontmatter({
      role_type: 'contributing',
      name: 'helper'
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('TC-RCB-09: validatePromotionFrontmatter handles null frontmatter', async () => {
    const result = await bridge.validatePromotionFrontmatter(null);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  // -------------------------------------------------------------------------
  // detectInsertionConflicts
  // -------------------------------------------------------------------------

  it('TC-RCB-10: detectInsertionConflicts returns empty for no conflicts', async () => {
    const personaFiles = [
      { frontmatter: { name: 'a', role_type: 'primary', inserts_at: 'before:requirements' } },
      { frontmatter: { name: 'b', role_type: 'primary', inserts_at: 'after:architecture' } }
    ];

    const result = await bridge.detectInsertionConflicts(personaFiles);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  it('TC-RCB-11: detectInsertionConflicts detects same insertion point', async () => {
    const personaFiles = [
      { frontmatter: { name: 'a', role_type: 'primary', inserts_at: 'after:requirements' } },
      { frontmatter: { name: 'b', role_type: 'primary', inserts_at: 'after:requirements' } }
    ];

    const result = await bridge.detectInsertionConflicts(personaFiles);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].insertion_point, 'after:requirements');
    assert.deepStrictEqual(result[0].personas, ['a', 'b']);
    assert.strictEqual(result[0].chosen, 'a', 'first-declared wins');
  });

  it('TC-RCB-12: detectInsertionConflicts handles null input', async () => {
    const result = await bridge.detectInsertionConflicts(null);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  // -------------------------------------------------------------------------
  // Does not mutate inputs
  // -------------------------------------------------------------------------

  it('TC-RCB-13: composeEffectiveStateMachine does not mutate input state machine', async () => {
    const originalState = { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'req.template.json', sections: [], allowed_responses: ['Accept', 'Amend'] };
    const defaultSM = {
      states: [{ ...originalState }],
      transitions: []
    };

    const personaFiles = [{
      path: 'persona-test.md',
      frontmatter: {
        name: 'test_persona',
        role_type: 'primary',
        owns_state: 'test_state',
        template: 'test.template.json',
        inserts_at: 'after:requirements'
      }
    }];

    await bridge.composeEffectiveStateMachine(defaultSM, personaFiles);

    // Original should be unchanged
    assert.strictEqual(defaultSM.states.length, 1, 'input states array should not be modified');
    assert.strictEqual(defaultSM.states[0].name, 'PRESENTING_REQUIREMENTS');
  });
});
