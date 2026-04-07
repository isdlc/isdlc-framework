# Interface Specification: REQ-GH-238

## createWorkerPool(workerPath, options)

**Module**: `lib/embedding/engine/worker-pool.js`

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| workerPath | string | Yes | — | Path to embedding-worker.js |
| options.poolSize | number | No | `os.cpus().length - 1` | Number of worker threads |
| options.onProgress | function | No | null | `(processed, total, metrics) => void` |
| options.workerData | object | No | `{}` | Data passed to each worker on init |

**Returns**: `{ embed, shutdown, resize }`

### pool.embed(texts, batchSize, pipelineOpts)

| Name | Type | Required | Default |
|------|------|----------|---------|
| texts | string[] | Yes | — |
| batchSize | number | No | 32 |
| pipelineOpts | object | No | `{}` |

**Returns**: `Promise<Float32Array[]>` — ordered results matching input order.

**Errors**: Throws if all retries exhausted for a batch.

### pool.shutdown()

**Returns**: `Promise<void>` — resolves when all workers terminated.

### pool.resize(n)

| Name | Type | Required |
|------|------|----------|
| n | number | Yes |

**Returns**: `void` — adjusts pool size (adds or removes workers).

---

## Worker Message Protocol

### Main → Worker

```json
{ "type": "init", "pipelineOpts": { "device": "coreml", "dtype": "fp16", "session_options": {} } }
{ "type": "batch", "batchId": 1, "texts": ["code snippet 1", "code snippet 2"], "opts": {} }
{ "type": "shutdown" }
```

### Worker → Main

```json
{ "type": "ready", "workerId": 0 }
{ "type": "result", "batchId": 1, "vectors": [Float32Array, Float32Array] }
{ "type": "error", "batchId": 1, "error": "Pipeline failed: ..." }
```

---

## detectDevice()

**Module**: `lib/embedding/engine/device-detector.js`

**Returns**: `{ device: string, reason: string }`

| Platform | Check | Device |
|----------|-------|--------|
| macOS ARM | `platform=darwin && arch=arm64` | `'coreml'` |
| Linux NVIDIA | `/proc/driver/nvidia/version` exists | `'cuda'` |
| Linux AMD | `/sys/class/kfd` exists | `'rocm'` |
| Windows | `platform=win32` | `'directml'` |
| Other | — | `'cpu'` |

## detectOptimalDtype(device)

**Returns**: `string` — `'fp16'` if device !== 'cpu', else `'q8'`

---

## createJinaCodeAdapter(config) — updated

**Extended config**:
| Name | Type | Default | Description |
|------|------|---------|-------------|
| config.parallelism | number\|'auto' | 'auto' | Worker count |
| config.device | string\|'auto' | 'auto' | Execution provider |
| config.batch_size | number | 32 | Texts per forward pass |
| config.dtype | string\|'auto' | 'auto' | Model precision |
| config.session_options | object | `{}` | ONNX Runtime passthrough |
| config.cacheDir | string | (default) | Model cache |

**Returns**: Same adapter interface as before, but `healthCheck()` now includes `{ device, dtype, workers }`.
