/**
 * Contract Evaluator Tests (Refactored)
 * =======================================
 * REQ-0141: Execution Contract System (FR-003, FR-009)
 * REQ-GH-213: Inline Contract Enforcement (FR-005)
 *
 * Updated per REQ-GH-213 FR-005: evaluateContract() is now a deprecated stub.
 * Inline check functions are tested in contract-checks.test.js.
 * These tests verify the deprecated stub behavior and retained helpers.
 *
 * Tests: CE-DEPR-01 through CE-DEPR-06, VB-DEPR-01
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateContract,
  formatViolationBanner,
  getByPath,
  ContractViolationError,
  checkDomainTransition,
  checkBatchWrite,
  checkPersonaFormat,
  checkPersonaContribution,
  checkDelegation,
  checkArtifacts,
  checkTaskList
} from '../../../src/core/validators/contract-evaluator.js';

// ---------------------------------------------------------------------------
// Deprecated Stub Tests
// ---------------------------------------------------------------------------

describe('Contract Evaluator - deprecated evaluateContract() stub', () => {
  it('CE-DEPR-01: evaluateContract() returns empty violations with deprecation warning', () => {
    const result = evaluateContract({
      state: {},
      contractEntry: { execution_unit: 'test', context: 'test' },
      projectRoot: '.'
    });
    assert.deepStrictEqual(result.violations, []);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('deprecated'));
    assert.equal(result.stale_contract, false);
  });

  it('CE-DEPR-02: evaluateContract() handles null params gracefully', () => {
    const result = evaluateContract(null);
    assert.deepStrictEqual(result.violations, []);
    assert.ok(result.warnings.length > 0);
  });

  it('CE-DEPR-03: evaluateContract() return shape matches original { violations, warnings, stale_contract }', () => {
    const result = evaluateContract({});
    assert.ok(Array.isArray(result.violations));
    assert.ok(Array.isArray(result.warnings));
    assert.equal(typeof result.stale_contract, 'boolean');
  });
});

// ---------------------------------------------------------------------------
// Deprecated formatViolationBanner Tests
// ---------------------------------------------------------------------------

describe('Contract Evaluator - deprecated formatViolationBanner()', () => {
  it('VB-DEPR-01: formatViolationBanner() returns a string with deprecated marker', () => {
    const banner = formatViolationBanner({
      execution_unit: 'test',
      expected: 'something',
      actual: 'other'
    });
    assert.equal(typeof banner, 'string');
    assert.ok(banner.includes('deprecated'));
  });

  it('VB-DEPR-02: formatViolationBanner() handles null input gracefully', () => {
    const banner = formatViolationBanner(null);
    assert.equal(typeof banner, 'string');
  });
});

// ---------------------------------------------------------------------------
// Retained Helper Tests
// ---------------------------------------------------------------------------

describe('Contract Evaluator - getByPath() retained helper', () => {
  it('CE-HELPER-01: getByPath traverses nested object correctly', () => {
    const obj = { a: { b: { c: 42 } } };
    const result = getByPath(obj, 'a.b.c');
    assert.equal(result.found, true);
    assert.equal(result.value, 42);
  });

  it('CE-HELPER-02: getByPath returns found=false for missing paths', () => {
    const obj = { a: { b: 1 } };
    const result = getByPath(obj, 'a.c.d');
    assert.equal(result.found, false);
  });

  it('CE-HELPER-03: getByPath handles null input gracefully', () => {
    const result = getByPath(null, 'any.path');
    assert.equal(result.found, false);
  });

  it('CE-HELPER-04: getByPath handles null path gracefully', () => {
    const result = getByPath({ a: 1 }, null);
    assert.equal(result.found, false);
  });
});

// ---------------------------------------------------------------------------
// Re-export Verification
// ---------------------------------------------------------------------------

describe('Contract Evaluator - re-exports from contract-checks.js', () => {
  it('CE-REEXPORT-01: ContractViolationError is re-exported', () => {
    assert.ok(ContractViolationError);
    const err = new ContractViolationError({ decisionPoint: 'test', expected: 'a', actual: 'b' });
    assert.ok(err instanceof Error);
  });

  it('CE-REEXPORT-02: All 7 check functions are re-exported', () => {
    assert.equal(typeof checkDomainTransition, 'function');
    assert.equal(typeof checkBatchWrite, 'function');
    assert.equal(typeof checkPersonaFormat, 'function');
    assert.equal(typeof checkPersonaContribution, 'function');
    assert.equal(typeof checkDelegation, 'function');
    assert.equal(typeof checkArtifacts, 'function');
    assert.equal(typeof checkTaskList, 'function');
  });
});
