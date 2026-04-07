# Requirements Specification: REQ-GH-238

Embedding inference performance: hardware acceleration + parallelism on Apple Silicon

## 1. Business Context

Embedding generation takes ~55 minutes for ~20K chunks on Apple Silicon M4. The Jina v2 adapter runs on ONNX Runtime's CPU backend — the M4's Neural Engine, Metal GPU, and multi-core CPU are unused. This makes embedding regeneration prohibitively slow for iterative development.

**Stakeholders**: Framework developers (primary — dogfooding), framework users on Apple Silicon, Linux, and Windows.

**Success Metric**: Full codebase embedding (~20K chunks) completes within 10 minutes on Apple Silicon M4.

## 2. Stakeholders and Personas

### Framework Developer (Apple Silicon)
- **Role**: Develops iSDLC on M-series Mac
- **Goals**: Fast embedding regeneration during development
- **Pain Points**: 55-minute wait after code changes

### Framework User (Cross-Platform)
- **Role**: Installs iSDLC on any platform
- **Goals**: Embedding generation that uses available hardware automatically
- **Pain Points**: No way to leverage GPU/ANE, no config knobs for performance

## 3. User Journeys

### Auto-Optimized Generation (typical)
1. User runs `isdlc embedding generate`
2. Adapter auto-detects platform (macOS ARM → CoreML, Linux NVIDIA → CUDA, etc.)
3. Auto-selects optimal dtype (fp16 for GPU, q8 for CPU)
4. Spawns worker pool (N = cpu_count - 1)
5. Progress reports chunks/sec, ETA, active workers
6. Completes in <10 minutes

### Manual Override
1. User sets `embeddings.parallelism: 8` and `embeddings.device: 'cpu'` in config.json
2. Or runs `isdlc embedding generate --parallelism 8 --device cpu`
3. Adapter respects explicit config, no auto-detection

## 4. Technical Context

- **Current adapter**: `jina-code-adapter.js` (113 lines) — sequential `for` loop, one text at a time
- **Transformers.js API**: `pipeline()` already accepts `device`, `dtype`, `session_options` parameters
- **No existing parallelism**: zero `worker_threads` usage in the embedding pipeline
- **Config**: `.isdlc/config.json` managed by config service (GH-231)

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Performance | Critical | ~20K chunks in ≤10 min on M4 |
| Portability | Critical | Works on macOS, Linux, Windows — graceful fallback |
| Configurability | High | All knobs in config.json, CLI overrides |
| Reliability | High | Worker crash recovery, clean shutdown |
| Memory | Medium | ≤2GB with 4 workers |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Transformers.js doesn't route device to ONNX EP correctly | Medium | High | Test each EP, fall back to CPU |
| Worker threads share model cache causing conflicts | Low | Medium | Read-only after download, each loads independently |
| Memory exceeds budget with fp16 + 4 workers | Medium | Medium | Auto-size pool based on available memory |
| True batched inference not supported by Transformers.js | Medium | Low | Sequential fallback within worker — still get parallelism benefit |

## 6. Functional Requirements

### FR-001: Worker Thread Pool
**Confidence**: High
**Priority**: Must Have

Create a worker pool that distributes embedding chunks across N parallel worker threads, each with its own ONNX session.

- **AC-001-01**: Given `parallelism: 4`, when `embed(texts)` is called with 1000 texts, then work is distributed across 4 workers round-robin
- **AC-001-02**: Given `parallelism: 1`, when `embed(texts)` is called, then it behaves identically to the current sequential adapter
- **AC-001-03**: Given a worker thread crashes, when the pool detects the failure, then it respawns the worker and retries the failed batch
- **AC-001-04**: Given `parallelism: 'auto'`, when the pool initializes, then it uses `os.cpus().length - 1` (minimum 1)

### FR-002: Batched Inference
**Confidence**: Medium
**Priority**: Must Have

Within each worker, pad multiple texts and run a single forward pass instead of sequential calls.

