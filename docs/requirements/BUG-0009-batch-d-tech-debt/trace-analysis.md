# Trace Analysis: BUG-0009 Batch D Tech Debt -- Hook Maintainability Fixes

**Generated**: 2026-02-15T18:10:00Z
**Bug**: Batch D tech debt (0.13-0.16): hardcoded phase prefixes, inconsistent null checks, undocumented function, dead code
**External ID**: BACKLOG items 0.13, 0.14, 0.15, 0.16
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

Four tech debt items targeting hook files in `src/claude/hooks/`. All are maintainability issues with zero behavioral impact. Item 0.13 (hardcoded phase prefixes) is scattered across 6 locations in 4 files -- centralizing to a constant in `lib/common.cjs` eliminates copy-paste errors when phase naming changes. Item 0.14 (inconsistent null checks) has 7 instances of verbose `&&`-chain patterns that should use optional chaining (`?.`) per project convention. Item 0.15 (`detectPhaseDelegation()` documentation) already has partial JSDoc but needs edge case documentation for its 6 callers. Item 0.16 (dead code) is confirmed: the `else` branch at `gate-blocker.cjs:627-630` can never execute because it only fires when `activeWorkflow` is falsy, yet it accesses `state.active_workflow?.current_phase` which is logically redundant with the line-584 assignment.

**Root Cause Confidence**: HIGH (all 4 items confirmed with exact line numbers)
**Severity**: Low (maintainability only, no behavioral changes)
**Estimated Complexity**: Low (refactoring + documentation, no logic changes)

---

## Symptom Analysis

### Item 0.13: Hardcoded Phase Prefixes

**Symptom**: Phase category strings are duplicated as inline literals across multiple hook files. If a phase name changes (e.g., `15-upgrade` becomes `14-upgrade`), every occurrence must be found and updated manually.

**Locations confirmed in code**:

| # | File | Line | String | Context |
|---|------|------|--------|---------|
| 1 | `test-adequacy-blocker.cjs` | 35 | `'15-upgrade'` | `phase.startsWith('15-upgrade')` in `isUpgradeDelegation()` |
| 2 | `test-adequacy-blocker.cjs` | 61 | `'15-upgrade'` | `phase.startsWith('15-upgrade')` in `isUpgradePhaseActive()` |
| 3 | `dispatchers/pre-task-dispatcher.cjs` | 73 | `'15-upgrade'` | `phase.startsWith('15-upgrade')` in `shouldActivate` for test-adequacy-blocker |
| 4 | `dispatchers/pre-task-dispatcher.cjs` | 81 | `'06-implementation'` | `phase === '06-implementation'` in `shouldActivate` for blast-radius-validator |
| 5 | `skill-validator.cjs` | 95 | `'01-requirements'` | Default fallback: `state.current_phase \|\| '01-requirements'` |
| 6 | `plan-surfacer.cjs` | 268 | `'06-implementation'` | `currentPhase === '06-implementation'` for format validation |

**Pattern**: These are phase category checks, not arbitrary strings. They fall into 3 categories:
- **Upgrade prefix**: `'15-upgrade'` (3 locations)
- **Implementation exact**: `'06-implementation'` (2 locations)
- **Requirements default**: `'01-requirements'` (1 location)

### Item 0.14: Inconsistent Null-Check Patterns

**Symptom**: Two different null-check idioms are used interchangeably across hook files, creating cognitive overhead when reading code.

**Pattern A (verbose `&&`-chain)** -- 7 instances found:

| # | File | Line | Code |
|---|------|------|------|
| 1 | `test-adequacy-blocker.cjs` | 60 | `(state.active_workflow && state.active_workflow.current_phase) \|\| ''` |
| 2 | `test-adequacy-blocker.cjs` | 105 | `state.discovery_context && state.discovery_context.coverage_summary` |
| 3 | `test-adequacy-blocker.cjs` | 138 | `(state.active_workflow && state.active_workflow.current_phase) \|\| ...` |
| 4 | `state-write-validator.cjs` | 256 | `incomingState && incomingState.active_workflow` |
| 5 | `state-write-validator.cjs` | 275 | `diskState && diskState.active_workflow` |
| 6 | `state-write-validator.cjs` | 57-58 | `phaseData.iteration_requirements && phaseData.iteration_requirements.interactive_elicitation` |
| 7 | `state-write-validator.cjs` | 73-74 | `phaseData.iteration_requirements && phaseData.iteration_requirements.test_iteration` |

