# Root Cause Analysis — GH-248 (+ GH-249)

**Slug**: REQ-GH-248-calibrator-accuracy-parallelism
**Bug report**: bug-report.md
**Confidence**: High
**Severity**: High

---

## Executive Summary

The calibrator under-measures per-worker memory by ~6× (1.1 GB reported vs ~7 GB real) on the canonical 24 GB Apple Silicon + Jina v2 Base Code fp16 CoreML target. Three independent structural issues compound to produce the gap. Tracing also surfaced two latent bugs that are not in the original draft but would defeat any calibrator-only fix — they are in scope for this analysis.

---

## 1. Primary Hypotheses

### H1 — Synthetic samples are tokenizer-degenerate (~30-40% of the gap, HIGH confidence)

**Evidence**:
- `memory-calibrator.js:120-143` builds samples from a 38-word vocabulary (`function`, `class`, `{`, `=>`, `foo`, etc.) by repeated token concatenation.
- WordPiece tokenization on this vocabulary emits near-constant token IDs → BERT attention matrices collapse to a low-rank regime → intermediate activations don't vary → transient memory never reaches the profile of real code.
- Real multi-language code chunks (500-1500 chars) tokenize to 200-400 sequence positions with full entropy. Attention is O(n²) in sequence length; the cost only shows up on real inputs.

**Fix**: replace `generateSyntheticSamples` with a sample provider that pulls real chunks from `lib/embedding/chunker` output. Synthetic remains as a last-resort fallback for <20 available chunks.

### H2 — Sampling window is too short and too sparse (~20-30% of the gap, HIGH confidence)

**Evidence**:
- `DEFAULT_CALIBRATION_OPTIONS`: 500 ms cadence over a ~5 s run ≈ 10 RSS samples total.
- `pool.embed(samples, 32, {})` sends a single batch of 20 texts (because `batch_size=32 ≥ sampleCount=20`) → the worker does ONE forward pass → the run ends before ONNX/CoreML arenas reach steady state.
- Jina v2 fp16 on CoreML takes 2-4 s to reach steady-state memory (model load + CoreML compilation + attention cache warm-up). A 5 s run barely clears warmup.
- The existing `Math.max(...rssSamplesBytes)` aggregation at `memory-calibrator.js:285` is correct. The draft's "use Math.max not mean" critique is inaccurate — the real problem is sparse, short input to Math.max, not the aggregator.

**Fix**: 200 ms sampling cadence, 20-30 s run duration, 100-300 samples to guarantee multiple batches, hard timeout raised from 120 s to 300 s.

### H4 — `graphOptimizationLevel: "disabled"` genuinely inflates per-worker memory (~40-50% of the gap, HIGH confidence)

**Evidence**:
- With graph optimization off, ONNX Runtime keeps every intermediate tensor from every layer's forward pass live. Jina v2 Base Code is a 12-layer BERT, hidden size 768, 12 attention heads, fp16 (2 B/element).
- Memory math for a 384-token batch-32 forward pass:
  - Attention Q/K/V: 3 × 32 × 12 × 384 × 64 × 2 B ≈ 57 MB per layer
  - Intermediate FFN: 32 × 384 × 3072 × 2 B ≈ 75 MB per layer
  - Layer output: 32 × 384 × 768 × 2 B ≈ 18 MB per layer
  - 12 layers kept live: ≈ 1.8 GB transient tensors
  - Model weights (~162 MB) + CoreML compiled graph (~300 MB) + ANE buffers + transformers.js + V8 heap → ~7 GB for `"disabled"`, ~3-4 GB expected for `"all"`
- GH-239 benchmark-report explicitly confirms this attribution.
- The "disabled" workaround was introduced in GH-238 for an upstream ONNX Runtime `SimplifiedLayerNormFusion` missing-node bug. It is not a free lunch.

**Fix**: re-enable `graphOptimizationLevel: "all"` as the default for Jina v2 fp16 after validating correctness with a cosine-similarity parity test (≥ 0.9999 per vector). `"disabled"` remains a user-settable escape hatch.

### H5 — Implausibility guards are not the cause (LOW relevance, noted for test coverage)

`MAX_PLAUSIBLE_GB = 50` at `memory-calibrator.js:40` and per-sample guard at lines 304-311. The ~7 GB real cost is nowhere near the 50 GB ceiling; guards are not rejecting legitimate measurements. No change needed, but the new test suite should cover boundary conditions.

---

## 2. Trace Surprises — Latent Bugs Not in the Draft

Tracing turned up two structural issues that are not mentioned in the original ticket but are load-bearing for any coherent fix. Both are in scope for this analysis per user decision.

### Surprise #1 — Calibrator measures a different ONNX session than production (HIGH impact)

