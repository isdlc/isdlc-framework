# Code Review Report -- REQ-0080 StateStore Extraction

**Phase**: 08-code-review
**Date**: 2026-03-21
**Reviewer**: Quality Loop Engineer (Phase 16 + Phase 08 combined)

---

## Scope

Review of Batch 1 extraction: ~25 state functions from `common.cjs` and ~1 from `state-logic.cjs` into `src/core/state/`, with CJS bridge expansion and schema versioning.

### Files Reviewed

| File | Lines | Change Type |
|------|-------|-------------|
| `src/core/state/index.js` | 255 | NEW -- Core StateStore module |
| `src/core/state/paths.js` | 274 | NEW -- Path resolution functions |
| `src/core/state/monorepo.js` | 162 | NEW -- Monorepo support functions |
| `src/core/state/validation.js` | 105 | NEW -- State validation logic |
| `src/core/state/schema.js` | 78 | NEW -- Schema versioning and migration |
| `src/core/bridge/state.cjs` | 653 | MODIFIED -- Expanded CJS bridge |
| `src/claude/hooks/lib/common.cjs` | ~1400 | MODIFIED -- 17 functions now delegate |
| `src/claude/hooks/lib/state-logic.cjs` | 300 | MODIFIED -- validatePhase delegates |
| 7 scaffold stubs | 2 each | NEW -- Empty ESM modules for future extraction |
| 5 test files | ~900 total | NEW -- 62 tests |

---

## Review Findings

### 1. Extraction Correctness -- APPROVED

The extraction follows the bridge-first-with-fallback pattern correctly. Each wrapper function in `common.cjs` follows the same template:

```javascript
function resolveStatePath(projectId) {
    const _b = _getCoreBridge(); if (_b) return _b.resolveStatePath(projectId);
    // ... original inline implementation preserved as fallback
}
```

**Verified for all 18 extracted functions in common.cjs:**
- `stateFileExistsOnDisk`, `isMonorepoMode`, `readMonorepoConfig`, `writeMonorepoConfig`
- `resolveProjectFromCwd`, `getActiveProject`, `resolveStatePath`, `resolveConstitutionPath`
- `resolveDocsPath`, `resolveExternalSkillsPath`, `resolveExternalManifestPath`
- `resolveSkillReportPath`, `resolveTasksPath`, `resolveTestEvaluationPath`
- `resolveAtddChecklistPath`, `resolveIsdlcDocsPath`, `readStateValue`, `readState`, `writeState`

**Verified for 1 extracted function in state-logic.cjs:**
- `validatePhase` -- delegates to bridge, fallback to inline

The `getProjectRoot()` function in `common.cjs` is NOT delegated (correctly -- it has project-root caching logic specific to the hooks layer that should remain there).

### 2. Bridge Expansion -- APPROVED

`src/core/bridge/state.cjs` provides a full CJS bridge for all 5 ESM modules:
- **Lazy loaders**: `loadState()`, `loadPaths()`, `loadMonorepo()`, `loadValidation()`, `loadSchema()`
- **Sync cache**: `_syncState`, `_syncPaths`, etc. -- populated via `preload()` for optimal perf
- **Inline fallbacks**: Complete sync implementations duplicating ESM logic (identical code)
- **Async API**: Preserved for REQ-0076 backward compatibility (`getProjectRoot()`, async `readState/writeState`)

The dual-API detection pattern in `readState`/`writeState` (absolute path = async, else sync) is correct and well-documented.

### 3. Schema Versioning (REQ-0124) -- APPROVED

- `CURRENT_SCHEMA_VERSION = 1` -- correct initial version
- `MIGRATIONS` array with 0->1 migration that adds `schema_version` field
- `migrateState()` creates shallow copy (does not mutate input), applies migrations sequentially
- Migration preserves `active_workflow`, `phases`, `workflow_history`, `skill_usage_log`
- Bridge exposes `migrateState()` and `getCurrentSchemaVersion()`

