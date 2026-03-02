# Test Cases: BUG-0007 Batch A Gate Bypass Bugs

**Phase**: 05-test-strategy (TDD RED)
**Workflow**: fix (tdd_red_phase)
**Date**: 2026-02-15
**Artifact Folder**: BUG-0007-batch-a-gate-bypass-bugs

---

## Test Approach: TDD RED

All tests are written to **FAIL against the current (unfixed) code**. They will pass only after the fixes are applied in Phase 06. This ensures the test suite validates the actual bug behavior, not just the happy path.

---

## Bug 0.1: Dual Phase-Status Tracking Bypass (gate-blocker.cjs)

**Test File**: `src/claude/hooks/tests/gate-blocker-phase-status-bypass.test.cjs`
**Module Under Test**: `src/claude/hooks/gate-blocker.cjs` (exported `check()`)
**Strategy**: Call `check()` directly with crafted ctx objects. The bug causes early-return at line 646 when `active_workflow.phase_status[phase] === 'completed'`, bypassing all five requirement checks. Tests assert that the gate BLOCKS when `state.phases` has unsatisfied requirements, even if `phase_status` says completed.

### TC-01a: Gate blocks when phase_status=completed but constitutional_validation unsatisfied (AC-01a, AC-01d)

- **Given**: `active_workflow.phase_status['05-test-strategy'] = 'completed'` AND `state.phases['05-test-strategy'].constitutional_validation.completed = false`
- **When**: `check()` is called with a gate advancement input
- **Then**: Result decision is `'block'` (not `'allow'`)
- **TDD RED reason**: Current code returns `{ decision: 'allow' }` at line 648 due to early-return bypass
- **Priority**: P0

### TC-01b: Gate blocks when phase_status=completed but interactive_elicitation unsatisfied (AC-01a, AC-01d)

- **Given**: `active_workflow.phase_status['01-requirements'] = 'completed'` AND `state.phases['01-requirements'].iteration_requirements.interactive_elicitation.completed = false`
- **When**: `check()` is called with a gate advancement input
- **Then**: Result decision is `'block'` (not `'allow'`)
- **TDD RED reason**: Current code returns `{ decision: 'allow' }` at line 648
- **Priority**: P0

### TC-01c: Gate allows when all state.phases requirements satisfied regardless of phase_status (AC-01b, AC-01c)

- **Given**: `state.phases['05-test-strategy']` has all requirements satisfied AND `active_workflow.phase_status['05-test-strategy']` is absent/undefined
- **When**: `check()` is called with a gate advancement input
- **Then**: Result decision is `'allow'`
- **TDD RED status**: This test should PASS (GREEN) -- it validates the existing happy path, not the bug
- **Priority**: P0

### TC-01d: Gate blocks when phase_status absent and requirements unsatisfied (AC-01b)

- **Given**: `active_workflow.phase_status` does not contain the current phase AND `state.phases` has unsatisfied constitutional_validation
- **When**: `check()` is called with a gate advancement input
- **Then**: Result decision is `'block'`
- **TDD RED status**: This test should PASS (GREEN) -- it validates the existing requirement check path
- **Priority**: P1

### TC-01e: Gate blocks when phase_status=completed but test_iteration unsatisfied (AC-01a, AC-01d)

- **Given**: `active_workflow.phase_status['06-implementation'] = 'completed'` AND `state.phases['06-implementation'].iteration_requirements.test_iteration.completed = false`
- **When**: `check()` is called with a gate advancement input
- **Then**: Result decision is `'block'` (not `'allow'`)
- **TDD RED reason**: Current code early-returns with allow
- **Priority**: P0

### TC-01f: Regression -- non-gate-advancement input still allowed (AC-01e)

- **Given**: Input is a non-gate-advancement tool call (e.g., Read tool)
- **When**: `check()` is called
- **Then**: Result decision is `'allow'`
- **TDD RED status**: PASS (GREEN) -- regression test
- **Priority**: P1

---

## Bug 0.2: PHASE_STATUS_ORDINAL Verification (state-write-validator.cjs)

**Test File**: `src/claude/hooks/tests/state-write-validator-null-safety.test.cjs`
**Strategy**: Simple verification test confirming the constant exists and is correct.

### TC-02a: PHASE_STATUS_ORDINAL is defined with correct values (AC-02a)

- **Given**: The state-write-validator.cjs module is loaded
- **When**: We inspect the source for PHASE_STATUS_ORDINAL definition
- **Then**: The constant maps pending->0, in_progress->1, completed->2
- **TDD RED status**: PASS (GREEN) -- verification only, bug already fixed
- **Priority**: P1

---

## Bug 0.3: Null Safety Gap in checkVersionLock (state-write-validator.cjs)

**Test File**: `src/claude/hooks/tests/state-write-validator-null-safety.test.cjs`
**Module Under Test**: `src/claude/hooks/state-write-validator.cjs` (exported `check()`)
**Strategy**: Call `check()` with Write events where the `tool_input.content` contains valid JSON that parses to non-object values. The bug causes a TypeError (caught silently as fail-open) instead of an explicit null guard with debug log.

