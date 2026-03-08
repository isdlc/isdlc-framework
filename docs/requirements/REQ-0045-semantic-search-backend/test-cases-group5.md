# Test Cases: REQ-0045 Group 5 -- Distribution & Enterprise

**Scope**: FR-007 (M8 Distribution), FR-009 (M6 Compatibility Extension), FR-010 (M9 Aggregation)
**Date**: 2026-03-06
**Total Test Cases**: ~80

---

## M8: Distribution Adapters (FR-007)

### TC-M8-001: Transport Factory -- Artifactory
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: None
- **Input**: `createTransport({ type: 'artifactory', url: 'http://localhost/artifactory', auth: { token: 'test' } })`
- **Expected**: Returns transport object with `publish`, `fetch`, `listVersions`, `checkForUpdates` methods
- **Verification**: `typeof transport.publish === 'function'` for all 4 methods

### TC-M8-002: Transport Factory -- Nexus
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: None
- **Input**: `createTransport({ type: 'nexus', url: 'http://localhost/nexus' })`
- **Expected**: Returns transport object with all 4 required methods

### TC-M8-003: Transport Factory -- S3
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: None
- **Input**: `createTransport({ type: 's3', url: 's3://my-bucket', auth: { accessKeyId: 'key', secretAccessKey: 'secret' } })`
- **Expected**: Returns transport object with all 4 required methods

### TC-M8-004: Transport Factory -- SFTP
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: None
- **Input**: `createTransport({ type: 'sftp', url: 'sftp://host:22/path', auth: { username: 'user', privateKey: '...' } })`
- **Expected**: Returns transport object with all 4 required methods

### TC-M8-005: Transport Factory -- Unknown Type
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P1
- **Input**: `createTransport({ type: 'ftp' })`
- **Expected**: Throws `Error` with message including "unsupported transport type" and listing valid types

### TC-M8-006: Transport Factory -- Missing Config
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P1
- **Input**: `createTransport()` or `createTransport(null)`
- **Expected**: Throws `Error` with message "config is required"

### TC-M8-007: All Transports -- Interface Conformance
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Create all 4 transport types
- **Input**: Check each transport for required method signatures
- **Expected**: All 4 transports expose `publish(packagePath, meta)`, `fetch(moduleId, version, destPath)`, `listVersions(moduleId)`, `checkForUpdates(currentVersionMap)`

### TC-M8-008: Artifactory -- Publish
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock HTTP server; real `.emb` package from `buildPackage()`
- **Input**: `transport.publish(packagePath, { moduleId: 'mod-a', version: '1.0.0' })`
- **Expected**: Mock receives PUT request to `/moduleId/version/moduleId-version.emb`; response includes `{ published: true, url: '...' }`

### TC-M8-009: Artifactory -- Publish Sends Checksums
- **Requirement**: FR-007 / AC-007-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock HTTP server
- **Input**: `transport.publish(packagePath, meta)`
- **Expected**: PUT request includes `X-Checksum-Sha256` header matching actual file checksum

### TC-M8-010: Artifactory -- Fetch
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock HTTP server with stored package
- **Input**: `transport.fetch('mod-a', '1.0.0', destPath)`
- **Expected**: File written to `destPath`; file contents match original package

### TC-M8-011: Artifactory -- Fetch Validates Checksum
- **Requirement**: FR-007 / AC-007-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock HTTP server returning package with correct checksum header
- **Input**: `transport.fetch('mod-a', '1.0.0', destPath)`
- **Expected**: Fetch succeeds; downloaded file checksum matches server-provided checksum

### TC-M8-012: Artifactory -- Fetch Checksum Mismatch
- **Requirement**: FR-007 / AC-007-03
- **Type**: negative
- **Priority**: P0
- **Precondition**: Mock server returns different checksum than file content
- **Input**: `transport.fetch('mod-a', '1.0.0', destPath)`
- **Expected**: Throws error with "checksum mismatch"; partial file removed from destPath

