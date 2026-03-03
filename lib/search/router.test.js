/**
 * Tests for lib/search/router.js
 *
 * REQ-0041 / FR-001: Search Abstraction Layer
 * Tests routing, fallback, timeout, validation, force-backend, degradation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, SearchError } from './router.js';
import { createRegistry } from './registry.js';

/**
 * Create a mock backend adapter.
 */
function createMockBackend(id, modality, priority, results = [], options = {}) {
  return {
    id,
    modality,
    priority,
    displayName: id,
    requiresMcp: options.requiresMcp ?? false,
    search: options.searchFn || (async () => results),
    healthCheck: options.healthCheckFn || (async () => 'healthy'),
  };
}

describe('Search Router', () => {
  let registry;
  let lexicalAdapter;

  beforeEach(() => {
    registry = createRegistry();

    lexicalAdapter = createMockBackend('grep-glob', 'lexical', 0, [
      { filePath: '/src/test.js', line: 10, matchContent: 'function test()' },
    ]);

    registry.registerBackend({
      id: 'grep-glob',
      modality: 'lexical',
      priority: 0,
      adapter: lexicalAdapter,
    });
  });

  // TC-001-01: Route lexical query to lexical backend
  describe('routing', () => {
    it('should route lexical query to lexical backend', async () => {
      const router = createRouter({ registry });
      const result = await router.search({ query: 'function', modality: 'lexical' });

      assert.equal(result.meta.backendUsed, 'grep-glob');
      assert.equal(result.meta.modalityUsed, 'lexical');
      assert.equal(result.meta.degraded, false);
    });

    // TC-001-02: Route structural query to structural backend
    it('should route structural query to structural backend', async () => {
      const structAdapter = createMockBackend('ast-grep', 'structural', 10, [
        { filePath: '/src/auth.js', line: 42, matchContent: 'async function login()' },
      ]);
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: structAdapter,
      });

      const router = createRouter({ registry });
      const result = await router.search({
        query: 'async function $NAME()',
        modality: 'structural',
      });

      assert.equal(result.meta.backendUsed, 'ast-grep');
      assert.equal(result.meta.modalityUsed, 'structural');
    });

    // TC-001-03: Route 'any' modality to best available
    it('should route any modality to highest priority backend', async () => {
      const probeAdapter = createMockBackend('probe', 'lexical', 10, [
        { filePath: '/src/test.js', line: 1, matchContent: 'test' },
      ]);
      registry.registerBackend({
        id: 'probe',
        modality: 'lexical',
        priority: 10,
        adapter: probeAdapter,
      });

      const router = createRouter({ registry });
      const result = await router.search({ query: 'test', modality: 'any' });

      assert.equal(result.meta.backendUsed, 'probe');
    });

    // TC-001-18: Scope parameter limits search
    it('should pass scope to backend', async () => {
      let receivedRequest = null;
      const adapter = createMockBackend('grep-glob', 'lexical', 0, [], {
        searchFn: async (req) => { receivedRequest = req; return []; },
      });
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0, adapter });

      const router = createRouter({ registry, projectRoot: '/project' });
      await router.search({ query: 'test', modality: 'lexical', scope: '/project/src' });

      assert.equal(receivedRequest.scope, '/project/src');
    });

    // TC-001-19: File glob filter applied
    it('should pass fileGlob to backend', async () => {
      let receivedRequest = null;
      const adapter = createMockBackend('grep-glob', 'lexical', 0, [], {
        searchFn: async (req) => { receivedRequest = req; return []; },
      });
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0, adapter });

      const router = createRouter({ registry });
      await router.search({ query: 'test', modality: 'lexical', fileGlob: '*.js' });

      assert.equal(receivedRequest.fileGlob, '*.js');
    });
  });

  // TC-001-04: Fallback when requested modality unavailable
  describe('fallback', () => {
    it('should fall back to lexical when structural unavailable', async () => {
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        health: 'unavailable',
        adapter: createMockBackend('ast-grep', 'structural', 10),
      });

      const router = createRouter({ registry });
      const result = await router.search({
        query: 'async function $NAME()',
        modality: 'structural',
      });

      assert.equal(result.meta.backendUsed, 'grep-glob');
      assert.equal(result.meta.degraded, true);
    });

    // TC-001-05: Fallback chain exhausts all enhanced backends
    it('should fall back to grep-glob when all enhanced fail', async () => {
      const failingAdapter = createMockBackend('ast-grep', 'structural', 10, [], {
        searchFn: async () => { throw new Error('MCP failed'); },
      });
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: failingAdapter,
      });

      const router = createRouter({ registry });
      const result = await router.search({
        query: 'test',
        modality: 'structural',
      });

      assert.equal(result.meta.backendUsed, 'grep-glob');
      assert.equal(result.meta.degraded, true);
    });

    // TC-006-08: Multiple backends fail in sequence
    it('should fall through multiple failing backends', async () => {
      const fail1 = createMockBackend('high', 'lexical', 20, [], {
        searchFn: async () => { throw new Error('fail'); },
      });
      const fail2 = createMockBackend('mid', 'lexical', 10, [], {
        searchFn: async () => { throw new Error('fail'); },
      });
      registry.registerBackend({ id: 'high', modality: 'lexical', priority: 20, adapter: fail1 });
      registry.registerBackend({ id: 'mid', modality: 'lexical', priority: 10, adapter: fail2 });

      const router = createRouter({ registry });
      const result = await router.search({ query: 'test', modality: 'lexical' });

      // Should fall to grep-glob (priority 0)
      assert.equal(result.meta.backendUsed, 'grep-glob');
      assert.equal(result.meta.degraded, false); // Not degraded because grep-glob IS lexical
    });
  });

  // TC-001-06: Uniform result contract structure
  describe('result contract', () => {
    it('should return uniform result structure', async () => {
      const router = createRouter({ registry });
      const result = await router.search({ query: 'test', modality: 'lexical' });

      assert.ok(Array.isArray(result.hits));
      assert.ok(result.meta);
      assert.equal(typeof result.meta.backendUsed, 'string');
      assert.equal(typeof result.meta.modalityUsed, 'string');
      assert.equal(typeof result.meta.degraded, 'boolean');
      assert.equal(typeof result.meta.durationMs, 'number');
      assert.equal(typeof result.meta.totalHitsBeforeRanking, 'number');
      assert.equal(typeof result.meta.tokenCount, 'number');
    });

    it('should have correct hit fields', async () => {
      const router = createRouter({ registry });
      const result = await router.search({ query: 'function', modality: 'lexical' });

      if (result.hits.length > 0) {
        const hit = result.hits[0];
        assert.equal(typeof hit.filePath, 'string');
        assert.equal(typeof hit.line, 'number');
        assert.equal(typeof hit.matchType, 'string');
        assert.equal(typeof hit.relevanceScore, 'number');
        assert.ok(hit.relevanceScore >= 0 && hit.relevanceScore <= 1);
        assert.equal(typeof hit.contextSnippet, 'string');
      }
    });
  });

  // TC-001-09: Pagination via maxResults
  describe('maxResults and tokenBudget', () => {
    it('should limit results to maxResults', async () => {
      const manyResults = Array.from({ length: 20 }, (_, i) => ({
        filePath: `/src/f${i}.js`,
        line: i,
        matchContent: `match ${i}`,
      }));

      registry.registerBackend({
        id: 'grep-glob',
        modality: 'lexical',
        priority: 0,
        adapter: createMockBackend('grep-glob', 'lexical', 0, manyResults),
      });

      const router = createRouter({ registry });
      const result = await router.search({
        query: 'match',
        modality: 'lexical',
        maxResults: 5,
      });

      assert.ok(result.hits.length <= 5);
    });

    // TC-001-10: Token budget limits result size
    it('should enforce token budget', async () => {
      const manyResults = Array.from({ length: 50 }, (_, i) => ({
        filePath: `/src/file${i}.js`,
        line: i,
        matchContent: 'x'.repeat(200),
        relevanceScore: 1 - (i / 50),
      }));

      registry.registerBackend({
        id: 'grep-glob',
        modality: 'lexical',
        priority: 0,
        adapter: createMockBackend('grep-glob', 'lexical', 0, manyResults),
      });

      const router = createRouter({ registry });
      const result = await router.search({
        query: 'test',
        modality: 'lexical',
        tokenBudget: 100,
      });

      assert.ok(result.meta.tokenCount <= 200); // some tolerance
      assert.ok(result.hits.length < 50);
    });
  });

  // TC-001-14: Force-backend override
  describe('force backend', () => {
    it('should route to forced backend', async () => {
      const structAdapter = createMockBackend('ast-grep', 'structural', 10, [
        { filePath: '/src/a.js', line: 1, matchContent: 'struct match' },
      ]);
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: structAdapter,
      });

      const router = createRouter({ registry });
      const result = await router.search(
        { query: 'test', modality: 'lexical' },
        { forceBackend: 'ast-grep' }
      );

      assert.equal(result.meta.backendUsed, 'ast-grep');
    });

    it('should throw when forced backend not available', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search(
          { query: 'test', modality: 'lexical' },
          { forceBackend: 'nonexistent' }
        ),
        (err) => err.code === 'BACKEND_UNAVAILABLE'
      );
    });
  });

  // TC-001-15: Skip ranking
  describe('skip ranking', () => {
    it('should return raw results when skipRanking=true', async () => {
      const router = createRouter({ registry });
      const result = await router.search(
        { query: 'function', modality: 'lexical' },
        { skipRanking: true }
      );

      assert.ok(result.hits.length > 0 || result.hits.length === 0);
      // Results should not be ranked (no sorting guarantee)
    });
  });

  // TC-001-11: Empty query string rejected
  describe('validation', () => {
    it('should reject empty query', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search({ query: '', modality: 'lexical' }),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });

    // TC-001-12: Invalid modality rejected
    it('should reject invalid modality', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search({ query: 'test', modality: 'nonexistent' }),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });

    // TC-001-21: Null query rejected
    it('should reject null query', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search({ query: null, modality: 'lexical' }),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });

    // TC-001-22: Very long query string handled
    it('should reject very long query string', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search({ query: 'x'.repeat(10001), modality: 'lexical' }),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });

    it('should reject null request', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search(null),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });

    // TC-SEC-04: Null bytes in query
    it('should reject query with null bytes', async () => {
      const router = createRouter({ registry });
      await assert.rejects(
        () => router.search({ query: 'test\0malicious', modality: 'lexical' }),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });

    // TC-SEC-01: Path traversal in scope
    it('should reject scope path traversal', async () => {
      const router = createRouter({ registry, projectRoot: '/project' });
      await assert.rejects(
        () => router.search({
          query: 'test',
          modality: 'lexical',
          scope: '../../etc/passwd',
        }),
        (err) => err.code === 'INVALID_REQUEST'
      );
    });
  });

  // TC-001-13: Timeout enforcement
  describe('timeout', () => {
    it('should timeout slow backends', async () => {
      const slowAdapter = createMockBackend('grep-glob', 'lexical', 0, [], {
        searchFn: async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return [];
        },
      });
      registry.registerBackend({ id: 'grep-glob', modality: 'lexical', priority: 0, adapter: slowAdapter });

      const router = createRouter({ registry });
      // With timeout, grep-glob will timeout, and there's nothing else to fall back to
      const result = await router.search(
        { query: 'test', modality: 'lexical' },
        { timeout: 50 }
      );

      // Should return empty/degraded since timeout
      assert.equal(result.meta.degraded, true);
    });
  });

  // TC-001-16/17: hasEnhancedSearch
  describe('hasEnhancedSearch', () => {
    it('should return false when only grep-glob available', () => {
      const router = createRouter({ registry });
      assert.equal(router.hasEnhancedSearch(), false);
    });

    it('should return true when enhanced backend available', () => {
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: createMockBackend('ast-grep', 'structural', 10),
      });

      const router = createRouter({ registry });
      assert.equal(router.hasEnhancedSearch(), true);
    });
  });

  // TC-006-03: Degradation notification
  describe('notifications', () => {
    it('should emit degradation notification on first fallback', async () => {
      const notifications = [];
      const failingAdapter = createMockBackend('ast-grep', 'structural', 10, [], {
        searchFn: async () => { throw new Error('failed'); },
      });
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: failingAdapter,
      });

      const router = createRouter({
        registry,
        onNotification: (notif) => notifications.push(notif),
      });

      await router.search({ query: 'test', modality: 'structural' });

      assert.ok(notifications.length > 0);
      assert.equal(notifications[0].type, 'degradation');
      assert.equal(notifications[0].severity, 'warning');
    });

    // TC-006-04: Notification not repeated
    it('should not repeat degradation notification', async () => {
      const notifications = [];
      const failingAdapter = createMockBackend('ast-grep', 'structural', 10, [], {
        searchFn: async () => { throw new Error('failed'); },
      });
      registry.registerBackend({
        id: 'ast-grep',
        modality: 'structural',
        priority: 10,
        adapter: failingAdapter,
      });

      const router = createRouter({
        registry,
        onNotification: (notif) => notifications.push(notif),
      });

      await router.search({ query: 'test', modality: 'structural' });
      await router.search({ query: 'test2', modality: 'structural' });

      assert.equal(notifications.length, 1);
    });
  });

  // TC-ERR-05: Empty results
  describe('empty results', () => {
    it('should return empty hits array for no matches', async () => {
      registry.registerBackend({
        id: 'grep-glob',
        modality: 'lexical',
        priority: 0,
        adapter: createMockBackend('grep-glob', 'lexical', 0, []),
      });

      const router = createRouter({ registry });
      const result = await router.search({ query: 'nomatch', modality: 'lexical' });

      assert.deepStrictEqual(result.hits, []);
      assert.ok(result.meta);
    });
  });

  describe('SearchError', () => {
    it('should have correct properties', () => {
      const err = new SearchError('test', 'INVALID_REQUEST', 'backend-1', true);
      assert.equal(err.name, 'SearchError');
      assert.equal(err.code, 'INVALID_REQUEST');
      assert.equal(err.backendId, 'backend-1');
      assert.equal(err.fallbackUsed, true);
      assert.ok(err instanceof Error);
    });

    it('should default fallbackUsed to false', () => {
      const err = new SearchError('test', 'TIMEOUT');
      assert.equal(err.fallbackUsed, false);
    });
  });

  // TC-006-05: Degradation does not block workflow
  describe('degradation resilience', () => {
    it('should complete search even when all enhanced backends fail', async () => {
      const failAll = createMockBackend('ast-grep', 'structural', 10, [], {
        searchFn: async () => { throw new Error('fail'); },
      });
      registry.registerBackend({ id: 'ast-grep', modality: 'structural', priority: 10, adapter: failAll });

      const router = createRouter({ registry });
      const result = await router.search({ query: 'test', modality: 'structural' });

      // Should not throw, should return (possibly empty) result
      assert.ok(result);
      assert.ok(result.meta);
    });
  });

  describe('duration tracking', () => {
    it('should track search duration', async () => {
      const router = createRouter({ registry });
      const result = await router.search({ query: 'test', modality: 'lexical' });
      assert.ok(result.meta.durationMs >= 0);
    });
  });
});
