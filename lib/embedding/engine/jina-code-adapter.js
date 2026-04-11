/**
 * Jina Code Adapter — Transformers.js pipeline for local code embeddings.
 *
 * Wraps @huggingface/transformers v4 to run Jina v2 Base Code locally.
 * Returns null from createJinaCodeAdapter() if the transformers package
 * is not available, enabling graceful fallback (Article X: Fail-Safe Defaults).
 *
 * When parallelism > 1, delegates to a worker pool (FR-001, AC-001-01).
 * When parallelism === 1, uses in-process pipeline (AC-001-02).
 * Device and dtype are resolved via resolveConfig() from device-detector.js
 * (FR-003, FR-004, AC-004-06).
 *
 * REQ-GH-237 / FR-001 / AC-001-01, AC-001-02, AC-001-03, AC-001-04
 * REQ-GH-238 / FR-001, FR-003, FR-004
 * AC-001-04, AC-003-05, AC-003-06, AC-003-07, AC-003-09, AC-004-06
 * @module lib/embedding/engine/jina-code-adapter
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveConfig, WORKER_MEMORY_ESTIMATE_GB } from './device-detector.js';
import { createWorkerPool } from './worker-pool.js';

export const JINA_CODE_DIMENSIONS = 768;

const MODEL_ID = 'jinaai/jina-embeddings-v2-base-code';

/**
 * Resolve the absolute path to embedding-worker.js (sibling of this file).
 * @returns {string}
 */
function workerPath() {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return join(thisDir, 'embedding-worker.js');
}

/**
 * L2-normalize a vector in place.
 * @param {Float32Array} vec
 */
function normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }
}

/**
 * Create a Jina Code adapter instance.
 * Returns null if @huggingface/transformers is not installed (AC-001-04: fail-open).
 *
 * @param {Object} [config]
 * @param {string} [config.cacheDir] - Optional model cache directory
 * @param {number|'auto'} [config.parallelism] - Worker threads (1 = in-process, >1 = worker pool)
 * @param {string} [config.device] - ONNX execution provider ('auto','cpu','coreml','cuda','directml','rocm')
 * @param {number} [config.batch_size] - Texts per inference call within each worker
 * @param {string} [config.dtype] - Model precision ('auto','fp16','fp32','q8')
 * @param {Object} [config.session_options] - Passthrough to ONNX Runtime session options
 * @param {Function} [config._pipelineFactory] - Dependency injection for testing
 * @param {Function} [config._createWorkerPool] - Dependency injection for testing
 * @param {Object} [config._platformEnv] - Injected platform info for device detection testing
 * @returns {Promise<{dimensions: number, embed: Function, healthCheck: Function, dispose: Function}|null>}
 */
export async function createJinaCodeAdapter(config = {}) {
  // --- Resolve hardware config (AC-004-06: auto config) ---
  // resolveConfig merges: CLI overrides > config values > defaults
  // We pass config fields as configValues; no CLI override layer here.
  const resolved = resolveConfig(
    {
      device: config.device,
      dtype: config.dtype,
      parallelism: config.parallelism,
      batch_size: config.batch_size,
      session_options: config.session_options,
      max_memory_gb: config.max_memory_gb,
    },
    {}, // no CLI overrides at adapter level
    config._platformEnv,
  );

  const effectiveParallelism = resolved.parallelism;
  const effectiveDevice = resolved.device;
  const effectiveDtype = resolved.dtype;
  const effectiveBatchSize = resolved.batch_size;
  const effectiveSessionOptions = resolved.session_options;

  // --- Pipeline availability check ---
  let pipelineFactory;
  try {
    if (config._pipelineFactory) {
      // Dependency injection for testing (avoids 162MB model download)
      pipelineFactory = config._pipelineFactory;
      // Allow tests to verify fail-open by throwing after DI assignment
      if (config._throwOnInit) throw new Error('Simulated import failure');
    } else {
      const transformers = await import('@huggingface/transformers');
      pipelineFactory = transformers.pipeline;
    }
  } catch {
    // AC-001-04: Fail-open if @huggingface/transformers is not installed
    return null;
  }

  // --- Worker pool mode (parallelism > 1) ---
  if (effectiveParallelism > 1) {
    return createPooledAdapter(config, resolved, pipelineFactory);
  }

  // --- In-process mode (parallelism === 1, AC-001-02) ---
  return createInProcessAdapter(config, resolved, pipelineFactory);
}