### TC-M8-013: Artifactory -- List Versions
- **Requirement**: FR-007 / AC-007-02
- **Type**: positive
- **Priority**: P1
- **Precondition**: Mock server with version metadata
- **Input**: `transport.listVersions('mod-a')`
- **Expected**: Returns array of `{ version, createdAt, size }` objects

### TC-M8-014: Artifactory -- Auth Header
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P1
- **Precondition**: Transport created with `auth.token`
- **Input**: `transport.publish(packagePath, meta)`
- **Expected**: HTTP request includes `Authorization: Bearer <token>` header

### TC-M8-015: Artifactory -- Publish Retry on Server Error
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P1
- **Precondition**: Mock server returns 500 first 2 times, then 200; transport config `retries: 3`
- **Input**: `transport.publish(packagePath, meta)`
- **Expected**: Succeeds after 3rd attempt; mock receives 3 requests

### TC-M8-016: Nexus -- Publish
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock HTTP server
- **Input**: `transport.publish(packagePath, { moduleId: 'mod-b', version: '2.0.0' })`
- **Expected**: Mock receives upload request to Nexus API endpoint

### TC-M8-017: Nexus -- Fetch with Checksum Validation
- **Requirement**: FR-007 / AC-007-01, AC-007-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock server with valid package
- **Input**: `transport.fetch('mod-b', '2.0.0', destPath)`
- **Expected**: File downloaded; checksum validated

### TC-M8-018: Nexus -- Fetch Checksum Mismatch
- **Requirement**: FR-007 / AC-007-03
- **Type**: negative
- **Priority**: P0
- **Precondition**: Mock server returns corrupt data
- **Input**: `transport.fetch('mod-b', '2.0.0', destPath)`
- **Expected**: Throws error; partial file cleaned up

### TC-M8-019: Nexus -- List Versions
- **Requirement**: FR-007 / AC-007-02
- **Type**: positive
- **Priority**: P1
- **Input**: `transport.listVersions('mod-b')`
- **Expected**: Returns version array from Nexus search API response

### TC-M8-020: S3 -- Publish
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock S3 client
- **Input**: `transport.publish(packagePath, { moduleId: 'mod-c', version: '1.0.0' })`
- **Expected**: Mock S3 `putObject` called with correct bucket/key; returns success

### TC-M8-021: S3 -- Fetch with Checksum
- **Requirement**: FR-007 / AC-007-01, AC-007-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock S3 client with stored object
- **Input**: `transport.fetch('mod-c', '1.0.0', destPath)`
- **Expected**: File written; checksum matches S3 metadata

### TC-M8-022: S3 -- Fetch Checksum Mismatch
- **Requirement**: FR-007 / AC-007-03
- **Type**: negative
- **Priority**: P0
- **Precondition**: Mock S3 returns corrupt object
- **Input**: `transport.fetch('mod-c', '1.0.0', destPath)`
- **Expected**: Throws error; file removed

### TC-M8-023: S3 -- List Versions
- **Requirement**: FR-007 / AC-007-02
- **Type**: positive
- **Priority**: P1
- **Input**: `transport.listVersions('mod-c')`
- **Expected**: Returns parsed version list from S3 `listObjectsV2` response

### TC-M8-024: S3 -- Missing Bucket Config
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P1
- **Input**: `createTransport({ type: 's3', url: '' })`
- **Expected**: Throws error with "bucket is required" or similar

### TC-M8-025: SFTP -- Publish
- **Requirement**: FR-007 / AC-007-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock SFTP client
- **Input**: `transport.publish(packagePath, { moduleId: 'mod-d', version: '1.0.0' })`
- **Expected**: Mock SFTP `put` called with correct remote path

### TC-M8-026: SFTP -- Fetch with Checksum
- **Requirement**: FR-007 / AC-007-01, AC-007-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock SFTP with stored file
- **Input**: `transport.fetch('mod-d', '1.0.0', destPath)`
- **Expected**: File downloaded; checksum validated

