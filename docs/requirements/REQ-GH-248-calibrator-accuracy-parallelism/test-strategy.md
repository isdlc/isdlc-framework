# Test Strategy — REQ-GH-248 Calibrator Accuracy + Workload-Aware Parallelism (bundles GH-249)

**Slug**: REQ-GH-248-calibrator-accuracy-parallelism
**Phase**: 05 — Test Strategy & Design
**Workflow**: build
**Inputs**: bug-report.md, root-cause-analysis.md, fix-strategy.md, tasks.md
**Covers**: FR-001 .. FR-008 (8 FRs, 27 ACs)
**Constitutional articles applied**: II (Test-First), VII (Traceability), IX (Gate Integrity), XI (Integration Testing), X (Fail-Safe Defaults)

> Every AC referenced in tasks.md (AC-001-01 .. AC-008-03) is defined in §3 "AC Catalogue" below. The catalogue is the authoritative mapping — tasks.md and fix-strategy.md both refer to these IDs but do not inline them. Phase 06 implementation tests assert against the AC IDs named here.

---

## 1. Strategy Overview

### 1.1 Scope

This strategy covers the coupled fix for GH-248 (calibrator accuracy + workload-aware auto-parallelism) and GH-249 (graphOptimizationLevel default re-enablement). The fix spans seven files in `lib/embedding/engine/` plus `bin/isdlc-embedding.js`, `src/core/config/config-defaults.js`, and `lib/install/embeddings-prompt.js`. All test work lands in existing test files plus two new additions (`graph-optimization-parity.test.js` and `fixtures/parity-corpus/`).

**In scope**
- FR-001: Calibrator pulls real project chunks via the existing chunker (not synthetic 38-word vocabulary)
- FR-002: Calibrator reaches steady-state via denser sampling cadence, longer window, wider timeout
- FR-003: `session_options` flows CLI → `calibrationConfig` in `bin/isdlc-embedding.js:542-551`
- FR-004: `computeFingerprint()` includes semantically-relevant `session_options` keys
- FR-005: `graphOptimizationLevel` default flips from `"disabled"` to `"all"` for Jina v2 fp16, gated by a cosine-similarity parity test
- FR-006: `autoParallelism()` considers a workload floor derived from chunk count and batch size
- FR-007: `jina-code-adapter.js:151` passes the calibrated per-worker value through to pool construction (no silent re-clamp against hardcoded)
- FR-008: Single source of truth for parallelism math via a shared `computeEffectiveParallelism()` helper; constants deduplicated between `device-detector.js` and `worker-pool.js`

