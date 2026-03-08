# Test Strategy: Bulk File I/O MCP Server

**Status**: Approved
**Requirement**: REQ-0048 / GH-114
**Last Updated**: 2026-03-07
**Coverage Target**: >= 80% line, >= 70% branch (per Article II)

---

## 1. Overview

This document defines the test strategy for the Bulk File I/O MCP Server (`packages/bulk-fs-mcp/`). The server consists of 4 modules with clear boundaries, enabling focused unit testing per module and integration testing across module interactions.

### Modules Under Test

| Module | Responsibility | Test Focus |
|--------|---------------|------------|
| `server.js` | MCP protocol handling, tool registration | Tool registration, request routing, response formatting |
| `file-ops.js` | Batch write, read, section update, directory creation | Core I/O operations, error handling, atomic safety |
| `lock-manager.js` | Per-path mutex | Concurrency, timeout, deadlock prevention |
| `section-parser.js` | Markdown section identification and splicing | Parsing correctness, edge cases, boundary detection |

### Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion library**: `node:assert/strict`
- **Test pattern**: `*.test.js` co-located with source files
- **Test command**: `node --test` (will add package-specific script)
- **Coverage tool**: Node.js built-in `--experimental-test-coverage` or c8
- **Current project tests**: ~1100+ tests across lib/ and hooks/

### Strategy for This Package

- **Approach**: Greenfield -- design complete test suite from scratch
- **Conventions**: Match existing project patterns (`node:test`, `assert/strict`, `*.test.js`)
- **Location**: Tests co-located in `packages/bulk-fs-mcp/` alongside source modules
- **Independence**: Package tests run standalone (`node --test packages/bulk-fs-mcp/*.test.js`)

---

## 2. Test Pyramid

### Level 1: Unit Tests (70% of test effort)

Unit tests validate each module in isolation with dependencies mocked/stubbed.

| Module | Unit Test File | Test Count (est.) |
|--------|---------------|-------------------|
| `section-parser.js` | `section-parser.test.js` | 22 |
| `lock-manager.js` | `lock-manager.test.js` | 14 |
| `file-ops.js` | `file-ops.test.js` | 32 |
| `server.js` | `server.test.js` | 10 |
| **Total** | | **78** |

**Mocking strategy**: Use dependency injection for `fs` operations in file-ops.js. The lock-manager and section-parser are pure logic modules that need no mocking.

### Level 2: Integration Tests (25% of test effort)

Integration tests validate cross-module interactions using real filesystem operations in temporary directories.

| Integration Scope | Test File | Test Count (est.) |
|-------------------|-----------|-------------------|
| file-ops + lock-manager | `integration/file-ops-locking.test.js` | 8 |
| file-ops + section-parser | `integration/section-update.test.js` | 6 |
| server + all modules (MCP call simulation) | `integration/server-e2e.test.js` | 8 |
| **Total** | | **22** |

**Real filesystem**: Integration tests create temp directories via `fs.mkdtemp`, write real files, verify content, and clean up in `after()` hooks.

### Level 3: E2E / System Tests (5% of test effort)

E2E tests validate the MCP server as a spawned process communicating via stdio.

| E2E Scope | Test File | Test Count (est.) |
|-----------|-----------|-------------------|
| Server process lifecycle | `e2e/server-lifecycle.test.js` | 4 |
| **Total** | | **4** |

**Total estimated tests**: 104

---

## 3. Test Case Specifications

### 3.1 section-parser.test.js (22 tests)

#### Requirement: FR-003 (Incremental Section Update)

**Positive tests (heading match)**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| SP-01 | findSection locates `## Section Name` heading at level 2 | AC-003-02 | positive |
| SP-02 | findSection locates `### Sub Section` heading at level 3 | AC-003-02 | positive |
| SP-03 | findSection locates `# Top Level` heading at level 1 | AC-003-02 | positive |
| SP-04 | Section ends at next heading of equal level | AC-003-04 | positive |
| SP-05 | Section ends at next heading of higher level (lower number) | AC-003-04 | positive |
| SP-06 | Section includes sub-headings (lower level headings are part of section) | AC-003-04 | positive |
| SP-07 | Section ends at EOF when no subsequent heading | AC-003-04 | positive |
| SP-08 | findSection without heading prefix assumes level 2 | AC-003-02 | positive |
| SP-09 | spliceSection replaces content between bounds correctly | AC-003-04 | positive |
| SP-10 | spliceSection preserves content before and after the section | AC-003-04 | positive |