**Note**: The migration is additive only (adds a field). No destructive changes.

### 4. Wrapper Correctness in common.cjs -- APPROVED

All wrapper functions follow the same pattern:
1. Attempt bridge load via `_getCoreBridge()`
2. If bridge available (`_coreBridge !== null`), delegate to bridge function
3. If bridge unavailable (file not found, require error), fall back to inline code
4. Bridge is cached after first load (undefined -> module | null)

The fallback behavior is essential for test isolation: when hooks tests copy `common.cjs` to a temp directory, the relative path to `src/core/bridge/state.cjs` doesn't resolve, so `_coreBridge` is set to `null` and the inline code runs. This was the root cause of the 186-test failure in Phase 06 iteration 2, fixed by the bridge-first-with-fallback pattern.

### 5. API Parity -- APPROVED

Each extracted ESM function has identical behavior to the original inline CJS code:
- Same parameters (same names, same optionality)
- Same return types (null for missing state, boolean for write, string for paths)
- Same error handling (try/catch returning null/false, fail-open)
- Same monorepo routing logic (ISDLC_PROJECT env, CWD detection, default_project)
- Same new/legacy path fallback pattern for constitution, manifest, etc.

### 6. Scaffold Stubs -- APPROVED

7 empty ESM modules correctly placed:
- `src/core/validators/index.js`
- `src/core/workflow/index.js`
- `src/core/skills/index.js`
- `src/core/search/index.js`
- `src/core/memory/index.js`
- `src/core/providers/index.js`
- `src/core/content/index.js`

All contain `// TODO: Extract from hooks/lib in Phase 2` and `export {};`.

### 7. Test Quality -- APPROVED

62 new tests across 5 files with good coverage:
- **state-store-expanded.test.js** (16 tests): readState, writeState, readStateValue, stateFileExistsOnDisk, getNestedValue
- **paths.test.js** (15 tests): All 10 resolve* functions in both single and monorepo mode
- **monorepo.test.js** (10 tests): isMonorepoMode, readMonorepoConfig, writeMonorepoConfig, resolveProjectFromCwd, getActiveProject
- **validation.test.js** (10 tests): validatePhase (6 tests), validateStateWrite (4 tests)
- **schema.test.js** (11 tests): CURRENT_SCHEMA_VERSION, MIGRATIONS registry, migrateState

All tests use real temp filesystem (no mocks), proper cleanup (afterEach with rmSync), and env var save/restore.

---

## Issues Found

### Minor (Non-blocking)

1. **Bridge inline fallback duplication**: The inline sync fallbacks in `state.cjs` duplicate the ESM logic. This is by design (CJS can't synchronously import ESM), but creates a maintenance burden. The `preload()` optimization bypasses fallbacks entirely, making them dead code in production. Consider documenting that fallbacks are test-only paths.

2. **`getNestedValue` duplication**: The function exists in 3 places: `src/core/state/index.js`, `src/core/bridge/state.cjs`, and `src/claude/hooks/lib/common.cjs`. The bridge does NOT delegate `getNestedValue` since it's a pure utility with no dependencies -- this is acceptable but should be noted for future dedup.

3. **Shallow copy limitation**: `writeState()` uses `Object.assign({}, state)` which is a shallow copy. If `state.phases` is an object, mutating it after `writeState()` would still affect the written data. However, since `writeFileSync` serializes immediately, this is safe in practice. No action needed.

### None (Critical/Blocking)

No critical or blocking issues found.

---

## Verdict

**CODE REVIEW: APPROVED**

The extraction is well-executed with:
- Zero regressions (154 core tests, 1582 unit tests, 4081 hook tests pass)
- Correct bridge-first-with-fallback pattern
- Complete API parity between ESM core and CJS wrappers
- Proper schema versioning with migration path
- Comprehensive test coverage for all extracted functions
- Clean security profile (zero dangerous patterns)
