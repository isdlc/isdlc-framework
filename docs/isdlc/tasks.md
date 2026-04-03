# Task Plan: REQ-GH-220 task-level-delegation-in-phase-loop-controller

## Progress Summary

| Phase | Total | Done | Status |
|-------|-------|------|--------|
| 05    | 3     | 0    | PENDING |
| 06    | 9     | 0    | PENDING |
| 16    | 2     | 0    | PENDING |
| 08    | 2     | 0    | PENDING |
| **Total** | **16** | **0** | **0%** |

## Phase 05: Test Strategy -- PENDING

- [ ] T0001 Design test cases for task-dispatcher.js core functions (getNextBatch, markTaskComplete, handleTaskFailure, tier computation) | traces: FR-001, FR-003, FR-007, AC-001-01, AC-001-02, AC-001-03, AC-001-04, AC-003-01, AC-003-02, AC-003-03, AC-007-01, AC-007-02, AC-007-03, AC-007-04
  files: tests/core/tasks/task-dispatcher.test.js (CREATE)

- [ ] T0002 Design test cases for Phase-Loop Controller step 3d-tasks integration (phase mode detection, tier dispatch, completion tracking) | traces: FR-001, FR-004, FR-008, AC-004-01, AC-004-02, AC-004-03, AC-004-04, AC-008-01, AC-008-02, AC-008-03
  files: tests/prompt-verification/task-level-dispatch.test.js (CREATE)

- [ ] T0003 Design test cases for test-generate scaffold-to-tasks derivation | traces: FR-006, AC-006-01, AC-006-02, AC-006-03
  files: tests/prompt-verification/test-generate-scaffold-tasks.test.js (CREATE)

## Phase 06: Implementation -- PENDING

- [ ] T0004 Create task-dispatcher.js core module: computeDispatchPlan, getNextBatch, markTaskComplete, handleTaskFailure, skipTaskWithDependents, shouldUseTaskDispatch | traces: FR-001, FR-003, FR-007, AC-001-01, AC-001-02, AC-001-03, AC-001-04, AC-003-01, AC-003-02, AC-003-03, AC-007-01, AC-007-02, AC-007-03, AC-007-04
  files: src/core/tasks/task-dispatcher.js (CREATE), src/core/tasks/task-reader.js (MODIFY)
  blocks: [T0005, T0006, T0007]

- [ ] T0005 Add task_dispatch config block to workflows.json | traces: FR-004, AC-004-01, AC-004-02, AC-004-03
  files: src/isdlc/config/workflows.json (MODIFY)
  blocked_by: [T0004]
  blocks: [T0007]

- [ ] T0006 Create Codex task-dispatch adapter | traces: FR-001, FR-004, AC-001-03, AC-004-01
  files: src/providers/codex/task-dispatch.js (CREATE)
  blocked_by: [T0004]

- [ ] T0007 Modify isdlc.md step 3d: add conditional for task-dispatch phases, implement step 3d-tasks protocol, per-task prompt builder, tier-parallel dispatch via Task tool | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, AC-001-01, AC-001-02, AC-001-03, AC-001-04, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-003-01, AC-003-02, AC-003-03, AC-004-01, AC-004-02, AC-004-03, AC-004-04, AC-005-01, AC-005-02, AC-005-03, AC-007-01, AC-007-02, AC-007-03, AC-007-04, AC-008-01, AC-008-02, AC-008-03
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0004, T0005]
  blocks: [T0008, T0009, T0010]

- [ ] T0008 Modify test-generate handler: add scaffold-to-tasks derivation in Phase 05 | traces: FR-006, AC-006-01, AC-006-02, AC-006-03
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0007]

- [ ] T0009 Add mechanical mode fallback note to software-developer.md | traces: FR-004, AC-004-04
  files: src/claude/agents/05-software-developer.md (MODIFY)
  blocked_by: [T0007]

- [ ] T0010 Write unit tests for task-dispatcher.js and prompt-verification tests for isdlc.md changes | traces: FR-001, FR-003, FR-004, FR-006, FR-007, FR-008
  files: tests/core/tasks/task-dispatcher.test.js (MODIFY), tests/prompt-verification/task-level-dispatch.test.js (MODIFY), tests/prompt-verification/test-generate-scaffold-tasks.test.js (MODIFY)
  blocked_by: [T0007, T0008]
  blocks: [T0011]

- [ ] T0011 Copy updated workflows.json to .isdlc/config/ (dogfooding dual-file — NOT symlinked) | traces: FR-004
  files: .isdlc/config/workflows.json (MODIFY)
  blocked_by: [T0010]

- [ ] T0012 Update CLAUDE.md TASK_CONTEXT injection section to reference task-level dispatch | traces: FR-002
  files: CLAUDE.md (MODIFY)
  blocked_by: [T0007]

## Phase 16: Quality Loop -- PENDING

- [ ] T0013 Run full test suite, verify task-dispatcher.js tests pass, verify no regressions in existing Phase-Loop Controller and task-reader tests | traces: FR-001, FR-003, FR-004, FR-006, FR-007, FR-008
  blocked_by: [T0012]
  blocks: [T0014]

- [ ] T0014 Verify dual-file consistency: .isdlc/config/workflows.json matches src/isdlc/config/workflows.json | traces: FR-004
  blocked_by: [T0013]

## Phase 08: Code Review -- PENDING

- [ ] T0015 Constitutional review: Article I (spec primacy), Article V (simplicity — core+adapter split justified), Article IX (gate integrity — task failures dont bypass gates), Article X (fail-safe — task retry + skip propagation), Article XII (cross-platform — Claude + Codex) | traces: FR-001, FR-003, FR-004, FR-006, FR-007, FR-008
  blocked_by: [T0014]

- [ ] T0016 Verify all ACs covered: trace each AC through test cases (T0001-T0003), implementation tasks (T0004-T0012), and dual-provider support (T0006 Codex, T0007 Claude) | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
  blocked_by: [T0014]

## Dependency Graph

                T0004
              /   |   \
          T0005  T0006  |
            |           |
            +---> T0007 <+
              /  |   \   \
          T0008 T0009 T0010 T0012
                       |
                     T0011
                       |
                     T0013
                       |
                     T0014
                     /    \
                 T0015   T0016

Critical path: T0004 -> T0005 -> T0007 -> T0010 -> T0011 -> T0013 -> T0014 -> T0015 (8 tasks)

## Traceability Matrix

| FR | ACs | Test Tasks (05) | Impl Tasks (06) | QA Tasks (08) |
|----|-----|-----------------|------------------|---------------|
| FR-001 | AC-001-01 thru AC-001-04 | T0001, T0002 | T0004, T0007, T0010 | T0016 |
| FR-002 | AC-002-01 thru AC-002-04 | T0002 | T0007, T0012 | T0016 |
| FR-003 | AC-003-01 thru AC-003-03 | T0001 | T0004, T0007, T0010 | T0016 |
| FR-004 | AC-004-01 thru AC-004-04 | T0002 | T0005, T0007, T0009, T0011 | T0015, T0016 |
| FR-005 | AC-005-01 thru AC-005-03 | T0002 | T0007 | T0016 |
| FR-006 | AC-006-01 thru AC-006-03 | T0003 | T0008, T0010 | T0016 |
| FR-007 | AC-007-01 thru AC-007-04 | T0001 | T0004, T0007, T0010 | T0015, T0016 |
| FR-008 | AC-008-01 thru AC-008-03 | T0002 | T0007, T0010 | T0016 |
