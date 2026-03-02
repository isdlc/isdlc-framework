# Test Cases: Item 0.14 -- Standardize Null-Check Patterns

**File Under Test**: `test-adequacy-blocker.cjs`, `state-write-validator.cjs`
**Test File**: `src/claude/hooks/tests/batch-d-null-checks.test.cjs`
**Traces To**: AC-0014-1 through AC-0014-5

---

## TC-14.01: test-adequacy-blocker isUpgradePhaseActive with null state.active_workflow (AC-0014-3, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Precondition**: `isUpgradePhaseActive()` uses optional chaining instead of `&&`-chain
**Input**: State where `active_workflow` is `null`
**Expected**: Returns `false` (empty string startsWith returns false)
**Assertion**: `assert.strictEqual(isUpgradePhaseActive({ active_workflow: null }), false)`

## TC-14.02: test-adequacy-blocker isUpgradePhaseActive with undefined state.active_workflow (AC-0014-3, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State where `active_workflow` is `undefined`
**Expected**: Returns `false`
**Assertion**: `assert.strictEqual(isUpgradePhaseActive({}), false)`

## TC-14.03: test-adequacy-blocker isUpgradePhaseActive with present active_workflow (AC-0014-3, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State with `active_workflow: { current_phase: '15-upgrade-v2' }`
**Expected**: Returns `true` (behavior identical to `&&`-chain)
**Assertion**: `assert.strictEqual(isUpgradePhaseActive({ active_workflow: { current_phase: '15-upgrade-v2' } }), true)`

## TC-14.04: test-adequacy-blocker coverage check with null discovery_context (AC-0014-3, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: ctx with state `{ discovery_context: null }` after upgrade delegation detected
**Expected**: `check()` returns `{ decision: 'allow' }` (fail-open, same as before)
**Assertion**: Verify result.decision === 'allow'

## TC-14.05: test-adequacy-blocker coverage check with present discovery_context (AC-0014-3, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: ctx with state `{ discovery_context: { coverage_summary: { total_tests: 100, unit_test_pct: 80 } } }` after upgrade delegation detected
**Expected**: `check()` returns `{ decision: 'allow' }` (adequate coverage, same as before)
**Assertion**: Verify result.decision === 'allow'

## TC-14.06: state-write-validator validatePhaseIntegrity with null iteration_requirements (AC-0014-4, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: Phase data where `iteration_requirements` is `null` or `undefined`
**Expected**: No warnings generated for V2 (elicitation) and V3 (test_iteration) rules (same as `&&`-chain returning `undefined`)
**Assertion**: Warning array length is 0 for the elicitation/test_iteration checks

## TC-14.07: state-write-validator validatePhaseIntegrity with present iteration_requirements.interactive_elicitation (AC-0014-4, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: Phase data with `iteration_requirements: { interactive_elicitation: { completed: true, menu_interactions: 3 } }`
**Expected**: No warning for V2 rule (completed elicitation with valid menu count)
**Assertion**: No V2-related warning in output

## TC-14.08: state-write-validator checkVersionLock with null incomingState (AC-0014-4, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State write where incoming JSON parses to object with `active_workflow` as `null`
**Expected**: `checkVersionLock()` returns `null` (nothing to check, same as before)
**Assertion**: Result is `null`

## TC-14.09: state-write-validator checkVersionLock with null diskState active_workflow (AC-0014-4, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: Disk state has `active_workflow: null`, incoming has valid active_workflow
**Expected**: `checkVersionLock()` returns `null` (workflow init, same as before)
**Assertion**: Result is `null`

## TC-14.10: state-write-validator checkVersionLock with both present (AC-0014-4, AC-0014-5)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: Both disk and incoming have valid `active_workflow` with matching `current_phase_index`
**Expected**: `checkVersionLock()` returns `null` (no regression detected)
**Assertion**: Result is `null`
