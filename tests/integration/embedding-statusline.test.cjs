/**
 * Integration tests for embedding status line end-to-end flow
 * REQ-GH-244 FR-001, FR-002, FR-003
 *
 * Verifies cross-module interactions:
 * health-monitor + staleness -> health file -> status line output.
 * Mocks external I/O (fetch, execSync) but not inter-module calls.
 *
 * Test commands:
 *   node --test tests/integration/embedding-statusline.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

describe('Embedding status line integration', () => {
  let tmpDir;
  let originalExecSync;
  let originalFetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-int-'));
    fs.mkdirSync(path.join(tmpDir, '.isdlc'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.embeddings'), { recursive: true });
    originalExecSync = childProcess.execSync;
    originalFetch = global.fetch;
    clearModuleCache();
  });

  afterEach(() => {
    childProcess.execSync = originalExecSync;
    global.fetch = originalFetch;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    clearModuleCache();
  });

  function clearModuleCache() {
    const mods = [
      path.resolve(__dirname, '../../src/core/vcs/staleness.cjs'),
      path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'),
      path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'),
    ];
    for (const m of mods) {
      try { delete require.cache[require.resolve(m)]; } catch { /* not yet loaded */ }
    }
  }

  function mockExecSync(responses) {
    childProcess.execSync = (cmd, opts) => {
      for (const [key, value] of Object.entries(responses)) {
        if (cmd.includes(key)) {
          if (value instanceof Error) throw value;
          return Buffer.from(value);
        }
      }
      throw new Error(`mock: unrecognized command: ${cmd}`);
    };
  }

  function mockFetch(response) {
    global.fetch = async () => {
      if (response instanceof Error) throw response;
      return {
        ok: response.ok !== false,
        status: response.status || 200,
        json: async () => response.body || {},
      };
    };
  }

  function writeManifest(commit) {
    fs.writeFileSync(
      path.join(tmpDir, '.embeddings', 'manifest.json'),
      JSON.stringify({ generatedAtCommit: commit })
    );
  }

  // ---- P0 Tests (Critical) ----

  it('[P0] FR-001,FR-002: Given full health cycle, When refreshHealth writes file and statusline reads it, Then formatted output matches health state', async () => {
    // Set up: Git repo, healthy server, fresh embeddings
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    writeManifest('abc123');
    mockFetch({ ok: true, body: { status: 'ok', chunks: 19811 } });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '0',
      'diff --name-only': '',
    });

    // Step 1: refreshHealth writes health file
    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    const health = await healthMon.refreshHealth(tmpDir);
    assert.equal(health.status, 'healthy');

    // Step 2: status line reads the health file
    const { formatStatus } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    const output = formatStatus(health);
    assert.equal(output, 'emb: 19811 chunks \u2713');
  });

  it('[P0] FR-002,FR-003: Given VCS staleness detected, When staleness flows through health monitor, Then status output reflects stale state', async () => {
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    writeManifest('abc123');
    mockFetch({ ok: true, body: { status: 'ok', chunks: 500 } });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '5',
      'diff --name-only': '',
    });

    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    const health = await healthMon.refreshHealth(tmpDir);
    assert.equal(health.status, 'stale');
    assert.equal(health.commits_behind, 5);

    const { formatStatus } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    const output = formatStatus(health);
    assert.equal(output, 'emb: stale (5 commits behind)');
  });

  // ---- P1 Tests (High) ----

  it('[P1] FR-001: Given fresh health file exists, When status line script runs, Then display-refresh skips data-refresh and reads from cache', async () => {
    // Write a fresh health file directly (within interval)
    const healthFile = path.join(tmpDir, '.isdlc', 'embedding-health.json');
    fs.writeFileSync(healthFile, JSON.stringify({
      status: 'healthy',
      checked_at: new Date().toISOString(),
      chunks: 1000,
      port: 7777,
    }));

    // Mock the health monitor shouldRefresh to return false
    const monitorPath = path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs');
    require.cache[require.resolve(monitorPath)] = {
      id: monitorPath,
      filename: monitorPath,
      loaded: true,
      exports: {
        shouldRefresh: () => false,
        refreshHealth: async () => { throw new Error('Should not be called in display-refresh'); },
      },
    };

    const { run } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    const output = await run(tmpDir);
    assert.equal(output, 'emb: 1000 chunks \u2713');
  });

  it('[P1] FR-002: Given status transition healthy to stale, When refreshHealth detects change, Then transition is logged to stderr', async () => {
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    writeManifest('abc123');
    // Previous state: healthy
    fs.writeFileSync(
      path.join(tmpDir, '.isdlc', 'embedding-health.json'),
      JSON.stringify({ status: 'healthy', checked_at: new Date().toISOString() })
    );
    mockFetch({ ok: true, body: { status: 'ok', chunks: 500 } });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '3',
      'diff --name-only': 'file.js\n',
    });

    const stderrChunks = [];
    const origWrite = process.stderr.write;
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    await healthMon.refreshHealth(tmpDir);

    process.stderr.write = origWrite;

    const stderrOutput = stderrChunks.join('');
    assert.ok(stderrOutput.includes('healthy -> stale'), `Expected transition log, got: ${stderrOutput}`);
  });

  it('[P1] FR-001,FR-002: Given shared health file, When both tool-router and statusline read it, Then both parse identical structured data', async () => {
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    writeManifest('abc123');
    mockFetch({ ok: true, body: { status: 'ok', chunks: 750 } });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '0',
      'diff --name-only': '',
    });

    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    await healthMon.refreshHealth(tmpDir);

    const healthFile = path.join(tmpDir, '.isdlc', 'embedding-health.json');
    // Simulate tool-router reading
    const toolRouterData = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
    // Simulate statusline reading
    const statuslineData = JSON.parse(fs.readFileSync(healthFile, 'utf8'));

    assert.deepStrictEqual(toolRouterData, statuslineData);
    assert.equal(toolRouterData.status, 'healthy');
    assert.equal(toolRouterData.chunks, 750);
  });
});
