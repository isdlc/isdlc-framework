/**
 * Tests for lib/search/backends/enhanced-lexical.js
 *
 * REQ-0041 / FR-008: Enhanced Lexical Search Backend (Probe)
 * Tests MCP adapter, result normalization, health check, priority.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnhancedLexicalBackend, normalizeProbeResults, ProbeBackendError } from './enhanced-lexical.js';

describe('Enhanced Lexical Backend (Probe)', () => {
  describe('createEnhancedLexicalBackend', () => {
    it('should have correct static properties', () => {
      const backend = createEnhancedLexicalBackend();
      assert.equal(backend.id, 'probe');
      assert.equal(backend.modality, 'lexical');
      assert.equal(backend.priority, 10);
      assert.equal(backend.displayName, 'Probe (enhanced lexical)');
      assert.equal(backend.requiresMcp, true);
    });

    // TC-008-10: Priority ordering
    it('should have higher priority than grep-glob', () => {
      const backend = createEnhancedLexicalBackend();
      assert.ok(backend.priority > 0); // grep-glob is 0
    });

    // TC-008-05: Health check when MCP unavailable
    it('should return unavailable when no MCP function configured', async () => {
      const backend = createEnhancedLexicalBackend();
      const health = await backend.healthCheck();
      assert.equal(health, 'unavailable');
    });

    // TC-008-06: Health check when MCP healthy
    it('should return healthy when MCP responds', async () => {
      const mcpCallFn = async () => true;
      const backend = createEnhancedLexicalBackend({ mcpCallFn });
      const health = await backend.healthCheck();
      assert.equal(health, 'healthy');
    });

    // TC-008-08: Health check timeout enforcement
    it('should return unavailable on health check timeout', async () => {
      const mcpCallFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return true;
      };
      const backend = createEnhancedLexicalBackend({ mcpCallFn, healthCheckTimeout: 50 });
      const health = await backend.healthCheck();
      assert.equal(health, 'unavailable');
    });

    it('should return unavailable when MCP throws', async () => {
      const mcpCallFn = async () => { throw new Error('connection refused'); };
      const backend = createEnhancedLexicalBackend({ mcpCallFn });
      const health = await backend.healthCheck();
      assert.equal(health, 'unavailable');
    });

    it('should call MCP with correct parameters', async () => {
      let calledWith = null;
      const mcpCallFn = async (method, params) => {
        calledWith = { method, params };
        return { results: [] };
      };

      const backend = createEnhancedLexicalBackend({ mcpCallFn });
      await backend.search({
        query: 'handleAuth',
        scope: '/src',
        fileGlob: '*.js',
        maxResults: 10,
      });

      assert.ok(calledWith);
      assert.equal(calledWith.method, 'search');
      assert.equal(calledWith.params.query, 'handleAuth');
      assert.equal(calledWith.params.path, '/src');
      assert.equal(calledWith.params.maxResults, 10);
    });

    it('should throw ProbeBackendError when no MCP configured', async () => {
      const backend = createEnhancedLexicalBackend();
      await assert.rejects(
        () => backend.search({ query: 'test' }),
        (err) => err.name === 'ProbeBackendError'
      );
    });

    it('should throw ProbeBackendError on MCP failure', async () => {
      const mcpCallFn = async () => { throw new Error('MCP error'); };
      const backend = createEnhancedLexicalBackend({ mcpCallFn });
      await assert.rejects(
        () => backend.search({ query: 'test' }),
        (err) => err.name === 'ProbeBackendError'
      );
    });
  });

  // TC-008-07: Result normalization
  describe('normalizeProbeResults', () => {
    it('should normalize Probe results to RawSearchHit format', () => {
      const response = {
        results: [
          {
            file: '/src/auth.js',
            line: 42,
            content: 'function login()',
            score: 0.85,
          },
        ],
      };

      const hits = normalizeProbeResults(response);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].filePath, '/src/auth.js');
      assert.equal(hits[0].line, 42);
      assert.equal(hits[0].matchContent, 'function login()');
      assert.equal(hits[0].relevanceScore, 0.85);
      assert.equal(hits[0].matchType, 'exact');
    });

    // TC-008-03: Results include tree-sitter context
    it('should include AST context from tree-sitter', () => {
      const response = {
        results: [
          {
            file: '/src/test.js',
            line: 10,
            content: 'class Foo',
            score: 0.9,
            ast: {
              nodeType: 'class_declaration',
              parentScope: 'module',
              symbolName: 'Foo',
              language: 'javascript',
            },
          },
        ],
      };

      const hits = normalizeProbeResults(response);
      assert.ok(hits[0].ast);
      assert.equal(hits[0].ast.nodeType, 'class_declaration');
      assert.equal(hits[0].ast.symbolName, 'Foo');
    });

    it('should handle context field as AST source', () => {
      const response = {
        results: [
          {
            file: '/src/test.js',
            line: 5,
            content: 'def foo',
            context: { kind: 'function', scope: 'class Bar', name: 'foo', lang: 'python' },
          },
        ],
      };

      const hits = normalizeProbeResults(response);
      assert.ok(hits[0].ast);
      assert.equal(hits[0].ast.nodeType, 'function');
      assert.equal(hits[0].ast.parentScope, 'class Bar');
    });

    it('should return empty array for null response', () => {
      assert.deepStrictEqual(normalizeProbeResults(null), []);
    });

    it('should return empty for response without results', () => {
      assert.deepStrictEqual(normalizeProbeResults({}), []);
    });

    it('should handle alternate field names', () => {
      const response = {
        results: [
          {
            filePath: '/a.js',
            lineNumber: 7,
            snippet: 'test content',
            relevance: 0.6,
          },
        ],
      };

      const hits = normalizeProbeResults(response);
      assert.equal(hits[0].filePath, '/a.js');
      assert.equal(hits[0].line, 7);
      assert.equal(hits[0].matchContent, 'test content');
      assert.equal(hits[0].relevanceScore, 0.6);
    });
  });

  describe('ProbeBackendError', () => {
    it('should be instanceof Error', () => {
      const err = new ProbeBackendError('test error');
      assert.ok(err instanceof Error);
      assert.equal(err.name, 'ProbeBackendError');
      assert.equal(err.message, 'test error');
    });
  });
});
