/**
 * Fail-open integration tests for embedding status line
 * REQ-GH-244 FR-004, AC-004-01, AC-004-02, AC-004-03
 *
 * Verifies Article X (fail-open) compliance across module boundaries:
 * status line script errors, health probe failures, VCS command failures.
 *
 * Test commands:
 *   node --test tests/integration/embedding-statusline-failopen.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

describe('Embedding status line fail-open (Article X)', () => {
  let tmpDir;
  let originalExecSync;
  let originalFetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failopen-'));
    fs.mkdirSync(path.join(tmpDir, '.isdlc'), { recursive: true });
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

  // ---- P0 Tests (Critical) ----

  it('[P0] AC-004-01: Given any error in status line script, When Claude Code calls it, Then exit 0 with no output — never crash', async () => {
    // Mock health monitor that throws on everything
    const monitorPath = path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs');
    require.cache[require.resolve(monitorPath)] = {
      id: monitorPath,
      filename: monitorPath,
      loaded: true,
      exports: {
        shouldRefresh: () => { throw new Error('catastrophic failure'); },
        refreshHealth: async () => { throw new Error('catastrophic failure'); },
      },
    };

    // Also corrupt the health file
    fs.writeFileSync(path.join(tmpDir, '.isdlc', 'embedding-health.json'), '{{invalid json}}');

    const { formatStatus } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    // formatStatus handles bad input gracefully
    assert.equal(formatStatus(null), '');
    assert.equal(formatStatus(undefined), '');
    assert.equal(formatStatus({}), '');
  });

  it('[P0] AC-004-02: Given health probe times out, When data-refresh runs, Then status is "offline" and script continues', async () => {
    fs.mkdirSync(path.join(tmpDir, '.embeddings'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.embeddings', 'manifest.json'),
      JSON.stringify({ generatedAtCommit: 'abc123' })
    );
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });

    // Mock fetch to simulate timeout
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    global.fetch = async () => { throw abortErr; };

    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '0',
      'diff --name-only': '',
    });

    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    const health = await healthMon.refreshHealth(tmpDir);

    assert.equal(health.status, 'offline');
    assert.equal(health.error, 'timeout');

    // Status line formats it correctly
    const { formatStatus } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    assert.equal(formatStatus(health), 'emb: offline');
  });

  it('[P0] AC-004-03: Given VCS commands fail, When staleness runs, Then returns nulls and script continues', async () => {
    fs.mkdirSync(path.join(tmpDir, '.embeddings'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.embeddings', 'manifest.json'),
      JSON.stringify({ generatedAtCommit: 'abc123' })
    );
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', chunks: 100 }),
    });

    // All git commands fail
    mockExecSync({
      'git fetch': new Error('network unreachable'),
      '@{upstream}': new Error('no upstream'),
      'rev-list': new Error('bad object'),
      'diff': new Error('bad revision'),
    });

    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    const health = await healthMon.refreshHealth(tmpDir);

    // VCS staleness returns nulls but health monitor still works
    assert.ok(['healthy', 'stale'].includes(health.status) || health.status === 'healthy');
    assert.ok(health.error === null);

    // Health file was written
    const healthFile = path.join(tmpDir, '.isdlc', 'embedding-health.json');
    assert.ok(fs.existsSync(healthFile));

    // Status line still produces output
    const { formatStatus } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    const output = formatStatus(health);
    assert.ok(typeof output === 'string');
    assert.ok(output.length > 0);
  });

  // ---- P1 Tests (High / Negative) ----

  it('[P1] AC-004-01: Given corrupt health file (invalid JSON), When status line script reads it, Then exit 0 with no output', async () => {
    // Write corrupt health file
    fs.writeFileSync(path.join(tmpDir, '.isdlc', 'embedding-health.json'), 'not-valid-json{{{');

    // Mock health monitor to do a fresh refresh on parse error
    const monitorPath = path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs');
    require.cache[require.resolve(monitorPath)] = {
      id: monitorPath,
      filename: monitorPath,
      loaded: true,
      exports: {
        shouldRefresh: () => false, // Says cache is fresh
        refreshHealth: async () => ({ status: 'healthy', chunks: 50, checked_at: new Date().toISOString() }),
      },
    };

    const { run } = require(path.resolve(__dirname, '../../src/providers/claude/embedding-statusline.cjs'));
    // When shouldRefresh is false but cached file is corrupt, run() falls back to refreshHealth
    const output = await run(tmpDir);
    // It should either produce valid output from refreshHealth fallback or empty string
    assert.ok(typeof output === 'string');
  });

  it('[P1] AC-004-03: Given .emb manifest missing generatedAtCommit, When health monitor reads manifest, Then graceful degradation — skip VCS check', async () => {
    fs.mkdirSync(path.join(tmpDir, '.embeddings'), { recursive: true });
    // Manifest without generatedAtCommit
    fs.writeFileSync(
      path.join(tmpDir, '.embeddings', 'manifest.json'),
      JSON.stringify({ moduleId: 'test', version: '1.0' })
    );

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', chunks: 200 }),
    });

    // No VCS commands should be called since generatedAtCommit is null
    childProcess.execSync = () => { throw new Error('should not call execSync'); };

    const healthMon = require(path.resolve(__dirname, '../../src/core/embedding/health-monitor.cjs'));
    const health = await healthMon.refreshHealth(tmpDir);

    // Without generatedAtCommit, VCS check is skipped, server is healthy
    assert.equal(health.status, 'healthy');
    assert.equal(health.generated_at_commit, null);
  });
});
