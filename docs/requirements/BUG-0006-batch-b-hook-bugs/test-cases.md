# Test Cases: BUG-0006 Batch B Hook Bugs

**Phase:** 05-test-strategy
**Total Tests:** 29 (across 4 test files)
**TDD RED Summary:** 21 failing, 8 passing (all failures prove bugs exist)
**Coverage:** 21/21 acceptance criteria covered (100%)

---

## Test File 1: dispatcher-null-context.test.cjs (BUG 0.6)

**Tests:** 14 (6 unit + 8 integration)
**RED:** 4 failing (AC-06a through AC-06d)

### Part A: Unit tests (TDD RED)

| # | Test | AC | Expected (RED) | Expected (GREEN) |
|---|------|-----|-----------------|-------------------|
| 1 | ctx.state defaults to {} when readState returns null | AC-06a | FAIL: buildBuggyCtx passes null through | PASS: dispatcher uses `state \|\| {}` |
| 2 | ctx.manifest defaults to {} when loadManifest returns null | AC-06b | FAIL: buildBuggyCtx passes null through | PASS: dispatcher uses `manifest \|\| {}` |
| 3 | ctx.requirements defaults to {} | AC-06c | FAIL: buildBuggyCtx passes null through | PASS: dispatcher uses `requirements \|\| {}` |
| 4 | ctx.workflows defaults to {} | AC-06d | FAIL: buildBuggyCtx passes null through | PASS: dispatcher uses `workflows \|\| {}` |
| 5 | hasActiveWorkflow returns false for {} state | AC-06e | PASS: optional chaining handles {} | PASS: unchanged |
| 6 | skill-validator works with valid context | AC-06f | PASS: valid context works | PASS: unchanged |

### Part B: Integration tests (regression)

| # | Test | AC | Expected |
|---|------|-----|----------|
| 7 | No crash when state.json missing | AC-06a | PASS (fail-open) |
| 8 | Missing manifest handled gracefully | AC-06b | PASS (fail-open) |
| 9 | Missing iteration requirements handled | AC-06c | PASS (fail-open) |
| 10 | Missing workflow definitions handled | AC-06d | PASS (fail-open) |
| 11 | hasActiveWorkflow false skips guards | AC-06e | PASS |
| 12 | Valid context works normally | AC-06f | PASS |
| 13 | All-null context no crash | Regression | PASS |
| 14 | Empty stdin clean exit | Regression | PASS |

---

## Test File 2: test-adequacy-phase-detection.test.cjs (BUG 0.7)

**Tests:** 16
**RED:** 7 failing (phase prefix bugs)

| # | Test | AC | Expected (RED) | Expected (GREEN) |
|---|------|-----|-----------------|-------------------|
| 1 | isUpgradeDelegation false for 16-quality-loop | AC-07a | FAIL: returns true (bug) | PASS: returns false |
| 2 | isUpgradeDelegation false for any 16- prefix | AC-07a | FAIL: returns true (bug) | PASS: returns false |
| 3 | isUpgradeDelegation true for 15-upgrade-plan | AC-07b | PASS: prefix exists | PASS |
| 4 | isUpgradeDelegation true for 15-upgrade-execute | AC-07b | PASS | PASS |
| 5 | isUpgradeDelegation true for agent name 'upgrade' | AC-07b | PASS | PASS |
| 6 | isUpgradeDelegation false for old 14-upgrade | AC-07a | FAIL: returns true (old prefix) | PASS: old prefix removed |
| 7 | isUpgradePhaseActive false for 16-quality-loop | AC-07c | FAIL: returns true (bug) | PASS: returns false |
| 8 | isUpgradePhaseActive true for 15-upgrade-plan | AC-07d | FAIL: returns false (wrong prefix) | PASS: 15-upgrade prefix used |
| 9 | isUpgradePhaseActive true for 15-upgrade-execute | AC-07d | FAIL: returns false (wrong prefix) | PASS: 15-upgrade prefix used |
| 10 | isUpgradePhaseActive false for old 14-upgrade-plan | AC-07c | FAIL: returns true (old prefix) | PASS: old prefix removed |
| 11 | check() allows quality loop delegation | AC-07e | PASS: check() prompt-based path does not match | PASS |
| 12 | Quality loop in feature workflow allowed | AC-07f | PASS | PASS |
| 13 | null delegation returns false | Regression | PASS | PASS |
| 14 | non-delegation returns false | Regression | PASS | PASS |
| 15 | no active_workflow returns false | Regression | PASS | PASS |
| 16 | no current_phase returns false | Regression | PASS | PASS |

---

## Test File 3: menu-tracker-unsafe-init.test.cjs (BUG 0.11)

**Tests:** 10
**RED:** 5 failing (truthy non-object values not reset)

| # | Test | AC | Expected (RED) | Expected (GREEN) |
|---|------|-----|-----------------|-------------------|
| 1 | iteration_requirements = true resets to {} | AC-11a | FAIL: stays boolean | PASS: typeof guard resets to {} |
| 2 | iteration_requirements = 42 resets to {} | AC-11a | FAIL: stays number | PASS: typeof guard resets to {} |
| 3 | iteration_requirements = "corrupted" resets to {} | AC-11a | FAIL: stays string | PASS: typeof guard resets to {} |
| 4 | null iteration_requirements inits to {} | AC-11b | PASS: existing falsy check handles null | PASS |
| 5 | undefined iteration_requirements inits to {} | AC-11b | PASS: existing falsy check handles undefined | PASS |
| 6 | Empty {} preserved | AC-11c | PASS | PASS |
| 7 | Object with data preserved | AC-11c | PASS | PASS |
| 8 | interactive_elicitation init after reset from corrupted | AC-11d | FAIL: corrupted value not reset, so init skipped | PASS: typeof guard resets, then init runs |
| 9 | No double-init for valid state | AC-11d | PASS | PASS |
| 10 | Array value resets to {} | Edge case | FAIL: Array passes typeof === 'object' without Array.isArray guard | PASS: Array.isArray guard added |

---

## Test File 4: dispatcher-timeout-hints.test.cjs (BUG 0.12)

**Tests:** 8
**RED:** 5 failing (no DEGRADATION_HINT output)

| # | Test | AC | Expected (RED) | Expected (GREEN) |
|---|------|-----|-----------------|-------------------|
| 1 | DEGRADATION_HINT JSON in stderr | AC-12a | FAIL: no DEGRADATION_HINT in output | PASS: structured JSON emitted |
| 2 | Hint includes type, phase, elapsed, limit, actions | AC-12b | FAIL: hint is null (not emitted) | PASS: all fields present |
| 3 | Actions include reduce_debate_rounds | AC-12c | FAIL: hint is null | PASS: action present |
| 4 | Actions include skip_optional_steps | AC-12c | FAIL: hint is null | PASS: action present |
| 5 | Fail-open with unusual environment | AC-12d | PASS: try/catch handles it | PASS |
| 6 | No hint when not exceeded | AC-12d | PASS: no timeout = no hint | PASS |
| 7 | Human-readable warning + hint both present | AC-12e | FAIL: TIMEOUT WARNING exists but DEGRADATION_HINT missing | PASS: both present |
| 8 | No warnings when timeout not configured | Edge case | PASS | PASS |