**Out of scope** (per fix-strategy §5)
- Differential-refresh cache invalidation policy (calibrator doesn't run on diffs)
- Per-project calibration persistence beyond the existing fingerprint cache
- Non-Jina v2 models (fix is model-agnostic for calibrator; default flip scoped to Jina v2 fp16)
- Server-mode calibration (server doesn't call calibrator today)
- Upstream ONNX Runtime source validation (parity test is the correctness gate)

### 1.2 Test Levels

| Level | Purpose | Where |
|---|---|---|
| **L1 Unit** | Deterministic verification of one function/module at a time with dependency injection for the ONNX session, chunker output, RSS reader, and worker pool factory. This is where 95% of the test effort lives. | `lib/embedding/engine/*.test.js` |
| **L2 Integration** | Wire together calibrate → fingerprint → read cache → autoParallelism → resolvePoolSize → adapter construction in a sandbox project root. ONNX session still mocked for hermeticity. Validates contracts between modules the unit tests cannot. | `lib/embedding/engine/memory-calibrator.test.js` (end-to-end section) or a new section in `device-detector.test.js` |
| **L3 Parity** | Cosine-similarity regression gate — compare embeddings from `graphOptimizationLevel: "disabled"` vs `"all"` on a pinned corpus of ~100 real multi-language chunks. Uses the real transformers.js pipeline (not mocked) with a small model load. Runs once per CI job for the Jina v2 fp16 target only; skipped on non-macOS runners where CoreML is unavailable. | `lib/embedding/engine/graph-optimization-parity.test.js` (NEW) |
| **L4 Manual (Phase 16)** | Real 24 GB Apple Silicon end-to-end run: calibrate → generate → observe pool size 2-3 → measure ≥3× throughput vs parallelism:1 baseline. Deferred to Phase 16 quality loop per tasks.md T030-T033. | Phase 16 tasks |

### 1.3 Tooling

- **Runner**: `node --test` (Node.js built-in)
- **Assertions**: `node:assert/strict`
- **No coverage tool** (project-wide — aligns with `docs/isdlc/test-evaluation-report.md`)
- **DI strategy**: Every test uses the existing injection hooks (`_createWorkerPool`, `_rssReader`, `_pipelineFactory`, `_resolvePerWorkerMemGB`, `_cpuCountFn`, `_totalMemFn`, `_platformEnv`) — no new mocks of Node internals needed
- **Sandbox fs**: `fs.mkdtempSync(os.tmpdir(), ...)` per existing pattern in `memory-calibrator.test.js` and `device-detector.test.js`
- **Test conventions**: match the existing project convention — `describe` grouped by FR, `it` tagged `[P0|P1|P2] {REQ-ID} {FR-ID} {AC-ID}: Given ... When ... Then ...`
- **No new runtime dependencies**: the parity test uses the already-installed `@huggingface/transformers` when present and is gracefully skipped otherwise (`test.skip` with reason)

### 1.4 Coverage Target

Per existing project norms (no formal coverage tooling):
- **Every FR has ≥1 P0 test case**
- **Every AC in §3 has ≥1 test case** (100% AC-to-test mapping; see traceability matrix §5)
- **Every behavioral branch** flagged in root-cause-analysis.md §1-2 has a positive AND negative test:
  - H1 synthetic samples: real-chunk sampling tested positively (AC-001-01..03) AND synthetic-fallback tested for <20 chunks (AC-001-03)
  - H2 sampling cadence/window: 200 ms cadence, ≥20 s window, 300 s timeout tested positively (AC-002-01..04)
  - H4 graph optimizer: parity test on real pipeline (AC-005-04) AND default flip checked on config resolution (AC-005-01..03)
  - Surprise #1 session_options: propagation into calibrationConfig tested (AC-003-01..03) AND fingerprint sensitivity tested (AC-004-01..03)
  - Surprise #2 adapter re-clamp: calibrated value reaches pool (AC-007-01..02) AND fallback to hardcoded when calibration is null (AC-007-03)
  - Workload-unaware sizing: workload floor applied to `"auto"` (AC-006-01..03) AND NOT applied to explicit integer (AC-006-04)

### 1.5 Constitutional Article Coverage

| Article | How the strategy satisfies it |
|---|---|
| **II — Test-First Development** | Every test case in §4 is written and failing BEFORE its corresponding implementation task (T007-T019) is allowed to start. Phase 06 commit order (fix-strategy §1) puts parity test before default flip; unit tests T020-T024 land as part of the same commit as the production change they cover. |
| **VII — Artifact Traceability** | §3 AC Catalogue + §5 Traceability Matrix enumerate FR → AC → test case → target test file → Phase 06 task. No orphan ACs, no orphan tests. |
| **IX — Quality Gate Integrity** | Gate-04 checklist (§9) validates every required artifact before Phase 06 can start. |
| **X — Fail-Safe Defaults** | AC-005-01 validates the new default is `"all"` AND AC-005-02 validates `"disabled"` remains user-settable (escape hatch). AC-001-03 validates synthetic-sample fallback path is preserved when real chunks are unavailable. |
| **XI — Integration Testing Integrity** | §4 §IT (integration suite) wires calibrate → fingerprint → cache → autoParallelism → pool construction end-to-end in a hermetic sandbox. |
| **XII — Cross-Platform Compatibility** | Parity test (§4 FR-005) is gated on macOS arm64 for the CoreML path; device-detector workload-floor tests (§4 FR-006) cover coreml/cuda/cpu/directml branches via `mockEnv()`. |

### 1.6 Existing Infrastructure (from docs/isdlc/test-evaluation-report.md)

- **Runner**: `node --test` (no Jest, no Vitest)
- **Framework**: native `node:test` with `describe`/`it`, `beforeEach`/`afterEach`
- **Assertion style**: `assert` from `node:assert/strict`, including `assert.equal`, `assert.deepEqual`, `assert.ok`, `assert.rejects`, `assert.match`
- **Existing test patterns reused**:
  - Dependency injection via `_`-prefixed option keys (`_createWorkerPool`, `_rssReader`, `_pipelineFactory`, `_resolvePerWorkerMemGB`, `_cpuCountFn`, `_totalMemFn`, `_platformEnv`)
  - `mockEnv()` factory in `device-detector.test.js` — reused for all platform-variant tests
  - `makeMockPoolFactory()` in `memory-calibrator.test.js` — extended with new options for steady-state windowing
  - `makeNormalizedVector()` in `jina-code-adapter.test.js` — reused for parity fixture generation
  - `makeSandboxProjectRoot()` in `device-detector.test.js` — reused for calibration cache round-trips
- **Test command (unchanged)**: `npm test` (runs `node --test lib/**/*.test.js`)

**Decision**: extend existing test infrastructure. Do NOT introduce a new framework, mock library, or coverage tool. Every new test below slots into an existing test file or a single new file (`graph-optimization-parity.test.js`) that follows the same conventions.

---

## 2. Test Environment and Preconditions

### 2.1 Hermetic Test Environment (L1 + L2)

- **Working directory**: `fs.mkdtempSync(os.tmpdir(), 'req-gh-248-')` per test — never touches the real project
- **Project root**: sandbox has `.isdlc/` subdirectory created in `beforeEach`
- **ONNX pipeline**: fully mocked via `_pipelineFactory` — the real Jina v2 model is never loaded in L1/L2
- **Worker pool**: fully mocked via `_createWorkerPool` — no real `worker_threads` spawned
- **RSS reader**: fully mocked via `_rssReader` returning a deterministic sequence (see `makeMockPoolFactory()` pattern)
- **Chunker output**: injected via new `_sampleProvider` hook (to be added to `memory-calibrator.js` in T012) — returns an array of pre-built chunk strings
- **Platform info**: `mockEnv()` from `device-detector.test.js` — inject `platform`, `arch`, `totalMem`, `cpuCount`, `pathExists`

### 2.2 Parity Test Environment (L3, FR-005)

- **Runs on**: macOS arm64 only (CoreML is macOS-exclusive). Skipped on Linux/Windows CI runners with `test.skip` and a reason string.
- **Model**: Jina v2 Base Code fp16 via the real `@huggingface/transformers` pipeline. Model download is cached in `~/.cache/huggingface` on first run.
- **Fixture corpus**: `lib/embedding/engine/fixtures/parity-corpus/` — checked-in collection of ~100 real multi-language chunks (JS, TS, Python, Go, Rust, Markdown). Length distribution 200-2000 chars. Stored as a flat directory of files, one chunk per file, names `01-js-short.js`, `02-ts-long.ts`, …, or equivalently as a single `corpus.json` with an array of `{id, language, content}` entries. Choice of layout deferred to T007 implementation, but every chunk has a stable numeric ID so failures can pinpoint the offending vector.
- **Expected runtime**: ~30-45 s on Apple Silicon (two embed passes over 100 chunks). Acceptable for CI.

### 2.3 Phase 16 Manual Environment (L4)

- **Hardware**: 24 GB Apple Silicon Mac (M1/M2/M3 Base tier)
- **Config**: `.isdlc/config.json` with `parallelism: "auto"` and no explicit `graphOptimizationLevel` override
- **Project**: Any real multi-language project with ≥500 chunks (use the framework itself as the target; it already has ~19k chunks)
- **Baseline**: `parallelism: 1` throughput numbers from `docs/requirements/REQ-GH-239-worker-pool-engine-parallelism/benchmark-report.md` §7.1

---

## 3. AC Catalogue (Authoritative)

tasks.md references AC IDs AC-001-01 through AC-008-03 but does not inline their text. This catalogue is the authoritative source and is referenced by every test case in §4.

### FR-001 — Calibrator samples real project chunks (not synthetic)

- **AC-001-01**: Given ≥20 chunks available from the existing chunker in `bin/isdlc-embedding.js`, When `calibratePerWorkerMemory()` runs, Then `generateSamples()` returns a random subsample of size `min(100, chunkCount)` drawn from the injected chunker output (NOT from the 38-word synthetic vocabulary).
- **AC-001-02**: Given real chunks are sampled, When inference runs, Then the per-batch inputs consist of full-entropy tokenized code (assertable via the sample source — sample content matches a chunk from the chunker output, not a synthetic template).
- **AC-001-03**: Given fewer than 20 chunks available in the project (tiny-project fallback), When `calibratePerWorkerMemory()` runs, Then it falls back to `generateSyntheticSamples()` and logs a warning. This preserves the existing fail-safe path (Article X).

### FR-002 — Calibrator reaches steady-state via denser sampling

- **AC-002-01**: Given `DEFAULT_CALIBRATION_OPTIONS`, When inspected, Then `samplingIntervalMs === 200` (down from 500).
- **AC-002-02**: Given a simulated 25 s inference run, When calibration completes, Then at least 100 RSS samples are collected (≥ `floor(25000 / 200)`).
- **AC-002-03**: Given `DEFAULT_CALIBRATION_OPTIONS`, When inspected, Then `timeoutMs === 300000` (up from 120000).
- **AC-002-04**: Given a calibration run completes normally, When `result.durationMs` is inspected, Then it reflects a target window of 20-30 s (not the old ~5 s). Assertion: `durationMs ≥ 18000` under a mock that releases after sampleCount × batchCount tick ticks.

### FR-003 — session_options propagation CLI → calibrator

- **AC-003-01**: Given `.isdlc/config.json` contains `embeddings.session_options.graphOptimizationLevel: "disabled"`, When `bin/isdlc-embedding.js` builds `calibrationConfig`, Then the resulting config object contains a `session_options` field with `{graphOptimizationLevel: "disabled"}`.
- **AC-003-02**: Given `calibrationConfig.session_options` is set, When the calibrator spawns its worker pool, Then `workerData.session_options` equals the config's value (round-trip through pool construction).
- **AC-003-03**: Given no `session_options` in config, When `bin/isdlc-embedding.js` builds `calibrationConfig`, Then `session_options` is an empty object `{}` (NOT undefined — matches existing `resolveConfig` contract at `device-detector.js:319`).

### FR-004 — Fingerprint hash includes session_options keys

- **AC-004-01**: Given two configs `A = {device, dtype, model, session_options: {graphOptimizationLevel: "disabled"}}` and `B = {device, dtype, model, session_options: {graphOptimizationLevel: "all"}}` that differ ONLY in `session_options.graphOptimizationLevel`, When `computeFingerprint(A)` and `computeFingerprint(B)` are compared, Then they are NOT equal.
- **AC-004-02**: Given two configs A and B that differ only in a `session_options` key we explicitly decide is semantically irrelevant for memory (e.g., `logSeverityLevel`), When fingerprints are compared, Then they are equal. Hashed keys list must be explicit and documented in `memory-calibrator.js` — initial set: `graphOptimizationLevel`, `executionMode`, `enableCpuMemArena`, `enableMemPattern`. (The test MUST enumerate the hashed-key list to prevent drift.)
- **AC-004-03**: Given an existing cache file with an old fingerprint (written before FR-004 shipped — no session_options in hash input), When the post-upgrade fingerprint is computed, Then it differs from the cached fingerprint → cache is invalidated → `readCachedCalibration()` returns null → next run re-calibrates. Log line: `"[calibrate] fingerprint changed, recalibrating"`.

### FR-005 — graphOptimizationLevel default flips to "all" (parity-gated)

- **AC-005-01**: Given a new install where `.isdlc/config.json` has no `session_options` override, When `resolveConfig()` runs in the Jina v2 fp16 CoreML path, Then the effective `session_options.graphOptimizationLevel === "all"`.
- **AC-005-02**: Given a user with explicit `session_options.graphOptimizationLevel: "disabled"` in their `.isdlc/config.json`, When `resolveConfig()` runs, Then the user value is respected (`"disabled"` remains as escape hatch). Fix-strategy R7.
- **AC-005-03**: Given `lib/install/embeddings-prompt.js::buildInitialEmbeddingsBlock()`, When called for a new install on the Jina v2 fp16 target, Then the generated config does NOT contain `graphOptimizationLevel: "disabled"` (the install-time default matches `config-defaults.js`).
- **AC-005-04**: Given the pinned parity corpus at `lib/embedding/engine/fixtures/parity-corpus/`, When embeddings are generated once with `graphOptimizationLevel: "disabled"` and once with `graphOptimizationLevel: "all"`, Then the cosine similarity between corresponding vectors is `≥ 0.9999` for every vector in the corpus (per-vector, not mean). Any vector below the threshold FAILS the test with an error identifying the chunk ID.

### FR-006 — Auto-parallelism considers workload size (workload floor)

- **AC-006-01**: Given `parallelism: "auto"` and a workload of 2 files / 8 chunks with `batch_size: 32` on a 24 GB Apple Silicon CoreML target, When `resolveConfig()` computes parallelism, Then the result is 1 (workload floor = `ceil(8 / 32 / 2) = 1`; memory ceiling allows more but floor caps it).
- **AC-006-02**: Given `parallelism: "auto"` and a workload of 512 chunks with `batch_size: 32` on the same 24 GB target, When `resolveConfig()` computes parallelism, Then the result is 2-4 (workload floor = `ceil(512 / 32 / 2) = 8`; memory ceiling at 2-3 workers is the binding constraint, not the floor).
- **AC-006-03**: Given `parallelism: 8` (explicit integer) and a workload of 8 chunks, When `resolveConfig()` computes parallelism, Then the result is 8 (explicit value respected; workload floor applied as warn-but-respect per fix-strategy R2). A warning is logged recommending `"auto"` for this workload.
- **AC-006-04**: Given the workload floor formula `ceil(chunkCount / batchSize / MIN_BATCHES_PER_WORKER)` with `MIN_BATCHES_PER_WORKER = 2`, When it is evaluated for boundary workloads (chunkCount ∈ {0, 1, 31, 32, 33, 63, 64, 65, 127, 128}), Then the result is monotonic and hits 1 at or below 64 chunks (assuming batch_size=32). Exact table captured in the unit test.

### FR-007 — Adapter uses calibrated value, not hardcoded constant

- **AC-007-01**: Given a calibration cache returning `perWorkerMemGB = 3.5` and `resolveConfig()` has computed `perWorkerMemGB` accordingly, When `createJinaCodeAdapter()` builds its worker pool, Then the `createWorkerPool` call receives `options.perWorkerMemGB === 3.5` (NOT `WORKER_MEMORY_ESTIMATE_GB[device]`).
- **AC-007-02**: Given `resolveConfig()` has passed `perWorkerMemGB` through to the adapter, When the pool resolves its effective pool size via `resolvePoolSize()`, Then the same calibrated value drives the memory-aware clamp (FR-008 end-to-end check).
- **AC-007-03**: Given calibration returns `null` (cache miss AND fresh calibration failed), When `createJinaCodeAdapter()` builds its worker pool, Then it falls back to `WORKER_MEMORY_ESTIMATE_GB[device]` exactly as today — this is the fail-safe path (Article X).

### FR-008 — Single source of truth for parallelism math (dedup)

- **AC-008-01**: Given the new helper `computeEffectiveParallelism({memoryCap, cpuCap, hardCap, workloadFloor, perWorkerMemGB})`, When called from both `device-detector.autoParallelism()` and `worker-pool.resolvePoolSize()`, Then both callers produce identical results for identical inputs (asserted via a property test with a small input matrix).
- **AC-008-02**: Given `SYSTEM_RESERVED_GB`, `PARALLELISM_HARD_CAP`, `WORKER_MEMORY_ESTIMATE_GB`, and `MIN_BATCHES_PER_WORKER`, When imported from `worker-pool.js`, Then the imports resolve to `device-detector.js` re-exports (single source of truth — no duplicate literal constants).
- **AC-008-03**: Given the implementation of `resolvePoolSize()` after T018, When inspected via code-level assertion (import the function and call with known args), Then it internally delegates to `computeEffectiveParallelism()` (not a re-implementation). Test: stub `computeEffectiveParallelism` and verify it is invoked with the expected args.

---

## 4. Test Cases (Organized by FR)

Each case below has a unique test ID of the form `TC-{FR}-{NN}` for cross-referencing. "Target file" is where the case lands in Phase 06 task T020-T024. Priority P0/P1/P2 is risk-based per §6.

### FR-001 — Real-chunk sampling (5 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario (Given/When/Then) |
|---|---|---|---|---|
| TC-001-01 | P0 | AC-001-01 | `memory-calibrator.test.js` | **Given** a `_sampleProvider` injection hook returning 250 real chunks, **When** `calibratePerWorkerMemory()` runs, **Then** the samples passed to `pool.embed()` are a subset of the injected 250 chunks AND `samples.length === 100` (cap applied). |
| TC-001-02 | P0 | AC-001-01, AC-001-02 | `memory-calibrator.test.js` | **Given** `_sampleProvider` returning 250 real chunks, **When** calibration runs, **Then** the `samples` passed to `pool.embed()` contain strings matching the injected fixtures (content equality on at least 3 random indices) — proves sampling is not generating synthetic data. |
| TC-001-03 | P0 | AC-001-03 | `memory-calibrator.test.js` | **Given** `_sampleProvider` returning only 15 chunks, **When** calibration runs, **Then** it logs `[calibrate] fewer than 20 chunks available, falling back to synthetic samples` AND the samples passed to `pool.embed()` are from `generateSyntheticSamples()` (38-word vocabulary) AND calibration still completes (`result !== null`). |
| TC-001-04 | P1 | AC-001-01 | `memory-calibrator.test.js` | **Given** `_sampleProvider` returning exactly 20 chunks (boundary), **When** calibration runs, **Then** real-chunk sampling is used (NOT synthetic), proving the fallback threshold is strictly `<20`. |
| TC-001-05 | P1 | AC-001-01 | `memory-calibrator.test.js` | **Given** `_sampleProvider` throws synchronously (chunker failure), **When** calibration runs, **Then** it logs a warning and falls back to synthetic samples — fail-safe default preserved. |

### FR-002 — Steady-state cadence, window, timeout (5 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-002-01 | P0 | AC-002-01 | `memory-calibrator.test.js` | **Given** `DEFAULT_CALIBRATION_OPTIONS`, **When** inspected, **Then** `samplingIntervalMs === 200`. |
| TC-002-02 | P0 | AC-002-03 | `memory-calibrator.test.js` | **Given** `DEFAULT_CALIBRATION_OPTIONS`, **When** inspected, **Then** `timeoutMs === 300000`. |
| TC-002-03 | P0 | AC-002-02 | `memory-calibrator.test.js` | **Given** a mock pool whose `embed` resolves after 25,000 ms of simulated time (using an `_rssReader` that yields 125 samples over 25 ticks with simulated clock), **When** calibration runs, **Then** `result.sampleCount ≥ 100`. |
| TC-002-04 | P0 | AC-002-04 | `memory-calibrator.test.js` | **Given** a mock pool whose `embed` simulates a 20-second steady-state inference (advance fake time), **When** calibration completes, **Then** `result.durationMs ≥ 18000` (18 s lower bound — 10% slack). |
| TC-002-05 | P1 | AC-002-03, FR-002 | `memory-calibrator.test.js` | **Given** `embedHangs: true` and `timeoutMs: 300` (test-scaled), **When** calibration runs, **Then** it times out within `timeoutMs + 500 ms` AND returns `null` AND calls `pool.shutdown()` exactly once. Proves the wider timeout does not introduce deadlocks. |

### FR-003 — session_options propagation CLI → calibrator (4 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-003-01 | P0 | AC-003-01 | `memory-calibrator.test.js` (+ `bin/isdlc-embedding.js` spy pattern) | **Given** a resolved config with `session_options: {graphOptimizationLevel: "all"}`, **When** the test calls a new exported helper `buildCalibrationConfig(resolved)` (extracted from `bin/isdlc-embedding.js:542-551` in T010), **Then** the result has `session_options` matching the input. |
| TC-003-02 | P0 | AC-003-02 | `memory-calibrator.test.js` | **Given** `calibrationConfig.session_options = {graphOptimizationLevel: "all"}`, **When** `calibratePerWorkerMemory()` creates its one-shot pool via `_createWorkerPool`, **Then** the pool factory is called with `options.workerData.session_options.graphOptimizationLevel === "all"` (inspect the captured `options` on the mock factory). |
| TC-003-03 | P0 | AC-003-03 | `memory-calibrator.test.js` | **Given** a resolved config without `session_options` (empty object from `resolveConfig` defaults), **When** `buildCalibrationConfig(resolved)` is called, **Then** the result's `session_options` is `{}` (not `undefined`). |
| TC-003-04 | P1 | AC-003-01, AC-003-02 | `memory-calibrator.test.js` | **Given** a calibration cache hit with the same fingerprint, **When** calibration is skipped, **Then** the cache hit path never spawns a pool (regression guard — the test asserts `factory.pool === undefined` when the cache is hot). |

### FR-004 — Fingerprint hash expansion (4 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-004-01 | P0 | AC-004-01 | `memory-calibrator.test.js` | **Given** `A = {device: "coreml", dtype: "fp16", model: "jina-v2", session_options: {graphOptimizationLevel: "disabled"}}` and `B` identical except `graphOptimizationLevel: "all"`, **When** `computeFingerprint(A) !== computeFingerprint(B)`, **Then** the fingerprints differ. |
| TC-004-02 | P0 | AC-004-02 | `memory-calibrator.test.js` | **Given** `A` and `B` differ only in an irrelevant key `logSeverityLevel` (not in the hashed key list), **When** fingerprints are computed, **Then** they are equal. This pins the hashed-key list as a deliberate decision. |
| TC-004-03 | P0 | AC-004-02 | `memory-calibrator.test.js` | **Given** the hashed-key list exported as `HASHED_SESSION_OPTION_KEYS` (new export from `memory-calibrator.js` in T011), **When** imported in the test, **Then** `HASHED_SESSION_OPTION_KEYS` deep-equals `["graphOptimizationLevel", "executionMode", "enableCpuMemArena", "enableMemPattern"]`. Pins the key set to catch accidental reordering or removal. |
| TC-004-04 | P0 | AC-004-03 | `memory-calibrator.test.js` | **Given** a pre-FR-004 cache file on disk (fingerprint computed WITHOUT `session_options`), **When** `readCachedCalibration()` is called with the new fingerprint (WITH `session_options`), **Then** it returns `null` AND the subsequent `calibratePerWorkerMemory()` call writes a new cache file with the new fingerprint AND logs `[calibrate] fingerprint changed, recalibrating`. |

### FR-005 — graphOpt parity and default flip (4 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-005-01 | P0 | AC-005-04 | `graph-optimization-parity.test.js` (NEW) | **Given** the pinned `parity-corpus/` directory with ~100 chunks AND the real Jina v2 fp16 pipeline on macOS arm64, **When** embeddings are generated twice (once with `session_options: {graphOptimizationLevel: "disabled"}`, once with `"all"`), **Then** for every chunk `i`, `cosineSimilarity(v_disabled[i], v_all[i]) ≥ 0.9999`. Any failing vector reports the chunk ID and the measured similarity. Test is skipped on non-macOS with `test.skip('parity test requires macOS arm64')`. |
| TC-005-02 | P0 | AC-005-01 | `device-detector.test.js` OR a new `config-defaults.test.js` | **Given** a new install with no `.isdlc/config.json` overrides for Jina v2 fp16, **When** `resolveConfig()` is called with empty config, **Then** the effective `session_options.graphOptimizationLevel === "all"`. |
| TC-005-03 | P0 | AC-005-02 | `device-detector.test.js` | **Given** `.isdlc/config.json` contains `embeddings.session_options.graphOptimizationLevel: "disabled"`, **When** `resolveConfig()` is called, **Then** the user override is respected (`session_options.graphOptimizationLevel === "disabled"` in the result). |
| TC-005-04 | P1 | AC-005-03 | `lib/install/embeddings-prompt.test.js` (existing) | **Given** `buildInitialEmbeddingsBlock({device: 'coreml', dtype: 'fp16', model: 'jina-v2'})`, **When** called, **Then** the returned config object does NOT include `session_options.graphOptimizationLevel: "disabled"`. It may either omit `session_options` entirely OR explicitly include `"all"` — both satisfy "new installs benefit from the flip". |

### FR-006 — Workload-aware parallelism (6 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-006-01 | P0 | AC-006-01 | `device-detector.test.js` | **Given** `mockEnv(macOS arm64, totalMem=24GB, cpuCount=10)`, `parallelism: "auto"`, `workloadSize: 8`, `batch_size: 32`, and a stubbed resolver returning `perWorkerMemGB: 3`, **When** `resolveConfig()` is called, **Then** `result.parallelism === 1` (workload floor `ceil(8/32/2) = 1` is the binding constraint, not memory). |
| TC-006-02 | P0 | AC-006-02 | `device-detector.test.js` | **Given** `mockEnv(macOS arm64, 24 GB, 10 cores)`, `parallelism: "auto"`, `workloadSize: 512`, `batch_size: 32`, `perWorkerMemGB: 6` (hardcoded-style), **When** `resolveConfig()` is called, **Then** `result.parallelism === 2` (memory ceiling `floor(16/6) = 2` binds; workload floor `ceil(512/32/2) = 8` is higher and ignored). |
| TC-006-03 | P0 | AC-006-03 | `device-detector.test.js` | **Given** `parallelism: 8` (explicit) and `workloadSize: 8`, **When** `resolveConfig()` is called, **Then** `result.parallelism === 8` (explicit respected) AND `result.warnings` contains a message matching `/workload floor|small workload|parallelism.*high/i` recommending `"auto"`. |
| TC-006-04 | P0 | AC-006-04 | `device-detector.test.js` | **Given** `batch_size: 32` and a table of workload sizes, **When** `computeWorkloadFloor(workloadSize, batchSize)` (exported helper from T015) is evaluated, **Then** the output matches: `{0: 0, 1: 1, 31: 1, 32: 1, 33: 1, 63: 1, 64: 1, 65: 2, 127: 2, 128: 2}`. Exercises the boundary transitions in the ceil formula. |
| TC-006-05 | P1 | AC-006-01, FR-006 | `worker-pool.test.js` | **Given** `resolvePoolSize(poolSize='auto', cpuCountFn, totalMemFn, perWorkerMemGB, workloadSize=4, batchSize=32)`, **When** called, **Then** the result is 1 (workload floor applied in pool path too, proving FR-008 single source of truth). |
| TC-006-06 | P1 | AC-006-01, AC-006-02 | `index.test.js` (engine) OR `jina-code-adapter.test.js` | **Given** the engine-level `embed(texts, config)` path with an injected workloadSize and a mock resolver, **When** the engine wires `workloadSize = texts.length` through to `resolveConfig()`, **Then** the pool constructed by the adapter matches the workload-aware size. Integration-level test that proves the threading from CLI → engine → adapter → resolveConfig. |

### FR-007 — Adapter calibrated-value pass-through (4 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-007-01 | P0 | AC-007-01 | `jina-code-adapter.test.js` | **Given** a mock `createWorkerPool` and a resolved config with `perWorkerMemGB: 3.5` (threaded through from `resolveConfig()`), **When** `createJinaCodeAdapter({parallelism: 4, perWorkerMemGB: 3.5, ...})` is called, **Then** the captured `createPool.options.perWorkerMemGB === 3.5` (NOT `WORKER_MEMORY_ESTIMATE_GB.coreml`). This is the direct surprise-#2 regression test. |
| TC-007-02 | P0 | AC-007-01, AC-007-02 | `jina-code-adapter.test.js` | **Given** a real (non-mocked) `resolvePoolSize` wired via the mock pool's captured options, **When** the pool resolves its effective size from `perWorkerMemGB = 3.5`, **Then** the resulting pool size matches `computeEffectiveParallelism(...)` for the same inputs — end-to-end FR-007 + FR-008 contract. |
| TC-007-03 | P0 | AC-007-03 | `jina-code-adapter.test.js` | **Given** `perWorkerMemGB` is `null` (calibration returned null AND no cache), **When** `createJinaCodeAdapter()` builds its pool, **Then** the captured `createPool.options.perWorkerMemGB === WORKER_MEMORY_ESTIMATE_GB[device]` (fallback path — Article X). |
| TC-007-04 | P1 | AC-007-01 | `jina-code-adapter.test.js` | **Given** a regression scenario mimicking today's buggy behavior (adapter constructed without a `perWorkerMemGB` option at all), **When** the adapter is built, **Then** the test FAILS before the fix lands and PASSES after T014 — this test case serves as the bisect-friendly guard. |

### FR-008 — Parallelism math dedup (3 test cases)

| TC ID | Priority | AC(s) | Target file | Scenario |
|---|---|---|---|---|
| TC-008-01 | P0 | AC-008-01 | `device-detector.test.js` | **Given** the new `computeEffectiveParallelism({memoryCap, cpuCap, hardCap, workloadFloor, perWorkerMemGB})` helper, **When** a small input matrix is evaluated (6-10 representative `{memoryCap, cpuCap, hardCap, workloadFloor, perWorkerMemGB}` tuples covering: tight memory, tight CPU, tight hard cap, tight workload floor, all slack), **Then** each result is deterministic and matches an explicit expected table in the test. |
| TC-008-02 | P0 | AC-008-01 | `worker-pool.test.js` | **Given** the same 6-10 input tuples from TC-008-01, **When** `resolvePoolSize()` is called (with equivalent args), **Then** it produces the SAME result. Proves both callers agree via the shared helper. |
| TC-008-03 | P0 | AC-008-02, AC-008-03 | `worker-pool.test.js` | **Given** the T018 constants dedup, **When** `worker-pool.js` imports `SYSTEM_RESERVED_GB`, `PARALLELISM_HARD_CAP`, `WORKER_MEMORY_ESTIMATE_GB`, and `MIN_BATCHES_PER_WORKER`, **Then** the imported values are reference-equal (`===`) to the exports from `device-detector.js`. No duplicate literal constants in `worker-pool.js`. |

### Integration Suite — End-to-end wiring (3 test cases)

| TC ID | Priority | Covers | Target file | Scenario |
|---|---|---|---|---|
| TC-IT-01 | P0 | FR-003, FR-004, FR-007 | `memory-calibrator.test.js` (new section) | **Given** a sandbox project root, an injected chunker returning 250 chunks, a mock ONNX pool, and a config with `session_options: {graphOptimizationLevel: "all"}`, **When** the test calls `calibratePerWorkerMemory()` then `readCachedCalibration()` then `resolveConfig()` then the adapter mock's `createPool`, **Then**: (a) fingerprint in the cache file includes the session_options hash, (b) cache is hit on re-read, (c) `resolveConfig` uses the calibrated value, (d) adapter constructs the pool with `perWorkerMemGB` matching the calibration result. |
| TC-IT-02 | P0 | FR-001, FR-002, FR-003, FR-006 | `memory-calibrator.test.js` (new section) | **Given** a calibrationConfig with real-chunk samples and session_options set, **When** calibration completes AND autoParallelism runs with `workloadSize: 8`, **Then** the pool size reflects the workload floor AND the calibrated perWorker value is used (NOT the hardcoded fallback). |
| TC-IT-03 | P1 | FR-004 cache invalidation | `memory-calibrator.test.js` | **Given** an existing cache file written with an old fingerprint (pre-session_options hashing), **When** the post-upgrade config is loaded and calibration runs, **Then** the old cache file is overwritten with a new fingerprint AND the `[calibrate] fingerprint changed, recalibrating` log line fires. |

---

## 5. Traceability Matrix

**Legend**: Target File abbreviations — `MC = memory-calibrator.test.js`, `DD = device-detector.test.js`, `WP = worker-pool.test.js`, `JA = jina-code-adapter.test.js`, `EP = embeddings-prompt.test.js`, `GP = graph-optimization-parity.test.js (NEW)`, `IDX = index.test.js (engine)`.

| FR | AC | Test Case | Target File | Priority | Phase 06 Task |
|---|---|---|---|---|---|
| FR-001 | AC-001-01 | TC-001-01, TC-001-02, TC-001-04 | MC | P0, P0, P1 | T012, T020 |
| FR-001 | AC-001-02 | TC-001-02 | MC | P0 | T012, T020 |
| FR-001 | AC-001-03 | TC-001-03, TC-001-05 | MC | P0, P1 | T012, T020 |
| FR-002 | AC-002-01 | TC-002-01 | MC | P0 | T013, T020 |
| FR-002 | AC-002-02 | TC-002-03 | MC | P0 | T013, T020 |
| FR-002 | AC-002-03 | TC-002-02, TC-002-05 | MC | P0, P1 | T013, T020 |
| FR-002 | AC-002-04 | TC-002-04 | MC | P0 | T013, T020 |
| FR-003 | AC-003-01 | TC-003-01, TC-003-04 | MC | P0, P1 | T010, T021 |
| FR-003 | AC-003-02 | TC-003-02, TC-003-04 | MC | P0, P1 | T010, T021 |
| FR-003 | AC-003-03 | TC-003-03 | MC | P0 | T010, T021 |
| FR-004 | AC-004-01 | TC-004-01 | MC | P0 | T011, T021 |
| FR-004 | AC-004-02 | TC-004-02, TC-004-03 | MC | P0, P0 | T011, T021 |
| FR-004 | AC-004-03 | TC-004-04, TC-IT-03 | MC | P0, P1 | T011, T021 |
| FR-005 | AC-005-01 | TC-005-02 | DD | P0 | T009 |
| FR-005 | AC-005-02 | TC-005-03 | DD | P0 | T009 |
| FR-005 | AC-005-03 | TC-005-04 | EP | P1 | T009 |
| FR-005 | AC-005-04 | TC-005-01 | GP (NEW) | P0 | T007, T008, T032 |
| FR-006 | AC-006-01 | TC-006-01, TC-006-05, TC-006-06 | DD, WP, IDX/JA | P0, P1, P1 | T016, T017, T019, T022, T023 |
| FR-006 | AC-006-02 | TC-006-02, TC-006-06 | DD, IDX/JA | P0, P1 | T016, T019, T022 |
| FR-006 | AC-006-03 | TC-006-03 | DD | P0 | T016, T022 |
| FR-006 | AC-006-04 | TC-006-04 | DD | P0 | T015, T022 |
| FR-007 | AC-007-01 | TC-007-01, TC-007-04 | JA | P0, P1 | T014, T024 |
| FR-007 | AC-007-02 | TC-007-02 | JA | P0 | T014, T024 |
| FR-007 | AC-007-03 | TC-007-03 | JA | P0 | T014, T024 |
| FR-008 | AC-008-01 | TC-008-01, TC-008-02 | DD, WP | P0, P0 | T015, T023 |
| FR-008 | AC-008-02 | TC-008-03 | WP | P0 | T018, T023 |
| FR-008 | AC-008-03 | TC-008-03 | WP | P0 | T018, T023 |
| — | — | TC-IT-01 (integration) | MC | P0 | T020, T021 |
| — | — | TC-IT-02 (integration) | MC | P0 | T020, T021, T022 |
| — | — | TC-IT-03 (integration) | MC | P1 | T021 |

**Coverage summary**: 8 FRs, 27 ACs, 35 test cases (32 unit/L2 + 1 parity L3 + 3 integration L2). Every AC maps to ≥1 test case. Every test case maps to ≥1 Phase 06 task.

**Traceability matrix sidecar**: an alternate CSV form of this table is stored at `docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-traceability.csv` — but since this strategy doc is already the single source and tasks.md already ships a trace matrix, a duplicate CSV is NOT produced by Phase 05 to avoid the multi-file divergence risk called out in user memory rule #5. The table above is authoritative; if a CSV is needed for tooling, generate it from this table.

---

## 6. Risk-Based Test Prioritization

Priority is assigned based on the risk matrix in fix-strategy.md §3 and symptom severity in bug-report.md §1. Every test case gets a P0/P1/P2 tag in §4 above.

### P0 — Must-pass before Phase 06 can start (22 test cases)

These test cases cover regressions that would re-introduce the original GH-248 bug OR cause new ones.

- **FR-005 parity (TC-005-01)**: The parity test is the gate for the default flip. If it fails, commit 2 of the fix is rolled back (fix-strategy R1/R8). It MUST exist and pass before any default change ships.
- **Calibrator correctness (TC-001-01..03, TC-002-01..04)**: These prove the under-measurement bug is fixed at the measurement level. Without them, the calibrator could silently revert to the old 1.1 GB regime.
- **Session options propagation (TC-003-01..03, TC-004-01..03)**: Surprise #1 — calibrator measuring a different session than production would cause the calibrator fix to under-deliver even after H1/H2/H4 are fully fixed.
- **Adapter calibrated value pass-through (TC-007-01..03)**: Surprise #2 — the adapter's silent re-clamp would undersize the pool after the calibrator fix.
- **Workload floor (TC-006-01..04)**: Without the workload floor, differential refreshes of small workloads spawn the full pool (paying model-load cost for no benefit) — this is a new symptom the fix is responsible for preventing.
- **Parallelism dedup (TC-008-01..03)**: FR-008 is foundational for FR-006 and FR-007. The single source of truth MUST exist before the other changes land or their invariants break.
- **Integration suite (TC-IT-01, TC-IT-02)**: End-to-end wiring tests that catch contract drift between modules.

### P1 — Should-pass before Phase 06 is complete (10 test cases)

These cover secondary paths and boundary cases that are unlikely to silently regress but should not ship broken.

- **Boundary chunk counts for real-chunk sampling (TC-001-04, TC-001-05)**: 20-chunk boundary and chunker-failure fallback.
- **Timeout behavior (TC-002-05)**: Wider timeout does not deadlock.
- **Cache invalidation on cold-start upgrade (TC-IT-03)**: Pre-upgrade cache is correctly discarded.
- **Install-time prompt (TC-005-04)**: New installs get the new default.
- **Pool-level workload floor (TC-006-05, TC-006-06)**: Single-source-of-truth verified from both entry points.
- **Regression guard for surprise #2 (TC-007-04)**: Belt-and-braces bisect-friendly guard.
- **Calibration cache hit path (TC-003-04)**: Regression guard — cache hit does not spawn a pool.

### P2 — Nice-to-have / future (3 test cases)

Currently none scoped P2 — every test case above is either P0 or P1. Priority tier kept here for completeness; future expansion could add fuzz-style tests for the workload-floor formula or property-based tests for `computeEffectiveParallelism`.

### Prioritization rationale by fix-strategy risk

| Risk (from fix-strategy §3) | Covered by |
|---|---|
| R1 — Graph optimizer silent corruption | TC-005-01 (P0 parity test) |
| R2 — Workload floor unexpectedly caps explicit N | TC-006-03 (P0) + warning assertion |
| R3 — 300 s timeout masks stuck calibration | TC-002-05 (P1) |
| R4 — Fingerprint change invalidates existing caches | TC-004-04, TC-IT-03 (P0/P1) |
| R5 — Tiny projects with <20 chunks | TC-001-03, TC-001-04 (P0/P1) |
| R6 — Calibration cache pollution | Not directly testable in unit/integration — covered by existing cache round-trip tests (INV-01..10) and Phase 16 manual verification |
| R7 — Existing users with explicit `"disabled"` | TC-005-03 (P0) |
| R8 — Upstream ONNX Runtime bug still present | TC-005-01 (P0 parity test — if it fails, commit 2 is reverted per fix-strategy) |

---

## 7. Test Data and Fixtures

### 7.1 Parity Corpus (NEW — `lib/embedding/engine/fixtures/parity-corpus/`)

**Purpose**: Provide a deterministic, reproducible set of real multi-language chunks for the cosine-parity test (TC-005-01 / AC-005-04).

**Size**: ~100 chunks. This is large enough to exercise diverse tokenization patterns across attention heads and small enough to run end-to-end in 30-45 s on Apple Silicon.

**Language distribution** (approximate, to be pinned in T007):
- JavaScript/TypeScript: ~35 chunks
- Python: ~20 chunks
- Go: ~15 chunks
- Rust: ~15 chunks
- Markdown: ~10 chunks
- Shell/YAML/JSON: ~5 chunks

**Length distribution**:
- Short (200-500 chars): ~30
- Medium (500-1000 chars): ~45
- Long (1000-2000 chars): ~25

**Source**: Real chunks copied from the iSDLC framework's own codebase. The extraction script (to be added in T007 if needed) walks a few pinned directories, runs them through `lib/embedding/chunker`, and samples to match the distribution above. Output is committed as static files so test runs are fully deterministic — NO runtime chunker invocation in the parity test.

**Format decision** (T007): two options evaluated:
- Option A: flat directory `01-js-short.js`, `02-py-medium.py`, ... (one chunk per file, extension matches language)
- Option B: single `corpus.json` with `[{id, language, content, length}, ...]`

**Recommendation for T007**: Option B (single JSON). Easier to diff in PR review, single file to pin, less filesystem churn on CI checkout. Trade-off: chunks must be escaped strings, which is fine since we do not need syntax highlighting of the fixture itself.

**Provenance**: Each chunk's `source` field (source file path, offset) is captured for debug-ability when a chunk fails parity. The test error message quotes the chunk ID, language, and source so a reviewer can understand *which* code shape broke parity.

**Checksum pinning**: `corpus.json` is committed; its SHA-256 is pinned in a test comment so any accidental rewrite is caught in review.

### 7.2 Injected Sample Providers (in-memory, no fs)

For unit tests in `memory-calibrator.test.js`, the existing `makeMockPoolFactory()` is extended with a new `_sampleProvider` hook. The test supplies a static array of chunk strings:

```js
const fakeChunks = [
  'function add(a, b) { return a + b; }',
  'class User extends Base { constructor(id) { super(); this.id = id; } }',
  'def parse(input): return json.loads(input)',
  // ... 250 total chunks, deterministic
];
const result = await calibratePerWorkerMemory(config, {
  _sampleProvider: () => fakeChunks,
  _createWorkerPool: factory,
  _rssReader: factory.rssReader,
  projectRoot: sandboxDir,
});
```

For the tiny-project fallback test (TC-001-03), `_sampleProvider` returns only 15 chunks. For the chunker-failure test (TC-001-05), `_sampleProvider` throws synchronously.

### 7.3 Mock Pool RSS Sequences

Existing pattern from `memory-calibrator.test.js` — `rssSequenceGB: [0.3, 1.0, 1.5, 2.0, 1.8, 1.8, ...]`. Extended for steady-state tests with longer sequences that simulate a ~25 s run at 200 ms cadence (~125 samples). Test helper: `makeSteadyStateRssSequence(baselineGB, peakGB, rampTicks, plateauTicks)`.

### 7.4 Platform / Hardware Mocks

Reuse the existing `mockEnv({platform, arch, totalMem, cpuCount, paths})` from `device-detector.test.js`. New tests in §4 FR-006 add the following scenarios to the existing table:

| Scenario | platform | arch | totalMem | cpuCount | Used by |
|---|---|---|---|---|---|
| Tiny workload, 24 GB Mac | darwin | arm64 | 24 GB | 10 | TC-006-01 |
| Normal workload, 24 GB Mac | darwin | arm64 | 24 GB | 10 | TC-006-02 |
| Explicit override, any | linux | x64 | 16 GB | 8 | TC-006-03 |

### 7.5 Fingerprint Test Vectors

Deterministic config pairs for FR-004 tests:

```js
const baseA = {device: 'coreml', dtype: 'fp16', model: 'jinaai/jina-embeddings-v2-base-code'};
const pairs = [
  // same device/dtype/model, different graphOptimizationLevel → different fp
  [{...baseA, session_options: {graphOptimizationLevel: 'disabled'}},
   {...baseA, session_options: {graphOptimizationLevel: 'all'}}, 'differ'],
  // same device/dtype/model, different logSeverityLevel (irrelevant) → same fp
  [{...baseA, session_options: {logSeverityLevel: 2}},
   {...baseA, session_options: {logSeverityLevel: 4}}, 'equal'],
  // empty session_options === no session_options → same fp
  [{...baseA, session_options: {}},
   {...baseA}, 'equal'],
];
```

### 7.6 Test Data Generation Policy

- No network fetches, no HF hub downloads during unit tests (L1/L2)
- Parity test (L3) uses the real HF transformers pipeline which will download Jina v2 fp16 on first run (~162 MB) and cache it — acceptable one-time cost
- Fixture corpus is committed to git, not generated at test time
- No external test fixtures outside the project tree

---

## 8. Dependency Injection Contract Additions

Phase 06 needs to expose new DI hooks. Each one is a test-only option (prefixed `_`) that does NOT affect production behavior. These MUST be added by the implementation tasks so the test cases can be written.

| Hook | Exposed by | Added in | Used by |
|---|---|---|---|
| `_sampleProvider: () => string[]` | `calibratePerWorkerMemory()` options | T012 | TC-001-01..05 |
| `_now: () => number` (fake clock) | `calibratePerWorkerMemory()` options (optional) | T013 | TC-002-03, TC-002-04 |
| `buildCalibrationConfig(resolved)` exported helper | `bin/isdlc-embedding.js` OR a new `calibration-config.js` | T010 | TC-003-01, TC-003-03 |
| `HASHED_SESSION_OPTION_KEYS` exported constant | `memory-calibrator.js` | T011 | TC-004-03 |
| `computeEffectiveParallelism({memoryCap, cpuCap, hardCap, workloadFloor, perWorkerMemGB})` | `device-detector.js` | T015 | TC-008-01, TC-008-02 |
| `computeWorkloadFloor(workloadSize, batchSize)` exported helper | `device-detector.js` | T015 | TC-006-04 |
| `workloadSize` option | `resolveConfig()`, `resolvePoolSize()`, `createJinaCodeAdapter()` | T016, T017, T019 | TC-006-01..06 |
| `perWorkerMemGB` pass-through option | `createJinaCodeAdapter()` options | T014 | TC-007-01..04 |

**Contract note**: exposing these hooks is part of the fix, not a test-only concession. They enforce the separation of concerns that made the bugs possible in the first place (e.g., the missing `session_options` propagation was invisible because `buildCalibrationConfig` was inline in `bin/isdlc-embedding.js`; extracting it makes the contract testable AND enforces correctness).

---

## 9. Gate-04 Checklist

Phase 05 completes when every box below is checked. The orchestrator validates this checklist before Phase 06 is allowed to start.

- [X] Test strategy covers unit, integration, parity (L3), and manual (L4) test levels
- [X] Every FR (FR-001 .. FR-008) has ≥1 P0 test case
- [X] Every AC in the AC Catalogue (§3) maps to ≥1 test case (see §5 traceability matrix)
- [X] Coverage targets defined (§1.4)
- [X] Test data strategy documented (§7 — parity corpus, injected providers, fake RSS sequences, platform mocks, fingerprint vectors)
- [X] Critical paths identified (§6 — P0/P1 prioritization)
- [X] Risk-based prioritization maps to fix-strategy risks R1-R8 (§6)
- [X] Test environment and preconditions specified (§2)
- [X] Dependency injection contract enumerated (§8) — tells Phase 06 exactly which hooks to expose
- [X] Constitutional article coverage documented (§1.5 — Articles II, VII, IX, X, XI, XII)
- [X] Every test case traces to a Phase 06 implementation task (§5)
- [X] No orphan requirements (every AC has a test case, every test case has a task)

---

## 10. What Phase 05 Does NOT Decide

- **Exact wording of log messages**: log strings like `[calibrate] fingerprint changed, recalibrating` are suggested above but the final string is decided in Phase 06 at implementation time. Tests assert on substring matches (`/fingerprint changed/i`) or named log-event IDs, not exact strings.
- **Exact corpus file layout**: Option A vs Option B for `parity-corpus/` is a T007 implementation decision. The test case only depends on "a pinned corpus exists at that path with ~100 chunks".
- **Whether `workloadSize` threads through as a separate argument or as part of a config bag**: either shape is acceptable as long as the tests above can be written against the final signature. T019 finalizes this.
- **Coverage of `src/providers/codex/`**: T025/T026 verify NO changes are needed. Phase 05 does not design tests there — if any are needed they would be added in a separate phase.
- **Benchmark methodology for Phase 16 T033 (≥3× throughput)**: deferred to Phase 16 per tasks.md.

---

## 11. Test Execution Plan (hand-off to Phase 06)

Phase 06 executes in commit order per fix-strategy §1:

1. **Commit 1 (T007, T008)**: Pin parity corpus + add `graph-optimization-parity.test.js`. Test TC-005-01 runs and PASSES against current `"disabled"` baseline (parity test vs itself is trivially ≥0.9999 — the real assertion happens after commit 2).
2. **Commit 2 (T009)**: Flip `graphOptimizationLevel` default. Re-run TC-005-01 — now comparing `"disabled"` vs `"all"`. Must PASS with cos sim ≥ 0.9999 per vector. If it FAILS, commit 2 is reverted (fix-strategy R8).
3. **Commit 3 (T010, T021)**: Propagate session_options + expand fingerprint. Tests TC-003-01..03, TC-004-01..04 land here and PASS.
4. **Commit 4 (T011, T012, T013, T020)**: Calibrator rework (real chunks + cadence + window + timeout). Tests TC-001-01..05, TC-002-01..05 land here and PASS.
5. **Commit 5 (T014, T024)**: Adapter calibrated-value fix. Tests TC-007-01..04 land here and PASS.
6. **Commit 6 (T015, T016, T017, T018, T022, T023)**: Extract `computeEffectiveParallelism` helper + dedup constants. Tests TC-008-01..03, TC-006-04 land here and PASS.
7. **Commit 7 (T019, TC-006-01..03, TC-006-05, TC-006-06, TC-IT-01..03)**: Workload threading end-to-end. Integration tests and workload-aware tests land here and PASS.

Per Article II, each commit above is preceded by its failing tests (RED), then the production change (GREEN), in that order. The test cases enumerated in §4 ARE the RED-phase work items for Phase 06.

---

## 12. Deferred to Phase 16 Quality Loop

Per tasks.md T030-T033, the following validations are deferred to Phase 16 and NOT covered by this Phase 05 strategy:

- **T030**: End-to-end calibration on 24 GB Apple Silicon with real Jina v2 fp16 CoreML (manual, no automation)
- **T031**: Verify auto-parallelism picks pool size 2-3 on target hardware (manual observation)
- **T032**: Run parity test on real hardware with the pinned corpus (automated — TC-005-01, but with real pipeline not mocked)
- **T033**: Measure throughput improvement, assert ≥3× `parallelism:1` baseline (manual, uses REQ-GH-239 benchmark methodology)

These items complete the success criteria in fix-strategy §6 but are OUT of scope for the Phase 05 test-design artifact.
