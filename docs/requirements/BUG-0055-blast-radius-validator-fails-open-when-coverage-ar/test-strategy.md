# Test Strategy: BUG-0055 — Blast Radius Validator Fails Open

**Phase**: 05-test-strategy
**Bug ID**: BUG-0055
**External**: GH-127
**Date**: 2026-03-21
**Workflow**: fix (TDD — failing tests FIRST, then implementation)

---

## Existing Infrastructure

- **Framework**: `node:test` (Node.js built-in test runner)
- **Test File**: `src/claude/hooks/tests/test-blast-radius-validator.test.cjs`
- **Utilities**: `src/claude/hooks/tests/hook-test-utils.cjs` (setupTestEnv, cleanupTestEnv, runHook, prepareHook)
- **Conventions**: CJS (`.test.cjs`), describe/it blocks, `assert/strict`, TC-XXX-NN test IDs
- **Run Command**: `node --test src/claude/hooks/tests/test-blast-radius-validator.test.cjs`
- **Existing Tests**: ~45 tests across 7 describe blocks (parseImpactAnalysis, parseBlastRadiusCoverage, buildCoverageReport, formatBlockMessage, check context guards, check full flow, check with temp git repo)

## Strategy for This Bug Fix

- **Approach**: Extend existing test file with new fixtures and tests. Do NOT create new test files.
- **TDD Requirement**: All new tests MUST be written and observed to FAIL before the fix is implemented (Article II). The implementation agent removes skips and verifies green.
- **Backward Compatibility**: All existing 45 tests MUST continue passing — zero regressions.
- **New Test Focus**: Fill the gap identified in the trace analysis — no existing test uses the 4-column format that the roundtable actually produces.

---

## Test Pyramid

| Layer | Count | What |
|-------|-------|------|
| **Unit** | 18 | parseImpactAnalysis with 4-column/mixed-case fixtures, zero-file guard logic, change type normalization |
| **Integration** | 6 | Full check() flow with temp git repo using 4-column fixtures, zero-file guard end-to-end |
| **Behavioral** | 4 | Agent prompt verification (FR-004, FR-005) — grep-based checks on markdown files |
| **Total** | 28 | |

---

## Flaky Test Mitigation

- All unit tests are pure functions (no I/O) — zero flakiness risk
- Integration tests use `setupTestEnv()` / `cleanupTestEnv()` with temp directories — isolated
- Git repo tests use `initGitRepo()` helper with explicit branch creation — deterministic
- No network calls, no timing dependencies, no randomness
- Timeout: existing 10-second timeout in `runHook()` is sufficient

---

## Performance Test Plan

Not applicable for this bug fix. The blast radius validator is a synchronous PreToolUse hook with sub-100ms execution. No performance regression risk from the regex change.

---

## Coverage Targets

- **New tests**: 28
- **Regression**: 0 (all existing ~45 tests continue passing)
- **FR coverage**: 100% (all 5 FRs, all 13 ACs)
- **Test-first**: All 28 new tests written as failing tests before implementation

---

## Test Commands (use existing)

- Unit + Integration: `node --test src/claude/hooks/tests/test-blast-radius-validator.test.cjs`
- Full hook suite: `node --test src/claude/hooks/tests/`
- Prompt verification: `node --test src/claude/hooks/tests/test-blast-radius-validator.test.cjs` (behavioral tests included inline)

---

## FR-to-Test Mapping Summary

| FR | AC Count | New Tests | Type | Risk |
|----|----------|-----------|------|------|
| FR-001 | 4 | 10 | Unit + Integration | High — the core bug |
| FR-002 | 3 | 6 | Unit + Integration | Medium — diagnostic visibility |
| FR-003 | 4 | 4 | Unit (fixtures) | Low — test infrastructure |
| FR-004 | 2 | 4 | Behavioral (prompt grep) | Medium — defense-in-depth |
| FR-005 | 2 | 4 | Behavioral (prompt grep) | Medium — defense-in-depth |

---

## New Test Fixtures Required

### IMPACT_4COL_ROUNDTABLE (real roundtable format from REQ-0066)
```
| File | Module | Change Type | Requirement Traces |
| `lib/memory-search.js` | memory-search | Modify | FR-001, FR-006 |
| `lib/memory-embedder.js` | memory-embedder | Modify | FR-004, FR-005 |
```

### IMPACT_4COL_VARIANT (real roundtable format from REQ-0064)
```
| File | Change Type | Description | Impact |
| `lib/memory.js` | New | Core memory module | FR-001 |
| `src/claude/commands/isdlc.md` | Modify | Analyze handler | FR-002 |
```

### IMPACT_3COL_MIXEDCASE (real roundtable format from REQ-0063)
```
| File | Type | Description |
| `lib/memory.js` | New | Core memory module |
| `src/claude/agents/roundtable-analyst.md` | Modify | Add MEMORY_CONTEXT |
```

### IMPACT_MIXED_SECTIONS (multiple table formats in one document)
Combined 3-col and 4-col sections to test cross-section parsing.

### IMPACT_SUBSTANTIAL_NO_MATCH (triggers zero-file guard)
Real-looking impact analysis content (>100 chars) with a table format that uses unrecognized column headers and no change type keywords.

---

## Constitutional Compliance

| Article | Requirement | How Met |
|---------|-------------|---------|
| **II (Test-First)** | Tests designed before implementation | This strategy document produced in Phase 05, before Phase 06 |
| **VII (Traceability)** | Every test traces to a requirement | Traceability matrix below maps every test to FR/AC |
| **IX (Gate Integrity)** | All artifacts validated | GATE-04 checklist validated |
| **XI (Integration Testing)** | Integration tests validate component interactions | 6 integration tests with temp git repos validate full check() flow |
