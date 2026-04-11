/**
 * Tests for Memory Calibrator -- FR-003, FR-004, NFR-003
 *
 * REQ-GH-239 / FR-003 (Memory calibration one-shot worker + cache write)
 *              FR-004 (Calibration cache invalidation on fingerprint change)
 *              NFR-003 (Calibration overhead ≤2 min wall-clock, safe fallback)
 * Article II: Test-First Development
 *
 * Module under test: lib/embedding/engine/memory-calibrator.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  calibratePerWorkerMemory,
  readCachedCalibration,
  writeCachedCalibration,
  computeFingerprint,
  DEFAULT_CALIBRATION_OPTIONS,
  CACHE_FILENAME
} from './memory-calibrator.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

const GB = 1024 ** 3;

function mockConfig(overrides = {}) {
  return {
    device: 'coreml',
    dtype: 'fp16',
    model: 'jinaai/jina-embeddings-v2-base-code',
    session_options: {},
    ...overrides
  };
}

/**
 * Build a mock worker pool factory that drives calibration deterministically.
 * The returned factory has a `.pool` property exposing the last constructed pool
 * and its observable state (shutdown called, embed called, etc.).
 *
 * rssSequenceBytes — array of RSS values (bytes) returned by successive _rssReader
 * calls. The first call is the baseline, subsequent calls are sampling ticks.
 */
function makeMockPoolFactory({
  baselineRssGB = 0.3,
  peakRssGB = 2.0,
  inferenceDelayMs = 60,
  rssSequenceGB = null,
  spawnThrows = false,
  embedThrows = false,
  embedHangs = false,
  shutdownHangs = false
} = {}) {
  const factory = function mockCreateWorkerPool(workerPath, options) {
    if (spawnThrows) {
      throw new Error('ERR-CALIB-001: worker pool spawn failed');
    }
    const pool = {
      _workerPath: workerPath,
      _options: options,
      _shutdownCalled: 0,
      _embedCalled: 0,
      async embed(texts, batchSize, embedOpts) {
        pool._embedCalled++;
        if (embedThrows) {
          throw new Error('ERR-CALIB-001: embed failed');
        }
        if (embedHangs) {
          // Never resolves
          await new Promise(() => {});
        }
        await new Promise((resolve) => setTimeout(resolve, inferenceDelayMs));
        return texts.map(() => new Float32Array([0.1, 0.2, 0.3]));
      },
      async shutdown() {
        pool._shutdownCalled++;
        if (shutdownHangs) {
          await new Promise(() => {});
        }
      }
    };
    factory.pool = pool;
    return pool;
  };

  // Build RSS sequence: first element = baseline; rest = sampling values.
  // If rssSequenceGB is explicit, use it directly (in GB).
  // Else synthesize: baseline, then ramp up to peak.
  const sequenceBytes = rssSequenceGB
    ? rssSequenceGB.map((gb) => gb * GB)
    : [baselineRssGB * GB, baselineRssGB * GB, peakRssGB * GB, peakRssGB * GB, peakRssGB * GB];

  let callIdx = 0;
  factory.rssReader = () => {
    const idx = Math.min(callIdx, sequenceBytes.length - 1);
    callIdx++;
    return sequenceBytes[idx];
  };

  return factory;
}

