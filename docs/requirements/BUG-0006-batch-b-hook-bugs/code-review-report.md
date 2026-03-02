# Code Review Report: BUG-0006 Batch B Hook Bugs

**Phase:** 08-code-review
**Reviewer:** QA Engineer (human-review mode)
**Date:** 2026-02-15
**Workflow:** fix
**Artifact Folder:** BUG-0006-batch-b-hook-bugs

---

## Review Summary

| Category | Result |
|----------|--------|
| **Overall Verdict** | PASS |
| **Critical Findings** | 0 |
| **Major Findings** | 0 |
| **Minor Findings** | 2 |
| **Informational Notes** | 3 |
| **Tests** | 48/48 pass |
| **Regression** | 892/935 (43 pre-existing, 0 new) |
| **ACs Covered** | 21/21 |
| **Files Modified (prod)** | 3 |
| **Files Added (test)** | 4 |

---

## Scope

3 production files modified (bug fixes), 4 test files created (48 tests):

| File | Bug(s) | Change Type | Lines Changed |
|------|--------|-------------|---------------|
| `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` | 0.6, 0.12 | Modify | ~20 lines |
| `src/claude/hooks/test-adequacy-blocker.cjs` | 0.7 | Modify | ~4 lines |
| `src/claude/hooks/menu-tracker.cjs` | 0.11 | Modify | ~4 lines |
| `src/claude/hooks/tests/dispatcher-null-context.test.cjs` | 0.6 | New test | 448 lines |
| `src/claude/hooks/tests/test-adequacy-phase-detection.test.cjs` | 0.7 | New test | 241 lines |
| `src/claude/hooks/tests/menu-tracker-unsafe-init.test.cjs` | 0.11 | New test | 243 lines |
| `src/claude/hooks/tests/dispatcher-timeout-hints.test.cjs` | 0.12 | New test | 336 lines |

---

## Review Checklist

- [x] Logic correctness
- [x] Error handling
- [x] Security considerations
- [x] Performance implications
- [x] Test coverage adequate
- [x] Code documentation sufficient
- [x] Naming clarity
- [x] DRY principle followed
- [x] Single Responsibility Principle
- [x] No code smells

---

## Detailed Review by Bug

### BUG 0.6: Dispatcher null context (pre-task-dispatcher.cjs lines 99-108)

**Architecture Decision: APPROPRIATE AND MINIMAL**

The fix applies `|| {}` null coalescing at the dispatcher's context construction site (lines 100-105). This is the correct architectural choice for several reasons:

1. **Single point of fix.** Rather than adding null guards to each of the 9 downstream hooks, the fix centralizes null safety in one place -- the dispatcher that constructs the context.
2. **Backward compatible.** The `hasActiveWorkflow()` guard at line 55 uses `!!ctx.state?.active_workflow`, which correctly returns `false` for an empty object `{}`. No behavior change for valid inputs.
3. **Minimal surface.** Only 4 lines changed (each adding `|| {}`). No structural refactoring.
4. **Consistent with existing patterns.** The timeout check at line 111 already used `state?.active_workflow && requirements` -- acknowledging null is possible. The fix makes context construction consistent with this assumption.

**Business Logic: CORRECT**

The fix correctly addresses the root cause. When loaders return null (file missing or parse error), hooks now receive `{}` instead of `null`. This means:
- `hasActiveWorkflow({})` returns `false` -- all guarded hooks skip
- Unguarded hooks (skill-validator) receive `{}` which is harmless
- The overall fail-open behavior (Article X) is preserved

**Verdict:** PASS -- no findings

---

### BUG 0.7: test-adequacy-blocker phase detection (test-adequacy-blocker.cjs lines 31-37, 59-62)

**Architecture Decision: APPROPRIATE AND MINIMAL**

The fix replaces incorrect phase prefixes with the correct `'15-upgrade'` prefix. Both `isUpgradeDelegation()` and `isUpgradePhaseActive()` now use a single, consistent prefix check.

Key observations:
1. **Removed dead code.** The `'14-upgrade'` prefix was stale from a prior phase renumbering. Removing it eliminates dead code that could never match real workflow phases.
2. **Removed dangerous wildcard.** The `'16-'` prefix was incorrectly matching `16-quality-loop`. This was a production-impacting bug that could false-positive block non-upgrade workflows.
3. **Consistent with dispatcher.** The dispatcher's `shouldActivate` guard at line 73 already used `phase.startsWith('15-upgrade')`. The internal functions now match.
4. **Agent name fallback preserved.** Line 36 still checks `agent.includes('upgrade')` as a secondary detection path, which is appropriate for standalone use.

**Business Logic: CORRECT**

