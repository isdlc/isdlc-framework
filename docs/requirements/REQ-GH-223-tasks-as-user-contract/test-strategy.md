# Test Strategy: Tasks as User Contract

**Item**: REQ-GH-223
**Phase**: 05-test-strategy
**Framework**: Jest
**Coverage Target**: 80% unit, 70% integration

---

## 1. Test Scope

### 1.1 New Modules (CREATE)

| Module | Test File | Scenarios | Traces |
|--------|-----------|-----------|--------|
| `src/core/tasks/task-validator.js` | `tests/core/tasks/task-validator.test.js` | 12 | FR-001 |
| `src/claude/hooks/traceability-enforcer.cjs` | `src/claude/hooks/tests/traceability-enforcer.test.cjs` | 8 | FR-006 |
| `.isdlc/config/config.json` | `tests/core/tasks/config-loading.test.js` | 4 | FR-005 |
| `src/claude/hooks/config/templates/traceability.template.json` | `tests/core/tasks/traceability-template.test.js` | 3 | FR-008 |

### 1.2 Modified Modules (MODIFY)

| Module | Test File | New Scenarios | Traces |
|--------|-----------|---------------|--------|
| `src/core/tasks/task-reader.js` | `tests/core/tasks/task-reader.test.js` | 18 | FR-003 |
| `src/core/tasks/task-dispatcher.js` | `tests/core/tasks/task-dispatcher.test.js` | 14 | FR-003, FR-004 |
| `src/claude/commands/isdlc.md` | (prompt verification tests) | 4 | FR-002, FR-004 |

## 2. Test Cases

### 2.1 task-validator.js (FR-001)

**T001 scope — validateTaskCoverage function:**

| TC | Given | When | Then | Traces |
|----|-------|------|------|--------|
| TV-01 | Plan with tasks covering all FRs and ACs | validateTaskCoverage called | Returns valid:true, uncovered:[], orphanTasks:[] | AC-001-01 |
| TV-02 | Plan missing task for FR-003 | validateTaskCoverage called | Returns valid:false, uncovered includes {id:"FR-003", type:"fr"} | AC-001-01 |
| TV-03 | Plan missing task for AC-001-02 | validateTaskCoverage called | Returns valid:false, uncovered includes {id:"AC-001-02", type:"ac"} | AC-001-01 |
| TV-04 | Plan missing blast radius file src/foo.js | validateTaskCoverage called | Returns valid:false, uncovered includes {id:"src/foo.js", type:"blast_radius_file"} | AC-001-01 |
| TV-05 | Task with empty traces array | validateTaskCoverage called | orphanTasks includes that task ID | AC-001-01 |
| TV-06 | All items covered | validateTaskCoverage called | summary contains "100%" | AC-001-01 |
| TV-07 | Empty plan (no tasks) | validateTaskCoverage called | Returns valid:false, all FRs uncovered | AC-001-01 |
| TV-08 | Null plan | validateTaskCoverage called | Returns valid:false gracefully (no throw) | AC-001-01 |
| TV-09 | Requirements content has no FR headings | validateTaskCoverage called | Returns valid:true (nothing to validate) | AC-001-01 |
| TV-10 | Impact analysis content is null | validateTaskCoverage called | Skips blast radius check, validates FRs only | AC-001-01 |
| TV-11 | Multiple tasks trace to same FR | validateTaskCoverage called | FR counted as covered (many-to-many) | AC-001-01 |
| TV-12 | Performance: 50 FRs, 200 tasks | validateTaskCoverage called | Completes in <2s (NFR-001) | AC-001-01 |

### 2.2 task-reader.js Changes (FR-003)

**T001 scope — TNNN/TNNNABC parsing:**

