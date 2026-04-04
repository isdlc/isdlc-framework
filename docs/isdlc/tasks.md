# Task Plan: build REQ-GH-223-tasks-as-user-contract

Generated: 2026-04-04T21:30:00Z
Workflow: build
Format: v3.0
Phases: 4

---

## Phase 05: Test Strategy -- COMPLETE

- [X]T001 Design test strategy for task-validator, task-reader changes, task-dispatcher extension, and config loading | traces: FR-001, FR-003, FR-004, FR-005
- [X]T002 Define test cases for traceability enforcement hook and traceability template rendering | traces: FR-006, FR-008

## Phase 06: Implementation -- COMPLETE

- [X]T003 Implement task-validator.js with validateTaskCoverage function | traces: FR-001
  files: src/core/tasks/task-validator.js (CREATE)
  blocked_by: []
  blocks: [T008, T010, T012]

- [X]T004 Remove 3e-plan from isdlc.md Phase-Loop Controller and update BUILD-INIT COPY to require tasks.md | traces: FR-002
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: []
  blocks: [T008]

- [X]T005 Extend task-reader.js with TNNN regex, parentId derivation, children array, formatTaskContext update, format v3.0 | traces: FR-003
  files: src/core/tasks/task-reader.js (MODIFY)
  blocked_by: []
  blocks: [T006, T007, T008, T014]

- [X]T006 Implement addSubTask in task-dispatcher.js with parent section lookup and suffix letter assignment | traces: FR-003
  files: src/core/tasks/task-dispatcher.js (MODIFY)
  blocked_by: [T005]
  blocks: [T007, T009, T013]

- [X]T007 Update markTaskComplete in task-dispatcher.js with sibling check and parent auto-completion | traces: FR-003
  files: src/core/tasks/task-dispatcher.js (MODIFY)
  blocked_by: [T005]
  blocks: [T009]

- [X]T008 Update Phase-Loop Controller STEP 2 to hydrate Claude TaskCreate from tasks.md via readTaskPlan | traces: FR-004
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T003, T004, T005]
  blocks: [T009]

- [X]T009 Implement show_subtasks_in_ui config reading, conditional TaskCreate for sub-tasks, one-time hint message | traces: FR-004, FR-005
  files: src/claude/commands/isdlc.md (MODIFY), .isdlc/config/config.json (CREATE)
  blocked_by: [T006, T007, T008]
  blocks: []

- [X]T010 Update roundtable-analyst.md to call validateTaskCoverage before PRESENTING_TASKS and use traceability template | traces: FR-001, FR-008
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T003]
  blocks: [T013]

- [X]T011 Create traceability.template.json with column definitions and domain scoping rules | traces: FR-008
  files: src/claude/hooks/config/templates/traceability.template.json (CREATE)
  blocked_by: []
  blocks: [T010, T013]

- [X]T012 Implement traceability-enforcer.cjs hook and register in pre-task-dispatcher chain | traces: FR-006
  files: src/claude/hooks/traceability-enforcer.cjs (CREATE), src/claude/hooks/dispatchers/pre-task-dispatcher.cjs (MODIFY)
  blocked_by: [T003]
  blocks: []

- [X]T013 Update agent specs 04, 05, 16 with Sub-Task Creation Protocol and add protocol to CLAUDE.md | traces: FR-003, FR-007
  files: src/claude/agents/04-test-design-engineer.md (MODIFY), src/claude/agents/05-software-developer.md (MODIFY), src/claude/agents/16-quality-loop-engineer.md (MODIFY), CLAUDE.md (MODIFY)
  blocked_by: [T006, T010, T011]
  blocks: [T014]

- [X]T014 Update tasks.template.json with TNNN ID format and TNNNABC sub-task syntax for format v3.0 | traces: FR-003, FR-008
  files: src/claude/hooks/config/templates/tasks.template.json (MODIFY)
  blocked_by: [T005, T013]
  blocks: []

## Phase 16: Quality Loop -- COMPLETE

- [X]T015 Run full test suite, lint, type checks; verify task-reader TNNN format tests; verify task-validator coverage checks | traces: FR-001, FR-003

## Phase 08: Code Review -- COMPLETE

- [X]T016 Constitutional review for Article I.5 compliance, dual-file sync, traceability coverage | traces: FR-007

---

## Dependency Graph

### Critical Path
T005 (task-reader) -> T006 (addSubTask) -> T009 (config integration)
T005 (task-reader) -> T006 (addSubTask) -> T013 (agent specs) -> T014 (template update)

### Parallel Opportunities
- Tier 0: T003, T004, T005, T011 (no blockers, can run concurrently)
- Tier 1: T006, T007, T008, T010, T012 (blocked by Tier 0)
- Tier 2: T009, T013 (blocked by Tier 1)
- Tier 3: T014 (blocked by Tier 2)

### Dependencies
- T006 (addSubTask) blocked by T005 (task-reader extension)
- T007 (markTaskComplete) blocked by T005 (task-reader extension)
- T008 (STEP 2 hydration) blocked by T003 (task-validator), T004 (3e-plan removal), T005 (task-reader)
- T009 (config) blocked by T006 (addSubTask), T007 (markTaskComplete), T008 (STEP 2)
- T010 (roundtable update) blocked by T003 (task-validator)
- T012 (enforcement hook) blocked by T003 (task-validator)
- T013 (agent specs) blocked by T006 (addSubTask), T010 (roundtable), T011 (template)
- T014 (tasks template) blocked by T005 (task-reader), T013 (agent specs)

## Traceability Matrix

### Requirement Coverage
| Requirement | Description | ACs | Tasks | Coverage |
|-------------|-------------|-----|-------|----------|
| FR-001 | Task Quality Gate | AC-001-01, AC-001-02 | T001, T003, T010 | 2/2 (100%) |
| FR-002 | Single-Generation Model | AC-002-01, AC-002-02 | T004 | 2/2 (100%) |
| FR-003 | Sub-Task Model | AC-003-01, AC-003-02, AC-003-03 | T005, T006, T007, T013, T014 | 3/3 (100%) |
| FR-004 | Claude Task Tool Bridge | AC-004-01, AC-004-02 | T008, T009 | 2/2 (100%) |
| FR-005 | Sub-Task Display Config | AC-005-01, AC-005-02, AC-005-03 | T009 | 3/3 (100%) |
| FR-006 | Traceability Enforcement Hook | AC-006-01 | T002, T012 | 1/1 (100%) |
| FR-007 | Constitution Article I.5 | AC-007-01 | T013, T016 | 1/1 (100%) |
| FR-008 | Human-Readable Traceability | AC-008-01, AC-008-02 | T002, T010, T011, T014 | 2/2 (100%) |

### Orphan Tasks (No Traceability)
(none)

### Uncovered Requirements
(none)

## Progress Summary

| Phase | Status | Tasks | Complete | Blocked |
|-------|--------|-------|----------|---------|
| 05 Test Strategy | PENDING | 2 | 0 | 0 |
| 06 Implementation | PENDING | 12 | 0 | 0 |
| 16 Quality Loop | PENDING | 1 | 0 | 0 |
| 08 Code Review | PENDING | 1 | 0 | 0 |
| **TOTAL** | | **16** | **0** | **0** |

**Progress**: 0 / 16 tasks (0%) | 0 blocked
**Traceability**: 8/8 FR covered (100%), 17/17 AC covered (100%)
