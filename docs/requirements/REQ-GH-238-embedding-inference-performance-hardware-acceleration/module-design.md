# Module Design: REQ-GH-238

## worker-pool.js (NEW, ~120 lines)

**Responsibility**: Manage N worker threads, distribute batches, collect results, handle crashes.

**Public Interface**:
```
export function createWorkerPool(workerPath, options = {})
// options: { poolSize, onProgress, workerData }
// Returns: { embed(texts, batchSize, pipelineOpts), shutdown(), resize(n) }
```

- `embed(texts, batchSize, pipelineOpts)`: splits texts into batchSize chunks, distributes round-robin, collects Float32Array[] in order
- Worker crash: detects 'exit' event, respawns, re-queues failed batch (max 2 retries)
- `shutdown()`: SIGTERM all workers, 2s timeout → force kill. Registers process SIGINT/SIGTERM handlers.
- `resize(n)`: adjust pool size dynamically (future use)

**Dependencies**: `node:worker_threads` (built-in)

## embedding-worker.js (NEW, ~50 lines)

**Responsibility**: Worker thread entry point — loads pipeline, processes batches.

**Interface**: Message-based via `parentPort`.

- On startup: loads pipeline with `{ device, dtype, session_options, cache_dir }` from `workerData`
- Receives: `{ type: 'batch', texts: string[], batchId: number, opts }`
- Sends: `{ type: 'result', vectors: Float32Array[], batchId }` or `{ type: 'error', error, batchId }`
- Batched: tries `ext(texts[])` first, falls back to sequential if unsupported

**Dependencies**: `@huggingface/transformers` (loaded in worker context)

## device-detector.js (NEW, ~60 lines)

**Responsibility**: Auto-detect platform and available hardware acceleration.

**Public Interface**:
```
export function detectDevice() → { device: string, reason: string }
export function detectOptimalDtype(device) → string
```

- macOS ARM → 'coreml'
- Linux + NVIDIA → 'cuda'
- Linux + AMD → 'rocm'
- Windows → 'directml'
- Fallback → 'cpu'
- `detectOptimalDtype`: non-cpu → 'fp16', cpu → 'q8'

**Dependencies**: `node:os` (built-in), `node:fs` (for /proc checks)

## jina-code-adapter.js (MODIFY)

**Changes**:
- Accept new config: `parallelism`, `device`, `batch_size`, `dtype`, `session_options`
- When `parallelism > 1`: create worker pool, delegate embed() to pool
- When `parallelism === 1`: inline execution (current path + device/dtype)
- Resolve `'auto'` values via device-detector
- `dispose()`: call pool.shutdown() if pool exists
- `healthCheck()`: enriched with `{ device, dtype, workers }`

## engine/index.js (MODIFY)

**Changes**: Read embeddings.* config, pass to createJinaCodeAdapter()

## bin/isdlc-embedding.js (MODIFY)

**Changes**: Parse --parallelism, --device, --batch-size, --dtype CLI flags. Merge: CLI > config > defaults.
