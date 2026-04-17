# Test Strategy: REQ-GH-253 — Context-Manager Hooks

**Source**: GitHub Issue #253
**Phase**: 05 - Test Strategy
**Status**: Designed
**Date**: 2026-04-15

---

## Existing Infrastructure (from test evaluation)

- **Framework**: `node:test` (Node.js built-in test runner, ESM)
- **Assertion**: `node:assert/strict`
- **Coverage Tool**: None configured (no c8/istanbul)
- **Current Coverage**: ~85% estimated across the project
- **Existing Patterns**: Tests in `tests/core/roundtable/` (runtime-composer.test.js), `tests/core/validators/` (constitutional checks), `tests/parity/` (provider parity)
- **Conventions**: `describe`/`it` blocks, TC-XX-NNN IDs, JSDoc header with traces, real temp filesystem for isolation

## Strategy Approach

**Extend existing test suite** -- do NOT replace. New test files follow established `node:test` + `node:assert/strict` conventions. Test files placed in `tests/core/roundtable/` subdirectories alongside existing `runtime-composer.test.js`.

---

## Conditional Design Note (T060 Decision Gate)

This test strategy is designed to accommodate BOTH the full state-machine mechanism path AND a scaled-down lighter approach. The audit verification tests (T002) are unconditional -- they run regardless of T060 outcome. The state machine, parallel-run, and parity tests (T001, T003, T004) are marked CONDITIONAL and will be activated or descoped based on T060's scope calibration decision:

| T060 Outcome | State Machine Tests (T001) | Parallel-Run Tests (T003) | Parity Tests (T004) |
|---|---|---|---|
| Full mechanism (>50% bucket 1/2/3/5) | Activate all scaffolds | Activate all scaffolds | Activate all scaffolds |
| Lighter approach (>60% bucket 4) | Descope to template-inclusion tests only | Descope to regression-only | Descope to card-delivery-only |
| Mixed | Activate confirmed-necessary states only | Activate analyze path only | Activate full |

---

## Test Pyramid

### Unit Tests (Tier 0 -- immediate)

| Module Under Test | Test File | Traces | Status |
|---|---|---|---|
| Audit bucket classifier | `tests/core/roundtable/audit/bucket-classifier.test.js` | FR-007, AC-007-01 | Unconditional |
| Audit completeness validator | `tests/core/roundtable/audit/completeness-validator.test.js` | FR-007, AC-007-02, AC-007-03, NFR-005 | Unconditional |
| Cut-to-mechanism traceability | `tests/core/roundtable/audit/cut-mechanism-traceability.test.js` | FR-007, NFR-005 | Unconditional |

### Unit Tests (Tier 1 -- CONDITIONAL on T060)

| Module Under Test | Test File | Traces | Status |
|---|---|---|---|
| definition-loader.js | `tests/core/roundtable/state-machine/definition-loader.test.js` | FR-002, AC-002-01, AC-002-03 | Conditional |
| state-machine.js | `tests/core/roundtable/state-machine/state-machine.test.js` | FR-002, AC-002-01, AC-002-02 | Conditional |
| state-card-composer.js | `tests/core/roundtable/composers/state-card-composer.test.js` | FR-001, AC-001-01 | Conditional |
| task-card-composer.js | `tests/core/roundtable/composers/task-card-composer.test.js` | FR-001, AC-001-02, AC-001-03, FR-004, AC-004-01, AC-004-02, AC-004-03 | Conditional |
| trailer-parser.js | `tests/core/roundtable/markers/trailer-parser.test.js` | FR-003, AC-003-01, AC-003-03 | Conditional |
| Marker extractors | `tests/core/roundtable/markers/marker-extractors.test.js` | FR-003, AC-003-02 | Conditional |
| rolling-state.js | `tests/core/roundtable/rolling-state/rolling-state.test.js` | FR-003, AC-003-01 through AC-003-04 | Conditional |

### Integration Tests (Tier 2 -- CONDITIONAL on T060)

| Integration Scope | Test File | Traces | Status |
|---|---|---|---|
| Parallel-run harness | `tests/core/roundtable/parallel-run/harness.test.js` | FR-008, AC-008-01, AC-008-02 | Conditional |
| Cross-provider parity | `tests/parity/roundtable-card-parity.test.js` | FR-005, AC-005-01, AC-005-02, AC-005-03, NFR-002 | Conditional |

### Regression Tests (Always active after cutover)

| Regression Scope | Test File | Traces |
|---|---|---|
| Build workflow unchanged | `tests/regression/build-workflow-unchanged.test.js` (T056) | FR-006, AC-006-01 |
| Phase-loop injection unchanged | `tests/regression/phase-loop-injection.test.js` (T057) | FR-006, AC-006-01 |

