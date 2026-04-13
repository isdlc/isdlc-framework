/**
 * Unit tests for embedding health monitor
 * REQ-GH-244 FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-002-05
 *
 * Mocks HTTP fetch and VCS staleness to test state resolution, transitions,
 * and atomic file writes in isolation.
 *
 * Test commands:
 *   node --test src/core/embedding/health-monitor.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('embedding health monitor', () => {
  let tmpDir;
  let originalFetch;
  let staleMod;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-monitor-test-'));
    fs.mkdirSync(path.join(tmpDir, '.isdlc'), { recursive: true });
    // Save original fetch
    originalFetch = global.fetch;
    // Clear require cache for fresh module load each test
    clearModuleCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    clearModuleCache();
  });

  function clearModuleCache() {
    const monitorPath = require.resolve('./health-monitor.cjs');
    const stalenessPath = require.resolve('../vcs/staleness.cjs');
    delete require.cache[monitorPath];
    delete require.cache[stalenessPath];
  }

  /**
   * Helper: set up .embeddings dir so embFilesExist returns true.
   */
  function createEmbDir() {
    fs.mkdirSync(path.join(tmpDir, '.embeddings'), { recursive: true });
  }

  /**
   * Helper: write a manifest with generatedAtCommit.
   */
  function writeManifest(commit) {
    const dir = path.join(tmpDir, '.embeddings');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ generatedAtCommit: commit }));
  }

  /**
   * Helper: mock fetch for health endpoint.
   */
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

  /**
   * Helper: mock VCS staleness module.
   */
  function mockStaleness(result) {
    const stalenessPath = require.resolve('../vcs/staleness.cjs');
    require.cache[stalenessPath] = {
      id: stalenessPath,
      filename: stalenessPath,
      loaded: true,
      exports: {
        getCommitsBehind: () => result,
      },
    };
  }

  /**
   * Helper: write config with specific port.
   */
  function writeConfig(config) {
    fs.writeFileSync(path.join(tmpDir, '.isdlc', 'config.json'), JSON.stringify(config));
  }

  /**
   * Helper: write a previous health file.
   */
  function writePreviousHealth(health) {
    fs.writeFileSync(path.join(tmpDir, '.isdlc', 'embedding-health.json'), JSON.stringify(health));
  }

  // ---- P0 Tests (Critical) ----

  it('[P0] AC-002-01: Given server healthy and embeddings fresh, When refreshHealth() is called, Then health file shows status "healthy" with chunk count and port', async () => {
    createEmbDir();
    writeManifest('abc123');
    writeConfig({ embeddings: { server: { port: 8888 } } });
    mockFetch({ ok: true, body: { status: 'ok', chunks: 19811 } });
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'git', remote: 'origin/main', error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    assert.equal(result.status, 'healthy');
    assert.equal(result.chunks, 19811);
    assert.equal(result.port, 8888);
    assert.equal(result.commits_behind, 0);
    assert.equal(result.files_changed, 0);

    // Verify file was written
    const filePath = path.join(tmpDir, '.isdlc', 'embedding-health.json');
    assert.ok(fs.existsSync(filePath));
    const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(written.status, 'healthy');
  });

  it('[P0] AC-002-02: Given server goes down between checks, When next refreshHealth() is called, Then health file updates to "offline" and transition is logged', async () => {
    createEmbDir();
    writeManifest('abc123');
    // Write previous healthy state
    writePreviousHealth({ status: 'healthy', checked_at: new Date().toISOString() });
    mockFetch(new Error('ECONNREFUSED'));
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'git', remote: null, error: null });

    // Capture stderr
    const stderrChunks = [];
    const origWrite = process.stderr.write;
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    process.stderr.write = origWrite;

    assert.equal(result.status, 'offline');
    const stderrOutput = stderrChunks.join('');
    assert.ok(stderrOutput.includes('healthy -> offline'), `Expected transition log, got: ${stderrOutput}`);
  });

  it('[P0] AC-002-04: Given health probe fails with timeout, When refreshHealth() is called, Then health file shows "offline" with error and never crashes', async () => {
    createEmbDir();
    writeManifest('abc123');
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    mockFetch(abortErr);
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'git', remote: null, error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    assert.equal(result.status, 'offline');
    assert.equal(result.error, 'timeout');
  });

  it('[P0] Given no .emb files exist in project, When refreshHealth() is called, Then returns status "missing"', async () => {
    // No .embeddings directory created
    mockFetch({ ok: true, body: { status: 'ok' } });
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'unknown', remote: null, error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    assert.equal(result.status, 'missing');
  });

  it('[P0] Given generation lock marker exists, When refreshHealth() is called, Then returns status "loading"', async () => {
    createEmbDir();
    // Create generation lock
    fs.writeFileSync(path.join(tmpDir, '.isdlc', 'embedding-generation.lock'), '');
    mockFetch({ ok: true, body: { status: 'ok' } });
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'unknown', remote: null, error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    assert.equal(result.status, 'loading');
  });

  // ---- P1 Tests (High) ----

  it('[P1] AC-002-03: Given health_check_interval_minutes set to 2, When shouldRefresh() is called, Then uses 2-minute threshold', () => {
    const healthPath = path.join(tmpDir, '.isdlc', 'embedding-health.json');

    // Health file checked 1 minute ago
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    fs.writeFileSync(healthPath, JSON.stringify({ status: 'healthy', checked_at: oneMinAgo }));

    const { shouldRefresh } = require('./health-monitor.cjs');

    // Within 2-minute window → should NOT refresh
    assert.equal(shouldRefresh(healthPath, 2), false);

    // Health file checked 3 minutes ago
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    fs.writeFileSync(healthPath, JSON.stringify({ status: 'healthy', checked_at: threeMinAgo }));

    // Clear cache and reload
    clearModuleCache();
    const { shouldRefresh: shouldRefresh2 } = require('./health-monitor.cjs');
    assert.equal(shouldRefresh2(healthPath, 2), true);
  });

  it('[P1] Given server responds but commits_behind > 0, When refreshHealth() is called, Then status is "stale" with commits_behind value', async () => {
    createEmbDir();
    writeManifest('abc123');
    mockFetch({ ok: true, body: { status: 'ok', chunks: 100 } });
    mockStaleness({ commits_behind: 5, files_changed: 0, vcs: 'git', remote: 'origin/main', error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    assert.equal(result.status, 'stale');
    assert.equal(result.commits_behind, 5);
  });

  it('[P1] Given server responds but files_changed > 0, When refreshHealth() is called, Then status is "stale" with files_changed value', async () => {
    createEmbDir();
    writeManifest('abc123');
    mockFetch({ ok: true, body: { status: 'ok', chunks: 100 } });
    mockStaleness({ commits_behind: 0, files_changed: 3, vcs: 'git', remote: 'origin/main', error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    const result = await refreshHealth(tmpDir);

    assert.equal(result.status, 'stale');
    assert.equal(result.files_changed, 3);
  });

  it('[P1] AC-002-02: Given previous status "healthy" and new status "offline", When refreshHealth() writes file, Then transition is logged to stderr', async () => {
    createEmbDir();
    writeManifest('abc123');
    writePreviousHealth({ status: 'healthy', checked_at: new Date().toISOString() });
    mockFetch(new Error('ECONNREFUSED'));
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'git', remote: null, error: null });

    const stderrChunks = [];
    const origWrite = process.stderr.write;
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

    const { refreshHealth } = require('./health-monitor.cjs');
    await refreshHealth(tmpDir);

    process.stderr.write = origWrite;

    const stderrOutput = stderrChunks.join('');
    assert.ok(stderrOutput.includes('[embedding] status: healthy -> offline'));
  });

  // ---- P2 Tests (Medium) ----

  it('[P2] AC-002-05: Given health file exists, When tool-router reads it, Then it gets the same structured schema for routing decisions', async () => {
    createEmbDir();
    writeManifest('abc123');
    mockFetch({ ok: true, body: { status: 'ok', chunks: 500 } });
    mockStaleness({ commits_behind: 0, files_changed: 0, vcs: 'git', remote: 'origin/main', error: null });

    const { refreshHealth } = require('./health-monitor.cjs');
    await refreshHealth(tmpDir);

    const filePath = path.join(tmpDir, '.isdlc', 'embedding-health.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Verify all schema fields exist
    assert.ok('status' in data);
    assert.ok('checked_at' in data);
    assert.ok('port' in data);
    assert.ok('chunks' in data);
    assert.ok('commits_behind' in data);
    assert.ok('files_changed' in data);
    assert.ok('vcs' in data);
    assert.ok('generated_at_commit' in data);
    assert.ok('error' in data);
  });
});