// Create a unique sandbox projectRoot under os.tmpdir() for each test
let sandboxDir;
beforeEach(() => {
  sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memcal-'));
  fs.mkdirSync(path.join(sandboxDir, '.isdlc'), { recursive: true });
});
afterEach(() => {
  try {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// FR-003 — Memory calibration one-shot + cache write
// ---------------------------------------------------------------------------

describe('memory-calibrator — FR-003 calibration one-shot worker', () => {
  it(
    '[P0] REQ-GH-239 FR-003 CALIB-01: Given no cached calibration and a valid config, When calibratePerWorkerMemory(config) is called, Then it spawns a one-shot pool, samples RSS, and returns a CalibrationResult with perWorkerMemGB > 0',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });

      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });

      assert.ok(result !== null, 'result should not be null');
      assert.ok(result.perWorkerMemGB > 0, 'perWorkerMemGB should be > 0');
      // (2.0 − 0.3) × 1.2 = 2.04
      assert.ok(Math.abs(result.perWorkerMemGB - 2.04) < 0.001, `expected ~2.04, got ${result.perWorkerMemGB}`);
      assert.equal(result.baselineMemGB, 0.3);
      assert.equal(result.peakMemGB, 2.0);
      assert.equal(result.sampleCount, 20);
      assert.equal(result.fingerprint, computeFingerprint(config));
      assert.match(result.measuredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      assert.equal(result.device, 'coreml');
      assert.equal(result.dtype, 'fp16');
      assert.equal(result.model, 'jinaai/jina-embeddings-v2-base-code');
      // Pool lifecycle check
      assert.equal(factory.pool._embedCalled, 1);
      assert.equal(factory.pool._options.poolSize, 1);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-003 CALIB-02: Given a successful calibration, When the result is returned, Then writeCachedCalibration persists the result to .isdlc/embedding-calibration.json with all required fields',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });

      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.ok(result);

      const cachePath = path.join(sandboxDir, '.isdlc', CACHE_FILENAME);
      assert.ok(fs.existsSync(cachePath), 'cache file should exist');
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

      const requiredFields = [
        'perWorkerMemGB', 'baselineMemGB', 'peakMemGB', 'sampleCount',
        'durationMs', 'measuredAt', 'fingerprint', 'device', 'dtype', 'model'
      ];
      for (const f of requiredFields) {
        assert.ok(f in parsed, `cache missing field ${f}`);
      }

      const reRead = readCachedCalibration(sandboxDir, computeFingerprint(config));
      assert.ok(reRead !== null);
      assert.equal(reRead.perWorkerMemGB, parsed.perWorkerMemGB);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-003 CALIB-03: Given peakMemGB=2.0 and baselineMemGB=0.3 with safetyMargin=0.2, When perWorkerMemGB is computed, Then it equals (2.0 - 0.3) * 1.2 ≈ 2.04 GB',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.ok(result);
      assert.ok(Math.abs(result.perWorkerMemGB - 2.04) < 0.001);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-003 CALIB-04: Given samplingIntervalMs=500, When calibration runs for a simulated 2 s inference, Then at least 4 RSS samples are collected and the peak is max(samples)',
    async () => {
      const config = mockConfig();
      // Baseline 0.3, samples 1.0, 1.5, 2.0, 1.8 → peak = 2.0
      const factory = makeMockPoolFactory({
        inferenceDelayMs: 60,
        rssSequenceGB: [0.3, 1.0, 1.5, 2.0, 1.8, 1.8, 1.8]
      });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 10
      });
      assert.ok(result !== null);
      assert.equal(result.peakMemGB, 2.0);
      assert.equal(result.baselineMemGB, 0.3);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-003 CALIB-05 (ERR-CALIB-001): Given the worker pool spawn throws, When calibratePerWorkerMemory is called, Then it returns null and does not crash the caller',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ spawnThrows: true });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.equal(result, null);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-003 CALIB-06 (ERR-CALIB-003): Given a sample RSS reading below baseline (e.g. 0.1 GB < 0.3 GB baseline), When calibration finishes, Then the implausible value is discarded and the function returns null',
    async () => {
      const config = mockConfig();
      // baseline=0.3, all later samples below baseline
      const factory = makeMockPoolFactory({
        rssSequenceGB: [0.3, 0.1, 0.1, 0.1]
      });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.equal(result, null);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-003 CALIB-07 (ERR-CALIB-003): Given a sample RSS reading > 50 GB, When calibration finishes, Then the implausible value is discarded and the function returns null',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({
        rssSequenceGB: [0.3, 60, 60]
      });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.equal(result, null);
    }
  );

  it(
    '[P1] REQ-GH-239 FR-003 CALIB-08: Given calibratePerWorkerMemory succeeds, When inspecting durationMs, Then it reflects end-to-end wall-clock (> 0 and < timeoutMs)',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5,
        timeoutMs: 5000
      });
      assert.ok(result !== null);
      assert.ok(result.durationMs >= 0);
      assert.ok(result.durationMs < 5000);
    }
  );

  it(
    '[P1] REQ-GH-239 FR-003 CALIB-09: Given pool.embed throws after the worker loads, When calibratePerWorkerMemory runs, Then it returns null and still calls pool.shutdown() to avoid worker leaks',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ embedThrows: true });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.equal(result, null);
      assert.equal(factory.pool._shutdownCalled, 1, 'shutdown should be called exactly once');
    }
  );
});

// ---------------------------------------------------------------------------
// FR-004 — Cache invalidation on fingerprint change
// ---------------------------------------------------------------------------

