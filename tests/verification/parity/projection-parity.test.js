/**
 * Parity Test: Projection Paths — REQ-0118
 *
 * Verifies both Claude and Codex adapters export getProjectionPaths()
 * and that the return structure is equivalent.
 *
 * Strict: both return objects with string values.
 * Flexible: key names and path values differ per provider.
 *
 * Test ID prefix: PAR-PRJ-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getProjectionPaths as getClaudePaths } from '../../../src/providers/claude/projection.js';
import { getProjectionPaths as getCodexPaths } from '../../../src/providers/codex/projection.js';

describe('Projection paths parity (REQ-0118 FR-001/FR-002)', () => {
  const claudePaths = getClaudePaths();
  const codexPaths = getCodexPaths();

  // PAR-PRJ-01: Both return objects
  it('PAR-PRJ-01: both return non-null objects', () => {
    assert.equal(typeof claudePaths, 'object');
    assert.equal(typeof codexPaths, 'object');
    assert.ok(claudePaths !== null);
    assert.ok(codexPaths !== null);
  });

  // PAR-PRJ-02: Both have multiple string-valued keys
  it('PAR-PRJ-02: both have multiple string-valued projection paths', () => {
    const claudeKeys = Object.keys(claudePaths);
    const codexKeys = Object.keys(codexPaths);

    assert.ok(claudeKeys.length >= 2, `Claude must have >= 2 paths, got ${claudeKeys.length}`);
    assert.ok(codexKeys.length >= 2, `Codex must have >= 2 paths, got ${codexKeys.length}`);

    for (const key of claudeKeys) {
      assert.equal(typeof claudePaths[key], 'string', `Claude path "${key}" must be string`);
    }
    for (const key of codexKeys) {
      assert.equal(typeof codexPaths[key], 'string', `Codex path "${key}" must be string`);
    }
  });

  // PAR-PRJ-03: Strict — path values reference different framework directories
  it('PAR-PRJ-03: paths reference different framework directories', () => {
    const claudeValues = Object.values(claudePaths);
    const codexValues = Object.values(codexPaths);

    // At least one Claude path contains .claude or claude
    const claudeHasClaudeRef = claudeValues.some(v => v.includes('claude'));
    // At least one Codex path contains .codex or codex
    const codexHasCodexRef = codexValues.some(v => v.includes('codex'));

    assert.ok(claudeHasClaudeRef, 'Claude paths must reference "claude"');
    assert.ok(codexHasCodexRef, 'Codex paths must reference "codex"');
  });

  // PAR-PRJ-04: No overlap in path values between providers
  it('PAR-PRJ-04: no overlapping path values between providers', () => {
    const claudeValues = new Set(Object.values(claudePaths));
    const codexValues = new Set(Object.values(codexPaths));

    for (const v of claudeValues) {
      assert.ok(!codexValues.has(v),
        `Path "${v}" appears in both Claude and Codex projection paths`);
    }
  });

  // PAR-PRJ-05: Strict — both are plain objects (no prototype chain)
  it('PAR-PRJ-05: both return plain objects', () => {
    assert.ok(Object.getPrototypeOf(claudePaths) === Object.prototype ||
              Object.getPrototypeOf(claudePaths) === null,
              'Claude paths must be a plain object');
    assert.ok(Object.getPrototypeOf(codexPaths) === Object.prototype ||
              Object.getPrototypeOf(codexPaths) === null,
              'Codex paths must be a plain object');
  });
});
