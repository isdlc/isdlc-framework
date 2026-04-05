/**
 * Unit tests for runtime-composer.js (REQ-GH-235)
 *
 * ATDD RED-state scaffolds. Phase 06 T014 removes .skip calls,
 * Phase 06 T013 implements src/core/roundtable/runtime-composer.js to
 * make them pass.
 *
 * Traces to: FR-005, AC-005-01 through AC-005-06
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeEffectiveStateMachine,
  validatePromotionFrontmatter,
  detectInsertionConflicts
} from '../../../src/core/roundtable/runtime-composer.js';

const DEFAULT_STATE_MACHINE = Object.freeze({
  states: Object.freeze([
    Object.freeze({ name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'requirements.template.json', sections: [], allowed_responses: ['Accept','Amend'] }),
    Object.freeze({ name: 'PRESENTING_ARCHITECTURE', presenter: 'Alex', template: 'architecture.template.json', sections: [], allowed_responses: ['Accept','Amend'] }),
    Object.freeze({ name: 'PRESENTING_DESIGN', presenter: 'Jordan', template: 'design.template.json', sections: [], allowed_responses: ['Accept','Amend'] }),
    Object.freeze({ name: 'PRESENTING_TASKS', presenter: 'Jordan', template: 'traceability.template.json', sections: [], allowed_responses: ['Accept','Amend'] })
  ]),
  transitions: Object.freeze([])
});

function mkPersona(name, role_type, extra = {}) {
  return {
    path: `/fake/${name}.md`,
    frontmatter: { name, role_type, ...extra },
    body: ''
  };
}

const VALID_PROMOTED = mkPersona('persona-data-architect', 'primary', {
  domain: 'data_architecture',
  owns_state: 'data_architecture',
  template: 'data-architecture.template.json',
  inserts_at: 'after:architecture',
  rendering_contribution: 'ownership'
});

// =============================================================================
// validatePromotionFrontmatter
// =============================================================================

describe('REQ-GH-235 runtime-composer: validatePromotionFrontmatter', () => {
  it('TC-CM-001: accepts valid primary frontmatter', () => {
    const result = validatePromotionFrontmatter(VALID_PROMOTED.frontmatter);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('TC-CM-002: rejects missing owns_state', () => {
    const fm = { ...VALID_PROMOTED.frontmatter };
    delete fm.owns_state;
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /owns_state/.test(e)));
  });

  it('TC-CM-003: rejects missing template', () => {
    const fm = { ...VALID_PROMOTED.frontmatter };
    delete fm.template;
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /template/.test(e)));
  });

  it('TC-CM-004: rejects missing inserts_at', () => {
    const fm = { ...VALID_PROMOTED.frontmatter };
    delete fm.inserts_at;
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /inserts_at/.test(e)));
  });

  it('TC-CM-005: rejects invalid owns_state format (caps/spaces)', () => {
    const fm = { ...VALID_PROMOTED.frontmatter, owns_state: 'Data Architecture!' };
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
  });

  it('TC-CM-006: rejects template without .template.json suffix', () => {
    const fm = { ...VALID_PROMOTED.frontmatter, template: 'data-architecture.json' };
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
  });

  it('TC-CM-007: rejects invalid inserts_at format', () => {
    const fm = { ...VALID_PROMOTED.frontmatter, inserts_at: 'wherever' };
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
  });

  it('TC-CM-008: contributing role passes with no promotion fields', () => {
    const fm = { name: 'p', role_type: 'contributing', domain: 'x' };
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('TC-CM-009: rejects invalid rendering_contribution value', () => {
    const fm = { ...VALID_PROMOTED.frontmatter, rendering_contribution: 'invalid-value' };
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, false);
  });

  it('TC-CM-010: omitted rendering_contribution is valid (defaults to ownership)', () => {
    const fm = { ...VALID_PROMOTED.frontmatter };
    delete fm.rendering_contribution;
    const result = validatePromotionFrontmatter(fm);
    assert.equal(result.valid, true);
  });
});

// =============================================================================
// composeEffectiveStateMachine
// =============================================================================

describe('REQ-GH-235 runtime-composer: composeEffectiveStateMachine', () => {
  it('TC-CM-011: contributing personas do not create new states', () => {
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [
      mkPersona('p1', 'contributing'),
      mkPersona('p2', 'contributing'),
      mkPersona('p3', 'contributing')
    ]);
    assert.equal(result.effectiveStateMachine.states.length, 4);
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.warnings, []);
  });

  it('TC-CM-012: single promoted persona inserts new state after:architecture', () => {
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [VALID_PROMOTED]);
    assert.equal(result.effectiveStateMachine.states.length, 5);
    assert.equal(result.effectiveStateMachine.states[2].template, 'data-architecture.template.json');
    // Order: REQ, ARCH, DATA_ARCH, DES, TASKS
    assert.equal(result.effectiveStateMachine.states[0].name, 'PRESENTING_REQUIREMENTS');
    assert.equal(result.effectiveStateMachine.states[1].name, 'PRESENTING_ARCHITECTURE');
    assert.equal(result.effectiveStateMachine.states[3].name, 'PRESENTING_DESIGN');
    assert.equal(result.effectiveStateMachine.states[4].name, 'PRESENTING_TASKS');
  });

  it('TC-CM-013: before:requirements inserts at index 0', () => {
    const p = mkPersona('persona-preflight', 'primary', {
      owns_state: 'preflight',
      template: 'preflight.template.json',
      inserts_at: 'before:requirements'
    });
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [p]);
    assert.equal(result.effectiveStateMachine.states.length, 5);
    assert.equal(result.effectiveStateMachine.states[0].template, 'preflight.template.json');
    assert.equal(result.effectiveStateMachine.states[1].name, 'PRESENTING_REQUIREMENTS');
  });

  it('TC-CM-014: multiple promoted personas at distinct points', () => {
    const p1 = VALID_PROMOTED;
    const p2 = mkPersona('persona-postmortem', 'primary', {
      owns_state: 'postmortem',
      template: 'postmortem.template.json',
      inserts_at: 'after:tasks'
    });
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [p1, p2]);
    assert.equal(result.effectiveStateMachine.states.length, 6);
    assert.deepEqual(result.conflicts, []);
  });

  it('TC-CM-017: invalid primary falls back (warning, state count unchanged)', () => {
    const bad = mkPersona('persona-broken', 'primary', {
      template: 'broken.template.json',
      inserts_at: 'after:architecture'
      // MISSING owns_state
    });
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [bad]);
    assert.equal(result.effectiveStateMachine.states.length, 4);
    assert.ok(result.warnings.some(w => w.persona === 'persona-broken' && /owns_state/.test(w.reason)));
  });

  it('TC-CM-018: unknown extension point warns and skips', () => {
    const bad = mkPersona('persona-unknown', 'primary', {
      owns_state: 'unknown',
      template: 'unknown.template.json',
      inserts_at: 'after:unknown_state'
    });
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [bad]);
    assert.equal(result.effectiveStateMachine.states.length, 4);
    assert.ok(result.warnings.some(w => /unknown.extension.point/i.test(w.reason)));
  });

  it('TC-CM-019: composer never throws on malformed input (fail-open)', () => {
    assert.doesNotThrow(() => {
      composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [
        { path: null, frontmatter: null, body: null },
        { path: '/x.md', frontmatter: { name: 'p', role_type: 'primary' }, body: '' },
        undefined
      ].filter(Boolean));
    });
  });

  it('TC-CM-020: existing 4 contributing personas remain zero-touch', () => {
    // Read real persona frontmatters from project and verify all remain contributing-valid
    const fakeContribs = [
      mkPersona('persona-security-reviewer', 'contributing', { domain: 'security', triggers: ['auth'] }),
      mkPersona('persona-data-architect', 'contributing', { domain: 'data' }),
      mkPersona('persona-domain-expert', 'contributing', { domain: 'domain' }),
      mkPersona('persona-ux-lead', 'contributing', { domain: 'ux' })
    ];
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, fakeContribs);
    assert.equal(result.effectiveStateMachine.states.length, 4);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.conflicts, []);
  });

  it('TC-CM-021: composer is pure (no mutation of inputs)', () => {
    const inputSM = JSON.parse(JSON.stringify(DEFAULT_STATE_MACHINE));
    const inputPersonas = [JSON.parse(JSON.stringify(VALID_PROMOTED))];
    const inputSMSnapshot = JSON.stringify(inputSM);
    const inputPersonasSnapshot = JSON.stringify(inputPersonas);
    composeEffectiveStateMachine(inputSM, inputPersonas);
    composeEffectiveStateMachine(inputSM, inputPersonas);
    assert.equal(JSON.stringify(inputSM), inputSMSnapshot);
    assert.equal(JSON.stringify(inputPersonas), inputPersonasSnapshot);
  });

  it('TC-CM-022: empty personaFiles returns default unchanged', () => {
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, []);
    assert.equal(result.effectiveStateMachine.states.length, 4);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.conflicts, []);
  });
});

// =============================================================================
// detectInsertionConflicts
// =============================================================================

describe('REQ-GH-235 runtime-composer: detectInsertionConflicts', () => {
  it('TC-CM-015: first-wins on same insertion point', () => {
    const a = mkPersona('persona-a', 'primary', {
      owns_state: 'a', template: 'a.template.json', inserts_at: 'after:architecture'
    });
    const b = mkPersona('persona-b', 'primary', {
      owns_state: 'b', template: 'b.template.json', inserts_at: 'after:architecture'
    });
    const conflicts = detectInsertionConflicts([a, b]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].insertion_point, 'after:architecture');
    assert.deepEqual(conflicts[0].personas, ['persona-a', 'persona-b']);
    assert.equal(conflicts[0].resolution, 'first-wins');
    assert.equal(conflicts[0].chosen, 'persona-a');
  });

  it('TC-CM-016: composer records warning and uses first-wins', () => {
    const a = mkPersona('persona-a', 'primary', {
      owns_state: 'a', template: 'a.template.json', inserts_at: 'after:architecture'
    });
    const b = mkPersona('persona-b', 'primary', {
      owns_state: 'b', template: 'b.template.json', inserts_at: 'after:architecture'
    });
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [a, b]);
    assert.equal(result.effectiveStateMachine.states.length, 5);
    assert.equal(result.conflicts.length, 1);
    assert.ok(result.warnings.some(w => w.persona === 'persona-b'));
  });

  it('no conflicts when points are distinct', () => {
    const a = mkPersona('persona-a', 'primary', {
      owns_state: 'a', template: 'a.template.json', inserts_at: 'after:architecture'
    });
    const b = mkPersona('persona-b', 'primary', {
      owns_state: 'b', template: 'b.template.json', inserts_at: 'after:design'
    });
    const conflicts = detectInsertionConflicts([a, b]);
    assert.deepEqual(conflicts, []);
  });
});
