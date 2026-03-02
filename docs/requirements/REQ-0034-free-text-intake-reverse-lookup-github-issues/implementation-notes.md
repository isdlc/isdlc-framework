# Implementation Notes: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

**Phase**: 06-implementation
**Date**: 2026-02-22
**Requirement**: REQ-0034

## Summary

Added GitHub issue reverse-lookup capability for free-text input to `/isdlc add`. When users provide descriptions (not `#N` or `PROJECT-N`), the framework searches GitHub for matching issues and lets users link, create, or skip.

## Changes Made

### 1. `src/claude/hooks/lib/three-verb-utils.cjs`

Added three new exported functions after `detectSource()`:

**checkGhAvailability()** (lines 155-169)
- Two-step check: `gh --version` (installed?) then `gh auth status` (authenticated?)
- Returns sentinel: `{ available: true }` or `{ available: false, reason: "not_installed"|"not_authenticated" }`
- 2000ms timeout per subprocess call
- Never throws (error-safe)
- Traces: FR-006 (AC-006-01, AC-006-02, AC-006-03)

**searchGitHubIssues(query, options?)** (lines 187-216)
- Sanitizes query (escapes `"`, `$`, `` ` ``, `\`) before shell execution
- Executes: `gh issue list --search "{sanitized}" --json number,title,state --limit {limit}`
- Default limit: 5, default timeout: 3000ms (configurable via options)
- Returns: `{ matches: [{number, title, state}], error?: string }`
- Error sentinels: `timeout` (killed process), `command_error` (other), `parse_error` (invalid JSON)
- Traces: FR-001 (AC-001-01..05)

**createGitHubIssue(title, body?)** (lines 234-267)
- Sanitizes title and body for shell safety
- Default body: "Created via iSDLC framework"
- Executes: `gh issue create --title "{title}" --body "{body}"`
- Parses issue number from URL in stdout via `/\/issues\/(\d+)/`
- Returns: `{ number, url }` or `null` on failure
- 5000ms timeout
- Traces: FR-004 (AC-004-02..05)

### 2. `src/claude/commands/isdlc.md`

- Added three new functions to Shared Utilities documentation section
- Inserted step 3c-prime in the `add` handler, after step 3c (manual detection)
- Step 3c-prime orchestrates the reverse-lookup flow:
  - Check gh availability -> search -> present matches -> user selection -> link/create/skip

### 3. `src/claude/hooks/tests/test-three-verb-utils.test.cjs`

Added 13 new unit tests across 3 describe blocks:
- `checkGhAvailability()`: 3 tests (TC-GH-AVAIL-01 through TC-GH-AVAIL-03)
- `searchGitHubIssues()`: 6 tests (TC-SEARCH-01 through TC-SEARCH-06)
- `createGitHubIssue()`: 4 tests (TC-CREATE-01 through TC-CREATE-04)

All tests mock `child_process.execSync` via `t.mock.method()` -- no real network calls.

## Design Decisions

1. **`childProcess.execSync` vs destructured `execSync`**: The three new functions use `childProcess.execSync()` (module-level reference) instead of the destructured `execSync` used by older functions. This enables `t.mock.method(childProcess, 'execSync', ...)` to intercept calls during testing. The existing code continues to use the destructured form; backward compatibility is preserved.

2. **Shell sanitization approach**: Used simple string replacement for `"`, `$`, `` ` ``, `\` characters. This is sufficient for the `gh` CLI context where queries are passed as double-quoted arguments. A more robust approach (e.g., `shell-escape` library) was considered but rejected per Article V (simplicity) and the no-new-dependencies constraint.

3. **Error sentinel pattern**: All three functions return structured data or null on failure, never throwing exceptions. This follows the existing error-safe pattern in `three-verb-utils.cjs` (e.g., `readMetaJson` returns null on corruption).

4. **No modification to `detectSource()`**: As specified, `detectSource()` is unchanged. The reverse-lookup is a post-detection hook applied only when source is "manual".

## Test Results

- **Total tests**: 306 (293 existing + 13 new)
- **Passing**: 306
- **Failing**: 0
- **Line coverage**: 96.83%
- **Branch coverage**: 93.01%
- **Function coverage**: 97.67%
- **TDD iterations**: 2 (Red -> Green on second iteration after fixing mock approach)

## Architecture Constraints Verified

- [x] No modification to `detectSource()`
- [x] All functions error-safe (return sentinels, never throw)
- [x] Uses `child_process.execSync` (already imported)
- [x] No new npm dependencies
- [x] Follows existing CJS patterns
