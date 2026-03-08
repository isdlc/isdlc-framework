# Test Strategy: REQ-0045 Semantic Search Backend -- Group 5: Distribution & Enterprise

**Scope**: M8 Distribution Adapters (FR-007) + M6 Compatibility Extension (FR-009) + M9 Aggregation Pipeline (FR-010)
**Date**: 2026-03-06
**Phase**: 05 - Test Strategy
**Baseline**: 1138 tests, all passing (Groups 1-4 complete)

---

## Existing Infrastructure

- **Framework**: Node.js built-in `node --test` runner (`describe`, `it`, `before`, `after` from `node:test`)
- **Assertions**: `node:assert/strict`
- **Helpers**: `lib/utils/test-helpers.js` -- `createTempDir()`, `cleanupTempDir()`, `createProjectDir()`
- **Pattern**: Co-located tests (`.test.js` alongside source), ESM imports
- **Test Command**: `npm test` (runs `node --test lib/*.test.js lib/utils/*.test.js lib/search/*.test.js lib/search/backends/*.test.js lib/embedding/**/*.test.js`)
- **Existing Modules**: M1 Chunker, M2 Engine, M3 VCS, M4 Redaction, M5 Package, M6 Registry, M7 MCP Server (all tested)
- **Fixtures**: `tests/fixtures/embedding/` -- sample files, `sample-registry.json`

### Dependencies Available from Prior Groups

| Module | Key Functions | Used By |
|--------|--------------|---------|
| M5 `package/builder.js` | `buildPackage()` | M8 (publishes packages), M9 (reads packages) |
| M5 `package/reader.js` | `readPackage()` | M8 (fetches packages), M9 (validates) |
| M5 `package/manifest.js` | `createManifest()`, `validateManifest()`, `computeChecksums()` | M8, M9 |
| M6 `registry/index.js` | `loadRegistry()` | M8 (update checker), M9 (compatibility) |
| M6 `registry/compatibility.js` | `isCompatible()`, `getCompatibleVersions()` | FR-009 extends this |

---

## Strategy

**Approach**: Extend existing test suite. Each new module gets co-located `.test.js` files following established conventions.

**External service mocking**: M8 Distribution adapters interact with external services (Artifactory, Nexus, S3, SFTP). All transport adapters are tested with **in-process mocks** -- no real network calls. Each adapter gets a mock server or stubbed client that validates request structure, authentication, and error handling without network dependencies.

**Package I/O**: Tests use real `.emb` packages built by the existing `buildPackage()` from M5, ensuring integration fidelity with the actual package format.

**Coverage Target**: >=80% line coverage per Article II. 100% AC coverage via traceability.

---

## Test Pyramid

| Level | Count | Scope |
|-------|-------|-------|
| Unit | ~52 | Transport factory, adapter methods, compatibility matrix, aggregation logic |
| Integration | ~12 | Transport publish-fetch roundtrip, update checker with registry, aggregate with real packages |
| Edge/Negative | ~16 | Network errors, corrupt downloads, incompatible versions, missing modules |
| **Total** | **~80** | |

---

## Flaky Test Mitigation

| Risk | Mitigation |
|------|-----------|
| Temp directory cleanup failures | Use `before()`/`after()` with `createTempDir()`/`cleanupTempDir()` pattern from existing helpers |
| File system race conditions | Each test gets its own subdirectory within the temp dir |
| Random port conflicts (mock servers) | Use port 0 (OS-assigned) for any mock HTTP/SFTP servers |
| Checksum non-determinism | Use fixed test data buffers with pre-computed expected checksums |
| Time-dependent tests | Mock `Date.now()` where timestamps appear in manifests |

---

## Performance Test Plan

| Metric | Target | Method |
|--------|--------|--------|
| Single transport publish/fetch cycle | <200ms (mock) | Time `publish()` + `fetch()` in integration tests |
| Compatibility matrix validation (100 modules) | <50ms | Generate 100-module registry, time `validateCompatibility()` |
| Aggregation of 10-module release | <500ms (mock I/O) | Build 10 test packages, time `aggregate()` |
| Update checker with 50 modules | <100ms | Time `checkForUpdates()` against mock registry |

Performance assertions are included as soft checks (logged warnings, not hard failures) to prevent flaky CI.

---

## M8: Distribution Adapters (`lib/embedding/distribution/`)

