/**
 * Tests for M10 iSDLC Search Backend (FR-012)
 *
 * REQ-0045 / FR-012 / AC-012-01 through AC-012-05
 * @module lib/search/backends/semantic.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSemanticBackend, normalizeSemanticResults } from './semantic.js';

// --- Test Fixtures ---

function makeMcpResponse() {
  return {
    hits: [
      {
        filePath: 'src/order-service.js',
        startLine: 10,
        content: 'async function createOrder(userId, items) {',
        score: 0.92,
        chunkId: 'chunk-001',
        moduleId: 'commerce',
        type: 'function',
        language: 'javascript',
      },
      {
        filePath: 'src/cart-service.js',
        startLine: 25,
        content: 'function addToCart(userId, product) {',
        score: 0.85,
        chunkId: 'chunk-002',
        moduleId: 'commerce',
        type: 'function',
        language: 'javascript',
      },
    ],
    meta: {
      totalHits: 2,
      modulesSearched: ['commerce'],
      latencyMs: 45,
    },
  };
}

function makeMcpCallFn(response = makeMcpResponse()) {
  return async (tool, params) => response;
}

function makeFailingMcpCallFn() {
  return async () => { throw new Error('MCP server unavailable'); };
}

function makeHealthResponse(loaded = 2) {
  return {
    status: 'ok',
    modules: { loaded, list: [] },
    uptimeMs: 60000,
  };
}

// --- createSemanticBackend() Tests ---

describe('M10: iSDLC Semantic Search Backend', () => {
  describe('createSemanticBackend() — registration (AC-012-01)', () => {
    it('returns adapter with correct modality, priority, and id', () => {
      const adapter = createSemanticBackend();
      assert.equal(adapter.modality, 'semantic');
      assert.equal(adapter.priority, 10);
      assert.equal(adapter.id, 'semantic-search');
    });

    it('has requiresMcp set to true', () => {
      const adapter = createSemanticBackend();
      assert.equal(adapter.requiresMcp, true);
    });

    it('has displayName set', () => {
      const adapter = createSemanticBackend();
      assert.ok(adapter.displayName.length > 0);
    });
  });

  describe('search() — MCP delegation (AC-012-02, AC-012-03)', () => {
    it('delegates to MCP server and returns SearchHit[]', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: makeMcpCallFn(),
      });
      const results = await adapter.search({ query: 'create order', maxResults: 10 });

      assert.ok(Array.isArray(results));
      assert.equal(results.length, 2);
      assert.equal(results[0].filePath, 'src/order-service.js');
      assert.equal(results[0].line, 10);
      assert.ok(results[0].matchContent.includes('createOrder'));
      assert.equal(results[0].relevanceScore, 0.92);
    });

    it('normalizes MCP results to standard RawSearchHit format', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: makeMcpCallFn(),
      });
      const results = await adapter.search({ query: 'order' });

      for (const hit of results) {
        assert.ok('filePath' in hit);
        assert.ok('line' in hit);
        assert.ok('matchContent' in hit);
        assert.ok('matchType' in hit);
        assert.ok('relevanceScore' in hit);
      }
    });

    it('returns empty array on MCP failure (never throws)', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: makeFailingMcpCallFn(),
      });
      const results = await adapter.search({ query: 'test' });

      assert.deepStrictEqual(results, []);
    });
  });

  describe('search() — fallback (AC-012-04)', () => {
    it('falls back to direct search when MCP unavailable', async () => {
      const fallbackSearchFn = async (query, max) => ({
        hits: [{
          filePath: 'src/fallback.js',
          startLine: 1,
          content: 'fallback result',
          score: 0.7,
        }],
      });

      const adapter = createSemanticBackend({
        mcpCallFn: makeFailingMcpCallFn(),
        fallbackSearchFn,
      });
      const results = await adapter.search({ query: 'test' });

      assert.equal(results.length, 1);
      assert.equal(results[0].filePath, 'src/fallback.js');
    });

    it('returns empty array when both MCP and fallback fail', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: makeFailingMcpCallFn(),
        fallbackSearchFn: async () => { throw new Error('FAISS failed'); },
      });
      const results = await adapter.search({ query: 'test' });

      assert.deepStrictEqual(results, []);
    });
  });

  describe('healthCheck() — status reporting (AC-012-05)', () => {
    it('returns healthy when MCP responds with loaded modules', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: async (tool) => {
          if (tool === 'health') return makeHealthResponse(3);
          return null;
        },
      });
      const status = await adapter.healthCheck();
      assert.equal(status, 'healthy');
    });

    it('returns degraded when MCP responds but no modules loaded', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: async (tool) => {
          if (tool === 'health') return makeHealthResponse(0);
          return null;
        },
      });
      const status = await adapter.healthCheck();
      assert.equal(status, 'degraded');
    });

    it('returns unavailable when MCP server is down', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: makeFailingMcpCallFn(),
      });
      const status = await adapter.healthCheck();
      assert.equal(status, 'unavailable');
    });

    it('returns degraded when MCP down but fallback available', async () => {
      const adapter = createSemanticBackend({
        mcpCallFn: makeFailingMcpCallFn(),
        fallbackSearchFn: async () => [],
      });
      const status = await adapter.healthCheck();
      assert.equal(status, 'degraded');
    });
  });

  describe('edge cases', () => {
    it('missing mcpCallFn → search returns empty array', async () => {
      const adapter = createSemanticBackend();
      const results = await adapter.search({ query: 'test' });
      assert.deepStrictEqual(results, []);
    });

    it('missing mcpCallFn → healthCheck returns unavailable', async () => {
      const adapter = createSemanticBackend();
      const status = await adapter.healthCheck();
      assert.equal(status, 'unavailable');
    });

    it('missing mcpCallFn with fallback → healthCheck returns degraded', async () => {
      const adapter = createSemanticBackend({
        fallbackSearchFn: async () => [],
      });
      const status = await adapter.healthCheck();
      assert.equal(status, 'degraded');
    });
  });

  // --- normalizeSemanticResults() Tests ---

  describe('normalizeSemanticResults()', () => {
    it('handles null input', () => {
      assert.deepStrictEqual(normalizeSemanticResults(null, 'test'), []);
    });

    it('handles empty hits array', () => {
      assert.deepStrictEqual(normalizeSemanticResults({ hits: [] }, 'test'), []);
    });

    it('maps MCP fields to standard RawSearchHit format', () => {
      const response = makeMcpResponse();
      const results = normalizeSemanticResults(response, 'createOrder');

      assert.equal(results.length, 2);
      assert.equal(results[0].filePath, 'src/order-service.js');
      assert.equal(results[0].line, 10);
      assert.ok(results[0].matchContent.includes('createOrder'));
      assert.equal(results[0].matchType, 'exact'); // query is substring of content
      assert.equal(results[0].relevanceScore, 0.92);
    });

    it('sets matchType to semantic when query not in content', () => {
      const response = makeMcpResponse();
      const results = normalizeSemanticResults(response, 'inventory management');

      assert.equal(results[0].matchType, 'semantic');
    });

    it('handles direct array format (no wrapper)', () => {
      const directArray = [
        { filePath: 'a.js', startLine: 1, content: 'hello', score: 0.5 },
      ];
      const results = normalizeSemanticResults(directArray, 'hello');
      assert.equal(results.length, 1);
      assert.equal(results[0].filePath, 'a.js');
    });
  });
});
