/**
 * F0009 handler: refresh code embeddings as part of build finalize.
 *
 * Contract (REQ-GH-239):
 *  - Opt-in via presence of `embeddings` in raw .isdlc/config.json (FR-006)
 *  - Respects embeddings.refresh_on_finalize (FR-007; default true)
 *  - First-time bootstrap safe: never spawns the multi-hour generate on an
 *    empty project — emits a one-line banner instead (FR-008)
 *  - Spawns `node bin/isdlc-embedding.js generate . --incremental` when all
 *    preconditions are met
 *  - Forwards child stdout/stderr with `[F0009] ` line prefix (FR-007)
 *  - POSTs /reload to the running embedding server on success, auto-starting
 *    the server if it is unreachable (best-effort) (FR-007)
 *  - NEVER throws — every failure path returns a RefreshResult (NFR-006)
 *
 * Traces: FR-006, FR-007, FR-008, NFR-006,
 *         ERR-F0009-001, ERR-F0009-002, ERR-F0009-003
 *
 * @module src/core/finalize/refresh-code-embeddings
 */

import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { hasUserEmbeddingsConfig, readProjectConfig } from '../config/config-service.js';

/**
 * @typedef {Object} RefreshResult
 * @property {'skipped'|'bootstrap_needed'|'success'|'failed'|'partial'} status
 * @property {string}  [reason]         - Human-readable reason
 * @property {number}  [durationMs]     - Total wall-clock duration
 * @property {number}  [chunksProcessed]- Parsed from child stdout on success
 * @property {boolean} [serverReloaded] - True iff POST /reload succeeded
 * @property {boolean} [reload_failed]  - True iff POST /reload failed
 * @property {string}  [stderr]         - Tail of child stderr on failure
 */

/**
 * The exact one-line bootstrap banner emitted when there's no .emb package.
 * Kept as a named export so tests can assert on the exact string without
 * duplicating the literal.
 *
 * REQ-GH-239 FR-008.
 */
export const BOOTSTRAP_BANNER =
  "F0009 Code embeddings: skipped \u2014 run 'isdlc-embedding generate .' manually to bootstrap (one-time ~30-60 min)";

const STDERR_TAIL_BYTES = 4096;

/**
 * Wrap an async callback in a try/catch that never rethrows. Used to keep
 * the fail-open guarantee of refreshCodeEmbeddings: any internal surprise
 * yields a `{ status: 'failed', reason }` object rather than a rejection.
 *
 * @param {() => Promise<RefreshResult>} fn
 * @returns {Promise<RefreshResult>}
 */
async function neverThrow(fn) {
  try {
    return await fn();
  } catch (err) {
    return {
      status: 'failed',
      reason: err && err.message ? err.message : 'unknown error',
    };
  }
}

/**
 * Create a simple line-splitter that calls `onLine(line)` for each complete
 * line read from a stream-of-chunks. Partial trailing lines are buffered
 * until the next chunk (or a final flush on `close`).
 *
 * @param {(line: string) => void} onLine
 * @returns {{ feed: (chunk: string|Buffer) => void, flush: () => void }}
 */
function createLineSplitter(onLine) {
  let buf = '';
  return {
    feed(chunk) {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        onLine(line);
      }
    },
    flush() {
      if (buf.length > 0) {
        onLine(buf);
        buf = '';
      }
    },
  };
}

/**
 * Detect whether the project has at least one `.emb` package on disk.
 * Looks at `docs/.embeddings/`. Any non-existence / unreadable directory
 * counts as "no package" (fail-safe).
 *
 * @param {string} projectRoot
 * @param {typeof fs} _fs
 * @returns {boolean}
 */
function hasEmbPackage(projectRoot, _fs) {
  try {
    const dir = path.join(projectRoot, 'docs', '.embeddings');
    if (!_fs.existsSync(dir)) return false;
    const entries = _fs.readdirSync(dir);
    return entries.some(name => name.endsWith('.emb'));
  } catch {
    return false;
  }
}

/**
 * POST {} to /reload on the embedding server. Returns true on 2xx, false
 * on any other response or network error. Never throws.
 *
 * @param {number} port
 * @param {string} host
 * @param {typeof fetch} _fetch
 * @returns {Promise<{ ok: boolean, refused: boolean, error?: string }>}
 */