**FR-007: Embedding Update Lifecycle**
**Files under test**: `index.js` (factory), `artifactory.js`, `nexus.js`, `s3.js`, `sftp.js`

### index.js -- Transport Factory

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 1 | `createTransport({ type: 'artifactory' })` returns Artifactory transport | AC-007-01 | positive | P0 |
| 2 | `createTransport({ type: 'nexus' })` returns Nexus transport | AC-007-01 | positive | P0 |
| 3 | `createTransport({ type: 's3' })` returns S3 transport | AC-007-01 | positive | P0 |
| 4 | `createTransport({ type: 'sftp' })` returns SFTP transport | AC-007-01 | positive | P0 |
| 5 | `createTransport()` with unknown type throws clear error | AC-007-01 | negative | P1 |
| 6 | `createTransport()` with missing config throws clear error | AC-007-01 | negative | P1 |
| 7 | All transports expose `publish`, `fetch`, `listVersions`, `checkForUpdates` methods | AC-007-01 | positive | P0 |

### artifactory.js -- Artifactory Adapter

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 8 | `publish()` uploads .emb file to correct Artifactory path | AC-007-01 | positive | P0 |
| 9 | `publish()` includes checksum headers in upload request | AC-007-03 | positive | P0 |
| 10 | `fetch()` downloads .emb file to destPath | AC-007-01 | positive | P0 |
| 11 | `fetch()` validates checksum after download | AC-007-03 | positive | P0 |
| 12 | `fetch()` with checksum mismatch throws error and removes partial file | AC-007-03 | negative | P0 |
| 13 | `listVersions()` returns version list from Artifactory API | AC-007-02 | positive | P1 |
| 14 | `publish()` with auth credentials sends Authorization header | AC-007-01 | positive | P1 |
| 15 | `publish()` on server error retries up to configured retries count | AC-007-01 | negative | P1 |

### nexus.js -- Nexus Adapter

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 16 | `publish()` uploads .emb file to Nexus repository | AC-007-01 | positive | P0 |
| 17 | `fetch()` downloads and validates checksum | AC-007-01, AC-007-03 | positive | P0 |
| 18 | `fetch()` with checksum mismatch rejects download | AC-007-03 | negative | P0 |
| 19 | `listVersions()` returns versions from Nexus search API | AC-007-02 | positive | P1 |

### s3.js -- S3 Adapter

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 20 | `publish()` uploads .emb file to S3 bucket/key | AC-007-01 | positive | P0 |
| 21 | `fetch()` downloads from S3 and validates checksum | AC-007-01, AC-007-03 | positive | P0 |
| 22 | `fetch()` with checksum mismatch rejects download | AC-007-03 | negative | P0 |
| 23 | `listVersions()` lists objects under module prefix | AC-007-02 | positive | P1 |
| 24 | `publish()` with missing bucket config throws clear error | AC-007-01 | negative | P1 |

### sftp.js -- SFTP Adapter

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 25 | `publish()` uploads .emb file via SFTP to configured path | AC-007-01 | positive | P0 |
| 26 | `fetch()` downloads via SFTP and validates checksum | AC-007-01, AC-007-03 | positive | P0 |
| 27 | `fetch()` with checksum mismatch rejects download | AC-007-03 | negative | P0 |
| 28 | `listVersions()` lists directory contents at module path | AC-007-02 | positive | P1 |

### Update Checker (part of each transport's `checkForUpdates()`)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 29 | `checkForUpdates()` queries registry for newer versions | AC-007-02 | positive | P0 |
| 30 | `checkForUpdates()` returns empty when current version is latest | AC-007-02 | positive | P1 |
| 31 | `checkForUpdates()` only returns compatible version updates | AC-007-02, AC-007-03 | positive | P0 |

### Rollback (part of fetch workflow)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 32 | `fetch()` retains previous version until new version verified | AC-007-04 | positive | P0 |
| 33 | `fetch()` on failed verification, previous version remains active | AC-007-04 | positive | P0 |
| 34 | `fetch()` on successful verification, old version cleaned up | AC-007-04 | positive | P1 |
| 35 | `fetch()` first-time download (no previous version) succeeds normally | AC-007-04 | positive | P1 |

### M8 Edge Cases

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 36 | `publish()` with zero-byte file throws clear error | AC-007-01 | negative | P2 |
| 37 | `fetch()` for non-existent module/version throws clear error | AC-007-01 | negative | P1 |
| 38 | `createTransport()` with empty URL throws clear error | AC-007-01 | negative | P2 |
| 39 | Transport operations with timeout produce clear timeout error | AC-007-01 | negative | P2 |

