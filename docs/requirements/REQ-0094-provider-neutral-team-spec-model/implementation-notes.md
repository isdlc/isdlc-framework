# Implementation Notes: REQ-0094 — Provider-Neutral Team Spec Model

## Summary

Implemented 4 frozen team spec objects, 1 registry module, and 1 CJS bridge. Total new code: ~130 lines across 6 files. Zero modifications to existing code.

## Files Created

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `src/core/teams/specs/implementation-review-loop.js` | ESM | 19 | Frozen spec for implementation_review_loop team |
| `src/core/teams/specs/fan-out.js` | ESM | 19 | Frozen spec for fan_out team |
| `src/core/teams/specs/dual-track.js` | ESM | 19 | Frozen spec for dual_track team |
| `src/core/teams/specs/debate.js` | ESM | 19 | Frozen spec for debate team |
| `src/core/teams/registry.js` | ESM | 48 | Registry with getTeamSpec() and listTeamTypes() |
| `src/core/bridge/team-specs.cjs` | CJS | 36 | CJS bridge with fail-open pattern |

## Test Files Created

| File | Tests | Coverage |
|------|-------|---------|
| `tests/core/teams/specs.test.js` | 16 | FR-001, FR-003, FR-004, FR-005 |
| `tests/core/teams/registry.test.js` | 10 | FR-002, FR-005, INT-001 |
| `tests/core/teams/bridge-team-specs.test.js` | 4 | FR-006, INT-002 |

## Key Decisions

1. **Object.freeze (shallow)**: All spec objects are flat (no nested objects), so shallow freeze provides full immutability. No need for deep freeze.

2. **Map-based registry**: Used `Map<string, Object>` for O(1) lookups. The map is built once at module load from static imports -- no dynamic registration (FR-005 AC-005-02).

3. **Error messages include available types**: When `getTeamSpec()` receives an unknown type, the error message lists all available types. This satisfies FR-002 AC-002-02 and aids debugging.

4. **CJS bridge delegates errors**: Unlike the existing `teams.cjs` bridge (which wraps constructors), this bridge simply delegates to the ESM registry. Unknown-type errors propagate as rejections, matching the ESM behavior.

5. **Test isolation**: CJS bridge tests use `createRequire(import.meta.url)` to load the CJS module from an ESM test file, following the pattern in existing bridge tests.

## Backward Compatibility

Verified via tests TS-13, TS-14, TS-15:
- `ImplementationLoop` class imports and constructs identically
- All 3 contract JSON schemas parse without changes
- Existing `teams.cjs` bridge still exports `createImplementationLoop`

## Iteration History

- **Iteration 1**: All 30 tests passed on first run. No fixes needed.
- **Regression**: Full suite run confirms 1582 passing (baseline maintained). 3 pre-existing failures in unrelated `lib/` tests.
