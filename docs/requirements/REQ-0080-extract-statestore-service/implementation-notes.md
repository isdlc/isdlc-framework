# Implementation Notes: REQ-0079 + REQ-0080 + REQ-0124 (Batch 1, Phase 2)

## Summary

Extracted the StateStore service from `common.cjs` into `src/core/state/`, added scaffold directories for Phase 2, and implemented state schema versioning. All 3 requirements delivered as a single batch.

## Architecture

### Core Modules (ESM)

| Module | Purpose | Functions |
|--------|---------|-----------|
| `src/core/state/index.js` | Main StateStore with dual API (sync + async) | readState, writeState, readStateValue, getProjectRoot, stateFileExistsOnDisk, getNestedValue |
| `src/core/state/paths.js` | Path resolution for all iSDLC artifacts | resolveStatePath, resolveConstitutionPath, resolveDocsPath, + 7 more |
| `src/core/state/monorepo.js` | Monorepo detection and project resolution | isMonorepoMode, readMonorepoConfig, writeMonorepoConfig, resolveProjectFromCwd, getActiveProject |
| `src/core/state/validation.js` | State write validation (fail-open) | validatePhase, validateStateWrite |
| `src/core/state/schema.js` | Schema versioning and migration | CURRENT_SCHEMA_VERSION, migrateState, MIGRATIONS |

### CJS Bridge

`src/core/bridge/state.cjs` provides synchronous access from CJS consumers. It uses inline sync fallback implementations (identical to the original common.cjs code) so it works standalone without ESM module loading.

### Wrapper Preservation (FR-005)

`common.cjs` and `state-logic.cjs` retain all original function bodies as fallback code. Each extracted function has a bridge-first delegation pattern:

```javascript
function readState(projectId) {
    const _b = _getCoreBridge(); if (_b) return _b.readState(projectId);
    // Original code below (fallback when bridge unavailable)...
}
```

This pattern ensures zero breakage when common.cjs is copied to temp directories for testing (262 existing subprocess tests depend on this).

### Dual API Compatibility

The `readState` and `writeState` functions support two calling conventions:
- **Async API** (REQ-0076): `readState(absolutePath)`, `writeState(absolutePath, state)` -- returns Promises
- **Sync API** (REQ-0080): `readState(projectId?)`, `writeState(state, projectId?)` -- returns values

Detection: if the first argument starts with `/` or `C:\`, the async API is used.

## Scaffold (REQ-0079)

Seven new directories with stub index.js files:
- `src/core/validators/`, `src/core/workflow/`, `src/core/skills/`, `src/core/search/`, `src/core/memory/`, `src/core/providers/`, `src/core/content/`

## Schema Versioning (REQ-0124)

- `CURRENT_SCHEMA_VERSION = 1`
- Migration registry: `MIGRATIONS` array with `{ from, to, migrate }` entries
- `migrateState(state)` applies all pending migrations, returning a new object
- Version 0-to-1 migration: adds `schema_version` field, preserves all data

## Test Results

| Suite | Total | Pass | Fail | New |
|-------|-------|------|------|-----|
| Core tests | 154 | 154 | 0 | 62 |
| npm test | 1585 | 1582 | 3 (pre-existing) | 0 |
| Hook tests | 4343 | 4081 | 262 (pre-existing) | 0 |

Zero regressions across all test suites.

## Key Decisions

1. **Bridge-first-with-fallback** over pure wrappers: Tests copy common.cjs to temp directories, breaking relative require paths. The fallback pattern avoids 186 regressions.
2. **Dual API detection** in bridge: Detects absolute path vs. project ID to maintain backward compatibility with REQ-0076 async tests.
3. **Synchronous core implementations**: All core ESM modules use `readFileSync`/`writeFileSync` to match the synchronous API of common.cjs exactly.
