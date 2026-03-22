/**
 * Tests for src/core/memory/index.js — Memory service boundary exports
 * REQ-0084: Extract search/memory service boundaries
 *
 * Verifies that the memory service boundary module re-exports
 * the expected interfaces from lib/memory.js and lib/memory-search.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('src/core/memory service boundary', () => {
  it('exports MemoryService interface', async () => {
    const mod = await import('../../../src/core/memory/index.js');
    assert.strictEqual(typeof mod.MemoryService, 'object',
      'MemoryService should be exported as an object interface');
  });

  it('MemoryService has expected read methods', async () => {
    const mod = await import('../../../src/core/memory/index.js');
    assert.strictEqual(typeof mod.MemoryService.readUserProfile, 'function');
    assert.strictEqual(typeof mod.MemoryService.readProjectMemory, 'function');
    assert.strictEqual(typeof mod.MemoryService.mergeMemory, 'function');
    assert.strictEqual(typeof mod.MemoryService.formatMemoryContext, 'function');
  });

  it('MemoryService.mergeMemory handles null inputs gracefully', async () => {
    const mod = await import('../../../src/core/memory/index.js');
    const result = mod.MemoryService.mergeMemory(null, null);
    assert.ok(result !== undefined, 'Should return a defined result');
    // The merge function from lib/memory.js returns a MemoryContext object
    assert.strictEqual(typeof result, 'object');
  });

  it('MemoryService.formatMemoryContext handles empty context', async () => {
    const mod = await import('../../../src/core/memory/index.js');
    const result = mod.MemoryService.formatMemoryContext({
      topicPreferences: [],
      communicationStyle: null,
      domainWeights: {},
      conflictZones: [],
      effectiveDepth: 'standard'
    });
    assert.strictEqual(typeof result, 'string');
  });

  it('exports MODULE_ID constant', async () => {
    const mod = await import('../../../src/core/memory/index.js');
    assert.strictEqual(mod.MODULE_ID, 'core/memory');
  });
});
