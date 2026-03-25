/**
 * Tests for src/core/validators/test-execution-validator.js
 * BUG-0057: Gate-blocker traceability verification (FR-003)
 * Planned tests vs executed tests validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateTestExecution } from '../../../src/core/validators/test-execution-validator.js';

// ---------------------------------------------------------------------------
// TEV-01..02: Happy Path (FR-003)
// ---------------------------------------------------------------------------

describe('validateTestExecution — happy path', () => {
  it('TEV-01: all planned tests executed -> pass: true, unexecuted_tests: []', () => {
    const strategy = `
| TV-01 | Test one | positive | AC-001-01 | src/a.js |
| TV-02 | Test two | positive | AC-001-02 | src/b.js |
    `;
    const output = `
  ✓ TV-01: all ACs covered (1.2ms)
  ✓ TV-02: returns mapped test cases (0.5ms)
    `;
    const result = validateTestExecution(strategy, output);
    assert.strictEqual(result.pass, true);
    assert.deepStrictEqual(result.details.unexecuted_tests, []);
  });

  it('TEV-02: returns executed_tests list matching output', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const output = '  ✓ TV-01: test passed (1ms)';
    const result = validateTestExecution(strategy, output);
    assert.ok(result.details.executed_tests.includes('TV-01'));
  });
});

// ---------------------------------------------------------------------------
// TEV-03..05: Failure Cases (FR-003)
// ---------------------------------------------------------------------------

describe('validateTestExecution — failure cases', () => {
  it('TEV-03: some planned tests not in output -> unexecuted_tests lists them', () => {
    const strategy = `
| TV-01 | Test one | positive | AC-001-01 | src/a.js |
| TV-02 | Test two | positive | AC-001-02 | src/b.js |
    `;
    const output = '  ✓ TV-01: test (1ms)';
    const result = validateTestExecution(strategy, output);
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.unexecuted_tests.includes('TV-02'));
  });

  it('TEV-04: failed tests extracted -> failed_tests populated, pass: false', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const output = '  ✗ TV-01: test failed (2ms)';
    const result = validateTestExecution(strategy, output);
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.failed_tests.includes('TV-01'));
  });

  it('TEV-05: mix of executed, failed, unexecuted -> all categorized correctly', () => {
    const strategy = `
| TV-01 | Test one | positive | AC-001-01 | src/a.js |
| TV-02 | Test two | positive | AC-001-02 | src/b.js |
| TV-03 | Test three | positive | AC-001-03 | src/c.js |
    `;
    const output = `
  ✓ TV-01: passed (1ms)
  ✗ TV-02: failed (2ms)
    `;
    const result = validateTestExecution(strategy, output);
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.executed_tests.includes('TV-01'));
    assert.ok(result.details.failed_tests.includes('TV-02'));
    assert.ok(result.details.unexecuted_tests.includes('TV-03'));
  });
});

// ---------------------------------------------------------------------------
// TEV-06..09: Output Format Parsing (FR-003)
// ---------------------------------------------------------------------------

describe('validateTestExecution — output format parsing', () => {
  it('TEV-06: parses node:test output (checkmark + test name)', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const output = '  ✓ TV-01: test passed (1.5ms)';
    const result = validateTestExecution(strategy, output);
    assert.ok(result.details.executed_tests.includes('TV-01'));
  });

  it('TEV-07: parses Jest output (PASS/FAIL markers)', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const output = '  PASS  tests/a.test.js\n    ✓ TV-01: test (5ms)';
    const result = validateTestExecution(strategy, output);
    assert.ok(result.details.executed_tests.includes('TV-01'));
  });

  it('TEV-08: parses TAP output (ok N / not ok N)', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const output = 'ok 1 TV-01: test passed';
    const result = validateTestExecution(strategy, output);
    assert.ok(result.details.executed_tests.includes('TV-01'));
  });

  it('TEV-09: parses node:test failure output (cross mark + test name)', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const output = '  ✗ TV-01: test failed (2ms)';
    const result = validateTestExecution(strategy, output);
    assert.ok(result.details.failed_tests.includes('TV-01'));
  });
});

// ---------------------------------------------------------------------------
// TEV-10..12: Fail-Open (FR-003)
// ---------------------------------------------------------------------------

describe('validateTestExecution — fail-open', () => {
  it('TEV-10: null testStrategyContent -> pass: true, missing_artifacts', () => {
    const result = validateTestExecution(null, 'some output');
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('testStrategy'));
  });

  it('TEV-11: null testExecutionOutput -> pass: true, missing_artifacts', () => {
    const result = validateTestExecution('| TV-01 | Test | positive | AC-001-01 | src/a.js |', null);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('testExecutionOutput'));
  });

  it('TEV-12: empty output string -> no tests detected, all planned unexecuted', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const result = validateTestExecution(strategy, '');
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.unexecuted_tests.includes('TV-01'));
  });
});
