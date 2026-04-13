/**
 * Embedding health monitor — HTTP probe + VCS staleness + atomic file write.
 *
 * Exports refreshHealth(projectRoot) and shouldRefresh(healthFilePath, intervalMinutes).
 * State resolution: missing → loading → offline → stale → healthy.
 * Writes atomically to .isdlc/embedding-health.json (tmp + rename).
 *
 * Fail-open (Article X): every external call is wrapped, failures degrade
 * to a valid health status, never throw.
 *
 * REQ-GH-244 FR-002, AC-002-01, AC-002-02, AC-002-04
 * @module src/core/embedding/health-monitor
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getCommitsBehind } = require('../vcs/staleness.cjs');

const HEALTH_FILE = 'embedding-health.json';
const GENERATION_LOCK = 'embedding-generation.lock';

/**
 * @typedef {Object} HealthResult
 * @property {"healthy"|"stale"|"offline"|"loading"|"missing"} status
 * @property {string} checked_at - ISO timestamp
 * @property {number|null} port
 * @property {number|null} chunks
 * @property {number|null} commits_behind
 * @property {number|null} files_changed
 * @property {"git"|"svn"|"unknown"} vcs
 * @property {string|null} generated_at_commit
 * @property {string|null} error
 */

/**
 * Read embedding server config from .isdlc/config.json.
 * @param {string} projectRoot
 * @returns {{ port: number, host: string }}
 */
function readServerConfig(projectRoot) {
  try {
    const configPath = path.join(projectRoot, '.isdlc', 'config.json');
    if (!fs.existsSync(configPath)) return { port: 7777, host: 'localhost' };
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      port: cfg?.embeddings?.server?.port || 7777,
      host: cfg?.embeddings?.server?.host || 'localhost',
    };
  } catch {
    return { port: 7777, host: 'localhost' };
  }
}

/**
 * Check if .emb directory/files exist.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function embFilesExist(projectRoot) {
  const embDir = path.join(projectRoot, '.embeddings');
  const embDirAlt = path.join(projectRoot, 'docs', '.embeddings');
  return fs.existsSync(embDir) || fs.existsSync(embDirAlt);
}

/**
 * Check if generation lock marker exists.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function generationLockExists(projectRoot) {
  return fs.existsSync(path.join(projectRoot, '.isdlc', GENERATION_LOCK));
}

/**
 * Read generatedAtCommit from .emb manifest.
 * @param {string} projectRoot
 * @returns {string|null}
 */
function readGeneratedAtCommit(projectRoot) {
  try {
    const manifestPath = path.join(projectRoot, '.embeddings', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.generatedAtCommit || null;
  } catch {
    return null;
  }
}

/**
 * Probe embedding server HTTP health endpoint.
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<{ok: boolean, chunks: number|null, error: string|null}>}
 */
async function probeServer(host, port, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, chunks: null, error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: true, chunks: body.chunks ?? body.chunk_count ?? null, error: null };
  } catch (err) {
    const errMsg = err.name === 'AbortError' ? 'timeout' : (err.message || 'connection failed');
    return { ok: false, chunks: null, error: errMsg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read previous health file.
 * @param {string} healthFilePath
 * @returns {HealthResult|null}
 */
function readPreviousHealth(healthFilePath) {
  try {
    if (!fs.existsSync(healthFilePath)) return null;
    return JSON.parse(fs.readFileSync(healthFilePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write health result atomically (tmp + rename).
 * @param {string} healthFilePath
 * @param {HealthResult} health
 */
function writeHealthAtomic(healthFilePath, health) {
  const tmpPath = healthFilePath + '.tmp';
  try {
    const dir = path.dirname(healthFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(health, null, 2));
    fs.renameSync(tmpPath, healthFilePath);
  } catch {
    // Fail-open: if we can't write, that's ok — next cycle will retry
  }
}

/**
 * Full health check: server probe + VCS staleness + file write.
 *
 * @param {string} projectRoot
 * @returns {Promise<HealthResult>}
 */
async function refreshHealth(projectRoot) {
  const healthFilePath = path.join(projectRoot, '.isdlc', HEALTH_FILE);
  const previous = readPreviousHealth(healthFilePath);

  // 1. Check .emb files exist
  if (!embFilesExist(projectRoot)) {
    const health = buildResult('missing', { port: null, chunks: null });
    logTransition(previous, health);
    writeHealthAtomic(healthFilePath, health);
    return health;
  }

  // 2. Check generation lock
  if (generationLockExists(projectRoot)) {
    const health = buildResult('loading', { port: null, chunks: null });
    logTransition(previous, health);
    writeHealthAtomic(healthFilePath, health);
    return health;
  }

  // 3. HTTP probe
  const { port, host } = readServerConfig(projectRoot);
  const probe = await probeServer(host, port);

  if (!probe.ok) {
    const health = buildResult('offline', { port, chunks: null, error: probe.error });
    logTransition(previous, health);
    writeHealthAtomic(healthFilePath, health);
    return health;
  }

  // 4. VCS staleness
  const generatedRef = readGeneratedAtCommit(projectRoot);
  let staleness = { commits_behind: null, files_changed: null, vcs: 'unknown', remote: null };
  if (generatedRef) {
    staleness = getCommitsBehind(generatedRef, projectRoot);
  }

  // 5. Determine status
  const isStale = (staleness.commits_behind != null && staleness.commits_behind > 0) ||
                  (staleness.files_changed != null && staleness.files_changed > 0);
  const status = isStale ? 'stale' : 'healthy';

  const health = buildResult(status, {
    port,
    chunks: probe.chunks,
    commits_behind: staleness.commits_behind,
    files_changed: staleness.files_changed,
    vcs: staleness.vcs,
    generated_at_commit: generatedRef,
  });

  logTransition(previous, health);
  writeHealthAtomic(healthFilePath, health);
  return health;
}

/**
 * Build a HealthResult object with defaults.
 * @param {string} status
 * @param {Object} fields
 * @returns {HealthResult}
 */
function buildResult(status, fields = {}) {
  return {
    status,
    checked_at: new Date().toISOString(),
    port: fields.port ?? null,
    chunks: fields.chunks ?? null,
    commits_behind: fields.commits_behind ?? null,
    files_changed: fields.files_changed ?? null,
    vcs: fields.vcs ?? 'unknown',
    generated_at_commit: fields.generated_at_commit ?? null,
    error: fields.error ?? null,
  };
}

/**
 * Log status transitions to stderr.
 * @param {HealthResult|null} previous
 * @param {HealthResult} current
 */
function logTransition(previous, current) {
  if (previous && previous.status !== current.status) {
    process.stderr.write(`[embedding] status: ${previous.status} -> ${current.status}\n`);
  }
}

/**
 * Check if health file needs refresh based on interval.
 *
 * @param {string} healthFilePath
 * @param {number} intervalMinutes - Refresh interval in minutes
 * @returns {boolean} true if refresh is needed
 */
function shouldRefresh(healthFilePath, intervalMinutes) {
  try {
    if (!fs.existsSync(healthFilePath)) return true;
    const data = JSON.parse(fs.readFileSync(healthFilePath, 'utf8'));
    if (!data.checked_at) return true;
    const checkedAt = new Date(data.checked_at).getTime();
    const now = Date.now();
    return (now - checkedAt) >= (intervalMinutes * 60 * 1000);
  } catch {
    return true;
  }
}

module.exports = { refreshHealth, shouldRefresh };
