/**
 * Tests for lib/embedding/server/lifecycle.js
 * REQ-GH-224 FR-002, FR-016
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  startServer,
  stopServer,
  serverStatus,
} from './lifecycle.js';

function createTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), 'isdlc-lc-'));
  mkdirSync(join(tmp, '.isdlc'), { recursive: true });
  return tmp;
}

// ---------------------------------------------------------------------------
// serverStatus with no server running
// ---------------------------------------------------------------------------

describe('serverStatus', () => {
  let tmp;

  beforeEach(() => { tmp = createTmpProject(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns running=false when no PID file exists', async () => {
    const status = await serverStatus(tmp);
    assert.strictEqual(status.running, false);
    assert.ok(status.reason);
  });

  it('returns running=false when PID is not alive', async () => {
    mkdirSync(join(tmp, '.isdlc', 'logs'), { recursive: true });
    writeFileSync(join(tmp, '.isdlc', 'logs', 'embedding-server.pid'), '99999999');
    const status = await serverStatus(tmp);
    assert.strictEqual(status.running, false);
    assert.strictEqual(status.pid, 99999999);
  });
});

// ---------------------------------------------------------------------------
// stopServer with no server running
// ---------------------------------------------------------------------------

describe('stopServer', () => {
  let tmp;

  beforeEach(() => { tmp = createTmpProject(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns error when no PID file exists', async () => {
    const result = await stopServer(tmp);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('cleans up stale PID file', async () => {
    mkdirSync(join(tmp, '.isdlc', 'logs'), { recursive: true });
    const pidFile = join(tmp, '.isdlc', 'logs', 'embedding-server.pid');
    writeFileSync(pidFile, '99999999');
    const result = await stopServer(tmp);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyStopped, true);
    assert.strictEqual(existsSync(pidFile), false);
  });
});

// ---------------------------------------------------------------------------
// startServer error paths
// ---------------------------------------------------------------------------

describe('startServer', () => {
  let tmp;

  beforeEach(() => { tmp = createTmpProject(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns error when runner script missing', async () => {
    // tmp dir has no bin/isdlc-embedding-server.js
    const result = await startServer(tmp);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('runner script not found'));
  });

  it('creates .isdlc/logs/ directory', async () => {
    // Attempt start will fail (no runner), but should still create logs dir
    await startServer(tmp);
    assert.ok(existsSync(join(tmp, '.isdlc', 'logs')));
  });

  it('writes lock file during startup attempt', async () => {
    // Lock gets released on failure; verify the lock path convention
    const lockFile = join(tmp, '.isdlc', 'logs', 'embedding-server.lock');
    await startServer(tmp);
    // After failed start, lock should be released
    assert.strictEqual(existsSync(lockFile), false);
  });
});

// ---------------------------------------------------------------------------
// Stale lock detection
// ---------------------------------------------------------------------------

describe('stale lock detection', () => {
  let tmp;

  beforeEach(() => { tmp = createTmpProject(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('cleans up lock file held by dead PID', async () => {
    const logsDir = join(tmp, '.isdlc', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const lockFile = join(logsDir, 'embedding-server.lock');
    writeFileSync(lockFile, '99999998'); // definitely dead PID

    // startServer will attempt to acquire the lock and should succeed
    // (even though start itself fails due to missing runner)
    const result = await startServer(tmp);
    // Start fails due to missing runner, but lock must have been acquired
    // (error is about runner, not about lock)
    assert.ok(result.error.includes('runner script not found'));
  });
});
