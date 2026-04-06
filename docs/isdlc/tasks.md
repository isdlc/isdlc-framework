# Task Plan: REQ-GH-217

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05-test-strategy | 1 | 1 | 0 |
| 06-implementation | 5 | 5 | 0 |
| post-build | 1 | 0 | 1 |
| **Total** | **7** | **6** | **1** |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 design-test-cases-for-task-formatter | traces: FR-003, AC-003-01
  files: tests/core/tasks/task-formatter.test.js (NEW)

## Phase 06: Implementation -- COMPLETE

- [X] T002 update-step-3d-main-tasks-only | traces: FR-001, AC-001-01, AC-001-02
  files: src/claude/commands/isdlc.md (MODIFY)

- [X] T003 remove-tier-cleanup-step-3d-f | traces: FR-002, AC-002-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T002]

- [X] T004 create-task-formatter | traces: FR-003, AC-003-01
  files: src/core/tasks/task-formatter.js (NEW)

- [X] T005 wire-summary-and-cleanup-into-step-3f | traces: FR-002, FR-003, AC-002-02, AC-003-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T003, T004]

- [X] T006 write-unit-tests-for-formatter | traces: FR-003, AC-003-01
  files: tests/core/tasks/task-formatter.test.js (NEW)
  blocked_by: [T004]

## Post-Build -- PENDING

- [ ] T007 file-upstream-stable-ordering-issue | traces: FR-004, AC-004-01

## Dependency Graph

```
T002 → T003 → T005
T004 → T005
T004 → T006
T007 (independent)
```

Critical path: T002 → T003 → T005

## Traceability Matrix

| Task | FR | AC | Files |
|------|----|----|-------|
| T001 | FR-003 | AC-003-01 | tests/core/tasks/task-formatter.test.js |
| T002 | FR-001 | AC-001-01, AC-001-02 | src/claude/commands/isdlc.md |
| T003 | FR-002 | AC-002-01 | src/claude/commands/isdlc.md |
| T004 | FR-003 | AC-003-01 | src/core/tasks/task-formatter.js |
| T005 | FR-002, FR-003 | AC-002-02, AC-003-01 | src/claude/commands/isdlc.md |
| T006 | FR-003 | AC-003-01 | tests/core/tasks/task-formatter.test.js |
| T007 | FR-004 | AC-004-01 | (none) |
