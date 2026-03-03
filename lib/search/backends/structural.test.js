/**
 * Tests for lib/search/backends/structural.js
 *
 * REQ-0041 / FR-007: Structural Search Backend (ast-grep)
 * Tests MCP adapter, result normalization, health check.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStructuralBackend, normalizeAstGrepResults, SearchBackendError } from './structural.js';

describe('Structural Backend (ast-grep)', () => {
  describe('createStructuralBackend', () => {
    it('should have correct static properties', () => {
      const backend = createStructuralBackend();
      assert.equal(backend.id, 'ast-grep');
      assert.equal(backend.modality, 'structural');
      assert.equal(backend.priority, 10);
      assert.equal(backend.displayName, 'ast-grep (structural)');
      assert.equal(backend.requiresMcp, true);
    });

    // TC-007-07: Health check when MCP unavailable
    it('should return unavailable when no MCP function configured', async () => {
      const backend = createStructuralBackend();
      const health = await backend.healthCheck();
      assert.equal(health, 'unavailable');
    });

    // TC-007-08: Health check when MCP healthy
    it('should return healthy when MCP responds', async () => {
      const mcpCallFn = async () => true;
      const backend = createStructuralBackend({ mcpCallFn });
      const health = await backend.healthCheck();
      assert.equal(health, 'healthy');
    });

    // TC-007-09: Health check timeout enforcement
    it('should return unavailable on health check timeout', async () => {
      const mcpCallFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return true;
      };
      const backend = createStructuralBackend({ mcpCallFn, healthCheckTimeout: 50 });
      const health = await backend.healthCheck();
      assert.equal(health, 'unavailable');
    });

    it('should return unavailable when MCP throws', async () => {
      const mcpCallFn = async () => { throw new Error('connection refused'); };
      const backend = createStructuralBackend({ mcpCallFn });
      const health = await backend.healthCheck();
      assert.equal(health, 'unavailable');
    });

    // TC-007-02: Structural query routing
    it('should call MCP with correct parameters', async () => {
      let calledWith = null;
      const mcpCallFn = async (method, params) => {
        calledWith = { method, params };
        return { matches: [] };
      };

      const backend = createStructuralBackend({ mcpCallFn });
      await backend.search({
        query: 'console.log($$$)',
        scope: '/src',
        fileGlob: '*.js',
      });

      assert.ok(calledWith);
      assert.equal(calledWith.method, 'search');
      assert.equal(calledWith.params.pattern, 'console.log($$$)');
      assert.equal(calledWith.params.path, '/src');
    });

    it('should throw SearchBackendError when no MCP configured', async () => {
      const backend = createStructuralBackend();
      await assert.rejects(
        () => backend.search({ query: 'test' }),
        (err) => err.name === 'SearchBackendError'
      );
    });

    it('should throw SearchBackendError on MCP failure', async () => {
      const mcpCallFn = async () => { throw new Error('MCP error'); };
      const backend = createStructuralBackend({ mcpCallFn });
      await assert.rejects(
        () => backend.search({ query: 'test' }),
        (err) => err.name === 'SearchBackendError'
      );
    });
  });

  // TC-007-10: Result normalization to uniform contract
  describe('normalizeAstGrepResults', () => {
    it('should normalize ast-grep matches to RawSearchHit format', () => {
      const response = {
        matches: [
          {
            file: '/src/auth.js',
            range: { start: { line: 42, column: 0 } },
            text: 'async function login() {}',
            meta: {
              nodeType: 'function_declaration',
              parentScope: 'module',
              symbolName: 'login',
              language: 'javascript',
            },
          },
        ],
      };

      const hits = normalizeAstGrepResults(response, true);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].filePath, '/src/auth.js');
      assert.equal(hits[0].line, 42);
      assert.equal(hits[0].matchContent, 'async function login() {}');
      assert.equal(hits[0].matchType, 'structural');
      assert.ok(hits[0].ast);
      assert.equal(hits[0].ast.nodeType, 'function_declaration');
      assert.equal(hits[0].ast.parentScope, 'module');
      assert.equal(hits[0].ast.symbolName, 'login');
      assert.equal(hits[0].ast.language, 'javascript');
    });

    it('should omit AST metadata when includeAstContext is false', () => {
      const response = {
        matches: [
          {
            file: '/src/test.js',
            range: { start: { line: 1, column: 0 } },
            text: 'test()',
            meta: { nodeType: 'call_expression' },
          },
        ],
      };

      const hits = normalizeAstGrepResults(response, false);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].ast, undefined);
    });

    it('should handle missing meta gracefully', () => {
      const response = {
        matches: [
          { file: '/src/test.js', range: { start: { line: 1 } }, text: 'test' },
        ],
      };

      const hits = normalizeAstGrepResults(response, true);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].ast, undefined);
    });

    it('should return empty array for null response', () => {
      assert.deepStrictEqual(normalizeAstGrepResults(null), []);
    });

    it('should return empty array for response without matches', () => {
      assert.deepStrictEqual(normalizeAstGrepResults({}), []);
    });

    it('should use fallback field names', () => {
      const response = {
        matches: [
          {
            filePath: '/a.js',
            line: 5,
            column: 10,
            content: 'x',
            score: 0.95,
            meta: { kind: 'variable_declaration', enclosingScope: 'function bar', name: 'x', lang: 'typescript' },
          },
        ],
      };

      const hits = normalizeAstGrepResults(response, true);
      assert.equal(hits[0].filePath, '/a.js');
      assert.equal(hits[0].line, 5);
      assert.equal(hits[0].ast.nodeType, 'variable_declaration');
      assert.equal(hits[0].ast.parentScope, 'function bar');
      assert.equal(hits[0].ast.language, 'typescript');
    });

    it('should default relevanceScore to 0.8 for structural matches', () => {
      const response = {
        matches: [
          { file: '/a.js', text: 'test' },
        ],
      };

      const hits = normalizeAstGrepResults(response);
      assert.equal(hits[0].relevanceScore, 0.8);
    });
  });

  describe('SearchBackendError', () => {
    it('should be instanceof Error', () => {
      const err = new SearchBackendError('test');
      assert.ok(err instanceof Error);
      assert.equal(err.name, 'SearchBackendError');
      assert.equal(err.message, 'test');
    });
  });
});
