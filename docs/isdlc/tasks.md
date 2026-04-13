# Task Plan: REQ_GH_244 status-line-embedding-server

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05    | 1     | 1    | 0         |
| 06    | 12    | 12   | 0         |
| 16    | 1     | 0    | 1         |
| 08    | 1     | 0    | 1         |
| **Total** | **15** | **13** | **2** |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Design test strategy for all modules | traces: FR-001, FR-002, FR-003, FR-004
  files: docs/requirements/REQ-GH-244-status-line-embedding-server/test-strategy.md (CREATE)

## Phase 06: Implementation -- COMPLETE

- [X] T002 Implement VCS staleness abstraction with git and SVN dual-metric | traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04, AC-003-05, AC-003-07
  files: src/core/vcs/staleness.cjs (CREATE)
  blocks: [T003, T008]

- [X] T003 Implement health monitor with HTTP probe and VCS staleness and atomic file write | traces: FR-002, AC-002-01, AC-002-02, AC-002-04
  files: src/core/embedding/health-monitor.cjs (CREATE)
  blocked_by: [T002]
  blocks: [T005, T006, T009, T012]

- [X] T004 Add generatedAtCommit to emb manifest and builder | traces: FR-003, AC-003-06
  files: lib/embedding/package/manifest.js (MODIFY), lib/embedding/package/builder.js (MODIFY)
  blocks: [T011]

- [X] T005 Implement Claude status line script with two-tier refresh | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04, AC-001-05, AC-001-06, AC-001-07, AC-001-08, AC-001-09
  files: src/providers/claude/embedding-statusline.cjs (CREATE)
  blocked_by: [T003]
  blocks: [T010, T012]

- [X] T006 Extend Codex projection for EMBEDDING_STATUS injection | traces: FR-001, AC-001-10
  files: src/providers/codex/projection.js (MODIFY)
  blocked_by: [T003]

- [X] T007 Register status line in settings.json and add config schema | traces: FR-001, AC-001-08, AC-002-03
  files: src/claude/settings.json (MODIFY)

- [X] T008 Unit tests for VCS staleness git and SVN and no-VCS | traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04, AC-003-05, AC-003-07
  files: src/core/vcs/staleness.test.cjs (CREATE)
  blocked_by: [T002]

- [X] T009 Unit tests for health monitor all states and transitions | traces: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-002-05
  files: src/core/embedding/health-monitor.test.cjs (CREATE)
  blocked_by: [T003]

- [X] T010 Unit tests for status line script format and config | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04, AC-001-05, AC-001-06, AC-001-07, AC-001-08, AC-001-09
  files: src/providers/claude/embedding-statusline.test.cjs (CREATE)
  blocked_by: [T005]

- [X] T011 Unit tests for manifest generatedAtCommit | traces: FR-003, AC-003-06
  files: lib/embedding/package/manifest.test.js (MODIFY)
  blocked_by: [T004]

- [X] T012 Integration tests end-to-end status line flow | traces: FR-001, FR-002, FR-003
  files: tests/integration/embedding-statusline.test.cjs (CREATE)
  blocked_by: [T003, T005]

- [X] T013 Fail-open integration tests for all error paths | traces: FR-004, AC-004-01, AC-004-02, AC-004-03
  files: tests/integration/embedding-statusline-failopen.test.cjs (CREATE)
  blocked_by: [T002, T003, T005]

## Phase 16: Quality Loop -- PENDING

- [ ] T014 Run full test suite and verify coverage | traces: FR-001, FR-002, FR-003, FR-004
  blocked_by: [T008, T009, T010, T011, T012, T013]

## Phase 08: Code Review -- PENDING

- [ ] T015 Constitutional review and dual-file check | traces: FR-004
  blocked_by: [T014]

## Dependency Graph

Critical path: T002 → T003 → T005 → T010 → T014 → T015

```
T002 ──→ T003 ──→ T005 ──→ T010 ──→ T014 ──→ T015
  │         │        │                  ↑
  └→ T008   │        └──→ T012 ────────┤
            │        └──→ T013 ────────┤
            └──→ T006                  │
            └──→ T009 ─────────────────┤
                                       │
T004 ──→ T011 ─────────────────────────┘
T007 (independent)
```

Parallel tracks:
- Track A (critical): T002 → T003 → T005 → T010
- Track B (manifest): T004 → T011
- Track C (config): T007
- Track D (Codex): T003 → T006
- Track E (integration): T003 + T005 → T012, T013

## Traceability Matrix

| FR | AC | Tasks |
|----|-----|-------|
| FR-001 | AC-001-01 | T005, T010 |
| FR-001 | AC-001-02 | T005, T010 |
| FR-001 | AC-001-03 | T005, T010 |
| FR-001 | AC-001-04 | T005, T010 |
| FR-001 | AC-001-05 | T005, T010 |
| FR-001 | AC-001-06 | T005, T010 |
| FR-001 | AC-001-07 | T005, T010 |
| FR-001 | AC-001-08 | T007, T010 |
| FR-001 | AC-001-09 | T005, T010 |
| FR-001 | AC-001-10 | T006 |
| FR-002 | AC-002-01 | T003, T009 |
| FR-002 | AC-002-02 | T003, T009 |
| FR-002 | AC-002-03 | T007, T009 |
| FR-002 | AC-002-04 | T003, T009, T013 |
| FR-002 | AC-002-05 | T009 |
| FR-003 | AC-003-01 | T002, T008 |
| FR-003 | AC-003-02 | T002, T008 |
| FR-003 | AC-003-03 | T002, T008 |
| FR-003 | AC-003-04 | T002, T008 |
| FR-003 | AC-003-05 | T002, T008, T013 |
| FR-003 | AC-003-06 | T004, T011 |
| FR-003 | AC-003-07 | T002, T008 |
| FR-004 | AC-004-01 | T013 |
| FR-004 | AC-004-02 | T013 |
| FR-004 | AC-004-03 | T013 |

## Assumptions and Inferences

- Loading state detected via generation lock marker set by isdlc-embedding generate CLI
- settings.json status line config key to be verified from Claude Code docs
- git diff --name-only counts staged and unstaged changes against generation commit
