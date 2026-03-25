/**
 * Tests for validatePhaseGate in Codex runtime
 * BUG-0057: Gate-blocker traceability verification (FR-009)
 * Integration tests for Codex runtime phase gate validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validatePhaseGate } from '../../../src/providers/codex/runtime.js';

// ---------------------------------------------------------------------------
// RVG-01..06: validatePhaseGate (FR-009, AC-009-01..05)
// ---------------------------------------------------------------------------

describe('validatePhaseGate', () => {
  it('RVG-01: validation passes -> allows phase advancement', async () => {
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      testFiles: [{ path: 'tests/a.test.js', content: "it('TV-01: test', () => {});" }],
      modifiedFiles: ['src/a.js'],
      testExecutionOutput: 'Statements : 85%'
    };
    const result = await validatePhaseGate('06-implementation', inputs);
    assert.strictEqual(result.pass, true);
  });

  it('RVG-02: validation fails -> blocks advancement, returns structured failure', async () => {
    const inputs = {
      requirementsSpec: '- **AC-001-01**: First\n- **AC-001-02**: Second',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |'
    };
    const result = await validatePhaseGate('05-test-strategy', inputs);
    assert.strictEqual(result.pass, false);
    assert.ok(result.failures.length > 0);
  });

  it('RVG-03: structured result format consumable by Codex runner', async () => {
    const inputs = {};
    const result = await validatePhaseGate('06-implementation', inputs);
    // Verify the structure has the expected fields
    assert.ok('pass' in result);
    assert.ok('failures' in result);
    assert.ok('details' in result);
    assert.ok('validator_errors' in result);
    assert.ok(Array.isArray(result.failures));
    assert.ok(Array.isArray(result.validator_errors));
  });

  it('RVG-04: retry count can be tracked by caller', async () => {
    // This tests that the function returns consistently for retry tracking
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test\n- **AC-001-02**: Missing',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |'
    };
    const result1 = await validatePhaseGate('05-test-strategy', inputs);
    const result2 = await validatePhaseGate('05-test-strategy', inputs);
    // Same inputs produce same results
    assert.strictEqual(result1.pass, result2.pass);
  });

  it('RVG-05: validator crash -> fail-open, allows advancement with warning', async () => {
    // Unknown phase with no validators
    const result = await validatePhaseGate('99-nonexistent', {});
    assert.strictEqual(result.pass, true);
    assert.ok(Array.isArray(result.validator_errors));
  });

  it('RVG-06: imports validatePhase directly (ESM to ESM)', async () => {
    // The fact that this test runs proves ESM import works
    const result = await validatePhaseGate('05-test-strategy', {});
    assert.ok(typeof result.pass === 'boolean');
  });
});