**Positive tests (marker match)**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| SP-11 | findSection locates `<!-- section: id -->` marker | AC-003-03 | positive |
| SP-12 | Marker match: section ends at next equal/higher heading | AC-003-03, AC-003-04 | positive |
| SP-13 | Marker match: section ends at next marker | AC-003-03 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| SP-14 | findSection returns null when heading not found | AC-003-06 | negative |
| SP-15 | findSection returns null when marker not found | AC-003-06 | negative |
| SP-16 | findSection returns null for empty content | AC-003-06 | negative |
| SP-17 | findSection with empty sectionId returns null | AC-003-06 | negative |

**Boundary tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| SP-18 | Section at very start of document (first line) | AC-003-02 | positive |
| SP-19 | Section at very end of document (last line, no trailing newline) | AC-003-04 | positive |
| SP-20 | Multiple sections with same heading text -- matches first occurrence | AC-003-02 | positive |
| SP-21 | Section with empty body (heading immediately followed by next heading) | AC-003-04 | positive |
| SP-22 | Heading with extra whitespace (e.g., `##  Foo`) | AC-003-02 | negative |

### 3.2 lock-manager.test.js (14 tests)

#### Requirement: FR-007 (Concurrency Control)

**Positive tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| LM-01 | acquire returns release function for unlocked path | AC-007-01 | positive |
| LM-02 | isLocked returns false for path not in map | AC-007-01 | positive |
| LM-03 | isLocked returns true after acquire, false after release | AC-007-01 | positive |
| LM-04 | Second acquire on same path waits until first releases | AC-007-01 | positive |
| LM-05 | Concurrent acquires on different paths proceed in parallel | AC-007-04 | positive |
| LM-06 | Release function can be called multiple times without error | AC-007-01 | positive |
| LM-07 | Path normalization: relative and absolute resolve to same lock | AC-007-02 | positive |
| LM-08 | Lock release allows next waiter to proceed in FIFO order | AC-007-01 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| LM-09 | acquire throws LockTimeoutError after timeout expires | AC-007-03 | negative |
| LM-10 | Custom timeout overrides default 30s | AC-007-03 | negative |
| LM-11 | Lock map is cleaned up after all waiters are done | AC-007-01 | negative |

**Concurrency stress tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| LM-12 | 10 concurrent acquires on same path serialize correctly | AC-007-01, AC-007-04 | positive |
| LM-13 | Mixed concurrent acquires on 5 different paths complete independently | AC-007-04 | positive |
| LM-14 | Timeout during contention does not corrupt lock state for other waiters | AC-007-03 | positive |

### 3.3 file-ops.test.js (32 tests)

#### 3.3.1 writeFiles -- FR-001 (Batch File Write), FR-006 (Atomic Write Safety)

**Positive tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-01 | writeFiles writes single file with correct content | AC-001-01 | positive |
| FO-02 | writeFiles writes batch of 5 files, all succeed | AC-001-01 | positive |
| FO-03 | writeFiles creates parent directories automatically | AC-001-05 | positive |
| FO-04 | writeFiles response includes per-file status with path and success | AC-001-04 | positive |
| FO-05 | writeFiles response includes summary with total/succeeded/failed counts | AC-005-04 | positive |
| FO-06 | Atomic write: temp file created in same directory as target | AC-006-01 | positive |
| FO-07 | Atomic write: temp file uses `.{name}.tmp.{pid}.{ts}` naming | AC-006-05 | positive |
| FO-08 | Overwrite existing file preserves atomicity (old content until rename) | AC-006-04 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-09 | writeFiles rejects relative paths with INVALID_PATH error | AC-001-01 | negative |
| FO-10 | writeFiles rejects empty files array with EMPTY_BATCH error | AC-001-01 | negative |
| FO-11 | writeFiles rejects null/undefined content with MISSING_CONTENT error | AC-001-01 | negative |
| FO-12 | writeFiles: permission denied on target directory reports per-file error | AC-005-02 | negative |
| FO-13 | writeFiles: partial batch failure -- failed file does not abort others | AC-005-03, AC-001-03 | negative |

#### 3.3.2 readFiles -- FR-002 (Batch File Read)