---

## Flaky Test Mitigation

- **No network calls**: All marker extractors are regex/key-phrase only (FR-003 design constraint). No flakiness from network.
- **No LLM calls in tests**: Tests use fixture strings, not live LLM output. Trailer parser and marker extractors operate on static input.
- **Deterministic state machine**: State transitions are pure functions of rolling state. No timing dependencies.
- **Temp filesystem isolation**: Audit tests that read .md files use `mkdtempSync` + cleanup pattern (matches existing `state-store.test.js` convention).
- **Parallel-run tests**: Use captured fixture pairs (prose output vs mechanism output), not live sessions. Divergence detection is string comparison, not LLM judgment.
- **Provider parity**: Tests compare composed card strings from both provider adapters given identical input. No actual provider API calls.

---

## Performance Test Plan

- **NFR-003 Budget**: Per-turn card composition MUST NOT exceed 200ms.
- **Test approach**: `tests/core/roundtable/composers/state-card-composer.test.js` and `task-card-composer.test.js` include a timed composition test that asserts `duration < 200`.
- **Scope**: Measures definition loading + card composition + skill manifest query. Does NOT include LLM inference time (out of scope).
- **Technique**: `performance.now()` before/after `composeStateCard()` and `composeTaskCard()`, assert under 200ms. Run 10 iterations and assert p95 < 200ms.
- **Note**: These are conditional on T060. If the lighter approach is chosen, the performance budget is not applicable (template inclusion is near-zero cost).

---

## Coverage Targets

| Test Type | Target | Rationale |
|---|---|---|
| Audit verification (unconditional) | 100% of bucket classification logic | Core deliverable; audit correctness gates all downstream work |
| State machine runtime (conditional) | >=80% line coverage | Standard threshold per Article II |
| Card composers (conditional) | >=80% line coverage | Standard threshold |
| Trailer/markers (conditional) | >=80% line coverage | Standard threshold |
| Rolling state (conditional) | >=80% line coverage | Standard threshold |
| Integration (conditional) | >=70% scenario coverage | Standard threshold per Article II |
| Regression | 100% of FR-006 boundary | Build workflow must be provably unchanged |

---

## Test Commands (use existing infrastructure)

- Unit: `node --test tests/core/roundtable/**/*.test.js`
- Parity: `node --test tests/parity/roundtable-card-parity.test.js`
- All roundtable: `node --test tests/core/roundtable/**/*.test.js tests/parity/roundtable-card-parity.test.js`

---

## Task-to-Test Traceability

| Task | File Under Test | Test File | Traces | Scenarios |
|---|---|---|---|---|
| T002 (unblocked) | Audit tooling (new) | `tests/core/roundtable/audit/bucket-classifier.test.js` | FR-007, AC-007-01 | Classify sections into 5 buckets; valid/invalid/ambiguous input |
| T002 (unblocked) | Audit tooling (new) | `tests/core/roundtable/audit/completeness-validator.test.js` | FR-007, AC-007-02, AC-007-03, NFR-005 | Validate bucket-4 rationale present; default-keep on ambiguous; mechanism traceability |
| T002 (unblocked) | Audit tooling (new) | `tests/core/roundtable/audit/cut-mechanism-traceability.test.js` | FR-007, NFR-005 | Every cut maps to mechanism; no orphan cuts |
| T001 (conditional) | `src/core/roundtable/definition-loader.js` | `tests/core/roundtable/state-machine/definition-loader.test.js` | FR-002, AC-002-01, AC-002-03 | Load/merge/validate; fail-open on missing/malformed |
| T001 (conditional) | `src/core/roundtable/state-machine.js` | `tests/core/roundtable/state-machine/state-machine.test.js` | FR-002, AC-002-01, AC-002-02 | Initialize; transition; sub-task activation; external delegation |
| T001 (conditional) | `src/core/roundtable/state-card-composer.js` | `tests/core/roundtable/composers/state-card-composer.test.js` | FR-001, AC-001-01 | Compose card with personas/tools/invariants; max 40 lines; perf <200ms |
| T001 (conditional) | `src/core/roundtable/task-card-composer.js` | `tests/core/roundtable/composers/task-card-composer.test.js` | FR-001, AC-001-02, AC-001-03, FR-004 | Compose with skills; budget enforcement; missing skill fail-open; retirement |
| T001 (conditional) | `src/core/roundtable/trailer-parser.js` | `tests/core/roundtable/markers/trailer-parser.test.js` | FR-003, AC-003-01, AC-003-03 | Parse valid trailer; null on absent/invalid; strip from output |
| T001 (conditional) | `src/core/roundtable/markers/` | `tests/core/roundtable/markers/marker-extractors.test.js` | FR-003, AC-003-02 | Per-sub-task extraction; no false positives on unrelated text |
| T001 (conditional) | `src/core/roundtable/rolling-state.js` | `tests/core/roundtable/rolling-state/rolling-state.test.js` | FR-003, AC-003-01 to AC-003-04 | Create; update from trailer; update from markers; trailer-wins conflict; both-fail safe |
| T003 (conditional) | Parallel-run harness (new) | `tests/core/roundtable/parallel-run/harness.test.js` | FR-008, AC-008-01, AC-008-02 | Detect divergence; log diagnostics; fallback on failure |
| T004 (conditional) | Provider adapters | `tests/parity/roundtable-card-parity.test.js` | FR-005, AC-005-01 to AC-005-03, NFR-002 | Identical card content across providers; transport-only differences |