/**
 * Create an adapter that delegates to a worker thread pool for parallel inference.
 * FR-001: When parallelism > 1, distribute work across worker threads.
 *
 * @param {Object} config - Original user config
 * @param {Object} resolved - Resolved config from resolveConfig()
 * @param {Function} pipelineFactory - Pipeline factory (used to verify availability)
 * @returns {Object} Adapter with { dimensions, embed, healthCheck, dispose }
 */
function createPooledAdapter(config, resolved, pipelineFactory) {
  const createPool = config._createWorkerPool || createWorkerPool;

  const workerDataPayload = {
    model: MODEL_ID,
    device: resolved.device,
    dtype: resolved.dtype,
    session_options: resolved.session_options,
  };
  if (config.cacheDir) {
    workerDataPayload.cache_dir = config.cacheDir;
  }
  // Pass _pipelineFactory through workerData when testing
  // (Workers in test mode use this for mock injection)
  if (config._pipelineFactory) {
    workerDataPayload._pipelineFactory = config._pipelineFactory;
  }

  const pool = createPool(workerPath(), {
    poolSize: resolved.parallelism,
    workerData: workerDataPayload,
    _cpuCountFn: config._cpuCountFn,
    _WorkerClass: config._WorkerClass,
    perWorkerMemGB: WORKER_MEMORY_ESTIMATE_GB[resolved.device] || 3,
  });

  let disposed = false;

  return {
    dimensions: JINA_CODE_DIMENSIONS,

    /**
     * Generate embeddings via worker pool (REQ-GH-239 FR-002).
     *
     * Unified signature across in-process and pooled paths:
     *   embed(texts, { batchSize, onProgress, signal })
     *
     * The pooled path is a one-liner delegating to pool.embed: the engine
     * issues exactly ONE adapter.embed call per run, and the pool handles
     * batching internally with concurrent dispatch.
     *
     * Call-time options.batchSize wins over construction-time batch_size.
     * Legacy 1-arg `adapter.embed(texts)` is supported (options defaults to {}).
     *
     * @param {string[]} texts
     * @param {Object} [options]
     * @param {number} [options.batchSize] - Texts per batch (overrides resolved)
     * @param {Function} [options.onProgress] - Per-batch progress callback
     * @param {AbortSignal} [options.signal] - Abort signal
     * @returns {Promise<Float32Array[]>}
     */
    async embed(texts, options = {}) {
      if (disposed) {
        throw new Error('Adapter has been disposed');
      }
      // Pre-aborted signal: reject without dispatching any work.
      if (options.signal?.aborted) {
        const err = new Error('Embedding cancelled');
        err.name = 'AbortError';
        throw err;
      }
      // Call-time batchSize wins over construction-time default.
      const batchSize = options.batchSize || resolved.batch_size;
      return pool.embed(texts, batchSize, {
        onProgress: options.onProgress,
        signal: options.signal,
      });
    },

    /**
     * Check pool health.
     * @returns {Promise<{healthy: boolean, dimensions: number, poolSize?: number, error?: string}>}
     */
    async healthCheck() {
      try {
        const poolStats = pool.stats();
        return {
          healthy: !poolStats.isShutDown,
          dimensions: JINA_CODE_DIMENSIONS,
          poolSize: poolStats.poolSize,
        };
      } catch (err) {
        return { healthy: false, dimensions: JINA_CODE_DIMENSIONS, error: err.message };
      }
    },

    /**
     * Shut down the worker pool and release resources.
     */
    async dispose() {
      if (!disposed) {
        disposed = true;
        await pool.shutdown();
      }
    },

    /** Expose resolved config for introspection/testing. */
    get _resolved() { return resolved; },
  };
}

/**
 * Create an in-process adapter (parallelism === 1).
 * AC-001-02: Single-threaded sequential embedding in the main thread.
 *
 * @param {Object} config - Original user config
 * @param {Object} resolved - Resolved config from resolveConfig()
 * @param {Function} pipelineFactory - Pipeline factory function
 * @returns {Object} Adapter with { dimensions, embed, healthCheck, dispose }
 */
