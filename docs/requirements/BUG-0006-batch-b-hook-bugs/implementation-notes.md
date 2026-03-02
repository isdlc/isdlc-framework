# BUG-0006: Batch B Hook Bugs -- Implementation Notes

**Phase:** 06-implementation
**Date:** 2026-02-15
**Agent:** software-developer
**Iteration:** 2 (1 fix cycle + 1 action-name correction)

---

## Summary

Fixed 4 hook bugs in 3 production files. All 48 tests pass (21 previously RED, now GREEN). Zero regressions across the full 935-test CJS suite (43 pre-existing workflow-finalizer failures unchanged).

---

## Fixes Applied

### BUG 0.6: Dispatcher null context (FR-01, AC-06a--AC-06f)

**File:** `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` (lines 100--108)

**Change:** Added `|| {}` null-coalescing to all four loader calls:

```javascript
const state = readState() || {};
const manifest = loadManifest() || {};
const requirements = loadIterationRequirements() || {};
const workflows = loadWorkflowDefinitions() || {};
```

**Rationale:** When `.isdlc/state.json` or config files are missing/malformed, loaders return null. Previously, null was passed directly to hooks via `ctx`, forcing each hook to independently guard against null context fields. The fix ensures hooks always receive a consistent non-null context. The `hasActiveWorkflow()` guard correctly returns false for `{}` state, so all guarded hooks are safely skipped.

**Test helper update:** Also updated `buildBuggyCtx()` in the test file to match the fixed dispatcher pattern (coalescing null to `{}`), since this helper simulates the dispatcher's context-building logic.

### BUG 0.7: test-adequacy-blocker wrong phase detection (FR-02, AC-07a--AC-07f)

**File:** `src/claude/hooks/test-adequacy-blocker.cjs` (lines 35, 62)

**Changes:**
1. `isUpgradeDelegation()` line 35: Removed `phase.startsWith('16-')` and `phase.startsWith('14-upgrade')`, replaced with `phase.startsWith('15-upgrade')`.
2. `isUpgradePhaseActive()` line 62: Same fix -- replaced `phase.startsWith('16-') || phase.startsWith('14-upgrade')` with `phase.startsWith('15-upgrade')`.

**Rationale:** The `16-` prefix incorrectly matched `16-quality-loop`, causing quality loop delegations to trigger upgrade-specific test adequacy checks. The `14-upgrade` prefix was stale (the upgrade workflow uses `15-upgrade-plan` and `15-upgrade-execute` phase keys). The dispatcher's `shouldActivate` guard already correctly uses `'15-upgrade'`, so this fix makes the internal functions consistent.

### BUG 0.11: Menu tracker unsafe nested init (FR-03, AC-11a--AC-11d)

**File:** `src/claude/hooks/menu-tracker.cjs` (line 167)

**Change:** Replaced simple falsy check with full type guard:

```javascript
const iterReqs = state.phases[currentPhase].iteration_requirements;
if (!iterReqs || typeof iterReqs !== 'object' || Array.isArray(iterReqs)) {
    state.phases[currentPhase].iteration_requirements = {};
}
```

**Rationale:** The original `if (!value)` check passes for truthy non-objects (`true`, `1`, `"corrupted"`). When such values exist (from state corruption), subsequent access to `.interactive_elicitation` causes a TypeError. The fix catches: null/undefined (falsy), non-object types (boolean, number, string), and arrays (typeof === 'object' but not a plain object).

### BUG 0.12: Phase timeout advisory degradation hint (FR-04, AC-12a--AC-12e)

**File:** `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` (lines 111--125)

**Change:** After the existing `console.error()` timeout warning and `logHookEvent()` call, added a structured JSON degradation hint:

```javascript
const hint = {
    type: 'timeout_degradation',
    phase: timeout.phase,
    elapsed: timeout.elapsed,
    limit: timeout.limit,
    actions: ['reduce_debate_rounds', 'reduce_parallelism', 'skip_optional_steps']
};
console.error(`DEGRADATION_HINT: ${JSON.stringify(hint)}`);
```

**Rationale:** The timeout warning was advisory-only -- a human-readable text message with no actionable structure. Downstream agents had no machine-readable signal to degrade gracefully. The hint provides a parseable JSON object with recommended actions. It is wrapped in its own try/catch to maintain fail-open behavior (AC-12d) -- errors in hint generation never block the dispatcher.

---

## Test Results

| Test File | Tests | Pass | Fail |
|-----------|-------|------|------|
| dispatcher-null-context.test.cjs | 14 | 14 | 0 |
| test-adequacy-phase-detection.test.cjs | 16 | 16 | 0 |
| menu-tracker-unsafe-init.test.cjs | 10 | 10 | 0 |
| dispatcher-timeout-hints.test.cjs | 8 | 8 | 0 |
| **Total (new)** | **48** | **48** | **0** |

**Full CJS suite:** 935 tests, 892 pass, 43 fail (all pre-existing in workflow-finalizer.test.cjs).

---

## Design Decisions

1. **Null coalescing at dispatcher level (BUG 0.6):** Chose to fix at the source (dispatcher context construction) rather than adding null guards to individual hooks. This follows the principle of fixing bugs at the earliest point in the data flow.

2. **Single prefix check (BUG 0.7):** Removed both the `16-` and `14-upgrade` checks rather than just one. The `14-upgrade` prefix was stale and would never match real workflow phases, so keeping it would be dead code.

3. **Three-part type guard (BUG 0.11):** The guard checks `!iterReqs` (null/undefined), `typeof iterReqs !== 'object'` (primitives), and `Array.isArray(iterReqs)` (arrays). This is defensive but necessary since state.json can be hand-edited or corrupted by concurrent writes.

4. **Separate try/catch for hint (BUG 0.12):** The hint generation has its own try/catch inside the timeout check's try/catch. This ensures that a failure in JSON.stringify or property access during hint construction cannot affect the existing timeout warning or the dispatcher's overall fail-open behavior.

---

## Traceability

| Bug | FR | ACs Verified | Files Modified |
|-----|-----|-------------|----------------|
| 0.6 | FR-01 | AC-06a, AC-06b, AC-06c, AC-06d, AC-06e, AC-06f | pre-task-dispatcher.cjs |
| 0.7 | FR-02 | AC-07a, AC-07b, AC-07c, AC-07d, AC-07e, AC-07f | test-adequacy-blocker.cjs |
| 0.11 | FR-03 | AC-11a, AC-11b, AC-11c, AC-11d | menu-tracker.cjs |
| 0.12 | FR-04 | AC-12a, AC-12b, AC-12c, AC-12d, AC-12e | pre-task-dispatcher.cjs |
