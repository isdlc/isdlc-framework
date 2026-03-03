/**
 * Tests for lib/search/registry.js
 *
 * REQ-0041 / FR-002: Search Backend Registry
 * Tests register, retrieve, health updates, priority ordering, grep-glob invariant.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from './registry.js';

describe('Search Backend Registry', () => {
  let registry;

  beforeEach(() => {
    registry = createRegistry();
  });

  // TC-002-01: Register a new backend
  describe('registerBackend', () => {
    it('should register a backend and make it retrievable', () => {
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: { search: async () => [], healthCheck: async () => 'healthy' },
      });

      const best = registry.getBestBackend('structural');
      assert.ok(best);
      assert.equal(best.id, 'ast-grep');
      assert.equal(best.modality, 'structural');
      assert.equal(best.priority, 10);
    });

    it('should throw if descriptor is missing id', () => {
      assert.throws(
        () => registry.registerBackend({ modality: 'lexical', priority: 0 }),
        /id/
      );
    });

    it('should throw if modality is invalid', () => {
      assert.throws(
        () => registry.registerBackend({ id: 'test', modality: 'nonexistent', priority: 0 }),
        /Invalid modality/
      );
    });

    it('should throw if priority is not a number', () => {
      assert.throws(
        () => registry.registerBackend({ id: 'test', modality: 'lexical', priority: 'high' }),
        /numeric priority/
      );
    });

    // TC-002-13: Duplicate backend ID registration
    it('should replace existing backend with same ID', () => {
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 5 });
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 15 });

      const backends = registry.listBackends();
      const test = backends.filter(b => b.id === 'test');
      assert.equal(test.length, 1);
      assert.equal(test[0].priority, 15);
    });
  });

  // TC-002-02: Five modality categories tracked
  describe('modality tracking', () => {
    it('should track all five modality categories', () => {
      const modalities = ['lexical', 'structural', 'semantic', 'indexed', 'lsp'];

      for (const modality of modalities) {
        registry.registerBackend({ id: `test-${modality}`, modality, priority: 1 });
      }

      for (const modality of modalities) {
        const backend = registry.getBestBackend(modality);
        assert.ok(backend, `Backend for ${modality} should exist`);
        assert.equal(backend.modality, modality);
      }
    });
  });

  // TC-002-03: Backend entry includes required fields
  describe('backend descriptor fields', () => {
    it('should include all required fields', () => {
      registry.registerBackend({
        id: 'test',
        modality: 'lexical',
        priority: 5,
        health: 'healthy',
      });

      const backends = registry.listBackends();
      const backend = backends[0];
      assert.equal(typeof backend.id, 'string');
      assert.equal(typeof backend.modality, 'string');
      assert.equal(typeof backend.priority, 'number');
      assert.equal(typeof backend.health, 'string');
    });

    it('should default health to healthy', () => {
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 0 });
      const backends = registry.listBackends();
      assert.equal(backends[0].health, 'healthy');
    });
  });

  // TC-002-04: Health status tracking
  describe('updateHealth', () => {
    it('should update backend health status', () => {
      registry.registerBackend({ id: 'ast-grep', modality: 'structural', priority: 10 });
      registry.updateHealth('ast-grep', 'degraded');

      const backends = registry.listBackends();
      const backend = backends.find(b => b.id === 'ast-grep');
      assert.equal(backend.health, 'degraded');
    });

    // TC-002-16: Health status transitions
    it('should support all health transitions', () => {
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 5 });

      registry.updateHealth('test', 'degraded');
      assert.equal(registry.listBackends().find(b => b.id === 'test').health, 'degraded');

      registry.updateHealth('test', 'unavailable');
      assert.equal(registry.listBackends().find(b => b.id === 'test').health, 'unavailable');

      registry.updateHealth('test', 'healthy');
      assert.equal(registry.listBackends().find(b => b.id === 'test').health, 'healthy');
    });

    // TC-002-17: Invalid health status rejected
    it('should reject invalid health status', () => {
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 5 });
      assert.throws(
        () => registry.updateHealth('test', 'broken'),
        /Invalid health status/
      );
    });

    // TC-002-14: Update health for non-existent backend
    it('should no-op for non-existent backend', () => {
      // Should not throw
      registry.updateHealth('nonexistent', 'degraded');
    });

    // TC-002-18: Grep-glob health is always healthy
    it('should not allow grep-glob health to change', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      registry.updateHealth('grep-glob', 'unavailable');

      const backend = registry.listBackends().find(b => b.id === 'grep-glob');
      assert.equal(backend.health, 'healthy');
    });
  });

  // TC-002-05: Priority ordering within modality
  describe('getBestBackend', () => {
    it('should return highest priority healthy backend for modality', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'probe', modality: 'lexical', priority: 10 });

      const best = registry.getBestBackend('lexical');
      assert.equal(best.id, 'probe');
    });

    // TC-002-06: Skip unhealthy backends
    it('should skip unhealthy backends', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'probe', modality: 'lexical', priority: 10 });
      registry.updateHealth('probe', 'unavailable');

      const best = registry.getBestBackend('lexical');
      assert.equal(best.id, 'grep-glob');
    });

    // TC-002-11: getBestBackend returns null for empty modality
    it('should return null when no backends for modality', () => {
      const result = registry.getBestBackend('semantic');
      assert.equal(result, null);
    });

    // TC-002-12: Multiple backends per modality sorted by priority
    it('should handle multiple backends sorted by priority', () => {
      registry.registerBackend({ id: 'low', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'mid', modality: 'lexical', priority: 5 });
      registry.registerBackend({ id: 'high', modality: 'lexical', priority: 10 });

      const best = registry.getBestBackend('lexical');
      assert.equal(best.id, 'high');
    });

    it('should support "any" modality to get best across all', () => {
      registry.registerBackend({ id: 'lex', modality: 'lexical', priority: 5 });
      registry.registerBackend({ id: 'struct', modality: 'structural', priority: 10 });

      const best = registry.getBestBackend('any');
      assert.equal(best.id, 'struct');
    });
  });

  // TC-002-15: listBackends returns all registered
  describe('listBackends', () => {
    it('should return all registered backends', () => {
      registry.registerBackend({ id: 'a', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'b', modality: 'structural', priority: 5 });
      registry.registerBackend({ id: 'c', modality: 'semantic', priority: 10 });

      const all = registry.listBackends();
      assert.equal(all.length, 3);
      const ids = all.map(b => b.id).sort();
      assert.deepStrictEqual(ids, ['a', 'b', 'c']);
    });

    it('should return empty array when no backends registered', () => {
      assert.deepStrictEqual(registry.listBackends(), []);
    });
  });

  // TC-002-10: Grep-glob cannot be removed
  describe('removeBackend', () => {
    it('should not allow removing grep-glob', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      const removed = registry.removeBackend('grep-glob');
      assert.equal(removed, false);
      assert.equal(registry.listBackends().length, 1);
    });

    it('should allow removing other backends', () => {
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 5 });
      const removed = registry.removeBackend('test');
      assert.equal(removed, true);
      assert.equal(registry.listBackends().length, 0);
    });
  });

  // TC-002-07: loadFromConfig populates registry
  describe('loadFromConfig', () => {
    it('should populate registry from config', () => {
      const config = {
        activeBackends: ['grep-glob', 'ast-grep'],
        backendConfigs: {
          'ast-grep': { enabled: true, modality: 'structural', priority: 10 },
        },
      };

      registry.loadFromConfig(config);

      const backends = registry.listBackends();
      assert.equal(backends.length, 2);
      assert.ok(backends.find(b => b.id === 'grep-glob'));
      assert.ok(backends.find(b => b.id === 'ast-grep'));
    });

    // TC-002-08: Runtime refresh re-populates registry
    it('should refresh registry on subsequent calls', () => {
      registry.loadFromConfig({
        activeBackends: ['grep-glob', 'ast-grep'],
        backendConfigs: {},
      });
      assert.equal(registry.listBackends().length, 2);

      registry.loadFromConfig({
        activeBackends: ['grep-glob'],
        backendConfigs: {},
      });
      assert.equal(registry.listBackends().length, 1);
    });

    // TC-002-09: Grep-glob always registered
    it('should always include grep-glob even with empty config', () => {
      registry.loadFromConfig({ activeBackends: [], backendConfigs: {} });
      const backends = registry.listBackends();
      assert.ok(backends.find(b => b.id === 'grep-glob'));
    });

    it('should handle null config gracefully', () => {
      registry.loadFromConfig(null);
      const backends = registry.listBackends();
      assert.ok(backends.find(b => b.id === 'grep-glob'));
    });

    it('should skip disabled backends', () => {
      registry.loadFromConfig({
        activeBackends: ['grep-glob', 'ast-grep'],
        backendConfigs: { 'ast-grep': { enabled: false } },
      });
      const backends = registry.listBackends();
      assert.equal(backends.length, 1);
      assert.equal(backends[0].id, 'grep-glob');
    });
  });

  // REQ-0044 / FR-004: Code-Index Backend Registration
  describe('code-index registration via loadFromConfig', () => {
    // TC-004-01: inferModality maps code-index → indexed
    it('should infer indexed modality for code-index backend', () => {
      registry.loadFromConfig({
        activeBackends: ['grep-glob', 'code-index'],
        backendConfigs: {},
      });

      const backends = registry.listBackends();
      const codeIndex = backends.find(b => b.id === 'code-index');
      assert.ok(codeIndex, 'code-index should be registered');
      assert.equal(codeIndex.modality, 'indexed');
    });

    // TC-004-02: inferPriority maps code-index → 10
    it('should infer priority 10 for code-index backend', () => {
      registry.loadFromConfig({
        activeBackends: ['grep-glob', 'code-index'],
        backendConfigs: {},
      });

      const backends = registry.listBackends();
      const codeIndex = backends.find(b => b.id === 'code-index');
      assert.ok(codeIndex, 'code-index should be registered');
      assert.equal(codeIndex.priority, 10);
    });

    // TC-004-03: loadFromConfig registers code-index as getBestBackend('indexed')
    it('should return code-index as best indexed backend', () => {
      registry.loadFromConfig({
        activeBackends: ['grep-glob', 'code-index'],
        backendConfigs: {},
      });

      const best = registry.getBestBackend('indexed');
      assert.ok(best, 'Should have a best indexed backend');
      assert.equal(best.id, 'code-index');
      assert.equal(best.modality, 'indexed');
    });
  });

  describe('hasEnhancedBackends', () => {
    it('should return false when only grep-glob registered', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      assert.equal(registry.hasEnhancedBackends(), false);
    });

    it('should return true when enhanced backend is healthy', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'ast-grep', modality: 'structural', priority: 10 });
      assert.equal(registry.hasEnhancedBackends(), true);
    });

    it('should return false when enhanced backends are unhealthy', () => {
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'ast-grep', modality: 'structural', priority: 10 });
      registry.updateHealth('ast-grep', 'unavailable');
      assert.equal(registry.hasEnhancedBackends(), false);
    });
  });

  describe('getBackendsForModality', () => {
    it('should return backends sorted by priority descending', () => {
      registry.registerBackend({ id: 'low', modality: 'lexical', priority: 0 });
      registry.registerBackend({ id: 'high', modality: 'lexical', priority: 10 });
      registry.registerBackend({ id: 'mid', modality: 'lexical', priority: 5 });

      const result = registry.getBackendsForModality('lexical');
      assert.equal(result[0].id, 'high');
      assert.equal(result[1].id, 'mid');
      assert.equal(result[2].id, 'low');
    });

    it('should include unhealthy backends', () => {
      registry.registerBackend({ id: 'test', modality: 'lexical', priority: 5 });
      registry.updateHealth('test', 'unavailable');

      const result = registry.getBackendsForModality('lexical');
      assert.equal(result.length, 1);
      assert.equal(result[0].health, 'unavailable');
    });
  });
});
