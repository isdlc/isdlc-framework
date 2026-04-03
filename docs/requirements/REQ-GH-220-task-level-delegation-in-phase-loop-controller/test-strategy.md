# Test Strategy: GH-220 Task-Level Delegation

**Slug**: REQ-GH-220-task-level-delegation-in-phase-loop-controller
**Phase**: 05 - Test Strategy
**Version**: 1.0.0

---

## 1. Test Approach

This feature has two layers:
1. **Core JS module** (`task-dispatcher.js`) — testable with unit tests (import functions, assert results)
2. **Prompt-level changes** (`isdlc.md`, `workflows.json`, `software-developer.md`) — testable with prompt-verification tests (read files, assert content patterns)

### Test Pyramid

| Layer | Count | What it validates |
|-------|-------|-------------------|
| Unit tests (task-dispatcher.js) | 14 | Core algorithm: tier computation, batch dispatch, completion tracking, failure handling, skip propagation |
| Prompt-verification (isdlc.md) | 6 | Step 3d-tasks protocol, phase mode detection, test-generate scaffold derivation |
| Prompt-verification (config) | 3 | workflows.json task_dispatch block, software-developer fallback note |
| **Total** | **23** | |

### Test Framework

- **node:test** (existing project convention for core modules)
- Fixtures in `tests/core/tasks/fixtures/` (reuse existing task-reader fixtures where applicable)

---

## 2. Test Cases

### 2.1 Task Dispatcher Core (T0001)

**Test file**: `tests/core/tasks/task-dispatcher.test.js`

#### TD-01: computeDispatchPlan returns tiers for a phase with tasks
- **Traces**: FR-001, AC-001-01, AC-001-02
- **Given** a tasks.md with Phase 06 tasks having blocked_by dependencies
- **When** computeDispatchPlan is called with phaseKey "06"
- **Then** it returns tiers array where tier 0 has tasks with no blockers, tier 1 has tasks blocked by tier 0, etc.

#### TD-02: computeDispatchPlan returns null for nonexistent file
- **Traces**: FR-001, AC-001-01
- **Given** tasksPath points to a nonexistent file
- **When** computeDispatchPlan is called
- **Then** it returns null

#### TD-03: computeDispatchPlan returns null for phase with no tasks
- **Traces**: FR-004, AC-004-04
- **Given** a tasks.md with no Phase 16 tasks
- **When** computeDispatchPlan is called with phaseKey "16"
- **Then** it returns null (fallback to single-call)

#### TD-04: getNextBatch returns tier 0 tasks first
- **Traces**: FR-003, AC-003-01
- **Given** a tasks.md with tasks in multiple tiers
- **When** getNextBatch is called
- **Then** it returns tier 0 (unblocked) tasks

#### TD-05: getNextBatch returns tier 1 after tier 0 tasks are marked complete
- **Traces**: FR-001, AC-001-04, FR-003, AC-003-02
- **Given** tier 0 tasks are marked [X] in tasks.md
- **When** getNextBatch is called again
- **Then** it returns tier 1 tasks

#### TD-06: getNextBatch returns null when all tasks complete
- **Traces**: FR-001, AC-001-04
- **Given** all phase tasks are marked [X]
- **When** getNextBatch is called
- **Then** it returns null with isLastTier true

#### TD-07: markTaskComplete updates tasks.md checkbox and recalculates summary
- **Traces**: FR-008, AC-008-02, AC-008-03
- **Given** a tasks.md with task T0004 as [ ]
- **When** markTaskComplete is called for T0004
- **Then** T0004 becomes [X] and Progress Summary Done count increments

#### TD-08: handleTaskFailure returns retry on first failure
- **Traces**: FR-007, AC-007-01
- **Given** a task that has not been retried
- **When** handleTaskFailure is called
- **Then** it returns { action: 'retry', retryCount: 1 }

#### TD-09: handleTaskFailure returns escalate after max retries
- **Traces**: FR-007, AC-007-02
- **Given** a task that has been retried 3 times
- **When** handleTaskFailure is called with maxRetries=3
- **Then** it returns { action: 'escalate', retryCount: 3 }

#### TD-10: skipTaskWithDependents marks task and transitive dependents as skipped
- **Traces**: FR-007, AC-007-03
- **Given** T0007 blocks T0008 which blocks T0009
- **When** skipTaskWithDependents is called for T0007
- **Then** T0007, T0008, and T0009 are all marked as skipped

#### TD-11: shouldUseTaskDispatch returns true for configured phase with tasks
- **Traces**: FR-004, AC-004-01, AC-004-03
- **Given** workflows.json has task_dispatch.phases including "06-implementation"
- **When** shouldUseTaskDispatch is called for "06-implementation"
- **Then** it returns true

#### TD-12: shouldUseTaskDispatch returns false for non-configured phase
- **Traces**: FR-004, AC-004-02
- **Given** workflows.json has task_dispatch.phases NOT including "16-quality-loop"
- **When** shouldUseTaskDispatch is called for "16-quality-loop"
- **Then** it returns false

#### TD-13: shouldUseTaskDispatch returns false when tasks.md missing
- **Traces**: FR-004, AC-004-04
- **Given** tasksPath points to nonexistent file
- **When** shouldUseTaskDispatch is called
- **Then** it returns false

