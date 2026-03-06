/**
 * Tests for Chunking Engine (M1)
 *
 * REQ-0045 / FR-001 / M1 Chunker
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { chunkFile, chunkContent, detectLanguage, isLanguageSupported } from './index.js';
import { chunkByLines, generateChunkId } from './fallback-chunker.js';
import { getSupportedExtensions } from './language-map.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures/embedding');

describe('M1: Chunking Engine', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── detectLanguage() ──────────────────────────────────────────────
  describe('detectLanguage()', () => {
    it('detects Java from .java extension', () => {
      assert.equal(detectLanguage('src/main/OrderService.java'), 'java');
    });

    it('detects TypeScript from .ts extension', () => {
      assert.equal(detectLanguage('src/auth.ts'), 'typescript');
    });

    it('detects Python from .py extension', () => {
      assert.equal(detectLanguage('scripts/deploy.py'), 'python');
    });

    it('detects XML from .xml extension', () => {
      assert.equal(detectLanguage('config/spring.xml'), 'xml');
    });

    it('returns null for unsupported extensions', () => {
      assert.equal(detectLanguage('data/file.xyz'), null);
    });

    it('returns null for no extension', () => {
      assert.equal(detectLanguage('Makefile'), null);
    });

    it('returns null for null input', () => {
      assert.equal(detectLanguage(null), null);
    });

    it('returns null for empty string', () => {
      assert.equal(detectLanguage(''), null);
    });

    it('is case-insensitive for extensions', () => {
      assert.equal(detectLanguage('Service.JAVA'), 'java');
    });
  });

  // ── isLanguageSupported() ─────────────────────────────────────────
  describe('isLanguageSupported()', () => {
    it('returns true for java', () => {
      assert.equal(isLanguageSupported('java'), true);
    });

    it('returns true for typescript', () => {
      assert.equal(isLanguageSupported('typescript'), true);
    });

    it('returns false for unknown language', () => {
      assert.equal(isLanguageSupported('brainfuck'), false);
    });

    it('returns false for null', () => {
      assert.equal(isLanguageSupported(null), false);
    });

    it('returns false for empty string', () => {
      assert.equal(isLanguageSupported(''), false);
    });
  });

  // ── getSupportedExtensions() ──────────────────────────────────────
  describe('getSupportedExtensions()', () => {
    it('returns an array of file extensions', () => {
      const exts = getSupportedExtensions();
      assert.ok(Array.isArray(exts));
      assert.ok(exts.length > 10);
    });

    it('includes .java extension', () => {
      const exts = getSupportedExtensions();
      assert.ok(exts.includes('.java'));
    });

    it('includes .ts extension', () => {
      const exts = getSupportedExtensions();
      assert.ok(exts.includes('.ts'));
    });
  });

  // ── chunkContent() ────────────────────────────────────────────────
  describe('chunkContent()', () => {
    it('chunks a simple function into at least one chunk', async () => {
      const content = 'function hello() {\n  return "world";\n}\n';
      const chunks = await chunkContent(content, 'javascript');
      assert.ok(chunks.length >= 1);
      assert.ok(chunks[0].content.includes('hello'));
    });

    it('returns empty array for empty content', async () => {
      const chunks = await chunkContent('', 'java');
      assert.deepEqual(chunks, []);
    });

    it('returns empty array for whitespace-only content', async () => {
      const chunks = await chunkContent('   \n\n  ', 'java');
      assert.deepEqual(chunks, []);
    });

    it('returns empty array for null content', async () => {
      const chunks = await chunkContent(null, 'java');
      assert.deepEqual(chunks, []);
    });

    it('returns empty array for binary content (null bytes)', async () => {
      const content = 'header\0binary\0data';
      const chunks = await chunkContent(content, 'java');
      assert.deepEqual(chunks, []);
    });

    it('each chunk has required properties', async () => {
      const content = 'public class Foo {\n  public void bar() {}\n}\n';
      const chunks = await chunkContent(content, 'java');
      assert.ok(chunks.length >= 1);

      for (const chunk of chunks) {
        assert.equal(typeof chunk.id, 'string');
        assert.equal(typeof chunk.content, 'string');
        assert.equal(typeof chunk.filePath, 'string');
        assert.equal(typeof chunk.startLine, 'number');
        assert.equal(typeof chunk.endLine, 'number');
        assert.equal(typeof chunk.type, 'string');
        assert.equal(typeof chunk.language, 'string');
        assert.equal(typeof chunk.tokenCount, 'number');
        assert.ok(Array.isArray(chunk.signatures));
      }
    });

    it('handles unsupported language via fallback chunker', async () => {
      const content = 'line one\nline two\nline three\n';
      const chunks = await chunkContent(content, 'brainfuck');
      assert.ok(chunks.length >= 1);
      assert.equal(chunks[0].type, 'block');
    });
  });

  // ── chunkFile() ───────────────────────────────────────────────────
  describe('chunkFile()', () => {
    it('chunks a Java fixture file', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.java');
      const chunks = await chunkFile(filePath, 'java');
      assert.ok(chunks.length >= 1);
    });

    it('chunks a TypeScript fixture file', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.ts');
      const chunks = await chunkFile(filePath, 'typescript');
      assert.ok(chunks.length >= 1);
    });

    it('chunks a Python fixture file', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.py');
      const chunks = await chunkFile(filePath, 'python');
      assert.ok(chunks.length >= 1);
    });

    it('returns empty array for empty file', async () => {
      const filePath = join(FIXTURES_DIR, 'empty.txt');
      const chunks = await chunkFile(filePath, 'unknown');
      assert.deepEqual(chunks, []);
    });

    it('returns empty array for binary file', async () => {
      const filePath = join(FIXTURES_DIR, 'binary.bin');
      const chunks = await chunkFile(filePath, 'unknown');
      assert.deepEqual(chunks, []);
    });

    it('falls back to line-based chunking for unsupported extensions', async () => {
      const filePath = join(FIXTURES_DIR, 'unsupported.xyz');
      const chunks = await chunkFile(filePath, null);
      assert.ok(chunks.length >= 1);
      assert.equal(chunks[0].type, 'block');
    });

    it('throws on invalid filePath', async () => {
      await assert.rejects(
        () => chunkFile('', 'java'),
        { message: 'filePath must be a non-empty string' }
      );
    });

    it('throws on non-existent file', async () => {
      await assert.rejects(
        () => chunkFile('/nonexistent/file.java', 'java'),
        (err) => err.code === 'ENOENT'
      );
    });
  });

  // ── Fallback chunker ─────────────────────────────────────────────
  describe('chunkByLines()', () => {
    it('splits content into line-based chunks', () => {
      const content = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: some code content here`).join('\n');
      const chunks = chunkByLines(content, 'test.txt', 'unknown');
      assert.ok(chunks.length >= 1);
    });

    it('returns empty array for empty content', () => {
      const chunks = chunkByLines('', 'test.txt', 'unknown');
      assert.deepEqual(chunks, []);
    });

    it('returns empty array for whitespace content', () => {
      const chunks = chunkByLines('   \n\n  ', 'test.txt', 'unknown');
      assert.deepEqual(chunks, []);
    });

    it('sets chunk type to block', () => {
      const chunks = chunkByLines('hello\nworld\n', 'test.txt', 'unknown');
      assert.ok(chunks.length >= 1);
      assert.equal(chunks[0].type, 'block');
    });

    it('respects maxTokens option', () => {
      const longContent = Array.from({ length: 500 }, (_, i) => `Line ${i + 1} with substantial content`).join('\n');
      const chunks = chunkByLines(longContent, 'test.txt', 'unknown', { maxTokens: 100 });
      assert.ok(chunks.length > 1);
    });

    it('handles single line input', () => {
      const chunks = chunkByLines('single line', 'test.txt', null);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].startLine, 1);
    });
  });

  // ── Chunk ID determinism ──────────────────────────────────────────
  describe('generateChunkId()', () => {
    it('returns a 16-char hex string', () => {
      const id = generateChunkId('file.java', 1, 10);
      assert.equal(id.length, 16);
      assert.match(id, /^[0-9a-f]{16}$/);
    });

    it('same inputs produce same ID (deterministic)', () => {
      const id1 = generateChunkId('file.java', 1, 10);
      const id2 = generateChunkId('file.java', 1, 10);
      assert.equal(id1, id2);
    });

    it('different inputs produce different IDs', () => {
      const id1 = generateChunkId('file.java', 1, 10);
      const id2 = generateChunkId('file.java', 1, 11);
      assert.notEqual(id1, id2);
    });

    it('different files produce different IDs for same line range', () => {
      const id1 = generateChunkId('a.java', 1, 10);
      const id2 = generateChunkId('b.java', 1, 10);
      assert.notEqual(id1, id2);
    });
  });

  // ── Token count estimation ────────────────────────────────────────
  describe('token count estimation', () => {
    it('estimates tokens from content length (4 chars per token)', async () => {
      const content = 'x'.repeat(100) + '\n';
      const chunks = await chunkContent(content, null);
      assert.ok(chunks.length >= 1);
      // 101 chars / 4 = ~26 tokens
      assert.ok(chunks[0].tokenCount >= 20 && chunks[0].tokenCount <= 30);
    });
  });
});