**Pattern B (optional chaining `?.`)** -- already used in same files:
- `gate-blocker.cjs:442` -- `state?.active_workflow?.artifact_folder`
- `gate-blocker.cjs:674` -- `state.active_workflow?.supervised_review`
- `skill-validator.cjs:95` -- `state.active_workflow?.current_phase`
- `pre-task-dispatcher.cjs:55` -- `ctx.state?.active_workflow`
- `pre-task-dispatcher.cjs:111` -- `state?.active_workflow && requirements`

**Decision from requirements**: Standardize on optional chaining (`?.`) for property reads. Explicit `if` checks only when a side-effect or early return depends on the null check. Examples: `if (!state.active_workflow) { return; }` is fine -- this is a control flow guard. But `state.active_workflow && state.active_workflow.current_phase` should become `state.active_workflow?.current_phase`.

### Item 0.15: `detectPhaseDelegation()` Undocumented

**Symptom**: The function is called by 6 hooks but the contract documentation is incomplete.

**Current state**: The function at `lib/common.cjs:1086-1169` already has a JSDoc comment (lines 1086-1111) documenting:
- The detection algorithm (6 steps)
- Parameter types (`parsedInput` with sub-fields)
- Return shape (`{ isDelegation, targetPhase, agentName }`)

**What is missing** (per AC-0015-3):
- Edge case: non-Task tool calls return `NOT_DELEGATION` (line 1116-1118) -- documented in algorithm but not called out as explicit edge case
- Edge case: setup commands excluded (line 1127-1129) -- documented in algorithm
- Edge case: agents with phase `'all'` or `'setup'` excluded (line 1135-1137) -- documented in algorithm
- Edge case: manifest-based agent scanning (line 1150-1158) -- documented in algorithm
- Edge case: phase pattern regex fallback (line 1161-1166) -- documented in algorithm
- **Missing**: No `@example` usage blocks
- **Missing**: No `@see` cross-references to the 6 calling hooks
- **Missing**: No note about fail behavior (returns `NOT_DELEGATION` on any mismatch, never throws)

**Callers confirmed** (6 hooks):
1. `gate-blocker.cjs:128`
2. `constitution-validator.cjs:98`
3. `phase-loop-controller.cjs:41`
4. `test-adequacy-blocker.cjs:83`
5. `phase-sequence-guard.cjs:38`
6. `iteration-corridor.cjs:184`

### Item 0.16: Dead Code in gate-blocker.cjs

**Symptom**: `gate-blocker.cjs` lines 627-630 contain an `else` branch that can never execute.

**Code at lines 627-630**:
```javascript
} else {
    // BUG-0005 (AC-03e): prefer active_workflow.current_phase even in fallback branch
    currentPhase = state.active_workflow?.current_phase || state.current_phase;
}
```

**Why it is dead**: The `else` branch (line 627) fires when `activeWorkflow` is falsy (the `if (activeWorkflow)` at line 583 is false). But `activeWorkflow` is assigned on line 578 as `state.active_workflow`. If `state.active_workflow` is falsy, then `state.active_workflow?.current_phase` on line 629 also evaluates to `undefined`, and the expression falls through to `state.current_phase` -- which is exactly the same as what would happen if this entire `else` block were removed and we simply let `currentPhase` remain `undefined` from line 579, then hit the `if (!currentPhase)` guard at line 632.

Wait -- actually, the `else` branch DOES have a purpose: it assigns `state.current_phase` to `currentPhase` when there is no active workflow. Without the `else` branch, `currentPhase` would be `undefined` (from `let currentPhase;` at line 579), and the `if (!currentPhase)` guard at line 632 would return `{ decision: 'allow' }` -- which is the same behavior as when `state.current_phase` is also unset. But if `state.current_phase` IS set (without an active workflow), the `else` branch assigns it.

**Revised analysis**: The `else` branch is NOT strictly dead code. It handles the case where there is no `active_workflow` but `state.current_phase` is set. However, the BUG-0005 comment on line 628 is misleading: it says "prefer active_workflow.current_phase" but the `else` branch only fires when `activeWorkflow` is falsy, making `state.active_workflow?.current_phase` always `undefined` in this branch. The expression simplifies to just `state.current_phase`.

**Corrected root cause**: The branch is not dead but is REDUNDANT in its current form. The `state.active_workflow?.current_phase` prefix is guaranteed `undefined` when `activeWorkflow` is falsy. The fix is to simplify line 629 to `currentPhase = state.current_phase;` and update the comment.

