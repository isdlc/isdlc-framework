/**
 * Tests for lib/embedding/server/refresh-client.js
 * REQ-GH-224 FR-005, FR-008
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  pushRefresh,
  pushContent,
  reloadPackages,
} from './refresh-client.js';

function startMockServer(port, responder) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => responder(req, res, body));
    });
    server.listen(port, 'localhost', () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('pushRefresh', () => {
  it('returns ok=true with refreshed count on success', async () => {
    const srv = await startMockServer(19001, (req, res, body) => {
      const { files } = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ refreshed: files.length, deleted: 0, errors: [] }));
    });
    const result = await pushRefresh('localhost', 19001, [
      { path: 'src/a.js', operation: 'modify' },
      { path: 'src/b.js', operation: 'add' },
    ]);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.refreshed, 2);
    await stopServer(srv);
  });

  it('returns ok=true with 0 when file list is empty', async () => {
    const result = await pushRefresh('localhost', 19002, []);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.refreshed, 0);
  });

  it('returns ok=false on server unreachable', async () => {
    const result = await pushRefresh('localhost', 19003, [{ path: 'src/a.js' }], 500);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });

  it('returns ok=false on server 500', async () => {
    const srv = await startMockServer(19004, (req, res) => {
      res.writeHead(500);
      res.end();
    });
    const result = await pushRefresh('localhost', 19004, [{ path: 'src/a.js' }]);
    assert.strictEqual(result.ok, false);
    await stopServer(srv);
  });
});

describe('pushContent', () => {
  it('returns ok=true with added count on success', async () => {
    const srv = await startMockServer(19005, (req, res, body) => {
      const { chunks } = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ added: chunks.length, errors: [] }));
    });
    const result = await pushContent('localhost', 19005, [
      { content: 'chunk 1' },
      { content: 'chunk 2' },
    ], 'external:confluence', 'full');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.added, 2);
    await stopServer(srv);
  });

  it('returns ok=false when chunks array is empty', async () => {
    const result = await pushContent('localhost', 19006, [], 'external:test');
    assert.strictEqual(result.ok, false);
  });

  it('returns ok=false on server error with error message', async () => {
    const srv = await startMockServer(19007, (req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad request' }));
    });
    const result = await pushContent('localhost', 19007, [{ content: 'x' }], 'external:t');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'bad request');
    await stopServer(srv);
  });
});

describe('reloadPackages', () => {
  it('returns ok=true with reloaded count', async () => {
    const srv = await startMockServer(19008, (req, res, body) => {
      const { paths } = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reloaded: paths.length, errors: [] }));
    });
    const result = await reloadPackages('localhost', 19008, ['pkg1.emb', 'pkg2.emb']);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reloaded, 2);
    await stopServer(srv);
  });

  it('returns ok=false on unreachable server', async () => {
    const result = await reloadPackages('localhost', 19009, ['pkg.emb'], 500);
    assert.strictEqual(result.ok, false);
  });
});
