# BUG-0008: Batch B - Inconsistent Hook Behavior in gate-blocker.cjs

**Type:** Bug Fix (Batch)
**Priority:** High
**Status:** Active
**Created:** 2026-02-15
**File:** `src/claude/hooks/gate-blocker.cjs`

---

## Bug Summary

Three high-severity inconsistent behavior bugs in `gate-blocker.cjs` that cause incorrect gate decisions under edge conditions.

---

## Bug 0.4 — Phase Index Bounds Not Validated

**Severity:** High
**Location:** `gate-blocker.cjs` lines 588-604

### Description
The gate-blocker reads `activeWorkflow.current_phase_index` (line 589) and uses it to index into `workflowPhases` (line 592) without validating:
1. That `phaseIndex` is not negative
2. That `workflowPhases` is actually an array before indexing

If `current_phase_index` is `-1` or a string, or if `workflowPhases` is undefined/null, the code will produce incorrect comparisons or throw at runtime.

### Expected Behavior
- Negative `phaseIndex` values should be treated as invalid and allow the operation (fail-safe per Article X)
- Non-array `workflowPhases` should be treated as missing and skip sequence validation
- Out-of-bounds `phaseIndex >= workflowPhases.length` should be handled gracefully

### Acceptance Criteria
- **AC-04a**: When `current_phase_index` is negative, gate-blocker allows the operation (fail-safe)
- **AC-04b**: When `current_phase_index` is not a finite number, gate-blocker allows the operation
- **AC-04c**: When `workflowPhases` is not an array, sequence validation is skipped
- **AC-04d**: When `workflowPhases` is an empty array, sequence validation is skipped
- **AC-04e**: When `phaseIndex >= workflowPhases.length`, gate-blocker does not throw
- **AC-04f**: Valid phase index and array combinations continue to work as before (no regression)

---

## Bug 0.5 — Empty Workflows Object Prevents Fallback Loading

**Severity:** High
**Location:** `gate-blocker.cjs` lines 581-584

### Description
Line 581 uses `ctx.workflows || loadWorkflowDefinitionsFromCommon() || loadWorkflowDefinitions()` to load workflow definitions. The `||` operator treats an empty object `{}` as truthy, so if `ctx.workflows` is `{}` (no `workflows` property inside), the fallback loaders never trigger. This means `workflowDef` will be `undefined` (since `{}.workflows` is `undefined`), and sequence validation silently skips.

### Expected Behavior
- An empty `ctx.workflows` (or one without a `.workflows` sub-object) should trigger fallback loading
- Fallback chain: `ctx.workflows` (if has `.workflows`) -> `loadWorkflowDefinitionsFromCommon()` -> `loadWorkflowDefinitions()`

### Acceptance Criteria
- **AC-05a**: When `ctx.workflows` is `{}`, fallback loaders are invoked
- **AC-05b**: When `ctx.workflows` is `{ workflows: {} }`, it is used (empty workflows is valid structure)
- **AC-05c**: When `ctx.workflows` is `null` or `undefined`, fallback loaders are invoked
- **AC-05d**: When `ctx.workflows` has a valid `.workflows` object, it is used directly (no fallback)
- **AC-05e**: When all sources fail (null/empty), `workflowDef` is null and sequence validation is skipped gracefully

---

## Bug 0.8 — Supervised Review Doesn't Coordinate with Gate-Blocker

**Severity:** High
**Location:** `gate-blocker.cjs` lines 736-740

### Description
When supervised review is active (`state.active_workflow.supervised_review.status === 'reviewing'`), the gate-blocker explicitly logs "Gate check unaffected" and does NOT block advancement. This means an agent can advance past a phase that is currently under supervised human review, undermining the entire purpose of supervised mode.

### Expected Behavior
- When `supervised_review.status === 'reviewing'`, the gate-blocker should BLOCK phase advancement
- The block message should indicate that supervised review is pending
- When `supervised_review.status === 'approved'` or absent, normal gate behavior applies

### Acceptance Criteria
- **AC-08a**: When `supervised_review.status === 'reviewing'`, gate-blocker blocks advancement
- **AC-08b**: Block message includes "supervised review" and the phase under review
- **AC-08c**: When `supervised_review.status === 'approved'`, gate-blocker does NOT block for review
- **AC-08d**: When `supervised_review` is absent or null, gate-blocker does NOT block for review
- **AC-08e**: When `supervised_review.status === 'rejected'`, gate-blocker blocks with rejection message
- **AC-08f**: Supervised review blocking is checked BEFORE iteration requirements (early exit)

---

## Non-Functional Requirements

- **NFR-01**: All fixes must maintain fail-safe behavior (Article X) -- infrastructure errors allow, genuine violations block
- **NFR-02**: All fixes in `gate-blocker.cjs` only -- no cross-file changes
- **NFR-03**: Zero regressions in existing gate-blocker tests
- **NFR-04**: Each fix must have corresponding test coverage with TDD (Article II)

---

## Traceability

| Bug | Backlog Item | File | Lines | ACs |
|-----|-------------|------|-------|-----|
| 0.4 | BACKLOG 0.4 | gate-blocker.cjs | 588-604 | AC-04a through AC-04f |
| 0.5 | BACKLOG 0.5 | gate-blocker.cjs | 581-584 | AC-05a through AC-05e |
| 0.8 | BACKLOG 0.8 | gate-blocker.cjs | 736-740 | AC-08a through AC-08f |
