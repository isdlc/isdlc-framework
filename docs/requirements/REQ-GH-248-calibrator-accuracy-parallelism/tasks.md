# Task Plan: SLUG REQGH248calibrator

Generated: 2026-04-15
Source: REQ-GH-248-calibrator-accuracy-parallelism
Artifacts: bug-report.md, root-cause-analysis.md, fix-strategy.md

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Design calibrator real-chunk sampling tests | traces: FR-001, AC-001-01, AC-001-02, AC-001-03
  files: docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-strategy.md (CREATE)
  blocked_by: []
  blocks: [T012, T020]
- [X] T002 Design steady-state measurement tests | traces: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04
  files: docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-strategy.md (MODIFY)
  blocked_by: [T001]
  blocks: [T013, T020]
- [X] T003 Design session_options propagation and fingerprint tests | traces: FR-003, FR-004, AC-003-01, AC-003-02, AC-003-03, AC-004-01, AC-004-02, AC-004-03
  files: docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-strategy.md (MODIFY)
  blocked_by: [T001]
  blocks: [T010, T011, T021]
- [X] T004 Design graphOpt parity and default flip tests | traces: FR-005, AC-005-01, AC-005-02, AC-005-03, AC-005-04
  files: docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-strategy.md (MODIFY)
  blocked_by: [T001]
  blocks: [T008, T009, T032]
- [X] T005 Design workload-aware parallelism and dedup tests | traces: FR-006, FR-008, AC-006-01, AC-006-02, AC-006-03, AC-006-04, AC-008-01, AC-008-02, AC-008-03
  files: docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-strategy.md (MODIFY)
  blocked_by: [T001]
  blocks: [T015, T016, T017, T018, T022, T023]
- [X] T006 Design adapter calibrated-value pass-through tests | traces: FR-007, AC-007-01, AC-007-02, AC-007-03
  files: docs/requirements/REQ-GH-248-calibrator-accuracy-parallelism/test-strategy.md (MODIFY)
  blocked_by: [T001]
  blocks: [T014, T024]

## Phase 06: Implementation -- PENDING

- [ ] T007 Pin fixture corpus of 100 multi-language chunks for parity test | traces: FR-005, AC-005-04
  files: lib/embedding/engine/fixtures/parity-corpus/ (CREATE)
  blocked_by: [T004]
  blocks: [T008]
- [ ] T008 Add cosine-similarity parity test infrastructure | traces: FR-005, AC-005-04
  files: lib/embedding/engine/graph-optimization-parity.test.js (CREATE)
  blocked_by: [T007]
  blocks: [T009]
- [ ] T009 Flip graphOptimizationLevel default to all in config-defaults and embeddings-prompt | traces: FR-005, AC-005-01, AC-005-02, AC-005-03
  files: src/core/config/config-defaults.js (MODIFY), lib/install/embeddings-prompt.js (MODIFY)
  blocked_by: [T008]
  blocks: [T010, T027]
- [ ] T010 Propagate session_options into calibrationConfig at CLI calibration call site | traces: FR-003, AC-003-01, AC-003-02, AC-003-03
  files: bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T003, T009]
  blocks: [T011]
- [ ] T011 Expand computeFingerprint to hash session_options keys | traces: FR-004, AC-004-01, AC-004-02, AC-004-03
  files: lib/embedding/engine/memory-calibrator.js (MODIFY)
  blocked_by: [T003, T010]
  blocks: [T012, T021]
- [ ] T012 Rework calibrator sample source to pull real chunks via chunker | traces: FR-001, AC-001-01, AC-001-02, AC-001-03
  files: lib/embedding/engine/memory-calibrator.js (MODIFY), bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T001, T011]
  blocks: [T013]
- [ ] T013 Adjust calibrator cadence window and timeout defaults | traces: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04
  files: lib/embedding/engine/memory-calibrator.js (MODIFY)
  blocked_by: [T002, T012]
  blocks: [T014, T020]
- [ ] T014 Fix jina-code-adapter pool construction to pass calibrated value through | traces: FR-007, AC-007-01, AC-007-02, AC-007-03
  files: lib/embedding/engine/jina-code-adapter.js (MODIFY)
  blocked_by: [T006, T013]
  blocks: [T015, T024]
- [ ] T015 Extract computeEffectiveParallelism helper | traces: FR-008, AC-008-01
  files: lib/embedding/engine/device-detector.js (MODIFY)
  blocked_by: [T005, T014]
  blocks: [T016, T017, T018]
- [ ] T016 Update autoParallelism to use helper with workloadFloor | traces: FR-006, AC-006-01, AC-006-02, AC-006-03, AC-006-04
  files: lib/embedding/engine/device-detector.js (MODIFY)
  blocked_by: [T005, T015]
  blocks: [T019, T022]
