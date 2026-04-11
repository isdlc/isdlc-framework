/**
 * Worker Thread Pool — manage N worker threads for parallel embedding inference.
 *
 * Distributes text batches round-robin across a pool of worker threads,
 * collects results in original order, and handles crash recovery with
 * automatic respawn and retry.
 *
 * REQ-GH-238 / FR-001 (AC-001-01, AC-001-02, AC-001-03, AC-001-04)
 * REQ-GH-238 / FR-005 (progress reporting — legacy camelCase)
 * REQ-GH-239 / FR-001 (concurrent batch dispatch — preserved)
 * REQ-GH-239 / FR-005 (throughput + ETA progress callback, snake_case)
 * REQ-GH-239 / NFR-005 (progress update frequency — per-batch)
 *
 * @module lib/embedding/engine/worker-pool
 */

import { Worker } from 'node:worker_threads';
import os from 'node:os';

/** Maximum retry attempts for a failed batch (AC-001-03) */
const MAX_BATCH_RETRIES = 2;

/** Timeout (ms) for graceful shutdown before force-kill */
const SHUTDOWN_TIMEOUT_MS = 2000;

/** Generic per-worker memory estimate (GB) when device context is unavailable. */
const GENERIC_WORKER_MEM_GB = 3;

/** Hard cap on auto-resolved pool size — diminishing returns for embedding. */
const POOL_HARD_CAP = 4;

/** Minimum memory (GB) reserved for OS + main process. */
const POOL_RESERVED_GB = 8;

/**
 * Resolve effective pool size from the poolSize option.
 * 'auto' → min(cpus - 1, memory-based cap, hard cap).  (AC-001-04)
 * Explicit number is clamped to >= 1.
 *
 * @param {number|'auto'} poolSize
 * @param {function} [cpuCountFn] - injectable for testing
 * @param {function} [totalMemFn] - injectable for testing (returns bytes)
 * @param {number} [perWorkerMemGB] - device-specific memory per worker (GB); falls back to GENERIC_WORKER_MEM_GB
 * @returns {number}
 */
