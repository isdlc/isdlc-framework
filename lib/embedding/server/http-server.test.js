/**
 * Tests for lib/embedding/server/http-server.js
 * REQ-GH-224 FR-001, FR-007, FR-008, FR-010
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from './http-server.js';

// ---------------------------------------------------------------------------
// Mock MCP server
// ---------------------------------------------------------------------------

function createMockMcpServer() {
  return {
    health: () => ({
      status: 'ok',
      initialized: true,
      uptimeMs: 1000,
      modules: { loaded: 2, list: [] },
    }),
    semanticSearch: async ({ query }) => {
      if (!query) {
        return { isError: true, content: { error: 'query required' } };
      }
      return {
        isError: false,
        content: {
          hits: [
            { filePath: 'src/foo.js', score: 0.9, content: 'code chunk' },
            { filePath: 'docs/readme.md', score: 0.8, content: 'doc chunk' },
          ],
          meta: { totalHits: 2, latencyMs: 5 },
        },
      };
    },
    listModules: () => ({
      isError: false,
      content: { modules: [{ moduleId: 'core', chunkCount: 100 }] },
    }),
    moduleInfo: ({ moduleId }) => {
      if (moduleId === 'missing') {
        return { isError: true, content: { error: 'not found' } };
      }
      return { isError: false, content: { module: { moduleId, chunkCount: 100 } } };
    },
    loadPackage: async () => ({ moduleId: 'reloaded' }),
  };
}

async function httpRequest(port, method, path, body = null) {
  const url = `http://localhost:${port}${path}`;
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}

// ---------------------------------------------------------------------------
// Test server lifecycle
// ---------------------------------------------------------------------------

describe('http-server', () => {
  let httpServer;
  let mockMcp;
  const PORT = 17777; // test port, avoid conflict

  before(async () => {
    mockMcp = createMockMcpServer();
    httpServer = createHttpServer(mockMcp);
    await httpServer.start(PORT, 'localhost');
  });

  after(async () => {
    await httpServer.stop();
  });

  // ---------------------------------------------------------------------------
  // GET /health
  // ---------------------------------------------------------------------------
  describe('GET /health', () => {
    it('returns 200 with health status', async () => {
      const res = await httpRequest(PORT, 'GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.initialized, true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /search
  // ---------------------------------------------------------------------------
  describe('POST /search', () => {
    it('returns 200 with tagged hits', async () => {
      const res = await httpRequest(PORT, 'POST', '/search', { query: 'test query' });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.hits));
      assert.strictEqual(res.body.hits.length, 2);
    });

    it('tags code files with code: prefix', async () => {
      const res = await httpRequest(PORT, 'POST', '/search', { query: 'test' });
      const codeHit = res.body.hits.find(h => h.filePath === 'src/foo.js');
      assert.strictEqual(codeHit.source, 'code:src/foo.js');
    });

    it('tags docs files with docs: prefix', async () => {
      const res = await httpRequest(PORT, 'POST', '/search', { query: 'test' });
      const docsHit = res.body.hits.find(h => h.filePath === 'docs/readme.md');
      assert.strictEqual(docsHit.source, 'docs:docs/readme.md');
    });

    it('returns 400 for empty query', async () => {
      const res = await httpRequest(PORT, 'POST', '/search', { query: '' });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });

    it('returns 400 for malformed JSON', async () => {
      const url = `http://localhost:${PORT}/search`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      });
      assert.strictEqual(response.status, 500);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /modules
  // ---------------------------------------------------------------------------
  describe('GET /modules', () => {
    it('returns 200 with module list', async () => {
      const res = await httpRequest(PORT, 'GET', '/modules');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.modules));
    });
  });

  // ---------------------------------------------------------------------------
  // GET /modules/:id
  // ---------------------------------------------------------------------------
  describe('GET /modules/:id', () => {
    it('returns 200 for existing module', async () => {
      const res = await httpRequest(PORT, 'GET', '/modules/core');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.module.moduleId, 'core');
    });

    it('returns 404 for missing module', async () => {
      const res = await httpRequest(PORT, 'GET', '/modules/missing');
      assert.strictEqual(res.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /refresh
  // ---------------------------------------------------------------------------
  describe('POST /refresh', () => {
    it('returns 501 when chunkerFn/embedFn not provided', async () => {
      const res = await httpRequest(PORT, 'POST', '/refresh', { files: [{ path: 'src/foo.js' }] });
      assert.strictEqual(res.status, 501);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /add-content
  // ---------------------------------------------------------------------------
  describe('POST /add-content', () => {
    it('returns 200 and acknowledges chunks', async () => {
      const res = await httpRequest(PORT, 'POST', '/add-content', {
        chunks: [{ content: 'test' }, { content: 'test2' }],
        source: 'external:confluence',
        tier: 'full',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.added, 2);
      assert.strictEqual(res.body.source, 'external:confluence');
    });

    it('returns 400 when chunks array is empty', async () => {
      const res = await httpRequest(PORT, 'POST', '/add-content', {
        chunks: [],
        source: 'external:test',
      });
      assert.strictEqual(res.status, 400);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /reload
  // ---------------------------------------------------------------------------
  describe('POST /reload', () => {
    it('reloads specified packages', async () => {
      const res = await httpRequest(PORT, 'POST', '/reload', {
        paths: ['docs/.embeddings/pkg1.emb'],
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.reloaded, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown routes
  // ---------------------------------------------------------------------------
  describe('404 handling', () => {
    it('returns 404 for unknown path', async () => {
      const res = await httpRequest(PORT, 'GET', '/unknown');
      assert.strictEqual(res.status, 404);
    });
  });
});

// ---------------------------------------------------------------------------
// Test server creation + teardown (separate from main test suite)
// ---------------------------------------------------------------------------

describe('http-server lifecycle', () => {
  it('can be started and stopped', async () => {
    const mock = createMockMcpServer();
    const srv = createHttpServer(mock);
    await srv.start(17778, 'localhost');
    // Verify reachable
    const res = await fetch('http://localhost:17778/health');
    assert.strictEqual(res.status, 200);
    await srv.stop();
  });

  it('throws when port is in use', async () => {
    const mock = createMockMcpServer();
    const srv1 = createHttpServer(mock);
    await srv1.start(17779, 'localhost');
    const srv2 = createHttpServer(mock);
    await assert.rejects(srv2.start(17779, 'localhost'));
    await srv1.stop();
  });
});
