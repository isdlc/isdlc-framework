# Test Cases: Item 0.13 -- Centralize Hardcoded Phase Prefixes

**File Under Test**: `src/claude/hooks/lib/common.cjs`, `test-adequacy-blocker.cjs`, `dispatchers/pre-task-dispatcher.cjs`, `skill-validator.cjs`, `plan-surfacer.cjs`
**Test File**: `src/claude/hooks/tests/batch-d-phase-prefixes.test.cjs`
**Traces To**: AC-0013-1 through AC-0013-6

---

## TC-13.01: PHASE_PREFIXES constant exists and is exported (AC-0013-1)

**Priority**: P0
**Type**: Unit
**Precondition**: `lib/common.cjs` has been modified to include `PHASE_PREFIXES`
**Input**: `require('../lib/common.cjs').PHASE_PREFIXES`
**Expected**: Object with properties `UPGRADE`, `IMPLEMENTATION`, `REQUIREMENTS`
**Assertion**: `assert.ok(PHASE_PREFIXES)`, `assert.strictEqual(typeof PHASE_PREFIXES, 'object')`

## TC-13.02: PHASE_PREFIXES is frozen (immutable) (AC-0013-1)

**Priority**: P0
**Type**: Unit
**Input**: `Object.isFrozen(PHASE_PREFIXES)`
**Expected**: `true`
**Assertion**: `assert.ok(Object.isFrozen(PHASE_PREFIXES))`

## TC-13.03: PHASE_PREFIXES values match original inline strings (AC-0013-1)

**Priority**: P0
**Type**: Unit
**Input**: Access `PHASE_PREFIXES.UPGRADE`, `.IMPLEMENTATION`, `.REQUIREMENTS`
**Expected**:
- `PHASE_PREFIXES.UPGRADE === '15-upgrade'`
- `PHASE_PREFIXES.IMPLEMENTATION === '06-implementation'`
- `PHASE_PREFIXES.REQUIREMENTS === '01-requirements'`
**Assertion**: Three `assert.strictEqual` checks

## TC-13.04: test-adequacy-blocker isUpgradeDelegation uses constant (AC-0013-2, AC-0013-6)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: Delegation object with `targetPhase: '15-upgrade-v2'`
**Expected**: `isUpgradeDelegation()` returns `true` (same as before)
**Assertion**: `assert.strictEqual(isUpgradeDelegation({ isDelegation: true, targetPhase: '15-upgrade-v2' }), true)`

## TC-13.05: test-adequacy-blocker isUpgradePhaseActive uses constant (AC-0013-2, AC-0013-6)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State with `active_workflow.current_phase = '15-upgrade-packages'`
**Expected**: `isUpgradePhaseActive()` returns `true` (same as before)
**Assertion**: `assert.strictEqual(isUpgradePhaseActive({ active_workflow: { current_phase: '15-upgrade-packages' } }), true)`

## TC-13.06: test-adequacy-blocker isUpgradePhaseActive returns false for non-upgrade (AC-0013-6)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State with `active_workflow.current_phase = '06-implementation'`
**Expected**: `isUpgradePhaseActive()` returns `false`
**Assertion**: `assert.strictEqual(isUpgradePhaseActive({ active_workflow: { current_phase: '06-implementation' } }), false)`

## TC-13.07: pre-task-dispatcher test-adequacy shouldActivate uses constant (AC-0013-3, AC-0013-6)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: ctx with `state.active_workflow.current_phase = '15-upgrade'`
**Expected**: HOOKS[7] (test-adequacy-blocker) `shouldActivate` returns `true`
**Note**: Access HOOKS array by requiring the dispatcher or test the `shouldActivate` function inline

## TC-13.08: pre-task-dispatcher blast-radius shouldActivate uses constant (AC-0013-3, AC-0013-6)

**Priority**: P1
**Type**: Unit (behavior preservation)
**Input**: ctx with `state.active_workflow = { current_phase: '06-implementation', type: 'feature' }`
**Expected**: HOOKS[8] (blast-radius-validator) `shouldActivate` returns `true`

## TC-13.09: skill-validator default phase fallback uses constant (AC-0013-4, AC-0013-6)

**Priority**: P1
**Type**: Unit (behavior preservation)
**Input**: State with no `active_workflow.current_phase` and no `current_phase`
**Expected**: Skill validator resolves phase to `'01-requirements'` (the default)
**Note**: This is tested by invoking `check()` with empty phase state and verifying it does not error

## TC-13.10: plan-surfacer implementation phase check uses constant (AC-0013-5, AC-0013-6)

**Priority**: P1
**Type**: Unit (behavior preservation)
**Input**: State with `current_phase = '06-implementation'`, tasks.md exists
**Expected**: Plan surfacer enters format validation branch (behavior preserved)
**Note**: Test by providing a valid tasks file and verifying the format validation path executes
