# Test Strategy: REQ-GH-239 Worker Pool + Engine Parallelism

**Phase**: 05 — Test Strategy & Design
**Owner**: Test Design Engineer
**Generated**: 2026-04-11
**Requirement**: [requirements-spec.md](./requirements-spec.md)
**Architecture**: [architecture-overview.md](./architecture-overview.md)
**Module design**: [module-design.md](./module-design.md)

## 1. Scope and Rationale

This document captures the test strategy for REQ-GH-239, which delivers six coordinated changes:

1. **FR-001** Concurrent batch dispatch in the worker pool (wall-clock fan-out)
2. **FR-002** Unified adapter interface (single `adapter.embed` call per run)
3. **FR-003, FR-004** Memory calibration (one-shot + fingerprint invalidation)
4. **FR-005** Throughput + ETA progress callback with 10-batch moving average
5. **FR-006, FR-007, FR-008, FR-010** F0009 finalize, opt-in config presence, first-time bootstrap safety, installer prompt
6. **NFR-005** Progress update frequency floor

The strategy is task-partitioned across three Phase 05 dispatches (T001–T003) so each worker owns a focused slice of the modified surface:

| Task | Owner Scope                                             | Target Test Files                                                       |
|------|---------------------------------------------------------|-------------------------------------------------------------------------|
| T001 | FR-001, FR-002, FR-005, NFR-005 — engine and pool core  | lib/embedding/engine/{worker-pool, jina-code-adapter, index}.test.js    |
| T002 | FR-003, FR-004 — memory calibration                     | lib/embedding/engine/memory-calibrator.test.js (to be authored)         |
| T003 | FR-006, FR-007, FR-008, FR-010 — F0009 + config + installer | src/core/finalize/refresh-code-embeddings.test.js, src/core/config/config-service.test.js, install tests |

## 2. Existing Test Infrastructure (from test evaluation)

- **Framework**: `node:test` (core Node.js built-in, no third-party runner)
- **Assertion style**: `node:assert/strict`
- **Test naming convention**: `*.test.js` co-located with source files
- **Priority tagging convention**: `[P0]`, `[P1]`, `[P2]`, `[P3]` prefix in `it(...)` strings
- **Traceability convention**: `AC-NNN-NN` embedded in test name + leading comment block `REQ-GH-NNN / FR-NNN`
- **Mocking approach**: Hand-rolled mocks via `EventEmitter` subclasses (MockWorker pattern in `worker-pool.test.js`) and DI hooks (`_pipelineFactory`, `_createWorkerPool`, `_platformEnv`) in the adapter layer.
- **GWT phrasing**: existing tests use `Given ... When ... Then ...` in descriptions — this strategy mandates the same style for all new scaffolds.

**Gaps relevant to this REQ**:
- No coverage for *concurrent* (fan-out) batch dispatch — the existing round-robin tests verify distribution but not wall-clock parallelism.
- No coverage for enhanced progress shape (`chunks_per_sec`, `eta_seconds`, `active_workers` snake_case format from FR-005 spec).
- No coverage for the unified `adapter.embed(texts, options)` signature — existing tests call the legacy 1-arg form.
- No engine-level regression test proving `adapter.embed` is called *exactly once* per run (the root-cause regression the REQ fixes).

## 3. Test Pyramid

| Layer | Count (est.) | Tooling | Runs on |
|-------|--------------|---------|---------|
| Unit (in-process, mocked) | ~40 | node:test + EventEmitter mocks | every PR |
| Integration (mocked worker pool routed through adapter + engine) | ~8 | node:test + mock `_createWorkerPool` | every PR |
| End-to-end (real jina-code model, real worker threads) | 2–3 manual | dogfood run on 24GB Mac | pre-merge smoke |
| Acceptance (CLI format + progress render) | 1 | node:test snapshot | every PR |

Unit-heavy by design: the worker_threads code path is deterministically mockable via the `_WorkerClass` injection point established in GH-238. E2E runs are reserved for NFR-002 throughput verification (≥3× baseline) and are not part of the automated PR gate.

