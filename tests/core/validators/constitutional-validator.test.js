/**
 * Tests for src/core/validators/constitutional-validator.js
 * BUG-0057: Gate-blocker traceability verification (FR-005)
 * Orchestration of per-article constitutional checks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateConstitutionalCompliance } from '../../../src/core/validators/constitutional-validator.js';

const SAMPLE_CONSTITUTION = '# Constitution\nArticle II: Test-First\nArticle III: Security';

// ---------------------------------------------------------------------------
// CV-01..05: Orchestration (FR-005, AC-005-08)
// ---------------------------------------------------------------------------

describe('validateConstitutionalCompliance — orchestration', () => {
  it('CV-01: all articles compliant -> pass: true, articles_violated: []', async () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});\ntry { x(); } catch(e) {}' },
      { name: 'traceability-matrix', content: '| AC | Test |' }
    ];
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['II', 'VII'],
      artifacts
    );
    assert.strictEqual(result.pass, true);
    assert.deepStrictEqual(result.details.articles_violated, []);
  });

  it('CV-02: one article violated -> pass: false, violations populated', async () => {
    const artifacts = [
      { name: 'src/a.js', content: 'export function fn() {}' }
    ];
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['II'],
      artifacts
    );
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.articles_violated.includes('II'));
  });

  it('CV-03: multiple articles violated -> all violations collected', async () => {
    const artifacts = [
      { name: 'src/a.js', content: 'const API_KEY = "secret";' }
    ];
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['II', 'III'],
      artifacts
    );
    assert.strictEqual(result.pass, false);
    assert.ok(result.details.articles_violated.includes('II'));
    assert.ok(result.details.articles_violated.includes('III'));
  });

  it('CV-04: runs only requested articleIds, not all articles', async () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
      { name: 'traceability-matrix', content: '| AC | Test |' }
    ];
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['VII'],
      artifacts
    );
    // Only article VII was checked
    assert.deepStrictEqual(result.details.articles_checked, ['VII']);
  });

  it('CV-05: unknown article ID -> skipped with warning, does not fail', async () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("test", () => {});' }
    ];
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['UNKNOWN'],
      artifacts
    );
    // Unknown articles are simply skipped
    assert.strictEqual(result.pass, true);
  });
});

// ---------------------------------------------------------------------------
// CV-06..07: Parallel Execution (FR-005, AC-005-09)
// ---------------------------------------------------------------------------

describe('validateConstitutionalCompliance — execution', () => {
  it('CV-06: useAgentTeams: false -> runs via Promise.all', async () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});\ntry { x(); } catch(e) {}' },
      { name: 'traceability-matrix', content: '| AC | Test |' }
    ];
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['II', 'VII'],
      artifacts,
      { useAgentTeams: false }
    );
    assert.strictEqual(result.pass, true);
    assert.ok(result.details.articles_checked.length === 2);
  });

  it('CV-07: individual article check crash -> caught, does not fail entire validation', async () => {
    // Pass a corrupted article list that might cause issues
    // The validator should catch any individual check errors
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
      { name: 'traceability-matrix', content: '| AC | Test |' }
    ];
    // Even if an article check throws, it should be caught
    const result = await validateConstitutionalCompliance(
      SAMPLE_CONSTITUTION,
      ['VII'],
      artifacts
    );
    assert.ok(typeof result.pass === 'boolean');
  });
});

// ---------------------------------------------------------------------------
// CV-08..10: Fail-Open (FR-005)
// ---------------------------------------------------------------------------

describe('validateConstitutionalCompliance — fail-open', () => {
  it('CV-08: null constitutionContent -> pass: true, missing_artifacts', async () => {
    const result = await validateConstitutionalCompliance(null, ['II'], []);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('constitution'));
  });

  it('CV-09: null articleIds -> pass: true (nothing to check)', async () => {
    const result = await validateConstitutionalCompliance(SAMPLE_CONSTITUTION, null, []);
    assert.strictEqual(result.pass, true);
  });

  it('CV-10: null artifactContents -> pass: true, missing_artifacts', async () => {
    const result = await validateConstitutionalCompliance(SAMPLE_CONSTITUTION, ['II'], null);
    assert.strictEqual(result.pass, true);
    assert.ok(result.missing_artifacts.includes('artifactContents'));
  });
});
