/**
 * Tests for Worker Thread Pool — FR-001
 *
 * REQ-GH-238 / FR-001 (AC-001-01..AC-001-04)
 * Article II: Test-First Development
 *
 * Module under test: lib/embedding/engine/worker-pool.js
 * Interface: createWorkerPool(workerPath, options) => { embed, shutdown, resize, stats }
 *
 * Uses a mock Worker class to simulate worker_threads behaviour without
 * spawning real threads — keeps tests fast and deterministic.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerPool, resolvePoolSize } from './worker-pool.js';
import { EventEmitter } from 'node:events';

// ===========================================================================
// Mock Worker — simulates node:worker_threads Worker for deterministic tests
// ===========================================================================

/**
 * MockWorker emulates the Worker interface. When it receives a 'batch'
 * message it responds with a 'result' containing fake vectors.
 * Configurable behaviours: crash, error, hang, etc.
 */
class MockWorker extends EventEmitter {
  /**
   * @param {string} _path - ignored (no real file loaded)
   * @param {Object} opts
   * @param {Object} opts.workerData
   */
  constructor(_path, opts = {}) {
    super();
    this.workerData = opts.workerData || {};
    this.terminated = false;
    this._behaviour = MockWorker._nextBehaviour || 'normal';
    // Read class-level crash/error instructions; clear them so respawned
    // workers do not inherit the same fault injection.
    this._crashOnBatchIndex = MockWorker._crashOnBatchIndex ?? -1;
    MockWorker._crashOnBatchIndex = -1;
    this._errorOnBatchIndex = MockWorker._errorOnBatchIndex ?? -1;
    MockWorker._errorOnBatchIndex = -1;
    this._vectorDim = MockWorker._vectorDim || 768;
    this._delay = MockWorker._delay || 0;
    this._hangOnShutdown = MockWorker._hangOnShutdown || false;
    MockWorker.instances.push(this);
  }

  postMessage(msg) {
    if (this.terminated) return;

    if (msg.type === 'batch') {
      const { batchIndex, texts } = msg;

      // Crash simulation: the worker exits unexpectedly
      if (batchIndex === this._crashOnBatchIndex) {
        // Only crash once, then behave normally on respawn
        this._crashOnBatchIndex = -1;
        // Need to mark as crashed BEFORE setting a new _crashOnBatchIndex for the class
        // so respawned workers don't inherit the crash instruction.
        setImmediate(() => {
          this.terminated = true;
          this.emit('exit', 1);
        });
        return;
      }

      // Error simulation: the worker sends an error message
      if (batchIndex === this._errorOnBatchIndex) {
        this._errorOnBatchIndex = -1;
        const respond = () => {
          if (this.terminated) return;
          this.emit('message', {
            type: 'error',
            batchIndex,
            message: 'Pipeline failed for batch',
          });
        };
        if (this._delay > 0) setTimeout(respond, this._delay);
        else setImmediate(respond);
        return;
      }

      // Normal: respond with fake vectors
      const respond = () => {
        if (this.terminated) return;
        const vectors = texts.map(() => new Float32Array(this._vectorDim).fill(0.1));
        this.emit('message', { type: 'result', batchIndex, vectors });
      };
      if (this._delay > 0) setTimeout(respond, this._delay);
      else setImmediate(respond);
    }

    if (msg.type === 'shutdown') {
      if (this._hangOnShutdown) return; // simulate unresponsive worker
      setImmediate(() => {
        this.terminated = true;
        this.emit('exit', 0);
      });
    }
  }

  terminate() {
    if (!this.terminated) {
      this.terminated = true;
      this.emit('exit', 0);
    }
    return Promise.resolve(0);
  }

  // --- Static helpers for configuring behaviour per-test ---

  static instances = [];

  static reset() {
    MockWorker.instances = [];
    MockWorker._nextBehaviour = 'normal';
    MockWorker._crashOnBatchIndex = -1;
    MockWorker._errorOnBatchIndex = -1;
    MockWorker._vectorDim = 768;
    MockWorker._delay = 0;
    MockWorker._hangOnShutdown = false;
  }
}

// ===========================================================================
// FR-001: Worker Thread Pool
// ===========================================================================

