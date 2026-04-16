# Root Cause Summary — GH-248 (+ GH-249)

**Confidence**: High. Three independent root causes compound plus two latent bugs surfaced by tracing.

## Primary causes (the ~6× gap)

| # | Cause | Gap contribution |
|---|---|---|
| H1 | Synthetic calibration samples are tokenizer-degenerate. 38-word vocabulary, repeated tokens, WordPiece collapses attention to low-rank regime. Real code exercises O(n²) attention properly. | ~30-40% |
| H2 | Sampling window is too short and too sparse. 500 ms cadence × ~5 s run = ~10 RSS samples; single batch finishes before ONNX/CoreML reach steady state. `Math.max` aggregation is correct — the input is the problem. | ~20-30% |
| H4 | `graphOptimizationLevel: "disabled"` (GH-238 workaround) keeps all intermediate layer outputs live across the 12-layer fp16 BERT forward pass, inflating per-worker memory by ~2×. Real cost ~7 GB vs ~3-4 GB expected with `"all"`. | ~40-50% (of measured reality) |

## Latent bugs found during tracing (not in original ticket)

### Surprise #1 — Calibrator measures a different ONNX session than production

`bin/isdlc-embedding.js:542-551` does not forward `session_options` into `calibrationConfig`. The calibrator worker runs with transformers.js default graph optimization (`"all"`) while production runs with the user's `"disabled"`. Fingerprint at `memory-calibrator.js:63-69` covers only `device|dtype|model`, so two users with different session_options silently share a stale cache.

**Pre-dates #248, would survive any H1/H2/H4 fix**. In scope for this analysis.

### Surprise #2 — Adapter silently re-clamps with hardcoded value

`jina-code-adapter.js:151` passes `WORKER_MEMORY_ESTIMATE_GB[device] || 3` (hardcoded) to pool construction, not the calibrated value. Today this is harmless because the hardcoded 6 GB is conservative vs the under-measured 1.1 GB. **After the calibrator fix**, the hardcoded value becomes more pessimistic than the calibration → pool silently undersizes.

**Load-bearing — must land with the calibrator fix or the fix under-delivers**. In scope for this analysis.

## Secondary root cause

The auto-parallelism math (`autoParallelism()` in `device-detector.js` and `resolvePoolSize()` in `worker-pool.js`) does not consider **workload size**, only CPU count and memory budget. Even with an accurate per-worker memory number, a 2-file/8-chunk differential would still spawn the full calibrated pool size, paying the ~162 MB model-load cost per worker for no throughput benefit.

Structural cause: oversight, not design decision. No code comments, ADRs, or tests reference workload-aware sizing. Folded into this fix because splitting it into a follow-up ticket would leave the calibrator fix half-useful.

## Evidence

- `memory-calibrator.js` source confirms H1, H2 at exact line numbers.
- Memory math for H4 works out to ~1.8 GB/layer × 12 layers + model weights + CoreML overhead → ~7 GB.
- `WORKER_MEMORY_ESTIMATE_GB.coreml = 6` fallback is "accidentally closer to reality" than calibration per GH-239 benchmark-report — strong signal the calibrator is actively regressing safety.
- GH-239 benchmark-report section 7.1 independently attributes the 7 GB/worker cost to both `graphOptimizationLevel: "disabled"` AND calibrator under-measurement.

Full details: `root-cause-analysis.md`