async function postReload(port, host, _fetch) {
  try {
    const res = await _fetch(`http://${host}:${port}/reload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (res && typeof res.status === 'number' && res.status >= 200 && res.status < 300) {
      return { ok: true, refused: false };
    }
    return { ok: false, refused: false, error: `HTTP ${res && res.status}` };
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    const refused = /ECONNREFUSED|connect ECONNREFUSED|fetch failed/i.test(msg);
    return { ok: false, refused, error: msg };
  }
}

/**
 * Best-effort auto-start of the embedding server. Spawns
 * `node bin/isdlc-embedding-server.js` detached so it outlives F0009, then
 * retries the /reload POST a few times with short back-off. Any error
 * collapses to `{ started: false }` — this path is strictly opportunistic.
 *
 * @param {string} projectRoot
 * @param {number} port
 * @param {string} host
 * @param {typeof child_process.spawn} _spawn
 * @param {typeof fetch} _fetch
 * @returns {Promise<{ started: boolean }>}
 */
async function autoStartServer(projectRoot, port, host, _spawn, _fetch) {
  try {
    const serverBin = path.join(projectRoot, 'bin', 'isdlc-embedding-server.js');
    const child = _spawn('node', [serverBin], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
    });
    if (child && typeof child.unref === 'function') child.unref();
  } catch {
    return { started: false };
  }

  // Give the server a brief window to bind, then retry /reload a few times.
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const r = await postReload(port, host, _fetch);
    if (r.ok) return { started: true };
  }
  return { started: false };
}

/**
 * F0009 handler: refresh code embeddings as part of build finalize.
 *
 * See module header for the full contract. This function NEVER throws —
 * callers should `await` it and branch on `.status`.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {Object} [options]
 * @param {typeof child_process.spawn} [options._spawn]   - DI for tests
 * @param {typeof fetch}               [options._fetch]   - DI for tests
 * @param {typeof fs}                  [options._fs]      - DI for tests
 * @param {(root: string) => boolean}  [options._hasUserEmbeddingsConfig] - DI
 * @param {(root: string) => object}   [options._readProjectConfig]       - DI
 * @param {NodeJS.WritableStream}      [options._stdout]  - DI for tests
 * @param {NodeJS.WritableStream}      [options._stderr]  - DI for tests
 * @param {() => number}               [options._now]     - DI for tests
 * @returns {Promise<RefreshResult>}
 */
export async function refreshCodeEmbeddings(projectRoot, options = {}) {
  const _spawn = options._spawn || child_process.spawn;
  const _fetch = options._fetch || (typeof fetch === 'function' ? fetch : null);
  const _fs = options._fs || fs;
  const _hasUser = options._hasUserEmbeddingsConfig || hasUserEmbeddingsConfig;
  const _readCfg = options._readProjectConfig || readProjectConfig;
  const _stdout = options._stdout || process.stdout;
  const _stderr = options._stderr || process.stderr;
  const _now = options._now || Date.now;

  return neverThrow(async () => {
    const started = _now();

    // 1) Opt-in check (FR-006 + ERR-F0009-001)
    let optedIn = false;
    try {
      optedIn = _hasUser(projectRoot);
    } catch {
      optedIn = false;
    }
    if (!optedIn) {
      return { status: 'skipped', reason: 'opted_out' };
    }

    // 2) refresh_on_finalize check (FR-007 default true)
    let cfg;
    try {
      cfg = _readCfg(projectRoot);
    } catch {
      cfg = {};
    }
    const refreshOnFinalize =
      cfg && cfg.embeddings && typeof cfg.embeddings.refresh_on_finalize === 'boolean'
        ? cfg.embeddings.refresh_on_finalize
        : true;
    if (refreshOnFinalize === false) {
      return { status: 'skipped', reason: 'disabled' };
    }

    // 3) Bootstrap check (FR-008)
    if (!hasEmbPackage(projectRoot, _fs)) {
      // One-line banner on parent stdout — every build, no suppression.
      try {
        _stdout.write(BOOTSTRAP_BANNER + '\n');
      } catch {
        /* best-effort */
      }
      return {
        status: 'bootstrap_needed',
        reason: 'no .emb package — run isdlc-embedding generate manually to bootstrap',
      };
    }

    // 4) Spawn `node bin/isdlc-embedding.js generate . --incremental`
    const embedBin = path.join(projectRoot, 'bin', 'isdlc-embedding.js');
    let child;
    try {
      child = _spawn(
        'node',
        [embedBin, 'generate', '.', '--incremental'],
        { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      return {
        status: 'failed',
        reason: `spawn failed: ${err && err.message ? err.message : String(err)}`,
      };
    }

    // 5) Forward stdout/stderr with `[F0009] ` prefix; capture chunks count
    //    from stdout and a tail of stderr for failure reporting.
    let chunksProcessed;
    const stderrBuf = [];
    let stderrBytes = 0;

    const stdoutSplitter = createLineSplitter(line => {
      try {
        _stdout.write('[F0009] ' + line + '\n');
      } catch { /* best-effort */ }
      const m =
        /Generated\s+(\d+)\s+embeddings/i.exec(line) ||
        /Refreshed\s+(\d+)\s+chunks/i.exec(line);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) chunksProcessed = n;
      }
    });
    const stderrSplitter = createLineSplitter(line => {
      try {
        _stderr.write('[F0009] ' + line + '\n');
      } catch { /* best-effort */ }
      const bytes = Buffer.byteLength(line, 'utf8') + 1;
      stderrBuf.push(line);
      stderrBytes += bytes;
      while (stderrBytes > STDERR_TAIL_BYTES && stderrBuf.length > 1) {
        const dropped = stderrBuf.shift();
        stderrBytes -= Buffer.byteLength(dropped, 'utf8') + 1;
      }
    });

    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', chunk => stdoutSplitter.feed(chunk));
      child.stdout.on('end', () => stdoutSplitter.flush());
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', chunk => stderrSplitter.feed(chunk));
      child.stderr.on('end', () => stderrSplitter.flush());
    }

    // 6) Wait for exit (plus any spawn error)
    const exitInfo = await new Promise(resolve => {
      let done = false;
      const settle = payload => {
        if (done) return;
        done = true;
        resolve(payload);
      };
      child.once('exit', (code, signal) => settle({ code, signal, error: null }));
      child.once('error', err => settle({ code: null, signal: null, error: err }));
    });

    // Make sure any buffered partial line is flushed.
    stdoutSplitter.flush();
    stderrSplitter.flush();

    const durationMs = _now() - started;

    if (exitInfo.error) {
      return {
        status: 'failed',
        reason: `spawn error: ${exitInfo.error.message || String(exitInfo.error)}`,
        durationMs,
        stderr: stderrBuf.join('\n'),
      };
    }

    // 7) Non-zero exit -> ERR-F0009-002 (fail-open)
    if (exitInfo.code !== 0) {
      return {
        status: 'failed',
        reason: `non-zero exit: generate exited with code ${exitInfo.code}`,
        durationMs,
        chunksProcessed,
        stderr: stderrBuf.join('\n'),
      };
    }

    // 8) Success path — POST /reload, auto-start server if refused
    //    (ERR-F0009-003: reload failure is a warning, not a failure).
    const embCfg = (cfg && cfg.embeddings) || {};
    const server = (embCfg.server && typeof embCfg.server === 'object') ? embCfg.server : {};
    const port = Number(server.port) > 0 ? Number(server.port) : 7777;
    const host = typeof server.host === 'string' && server.host.length > 0 ? server.host : 'localhost';

    let serverReloaded = false;
    let reload_failed = false;

    if (_fetch) {
      const first = await postReload(port, host, _fetch);
      if (first.ok) {
        serverReloaded = true;
      } else if (first.refused) {
        // Server appears down — best-effort auto-start, then retry.
        const auto = await autoStartServer(projectRoot, port, host, _spawn, _fetch);
        if (auto.started) {
          serverReloaded = true;
        } else {
          reload_failed = true;
          try {
            _stderr.write(
              '[F0009] warning: /reload failed and auto-start did not respond; ' +
              'restart the embedding server manually to pick up changes\n'
            );
          } catch { /* best-effort */ }
        }
      } else {
        reload_failed = true;
        try {
          _stderr.write(
            `[F0009] warning: /reload failed (${first.error || 'unknown'}); ` +
            'the .emb package is written — restart the server to pick up changes\n'
          );
        } catch { /* best-effort */ }
      }
    } else {
      // No fetch available in this runtime; treat as reload-failed (warning).
      reload_failed = true;
    }

    const result = {
      status: reload_failed ? 'partial' : 'ok',
      durationMs,
      serverReloaded,
    };
    if (typeof chunksProcessed === 'number') result.chunksProcessed = chunksProcessed;
    if (reload_failed) result.reload_failed = true;
    return result;
  });
}

export default refreshCodeEmbeddings;