#### TD-14: parallel tasks in same tier have no file overlap
- **Traces**: FR-003, AC-003-01
- **Given** tasks T0004 and T0005 are in tier 0 with different files
- **When** computeDispatchPlan groups them
- **Then** they appear in the same tier

### 2.2 Phase-Loop Controller Integration (T0002)

**Test file**: `tests/prompt-verification/task-level-dispatch.test.js`

#### TLD-01: isdlc.md step 3d contains task-dispatch conditional
- **Traces**: FR-001, FR-004, AC-004-03
- **Given** isdlc.md exists
- **When** step 3d content is read
- **Then** it contains `shouldUseTaskDispatch` and `step 3d-tasks`

#### TLD-02: isdlc.md step 3d-tasks specifies tier-by-tier iteration
- **Traces**: FR-001, AC-001-02
- **Given** isdlc.md exists
- **When** step 3d-tasks is read
- **Then** it contains tier iteration logic (getNextBatch, computeDispatchPlan)

#### TLD-03: isdlc.md step 3d-tasks specifies parallel dispatch within tier
- **Traces**: FR-003, AC-003-01, AC-003-02
- **Given** isdlc.md exists
- **When** step 3d-tasks is read
- **Then** it specifies parallel Task tool calls within a tier

#### TLD-04: isdlc.md step 3d-tasks includes per-task prompt template
- **Traces**: FR-002, AC-002-01, AC-002-02, AC-002-04
- **Given** isdlc.md exists
- **When** step 3d-tasks is read
- **Then** it includes FILES, TRACES, PRIOR COMPLETED FILES, and CONSTRAINTS sections in the per-task prompt

#### TLD-05: isdlc.md step 3d-tasks includes failure handling with escalation
- **Traces**: FR-007, AC-007-01, AC-007-02
- **Given** isdlc.md exists
- **When** step 3d-tasks is read
- **Then** it references handleTaskFailure, retry logic, and Retry/Skip/Cancel escalation

#### TLD-06: isdlc.md step 3d-tasks specifies TaskCreate per task for visibility
- **Traces**: FR-008, AC-008-01
- **Given** isdlc.md exists
- **When** step 3d-tasks is read
- **Then** it references TaskCreate and TaskUpdate for per-task progress

### 2.3 Config and Fallback (T0003)

**Test file**: `tests/prompt-verification/test-generate-scaffold-tasks.test.js`

#### TST-01: workflows.json contains task_dispatch config block
- **Traces**: FR-004, AC-004-01, AC-004-02, AC-004-03
- **Given** workflows.json exists
- **When** parsed as JSON
- **Then** it contains task_dispatch with enabled, phases, max_retries_per_task, parallel_within_tier

#### TST-02: isdlc.md test-generate handler references test.skip scaffolds
- **Traces**: FR-006, AC-006-01, AC-006-02
- **Given** isdlc.md exists
- **When** the test-generate section is read
- **Then** it references `tests/characterization/` and `test.skip()` scaffolds

#### TST-03: software-developer.md has mechanical mode fallback note
- **Traces**: FR-004, AC-004-04
- **Given** software-developer.md exists
- **When** the mechanical mode section is read
- **Then** it contains a note referencing GH-220 task-level dispatch as the primary mode

---

## 3. Traceability Matrix

| FR | AC | Test Cases | Impl Tasks |
|----|-----|------------|------------|
| FR-001 | AC-001-01 thru AC-001-04 | TD-01, TD-02, TD-04, TD-05, TD-06, TLD-01, TLD-02 | T0004, T0007 |
| FR-002 | AC-002-01 thru AC-002-04 | TLD-04 | T0007, T0012 |
| FR-003 | AC-003-01 thru AC-003-03 | TD-04, TD-14, TLD-03 | T0004, T0007 |
| FR-004 | AC-004-01 thru AC-004-04 | TD-03, TD-11, TD-12, TD-13, TLD-01, TST-01, TST-03 | T0005, T0007, T0009, T0011 |
| FR-005 | AC-005-01 thru AC-005-03 | TLD-04 | T0007 |
| FR-006 | AC-006-01 thru AC-006-03 | TST-02 | T0008 |
| FR-007 | AC-007-01 thru AC-007-04 | TD-08, TD-09, TD-10, TLD-05 | T0004, T0007 |
| FR-008 | AC-008-01 thru AC-008-03 | TD-07, TLD-06 | T0007 |

---

## 4. Test Data Requirements

- **Fixture tasks.md**: A sample tasks.md with 6+ tasks across 2 phases, with blocked_by/blocks dependencies forming 3 tiers. Placed in `tests/core/tasks/fixtures/dispatch-test-plan.md`.
- **Fixture workflows.json**: Use actual `src/isdlc/config/workflows.json` (read from disk in tests).
- No external services or mocks needed.

---

## 5. Constitutional Compliance

| Article | How satisfied |
|---------|-------------|
| II (Test-First) | 23 test cases designed before implementation; traces to all 8 FRs |
| VII (Traceability) | Full traceability matrix; every AC has at least one test case |
| IX (Gate Integrity) | Test strategy artifact produced |
| XII (Cross-Platform) | Core module tests validate provider-neutral logic; Codex adapter tested via prompt-verification |
