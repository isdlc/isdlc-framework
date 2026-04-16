# Bug Report: Calibrator accuracy + auto-parallelism sizing on small workloads

**Source**: GitHub Issue [#248](https://github.com/vihang-hub/isdlc-framework/issues/248) (bundles [#249](https://github.com/vihang-hub/isdlc-framework/issues/249))
**Classification**: Bug
**Reporter context**: GH-239 empirical validation (2026-04-11)
**Slug**: REQ-GH-248-calibrator-accuracy-parallelism

---

## Severity

**High.** Blocks `parallelism: "auto"` from being usable on the canonical 24 GB Apple Silicon + Jina v2 Base Code fp16 CoreML target hardware. GH-239 shipped with `parallelism: 1` as the safe default, so this is not a production regression — it is a broken promise for the auto-sizing feature. NFR-002 (≥3× throughput via auto-parallelism) from REQ-GH-239 cannot be delivered until this is fixed.

## Symptoms

1. **Calibrator reports ~1.1 GB/worker** on the default synthetic samples (20 × 2000-char pseudo-code tokens over a ~5s run with 500ms RSS sampling).
2. **Real-world peak is ~7 GB/worker** during a 512-chunk real-code generate run, measured via `process.memoryUsage().rss`. That's a ~6× under-measurement.
3. **Downstream effect**: `device-detector.autoParallelism()` reads the cached calibration, computes `floor(availableMemGB / perWorkerGB)`, and on a 24 GB Mac with ~16 GB available decides it can safely run ~14-18 workers. In reality only 2-3 fit.
4. **Result when auto is enabled**: 4 workers × 7 GB ≈ 28 GB → swap → each worker runs ~5× slower → net throughput 0.73× vs `parallelism: 1` (GH-239 benchmark numbers).
5. **Secondary effect**: even when per-worker memory is eventually measured accurately, the existing auto-parallelism math does not consider **workload size**. A differential refresh of 2 files / 8 chunks would still spawn the full calibrated pool size, paying the ~162 MB model-load cost per worker for no throughput benefit.
6. **Piggybacked bug**: `graphOptimizationLevel: "disabled"` was set as a GH-238 workaround for an ONNX Runtime `SimplifiedLayerNormFusion` missing-node bug on Jina v2 fp16. That setting is a significant contributor to the inflated per-worker memory cost (keeps intermediate layer outputs alive across the 12-layer × 12-head BERT forward pass, inflating attention memory 5-10×). Re-enabling it is in scope for this fix.

## Reproduction Steps

**Environment**: Apple Silicon Mac, 24 GB unified memory, Jina v2 Base Code fp16 running on CoreML execution provider, shipped `session_options.graphOptimizationLevel: "disabled"`.

1. Fresh install, no cached calibration present.
2. Set `parallelism: "auto"` in `.isdlc/config.json` (the calibrator runs on full generation paths).
3. Run a full embedding generation over any real multi-language project with ≥ 500 chunks.
4. Observe the calibration log line: `[device-detector] perWorkerMemGB = 1.10 GB (calibrated, measured ...)`.
5. Compare against `process.memoryUsage().rss` peak sampled continuously during the actual inference — the real peak lands at ~7 GB per worker.
6. Let `autoParallelism()` proceed with its inflated ceiling. Observe worker pool size of 4+ on a 24 GB machine, swap usage climbing during inference, and net wall-clock time regressing vs `parallelism: 1`.

Full benchmark numbers and hardware/software context are captured in `docs/requirements/REQ-GH-239-worker-pool-engine-parallelism/benchmark-report.md` (section 7.1).

## Affected Users

- Any user running Jina v2 Base Code fp16 on CoreML (Apple Silicon) who enables `parallelism: "auto"`. This is the default target hardware configuration for the embedding pipeline.
- **Not affected**: users on the shipped `parallelism: 1` default. The safe default hides the bug behind a conservative worker count.
- **Indirect impact**: users on memory-rich Apple Silicon (64+ GB) technically have enough headroom for the over-sized pool, but still eat the graphOptimizationLevel inflation, so per-worker cost is unnecessarily high everywhere fp16 CoreML is used.

## Affected Area

**Primary files:**

| File | Role | What changes |
|---|---|---|
| `lib/embedding/engine/memory-calibrator.js` | Measurement — produces `perWorkerMemGB` | Sample source (synthetic → real project chunks via `lib/embedding/chunker`), sampling cadence (500ms → 200ms), run duration (~5s → 20-30s), timeout ceiling (120s → ~300s), plausibility guards preserved |
| `lib/embedding/engine/device-detector.js` | Auto-parallelism — consumes calibration, computes pool size | Add workload-aware floor: `min(memory_ceiling, workload_floor, cpu_cap)` where `workload_floor` is derived from chunk count and batch size |
| `src/core/config/config-defaults.js` (and mirror in `lib/embedding/config-defaults` if present) | Ships `session_options.graphOptimizationLevel: "disabled"` | Default flipped to `"all"` for Jina v2 fp16 after parity verification; `"disabled"` remains user-selectable as escape hatch |

**Consumers / call chain (for tracing):**

- `bin/isdlc-embedding.js` → `resolveConfig()` → `autoParallelism()` → `resolvePerWorkerMemGB()` → `readCachedCalibration()` / `calibratePerWorkerMemory()`
- `createJinaCodeAdapter()` in `lib/embedding/engine/jina-code-adapter.js` passes `session_options` through to the ONNX Runtime session
- Worker pool in `lib/embedding/engine/worker-pool.js` — `resolvePoolSize()` also duplicates the memory-aware math and will need alignment

**Tests that will need changes:**

- `lib/embedding/engine/memory-calibrator.test.js` — sample-generation tests, timing assertions, steady-state coverage
- `lib/embedding/engine/device-detector.test.js` — auto-parallelism tests need new workload-aware cases
- `lib/embedding/engine/worker-pool.test.js` — `resolvePoolSize()` coverage for workload floor
- New: graphOptimizationLevel cosine-similarity parity regression test against a fixture corpus

**Out of scope for this bug:**

- Differential embedding refresh flows do **not** call the calibrator — by design. Differential runs will use whatever parallelism value is configured (or the workload-aware floor from the new logic), but will never trigger calibration. Cache invalidation, project-shape detection, and per-project calibration persistence are explicitly deferred.
- Memory infrastructure scale-out (HNSW, remote vector stores — #133) is unrelated.
- Non-Jina-v2 models — the calibrator stays model-agnostic; the graphOptimizationLevel default change is scoped to the Jina v2 fp16 path specifically.

## Discovery Context

- **Memory calibrator already uses `Math.max` for peak extraction** (`memory-calibrator.js:285`: `peakBytes = Math.max(...rssSamplesBytes)`) — the draft's "capture Math.max not mean" critique is inaccurate; the real sampling problems are sparsity and unrealistic input, not aggregation.
- **Old hardcoded fallback was more accurate than current calibration**: `WORKER_MEMORY_ESTIMATE_GB.coreml = 6` in `device-detector.js` is what's used when the calibration cache is absent. Per the GH-239 benchmark report, that value was "accidentally closer to reality" than the 1.1 GB the calibrator produces. The safe fallback path is healthier than the calibrated path today — a strong signal that the calibrator is the weak link, not the overall architecture.
- **graphOptimizationLevel is an upstream bug workaround**: the underlying `SimplifiedLayerNormFusion` missing-node issue is in ONNX Runtime / transformers.js, not framework code. Safe re-enablement requires: (a) verifying the upstream fix has shipped in current pinned versions, (b) a cosine-similarity parity test vs the `"disabled"` baseline to catch silent embedding corruption, (c) keeping `"disabled"` as a user escape hatch in config.
- **Coupling with #249 is load-bearing**: fixing the calibrator alone against the current 7 GB/worker reality produces an accurate-but-pessimistic number. Re-enabling graphOptimizationLevel first drops the real per-worker cost, and calibration then measures the new reduced baseline. The two fixes must land together or the fix under-delivers on NFR-002.

## Scope Confirmation (Accepted in Conversation)

1. **Single combined analysis** — #248 and #249 analyzed as one unit, land as one fix, tested together.
2. **Sample source** — real project chunks via `lib/embedding/chunker` (Option B). No bundled fixture corpus.
3. **Differential scope** — calibrator does **not** run on differential refreshes. No cache-invalidation logic, no project-shape detection, no persistence policy to design.
4. **Workload-aware parallelism** — folded into this fix (extends `autoParallelism()` to consider chunk count as a floor, not just memory as a ceiling).
5. **graphOptimizationLevel** — default flips to `"all"` for Jina v2 fp16 after parity verification; `"disabled"` remains user-selectable.
