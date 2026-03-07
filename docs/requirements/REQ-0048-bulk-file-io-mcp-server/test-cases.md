# Test Cases: Bulk File I/O MCP Server

**Requirement**: REQ-0048 / GH-114
**Total Test Cases**: 104
**Last Updated**: 2026-03-07

---

## 1. section-parser.test.js (22 tests)

### 1.1 Heading Match -- Positive (FR-003, AC-003-02, AC-003-04)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SP-01 | findSection locates ## heading | Markdown with `## Section One` | findSection(content, '## Section One') | Returns SectionBounds with correct start, end, level=2 |
| SP-02 | findSection locates ### heading | Markdown with `### Sub Section` | findSection(content, '### Sub Section') | Returns SectionBounds with level=3 |
| SP-03 | findSection locates # heading | Markdown with `# Top Level` | findSection(content, '# Top Level') | Returns SectionBounds with level=1 |
| SP-04 | Section ends at equal level | `## A\nfoo\n## B\nbar` | findSection(content, '## A') | end is line index of `## B` |
| SP-05 | Section ends at higher level | `## A\nfoo\n# B\nbar` | findSection(content, '## A') | end is line index of `# B` |
| SP-06 | Section includes sub-headings | `## A\nfoo\n### Child\nbar\n## B` | findSection(content, '## A') | end is line index of `## B`, includes ### Child |
| SP-07 | Section ends at EOF | `## A\nfoo\nbar` (no next heading) | findSection(content, '## A') | end is total line count (EOF) |
| SP-08 | No heading prefix assumes ## | Markdown with `## Foo` | findSection(content, 'Foo') | Matches `## Foo`, returns SectionBounds |
| SP-09 | spliceSection replaces correctly | Content with section bounds | spliceSection(content, bounds, 'new content') | Lines between bounds replaced with new content |
| SP-10 | spliceSection preserves surrounding | 3-section doc, update middle | spliceSection(content, bounds, 'updated') | First and third sections unchanged |

### 1.2 Marker Match -- Positive (FR-003, AC-003-03)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SP-11 | findSection locates marker | `<!-- section: intro -->\n## Intro\ncontent` | findSection(content, 'intro', 'marker') | Returns SectionBounds starting after marker line |
| SP-12 | Marker: ends at equal/higher heading | `<!-- section: a -->\n## A\nfoo\n## B` | findSection(content, 'a', 'marker') | end at `## B` line |
| SP-13 | Marker: ends at next marker | `<!-- section: a -->\nfoo\n<!-- section: b -->\nbar` | findSection(content, 'a', 'marker') | end at second marker line |

### 1.3 Negative (FR-003, AC-003-06)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SP-14 | Heading not found | Markdown without target heading | findSection(content, '## Missing') | Returns null |
| SP-15 | Marker not found | Markdown without target marker | findSection(content, 'missing', 'marker') | Returns null |
| SP-16 | Empty content | Empty string | findSection('', '## A') | Returns null |
| SP-17 | Empty sectionId | Valid markdown | findSection(content, '') | Returns null |

### 1.4 Boundary (FR-003, AC-003-02, AC-003-04)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SP-18 | Section at document start | `## A\nfoo\n## B` (first line is heading) | findSection(content, '## A') | start = 1 (line after heading) |
| SP-19 | Section at document end no newline | `## A\nfoo\n## B\nbar` (no trailing \n) | findSection(content, '## B') | end is EOF, content includes `bar` |
| SP-20 | Duplicate headings matches first | `## A\nfoo\n## A\nbar` | findSection(content, '## A') | Returns bounds for first `## A` occurrence |
| SP-21 | Empty section body | `## A\n## B\ncontent` | findSection(content, '## A') | start and end are adjacent (empty range) |
| SP-22 | Extra whitespace in heading | `##  Foo` (double space) | findSection(content, '## Foo') | Returns null (strict match) |

---

## 2. lock-manager.test.js (14 tests)

