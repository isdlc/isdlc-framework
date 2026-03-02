# Test Strategy: BUG-0009 Batch D Tech Debt -- Hook Maintainability Fixes

**Phase**: 05-test-strategy
**Created**: 2026-02-15
**Artifact Folder**: BUG-0009-batch-d-tech-debt
**Workflow**: fix

---

## Existing Infrastructure

- **Test Runner**: `node:test` (built-in Node.js test runner)
- **Test Format**: CJS (`.test.cjs`) for hook tests
- **Test Location**: `src/claude/hooks/tests/*.test.cjs`
- **Test Command**: `npm run test:hooks` (`node --test src/claude/hooks/tests/*.test.cjs`)
- **Assertions**: `node:assert/strict`
- **Coverage Tool**: None configured (coverage assessed via test count / AC count)
- **Current Total Tests**: ~971 across all suites
- **Existing Hook Tests**: 60+ test files in `src/claude/hooks/tests/`
- **Patterns**: Direct `require()` of hook modules, `buildCtx()` helper pattern, `describe`/`it` blocks

## Strategy for This Requirement

### Approach: Behavior Preservation Testing

All 4 items (0.13-0.16) are non-behavioral changes: refactoring, documentation, and dead code simplification. The test strategy therefore focuses on **verifying that existing behavior is preserved after the changes**, not on testing new functionality.

The key principle: **if the refactored code produces the same outputs as the original code for the same inputs, the refactoring is correct.**

### Test Categories

| Category | Items Covered | Purpose |
|----------|--------------|---------|
| **Unit: PHASE_PREFIXES constant** | 0.13 | Verify the new constant exists, is frozen, has correct values, and is importable |
| **Unit: Phase prefix usage** | 0.13 | Verify each consumer file uses the constant and produces identical behavior |
| **Unit: Null-check equivalence** | 0.14 | Verify optional chaining produces identical results to &&-chain for all null/undefined/present cases |
| **Unit: JSDoc completeness** | 0.15 | Verify detectPhaseDelegation() JSDoc contains required elements |
| **Unit: Dead code simplification** | 0.16 | Verify gate-blocker currentPhase resolution is correct with and without active_workflow |
| **Integration: Regression** | All | Run existing test suite to confirm zero regressions |

### New Test Types Needed

- **Unit tests** for behavior preservation (new test file)
- **Integration regression** via existing `npm run test:hooks` (no new tests needed)

### What We Do NOT Test

- No E2E tests (these are internal refactoring changes, not user-facing)
- No performance tests (changes are mechanical text replacements, no algorithmic changes)
- No security tests (no security-relevant changes)

## Test Design Principles

### 1. Test Against Exported Functions

For items 0.13, 0.14, and 0.16, we test the exported `check()` functions of each affected hook by providing controlled input and verifying the output. This is the same pattern used by existing hook tests (`gate-blocker-phase-status-bypass.test.cjs`, `state-write-validator-null-safety.test.cjs`).

### 2. Characterization Tests for Refactoring

For refactoring changes (0.13, 0.14), we write tests that capture the CURRENT behavior before changes, then verify the behavior is identical after changes. Each test:
- Constructs a controlled input (state, tool call)
- Calls the hook's `check()` function
- Asserts the output matches the expected behavior

### 3. Content Verification for Documentation

For item 0.15 (documentation only), we use the prompt-verification pattern established in `tests/prompt-verification/`: read the source file and assert that required JSDoc elements are present.

## Test Commands (use existing)

- **Unit (hooks)**: `npm run test:hooks`
- **Unit (lib)**: `npm test`
- **All**: `npm run test:all`
- **Single file**: `node --test src/claude/hooks/tests/<file>.test.cjs`

## Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| AC coverage | 100% (18/18 ACs) | Every acceptance criterion has at least one test |
| NFR coverage | 100% (3/3 NFRs) | Zero behavioral change verified via regression |
| Test pass rate | 100% | All tests must pass (TDD GREEN) |
| Regression | 0 new failures | Existing test suite must not regress |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Optional chaining changes semantics in edge case | Low | Medium | Test all 7 null-check locations with null, undefined, and present values |
| PHASE_PREFIXES constant has wrong value | Very Low | High | Test constant values match original inline strings exactly |
| Dead code branch was not actually dead | Low | High | Test gate-blocker with and without active_workflow to verify identical behavior |
| JSDoc changes accidentally modify code | Very Low | Medium | Run all existing tests as regression gate |

## Test File Plan

| Test File | Items | Test Count | Priority |
|-----------|-------|------------|----------|
| `src/claude/hooks/tests/batch-d-phase-prefixes.test.cjs` | 0.13 | 10 | P0 |
| `src/claude/hooks/tests/batch-d-null-checks.test.cjs` | 0.14 | 10 | P0 |
| `src/claude/hooks/tests/batch-d-jsdoc-documentation.test.cjs` | 0.15 | 5 | P1 |
| `src/claude/hooks/tests/batch-d-dead-code-removal.test.cjs` | 0.16 | 5 | P0 |
| **Total** | All | **30** | |

## Regression Strategy

After implementation, run:
1. `npm run test:hooks` -- all hook tests (including new ones)
2. `npm run test:all` -- full test suite

Zero new failures are required for GATE-16 (quality loop).
