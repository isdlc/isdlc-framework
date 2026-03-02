# Test Cases: Item 0.16 -- Dead Code Removal in gate-blocker.cjs

**File Under Test**: `src/claude/hooks/gate-blocker.cjs`
**Test File**: `src/claude/hooks/tests/batch-d-dead-code-removal.test.cjs`
**Traces To**: AC-0016-1 through AC-0016-3

---

## TC-16.01: gate-blocker resolves currentPhase from active_workflow.current_phase (AC-0016-2, AC-0016-3)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Precondition**: gate-blocker `check()` is called with a gate advancement input
**Input**: State with `active_workflow: { current_phase: '06-implementation', type: 'fix', current_phase_index: 0, phases: ['06-implementation'], phase_status: { '06-implementation': 'in_progress' } }`, iteration enforcement enabled, valid phase data
**Expected**: `check()` uses `active_workflow.current_phase` (behavior identical to before simplification)
**Assertion**: Result does not return early with `{ decision: 'allow' }` due to missing phase -- it proceeds to gate check

## TC-16.02: gate-blocker resolves currentPhase from state.current_phase when no active_workflow (AC-0016-2, AC-0016-3)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State with no `active_workflow` (falsy), but `current_phase: '01-requirements'` set at top level, iteration enforcement enabled
**Expected**: `check()` resolves `currentPhase` to `'01-requirements'` via simplified else branch (`currentPhase = state.current_phase` instead of the redundant `state.active_workflow?.current_phase || state.current_phase`)
**Assertion**: Result does not return early with `{ decision: 'allow' }` due to missing currentPhase -- it proceeds to gate check using `'01-requirements'`

## TC-16.03: gate-blocker allows when no active_workflow and no current_phase (AC-0016-2, AC-0016-3)

**Priority**: P0
**Type**: Unit (behavior preservation)
**Input**: State with no `active_workflow` and no `current_phase` (both undefined)
**Expected**: `check()` hits the `if (!currentPhase)` guard and returns `{ decision: 'allow' }` (behavior identical -- the redundant optional chaining also evaluated to undefined here)
**Assertion**: `assert.strictEqual(result.decision, 'allow')`

## TC-16.04: gate-blocker else branch no longer references state.active_workflow?.current_phase (AC-0016-1)

**Priority**: P0
**Type**: Unit (content verification)
**Input**: Read `gate-blocker.cjs` source
**Expected**: The else branch after the `if (activeWorkflow)` block does NOT contain `state.active_workflow?.current_phase`. It should be simplified to `currentPhase = state.current_phase;`
**Assertion**: Source file content check -- the else block does not contain the redundant optional chaining expression

## TC-16.05: gate-blocker fallback to state.current_phase preserves flow for active_workflow with missing current_phase (AC-0016-2, AC-0016-3)

**Priority**: P1
**Type**: Unit (behavior preservation)
**Input**: State with `active_workflow: { type: 'fix' }` (no `current_phase` property), and `current_phase: '02-tracing'` at top level
**Expected**: `check()` uses `state.current_phase` as fallback (the `||` in `activeWorkflow.current_phase || state.current_phase`) -- behavior preserved
**Assertion**: The gate check proceeds against `'02-tracing'`, not an early allow