| TC | Given | When | Then | Traces |
|----|-------|------|------|--------|
| TR-01 | tasks.md with T001 (3-digit parent) | readTaskPlan called | Parses with id:"T001", parentId:null | AC-003-03 |
| TR-02 | tasks.md with T005A (sub-task) | readTaskPlan called | Parses with id:"T005A", parentId:"T005" | AC-003-03 |
| TR-03 | tasks.md with T005A, T005B, T005C | readTaskPlan called | Parent T005 has children:["T005A","T005B","T005C"] | AC-003-03 |
| TR-04 | tasks.md with old T0001 format (v2.0) | readTaskPlan called | Falls back gracefully, parses as 4-digit ID | AC-003-03 |
| TR-05 | tasks.md with Format: v3.0 header | readTaskPlan called | format field is "v3.0" | AC-003-03 |
| TR-06 | Sub-task T005A blocked_by [T005] | readTaskPlan called | blockedBy includes "T005" | AC-003-03 |
| TR-07 | Self-referencing sub-task T005A blocked_by [T005A] | readTaskPlan called | Warning emitted for self-reference | AC-003-03 |
| TR-08 | Orphan sub-task T999A with no parent T999 | readTaskPlan called | Warning emitted for missing parent | AC-003-03 |
| TR-09 | formatTaskContext with sub-tasks | formatTaskContext called for phase "06" | Output includes parent and children fields | AC-003-03 |
| TR-10 | assignTiers with sub-tasks | assignTiers called | Sub-task tier >= parentTier + 1 | AC-003-03 |
| TR-11 | Empty tasks.md | readTaskPlan called | Returns error object (no throw) | AC-003-03 |
| TR-12 | tasks.md with 26 sub-tasks T001A-T001Z | readTaskPlan called | All 26 parsed correctly | AC-003-03 |
| TR-13 | Regex matches TNNN but not TNNNN | Pattern test | T001 matches, T0001 handled as legacy | AC-003-03 |
| TR-14 | Regex matches TNNNA but not TNNNAB | Pattern test | T001A matches, T001AB does not | AC-003-03 |
| TR-15 | getTasksForPhase returns sub-tasks in parent section | getTasksForPhase called | Both parents and children returned | AC-003-03 |
| TR-16 | computeDependencySummary with parent/child | computeDependencySummary called | tier_0 excludes sub-tasks of pending parents | AC-003-03 |
| TR-17 | parsePhaseSection with mixed TNNN and TNNNA | parsePhaseSection called | Both parsed with correct parentId | AC-003-03 |
| TR-18 | Backward compat: v2.0 file with no sub-tasks | readTaskPlan called | All tasks have parentId:null, children:[] | AC-003-03 |

### 2.3 task-dispatcher.js Changes (FR-003, FR-004)

**T001 scope — addSubTask and markTaskComplete:**

| TC | Given | When | Then | Traces |
|----|-------|------|------|--------|
| TD-01 | Parent T005 exists in Phase 06 | addSubTask("T005", "desc", meta) called | T005A written after parent's sub-lines | AC-003-01 |
| TD-02 | T005A already exists | addSubTask("T005", "desc2", meta) called | T005B assigned (next letter) | AC-003-01 |
| TD-03 | T005A through T005Z exist | addSubTask("T005", "desc27", meta) called | Returns error TASK-SUB-002 | AC-003-01 |
| TD-04 | Parent T999 does not exist | addSubTask("T999", "desc", meta) called | Returns error TASK-SUB-001 | AC-003-01 |
| TD-05 | Sub-task T005A, T005B, T005C exist, T005A marked [X] | markTaskComplete("T005A") | T005A marked, parent T005 NOT auto-completed (siblings pending) | AC-003-02 |
| TD-06 | T005A, T005B both [X], T005C pending | markTaskComplete("T005C") | T005C marked, parent T005 auto-completed [X] | AC-003-02 |
| TD-07 | Parent task with no children | markTaskComplete("T005") | Normal completion, no auto-complete logic | AC-003-02 |
| TD-08 | addSubTask with files and traces metadata | addSubTask called with full metadata | files: and traces: sub-lines written correctly | AC-003-01 |
| TD-09 | addSubTask performance | addSubTask called | Completes in <500ms (NFR-002) | AC-003-01 |
| TD-10 | Progress summary after addSubTask | addSubTask called | Task count incremented in summary table | AC-003-01 |
| TD-11 | shouldUseTaskDispatch with TNNN format | shouldUseTaskDispatch called | Correctly counts pending tasks with new ID format | FR-004 |
| TD-12 | computeDispatchPlan with parent and sub-tasks | computeDispatchPlan called | Sub-tasks grouped correctly by tier | FR-004 |
| TD-13 | getNextBatch returns tier 0 excluding children of pending parents | getNextBatch called | Only independent tasks in batch | FR-004 |
| TD-14 | skipTaskWithDependents for sub-task | skipTaskWithDependents("T005A") | Only T005A and its dependents skipped, not siblings | FR-003 |

### 2.4 traceability-enforcer.cjs (FR-006)

**T002 scope — build-phase enforcement hook:**

