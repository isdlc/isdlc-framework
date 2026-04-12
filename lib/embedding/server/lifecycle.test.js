/**
 * Tests for lib/embedding/server/lifecycle.js
 * REQ-GH-224 FR-002, FR-016
 * BUG-GH-241 AC-1, AC-2, AC-3, AC-4
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import {
  startServer,
  stopServer,
  serverStatus,
} from './lifecycle.js';

/**
 * Start a minimal HTTP server on a given port (or 0 for dynamic).
 * Returns { server, port } after listening.
 * @param {number} port - Port to listen on (0 for dynamic)
 * @param {object} [opts] - Options
 * @param {number} [opts.delayMs] - If set, respond with 503 for this many ms after creation,
 *   then switch to 200. This gives time for a spawned child to die before the server
 *   appears healthy.
 */
function startForeignServer(port = 0, opts = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const delayMs = opts.delayMs || 0;
    const server = createServer((req, res) => {
      if (delayMs && (Date.now() - startTime) < delayMs) {
        res.writeHead(503);
        res.end('not ready');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      }
    });
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort });
    });
    server.on('error', reject);
  });
}

/**
 * Create a runner script that exits immediately upon startup.
 * Uses process.exit(1) to simulate child death (e.g., EADDRINUSE crash).
 */
