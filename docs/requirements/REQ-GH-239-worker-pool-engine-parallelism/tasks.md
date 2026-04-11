# Task Plan: REQ-GH-239 worker-pool-engine-parallelism

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05    | 3     | 0    | 3         |
| 06    | 13    | 0    | 13        |
| 16    | 2     | 0    | 2         |
| 08    | 2     | 0    | 2         |
| **Total** | **20** | **0** | **20** |

## Phase 05: Test Strategy -- PENDING

- [ ] T001 Design test cases for concurrent batch dispatch, progress callback throughput+ETA, pool fan-out, crash recovery under concurrency | traces: FR-001, FR-002, FR-005, NFR-005
  files: lib/embedding/engine/worker-pool.test.js (MODIFY), lib/embedding/engine/jina-code-adapter.test.js (MODIFY), lib/embedding/engine/index.test.js (MODIFY)
  blocked_by: []
  blocks: [T005, T006, T007]
- [ ] T002 Design test cases for memory calibrator happy path, timeout fallback, cache hit, fingerprint invalidation, RSS sampling accuracy | traces: FR-003, FR-004, NFR-003
  files: lib/embedding/engine/memory-calibrator.test.js (CREATE)
  blocked_by: []
  blocks: [T004]
- [ ] T003 Design test cases for F0009 handler paths, installer opt-in prompts, hasUserEmbeddingsConfig raw vs merged distinction | traces: FR-006, FR-007, FR-008, FR-010, NFR-006
  files: src/core/finalize/refresh-code-embeddings.test.js (CREATE), tests/core/config/config-service.test.js (CREATE), tests/bin/isdlc-init.test.js (CREATE)
  blocked_by: []
  blocks: [T009, T010, T013, T014]

## Phase 06: Implementation -- PENDING

- [ ] T004 Create memory-calibrator.js with calibratePerWorkerMemory, readCachedCalibration, writeCachedCalibration, computeFingerprint, 20-text sample generation, 500ms RSS sampling, 2-min timeout fallback, 20 percent safety margin | traces: FR-003, FR-004, NFR-003
  files: lib/embedding/engine/memory-calibrator.js (CREATE), lib/embedding/engine/memory-calibrator.test.js (MODIFY)
  blocked_by: [T002]
  blocks: [T008, T015]
- [X] T005 Extend worker-pool.js pool.embed with options.onProgress, add 10-batch moving average rate window, compute chunks_per_sec and eta_seconds, fire per-batch callback with throughput+ETA object | traces: FR-001, FR-005, NFR-005
  files: lib/embedding/engine/worker-pool.js (MODIFY), lib/embedding/engine/worker-pool.test.js (MODIFY)
  blocked_by: [T001]
  blocks: [T006]
- [ ] T006 Unify jina-code-adapter.js embed interface, in-process path loops text-by-text with batch-boundary progress synthesis, pooled path is one-liner to pool.embed with onProgress forwarding | traces: FR-001, FR-002, FR-005
  files: lib/embedding/engine/jina-code-adapter.js (MODIFY), lib/embedding/engine/jina-code-adapter.test.js (MODIFY)
  blocked_by: [T001, T005]
  blocks: [T007]
- [ ] T007 Refactor engine/index.js to remove outer batch loop, make single adapter.embed call with full text array, move totalTokens computation post-embed | traces: FR-001, FR-002
  files: lib/embedding/engine/index.js (MODIFY), lib/embedding/engine/index.test.js (MODIFY)
  blocked_by: [T001, T006]
  blocks: [T016]
- [ ] T008 Integrate calibration into device-detector.js resolvePerWorkerMemGB helper, read cache before falling back to hardcoded WORKER_MEMORY_ESTIMATE_GB constants, log source for observability | traces: FR-003, FR-009, NFR-001
  files: lib/embedding/engine/device-detector.js (MODIFY), lib/embedding/engine/device-detector.test.js (MODIFY)
  blocked_by: [T004]
  blocks: [T015]
- [ ] T009 Add hasUserEmbeddingsConfig export to config-service.js reading raw .isdlc/config.json bypassing defaults merge layer | traces: FR-006
  files: src/core/config/config-service.js (MODIFY), tests/core/config/config-service.test.js (MODIFY)
  blocked_by: [T003]
  blocks: [T010, T013]
- [ ] T010 Create refresh-code-embeddings.js F0009 handler with opt-in check, bootstrap guard, child process spawn of isdlc-embedding generate --incremental, stdout/stderr forwarding, never-throws contract | traces: FR-007, FR-008, NFR-004, NFR-006
  files: src/core/finalize/refresh-code-embeddings.js (CREATE), src/core/finalize/refresh-code-embeddings.test.js (MODIFY)
  blocked_by: [T003, T009]
  blocks: [T011]
- [ ] T011 Wire F0009 in finalize-utils.js, export F0009_refreshCodeEmbeddings function called by Phase-Loop Controller, return standard step result shape | traces: FR-007, NFR-006
  files: src/core/finalize/finalize-utils.js (MODIFY), src/core/finalize/finalize-utils.test.js (MODIFY)
  blocked_by: [T010]
  blocks: []
- [ ] T012 Update finalize-steps.md and shipped default to change F0009 metadata from type shell to type internal | traces: FR-007
  files: .isdlc/config/finalize-steps.md (MODIFY), src/core/finalize/finalize-steps.default.md (MODIFY)
  blocked_by: []
  blocks: []