### TC-M8-027: SFTP -- Fetch Checksum Mismatch
- **Requirement**: FR-007 / AC-007-03
- **Type**: negative
- **Priority**: P0
- **Input**: `transport.fetch('mod-d', '1.0.0', destPath)` with corrupt mock data
- **Expected**: Throws error; file removed

### TC-M8-028: SFTP -- List Versions
- **Requirement**: FR-007 / AC-007-02
- **Type**: positive
- **Priority**: P1
- **Input**: `transport.listVersions('mod-d')`
- **Expected**: Returns version list from directory listing

### TC-M8-029: Update Checker -- Newer Version Available
- **Requirement**: FR-007 / AC-007-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: Mock transport with versions 1.0.0, 1.1.0, 2.0.0; current: `{ 'mod-a': '1.0.0' }`
- **Input**: `transport.checkForUpdates({ 'mod-a': '1.0.0' })`
- **Expected**: Returns `[{ moduleId: 'mod-a', currentVersion: '1.0.0', availableVersions: ['1.1.0', '2.0.0'] }]`

### TC-M8-030: Update Checker -- Already Latest
- **Requirement**: FR-007 / AC-007-02
- **Type**: positive
- **Priority**: P1
- **Input**: `transport.checkForUpdates({ 'mod-a': '2.0.0' })` when 2.0.0 is latest
- **Expected**: Returns empty array

### TC-M8-031: Update Checker -- Only Compatible Versions
- **Requirement**: FR-007 / AC-007-02, AC-007-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Registry with compatibility rules; versions 1.0.0, 2.0.0 exist; only 1.x compatible
- **Input**: `transport.checkForUpdates({ 'mod-a': '1.0.0' })` with compatibility filter
- **Expected**: Returns only compatible updates (1.x versions)

### TC-M8-032: Rollback -- Previous Version Retained
- **Requirement**: FR-007 / AC-007-04
- **Type**: positive
- **Priority**: P0
- **Precondition**: `destPath/mod-a-1.0.0.emb` exists; fetching version 1.1.0
- **Input**: `transport.fetch('mod-a', '1.1.0', destPath)`
- **Expected**: During download, both 1.0.0 and 1.1.0 files exist; 1.0.0 kept as backup until 1.1.0 verified

### TC-M8-033: Rollback -- Failed Download Preserves Previous
- **Requirement**: FR-007 / AC-007-04
- **Type**: positive
- **Priority**: P0
- **Precondition**: Previous version exists; mock server returns corrupt data
- **Input**: `transport.fetch('mod-a', '1.1.0', destPath)` -- checksum fails
- **Expected**: Error thrown; previous version 1.0.0 remains at destPath; no 1.1.0 file left

### TC-M8-034: Rollback -- Successful Fetch Cleans Up Old
- **Requirement**: FR-007 / AC-007-04
- **Type**: positive
- **Priority**: P1
- **Input**: Successful `fetch()` when previous version exists
- **Expected**: After verification, backup of old version removed (or moved to archive)

### TC-M8-035: Rollback -- First Download (No Previous)
- **Requirement**: FR-007 / AC-007-04
- **Type**: positive
- **Priority**: P1
- **Precondition**: No previous version at destPath
- **Input**: `transport.fetch('mod-a', '1.0.0', destPath)`
- **Expected**: Download succeeds normally without rollback logic error

### TC-M8-036: Edge -- Zero-Byte File Publish
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P2
- **Input**: `transport.publish('/path/to/empty.emb', meta)` where file is 0 bytes
- **Expected**: Throws error with "empty file" or "invalid package"

### TC-M8-037: Edge -- Non-Existent Module Fetch
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P1
- **Input**: `transport.fetch('nonexistent-mod', '1.0.0', destPath)`
- **Expected**: Throws error with "not found" message

### TC-M8-038: Edge -- Empty URL Config
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P2
- **Input**: `createTransport({ type: 'artifactory', url: '' })`
- **Expected**: Throws error with "url is required"