**M8 Subtotal**: ~39 tests

---

## M6: Compatibility Extension (`lib/embedding/registry/compatibility.js`)

**FR-009: Version Compatibility Management**
**Files under test**: `compatibility.js` (extended), integration with `index.js` (registry)

### CompatibilityMatrix Class

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 40 | `CompatibilityMatrix.create()` accepts valid matrix definition | AC-009-01 | positive | P0 |
| 41 | Matrix declares which module version pairs work together | AC-009-01 | positive | P0 |
| 42 | `matrix.isGroupCompatible(moduleVersionMap)` returns true for compatible set | AC-009-01 | positive | P0 |
| 43 | `matrix.isGroupCompatible(moduleVersionMap)` returns false for incompatible set | AC-009-01 | negative | P0 |
| 44 | Matrix with wildcard version ranges (e.g., `1.x`) matches correctly | AC-009-01 | positive | P1 |
| 45 | Empty matrix (no rules) treats all versions as compatible | AC-009-01 | positive | P1 |

### MCP Server Compatibility Validation (AC-009-02)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 46 | `validateCompatibilityAtLoad()` succeeds for compatible package set | AC-009-02 | positive | P0 |
| 47 | `validateCompatibilityAtLoad()` rejects incompatible package | AC-009-02 | negative | P0 |
| 48 | Validation error includes which modules are incompatible | AC-009-02, AC-009-04 | negative | P0 |

### Update Checker Compatibility Filter (AC-009-03)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 49 | Update checker only offers version combinations that pass compatibility matrix | AC-009-03 | positive | P0 |
| 50 | Update checker skips versions that would break existing module set | AC-009-03 | negative | P0 |
| 51 | Update checker with no loaded modules offers any available version | AC-009-03 | positive | P1 |

### Incompatibility Error Reporting (AC-009-04)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 52 | Incompatible version error includes module name and version | AC-009-04 | negative | P0 |
| 53 | Error lists compatible alternative versions for the failing module | AC-009-04 | negative | P0 |
| 54 | Error with multiple incompatibilities lists all conflicts | AC-009-04 | negative | P1 |

### M6 Compatibility Edge Cases

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 55 | Matrix with circular dependency references is handled | AC-009-01 | negative | P2 |
| 56 | `isGroupCompatible()` with empty module map returns true | AC-009-01 | positive | P2 |
| 57 | Compatibility check with single module always passes | AC-009-01 | positive | P2 |
| 58 | Matrix serialization and deserialization roundtrip | AC-009-01 | positive | P1 |

**M6 Compatibility Subtotal**: ~19 tests

---

## M9: Aggregation Pipeline (`lib/embedding/aggregation/`)

**FR-010: Embedding Aggregation and Release Assembly**
**Files under test**: `index.js`

### Core Aggregation (AC-010-01)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 59 | `aggregate()` collects specified module packages into a release bundle file | AC-010-01 | positive | P0 |
| 60 | Release bundle is a valid tar archive containing all module .emb packages | AC-010-01 | positive | P0 |
| 61 | `aggregate()` with single module produces valid bundle | AC-010-01 | positive | P0 |
| 62 | `aggregate()` with multiple modules includes all in bundle | AC-010-01 | positive | P0 |

### Cross-Module Compatibility Validation (AC-010-02)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 63 | `aggregate()` validates cross-module compatibility before assembly | AC-010-02 | positive | P0 |
| 64 | Compatible module set passes validation and produces bundle | AC-010-02 | positive | P0 |
| 65 | Incompatible module set fails validation before any I/O | AC-010-02 | negative | P0 |

### Release Manifest (AC-010-03)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 66 | Release manifest lists all included modules with IDs | AC-010-03 | positive | P0 |
| 67 | Release manifest includes version for each module | AC-010-03 | positive | P0 |
| 68 | Release manifest includes SHA-256 checksums for each module package | AC-010-03 | positive | P0 |
| 69 | Release manifest includes release version and creation timestamp | AC-010-03 | positive | P0 |
| 70 | Release manifest is JSON-parseable and follows documented schema | AC-010-03 | positive | P1 |