**Positive tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-14 | readFiles reads single file and returns content | AC-002-01 | positive |
| FO-15 | readFiles reads batch of 5 files concurrently | AC-002-01, AC-002-04 | positive |
| FO-16 | readFiles response includes per-file result with content | AC-002-03 | positive |
| FO-17 | readFiles response includes summary counts | AC-005-04 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-18 | readFiles: missing file returns per-file error, other files still read | AC-002-02 | negative |
| FO-19 | readFiles rejects relative paths with INVALID_PATH error | AC-002-01 | negative |
| FO-20 | readFiles rejects empty paths array with EMPTY_BATCH error | AC-002-01 | negative |

#### 3.3.3 appendSection -- FR-003 (Incremental Section Update)

**Positive tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-21 | appendSection replaces section content by heading match | AC-003-01, AC-003-02 | positive |
| FO-22 | appendSection replaces section content by marker match | AC-003-01, AC-003-03 | positive |
| FO-23 | appendSection uses atomic write (temp+rename) | AC-003-05 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-24 | appendSection returns error when section not found | AC-003-06 | negative |
| FO-25 | appendSection returns error when file does not exist | AC-003-07 | negative |
| FO-26 | appendSection rejects relative path | AC-003-01 | negative |

#### 3.3.4 createDirectories -- FR-004 (Batch Directory Creation)

**Positive tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-27 | createDirectories creates single directory | AC-004-01 | positive |
| FO-28 | createDirectories creates nested directories recursively | AC-004-02 | positive |
| FO-29 | createDirectories succeeds if directory already exists | AC-004-04 | positive |
| FO-30 | createDirectories creates batch of 5 directories | AC-004-01 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| FO-31 | createDirectories rejects relative paths | AC-004-01 | negative |
| FO-32 | createDirectories: ENOTDIR when path component is a file | AC-004-03 | negative |

### 3.4 server.test.js (10 tests)

#### Requirement: FR-001 through FR-005, FR-009

**Positive tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| SV-01 | Server registers write_files tool with correct schema | AC-001-01 | positive |
| SV-02 | Server registers read_files tool with correct schema | AC-002-01 | positive |
| SV-03 | Server registers append_section tool with correct schema | AC-003-01 | positive |
| SV-04 | Server registers create_directories tool with correct schema | AC-004-01 | positive |
| SV-05 | Server routes write_files call to fileOps.writeFiles | AC-001-01 | positive |
| SV-06 | Server routes read_files call to fileOps.readFiles | AC-002-01 | positive |
| SV-07 | Server formats response with results array and summary | AC-005-01, AC-005-04 | positive |

**Negative tests**:

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| SV-08 | Server returns error for unknown tool name | FR-009 | negative |
| SV-09 | Server handles thrown exception from fileOps gracefully | AC-005-02 | negative |
| SV-10 | Server returns PROTOCOL_ERROR for malformed request | FR-009 | negative |

### 3.5 Integration Tests (22 tests)

#### 3.5.1 integration/file-ops-locking.test.js (8 tests)

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| INT-01 | Concurrent writeFiles to same path serialize via lock-manager | AC-001-06, AC-007-01 | positive |
| INT-02 | Concurrent writeFiles to different paths run in parallel | AC-007-04 | positive |
| INT-03 | appendSection acquires lock before modifying file | AC-007-05 | positive |
| INT-04 | writeFiles + appendSection on same file serialize correctly | AC-007-05 | positive |
| INT-05 | Lock timeout during concurrent writes returns LOCK_TIMEOUT error | AC-007-03 | negative |
| INT-06 | Crashed write leaves original file intact (simulate crash after temp write, before rename) | AC-006-04 | positive |
| INT-07 | Orphaned temp file follows naming convention and can be identified | AC-006-05 | positive |
| INT-08 | writeFiles with 10 files: mix of new and overwrite, all atomic | AC-001-01, AC-006-01 | positive |

#### 3.5.2 integration/section-update.test.js (6 tests)

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| INT-09 | appendSection reads file, finds section, splices, writes atomically | AC-003-01, AC-003-05 | positive |
| INT-10 | appendSection with heading match updates correct section in multi-section document | AC-003-02, AC-003-04 | positive |
| INT-11 | appendSection with marker match updates correct section | AC-003-03 | positive |
| INT-12 | appendSection preserves other sections in the file | AC-003-04 | positive |
| INT-13 | appendSection on non-existent file returns FILE_NOT_FOUND error | AC-003-07 | negative |
| INT-14 | appendSection on file with no matching section returns SECTION_NOT_FOUND | AC-003-06 | negative |