## 4. Scenarios Owned by T001 (this dispatch)

### 4.1 FR-001 — Concurrent batch dispatch
Traces: FR-001, AC-001-01, AC-001-03, ERR-POOL-CONC-001

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| CONC-01 | P0 | 8 batches, 4-worker pool, D-ms per-batch latency → total wall-clock ≈ 2×D (not 8×D) | worker-pool.test.js |
| CONC-02 | P0 | 16 batches fan out to 4 workers → peak concurrent in-flight == poolSize | worker-pool.test.js |
| CONC-03 | P0 | 8 batches with reversed delays (last finishes first) → results preserve input order | worker-pool.test.js |
| CONC-04 | P0 | Worker 2 crashes mid-dispatch, respawn retries batch → 8 results, other 3 workers not interrupted | worker-pool.test.js |
| CONC-05 | P1 | 2-worker sanity: 4 batches of D → wall-clock ≈ 2×D | worker-pool.test.js |
| CONC-06 | P0 | Engine: parallelism=4, 500 texts → wall-clock significantly better than sequential | index.test.js |
| CONC-07 | P1 | Engine: parallelism=1, 100 texts → adapter.embed called exactly once | index.test.js |

### 4.2 FR-002 — Unified adapter interface
Traces: FR-002, AC-002-01

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| UNIF-01 | P0 | In-process adapter accepts `embed(texts, { batchSize, onProgress, signal })` and returns Float32Array[] | jina-code-adapter.test.js |
| UNIF-02 | P0 | Pooled adapter accepts the same signature and forwards to pool.embed once | jina-code-adapter.test.js |
| UNIF-03 | P0 | Pooled adapter: 500 texts → pool.embed called EXACTLY ONCE with full array (no outer loop) | jina-code-adapter.test.js |
| UNIF-04 | P0 | In-process adapter: onProgress fires with unified FR-005 shape (processed/total/chunks_per_sec/eta_seconds/active_workers) | jina-code-adapter.test.js |
| UNIF-05 | P1 | Pre-aborted signal → rejects with AbortError, no batch dispatch | jina-code-adapter.test.js |
| UNIF-06 | P1 | Legacy 1-arg `embed(texts)` call still works (backwards compatible) | jina-code-adapter.test.js |
| UNIF-07 | P1 | Call-time `options.batchSize` wins over construction-time default | jina-code-adapter.test.js |
| UNIF-08 | P0 | Engine: 500-text run → adapter.embed spy invoked EXACTLY ONCE with all 500 texts | index.test.js |
| UNIF-09 | P0 | Engine: totalTokens computation preserved post-refactor | index.test.js |
| UNIF-10 | P0 | Engine: onProgress uses FR-005 single-object shape (not legacy 2-arg form) | index.test.js |
| UNIF-11 | P1 | Engine: abort signal mid-run → rejects with "cancelled" and signal forwarded to adapter | index.test.js |

### 4.3 FR-005 — Throughput + ETA progress callback
Traces: FR-005, CLI format contract

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| PROG-01 | P0 | Progress object exposes all 5 fields (processed, total, chunks_per_sec, eta_seconds, active_workers) in snake_case | worker-pool.test.js |
| PROG-02 | P0 | Out-of-order batch completion → processed is monotonically non-decreasing across callbacks | worker-pool.test.js |
| PROG-03 | P0 | 10-batch moving window — fast-then-slow run → reported chunks_per_sec tracks recent window, not all-time | worker-pool.test.js |
| PROG-04 | P0 | eta_seconds ≈ (total - processed) / chunks_per_sec within 15% of expected | worker-pool.test.js |
| PROG-05 | P1 | active_workers reflects in-flight batch count (≤ poolSize, 0 at end) | worker-pool.test.js |
| PROG-06 | P1 | CLI formatter renders the exact format: `[generate] 12487/19811 (63%) | 4.2 chunks/s | ETA 28min | workers: 4` | worker-pool.test.js (anchor only; may move to CLI test file in Phase 06) |