The fix correctly narrows the match to only `15-upgrade-*` phases. Quality loop delegations (`16-quality-loop`) will no longer false-trigger upgrade test adequacy checks. Legitimate upgrade delegations (`15-upgrade-plan`, `15-upgrade-execute`) continue to be correctly identified.

**Design Coherence: GOOD**

However, I note one minor observation:

**[MINOR-01] Standalone mode still lacks null coalescing.** The standalone execution block at lines 167-202 still passes raw loader results to `ctx` without `|| {}`:
```javascript
// Line 179-183 (standalone block):
const state = readState();         // can be null
const manifest = loadManifest();   // can be null
const ctx = { input, state, manifest, requirements, workflows };
```
The `check()` function handles `!state` at line 99, so this does not crash. But it is inconsistent with the BUG 0.6 fix pattern. Since the standalone path is a fallback and the `check()` function guards against null state, this is acceptable for now.

**Verdict:** PASS -- 1 minor finding (MINOR-01)

---

### BUG 0.11: Menu tracker unsafe nested init (menu-tracker.cjs lines 168-171)

**Architecture Decision: APPROPRIATE AND MINIMAL**

The fix adds a three-part type guard:
```javascript
const iterReqs = state.phases[currentPhase].iteration_requirements;
if (!iterReqs || typeof iterReqs !== 'object' || Array.isArray(iterReqs)) {
    state.phases[currentPhase].iteration_requirements = {};
}
```

This correctly handles:
- `null` / `undefined` (falsy check)
- Primitive types: `boolean`, `number`, `string` (typeof check)
- Arrays (Array.isArray check -- arrays are `typeof === 'object'`)

**Business Logic: CORRECT**

After the reset, the existing initialization logic at lines 174-184 runs normally, creating a fresh `interactive_elicitation` sub-object. No downstream logic is affected.

**Design Coherence: GOOD**

The guard follows the same defensive pattern used elsewhere in hook code (e.g., the `!state.phases` check at line 165 and `!state.phases[currentPhase]` at line 166). The fix extends the existing guard chain naturally.

**Verdict:** PASS -- no findings

---

### BUG 0.12: Phase timeout degradation hints (pre-task-dispatcher.cjs lines 120-137)

**Architecture Decision: APPROPRIATE AND MINIMAL**

The fix adds a structured JSON hint emitted via `console.error()` after the existing human-readable warning. Key design qualities:

1. **Additive only.** The existing warning at line 115 and logHookEvent at line 116-119 are preserved unchanged. The hint is appended after them.
2. **Double fail-open.** The hint has its own try/catch (lines 121-137) inside the outer timeout try/catch (lines 139-142). Errors in hint generation cannot affect the warning or the dispatcher.
3. **Parseable format.** The `DEGRADATION_HINT:` prefix makes the JSON line easily extractable from mixed stderr output. The test's `extractDegradationHint()` helper confirms this pattern works.
4. **Actionable content.** The `actions` array (`reduce_debate_rounds`, `reduce_parallelism`, `skip_optional_steps`) provides clear recommendations for downstream consumers.

**Business Logic: CORRECT**

The hint is only emitted when `timeout.exceeded` is true. When timeouts are not exceeded, no hint appears (confirmed by AC-12d tests).

**[MINOR-02] Action list `reduce_parallelism` not in acceptance criteria.** AC-12c specifies: "Recommended actions MUST include at minimum: `reduce_debate_rounds` and `skip_optional_steps`." The implementation includes both required actions plus an additional `reduce_parallelism` action. While this is not a violation (the ACs say "at minimum"), the trace analysis suggested `escalate_to_human` as the third action. The implementation chose `reduce_parallelism` instead, which is arguably more actionable. This is a minor deviation from the trace analysis suggestion, not from the actual requirements.

**[INFO-01] `reduce_parallelism` was chosen over `escalate_to_human`.** The trace analysis suggested `escalate_to_human` as the third degradation action. The implementation used `reduce_parallelism` instead. This is a reasonable engineering judgment -- `reduce_parallelism` is directly actionable by agents, while `escalate_to_human` is more of a last-resort action that would typically follow `reduce_debate_rounds` and `skip_optional_steps`.

**Verdict:** PASS -- 1 minor finding (MINOR-02), 1 informational note (INFO-01)

---

## Test Quality Assessment

### Coverage

All 21 acceptance criteria have direct test coverage:

| Bug | ACs | Tests | Coverage |
|-----|-----|-------|----------|
| 0.6 | AC-06a through AC-06f (6) | 14 tests | 100% |
| 0.7 | AC-07a through AC-07f (6) | 16 tests | 100% |
| 0.11 | AC-11a through AC-11d (4) | 10 tests | 100% |
| 0.12 | AC-12a through AC-12e (5) | 8 tests | 100% |
| **Total** | **21** | **48** | **100%** |