#### 3.5.3 integration/server-e2e.test.js (8 tests)

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| INT-15 | Full write_files flow: MCP call -> file-ops -> lock -> fs -> response | AC-001-01 | positive |
| INT-16 | Full read_files flow: MCP call -> file-ops -> fs -> response with content | AC-002-01 | positive |
| INT-17 | Full append_section flow: MCP call -> parser -> lock -> fs -> response | AC-003-01 | positive |
| INT-18 | Full create_directories flow: MCP call -> file-ops -> fs -> response | AC-004-01 | positive |
| INT-19 | Batch write with partial failure returns mixed results and correct summary | AC-005-01, AC-005-03 | negative |
| INT-20 | Batch read with mixed existing/missing files returns correct per-file results | AC-002-02, AC-005-03 | negative |
| INT-21 | Response format matches interface-spec.md BatchResult schema | AC-005-01 | positive |
| INT-22 | Response format for read_files includes content field on success | AC-002-03 | positive |

### 3.6 E2E Tests (4 tests)

#### e2e/server-lifecycle.test.js

| ID | Test Case | AC | Type |
|----|-----------|-----|------|
| E2E-01 | Server starts on stdio and responds to initialize | AC-009-03 | positive |
| E2E-02 | Server lists all 4 tools in capabilities | AC-009-03 | positive |
| E2E-03 | Server process exits cleanly on SIGTERM | FR-009 | positive |
| E2E-04 | Server handles malformed JSON input without crashing | FR-009 | negative |

---

## 4. Flaky Test Mitigation

### Filesystem-Based Flakiness

| Risk | Mitigation |
|------|------------|
| Temp directory conflicts | Each test creates unique temp dir via `fs.mkdtemp(path.join(os.tmpdir(), 'bulk-fs-'))` |
| File permission tests vary by OS | Skip permission tests on Windows (POSIX-only); use `process.platform` guard |
| Race conditions in concurrency tests | Use deterministic ordering via controlled lock release sequences |
| Orphaned temp files from crashed tests | `after()` hooks clean up temp dirs recursively |

### Timing-Based Flakiness

| Risk | Mitigation |
|------|------------|
| Lock timeout tests are time-sensitive | Use short timeouts (50-100ms) for test locks, not the production 30s default |
| Concurrent operations may complete in unpredictable order | Assert on set membership (all items present) rather than order |
| Process spawn timing in E2E tests | Use retry with exponential backoff for server ready detection |

### Isolation Strategy

- Every test suite creates its own temp directory
- No shared state between test files
- No shared state between `describe` blocks (each has own setup/teardown)
- Lock manager instances are created fresh per test (not shared singleton)

---

## 5. Coverage Targets

### Line Coverage

| Module | Target | Justification |
|--------|--------|---------------|
| `section-parser.js` | >= 95% | Pure logic, no I/O -- should be fully testable |
| `lock-manager.js` | >= 90% | Small module, timing edge cases may reduce coverage slightly |
| `file-ops.js` | >= 85% | OS-specific error paths may be hard to trigger |
| `server.js` | >= 80% | MCP SDK integration has some internal paths |
| **Overall** | **>= 85%** | Above Article II threshold of 80% |

### Branch Coverage

| Module | Target |
|--------|--------|
| `section-parser.js` | >= 90% |
| `lock-manager.js` | >= 85% |
| `file-ops.js` | >= 75% |
| `server.js` | >= 70% |
| **Overall** | **>= 75%** |

### Critical Paths (100% Required)

Per Article II, these paths must have 100% coverage:

1. **Atomic write sequence**: temp file creation -> write -> flush -> rename (FR-006)
2. **Lock acquire/release lifecycle**: acquire -> operation -> release in finally block (FR-007)
3. **Validation rules**: path absoluteness check, empty batch rejection (all FRs)
4. **Error propagation**: per-item error capture without aborting batch (FR-005)
5. **Section boundary detection**: heading match, marker match, end-of-section detection (FR-003)

---

## 6. Performance Test Plan

### Benchmark Tests (not gating, informational)

| Test | Metric | Baseline |
|------|--------|----------|
| Write 10 files (1KB each) | Wall-clock time | < 200ms |
| Read 10 files (1KB each) | Wall-clock time | < 100ms |
| Write 100 files (1KB each) | Wall-clock time | < 2s |
| Read 100 files (1KB each) | Wall-clock time | < 1s |
| Concurrent lock contention (10 acquires, same path) | Total time | < 500ms |
| Section parse on 10KB markdown file | Wall-clock time | < 10ms |

### Memory Profile

