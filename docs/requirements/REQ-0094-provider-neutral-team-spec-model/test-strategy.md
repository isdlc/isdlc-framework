# Test Strategy: REQ-0094 — Provider-Neutral Team Spec Model

## Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Module system**: ESM for core, CJS bridges for hooks
- **Test directory**: `tests/core/teams/` (already has 4 test files for ImplementationLoop + contracts)
- **Conventions**: `describe/it` blocks, `node:assert/strict`, test IDs as prefixes (e.g., `IL-01`, `CS-01`)
- **Run command**: `npm run test:core` (`node --test tests/core/**/*.test.js`)
- **Current passing**: 1582 tests
- **Fixtures**: `tests/core/fixtures/` (JSON files for test data)

## Strategy for This Requirement

- **Approach**: Extend the existing `tests/core/teams/` test suite with new test files
- **No framework changes**: Use existing `node:test` + `node:assert/strict` conventions
- **Coverage target**: 100% of the 6 new files (pure data + simple registry = fully testable)
- **Test ID prefix**: `TS-` (Team Spec) for spec tests, `TR-` (Team Registry) for registry tests, `TB-` (Team Bridge) for CJS bridge tests

## Test Pyramid

### Unit Tests (Primary — 28 test cases)

The module is pure data + simple registry lookup. Unit tests provide the highest value.

| Component | Test File | Count | Coverage |
|-----------|-----------|-------|----------|
| 4 spec objects | `tests/core/teams/specs.test.js` | 16 | FR-001, FR-003, FR-005 |
| Registry | `tests/core/teams/registry.test.js` | 8 | FR-002 |
| CJS bridge | `tests/core/teams/bridge-team-specs.test.js` | 4 | FR-006 |

### Integration Tests (Secondary — 3 test cases)

Validate that the registry correctly aggregates all spec files, and that the CJS bridge delegates to ESM without data loss.

| Scenario | Test File | Count | Coverage |
|----------|-----------|-------|----------|
| Registry-to-specs roundtrip | `tests/core/teams/registry.test.js` | 1 | INT-001 |
| CJS-to-ESM parity | `tests/core/teams/bridge-team-specs.test.js` | 2 | INT-002 |

### Backward Compatibility Tests (Guard — 3 test cases)

Verify that no existing file was modified and that existing tests remain untouched.

| Scenario | Test File | Count | Coverage |
|----------|-----------|-------|----------|
| Existing tests still pass | (existing suite) | 0 new | FR-004 AC-004-04 |
| No modification to existing files | `tests/core/teams/specs.test.js` | 3 | FR-004 AC-004-01..03 |

### E2E / Security / Performance Tests

**E2E**: Not applicable. This module has no user-facing entry point, CLI command, or HTTP interface. It is consumed programmatically by other modules.

**Security**: Minimal surface. The only risk is mutability of spec objects, which is tested via `Object.isFrozen()` checks. No user input, no file I/O, no network calls.

**Performance**: Not applicable. All operations are O(1) Map lookups on 4 entries. No performance testing needed.

## Flaky Test Mitigation

- All tests are deterministic: no I/O, no network, no timers, no randomness
- Spec objects are frozen and immutable -- no shared mutable state between tests
- CJS bridge tests use `await import()` which is deterministic for local files
- Risk of flakiness: **none** (pure functional + static data)

## Performance Test Plan

Not applicable for this requirement. The module contains:
- 4 frozen object literals (constructed once at module load)
- 1 Map with 4 entries (O(1) lookup)
- 0 I/O, 0 async operations, 0 loops

No performance benchmarks, load tests, or stress tests are needed.

## Coverage Targets

| Metric | Target |
|--------|--------|
| Statement coverage (new files) | 100% |
| Branch coverage (new files) | 100% |
| Requirement coverage | 100% (all 6 FRs, all 19 ACs) |
| Total test count impact | +34 tests (1582 -> 1616) |
| Regression threshold | Total must remain >= 1582 |

## Critical Paths

1. **getTeamSpec() lookup** -- the primary consumer interface; must return correct frozen object for all 4 types
2. **getTeamSpec() error** -- must throw with helpful message listing available types for unknown input
3. **Object.freeze enforcement** -- all 4 specs must be deeply immutable
4. **CJS bridge delegation** -- CJS consumers must get identical data to ESM consumers

## Test Commands

```bash
# Run only new team spec tests
node --test tests/core/teams/specs.test.js tests/core/teams/registry.test.js tests/core/teams/bridge-team-specs.test.js

# Run all core tests (includes new + existing)
npm run test:core

# Run full suite (verify no regressions)
npm run test:all
```