- [ ] T013 Add embeddings opt-in prompt to bin/isdlc.js init handler, default to N, conditionally include embeddings block in generated config, print bootstrap or configure hint | traces: FR-010, FR-006
  files: bin/isdlc.js (MODIFY), tests/bin/isdlc-init.test.js (MODIFY)
  blocked_by: [T003, T009]
  blocks: []
- [ ] T014 Add matching embeddings prompt to install.sh bash installer with same wording and default N | traces: FR-010
  files: install.sh (MODIFY), tests/install/install-sh-embeddings.bats (CREATE)
  blocked_by: [T003]
  blocks: []
- [ ] T015 Integrate calibration invocation into bin/isdlc-embedding.js runGenerate, check cache before pool creation, run calibration on miss and log result | traces: FR-003, NFR-003
  files: bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T004, T008]
  blocks: []
- [ ] T016 Update CLI progress rendering in bin/isdlc-embedding.js to throughput+ETA format with carriage-return overwrite for TTY and newline for logs | traces: FR-005, NFR-005
  files: bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T007]
  blocks: []

## Phase 16: Quality Loop -- PENDING

- [ ] T017 Run full test suite across lib/embedding, src/core/config, src/core/finalize, bin and verify zero regressions from GH-238 baseline of 224 tests | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, NFR-007
  files: (all test files touched by phase 06)
  blocked_by: []
  blocks: []
- [ ] T018 Performance benchmark on 1000+ real code chunks with parallelism 1, 2, 4, verify NFR-002 throughput at least 3x baseline at N=4 and NFR-001 peak RSS stays under max_memory_gb | traces: NFR-001, NFR-002
  files: docs/requirements/REQ-GH-239-worker-pool-engine-parallelism/benchmark-report.md (CREATE)
  blocked_by: []
  blocks: []

## Phase 08: Code Review -- PENDING

- [ ] T019 Constitutional compliance review covering Article II test-first, Article V simplicity, Article X fail-safe defaults, Article XII cross-platform, Article XIII module consistency | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010
  files: docs/requirements/REQ-GH-239-worker-pool-engine-parallelism/code-review.md (CREATE)
  blocked_by: []
  blocks: [T020]
- [ ] T020 Dual-file check to verify no src/claude changes need .claude mirroring and config-defaults.js vs .isdlc/config distinction is respected | traces: FR-010
  files: docs/requirements/REQ-GH-239-worker-pool-engine-parallelism/code-review.md (MODIFY)
  blocked_by: [T019]
  blocks: []

## Dependency Graph

```
Phase 05 (test strategy):
T001 ──→ T005 ──→ T006 ──→ T007 ──→ T016
T002 ──→ T004 ──→ T008 ──→ T015
T003 ──→ T009 ──→ T010 ──→ T011
     └──→ T013
     └──→ T014

Independent (tier 0):
T012 (finalize-steps.md metadata change)

Phase 16:
T017, T018 (parallel, both gated on phase 06 completion)

Phase 08:
T019 ──→ T020
```

Critical path length: 4 tasks (T001 → T005 → T006 → T007 → T016 = 5 nodes, 4 edges).

Max parallelism tier: 6 tasks (T001, T002, T003, T012 all start at tier 0; T013 and T014 start after T003 alongside other tier-1 tasks).

## Traceability Matrix

| FR / NFR | Task IDs |
|----------|----------|
| FR-001 Concurrent batch dispatch | T001, T005, T006, T007 |
| FR-002 Unified adapter interface | T001, T006, T007 |
| FR-003 Memory calibration | T002, T004, T008, T015 |
| FR-004 Calibration cache invalidation | T002, T004 |
| FR-005 Throughput + ETA progress | T001, T005, T006, T016 |
| FR-006 Opt-in via config presence | T003, T009, T013 |
| FR-007 Refresh on finalize F0009 | T003, T010, T011, T012 |
| FR-008 First-time bootstrap safety | T003, T010 |
| FR-009 Configurability preserved | T008 |
| FR-010 Install-time opt-in prompt | T003, T013, T014, T020 |
| NFR-001 Memory respect | T008, T018 |
| NFR-002 Throughput 3x baseline | T018 |
| NFR-003 Calibration overhead | T002, T004, T015 |
| NFR-004 F0009 latency | T010, T018 |
| NFR-005 Progress update frequency | T001, T005, T016 |
| NFR-006 Fail-open behavior | T003, T010, T011 |
| NFR-007 Test coverage | T017, T019 |

All 10 FRs and 7 NFRs are covered by at least one task. No orphan tasks.

## Assumptions and Inferences

- A1 Breaking implementation and tests into separate tasks would double the count without changing execution shape, so tests are bundled with their corresponding implementation tasks in phase 06
- A2 Phase 06 has natural parallelism with 3 independent subtrees (engine/pool refactor chain, calibrator chain, F0009 chain) that task-level dispatch can fan out
- A3 T001 T002 T003 T012 are all tier 0 and can start concurrently; starting T004 T005 early unblocks the critical path
- A4 T018 benchmark produces a benchmark-report.md artifact that serves as evidence for NFR-002 and as tuning reference for users
- A5 T020 dual-file check is expected to pass quickly because no files under src/claude are touched
- A6 Installer prompt testing uses stdin mocking for Node tests and bats for the shell path, both standard patterns
- A7 Critical path is 4 edges long at 5 tasks deep, meaning optimal wall-clock with perfect task parallelism is roughly 5 sequential task durations plus quality loop and code review
