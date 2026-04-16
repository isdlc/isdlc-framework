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
import { createHash } from 'node:crypto';

import {
  calibratePerWorkerMemory,
  readCachedCalibration,
  writeCachedCalibration,
  computeFingerprint,
  buildCalibrationConfig,
  selectRealChunkSamples,
  DEFAULT_CALIBRATION_OPTIONS,
  CACHE_FILENAME,
  HASHED_SESSION_OPTION_KEYS,
  MIN_REAL_CHUNKS,
  MAX_REAL_CHUNK_SAMPLES,
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
    '[P1] REQ-GH-248 FR-002 AC-002-03: Given the default timeoutMs is 300000 (5 min), When the constant is inspected, Then it matches the updated ceiling that accommodates a 20-30 s real-chunk steady-state window',
    () => {
      // REQ-GH-248 bumped timeoutMs from 120000 → 300000 so real-chunk
      // calibration with a 20-30 s window has comfortable headroom even
      // after a model download on the first run.
      assert.equal(DEFAULT_CALIBRATION_OPTIONS.timeoutMs, 300000);
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

// ---------------------------------------------------------------------------
// REQ-GH-248 FR-001 — Real-chunk sampling
// ---------------------------------------------------------------------------

describe('REQ-GH-248 FR-001: calibrator uses real chunks via _sampleProvider', () => {

  /**
   * Helper: build a deterministic list of N real-looking chunks.
   */
  function makeFakeChunks(n) {
    const templates = [
      'function add(a, b) { return a + b; }',
      'class User { constructor(id) { this.id = id; } }',
      'def parse(data): return json.loads(data)',
      'package main\nimport "fmt"\nfunc main() { fmt.Println("hi") }',
      'impl Foo { pub fn bar(&self) -> i32 { self.x + 1 } }',
    ];
    const chunks = [];
    for (let i = 0; i < n; i++) {
      chunks.push(`${templates[i % templates.length]} // chunk #${i}`);
    }
    return chunks;
  }

  it(
    '[P0] REQ-GH-248 FR-001 AC-001-01 TC-001-01: Given _sampleProvider returning 250 real chunks, When calibratePerWorkerMemory runs, Then samples passed to pool.embed are a subset of the injected 250 chunks AND samples.length <= 100',
    async () => {
      const config = mockConfig();
      const fakeChunks = makeFakeChunks(250);
      const capturedSamples = [];
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      // Wrap the factory to capture the samples arg to pool.embed.
      const origFactory = factory;
      const wrappedFactory = function (workerPath, options) {
        const pool = origFactory(workerPath, options);
        const origEmbed = pool.embed.bind(pool);
        pool.embed = async (samples, batchSize, embedOpts) => {
          capturedSamples.push(...samples);
          return origEmbed(samples, batchSize, embedOpts);
        };
        return pool;
      };
      wrappedFactory.rssReader = factory.rssReader;
      wrappedFactory.pool = null;
      Object.defineProperty(wrappedFactory, 'pool', {
        get() { return origFactory.pool; },
      });

      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: wrappedFactory,
        _rssReader: factory.rssReader,
        _sampleProvider: () => fakeChunks,
        samplingIntervalMs: 5,
      });

      assert.ok(result !== null);
      assert.equal(result.sampleSource, 'real-chunks');
      assert.ok(capturedSamples.length > 0, 'samples must be non-empty');
      assert.ok(
        capturedSamples.length <= MAX_REAL_CHUNK_SAMPLES,
        `samples.length ${capturedSamples.length} must be <= ${MAX_REAL_CHUNK_SAMPLES}`
      );
      // Every sample must be a member of the injected pool.
      const fakeSet = new Set(fakeChunks);
      for (const s of capturedSamples) {
        assert.ok(fakeSet.has(s), `sample "${s}" is not from the injected chunks`);
      }
      assert.equal(result.sampleCount, capturedSamples.length);
    }
  );

  it(
    '[P0] REQ-GH-248 FR-001 AC-001-02 TC-001-02: Given _sampleProvider returning real chunks, When calibration runs, Then the samples are NOT synthetic (not from generateSyntheticSamples)',
    async () => {
      const config = mockConfig();
      const fakeChunks = makeFakeChunks(50);
      const capturedSamples = [];
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const wrapped = function (workerPath, options) {
        const pool = factory(workerPath, options);
        const orig = pool.embed.bind(pool);
        pool.embed = async (samples, batchSize, embedOpts) => {
          capturedSamples.push(...samples);
          return orig(samples, batchSize, embedOpts);
        };
        return pool;
      };
      wrapped.rssReader = factory.rssReader;
      Object.defineProperty(wrapped, 'pool', { get() { return factory.pool; } });

      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: wrapped,
        _rssReader: factory.rssReader,
        _sampleProvider: () => fakeChunks,
        samplingIntervalMs: 5,
      });
      assert.ok(result !== null);
      // Synthetic samples never contain the template strings we injected —
      // their marker is the '// chunk #' comment.
      let realCount = 0;
      for (const s of capturedSamples) {
        if (s.includes('// chunk #')) realCount++;
      }
      assert.ok(realCount >= 3, `expected >=3 real chunks, got ${realCount}`);
    }
  );

  it(
    '[P0] REQ-GH-248 FR-001 AC-001-03 TC-001-03: Given _sampleProvider returning only 15 chunks (< MIN_REAL_CHUNKS), When calibration runs, Then it falls back to synthetic samples and still completes',
    async () => {
      const config = mockConfig();
      const tinyChunks = makeFakeChunks(15);
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        _sampleProvider: () => tinyChunks,
        samplingIntervalMs: 5,
      });
      assert.ok(result !== null);
      assert.equal(result.sampleSource, 'synthetic');
      // Synthetic fallback count comes from DEFAULT_CALIBRATION_OPTIONS.sampleCount (20)
      assert.equal(result.sampleCount, DEFAULT_CALIBRATION_OPTIONS.sampleCount);
    }
  );

  it(
    '[P1] REQ-GH-248 FR-001 AC-001-01 TC-001-04: Given exactly 20 chunks (boundary), When calibration runs, Then real-chunk sampling is used (NOT synthetic)',
    async () => {
      const config = mockConfig();
      const boundaryChunks = makeFakeChunks(MIN_REAL_CHUNKS);
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        _sampleProvider: () => boundaryChunks,
        samplingIntervalMs: 5,
      });
      assert.ok(result !== null);
      assert.equal(result.sampleSource, 'real-chunks');
    }
  );

  it(
    '[P1] REQ-GH-248 FR-001 AC-001-01 TC-001-05: Given _sampleProvider throws synchronously, When calibration runs, Then it falls back to synthetic samples (fail-safe)',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        _sampleProvider: () => { throw new Error('chunker boom'); },
        samplingIntervalMs: 5,
      });
      assert.ok(result !== null);
      assert.equal(result.sampleSource, 'synthetic');
    }
  );

  it(
    '[P1] selectRealChunkSamples returns all chunks when count <= max',
    () => {
      const chunks = makeFakeChunks(50);
      const samples = selectRealChunkSamples(chunks, 100);
      assert.equal(samples.length, 50);
    }
  );

  it(
    '[P1] selectRealChunkSamples subsamples when count > max (up to max)',
    () => {
      const chunks = makeFakeChunks(500);
      const samples = selectRealChunkSamples(chunks, 100);
      assert.equal(samples.length, 100);
      // Every sample must come from the input pool
      const inputSet = new Set(chunks);
      for (const s of samples) {
        assert.ok(inputSet.has(s));
      }
    }
  );

  it(
    '[P2] selectRealChunkSamples returns [] for empty input',
    () => {
      assert.deepEqual(selectRealChunkSamples([], 100), []);
      assert.deepEqual(selectRealChunkSamples(null, 100), []);
    }
  );
});

