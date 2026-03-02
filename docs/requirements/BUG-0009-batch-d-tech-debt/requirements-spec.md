# BUG-0009: Batch D Tech Debt — Hook Maintainability Fixes

**Type:** Fix (batched tech debt)
**Priority:** Low
**Severity:** Maintainability
**Status:** Approved
**Created:** 2026-02-15

---

## Summary

Four low-priority tech debt items from BACKLOG.md Batch D (items 0.13-0.16). All target hook files in `src/claude/hooks/` and `src/claude/hooks/lib/common.cjs`. These are maintainability improvements — no behavioral changes to hook enforcement logic.

---

## Bug Reports

### BUG 0.13: Hardcoded Phase Prefixes in Hook Files

**Description:** Phase category strings like `startsWith('15-upgrade')` are scattered across `gate-blocker.cjs`, `skill-validator.cjs`, `test-adequacy-blocker.cjs`, and `dispatchers/pre-task-dispatcher.cjs`. Should be centralized in a `PHASE_CATEGORIES` constant exported from `lib/common.cjs`.

**Current Locations:**
- `test-adequacy-blocker.cjs:35` — `phase.startsWith('15-upgrade')`
- `test-adequacy-blocker.cjs:61` — `phase.startsWith('15-upgrade')`
- `dispatchers/pre-task-dispatcher.cjs:73` — `phase.startsWith('15-upgrade')`
- `dispatchers/pre-task-dispatcher.cjs:81` — `phase === '06-implementation'`
- `skill-validator.cjs:95` — `'01-requirements'` as default fallback
- `plan-surfacer.cjs:268` — `currentPhase === '06-implementation'`

**Expected:** Single `PHASE_CATEGORIES` or `PHASE_PREFIXES` constant in `lib/common.cjs` that all hooks import, reducing copy-paste errors when phase naming changes.

**Acceptance Criteria:**
- AC-0013-1: A `PHASE_PREFIXES` constant is exported from `lib/common.cjs`
- AC-0013-2: `test-adequacy-blocker.cjs` uses the constant instead of inline `'15-upgrade'` strings
- AC-0013-3: `dispatchers/pre-task-dispatcher.cjs` uses the constant instead of inline phase strings
- AC-0013-4: `skill-validator.cjs` uses the constant for the `'01-requirements'` default
- AC-0013-5: `plan-surfacer.cjs` uses the constant for `'06-implementation'` check
- AC-0013-6: No behavioral changes — all hook outputs remain identical

### BUG 0.14: Inconsistent Null-Check Patterns Across Hooks

**Description:** Mix of optional chaining (`state?.active_workflow?.current_phase`) and explicit checks (`if (state && state.active_workflow)`) across hook files. Should standardize on optional chaining (`?.`) as the project convention since it is more concise and equally safe.

**Decision:** Standardize on optional chaining (`?.`) for property access, explicit `if` checks only when a side-effect or early return depends on the null check.

**Acceptance Criteria:**
- AC-0014-1: `gate-blocker.cjs` null-check patterns are consistent (optional chaining for reads)
- AC-0014-2: `skill-validator.cjs` null-check patterns are consistent
- AC-0014-3: `test-adequacy-blocker.cjs` null-check patterns are consistent
- AC-0014-4: `state-write-validator.cjs` null-check patterns are consistent
- AC-0014-5: No behavioral changes — all hook outputs remain identical

### BUG 0.15: `detectPhaseDelegation()` Undocumented

**Description:** `detectPhaseDelegation()` in `src/claude/hooks/lib/common.cjs` is called by 5+ hooks but has no JSDoc documenting its parameters, return shape, or edge cases. Maintenance risk for new contributors.

**Acceptance Criteria:**
- AC-0015-1: `detectPhaseDelegation()` has a JSDoc comment documenting params, return type, and purpose
- AC-0015-2: Return shape `{ isDelegation: boolean, targetPhase: string|null, agentName: string|null }` is documented
- AC-0015-3: Edge cases documented: non-Task tool calls return `NOT_DELEGATION`, setup commands are excluded, manifest-based agent matching, phase pattern regex fallback
- AC-0015-4: No code changes — documentation only

### BUG 0.16: Dead Code in gate-blocker.cjs

**Description:** `gate-blocker.cjs` lines around 606-607 (post BUG-0008 fixes, line numbers may have shifted) contain a redundant fallback branch that can never execute. The primary branch at line 577-584 already resolves `currentPhase` via `activeWorkflow.current_phase || state.current_phase`. The `else` branch at 606-607 that also sets `currentPhase` is dead code.

**Note:** Due to BUG-0008 fixes, the original line numbers (606-607) from the BACKLOG may have shifted. The dead code is the `else` block after the `if (activeWorkflow)` block that attempts to set `currentPhase` from `state.current_phase` — this is redundant because the `if` branch already falls through to `state.current_phase`.

**Acceptance Criteria:**
- AC-0016-1: Dead fallback branch is identified and removed
- AC-0016-2: The remaining code path correctly resolves `currentPhase` for all cases (with and without active workflow)
- AC-0016-3: No behavioral changes — all hook outputs remain identical

---

## Non-Functional Requirements

- NFR-1: Zero behavioral changes — all existing tests must continue to pass
- NFR-2: No new runtime dependencies
- NFR-3: All changes must be backward-compatible with existing hook protocol

---

## Files Affected

| File | Items | Change Type |
|------|-------|-------------|
| `src/claude/hooks/lib/common.cjs` | 0.13, 0.15 | Add constant + JSDoc |
| `src/claude/hooks/gate-blocker.cjs` | 0.13, 0.14, 0.16 | Refactor + remove dead code |
| `src/claude/hooks/skill-validator.cjs` | 0.13, 0.14 | Refactor |
| `src/claude/hooks/test-adequacy-blocker.cjs` | 0.13, 0.14 | Refactor |
| `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` | 0.13 | Refactor |
| `src/claude/hooks/plan-surfacer.cjs` | 0.13 | Refactor |
| `src/claude/hooks/state-write-validator.cjs` | 0.14 | Refactor |

---

## Traceability

| AC | Requirement | BACKLOG Item |
|----|-------------|-------------|
| AC-0013-1 through AC-0013-6 | Centralize phase prefixes | 0.13 |
| AC-0014-1 through AC-0014-5 | Consistent null checks | 0.14 |
| AC-0015-1 through AC-0015-4 | Document detectPhaseDelegation | 0.15 |
| AC-0016-1 through AC-0016-3 | Remove dead code | 0.16 |