### 4.4 NFR-005 — Progress update frequency
Traces: NFR-005

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| FREQ-01 | P2 | 4 batches of ~32 chunks → onProgress called at least 4 times (one per batch floor) | worker-pool.test.js |
| FREQ-02 | P2 | Simulated 200-batch run past 30s → chunks_per_sec variance after 30s ≤ 20% of mean | worker-pool.test.js |

## 5. Test Fixtures and Data Plan (T001 slice)

- **MockWorker** — already exists in `worker-pool.test.js`; extend with `_delayPerBatch(indexFn)` helper to support reversed-delay ordering proofs (CONC-03) and 10-window moving average tests (PROG-03).
- **Mock worker pool** — already exists in `jina-code-adapter.test.js` (`createMockWorkerPool`); extend to expose `embedCallCount` and capture the single-call contract (UNIF-03).
- **Spy adapter** — new helper in `index.test.js` to count engine→adapter calls (UNIF-08, UNIF-09, CONC-06).
- **Boundary inputs**:
  - Empty text array (handled pre-existing)
  - 500 texts / batchSize 32 → 16 batches (max fan-out sanity)
  - Single text (< 1 batch) (handled pre-existing)
- **Invalid inputs**: already-aborted signal (UNIF-05), options omitted (UNIF-06).

## 6. Traceability Summary (T001)

| Requirement | Test Cases | File |
|-------------|-----------|------|
| FR-001 (Concurrent dispatch) | CONC-01..CONC-07 | worker-pool.test.js, index.test.js |
| FR-002 (Unified interface) | UNIF-01..UNIF-11 | jina-code-adapter.test.js, index.test.js |
| FR-005 (Progress + ETA) | PROG-01..PROG-06 | worker-pool.test.js |
| NFR-005 (Progress frequency) | FREQ-01, FREQ-02 | worker-pool.test.js |
| ERR-POOL-CONC-001 | CONC-04 | worker-pool.test.js |

## 7. Deferred to Implementation (Phase 06)

The following are explicitly out of scope for Phase 05 scaffolds and must be produced in Phase 06:
- Concrete test bodies (assertions, timers, instrumentation) — current scaffolds are `test.skip()` placeholders with full GWT docstrings
- `lib/embedding/cli/progress-format.js` (new CLI formatter module for PROG-06)
- Any updates to `MockWorker` helpers needed to support new scenarios (e.g., `_delayPerBatch`)

<!-- ANCHOR: FR-003-004-memory-calibration -->
<!-- T002 appended below -->

## 4a. Scenarios Owned by T002 — Memory Calibration

**Target file**: `lib/embedding/engine/memory-calibrator.test.js` (new in Phase 05)
**Module under test**: `lib/embedding/engine/memory-calibrator.js` (authored in Phase 06)
**Module surface**: `calibratePerWorkerMemory`, `readCachedCalibration`, `writeCachedCalibration`, `computeFingerprint` (see [module-design.md §Module 1](./module-design.md)).

### 4a.1 FR-003 — Memory calibration one-shot worker
Traces: FR-003, ERR-CALIB-001, ERR-CALIB-003, [module-design.md §Module 1 internal logic steps 2–8]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| CALIB-01 | P0 | No cache + mock pool reporting baseline 0.3 GB / peak 2.0 GB → returns CalibrationResult with perWorkerMemGB ≈ 2.04 GB (20% margin) and all 10 typedef fields populated | memory-calibrator.test.js |
| CALIB-02 | P0 | Successful calibration → `.isdlc/embedding-calibration.json` is written with every required field and round-trips through readCachedCalibration | memory-calibrator.test.js |
| CALIB-03 | P0 | peak=2.0 / baseline=0.3 / safetyMargin=0.2 → perWorkerMemGB === (peak − baseline) × 1.2 within 0.001 tolerance | memory-calibrator.test.js |
| CALIB-04 | P0 | samplingIntervalMs=500 and a simulated 2 s inference → ≥4 RSS samples collected, `peakMemGB = max(samples)` | memory-calibrator.test.js |
| CALIB-05 | P0 | ERR-CALIB-001: worker pool spawn throws → resolves to null (no exception escapes) and caller can fall back to hardcoded constants | memory-calibrator.test.js |
| CALIB-06 | P0 | ERR-CALIB-003: sample RSS < baseline (0.1 GB vs 0.3 GB baseline) → discarded, result is null | memory-calibrator.test.js |
| CALIB-07 | P0 | ERR-CALIB-003: sample RSS > 50 GB → discarded, result is null | memory-calibrator.test.js |
| CALIB-08 | P1 | Successful calibration → durationMs > 0 and < timeoutMs | memory-calibrator.test.js |
| CALIB-09 | P1 | pool.embed throws mid-run → returns null AND still calls `pool.shutdown()` once (no worker leak) | memory-calibrator.test.js |