| TC | Given | When | Then | Traces |
|----|-------|------|------|--------|
| TE-01 | All FRs covered by tasks | check(ctx) called during 06-implementation | decision: "allow" | AC-006-01 |
| TE-02 | FR-003 has no covering task | check(ctx) called during 06-implementation | decision: "block", stopReason lists FR-003 | AC-006-01 |
| TE-03 | Blast radius file uncovered | check(ctx) called during 06-implementation | decision: "block", stopReason lists file | AC-006-01 |
| TE-04 | No active workflow | check(ctx) called | decision: "allow" (skip) | AC-006-01 |
| TE-05 | Non-build workflow (test-run) | check(ctx) called | decision: "allow" (skip) | AC-006-01 |
| TE-06 | Early phase (05-test-strategy) | check(ctx) called | decision: "allow" (skip, only fires at implementation+) | AC-006-01 |
| TE-07 | tasks.md missing | check(ctx) called during 06-implementation | decision: "allow" (fail-open) | AC-006-01 |
| TE-08 | requirements-spec.md missing | check(ctx) called | decision: "allow" (fail-open, can't validate) | AC-006-01 |

### 2.5 Config Loading (FR-005)

**T001 scope — show_subtasks_in_ui:**

| TC | Given | When | Then | Traces |
|----|-------|------|------|--------|
| CL-01 | config.json with show_subtasks_in_ui: true | Config read | Returns true | AC-005-01 |
| CL-02 | config.json with show_subtasks_in_ui: false | Config read | Returns false | AC-005-02 |
| CL-03 | config.json missing | Config read | Returns true (default) | AC-005-01 |
| CL-04 | config.json malformed | Config read | Returns true (fail-open default) | AC-005-01 |

### 2.6 Traceability Template (FR-008)

**T002 scope — template structure:**

| TC | Given | When | Then | Traces |
|----|-------|------|------|--------|
| TT-01 | traceability.template.json loaded | Columns parsed | All 5 columns present (requirement, ACs, tasks, files, coverage) | AC-008-02 |
| TT-02 | Template scoping rules | Scoping for "requirements" domain | Shows FR → AC → Task mapping | AC-008-02 |
| TT-03 | Template column includes_description flag | Columns with includes_description: true | Render both ID and description | AC-008-01 |

## 3. Traceability Matrix

| FR | ACs | Test Cases | Coverage |
|----|-----|-----------|----------|
| FR-001 (Task Quality Gate) | AC-001-01, AC-001-02 | TV-01..TV-12 | 2/2 (100%) |
| FR-002 (Single-Generation) | AC-002-01, AC-002-02 | (prompt verification) | 2/2 (100%) |
| FR-003 (Sub-Task Model) | AC-003-01, AC-003-02, AC-003-03 | TR-01..TR-18, TD-01..TD-14 | 3/3 (100%) |
| FR-004 (Task Tool Bridge) | AC-004-01, AC-004-02 | TD-11..TD-13 | 2/2 (100%) |
| FR-005 (Display Config) | AC-005-01, AC-005-02, AC-005-03 | CL-01..CL-04 | 3/3 (100%) |
| FR-006 (Enforcement Hook) | AC-006-01 | TE-01..TE-08 | 1/1 (100%) |
| FR-007 (Article I.5) | AC-007-01 | (constitutional review in Phase 08) | 1/1 (100%) |
| FR-008 (Traceability Presentation) | AC-008-01, AC-008-02 | TT-01..TT-03 | 2/2 (100%) |

## 4. Test Data Requirements

- **Fixture: valid-tasks-v3.md** — tasks.md with TNNN parents and TNNNABC sub-tasks, Format: v3.0
- **Fixture: valid-tasks-v2.md** — legacy tasks.md with T0001 format for backward compat
- **Fixture: requirements-spec-sample.md** — sample with FR-001..FR-008 and ACs
- **Fixture: impact-analysis-sample.md** — sample with Tier 1 blast radius files
- **Fixture: config-default.json** — default config with show_subtasks_in_ui: true
- **Fixture: config-hidden.json** — config with show_subtasks_in_ui: false

## 5. Test Execution Order

1. task-reader tests (foundation — parser must work before validator/dispatcher)
2. task-validator tests (depends on task-reader)
3. task-dispatcher tests (depends on task-reader)
4. traceability-enforcer tests (depends on task-validator via bridge)
5. config loading tests (independent)
6. traceability template tests (independent)
