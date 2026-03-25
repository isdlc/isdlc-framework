/**
 * Tests for src/core/validators/coverage-presence-validator.js
 * BUG-0057: Gate-blocker traceability verification (FR-004)
 * Coverage data presence validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateCoveragePresence } from '../../../src/core/validators/coverage-presence-validator.js';

// ---------------------------------------------------------------------------
// CPV-01..03: Coverage Found (FR-004)
// ---------------------------------------------------------------------------

describe('validateCoveragePresence — coverage found', () => {
  it('CPV-01: coverage line present, meets threshold -> pass: true', () => {
    const output = 'All tests passed\nStatements : 85.3%\nDone.';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.details.coverage_found, true);
    assert.strictEqual(result.details.coverage_percent, 85.3);
  });

  it('CPV-02: coverage line present, below threshold -> pass: false with percent + threshold', () => {
    const output = 'Statements : 65.0%\nDone.';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.details.coverage_percent, 65.0);
    assert.strictEqual(result.details.threshold, 80);
  });

  it('CPV-03: returns source_pattern identifying which regex matched', () => {
    const output = 'Lines : 90.0%';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, true);
    assert.ok(result.details.source_pattern !== null);
  });
});

// ---------------------------------------------------------------------------
// CPV-04..05: Coverage Not Found (FR-004)
// ---------------------------------------------------------------------------

describe('validateCoveragePresence — coverage not found', () => {
  it('CPV-04: no coverage data and required: true -> pass: false, failure_reason: "no_coverage_data"', () => {
    const output = 'All 10 tests passed.';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.failure_reason, 'no_coverage_data');
  });

  it('CPV-05: no coverage data and required: false -> pass: true', () => {
    const output = 'All 10 tests passed.';
    const result = validateCoveragePresence(output, { required: false, threshold: 80 });
    assert.strictEqual(result.pass, true);
  });
});

// ---------------------------------------------------------------------------
// CPV-06..08: Regex Patterns (FR-004)
// ---------------------------------------------------------------------------

describe('validateCoveragePresence — regex patterns', () => {
  it('CPV-06: matches "Coverage: 85.3%" format (generic)', () => {
    const output = '85.3% coverage';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.details.coverage_percent, 85.3);
  });

  it('CPV-07: matches "Statements : 92.1%" format (Jest)', () => {
    const output = 'Statements : 92.1%';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.details.coverage_percent, 92.1);
  });

  it('CPV-08: matches "Lines: 78%" format (Jest lines)', () => {
    const output = 'Lines : 78%';
    const result = validateCoveragePresence(output, { required: true, threshold: 80 });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.details.coverage_percent, 78);
  });
});

// ---------------------------------------------------------------------------
// CPV-09..10: Fail-Open (FR-004)
// ---------------------------------------------------------------------------

describe('validateCoveragePresence — fail-open', () => {
  it('CPV-09: null testExecutionOutput -> pass: true, missing_artifacts', () => {
    const result = validateCoveragePresence(null, { required: true });
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('testExecutionOutput'));
  });

  it('CPV-10: empty string output -> coverage_found: false', () => {
    const result = validateCoveragePresence('', { required: true });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.details.coverage_found, false);
  });
});