### 4a.2 FR-004 — Calibration cache invalidation
Traces: FR-004, [module-design.md §A-DESIGN-2 (fingerprint scheme)]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| INV-01 | P0 | Cache file fingerprint matches → readCachedCalibration returns the parsed result (fast path) | memory-calibrator.test.js |
| INV-02 | P0 | Cache file fingerprint differs → readCachedCalibration returns null (forces recalibration) | memory-calibrator.test.js |
| INV-03 | P0 | Cache with fingerprint A + current config yields fingerprint B → calibratePerWorkerMemory re-runs and overwrites cache (no manual clearing) | memory-calibrator.test.js |
| INV-04 | P0 | device change (cpu → coreml) → computeFingerprint yields different values | memory-calibrator.test.js |
| INV-05 | P0 | dtype change (fp16 → fp32) → fingerprints differ | memory-calibrator.test.js |
| INV-06 | P0 | model change → fingerprints differ | memory-calibrator.test.js |
| INV-07 | P1 | Same config twice → computeFingerprint is deterministic (16-char hex SHA-256 prefix) | memory-calibrator.test.js |
| INV-08 | P1 | Cache file missing → readCachedCalibration returns null (no throw) | memory-calibrator.test.js |
| INV-09 | P1 | Cache file is corrupt JSON → readCachedCalibration returns null (no throw) | memory-calibrator.test.js |
| INV-10 | P1 | write → read round trip → all 10 CalibrationResult fields preserved | memory-calibrator.test.js |

### 4a.3 NFR-003 — Calibration overhead ≤2 min with safe fallback
Traces: NFR-003, ERR-CALIB-002

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| TIMEOUT-01 | P1 | ERR-CALIB-002: inference hangs past options.timeoutMs (50 ms compressed) → pool killed, function resolves null within timeoutMs + jitter | memory-calibrator.test.js |
| TIMEOUT-02 | P1 | Default options.timeoutMs === 120000 (2-minute NFR-003 ceiling) | memory-calibrator.test.js |
| TIMEOUT-03 | P1 | Timeout returns null → caller (device-detector) treats null as "use hardcoded constants"; pipeline not blocked; no cache written | memory-calibrator.test.js |
| TIMEOUT-04 | P1 | Happy path durationMs ≪ 120000 → fast path well under NFR ceiling | memory-calibrator.test.js |
| TIMEOUT-05 | P2 | pool.shutdown itself hangs after timeout → outer promise still resolves null (shutdown is best-effort, no deadlock) | memory-calibrator.test.js |

### 4a.4 Test Fixtures and Data (T002 slice)