Because `checkVersionLock` is internal, we test through the public `check()` function. To distinguish between "explicit null guard return null" and "caught TypeError return null", we check stderr for the expected debug log message. After the fix, null/primitive inputs should produce a V7 debug log about "not an object" rather than an error log about "version check error".

### TC-03a: null JSON content produces explicit guard, not TypeError (AC-03a, AC-03b)

- **Given**: A Write event with `tool_input.content = "null"` and `file_path` matching `.isdlc/state.json`
- **When**: `check()` is called (via subprocess with `SKILL_VALIDATOR_DEBUG=true`)
- **Then**: stderr contains "not an object" (explicit guard message) AND does NOT contain "version check error" (TypeError message)
- **TDD RED reason**: Current code throws TypeError, which is caught and logged as "version check error"
- **Priority**: P0

### TC-03b: numeric JSON content produces explicit guard (AC-03a, AC-03c)

- **Given**: A Write event with `tool_input.content = "42"` targeting state.json
- **When**: `check()` is called via subprocess
- **Then**: stderr contains "not an object" guard message
- **TDD RED reason**: `JSON.parse("42")` returns 42 (number), then `42.state_version` is `undefined` (no TypeError, but no guard either) -- actually this takes a different path. Let me reconsider: `(42).state_version` is `undefined`, so `incomingVersion` = undefined, which hits the backward-compat check at line 131 and returns null. This path does NOT throw. However, the explicit guard should still trigger BEFORE the property access. After the fix, we expect the "not an object" debug log. Currently, no such log appears.
- **Priority**: P0

### TC-03c: boolean JSON content produces explicit guard (AC-03c)

- **Given**: A Write event with `tool_input.content = "true"` targeting state.json
- **When**: `check()` is called via subprocess
- **Then**: stderr contains "not an object" guard message
- **TDD RED reason**: Current code accesses `true.state_version` (undefined, no TypeError for booleans), but no explicit guard log is emitted
- **Priority**: P1

### TC-03d: string JSON content produces explicit guard (AC-03c)

- **Given**: A Write event with `tool_input.content = '"hello"'` targeting state.json
- **When**: `check()` is called via subprocess
- **Then**: stderr contains "not an object" guard message
- **TDD RED reason**: Current code accesses `"hello".state_version` (undefined), no explicit guard
- **Priority**: P1

### TC-03e: valid object content proceeds normally (AC-03d, AC-03e)

- **Given**: A Write event with `tool_input.content = '{"state_version": 5}'` targeting state.json, disk file has `state_version: 5`
- **When**: `check()` is called
- **Then**: Result decision is `'allow'` (or null pass-through), stderr does NOT contain "not an object"
- **TDD RED status**: PASS (GREEN) -- existing behavior for valid objects is unchanged
- **Priority**: P0

### TC-03f: null JSON on disk side produces explicit guard (AC-03f)

- **Given**: A Write event with valid content `{"state_version": 5}` but the disk state.json contains `null` (literally the string "null")
- **When**: `check()` is called via subprocess
- **Then**: stderr contains "not an object" guard message for disk side
- **TDD RED reason**: Current code parses disk "null" as null, then `null.state_version` throws TypeError in inner try/catch
- **Priority**: P0

### TC-03g: debug messages are descriptive (AC-03g)

- **Given**: Any of the above non-object inputs
- **When**: The guard triggers
- **Then**: The debug message includes contextual information (e.g., "incoming state is not an object" or "disk state is not an object")
- **TDD RED reason**: No such messages exist in current code
- **Priority**: P1

---

## NFR Test Cases

### TC-NFR-01: Fail-open on infrastructure error (NFR-01)

- **Covered by**: TC-03a through TC-03d implicitly -- null guard returns null (fail-open), does not block
- **Priority**: P0

### TC-NFR-02: Backward-compatible with existing state.json (NFR-02)

- **Covered by**: TC-03e -- valid objects proceed as before
- **Priority**: P0

### TC-NFR-03: CJS-only (.cjs, no ESM syntax) (NFR-03)

- **Covered by**: Test files themselves use `require()` / `module.exports` pattern
- **Priority**: P1

---

## Summary

| Bug | Test Count | RED (Failing) | GREEN (Passing) | Priority Breakdown |
|-----|-----------|---------------|-----------------|-------------------|
| 0.1 | 6 | 3 (TC-01a, TC-01b, TC-01e) | 3 (TC-01c, TC-01d, TC-01f) | 4 P0, 2 P1 |
| 0.2 | 1 | 0 | 1 (TC-02a) | 1 P1 |
| 0.3 | 7 | 5 (TC-03a, TC-03b, TC-03c, TC-03d, TC-03f) | 2 (TC-03e, TC-03g covered by others) | 4 P0, 3 P1 |
| **Total** | **14** | **8** | **6** | **8 P0, 6 P1** |
