# Test Strategy: BUG-0006 Batch B Hook Bugs

**Phase:** 05-test-strategy
**Workflow:** fix (TDD)
**Created:** 2026-02-15
**Bugs Covered:** 0.6, 0.7, 0.11, 0.12
**Acceptance Criteria:** 21 (AC-06a..f, AC-07a..f, AC-11a..d, AC-12a..e)

---

## Existing Infrastructure

- **Framework:** `node:test` (CJS)
- **Assertion Library:** `node:assert/strict`
- **Test Location:** `src/claude/hooks/tests/*.test.cjs`
- **Run Command:** `node --test src/claude/hooks/tests/*.test.cjs`
- **Existing Test Count:** 54 hook test files
- **Conventions:** CJS modules, `describe/it` blocks, direct `check()` function imports, subprocess testing for standalone mode

## Strategy: TDD RED-First

This is a **bug fix workflow**. All tests are designed to **FAIL against the current (buggy) code** and **PASS after fixes are applied**. This proves:

1. The tests correctly detect each bug
2. The fixes resolve each bug
3. No regressions are introduced

## Test Approach

| Bug | Approach | Reason |
|-----|----------|--------|
| 0.6 (Dispatcher null context) | Direct `check()` function call via context injection | The dispatcher's `main()` function is async and reads stdin/files; testing via injected `ctx` objects with null fields directly exercises the bug path without filesystem setup |
| 0.7 (Wrong phase detection) | Direct function import + call | `isUpgradeDelegation()`, `isUpgradePhaseActive()`, and `check()` are exported; test them directly with controlled inputs |
| 0.11 (Menu tracker unsafe init) | Direct `check()` function call | The `check()` function accepts `ctx` with injected state; corrupt the `iteration_requirements` field in the state to trigger the bug |
| 0.12 (Timeout advisory-only) | Subprocess testing (spawnSync) | The timeout degradation hint is emitted to stderr via `console.error()` during `main()` execution; must test the full main() flow |

## Test Files

| File | Bug | Test Count | Priority |
|------|-----|------------|----------|
| `dispatcher-null-context.test.cjs` | 0.6 | 8 | HIGH (6 AC + 2 regression) |
| `test-adequacy-phase-detection.test.cjs` | 0.7 | 8 | HIGH (6 AC + 2 regression) |
| `menu-tracker-unsafe-init.test.cjs` | 0.11 | 6 | MEDIUM (4 AC + 2 edge cases) |
| `dispatcher-timeout-hints.test.cjs` | 0.12 | 7 | MEDIUM (5 AC + 2 edge cases) |

**Total:** 29 test cases covering 21 acceptance criteria

## Coverage Targets

- **Requirement Coverage:** 100% (all 21 ACs)
- **Branch Coverage:** All null/undefined/corrupted input paths
- **Fail-Open Verification:** All tests confirm hooks do not crash or block on error

## Test Data Strategy

All test data is inline in the test files (no external fixtures needed). Each test constructs minimal `ctx` objects with only the fields needed for the specific test path.

### BUG 0.6 Test Data
- `ctx.state = null` (readState returns null)
- `ctx.manifest = null` (loadManifest returns null)
- `ctx.requirements = null` (loadIterationRequirements returns null)
- `ctx.workflows = null` (loadWorkflowDefinitions returns null)
- Combined: all four null simultaneously

### BUG 0.7 Test Data
- `delegation.targetPhase = '16-quality-loop'` (should NOT match upgrade)
- `delegation.targetPhase = '15-upgrade-plan'` (should match upgrade)
- `delegation.targetPhase = '15-upgrade-execute'` (should match upgrade)
- `delegation.targetPhase = '14-upgrade-plan'` (old prefix, should NOT match)
- `state.active_workflow.current_phase = '16-quality-loop'` (should NOT be upgrade)
- `state.active_workflow.current_phase = '15-upgrade-plan'` (should be upgrade)