- **mockConfig(overrides)** — returns a minimal resolved embeddings config `{device, dtype, model, session_options}`. Phase 06 will extend for model variants.
- **mockCalibrationPool({ baselineRssGB, peakRssGB, inferenceDelayMs, shouldThrow })** — drives calibration deterministically via an injected `_createWorkerPool` DI hook. Exposes `_driveSamples(rssSequence)` so tests can inject the 500 ms RSS tick sequence.
- **Boundary values**: baseline=0 GB (pre-load state), peak ∈ {baseline+0.001 GB, 49.9 GB, 50.1 GB (invalid)}, sampleCount ∈ {1, 20, 100}.
- **Invalid inputs**: sample RSS < baseline, sample RSS > 50 GB, corrupt cache JSON, absent cache file, spawn failure.
- **Maximum-size inputs**: sampleCount=100 with 2000-char synthetic texts to exercise peak capture without blowing test runtime.
- **Temp project root**: each test uses `fs.mkdtempSync(os.tmpdir() + '/isdlc-calib-')` to isolate cache reads/writes from the real `.isdlc/` directory.
- **Mock timers**: `node:test` mock timers compress the 2-minute timeout into tens of milliseconds for CI (TIMEOUT-01).

### 4a.5 Traceability Summary (T002)

| Requirement | Test Cases | File |
|-------------|-----------|------|
| FR-003 (Memory calibration one-shot) | CALIB-01..CALIB-09 | memory-calibrator.test.js |
| FR-004 (Calibration cache invalidation) | INV-01..INV-10 | memory-calibrator.test.js |
| NFR-003 (≤2-min ceiling + fallback) | TIMEOUT-01..TIMEOUT-05 | memory-calibrator.test.js |
| ERR-CALIB-001 (spawn failure) | CALIB-05 | memory-calibrator.test.js |
| ERR-CALIB-002 (timeout) | TIMEOUT-01 | memory-calibrator.test.js |
| ERR-CALIB-003 (implausible RSS) | CALIB-06, CALIB-07 | memory-calibrator.test.js |

### 4a.6 GATE-04 Checklist (T002 slice)

- [x] Test cases exist for FR-003, FR-004, NFR-003
- [x] Traceability matrix complete for owned FRs (§4a.5)
- [x] All P0 scenarios present for FR-003 and FR-004 (no P0 deferrals)
- [x] Error taxonomy exercised (ERR-CALIB-001/002/003)
- [x] Fingerprint invalidation coverage for all 3 fields (device, dtype, model) — INV-04/05/06
- [x] Scaffolds committed as `test.skip()` — Phase 06 will implement bodies
- [x] atdd-checklist.json updated with FR-003/FR-004/NFR-003 entries (T001 entries preserved)
- [x] Test file `node --test` runs clean with 24 skipped tests

<!-- ANCHOR: FR-006-007-008-010-F0009-and-installer -->
<!-- T003 appended below -->

## 4b. Scenarios Owned by T003 — F0009 + Config Opt-in + Installer Prompt

**Target files**:
- `src/core/finalize/refresh-code-embeddings.test.js` (new in Phase 05)
- `tests/core/config/config-service.test.js` (existing — new `describe` block appended for `hasUserEmbeddingsConfig`)
- `tests/bin/isdlc-init.test.js` (new in Phase 05)

**Modules under test** (all authored or extended in Phase 06):
- `src/core/finalize/refresh-code-embeddings.js` (new F0009 step)
- `src/core/config/config-service.js` → new export `hasUserEmbeddingsConfig(projectRoot)`
- `bin/isdlc.js` init flow (+ `install.sh` / PowerShell installer) embeddings-opt-in prompt