### TC-M8-039: Edge -- Transport Timeout
- **Requirement**: FR-007 / AC-007-01
- **Type**: negative
- **Priority**: P2
- **Precondition**: Mock server with 10s delay; transport `timeoutMs: 100`
- **Input**: `transport.publish(packagePath, meta)`
- **Expected**: Throws timeout error within ~100ms

---

## M6: Compatibility Extension (FR-009)

### TC-M6C-040: Create Compatibility Matrix
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P0
- **Input**: `CompatibilityMatrix.create({ rules: [{ module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } }] })`
- **Expected**: Returns matrix object with `isGroupCompatible()`, `getAlternatives()` methods

### TC-M6C-041: Matrix Declares Compatible Pairs
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P0
- **Input**: Query matrix for compatibility between `mod-auth@2.1.0` and `mod-orders@1.5.0`
- **Expected**: Returns `true` (1.5.0 satisfies `>=1.0.0 <2.0.0` constraint)

### TC-M6C-042: Group Compatibility -- All Compatible
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P0
- **Input**: `matrix.isGroupCompatible({ 'mod-auth': '2.1.0', 'mod-orders': '1.5.0', 'mod-payments': '1.2.3' })`
- **Expected**: Returns `{ compatible: true, conflicts: [] }`

### TC-M6C-043: Group Compatibility -- Incompatible Set
- **Requirement**: FR-009 / AC-009-01
- **Type**: negative
- **Priority**: P0
- **Input**: `matrix.isGroupCompatible({ 'mod-auth': '2.1.0', 'mod-orders': '3.0.0' })` where rule requires `<2.0.0`
- **Expected**: Returns `{ compatible: false, conflicts: [{ module: 'mod-auth', requires: 'mod-orders >=1.0.0 <2.0.0', actual: '3.0.0' }] }`

### TC-M6C-044: Matrix Wildcard Ranges
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P1
- **Input**: Rule `{ module: 'mod-a', compatibleWith: { 'mod-b': '1.x' } }` tested against `mod-b@1.9.9`
- **Expected**: Returns compatible (1.9.9 matches 1.x)

### TC-M6C-045: Empty Matrix -- All Compatible
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P1
- **Input**: `CompatibilityMatrix.create({ rules: [] })` then `isGroupCompatible(anyVersionMap)`
- **Expected**: Returns `{ compatible: true, conflicts: [] }`

### TC-M6C-046: MCP Validation -- Compatible Set Loads
- **Requirement**: FR-009 / AC-009-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: Registry with compatibility matrix; two compatible packages
- **Input**: `validateCompatibilityAtLoad(['mod-auth@2.1.0', 'mod-orders@1.5.0'], matrix)`
- **Expected**: Returns `{ valid: true }`

### TC-M6C-047: MCP Validation -- Incompatible Package Rejected
- **Requirement**: FR-009 / AC-009-02
- **Type**: negative
- **Priority**: P0
- **Precondition**: `mod-orders@3.0.0` not compatible with loaded `mod-auth@2.1.0`
- **Input**: `validateCompatibilityAtLoad(['mod-auth@2.1.0', 'mod-orders@3.0.0'], matrix)`
- **Expected**: Returns `{ valid: false, error: '...' }`

### TC-M6C-048: Validation Error Details
- **Requirement**: FR-009 / AC-009-02, AC-009-04
- **Type**: negative
- **Priority**: P0
- **Input**: Same as TC-M6C-047
- **Expected**: Error includes: module name (`mod-orders`), version (`3.0.0`), expected range (`>=1.0.0 <2.0.0`), and list of compatible alternatives

### TC-M6C-049: Update Checker -- Compatible Only
- **Requirement**: FR-009 / AC-009-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Loaded modules: `{ 'mod-auth': '2.1.0' }`; available `mod-orders` versions: 1.5.0, 2.0.0, 3.0.0; matrix says auth@2.x requires orders@>=1.0.0 <2.0.0
- **Input**: `filterCompatibleUpdates(availableVersions, loadedModules, matrix)`
- **Expected**: Returns only `['1.5.0']` for mod-orders

