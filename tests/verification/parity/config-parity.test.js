/**
 * Parity Test: Config Structure — REQ-0118
 *
 * Compares getClaudeConfig() vs getCodexConfig() structural equivalence.
 * Strict: both return objects with provider name and frameworkDir.
 * Flexible: additional fields may differ per provider.
 *
 * Test ID prefix: PAR-CFG-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getClaudeConfig } from '../../../src/providers/claude/projection.js';
import { getCodexConfig } from '../../../src/providers/codex/projection.js';

describe('Config parity (REQ-0118 FR-001/FR-002)', () => {
  const claudeConfig = getClaudeConfig();
  const codexConfig = getCodexConfig();

  // PAR-CFG-01: Both return objects
  it('PAR-CFG-01: both return objects', () => {
    assert.equal(typeof claudeConfig, 'object');
    assert.equal(typeof codexConfig, 'object');
    assert.ok(claudeConfig !== null);
    assert.ok(codexConfig !== null);
  });

  // PAR-CFG-02: Strict — both have a "provider" field
  it('PAR-CFG-02: both have a "provider" field (strict)', () => {
    assert.ok('provider' in claudeConfig, 'Claude config must have provider');
    assert.ok('provider' in codexConfig, 'Codex config must have provider');
  });

  // PAR-CFG-03: Strict — provider values are distinct strings
  it('PAR-CFG-03: provider values are distinct non-empty strings (strict)', () => {
    assert.equal(typeof claudeConfig.provider, 'string');
    assert.equal(typeof codexConfig.provider, 'string');
    assert.ok(claudeConfig.provider.length > 0);
    assert.ok(codexConfig.provider.length > 0);
    assert.notEqual(claudeConfig.provider, codexConfig.provider,
      'Provider names must differ between adapters');
  });

  // PAR-CFG-04: Strict — both have a frameworkDir field
  it('PAR-CFG-04: both have a "frameworkDir" field (strict)', () => {
    assert.ok('frameworkDir' in claudeConfig, 'Claude config must have frameworkDir');
    assert.ok('frameworkDir' in codexConfig, 'Codex config must have frameworkDir');
  });

  // PAR-CFG-05: Strict — frameworkDir values are distinct strings
  it('PAR-CFG-05: frameworkDir values are distinct strings (strict)', () => {
    assert.equal(typeof claudeConfig.frameworkDir, 'string');
    assert.equal(typeof codexConfig.frameworkDir, 'string');
    assert.notEqual(claudeConfig.frameworkDir, codexConfig.frameworkDir,
      'Framework directories must differ between adapters');
  });

  // PAR-CFG-06: Flexible — additional fields allowed
  it('PAR-CFG-06: both have at least 2 keys (provider + frameworkDir)', () => {
    assert.ok(Object.keys(claudeConfig).length >= 2, 'Claude config must have >= 2 keys');
    assert.ok(Object.keys(codexConfig).length >= 2, 'Codex config must have >= 2 keys');
  });
});