### 4b.1 FR-006 — Opt-in via config presence
Traces: FR-006, ERR-F0009-001, [requirements-spec.md lines 60–66, 144]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| OPTIN-01 | P0 | Raw `.isdlc/config.json` missing `embeddings` key → F0009 resolves `{status:'skipped', reason:'opted_out'}`, no spawn, no /reload | refresh-code-embeddings.test.js |
| OPTIN-02 | P0 | Raw config has `embeddings: null` → F0009 resolves `{status:'skipped'}`, no spawn | refresh-code-embeddings.test.js |
| OPTIN-03 | P0 | Raw config is malformed JSON (ERR-F0009-001) → F0009 catches the parse error, resolves `{status:'skipped', reason:'opted_out'}`, does NOT throw | refresh-code-embeddings.test.js |
| HUEC-01 | P0 | Raw config has `embeddings: {...}` → `hasUserEmbeddingsConfig(projectRoot)` returns `true` | config-service.test.js |
| HUEC-02 | P0 | Raw config has NO `embeddings` key → `hasUserEmbeddingsConfig` returns `false` even though `getConfig().embeddings` is populated from defaults (proves raw-vs-merged distinction) | config-service.test.js |
| HUEC-03 | P0 | Raw config has `embeddings: null` → `hasUserEmbeddingsConfig` returns `false` (explicit null = not configured) | config-service.test.js |
| HUEC-04 | P0 | `.isdlc/config.json` does not exist → `hasUserEmbeddingsConfig` returns `false` without throwing ENOENT | config-service.test.js |
| HUEC-05 | P0 | Malformed JSON in raw config (ERR-F0009-001) → `hasUserEmbeddingsConfig` returns `false` (fail-open), parse error does NOT propagate | config-service.test.js |
| HUEC-06 | P0 | Side-by-side: same projectRoot, `getConfig().embeddings` truthy AND `hasUserEmbeddingsConfig` false → regression proof that F0009 cannot use `getConfig()` for opt-in detection | config-service.test.js |
| HUEC-07 | P1 | Repeated calls pick up live file edits (no stale cache between invocations) | config-service.test.js |

### 4b.2 FR-007 — Refresh on finalize (F0009)
Traces: FR-007, ERR-F0009-003, [requirements-spec.md lines 67–75]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| F0009-HAPPY-01 | P0 | Embeddings configured AND `.emb` package present AND server up → spawn `isdlc-embedding generate . --incremental`, forward stdout/stderr with `[F0009]` prefix, POST `/reload` on success, resolve `{status:'ok'}` | refresh-code-embeddings.test.js |
| F0009-AUTOSTART-01 | P0 | Server down at F0009 time → auto-start server BEFORE /reload, then POST | refresh-code-embeddings.test.js |
| F0009-DISABLED-01 | P0 | `embeddings.refresh_on_finalize === false` → skip with `{status:'skipped', reason:'disabled'}`, no spawn, no /reload | refresh-code-embeddings.test.js |

Step-type contract: the finalize-runner registration for F0009 MUST be `type: 'internal'` (JS function), NOT `type: 'shell'` — so stdout forwarding and /reload are in-process.

### 4b.3 FR-008 — First-time bootstrap safety
Traces: FR-008, [requirements-spec.md lines 76–89]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| BOOTSTRAP-01 | P0 | Embeddings configured but `docs/.embeddings/` has zero `.emb` packages → resolve `{status:'bootstrap_needed'}`, print the exact one-line banner, NEVER spawn generate | refresh-code-embeddings.test.js |
| BOOTSTRAP-02 | P1 | Banner fires on EVERY build until user manually bootstraps (no "shown once" suppression cache) | refresh-code-embeddings.test.js |

Exact banner text (locked by contract):
```
F0009 Code embeddings: skipped — run 'isdlc-embedding generate .' manually to bootstrap (one-time ~30-60 min)
```

### 4b.4 FR-010 — Install-time opt-in prompt
Traces: FR-010, ERR-INSTALL-001, [requirements-spec.md line 90]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| PROMPT-01 | P0 | Installer displays EXACTLY `Enable code embeddings for semantic search? [y/N]: ` (note default-N caps, trailing space) | isdlc-init.test.js |
| PROMPT-02 | P0 | Empty input (just Enter) → config OMITS `embeddings` key entirely (default N) | isdlc-init.test.js |
| PROMPT-03 | P0 | Input `y` → config INCLUDES embeddings block with sensible defaults | isdlc-init.test.js |
| PROMPT-04 | P0 | Input `yes` → config INCLUDES embeddings block | isdlc-init.test.js |
| PROMPT-05 | P0 | Input `Y` (capital) → config INCLUDES embeddings block (case-insensitive) | isdlc-init.test.js |
| PROMPT-06 | P0 | Input `n` → config OMITS embeddings key | isdlc-init.test.js |
| PROMPT-07 | P1 | Input `no` → config OMITS embeddings key | isdlc-init.test.js |
| PROMPT-08 | P0 | Enabled path prints exactly `→ Embeddings enabled. Run 'isdlc-embedding generate .' to bootstrap.` | isdlc-init.test.js |
| PROMPT-09 | P0 | Disabled path prints exactly `→ Embeddings disabled. Run 'isdlc-embedding configure' at any time to enable.` | isdlc-init.test.js |

