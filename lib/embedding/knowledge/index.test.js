/**
 * Tests for Knowledge Base Embedding Pipeline
 *
 * REQ-0045 / FR-002 / AC-002-01, AC-002-02, AC-002-03 / M2 Engine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDocument,
  createKnowledgePipeline,
  SUPPORTED_FORMATS,
} from './index.js';

describe('M2-KB: Knowledge Base Embedding Pipeline', () => {
  // ── chunkDocument() ───────────────────────────────────────────────
  describe('chunkDocument()', () => {
    // ── Markdown ──────────────────────────────────────────────────
    describe('Markdown format', () => {
      it('splits markdown on headings', () => {
        const md = [
          '# Title',
          'Intro paragraph.',
          '',
          '## Section One',
          'Content of section one.',
          '',
          '## Section Two',
          'Content of section two.',
        ].join('\n');

        const chunks = chunkDocument(md, { format: 'markdown', filePath: 'doc.md' });

        assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);
        // Each chunk should have required metadata
        for (const chunk of chunks) {
          assert.ok(chunk.content, 'chunk must have content');
          assert.ok(chunk.filePath, 'chunk must have filePath');
          assert.ok(chunk.sectionPath, 'chunk must have sectionPath');
          assert.equal(typeof chunk.charOffset, 'number');
        }
      });

      it('preserves code blocks as atomic units', () => {
        const md = [
          '## Code Example',
          '',
          '```javascript',
          'function hello() {',
          '  return "world";',
          '}',
          '```',
          '',
          'After the code block.',
        ].join('\n');

        const chunks = chunkDocument(md, { format: 'markdown', filePath: 'code.md' });

        // Code block should not be split across chunks
        const codeChunk = chunks.find(c => c.content.includes('function hello'));
        assert.ok(codeChunk, 'Should have a chunk containing the code block');
        assert.ok(codeChunk.content.includes('return "world"'),
          'Code block should be kept together');
      });

      it('generates section path breadcrumbs', () => {
        const md = [
          '# Root',
          '## Chapter',
          '### Sub-section',
          'Content here.',
        ].join('\n');

        const chunks = chunkDocument(md, { format: 'markdown', filePath: 'nested.md' });

        const deepChunk = chunks.find(c => c.content.includes('Content here'));
        assert.ok(deepChunk, 'Should find the deep chunk');
        assert.ok(deepChunk.sectionPath.includes('Root'),
          `sectionPath should include Root: ${deepChunk.sectionPath}`);
      });

      it('handles empty markdown', () => {
        const chunks = chunkDocument('', { format: 'markdown', filePath: 'empty.md' });
        assert.deepEqual(chunks, []);
      });

      it('handles markdown with only whitespace', () => {
        const chunks = chunkDocument('   \n\n   ', { format: 'markdown', filePath: 'ws.md' });
        assert.deepEqual(chunks, []);
      });
    });

    // ── HTML ──────────────────────────────────────────────────────
    describe('HTML format', () => {
      it('strips HTML tags and splits on block elements', () => {
        const html = [
          '<h1>Title</h1>',
          '<p>First paragraph.</p>',
          '<h2>Section</h2>',
          '<p>Second paragraph.</p>',
        ].join('\n');

        const chunks = chunkDocument(html, { format: 'html', filePath: 'page.html' });

        assert.ok(chunks.length >= 1);
        for (const chunk of chunks) {
          assert.ok(!chunk.content.includes('<h1>'), 'HTML tags should be stripped');
          assert.ok(!chunk.content.includes('<p>'), 'HTML tags should be stripped');
        }
      });

      it('splits on heading and section elements', () => {
        const html = [
          '<h1>First Heading</h1>',
          '<div>Some content</div>',
          '<h2>Second Heading</h2>',
          '<section>More content</section>',
        ].join('\n');

        const chunks = chunkDocument(html, { format: 'html', filePath: 'sections.html' });
        assert.ok(chunks.length >= 2);
      });

      it('handles empty HTML', () => {
        const chunks = chunkDocument('', { format: 'html', filePath: 'empty.html' });
        assert.deepEqual(chunks, []);
      });
    });

    // ── Plain text ─────────────────────────────────────────────────
    describe('Plain text format', () => {
      it('splits on double newlines', () => {
        const text = [
          'First paragraph with some content.',
          '',
          'Second paragraph with more content.',
          '',
          'Third paragraph with final content.',
        ].join('\n');

        const chunks = chunkDocument(text, { format: 'text', filePath: 'doc.txt' });

        assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);
      });

      it('handles text without paragraph breaks', () => {
        const text = 'A single block of text without any paragraph breaks.';
        const chunks = chunkDocument(text, { format: 'text', filePath: 'single.txt' });
        assert.equal(chunks.length, 1);
        assert.ok(chunks[0].content.includes('single block'));
      });

      it('handles empty text', () => {
        const chunks = chunkDocument('', { format: 'text', filePath: 'empty.txt' });
        assert.deepEqual(chunks, []);
      });
    });

    // ── Common behavior ─────────────────────────────────────────────
    describe('Common chunking behavior', () => {
      it('enforces maxTokens limit on chunks', () => {
        // Create content that exceeds 512 tokens (~2048 chars)
        const longSection = 'word '.repeat(600);
        const md = `## Long Section\n${longSection}`;

        const chunks = chunkDocument(md, {
          format: 'markdown',
          filePath: 'long.md',
          maxTokens: 512,
        });

        for (const chunk of chunks) {
          // Each chunk should be at most maxTokens * 4 chars (rough estimate)
          assert.ok(chunk.content.length <= 512 * 4 + 200,
            `Chunk too long: ${chunk.content.length} chars`);
        }
      });

      it('includes filePath in every chunk', () => {
        const md = '## Section\nContent';
        const chunks = chunkDocument(md, { format: 'markdown', filePath: 'test/doc.md' });
        for (const chunk of chunks) {
          assert.equal(chunk.filePath, 'test/doc.md');
        }
      });

      it('includes charOffset in every chunk', () => {
        const md = '## Section One\nContent one.\n\n## Section Two\nContent two.';
        const chunks = chunkDocument(md, { format: 'markdown', filePath: 'offsets.md' });
        for (const chunk of chunks) {
          assert.equal(typeof chunk.charOffset, 'number');
          assert.ok(chunk.charOffset >= 0);
        }
      });

      it('auto-detects format from file extension when not specified', () => {
        const md = '## Hello\nWorld';
        const chunks = chunkDocument(md, { filePath: 'test.md' });
        assert.ok(chunks.length >= 1);
      });

      it('defaults to text format for unknown extensions', () => {
        const content = 'Some content\n\nMore content';
        const chunks = chunkDocument(content, { filePath: 'file.xyz' });
        assert.ok(chunks.length >= 1);
      });
    });
  });

  // ── SUPPORTED_FORMATS ─────────────────────────────────────────────
  describe('SUPPORTED_FORMATS', () => {
    it('includes markdown, html, and text', () => {
      assert.ok(SUPPORTED_FORMATS.includes('markdown'));
      assert.ok(SUPPORTED_FORMATS.includes('html'));
      assert.ok(SUPPORTED_FORMATS.includes('text'));
    });
  });

  // ── createKnowledgePipeline() ─────────────────────────────────────
  describe('createKnowledgePipeline()', () => {
    it('creates pipeline with required methods', () => {
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => texts.map(() => new Float32Array(768)),
        model: 'codebert',
        dimensions: 768,
      });

      assert.equal(typeof pipeline.processDocuments, 'function');
      assert.equal(typeof pipeline.processDocument, 'function');
    });

    it('throws when embedFn is missing', () => {
      assert.throws(
        () => createKnowledgePipeline({}),
        /embedFn is required/
      );
    });

    it('processDocument chunks and embeds a single document', async () => {
      const embedded = [];
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => {
          embedded.push(...texts);
          return texts.map(() => new Float32Array(768));
        },
        model: 'codebert',
        dimensions: 768,
      });

      const result = await pipeline.processDocument(
        '## Section\nContent here.',
        { format: 'markdown', filePath: 'test.md' }
      );

      assert.ok(result.chunks.length >= 1);
      assert.ok(result.vectors.length >= 1);
      assert.equal(result.chunks.length, result.vectors.length);
    });

    it('processDocuments handles multiple documents', async () => {
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => texts.map(() => new Float32Array(768)),
        model: 'codebert',
        dimensions: 768,
      });

      const docs = [
        { content: '## Doc One\nContent one.', filePath: 'one.md', format: 'markdown' },
        { content: 'Plain text document.\n\nSecond paragraph.', filePath: 'two.txt', format: 'text' },
      ];

      const result = await pipeline.processDocuments(docs);

      assert.ok(result.chunks.length >= 2);
      assert.equal(result.chunks.length, result.vectors.length);
      assert.equal(result.contentType, 'knowledge-base');
    });

    it('sets content_type to knowledge-base', async () => {
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => texts.map(() => new Float32Array(768)),
        model: 'codebert',
        dimensions: 768,
      });

      const result = await pipeline.processDocuments([
        { content: '## Test\nContent.', filePath: 'test.md', format: 'markdown' },
      ]);

      assert.equal(result.contentType, 'knowledge-base');
    });

    it('includes model and dimensions in result', async () => {
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => texts.map(() => new Float32Array(1024)),
        model: 'voyage-code-3',
        dimensions: 1024,
      });

      const result = await pipeline.processDocuments([
        { content: '## Test\nContent.', filePath: 'test.md', format: 'markdown' },
      ]);

      assert.equal(result.model, 'voyage-code-3');
      assert.equal(result.dimensions, 1024);
    });

    it('handles empty document list', async () => {
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => texts.map(() => new Float32Array(768)),
        model: 'codebert',
        dimensions: 768,
      });

      const result = await pipeline.processDocuments([]);

      assert.deepEqual(result.chunks, []);
      assert.deepEqual(result.vectors, []);
    });

    it('calls onProgress callback', async () => {
      const progressCalls = [];
      const pipeline = createKnowledgePipeline({
        embedFn: async (texts) => texts.map(() => new Float32Array(768)),
        model: 'codebert',
        dimensions: 768,
      });

      await pipeline.processDocuments(
        [
          { content: '## A\nContent.', filePath: 'a.md', format: 'markdown' },
          { content: '## B\nContent.', filePath: 'b.md', format: 'markdown' },
        ],
        { onProgress: (done, total) => progressCalls.push({ done, total }) }
      );

      assert.ok(progressCalls.length >= 1, 'onProgress should be called at least once');
    });
  });
});
