/**
 * Tests for OpenAI Embedding Adapter
 *
 * REQ-0045 / FR-005 / AC-005-03, AC-005-04, AC-005-05 / M2 Engine
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createOpenAIAdapter, OPENAI_DIMENSIONS } from './openai-adapter.js';

describe('M2: OpenAI Embedding Adapter', () => {
  // ── Constants ─────────────────────────────────────────────────────
  describe('OPENAI_DIMENSIONS', () => {
    it('exports dimension constant of 1536', () => {
      assert.equal(OPENAI_DIMENSIONS, 1536);
    });
  });

  // ── createOpenAIAdapter() ─────────────────────────────────────────
  describe('createOpenAIAdapter()', () => {
    it('throws when apiKey is missing', () => {
      assert.throws(
        () => createOpenAIAdapter({}),
        /apiKey is required/
      );
    });

    it('throws when apiKey is empty string', () => {
      assert.throws(
        () => createOpenAIAdapter({ apiKey: '' }),
        /apiKey is required/
      );
    });

    it('returns adapter with correct interface', () => {
      const adapter = createOpenAIAdapter({ apiKey: 'test-key' });
      assert.equal(typeof adapter.embed, 'function');
      assert.equal(typeof adapter.healthCheck, 'function');
      assert.equal(typeof adapter.dispose, 'function');
      assert.equal(adapter.dimensions, 1536);
    });

    it('accepts custom model name', () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      assert.equal(adapter.dimensions, 1536);
    });
  });

  // ── embed() with mock server ──────────────────────────────────────
  describe('embed() via mock server', () => {
    let server;
    let port;
    let requestLog;

    beforeEach(async () => {
      requestLog = [];

      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          requestLog.push({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: JSON.parse(body),
          });

          const parsed = JSON.parse(body);
          const dims = 1536;
          const embeddings = parsed.input.map(() => {
            const vec = Array.from({ length: dims }, (_, i) => Math.random() * 0.1);
            return { embedding: vec };
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: embeddings,
            usage: { total_tokens: parsed.input.length * 8 },
          }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('sends correct request format to API', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'sk-test-key-123',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await adapter.embed(['hello world']);

      assert.equal(requestLog.length, 1);
      assert.equal(requestLog[0].method, 'POST');
      assert.equal(requestLog[0].headers.authorization, 'Bearer sk-test-key-123');
      assert.equal(requestLog[0].headers['content-type'], 'application/json');
      assert.deepEqual(requestLog[0].body.input, ['hello world']);
      assert.equal(requestLog[0].body.model, 'text-embedding-3-small');
    });

    it('uses custom model name when specified', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await adapter.embed(['test']);

      assert.equal(requestLog[0].body.model, 'text-embedding-3-large');
    });

    it('returns Float32Array[] with correct dimensions', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.embed(['text one', 'text two']);

      assert.equal(result.length, 2);
      assert.ok(result[0] instanceof Float32Array);
      assert.ok(result[1] instanceof Float32Array);
      assert.equal(result[0].length, 1536);
      assert.equal(result[1].length, 1536);
    });

    it('returns L2-normalized vectors', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.embed(['normalize me']);

      let norm = 0;
      for (let i = 0; i < result[0].length; i++) {
        norm += result[0][i] * result[0][i];
      }
      norm = Math.sqrt(norm);
      assert.ok(Math.abs(norm - 1.0) < 0.001, `L2 norm should be ~1.0, got ${norm}`);
    });

    it('handles empty texts array', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.embed([]);
      assert.deepEqual(result, []);
    });

    it('handles multiple texts in a single batch', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const texts = ['alpha', 'beta', 'gamma', 'delta'];
      const result = await adapter.embed(texts);

      assert.equal(result.length, 4);
      for (const vec of result) {
        assert.equal(vec.length, 1536);
      }
    });

    it('supports custom endpoint (Azure OpenAI)', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'azure-key',
        endpoint: `http://127.0.0.1:${port}/openai/deployments/my-model/embeddings`,
      });

      await adapter.embed(['azure test']);

      assert.equal(requestLog[0].headers.authorization, 'Bearer azure-key');
    });
  });

  // ── Error handling ────────────────────────────────────────────────
  describe('embed() error handling', () => {
    let server;
    let port;

    afterEach(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('throws descriptive error on HTTP 401', async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Incorrect API key' } }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createOpenAIAdapter({
        apiKey: 'bad-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('openai'), `Error should mention provider: ${err.message}`);
          assert.ok(err.message.includes('401'), `Error should mention status code: ${err.message}`);
          return true;
        }
      );
    });

    it('throws descriptive error on HTTP 429 rate limit', async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('429'));
          return true;
        }
      );
    });

    it('throws descriptive error on HTTP 500', async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Internal server error' } }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('500'));
          return true;
        }
      );
    });

    it('throws on network error (unreachable endpoint)', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: 'http://127.0.0.1:1/v1/embeddings',
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('openai'));
          return true;
        }
      );
    });
  });

  // ── healthCheck() ────────────────────────────────────────────────
  describe('healthCheck()', () => {
    let server;
    let port;

    afterEach(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it('returns healthy when API responds successfully', async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body);
          const embeddings = parsed.input.map(() => ({
            embedding: Array.from({ length: 1536 }, () => 0.1),
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: embeddings,
            usage: { total_tokens: 5 },
          }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.healthCheck();
      assert.equal(result.healthy, true);
      assert.equal(result.dimensions, 1536);
      assert.equal(result.error, undefined);
    });

    it('returns unhealthy when API fails', async () => {
      const adapter = createOpenAIAdapter({
        apiKey: 'test-key',
        endpoint: 'http://127.0.0.1:1/v1/embeddings',
      });

      const result = await adapter.healthCheck();
      assert.equal(result.healthy, false);
      assert.equal(result.dimensions, 1536);
      assert.ok(result.error);
    });
  });

  // ── dispose() ────────────────────────────────────────────────────
  describe('dispose()', () => {
    it('can be called without error', () => {
      const adapter = createOpenAIAdapter({ apiKey: 'test-key' });
      assert.doesNotThrow(() => adapter.dispose());
    });

    it('can be called multiple times safely', () => {
      const adapter = createOpenAIAdapter({ apiKey: 'test-key' });
      adapter.dispose();
      assert.doesNotThrow(() => adapter.dispose());
    });
  });
});