### 2.1 Basic Operations -- Positive (FR-007, AC-007-01)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| LM-01 | Acquire returns release fn | Unlocked path | acquire('/tmp/file.txt') | Returns function, isLocked = true |
| LM-02 | isLocked false for unknown | Empty lock map | isLocked('/tmp/unknown.txt') | Returns false |
| LM-03 | Lock lifecycle | Unlocked path | acquire, check isLocked, release, check isLocked | true then false |
| LM-04 | Second acquire waits | Path locked by first acquirer | Second acquire() starts | Second resolves only after first release() called |
| LM-05 | Different paths parallel | Two different paths | acquire(pathA), acquire(pathB) concurrently | Both resolve immediately |
| LM-06 | Release idempotent | Acquired and released | Call release() again | No error thrown |
| LM-07 | Path normalization | '/tmp/../tmp/file.txt' and '/tmp/file.txt' | acquire both | Second waits for first (same resolved path) |
| LM-08 | FIFO ordering | Path locked, 3 waiters queue | Release sequentially | Waiters acquire in queue order |

### 2.2 Negative / Timeout (FR-007, AC-007-03)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| LM-09 | Timeout throws error | Path locked, 50ms timeout | acquire(path, 50) | Rejects with LockTimeoutError |
| LM-10 | Custom timeout overrides default | Path locked | acquire(path, 100) vs acquire(path, 200) | 100ms times out first |
| LM-11 | Cleanup after all waiters | 3 acquires, all released | Check lock map | Path removed from map (no memory leak) |

### 2.3 Stress / Concurrency (FR-007, AC-007-01, AC-007-04)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| LM-12 | 10 concurrent same path | 10 acquire() calls on same path | Wait for all | All 10 resolve sequentially, no data corruption |
| LM-13 | 5 different paths concurrent | 2 acquires each on 5 paths | Wait for all | Each path pair serializes, different paths run in parallel |
| LM-14 | Timeout no corruption | 3 waiters, middle one times out | Middle rejects, other 2 proceed | First and third acquire successfully |

---

## 3. file-ops.test.js (32 tests)

### 3.1 writeFiles -- Positive (FR-001, FR-006)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-01 | Single file write | Temp dir, one file spec | writeFiles([{path, content}]) | File exists with correct content |
| FO-02 | Batch of 5 files | Temp dir, 5 file specs | writeFiles(files) | All 5 exist with correct content |
| FO-03 | Auto-create parent dirs | Non-existent nested path | writeFiles([{path: '/tmp/a/b/c/file.txt', ...}]) | Dirs created, file written |
| FO-04 | Per-file status response | 3 file writes | writeFiles(files) | results array has 3 entries, each with path + success |
| FO-05 | Summary counts | 3 successful writes | writeFiles(files) | summary: {total: 3, succeeded: 3, failed: 0} |
| FO-06 | Temp file in same directory | Spy on fs operations | writeFiles([{path: '/tmp/dir/file.txt', ...}]) | Temp file created in /tmp/dir/ |
| FO-07 | Temp file naming | Spy on fs operations | writeFiles([...]) | Temp named .{base}.tmp.{pid}.{ts} |
| FO-08 | Overwrite atomicity | Existing file with old content | writeFiles([{path: existingFile, content: 'new'}]) | Old content preserved until rename; new content after |

### 3.2 writeFiles -- Negative (FR-001, FR-005)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-09 | Relative path rejected | files with './relative.txt' | writeFiles(files) | Rejects with INVALID_PATH |
| FO-10 | Empty array rejected | Empty files array | writeFiles([]) | Rejects with EMPTY_BATCH |
| FO-11 | Null content rejected | File with content: null | writeFiles([{path, content: null}]) | Rejects with MISSING_CONTENT |
| FO-12 | Permission denied per-file | Unwritable directory | writeFiles([{path: '/readonly/file.txt', ...}]) | results entry: success=false, error includes EACCES |
| FO-13 | Partial failure no abort | 3 files: 1 bad path, 2 good | writeFiles(files) | 2 succeed, 1 fails; summary: failed=1, succeeded=2 |

