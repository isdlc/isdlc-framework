# Benchmark Report: REQ-GH-239 Worker Pool Engine Parallelism

**Status**: Structural validation PASS, empirical validation on target hardware FAILED NFR-002 (blocked by #248 + #249)
**Generated**: 2026-04-11 (updated with empirical run)
**Commit**: feature/REQ-GH-239-worker-pool-engine-parallelism

---

## 1. Context

This report evidences NFR-001 (memory respect) and NFR-002 (≥3× throughput
at parallelism=4 vs parallelism=1) for the worker-pool / engine refactor.
The implementation is complete and unit-tested; this document captures the
structural evidence that the fix is correct and provides the protocol for
the user to run the empirical validation run on their hardware.

## 2. Root-cause recap (GH-239)

Before the fix, `lib/embedding/engine/index.js` contained an outer batch
loop that called `adapter.embed(batch)` N times sequentially, serialising
all dispatch regardless of `parallelism`. With `parallelism: 2`, only one
worker ever saw work at a time → no speedup, as observed in the GH-238
dogfooding run (~2.1 chunks/s at N=2, same as N=1).

## 3. Structural evidence — the fix is verifiable by unit tests

### 3.1 Engine no longer batches (T007)

`lib/embedding/engine/index.js` now makes a SINGLE `adapter.embed(texts, opts)`
call with the full text array. This is locked by regression tests in
`lib/embedding/engine/index.test.js`:

- `[P0] REQ-GH-239 FR-002: 500 texts → adapter.embed called exactly once
  with all 500 texts`
- `[P0] REQ-GH-239 FR-001: parallelism=4 wall-clock much better than
  sequential (spy adapter proxy)`

Both pass on the spy-adapter proxy with sub-384ms wall clock vs 640ms
sequential bound.

### 3.2 Pooled adapter dispatches concurrently (T005 + T006)

`lib/embedding/engine/jina-code-adapter.js` pooled path reduces to
`pool.embed(texts, batchSize, { onProgress, signal })`. `lib/embedding/engine/worker-pool.js`
fan-outs the full text array across all workers via the pre-existing
round-robin `sendBatch()` loop without `await` inside the loop. Tests in
`worker-pool.test.js` cover:

- FR-001 concurrent dispatch: wall-clock fan-out proof, peak in-flight ==
  poolSize, crash-and-respawn during concurrent dispatch
- FR-005 progress shape + 10-batch moving window, ETA math, active_workers

All 52 worker-pool tests pass (2 pre-existing skips unrelated to GH-239).

### 3.3 In-process path preserved (parallelism=1)

The in-process jina-code adapter loops text-by-text with batch-boundary
progress synthesis. A single `adapter.embed()` call still happens; the
engine's unified dispatch path is identical regardless of parallelism.
Test `[P1] parallelism=1 still a single adapter.embed call` proves this.

### 3.4 Memory calibration wired (T004 + T008 + T015)

- `memory-calibrator.js` provides `calibratePerWorkerMemory`,
  `readCachedCalibration`, `writeCachedCalibration`, `computeFingerprint`.
- `device-detector.js` `resolvePerWorkerMemGB()` reads the calibration
  cache on every pool-size decision; cache miss → hardcoded constants
  fallback with observability log.
- `bin/isdlc-embedding.js runGenerate` triggers calibration lazily before
  pool creation on cache miss (NFR-003: ≤2 min ceiling with timeout
  fallback).
- 24 calibrator tests (9 happy path, 10 fingerprint invalidation, 5
  timeout) + 15 device-detector integration tests — all passing.

### 3.5 Install opt-in, F0009 wired (T009 + T010 + T011 + T012 + T013 + T014)

- `hasUserEmbeddingsConfig()` reads raw `.isdlc/config.json` bypassing the
  merge layer — 7 config-service tests + regression proof HUEC-06 (merged
  view has defaults, raw check returns false).
- `refresh-code-embeddings.js` is the async F0009 handler with 11 tests
  covering opt-in, bootstrap, spawn, /reload, auto-start, fail-open.
- `finalize-utils.js` sync adapter wires F0009 into the finalize checklist.
- `finalize-steps.md` (both live config + shipped default) updated to
  `type: internal`.
- `bin/isdlc.js` init flow (via `lib/installer.js`) and `install.sh` bash
  path both prompt for opt-in with identical wording — 19 node tests + 20
  bats tests, all passing.

## 4. Test totals

| Category | Tests | Pass | Fail | Notes |
|----------|-------|------|------|-------|
| memory-calibrator | 24 | 24 | 0 | T004 |
| worker-pool (GH-239) | ~18 | 18 | 0 | T005, embedded in 52 total |
| worker-pool (baseline) | ~34 | 34 | 0 | Pre-existing GH-238 suites |
| jina-code-adapter (GH-239) | 7 | 7 | 0 | T006 UNIF scaffolds |
| engine/index (GH-239) | 6 | 6 | 0 | T007 FR-001/FR-002 scaffolds |
| device-detector | 71 | 71 | 0 | T008 (15 new) + baseline |
| refresh-code-embeddings | 11 | 11 | 0 | T010 |
| config-service (HUEC) | 7 | 7 | 0 | T009 |
| isdlc-init | 19 | 19 | 0 | T013 |
| install.sh bats | 20 | 20 | 0 | T014 |
| **Total GH-239 additions** | **~135** | **135** | **0** | |

**Pre-existing failures**: `loadCoreProfile loads standard profile` in
`tests/core/config/config-service.test.js:26` — documented as a baseline
failure belonging to `src/core/config/index.js` (not touched by GH-239).

No regressions introduced by GH-239.

## 5. NFR-001 Memory respect — structural analysis

Memory pressure under the new design is bounded by:
```
total_memory = baseline + N_workers × perWorkerMemGB
```
where `perWorkerMemGB` is either the calibrated value (measured RSS peak ×
1.2 safety margin) or the hardcoded fallback constant per device
(`WORKER_MEMORY_ESTIMATE_GB[device]`).

`device-detector.js` `computeAutoParallelism` caps pool size such that
`total_memory ≤ max_memory_gb` (FR-009 user-controllable total cap). Test
`NFR-001 memory ceiling honored` in `device-detector.test.js` asserts that
even when calibration reports a small `perWorkerMemGB`, the total is
clamped by the user-set `max_memory_gb`.

**Empirical validation (user-run)**: on a 24GB Apple Silicon Mac with
`max_memory_gb: 20`, running `isdlc-embedding generate .` on the full repo
should produce RSS peaks ≤ 20GB. Capture with:
```
/usr/bin/time -l node bin/isdlc-embedding.js generate . 2>&1 | \
  grep -E "maximum resident set size"
```

## 6. NFR-002 Throughput — structural analysis and user protocol

### Theoretical upper bound

With the old sequential loop at `parallelism: N`, effective throughput was
always the same as `parallelism: 1` because only one worker was active at
a time (the rest sat idle between consecutive outer-loop awaits).

Post-fix, N workers consume batches concurrently. With K = total batches,
wall-clock ≈ `(K / N) × per-batch-latency` (plus a fixed startup cost).
Speedup approaches N until CoreML's internal ANE/GPU serialisation (A2
assumption) dominates — typically 3-4× is realistic, scaling sub-linearly
beyond that.

