/**
 * Memory Calibrator — measure per-worker RSS cost for an embedding config.
 *
 * REQ-GH-239 / FR-003 (Memory calibration one-shot worker + cache write)
 *              FR-004 (Calibration cache invalidation on fingerprint change)
 *              NFR-003 (Calibration overhead ≤2 min wall-clock, safe fallback)
 *
 * The calibrator spawns a one-shot worker pool (poolSize=1), runs a synthetic
 * batch through it, samples process RSS at a fixed interval, and returns the
 * (peak − baseline) × (1 + safetyMargin) figure as `perWorkerMemGB`.
 *
 * Contract: this module NEVER throws. Every failure path resolves to `null`
 * so the caller (device-detector) can deterministically fall back to the
 * hardcoded WORKER_MEMORY_ESTIMATE_GB constants.
 *
 * @module lib/embedding/engine/memory-calibrator
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkerPool as defaultCreateWorkerPool } from './worker-pool.js';

const GB = 1024 ** 3;

/** Default options (public so tests can inspect).
 *
 * REQ-GH-248 FR-002 / AC-002-01, AC-002-03, AC-002-04:
 *   - samplingIntervalMs 500→200 to yield ~100-150 samples over a 20-30 s run
 *   - timeoutMs 120000→300000 (5 min) so a real-chunk steady-state window of
 *     20-30 s has comfortable headroom even after model download.
 */
export const DEFAULT_CALIBRATION_OPTIONS = Object.freeze({
  timeoutMs: 300000,          // REQ-GH-248 FR-002 AC-002-03 (was 120000)
  sampleCount: 20,            // synthetic texts per calibration run (fallback)
  sampleCharLength: 2000,     // char length per synthetic text (fallback)
  samplingIntervalMs: 200,    // REQ-GH-248 FR-002 AC-002-01 (was 500)
  safetyMargin: 0.2           // 20% buffer on measured peak
});

/** Fallback threshold: when the chunker yields < MIN_REAL_CHUNKS chunks, the
 *  calibrator falls back to synthetic samples. REQ-GH-248 FR-001 / AC-001-03.
 */
export const MIN_REAL_CHUNKS = 20;

/** Upper cap on real-chunk samples drawn from the project. Larger values
 *  marginally improve the measurement but blow out runtime. */
export const MAX_REAL_CHUNK_SAMPLES = 100;

/** REQ-GH-248 FR-004 / AC-004-02: explicit allowlist of session_options keys
 *  that are hashed into the calibration fingerprint. Only these keys affect
 *  memory profile and cache invalidation; other keys (e.g. logSeverityLevel)
 *  are memory-neutral and do NOT trigger recalibration.
 *
 *  The set is pinned here so tests can import and diff against it — any
 *  accidental reordering or removal surfaces in CI.
 */
export const HASHED_SESSION_OPTION_KEYS = Object.freeze([
  'graphOptimizationLevel',
  'executionMode',
  'enableCpuMemArena',
  'enableMemPattern',
]);

/**
 * Build the `calibrationConfig` object the calibrator expects from the
 * resolved embeddings config in `bin/isdlc-embedding.js`.
 *
 * REQ-GH-248 FR-003 / AC-003-01, AC-003-02, AC-003-03.
 *
 * Extracted from `bin/isdlc-embedding.js:542-551` so tests can verify that
 * `session_options` propagates from user config → calibrationConfig. The
 * returned object always has a `session_options` field (never undefined —
 * empty object if the resolved config omitted it).
 *
 * @param {{device?:string, dtype?:string, model?:string, session_options?:Object}} resolved
 * @returns {{device:string, dtype:string, model:string, session_options:Object}}
 */
export function buildCalibrationConfig(resolved = {}) {
  return {
    device: resolved.device || 'auto',
    dtype: resolved.dtype || 'auto',
    model: resolved.model || 'jinaai/jina-embeddings-v2-base-code',
    session_options: resolved.session_options ?? {},
  };
}

/** Cache file name relative to .isdlc/ */
export const CACHE_FILENAME = 'embedding-calibration.json';

/** Implausible value guard rails (GB). */
const MIN_PLAUSIBLE_GB = 0.05;
const MAX_PLAUSIBLE_GB = 50;

/**
 * @typedef {Object} CalibrationResult
 * @property {number} perWorkerMemGB
 * @property {number} baselineMemGB
 * @property {number} peakMemGB
 * @property {number} sampleCount
 * @property {number} durationMs
 * @property {string} measuredAt
 * @property {string} fingerprint
 * @property {string} device
 * @property {string} dtype
 * @property {string} model
 */