`bin/isdlc-embedding.js:542-551` builds `calibrationConfig` with only `device`, `dtype`, and `model`. **`session_options` is never forwarded.** The calibrator's spawned worker then runs with whatever transformers.js defaults to (typically `graphOptimizationLevel: "all"`), while production runs with the user's configured `"disabled"`.

Consequences:
- Calibrator is literally instrumenting a leaner session than the one that runs real work.
- Even a perfect calibrator fix on samples + cadence would still under-report, because it's measuring a less-memory-intensive session shape.
- Fingerprint hash at `memory-calibrator.js:63-69` covers only `device|dtype|model`, so two users with different `session_options` silently share a cached calibration.

This is a latent correctness bug that pre-dates #248 and would persist even after H1/H2/H4 are fully fixed. **Fix**: propagate `session_options` into `calibrationConfig`; expand `computeFingerprint()` to include the semantically-relevant `session_options` keys.

### Surprise #2 — Adapter silently re-clamps with hardcoded value (MEDIUM impact, becomes HIGH after calibrator fix)

`jina-code-adapter.js:151`:
```js
perWorkerMemGB: WORKER_MEMORY_ESTIMATE_GB[resolved.device] || 3,
```

The adapter's pool construction uses the **hardcoded** constant, not the calibrated value. Today this is harmless because the hardcoded 6 GB is conservative vs the under-measured 1.1 GB. **After the calibrator fix**, the hardcoded value will be pessimistic vs the (newly accurate) calibrated value, and the pool's internal re-clamp will silently undersize the pool — "calibrator says 4, pool runs 2, nobody can tell why".

**Fix**: thread the calibrated value from `resolveConfig()` through the adapter to pool construction; fall back to the hardcoded constant only when calibration returns null.

---

## 3. Workload-Unaware Pool Sizing (Secondary Root Cause)

Even with accurate per-worker memory, the current `autoParallelism()` implementation in `device-detector.js:375-397` and the duplicated math in `worker-pool.js:46-63` consider only CPU count and memory budget. **Neither path considers workload size.** A differential refresh of 2 files / 8 chunks would happily spawn the full calibrated pool size, paying the ~162 MB model-load cost per worker for no throughput benefit.

**Structural cause**: oversight, not design decision. No ADR, code comment, or test references workload-aware sizing. `autoParallelism()` was introduced in GH-239 to solve the memory-ceiling problem; no one asked "what about tiny workloads".

**Fix**: extract a shared `computeEffectiveParallelism({memoryCap, cpuCap, hardCap, workloadFloor})` helper; apply it in both `device-detector.autoParallelism()` and `worker-pool.resolvePoolSize()`; thread `workloadSize = texts.length` through CLI → engine → adapter → `resolveConfig()`. Compute `workloadFloor = ceil(chunkCount / batchSize / MIN_BATCHES_PER_WORKER)` with `MIN_BATCHES_PER_WORKER = 2`.

This is folded into this fix because it is the same code path — splitting it into a follow-up ticket would leave the calibrator fix half-useful.

---

## 4. Affected Code Paths

### Full call chain (parallelism: "auto" path)

```
bin/isdlc-embedding.js:runGenerate()
  → calibratePerWorkerMemory(config, { projectRoot })    [session_options IGNORED today]
    → generateSyntheticSamples(20, 2000)                 [H1: unrealistic input]
    → pool.embed(samples, 32, {})                        [H2: single batch, no steady state]
    → peakBytes = Math.max(...rssSamples)                [correct aggregation]
    → perWorkerMemGB = (peak - baseline) × 1.2           [~1.1 GB under-measured]
    → writeCachedCalibration(...)                        [fingerprint: H(device|dtype|model)]
  → embed(texts, config)
    → createJinaCodeAdapter(config)
      → resolveConfig(...)
        → autoParallelism()                              [WORKLOAD IGNORED today]
          → resolvePerWorkerMemGB → cache hit → 1.1 GB   [wrong number]
          → floor(availableGB / 1.1) → 14                [over-allocation]
          → min(maxByCpu=9, 14, hardCap=4) = 4           [parallelism: 4]
      → createPool(path, { perWorkerMemGB: 6 HARDCODED}) [SURPRISE #2]
        → spawn 4 workers × ~7 GB real = 28 GB on 24 GB  [swap → 0.73× P1]
```

### Files affected