- [ ] T017 Update resolvePoolSize to use helper with workloadFloor | traces: FR-006, FR-008, AC-006-01, AC-006-02, AC-006-03, AC-008-02
  files: lib/embedding/engine/worker-pool.js (MODIFY)
  blocked_by: [T005, T015]
  blocks: [T018, T023]
- [ ] T018 Dedup constants between device-detector and worker-pool | traces: FR-008, AC-008-02, AC-008-03
  files: lib/embedding/engine/device-detector.js (MODIFY), lib/embedding/engine/worker-pool.js (MODIFY)
  blocked_by: [T016, T017]
  blocks: [T023]
- [ ] T019 Thread workloadSize through CLI to resolveConfig via engine and adapter | traces: FR-006, AC-006-01, AC-006-02, AC-006-03, AC-006-04
  files: bin/isdlc-embedding.js (MODIFY), lib/embedding/engine/index.js (MODIFY), lib/embedding/engine/jina-code-adapter.js (MODIFY)
  blocked_by: [T016]
  blocks: [T028]
- [ ] T020 Unit tests for calibrator real-chunk sampling and steady-state | traces: FR-001, FR-002, AC-001-01, AC-001-02, AC-001-03, AC-002-01, AC-002-02, AC-002-03, AC-002-04
  files: lib/embedding/engine/memory-calibrator.test.js (MODIFY)
  blocked_by: [T013]
  blocks: [T029]
- [ ] T021 Unit tests for session_options propagation and fingerprint expansion | traces: FR-003, FR-004, AC-003-01, AC-003-02, AC-003-03, AC-004-01, AC-004-02, AC-004-03
  files: lib/embedding/engine/memory-calibrator.test.js (MODIFY)
  blocked_by: [T011]
  blocks: [T029]
- [ ] T022 Unit tests for workload-aware autoParallelism | traces: FR-006, AC-006-01, AC-006-02, AC-006-03, AC-006-04
  files: lib/embedding/engine/device-detector.test.js (MODIFY)
  blocked_by: [T016]
  blocks: [T029]
- [ ] T023 Unit tests for workload-aware resolvePoolSize and dedup | traces: FR-006, FR-008, AC-006-01, AC-006-02, AC-006-03, AC-008-01, AC-008-02, AC-008-03
  files: lib/embedding/engine/worker-pool.test.js (MODIFY)
  blocked_by: [T018]
  blocks: [T029]
- [ ] T024 Unit tests for adapter calibrated value pass-through | traces: FR-007, AC-007-01, AC-007-02, AC-007-03
  files: lib/embedding/engine/jina-code-adapter.test.js (MODIFY)
  blocked_by: [T014]
  blocks: [T029]
- [ ] T025 Verify no Claude agent or hook file impacts (dual-file awareness) | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
  files: src/claude/ (VERIFY)
  blocked_by: [T019]
  blocks: [T029]
- [ ] T026 Verify no src providers codex impacts (dual-provider parity) | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
  files: src/providers/codex/ (VERIFY)
  blocked_by: [T019]
  blocks: [T029]
- [ ] T027 Update docs isdlc config-reference for graphOptimizationLevel default change | traces: FR-005, AC-005-01
  files: docs/isdlc/config-reference.md (MODIFY)
  blocked_by: [T009]
  blocks: [T029]
- [ ] T028 Cross-reference fix in REQ-GH-239 benchmark-report | traces: FR-001, FR-005, FR-006
  files: docs/requirements/REQ-GH-239-worker-pool-engine-parallelism/benchmark-report.md (MODIFY)
  blocked_by: [T019]
  blocks: [T029]

## Phase 16: Quality Loop -- PENDING

- [ ] T029 Run full test suite with node test runner | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
  files: (test execution, no file changes)
  blocked_by: [T020, T021, T022, T023, T024, T025, T026, T027, T028]
  blocks: [T030]
- [ ] T030 End-to-end calibration on 24GB Apple Silicon with Jina v2 fp16 CoreML | traces: FR-001, FR-002, FR-003, FR-005
  files: (manual verification, no file changes)
  blocked_by: [T029]
  blocks: [T031, T032, T033]
- [ ] T031 Verify auto-parallelism picks sane pool size on target hardware | traces: FR-006, FR-007
  files: (manual verification, no file changes)
  blocked_by: [T030]
  blocks: [T033]
- [ ] T032 Run cosine-similarity parity test against pinned fixture corpus | traces: FR-005, AC-005-04
  files: (parity test execution, no file changes)
  blocked_by: [T030]
  blocks: [T034]