| Test | Metric | Threshold |
|------|--------|-----------|
| Server at rest | RSS | < 30MB |
| During 100-file batch write | RSS | < 50MB |
| After batch operation completes | RSS delta vs rest | < 5MB (no leak) |

### Cold Start

| Test | Metric | Threshold |
|------|--------|-----------|
| Server process spawn to ready | Wall-clock time | < 500ms (NFR-001) |

---

## 7. Security Test Plan

### Input Validation

| Test | What it validates | FR |
|------|-------------------|-----|
| Path traversal: `../../etc/passwd` | Rejected as relative path | FR-001, FR-002 |
| Null bytes in path: `/tmp/file\x00.txt` | Rejected or sanitized | FR-001 |
| Extremely long path (> 4096 chars) | Handled gracefully | FR-001 |
| Content with special characters (Unicode, null bytes) | Written correctly | FR-001 |
| Empty string paths | Rejected with clear error | FR-001, FR-002 |

### Filesystem Safety

| Test | What it validates | FR |
|------|-------------------|-----|
| Symlink target resolution for lock paths | Locks keyed by resolved path | FR-007 |
| Race condition: file deleted between read and write in appendSection | Error returned, no crash | FR-003 |
| Temp file cleanup on write error | No orphaned temp files | FR-006 |

---

## 8. Test File Structure

```
packages/bulk-fs-mcp/
  section-parser.js
  section-parser.test.js          # 22 unit tests
  lock-manager.js
  lock-manager.test.js            # 14 unit tests
  file-ops.js
  file-ops.test.js                # 32 unit tests
  server.js
  server.test.js                  # 10 unit tests
  integration/
    file-ops-locking.test.js      # 8 integration tests
    section-update.test.js        # 6 integration tests
    server-e2e.test.js            # 8 integration tests
  e2e/
    server-lifecycle.test.js      # 4 E2E tests
  package.json
  index.js                        # Entry point
```

### Test Commands

```bash
# Run all package tests
node --test packages/bulk-fs-mcp/*.test.js packages/bulk-fs-mcp/integration/*.test.js

# Run unit tests only
node --test packages/bulk-fs-mcp/*.test.js

# Run integration tests only
node --test packages/bulk-fs-mcp/integration/*.test.js

# Run E2E tests only
node --test packages/bulk-fs-mcp/e2e/*.test.js

# Run with coverage
node --test --experimental-test-coverage packages/bulk-fs-mcp/*.test.js
```

---

## 9. Test Data Plan

### Boundary Values

| Category | Values | Used In |
|----------|--------|---------|
| File count | 0, 1, 10, 100 | writeFiles, readFiles batch tests |
| File content size | 0 bytes, 1 byte, 1KB, 1MB | writeFiles content handling |
| Path length | 1 char, 255 chars, 4096 chars | Path validation tests |
| Section count in document | 1, 5, 20 | section-parser tests |
| Heading levels | 1 through 6 | section-parser heading level tests |
| Lock timeout | 0ms, 1ms, 50ms, 30000ms | lock-manager timeout tests |

### Invalid Inputs

| Category | Values | Expected Error |
|----------|--------|----------------|
| Relative path | `./foo.txt`, `../bar/baz.txt`, `foo.txt` | INVALID_PATH |
| Empty batch | `[]` | EMPTY_BATCH |
| Null content | `null`, `undefined` | MISSING_CONTENT |
| Empty section ID | `""` | MISSING_SECTION_ID |
| Non-string content | `42`, `true`, `{}` | MISSING_CONTENT (type error) |
| Non-existent file (read) | `/tmp/nonexistent-{uuid}.txt` | ENOENT |
| Non-existent file (appendSection) | `/tmp/nonexistent-{uuid}.md` | FILE_NOT_FOUND |

### Maximum-Size Inputs

| Category | Value | Purpose |
|----------|-------|---------|
| Large batch | 100 files | Verify no memory issues, reasonable completion time |
| Large file content | 1MB string | Verify streaming/buffering handles large content |
| Large markdown document | 10KB, 50 sections | Section parser performance and correctness |
| Deep nested path | 20 directory levels | createDirectories recursive handling |
| Many concurrent locks | 50 paths simultaneously | Lock manager scalability |

### Test Fixtures

Reusable markdown fixtures for section-parser tests:

