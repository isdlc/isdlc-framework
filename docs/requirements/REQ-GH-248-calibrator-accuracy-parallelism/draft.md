# Calibrator accuracy + graphOptimizationLevel re-enablement for parallelism: auto

**Source**: GitHub Issue #248 (includes #249)
**Type**: Enhancement / Performance

## Problem

`lib/embedding/engine/memory-calibrator.js` reports wildly under-measured `perWorkerMemGB` compared to real-world inference.

Observed on a 24GB Apple Silicon Mac running Jina v2 Base Code fp16 CoreML during GH-239 empirical validation:

- **Calibration reports**: `1.1 GB/worker` (measured with 20 x 2000-char synthetic samples over ~5s)
- **Real-world peak**: `~7 GB/worker` (measured via process.memoryUsage().rss during a 512-chunk real code run)
- **Under-estimate**: ~6x

## Impact

The under-measurement breaks auto-parallelism math. `device-detector.resolvePerWorkerMemGB()` reads the cached calibration and feeds it to `computeAutoParallelism`:

```js
const byMemory = Math.max(1, Math.floor(availableMemGB / perWorker.value));
```

With calibration at 1.1 GB, the framework thinks it can run ~18 workers on 20 GB, vs the realistic ~2-3 workers. On the target 24 GB Mac, `parallelism: "auto"` would pick a pool size that immediately OOMs into swap, producing net throughput regression vs `parallelism: 1` (observed 0.73x in GH-239 benchmarks).

## Root Cause

The calibration samples are 20 strings of 2000 characters, filled with pseudo-code tokens:

1. **Tokenization differs**: synthetic text tokenizes differently than real multi-language code
2. **Attention memory is O(seq_len^2)**: short calibration sequences don't exercise the attention state
3. **Steady-state never reached**: 20-sample run completes in ~5s, runtime buffers don't stabilize
4. **Per-batch peak uncaptured**: 500ms RSS sampling interval during 5s run gives ~10 samples

## Proposed Fix

1. Pull real code chunks from the project under analysis instead of synthesizing
2. Run at least batch_size x 3 batches so ONNX session/CoreML stabilizes (~15-30s)
3. Capture worst-case peak RSS (Math.max across all samples, not mean)
4. Relax 2-minute NFR-003 ceiling for the peak-memory probe

## Also Includes #249

Re-enable `graphOptimizationLevel` for Jina v2 fp16. It was disabled as a GH-238 workaround. With accurate calibration, the optimization can be safely re-enabled.

## Related

- #240: Investigate CoreML GPU vs ANE routing (determines whether parallelism helps at all)
- #239: Worker pool parallelism (the feature that depends on accurate calibration)
- #238: Original embedding inference performance work

## Acceptance (from issue)

- Calibrator under-measurement fixed — reported perWorkerMemGB within 20% of real-world peak
- `parallelism: "auto"` produces a safe pool size that doesn't OOM on 24GB Mac
- `graphOptimizationLevel` re-enabled for Jina v2 fp16
- Throughput with auto-parallelism >= 3x baseline (NFR-002 from #239)