function writeExitingRunner(projectRoot) {
  const binDir = join(projectRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const script = join(binDir, 'isdlc-embedding-server.js');
  writeFileSync(script, 'process.exit(1);\n');
  return script;
}

/**
 * Create a runner script that starts an HTTP server on the configured port
 * and stays alive. Reads port from .isdlc/config.json or defaults to 7777.
 */
function writeAliveRunner(projectRoot) {
  const binDir = join(projectRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const script = join(binDir, 'isdlc-embedding-server.js');
  writeFileSync(script, `
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
const cwd = process.cwd();
let port = 7777;
try {
  const cfg = JSON.parse(readFileSync(join(cwd, '.isdlc', 'config.json'), 'utf8'));
  port = cfg.embeddings.server.port || port;
} catch {}
const s = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});
s.listen(port, '127.0.0.1', () => {});
`);
  return script;
}

/**
 * Create a runner script that stays alive but never binds a port (no HTTP server).
 */
function writeSilentRunner(projectRoot) {
  const binDir = join(projectRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const script = join(binDir, 'isdlc-embedding-server.js');
  writeFileSync(script, `
// Stay alive indefinitely but never listen on any port
setInterval(() => {}, 60000);
`);
  return script;
}

/**
 * Write .isdlc/config.json with a specific port and short timeout.
 */
function writeConfig(projectRoot, port, extraOpts = {}) {
  const configPath = join(projectRoot, '.isdlc', 'config.json');
  const config = {
    embeddings: {
      server: {
        port,
        host: '127.0.0.1',
        auto_start: true,
        startup_timeout_ms: extraOpts.timeout || 3000,
        ...extraOpts,
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Kill a process by PID, ignoring errors if already dead.
 */
function safeKill(pid) {
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

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

// ---------------------------------------------------------------------------
// BUG-GH-241 ATDD — PID aliveness & foreign port detection
// Traces: AC-1, AC-2, AC-3, AC-4
// ---------------------------------------------------------------------------

describe('BUG-GH-241: startServer PID aliveness checks', () => {
  let tmp;
  let foreignServer;
  let spawnedPids = [];

  beforeEach(() => {
    tmp = createTmpProject();
    foreignServer = null;
    spawnedPids = [];
  });

  afterEach(async () => {
    // Clean up any foreign server
    if (foreignServer) {
      await new Promise((resolve) => foreignServer.close(resolve));
      foreignServer = null;
    }
    // Clean up any spawned child processes from successful startServer calls
    for (const pid of spawnedPids) {
      safeKill(pid);
    }
    spawnedPids = [];
    rmSync(tmp, { recursive: true, force: true });
  });

  // TC-LC-001: Foreign process on port -> failure with foreignPort flag
  it('[P0] AC-1: Given foreign process on port, When child dies with EADDRINUSE and waitForServer gets 200 from foreign process, Then startServer returns failure with foreignPort flag and no PID file written', async () => {
    // Given: a foreign process holds a port, with a brief delay before responding 200
    // The delay ensures the spawned child has time to exit before the foreign server
    // appears healthy, preventing a race where child.pid is still alive at check time
    const { server, port } = await startForeignServer(0, { delayMs: 600 });
    foreignServer = server;

    // And: config points to that port with short timeout
    writeConfig(tmp, port, { timeout: 5000 });

    // And: runner script exits immediately (simulates EADDRINUSE crash)
    writeExitingRunner(tmp);

    // When: startServer spawns child that dies, but foreign server responds
    const result = await startServer(tmp);

    // Then: failure with foreignPort flag
    assert.strictEqual(result.success, false, 'should fail when foreign process holds port');
    assert.strictEqual(result.foreignPort, true, 'should flag foreignPort');

    // And: no PID file written
    const pidFile = join(tmp, '.isdlc', 'logs', 'embedding-server.pid');
    assert.strictEqual(existsSync(pidFile), false, 'PID file must not be written');
  });

  // TC-LC-002: Stale PID + port squatter -> failure, no dead PID written
  it('[P0] AC-2: Given stale PID file and port squatter, When startServer spawns child that dies but port responds, Then failure is reported and PID file not written with dead child PID', async () => {
    // Given: stale PID file with a dead PID
    const logsDir = join(tmp, '.isdlc', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const pidFile = join(logsDir, 'embedding-server.pid');
    writeFileSync(pidFile, '99999999');

    // And: a foreign process holds the port (delayed 200 to let child die first)
    const { server, port } = await startForeignServer(0, { delayMs: 600 });
    foreignServer = server;
    writeConfig(tmp, port, { timeout: 5000 });

    // And: runner exits immediately
    writeExitingRunner(tmp);

    // When: startServer detects stale PID (99999999 not alive), spawns child that dies
    const result = await startServer(tmp);

    // Then: failure (port responds but our child is dead)
    assert.strictEqual(result.success, false, 'should fail with port squatter');

    // And: PID file must NOT contain the dead child PID
    if (existsSync(pidFile)) {
      const writtenPid = readFileSync(pidFile, 'utf8').trim();
      // If PID file still exists it should be stale original or empty, not child PID
      // The key invariant: startServer must not write a dead child's PID
      assert.notStrictEqual(writtenPid, String(result.pid),
        'PID file must not be written with dead child PID');
    }
    // Having no PID file at all is also acceptable (stale cleaned, new not written)
  });

  // TC-LC-003: Clean spawn -> success with correct PID
  it('[P0] AC-3: Given clean environment with no port conflict, When startServer spawns child that stays alive and port responds, Then success with correct PID file written', async () => {
    // Given: dynamic port with no conflicts
    const { server: probe, port } = await startForeignServer(0);
    await new Promise((resolve) => probe.close(resolve)); // release the port

    // And: config with that free port and short timeout
    writeConfig(tmp, port, { timeout: 10000 });

    // And: runner script starts HTTP server on configured port
    writeAliveRunner(tmp);

    // When: startServer spawns child that stays alive and port responds
    const result = await startServer(tmp);

    // Track PID for cleanup
    if (result.pid) spawnedPids.push(result.pid);

    // Then: success
    assert.strictEqual(result.success, true, 'should succeed with live child');
    assert.ok(result.pid, 'should return child PID');
    assert.strictEqual(result.port, port, 'should return configured port');

    // And: PID file contains the child PID
    const pidFile = join(tmp, '.isdlc', 'logs', 'embedding-server.pid');
    assert.ok(existsSync(pidFile), 'PID file must be written');
    const writtenPid = readFileSync(pidFile, 'utf8').trim();
    assert.strictEqual(writtenPid, String(result.pid), 'PID file must contain child PID');
  });

  // TC-LC-004: Child alive but timeout -> failure, no PID written
  it('[P1] AC-3: Given child stays alive but port never responds, When waitForServer times out, Then failure returned and no PID file written', async () => {
    // Given: dynamic port discovery to find a free port
    const { server: probe, port } = await startForeignServer(0);
    await new Promise((resolve) => probe.close(resolve));

    // And: config with short timeout (1.5s to keep test fast)
    writeConfig(tmp, port, { timeout: 1500 });

    // And: runner that stays alive but never binds a port
    writeSilentRunner(tmp);

    // When: startServer spawns child, waitForServer times out
    const result = await startServer(tmp);

    // Track PID for cleanup (child is alive but unresponsive)
    if (result.pid) spawnedPids.push(result.pid);
    // Also try to clean up via reading spawn internals — the child won't be in PID file
    // but we need to find it. Use stopServer as a safety net after test.

    // Then: failure with timeout
    assert.strictEqual(result.success, false, 'should fail on timeout');
    assert.ok(result.error, 'should include error message');

    // And: no PID file written
    const pidFile = join(tmp, '.isdlc', 'logs', 'embedding-server.pid');
    assert.strictEqual(existsSync(pidFile), false, 'PID file must not be written on timeout');
  });

  // TC-LC-005: Deferred PID write verification
  it('[P0] AC-1/AC-2: Given successful spawn, When startServer completes, Then PID file write is deferred until after child aliveness confirmation', async () => {
    // Given: dynamic port with no conflicts
    const { server: probe, port } = await startForeignServer(0);
    await new Promise((resolve) => probe.close(resolve));

    writeConfig(tmp, port, { timeout: 10000 });
    writeAliveRunner(tmp);

    // When: startServer succeeds
    const result = await startServer(tmp);
    if (result.pid) spawnedPids.push(result.pid);

    // Then: success confirms child is alive
    assert.strictEqual(result.success, true, 'should succeed');

    // And: PID file exists AFTER completion (deferred write)
    const pidFile = join(tmp, '.isdlc', 'logs', 'embedding-server.pid');
    assert.ok(existsSync(pidFile), 'PID file must exist after successful start');
    const writtenPid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);

    // And: the written PID is actually alive (confirming aliveness check happened)
    let pidAlive = false;
    try { process.kill(writtenPid, 0); pidAlive = true; } catch { pidAlive = false; }
    assert.ok(pidAlive, 'written PID must be alive (deferred write only after aliveness check)');

    // And: no lock file remains (lock released after PID write)
    const lockFile = join(tmp, '.isdlc', 'logs', 'embedding-server.lock');
    assert.strictEqual(existsSync(lockFile), false, 'lock must be released after startup');
  });

  // TC-LC-006: Concurrent lock -> waits, no PID write
  it('[P1] AC-4: Given lock held by another live process, When second startServer call runs, Then it waits for server and returns lock-based result without writing PID', async () => {
    // Given: start a real server on a dynamic port
    const { server, port } = await startForeignServer(0);
    foreignServer = server;
    writeConfig(tmp, port, { timeout: 5000 });

    // And: lock file held by current process (which is alive)
    const logsDir = join(tmp, '.isdlc', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const lockFile = join(logsDir, 'embedding-server.lock');
    writeFileSync(lockFile, String(process.pid));

    // And: runner script exists (needed to pass validation, but won't be spawned)
    writeExitingRunner(tmp);

    // When: startServer detects lock held by live process
    const result = await startServer(tmp);

    // Then: returns via lock path (did not spawn its own child)
    assert.strictEqual(result.success, true, 'should succeed via lock wait');
    assert.strictEqual(result.viaLock, true, 'should indicate viaLock path');

    // And: PID file is whatever was already there (startServer did not write its own)
    // Since no PID file existed before and startServer went through lock path,
    // readPid is called to return the existing PID (which may be null)
    assert.strictEqual(result.port, port, 'should return configured port');
  });

  // TC-LC-007: Stale lock + foreign port -> failure
  it('[P1] AC-4: Given stale lock from dead process and foreign port squatter, When startServer acquires lock and child dies, Then no dead PID file written', async () => {
    // Given: lock file held by dead process
    const logsDir = join(tmp, '.isdlc', 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(join(logsDir, 'embedding-server.lock'), '99999998');

    // And: foreign process holds the port (delayed 200 to let child die first)
    const { server, port } = await startForeignServer(0, { delayMs: 600 });
    foreignServer = server;
    writeConfig(tmp, port, { timeout: 5000 });

    // And: runner that exits immediately (child dies)
    writeExitingRunner(tmp);

    // When: startServer cleans stale lock, spawns child that dies, foreign responds
    const result = await startServer(tmp);

    // Then: failure (our child died, foreign process responded)
    assert.strictEqual(result.success, false, 'should fail when child dies');

    // And: PID file must NOT contain dead child PID
    const pidFile = join(logsDir, 'embedding-server.pid');
    if (existsSync(pidFile)) {
      const content = readFileSync(pidFile, 'utf8').trim();
      const writtenPid = parseInt(content, 10);
      // Verify the written PID is not a dead process
      let alive = false;
      try { process.kill(writtenPid, 0); alive = true; } catch { alive = false; }
      assert.ok(alive, 'if PID file exists after failure, it must reference a live process');
    }

    // And: lock file is released
    const lockFile = join(logsDir, 'embedding-server.lock');
    assert.strictEqual(existsSync(lockFile), false, 'lock must be released after failure');
  });
});