### 4b.5 NFR-006 — Fail-open behavior
Traces: NFR-006, ERR-F0009-001, ERR-F0009-002, ERR-F0009-003, ERR-INSTALL-001, [requirements-spec.md lines 125–130]

| Scenario ID | Priority | Given / When / Then | Test File |
|-------------|----------|---------------------|-----------|
| FAILOPEN-F0009-01 | P0 | ERR-F0009-002: child process exits non-zero with stderr text → log stderr, resolve `{status:'failed'}`, do NOT throw, finalize continues | refresh-code-embeddings.test.js |
| FAILOPEN-F0009-02 | P0 | ERR-F0009-003: child exits 0 but POST /reload fails (500 or ECONNREFUSED) → log warning, resolve (`status: 'ok'` or `'partial'` + `reload_failed: true`), do NOT throw | refresh-code-embeddings.test.js |
| FAILOPEN-F0009-03 | P0 | ANY failure branch (parse, spawn, reload, server-autostart) → promise RESOLVES, never rejects — locked by `critical:false, fail_open:true` step config | refresh-code-embeddings.test.js |
| FAILOPEN-INIT-01 | P0 | ERR-INSTALL-001: stdin returns EOF immediately (CI / piped install, non-TTY) → default NO, config omits embeddings key, do NOT hang | isdlc-init.test.js |
| FAILOPEN-INIT-02 | P0 | stdin errors mid-read (broken pipe) → default NO, installer process does NOT crash | isdlc-init.test.js |
| FAILOPEN-INIT-03 | P1 | Non-y/n response like `maybe` → treated as default NO (only y/Y/yes/YES enables) | isdlc-init.test.js |
| FAILOPEN-INIT-04 | P1 | `--non-interactive` flag present → prompt skipped, default NO branch, disabled message still printed for log consistency | isdlc-init.test.js |

### 4b.6 Test Fixtures and Data (T003 slice)

- **Temp project root**: `fs.mkdtempSync(os.tmpdir() + '/isdlc-f0009-')` per test — each test writes its own `.isdlc/config.json` and `docs/.embeddings/` structure to isolate from the real project.
- **Mock spawn**: DI hook (e.g., `_spawn` injected into `refresh-code-embeddings.js`) returning a stubbed ChildProcess with controllable exit code, stdout/stderr streams, and `exit` event timing. Supports the non-zero-exit and happy-path branches.
- **Mock HTTP**: stubbed `pushReload` / fetch so /reload can be driven to return 200 / 500 / network error deterministically.
- **Mock server reachability**: `_isServerReachable` DI hook to simulate server-down → auto-start path.
- **Mock stdin**: synthetic readline interface backed by an in-memory Readable stream for the installer prompt tests. Supports `"y\n"`, `"yes\n"`, `"n\n"`, `""`, EOF-immediate, and error-emission.
- **Boundary values**: empty `docs/.embeddings/`, single `.emb` package, multiple packages, pre-existing calibration file; config variants `{}`, `{embeddings: null}`, `{embeddings: {}}`, `{embeddings: {refresh_on_finalize: false}}`.
- **Invalid inputs**: malformed JSON config, ENOENT config, EOF stdin, error-emitting stdin, non-zero child exit, /reload 500, /reload ECONNREFUSED.
- **Maximum-size inputs**: this slice has no payload dimension — the "max" case is many batches handed off from T001/T002 surfaces upstream, not in scope here.

### 4b.7 Traceability Summary (T003)

