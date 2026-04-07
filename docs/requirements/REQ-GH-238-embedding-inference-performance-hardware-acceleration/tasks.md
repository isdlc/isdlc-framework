# Task Plan: REQ-GH-238 embedding-inference-performance-hardware-acceleration

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05    | 3     | 0    | 3         |
| 06    | 11    | 0    | 11        |
| 16    | 2     | 0    | 2         |
| 08    | 2     | 0    | 2         |
| **Total** | **18** | **0** | **18** |

## Phase 05: Test Strategy -- PENDING

- [ ] T001 Design test cases for worker pool (distribution, crash recovery, shutdown) | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
  files: lib/embedding/engine/worker-pool.test.js (CREATE)
- [ ] T002 Design test cases for batched inference and embedding worker | traces: FR-002, AC-002-01, AC-002-02, AC-002-03
  files: lib/embedding/engine/embedding-worker.test.js (CREATE)
- [ ] T003 Design test cases for device detection, config, and CLI overrides | traces: FR-003, FR-004, FR-006, AC-003-01, AC-003-02, AC-003-03, AC-003-04, AC-004-01, AC-004-07
  files: lib/embedding/engine/device-detector.test.js (CREATE)

## Phase 06: Implementation -- PENDING

- [ ] T004 Create worker-pool.js — thread management, round-robin, crash recovery, shutdown | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
  files: lib/embedding/engine/worker-pool.js (CREATE)
  blocked_by: []
  blocks: [T005, T007]
- [ ] T005 Create embedding-worker.js — pipeline init, batch processing, message protocol | traces: FR-001, FR-002, AC-002-01, AC-002-02, AC-002-03
  files: lib/embedding/engine/embedding-worker.js (CREATE)
  blocked_by: [T004]
  blocks: [T007]
- [ ] T006 Create device-detector.js — platform detection, optimal dtype | traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04, AC-003-08, AC-004-07
  files: lib/embedding/engine/device-detector.js (CREATE)
  blocked_by: []
  blocks: [T007]
- [ ] T007 Update jina-code-adapter.js — pool integration, device passthrough, auto config | traces: FR-001, FR-003, FR-004, AC-001-04, AC-003-05, AC-003-06, AC-003-07, AC-003-09, AC-004-06
  files: lib/embedding/engine/jina-code-adapter.js (MODIFY)
  blocked_by: [T004, T005, T006]
  blocks: [T009]
- [ ] T008 Extend config schema — add parallelism, device, batch_size, dtype, session_options | traces: FR-004, AC-004-01, AC-004-02, AC-004-03, AC-004-04, AC-004-05, AC-004-06, AC-004-08
  files: .isdlc/config.json (MODIFY)
  blocked_by: []
  blocks: [T009]
- [ ] T009 Update engine/index.js — read embeddings config, pass to adapter | traces: FR-004
  files: lib/embedding/engine/index.js (MODIFY)
  blocked_by: [T007, T008]
  blocks: [T010]
- [ ] T010 Update CLI — parse --parallelism, --device, --batch-size, --dtype flags | traces: FR-006, AC-006-01, AC-006-02
  files: bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T009]
  blocks: []
- [ ] T011 Write unit tests for worker-pool | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
  files: lib/embedding/engine/worker-pool.test.js (CREATE)
  blocked_by: [T004]
  blocks: []
- [ ] T012 Write unit tests for embedding-worker and batched inference | traces: FR-002, AC-002-01, AC-002-02, AC-002-03
  files: lib/embedding/engine/embedding-worker.test.js (CREATE)
  blocked_by: [T005]
  blocks: []
- [ ] T013 Write unit tests for device-detector | traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04, AC-003-08
  files: lib/embedding/engine/device-detector.test.js (CREATE)
  blocked_by: [T006]
  blocks: []
- [ ] T014 Write config integration tests and adapter config wiring tests | traces: FR-004, FR-005, AC-004-01, AC-004-07, AC-005-01, AC-005-02
  files: lib/embedding/engine/jina-code-adapter.test.js (MODIFY)
  blocked_by: [T007]
  blocks: []

## Phase 16: Quality Loop -- PENDING

- [ ] T015 Run full test suite — verify zero regressions | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
- [ ] T016 Performance benchmark — compare single-threaded vs multi-threaded on ~20K chunks | traces: NFR-001

## Phase 08: Code Review -- PENDING

- [ ] T017 Constitutional compliance review (Articles II, V, X, XII, XIII) | traces: FR-001, FR-003, FR-004
- [ ] T018 Dual-file check — verify changes apply to both src/ and .isdlc/.claude/ where applicable | traces: FR-001, FR-004

## Dependency Graph

```
T004 (worker-pool) ──→ T005 (emb-worker) ──→ T007 (adapter integration) ──→ T009 (engine config) ──→ T010 (CLI)
T006 (device-detector) ──────────────────────↗
T008 (config schema) ───────────────────────↗

T004 → T011 (pool tests)
T005 → T012 (worker tests)
T006 → T013 (detector tests)
T007 → T014 (adapter config tests)
```

Critical path: T004 → T005 → T007 → T009 → T010 (5 tasks)

## Traceability Matrix

| FR | ACs | Tasks |
|----|-----|-------|
| FR-001 | AC-001-01 to AC-001-04 | T001, T004, T005, T007, T011 |
| FR-002 | AC-002-01 to AC-002-03 | T002, T005, T012 |
| FR-003 | AC-003-01 to AC-003-09 | T003, T006, T007, T013 |
| FR-004 | AC-004-01 to AC-004-08 | T003, T008, T009, T014 |
| FR-005 | AC-005-01, AC-005-02 | T004, T014 |
| FR-006 | AC-006-01, AC-006-02 | T010 |

## Assumptions and Inferences

- A11: Transformers.js ext(texts[]) batched inference support needs verification during T005 — sequential fallback if not supported
- A15: T005 blocked by T004 (worker needs pool message protocol)