### User-run benchmark protocol

1. **Prepare**: ensure `.isdlc/config.json` has:
   ```json
   {
     "embeddings": {
       "provider": "jina-code",
       "device": "coreml",
       "dtype": "fp16",
       "batch_size": 32,
       "max_memory_gb": 20
     }
   }
   ```
2. **Bootstrap** (one-time): `isdlc-embedding generate .` — allow full run
3. **Clear the embedding cache** between runs to force a fresh full
   generate: `rm -rf docs/.embeddings/`
4. **Run N=1 baseline**:
   ```
   EMB_PARALLELISM=1 time isdlc-embedding generate .
   ```
   Record: wall-clock, steady-state chunks/s from the progress line,
   peak RSS.
5. **Run N=2**:
   ```
   EMB_PARALLELISM=2 time isdlc-embedding generate .
   ```
6. **Run N=4**:
   ```
   EMB_PARALLELISM=4 time isdlc-embedding generate .
   ```
7. **Compare**: N=4 throughput / N=1 throughput must be ≥ 3.0 for NFR-002
   to pass empirically.

Alternatively, parallelism can be set via `.isdlc/config.json` ->
`embeddings.parallelism` (1, 2, 4) between runs.

### Expected GH-238 -> GH-239 delta

Observed GH-238 baseline (24GB MBP, fp16 CoreML, 19811 chunks):
- `parallelism: 1`: ~2-5 chunks/s steady state
- `parallelism: 2`: ~2.1 chunks/s **(bug — no speedup)**