### Failed Aggregation (AC-010-04)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 71 | Incompatible versions block release with error | AC-010-04 | negative | P0 |
| 72 | Error message identifies which modules/versions are incompatible | AC-010-04 | negative | P0 |
| 73 | No partial bundle is left on disk after failed aggregation | AC-010-04 | negative | P0 |
| 74 | Error suggests compatible version alternatives | AC-010-04 | negative | P1 |

### M9 Edge Cases

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 75 | `aggregate()` with empty module list throws clear error | AC-010-01 | negative | P1 |
| 76 | `aggregate()` with missing module package file throws clear error | AC-010-01 | negative | P1 |
| 77 | `aggregate()` with duplicate module IDs in input throws error | AC-010-01 | negative | P2 |
| 78 | Large bundle (10+ modules) completes successfully | AC-010-01 | positive | P2 |
| 79 | Release manifest checksums match actual file checksums in bundle | AC-010-03 | positive | P1 |
| 80 | Aggregate with warnings (e.g., deprecated modules) includes warnings in result | AC-010-01 | positive | P2 |

**M9 Subtotal**: ~22 tests

---

## Integration Tests (Cross-Module)

These tests validate interactions between M8, M6 Compatibility, and M9.

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| I1 | M8 publish -> M8 fetch -> M9 aggregate: end-to-end pipeline | AC-007-01, AC-010-01 | positive | P0 |
| I2 | M8 checkForUpdates -> M6 compatibility filter -> only compatible shown | AC-007-02, AC-009-03 | positive | P0 |
| I3 | M9 aggregate with M6 compatibility matrix blocking incompatible set | AC-010-02, AC-009-01 | negative | P0 |
| I4 | M8 fetch with rollback -> verify previous version retained | AC-007-04 | positive | P0 |
| I5 | Full lifecycle: build packages -> publish -> check updates -> fetch -> aggregate release | AC-007-01..04, AC-010-01..04 | positive | P0 |

**Integration Subtotal**: 5 tests (counted within module totals above where applicable)

---

## Test File Layout

```
lib/
  embedding/
    distribution/
      index.js              <- Factory + common logic
      artifactory.js        <- Artifactory adapter
      nexus.js              <- Nexus adapter
      s3.js                 <- S3 adapter
      sftp.js               <- SFTP adapter
      index.test.js         <- M8 tests (all adapters + update checker + rollback)
    registry/
      index.js              <- Registry (existing)
      compatibility.js      <- Extended with CompatibilityMatrix
      index.test.js         <- Existing M6 tests (untouched)
      compatibility.test.js <- NEW: FR-009 compatibility extension tests
    aggregation/
      index.js              <- Aggregation pipeline
      index.test.js         <- M9 tests
tests/
  fixtures/
    embedding/
      sample-registry.json        <- Existing (3 modules)
      compatibility-matrix.json   <- NEW: Sample compatibility matrix fixture
```

**Note**: FR-009 tests go in a new `compatibility.test.js` to avoid modifying the existing `registry/index.test.js`. The new test file imports from the same `compatibility.js` module.

---

## Test Data Strategy

### Mock Transport Backends

Each adapter test uses an in-process mock that mimics the real API:

- **Artifactory/Nexus**: Mock HTTP handler that validates request paths, auth headers, and returns stored packages. Uses Node.js `http.createServer()` on port 0.
- **S3**: Stub object with in-memory bucket map (`{ key: Buffer }`). Validates bucket/key structure.
- **SFTP**: Stub object with in-memory filesystem map. Validates path structure and credentials.

### Package Fixtures

Tests use real `.emb` packages built by `buildPackage()` from M5:

```javascript
const pkg = await buildPackage({
  vectors: sampleVectors(3),
  chunks: sampleChunks(3),
  meta: { moduleId: 'mod-a', version: '1.0.0', model: 'codebert', dimensions: 4 },
  outputDir: tempDir,
});
```

### Compatibility Matrix Fixtures

```json
{
  "rules": [
    { "module": "mod-auth", "compatibleWith": { "mod-orders": ">=1.0.0 <2.0.0" } },
    { "module": "mod-orders", "compatibleWith": { "mod-payments": ">=1.0.0" } }
  ]
}
```

### Boundary Values

| Category | Values |
|----------|--------|
| Version strings | `"0.0.1"`, `"1.0.0"`, `"99.99.99"`, `""`, `null`, `"not-semver"` |
| Module count | 0 (error), 1 (single), 3 (typical), 10+ (stress) |
| Package size | Empty (0 chunks), minimal (1 chunk), typical (5 chunks) |
| Checksum | Valid SHA-256, truncated hash, empty string, mismatched hash |
| Transport URL | Valid URL, empty string, malformed URL, unreachable host |