### 3.3 readFiles -- Positive (FR-002)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-14 | Single file read | Existing file with known content | readFiles([path]) | results[0].content === expected |
| FO-15 | Batch of 5 reads | 5 existing files | readFiles(paths) | All 5 have content, concurrency demonstrated |
| FO-16 | Content field present | Successful read | readFiles([path]) | results[0].content is string |
| FO-17 | Summary counts | 5 successful reads | readFiles(paths) | summary: {total: 5, succeeded: 5, failed: 0} |

### 3.4 readFiles -- Negative (FR-002, FR-005)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-18 | Missing file per-file error | 3 paths: 1 missing, 2 exist | readFiles(paths) | Missing: error; others: content; summary: failed=1 |
| FO-19 | Relative path rejected | Relative path in array | readFiles(['./foo.txt']) | Rejects with INVALID_PATH |
| FO-20 | Empty array rejected | Empty paths array | readFiles([]) | Rejects with EMPTY_BATCH |

### 3.5 appendSection -- Positive (FR-003)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-21 | Heading match replace | File with ## Target section | appendSection(path, '## Target', 'new content') | Section body replaced, heading preserved |
| FO-22 | Marker match replace | File with <!-- section: id --> | appendSection(path, 'id', 'new', {matchBy:'marker'}) | Section body replaced |
| FO-23 | Uses atomic write | Spy on temp file creation | appendSection(...) | Temp file created and renamed |

### 3.6 appendSection -- Negative (FR-003)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-24 | Section not found error | File without matching section | appendSection(path, '## Missing', 'content') | Returns error: SECTION_NOT_FOUND |
| FO-25 | File not found error | Non-existent file path | appendSection('/tmp/no.md', '## A', 'content') | Returns error: FILE_NOT_FOUND |
| FO-26 | Relative path rejected | Relative file path | appendSection('./file.md', '## A', 'content') | Rejects with INVALID_PATH |

### 3.7 createDirectories -- Positive (FR-004)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-27 | Single directory | Temp dir, new subdir path | createDirectories([path]) | Directory exists |
| FO-28 | Nested recursive | Deep nested path | createDirectories(['/tmp/a/b/c/d/e']) | All levels created |
| FO-29 | Already exists succeeds | Existing directory | createDirectories([existingDir]) | success: true (idempotent) |
| FO-30 | Batch of 5 | 5 new directory paths | createDirectories(paths) | All 5 exist, summary: succeeded=5 |

### 3.8 createDirectories -- Negative (FR-004)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| FO-31 | Relative path rejected | Relative dir path | createDirectories(['./dir']) | Rejects with INVALID_PATH |
| FO-32 | ENOTDIR component is file | Path where component is a file | createDirectories(['/tmp/file.txt/subdir']) | Per-path error: ENOTDIR |

---

## 4. server.test.js (10 tests)

### 4.1 Tool Registration -- Positive (FR-001 through FR-004, FR-009)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SV-01 | write_files tool registered | Server initialized | List tools | write_files present with correct schema |
| SV-02 | read_files tool registered | Server initialized | List tools | read_files present with correct schema |
| SV-03 | append_section tool registered | Server initialized | List tools | append_section present with correct schema |
| SV-04 | create_directories tool registered | Server initialized | List tools | create_directories present with correct schema |

### 4.2 Request Routing -- Positive (FR-001, FR-002, FR-005)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SV-05 | Routes write_files | Mock fileOps | Call write_files tool | fileOps.writeFiles called with correct args |
| SV-06 | Routes read_files | Mock fileOps | Call read_files tool | fileOps.readFiles called with correct args |
| SV-07 | Response format correct | fileOps returns results | Server formats response | Contains results array and summary |