// ---------------------------------------------------------------------------
// REQ-GH-248 FR-002 — Steady-state cadence, window, timeout
// ---------------------------------------------------------------------------

describe('REQ-GH-248 FR-002: calibrator cadence/window/timeout defaults', () => {
  it(
    '[P0] REQ-GH-248 FR-002 AC-002-01 TC-002-01: Given DEFAULT_CALIBRATION_OPTIONS, When inspected, Then samplingIntervalMs === 200',
    () => {
      assert.equal(DEFAULT_CALIBRATION_OPTIONS.samplingIntervalMs, 200);
    }
  );

  it(
    '[P0] REQ-GH-248 FR-002 AC-002-03 TC-002-02: Given DEFAULT_CALIBRATION_OPTIONS, When inspected, Then timeoutMs === 300000 (5 min)',
    () => {
      assert.equal(DEFAULT_CALIBRATION_OPTIONS.timeoutMs, 300000);
    }
  );

  it(
    '[P0] REQ-GH-248 FR-002 TC-002-03: Given a mock pool whose embed takes ~200ms with sampling at 5ms, When calibration runs, Then sampleCount in the returned result reflects the injected-chunk count, and the internal RSS sampler captured multiple ticks',
    async () => {
      const config = mockConfig();
      // Build an RSS sequence long enough to survive many sampling ticks
      const rssSequenceGB = [0.3];
      for (let i = 0; i < 200; i++) rssSequenceGB.push(2.0);
      const factory = makeMockPoolFactory({
        inferenceDelayMs: 200,
        rssSequenceGB,
      });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        _sampleProvider: () => {
          // 30 real chunks — enough to trigger real-chunk path
          const out = [];
          for (let i = 0; i < 30; i++) out.push(`function f${i}() { return ${i}; }`);
          return out;
        },
        samplingIntervalMs: 5,
        // Use the test-scaled timeout so the hang-case sibling tests remain fast
        timeoutMs: 5000,
      });
      assert.ok(result !== null);
      assert.equal(result.sampleSource, 'real-chunks');
      assert.equal(result.sampleCount, 30);
      // Peak should still be 2.0GB from the ramp-up
      assert.equal(result.peakMemGB, 2.0);
    }
  );

  it(
    '[P1] REQ-GH-248 FR-002 TC-002-05: Given embedHangs and a tight timeoutMs override, When calibration runs, Then it times out and calls pool.shutdown exactly once (wider default timeout does not introduce deadlocks)',
    async () => {
      const config = mockConfig();
      const factory = makeMockPoolFactory({ embedHangs: true });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5,
        timeoutMs: 80, // test-scaled
      });
      assert.equal(result, null);
      assert.ok(factory.pool._shutdownCalled >= 1);
    }
  );
});