### BUG 0.11 Test Data
- `iteration_requirements = true` (truthy non-object)
- `iteration_requirements = "corrupted"` (string)
- `iteration_requirements = 42` (number)
- `iteration_requirements = null` (null -- should init to {})
- `iteration_requirements = {}` (valid -- should preserve)
- `iteration_requirements = { interactive_elicitation: { completed: false } }` (valid with data)

### BUG 0.12 Test Data
- State with phase that has exceeded timeout (started_at in the past)
- Requirements with `timeout_minutes` set to 1 minute
- Verify structured JSON in stderr output

## TDD RED Verification

Before implementation (Phase 06), these tests are expected to:

| Bug | Expected RED Result |
|-----|-------------------|
| 0.6 | Tests calling hooks with `ctx.state = null` will pass (because fail-open catches TypeError), but tests asserting `ctx.state` is `{}` after dispatch will fail since the dispatcher does not currently coalesce nulls |
| 0.7 | `isUpgradeDelegation({isDelegation:true, targetPhase:'16-quality-loop'})` currently returns `true` (bug); test asserts `false` -> FAIL |
| 0.11 | `check()` with `iteration_requirements = true` currently throws TypeError caught by fail-open; test asserts state was properly initialized -> FAIL |
| 0.12 | Test asserts stderr contains `DEGRADATION_HINT` JSON; current code only emits text warning -> FAIL |

## Non-Functional Requirements

- **NFR-01 (Fail-Open):** All tests verify hooks do not crash or throw uncaught exceptions
- **NFR-02 (Backward Compatibility):** Tests include regression cases with valid inputs
- **NFR-03 (Performance):** Tests use timeout: 5000ms per test (well above 5ms budget)

## Traceability

| AC | Test File | Test Name |
|----|-----------|-----------|
| AC-06a | dispatcher-null-context.test.cjs | ctx.state defaults to {} when readState returns null |
| AC-06b | dispatcher-null-context.test.cjs | ctx.manifest defaults to {} when loadManifest returns null |
| AC-06c | dispatcher-null-context.test.cjs | ctx.requirements defaults to {} when loadIterationRequirements returns null |
| AC-06d | dispatcher-null-context.test.cjs | ctx.workflows defaults to {} when loadWorkflowDefinitions returns null |
| AC-06e | dispatcher-null-context.test.cjs | hasActiveWorkflow returns false when ctx.state is {} |
| AC-06f | dispatcher-null-context.test.cjs | existing hooks with valid context still work correctly |
| AC-07a | test-adequacy-phase-detection.test.cjs | isUpgradeDelegation returns false for 16-quality-loop |
| AC-07b | test-adequacy-phase-detection.test.cjs | isUpgradeDelegation returns true for 15-upgrade-plan |
| AC-07c | test-adequacy-phase-detection.test.cjs | isUpgradePhaseActive returns false for 16-quality-loop |
| AC-07d | test-adequacy-phase-detection.test.cjs | isUpgradePhaseActive returns true for 15-upgrade-plan |
| AC-07e | test-adequacy-phase-detection.test.cjs | dispatcher shouldActivate uses 15-upgrade prefix |
| AC-07f | test-adequacy-phase-detection.test.cjs | quality loop delegations do not trigger test adequacy |
| AC-11a | menu-tracker-unsafe-init.test.cjs | resets truthy non-object iteration_requirements to {} |
| AC-11b | menu-tracker-unsafe-init.test.cjs | initializes null iteration_requirements to {} |
| AC-11c | menu-tracker-unsafe-init.test.cjs | preserves valid object iteration_requirements |
| AC-11d | menu-tracker-unsafe-init.test.cjs | interactive_elicitation init logic unchanged |
| AC-12a | dispatcher-timeout-hints.test.cjs | structured JSON emitted in stderr when timeout exceeded |
| AC-12b | dispatcher-timeout-hints.test.cjs | JSON hint includes type, phase, elapsed, limit, actions |
| AC-12c | dispatcher-timeout-hints.test.cjs | actions include reduce_debate_rounds and skip_optional_steps |
| AC-12d | dispatcher-timeout-hints.test.cjs | errors in hint generation do not block (fail-open) |
| AC-12e | dispatcher-timeout-hints.test.cjs | human-readable warning preserved alongside hint |
