/**
 * Client-side port discovery and health check for embedding server.
 *
 * Reads server config from .isdlc/config.json and provides utilities
 * for clients (sessions, hooks, finalize steps) to verify server reachability.
 *
 * REQ-GH-224 FR-003, FR-004
 * @module lib/embedding/server/port-discovery
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default server config (used when .isdlc/config.json missing or has no embeddings section).
 */
const DEFAULT_SERVER = {
  port: 7777,
  host: 'localhost',
  auto_start: true,
  startup_timeout_ms: 30000,
};

/**
 * Read the embedding server config from .isdlc/config.json.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{host: string, port: number, auto_start: boolean, startup_timeout_ms: number}}
 */
export function getServerConfig(projectRoot) {
  const configPath = join(projectRoot, '.isdlc', 'config.json');

  if (!existsSync(configPath)) {
    return { ...DEFAULT_SERVER };
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    const serverConfig = config?.embeddings?.server || {};
    return {
      port: serverConfig.port || DEFAULT_SERVER.port,
      host: serverConfig.host || DEFAULT_SERVER.host,
      auto_start: serverConfig.auto_start ?? DEFAULT_SERVER.auto_start,
      startup_timeout_ms: serverConfig.startup_timeout_ms || DEFAULT_SERVER.startup_timeout_ms,
    };
  } catch {
    return { ...DEFAULT_SERVER };
  }
}

/**
 * Check if the embedding server is reachable via HTTP /health.
 * Never throws — returns boolean (fail-open).
 *
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<boolean>} True if server responds with 200
 */
export async function isServerReachable(host, port, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get full health information from the server.
 * Returns null if server is unreachable.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<object|null>}
 */
export async function getServerHealth(host, port, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wait for server to become reachable, polling at intervals.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=10000]
 * @param {number} [pollIntervalMs=200]
 * @returns {Promise<boolean>} True if reachable within timeout
 */
export async function waitForServer(host, port, timeoutMs = 10000, pollIntervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerReachable(host, port, 1000)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return false;
}
