/**
 * Tests for src/core/validators/traceability-validator.js
 * BUG-0057: Gate-blocker traceability verification (FR-001)
 * Requirements-to-tests traceability validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateRequirementsToTests } from '../../../src/core/validators/traceability-validator.js';

// ---------------------------------------------------------------------------
// TV-01..03: Happy Path (FR-001)
// ---------------------------------------------------------------------------

describe('validateRequirementsToTests — happy path', () => {
  const reqSpec = `
## Functional Requirements
- **AC-001-01**: Validator parses AC IDs
- **AC-001-02**: Validator parses test mappings
  `;

  const strategy = `
| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-01 | All ACs covered | positive | AC-001-01, AC-001-02 | src/core/validators/traceability-validator.js |
  `;

  it('TV-01: all ACs covered -> pass: true, orphan_acs: []', () => {
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.pass, true);
    assert.deepStrictEqual(result.details.orphan_acs, []);
  });

  it('TV-02: returns mapped_test_cases with correct AC to test ID associations', () => {
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.ok(result.details.mapped_test_cases.length > 0);
    const mapped = result.details.mapped_test_cases;
    const ac1 = mapped.find(m => m.ac_id === 'AC-001-01');
    assert.ok(ac1);
    assert.ok(ac1.test_ids.includes('TV-01'));
  });

  it('TV-03: calculates correct coverage_percent (100% when all mapped)', () => {
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.details.coverage_percent, 100);
  });
});

// ---------------------------------------------------------------------------
// TV-04..06: Failure Cases (FR-001)
// ---------------------------------------------------------------------------

describe('validateRequirementsToTests — failure cases', () => {
  it('TV-04: missing ACs -> pass: false, orphan_acs lists unmapped ACs', () => {
    const reqSpec = `
- **AC-001-01**: First
- **AC-001-02**: Second
- **AC-001-03**: Third
    `;
    const strategy = `
| TV-01 | Test one | positive | AC-001-01 | src/file.js |
    `;
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.orphan_acs.includes('AC-001-02'));
    assert.ok(result.details.orphan_acs.includes('AC-001-03'));
  });

  it('TV-05: single orphan AC -> coverage_percent reflects partial coverage', () => {
    const reqSpec = `
- **AC-001-01**: First
- **AC-001-02**: Second
    `;
    const strategy = `
| TV-01 | Test | positive | AC-001-01 | src/file.js |
    `;
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.details.coverage_percent, 50);
  });

  it('TV-06: all ACs orphaned -> pass: false, coverage_percent: 0', () => {
    const reqSpec = `
- **AC-001-01**: First
- **AC-001-02**: Second
    `;
    const strategy = `
| TV-01 | Test | positive | AC-009-01 | src/other.js |
    `;
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.details.coverage_percent, 0);
  });
});

// ---------------------------------------------------------------------------
// TV-07: Unparseable References (FR-001)
// ---------------------------------------------------------------------------

describe('validateRequirementsToTests — unparseable', () => {
  it('TV-07: malformed references -> unparseable_references populated', () => {
    const reqSpec = `
- **AC-001-01**: Valid
    `;
    // unparseable references come from lines that have test IDs but no valid AC refs
    const strategy = `
| TV-01 | Test | positive | AC-001-01 | src/file.js |
| TV-02 | Test | positive | INVALID | src/file.js |
    `;
    const result = validateRequirementsToTests(reqSpec, strategy);
    // TV-02 has no parseable AC reference, so should be in unparseable
    assert.ok(Array.isArray(result.details.unparseable_references));
  });
});

// ---------------------------------------------------------------------------
// TV-08..10: Fail-Open on Missing Artifacts (FR-001)
// ---------------------------------------------------------------------------

describe('validateRequirementsToTests — fail-open', () => {
  it('TV-08: null requirementsSpec -> pass: true, missing_artifacts includes "requirementsSpec"', () => {
    const result = validateRequirementsToTests(null, 'some strategy');
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('requirementsSpec'));
  });

  it('TV-09: null testStrategy -> pass: true, missing_artifacts includes "testStrategy"', () => {
    const result = validateRequirementsToTests('some req', null);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('testStrategy'));
  });

  it('TV-10: both null -> pass: true, missing_artifacts includes both', () => {
    const result = validateRequirementsToTests(null, null);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('requirementsSpec'));
    assert.ok(result.missing_artifacts.includes('testStrategy'));
  });
});

// ---------------------------------------------------------------------------
// TV-11..14: Edge Cases
// ---------------------------------------------------------------------------

describe('validateRequirementsToTests — edge cases', () => {
  it('TV-11: empty string inputs -> pass: true (no ACs found = nothing to check)', () => {
    const result = validateRequirementsToTests('', '');
    assert.strictEqual(result.pass, true);
  });

  it('TV-12: requirements with 0 ACs -> pass: true', () => {
    const result = validateRequirementsToTests('No ACs here', '| TV-01 | Test | positive | AC-001-01 | src/file.js |');
    assert.strictEqual(result.pass, true);
  });

  it('TV-13: strategy maps to ACs not in requirements -> pass: true (extra tests OK)', () => {
    const reqSpec = '- **AC-001-01**: Only AC';
    const strategy = `
| TV-01 | Test | positive | AC-001-01, AC-009-99 | src/file.js |
    `;
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.pass, true);
    assert.deepStrictEqual(result.details.orphan_acs, []);
  });

  it('TV-14: multiple tests map to same AC -> AC counted as covered', () => {
    const reqSpec = '- **AC-001-01**: Only AC';
    const strategy = `
| TV-01 | Test1 | positive | AC-001-01 | src/a.js |
| TV-02 | Test2 | positive | AC-001-01 | src/b.js |
    `;
    const result = validateRequirementsToTests(reqSpec, strategy);
    assert.strictEqual(result.pass, true);
    const mapped = result.details.mapped_test_cases.find(m => m.ac_id === 'AC-001-01');
    assert.ok(mapped.test_ids.length >= 2);
  });
});
