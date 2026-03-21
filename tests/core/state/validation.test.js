/**
 * Unit tests for src/core/state/validation.js — State Validation (REQ-0080 Group D)
 *
 * Tests: validatePhase, validateStateWrite
 *
 * Requirements: FR-003 (AC-003-01 through AC-003-03)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePhase,
  validateStateWrite
} from '../../../src/core/state/validation.js';

// ---------------------------------------------------------------------------
// validatePhase
// ---------------------------------------------------------------------------
describe('validatePhase()', () => {
  it('VAL-01: returns empty warnings for valid phase data', () => {
    const phase = {
      status: 'completed',
      constitutional_validation: { completed: true, iterations_used: 2 },
      iteration_requirements: {
        interactive_elicitation: { completed: true, menu_interactions: 3 },
        test_iteration: { completed: true, current_iteration: 5 }
      }
    };
    const warnings = validatePhase('06-implementation', phase);
    assert.equal(warnings.length, 0);
  });

  it('VAL-02: warns when constitutional_validation.completed but iterations_used < 1', () => {
    const phase = {
      constitutional_validation: { completed: true, iterations_used: 0 }
    };
    const warnings = validatePhase('06-implementation', phase);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('constitutional_validation'));
  });

  it('VAL-03: warns when interactive_elicitation.completed but menu_interactions < 1', () => {
    const phase = {
      iteration_requirements: {
        interactive_elicitation: { completed: true, menu_interactions: 0 }
      }
    };
    const warnings = validatePhase('01-requirements', phase);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('interactive_elicitation'));
  });

  it('VAL-04: warns when test_iteration.completed but current_iteration < 1', () => {
    const phase = {
      iteration_requirements: {
        test_iteration: { completed: true, current_iteration: null }
      }
    };
    const warnings = validatePhase('06-implementation', phase);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('test_iteration'));
  });

  it('VAL-05: collects multiple warnings', () => {
    const phase = {
      constitutional_validation: { completed: true, iterations_used: 0 },
      iteration_requirements: {
        interactive_elicitation: { completed: true, menu_interactions: null },
        test_iteration: { completed: true, current_iteration: 0 }
      }
    };
    const warnings = validatePhase('06-implementation', phase);
    assert.equal(warnings.length, 3);
  });

  it('VAL-06: returns empty for incomplete phase (no completed flags)', () => {
    const phase = {
      status: 'in_progress',
      constitutional_validation: { completed: false }
    };
    const warnings = validatePhase('06-implementation', phase);
    assert.equal(warnings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// validateStateWrite
// ---------------------------------------------------------------------------
describe('validateStateWrite()', () => {
  it('VAL-07: returns empty warnings for valid state', () => {
    const state = {
      phases: {
        '06-implementation': {
          status: 'completed',
          constitutional_validation: { completed: true, iterations_used: 1 }
        }
      }
    };
    const warnings = validateStateWrite(state);
    assert.equal(warnings.length, 0);
  });

  it('VAL-08: validates all phases in state', () => {
    const state = {
      phases: {
        '01-requirements': {
          constitutional_validation: { completed: true, iterations_used: 0 }
        },
        '06-implementation': {
          iteration_requirements: {
            test_iteration: { completed: true, current_iteration: 0 }
          }
        }
      }
    };
    const warnings = validateStateWrite(state);
    assert.equal(warnings.length, 2);
  });

  it('VAL-09: returns empty when no phases property', () => {
    const state = { project_name: 'test' };
    const warnings = validateStateWrite(state);
    assert.equal(warnings.length, 0);
  });

  it('VAL-10: handles null state gracefully', () => {
    const warnings = validateStateWrite(null);
    assert.equal(warnings.length, 0);
  });
});
