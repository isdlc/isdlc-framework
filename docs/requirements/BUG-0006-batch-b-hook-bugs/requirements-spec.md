# BUG-0006: Batch B Hook Bugs

**Type:** Bug Fix (batch)
**Priority:** High (0.6, 0.7), Medium (0.11, 0.12)
**Created:** 2026-02-15
**Status:** In Progress

---

## Summary

Four hook bugs affecting reliability and correctness of the pre-task dispatcher, test-adequacy blocker, and menu tracker hooks. These bugs range from null-context crashes to incorrect phase matching and missing enforcement behavior.

---

## Bug Reports

### Bug 0.6: Dispatcher passes null context to all hooks

- **Severity:** High
- **File:** `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs`
- **Lines:** 100-108
- **Symptom:** All 9 consolidated hooks receive a context object where `state`, `manifest`, `requirements`, and `workflows` may be null. Each hook must independently guard against null values, leading to inconsistent null handling across hooks.
- **Root Cause:** `readState()`, `loadManifest()`, `loadIterationRequirements()`, and `loadWorkflowDefinitions()` can all return null. The dispatcher passes these directly into `ctx` without validation or safe defaults.
- **Expected:** The dispatcher should provide safe default values (empty objects) for null returns, so hooks receive a consistent, non-null context.
- **Actual:** Hooks receive `ctx.state = null`, `ctx.manifest = null`, etc., causing each hook to need its own null guards (some missing, leading to potential crashes).
- **Reproduction:** Run the dispatcher when `.isdlc/state.json` does not exist or is malformed. Hooks that access `ctx.state.active_workflow` without null-checking will throw TypeError.

### Bug 0.7: test-adequacy-blocker fires on wrong phases

- **Severity:** High
- **File:** `src/claude/hooks/test-adequacy-blocker.cjs`
- **Lines:** 35, 61-62
- **Symptom:** Quality loop delegations (phase `16-quality-loop`) incorrectly trigger the upgrade-specific test adequacy validation. This causes false-positive blocks on non-upgrade workflows.
- **Root Cause:** `isUpgradeDelegation()` at line 35 checks `phase.startsWith('16-')` alongside `phase.startsWith('14-upgrade')`. Phase `16-quality-loop` is NOT an upgrade phase, but it matches the `'16-'` prefix. Similarly, `isUpgradePhaseActive()` at line 62 has the same `'16-'` check.
- **Also in dispatcher:** `pre-task-dispatcher.cjs` line 70-73 has a `shouldActivate` guard that also checks `phase.startsWith('15-upgrade')` -- this is the correct prefix for the upgrade workflow (which uses `15-upgrade-plan` and `15-upgrade-execute`), but the test-adequacy-blocker internally still uses `'16-'` and `'14-upgrade'` which are inconsistent with the actual workflow phase keys.
- **Expected:** Test adequacy blocker should ONLY fire for upgrade workflow phases (`15-upgrade-plan`, `15-upgrade-execute`).
- **Actual:** Fires for both upgrade phases AND quality loop phases (`16-quality-loop`), blocking legitimate quality loop work.
- **Reproduction:** Start a feature workflow, reach Phase 16 (quality loop). The test-adequacy-blocker activates and may block the delegation.

### Bug 0.11: Menu tracker unsafe nested object initialization

- **Severity:** Medium
- **File:** `src/claude/hooks/menu-tracker.cjs`
- **Lines:** 165-172
- **Symptom:** TypeError when `state.phases[phase].iteration_requirements` exists but is not an object (e.g., corrupted to a string or number).
- **Root Cause:** Line 167 checks `if (!state.phases[currentPhase].iteration_requirements)` but does not verify the value is actually an object. If it's a truthy non-object value (e.g., `true`, `1`, `"corrupted"`), the code proceeds to access `.interactive_elicitation` on it, throwing a TypeError.
- **Expected:** The hook should type-check `iteration_requirements` and reset it to `{}` if it's not a proper object.
- **Actual:** TypeError: Cannot read properties of string/number (reading 'interactive_elicitation').
- **Reproduction:** Manually corrupt `state.json` by setting `phases["01-requirements"].iteration_requirements = true`, then trigger the menu tracker.

### Bug 0.12: Phase timeout advisory-only -- never enforced

- **Severity:** Medium
- **File:** `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs`
- **Lines:** 111-125
- **Symptom:** Phase timeout warnings are logged to stderr but have no enforcement effect. Performance budgets are silently exceeded without triggering any degradation actions.
- **Root Cause:** The timeout check at lines 111-125 calls `checkPhaseTimeout()` and logs a warning via `console.error()` and `logHookEvent()`, but takes no further action. There is no mechanism to reduce debate rounds, cap parallelism, or escalate when a phase exceeds its time budget.
- **Expected:** When timeout is exceeded, the dispatcher should include degradation hints in stderr output (structured JSON with recommended actions) that downstream agents can act on, such as reducing debate rounds or skipping optional sub-steps.
- **Actual:** Warning message printed to stderr, no structured hints, no degradation.
- **Reproduction:** Set a short `timeout_minutes` in iteration-requirements.json for a phase, wait for it to exceed, observe only a text warning with no actionable output.

---

