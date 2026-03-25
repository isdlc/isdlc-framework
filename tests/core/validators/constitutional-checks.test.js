/**
 * Tests for src/core/validators/constitutional-checks/*.js
 * BUG-0057: Gate-blocker traceability verification (FR-005)
 * Per-article constitutional compliance checks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { check as checkArticleII } from '../../../src/core/validators/constitutional-checks/article-ii.js';
import { check as checkArticleIII } from '../../../src/core/validators/constitutional-checks/article-iii.js';
import { check as checkArticleV } from '../../../src/core/validators/constitutional-checks/article-v.js';
import { check as checkArticleVII } from '../../../src/core/validators/constitutional-checks/article-vii.js';
import { check as checkArticleVIII } from '../../../src/core/validators/constitutional-checks/article-viii.js';
import { check as checkArticleIX } from '../../../src/core/validators/constitutional-checks/article-ix.js';
import { check as checkArticleX } from '../../../src/core/validators/constitutional-checks/article-x.js';

// ---------------------------------------------------------------------------
// CC-01..03: Article II — Test-First (FR-005, AC-005-01)
// ---------------------------------------------------------------------------

describe('Article II — Test-First', () => {
  it('CC-01: artifacts include test file with test count > 0 -> compliant', () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("test one", () => {});\nit("test two", () => {});' }
    ];
    const result = checkArticleII(artifacts);
    assert.strictEqual(result.compliant, true);
    assert.deepStrictEqual(result.violations, []);
  });

  it('CC-02: no test file in artifacts -> violated', () => {
    const artifacts = [
      { name: 'src/a.js', content: 'export function fn() {}' }
    ];
    const result = checkArticleII(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.length > 0);
  });

  it('CC-03: test file present but 0 test cases detected -> violated', () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: '// empty test file\n// no actual tests' }
    ];
    const result = checkArticleII(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('0 test')));
  });
});

// ---------------------------------------------------------------------------
// CC-04..06: Article III — Security (FR-005, AC-005-02)
// ---------------------------------------------------------------------------

describe('Article III — Security', () => {
  it('CC-04: no secret patterns in non-test code -> compliant', () => {
    const artifacts = [
      { name: 'src/a.js', content: 'export function getUser() { return "admin"; }' }
    ];
    const result = checkArticleIII(artifacts);
    assert.strictEqual(result.compliant, true);
  });

  it('CC-05: API_KEY found in production code -> violated', () => {
    const artifacts = [
      { name: 'src/config.js', content: 'const API_KEY = "sk-abc123";' }
    ];
    const result = checkArticleIII(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('API_KEY')));
  });

  it('CC-06: SECRET in test file -> ignored (test files excluded)', () => {
    const artifacts = [
      { name: 'tests/auth.test.js', content: 'const SECRET = "test-secret";' },
      { name: 'src/a.js', content: 'export function fn() {}' }
    ];
    const result = checkArticleIII(artifacts);
    assert.strictEqual(result.compliant, true);
  });
});

// ---------------------------------------------------------------------------
// CC-07..09: Article V — Simplicity (FR-005, AC-005-03)
// ---------------------------------------------------------------------------

describe('Article V — Simplicity', () => {
  it('CC-07: all files under 500 lines -> compliant', () => {
    const artifacts = [
      { name: 'src/a.js', content: Array(100).fill('// line').join('\n') }
    ];
    const result = checkArticleV(artifacts);
    assert.strictEqual(result.compliant, true);
  });

  it('CC-08: file exceeds 500 lines -> violated', () => {
    const artifacts = [
      { name: 'src/big.js', content: Array(501).fill('// line').join('\n') }
    ];
    const result = checkArticleV(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('src/big.js')));
  });

  it('CC-09: custom maxFileLines option respected', () => {
    const artifacts = [
      { name: 'src/a.js', content: Array(201).fill('// line').join('\n') }
    ];
    const result = checkArticleV(artifacts, { maxFileLines: 200 });
    assert.strictEqual(result.compliant, false);
  });
});

// ---------------------------------------------------------------------------
// CC-10..12: Article VII — Traceability (FR-005, AC-005-04)
// ---------------------------------------------------------------------------

describe('Article VII — Traceability', () => {
  it('CC-10: AC references in test files and traceability matrix exists -> compliant', () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
      { name: 'traceability-matrix', content: '| AC | Test |' }
    ];
    const result = checkArticleVII(artifacts);
    assert.strictEqual(result.compliant, true);
  });

  it('CC-11: no AC references in test files -> violated', () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("just a test", () => {});' },
      { name: 'traceability-matrix', content: '| AC | Test |' }
    ];
    const result = checkArticleVII(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('AC reference')));
  });

  it('CC-12: no traceability matrix artifact -> violated', () => {
    const artifacts = [
      { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' }
    ];
    const result = checkArticleVII(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('traceability matrix')));
  });
});

// ---------------------------------------------------------------------------
// CC-13..15: Article VIII — Documentation (FR-005, AC-005-05)
// ---------------------------------------------------------------------------

describe('Article VIII — Documentation', () => {
  it('CC-13: agent/skill counts unchanged -> compliant (no docs needed)', () => {
    const artifacts = [
      { name: 'src/a.js', content: 'export function fn() {}' }
    ];
    const result = checkArticleVIII(artifacts, { previousAgentCount: 48, currentAgentCount: 48, previousSkillCount: 240, currentSkillCount: 240 });
    assert.strictEqual(result.compliant, true);
  });

  it('CC-14: counts changed and docs updated -> compliant', () => {
    const artifacts = [
      { name: 'CLAUDE.md', content: '49 agents' },
      { name: 'src/new-agent.js', content: 'export function agent() {}' }
    ];
    const result = checkArticleVIII(artifacts, { previousAgentCount: 48, currentAgentCount: 49, previousSkillCount: 240, currentSkillCount: 240 });
    assert.strictEqual(result.compliant, true);
  });

  it('CC-15: counts changed but docs not updated -> violated', () => {
    const artifacts = [
      { name: 'src/new-agent.js', content: 'export function agent() {}' }
    ];
    const result = checkArticleVIII(artifacts, { previousAgentCount: 48, currentAgentCount: 49, previousSkillCount: 240, currentSkillCount: 240 });
    assert.strictEqual(result.compliant, false);
  });
});

// ---------------------------------------------------------------------------
// CC-16..18: Article IX — Gate Integrity (FR-005, AC-005-06)
// ---------------------------------------------------------------------------

describe('Article IX — Gate Integrity', () => {
  it('CC-16: all prior phase gates completed -> compliant', () => {
    const priorPhaseGates = [
      { phase: '01-requirements', status: 'completed' },
      { phase: '03-architecture', status: 'completed' }
    ];
    const result = checkArticleIX([], { priorPhaseGates });
    assert.strictEqual(result.compliant, true);
  });

  it('CC-17: prior phase gate not completed -> violated', () => {
    const priorPhaseGates = [
      { phase: '01-requirements', status: 'completed' },
      { phase: '03-architecture', status: 'blocked' }
    ];
    const result = checkArticleIX([], { priorPhaseGates });
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('03-architecture')));
  });

  it('CC-18: no prior phases (first phase) -> compliant', () => {
    const result = checkArticleIX([], { priorPhaseGates: [] });
    assert.strictEqual(result.compliant, true);
  });
});

// ---------------------------------------------------------------------------
// CC-19..21: Article X — Fail-Safe (FR-005, AC-005-07)
// ---------------------------------------------------------------------------

describe('Article X — Fail-Safe', () => {
  it('CC-19: error handling patterns present in new code -> compliant', () => {
    const artifacts = [
      { name: 'src/a.js', content: 'try { doStuff(); } catch (err) { handleError(err); }' }
    ];
    const result = checkArticleX(artifacts);
    assert.strictEqual(result.compliant, true);
  });

  it('CC-20: no try/catch/.catch/default in new code -> violated', () => {
    const artifacts = [
      { name: 'src/a.js', content: 'export function fn() { return compute(); }' }
    ];
    const result = checkArticleX(artifacts);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.violations.some(v => v.includes('error handling')));
  });

  it('CC-21: empty artifact contents -> compliant (nothing to check)', () => {
    const result = checkArticleX([]);
    assert.strictEqual(result.compliant, true);
  });
});
