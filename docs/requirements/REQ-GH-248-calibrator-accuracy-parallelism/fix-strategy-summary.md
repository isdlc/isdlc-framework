# Fix Strategy Summary — GH-248 (+ GH-249)

**Approach**: A — Single coherent PR, seven commits, commit-ordered for bisect.

## Why not three sequential PRs

Approach B (3 PRs) was considered and rejected. Each intermediate state between its PRs is strictly worse than today's broken state:
- After PR1 (graphOpt flip), cached calibration is stale; auto-parallelism still broken.
- After PR2 (adapter re-clamp fix), adapter stops using the 6 GB hardcoded ceiling and uses the 1.1 GB calibrated value → **more workers spawn** → worse OOM than today.

Commit-level bisect inside one PR gives the granularity benefit without the regression risk.

## Commit order

1. Cosine-similarity parity test + pinned fixture corpus (~100 real chunks)
2. `graphOptimizationLevel` default flip `"disabled"` → `"all"` (parity test gates this)
3. `session_options` propagation into `calibrationConfig` + fingerprint expansion (surprise #1)
4. Calibrator rework: real chunks via `chunker`, 200 ms cadence, 20-30 s window, 300 s timeout
5. Adapter re-clamp fix at `jina-code-adapter.js:151` (surprise #2)
6. Extract `computeEffectiveParallelism` helper + dedup constants
7. Thread `workloadSize` through CLI → engine → adapter → `resolveConfig`

## Top regression risks

| Risk | Mitigation |
|---|---|
| Silent embedding corruption after graphOpt flip | Cosine-parity test (commit 1) gates commit 2; `"disabled"` escape hatch preserved |
| Workload floor over-constrains explicit `parallelism: N` users | Floor applies to `"auto"` only; explicit values warn-but-respect |
| Fingerprint change invalidates existing caches | One-time 20-30 s recalibration on first post-upgrade run; logged |
| Upstream `SimplifiedLayerNormFusion` still broken | Revert commit 2 only, keep commits 3-7 — net positive even without the flip |

## Success criteria

1. `parallelism: "auto"` picks 2-3 workers on 24 GB + Jina v2 fp16 CoreML (not 1, not 14+)
2. Throughput at `"auto"` ≥ 3× the `parallelism: 1` baseline (NFR-002)
3. Cosine parity test passes (≥ 0.9999 per vector)
4. Small workloads (<16 chunks) cap at `parallelism: 1` under `"auto"`
5. All new and existing tests pass
6. Explicit user `parallelism: N` values respected (warning if above workload floor)
7. Constitutional review (Articles I, II, V, X, XII) passes

## Test gaps closed

- New parity test guards silent embedding corruption (Article II fail-safe)
- New calibrator tests cover session_options propagation, fingerprint expansion, steady-state timing, real-chunk fallback
- New device-detector and worker-pool tests cover workload-aware pool sizing
- New adapter tests catch silent hardcoded re-clamp (surprise #2 regression guard)
- New end-to-end integration test covers calibrate → auto-parallelism → pool construction → embed

Full details: `fix-strategy.md`
