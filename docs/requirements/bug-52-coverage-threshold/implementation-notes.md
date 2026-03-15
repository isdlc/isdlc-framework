# Implementation Notes: Coverage Threshold Discrepancy Fix (BUG-0054-GH-52)

**Phase**: 06-implementation
**Date**: 2026-03-16
**TDD Iterations**: 2 (Red -> Green on iteration 2 after fixing test output format)

---

## Summary

Replaced flat scalar coverage thresholds in `iteration-requirements.json` with intensity-keyed objects and added a shared `resolveCoverageThreshold()` utility in `common.cjs` consumed by both `test-watcher.cjs` and `gate-requirements-injector.cjs`.

## Key Decisions

1. **resolveCoverageThreshold in common.cjs (Option B)**: Placed the shared resolver in `common.cjs` rather than duplicating logic in each consumer hook. This follows the test strategy recommendation (Section 11.2).

2. **effective_intensity field**: Used `effective_intensity` as specified in requirements, not raw `intensity`. This means epic workflows that get deferred to standard (via `applySizingDecision`) will use the standard threshold. This is an accepted limitation documented in the trace analysis.

3. **Fail-open import in gate-requirements-injector**: Since `gate-requirements-injector.cjs` previously had no dependency on `common.cjs`, the import is wrapped in try/catch with an inline fallback to maintain the module's fail-open design principle.

4. **Profile-loader validation**: Updated to extract the `standard` tier from object format for the `< 80` comparison, preserving the existing warning behavior.

## Files Changed

### Must-Change (Enforcement Logic)
| File | Change | FR |
|------|--------|-----|
| `src/claude/hooks/config/iteration-requirements.json` | Phase 06/16: `80` -> `{light:60, standard:80, epic:95}`; Phase 07: `70` -> `{light:50, standard:70, epic:85}` | FR-001, FR-002 |
| `src/claude/hooks/lib/common.cjs` | Added `resolveCoverageThreshold()` function + export | FR-003 |
| `src/claude/hooks/test-watcher.cjs` | Import + use `resolveCoverageThreshold()` at coverage check | FR-003 |
| `src/claude/hooks/lib/gate-requirements-injector.cjs` | Import + use `resolveCoverageThreshold()` in display + constraints | FR-004 |
| `src/claude/hooks/lib/profile-loader.cjs` | Handle object format in `checkThresholdWarnings()` | -- |

### Should-Change (Prose/Documentation)
| File | Change | FR |
|------|--------|-----|
| `docs/isdlc/constitution.md` | Added enforcement note below Article II | FR-005 |
| `src/claude/agents/05-software-developer.md` | Updated Article II reference | FR-006 |
| `src/claude/agents/06-integration-tester.md` | Updated Article II reference | FR-006 |
| `src/claude/agents/16-quality-loop-engineer.md` | Updated GATE-16 checklist | FR-006 |
| `src/claude/agents/09-cicd-engineer.md` | Updated Article II reference | FR-006 |
| `src/claude/agents/00-sdlc-orchestrator.md` | Updated GATE-05/06 table + delegation table | FR-006 |
| `src/claude/agents/discover-orchestrator.md` | Updated coverage display references | FR-006 |

## Test Results

- **test-test-watcher.test.cjs**: 97 tests, 97 passing (30 new + 67 existing)
- **gate-requirements-injector.test.cjs**: 78 tests, 78 passing (6 new + 72 existing)
- **profile-loader.test.cjs**: 36 tests, 36 passing (2 new + 34 existing)
- **Total new tests**: 38 (30 from test strategy + 8 edge cases)
- **Regression check**: 1349/1352 lib tests pass (3 pre-existing failures)
- **No new dependencies** (NFR-003 verified)

## Traceability

| Requirement | ACs | Test Cases | Status |
|-------------|-----|------------|--------|
| FR-001 | AC-001-01, AC-001-02 | TC-17, TC-18 | PASS |
| FR-002 | AC-002-01 | TC-19 | PASS |
| FR-003 | AC-003-01 through AC-003-07 | TC-01 through TC-10, TC-20 through TC-24 | PASS |
| FR-004 | AC-004-01, AC-004-02 | TC-11 through TC-14 | PASS |
| FR-005 | AC-005-01, AC-005-02 | TC-25, TC-26 | PASS |
| FR-006 | AC-006-01 through AC-006-03 | TC-27, TC-28, TC-29 | PASS |
| NFR-001 | AC-NFR-001-01 | TC-04, TC-09, TC-24 | PASS |
| NFR-002 | AC-NFR-002-01 | TC-05, TC-23 | PASS |
| NFR-003 | -- | TC-30 | PASS |
