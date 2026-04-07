# Architecture Overview: REQ-GH-238

Embedding inference performance: hardware acceleration + parallelism

## 1. Architecture Options

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Adapter-level worker pool | Pool lives inside adapter layer. Engine/callers unchanged. | Zero caller changes, clean separation, adapter owns perf | Each worker loads model independently (memory) | Follows adapter pattern from #237 | **Selected** |
| B: Engine-level parallelism | Engine manages workers across all providers | Works for all providers | Over-engineered — cloud providers don't need it (Article V) | Breaks adapter encapsulation | Eliminated |
| C: External process pool | child_process instead of worker_threads | Full isolation | Higher overhead, harder IPC, slower startup | Non-standard for CPU-bound Node.js | Eliminated |

## 2. Selected Architecture

### ADR-001: Worker pool at the adapter level
- **Status**: Accepted
- **Context**: Embedding is CPU-bound and single-threaded. Need multi-core parallelism without changing the caller interface.
- **Decision**: New `worker-pool.js` manages N worker threads. Adapter delegates to pool when parallelism > 1, inline when parallelism === 1.
- **Rationale**: Transparent to callers. Only local models need parallelism. Options B/C rejected per Article V.
- **Consequences**: Memory scales linearly (N x model size). Need clean shutdown and crash recovery.

### ADR-002: Provider-agnostic device passthrough
- **Status**: Accepted
- **Context**: Multiple hardware EPs exist (CoreML, CUDA, DirectML, ROCm, Metal). Don't want platform-specific code paths.
- **Decision**: Adapter passes `device` and `session_options` to Transformers.js `pipeline()`. Auto-detect maps platform → EP. Failure falls back to CPU.
- **Rationale**: Transformers.js already accepts these params. Adapter is EP-agnostic.
- **Consequences**: Depends on Transformers.js routing EPs correctly. Two-tier fallback (requested EP → CPU).

### ADR-003: Config-driven with auto-detection defaults
- **Status**: Accepted
- **Context**: Need tunable knobs but sensible defaults.
- **Decision**: `.isdlc/config.json` embeddings.* namespace. `'auto'` values trigger detection. CLI flags override. Explicit values always honored.
- **Rationale**: Follows GH-231 config architecture. Auto dtype (fp16 on GPU, q8 on CPU) optimizes for hardware without user intervention.
- **Consequences**: Config schema extends with 5 new fields.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| `node:worker_threads` | Built-in | Standard CPU-bound parallelism. No new deps. | `child_process` (heavier), pool libs (unnecessary dep) |
| Transformers.js `device` + `session_options` | v4 | Native EP routing to ONNX Runtime | Direct `onnxruntime-node` (loses tokenizer/download) |
| Auto dtype (fp16/q8) | — | fp16 native on GPU hardware, q8 optimized for CPU int8 | Fixed dtype (misses optimization opportunity) |

Zero new dependencies.

## 4. Integration Architecture

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| I1 | adapter | worker-pool | `pool.embed(texts, batchSize)` | texts[] → Float32Array[] | Worker crash → respawn + retry |
| I2 | pool | worker thread | `postMessage({ batch, opts })` | batch[] → { vectors } | Error → reject, main retries |
| I3 | worker | Transformers.js | `pipeline({ device, dtype, session_options })` | Text → Float32Array | EP fail → CPU fallback |
| I4 | engine | adapter | `createJinaCodeAdapter(config)` | Unchanged interface | Transparent |
| I5 | CLI/config | adapter | `config.parallelism/device/batch_size/dtype` | JSON values | Missing → auto defaults |

Auto-detect flow: `device:'auto'` → `detectDevice()` → platform check → try EP → fallback CPU

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parallelism location | Adapter level | Transparent to callers, only local models need it |
| Threading model | worker_threads | Built-in, standard, lighter than processes |
| Device routing | Transformers.js passthrough | API already supports it |
| Config model | Auto-detect + explicit override | Sensible defaults, power users can tune |
| Dtype strategy | Auto (fp16 on GPU, q8 on CPU) | Matches hardware-native precision |