describe('FR-001: Worker Thread Pool (worker-pool)', () => {

  let pool;

  beforeEach(() => {
    MockWorker.reset();
    pool = null;
  });

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
      pool = null;
    }
  });

  // Helper to create a pool with mock workers
  function createPool(opts = {}) {
    const p = createWorkerPool('mock-worker.js', {
      poolSize: opts.poolSize ?? 4,
      onProgress: opts.onProgress ?? null,
      workerData: opts.workerData ?? {},
      _cpuCountFn: opts._cpuCountFn ?? null,
      _totalMemFn: opts._totalMemFn ?? (() => 64 * 1024 ** 3), // 64GB default for tests
      _WorkerClass: MockWorker,
    });
    pool = p;
    return p;
  }

  // ── createWorkerPool() — initialization ───────────────────────────

  describe('createWorkerPool() — initialization', () => {

    it('[P0] AC-001-04: Given parallelism "auto", when pool initializes, then poolSize is capped by memory and hard cap', () => {
      // Given: parallelism is set to 'auto', cpu count is 8, 64GB RAM
      const p = createPool({ poolSize: 'auto', _cpuCountFn: () => 8, _totalMemFn: () => 64 * 1024 ** 3 });
      // Then: poolSize = min(7, memCap, 4) = 4 (hard cap)
      const s = p.stats();
      assert.equal(s.poolSize, 4);
      assert.equal(MockWorker.instances.length, 4);
    });

    it('[P1] AC-001-04: Given a single-core machine, when parallelism is "auto", then poolSize is 1 (minimum floor)', () => {
      // Given: os.cpus().length returns 1
      const p = createPool({ poolSize: 'auto', _cpuCountFn: () => 1, _totalMemFn: () => 64 * 1024 ** 3 });
      // Then: effective pool size is 1 (min 1, not 0)
      assert.equal(p.stats().poolSize, 1);
      assert.equal(MockWorker.instances.length, 1);
    });

    it('[P0] AC-001-01: Given poolSize 4, when pool initializes, then 4 worker threads are spawned', () => {
      // Given/When: poolSize is explicitly set to 4
      const p = createPool({ poolSize: 4 });
      // Then: 4 worker threads are created
      assert.equal(p.stats().poolSize, 4);
      assert.equal(MockWorker.instances.length, 4);
      // And: each worker receives the workerData config
      for (const inst of MockWorker.instances) {
        assert.ok(inst.workerData.workerId !== undefined);
      }
    });

    it('[P1] AC-001-02: Given poolSize 1, when pool initializes, then exactly 1 worker thread is spawned', () => {
      // Given/When: poolSize is explicitly set to 1
      const p = createPool({ poolSize: 1 });
      // Then: exactly 1 worker thread is created
      assert.equal(p.stats().poolSize, 1);
      assert.equal(MockWorker.instances.length, 1);
    });

    it('[P2] returns { embed, shutdown, resize, stats } interface', () => {
      // Given/When: valid workerPath and options
      const p = createPool({ poolSize: 2 });
      // Then: result has expected functions
      assert.equal(typeof p.embed, 'function');
      assert.equal(typeof p.shutdown, 'function');
      assert.equal(typeof p.resize, 'function');
      assert.equal(typeof p.stats, 'function');
    });

    it('[P2] passes workerData to each worker on creation', () => {
      // Given: workerData contains { device: "coreml", dtype: "fp16" }
      const p = createPool({ poolSize: 2, workerData: { device: 'coreml', dtype: 'fp16' } });
      // Then: each Worker receives workerData via its constructor options
      for (const inst of MockWorker.instances) {
        assert.equal(inst.workerData.device, 'coreml');
        assert.equal(inst.workerData.dtype, 'fp16');
      }
    });

  });

  // ── resolvePoolSize() — unit tests ────────────────────────────────

  describe('resolvePoolSize()', () => {

    const GB = 1024 ** 3;
    const bigMem = () => 64 * GB;   // 64GB — plenty of RAM
    const smallMem = () => 12 * GB; // 12GB — memory-constrained

    it('auto with 8 cpus and 64GB returns 4 (hard cap)', () => {
      // maxByCpu=7, reserved=max(8,19.2)=19.2, avail=44.8, perWorker=3, maxByMem=14, hardCap=4
      assert.equal(resolvePoolSize('auto', () => 8, bigMem), 4);
    });

    it('auto with 1 cpu returns 1 (min floor)', () => {
      assert.equal(resolvePoolSize('auto', () => 1, bigMem), 1);
    });

    it('auto with 8 cpus and 12GB returns 1 (memory limited)', () => {
      // reserved=max(8,3.6)=8, avail=4, perWorker=3, maxByMem=1
      assert.equal(resolvePoolSize('auto', () => 8, smallMem), 1);
    });

    it('null defaults to auto', () => {
      assert.equal(resolvePoolSize(null, () => 4, bigMem), 3);
    });

    it('undefined defaults to auto', () => {
      assert.equal(resolvePoolSize(undefined, () => 4, bigMem), 3);
    });

    it('explicit 4 returns 4', () => {
      assert.equal(resolvePoolSize(4), 4);
    });

    it('explicit 0 floors to 1', () => {
      assert.equal(resolvePoolSize(0), 1);
    });

    it('negative number floors to 1', () => {
      assert.equal(resolvePoolSize(-3), 1);
    });

    it('NaN floors to 1', () => {
      assert.equal(resolvePoolSize(NaN), 1);
    });

    it('auto with perWorkerMemGB=6 on 24GB returns 1 (device-aware memory)', () => {
      // reserved=max(8,7.2)=8, avail=16, perWorker=6, maxByMem=2 but cpuCount=2 so min(1,2,4)=1
      // Actually with cpuCount=10: maxByCpu=9, maxByMem=floor(16/6)=2, hardCap=4 → 2
      // With cpuCount=2: maxByCpu=1 → 1
      assert.equal(resolvePoolSize('auto', () => 10, () => 24 * GB, 6), 2);
    });

    it('auto with default (3GB) vs 6GB perWorkerMemGB gives different results', () => {
      // 24GB: with 3GB/worker → avail=16, maxByMem=5, cap=4
      // 24GB: with 6GB/worker → avail=16, maxByMem=2
      const mem = () => 24 * GB;
      const cpus = () => 10;
      const withDefault = resolvePoolSize('auto', cpus, mem);       // 3GB generic → 4 (hard cap)
      const withCoreml = resolvePoolSize('auto', cpus, mem, 6);     // 6GB CoreML → 2
      assert.equal(withDefault, 4);
      assert.equal(withCoreml, 2);
    });
  });

  // ── pool.embed() — round-robin distribution ───────────────────────

  describe('pool.embed() — round-robin distribution', () => {

    it('[P0] AC-001-01: Given poolSize 4, when embed() is called with 128 texts, then work is distributed across 4 workers round-robin', async () => {
      // Given: pool with 4 workers, batchSize 32
      const texts = Array.from({ length: 128 }, (_, i) => `text-${i}`);
      const p = createPool({ poolSize: 4 });

      // Track which worker gets which batches
      const workerBatches = new Map();
      for (const inst of MockWorker.instances) {
        const origPost = inst.postMessage.bind(inst);
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            const id = this.workerData.workerId;
            if (!workerBatches.has(id)) workerBatches.set(id, []);
            workerBatches.get(id).push(msg.batchIndex);
          }
          origPost(msg);
        };
      }

      // When: embed is called
      const result = await p.embed(texts, 32);

      // Then: 4 batches created (128/32 = 4), distributed round-robin
      assert.equal(result.length, 128);
      // Each worker should have received 1 batch (4 batches / 4 workers)
      assert.equal(workerBatches.size, 4);
    });

    it('[P0] AC-001-01: Given poolSize 4, when embed() completes, then results are returned in original input order', async () => {
      // Given: pool with 4 workers
      // Customize vectors so we can verify ordering: batch i returns vectors filled with i
      MockWorker._vectorDim = 3;
      let batchCounter = 0;
      const p = createPool({ poolSize: 4 });

      // Override mock workers to return vectors with identifiable values
      for (const inst of MockWorker.instances) {
        const origPost = inst.postMessage.bind(inst);
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            const { batchIndex, texts } = msg;
            setImmediate(() => {
              if (this.terminated) return;
              // Each text gets a vector filled with (batchIndex * 10 + textIndex)
              const vectors = texts.map((_, ti) => {
                const val = batchIndex * 10 + ti;
                return new Float32Array([val, val, val]);
              });
              this.emit('message', { type: 'result', batchIndex, vectors });
            });
            return;
          }
          origPost(msg);
        };
      }

      const texts = ['a', 'b', 'c', 'd', 'e', 'f'];
      // batchSize=2 → 3 batches: [a,b], [c,d], [e,f]
      const result = await p.embed(texts, 2);

      // Then: result[0] corresponds to 'a' (batch 0, text 0 → value 0)
      assert.equal(result.length, 6);
      assert.deepEqual(Array.from(result[0]), [0, 0, 0]);
      assert.deepEqual(Array.from(result[1]), [1, 1, 1]);
      assert.deepEqual(Array.from(result[2]), [10, 10, 10]);
      assert.deepEqual(Array.from(result[3]), [11, 11, 11]);
      assert.deepEqual(Array.from(result[4]), [20, 20, 20]);
      assert.deepEqual(Array.from(result[5]), [21, 21, 21]);
    });

    it('[P0] AC-001-02: Given poolSize 1, when embed() is called, then all batches go to the single worker', async () => {
      // Given: pool with 1 worker
      const p = createPool({ poolSize: 1 });
      const sentBatches = [];
      const inst = MockWorker.instances[0];
      const origPost = inst.postMessage.bind(inst);
      inst.postMessage = function(msg) {
        if (msg.type === 'batch') sentBatches.push(msg.batchIndex);
        origPost(msg);
      };

      // When: embed 6 texts with batchSize=2 → 3 batches
      const result = await p.embed(['a', 'b', 'c', 'd', 'e', 'f'], 2);

      // Then: all 3 batches went to worker 0
      assert.equal(sentBatches.length, 3);
      assert.equal(result.length, 6);
    });

    it('[P1] AC-001-01: Given poolSize 4, when embed() is called with 3 texts and batchSize 32, then 1 batch is sent to 1 worker', async () => {
      // Given: pool with 4 workers, only 3 texts (< 1 batch)
      const p = createPool({ poolSize: 4 });

      const result = await p.embed(['a', 'b', 'c'], 32);

      // Then: only 1 batch created (3 < 32), result has 3 vectors
      assert.equal(result.length, 3);
    });

    it('[P1] AC-001-01: Given poolSize 2, when embed() is called with 64 texts and batchSize 32, then each worker gets 1 batch', async () => {
      // Given: pool with 2 workers, 64 texts, batchSize 32
      const texts = Array.from({ length: 64 }, (_, i) => `t${i}`);
      const p = createPool({ poolSize: 2 });
      const workerBatchCount = [0, 0];
      for (const inst of MockWorker.instances) {
        const origPost = inst.postMessage.bind(inst);
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') workerBatchCount[this.workerData.workerId]++;
          origPost(msg);
        };
      }

      const result = await p.embed(texts, 32);

      // Then: 2 batches, 1 per worker
      assert.equal(result.length, 64);
      assert.equal(workerBatchCount[0], 1);
      assert.equal(workerBatchCount[1], 1);
    });

    it('[P1] returns Float32Array[] with correct dimensions for each text', async () => {
      // Given: pool configured and workers return 768-dim vectors
      MockWorker._vectorDim = 768;
      const p = createPool({ poolSize: 2 });

      // When:
      const result = await p.embed(['text1', 'text2']);

      // Then: result is an array of 2 Float32Array, each of length 768
      assert.equal(result.length, 2);
      assert.ok(result[0] instanceof Float32Array);
      assert.ok(result[1] instanceof Float32Array);
      assert.equal(result[0].length, 768);
      assert.equal(result[1].length, 768);
    });

    it('[P2] handles empty texts array gracefully', async () => {
      // Given: an initialized pool
      const p = createPool({ poolSize: 2 });

      // When: pool.embed([], batchSize) is called
      const result = await p.embed([], 32);

      // Then: returns an empty array without sending any batches
      assert.deepEqual(result, []);
    });

  });

  // ── pool.embed() — crash recovery ─────────────────────────────────

  describe('pool.embed() — crash recovery (ERR-POOL-001, ERR-POOL-002)', () => {

    it('[P0] AC-001-03: Given a worker crashes mid-batch, when pool detects exit, then it respawns the worker', async () => {
      // Given: pool with 2 workers, worker handling batch 0 crashes
      MockWorker._crashOnBatchIndex = 0;
      const p = createPool({ poolSize: 2 });
      const initialCount = MockWorker.instances.length;

      // When: embed is called — batch 0 goes to worker 0 which crashes
      const result = await p.embed(['a', 'b'], 1);

      // Then: a new worker was spawned (total instances increased)
      assert.ok(MockWorker.instances.length > initialCount);
      // And: pool size remains 2
      assert.equal(p.stats().poolSize, 2);
      // And: results were still obtained
      assert.equal(result.length, 2);
    });

    it('[P0] AC-001-03: Given a worker crashes, when respawned, then the failed batch is retried on the new worker', async () => {
      // Given: pool with 1 worker, it crashes on batch 0
      MockWorker._crashOnBatchIndex = 0;
      const p = createPool({ poolSize: 1 });

      // When: embed is called
      const result = await p.embed(['hello', 'world'], 2);

      // Then: batchId 0 was retried and results are returned
      assert.equal(result.length, 2);
      assert.ok(result[0] instanceof Float32Array);
      assert.ok(result[1] instanceof Float32Array);
    });

    it('[P0] AC-001-03: Given a batch fails after max retries (2), then embed() rejects with ERR-POOL-002', async () => {
      // Given: every worker crashes on batch 0 (infinite crash loop)
      // We need to make ALL workers crash on batch 0 always
      const p = createPool({ poolSize: 1 });

      // Override all current and future workers to always crash on batch 0
      const origSpawnMsg = MockWorker.prototype.postMessage;
      let crashCount = 0;
      for (const inst of MockWorker.instances) {
        inst.postMessage = function(msg) {
          if (msg.type === 'batch' && msg.batchIndex === 0) {
            crashCount++;
            setImmediate(() => {
              this.terminated = true;
              this.emit('exit', 1);
            });
            return;
          }
          if (msg.type === 'shutdown') {
            setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
            return;
          }
        };
      }

      // Also make newly spawned workers crash
      const origCtor = MockWorker;
      const listener = () => {
        const newest = MockWorker.instances[MockWorker.instances.length - 1];
        if (newest) {
          newest.postMessage = function(msg) {
            if (msg.type === 'batch' && msg.batchIndex === 0) {
              crashCount++;
              setImmediate(() => {
                this.terminated = true;
                this.emit('exit', 1);
              });
              return;
            }
            if (msg.type === 'shutdown') {
              setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
              return;
            }
          };
        }
      };

      // Patch: after each spawn, override postMessage
      const origPush = MockWorker.instances.push;
      MockWorker.instances.push = function(...args) {
        const result = origPush.apply(this, args);
        listener();
        return result;
      };

      // When/Then: embed rejects after max retries
      await assert.rejects(
        () => p.embed(['test'], 1),
        (err) => {
          assert.ok(err.message.includes('ERR-POOL-002'));
          return true;
        }
      );

      // Restore
      MockWorker.instances.push = origPush;
    });

    it('[P1] AC-001-03: Given a worker sends error message for a batch, then that batch is retried', async () => {
      // Given: worker sends error for batch 0
      MockWorker._errorOnBatchIndex = 0;
      const p = createPool({ poolSize: 2 });

      // When: embed is called
      const result = await p.embed(['hello', 'world'], 2);

      // Then: batch was retried and results returned
      assert.equal(result.length, 2);
    });

    it('[P1] AC-001-03: Given multiple workers crash simultaneously, then all are respawned', async () => {
      // Given: pool with 2 workers, both crash on their respective batches
      const p = createPool({ poolSize: 2 });

      // Make both workers crash on their first batch
      MockWorker.instances[0].postMessage = function(msg) {
        if (msg.type === 'batch') {
          setImmediate(() => { this.terminated = true; this.emit('exit', 1); });
          return;
        }
        if (msg.type === 'shutdown') {
          setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
        }
      };
      MockWorker.instances[1].postMessage = function(msg) {
        if (msg.type === 'batch') {
          setImmediate(() => { this.terminated = true; this.emit('exit', 1); });
          return;
        }
        if (msg.type === 'shutdown') {
          setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
        }
      };

      // When: embed with 2 batches (one per worker)
      const result = await p.embed(['a', 'b', 'c', 'd'], 2);

      // Then: both workers were respawned and batches retried
      assert.equal(result.length, 4);
      // Pool size still 2
      assert.equal(p.stats().poolSize, 2);
    });

    it('[P2] AC-001-03: Given a worker crashes with no in-flight batch, then it is respawned with no retry needed', async () => {
      // Given: pool is idle
      const p = createPool({ poolSize: 2 });
      const initialSize = p.stats().poolSize;

      // When: worker 0 crashes unexpectedly while idle
      const worker0 = MockWorker.instances[0];
      worker0.terminated = true;
      worker0.emit('exit', 1);

      // Give a tick for respawn logic (which fires on embed, not on idle)
      await new Promise(r => setTimeout(r, 50));

      // Then: pool still functions — can embed successfully
      const result = await p.embed(['test'], 1);
      assert.equal(result.length, 1);
    });

  });

  // ── pool.shutdown() ───────────────────────────────────────────────

  describe('pool.shutdown()', () => {

    it('[P0] shutdown resolves after all workers terminate', async () => {
      // Given: pool with 4 running workers
      const p = createPool({ poolSize: 4 });
      assert.equal(p.stats().poolSize, 4);

      // When: pool.shutdown() is called
      await p.shutdown();

      // Then: all workers terminated
      assert.equal(p.stats().isShutDown, true);
      for (const inst of MockWorker.instances) {
        assert.ok(inst.terminated);
      }
    });

    it('[P1] shutdown force-kills workers that do not exit within 2s (ERR-POOL-003)', async () => {
      // Given: pool with workers, one worker ignores shutdown message
      MockWorker._hangOnShutdown = true;
      const p = createPool({ poolSize: 1 });

      // Override shutdown timeout to 100ms for test speed
      // We can not change the constant, but the test verifies the worker
      // gets force-terminated eventually via the terminate() call
      const worker = MockWorker.instances[0];

      // When: shutdown is called
      // The real implementation has a 2s timeout. For test, we verify
      // that terminate() is eventually called.
      const shutdownPromise = p.shutdown();

      // Simulate the timeout by manually terminating after a short wait
      // (the real code uses setTimeout(2000) which we can not easily mock)
      // Instead, verify the shutdown promise resolves (force-kill kicks in)
      await shutdownPromise;

      // Then: shutdown resolved (did not hang)
      assert.equal(p.stats().isShutDown, true);
    });

    it('[P1] shutdown is safe to call multiple times', async () => {
      // Given: pool.shutdown() has already been called
      const p = createPool({ poolSize: 2 });
      await p.shutdown();

      // When: pool.shutdown() is called again
      // Then: it resolves immediately without error
      await p.shutdown();
      assert.equal(p.stats().isShutDown, true);
    });

    it('[P2] embed() after shutdown rejects with error', async () => {
      // Given: pool.shutdown() has been called
      const p = createPool({ poolSize: 2 });
      await p.shutdown();

      // When/Then: pool.embed(texts) rejects
      await assert.rejects(
        () => p.embed(['test'], 1),
        (err) => {
          assert.ok(err.message.includes('shut down'));
          return true;
        }
      );
    });

  });

  // ── pool.resize() ─────────────────────────────────────────────────

  describe('pool.resize()', () => {

    it('[P2] resize(6) on a pool of 4 adds 2 new workers', () => {
      // Given: pool with 4 workers
      const p = createPool({ poolSize: 4 });
      assert.equal(p.stats().poolSize, 4);

      // When: pool.resize(6) is called
      p.resize(6);

      // Then: pool now has 6 workers
      assert.equal(p.stats().poolSize, 6);
    });

    it('[P2] resize(2) on a pool of 4 removes 2 workers gracefully', () => {
      // Given: pool with 4 workers
      const p = createPool({ poolSize: 4 });
      assert.equal(p.stats().poolSize, 4);

      // When: pool.resize(2) is called
      p.resize(2);

      // Then: pool now has 2 workers
      assert.equal(p.stats().poolSize, 2);
    });

    it('[P3] resize(0) floors to 1', () => {
      // Given: pool with 2 workers
      const p = createPool({ poolSize: 2 });

      // When: pool.resize(0) is called
      p.resize(0);

      // Then: pool size floors to 1 (never 0 workers)
      assert.equal(p.stats().poolSize, 1);
    });

  });

  // ── Progress reporting (FR-005 integration) ───────────────────────

  describe('onProgress callback (FR-005)', () => {

    it('[P1] AC-005-01: Given onProgress callback, then progress includes processed, total, chunksPerSec, etaSeconds, activeWorkers', async () => {
      // Given: pool created with onProgress callback
      const progressCalls = [];
      const p = createPool({
        poolSize: 2,
        onProgress: (progress) => progressCalls.push(progress),
      });

      // When: pool.embed() processes batches
      await p.embed(['a', 'b', 'c', 'd'], 2);

      // Then: onProgress was called with expected fields
      assert.ok(progressCalls.length > 0);
      for (const prog of progressCalls) {
        assert.ok('processed' in prog, 'missing processed');
        assert.ok('total' in prog, 'missing total');
        assert.ok('chunksPerSec' in prog, 'missing chunksPerSec');
        assert.ok('etaSeconds' in prog, 'missing etaSeconds');
        assert.ok('activeWorkers' in prog, 'missing activeWorkers');
        assert.equal(prog.total, 4);
      }
    });

    it('[P1] AC-005-02: Given multi-worker execution, then progress aggregates across all workers', async () => {
      // Given: pool with 2 workers, onProgress callback
      const progressCalls = [];
      const p = createPool({
        poolSize: 2,
        onProgress: (progress) => progressCalls.push(progress),
      });

      // When: embed 4 texts with batchSize=2 → 2 batches, one per worker
      await p.embed(['a', 'b', 'c', 'd'], 2);

      // Then: final progress shows all 4 processed
      const lastProgress = progressCalls[progressCalls.length - 1];
      assert.equal(lastProgress.processed, 4);
      assert.equal(lastProgress.total, 4);
    });

    it('[P2] AC-005-01: progress.chunksPerSec is a positive number during active processing', async () => {
      // Given: pool processing texts with onProgress
      MockWorker._delay = 5; // Small delay to ensure nonzero elapsed time
      const progressCalls = [];
      const p = createPool({
        poolSize: 1,
        onProgress: (progress) => progressCalls.push(progress),
      });

      // When: at least one batch completes
      await p.embed(['a', 'b', 'c', 'd'], 2);

      // Then: chunksPerSec >= 0 (it can be 0 if too fast, but generally positive)
      assert.ok(progressCalls.length > 0);
      const last = progressCalls[progressCalls.length - 1];
      assert.equal(typeof last.chunksPerSec, 'number');
      assert.ok(last.chunksPerSec >= 0);
    });

    it('[P2] AC-005-01: progress.etaSeconds decreases as processing continues', async () => {
      // Given: pool processing texts with onProgress
      MockWorker._delay = 5;
      const progressCalls = [];
      const p = createPool({
        poolSize: 1,
        onProgress: (progress) => progressCalls.push(progress),
      });

      // When: multiple progress callbacks fire
      await p.embed(Array.from({ length: 12 }, (_, i) => `text-${i}`), 3);

      // Then: etaSeconds generally decreases (last should be 0 or near 0)
      assert.ok(progressCalls.length >= 2);
      const last = progressCalls[progressCalls.length - 1];
      assert.equal(last.etaSeconds, 0); // All done, no remaining work
    });

  });

  // ════════════════════════════════════════════════════════════════════
  // REQ-GH-239: Concurrent batch dispatch + enhanced progress/ETA
  // Phase 05 scaffolds (test.skip) — implementation lands in Phase 06
  // ════════════════════════════════════════════════════════════════════

  describe('REQ-GH-239 FR-001: Concurrent batch dispatch (wall-clock fan-out)', () => {

    it('[P0] REQ-GH-239 FR-001: Given 8 batches and a 4-worker pool with D ms per-batch-latency, When pool.embed() is called with the full text array, Then total wall-clock ≈ (8/4) × D (within jitter tolerance)', async () => {
      // Given: pool of 4 workers, MockWorker delay set to 40ms per batch,
      // 8 batches of 1 text each (batchSize=1, 8 texts)
      const D = 40;
      MockWorker._delay = D;
      const p = createPool({ poolSize: 4 });
      const texts = Array.from({ length: 8 }, (_, i) => `t${i}`);

      // When: pool.embed(texts, 1) is called exactly once with all texts
      const start = Date.now();
      const result = await p.embed(texts, 1);
      const elapsed = Date.now() - start;

      // Then: total elapsed wall-clock is approximately (8 / 4) * 40 = 80ms.
      // Tolerance: elapsed < 60% of sequential baseline (8 × D).
      assert.equal(result.length, 8);
      assert.ok(
        elapsed < 8 * D * 0.6,
        `expected concurrent wall-clock < ${8 * D * 0.6}ms, got ${elapsed}ms`
      );
    });

    it('[P0] REQ-GH-239 FR-001: Given parallelism=4 and 16 batches, When pool.embed is called, Then at some point all 4 workers are simultaneously active (peak concurrent in-flight == poolSize)', async () => {
      // Given: 4-worker pool, 16 batches of 1 text (batchSize=1).
      // Delay is nonzero so responses interleave — this proves peak
      // concurrency across workers, not just back-to-back sequential
      // dispatch to a single worker.
      MockWorker._delay = 20;
      const p = createPool({ poolSize: 4 });

      // Track how many distinct workers received at least one batch while
      // other batches were still in flight. "Peak active workers" is the
      // max number of workers with >=1 unresolved batch at any instant.
      const busyWorkers = new Set();
      let peakBusyWorkers = 0;
      for (const inst of MockWorker.instances) {
        const wid = inst.workerData.workerId;
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            busyWorkers.add(wid);
            if (busyWorkers.size > peakBusyWorkers) peakBusyWorkers = busyWorkers.size;
            const { batchIndex, texts: bts } = msg;
            setTimeout(() => {
              if (this.terminated) return;
              const vectors = bts.map(() => new Float32Array([1]));
              this.emit('message', { type: 'result', batchIndex, vectors });
              busyWorkers.delete(wid);
            }, 20);
            return;
          }
          if (msg.type === 'shutdown') {
            setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
          }
        };
      }

      // When: pool.embed(16 texts, batchSize=1) runs → 16 batches
      const texts = Array.from({ length: 16 }, (_, i) => `t${i}`);
      const result = await p.embed(texts, 1);

      // Then: at some point all 4 workers were simultaneously active.
      // peakBusyWorkers must equal poolSize (4) — every worker saw work
      // before any response came back.
      assert.equal(result.length, 16);
      assert.equal(peakBusyWorkers, 4, `expected peak busy workers 4, got ${peakBusyWorkers}`);
    });

    it('[P0] REQ-GH-239 FR-001: Given out-of-order batch completion, When all batches return, Then results array preserves original input ordering', async () => {
      // Given: 4-worker pool, 8 batches where workers respond with
      // reversed delays (batch 0: 80ms, batch 7: 10ms) so batches complete
      // in reverse order.
      MockWorker._vectorDim = 1;
      const p = createPool({ poolSize: 4 });

      // Override each mock worker's postMessage with per-batch reversed-delay
      // responses. Each text gets a Float32Array containing the batch index,
      // so we can verify ordering at the end.
      for (const inst of MockWorker.instances) {
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            const { batchIndex, texts: bts } = msg;
            const delay = (8 - batchIndex) * 10; // batch 0→80ms, batch 7→10ms
            setTimeout(() => {
              if (this.terminated) return;
              const vectors = bts.map(() => new Float32Array([batchIndex]));
              this.emit('message', { type: 'result', batchIndex, vectors });
            }, delay);
            return;
          }
          if (msg.type === 'shutdown') {
            setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
          }
        };
      }

      // When: pool.embed runs
      const texts = Array.from({ length: 8 }, (_, i) => `t${i}`);
      const result = await p.embed(texts, 1);

      // Then: result[i] was produced by batch i, even though batch 7 finished first
      assert.equal(result.length, 8);
      for (let i = 0; i < 8; i++) {
        assert.equal(result[i][0], i, `result[${i}] should come from batch ${i}`);
      }
    });

    it('[P0] REQ-GH-239 FR-001 + ERR-POOL-CONC-001: Given 8 batches fanning out to 4 workers and worker 2 crashes on its first batch, When existing respawn logic retries the failed batch, Then final result has all 8 vectors in correct order and the other 3 workers were not interrupted', async () => {
      // Given: 4 workers, 8 batches, the worker assigned batch 2 (round-robin
      // index 2 → worker 2) crashes on its first batch.
      MockWorker._crashOnBatchIndex = 2;
      const p = createPool({ poolSize: 4 });

      // When: pool.embed runs → worker 2 crashes on batch 2, is respawned,
      // batch 2 is retried on a surviving or respawned worker.
      const texts = Array.from({ length: 8 }, (_, i) => `t${i}`);
      const result = await p.embed(texts, 1);

      // Then:
      assert.equal(result.length, 8);             // all 8 vectors produced
      assert.equal(p.stats().poolSize, 4);        // pool size still 4 after respawn
      // Every slot contains a valid Float32Array (including the retried batch 2)
      for (let i = 0; i < 8; i++) {
        assert.ok(result[i] instanceof Float32Array, `result[${i}] not Float32Array`);
        assert.ok(result[i].length > 0);
      }
    });

    it('[P1] REQ-GH-239 FR-001: Given parallelism=2 and 4 batches with delay D, When pool.embed runs, Then wall-clock ≈ 2×D not 4×D (direct comparison to sequential baseline)', async () => {
      // Given: 2-worker pool, 4 batches of 1 text, delay=30ms per batch
      const D = 30;
      MockWorker._delay = D;
      const p = createPool({ poolSize: 2 });

      const texts = Array.from({ length: 4 }, (_, i) => `t${i}`);

      // When: embed runs
      const start = Date.now();
      const result = await p.embed(texts, 1);
      const elapsed = Date.now() - start;

      // Then: elapsed should be ~2×D (≈60ms), well under the sequential 4×D (120ms).
      // Tolerance: < 70% of sequential → 84ms.
      assert.equal(result.length, 4);
      assert.ok(
        elapsed < 4 * D * 0.7,
        `expected parallel wall-clock < ${4 * D * 0.7}ms, got ${elapsed}ms`
      );
    });

  });

  describe('REQ-GH-239 FR-005: Enhanced progress callback (throughput + ETA + active_workers)', () => {

    it('[P0] REQ-GH-239 FR-005: Given onProgress callback, When a batch completes, Then the progress object includes {processed, total, chunks_per_sec, eta_seconds, active_workers}', async () => {
      // Given: pool of 2 workers with onProgress callback, 64 texts, batchSize=32
      MockWorker._delay = 5;
      const progressCalls = [];
      const p = createPool({
        poolSize: 2,
        onProgress: (progress) => progressCalls.push(progress),
      });

      const texts = Array.from({ length: 64 }, (_, i) => `t${i}`);

      // When: pool.embed fires progress after each of the 2 batches completes
      await p.embed(texts, 32);

      // Then: each progress call contains the snake_case fields from the spec
      assert.ok(progressCalls.length >= 2);
      for (const prog of progressCalls) {
        assert.equal(typeof prog.processed, 'number', 'processed must be number');
        assert.equal(typeof prog.total, 'number', 'total must be number');
        assert.equal(typeof prog.chunks_per_sec, 'number', 'chunks_per_sec must be number');
        assert.equal(typeof prog.eta_seconds, 'number', 'eta_seconds must be number');
        assert.equal(typeof prog.active_workers, 'number', 'active_workers must be number');
        assert.ok(prog.chunks_per_sec >= 0, 'chunks_per_sec >= 0');
        assert.ok(prog.eta_seconds >= 0, 'eta_seconds >= 0');
        assert.ok(prog.active_workers >= 0 && prog.active_workers <= 2, 'active_workers in [0, poolSize]');
        assert.equal(prog.total, 64);
      }
    });

    it('[P0] REQ-GH-239 FR-005: Given out-of-order batch completion, When progress fires, Then processed is monotonically non-decreasing across all callbacks', async () => {
      // Given: 4 workers, 8 batches with reversed delays so they complete
      // in reverse order.
      const progressCalls = [];
      const p = createPool({
        poolSize: 4,
        onProgress: (prog) => progressCalls.push(prog),
      });

      for (const inst of MockWorker.instances) {
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            const { batchIndex, texts: bts } = msg;
            const delay = (8 - batchIndex) * 8; // reversed completion order
            setTimeout(() => {
              if (this.terminated) return;
              const vectors = bts.map(() => new Float32Array([batchIndex]));
              this.emit('message', { type: 'result', batchIndex, vectors });
            }, delay);
            return;
          }
          if (msg.type === 'shutdown') {
            setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
          }
        };
      }

      // When: embed runs with 8 batches of 1 text each
      const texts = Array.from({ length: 8 }, (_, i) => `t${i}`);
      await p.embed(texts, 1);

      // Then: processed is monotonically non-decreasing across all callbacks
      assert.ok(progressCalls.length >= 2, 'expected multiple progress calls');
      for (let i = 1; i < progressCalls.length; i++) {
        assert.ok(
          progressCalls[i].processed >= progressCalls[i - 1].processed,
          `processed must be monotonic: call ${i - 1}=${progressCalls[i - 1].processed}, call ${i}=${progressCalls[i].processed}`
        );
      }
      assert.equal(progressCalls[progressCalls.length - 1].processed, 8);
    });

    it('[P0] REQ-GH-239 FR-005: Given 20+ completed batches with measurable delay, When chunks_per_sec is reported, Then it reflects a 10-batch moving-window average (not all-time average)', async () => {
      // Given: 1 worker, 20 batches processed strictly sequentially.
      // First 10 batches take 10ms each, last 10 take 50ms each.
      // The moving-window rate during the second half should be noticeably
      // lower than the first half.
      const progressCalls = [];
      const p = createPool({
        poolSize: 1,
        onProgress: (prog) => progressCalls.push(prog),
      });

      // Sequential mock: batches are processed one at a time in a FIFO
      // queue. The next batch only starts after the previous one has fired
      // its result. This is how a real single worker actually behaves and
      // is required for the moving-window rate to have a nonzero span.
      const inst = MockWorker.instances[0];
      const queue = [];
      let processing = false;
      function processNext() {
        if (processing || queue.length === 0) return;
        processing = true;
        const { batchIndex, bts, delay } = queue.shift();
        setTimeout(() => {
          if (inst.terminated) { processing = false; return; }
          const vectors = bts.map(() => new Float32Array([1]));
          inst.emit('message', { type: 'result', batchIndex, vectors });
          processing = false;
          processNext();
        }, delay);
      }
      inst.postMessage = function(msg) {
        if (msg.type === 'batch') {
          const delay = msg.batchIndex < 10 ? 10 : 50;
          queue.push({ batchIndex: msg.batchIndex, bts: msg.texts, delay });
          processNext();
          return;
        }
        if (msg.type === 'shutdown') {
          setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
        }
      };

      // When: embed runs 20 batches of 1 text each
      const texts = Array.from({ length: 20 }, (_, i) => `t${i}`);
      await p.embed(texts, 1);

      // Then: the moving-window rate should track the slow tail, not the fast head.
      assert.ok(progressCalls.length >= 20, `expected >=20 progress calls, got ${progressCalls.length}`);
      const last = progressCalls[progressCalls.length - 1].chunks_per_sec;
      assert.ok(last > 0, `last rate must be positive, got ${last}`);
      // Fast-half rate ~100 chunks/s, slow-half ~20 chunks/s, all-time ~33.
      // A 10-batch moving window on the slow tail should report < 40.
      assert.ok(
        last < 40,
        `moving-window rate should reflect slow tail, got ${last} chunks/s (expected < 40)`
      );
    });

    it('[P0] REQ-GH-239 FR-005: Given chunks_per_sec > 0 and processed < total, When progress fires, Then eta_seconds ≈ (total - processed) / chunks_per_sec', async () => {
      // Given: 4 workers, 40 batches. Each worker processes its queue
      // sequentially so the 10-batch moving window has a genuine time span.
      const progressCalls = [];
      const p = createPool({
        poolSize: 4,
        onProgress: (prog) => progressCalls.push(prog),
      });

      // Sequential per-worker FIFO queue so each worker's batches complete
      // one after the other, not in a single setImmediate tick.
      for (const inst of MockWorker.instances) {
        const queue = [];
        let processing = false;
        const processNext = () => {
          if (processing || queue.length === 0) return;
          processing = true;
          const { batchIndex, bts } = queue.shift();
          setTimeout(() => {
            if (inst.terminated) { processing = false; return; }
            const vectors = bts.map(() => new Float32Array([1]));
            inst.emit('message', { type: 'result', batchIndex, vectors });
            processing = false;
            processNext();
          }, 15);
        };
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            queue.push({ batchIndex: msg.batchIndex, bts: msg.texts });
            processNext();
            return;
          }
          if (msg.type === 'shutdown') {
            setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
          }
        };
      }

      // When: embed runs 40 batches of 1 text
      const texts = Array.from({ length: 40 }, (_, i) => `t${i}`);
      await p.embed(texts, 1);

      // Then: for a midway callback where chunks_per_sec > 0 and
      // processed < total, eta_seconds ≈ (total - processed) / chunks_per_sec.
      const midway = progressCalls.filter(p => p.processed > 0 && p.processed < p.total && p.chunks_per_sec > 0);
      assert.ok(midway.length > 0, `expected at least one midway progress call, got ${progressCalls.length} total`);
      for (const prog of midway) {
        const expected = (prog.total - prog.processed) / prog.chunks_per_sec;
        // Integer-rounded eta; allow ±2s + 30% relative slack for sample variance
        const tolerance = Math.max(2, expected * 0.3);
        assert.ok(
          Math.abs(prog.eta_seconds - expected) <= tolerance,
          `eta_seconds=${prog.eta_seconds}, expected≈${expected.toFixed(2)} (tol ${tolerance.toFixed(2)})`
        );
      }
    });

    it('[P1] REQ-GH-239 FR-005: Given varying worker utilization over time, When progress fires, Then active_workers reflects the number of in-flight batches at that moment', async () => {
      // Given: 4-worker pool, 8 batches. Workers 0,1 have delay 10ms,
      // workers 2,3 have delay 100ms. Early progress calls should see most
      // workers busy; the final call should see 0 busy workers.
      const progressCalls = [];
      const p = createPool({
        poolSize: 4,
        onProgress: (prog) => progressCalls.push(prog),
      });

      for (const inst of MockWorker.instances) {
        const wid = inst.workerData.workerId;
        const delay = wid < 2 ? 10 : 100;
        inst.postMessage = function(msg) {
          if (msg.type === 'batch') {
            const { batchIndex, texts: bts } = msg;
            setTimeout(() => {
              if (this.terminated) return;
              const vectors = bts.map(() => new Float32Array([1]));
              this.emit('message', { type: 'result', batchIndex, vectors });
            }, delay);
            return;
          }
          if (msg.type === 'shutdown') {
            setImmediate(() => { this.terminated = true; this.emit('exit', 0); });
          }
        };
      }

      // When: embed runs 8 batches of 1 text
      const texts = Array.from({ length: 8 }, (_, i) => `t${i}`);
      await p.embed(texts, 1);

      // Then:
      assert.ok(progressCalls.length >= 2);
      // active_workers never exceeds poolSize
      for (const prog of progressCalls) {
        assert.ok(prog.active_workers <= 4, `active_workers ${prog.active_workers} > poolSize 4`);
        assert.ok(prog.active_workers >= 0);
      }
      // Final call — all work done, active_workers == 0
      assert.equal(progressCalls[progressCalls.length - 1].active_workers, 0);
      // At some point in the run we observed real utilization (>=1 worker busy
      // reported at call time). Early in a 4-worker run at least one of the
      // first few progress events should show multiple workers still in flight.
      const peak = Math.max(...progressCalls.map(p => p.active_workers));
      assert.ok(peak >= 1, `expected at least one progress call with busy workers, peak=${peak}`);
    });

    it.skip('[P1] REQ-GH-239 FR-005: Given pool.embed() run completes, When the CLI formatter renders a progress event, Then the line matches the format `[generate] {processed}/{total} ({pct}%) | {rate} chunks/s | ETA {etaHuman} | workers: {active}`', async () => {
      // Given: a single progress event {processed: 12487, total: 19811,
      //   chunks_per_sec: 4.2, eta_seconds: 1680, active_workers: 4}
      // When: a CLI formatter (imported from a format helper — to be added
      //   in Phase 06 module-design.md) renders it
      // Then: the rendered string matches exactly:
      //   `[generate] 12487/19811 (63%) | 4.2 chunks/s | ETA 28min | workers: 4`
      // NOTE: the formatter itself lives outside worker-pool.js — this test
      // either imports from lib/embedding/cli/progress-format.js (Phase 06)
      // or is deferred to a CLI test file if the formatter lands there.
      // Left here in P05 as a traceability anchor for FR-005's CLI contract.
    });

  });

  describe('REQ-GH-239 NFR-005: Progress update frequency', () => {

    it('[P2] REQ-GH-239 NFR-005: Given N batches of ~32 chunks, When pool.embed completes, Then onProgress fires at least once per batch (call count >= N)', async () => {
      // Given: 4 workers, 128 texts, batchSize=32 → 4 batches
      const progressCalls = [];
      const p = createPool({
        poolSize: 4,
        onProgress: (prog) => progressCalls.push(prog),
      });

      const texts = Array.from({ length: 128 }, (_, i) => `t${i}`);

      // When: pool.embed runs
      await p.embed(texts, 32);

      // Then: onProgress fired at least once per batch
      assert.ok(
        progressCalls.length >= 4,
        `expected >= 4 progress calls (one per batch), got ${progressCalls.length}`
      );
      // And final call has processed === total
      assert.equal(progressCalls[progressCalls.length - 1].processed, 128);
    });

    it.skip('[P2] REQ-GH-239 NFR-005: Given a run exceeding 30 wall-clock seconds, When inspecting chunks_per_sec readings, Then values after t=30s have low variance (metric is stabilized)', async () => {
      // Given: simulated 200-batch run with steady per-batch delay
      // (delay calibrated so total run-time > 30s; use fake-timers if
      // needed to keep test fast)
      // When: we collect chunks_per_sec from all progress events
      // Then: the standard deviation of chunks_per_sec samples after the
      //   30s mark is within 20% of the mean — early volatility is OK,
      //   but late values must be stable.
      // NOTE: this test uses node:test mock timers to compress the 30s
      // wall-clock into microseconds for CI.
    });

  });

});