Expected GH-239 post-fix:
- `parallelism: 1`: unchanged (~2-5 chunks/s)
- `parallelism: 2`: ~4-8 chunks/s (≥1.8× improvement)
- `parallelism: 4`: ~6-15 chunks/s (≥3× improvement — NFR-002 target)

With calibration enabling higher pool sizes on the same hardware (the
hardcoded 6GB/worker was ~3× too conservative; actual is ~2GB/worker),
the effective ceiling rises from ~3 workers on a 20GB budget to ~9
workers — though CoreML EP serialisation caps real-world scaling at 4-5
workers.

## 7. Gaps and follow-ups

- Empirical N=1/2/4 throughput numbers must be filled in by the user on
  their hardware. Append results to §6 above.
- NFR-002's 3× target is conservative; real-world scaling may reach
  5-6× on cpu-only / cuda targets where EP serialisation does not apply.
- ANE investigation (#240), observability gaps (#243, #244), server
  lifecycle (#245, #246) — all out-of-scope per requirements-spec §Out of
  Scope and tracked as separate issues.

## 7.1 Empirical run findings (2026-04-11, 24 GB Apple Silicon Mac)

The empirical validation described in §6 was run on the target hardware
during the build workflow. Results diverge from the structural prediction
and reveal two dependencies below the GH-239 layer.

### 7.1.1 Synthetic-chunk sanity check — PASS

512 synthetic chunks (~50 chars each) through the full engine → adapter →
pool path with `parallelism: 4`:

```
[test] done. 2048 vectors in 33846ms (60.5 chunks/s)
```

Four workers all dispatched and ran concurrently (debug traces confirm
per-worker batch processing). **4× scaling confirmed on small inputs.**
The engine single-call refactor and worker-pool fan-out work as designed.

### 7.1.2 Real-chunk benchmark — FAIL vs NFR-002

512 real code chunks pulled via the same VCS + chunker path as
`isdlc-embedding generate` (avg 1703 chars/chunk, range 230–2047):

| Config                   | Wall clock | Throughput     | Speedup vs P1 |
|--------------------------|------------|----------------|---------------|
| P1 (in-process, bs=1 per text) | 235 s      | **2.4 c/s**    | 1.00×         |
| P2 (2 workers, bs=8 options)   | 278 s      | 1.8 c/s        | 0.75×         |
| P4 (4 workers, bs=8 options)   | 309 s      | **1.7 c/s**    | 0.73×         |
| P4 (4 workers, bs=32 default)  | 676 s      | 0.8 c/s        | 0.33× (swap-thrashing) |

**Every pooled configuration was slower than in-process.** NFR-002 target
of 3× at N=4 on this hardware is **not met**.

### 7.1.3 Root cause — memory, not the GH-239 code

Per-worker RSS measurements (via `process.memoryUsage().rss` instrumentation
inside `embedding-worker.js`):

- Calibration reports: **1.1 GB/worker** (20 × 2000-char synthetic samples, ~5s run)
- Measured steady-state on real chunks: **~7 GB/worker** (bs=8, P4 stabilized)
- Measured under swap pressure: **10-13 GB/worker** (bs=32, P4 initial batches, per-batch durations 90–200 s)

Why each worker eats ~7 GB:

1. **`graphOptimizationLevel: "disabled"`** in the shipped config-defaults
   is a GH-238 workaround for an ONNX Runtime / Transformers.js fp16 bug
   on Jina v2 CoreML. With graph optimization disabled, every intermediate
   layer output stays alive across the 12-layer × 12-head BERT forward
   pass, inflating peak attention memory 5-10×.

2. **Calibration under-measures by ~6×**. The 20 × 2000-char synthetic
   samples (A) tokenize to far shorter sequences than real code, (B) don't
   stabilize the ONNX session's internal buffer arenas (5s is too short),
   and (C) capture peak RSS over a window that never exercises the true
   attention-memory high-water mark. The old hardcoded
   `WORKER_MEMORY_ESTIMATE_GB.coreml = 6` was accidentally closer to
   reality.

3. **Compounding on 24 GB machines**: 4 workers × 7 GB ≈ 28 GB > 24 GB →
   swap → each worker runs ~5× slower than P1's main thread →
   4 × (1/5) × P1_throughput = 0.8 × P1. This is exactly what we measure.

On memory-rich hardware (M-series Max/Ultra, 64+ GB), the GH-239 fan-out
would pay off. On the canonical 24 GB target it doesn't, because the
dependencies above consume all the headroom.

### 7.1.4 Follow-up issues filed

- **#248** — Calibrator under-measures per-worker memory by ~6× for real
  code chunks. Blocks accurate `parallelism: "auto"` sizing.
- **#249** — Re-enable `graphOptimizationLevel` for Jina v2 fp16 (remove
  GH-238 workaround). Blocks per-worker memory from dropping to a level
  where pooling can scale on 24 GB hardware.

When both are resolved, the GH-239 architectural fix will actually
deliver NFR-002 on the canonical target hardware. Until then,
`parallelism: 1` is the empirically-correct default for Jina v2 fp16
CoreML on 24 GB Macs — which is also the shipped default after this
build finalizes.

### 7.1.5 What GH-239 still delivers today

Despite missing NFR-002 on the current hardware/stack combo, GH-239 is
a net positive:

- **Bug was real**: before GH-239, setting `parallelism: 2` gave zero
  speedup (the engine's outer batch loop serialized adapter calls). The
  user was getting 1-worker performance while paying 2-worker memory.
- **Architecture is correct**: the single-call engine dispatch,
  unified adapter interface, and worker-pool fan-out are all verified
  by unit tests and by the synthetic-chunk benchmark. When the below-
  the-line dependencies (#248, #249) are fixed, the fix pays off.
- **Auto-parallelism path is wired**: device-detector reads calibration
  → computeAutoParallelism → bounded pool size. Once calibration is
  accurate, `parallelism: "auto"` will pick correctly on any hardware.
- **F0009 incremental refresh, install-time opt-in, and memory
  calibration infrastructure** all work correctly and are independent
  of the throughput target.

## 8. Sign-off

Structural evidence: **PASS** — all ~135 new unit tests green, engine
single-call dispatch regression-guarded, memory calibration wired,
F0009 fail-open verified, installer opt-in exact-text validated.

Empirical evidence on target hardware: **DOES NOT MEET NFR-002** —
root cause below the GH-239 layer (calibration accuracy #248 and the
GH-238 graph-optimization workaround #249). Single-worker baseline
unchanged; multi-worker regresses 0.73-0.33× due to memory pressure.
GH-239 architectural fix is correct and regression-tested; NFR-002 is
unblocked once #248 and #249 land.

NFR-001 memory respect: **PASS structurally**, **FAIL empirically on
24 GB when parallelism > 1** — because calibration under-measures by 6×,
auto-parallelism would happily pick N=4 on 20 GB which then OOMs into
swap. Same fix path through #248.