### TC-M6C-050: Update Checker -- Skips Incompatible
- **Requirement**: FR-009 / AC-009-03
- **Type**: negative
- **Priority**: P0
- **Input**: Same scenario; version 3.0.0 would break compatibility
- **Expected**: 3.0.0 not included in returned updates

### TC-M6C-051: Update Checker -- No Loaded Modules
- **Requirement**: FR-009 / AC-009-03
- **Type**: positive
- **Priority**: P1
- **Input**: `filterCompatibleUpdates(availableVersions, {}, matrix)`
- **Expected**: Returns all available versions (no constraints to violate)

### TC-M6C-052: Error -- Includes Module and Version
- **Requirement**: FR-009 / AC-009-04
- **Type**: negative
- **Priority**: P0
- **Input**: Trigger incompatibility between `mod-auth@2.1.0` and `mod-orders@3.0.0`
- **Expected**: Error message contains both "mod-auth" (or "mod-orders") and "3.0.0"

### TC-M6C-053: Error -- Lists Compatible Alternatives
- **Requirement**: FR-009 / AC-009-04
- **Type**: negative
- **Priority**: P0
- **Input**: Same incompatibility scenario
- **Expected**: Error message includes "compatible versions: 1.0.0, 1.5.0" (or similar list)

### TC-M6C-054: Error -- Multiple Incompatibilities
- **Requirement**: FR-009 / AC-009-04
- **Type**: negative
- **Priority**: P1
- **Input**: Module set with 2+ incompatible pairs
- **Expected**: Error lists all conflicts, not just the first one found

### TC-M6C-055: Edge -- Circular Dependency Reference
- **Requirement**: FR-009 / AC-009-01
- **Type**: negative
- **Priority**: P2
- **Input**: Rule A requires B, rule B requires A (circular)
- **Expected**: Handled gracefully; no infinite loop; either resolves or reports error

### TC-M6C-056: Edge -- Empty Module Map
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P2
- **Input**: `matrix.isGroupCompatible({})`
- **Expected**: Returns `{ compatible: true, conflicts: [] }`

### TC-M6C-057: Edge -- Single Module Always Compatible
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P2
- **Input**: `matrix.isGroupCompatible({ 'mod-auth': '2.1.0' })`
- **Expected**: Returns `{ compatible: true }` (no cross-module check needed)

### TC-M6C-058: Matrix Serialization Roundtrip
- **Requirement**: FR-009 / AC-009-01
- **Type**: positive
- **Priority**: P1
- **Input**: Create matrix -> serialize to JSON -> parse -> create new matrix -> verify same behavior
- **Expected**: Deserialized matrix produces identical compatibility results

---

## M9: Aggregation Pipeline (FR-010)

### TC-M9-059: Aggregate -- Collects Modules into Bundle
- **Requirement**: FR-010 / AC-010-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: 3 valid `.emb` packages built via `buildPackage()`; compatible registry
- **Input**: `aggregate({ modules: [{ id: 'mod-a', version: '1.0.0', packagePath }, ...], releaseVersion: '2026.1', outputDir, registry })`
- **Expected**: Returns `{ bundlePath, manifest, warnings: [] }`; `bundlePath` exists on disk

### TC-M9-060: Bundle Is Valid Tar
- **Requirement**: FR-010 / AC-010-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Aggregated bundle from TC-M9-059
- **Input**: Extract bundle as tar archive
- **Expected**: Contains `manifest.json` + all module `.emb` files

### TC-M9-061: Single Module Bundle
- **Requirement**: FR-010 / AC-010-01
- **Type**: positive
- **Priority**: P0
- **Input**: `aggregate()` with single module
- **Expected**: Valid bundle with 1 module package + manifest

### TC-M9-062: Multiple Modules Bundle
- **Requirement**: FR-010 / AC-010-01
- **Type**: positive
- **Priority**: P0
- **Input**: `aggregate()` with 5 modules
- **Expected**: Bundle contains all 5 `.emb` packages