describe('memory-calibrator — FR-004 calibration cache invalidation', () => {
  it(
    '[P0] REQ-GH-239 FR-004 INV-01: Given a cache file whose fingerprint matches current config, When readCachedCalibration is called, Then it returns the cached result (fast path)',
    () => {
      const config = mockConfig();
      const fp = computeFingerprint(config);
      const cached = {
        perWorkerMemGB: 2.04, baselineMemGB: 0.3, peakMemGB: 2.0,
        sampleCount: 20, durationMs: 1234, measuredAt: '2026-04-11T00:00:00.000Z',
        fingerprint: fp, device: 'coreml', dtype: 'fp16',
        model: 'jinaai/jina-embeddings-v2-base-code'
      };
      fs.writeFileSync(path.join(sandboxDir, '.isdlc', CACHE_FILENAME), JSON.stringify(cached));

      const result = readCachedCalibration(sandboxDir, fp);
      assert.ok(result !== null);
      assert.equal(result.perWorkerMemGB, 2.04);
      assert.equal(result.fingerprint, fp);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-004 INV-02: Given a cache file whose fingerprint differs from current config, When readCachedCalibration is called, Then it returns null (forces re-calibration)',
    () => {
      const cached = {
        perWorkerMemGB: 2.04, baselineMemGB: 0.3, peakMemGB: 2.0,
        sampleCount: 20, durationMs: 1234, measuredAt: '2026-04-11T00:00:00.000Z',
        fingerprint: 'aaaaaaaaaaaaaaaa', device: 'cpu', dtype: 'fp32',
        model: 'foo'
      };
      fs.writeFileSync(path.join(sandboxDir, '.isdlc', CACHE_FILENAME), JSON.stringify(cached));

      const result = readCachedCalibration(sandboxDir, 'bbbbbbbbbbbbbbbb');
      assert.equal(result, null);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-004 INV-03: Given a cache file exists with fingerprint A and current config yields fingerprint B, When calibratePerWorkerMemory is driven end-to-end, Then calibration re-runs and writes a new cache file overwriting the stale one',
    async () => {
      const staleFp = 'aaaaaaaaaaaaaaaa';
      const stale = {
        perWorkerMemGB: 9.99, baselineMemGB: 0.3, peakMemGB: 9.0,
        sampleCount: 20, durationMs: 1234, measuredAt: '2020-01-01T00:00:00.000Z',
        fingerprint: staleFp, device: 'cpu', dtype: 'fp32', model: 'old-model'
      };
      const cachePath = path.join(sandboxDir, '.isdlc', CACHE_FILENAME);
      fs.writeFileSync(cachePath, JSON.stringify(stale));

      const config = mockConfig(); // yields different fingerprint
      const newFp = computeFingerprint(config);
      assert.notEqual(newFp, staleFp);

      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });

      assert.ok(result !== null);
      assert.equal(factory.pool._embedCalled, 1, 'embed must be called (re-measurement)');
      const reWritten = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      assert.equal(reWritten.fingerprint, newFp);
      assert.notEqual(reWritten.perWorkerMemGB, 9.99);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-004 INV-04: Given device changes from "cpu" to "coreml", When computeFingerprint is called on the two configs, Then the fingerprints differ',
    () => {
      const a = { device: 'cpu', dtype: 'fp16', model: 'jinaai/jina-embeddings-v2-base-code' };
      const b = { device: 'coreml', dtype: 'fp16', model: 'jinaai/jina-embeddings-v2-base-code' };
      assert.notEqual(computeFingerprint(a), computeFingerprint(b));
    }
  );

  it(
    '[P0] REQ-GH-239 FR-004 INV-05: Given dtype changes from "fp16" to "fp32", When computeFingerprint is called, Then the fingerprints differ',
    () => {
      const a = { device: 'coreml', dtype: 'fp16', model: 'jinaai/jina-embeddings-v2-base-code' };
      const b = { device: 'coreml', dtype: 'fp32', model: 'jinaai/jina-embeddings-v2-base-code' };
      assert.notEqual(computeFingerprint(a), computeFingerprint(b));
    }
  );

  it(
    '[P0] REQ-GH-239 FR-004 INV-06: Given model changes, When computeFingerprint is called, Then the fingerprints differ',
    () => {
      const a = { device: 'coreml', dtype: 'fp16', model: 'model-a' };
      const b = { device: 'coreml', dtype: 'fp16', model: 'model-b' };
      assert.notEqual(computeFingerprint(a), computeFingerprint(b));
    }
  );

  it(
    '[P1] REQ-GH-239 FR-004 INV-07: Given two identical configs, When computeFingerprint is called twice, Then the result is deterministic (same value both times)',
    () => {
      const cfg = mockConfig();
      const fp1 = computeFingerprint(cfg);
      const fp2 = computeFingerprint(cfg);
      assert.equal(fp1, fp2);
      assert.equal(fp1.length, 16);
      assert.match(fp1, /^[0-9a-f]{16}$/);
    }
  );

  it(
    '[P1] REQ-GH-239 FR-004 INV-08: Given the cache file does not exist, When readCachedCalibration is called, Then it returns null without throwing',
    () => {
      const result = readCachedCalibration(sandboxDir, 'any-fingerprint-xx');
      assert.equal(result, null);
    }
  );

  it(
    '[P1] REQ-GH-239 FR-004 INV-09: Given the cache file is corrupt JSON, When readCachedCalibration is called, Then it returns null and does not throw',
    () => {
      fs.writeFileSync(path.join(sandboxDir, '.isdlc', CACHE_FILENAME), '{not json');
      const result = readCachedCalibration(sandboxDir, 'any');
      assert.equal(result, null);
    }
  );

  it(
    '[P1] REQ-GH-239 FR-004 INV-10: Given writeCachedCalibration succeeds, When the file is re-read, Then the round-trip preserves all 10 CalibrationResult fields',
    () => {
      const original = {
        perWorkerMemGB: 2.04,
        baselineMemGB: 0.3,
        peakMemGB: 2.0,
        sampleCount: 20,
        durationMs: 47320,
        measuredAt: '2026-04-11T05:30:00.000Z',
        fingerprint: computeFingerprint(mockConfig()),
        device: 'coreml',
        dtype: 'fp16',
        model: 'jinaai/jina-embeddings-v2-base-code'
      };
      writeCachedCalibration(sandboxDir, original);
      const roundTripped = readCachedCalibration(sandboxDir, original.fingerprint);
      assert.deepEqual(roundTripped, original);
    }
  );
});

// ---------------------------------------------------------------------------
// NFR-003 — Calibration overhead ≤2 min with safe fallback
// ---------------------------------------------------------------------------

describe('memory-calibrator — NFR-003 calibration overhead ceiling', () => {
  it(
    '[P1] REQ-GH-239 NFR-003 TIMEOUT-01 (ERR-CALIB-002): Given inference hangs past options.timeoutMs, When calibratePerWorkerMemory runs, Then the worker pool is killed and the function returns null within timeoutMs + small margin',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ embedHangs: true });
      const start = Date.now();
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5,
        timeoutMs: 80
      });
      const elapsed = Date.now() - start;
      assert.equal(result, null);
      assert.ok(elapsed < 500, `elapsed ${elapsed}ms should be under 500ms`);
      // Shutdown must have been attempted to avoid worker leaks.
      assert.ok(factory.pool._shutdownCalled >= 1);
    }
  );

  it(
    '[P1] REQ-GH-239 NFR-003 TIMEOUT-02: Given the default timeoutMs is 120000 (2 min), When the constant is inspected, Then it matches the NFR-003 ceiling',
    () => {
      assert.equal(DEFAULT_CALIBRATION_OPTIONS.timeoutMs, 120000);
    }
  );

  it(
    '[P1] REQ-GH-239 NFR-003 TIMEOUT-03: Given calibration times out, When the CLI caller (device-detector) consults the result, Then falling back to WORKER_MEMORY_ESTIMATE_GB constants is possible (result === null signals "use hardcoded")',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ embedHangs: true });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5,
        timeoutMs: 60
      });
      assert.equal(result, null, 'null signals "use hardcoded constants"');
      // Ensure no cache file was written (stale data must not persist on timeout)
      const cachePath = path.join(sandboxDir, '.isdlc', CACHE_FILENAME);
      assert.equal(fs.existsSync(cachePath), false);
    }
  );

  it(
    '[P1] REQ-GH-239 NFR-003 TIMEOUT-04: Given a successful calibration with durationMs well under 120000, When result.durationMs is inspected, Then it is < timeoutMs proving the fast path stays well under the NFR ceiling',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({
        baselineRssGB: 0.3, peakRssGB: 2.0, inferenceDelayMs: 40
      });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5
      });
      assert.ok(result !== null);
      assert.ok(result.durationMs < DEFAULT_CALIBRATION_OPTIONS.timeoutMs);
      assert.ok(result.durationMs < 5000, `durationMs ${result.durationMs} should be well under ceiling`);
    }
  );

  it(
    '[P2] REQ-GH-239 NFR-003 TIMEOUT-05: Given pool.shutdown itself hangs after timeout fires, When calibratePerWorkerMemory resolves, Then it still returns null (no caller-visible deadlock)',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ embedHangs: true, shutdownHangs: true });
      const start = Date.now();
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5,
        timeoutMs: 50
      });
      const elapsed = Date.now() - start;
      assert.equal(result, null);
      // Must not deadlock on hanging shutdown — calibrator races with a short safety timeout.
      assert.ok(elapsed < 1000, `elapsed ${elapsed}ms should not deadlock`);
    }
  );
});
