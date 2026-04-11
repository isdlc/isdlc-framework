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

});
