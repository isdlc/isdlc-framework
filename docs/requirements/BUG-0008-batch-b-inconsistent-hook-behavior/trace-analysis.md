# BUG-0008 Trace Analysis

**Traced:** 2026-02-15
**Confidence:** HIGH (all 3 bugs confirmed with exact line numbers)
**File:** `src/claude/hooks/gate-blocker.cjs`

---

## Bug 0.4 — Phase Index Bounds Not Validated

**Root Cause:** Lines 588-604 use `phaseIndex` to index into `workflowPhases` without bounds or type validation.

**Code path:**
1. Line 588: `workflowPhases = activeWorkflow.phases || workflowDef.phases` -- could be null/undefined if both are missing
2. Line 589: `phaseIndex = activeWorkflow.current_phase_index` -- could be negative, NaN, string, or out-of-bounds
3. Line 592: `workflowPhases[phaseIndex]` -- if workflowPhases is null/undefined, this throws TypeError
4. Line 592: If phaseIndex is -1 or NaN, `workflowPhases[-1]` returns `undefined`, causing false mismatch -> incorrect block
5. Line 601: `phaseIndex >= workflowPhases.length - 1` -- if workflowPhases is null, throws TypeError

**Fix:** Add guard at start of the `if (workflowDef)` block:
1. Validate `Array.isArray(workflowPhases)` and `workflowPhases.length > 0`
2. Validate `typeof phaseIndex === 'number' && Number.isFinite(phaseIndex) && phaseIndex >= 0`
3. Skip sequence validation if either fails (fail-safe per Article X)

**Blast radius:** LOW -- guard wraps existing code, no behavioral change for valid inputs.

---

## Bug 0.5 — Empty Workflows Object Prevents Fallback Loading

**Root Cause:** Line 581 uses `||` which treats `{}` as truthy, so `ctx.workflows = {}` prevents fallback loading.

**Code path:**
1. Line 581: `const workflows = ctx.workflows || loadWorkflowDefinitionsFromCommon() || loadWorkflowDefinitions()`
2. If `ctx.workflows === {}`, `||` short-circuits -- fallbacks never run
3. Line 582: `if (workflows && workflows.workflows)` -- `{}.workflows` is undefined, so check fails
4. `workflowDef` stays null -- sequence validation silently skips

**Fix:** Replace `||` chain with a function that checks for actual content:
```javascript
const workflows = (ctx.workflows?.workflows ? ctx.workflows : null)
    || loadWorkflowDefinitionsFromCommon()
    || loadWorkflowDefinitions();
```
Or equivalently, validate that the loaded object has a `.workflows` property before accepting it.

**Blast radius:** LOW -- only changes which source is selected, not what happens with it.

---

## Bug 0.8 — Supervised Review Doesn't Coordinate with Gate-Blocker

**Root Cause:** Lines 736-740 explicitly log "Gate check unaffected" during supervised review, meaning the gate allows advancement even while a human is reviewing.

**Code path:**
1. Line 737: Checks `supervised_review.status === 'reviewing'`
2. Line 738: Logs info-level message saying gate is unaffected
3. Lines 742-746: If all iteration checks pass (or self-healed), gate allows advancement
4. Result: Agent can advance past a phase that has an active human review

**Fix:** Convert the info log into a blocking check. Before the iteration requirements loop (or as an early return after it), check supervised review status:
- `'reviewing'` -> block with message "supervised review pending"
- `'rejected'` -> block with message "supervised review rejected"
- `'approved'` or absent -> allow (proceed to normal gate logic)

The supervised review check should be early in the flow (before iteration requirements check) since it is a hard organizational gate, not a technical one.

**Blast radius:** LOW-MEDIUM -- changes gate behavior when supervised review is active. This is the intended behavior that was missing.

---

## Summary

| Bug | Root Cause | Fix Approach | Blast Radius | Confidence |
|-----|-----------|-------------|-------------|------------|
| 0.4 | No bounds/type check on phaseIndex, no array check on workflowPhases | Add validation guards | LOW | HIGH |
| 0.5 | Truthy `{}` bypasses `\|\|` fallback chain | Check for `.workflows` sub-property before accepting | LOW | HIGH |
| 0.8 | Supervised review explicitly ignored by gate-blocker | Convert info log to blocking check | LOW-MEDIUM | HIGH |