### Invalid Inputs

| Input | Expected Behavior |
|-------|------------------|
| `createTransport({ type: 'unknown' })` | Throws `Error` with message listing supported types |
| `aggregate({ modules: [] })` | Throws `Error` with "at least one module required" |
| `fetch()` for non-existent version | Throws `Error` with "version not found" |
| `publish()` with non-existent file path | Throws `Error` with "file not found" |
| Compatibility matrix with invalid semver range | Throws `Error` with "invalid version range" |
| `aggregate()` with package missing manifest | Throws `Error` with "invalid package" |

### Maximum-Size Inputs

| Scenario | Size | Purpose |
|----------|------|---------|
| Compatibility matrix with 100 modules | 100 x 100 rule pairs | Verify O(n^2) doesn't timeout |
| Release bundle with 20 module packages | 20 x ~10KB | Verify aggregation handles realistic sizes |
| Registry with 500 modules for update check | 500 entries | Verify update checker scales |
| Version string at max length (255 chars) | 255 chars | Verify no buffer overflow in parsing |

---

## Traceability Matrix

| Requirement | AC | Test Cases | Test Type | Priority |
|------------|-----|-----------|-----------|----------|
| FR-007 | AC-007-01 | #1-4, #7-10, #16-17, #20-21, #25-26, #37-39 | positive, negative | P0-P2 |
| FR-007 | AC-007-02 | #13, #19, #23, #28-31 | positive | P0-P1 |
| FR-007 | AC-007-03 | #9, #11-12, #17-18, #21-22, #26-27, #31 | positive, negative | P0 |
| FR-007 | AC-007-04 | #32-35 | positive | P0-P1 |
| FR-009 | AC-009-01 | #40-45, #55-58 | positive, negative | P0-P2 |
| FR-009 | AC-009-02 | #46-48 | positive, negative | P0 |
| FR-009 | AC-009-03 | #49-51 | positive, negative | P0-P1 |
| FR-009 | AC-009-04 | #52-54, #48 | negative | P0-P1 |
| FR-010 | AC-010-01 | #59-62, #75-78, #80 | positive, negative | P0-P2 |
| FR-010 | AC-010-02 | #63-65 | positive, negative | P0 |
| FR-010 | AC-010-03 | #66-70, #79 | positive | P0-P1 |
| FR-010 | AC-010-04 | #71-74 | negative | P0-P1 |

**Coverage Summary**:

| FR | AC Count | ACs Covered | Test Count | Coverage |
|----|----------|-------------|-----------|----------|
| FR-007 | 4 | 4/4 | 39 (M8) | 100% |
| FR-009 | 4 | 4/4 | 19 (M6 ext) | 100% |
| FR-010 | 4 | 4/4 | 22 (M9) | 100% |
| **Total** | **12** | **12/12** | **~80** | **100%** |

---

## Critical Paths

1. **Package distribution integrity**: `buildPackage()` -> transport `publish()` -> transport `fetch()` -> checksum validation -> `readPackage()` -- if any step fails silently, customers get corrupt data
2. **Compatibility gate**: Compatibility matrix validation must block incompatible releases -- a false negative means broken deployments at customer sites
3. **Rollback safety**: Failed updates must not leave the system in an unusable state -- previous version must remain until new version is fully verified
4. **Aggregation atomicity**: Failed aggregation must not produce partial bundles -- customers must never receive incomplete releases

---

## Security Test Considerations

| Concern | Test Approach |
|---------|--------------|
| Auth credential handling | Verify credentials are sent correctly; verify no credentials logged |
| Checksum validation bypass | Verify corrupted downloads are always rejected |
| Path traversal in module IDs | Verify module IDs with `../` are rejected by transport adapters |
| SFTP key handling | Verify private key is not included in error messages |

---

## Gate-04 Checklist

- [x] Test strategy covers unit, integration, E2E, security, performance
- [x] Test cases exist for all requirements (FR-007: 39, FR-009: 19, FR-010: 22)
- [x] Traceability matrix complete (12/12 ACs = 100% coverage)
- [x] Coverage targets defined (>=80% line coverage)
- [x] Test data strategy documented (mocks, fixtures, boundary values, invalid inputs)
- [x] Critical paths identified (4 critical paths documented)
