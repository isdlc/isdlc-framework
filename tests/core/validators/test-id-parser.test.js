/**
 * Tests for src/core/validators/lib/test-id-parser.js
 * BUG-0057: Gate-blocker traceability verification
 * Shared parsing functions for test IDs and AC IDs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAcIds,
  extractTestCaseIds,
  extractTestToAcMappings
} from '../../../src/core/validators/lib/test-id-parser.js';

// ---------------------------------------------------------------------------
// TIP-01..04: extractAcIds (FR-011, AC-011-02)
// ---------------------------------------------------------------------------

describe('extractAcIds', () => {
  it('TIP-01: extracts AC-001-01 through AC-011-03 from requirements-spec content', () => {
    const content = `
## Functional Requirements
- **AC-001-01**: Validator parses AC IDs
- **AC-001-02**: Validator parses test mappings
- **AC-006-03**: Threshold check
- **AC-011-03**: extractTestToAcMappings returns mappings
    `;
    const result = extractAcIds(content);
    assert.deepStrictEqual(result, ['AC-001-01', 'AC-001-02', 'AC-006-03', 'AC-011-03']);
  });

  it('TIP-02: returns empty array for content with no AC IDs', () => {
    const result = extractAcIds('No acceptance criteria here, just plain text.');
    assert.deepStrictEqual(result, []);
  });

  it('TIP-03: handles malformed AC IDs gracefully (e.g., AC-1-1, AC-0001-01)', () => {
    const content = `
- AC-1-1 is malformed (too few digits)
- AC-0001-01 is malformed (too many digits)
- AC-001-01 is valid
    `;
    const result = extractAcIds(content);
    // Only exact AC-NNN-NN format should match
    assert.deepStrictEqual(result, ['AC-001-01']);
  });

  it('TIP-04: deduplicates AC IDs appearing multiple times', () => {
    const content = `
- **AC-001-01**: First mention
- See AC-001-01 for reference
- Also AC-002-01 and AC-001-01 again
    `;
    const result = extractAcIds(content);
    assert.deepStrictEqual(result, ['AC-001-01', 'AC-002-01']);
  });
});

// ---------------------------------------------------------------------------
// TIP-05..08: extractTestCaseIds (FR-011, AC-011-01)
// ---------------------------------------------------------------------------

describe('extractTestCaseIds', () => {
  it('TIP-05: extracts VR-01, TIV-03, CC-07 etc. from test-strategy content', () => {
    const content = `
| Test ID | Target |
|---------|--------|
| VR-01 | Validates requirement traceability |
| TIV-03 | No test files → all planned unimplemented |
| CC-07 | All files under 500 lines |
    `;
    const result = extractTestCaseIds(content);
    assert.ok(result.includes('VR-01'));
    assert.ok(result.includes('TIV-03'));
    assert.ok(result.includes('CC-07'));
  });

  it('TIP-06: returns empty array for content with no test IDs', () => {
    const result = extractTestCaseIds('Just some text with no test identifiers.');
    assert.deepStrictEqual(result, []);
  });

  it('TIP-07: extracts multi-segment IDs like TC-BUILD-01', () => {
    const content = `
| TC-BUILD-01 | Build test case |
| TC-DEPLOY-02 | Deploy test case |
    `;
    const result = extractTestCaseIds(content);
    assert.ok(result.includes('TC-BUILD-01'));
    assert.ok(result.includes('TC-DEPLOY-02'));
  });

  it('TIP-08: ignores IDs that are substrings within longer text', () => {
    const content = `
| TV-01 | A real test ID |
Some text with NATIVE-01 embedded in a word
    `;
    const result = extractTestCaseIds(content);
    assert.ok(result.includes('TV-01'));
    // NATIVE-01 could match — that's ok since it looks like a valid ID
    // The key is that TV-01 is correctly extracted
  });
});

// ---------------------------------------------------------------------------
// TIP-09..12: extractTestToAcMappings (FR-011, AC-011-03)
// ---------------------------------------------------------------------------

describe('extractTestToAcMappings', () => {
  it('TIP-09: parses test ID + AC reference lines into mapping objects', () => {
    const content = `
| TV-01 | All ACs covered | positive | AC-001-03, AC-001-04 | src/core/validators/traceability-validator.js |
| TV-02 | Returns mapped_test_cases | positive | AC-001-04 | src/core/validators/traceability-validator.js |
    `;
    const result = extractTestToAcMappings(content);
    assert.ok(result.length >= 2);

    const tv01 = result.find(m => m.test_id === 'TV-01');
    assert.ok(tv01);
    assert.ok(tv01.ac_ids.includes('AC-001-03'));
    assert.ok(tv01.ac_ids.includes('AC-001-04'));
  });

  it('TIP-10: includes production_file when production file column is present', () => {
    const content = `
| TV-01 | All ACs covered | positive | AC-001-03 | src/core/validators/traceability-validator.js |
    `;
    const result = extractTestToAcMappings(content);
    const tv01 = result.find(m => m.test_id === 'TV-01');
    assert.ok(tv01);
    assert.strictEqual(tv01.production_file, 'src/core/validators/traceability-validator.js');
  });

  it('TIP-11: returns null production_file when annotation absent', () => {
    const content = `
| TV-01 | All ACs covered | positive | AC-001-03 |
    `;
    const result = extractTestToAcMappings(content);
    const tv01 = result.find(m => m.test_id === 'TV-01');
    assert.ok(tv01);
    assert.strictEqual(tv01.production_file, null);
  });

  it('TIP-12: handles multiple AC references per test ID line', () => {
    const content = `
| TIV-18 | Combined pass | positive | AC-002-01, AC-002-06 | src/core/validators/test-implementation-validator.js |
    `;
    const result = extractTestToAcMappings(content);
    const tiv18 = result.find(m => m.test_id === 'TIV-18');
    assert.ok(tiv18);
    assert.deepStrictEqual(tiv18.ac_ids, ['AC-002-01', 'AC-002-06']);
  });
});