- **AC-002-01**: Given `batch_size: 16`, when a worker receives 16 texts, then it processes them in a single `ext(texts, opts)` call
- **AC-002-02**: Given texts of varying lengths, when batched, then shorter texts are padded to the longest in the batch
- **AC-002-03**: Given `batch_size: 1`, when processing, then it falls back to sequential per-text inference

### FR-003: Cross-Platform Hardware Acceleration
**Confidence**: Medium
**Priority**: Must Have

Auto-detect available hardware and configure the optimal ONNX Runtime execution provider, with CPU fallback on all platforms.

- **AC-003-01**: Given macOS ARM (M-series), when `device: 'auto'`, then use CoreML EP
- **AC-003-02**: Given Linux with NVIDIA GPU, when `device: 'auto'`, then use CUDA EP
- **AC-003-03**: Given Windows with any GPU, when `device: 'auto'`, then use DirectML EP
- **AC-003-04**: Given no GPU detected or provider fails to load, when `device: 'auto'`, then fall back to CPU
- **AC-003-05**: Given `device: 'coreml'` on Linux, then log warning and fall back to CPU
- **AC-003-06**: Given `device: 'cpu'`, then use CPU regardless of platform
- **AC-003-07**: Given `device: 'cuda'` without NVIDIA GPU, then log warning and fall back to CPU
- **AC-003-08**: Given Linux with AMD GPU, when `device: 'auto'`, then try ROCm EP
- **AC-003-09**: Given `device: 'rocm'` without ROCm support, then log warning and fall back to CPU

### FR-004: Configuration
**Confidence**: High
**Priority**: Must Have

Expose all performance knobs through `.isdlc/config.json` under the `embeddings` namespace.

- **AC-004-01**: Given `embeddings.parallelism: 6`, when the adapter initializes, then it spawns 6 workers
- **AC-004-02**: Given `embeddings.device: 'cuda'`, when the adapter initializes, then it passes `device: 'cuda'` to the pipeline
- **AC-004-03**: Given `embeddings.batch_size: 64`, then batches are sized to 64
- **AC-004-04**: Given `embeddings.dtype: 'fp16'`, then it loads the fp16 model variant
- **AC-004-05**: Given `embeddings.session_options`, then options are passed through to ONNX Runtime
- **AC-004-06**: Given no config values, then defaults apply (auto parallelism, auto device, batch 32, auto dtype)
- **AC-004-07**: Given `dtype: 'auto'` with hardware acceleration active, then use fp16; with CPU-only, then use q8
- **AC-004-08**: Given explicit `dtype: 'q8'` with hardware acceleration, then honor the explicit choice

### FR-005: Progress Reporting
**Confidence**: High
**Priority**: Should Have

Report embedding progress with worker-aware metrics.

- **AC-005-01**: Given `onProgress` callback, then progress includes `{ processed, total, chunksPerSec, etaSeconds, activeWorkers }`
- **AC-005-02**: Given multi-worker execution, then progress aggregates across all workers

### FR-006: CLI Configuration Override
**Confidence**: High
**Priority**: Should Have

Allow CLI flags to override config.json values for one-off runs.

- **AC-006-01**: Given `--parallelism 8` on CLI, then it overrides config.json
- **AC-006-02**: Given `--device cpu` on CLI, then it forces CPU regardless of config

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Model quantization conversion tooling | Users pick pre-quantized variants |
| Distributed embedding across machines | Overkill for single-project use |
| Streaming progress to UI | Separate concern |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Worker Thread Pool | Must Have | Primary speedup mechanism (4-6x) |
| FR-002 | Batched Inference | Must Have | Additional speedup within each worker |
| FR-003 | Cross-Platform HW Accel | Must Have | Leverage available hardware on all platforms |
| FR-004 | Configuration | Must Have | All knobs must be tunable |
| FR-005 | Progress Reporting | Should Have | UX improvement for long-running generation |
| FR-006 | CLI Override | Should Have | Convenience for one-off runs |