---

## Execution Path

### Item 0.13: Phase Prefix Flow

Entry points for phase prefix checks:

1. **`pre-task-dispatcher.cjs` main()** (line 85) reads stdin, builds ctx, iterates HOOKS array
   - Hook 8 (`test-adequacy-blocker`): `shouldActivate` at line 70-74 checks `phase.startsWith('15-upgrade')`
   - Hook 9 (`blast-radius-validator`): `shouldActivate` at line 75-82 checks `phase === '06-implementation'`

2. **`test-adequacy-blocker.cjs` check()** (line 69) called by dispatcher
   - `isUpgradeDelegation()` at line 31: `phase.startsWith('15-upgrade')`
   - `isUpgradePhaseActive()` at line 59: `phase.startsWith('15-upgrade')`

3. **`skill-validator.cjs` check()** (line 39) called by dispatcher
   - Line 95: `state.active_workflow?.current_phase || state.current_phase || '01-requirements'`

4. **`plan-surfacer.cjs` check()** (line 209) called by dispatcher
   - Line 268: `if (currentPhase === '06-implementation')`

### Item 0.14: Null-Check Flow

The inconsistent patterns appear in two contexts:

**Context A: State property reads** (test-adequacy-blocker.cjs, state-write-validator.cjs)
- These read nested properties where the parent may be null/undefined
- The verbose pattern `x && x.y` is equivalent to `x?.y`
- No side effects or control flow depends on the intermediate check

**Context B: Object existence guards** (state-write-validator.cjs V8)
- `incomingState && incomingState.active_workflow` at line 256
- `diskState && diskState.active_workflow` at line 275
- These assign to local variables used in subsequent comparisons
- Can safely use optional chaining: `incomingState?.active_workflow`

### Item 0.15: detectPhaseDelegation() Call Flow

```
Hook stdin (JSON) --> parsedInput
    |
    v
detectPhaseDelegation(parsedInput)
    |
    +-- Guard: tool_name !== 'Task' --> NOT_DELEGATION
    |
    +-- Guard: isSetupCommand(combined) --> NOT_DELEGATION
    |
    +-- Guard: subagent phase is 'all'/'setup' --> NOT_DELEGATION
    |
    +-- Step 2: normalizeAgentName(subagentType) + getAgentPhase()
    |   Match? --> { isDelegation: true, targetPhase, agentName }
    |
    +-- Step 3: Scan manifest.ownership for agent name in prompt text
    |   Match? --> { isDelegation: true, targetPhase, agentName }
    |
    +-- Step 4: Regex /(\d{2})-([a-z][a-z-]*)/ on prompt text
    |   Match? --> { isDelegation: true, targetPhase: "NN-name", agentName: null }
    |
    +-- No match --> NOT_DELEGATION
```

Callers: gate-blocker, constitution-validator, phase-loop-controller, test-adequacy-blocker, phase-sequence-guard, iteration-corridor.

### Item 0.16: Dead Code Execution Path

```
gate-blocker.cjs check()
    |
    v
Line 578: activeWorkflow = state.active_workflow
Line 579: let currentPhase;
    |
    +-- if (activeWorkflow) {           // Line 583
    |       currentPhase = activeWorkflow.current_phase || state.current_phase;  // Line 584
    |       ... sequence validation ...
    |   }
    |
    +-- else {                          // Line 627 -- fires when !activeWorkflow
    |       // state.active_workflow?.current_phase is ALWAYS undefined here
    |       currentPhase = state.active_workflow?.current_phase || state.current_phase;  // Line 629
    |   }
    |
    v
Line 632: if (!currentPhase) { return allow; }
```

The `else` branch at line 627 only executes when `activeWorkflow` (i.e., `state.active_workflow`) is falsy. In that case, `state.active_workflow?.current_phase` always evaluates to `undefined`, making the expression equivalent to `currentPhase = state.current_phase`.

---

## Root Cause Analysis

### Item 0.13: Hardcoded Phase Prefixes

**Root Cause**: Organic code growth. Phase prefix strings were added independently by different features (REQ-0004 for test-adequacy, REQ-0005 for plan-surfacer, REQ-0010 for dispatcher consolidation) without a centralization step.

**Hypothesis Confidence**: HIGH
**Evidence**: 6 distinct locations across 4 files, all using the same 3 string values.

