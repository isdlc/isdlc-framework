/**
 * Tests for Indexed Search Backend (Code-Index-MCP Adapter)
 *
 * REQ-0044 / FR-003: Indexed Backend Adapter
 * REQ-0044 / FR-010: Backend Health Monitoring
 * @module lib/search/backends/indexed.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedBackend, normalizeIndexedResults } from './indexed.js';

describe('createIndexedBackend', () => {
  // TC-003-01: Static properties match interface contract
  it('has correct static properties', () => {
    const backend = createIndexedBackend();
    assert.equal(backend.id, 'code-index');
    assert.equal(backend.modality, 'indexed');
    assert.equal(backend.priority, 10);
    assert.equal(backend.displayName, 'Code Index (indexed search)');
    assert.equal(backend.requiresMcp, true);
  });

  // TC-003-02: Search calls MCP with correct parameters
  it('search calls MCP with correct parameters', async () => {
    let calledWith = null;
    const mcpCallFn = async (toolName, args) => {
      calledWith = { toolName, args };
      return [];
    };

    const backend = createIndexedBackend({ mcpCallFn });
    await backend.search({ query: 'SearchRouter', modality: 'indexed', fileGlob: '*.js', maxResults: 25 });

    assert.deepEqual(calledWith, {
      toolName: 'search_code_advanced',
      args: { query: 'SearchRouter', file_pattern: '*.js', max_results: 25 },
    });
  });

  // TC-003-03: Search normalizes MCP results to RawSearchHit format
  it('search normalizes MCP results to RawSearchHit format', async () => {
    const mcpCallFn = async () => [
      { file_path: 'src/router.js', line_number: 42, content: 'class SearchRouter', score: 0.95 },
    ];

    const backend = createIndexedBackend({ mcpCallFn });
    const results = await backend.search({ query: 'SearchRouter', modality: 'indexed' });

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      filePath: 'src/router.js',
      line: 42,
      matchContent: 'class SearchRouter',
      matchType: 'exact',
      relevanceScore: 0.95,
    });
  });

  // TC-003-04: Search returns empty array when MCP server unreachable
  it('search returns empty array when MCP throws', async () => {
    const mcpCallFn = async () => { throw new Error('connection refused'); };
    const backend = createIndexedBackend({ mcpCallFn });
    const results = await backend.search({ query: 'test', modality: 'indexed' });
    assert.deepEqual(results, []);
  });

  // TC-003-05: Search returns empty array when MCP returns malformed data
  it('search returns empty array when MCP returns null', async () => {
    const mcpCallFn = async () => null;
    const backend = createIndexedBackend({ mcpCallFn });
    const results = await backend.search({ query: 'test', modality: 'indexed' });
    assert.deepEqual(results, []);
  });

  // TC-003-06: Health check returns healthy when MCP responds
  it('health check returns healthy when MCP responds', async () => {
    const mcpCallFn = async () => ({ version: '1.0.0' });
    const backend = createIndexedBackend({ mcpCallFn });
    const status = await backend.healthCheck();
    assert.equal(status, 'healthy');
  });

  // TC-003-07: Health check returns unavailable when no MCP configured
  it('health check returns unavailable when no mcpCallFn', async () => {
    const backend = createIndexedBackend();
    const status = await backend.healthCheck();
    assert.equal(status, 'unavailable');
  });

  // TC-003-08: Health check returns unavailable on timeout
  it('health check returns unavailable on timeout', async () => {
    const mcpCallFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      return true;
    };
    const backend = createIndexedBackend({ mcpCallFn, healthCheckTimeout: 50 });
    const status = await backend.healthCheck();
    assert.equal(status, 'unavailable');
  });

  // TC-003-09: Health check returns unavailable when MCP throws
  it('health check returns unavailable when MCP throws', async () => {
    const mcpCallFn = async () => { throw new Error('server down'); };
    const backend = createIndexedBackend({ mcpCallFn });
    const status = await backend.healthCheck();
    assert.equal(status, 'unavailable');
  });
});

describe('normalizeIndexedResults', () => {
  // TC-003-10: handles empty array
  it('handles empty array', () => {
    const results = normalizeIndexedResults([], 'test');
    assert.deepEqual(results, []);
  });

  // TC-003-11: handles null input
  it('handles null input', () => {
    const results = normalizeIndexedResults(null, 'test');
    assert.deepEqual(results, []);
  });

  // TC-003-12: assigns matchType correctly (exact)
  it('assigns exact matchType when query is substring of content', () => {
    const results = normalizeIndexedResults(
      [{ file_path: 'test.js', content: 'class SearchRouter extends Base' }],
      'SearchRouter',
    );
    assert.equal(results[0].matchType, 'exact');
  });

  // TC-003-13: assigns fuzzy when no substring match
  it('assigns fuzzy matchType when query is not substring of content', () => {
    const results = normalizeIndexedResults(
      [{ file_path: 'test.js', content: 'class Router' }],
      'SearchRouter',
    );
    assert.equal(results[0].matchType, 'fuzzy');
  });

  // TC-003-14: uses defaults for missing fields
  it('uses defaults for missing fields', () => {
    const results = normalizeIndexedResults(
      [{ file_path: 'test.js' }],
      'test',
    );
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      filePath: 'test.js',
      line: 0,
      matchContent: '',
      matchType: 'fuzzy',
      relevanceScore: undefined,
    });
  });
});
