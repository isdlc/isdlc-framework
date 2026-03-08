# Implementation Notes: Group 5 - Distribution & Enterprise

REQ-0045 / Phase 06 / Group 5

## Scope

Three functional requirements implemented across three modules:

| FR | Module | Files Created/Modified |
|----|--------|----------------------|
| FR-007: Embedding Update Lifecycle | M8 Distribution | `lib/embedding/distribution/index.js` (new) |
| FR-009: Version Compatibility | M6 Compatibility Extension | `lib/embedding/registry/compatibility.js` (extended) |
| FR-010: Aggregation & Release | M9 Aggregation Pipeline | `lib/embedding/aggregation/index.js` (new) |

## Key Design Decisions

### M6: CompatibilityMatrix Class

- Extended existing `compatibility.js` rather than creating a new file, preserving backward compatibility with `isCompatible()` and `getCompatibleVersions()`.
- The matrix uses a **permissive model**: module pairs without a declared rule are treated as compatible. Only explicit constraints cause rejection.
- Bidirectional rule lookup: if A declares a constraint on B, validating B against A also works (reverse lookup).
- `validateSet()` checks all pairs in a module set and collects ALL incompatibilities, not just the first one, for better error reporting (AC-009-04).
- The `satisfiesRange()` helper provides manual semver range parsing as a fallback when the `semver` npm package is unavailable (Article X: fail-safe defaults).

### M8: Distribution Adapters

- All four transport types (Artifactory, Nexus, S3, SFTP) share the same `createBaseTransport()` implementation. The URL construction is uniform: `{base}/{moduleId}/{version}/{moduleId}-{version}.emb`.
- **Dependency injection**: HTTP client is injected via `config.httpClient`, enabling full in-process mocking with zero network calls in tests.
- Checksum validation happens after download, before writing to final destination (AC-007-03).
- **Rollback safety** (AC-007-04): On checksum failure, the new file is not written, so previous versions remain intact. Files are written atomically only after validation passes.
- Default config: 3 retries, 60-second timeout.

### M9: Aggregation Pipeline

- The `aggregate()` function orchestrates: input validation, source checksum verification, compatibility matrix check, tar assembly, and manifest generation.
- Compatibility validation happens BEFORE any file I/O for the bundle (AC-010-04: failed aggregation blocks release).
- The release manifest is written both inside the tar bundle (as `release-manifest.json`) and as a separate `release-{version}-manifest.json` file alongside the bundle for easy inspection.
- Uses a simple tar implementation (consistent with the existing `builder.js` pattern) rather than introducing a dependency.

## Test Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `lib/embedding/registry/compatibility.test.js` | 21 | All pass |
| `lib/embedding/distribution/index.test.js` | 30 | All pass |
| `lib/embedding/aggregation/index.test.js` | 19 | All pass |
| **Total new tests** | **70** | **All pass** |

Full suite: 1208 tests (1138 baseline + 70 new), zero failures.

## Acceptance Criteria Coverage

### FR-007 (M8 Distribution)
- AC-007-01: Transport adapters for Artifactory, Nexus, S3, SFTP -- verified by factory tests and per-adapter tests
- AC-007-02: Update checker queries registry -- verified by `createUpdateChecker()` tests
- AC-007-03: Downloads validate checksum -- verified by checksum match/mismatch tests
- AC-007-04: Rollback capability -- verified by retained-previous-version and no-overwrite-on-failure tests

### FR-009 (M6 Compatibility Extension)
- AC-009-01: Matrix declares compatible versions -- verified by declaration/serialization tests
- AC-009-02: Validates at load time -- verified by `validateModulePair()` tests
- AC-009-03: Update checker offers compatible combinations -- verified by `getCompatibleUpdates()` tests
- AC-009-04: Clear error with alternatives -- verified by error message content assertions

### FR-010 (M9 Aggregation)
- AC-010-01: Collects modules into release bundle -- verified by bundle creation tests
- AC-010-02: Cross-module compatibility validated -- verified by matrix pass/fail tests
- AC-010-03: Release manifest with modules/versions/checksums -- verified by manifest content assertions
- AC-010-04: Failed aggregation blocks release -- verified by error and no-bundle-created tests

## Security Considerations (Article III)

- Input validation on all public APIs (type, url, moduleId, version, paths)
- Checksum verification before accepting downloaded packages
- No secrets logged or exposed in error messages
- Auth credentials passed through opaque config object, never interpolated into URLs

## Dependencies

- No new npm dependencies added
- Existing `semver` package used for version range parsing (with manual fallback)
- `node:crypto`, `node:fs`, `node:path` standard library modules only