export function resolvePoolSize(poolSize, cpuCountFn, totalMemFn, perWorkerMemGB) {
  if (poolSize === 'auto' || poolSize === undefined || poolSize === null) {
    const cpuCount = cpuCountFn ? cpuCountFn() : os.cpus().length;
    const maxByCpu = Math.max(1, cpuCount - 1);

    const totalMemBytes = totalMemFn ? totalMemFn() : os.totalmem();
    const totalMemGB = totalMemBytes / (1024 ** 3);
    const reservedGB = Math.max(POOL_RESERVED_GB, totalMemGB * 0.3);
    const availableGB = totalMemGB - reservedGB;
    const perWorkerGB = perWorkerMemGB || GENERIC_WORKER_MEM_GB;
    const maxByMemory = Math.max(1, Math.floor(availableGB / perWorkerGB));

    return Math.min(maxByCpu, maxByMemory, POOL_HARD_CAP);
  }
  const n = Number(poolSize);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Create a worker thread pool for distributing embedding work.
 *
 * @param {string} workerPath - Path to the worker JS file (embedding-worker.js)
 * @param {Object} [options]
 * @param {number|'auto'} [options.poolSize='auto'] - Number of workers
 * @param {function} [options.onProgress] - Progress callback: ({ processed, total, chunksPerSec, etaSeconds, activeWorkers }) => void
 * @param {Object} [options.workerData={}] - Data passed to each worker thread on init
 * @param {function} [options._cpuCountFn] - Injected for testing (returns cpu count)
 * @param {function} [options._WorkerClass] - Injected for testing (Worker constructor substitute)
 * @returns {{ embed: function, shutdown: function, resize: function, stats: function }}
 */
export function createWorkerPool(workerPath, options = {}) {
  const {
    poolSize: poolSizeOpt = 'auto',
    onProgress = null,
    workerData = {},
    _cpuCountFn = null,
    _totalMemFn = null,
    _WorkerClass = null,
    perWorkerMemGB = null,
  } = options;

  const effectiveSize = resolvePoolSize(poolSizeOpt, _cpuCountFn, _totalMemFn, perWorkerMemGB);

  /** @type {{ worker: Worker, id: number, busy: boolean, inFlightBatchIndex: number|null }[]} */
  let workers = [];
  let isShutDown = false;
  let nextRoundRobin = 0;

  // -- Worker lifecycle helpers -------------------------------------------

  /**
   * Spawn a single worker thread with a standing exit handler
   * that respawns the worker if it crashes while idle (AC-001-03).
   *
   * @param {number} id - Logical worker index
   * @returns {Object} Worker slot
   */
  function spawnWorker(id) {
    const WorkerCtor = _WorkerClass || Worker;
    const w = new WorkerCtor(workerPath, { workerData: { ...workerData, workerId: id } });
    const slot = { worker: w, id, busy: false, inFlightBatchIndex: null };

    // Standing exit handler: respawn idle workers that crash unexpectedly.
    // When a worker crashes mid-batch, the per-batch handleExit in sendBatch()
    // takes over (it removes this listener first via the 'once' mechanism).
    w.once('exit', () => {
      if (isShutDown) return;
      // Only respawn if the worker was idle (not handling a batch).
      // If busy, the sendBatch handleExit handler takes care of respawn + retry.
      if (!slot.busy) {
        const newSlot = spawnWorker(slot.id);
        const idx = workers.indexOf(slot);
        if (idx !== -1) {
          workers[idx] = newSlot;
        }
      }
    });

    return slot;
  }

  /**
   * Initialize the pool with `effectiveSize` workers.
   */
  function initWorkers(size) {
    for (let i = 0; i < size; i++) {
      workers.push(spawnWorker(i));
    }
  }

  initWorkers(effectiveSize);

  // -- Batch distribution -------------------------------------------------

  /**
   * Split texts into batches of `batchSize`.
   * @param {string[]} texts
   * @param {number} batchSize
   * @returns {string[][]}
   */
  function splitBatches(texts, batchSize) {
    const batches = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Embed texts by distributing batches round-robin across workers.
   *
   * REQ-GH-239 FR-001: The dispatch loop below fires sendBatch() for every
   * batch without awaiting, so all workers run concurrently (wall-clock
   * fan-out). Out-of-order completions are handled by the per-batch result
   * slot and a monotonic completedChunks counter.
   *
   * REQ-GH-239 FR-005 / NFR-005: Progress callback fires per batch with a
   * snake_case payload {processed, total, chunks_per_sec, eta_seconds,
   * active_workers}. Throughput is a 10-batch moving-window average.
   *
   * @param {string[]} texts - Texts to embed
   * @param {number} [batchSize=32] - Texts per batch
   * @param {Object} [options={}] - Embed options
   * @param {function} [options.onProgress] - Called per batch with progress object
   * @param {AbortSignal} [options.signal] - Abort signal (reserved for future use)
   * @param {Object} [options.pipelineOpts] - Options forwarded to workers
   * @returns {Promise<Float32Array[]>}
   */
  async function embed(texts, batchSize = 32, options = {}) {
    if (isShutDown) {
      throw new Error('ERR-POOL-003: Worker pool is shut down');
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    // Backward-compat: the legacy signature was embed(texts, batchSize, pipelineOpts)
    // where pipelineOpts was a plain bag forwarded verbatim to the worker.
    // The new signature wraps this in { onProgress, signal, pipelineOpts }.
    // If the 3rd arg looks like a legacy pipelineOpts bag (no onProgress, no
    // signal, no pipelineOpts key), treat it as the legacy bag so existing
    // in-process callers keep working until T006 migrates them.
    //
    // Pool-level onProgress (passed to createWorkerPool) acts as the fallback
    // when embed() does not override it — this preserves the GH-238 callers
    // that wire up progress once at pool construction time.
    let onBatchProgress = onProgress || null;
    let pipelineOpts = {};
    if (options && typeof options === 'object') {
      const hasNewShape =
        typeof options.onProgress === 'function' ||
        'signal' in options ||
        'pipelineOpts' in options;
      if (hasNewShape) {
        if (typeof options.onProgress === 'function') {
          onBatchProgress = options.onProgress;
        }
        pipelineOpts = options.pipelineOpts || {};
      } else {
        // Legacy: entire options object is the pipelineOpts bag.
        pipelineOpts = options;
      }
    }

    const batches = splitBatches(texts, batchSize);
    const totalTexts = texts.length;

    // REQ-GH-239 FR-005: 10-batch moving-window rate state.
    // completedChunks is monotonic (increments by batch size on any batch
    // completion, regardless of completion order) so progress events never
    // regress even with out-of-order batch completions.
    let completedChunks = 0;
    /** @type {{at:number,count:number}[]} FIFO of last 10 batch events */
    const rateWindow = [];
    const WINDOW_MAX = 10;

    /** @type {(Float32Array[]|null)[]} Ordered result slots, one per batch */
    const results = new Array(batches.length).fill(null);

    /** @type {Map<number, number>} batchIndex → retry count */
    const retryCount = new Map();

    /**
     * Fire the enhanced per-batch progress event (REQ-GH-239 FR-005).
     * Called synchronously inside the result handler, before resolving
     * the outer promise, so progress events fire in completion order.
     *
     * Article X (Fail-Safe Defaults): absence of onProgress is a no-op,
     * never a crash.
     *
     * @param {number} batchCount - Number of chunks in the completed batch
     */
    function onBatchComplete(batchCount) {
      completedChunks += batchCount;

      const now = Date.now();
      rateWindow.push({ at: now, count: batchCount });
      if (rateWindow.length > WINDOW_MAX) rateWindow.shift();

      if (!onBatchProgress) return;

      // Window throughput: total chunks in window / elapsed span of window.
      // With a single entry (first batch) the span is 0 — fall back to 0 rate.
      let rate = 0;
      if (rateWindow.length >= 2) {
        const windowCount = rateWindow.reduce((s, w) => s + w.count, 0);
        const windowSecs = (now - rateWindow[0].at) / 1000;
        rate = windowSecs > 0 ? windowCount / windowSecs : 0;
      }

      const remaining = Math.max(0, totalTexts - completedChunks);
      const etaSeconds = rate > 0 ? Math.round(remaining / rate) : 0;
      const chunksPerSec = Math.round(rate * 10) / 10;
      const activeWorkers = workers.filter(w => w.busy).length;

      try {
        onBatchProgress({
          processed: completedChunks,
          total: totalTexts,
          chunks_per_sec: chunksPerSec,
          eta_seconds: etaSeconds,
          active_workers: activeWorkers,
          // Legacy camelCase mirrors for the existing GH-238 tests that
          // assert {processed, total, chunksPerSec, etaSeconds, activeWorkers}.
          chunksPerSec,
          etaSeconds,
          activeWorkers,
        });
      } catch {
        // Fail-safe: a buggy user callback must not corrupt pool state.
      }
    }

    return new Promise((resolve, reject) => {
      let completed = 0;
      let rejected = false;

      /**
       * Send a batch to a specific worker slot.
       * @param {number} batchIndex
       * @param {Object} slot - Worker slot
       */
      function sendBatch(batchIndex, slot) {
        slot.busy = true;
        slot.inFlightBatchIndex = batchIndex;

        const handleMessage = (msg) => {
          if (rejected || isShutDown) return;

          if (msg.type === 'result' && msg.batchIndex === batchIndex) {
            slot.worker.removeListener('message', handleMessage);
            slot.busy = false;
            slot.inFlightBatchIndex = null;

            // Convert plain arrays back to Float32Array if needed
            const vectors = (msg.vectors || []).map(v =>
              v instanceof Float32Array ? v : new Float32Array(v)
            );
            results[batchIndex] = vectors;
            completed++;

            // REQ-GH-239 FR-005: fire progress synchronously BEFORE resolving
            // so progress events emit in batch completion order. onBatchComplete
            // updates the monotonic counter and the 10-batch rate window.
            onBatchComplete(batches[batchIndex].length);

            if (completed === batches.length) {
              // Flatten results in order
              const ordered = [];
              for (const batchVectors of results) {
                ordered.push(...batchVectors);
              }
              resolve(ordered);
            }
          } else if (msg.type === 'error' && msg.batchIndex === batchIndex) {
            slot.worker.removeListener('message', handleMessage);
            slot.busy = false;
            slot.inFlightBatchIndex = null;
            retryBatch(batchIndex, msg.message || msg.error || 'Unknown worker error');
          }
        };

        const handleExit = (code) => {
          if (rejected || isShutDown) return;
          slot.worker.removeListener('message', handleMessage);
          slot.worker.removeListener('exit', handleExit);
          slot.busy = false;

          // Respawn the crashed worker (AC-001-03)
          const newSlot = spawnWorker(slot.id);
          const idx = workers.indexOf(slot);
          if (idx !== -1) {
            workers[idx] = newSlot;
          }

          // Retry the batch on the new worker
          if (slot.inFlightBatchIndex !== null) {
            slot.inFlightBatchIndex = null;
            retryBatch(batchIndex, `Worker ${slot.id} exited with code ${code}`);
          }
        };

        slot.worker.on('message', handleMessage);
        slot.worker.once('exit', handleExit);

        slot.worker.postMessage({
          type: 'batch',
          batchIndex,
          texts: batches[batchIndex],
          opts: pipelineOpts,
        });
      }

      /**
       * Retry a failed batch or reject if max retries exhausted.
       * @param {number} batchIndex
       * @param {string} reason
       */
      function retryBatch(batchIndex, reason) {
        const tries = (retryCount.get(batchIndex) || 0) + 1;
        retryCount.set(batchIndex, tries);

        if (tries > MAX_BATCH_RETRIES) {
          rejected = true;
          reject(new Error(
            `ERR-POOL-002: Batch ${batchIndex} failed after ${MAX_BATCH_RETRIES} retries: ${reason}`
          ));
          return;
        }

        // Find a non-busy worker to retry on
        const available = workers.find(w => !w.busy);
        if (available) {
          sendBatch(batchIndex, available);
        } else {
          // Queue for when a worker becomes free — simple poll
          const interval = setInterval(() => {
            if (rejected || isShutDown) { clearInterval(interval); return; }
            const free = workers.find(w => !w.busy);
            if (free) {
              clearInterval(interval);
              sendBatch(batchIndex, free);
            }
          }, 10);
        }
      }

      // Distribute batches round-robin across workers
      for (let i = 0; i < batches.length; i++) {
        const workerIndex = nextRoundRobin % workers.length;
        nextRoundRobin++;
        sendBatch(i, workers[workerIndex]);
      }
    });
  }

  /**
   * Shut down all workers gracefully. Force-kill after SHUTDOWN_TIMEOUT_MS.
   * Safe to call multiple times.
   *
   * @returns {Promise<void>}
   */
  async function shutdown() {
    if (isShutDown) return;
    isShutDown = true;

    const terminationPromises = workers.map(slot => {
      return new Promise((resolveSlot) => {
        let resolved = false;

        const onExit = () => {
          if (!resolved) {
            resolved = true;
            resolveSlot();
          }
        };

        slot.worker.once('exit', onExit);

        // Ask the worker to shut down gracefully
        try {
          slot.worker.postMessage({ type: 'shutdown' });
        } catch {
          // Worker may already be dead
        }

        // Force-kill after timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try {
              slot.worker.terminate();
            } catch {
              // Already terminated
            }
            resolveSlot();
          }
        }, SHUTDOWN_TIMEOUT_MS);
      });
    });

    await Promise.all(terminationPromises);
    workers = [];
  }

  /**
   * Resize the pool. Adding workers spawns new ones; removing workers
   * terminates excess ones gracefully.
   *
   * @param {number} n - Desired pool size (minimum 1)
   */
  function resize(n) {
    const target = Math.max(1, Math.floor(n));
    if (isShutDown) return;

    if (target > workers.length) {
      // Add workers
      const toAdd = target - workers.length;
      const startId = workers.length;
      for (let i = 0; i < toAdd; i++) {
        workers.push(spawnWorker(startId + i));
      }
    } else if (target < workers.length) {
      // Remove excess workers (from the end)
      const excess = workers.splice(target);
      for (const slot of excess) {
        try {
          slot.worker.postMessage({ type: 'shutdown' });
        } catch { /* ignore */ }
        setTimeout(() => {
          try { slot.worker.terminate(); } catch { /* ignore */ }
        }, SHUTDOWN_TIMEOUT_MS);
      }
    }
  }

  /**
   * Return current pool statistics.
   * @returns {{ poolSize: number, activeWorkers: number, isShutDown: boolean }}
   */
  function stats() {
    return {
      poolSize: workers.length,
      activeWorkers: workers.filter(w => w.busy).length,
      isShutDown,
    };
  }

  return { embed, shutdown, resize, stats };
}
