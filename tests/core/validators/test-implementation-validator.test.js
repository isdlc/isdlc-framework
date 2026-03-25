/**
 * Tests for src/core/validators/test-implementation-validator.js
 * BUG-0057: Gate-blocker traceability verification (FR-002)
 * Three-part validation: planned tests coded, production imports modified, AC-to-production traceability.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateTestImplementation } from '../../../src/core/validators/test-implementation-validator.js';

// ---------------------------------------------------------------------------
// TIV-01..04: Part A — Planned Tests Coded (FR-002)
// ---------------------------------------------------------------------------

describe('validateTestImplementation — Part A: planned tests coded', () => {
  const strategy = `
| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-01 | Test one | positive | AC-001-01 | src/a.js |
| TV-02 | Test two | positive | AC-001-02 | src/b.js |
  `;

  it('TIV-01: all planned test IDs found in test files -> unimplemented_tests: []', () => {
    const testFiles = [
      { path: 'tests/a.test.js', content: 'it("TV-01: all ACs covered", () => {});\nit("TV-02: returns mapped", () => {});' }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js', 'src/b.js']);
    assert.deepStrictEqual(result.details.unimplemented_tests, []);
  });

  it('TIV-02: some planned IDs missing -> unimplemented_tests lists them', () => {
    const testFiles = [
      { path: 'tests/a.test.js', content: 'it("TV-01: test", () => {});' }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js', 'src/b.js']);
    assert.ok(result.details.unimplemented_tests.includes('TV-02'));
  });

  it('TIV-03: no test files provided -> all planned tests unimplemented', () => {
    const result = validateTestImplementation(strategy, [], ['src/a.js']);
    assert.strictEqual(result.details.unimplemented_tests.length, 2);
  });

  it('TIV-04: test ID found across multiple files -> counted as implemented', () => {
    const testFiles = [
      { path: 'tests/a.test.js', content: 'it("TV-01: part1", () => {});' },
      { path: 'tests/b.test.js', content: 'it("TV-01: part2", () => {});' }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js', 'src/b.js']);
    assert.ok(result.details.implemented_tests.includes('TV-01'));
  });
});

// ---------------------------------------------------------------------------
// TIV-05..10: Part B — Production Imports Modified (FR-002)
// ---------------------------------------------------------------------------

describe('validateTestImplementation — Part B: production imports modified', () => {
  it('TIV-05: all imported production modules in modifiedFiles -> unmodified_imports: []', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "import { fn } from '../src/a.js';\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    assert.deepStrictEqual(result.details.unmodified_imports, []);
  });

  it('TIV-06: import not in modifiedFiles -> unmodified_imports includes path', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "import { fn } from '../src/a.js';\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/other.js']);
    assert.ok(result.details.unmodified_imports.length > 0);
  });

  it('TIV-07: parses ESM import statements', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "import { fn } from '../src/a.js';\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    const imports = result.details.test_imports;
    assert.ok(imports.length > 0);
    assert.ok(imports[0].imports.length > 0);
  });

  it('TIV-08: parses CJS require statements', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "const fn = require('../src/a.js');\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    const imports = result.details.test_imports;
    assert.ok(imports.length > 0);
  });

  it('TIV-09: ignores node_modules and node: imports', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "import assert from 'node:assert/strict';\nimport { fn } from '../src/a.js';\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    // node:assert should not appear in imports
    const allImports = result.details.test_imports.flatMap(t => t.imports);
    assert.ok(!allImports.some(i => i.startsWith('node:')));
  });

  it('TIV-10: resolves relative import paths to project-relative paths', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/core/a.test.js', content: "import { fn } from '../../src/a.js';\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    const allImports = result.details.test_imports.flatMap(t => t.imports);
    assert.ok(allImports.some(i => i === 'src/a.js'));
  });
});

// ---------------------------------------------------------------------------
// TIV-11..13: Part C — AC-to-Production File Traceability (FR-002, FR-010)
// ---------------------------------------------------------------------------

describe('validateTestImplementation — Part C: AC-to-production traceability', () => {
  it('TIV-11: all AC production files in modifiedFiles -> orphan_acs_no_production: []', () => {
    const strategy = `
| TV-01 | Test | positive | AC-001-01 | src/a.js |
| TV-02 | Test | positive | AC-001-02 | src/b.js |
    `;
    const testFiles = [
      { path: 'tests/a.test.js', content: "it('TV-01: test', () => {});\nit('TV-02: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js', 'src/b.js']);
    assert.deepStrictEqual(result.details.orphan_acs_no_production, []);
  });

  it('TIV-12: AC production file not in modifiedFiles -> orphan_acs_no_production includes AC', () => {
    const strategy = `
| TV-01 | Test | positive | AC-001-01 | src/a.js |
| TV-02 | Test | positive | AC-001-02 | src/b.js |
    `;
    const testFiles = [
      { path: 'tests/a.test.js', content: "it('TV-01: test', () => {});\nit('TV-02: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    assert.ok(result.details.orphan_acs_no_production.includes('AC-001-02'));
  });

  it('TIV-13: parses production: annotations from strategy content', () => {
    const strategy = `
| TV-01 | Test | positive | AC-001-01 | src/core/validators/traceability-validator.js |
    `;
    const testFiles = [
      { path: 'tests/a.test.js', content: "it('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, ['src/core/validators/traceability-validator.js']);
    const mappings = result.details.ac_production_mappings;
    assert.ok(mappings.some(m => m.ac_id === 'AC-001-01' && m.production_file === 'src/core/validators/traceability-validator.js'));
  });
});

// ---------------------------------------------------------------------------
// TIV-14..18: Fail-Open and Edge Cases (FR-002)
// ---------------------------------------------------------------------------

describe('validateTestImplementation — fail-open and edge cases', () => {
  it('TIV-14: null testStrategyContent -> pass: true, missing_artifacts', () => {
    const result = validateTestImplementation(null, [], []);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('testStrategy'));
  });

  it('TIV-15: null testFiles -> pass: true, missing_artifacts', () => {
    const result = validateTestImplementation('| TV-01 | Test | positive | AC-001-01 | src/a.js |', null, []);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('testFiles'));
  });

  it('TIV-16: null modifiedFiles -> Part B/C skip with warning, Part A still runs', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "it('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, null);
    // Part A should still work - TV-01 is implemented
    assert.deepStrictEqual(result.details.unimplemented_tests, []);
    // Part B/C should be skipped
    assert.deepStrictEqual(result.details.unmodified_imports, []);
    assert.deepStrictEqual(result.details.orphan_acs_no_production, []);
  });

  it('TIV-17: empty modifiedFiles -> all imports flagged unmodified', () => {
    const strategy = '| TV-01 | Test | positive | AC-001-01 | src/a.js |';
    const testFiles = [
      { path: 'tests/a.test.js', content: "import { fn } from '../src/a.js';\nit('TV-01: test', () => {});" }
    ];
    const result = validateTestImplementation(strategy, testFiles, []);
    assert.ok(result.details.unmodified_imports.length > 0);
  });

  it('TIV-18: combined pass: all three parts must pass for overall pass', () => {
    const strategy = `
| TV-01 | Test | positive | AC-001-01 | src/a.js |
| TV-02 | Test | positive | AC-001-02 | src/b.js |
    `;
    const testFiles = [
      { path: 'tests/a.test.js', content: "import { fn } from '../src/a.js';\nit('TV-01: test', () => {});\nit('TV-02: test', () => {});" }
    ];
    // src/b.js not in modifiedFiles -> Part C fails
    const result = validateTestImplementation(strategy, testFiles, ['src/a.js']);
    assert.strictEqual(result.pass, false);
  });
});
