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

/** Default options (public so tests can inspect). */
export const DEFAULT_CALIBRATION_OPTIONS = Object.freeze({
  timeoutMs: 120000,          // NFR-003 hard ceiling (2 min)
  sampleCount: 20,            // synthetic texts per calibration run
  sampleCharLength: 2000,     // char length per synthetic text
  samplingIntervalMs: 500,    // RSS sampling tick
  safetyMargin: 0.2           // 20% buffer on measured peak
});

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
 * Compute a short, stable fingerprint over (device, dtype, model).
 * SHA-256 first 16 hex chars per A-DESIGN-2.
 *
 * @param {{device:string,dtype:string,model:string}} config
 * @returns {string}
 */
export function computeFingerprint(config) {
  const device = config?.device ?? '';
  const dtype = config?.dtype ?? '';
  const model = config?.model ?? '';
  const key = `${device}|${dtype}|${model}`;
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
 * Main entry point: calibrate per-worker memory cost.
 *
 * This function NEVER throws. It returns a CalibrationResult on success and
 * `null` on any error, timeout, or implausible measurement.
 *
 * @param {Object} config  Resolved embeddings config
 * @param {Object} [options]
 * @param {string} [options.projectRoot]
 * @param {number} [options.timeoutMs=120000]
 * @param {number} [options.sampleCount=20]
 * @param {number} [options.sampleCharLength=2000]
 * @param {number} [options.samplingIntervalMs=500]
 * @param {number} [options.safetyMargin=0.2]
 * @param {function} [options._createWorkerPool]  DI hook (see worker-pool.createWorkerPool)
 * @param {function} [options._rssReader]         DI hook returning RSS in bytes
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

  // Step 3 — generate synthetic samples
  const samples = generateSyntheticSamples(sampleCount, sampleCharLength);

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
      sampleCount,
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