## Functional Requirements

### FR-01: Null-safe dispatcher context (Bug 0.6)
The pre-task dispatcher MUST provide safe default values for all context fields when the underlying loaders return null. Hooks MUST receive `ctx.state` as `{}`, `ctx.manifest` as `{}`, `ctx.requirements` as `{}`, and `ctx.workflows` as `{}` instead of null.

### FR-02: Correct upgrade phase detection (Bug 0.7)
The test-adequacy-blocker MUST only activate for upgrade workflow phases. The `isUpgradeDelegation()` function MUST NOT match quality loop phases (`16-*`). Phase prefixes MUST match the actual workflow definition keys (`15-upgrade-plan`, `15-upgrade-execute`).

### FR-03: Type-safe iteration requirements initialization (Bug 0.11)
The menu tracker MUST type-check `iteration_requirements` before accessing nested properties. If the value is not a plain object, it MUST be reset to `{}`.

### FR-04: Structured timeout degradation hints (Bug 0.12)
When a phase timeout is exceeded, the dispatcher MUST include a structured JSON degradation hint in the stderr output alongside the human-readable warning. The hint MUST include recommended actions (reduce debate rounds, skip optional steps, escalate).

---

## Acceptance Criteria

### Bug 0.6 (Dispatcher null context)
- **AC-06a:** When `readState()` returns null, `ctx.state` MUST be `{}` (empty object), not null.
- **AC-06b:** When `loadManifest()` returns null, `ctx.manifest` MUST be `{}`, not null.
- **AC-06c:** When `loadIterationRequirements()` returns null, `ctx.requirements` MUST be `{}`, not null.
- **AC-06d:** When `loadWorkflowDefinitions()` returns null, `ctx.workflows` MUST be `{}`, not null.
- **AC-06e:** The `hasActiveWorkflow()` guard MUST still correctly return false when `ctx.state` is `{}`.
- **AC-06f:** Existing hooks that already handle null gracefully MUST NOT change behavior.

### Bug 0.7 (Wrong phase detection)
- **AC-07a:** `isUpgradeDelegation()` MUST NOT return true when `targetPhase` starts with `'16-'`.
- **AC-07b:** `isUpgradeDelegation()` MUST return true when `targetPhase` starts with `'15-upgrade'`.
- **AC-07c:** `isUpgradePhaseActive()` MUST NOT return true when phase is `'16-quality-loop'`.
- **AC-07d:** `isUpgradePhaseActive()` MUST return true when phase starts with `'15-upgrade'`.
- **AC-07e:** The dispatcher `shouldActivate` guard for test-adequacy-blocker MUST use `'15-upgrade'` prefix, not `'16-'`.
- **AC-07f:** Quality loop delegations in feature/fix workflows MUST NOT trigger test adequacy checks.

### Bug 0.11 (Unsafe nested init)
- **AC-11a:** When `iteration_requirements` is a non-object truthy value, it MUST be reset to `{}`.
- **AC-11b:** When `iteration_requirements` is null/undefined, it MUST be initialized to `{}`.
- **AC-11c:** When `iteration_requirements` is a valid object, it MUST be preserved unchanged.
- **AC-11d:** The fix MUST NOT affect the `interactive_elicitation` initialization logic.

### Bug 0.12 (Timeout advisory-only)
- **AC-12a:** When `checkPhaseTimeout()` returns `exceeded: true`, a structured JSON object MUST be included in stderr output.
- **AC-12b:** The JSON hint MUST include `{ type: "timeout_degradation", phase, elapsed, limit, actions: [...] }`.
- **AC-12c:** Recommended actions MUST include at minimum: `"reduce_debate_rounds"` and `"skip_optional_steps"`.
- **AC-12d:** The timeout check MUST remain fail-open (Article X) -- errors in hint generation MUST NOT block.
- **AC-12e:** The existing human-readable warning MUST be preserved alongside the structured hint.

---

## Non-Functional Requirements

- **NFR-01:** All fixes MUST maintain fail-open behavior (Article X) -- no hook infrastructure failures may block operations.
- **NFR-02:** All fixes MUST preserve backward compatibility -- no existing hook behavior may change for valid inputs.
- **NFR-03:** Performance budget: all fixes MUST add < 5ms to dispatcher execution time.

---

## Files Affected

| File | Bug(s) | Change Type |
|------|--------|-------------|
| `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` | 0.6, 0.12 | Modify (null defaults + timeout hints) |
| `src/claude/hooks/test-adequacy-blocker.cjs` | 0.7 | Modify (fix phase prefix matching) |
| `src/claude/hooks/menu-tracker.cjs` | 0.11 | Modify (type-check iteration_requirements) |

---

## Traceability

| Bug | FR | ACs | Files |
|-----|-----|-----|-------|
| 0.6 | FR-01 | AC-06a..AC-06f | pre-task-dispatcher.cjs |
| 0.7 | FR-02 | AC-07a..AC-07f | test-adequacy-blocker.cjs, pre-task-dispatcher.cjs |
| 0.11 | FR-03 | AC-11a..AC-11d | menu-tracker.cjs |
| 0.12 | FR-04 | AC-12a..AC-12e | pre-task-dispatcher.cjs |