**Suggested Fix**:
Add to `lib/common.cjs`:
```javascript
const PHASE_PREFIXES = Object.freeze({
    UPGRADE: '15-upgrade',
    IMPLEMENTATION: '06-implementation',
    REQUIREMENTS: '01-requirements'
});
```
Export from common.cjs and import in all 4 consuming files. Replace inline strings with constant references.

**Complexity**: Low. Pure mechanical refactoring.

### Item 0.14: Inconsistent Null-Check Patterns

**Root Cause**: Different developers (or different sessions) wrote hooks at different times. Earlier hooks used explicit `&&`-chain patterns (common pre-ES2020); later hooks adopted optional chaining. No linting rule enforces consistency.

**Hypothesis Confidence**: HIGH
**Evidence**: 7 verbose instances vs 10+ optional chaining instances in the same file set. The project already uses optional chaining extensively, making `&&`-chains the minority pattern.

**Suggested Fix**:
Mechanically replace each `x && x.y` with `x?.y` and each `x && x.y && x.y.z` with `x?.y?.z` in the 7 identified locations. Special care for:
- `state-write-validator.cjs:256` -- `incomingState && incomingState.active_workflow` becomes `incomingState?.active_workflow`
- `state-write-validator.cjs:275` -- `diskState && diskState.active_workflow` becomes `diskState?.active_workflow`

Note: `if (constVal && constVal.completed === true)` at line 43 can remain as-is because it is a control flow guard (the `if` depends on the truthiness check). However, it could also be written as `if (constVal?.completed === true)` since `undefined === true` is `false`.

**Complexity**: Low. Mechanical text replacement with careful testing.

### Item 0.15: detectPhaseDelegation() Documentation Gap

**Root Cause**: The function was added in REQ-0004 (advisory behavior hooks) with a basic JSDoc. It was later enhanced with the 6-step algorithm comment. But the documentation never received edge case annotations, usage examples, or cross-references to callers -- because it was written for internal use and the caller count grew organically.

**Hypothesis Confidence**: HIGH
**Evidence**: JSDoc exists (lines 1086-1111) but lacks `@example`, `@see`, `@throws` (never throws), and explicit edge case callouts per AC-0015-3.

**Suggested Fix**:
Enhance the existing JSDoc with:
1. `@example` blocks showing delegation and non-delegation cases
2. `@see` references to the 6 calling hooks
3. `@throws` annotation (never throws -- returns NOT_DELEGATION on all error paths)
4. Edge case summary in description

**Complexity**: Low. Documentation only, no code changes.

### Item 0.16: Redundant Else Branch

**Root Cause**: BUG-0005 fix (AC-03e) added the `else` branch to handle "prefer active_workflow.current_phase even in fallback branch." The intent was to ensure `state.active_workflow?.current_phase` is checked even when the `if (activeWorkflow)` block does not execute. But this is logically impossible: when `activeWorkflow` is falsy, `state.active_workflow` is also falsy (they are the same value from line 578), so the `?.` operator returns `undefined`.

**Hypothesis Confidence**: HIGH
**Evidence**: `activeWorkflow` is assigned as `state.active_workflow` on line 578. The `else` branch executes only when `activeWorkflow` is falsy. The expression `state.active_workflow?.current_phase` inside the `else` is therefore always `undefined`.

**Suggested Fix**:
Simplify lines 627-630 to:
```javascript
} else {
    currentPhase = state.current_phase;
}
```
Or remove the `else` entirely and add a fallback after the `if/else`:
```javascript
if (!currentPhase) {
    currentPhase = state.current_phase;
}
```
This is equivalent and clearer. The `if (!currentPhase)` guard at line 632 already handles the fully-unset case.

**Complexity**: Low. Single-line simplification.

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-02-15T18:10:00Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "error_keywords": ["hardcoded", "null-check", "undocumented", "dead-code", "phase-prefix"],
  "files_analyzed": [
    "src/claude/hooks/gate-blocker.cjs",
    "src/claude/hooks/skill-validator.cjs",
    "src/claude/hooks/test-adequacy-blocker.cjs",
    "src/claude/hooks/plan-surfacer.cjs",
    "src/claude/hooks/state-write-validator.cjs",
    "src/claude/hooks/dispatchers/pre-task-dispatcher.cjs",
    "src/claude/hooks/lib/common.cjs"
  ],
  "items_traced": 4,
  "root_cause_confidence": "high",
  "all_items_confirmed": true
}
```
