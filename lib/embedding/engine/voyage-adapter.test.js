/**
 * Tests for Voyage-code-3 Adapter
 *
 * REQ-0045 / FR-005 / AC-005-03, AC-005-04, AC-005-05 / M2 Engine
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createVoyageAdapter, VOYAGE_DIMENSIONS } from './voyage-adapter.js';

describe('M2: Voyage-code-3 Adapter', () => {
  // ── Constants ─────────────────────────────────────────────────────
  describe('VOYAGE_DIMENSIONS', () => {
    it('exports dimension constant of 1024', () => {
      assert.equal(VOYAGE_DIMENSIONS, 1024);
    });
  });

  // ── createVoyageAdapter() ─────────────────────────────────────────
  describe('createVoyageAdapter()', () => {
    it('throws when apiKey is missing', () => {
      assert.throws(
        () => createVoyageAdapter({}),
        /apiKey is required/
      );
    });

    it('throws when apiKey is empty string', () => {
      assert.throws(
        () => createVoyageAdapter({ apiKey: '' }),
        /apiKey is required/
      );
    });

    it('returns adapter with correct interface', () => {
      const adapter = createVoyageAdapter({ apiKey: 'test-key' });
      assert.equal(typeof adapter.embed, 'function');
      assert.equal(typeof adapter.healthCheck, 'function');
      assert.equal(typeof adapter.dispose, 'function');
      assert.equal(adapter.dimensions, 1024);
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
          const embeddings = parsed.input.map(() => {
            const vec = Array.from({ length: 1024 }, (_, i) => Math.random() * 0.1);
            return { embedding: vec };
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: embeddings,
            usage: { total_tokens: parsed.input.length * 10 },
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
      const adapter = createVoyageAdapter({
        apiKey: 'voy-test-key-123',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await adapter.embed(['hello world']);

      assert.equal(requestLog.length, 1);
      assert.equal(requestLog[0].method, 'POST');
      assert.equal(requestLog[0].headers.authorization, 'Bearer voy-test-key-123');
      assert.equal(requestLog[0].headers['content-type'], 'application/json');
      assert.deepEqual(requestLog[0].body.input, ['hello world']);
      assert.equal(requestLog[0].body.model, 'voyage-code-3');
    });

    it('returns Float32Array[] with correct dimensions', async () => {
      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.embed(['text one', 'text two']);

      assert.equal(result.length, 2);
      assert.ok(result[0] instanceof Float32Array);
      assert.ok(result[1] instanceof Float32Array);
      assert.equal(result[0].length, 1024);
      assert.equal(result[1].length, 1024);
    });

    it('returns L2-normalized vectors', async () => {
      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.embed(['normalize me']);

      // Compute L2 norm — should be approximately 1.0
      let norm = 0;
      for (let i = 0; i < result[0].length; i++) {
        norm += result[0][i] * result[0][i];
      }
      norm = Math.sqrt(norm);
      assert.ok(Math.abs(norm - 1.0) < 0.001, `L2 norm should be ~1.0, got ${norm}`);
    });

    it('handles empty texts array', async () => {
      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.embed([]);
      assert.deepEqual(result, []);
    });

    it('handles multiple texts in a single batch', async () => {
      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const texts = ['one', 'two', 'three', 'four', 'five'];
      const result = await adapter.embed(texts);

      assert.equal(result.length, 5);
      for (const vec of result) {
        assert.equal(vec.length, 1024);
      }
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
          res.end(JSON.stringify({ detail: 'Invalid API key' }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createVoyageAdapter({
        apiKey: 'bad-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('voyage-code-3'), `Error should mention provider: ${err.message}`);
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
          res.end(JSON.stringify({ detail: 'Rate limit exceeded' }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('429'), `Error should mention status code: ${err.message}`);
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
          res.end(JSON.stringify({ error: 'Internal server error' }));
        });
      });

      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });

      const adapter = createVoyageAdapter({
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
      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: 'http://127.0.0.1:1/v1/embeddings',
      });

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err.message.includes('voyage-code-3'));
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
            embedding: Array.from({ length: 1024 }, () => 0.1),
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

      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: `http://127.0.0.1:${port}/v1/embeddings`,
      });

      const result = await adapter.healthCheck();
      assert.equal(result.healthy, true);
      assert.equal(result.dimensions, 1024);
      assert.equal(result.error, undefined);
    });

    it('returns unhealthy when API fails', async () => {
      const adapter = createVoyageAdapter({
        apiKey: 'test-key',
        endpoint: 'http://127.0.0.1:1/v1/embeddings',
      });

      const result = await adapter.healthCheck();
      assert.equal(result.healthy, false);
      assert.equal(result.dimensions, 1024);
      assert.ok(result.error);
    });
  });

  // ── dispose() ────────────────────────────────────────────────────
  describe('dispose()', () => {
    it('can be called without error', () => {
      const adapter = createVoyageAdapter({ apiKey: 'test-key' });
      assert.doesNotThrow(() => adapter.dispose());
    });

    it('can be called multiple times safely', () => {
      const adapter = createVoyageAdapter({ apiKey: 'test-key' });
      adapter.dispose();
      assert.doesNotThrow(() => adapter.dispose());
    });
  });
});
