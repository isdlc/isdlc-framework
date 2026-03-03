/**
 * Tests for lib/search/backends/lexical.js
 *
 * REQ-0041 / FR-009: Agent Migration Path - Grep/Glob Adapter
 * Tests wrapping, result normalization, health check.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLexicalBackend, normalizeGrepResults } from './lexical.js';

describe('Lexical Backend (grep-glob)', () => {
  describe('createLexicalBackend', () => {
    it('should have correct static properties', () => {
      const backend = createLexicalBackend();
      assert.equal(backend.id, 'grep-glob');
      assert.equal(backend.modality, 'lexical');
      assert.equal(backend.priority, 0);
      assert.equal(backend.displayName, 'Grep/Glob (built-in)');
      assert.equal(backend.requiresMcp, false);
    });

    it('should always report healthy', async () => {
      const backend = createLexicalBackend();
      const health = await backend.healthCheck();
      assert.equal(health, 'healthy');
    });

    it('should return empty results with default grep function', async () => {
      const backend = createLexicalBackend();
      const results = await backend.search({ query: 'test', modality: 'lexical' });
      assert.deepStrictEqual(results, []);
    });

    it('should call injected grep function with correct parameters', async () => {
      let calledWith = null;
      const grepFn = async (query, opts) => {
        calledWith = { query, opts };
        return [
          { filePath: '/src/test.js', line: 10, content: 'function test()' },
        ];
      };

      const backend = createLexicalBackend({ grepFn });
      const results = await backend.search({
        query: 'test',
        scope: '/src',
        fileGlob: '*.js',
        maxResults: 25,
      });

      assert.ok(calledWith);
      assert.equal(calledWith.query, 'test');
      assert.equal(calledWith.opts.path, '/src');
      assert.equal(calledWith.opts.glob, '*.js');
      assert.equal(calledWith.opts.maxResults, 25);
      assert.equal(results.length, 1);
    });

    it('should return empty results on grep failure', async () => {
      const grepFn = async () => { throw new Error('grep failed'); };
      const backend = createLexicalBackend({ grepFn });

      const results = await backend.search({ query: 'test' });
      assert.deepStrictEqual(results, []);
    });

    it('should return empty for empty query', async () => {
      const backend = createLexicalBackend();
      const results = await backend.search({ query: '' });
      assert.deepStrictEqual(results, []);
    });
  });

  describe('normalizeGrepResults', () => {
    it('should normalize object-format results', () => {
      const raw = [
        { filePath: '/src/a.js', line: 10, content: 'const x = 1' },
        { filePath: '/src/b.js', line: 20, content: 'const y = 2' },
      ];

      const normalized = normalizeGrepResults(raw, 'const');
      assert.equal(normalized.length, 2);
      assert.equal(normalized[0].filePath, '/src/a.js');
      assert.equal(normalized[0].line, 10);
      assert.equal(normalized[0].matchContent, 'const x = 1');
      assert.equal(normalized[0].matchType, 'exact');
    });

    it('should normalize string-format results', () => {
      const raw = [
        '/src/a.js:10:const x = 1',
        '/src/b.js:20:const y = 2',
      ];

      const normalized = normalizeGrepResults(raw, 'const');
      assert.equal(normalized.length, 2);
      assert.equal(normalized[0].filePath, '/src/a.js');
      assert.equal(normalized[0].line, 10);
      assert.equal(normalized[0].matchContent, 'const x = 1');
    });

    it('should handle null/undefined results', () => {
      assert.deepStrictEqual(normalizeGrepResults(null, 'test'), []);
      assert.deepStrictEqual(normalizeGrepResults(undefined, 'test'), []);
    });

    it('should handle results with alternative field names', () => {
      const raw = [
        { file: '/src/a.js', lineNumber: 15, text: 'hello world' },
      ];

      const normalized = normalizeGrepResults(raw, 'hello');
      assert.equal(normalized[0].filePath, '/src/a.js');
      assert.equal(normalized[0].line, 15);
      assert.equal(normalized[0].matchContent, 'hello world');
    });

    it('should handle missing fields gracefully', () => {
      const raw = [{}];
      const normalized = normalizeGrepResults(raw, 'test');
      assert.equal(normalized.length, 1);
      assert.equal(normalized[0].filePath, '');
      assert.equal(normalized[0].line, 0);
      assert.equal(normalized[0].matchContent, '');
    });
  });
});