### TC-M9-063: Compatibility Validated Before Assembly
- **Requirement**: FR-010 / AC-010-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: Compatible module set with compatibility matrix
- **Input**: `aggregate()` with compatibility matrix
- **Expected**: Validation passes; no I/O happens before compatibility check succeeds

### TC-M9-064: Compatible Set Produces Bundle
- **Requirement**: FR-010 / AC-010-02
- **Type**: positive
- **Priority**: P0
- **Input**: `aggregate()` with `mod-auth@2.1.0`, `mod-orders@1.5.0` (compatible per matrix)
- **Expected**: Bundle created successfully

### TC-M9-065: Incompatible Set Fails Before I/O
- **Requirement**: FR-010 / AC-010-02
- **Type**: negative
- **Priority**: P0
- **Precondition**: Incompatible module versions
- **Input**: `aggregate()` with `mod-auth@2.1.0`, `mod-orders@3.0.0`
- **Expected**: Throws error before writing any bundle file; outputDir remains empty

### TC-M9-066: Manifest Lists Module IDs
- **Requirement**: FR-010 / AC-010-03
- **Type**: positive
- **Priority**: P0
- **Input**: Aggregate 3 modules; inspect `result.manifest`
- **Expected**: `manifest.modules` array contains entries with `id` matching each input module

### TC-M9-067: Manifest Lists Module Versions
- **Requirement**: FR-010 / AC-010-03
- **Type**: positive
- **Priority**: P0
- **Input**: Inspect `result.manifest` from aggregation
- **Expected**: Each module entry in manifest has `version` matching input version

### TC-M9-068: Manifest Includes Checksums
- **Requirement**: FR-010 / AC-010-03
- **Type**: positive
- **Priority**: P0
- **Input**: Inspect `result.manifest` from aggregation
- **Expected**: Each module entry has `checksum` field with SHA-256 hex string (64 chars, `/^[a-f0-9]{64}$/`)

### TC-M9-069: Manifest Includes Release Metadata
- **Requirement**: FR-010 / AC-010-03
- **Type**: positive
- **Priority**: P0
- **Input**: Inspect `result.manifest`
- **Expected**: Has `releaseVersion` field matching input; has `createdAt` ISO timestamp

### TC-M9-070: Manifest Is Valid JSON
- **Requirement**: FR-010 / AC-010-03
- **Type**: positive
- **Priority**: P1
- **Input**: Read `manifest.json` from bundle; `JSON.parse()`
- **Expected**: Parses without error; has expected top-level keys

### TC-M9-071: Failed Aggregation -- Incompatible Blocks Release
- **Requirement**: FR-010 / AC-010-04
- **Type**: negative
- **Priority**: P0
- **Input**: `aggregate()` with incompatible version set
- **Expected**: Throws error; error message includes "incompatible" or "compatibility"

### TC-M9-072: Failed Aggregation -- Error Identifies Modules
- **Requirement**: FR-010 / AC-010-04
- **Type**: negative
- **Priority**: P0
- **Input**: Same as TC-M9-071
- **Expected**: Error message includes the names/IDs and versions of incompatible modules

### TC-M9-073: Failed Aggregation -- No Partial Bundle
- **Requirement**: FR-010 / AC-010-04
- **Type**: negative
- **Priority**: P0
- **Input**: Same as TC-M9-071; check outputDir after error
- **Expected**: No `.tar` or partial bundle file exists in outputDir

### TC-M9-074: Failed Aggregation -- Suggests Alternatives
- **Requirement**: FR-010 / AC-010-04
- **Type**: negative
- **Priority**: P1
- **Input**: Same as TC-M9-071
- **Expected**: Error message includes suggested compatible version alternatives

### TC-M9-075: Edge -- Empty Module List
- **Requirement**: FR-010 / AC-010-01
- **Type**: negative
- **Priority**: P1
- **Input**: `aggregate({ modules: [], releaseVersion: '1.0', outputDir, registry })`
- **Expected**: Throws error with "at least one module required"