### Test Design Quality

- **TDD discipline verified.** Phase 05 documented 21 failing tests (TDD RED). All 21 now pass after implementation (TDD GREEN).
- **Both unit and integration tests.** BUG 0.6 tests include unit tests (direct function calls) and integration tests (subprocess spawning the actual dispatcher). BUG 0.12 uses only integration tests via subprocess, which is appropriate since the behavior under test is stderr output.
- **Edge cases covered.** BUG 0.11 tests arrays, booleans, numbers, strings, null, undefined, and valid objects. BUG 0.7 tests both positive and negative matching patterns.
- **Regression safety.** Integration tests verify no TypeError messages in stderr and clean exit codes.

### [INFO-02] Dispatcher null-context unit tests use simulated context builders

The `buildBuggyCtx()` and `buildFixedCtx()` functions in `dispatcher-null-context.test.cjs` simulate the dispatcher's context construction logic rather than testing the actual dispatcher code directly. After the fix, both functions produce identical output (both coalesce null to `{}`), making them somewhat redundant. The integration tests (Part B) provide the actual verification by spawning the real dispatcher process. This is acceptable since the unit tests document the intended behavior pattern, even if they cannot test the internal dispatcher logic directly without module mocking.

### [INFO-03] Traceability matrix uses TDD RED status column

The traceability matrix CSV file includes a `TDD_RED_Status` column showing the pre-fix test status (FAIL/PASS). This is useful for auditing the TDD discipline but should be updated to reflect the post-fix status. Since this is a trace artifact from Phase 05, it is acceptable to leave as-is and note that all FAIL entries are now PASS after implementation.

---

## Non-Functional Requirements Verification

| NFR | Description | Verdict | Evidence |
|-----|-------------|---------|----------|
| NFR-01 | Fail-open behavior maintained | PASS | All hooks still use try/catch with graceful fallback. BUG 0.12 hint has its own try/catch. Dispatcher exits 0 in all error scenarios. |
| NFR-02 | Backward compatibility | PASS | All fixes are additive or narrowing (not broadening). Valid inputs produce identical behavior. No API changes to exported functions. |
| NFR-03 | Performance < 5ms overhead | PASS | BUG 0.6: 4 `||` operators add nanoseconds. BUG 0.7: fewer `startsWith` calls (performance neutral). BUG 0.11: one `typeof` + one `Array.isArray` add nanoseconds. BUG 0.12: one `JSON.stringify` (only when timeout exceeded, rare path). |

---

## Security Assessment

- **No injection risks.** All fixes operate on structured data (objects, strings) without user-controlled input flowing into eval/exec/shell paths.
- **No XSS/serialization risks.** The `DEGRADATION_HINT` JSON is emitted to stderr for machine consumption, not rendered in HTML.
- **State corruption handling improved.** BUG 0.11 fix adds resilience against corrupted state.json, reducing the attack surface for state manipulation.
- **No secrets or credentials involved.** All modified files are hook infrastructure code.

---

## Merge Readiness Assessment

| Criterion | Status |
|-----------|--------|
| All 48 new tests pass | PASS |
| Zero new regressions | PASS |
| All 21 ACs covered by tests | PASS |
| All 4 FRs implemented | PASS |
| All 3 NFRs satisfied | PASS |
| Implementation notes documented | PASS |
| Trace analysis complete | PASS |
| No critical or major findings | PASS |
| Code follows existing patterns | PASS |
| Fixes are minimal and targeted | PASS |
| Backward compatibility maintained | PASS |

**Merge Readiness: APPROVED**

---

## Findings Summary

### Minor Findings (2)

**MINOR-01:** Standalone mode in `test-adequacy-blocker.cjs` (lines 179-183) does not apply BUG 0.6 null coalescing to loader calls. Not a bug (the `check()` function handles null state), but inconsistent with the fix pattern.

**MINOR-02:** The degradation hint actions include `reduce_parallelism` which was not in the trace analysis suggestion (`escalate_to_human`). Meets AC requirements ("at minimum reduce_debate_rounds and skip_optional_steps") but diverges from the suggested implementation.

### Informational Notes (3)

**INFO-01:** `reduce_parallelism` chosen over `escalate_to_human` is a reasonable engineering judgment.

**INFO-02:** Unit test context builders (`buildBuggyCtx`/`buildFixedCtx`) are identical after fix; integration tests provide actual verification.

**INFO-03:** Traceability matrix TDD_RED_Status column reflects pre-fix state; all FAIL entries are now PASS.