function createInProcessAdapter(config, resolved, pipelineFactory) {
  let extractor = null;

  async function ensureExtractor() {
    if (!extractor) {
      const opts = {};
      if (config.cacheDir) opts.cache_dir = config.cacheDir;
      if (resolved.device) opts.device = resolved.device;
      if (resolved.dtype) opts.dtype = resolved.dtype;
      if (resolved.session_options && Object.keys(resolved.session_options).length > 0) {
        opts.session_options = resolved.session_options;
      }
      extractor = await pipelineFactory('feature-extraction', MODEL_ID, opts);
    }
    return extractor;
  }

  return {
    dimensions: JINA_CODE_DIMENSIONS,

    /**
     * Generate embeddings for an array of text inputs (REQ-GH-239 FR-002).
     *
     * Unified signature across in-process and pooled paths:
     *   embed(texts, { batchSize, onProgress, signal })
     *
     * The in-process path loops text-by-text and synthesizes progress at
     * batch boundaries so downstream consumers receive the same FR-005
     * payload shape regardless of parallelism setting.
     *
     * Call-time options.batchSize wins over construction-time batch_size.
     * Legacy 1-arg `adapter.embed(texts)` is supported (options defaults to {}).
     *
     * @param {string[]} texts
     * @param {Object} [options]
     * @param {number} [options.batchSize] - Texts per progress batch
     * @param {Function} [options.onProgress] - Per-batch progress callback
     * @param {AbortSignal} [options.signal] - Abort signal (checked per text)
     * @returns {Promise<Float32Array[]>}
     */
    async embed(texts, options = {}) {
      const batchSize = options.batchSize || resolved.batch_size;
      const onProgress = options.onProgress;
      const signal = options.signal;

      // Pre-aborted signal: reject without dispatching any work.
      if (signal?.aborted) {
        const err = new Error('Embedding cancelled');
        err.name = 'AbortError';
        throw err;
      }

      const ext = await ensureExtractor();
      const results = [];
      const startTime = Date.now();

      for (let i = 0; i < texts.length; i++) {
        if (signal?.aborted) {
          const err = new Error('Embedding cancelled');
          err.name = 'AbortError';
          throw err;
        }
        const output = await ext(texts[i], { pooling: 'mean', normalize: true });
        const nested = output.tolist();
        const raw = nested[0]; // first (only) sequence -> array of numbers
        const vec = new Float32Array(raw);
        normalize(vec);
        results.push(vec);
        // Dispose underlying ONNX tensor to prevent memory leak across
        // large batches. Transformers.js does not auto-dispose output
        // tensors, causing RSS to balloon when processing >1000 texts.
        try { output.dispose?.(); } catch { /* ignore */ }

        // REQ-GH-239 FR-005: fire progress at batch boundaries with the
        // unified snake_case shape. In-process path synthesizes
        // active_workers=1 since there is only one worker (the main thread).
        if (onProgress && (i + 1) % batchSize === 0) {
          const processed = i + 1;
          const elapsedSec = Math.max((Date.now() - startTime) / 1000, 1e-6);
          const rate = processed / elapsedSec;
          onProgress({
            processed,
            total: texts.length,
            chunks_per_sec: Math.round(rate * 10) / 10,
            eta_seconds: Math.round((texts.length - processed) / rate),
            active_workers: 1,
          });
        }
      }

      // Final progress event: guarantees the caller sees a terminal
      // {processed===total, eta_seconds===0} tick even when texts.length
      // is not a multiple of batchSize.
      if (onProgress && texts.length > 0) {
        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 1e-6);
        const rate = texts.length / elapsedSec;
        onProgress({
          processed: texts.length,
          total: texts.length,
          chunks_per_sec: Math.round(rate * 10) / 10,
          eta_seconds: 0,
          active_workers: 1,
        });
      }

      return results;
    },

    /**
     * Check if the model is loaded and functional.
     * @returns {Promise<{healthy: boolean, dimensions: number, error?: string}>}
     */
    async healthCheck() {
      try {
        await ensureExtractor();
        return { healthy: true, dimensions: JINA_CODE_DIMENSIONS };
      } catch (err) {
        return { healthy: false, dimensions: JINA_CODE_DIMENSIONS, error: err.message };
      }
    },

    /**
     * Release pipeline resources.
     */
    dispose() {
      if (extractor) {
        extractor.dispose?.();
        extractor = null;
      }
    },

    /** Expose resolved config for introspection/testing. */
    get _resolved() { return resolved; },
  };
}