- [ ] T033 Measure throughput improvement assert at least 3x baseline with parallelism auto | traces: FR-006, FR-007
  files: (benchmark execution, no file changes)
  blocked_by: [T031]
  blocks: [T034]

## Phase 08: Code Review -- PENDING

- [ ] T034 Constitutional review against Articles I II V X XII | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
  files: (review, no file changes)
  blocked_by: [T032, T033]
  blocks: [T035]
- [ ] T035 Dual-file check verify no symlinked claude or isdlc files diverge from src | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
  files: (review, no file changes)
  blocked_by: [T034]
  blocks: []

## Progress Summary

| Phase | Name | Total | Done | % |
|---|---|---|---|---|
| 05 | Test Strategy | 6 | 6 | 100% |
| 06 | Implementation | 22 | 0 | 0% |
| 16 | Quality Loop | 5 | 0 | 0% |
| 08 | Code Review | 2 | 0 | 0% |
| **Total** | | **35** | **6** | **17%** |

## Dependency Graph

Critical path (longest chain):
T001 -> T004 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T019 -> T029 -> T030 -> T031 -> T033 -> T034 -> T035

Length: 19 tasks.

Parallel opportunities:
- Phase 05 test design tasks (T002-T006) can run in parallel after T001 creates test-strategy.md
- Unit tests (T020-T024) can run in parallel once their implementation dependencies complete
- Wiring and cleanup tasks (T025, T026, T027, T028) can run in parallel with unit tests
- Parity verification (T032) runs in parallel with throughput measurement (T033) after T030

Commit order within Phase 06 matches the fix-strategy commit table:
T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019

Constants dedup (T018) sits late in the chain because it depends on both T016 and T017 having updated their respective call sites.

## Traceability Matrix

| FR | AC count | Phase 05 Tasks | Phase 06 Tasks | Phase 16 Tasks | Phase 08 Tasks |
|---|---|---|---|---|---|
| FR-001 | 3 | T001 | T012, T020, T025, T026, T028 | T029, T030 | T034, T035 |
| FR-002 | 4 | T002 | T013, T020, T025, T026 | T029, T030 | T034, T035 |
| FR-003 | 3 | T003 | T010, T021, T025, T026 | T029, T030 | T034, T035 |
| FR-004 | 3 | T003 | T011, T021, T025, T026 | T029 | T034, T035 |
| FR-005 | 4 | T004 | T007, T008, T009, T025, T026, T027, T028 | T029, T030, T032 | T034, T035 |
| FR-006 | 4 | T005 | T016, T017, T019, T022, T023, T025, T026, T028 | T029, T031, T033 | T034, T035 |
| FR-007 | 3 | T006 | T014, T019, T024, T025, T026 | T029, T031, T033 | T034, T035 |
| FR-008 | 3 | T005 | T015, T017, T018, T023, T025, T026 | T029 | T034, T035 |

All 8 FRs and 27 ACs are traced to at least one task in every build phase. No orphan requirements.

## Assumptions and Inferences

- ASM-001: Real chunks for calibration come from `lib/embedding/chunker` output already available in the CLI hot path at `bin/isdlc-embedding.js:536`. No new chunker invocation needed; calibrator subsamples existing chunks.
- ASM-002: The upstream ONNX Runtime `SimplifiedLayerNormFusion` bug is either fixed in pinned versions or detectable by the cosine parity test. If parity fails, commits 1-2 from the fix strategy are reverted but commits 3-7 ship (calibrator + workload-aware parallelism still net-positive).
- ASM-003: Differential refresh does not call `calibratePerWorkerMemory()` today. This fix preserves that. Differential paths will still benefit from workload-aware parallelism via FR-006.
- ASM-004: No new runtime dependencies. Pinned fixture corpus is real code chunks copied from the project itself.
- ASM-005: Article II (test-first) covered by commit order — parity test lands first (commit 1), default flip second (commit 2). Article X (fail-safe defaults) covered by keeping `"disabled"` as a user escape hatch. Article XII (cross-platform) covered by scoping the default flip to the CoreML path; CPU and CUDA paths unchanged.
- INF-001: Real per-worker cost with `graphOptimizationLevel: "all"` likely drops from ~7 GB to ~3-4 GB. If confirmed, `autoParallelism` picks 2-3 workers on a 24 GB Mac, unlocking NFR-002's ≥3× throughput target. If the real cost stays above ~5 GB/worker even after the flip, auto-parallelism correctly falls back to 1-2 workers and NFR-002 is not met on 24 GB hardware alone — that outcome indicates the hardware is the constraint, not the calibrator.
- INF-002: The 500 ms sampling cadence was inherited from an early GH-239 PR and was never tuned against real steady-state timing. 200 ms is chosen empirically to give ~100-150 samples over a 20-30 s run, enough to capture multiple batch-memory peaks.