### TC-M9-076: Edge -- Missing Package File
- **Requirement**: FR-010 / AC-010-01
- **Type**: negative
- **Priority**: P1
- **Input**: `aggregate()` with `packagePath` pointing to non-existent file
- **Expected**: Throws error with "package file not found" for the specific module

### TC-M9-077: Edge -- Duplicate Module IDs
- **Requirement**: FR-010 / AC-010-01
- **Type**: negative
- **Priority**: P2
- **Input**: `aggregate({ modules: [{ id: 'mod-a', ... }, { id: 'mod-a', ... }] })`
- **Expected**: Throws error with "duplicate module" message

### TC-M9-078: Stress -- 10+ Modules
- **Requirement**: FR-010 / AC-010-01
- **Type**: positive
- **Priority**: P2
- **Input**: Build and aggregate 12 module packages
- **Expected**: Bundle created; manifest lists all 12 modules; checksums valid

### TC-M9-079: Manifest Checksum Verification
- **Requirement**: FR-010 / AC-010-03
- **Type**: positive
- **Priority**: P1
- **Input**: Extract bundle; compute SHA-256 of each `.emb` file; compare to manifest checksums
- **Expected**: All checksums match

### TC-M9-080: Aggregate with Warnings
- **Requirement**: FR-010 / AC-010-01
- **Type**: positive
- **Priority**: P2
- **Precondition**: Module with deprecation flag in registry
- **Input**: `aggregate()` including deprecated module
- **Expected**: Aggregation succeeds; `result.warnings` includes deprecation note

---

## Cross-Module Integration Tests

### TC-INT-I1: Publish-Fetch-Aggregate Pipeline
- **Requirement**: FR-007/AC-007-01, FR-010/AC-010-01
- **Type**: positive
- **Priority**: P0
- **Steps**:
  1. Build 3 `.emb` packages with `buildPackage()`
  2. Publish all 3 via mock Artifactory transport
  3. Fetch all 3 to a new directory
  4. Aggregate fetched packages into release bundle
- **Expected**: Release bundle contains all 3 modules; manifest checksums valid

### TC-INT-I2: Update Checker with Compatibility Filter
- **Requirement**: FR-007/AC-007-02, FR-009/AC-009-03
- **Type**: positive
- **Priority**: P0
- **Steps**:
  1. Set up registry with compatibility matrix
  2. Mock transport with multiple versions
  3. Call `checkForUpdates()` with current module versions
- **Expected**: Only compatible version combinations returned

### TC-INT-I3: Aggregate Blocked by Compatibility
- **Requirement**: FR-010/AC-010-02, FR-009/AC-009-01
- **Type**: negative
- **Priority**: P0
- **Steps**:
  1. Create compatibility matrix declaring `mod-auth@2.x` incompatible with `mod-orders@3.x`
  2. Build packages for `mod-auth@2.1.0` and `mod-orders@3.0.0`
  3. Attempt `aggregate()` with both
- **Expected**: Aggregation blocked; error identifies the incompatible pair

### TC-INT-I4: Fetch with Rollback Verification
- **Requirement**: FR-007/AC-007-04
- **Type**: positive
- **Priority**: P0
- **Steps**:
  1. Fetch `mod-a@1.0.0` to destDir (first-time)
  2. Attempt to fetch `mod-a@1.1.0` but mock returns corrupt data
  3. Verify `mod-a@1.0.0` still accessible at destDir
- **Expected**: After failed update, previous version intact

### TC-INT-I5: Full Distribution Lifecycle
- **Requirement**: FR-007/AC-007-01..04, FR-010/AC-010-01..04
- **Type**: positive
- **Priority**: P0
- **Steps**:
  1. Build 3 compatible `.emb` packages (M5)
  2. Register in module registry (M6)
  3. Set compatibility matrix (M6 extension)
  4. Publish via transport (M8)
  5. Check for updates (M8 + M6 compatibility)
  6. Fetch updated packages (M8 with rollback)
  7. Aggregate into release bundle (M9)
  8. Verify bundle manifest (M9)
- **Expected**: Each step succeeds; final bundle is complete and valid