### 4.3 Error Handling -- Negative (FR-005, FR-009)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| SV-08 | Unknown tool error | Server initialized | Call non-existent tool | Error response with tool not found |
| SV-09 | Exception from fileOps | fileOps throws Error | Call write_files | Graceful error response, no crash |
| SV-10 | Malformed request | Invalid JSON structure | Send malformed request | PROTOCOL_ERROR response |

---

## 5. Integration Tests (22 tests)

### 5.1 file-ops-locking.test.js (8 tests)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| INT-01 | Same-path writes serialize | 2 concurrent writeFiles to same path | Both complete | Last writer's content persists, no corruption |
| INT-02 | Different-path writes parallel | 2 concurrent writeFiles to different paths | Both complete | Both complete faster than sequential |
| INT-03 | appendSection acquires lock | appendSection called | Spy on lock-manager | acquire() called before file read |
| INT-04 | writeFiles + appendSection serialize | Concurrent write and append to same path | Both complete | Both succeed, no corruption |
| INT-05 | Lock timeout error | Write holds lock, second write with 50ms timeout | Second times out | LOCK_TIMEOUT error in results |
| INT-06 | Crash safety | Write old content, simulate crash mid-write (skip rename) | Check file | Original content preserved |
| INT-07 | Orphaned temp identifiable | Write creates temp file | List directory during write | Temp matches `.*.tmp.*.*` pattern |
| INT-08 | 10-file batch atomic | 10 files, mix of new and overwrite | writeFiles | All 10 succeed, all atomic (verified by content check) |

### 5.2 section-update.test.js (6 tests)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| INT-09 | Full appendSection flow | Real file with 3 sections | appendSection on middle section | Middle section updated, file valid |
| INT-10 | Heading match multi-section | 5-section document | appendSection('## Section Three', newContent) | Only section 3 updated |
| INT-11 | Marker match flow | File with <!-- section: data --> markers | appendSection('data', content, {matchBy:'marker'}) | Marker section updated |
| INT-12 | Other sections preserved | 5-section document, update section 2 | Read file after update | Sections 1, 3, 4, 5 unchanged |
| INT-13 | Non-existent file error | Path to non-existent file | appendSection | FILE_NOT_FOUND error |
| INT-14 | No matching section error | File without target section | appendSection('## Nonexistent', content) | SECTION_NOT_FOUND error |

### 5.3 server-e2e.test.js (8 tests)

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| INT-15 | write_files end-to-end | Server + temp dir + real files | MCP call write_files | Files written, response matches schema |
| INT-16 | read_files end-to-end | Server + existing files | MCP call read_files | Content returned, response matches schema |
| INT-17 | append_section end-to-end | Server + markdown file | MCP call append_section | Section updated, response matches schema |
| INT-18 | create_directories end-to-end | Server + temp dir | MCP call create_directories | Dirs created, response matches schema |
| INT-19 | Partial failure response | Batch with 1 bad path | MCP call write_files | Mixed results, summary.failed = 1 |
| INT-20 | Mixed read results | Batch with 1 missing file | MCP call read_files | Mixed results, missing has error |
| INT-21 | BatchResult schema validation | Any successful batch call | Validate response | Has results array and summary object |
| INT-22 | Read content field | Successful read | Validate response | results[].content is string |

---

## 6. E2E Tests (4 tests)

### e2e/server-lifecycle.test.js

| ID | Test Name | Given | When | Then |
|----|-----------|-------|------|------|
| E2E-01 | Server starts on stdio | Node process spawned | Send initialize request | Receives initialize response |
| E2E-02 | Lists 4 tools | Running server | Send list_tools request | Response includes write_files, read_files, append_section, create_directories |
| E2E-03 | Clean exit on SIGTERM | Running server | Send SIGTERM | Process exits with code 0 |
| E2E-04 | Malformed JSON no crash | Running server | Send `{invalid json` | Error response, process still alive |