/**
 * Compute a short, stable fingerprint over
 * (device, dtype, model, session_options[HASHED_SESSION_OPTION_KEYS]).
 * SHA-256 first 16 hex chars per A-DESIGN-2.
 *
 * REQ-GH-248 FR-004: the fingerprint now includes an explicit allowlist of
 * `session_options` keys (HASHED_SESSION_OPTION_KEYS) so that flipping
 * `graphOptimizationLevel` from "disabled" to "all" (or vice versa)
 * invalidates the cache — the memory profile of the two optimizer levels
 * is different, so the calibrated per-worker cost must be re-measured.
 *
 * Non-listed keys (e.g. `logSeverityLevel`) are memory-neutral and do NOT
 * trigger recalibration — keeping the cache hit rate high across
 * cosmetic session-option changes.
 *
 * @param {{device:string,dtype:string,model:string,session_options?:Object}} config
 * @returns {string}
 */
export function computeFingerprint(config) {
  const device = config?.device ?? '';
  const dtype = config?.dtype ?? '';
  const model = config?.model ?? '';
  const sessionOptions = config?.session_options ?? {};
  // Build a stable canonical form over the hashed-key subset. Keys are
  // iterated in HASHED_SESSION_OPTION_KEYS order (not Object.keys order) so
  // the hash is deterministic regardless of insertion order in user config.
  const sessionPairs = HASHED_SESSION_OPTION_KEYS.map((k) => {
    const v = sessionOptions[k];
    // JSON-stringify the value so booleans, numbers, and nested objects all
    // have a stable string representation. `undefined` → empty string (same
    // as a missing key) so users who explicitly set a key to `undefined`
    // don't get a different fingerprint than users who omitted the key.
    const serialized = v === undefined ? '' : JSON.stringify(v);
    return `${k}=${serialized}`;
  }).join('|');
  const key = `${device}|${dtype}|${model}|${sessionPairs}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Read cached calibration if the fingerprint matches.
 *
 * @param {string} projectRoot
 * @param {string} fingerprint
 * @returns {CalibrationResult|null}
 */
export function readCachedCalibration(projectRoot, fingerprint) {
  try {
    const cachePath = path.join(projectRoot, '.isdlc', CACHE_FILENAME);
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.fingerprint !== fingerprint) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write a calibration result to `.isdlc/embedding-calibration.json`.
 * Never throws — logs and swallows on failure.
 *
 * @param {string} projectRoot
 * @param {CalibrationResult} result
 */
export function writeCachedCalibration(projectRoot, result) {
  try {
    const dir = path.join(projectRoot, '.isdlc');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cachePath = path.join(dir, CACHE_FILENAME);
    fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
  } catch (err) {
    // Non-fatal per design error handling table
    // eslint-disable-next-line no-console
    console.warn(`[calibrate] failed to write cache: ${err.message}`);
  }
}

/**
 * Generate `count` deterministic synthetic text samples.
 * Each sample is roughly `charLength` chars of code-like tokens.
 *
 * REQ-GH-248 FR-001 AC-001-03: kept as the fallback path for tiny projects
 * (< MIN_REAL_CHUNKS chunks) and for chunker failures. The primary path
 * now uses real chunks via `_sampleProvider`.
 *
 * @param {number} count
 * @param {number} charLength
 * @returns {string[]}
 */
export function generateSyntheticSamples(count, charLength) {
  const tokens = [
    'function', 'class', 'import', 'export', 'return', 'const', 'let', 'var',
    'if', 'else', 'for', 'while', 'await', 'async', 'throw', 'catch', 'try',
    'foo', 'bar', 'baz', 'doThing', 'calculate', 'process', 'handle', 'result',
    '{', '}', '(', ')', ';', ',', '=', '=>', '.', '+', '-', '*', '/'
  ];
  const samples = [];
  // Simple LCG for deterministic pseudo-random sampling (reproducible)
  let seed = 0x13572468;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let i = 0; i < count; i++) {
    let s = '';
    while (s.length < charLength) {
      const tok = tokens[nextRand() % tokens.length];
      s += tok + ' ';
    }
    samples.push(s.slice(0, charLength));
  }
  return samples;
}

/**
 * Subsample `max` strings from a pool of real chunks using a deterministic
 * LCG so the same chunks are sampled across runs (debuggable, reproducible).
 *
 * REQ-GH-248 FR-001 / AC-001-01.
 *
 * @param {string[]} chunks - the full pool of chunks from the project
 * @param {number} max - upper cap on the returned sample (typically 100)
 * @returns {string[]} a subset of length min(chunks.length, max)
 */
export function selectRealChunkSamples(chunks, max = MAX_REAL_CHUNK_SAMPLES) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];
  if (chunks.length <= max) return chunks.slice();

  const result = [];
  const taken = new Set();
  let seed = 0x13572468;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  while (result.length < max) {
    const idx = nextRand() % chunks.length;
    if (taken.has(idx)) continue;
    taken.add(idx);
    result.push(chunks[idx]);
  }
  return result;
}

/**
 * Main entry point: calibrate per-worker memory cost.
 *
 * This function NEVER throws. It returns a CalibrationResult on success and
 * `null` on any error, timeout, or implausible measurement.
 *
 * REQ-GH-248 FR-001/FR-002/FR-003:
 *   - Pulls real project chunks via `_sampleProvider` (up to 100 chunks).
 *   - Falls back to synthetic samples when fewer than MIN_REAL_CHUNKS are
 *     available or the provider throws (Article X fail-safe).
 *   - session_options propagates through workerData for measurement fidelity.
 *
 * @param {Object} config  Resolved embeddings config
 * @param {Object} [options]
 * @param {string} [options.projectRoot]
 * @param {number} [options.timeoutMs=300000]
 * @param {number} [options.sampleCount=20]
 * @param {number} [options.sampleCharLength=2000]
 * @param {number} [options.samplingIntervalMs=200]
 * @param {number} [options.safetyMargin=0.2]
 * @param {function} [options._createWorkerPool]  DI hook (see worker-pool.createWorkerPool)
 * @param {function} [options._rssReader]         DI hook returning RSS in bytes
 * @param {function} [options._sampleProvider]    REQ-GH-248 FR-001 DI hook returning real chunks (string[])
 * @param {string}   [options._workerPath]        Override worker path for tests
 * @returns {Promise<CalibrationResult|null>}
 */
export async function calibratePerWorkerMemory(config, options = {}) {
  const opts = {
    ...DEFAULT_CALIBRATION_OPTIONS,
    ...options
  };
  const {
    projectRoot = process.cwd(),
    timeoutMs,
    sampleCount,
    sampleCharLength,
    samplingIntervalMs,
    safetyMargin,
    _createWorkerPool = defaultCreateWorkerPool,
    _rssReader = () => process.memoryUsage().rss,
    _sampleProvider = null,
    _workerPath = path.join(projectRoot, 'lib', 'embedding', 'engine', 'embedding-worker.js')
  } = opts;

  const startTime = Date.now();
  const fingerprint = computeFingerprint(config);

  // Step 1 — early cache check (fast path)
  const cached = readCachedCalibration(projectRoot, fingerprint);
  if (cached) return cached;

  let pool = null;
  let samplingInterval = null;
  let timeoutHandle = null;
  const rssSamplesBytes = [];

  // Step 2 — baseline RSS (before worker load)
  let baselineBytes;
  try {
    baselineBytes = _rssReader();
  } catch {
    return null;
  }

  // Step 3 — gather samples.
  // REQ-GH-248 FR-001 AC-001-01/02/03: prefer real project chunks when the
  // sampleProvider hook supplies ≥ MIN_REAL_CHUNKS. Otherwise fall back to
  // synthetic samples (tiny-project fallback). Provider errors are
  // non-fatal — they degrade to the synthetic path.
  let samples;
  let sampleSource = 'synthetic';
  let providedChunks = null;
  if (typeof _sampleProvider === 'function') {
    try {
      providedChunks = _sampleProvider();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[calibrate] sampleProvider failed: ${err?.message ?? err}; using synthetic samples`);
      providedChunks = null;
    }
  }

  if (Array.isArray(providedChunks) && providedChunks.length >= MIN_REAL_CHUNKS) {
    samples = selectRealChunkSamples(providedChunks, MAX_REAL_CHUNK_SAMPLES);
    sampleSource = 'real-chunks';
  } else {
    if (Array.isArray(providedChunks) && providedChunks.length > 0 && providedChunks.length < MIN_REAL_CHUNKS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[calibrate] fewer than ${MIN_REAL_CHUNKS} chunks available (${providedChunks.length}), falling back to synthetic samples`
      );
    }
    samples = generateSyntheticSamples(sampleCount, sampleCharLength);
  }
  const effectiveSampleCount = samples.length;

  try {
    // Step 4 — spawn one-shot pool (poolSize: 1)
    try {
      pool = _createWorkerPool(_workerPath, {
        poolSize: 1,
        workerData: {
          device: config?.device,
          dtype: config?.dtype,
          model: config?.model,
          session_options: config?.session_options ?? {}
        }
      });
    } catch (err) {
      // ERR-CALIB-001
      // eslint-disable-next-line no-console
      console.warn(`[calibrate] worker pool spawn failed: ${err.message}`);
      return null;
    }

    // Step 5 — start sampling RSS at fixed interval
    samplingInterval = setInterval(() => {
      try {
        rssSamplesBytes.push(_rssReader());
      } catch {
        // swallow sampling errors; implausible guard handles final result
      }
    }, samplingIntervalMs);
    // Allow the process to exit even if the interval is still active
    if (samplingInterval && typeof samplingInterval.unref === 'function') {
      samplingInterval.unref();
    }

    // Step 6 — run inference with a hard timeout race (ERR-CALIB-002 / NFR-003)
    const embedPromise = pool.embed(samples, 32, {});
    const timeoutPromise = new Promise((resolve) => {
      timeoutHandle = setTimeout(() => resolve('__TIMEOUT__'), timeoutMs);
      if (timeoutHandle && typeof timeoutHandle.unref === 'function') {
        timeoutHandle.unref();
      }
    });

    let timedOut = false;
    try {
      const raced = await Promise.race([
        embedPromise.then((v) => ({ ok: true, v })).catch((err) => ({ ok: false, err })),
        timeoutPromise
      ]);
      if (raced === '__TIMEOUT__') {
        timedOut = true;
      } else if (raced && raced.ok === false) {
        // ERR-CALIB-001 / pool.embed rejection
        // eslint-disable-next-line no-console
        console.warn(`[calibrate] inference failed: ${raced.err?.message ?? raced.err}`);
        return null;
      }
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    }

    // Step 7 — stop sampling
    if (samplingInterval) {
      clearInterval(samplingInterval);
      samplingInterval = null;
    }

    if (timedOut) {
      // ERR-CALIB-002 — return null so caller falls back to hardcoded constants.
      // No cache is written (stale data must not persist).
      // eslint-disable-next-line no-console
      console.warn(`[calibrate] timed out after ${timeoutMs}ms; using fallback`);
      return null;
    }

    if (rssSamplesBytes.length === 0) {
      // No samples captured — cannot compute a peak
      return null;
    }

    const peakBytes = Math.max(...rssSamplesBytes);
    const baselineMemGB = baselineBytes / GB;
    const peakMemGB = peakBytes / GB;

    // ERR-CALIB-003 — implausible value rejection
    if (
      peakMemGB < MIN_PLAUSIBLE_GB ||
      peakMemGB > MAX_PLAUSIBLE_GB ||
      baselineMemGB < 0 ||
      peakMemGB < baselineMemGB
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[calibrate] implausible RSS (baseline=${baselineMemGB.toFixed(3)}GB peak=${peakMemGB.toFixed(3)}GB); rejecting`
      );
      return null;
    }

    // Also reject individual samples that are implausibly huge
    for (const b of rssSamplesBytes) {
      const gb = b / GB;
      if (gb > MAX_PLAUSIBLE_GB) {
        // eslint-disable-next-line no-console
        console.warn(`[calibrate] implausible sample ${gb.toFixed(1)}GB; rejecting`);
        return null;
      }
    }

    // Step 8 — compute perWorkerMemGB
    const perWorkerMemGB = (peakMemGB - baselineMemGB) * (1 + safetyMargin);

    if (perWorkerMemGB < MIN_PLAUSIBLE_GB || perWorkerMemGB > MAX_PLAUSIBLE_GB) {
      // eslint-disable-next-line no-console
      console.warn(`[calibrate] implausible perWorkerMemGB=${perWorkerMemGB.toFixed(3)}; rejecting`);
      return null;
    }

    const durationMs = Date.now() - startTime;

    /** @type {CalibrationResult} */
    const result = {
      perWorkerMemGB,
      baselineMemGB,
      peakMemGB,
      sampleCount: effectiveSampleCount,
      sampleSource, // REQ-GH-248 FR-001: 'real-chunks' | 'synthetic'
      durationMs,
      measuredAt: new Date().toISOString(),
      fingerprint,
      device: config?.device,
      dtype: config?.dtype,
      model: config?.model
    };

    // Step 10 — write cache (best-effort)
    writeCachedCalibration(projectRoot, result);

    return result;
  } catch (err) {
    // Defence in depth — never throw out of this function
    // eslint-disable-next-line no-console
    console.warn(`[calibrate] unexpected error: ${err?.message ?? err}`);
    return null;
  } finally {
    if (samplingInterval) {
      clearInterval(samplingInterval);
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    // Step 11 — shutdown pool (best-effort, non-blocking)
    // TIMEOUT-05: if shutdown hangs, do not block the caller.
    if (pool && typeof pool.shutdown === 'function') {
      try {
        // Fire-and-forget with a short safety race so we never deadlock.
        const shutdownPromise = Promise.resolve().then(() => pool.shutdown()).catch(() => {});
        const shutdownTimeout = new Promise((resolve) => {
          const h = setTimeout(resolve, 100);
          if (h && typeof h.unref === 'function') h.unref();
        });
        await Promise.race([shutdownPromise, shutdownTimeout]);
      } catch {
        // swallow — shutdown is best-effort
      }
    }
  }
}
