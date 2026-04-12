# Task Plan: BUG GH-241-embedding-server-auto-start-false-success

## Progress Summary

| Phase | Total | Done | Status |
|-------|-------|------|--------|
| 05 | 1 | 0 | PENDING |
| 06 | 3 | 0 | PENDING |
| 16 | 1 | 0 | PENDING |
| 08 | 1 | 0 | PENDING |

## Phase 05: Test Strategy -- PENDING

- [ ] T001 Design test strategy for GH-241 fixes | traces: AC-1, AC-2, AC-3, AC-4, AC-5

## Phase 06: Implementation -- PENDING

- [ ] T002 Defer PID file write and add child aliveness check in startServer | traces: AC-1, AC-2, AC-3, AC-4
  files: lib/embedding/server/lifecycle.js (MODIFY)

- [ ] T003 Add reload verification after POST /reload in postReload | traces: AC-5
  files: src/core/finalize/refresh-code-embeddings.js (MODIFY)

- [ ] T004 Write tests for PID aliveness, foreign port, and reload verification | traces: AC-1, AC-2, AC-3, AC-4, AC-5
  files: lib/embedding/server/lifecycle.test.js (MODIFY), src/core/finalize/refresh-code-embeddings.test.js (MODIFY)
  blocked_by: [T002, T003]

## Phase 16: Quality Loop -- PENDING

- [ ] T005 Run quality loop for all changes | traces: AC-1, AC-2, AC-3, AC-4, AC-5

## Phase 08: Code Review -- PENDING

- [ ] T006 Code review and QA for GH-241 | traces: AC-1, AC-2, AC-3, AC-4, AC-5

## Dependency Graph

```
T002 (PID defer + aliveness) ──┐
T003 (reload verification) ────┤── T004 (tests)
```

## Traceability Matrix

| AC | Tasks | Coverage |
|----|-------|----------|
| AC-1 | T002, T004 | Full |
| AC-2 | T002, T004 | Full |
| AC-3 | T002, T004 | Full |
| AC-4 | T002, T004 | Full |
| AC-5 | T003, T004 | Full |
