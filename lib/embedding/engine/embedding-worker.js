/**
 * Embedding Worker — runs inside a worker_thread for parallel embedding inference.
 *
 * Receives text batches from the worker pool, processes them using
 * @huggingface/transformers pipeline('feature-extraction'), and returns
 * L2-normalized embedding vectors.
 *
 * Core logic functions (initPipeline, batchEmbed, normalizeVector) are exported
 * for direct unit testing without spawning threads.
 *
 * REQ-GH-238 / FR-001, FR-002 (AC-002-01, AC-002-02, AC-002-03)
 * Article III: Security by Design — input validation on all messages
 * Article V: Simplicity First — minimal worker logic, clear message protocol
 * Article X: Fail-Safe Defaults — sequential fallback on batch failure
 *
 * @module lib/embedding/engine/embedding-worker
 */

import { parentPort, workerData, isMainThread } from 'node:worker_threads';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_ID = 'jinaai/jina-embeddings-v2-base-code';

// ---------------------------------------------------------------------------
// L2 normalization
// ---------------------------------------------------------------------------

/**
 * L2-normalize a vector in place and return it.
 * @param {Float32Array} vec
 * @returns {Float32Array} The same vector, normalized
 */
export function normalizeVector(vec) {
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
  return vec;
}

// ---------------------------------------------------------------------------
// Pipeline initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the Transformers.js feature-extraction pipeline.
 *
 * @param {Object} config
 * @param {string} [config.model] - Model ID (default: jina-embeddings-v2-base-code)
 * @param {string} [config.device] - ONNX execution provider ('cpu', 'coreml', 'cuda', etc.)
 * @param {string} [config.dtype] - Model precision ('fp16', 'fp32', 'q8')
 * @param {Object} [config.session_options] - ONNX session options passthrough
 * @param {string} [config.cache_dir] - Model cache directory
 * @param {Function} [config._pipelineFactory] - Injected pipeline factory for testing
 * @returns {Promise<Function>} The extractor function (ext)
 */
export async function initPipeline(config = {}) {
  const {
    model = DEFAULT_MODEL_ID,
    device,
    dtype,
    session_options,
    cache_dir,
    _pipelineFactory,
  } = config;

  let pipelineFn;

  if (_pipelineFactory) {
    // Dependency injection for testing — avoids model download
    pipelineFn = _pipelineFactory;
  } else {
    const transformers = await import('@huggingface/transformers');
    pipelineFn = transformers.pipeline;
  }

  const opts = {};
  if (device) opts.device = device;
  if (dtype) opts.dtype = dtype;
  if (session_options && Object.keys(session_options).length > 0) {
    opts.session_options = session_options;
  }
  if (cache_dir) opts.cache_dir = cache_dir;

  const extractor = await pipelineFn('feature-extraction', model, opts);
  return extractor;
}

// ---------------------------------------------------------------------------
// Batch embedding with sequential fallback
// ---------------------------------------------------------------------------

/**
 * Process a batch of texts through the extractor, returning L2-normalized vectors.
 *
 * AC-002-01: Processes all texts in a single ext(texts, opts) call when batch_size > 1.
 * AC-002-02: Padding is handled internally by Transformers.js — just pass the array.
 * AC-002-03: Falls back to sequential per-text inference if batched call throws,
 *            or if forceSequential is true (batch_size === 1).
 *
 * @param {Function} extractor - The initialized pipeline extractor function
 * @param {string[]} texts - Array of texts to embed
 * @param {Object} [options]
 * @param {boolean} [options.forceSequential=false] - Force one-at-a-time processing
 * @returns {Promise<Float32Array[]>} Array of L2-normalized embedding vectors
 */
export async function batchEmbed(extractor, texts, options = {}) {
  const { forceSequential = false } = options;

  if (!texts || texts.length === 0) {
    return [];
  }

  // AC-002-03: If forceSequential (batch_size === 1), skip batched attempt
  if (forceSequential) {
    return sequentialEmbed(extractor, texts);
  }

  // AC-002-01: Try batched inference first
  try {
    return await batchedInference(extractor, texts);
  } catch {
    // AC-002-03 / ERR-BATCH-001: Batched call failed, fall back to sequential
    return sequentialEmbed(extractor, texts);
  }
}

/**
 * Run batched inference — single ext() call for all texts.
 * @param {Function} extractor
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
async function batchedInference(extractor, texts) {
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  const vectors = extractVectors(output, texts.length);
  // Dispose underlying ONNX tensor to prevent memory leak across batches.
  // Transformers.js does not auto-dispose output tensors.
  try { output.dispose?.(); } catch { /* ignore */ }
  return vectors;
}

/**
 * Run sequential inference — one ext() call per text.
 * AC-002-03: Falls back to this when batched inference is unsupported or fails.
 * @param {Function} extractor
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
async function sequentialEmbed(extractor, texts) {
  const vectors = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const singleVectors = extractVectors(output, 1);
    vectors.push(singleVectors[0]);
    // Dispose underlying ONNX tensor to prevent memory leak across batches.
    try { output.dispose?.(); } catch { /* ignore */ }
  }
  return vectors;
}

