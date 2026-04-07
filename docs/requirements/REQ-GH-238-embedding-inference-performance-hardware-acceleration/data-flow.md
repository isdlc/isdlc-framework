# Data Flow: REQ-GH-238

## Parallel Embedding Generation Flow

```
texts[] (19,792 chunks)
  → jina-code-adapter.embed(texts, config)
    → IF parallelism > 1:
        worker-pool.embed(texts, batchSize)
          → split into batches of batchSize
          → distribute round-robin across N workers
          → Worker 0: pipeline(batch[0]) → Float32Array[]
          → Worker 1: pipeline(batch[1]) → Float32Array[]
          → Worker 2: pipeline(batch[2]) → Float32Array[]
          → Worker N: pipeline(batch[N]) → Float32Array[]
          → collect + reorder → Float32Array[] (complete, ordered)
    → IF parallelism === 1:
        inline pipeline(texts) → Float32Array[] (current path)
  → return EmbeddingResult { vectors, dimensions: 768, model, totalTokens }
```

## Worker Initialization Flow

```
createJinaCodeAdapter(config)
  → detectDevice() → { device: 'coreml', reason: '...' }
  → detectOptimalDtype('coreml') → 'fp16'
  → createWorkerPool(workerPath, {
      poolSize: config.parallelism || os.cpus().length - 1,
      workerData: { device: 'coreml', dtype: 'fp16', session_options, cache_dir }
    })
  → spawn N worker threads
  → each worker: pipeline('feature-extraction', model, { device, dtype, session_options })
  → workers report 'ready'
  → pool ready for embed() calls
```

## Device Auto-Detection Flow

```
config.device === 'auto'
  → detectDevice()
    → macOS ARM? → try 'coreml'
    → Linux + /proc/driver/nvidia/version? → try 'cuda'
    → Linux + /sys/class/kfd? → try 'rocm'
    → Windows? → try 'directml'
    → else → 'cpu'
  → pipeline({ device: detected })
    → EP loads? → use it
    → EP fails? → retry with device: 'cpu' (two-tier fallback)
```

## Config Resolution Flow

```
CLI flags (highest priority)
  → .isdlc/config.json embeddings.* (mid priority)
    → defaults (lowest priority)
      → { parallelism: 'auto', device: 'auto', batch_size: 32, dtype: 'auto' }

Resolution:
  parallelism: 'auto' → os.cpus().length - 1
  device: 'auto' → detectDevice()
  dtype: 'auto' → detectOptimalDtype(resolved_device)
```

## State Mutations

| Component | State | Readers |
|-----------|-------|---------|
| worker-pool → workers[] | Array of Worker instances | embed(), shutdown(), resize() |
| worker-pool → pendingBatches | Map<batchId, { resolve, reject }> | Message handler |
| embedding-worker → extractor | Pipeline instance (per-worker singleton) | batch handler |
| device-detector | Stateless | Called once at adapter init |

## Shutdown Flow

```
dispose() or SIGINT/SIGTERM
  → pool.shutdown()
    → postMessage({ type: 'shutdown' }) to all workers
    → wait 2s for graceful exit
    → force terminate any remaining workers
    → clear pendingBatches (reject with cancellation error)
```