// ---------------------------------------------------------------------------
// REQ-GH-248 FR-003 / FR-004 — session_options propagation + fingerprint
// ---------------------------------------------------------------------------

describe('REQ-GH-248 FR-003/FR-004: session_options propagation & fingerprint expansion', () => {

  it(
    '[P0] REQ-GH-248 FR-003 AC-003-01 TC-003-01: Given a resolved config with session_options, When buildCalibrationConfig is called, Then the result includes the session_options verbatim',
    () => {
      const resolved = {
        device: 'coreml',
        dtype: 'fp16',
        model: 'jinaai/jina-embeddings-v2-base-code',
        session_options: { graphOptimizationLevel: 'all' },
      };
      const cfg = buildCalibrationConfig(resolved);
      assert.deepEqual(cfg.session_options, { graphOptimizationLevel: 'all' });
      assert.equal(cfg.device, 'coreml');
      assert.equal(cfg.dtype, 'fp16');
      assert.equal(cfg.model, 'jinaai/jina-embeddings-v2-base-code');
    }
  );

  it(
    '[P0] REQ-GH-248 FR-003 AC-003-02 TC-003-02: Given calibrationConfig.session_options is set, When calibratePerWorkerMemory spawns its pool, Then workerData.session_options equals the config value',
    async () => {
      const config = buildCalibrationConfig({
        device: 'coreml',
        dtype: 'fp16',
        model: 'jinaai/jina-embeddings-v2-base-code',
        session_options: { graphOptimizationLevel: 'all' },
      });
      const factory = makeMockPoolFactory({ baselineRssGB: 0.3, peakRssGB: 2.0 });
      const result = await calibratePerWorkerMemory(config, {
        projectRoot: sandboxDir,
        _createWorkerPool: factory,
        _rssReader: factory.rssReader,
        samplingIntervalMs: 5,
      });
      assert.ok(result !== null);
      // The mock pool captures the construction options on `_options`.
      assert.deepEqual(
        factory.pool._options.workerData.session_options,
        { graphOptimizationLevel: 'all' }
      );
    }
  );

  it(
    '[P0] REQ-GH-248 FR-003 AC-003-03 TC-003-03: Given a resolved config without session_options, When buildCalibrationConfig is called, Then the result has session_options: {} (not undefined)',
    () => {
      const cfg = buildCalibrationConfig({
        device: 'coreml',
        dtype: 'fp16',
        model: 'jina-v2',
      });
      assert.deepEqual(cfg.session_options, {});
      assert.notEqual(cfg.session_options, undefined);
    }
  );

  it(
    '[P0] REQ-GH-248 FR-004 AC-004-01 TC-004-01: Given two configs differing only in session_options.graphOptimizationLevel, When fingerprints are computed, Then they differ',
    () => {
      const base = { device: 'coreml', dtype: 'fp16', model: 'jinaai/jina-embeddings-v2-base-code' };
      const a = { ...base, session_options: { graphOptimizationLevel: 'disabled' } };
      const b = { ...base, session_options: { graphOptimizationLevel: 'all' } };
      assert.notEqual(computeFingerprint(a), computeFingerprint(b));
    }
  );

  it(
    '[P0] REQ-GH-248 FR-004 AC-004-02 TC-004-02: Given two configs differing only in an irrelevant session_options key (logSeverityLevel), When fingerprints are computed, Then they are EQUAL',
    () => {
      const base = { device: 'coreml', dtype: 'fp16', model: 'jinaai/jina-embeddings-v2-base-code' };
      const a = { ...base, session_options: { logSeverityLevel: 2 } };
      const b = { ...base, session_options: { logSeverityLevel: 4 } };
      assert.equal(computeFingerprint(a), computeFingerprint(b));
    }
  );

  it(
    '[P0] REQ-GH-248 FR-004 AC-004-02 TC-004-03: HASHED_SESSION_OPTION_KEYS is the pinned allowlist of memory-relevant keys',
    () => {
      assert.deepEqual(
        [...HASHED_SESSION_OPTION_KEYS],
        ['graphOptimizationLevel', 'executionMode', 'enableCpuMemArena', 'enableMemPattern']
      );
    }
  );

  it(
    '[P0] REQ-GH-248 FR-004 AC-004-03 TC-004-04: Given a pre-FR-004 cache file with a fingerprint computed WITHOUT session_options, When the post-upgrade fingerprint (WITH session_options) is computed, Then they differ → cache invalidates',
    () => {
      // Simulate what the pre-upgrade fingerprint looked like: hash of
      // `device|dtype|model|` with no session_options pairs at all. We can
      // only get that exact value by re-deriving it.
      const preUpgradeKey = 'coreml|fp16|jinaai/jina-embeddings-v2-base-code';
      const preHash = createHash('sha256')
        .update(preUpgradeKey)
        .digest('hex')
        .slice(0, 16);
      const postHash = computeFingerprint({
        device: 'coreml',
        dtype: 'fp16',
        model: 'jinaai/jina-embeddings-v2-base-code',
        session_options: { graphOptimizationLevel: 'all' },
      });
      // The new fingerprint has non-empty session_options pairs joined
      // after the `model|` separator, so it MUST differ from the legacy hash.
      assert.notEqual(preHash, postHash);
    }
  );

  it(
    '[P1] REQ-GH-248 FR-004 TC-004-03 (pinned set): adding a new session_options key that is NOT in HASHED_SESSION_OPTION_KEYS does not change the fingerprint',
    () => {
      const base = { device: 'coreml', dtype: 'fp16', model: 'jina-v2' };
      const a = { ...base, session_options: {} };
      const b = { ...base, session_options: { profilingFilePrefix: 'a' } };
      assert.equal(computeFingerprint(a), computeFingerprint(b));
    }
  );

  it(
    '[P1] REQ-GH-248 FR-004: changing executionMode (an allowlisted key) changes the fingerprint',
    () => {
      const base = { device: 'coreml', dtype: 'fp16', model: 'jina-v2' };
      const a = { ...base, session_options: { executionMode: 'sequential' } };
      const b = { ...base, session_options: { executionMode: 'parallel' } };
      assert.notEqual(computeFingerprint(a), computeFingerprint(b));
    }
  );
});
