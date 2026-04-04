/**
 * Tests for lib/embedding/server/port-discovery.js
 * REQ-GH-224 FR-003, FR-004
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import {
  getServerConfig,
  isServerReachable,
  getServerHealth,
  waitForServer,
} from './port-discovery.js';

function createTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), 'isdlc-pd-'));
  mkdirSync(join(tmp, '.isdlc'), { recursive: true });
  return tmp;
}

function writeConfig(projectRoot, config) {
  writeFileSync(join(projectRoot, '.isdlc', 'config.json'), JSON.stringify(config));
}

// Mock HTTP server for reachability tests
function startMockServer(port, responder) {
  return new Promise((resolve) => {
    const server = http.createServer(responder);
    server.listen(port, 'localhost', () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// getServerConfig
// ---------------------------------------------------------------------------

describe('getServerConfig', () => {
  let tmp;

  beforeEach(() => {
    tmp = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns defaults when config.json is missing', () => {
    const cfg = getServerConfig(tmp);
    assert.strictEqual(cfg.port, 7777);
    assert.strictEqual(cfg.host, 'localhost');
    assert.strictEqual(cfg.auto_start, true);
  });

  it('returns defaults when embeddings section missing', () => {
    writeConfig(tmp, { cache: { budget_tokens: 100000 } });
    const cfg = getServerConfig(tmp);
    assert.strictEqual(cfg.port, 7777);
  });

  it('returns user-configured port', () => {
    writeConfig(tmp, { embeddings: { server: { port: 9999 } } });
    const cfg = getServerConfig(tmp);
    assert.strictEqual(cfg.port, 9999);
    assert.strictEqual(cfg.host, 'localhost');
  });

  it('returns user-configured host', () => {
    writeConfig(tmp, { embeddings: { server: { host: '127.0.0.1', port: 8888 } } });
    const cfg = getServerConfig(tmp);
    assert.strictEqual(cfg.host, '127.0.0.1');
    assert.strictEqual(cfg.port, 8888);
  });

  it('respects auto_start=false', () => {
    writeConfig(tmp, { embeddings: { server: { auto_start: false } } });
    const cfg = getServerConfig(tmp);
    assert.strictEqual(cfg.auto_start, false);
  });

  it('returns defaults on malformed config.json', () => {
    writeFileSync(join(tmp, '.isdlc', 'config.json'), '{bad json');
    const cfg = getServerConfig(tmp);
    assert.strictEqual(cfg.port, 7777);
  });
});

// ---------------------------------------------------------------------------
// isServerReachable
// ---------------------------------------------------------------------------

describe('isServerReachable', () => {
  it('returns true when server responds 200', async () => {
    const server = await startMockServer(18001, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    const reachable = await isServerReachable('localhost', 18001);
    assert.strictEqual(reachable, true);
    await stopServer(server);
  });

  it('returns false when server returns error status', async () => {
    const server = await startMockServer(18002, (req, res) => {
      res.writeHead(500);
      res.end();
    });
    const reachable = await isServerReachable('localhost', 18002);
    assert.strictEqual(reachable, false);
    await stopServer(server);
  });

  it('returns false when port is closed', async () => {
    const reachable = await isServerReachable('localhost', 18003, 500);
    assert.strictEqual(reachable, false);
  });

  it('respects timeout', async () => {
    const start = Date.now();
    const reachable = await isServerReachable('localhost', 18004, 200);
    const elapsed = Date.now() - start;
    assert.strictEqual(reachable, false);
    assert.ok(elapsed < 2000, `should timeout in ~200ms, took ${elapsed}ms`);
  });
});

// ---------------------------------------------------------------------------
// getServerHealth
// ---------------------------------------------------------------------------

describe('getServerHealth', () => {
  it('returns health JSON when reachable', async () => {
    const server = await startMockServer(18005, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', modules: { loaded: 3 } }));
    });
    const health = await getServerHealth('localhost', 18005);
    assert.ok(health);
    assert.strictEqual(health.status, 'ok');
    assert.strictEqual(health.modules.loaded, 3);
    await stopServer(server);
  });

  it('returns null when unreachable', async () => {
    const health = await getServerHealth('localhost', 18006, 500);
    assert.strictEqual(health, null);
  });
});

// ---------------------------------------------------------------------------
// waitForServer
// ---------------------------------------------------------------------------

describe('waitForServer', () => {
  it('returns true when server is already reachable', async () => {
    const server = await startMockServer(18007, (req, res) => {
      res.writeHead(200);
      res.end();
    });
    const ok = await waitForServer('localhost', 18007, 2000);
    assert.strictEqual(ok, true);
    await stopServer(server);
  });

  it('returns false on timeout when server never starts', async () => {
    const start = Date.now();
    const ok = await waitForServer('localhost', 18008, 800, 100);
    const elapsed = Date.now() - start;
    assert.strictEqual(ok, false);
    assert.ok(elapsed >= 700, `should wait full timeout, only ${elapsed}ms`);
  });
});