---

## Traceability Matrix

| Requirement | AC | Test Case ID | Test File | Test Type | Priority | Conditional |
|---|---|---|---|---|---|---|
| FR-007 | AC-007-01 | AUD-01 to AUD-06 | bucket-classifier.test.js | positive+negative | P0 | No |
| FR-007 | AC-007-02 | AUD-07 to AUD-09 | completeness-validator.test.js | positive+negative | P0 | No |
| FR-007 | AC-007-03 | AUD-10 to AUD-11 | completeness-validator.test.js | positive+negative | P0 | No |
| NFR-005 | -- | AUD-12 to AUD-14 | cut-mechanism-traceability.test.js | positive+negative | P0 | No |
| FR-002 | AC-002-01 | SM-01 to SM-03 | definition-loader.test.js | positive | P1 | Yes (T060) |
| FR-002 | AC-002-03 | SM-04 to SM-06 | definition-loader.test.js | negative | P1 | Yes (T060) |
| FR-002 | AC-002-01 | SM-07 to SM-08 | state-machine.test.js | positive | P1 | Yes (T060) |
| FR-002 | AC-002-02 | SM-09 to SM-11 | state-machine.test.js | positive | P1 | Yes (T060) |
| FR-001 | AC-001-01 | SC-01 to SC-04 | state-card-composer.test.js | positive+negative | P1 | Yes (T060) |
| FR-001 | AC-001-02 | TC-01 to TC-05 | task-card-composer.test.js | positive+negative | P1 | Yes (T060) |
| FR-001 | AC-001-03 | TC-06 | task-card-composer.test.js | positive | P1 | Yes (T060) |
| FR-004 | AC-004-01 | TC-03 | task-card-composer.test.js | positive | P1 | Yes (T060) |
| FR-004 | AC-004-02 | TC-04 | task-card-composer.test.js | negative | P1 | Yes (T060) |
| FR-004 | AC-004-03 | TC-05 | task-card-composer.test.js | positive | P1 | Yes (T060) |
| FR-003 | AC-003-01 | TP-01 to TP-02 | trailer-parser.test.js | positive | P1 | Yes (T060) |
| FR-003 | AC-003-03 | TP-03 | trailer-parser.test.js | positive | P1 | Yes (T060) |
| FR-003 | AC-003-02 | MK-01 to MK-04 | marker-extractors.test.js | positive+negative | P1 | Yes (T060) |
| FR-003 | AC-003-01 | RS-01 to RS-02 | rolling-state.test.js | positive | P1 | Yes (T060) |
| FR-003 | AC-003-02 | RS-03 | rolling-state.test.js | positive | P1 | Yes (T060) |
| FR-003 | AC-003-03 | RS-04 | rolling-state.test.js | positive | P1 | Yes (T060) |
| FR-003 | AC-003-04 | RS-05 | rolling-state.test.js | negative | P1 | Yes (T060) |
| FR-008 | AC-008-01 | PR-01 to PR-03 | harness.test.js | positive+negative | P2 | Yes (T060) |
| FR-008 | AC-008-02 | PR-04 | harness.test.js | positive | P2 | Yes (T060) |
| FR-005 | AC-005-01 | PA-01 | roundtable-card-parity.test.js | positive | P2 | Yes (T060) |
| FR-005 | AC-005-02 | PA-02 | roundtable-card-parity.test.js | positive | P2 | Yes (T060) |
| FR-005 | AC-005-03 | PA-03 | roundtable-card-parity.test.js | positive | P2 | Yes (T060) |
| NFR-002 | -- | PA-04 | roundtable-card-parity.test.js | positive | P2 | Yes (T060) |
| NFR-003 | -- | SC-04, TC-05 | composers tests | positive | P2 | Yes (T060) |
| FR-006 | AC-006-01 | REG-01, REG-02 | build-workflow-unchanged.test.js, phase-loop-injection.test.js | positive | P1 | No (T056/T057) |
