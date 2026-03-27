# Test Strategy: Task List Consumption Model for Build Phase Agents

**Slug**: REQ-GH-212-task-list-consumption-model-for-build-phase-agents
**Phase**: 05 - Test Strategy
**Version**: 1.0.0
**Constitutional Articles**: II (Test-First), VII (Traceability), IX (Gate Integrity), XI (Integration Testing)

---

## 1. Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion Library**: `node:assert/strict`
- **Coverage Tool**: Intensity-based tiered thresholds (standard: 80% unit, 70% integration)
- **Existing Patterns**: Tests use `describe/it` blocks, test ID prefixes (SM-, PRJ-, etc.), FR/AC tracing in descriptions
- **Existing Test Files to Extend**:
  - `tests/core/analyze/state-machine.test.js` (SM- prefix, 25+ tests)
  - `tests/providers/codex/projection.test.js` (PRJ- prefix)
- **New Test Files**:
  - `tests/core/tasks/task-reader.test.js` (new, TR- prefix)
  - `tests/hooks/plan-surfacer.test.js` (new, PS- prefix)

## 2. Test Strategy

### Approach
Extend the existing test suite with test cases for the 4 implementation areas identified in the task plan. All tests follow the project convention: `node:test` + `node:assert/strict`, FR/AC tracing in test descriptions, test ID prefixes per module.

### Coverage Targets
- **Unit test coverage**: >=80% for all new/modified modules
- **Integration test coverage**: >=70% for TASK_CONTEXT injection paths
- **Critical path**: 100% for task-reader.js parse logic (core module used by both providers)

### Test Types
| Type | Scope | Files |
|------|-------|-------|
| Unit | task-reader.js parse, extract, format | tests/core/tasks/task-reader.test.js |
| Unit | plan-surfacer EARLY_PHASES constant | tests/hooks/plan-surfacer.test.js |
| Unit | state-machine tierPaths.light | tests/core/analyze/state-machine.test.js |
| Integration | TASK_CONTEXT injection (Claude) | tests/core/orchestration/phase-loop.test.js (extend) |
| Integration | TASK_CONTEXT injection (Codex) | tests/providers/codex/projection.test.js (extend) |
| Prompt verification | Agent spec sections | tests/prompt-verification/ (extend as needed) |

---

## 3. Test Cases by Implementation Task

### T0005: Create src/core/tasks/ directory and task-reader.js module skeleton

**File under test**: `src/core/tasks/task-reader.js`
**Test file**: `tests/core/tasks/task-reader.test.js`
**Traces**: FR-011, AC-011-01

| ID | Scenario | Type | AC |
|----|----------|------|----|
| TR-01 | Module exports readTaskPlan function | positive | AC-011-01 |
| TR-02 | Module exports getTasksForPhase function | positive | AC-011-01 |
| TR-03 | Module exports formatTaskContext function | positive | AC-011-01 |
| TR-04 | All exports are functions (typeof check) | positive | AC-011-01 |

---

### T0006: Implement readTaskPlan() v2.0 parser

**File under test**: `src/core/tasks/task-reader.js`
**Test file**: `tests/core/tasks/task-reader.test.js`
**Traces**: FR-011, AC-011-01, AC-011-02, AC-011-03, AC-011-04