| Requirement | Test Cases | File |
|-------------|-----------|------|
| FR-006 (Opt-in via config presence) | OPTIN-01..OPTIN-03, HUEC-01..HUEC-07 | refresh-code-embeddings.test.js, config-service.test.js |
| FR-007 (Refresh on finalize) | F0009-HAPPY-01, F0009-AUTOSTART-01, F0009-DISABLED-01 | refresh-code-embeddings.test.js |
| FR-008 (First-time bootstrap safety) | BOOTSTRAP-01, BOOTSTRAP-02 | refresh-code-embeddings.test.js |
| FR-010 (Install-time opt-in prompt) | PROMPT-01..PROMPT-09 | isdlc-init.test.js |
| NFR-006 (Fail-open behavior) | FAILOPEN-F0009-01..03, FAILOPEN-INIT-01..04 | refresh-code-embeddings.test.js, isdlc-init.test.js |
| ERR-F0009-001 | OPTIN-03, HUEC-05 | refresh-code-embeddings.test.js, config-service.test.js |
| ERR-F0009-002 | FAILOPEN-F0009-01 | refresh-code-embeddings.test.js |
| ERR-F0009-003 | FAILOPEN-F0009-02 | refresh-code-embeddings.test.js |
| ERR-INSTALL-001 | FAILOPEN-INIT-01 | isdlc-init.test.js |

### 4b.8 GATE-04 Checklist (T003 slice)

- [x] Test cases exist for FR-006, FR-007, FR-008, FR-010, NFR-006
- [x] Traceability matrix complete for owned FRs (§4b.7)
- [x] All P0 scenarios present (no P0 deferrals; all five FR/NFRs are P0)
- [x] Error taxonomy exercised (ERR-F0009-001/002/003, ERR-INSTALL-001)
- [x] Raw-vs-merged distinction locked for `hasUserEmbeddingsConfig` (HUEC-02, HUEC-06)
- [x] Exact prompt and completion-message text locked by contract (PROMPT-01, PROMPT-08, PROMPT-09)
- [x] Exact bootstrap banner text locked (BOOTSTRAP-01)
- [x] Fail-open guarantee proven for EVERY failure branch (FAILOPEN-F0009-03)
- [x] Scaffolds committed as `test.skip()` — Phase 06 will implement bodies
- [x] atdd-checklist.json updated with FR-006/FR-007/FR-008/FR-010/NFR-006 entries (T001 + T002 entries preserved)
- [x] Test files `node --test` run clean (31 skipped scaffolds — 9 F0009, 7 hasUserEmbeddingsConfig, 15 installer)

## 8. Constitutional Compliance (T001)

| Article | How this strategy upholds it |
|---------|------------------------------|
| II (Test-First Development) | All scaffolds are `test.skip()` placeholders authored before Phase 06 implementation. The `describe/it` shells + GWT comments define the target contract. |
| VII (Artifact Traceability) | Every scenario maps to an FR/NFR/ERR code in the table above and in the inline test comments. |
| IX (Quality Gate Integrity) | Shared artifacts (this file + atdd-checklist.json) are created with anchor comments so T002/T003 can append without merge conflict. Gate-04 items checked in §9. |
| XI (Integration Testing Integrity) | CONC-06 and UNIF-08 exercise the engine→adapter→pool integration seam end-to-end through the mock, proving the single-call contract across all three layers. |

## 9. GATE-04 Checklist (T001 slice)

- [x] Test cases exist for FR-001, FR-002, FR-005, NFR-005
- [x] Traceability matrix complete for owned FRs (§6)
- [x] Coverage targets defined (§3 test pyramid)
- [x] Test data strategy documented (§5)
- [x] Critical paths identified (CONC-01, UNIF-03 — regression proofs)
- [x] All P0 scenarios present (no P0 deferrals)
- [x] atdd-checklist.json created with T001's FR entries keyed by FR ID
- [x] Scaffolds committed as `test.skip()` — Phase 06 will implement bodies
- [ ] FR-003, FR-004 coverage (deferred to T002)
- [ ] FR-006, FR-007, FR-008, FR-010 coverage (deferred to T003)