| File | Role | Change |
|---|---|---|
| `lib/embedding/engine/memory-calibrator.js` | Measurement core | Sample source → real chunks; cadence 500→200 ms; window 5→20-30 s; timeout 120→300 s; fingerprint expansion |
| `lib/embedding/engine/device-detector.js` | Auto-parallelism math | `autoParallelism()` gains workload floor; math extracted to shared helper |
| `lib/embedding/engine/worker-pool.js` | Pool size duplicate math | `resolvePoolSize()` aligned with shared helper; constants dedup |
| `lib/embedding/engine/jina-code-adapter.js` | Pool construction | Line 151 uses calibrated value (surprise #2 fix); pool receives workload size |
| `lib/embedding/engine/index.js` | Engine → adapter bridge | Forward `workloadSize` through `embed()` signature |
| `bin/isdlc-embedding.js` | CLI entry | Propagate `session_options` into `calibrationConfig`; pass `workloadSize = texts.length` downstream; pre-chunk for calibrator |
| `src/core/config/config-defaults.js` | Default session_options | `graphOptimizationLevel` default flipped to `"all"` for Jina v2 fp16 |
| `lib/install/embeddings-prompt.js` | New-install config writer | `buildInitialEmbeddingsBlock()` stops writing `"disabled"` |
| `docs/isdlc/config-reference.md` | User docs | Update default, note fingerprint invalidation on upgrade |

### Tests affected

| File | Change |
|---|---|
| `lib/embedding/engine/memory-calibrator.test.js` | New cases for real-chunk sampling, session_options propagation, fingerprint expansion, steady-state timing |
| `lib/embedding/engine/device-detector.test.js` | New cases for workload-aware `autoParallelism` |
| `lib/embedding/engine/worker-pool.test.js` | New cases for workload-aware `resolvePoolSize`; helper extraction regression |
| `lib/embedding/engine/jina-code-adapter.test.js` | Assert calibrated value reaches pool construction |
| `lib/embedding/engine/graph-optimization-parity.test.js` (NEW) | Cosine similarity ≥ 0.9999 between `"disabled"` and `"all"` on pinned fixture corpus |
| `lib/embedding/engine/fixtures/parity-corpus/` (NEW) | ~100 real multi-language chunks checked into repo |

---

## 5. Blast Radius

### Runtime blast radius

- **Differential refresh**: unaffected by calibrator changes (calibrator doesn't run on diffs). Affected by workload-aware parallelism — small diffs now cap at `parallelism: 1` even under `"auto"`, which is the desired behavior.
- **Existing `parallelism: 1` users** (current safe default): unaffected. `autoParallelism()` is only entered when `raw.parallelism === "auto"`.
- **Users with explicit integer `parallelism: N`**: workload floor applies as a warn-but-respect cap, not a silent override. Asking for 8 workers on an 8-chunk diff logs a warning and proceeds with 8 if the user insists. (Decision: scope workload floor to `"auto"` only — don't override explicit values.)
- **Non-Jina models**: unaffected. `graphOptimizationLevel` default flip is scoped to Jina v2 fp16; calibrator remains model-agnostic.
- **Server-mode consumers** (`lib/embedding/server/`): unaffected. Calibrator is CLI-only today.

### Cache blast radius

- Fingerprint expansion invalidates all existing calibration caches on first run after upgrade. Users pay a one-time 20-30 s recalibration. Log message: `"[calibrate] fingerprint changed, recalibrating"`.
- Default flip for `graphOptimizationLevel` only affects new installs via `embeddings-prompt.js`. Existing users who have `"disabled"` explicitly in their `.isdlc/config.json` keep the escape hatch active. A release note will explain how to benefit from the fix (remove the explicit override).

---

## 6. Evidence Summary (Trace-Derived)

- All six bug report reproduction steps map directly to code at specified line numbers. Reproduction is sound.
- Primary hypotheses (H1, H2, H4) are each independently validated against the source. H3 (session_options propagation) and surprise #2 (adapter re-clamp) are **additional** findings from tracing that the draft did not cover.
- Workload-unaware pool sizing is confirmed as oversight (no code references, no ADR, no tests).
- Old hardcoded `WORKER_MEMORY_ESTIMATE_GB.coreml = 6` fallback is genuinely safer than the current calibration — a strong signal that the calibrator actively regresses safety.
- GH-239 benchmark-report (7.1 section) independently attributes the ~7 GB/worker cost to both `graphOptimizationLevel: "disabled"` and calibrator under-measurement, matching this root cause analysis.

---

## 7. What This Analysis Does Not Cover

- Differential refresh cache invalidation policy — deferred by user decision (calibrator doesn't run on diffs).
- Per-project calibration persistence (project-content hash in fingerprint) — not needed when calibration runs fresh on every full generation.
- Non-Jina v2 models — calibrator stays model-agnostic; fixes apply generically.
- Upstream `SimplifiedLayerNormFusion` fix — we depend on parity test catching any regression, not on source-level validation of the ONNX Runtime change.
- Memory infrastructure scale-out (HNSW, remote vector stores, #133) — unrelated.
