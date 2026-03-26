/**
 * Contract Schema Validator Tests
 * =================================
 * REQ-0141: Execution Contract System (FR-001)
 * AC-001-01 through AC-001-05
 *
 * Tests: CS-01 through CS-21
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateContract, validateContractEntry } from '../../../src/core/validators/contract-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validEntry(overrides = {}) {
  return {
    execution_unit: '06-implementation',
    context: 'feature:standard',
    expectations: {
      agent: 'software-developer',
      skills_required: null,
      artifacts_produced: null,
      state_assertions: [],
      cleanup: [],
      presentation: null
    },
    violation_response: {
      agent_not_engaged: 'block',
      skills_missing: 'report',
      artifacts_missing: 'block',
      state_incomplete: 'report',
      cleanup_skipped: 'warn',
      presentation_violated: 'warn'
    },
    ...overrides
  };
}

function validContract(overrides = {}) {
  return {
    version: '1.0.0',
    entries: [validEntry()],
    _generation_metadata: {
      generated_at: '2026-03-26T00:00:00.000Z',
      generator_version: '1.0.0',
      input_files: []
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Positive tests
// ---------------------------------------------------------------------------

describe('Contract Schema - positive tests', () => {
  it('CS-01: validateContract accepts a well-formed contract with version, entries[], _generation_metadata', () => {
    const result = validateContract(validContract());
    assert.equal(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('CS-02: validateContractEntry accepts entry with all required fields', () => {
    const result = validateContractEntry(validEntry());
    assert.equal(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('CS-03: validateContractEntry accepts expectations with all sub-fields', () => {
    const entry = validEntry({
      expectations: {
        agent: 'software-developer',
        skills_required: { '$ref': 'skills-manifest', agent: 'software-developer' },
        artifacts_produced: { '$ref': 'artifact-paths', phase: '06-implementation' },
        state_assertions: [{ path: 'phases.06-implementation.status', equals: 'completed' }],
        cleanup: ['tasks.md section marked COMPLETE'],
        presentation: {
          confirmation_sequence: ['requirements', 'architecture', 'design'],
          persona_format: 'bulleted',
          progress_format: 'task-list',
          completion_summary: true
        }
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-04: validateContractEntry accepts violation_response with valid values: block, warn, report', () => {
    const entry = validEntry({
      violation_response: {
        agent_not_engaged: 'block',
        skills_missing: 'warn',
        artifacts_missing: 'report'
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-05: validateContractEntry accepts non-workflow execution_unit values', () => {
    for (const eu of ['roundtable', 'discover', 'add-item']) {
      const entry = validEntry({ execution_unit: eu, context: eu });
      const result = validateContractEntry(entry);
      assert.equal(result.valid, true, `Should accept execution_unit "${eu}"`);
    }
  });

  it('CS-06: validateContractEntry accepts $ref objects in skills_required and artifacts_produced', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        skills_required: { '$ref': 'skills-manifest', agent: 'software-developer' },
        artifacts_produced: { '$ref': 'artifact-paths', phase: '06-implementation' }
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-07: validateContractEntry accepts null for optional expectations fields', () => {
    const entry = validEntry({
      expectations: {
        agent: null,
        skills_required: null,
        artifacts_produced: null,
        state_assertions: [],
        cleanup: [],
        presentation: null
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-08: validateContractEntry accepts presentation section with all sub-fields', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        presentation: {
          confirmation_sequence: ['requirements', 'architecture'],
          persona_format: 'bulleted',
          progress_format: 'task-list',
          completion_summary: true
        }
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// Negative tests
// ---------------------------------------------------------------------------

describe('Contract Schema - negative tests', () => {
  it('CS-09: validateContract rejects contract without version field', () => {
    const result = validateContract({ entries: [] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('version')));
  });

  it('CS-10: validateContract rejects contract without entries array', () => {
    const result = validateContract({ version: '1.0.0' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('entries')));
  });

  it('CS-11: validateContractEntry rejects entry missing execution_unit', () => {
    const entry = validEntry();
    delete entry.execution_unit;
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('execution_unit')));
  });

  it('CS-12: validateContractEntry rejects entry missing context', () => {
    const entry = validEntry();
    delete entry.context;
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('context')));
  });

  it('CS-13: validateContractEntry rejects entry missing expectations', () => {
    const entry = validEntry();
    delete entry.expectations;
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('expectations')));
  });

  it('CS-14: validateContractEntry rejects entry missing violation_response', () => {
    const entry = validEntry();
    delete entry.violation_response;
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('violation_response')));
  });

  it('CS-15: validateContractEntry rejects violation_response with invalid value', () => {
    const entry = validEntry({
      violation_response: { agent_not_engaged: 'invalid' }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('block, warn, report')));
  });

  it('CS-16: validateContractEntry rejects state_assertions without path field', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        state_assertions: [{ equals: 'completed' }]
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('path')));
  });

  it('CS-17: validateContractEntry rejects state_assertions without equals field', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        state_assertions: [{ path: 'phases.06-implementation.status' }]
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('equals')));
  });

  it('CS-18: validateContract rejects non-object input (string, number, null)', () => {
    assert.equal(validateContract('string').valid, false);
    assert.equal(validateContract(42).valid, false);
    assert.equal(validateContract(null).valid, false);
    assert.equal(validateContract(undefined).valid, false);
  });
});

// ---------------------------------------------------------------------------
// Boundary tests
// ---------------------------------------------------------------------------

describe('Contract Schema - boundary tests', () => {
  it('CS-19: validateContract accepts contract with empty entries array', () => {
    const result = validateContract({ version: '1.0.0', entries: [] });
    assert.equal(result.valid, true);
  });

  it('CS-20: validateContractEntry accepts entry with empty state_assertions array', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        state_assertions: []
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-21: validateContractEntry accepts entry with empty cleanup array', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        cleanup: []
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// REQ-GH-208: task_display and task_scope fields (FR-006, FR-007)
// ---------------------------------------------------------------------------

describe('REQ-GH-208: task_display and task_scope validation', () => {
  it('CS-22: validateContractEntry accepts presentation with task_display field (FR-007 AC-007-01)', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        presentation: {
          confirmation_sequence: ['requirements', 'architecture', 'design', 'tasks'],
          persona_format: null,
          progress_format: null,
          completion_summary: true,
          task_display: 'counter'
        }
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-23: validateContractEntry accepts presentation with task_scope field (FR-006 AC-006-01)', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        presentation: {
          confirmation_sequence: null,
          persona_format: null,
          progress_format: null,
          completion_summary: null,
          task_scope: 'full-workflow'
        }
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true);
  });

  it('CS-24: validateContractEntry accepts all valid task_display enum values (FR-007 AC-007-01..03)', () => {
    for (const value of ['counter', 'expanded', 'phase-only']) {
      const entry = validEntry({
        expectations: {
          ...validEntry().expectations,
          presentation: {
            confirmation_sequence: null,
            persona_format: null,
            progress_format: null,
            completion_summary: null,
            task_display: value
          }
        }
      });
      const result = validateContractEntry(entry);
      assert.equal(result.valid, true, `task_display '${value}' should be valid`);
    }
  });

  it('CS-25: validateContractEntry accepts all valid task_scope enum values (FR-006 AC-006-01..02)', () => {
    for (const value of ['full-workflow', 'implementation-only']) {
      const entry = validEntry({
        expectations: {
          ...validEntry().expectations,
          presentation: {
            confirmation_sequence: null,
            persona_format: null,
            progress_format: null,
            completion_summary: null,
            task_scope: value
          }
        }
      });
      const result = validateContractEntry(entry);
      assert.equal(result.valid, true, `task_scope '${value}' should be valid`);
    }
  });

  it('CS-26: validateContractEntry accepts presentation without task_display/task_scope — optional fields (FR-006, FR-007)', () => {
    const entry = validEntry({
      expectations: {
        ...validEntry().expectations,
        presentation: {
          confirmation_sequence: ['requirements', 'architecture', 'design'],
          persona_format: 'bulleted',
          progress_format: 'task-list',
          completion_summary: true
        }
      }
    });
    const result = validateContractEntry(entry);
    assert.equal(result.valid, true, 'Existing contracts without task fields should remain valid');
  });
});
