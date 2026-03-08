# Test Cases: Workflow Recovery (Retry + Rollback)

**Requirements**: REQ-0051 (Retry/Redo) + REQ-0052 (Rollback)
**Last Updated**: 2026-03-08
**Total Automated Test Cases**: 76
**AC Coverage**: 34/34 code-testable acceptance criteria (100%)

---

## Table of Contents

1. [Unit Tests: Retry Script](#1-unit-tests-retry-script)
2. [Unit Tests: Rollback Script](#2-unit-tests-rollback-script)
3. [Unit Tests: V8 Recovery Action Exception](#3-unit-tests-v8-recovery-action-exception)
4. [Integration Tests: Recovery Lifecycle](#4-integration-tests-recovery-lifecycle)
5. [E2E Tests: Retry Script Execution](#5-e2e-tests-retry-script-execution)
6. [E2E Tests: Rollback Script Execution](#6-e2e-tests-rollback-script-execution)

---

## 1. Unit Tests: Retry Script

**Test File**: `src/claude/hooks/tests/workflow-retry.test.cjs`
**Module**: `src/antigravity/workflow-retry.cjs`

### 1.1 Retry State Clearing (FR-001)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RT-01 | clears test_iteration on retry | positive | AC-001-01 | Given phase has `test_iteration: { completed: true, current_iteration: 3 }`, when retry runs, then `test_iteration` is cleared (reset to empty or removed) |
| TC-RT-02 | clears constitutional_validation on retry | positive | AC-001-01 | Given phase has `constitutional_validation: { completed: true, iterations_used: 2 }`, when retry runs, then `constitutional_validation` is cleared |
| TC-RT-03 | clears interactive_elicitation on retry | positive | AC-001-01 | Given phase has `interactive_elicitation: { completed: true, menu_interactions: 5 }`, when retry runs, then `interactive_elicitation` is cleared |
| TC-RT-04 | clears all three iteration fields simultaneously | positive | AC-001-01 | Given phase has all three iteration fields populated, when retry runs, then all three are cleared in a single operation |
| TC-RT-05 | handles phase with no iteration state gracefully | positive | AC-001-01 | Given phase has no `test_iteration`, `constitutional_validation`, or `interactive_elicitation`, when retry runs, then operation succeeds without error |

### 1.2 Retry Count Tracking (FR-005)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RT-06 | sets retry_count to 1 on first retry | positive | AC-005-01 | Given phase has no `retry_count` field, when retry runs, then `retry_count` is set to 1 |
| TC-RT-07 | increments retry_count from 2 to 3 | positive | AC-005-02 | Given phase has `retry_count: 2`, when retry runs, then `retry_count` becomes 3 |
| TC-RT-08 | retry_count does not block gate validation | positive | AC-005-03 | Given phase has `retry_count: 10`, when gate validation runs, then retry_count is ignored (no blocking) |

### 1.3 State Version and Phase Preservation (FR-001)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RT-09 | bumps state_version on retry | positive | AC-001-03 | Given `state_version: 42`, when retry runs, then `state_version` is >= 43 |
| TC-RT-10 | current_phase unchanged after retry | positive | AC-001-04 | Given `current_phase: "06-implementation"`, when retry runs, then `current_phase` is still `"06-implementation"` |
| TC-RT-11 | current_phase_index unchanged after retry | positive | AC-001-04 | Given `current_phase_index: 3`, when retry runs, then `current_phase_index` is still 3 |

### 1.4 Error Handling (FR-001)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RT-12 | returns ERROR when no active workflow | negative | AC-001-05 | Given state has no `active_workflow`, when retry runs, then output is `{ "result": "ERROR", "message": "No active workflow" }` |
| TC-RT-13 | returns ERROR when active_workflow is null | negative | AC-001-05 | Given `active_workflow: null`, when retry runs, then output is ERROR |

### 1.5 Recovery Feedback (FR-002)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RT-14 | output includes result field | positive | AC-002-01 | Given successful retry, then output JSON has `result: "RETRIED"` |
| TC-RT-15 | output includes phase field | positive | AC-002-01 | Given successful retry on Phase 06, then output has `phase: "06-implementation"` |
| TC-RT-16 | output includes retry_count | positive | AC-002-01 | Given successful retry, then output has `retry_count` field with numeric value |
| TC-RT-17 | output includes cleared_state list | positive | AC-002-01 | Given successful retry, then output has `cleared_state` array listing what was reset |
| TC-RT-18 | output includes artifacts_preserved true | positive | AC-002-01 | Given successful retry, then output has `artifacts_preserved: true` |
| TC-RT-19 | feedback shows phase name in message | positive | AC-002-02 | Given successful retry, then output `message` field contains the phase name |
| TC-RT-20 | Phase 06 retry notes code preserved on disk | positive | AC-002-03 | Given retry on Phase 06, then output message mentions existing code/artifacts preserved |

### 1.6 Recovery Action Flag (FR-004)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RT-21 | sets recovery_action with type retry | positive | AC-004-01 | Given retry runs, then `active_workflow.recovery_action` is set with `type: "retry"` |
| TC-RT-22 | recovery_action includes phase name | positive | AC-004-01 | Given retry on Phase 06, then `recovery_action.phase` is `"06-implementation"` |
| TC-RT-23 | recovery_action includes ISO-8601 timestamp | positive | AC-004-01 | Given retry runs, then `recovery_action.timestamp` matches ISO-8601 format |
| TC-RT-24 | recovery_action cleared after phase re-advancement | positive | AC-004-03 | Given phase has `recovery_action` set, when phase advances again, then `recovery_action` is removed |

---

## 2. Unit Tests: Rollback Script

**Test File**: `src/claude/hooks/tests/workflow-rollback.test.cjs`
**Module**: `src/antigravity/workflow-rollback.cjs`

### 2.1 Rollback State Changes (FR-001)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RB-01 | sets current_phase to target phase | positive | AC-001-01 (REQ-0052) | Given `--to-phase 01-requirements`, when rollback runs, then `current_phase` is `"01-requirements"` |
| TC-RB-02 | sets current_phase_index to target index | positive | AC-001-01 (REQ-0052) | Given target phase at index 1 in phases array, when rollback runs, then `current_phase_index` is 1 |
| TC-RB-03 | target phase status set to in_progress | positive | AC-001-02 (REQ-0052) | Given rollback to Phase 01, then `phase_status["01-requirements"]` is `"in_progress"` |
| TC-RB-04 | subsequent phases set to pending | positive | AC-001-02 (REQ-0052) | Given rollback from Phase 06 to Phase 01, then phases 02-06 are all `"pending"` |
| TC-RB-05 | clears iteration state for target phase | positive | AC-001-03 (REQ-0052) | Given rollback to Phase 01, then Phase 01's `test_iteration`, `constitutional_validation`, `interactive_elicitation` are cleared |
| TC-RB-06 | clears iteration state for all subsequent phases | positive | AC-001-03 (REQ-0052) | Given rollback from Phase 06 to Phase 01, then phases 02-06 all have iteration state cleared |
| TC-RB-07 | bumps state_version | positive | AC-001-04 (REQ-0052) | Given `state_version: 50`, when rollback runs, then `state_version` >= 51 |
| TC-RB-08 | no files deleted from disk | positive | AC-001-05 (REQ-0052) | Given artifacts exist in docs/ for multiple phases, when rollback runs, then all artifact files still exist on disk |

### 2.2 Error Handling (FR-001 + FR-002)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RB-09 | returns ERROR when no active workflow | negative | AC-001-06 (REQ-0052) | Given no `active_workflow`, when rollback runs, then output is ERROR with "No active workflow" |
| TC-RB-10 | rejects target phase not in workflow phases | negative | AC-002-01 (REQ-0052) | Given light-mode workflow without Phase 03, when `--to-phase 03-architecture`, then ERROR with "not in this workflow" |
| TC-RB-11 | rejects rollback to current phase | negative | AC-002-02 (REQ-0052) | Given current phase is 06-implementation, when `--to-phase 06-implementation`, then ERROR suggesting retry instead |
| TC-RB-12 | rejects forward rollback | negative | AC-002-03 (REQ-0052) | Given current phase is 06-implementation, when `--to-phase 08-code-review`, then ERROR "Cannot rollback forward" |
| TC-RB-13 | rejects missing --to-phase argument | negative | AC-002-01 (REQ-0052) | Given no `--to-phase` argument, when rollback runs, then ERROR with usage message |

### 2.3 User Confirmation (FR-003)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RB-14 | --confirm flag skips confirmation | positive | AC-003-03 (REQ-0052) | Given `--confirm` flag, when rollback runs, then no interactive prompt is shown and rollback executes |
| TC-RB-15 | without --confirm, output includes confirmation prompt info | positive | AC-003-01 (REQ-0052) | Given no `--confirm` flag, when rollback is called programmatically, then output includes phases that will be reset |
| TC-RB-16 | declined confirmation makes no state changes | positive | AC-003-02 (REQ-0052) | Given user declines confirmation, when rollback processes response, then state.json is unchanged |

### 2.4 Recovery Feedback (FR-004)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RB-17 | output includes from_phase and to_phase | positive | AC-004-01 (REQ-0052) | Given rollback from Phase 06 to Phase 01, then output has `from_phase` and `to_phase` fields |
| TC-RB-18 | output includes phases_reset list | positive | AC-004-01 (REQ-0052) | Given rollback, then output has `phases_reset` array with phase names and old/new statuses |
| TC-RB-19 | output includes artifacts_preserved true | positive | AC-004-01 (REQ-0052) | Given rollback, then output has `artifacts_preserved: true` |
| TC-RB-20 | output includes rollback_count | positive | AC-004-01 (REQ-0052) | Given rollback, then output has `rollback_count` numeric field |
| TC-RB-21 | feedback message lists all reset phases | positive | AC-004-02 (REQ-0052) | Given rollback from Phase 06 to Phase 01, then message lists phases 02-06 as reset |

### 2.5 Rollback Count Tracking (FR-006)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RB-22 | first rollback sets rollback_count to 1 | positive | AC-006-01 (REQ-0052) | Given no prior `rollback_count`, when rollback runs, then `rollback_count` is 1 |
| TC-RB-23 | second rollback increments to 2 | positive | AC-006-02 (REQ-0052) | Given `rollback_count: 1`, when rollback runs, then `rollback_count` is 2 |
| TC-RB-24 | rollback_count does not block gate | positive | AC-006-03 (REQ-0052) | Given `rollback_count: 5`, when gate validation runs, then no blocking |

### 2.6 Recovery Action Flag for Rollback (FR-004 shared + FR-007)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-RB-25 | sets recovery_action with type rollback | positive | AC-004-01 (REQ-0051) | Given rollback runs, then `active_workflow.recovery_action` has `type: "rollback"` |
| TC-RB-26 | recovery_action includes target phase | positive | AC-004-01 (REQ-0051) | Given rollback to Phase 01, then `recovery_action.phase` is `"01-requirements"` |
| TC-RB-27 | recovery_action includes ISO-8601 timestamp | positive | AC-004-01 (REQ-0051) | Given rollback runs, then `recovery_action.timestamp` matches ISO-8601 format |

---

## 3. Unit Tests: V8 Recovery Action Exception

**Test File**: `src/claude/hooks/tests/v8-recovery-action.test.cjs`
**Module**: `src/claude/hooks/lib/state-logic.cjs` (checkPhaseFieldProtection)

### 3.1 V8 Recovery Action for Retry (FR-004)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-V8-01 | recovery_action type=retry allows status regression completed->in_progress | positive | AC-004-02 (REQ-0051) | Given incoming state has `recovery_action: { type: "retry" }` and phase status changes from completed to in_progress, when V8 evaluates, then no block |
| TC-V8-02 | recovery_action type=retry does not allow status regression completed->pending | negative | AC-004-02 (REQ-0051) | Given recovery_action type=retry and status changes completed to pending, when V8 evaluates, then block (retry only allows completed->in_progress) |
| TC-V8-03 | recovery_action type=retry does not affect phase_index check | positive | AC-001-04 (REQ-0051) | Given recovery_action type=retry, when index stays same, then V8 allows (index unchanged, not a regression) |

### 3.2 V8 Recovery Action for Rollback (FR-007)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-V8-04 | recovery_action type=rollback allows phase index regression | positive | AC-007-01 (REQ-0052) | Given incoming state has `recovery_action: { type: "rollback" }` and `current_phase_index` decreases, when V8 evaluates, then no block |
| TC-V8-05 | recovery_action type=rollback allows completed->pending regression | positive | AC-007-02 (REQ-0052) | Given recovery_action type=rollback and multiple phases change from completed to pending, when V8 evaluates, then no block |
| TC-V8-06 | recovery_action type=rollback allows completed->in_progress for target | positive | AC-007-02 (REQ-0052) | Given recovery_action type=rollback and target phase changes completed to in_progress, when V8 evaluates, then no block |

### 3.3 V8 Unchanged Behavior Without Recovery Action (FR-007)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-V8-07 | no recovery_action blocks phase index regression | positive | AC-007-03 (REQ-0052) | Given no `recovery_action` in incoming state, when `current_phase_index` decreases, then V8 blocks |
| TC-V8-08 | no recovery_action blocks status completed->pending | positive | AC-007-03 (REQ-0052) | Given no `recovery_action`, when phase status changes completed to pending, then V8 blocks |
| TC-V8-09 | no recovery_action blocks status completed->in_progress without supervised_review | positive | AC-007-03 (REQ-0052) | Given no `recovery_action` and no `supervised_review`, when status changes completed to in_progress, then V8 blocks |
| TC-V8-10 | supervised_review redo exception still works | positive | AC-007-03 (REQ-0052) | Given `supervised_review.redo_count > 0` (no recovery_action), when status changes completed to in_progress, then V8 allows (backward compat) |
| TC-V8-11 | recovery_action cleared state does not bypass V8 | negative | AC-004-03 (REQ-0051) | Given `recovery_action` was previously set but is now absent, when status regression is attempted, then V8 blocks |
| TC-V8-12 | invalid recovery_action type does not bypass V8 | negative | AC-007-03 (REQ-0052) | Given `recovery_action: { type: "unknown" }`, when status regression is attempted, then V8 blocks |

---

## 4. Integration Tests: Recovery Lifecycle

**Test File**: `src/claude/hooks/tests/workflow-recovery-integration.test.cjs`
**Scope**: Cross-module interactions between retry/rollback scripts and state-logic.cjs

### 4.1 Retry Lifecycle Integration

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-INT-01 | retry writes state that V8 accepts | positive | AC-001-01, AC-004-02 (REQ-0051) | Given retry modifies state.json, when the modified state is evaluated by V8 `checkPhaseFieldProtection`, then no block is returned |
| TC-INT-02 | retry + phase-advance clears recovery_action | positive | AC-004-03 (REQ-0051) | Given retry sets `recovery_action`, when `phase-advance.cjs` advances the phase, then `recovery_action` is no longer in state |
| TC-INT-03 | retry preserves prior completed phases | positive | AC-001-04 (REQ-0051) | Given phases 01-05 completed and current phase is 06, when retry runs, then phases 01-05 remain completed |
| TC-INT-04 | double retry increments count correctly | positive | AC-005-01, AC-005-02 (REQ-0051) | Given first retry sets count=1, when second retry runs, then count=2 and state_version bumped twice total |

### 4.2 Rollback Lifecycle Integration

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-INT-05 | rollback writes state that V8 accepts | positive | AC-001-01, AC-007-01 (REQ-0052) | Given rollback modifies state.json with index regression, when V8 evaluates, then no block (recovery_action present) |
| TC-INT-06 | rollback + work-through-phases + advance works | positive | AC-001-02, AC-007-02 (REQ-0052) | Given rollback to Phase 01 resets phases 02-06, when developer re-advances through phases, then each phase can transition normally |
| TC-INT-07 | rollback clears iteration state in phases record | positive | AC-001-03 (REQ-0052) | Given rollback to Phase 01, when checking `state.phases["06-implementation"]`, then iteration fields are cleared |
| TC-INT-08 | rollback then retry on same phase works | positive | AC-001-01 (REQ-0051), AC-001-01 (REQ-0052) | Given rollback to Phase 01, then retry Phase 01, then both retry_count and rollback_count are tracked independently |

---

## 5. E2E Tests: Retry Script Execution

**Test File**: `src/claude/hooks/tests/workflow-retry.test.cjs` (E2E section)
**Scope**: Spawn `workflow-retry.cjs` as child process, verify stdout/exit code/disk state

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-E2E-RT-01 | successful retry outputs valid JSON to stdout | positive | AC-002-01 (REQ-0051) | Spawn script with active workflow state, assert stdout is valid JSON with `result: "RETRIED"` |
| TC-E2E-RT-02 | retry with no workflow exits with code 2 | negative | AC-001-05 (REQ-0051) | Spawn script with no active_workflow, assert exit code 2 and ERROR in stdout |
| TC-E2E-RT-03 | retry modifies state.json on disk correctly | positive | AC-001-01, AC-001-02, AC-001-03 (REQ-0051) | Spawn script, read state.json from disk after, verify iteration state cleared and retry_count incremented |
| TC-E2E-RT-04 | retry on Phase 06 includes code preservation note | positive | AC-002-03 (REQ-0051) | Spawn script with Phase 06 current, assert output message mentions preserved code |

---

## 6. E2E Tests: Rollback Script Execution

**Test File**: `src/claude/hooks/tests/workflow-rollback.test.cjs` (E2E section)
**Scope**: Spawn `workflow-rollback.cjs` as child process, verify stdout/exit code/disk state

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-E2E-RB-01 | successful rollback outputs valid JSON | positive | AC-004-01 (REQ-0052) | Spawn with `--to-phase 01-requirements --confirm`, assert stdout JSON with `result: "ROLLED_BACK"` |
| TC-E2E-RB-02 | rollback with no workflow exits with code 2 | negative | AC-001-06 (REQ-0052) | Spawn with no active_workflow, assert exit code 2 |
| TC-E2E-RB-03 | rollback modifies state.json on disk correctly | positive | AC-001-01, AC-001-02, AC-001-03, AC-001-04 (REQ-0052) | Spawn, read disk state, verify current_phase changed, subsequent phases pending, iteration cleared |
| TC-E2E-RB-04 | rollback to invalid phase exits with error | negative | AC-002-01 (REQ-0052) | Spawn with `--to-phase 99-nonexistent --confirm`, assert ERROR output |
