/**
 * Daemon lifecycle management for the embedding server.
 *
 * Handles:
 *   - startServer(): spawn detached node process, PID+lock+log files
 *   - stopServer(): SIGTERM + wait for exit
 *   - serverStatus(): check PID alive + ping /health
 *   - restartServer(): stop + start
 *   - Lock file coordination: prevents concurrent startup races
 *
 * Runtime files in .isdlc/logs/:
 *   - embedding-server.pid   (process ID)
 *   - embedding-server.lock  (acquired during startup only)
 *   - embedding-server.log   (stdout + stderr)
 *
 * REQ-GH-224 FR-002, FR-016
 * @module lib/embedding/server/lifecycle
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getServerConfig, isServerReachable, waitForServer, getServerHealth } from './port-discovery.js';

const LOCK_TIMEOUT_MS = 30000;

/**
 * Get paths to runtime files.
 */
function runtimePaths(projectRoot) {
  const logsDir = join(projectRoot, '.isdlc', 'logs');
  return {
    logsDir,
    pidFile: join(logsDir, 'embedding-server.pid'),
    lockFile: join(logsDir, 'embedding-server.lock'),
    logFile: join(logsDir, 'embedding-server.log'),
  };
}

/**
 * Ensure logs directory exists.
 */
function ensureLogsDir(projectRoot) {
  const { logsDir } = runtimePaths(projectRoot);
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

/**
 * Check if a PID is alive.
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read PID from file.
 */
function readPid(pidFile) {
  try {
    if (!existsSync(pidFile)) return null;
    const content = readFileSync(pidFile, 'utf8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Acquire startup lock. Returns true if acquired, false if already held.
 * Cleans up stale locks (holder PID not alive).
 */
function acquireLock(lockFile) {
  try {
    if (existsSync(lockFile)) {
      const content = readFileSync(lockFile, 'utf8').trim();
      const holderPid = parseInt(content, 10);
      if (!isNaN(holderPid) && isPidAlive(holderPid)) {
        return false; // Lock held by live process
      }
      // Stale lock - remove it
      try { unlinkSync(lockFile); } catch {}
    }
    writeFileSync(lockFile, String(process.pid));
    return true;
  } catch {
    return false;
  }
}

/**
 * Release startup lock.
 */
function releaseLock(lockFile) {
  try {
    if (existsSync(lockFile)) unlinkSync(lockFile);
  } catch {}
}

/**
 * Start the embedding server as a detached background process.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {Promise<{success: boolean, pid?: number, port?: number, error?: string}>}
 */
export async function startServer(projectRoot) {
  const config = getServerConfig(projectRoot);
  const paths = runtimePaths(projectRoot);

  // Check if already running
  const existingPid = readPid(paths.pidFile);
  if (existingPid && isPidAlive(existingPid)) {
    const reachable = await isServerReachable(config.host, config.port, 2000);
    if (reachable) {
      return { success: true, pid: existingPid, port: config.port, alreadyRunning: true };
    }
    // PID alive but not responding — might be starting up
  }

  ensureLogsDir(projectRoot);

  // Acquire startup lock
  if (!acquireLock(paths.lockFile)) {
    // Another process is starting — wait for server to become reachable
    const reachable = await waitForServer(config.host, config.port, LOCK_TIMEOUT_MS, 500);
    if (reachable) {
      return { success: true, pid: readPid(paths.pidFile), port: config.port, viaLock: true };
    }
    return { success: false, error: 'another process holds startup lock but server not reachable' };
  }

  try {
    // Resolve runner script
    const runnerScript = resolve(projectRoot, 'bin', 'isdlc-embedding-server.js');
    if (!existsSync(runnerScript)) {
      releaseLock(paths.lockFile);
      return { success: false, error: `runner script not found: ${runnerScript}` };
    }

    // Open log file for append
    const logFd = openSync(paths.logFile, 'a');

    // Spawn detached child process
    const child = spawn('node', [runnerScript], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: projectRoot,
      env: { ...process.env },
    });

    // Let child run independently (PID file deferred until aliveness confirmed)
    child.unref();
    closeSync(logFd);

    // Wait for server to be reachable
    const reachable = await waitForServer(
      config.host,
      config.port,
      config.startup_timeout_ms || 30000,
      300
    );

    if (reachable) {
      // Verify our child is actually alive (not a foreign process responding)
      let childAlive = false;
      try { process.kill(child.pid, 0); childAlive = true; } catch { childAlive = false; }

      if (childAlive) {
        // Our child is alive and port responds — write PID file now
        writeFileSync(paths.pidFile, String(child.pid));
        releaseLock(paths.lockFile);
        return { success: true, pid: child.pid, port: config.port };
      } else {
        // Child died but something else is serving the port
        releaseLock(paths.lockFile);
        return { success: false, error: 'port bound by foreign process', foreignPort: true };
      }
    }

    releaseLock(paths.lockFile);
    return { success: false, error: `server did not respond within ${config.startup_timeout_ms || 30000}ms` };
  } catch (err) {
    releaseLock(paths.lockFile);
    return { success: false, error: err.message };
  }
}

/**
 * Stop the server by sending SIGTERM to the PID.
 *
 * @param {string} projectRoot
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function stopServer(projectRoot) {
  const paths = runtimePaths(projectRoot);
  const pid = readPid(paths.pidFile);

  if (!pid) {
    return { success: false, error: 'no PID file found' };
  }

  if (!isPidAlive(pid)) {
    try { unlinkSync(paths.pidFile); } catch {}
    return { success: true, alreadyStopped: true };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    return { success: false, error: `kill failed: ${err.message}` };
  }

  // Wait for process to exit
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      try { unlinkSync(paths.pidFile); } catch {}
      return { success: true };
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Force kill
  try { process.kill(pid, 'SIGKILL'); } catch {}
  try { unlinkSync(paths.pidFile); } catch {}
  return { success: true, forced: true };
}

/**
 * Get server status (running, pid, port, health).
 *
 * @param {string} projectRoot
 * @returns {Promise<{running: boolean, pid?: number, port?: number, health?: object}>}
 */
export async function serverStatus(projectRoot) {
  const config = getServerConfig(projectRoot);
  const paths = runtimePaths(projectRoot);
  const pid = readPid(paths.pidFile);

  if (!pid) {
    return { running: false, reason: 'no PID file' };
  }

  if (!isPidAlive(pid)) {
    return { running: false, pid, reason: 'PID not alive' };
  }

  const health = await getServerHealth(config.host, config.port);
  if (!health) {
    return { running: true, pid, port: config.port, responsive: false };
  }

  return {
    running: true,
    pid,
    port: config.port,
    responsive: true,
    health,
  };
}

/**
 * Restart the server (stop + start).
 */
export async function restartServer(projectRoot) {
  await stopServer(projectRoot);
  await new Promise(r => setTimeout(r, 500)); // Brief pause
  return startServer(projectRoot);
}