/**
 * Extract Float32Array vectors from pipeline output and L2-normalize them.
 *
 * Handles both single-text output (shape [1, dim]) and batch output (shape [N, dim]).
 * Uses .tolist() to convert tensor to nested arrays, then wraps in Float32Array.
 *
 * @param {Object} output - Pipeline output tensor
 * @param {number} expectedCount - Number of vectors expected
 * @returns {Float32Array[]}
 */
function extractVectors(output, expectedCount) {
  const nested = output.tolist();
  const vectors = [];

  if (expectedCount === 1) {
    // Single text: nested is [[...dims...]]
    const raw = nested[0];
    vectors.push(normalizeVector(new Float32Array(raw)));
  } else {
    // Batch: nested is [[...dims...], [...dims...], ...]
    for (let i = 0; i < nested.length; i++) {
      vectors.push(normalizeVector(new Float32Array(nested[i])));
    }
  }

  return vectors;
}

// ---------------------------------------------------------------------------
// Worker thread message handler
// ---------------------------------------------------------------------------

/**
 * Set up the worker thread message listener.
 * Only activates when running inside a worker_thread (parentPort is non-null).
 *
 * Message protocol (matches worker-pool.js expectations):
 *   Incoming:  { type: 'batch', batchIndex, texts, opts }
 *              { type: 'shutdown' }
 *   Outgoing:  { type: 'ready', workerId }
 *              { type: 'result', batchIndex, vectors }
 *              { type: 'error', batchIndex, message }
 */
async function startWorker() {
  if (isMainThread || !parentPort) {
    // Not running as a worker thread — skip setup (module imported for testing)
    return;
  }

  const port = parentPort;
  const config = workerData || {};
  const workerId = config.workerId ?? 0;

  let extractor = null;

  // Initialize pipeline from workerData
  try {
    extractor = await initPipeline(config);
    port.postMessage({ type: 'ready', workerId });
  } catch (err) {
    port.postMessage({
      type: 'error',
      message: `Pipeline initialization failed: ${err.message}`,
    });
    return;
  }

  // REQ-GH-239: serial batch queue (fixes GH-239 real-data throughput regression).
  //
  // Node's `port.on('message', async (msg) => ...)` fires one async handler per
  // message without awaiting between invocations. When the pool flood-dispatches
  // ~156 batches to a worker in a tight loop, Node spawns ~156 concurrent
  // handler invocations, each capturing its batch (~32 × ~1700 chars ≈ 54KB on
  // real code chunks) in closure. Transformers.js internally serializes calls
  // to extractor(), so the work is serial anyway — but the 156 closures hold
  // their data simultaneously, triggering GC pressure that DECAYS throughput
  // over the run (observed 2.6 → 1.4 → 0.9 c/s across a 512-chunk real-data P4
  // run, net 0.39× vs P1).
  //
  // Fix: FIFO queue inside the worker. Only one batchEmbed runs at a time;
  // subsequent batches wait their turn. Each worker still runs in its own
  // thread, so 4 workers give ~4× parallelism without the memory blowup.
  /** @type {{batchIndex: number, texts: string[], opts: any}[]} */
  const pending = [];
  let draining = false;

  async function drainQueue() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length > 0) {
        const job = pending.shift();
        try {
          const forceSequential = job.opts?.batch_size === 1;
          const vectors = await batchEmbed(extractor, job.texts, { forceSequential });
          const plainVectors = vectors.map(v => Array.from(v));
          port.postMessage({ type: 'result', batchIndex: job.batchIndex, vectors: plainVectors });
        } catch (err) {
          port.postMessage({
            type: 'error',
            batchIndex: job.batchIndex,
            message: err.message || 'Unknown inference error',
          });
        }
      }
    } finally {
      draining = false;
    }
  }

  // Listen for messages from the pool
  port.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'batch': {
        const { batchIndex, texts, opts } = msg;

        // Validate batch message
        if (batchIndex === undefined || batchIndex === null) {
          port.postMessage({
            type: 'error',
            batchIndex: batchIndex ?? -1,
            message: 'Missing batchIndex in batch message',
          });
          return;
        }

        if (!Array.isArray(texts) || texts.length === 0) {
          port.postMessage({
            type: 'error',
            batchIndex,
            message: 'Missing or empty texts array in batch message',
          });
          return;
        }

        // Queue the batch — drainQueue() processes them one at a time.
        pending.push({ batchIndex, texts, opts });
        drainQueue();
        break;
      }

      case 'shutdown': {
        // Graceful shutdown: dispose pipeline and exit
        if (extractor && typeof extractor.dispose === 'function') {
          try {
            extractor.dispose();
          } catch {
            // Best-effort cleanup
          }
        }
        extractor = null;
        process.exit(0);
        break;
      }

      default:
        // Unknown message type — ignore silently (Article X: fail-safe)
        break;
    }
  });
}

// Auto-start when loaded as a worker thread
startWorker();
