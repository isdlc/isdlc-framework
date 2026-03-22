/**
 * Tests for src/core/config/ — Config service functions
 * REQ-0085: Decompose remaining common.cjs functions
 *
 * Verifies that core config exports session/process config helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('src/core/config service extensions', () => {
  it('exports loadCoreProfile function', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(typeof mod.loadCoreProfile, 'function');
  });

  it('loadCoreProfile returns null for nonexistent profile', async () => {
    const mod = await import('../../../src/core/config/index.js');
    const result = mod.loadCoreProfile('nonexistent-profile');
    assert.strictEqual(result, null);
  });

  it('loadCoreProfile loads standard profile', async () => {
    const mod = await import('../../../src/core/config/index.js');
    const result = mod.loadCoreProfile('standard');
    assert.ok(result !== null, 'Standard profile should exist');
    assert.strictEqual(typeof result, 'object');
  });

  it('exports loadCoreSchema function', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(typeof mod.loadCoreSchema, 'function');
  });

  it('exports normalizePhaseKey function', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(typeof mod.normalizePhaseKey, 'function');
  });

  it('normalizePhaseKey maps legacy aliases', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(mod.normalizePhaseKey('13-test-deploy'), '12-test-deploy');
    assert.strictEqual(mod.normalizePhaseKey('14-production'), '13-production');
  });

  it('normalizePhaseKey passes through canonical keys', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(mod.normalizePhaseKey('06-implementation'), '06-implementation');
  });
});
