# Bug Summary — GH-248 (+ GH-249)

**Severity**: High — blocks `parallelism: "auto"` on the canonical 24 GB Apple Silicon + Jina v2 fp16 CoreML target. Not a production regression (safe default `parallelism: 1` is shipped) but NFR-002 (≥3× throughput via auto) cannot be delivered until fixed.

## What's broken

The memory calibrator reports ~1.1 GB/worker on synthetic samples, while real inference peaks near ~7 GB/worker. That 6× under-measurement feeds `autoParallelism()` and causes it to pick ~4 workers on 24 GB hardware. At ~7 GB each, 4 workers exceed available memory, swap to disk, and finish **slower** than `parallelism: 1` (0.73× throughput per GH-239 benchmark).

## Reproduction

1. Apple Silicon Mac, 24 GB, Jina v2 Base Code fp16 on CoreML, shipped `graphOptimizationLevel: "disabled"`.
2. Clear calibration cache, set `parallelism: "auto"` in `.isdlc/config.json`.
3. Run a full embedding generation over a project with ≥500 chunks.
4. Observe calibrator logs ~1.1 GB/worker; real `process.memoryUsage().rss` peaks near ~7 GB/worker.
5. Auto-parallelism picks 4+ workers → swap → net throughput regression.

## Affected users

- Any user who enables `parallelism: "auto"` on the target hardware. The shipped `parallelism: 1` safe default hides the bug — this is a broken promise for the auto feature, not a live outage.

## Affected area

| Path | Role |
|---|---|
| `lib/embedding/engine/memory-calibrator.js` | Measurement core — sample source, cadence, run duration |
| `lib/embedding/engine/device-detector.js` | `autoParallelism()` math — gains a workload-aware floor |
| `lib/embedding/engine/worker-pool.js` | `resolvePoolSize()` — aligned with shared helper |
| `lib/embedding/engine/jina-code-adapter.js` | Pool construction — threads calibrated value through (latent bug fix) |
| `lib/embedding/engine/index.js` | Forwards workload size to adapter |
| `bin/isdlc-embedding.js` | Propagates `session_options` into calibration; passes workload size down |
| `src/core/config/config-defaults.js` + `lib/install/embeddings-prompt.js` | `graphOptimizationLevel` default flips to `"all"` for Jina v2 fp16 |
| Tests | Calibrator, device-detector, worker-pool, adapter; new parity test file + fixture corpus |

## Out of scope

- Differential refresh path (calibrator doesn't run on diffs by design)
- Cache invalidation policy / project-shape detection
- Non-Jina models
- Memory infrastructure scale-out (#133)

Full details: `bug-report.md` · `root-cause-analysis.md` · `fix-strategy.md` · `tasks.md`
