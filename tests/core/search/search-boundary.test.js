/**
 * Tests for src/core/search/index.js — Service boundary exports
 * REQ-0084: Extract search/memory service boundaries
 *
 * Verifies that the search service boundary module re-exports
 * the expected interfaces from lib/search/ and lib/setup-search.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('src/core/search service boundary', () => {
  it('exports SearchSetupService interface', async () => {
    const mod = await import('../../../src/core/search/index.js');
    assert.strictEqual(typeof mod.SearchSetupService, 'object',
      'SearchSetupService should be exported as an object interface');
    assert.strictEqual(typeof mod.SearchSetupService.buildSearchConfig, 'function',
      'SearchSetupService.buildSearchConfig should be a function');
  });

  it('exports KnowledgeSetupService interface', async () => {
    const mod = await import('../../../src/core/search/index.js');
    assert.strictEqual(typeof mod.KnowledgeSetupService, 'object',
      'KnowledgeSetupService should be exported as an object interface');
  });

  it('SearchSetupService.buildSearchConfig returns valid config for null detection', async () => {
    const mod = await import('../../../src/core/search/index.js');
    const config = mod.SearchSetupService.buildSearchConfig(null, []);
    assert.strictEqual(config.enabled, true);
    assert.ok(Array.isArray(config.activeBackends));
    assert.ok(config.activeBackends.includes('grep-glob'));
    assert.strictEqual(config.scaleTier, 'small');
  });

  it('SearchSetupService.buildSearchConfig respects detection tier', async () => {
    const mod = await import('../../../src/core/search/index.js');
    const config = mod.SearchSetupService.buildSearchConfig(
      { scaleTier: 'large' },
      [{ success: true, tool: 'ripgrep' }]
    );
    assert.strictEqual(config.scaleTier, 'large');
    assert.ok(config.activeBackends.includes('ripgrep'));
  });

  it('exports MODULE_ID constant', async () => {
    const mod = await import('../../../src/core/search/index.js');
    assert.strictEqual(mod.MODULE_ID, 'core/search');
  });
});