```javascript
// packages/bulk-fs-mcp/test-fixtures.js
export const fixtures = {
  singleSection: '# Title\n\n## Section One\n\nContent here.\n',
  multiSection: '# Title\n\n## Section One\n\nContent one.\n\n## Section Two\n\nContent two.\n\n## Section Three\n\nContent three.\n',
  nestedHeadings: '## Parent\n\nParent content.\n\n### Child\n\nChild content.\n\n## Sibling\n\nSibling content.\n',
  markerSection: '<!-- section: intro -->\n## Introduction\n\nIntro content.\n\n<!-- section: body -->\n## Body\n\nBody content.\n',
  emptySection: '## Empty\n\n## Next\n\nContent.\n',
  endOfFile: '## Last Section\n\nFinal content.',
};
```

---

## 10. Mutation Testing Plan

Per Article XI, mutation testing is required with >= 80% mutation score.

### Tools

- **Stryker Mutator** (JavaScript): Configured for the `packages/bulk-fs-mcp/` directory
- Alternative: Manual mutation validation via targeted code changes

### Mutation Targets (Priority Order)

1. `section-parser.js` -- Boundary comparisons (`<=` vs `<`), null returns
2. `lock-manager.js` -- Timeout comparisons, waiter count management
3. `file-ops.js` -- Error handling branches, success/failure flag setting
4. `server.js` -- Request routing, response formatting

### Expected Mutation Score

| Module | Target |
|--------|--------|
| `section-parser.js` | >= 85% |
| `lock-manager.js` | >= 80% |
| `file-ops.js` | >= 80% |
| `server.js` | >= 75% |

---

## 11. Adversarial Testing Plan

Per Article XI, Section 4.

### Property-Based Testing

| Property | Module | Generator |
|----------|--------|-----------|
| Any valid path array produces valid BatchResult shape | file-ops | Random absolute path arrays |
| spliceSection(content, findSection(content, id), new) preserves lines outside section | section-parser | Random markdown documents |
| acquire then release always leaves lock map clean | lock-manager | Random acquire/release sequences |
| writeFiles then readFiles returns same content | file-ops | Random content strings |

### Fuzz Testing

| Target | Input | Expected |
|--------|-------|----------|
| section-parser.findSection | Random strings for content and sectionId | No crash, returns SectionBounds or null |
| file-ops path validation | Random strings (with/without leading `/`) | Correct acceptance or INVALID_PATH |
| server request handler | Random JSON payloads | Graceful error response, no crash |

---

## 12. Fail-Open Fallback Testing (FR-008)

FR-008 testing is partially out-of-scope for this package (the fallback logic lives in consumer agents). However, the server must support detection:

| Test | What it validates | AC |
|------|-------------------|-----|
| Server advertises tools via MCP list_tools | AC-008-01 | positive |
| Server responds to health/ping (if supported) | AC-008-02 | positive |
| Consumer can detect server absence via .mcp.json | AC-008-01 | positive |

---

## 13. Package Structure Testing (FR-009)

| Test | What it validates | AC |
|------|-------------------|-----|
| package.json has no iSDLC internal dependencies | AC-009-02 | positive |
| Entry point is executable via `node packages/bulk-fs-mcp/index.js` | AC-009-03 | positive |
| Package directory is self-contained (no imports from parent) | AC-009-04 | positive |
| package.json has correct name, version, main fields | AC-009-01 | positive |

---

## 14. GATE-04 Validation Checklist

- [x] Test strategy covers unit, integration, E2E, security, performance
- [x] Test cases exist for all 9 functional requirements (FR-001 through FR-009)
- [x] Traceability matrix complete (100% requirement coverage) -- see traceability-matrix.csv
- [x] Coverage targets defined (>= 85% line, >= 75% branch overall)
- [x] Test data strategy documented (boundary values, invalid inputs, max-size)
- [x] Critical paths identified (5 critical paths with 100% coverage requirement)
- [x] Mutation testing plan defined (>= 80% score target, per Article XI)
- [x] Adversarial testing plan defined (property-based and fuzz testing)
- [x] Flaky test mitigation documented
- [x] Test file structure and commands specified

---

## 15. Constitutional Compliance

| Article | Requirement | Status |
|---------|-------------|--------|
| Article II (Test-First) | Tests designed before implementation | Compliant -- this document precedes Phase 06 |
| Article VII (Traceability) | 100% requirement-to-test mapping | Compliant -- see traceability matrix |
| Article IX (Gate Integrity) | All required artifacts exist | Compliant -- strategy, cases, matrix, data plan |
| Article XI (Integration Testing) | Mutation testing, adversarial testing, real I/O | Compliant -- sections 10, 11 |
