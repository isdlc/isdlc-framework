# Task Plan: REQ_GH_252 smooth-embeddings-ux

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05    | 1     | 0    | 1         |
| 06    | 15    | 0    | 15        |
| 16    | 2     | 0    | 2         |
| 08    | 1     | 0    | 1         |
| **Total** | **19** | **0** | **19** |

## Phase 05: Test Strategy -- PENDING

- [ ] T001 Design test strategy for all new and modified modules | traces: FR-001, FR-002, FR-003
  files: docs/requirements/REQ-GH-252-smooth-embeddings-ux/test-strategy.md (CREATE)

## Phase 06: Implementation -- PENDING

- [ ] T002 Create core embedding directory structure | traces: FR-002
  files: src/core/embedding/ (CREATE)
  blocks: [T003]

- [ ] T003 Implement query-classifier with lexical heuristic | traces: FR-002, AC-002-01, AC-002-02
  files: src/core/embedding/query-classifier.cjs (CREATE)
  blocked_by: [T002]
  blocks: [T007, T008, T010, T015]

- [ ] T004 Implement health-probe with PID liveness check | traces: FR-002, AC-002-03, AC-002-05
  files: lib/embedding/server/health-probe.cjs (CREATE)
  blocks: [T008, T011]

- [ ] T005 Implement CLI preflight validation and exit codes | traces: FR-001, AC-001-01, AC-001-02
  files: bin/isdlc-embedding.js (MODIFY)
  blocks: [T006, T013, T014]

- [ ] T006 Implement post-generation verification | traces: FR-001, AC-001-01, AC-001-03
  files: bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T005]
  blocks: [T013, T014]

- [ ] T007 Extend inferEnvironmentRules for isdlc-embedding MCP | traces: FR-002, AC-002-01
  files: src/claude/hooks/tool-router.cjs (MODIFY)
  blocked_by: [T003]
  blocks: [T008, T009, T012]

- [ ] T008 Add literal_pattern and server_unavailable exemptions | traces: FR-002, AC-002-02, AC-002-03
  files: src/claude/hooks/tool-router.cjs (MODIFY)
  blocked_by: [T003, T004, T007]
  blocks: [T009, T012]

- [ ] T009 Update formatWarnMessage for semantic and lexical messages | traces: FR-002, AC-002-04
  files: src/claude/hooks/tool-router.cjs (MODIFY)
  blocked_by: [T007, T008]
  blocks: [T012]

- [ ] T010 Unit tests for query-classifier | traces: FR-002, AC-002-01, AC-002-02
  files: src/core/embedding/query-classifier.test.cjs (CREATE)
  blocked_by: [T003]

- [ ] T011 Unit tests for health-probe | traces: FR-002, AC-002-03, AC-002-05
  files: lib/embedding/server/health-probe.test.cjs (CREATE)
  blocked_by: [T004]

- [ ] T012 Unit tests for tool-router semantic routing | traces: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04
  files: src/claude/hooks/tests/test-tool-router-semantic.test.cjs (CREATE)
  blocked_by: [T007, T008, T009]

- [ ] T013 Unit tests for CLI preflight and post-verify | traces: FR-001, AC-001-01, AC-001-02, AC-001-03
  files: tests/bin/isdlc-embedding-preflight.test.js (CREATE)
  blocked_by: [T005, T006]

- [ ] T014 Update discover-orchestrator Step 7.9 for exit codes and banner | traces: FR-001, AC-001-03, AC-001-04
  files: src/claude/agents/discover-orchestrator.md (MODIFY)
  blocked_by: [T005, T006]

- [ ] T015 Update Codex projection for semantic search instruction | traces: FR-002, AC-002-01
  files: src/providers/codex/ (MODIFY)
  blocked_by: [T003]

- [ ] T016 Fail-open integration test scenarios | traces: FR-003, AC-003-01, AC-003-02, AC-003-03
  files: tests/integration/embedding-fail-open.test.js (CREATE)
  blocked_by: [T005, T004, T007]

## Phase 16: Quality Loop -- PENDING

- [ ] T017 Run full test suite and verify coverage | traces: FR-001, FR-002, FR-003
  blocked_by: [T010, T011, T012, T013, T016]

- [ ] T018 Parity verification Claude and Codex routing | traces: FR-002
  blocked_by: [T015, T017]

## Phase 08: Code Review -- PENDING

- [ ] T019 Constitutional review and dual-file check | traces: FR-003
  blocked_by: [T017, T018]

## Dependency Graph

Critical path: T002 → T003 → T007 → T008 → T009 → T012 → T017 → T018 → T019

```
T002 ──→ T003 ──→ T007 ──→ T008 ──→ T009 ──→ T012 ──→ T017 ──→ T018 ──→ T019
              │         │                              ↑
              ├──→ T010 │                              │
              └──→ T015 ├──→ T011 ←── T004             │
                        │                              │
T005 ──→ T006 ──→ T013 ├──→ T016 ─────────────────────┘
              └──→ T014 │
```

Parallel tracks:
- Track A (FR-001 CLI): T005 → T006 → T013, T014
- Track B (FR-002 health): T004 → T011
- Track C (FR-002 routing): T002 → T003 → T007 → T008 → T009 → T012
- Track D (Codex): T003 → T015

## Traceability Matrix

| FR | AC | Tasks |
|----|-----|-------|
| FR-001 | AC-001-01 | T005, T006, T013 |
| FR-001 | AC-001-02 | T005, T013 |
| FR-001 | AC-001-03 | T006, T013, T014 |
| FR-001 | AC-001-04 | T014 |
| FR-002 | AC-002-01 | T003, T007, T010, T012, T015 |
| FR-002 | AC-002-02 | T003, T008, T010, T012 |
| FR-002 | AC-002-03 | T004, T008, T011, T012 |
| FR-002 | AC-002-04 | T009, T012 |
| FR-002 | AC-002-05 | T004, T011 |
| FR-003 | AC-003-01 | T005, T016 |
| FR-003 | AC-003-02 | T004, T016 |
| FR-003 | AC-003-03 | T016 |

## Assumptions and Inferences

- PID-based health probe (T004) is sufficient for routing; full HTTP check deferred to #244
- Query classifier (T003) heuristic has edge cases; user overrides via tool-routing.json are the escape hatch
- Codex projection update (T015) is a single instruction injection — minimal effort
- Discover-orchestrator.md changes (T014) apply to both providers since discover runs as agent prompt