| ID | Scenario | Type | AC |
|----|----------|------|----|
| TR-05 | readTaskPlan() with valid v2.0 file returns TaskPlan object | positive | AC-011-01 |
| TR-06 | TaskPlan has slug, format, phases, and summary properties | positive | AC-011-01 |
| TR-07 | format property equals "v2.0" | positive | AC-011-01 |
| TR-08 | Parsed task has id, description, files, blockedBy, blocks, parallel, traces, status fields | positive | AC-011-02 |
| TR-09 | Task with `[P]` marker has parallel=true | positive | AC-011-02 |
| TR-10 | Task without `[P]` marker has parallel=false | positive | AC-011-02 |
| TR-11 | Task with `[X]` has complete=true | positive | AC-011-02 |
| TR-12 | Task with `[ ]` has complete=false | positive | AC-011-02 |
| TR-13 | Files sub-line parsed as {path, operation} objects | positive | AC-011-02 |
| TR-14 | Operation values: CREATE, MODIFY, VERIFY, REVIEW, EXTEND all parsed | positive | AC-011-02 |
| TR-15 | blocked_by sub-line parsed as string array of task IDs | positive | AC-011-02 |
| TR-16 | blocks sub-line parsed as string array of task IDs | positive | AC-011-02 |
| TR-17 | Traces annotation parsed as string array of FR/AC refs | positive | AC-011-02 |
| TR-18 | Multiple phases parsed into phases object keyed by phase number | positive | AC-011-01 |
| TR-19 | Phase section status (PENDING, IN PROGRESS, COMPLETE) parsed correctly | positive | AC-011-01 |
| TR-20 | Summary computed with total count and byPhase breakdown | positive | AC-011-01 |
| TR-21 | readTaskPlan() with nonexistent file returns null | negative | AC-011-03 |
| TR-22 | readTaskPlan() with empty file returns error object {error, reason} | negative | AC-011-04 |
| TR-23 | readTaskPlan() with no phase sections returns error object | negative | AC-011-04 |
| TR-24 | readTaskPlan() with malformed content does not throw | negative | AC-011-04 |
| TR-25 | Error object has error and reason string properties | negative | AC-011-04 |
| TR-26 | Partial parse success returns TaskPlan with warnings array | negative | AC-011-04 |
| TR-27 | Duplicate task IDs produce a warning | negative | AC-011-04 |
| TR-28 | blocked_by referencing nonexistent task ID produces a warning | negative | AC-011-04 |
| TR-29 | Self-reference in blocked_by produces a warning | negative | AC-011-04 |
| TR-30 | Task with `blocked_by: none` has empty blockedBy array | positive | AC-011-02 |
| TR-31 | Task with multiple files sub-lines parsed correctly | positive | AC-011-02 |
| TR-32 | Phase header with sub-sections (### Setup, ### Foundational) correctly groups tasks under parent phase | positive | AC-011-01 |

---

### T0007: Implement getTasksForPhase() phase extractor

**File under test**: `src/core/tasks/task-reader.js`
**Test file**: `tests/core/tasks/task-reader.test.js`
**Traces**: FR-011, AC-011-01, FR-007, AC-007-01

| ID | Scenario | Type | AC |
|----|----------|------|----|
| TR-33 | getTasksForPhase() with valid plan and phase "06" returns Phase 06 tasks | positive | AC-011-01, AC-007-01 |
| TR-34 | getTasksForPhase() with phase "05" returns Phase 05 tasks only | positive | AC-011-01 |
| TR-35 | getTasksForPhase() with nonexistent phase returns empty array | negative | AC-007-01 |
| TR-36 | getTasksForPhase() preserves task ordering within phase | positive | AC-007-01 |
| TR-37 | getTasksForPhase() with null plan returns empty array | negative | AC-007-01 |

---

### T0008: Implement formatTaskContext() prompt injection formatter

**File under test**: `src/core/tasks/task-reader.js`
**Test file**: `tests/core/tasks/task-reader.test.js`
**Traces**: FR-007, AC-007-04, AC-007-05, AC-007-06

| ID | Scenario | Type | AC |
|----|----------|------|----|
| TR-38 | formatTaskContext() returns string containing "TASK_CONTEXT:" header | positive | AC-007-04 |
| TR-39 | Output includes phase key | positive | AC-007-04 |
| TR-40 | Output includes total_tasks count | positive | AC-007-04 |
| TR-41 | Output includes task id, description, files, blocked_by, blocks, traces, status for each task | positive | AC-007-04 |
| TR-42 | Output includes dependency_summary with critical_path_length and parallel_tiers | positive | AC-007-04 |
| TR-43 | formatTaskContext() with includeTestMapping=false has test_mapping: null | positive | AC-007-05 |
| TR-44 | formatTaskContext() with includeTestMapping=true and valid test-strategy.md includes test_mapping entries | positive | AC-007-05 |
| TR-45 | formatTaskContext() with includeTestMapping=true but missing test-strategy.md has test_mapping: null | negative | AC-007-05 |
| TR-46 | Output token count is under 1000 tokens for a typical 4-task phase | positive | AC-007-04 |
| TR-47 | formatTaskContext() for Claude path (phase "05") produces injectable block | positive | AC-007-05 |
| TR-48 | formatTaskContext() for Codex path (phase "06") produces injectable block | positive | AC-007-06 |

---

### T0009: Write task-reader.js unit tests

This is the implementation task for the test file itself. The test cases above (TR-01 through TR-48) ARE the specification for T0009.

**File**: `tests/core/tasks/task-reader.test.js`
**Traces**: FR-011, AC-011-01, AC-011-02, AC-011-03, AC-011-04

---

### T0010: Upgrade ORCH-012 SKILL.md for file-level task generation

**File under test**: `src/claude/skills/orchestration/generate-plan/SKILL.md`
**Test approach**: Prompt verification (structural test of markdown content)
**Traces**: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-01 | SKILL.md contains file-level task generation instructions for Phase 05 | positive | AC-001-01 |
| PV-02 | SKILL.md contains file-level task generation instructions for Phase 06 | positive | AC-001-01 |
| PV-03 | SKILL.md contains file-level task generation instructions for Phase 16 | positive | AC-001-01 |
| PV-04 | SKILL.md contains file-level task generation instructions for Phase 08 | positive | AC-001-01 |
| PV-05 | SKILL.md contains light-workflow derivation logic (requirements + impact analysis) | positive | AC-001-02 |
| PV-06 | SKILL.md references blocked_by/blocks dependency computation | positive | AC-001-03 |
| PV-07 | SKILL.md references traces annotation generation | positive | AC-001-04 |

---

### T0011: Add light-workflow task derivation logic to ORCH-012

**File under test**: `src/claude/skills/orchestration/generate-plan/SKILL.md`
**Test approach**: Prompt verification
**Traces**: FR-001, AC-001-02, FR-002, AC-002-01

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-08 | SKILL.md contains explicit light-workflow section for task derivation without design artifacts | positive | AC-001-02 |
| PV-09 | Light-workflow section references requirements-spec.md as input | positive | AC-001-02 |
| PV-10 | Light-workflow section references impact-analysis.md as input | positive | AC-001-02 |

---

### T0012: Add TASK_CONTEXT injection to phase-loop step 3d (Claude)

**File under test**: `src/claude/commands/isdlc.md`
**Test approach**: Prompt verification (structural test of markdown command file)
**Traces**: FR-007, AC-007-05, FR-003, AC-003-05, FR-008, AC-008-07, FR-009, AC-009-06, FR-010, AC-010-05

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-11 | isdlc.md step 3d contains TASK_CONTEXT INJECTION block | positive | AC-007-05 |
| PV-12 | Injection references readTaskPlan from src/core/tasks/task-reader.js | positive | AC-007-05 |
| PV-13 | Injection references formatTaskContext from src/core/tasks/task-reader.js | positive | AC-007-05 |
| PV-14 | Injection is fail-open (SKIP if null or error, not block) | positive | AC-007-05 |
| PV-15 | Injection occurs after BUDGET DEGRADATION INJECTION | positive | AC-007-05 |
| PV-16 | includeTestMapping is true for phases 06-implementation and 16-quality-loop | positive | AC-007-05 |

---

### T0013: Add TASK_CONTEXT injection to Codex projection.js

**File under test**: `src/providers/codex/projection.js`
**Test file**: `tests/providers/codex/projection.test.js` (extend)
**Traces**: FR-007, AC-007-06, FR-003, AC-003-06, FR-008, AC-008-08, FR-009, AC-009-07, FR-010, AC-010-06

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PRJ-T13-01 | projection.js imports readTaskPlan and formatTaskContext | positive | AC-007-06 |
| PRJ-T13-02 | projectInstructions() includes TASK_CONTEXT block when tasks.md exists | positive | AC-007-06 |
| PRJ-T13-03 | projectInstructions() omits TASK_CONTEXT when tasks.md missing (null) | negative | AC-007-06 |
| PRJ-T13-04 | projectInstructions() omits TASK_CONTEXT when parse returns error | negative | AC-007-06 |
| PRJ-T13-05 | includeTestMapping true for phase 06-implementation | positive | AC-007-06 |
| PRJ-T13-06 | includeTestMapping true for phase 16-quality-loop | positive | AC-007-06 |
| PRJ-T13-07 | includeTestMapping false for other phases | positive | AC-007-06 |

---

### T0014: Update plan-surfacer.cjs -- remove 05-test-strategy from EARLY_PHASES

**File under test**: `src/claude/hooks/plan-surfacer.cjs`
**Test file**: `tests/hooks/plan-surfacer.test.js` (new)
**Traces**: FR-006, AC-006-01, AC-006-02, AC-006-03

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PS-01 | EARLY_PHASES does not contain '05-test-strategy' | positive | AC-006-01 |
| PS-02 | EARLY_PHASES still contains '00-quick-scan' through '04-design' | positive | AC-006-01 |
| PS-03 | Phase 05 delegated without tasks.md is blocked | positive | AC-006-02 |
| PS-04 | Phase 05 delegated with tasks.md is allowed | positive | AC-006-02 |
| PS-05 | Block message contains "PLAN REQUIRED" text | positive | AC-006-02 |
| PS-06 | Phase 06 without tasks.md is still blocked (regression) | positive | AC-006-02 |
| PS-07 | Phase 04 without tasks.md is allowed (still early phase) | positive | AC-006-01 |

---

### T0015: Update state-machine.js -- add PRESENTING_TASKS to tierPaths.light

**File under test**: `src/core/analyze/state-machine.js`
**Test file**: `tests/core/analyze/state-machine.test.js` (extend)
**Traces**: FR-002, AC-002-01

| ID | Scenario | Type | AC |
|----|----------|------|----|
| SM-T15-01 | light tier path includes PRESENTING_TASKS | positive | AC-002-01 |
| SM-T15-02 | light tier path has exactly 3 entries: PRESENTING_REQUIREMENTS, PRESENTING_DESIGN, PRESENTING_TASKS | positive | AC-002-01 |
| SM-T15-03 | standard tier path still has 4 entries (unchanged, regression check) | positive | AC-002-01 |

**Note**: SM-17 in the existing test file already asserts `['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']` for light tier. This was added during REQ-GH-208 and already passes. The state-machine.js already has PRESENTING_TASKS in tierPaths.light. T0015 may be a no-op if the implementation is already in place. The test cases above serve as regression guards.

---

### T0016: Add task-driven test design section to 04-test-design-engineer.md

**File under test**: `src/claude/agents/04-test-design-engineer.md`
**Test approach**: Prompt verification
**Traces**: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-05

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-17 | Agent spec contains "Task-Driven Test Design" section | positive | AC-003-01 |
| PV-18 | Section instructs agent to parse TASK_CONTEXT block | positive | AC-003-01 |
| PV-19 | Section instructs 1:1 test case mapping per Phase 06 task | positive | AC-003-02 |
| PV-20 | Section instructs task-to-test traceability table in test-strategy.md | positive | AC-003-03 |
| PV-21 | Section has fallback when TASK_CONTEXT is absent | positive | AC-003-05 |

---

### T0017: Add task-driven implementation section to 05-software-developer.md

**File under test**: `src/claude/agents/05-software-developer.md`
**Test approach**: Prompt verification
**Traces**: FR-008, AC-008-01 through AC-008-07

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-22 | Agent spec contains "Task-Driven Implementation" section | positive | AC-008-01 |
| PV-23 | Section instructs dependency-ordered execution via blocked_by chains | positive | AC-008-01 |
| PV-24 | Section instructs per-file loop within task scope | positive | AC-008-02 |
| PV-25 | Section instructs concurrent execution for [P] tasks | positive | AC-008-03 |
| PV-26 | Section instructs WRITER_CONTEXT to include task traces | positive | AC-008-04 |
| PV-27 | Section instructs TDD ordering via test_mapping | positive | AC-008-05 |
| PV-28 | Section instructs marking task [X] on completion | positive | AC-008-06 |
| PV-29 | Section has fallback when TASK_CONTEXT is absent | positive | AC-008-07 |

---

### T0018: Add task-driven verification section to 16-quality-loop-engineer.md

**File under test**: `src/claude/agents/16-quality-loop-engineer.md`
**Test approach**: Prompt verification
**Traces**: FR-009, AC-009-01 through AC-009-06

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-30 | Agent spec contains "Task-Driven Verification" section | positive | AC-009-01 |
| PV-31 | Section instructs Track A to verify test coverage per task file | positive | AC-009-02 |
| PV-32 | Section instructs Track B to cross-reference traces against requirements | positive | AC-009-03 |
| PV-33 | Section instructs Track B to flag completion gaps ([X] with no changes) | positive | AC-009-04 |
| PV-34 | Section instructs fan-out grouping by task file paths | positive | AC-009-05 |
| PV-35 | Section has fallback when TASK_CONTEXT is absent | positive | AC-009-06 |

---

### T0019: Add task-driven review section to 07-qa-engineer.md

**File under test**: `src/claude/agents/07-qa-engineer.md`
**Test approach**: Prompt verification
**Traces**: FR-010, AC-010-01 through AC-010-05

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-36 | Agent spec contains "Task-Driven Review" section | positive | AC-010-01 |
| PV-37 | Section instructs review by task unit (not directory) | positive | AC-010-02 |
| PV-38 | Section instructs findings to include task ID and traces | positive | AC-010-03 |
| PV-39 | Section instructs fan-out by task units with directory fallback | positive | AC-010-04 |
| PV-40 | Section has fallback when TASK_CONTEXT is absent | positive | AC-010-05 |

---

### T0020: Update debate-test-strategy.js -- Creator/Critic/Refiner task context

**File under test**: `src/core/teams/instances/debate-test-strategy.js`
**Test file**: `tests/core/teams/debate-instances.test.js` (extend)
**Traces**: FR-003, AC-003-06

| ID | Scenario | Type | AC |
|----|----------|------|----|
| DI-T20-01 | Creator role instructions reference TASK_CONTEXT for 1:1 test case generation | positive | AC-003-06 |
| DI-T20-02 | Critic role instructions reference task-to-test coverage validation | positive | AC-003-06 |
| DI-T20-03 | Refiner role instructions reference traceability table completion | positive | AC-003-06 |

---

### T0021: Update implementation-review-loop.js -- Writer/Reviewer task context

**File under test**: `src/core/teams/specs/implementation-review-loop.js`
**Test file**: `tests/core/teams/implementation-loop.test.js` (extend)
**Traces**: FR-008, AC-008-08

| ID | Scenario | Type | AC |
|----|----------|------|----|
| IL-T21-01 | Writer role instructions reference TASK_CONTEXT for dependency-ordered execution | positive | AC-008-08 |
| IL-T21-02 | Writer role instructions reference test_mapping for TDD | positive | AC-008-08 |
| IL-T21-03 | Reviewer role instructions reference task traces for validation | positive | AC-008-08 |

---

### T0022: Update quality-loop.js -- Track A/B task context

**File under test**: `src/core/teams/instances/quality-loop.js`
**Test file**: `tests/core/teams/instances.test.js` (extend)
**Traces**: FR-009, AC-009-07

| ID | Scenario | Type | AC |
|----|----------|------|----|
| QL-T22-01 | Track A instructions reference TASK_CONTEXT for per-task test coverage | positive | AC-009-07 |
| QL-T22-02 | Track B instructions reference TASK_CONTEXT for per-task traceability | positive | AC-009-07 |
| QL-T22-03 | Track B instructions reference completion gap detection | positive | AC-009-07 |

---

### T0023: Update Phase 08 Codex projection -- task-structured review units

**File under test**: `src/providers/codex/projection.js`
**Test file**: `tests/providers/codex/projection.test.js` (extend)
**Traces**: FR-010, AC-010-06

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PRJ-T23-01 | Projection for Phase 08 includes task-structured review units | positive | AC-010-06 |
| PRJ-T23-02 | Review units reference task ID and file scope | positive | AC-010-06 |

---

### T0024: Extend plan-surfacer.test.js -- Phase 05 block tests

**File**: `tests/hooks/plan-surfacer.test.js`
**Traces**: FR-006, AC-006-02, AC-006-03

This is the implementation task for the plan-surfacer test file itself. Test cases PS-01 through PS-07 above ARE the specification for T0024.

---

### T0025: Extend state-machine.test.js -- light tier PRESENTING_TASKS tests

**File**: `tests/core/analyze/state-machine.test.js`
**Traces**: FR-002, AC-002-01

This is the implementation task for extending the state-machine tests. Test cases SM-T15-01 through SM-T15-03 above ARE the specification for T0025. Note that the existing test SM-17 already validates the current state, so T0025 focuses on regression guarding.

---

### T0026: Add roundtable light-tier task generation to roundtable-analyst.md

**File under test**: `src/claude/agents/roundtable-analyst.md`
**Test approach**: Prompt verification
**Traces**: FR-002, AC-002-01, AC-002-02, AC-002-03

| ID | Scenario | Type | AC |
|----|----------|------|----|
| PV-41 | Roundtable agent spec does not skip PRESENTING_TASKS for light tier | positive | AC-002-01 |
| PV-42 | Light tier task generation section references requirements + impact analysis as inputs | positive | AC-002-02 |
| PV-43 | Light tier task summary includes task count, phase breakdown, files affected, and traceability coverage | positive | AC-002-02 |
| PV-44 | Light tier tasks.md is included in batch write after acceptance | positive | AC-002-03 |

---

## 4. Task-to-Test Traceability Table

| Task | File Under Test | Test File | Traces | Scenario Count |
|------|-----------------|-----------|--------|----------------|
| T0005 | src/core/tasks/task-reader.js | tests/core/tasks/task-reader.test.js | FR-011, AC-011-01 | 4 |
| T0006 | src/core/tasks/task-reader.js | tests/core/tasks/task-reader.test.js | FR-011, AC-011-01..04 | 28 |
| T0007 | src/core/tasks/task-reader.js | tests/core/tasks/task-reader.test.js | FR-011, AC-011-01, FR-007, AC-007-01 | 5 |
| T0008 | src/core/tasks/task-reader.js | tests/core/tasks/task-reader.test.js | FR-007, AC-007-04..06 | 11 |
| T0009 | tests/core/tasks/task-reader.test.js | (self -- test implementation) | FR-011 | 48 |
| T0010 | src/claude/skills/.../SKILL.md | tests/prompt-verification/ | FR-001, AC-001-01..04 | 7 |
| T0011 | src/claude/skills/.../SKILL.md | tests/prompt-verification/ | FR-001, AC-001-02, FR-002, AC-002-01 | 3 |
| T0012 | src/claude/commands/isdlc.md | tests/prompt-verification/ | FR-007, AC-007-05 | 6 |
| T0013 | src/providers/codex/projection.js | tests/providers/codex/projection.test.js | FR-007, AC-007-06 | 7 |
| T0014 | src/claude/hooks/plan-surfacer.cjs | tests/hooks/plan-surfacer.test.js | FR-006, AC-006-01..03 | 7 |
| T0015 | src/core/analyze/state-machine.js | tests/core/analyze/state-machine.test.js | FR-002, AC-002-01 | 3 |
| T0016 | src/claude/agents/04-test-design-engineer.md | tests/prompt-verification/ | FR-003, AC-003-01..05 | 5 |
| T0017 | src/claude/agents/05-software-developer.md | tests/prompt-verification/ | FR-008, AC-008-01..07 | 8 |
| T0018 | src/claude/agents/16-quality-loop-engineer.md | tests/prompt-verification/ | FR-009, AC-009-01..06 | 6 |
| T0019 | src/claude/agents/07-qa-engineer.md | tests/prompt-verification/ | FR-010, AC-010-01..05 | 5 |
| T0020 | src/core/teams/instances/debate-test-strategy.js | tests/core/teams/debate-instances.test.js | FR-003, AC-003-06 | 3 |
| T0021 | src/core/teams/specs/implementation-review-loop.js | tests/core/teams/implementation-loop.test.js | FR-008, AC-008-08 | 3 |
| T0022 | src/core/teams/instances/quality-loop.js | tests/core/teams/instances.test.js | FR-009, AC-009-07 | 3 |
| T0023 | src/providers/codex/projection.js | tests/providers/codex/projection.test.js | FR-010, AC-010-06 | 2 |
| T0024 | tests/hooks/plan-surfacer.test.js | (self -- test implementation) | FR-006 | 7 |
| T0025 | tests/core/analyze/state-machine.test.js | (self -- test implementation) | FR-002 | 3 |
| T0026 | src/claude/agents/roundtable-analyst.md | tests/prompt-verification/ | FR-002, AC-002-01..03 | 4 |
| **Total** | | | | **168** |

---

## 5. FR Coverage Matrix

| FR | Description | Test Cases | Coverage |
|----|-------------|------------|----------|
| FR-001 | 3e-plan file-level tasks | PV-01..PV-10 | 10 scenarios |
| FR-002 | Light analysis task breakdown | SM-T15-01..03, PV-41..44 | 7 scenarios |
| FR-003 | Phase 05 consumes tasks.md | PV-17..21, DI-T20-01..03 | 8 scenarios |
| FR-004 | Build-init copy retry | (covered by existing plan-surfacer tests + regression) | Existing |
| FR-005 | Retry on generation failure | (covered by existing plan-surfacer retry logic + regression) | Existing |
| FR-006 | Plan-surfacer blocks Phase 05 | PS-01..07 | 7 scenarios |
| FR-007 | Consumption pattern contract | TR-38..48, PV-11..16, PRJ-T13-01..07 | 24 scenarios |
| FR-008 | Phase 06 consumes tasks.md | PV-22..29, IL-T21-01..03 | 11 scenarios |
| FR-009 | Phase 16 consumes tasks.md | PV-30..35, QL-T22-01..03 | 9 scenarios |
| FR-010 | Phase 08 consumes tasks.md | PV-36..40, PRJ-T23-01..02 | 7 scenarios |
| FR-011 | Provider-neutral task reader | TR-01..37 | 37 scenarios |

All 11 FRs have test cases. 100% FR coverage achieved.

---

## 6. Test Data Plan

### Boundary Values

- **Empty file**: 0 bytes -- triggers error object return
- **Single phase, single task**: Minimum valid v2.0 file
- **Full REQ-GH-212 tasks.md**: Real-world fixture (38 tasks across 4 phases)
- **Phase with 0 tasks**: Phase header present but no task lines
- **Task with 0 files**: Task line present but no `files:` sub-line
- **Task with 5+ files**: Multi-file task

### Invalid Inputs

- **No format header**: Missing `Format: v2.0` line
- **No phase sections**: Content without `## Phase` headers
- **Malformed task line**: Missing task ID pattern `T\d{4}`
- **Duplicate task IDs**: Two tasks with same ID
- **Circular blocked_by**: Task A blocks B, B blocks A
- **Self-referencing blocked_by**: Task A blocked by A
- **Invalid operation**: `files: foo.js (INVALID_OP)`
- **Missing traces separator**: `| traces` without colon

### Maximum-Size Inputs

- **100-task file**: Stress test for parse performance (should complete < 100ms)
- **Deeply nested dependencies**: 20-task dependency chain (worst-case topological sort)

### Test Fixtures

All test fixtures will be placed in `tests/core/tasks/fixtures/`:

| Fixture | Description |
|---------|-------------|
| `valid-v2.0.md` | Complete valid v2.0 tasks.md with 4 phases, 10 tasks |
| `minimal-v2.0.md` | Single phase, single task, minimum required fields |
| `real-req-gh-212.md` | Copy of the actual REQ-GH-212 tasks.md (38 tasks) |
| `empty.md` | 0-byte file |
| `no-phases.md` | Content without phase sections |
| `malformed-tasks.md` | Various malformed task lines |
| `duplicate-ids.md` | Tasks with duplicate IDs |
| `circular-deps.md` | Circular blocked_by references |
| `large-100-tasks.md` | 100 tasks for performance testing |

---

## 7. Security Considerations

- **Path traversal**: readTaskPlan() must not follow symlinks outside project root
- **Input sanitization**: File paths in parsed tasks should not contain `..` traversal
- **Error information leakage**: Error objects should not expose full filesystem paths in messages returned to agents

---

## 8. Performance Requirements

- **readTaskPlan()**: < 50ms for typical tasks.md (< 40 tasks)
- **readTaskPlan()**: < 100ms for large tasks.md (100 tasks)
- **getTasksForPhase()**: < 5ms (simple filter)
- **formatTaskContext()**: < 10ms (string formatting)
- **TASK_CONTEXT token budget**: < 1000 tokens per phase injection

---

## 9. Flaky Test Mitigation

- **No filesystem timing dependencies**: All file reads are synchronous (readFileSync), eliminating async race conditions
- **Fixture isolation**: Each test uses its own fixture file, no shared mutable state
- **No network calls**: Task reader is purely local I/O
- **Deterministic ordering**: Tests within describe blocks are independent; no test depends on execution order
- **Temp directory cleanup**: Any tests creating temp files use `node:os.tmpdir()` with cleanup in `afterEach`

---

## 10. Integration Test Plan

### INT-001: task-reader.js + Phase-Loop (Claude Path)
- Verify phase-loop step 3d calls readTaskPlan() and injects TASK_CONTEXT into delegation prompt
- Verify TASK_CONTEXT is omitted when tasks.md is missing
- Verify includeTestMapping is set correctly per phase

### INT-002: task-reader.js + Codex Projection
- Verify projection.js calls readTaskPlan() and includes TASK_CONTEXT in instruction bundle
- Verify TASK_CONTEXT is omitted when readTaskPlan() returns null or error
- Verify includeTestMapping logic matches Claude path

### INT-003: plan-surfacer + Phase 05 Delegation
- Verify plan-surfacer blocks Phase 05 when tasks.md is absent
- Verify plan-surfacer allows Phase 05 when tasks.md is present
- Verify 3f-retry-protocol triggers on block

### INT-004: State Machine + Light Tier Roundtable
- Verify light tier transitions through PRESENTING_TASKS state
- Verify roundtable generates tasks from requirements + impact analysis

---

## 11. GATE-04 Checklist

- [x] Test strategy covers unit, integration, prompt verification
- [x] Test cases exist for all 22 implementation tasks (T0005-T0026)
- [x] Traceability matrix complete -- all 11 FRs have test coverage
- [x] Coverage targets defined (80% unit, 70% integration, 100% critical path)
- [x] Test data strategy documented with boundary/invalid/max-size inputs
- [x] Critical paths identified (task-reader.js parse logic)
- [x] Security considerations documented
- [x] Performance requirements defined
- [x] Flaky test mitigation documented
- [x] Integration test plan covers component interactions (Article XI)
