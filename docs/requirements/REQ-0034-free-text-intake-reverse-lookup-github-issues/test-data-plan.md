# Test Data Plan: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

**Version**: 1.0.0
**Phase**: 05-test-strategy
**Requirement**: REQ-0034

## Overview

All test data is synthetic and defined inline in test cases. No external fixture files or test databases are needed. The 3 functions under test interact only with `child_process.execSync`, so test data consists of mock return values and thrown errors.

## Mock Data by Function

### checkGhAvailability() Mock Data

| Scenario | Mock execSync Behavior | Expected Return |
|----------|----------------------|-----------------|
| gh installed + authenticated | `gh --version` returns `"gh version 2.40.0 (2024-01-01)\nhttps://github.com/cli/cli\n"`, `gh auth status` returns `""` | `{ available: true }` |
| gh not installed | `gh --version` throws `new Error("command not found: gh")` | `{ available: false, reason: "not_installed" }` |
| gh not authenticated | `gh --version` returns valid output, `gh auth status` throws `new Error("not logged in")` | `{ available: false, reason: "not_authenticated" }` |

### searchGitHubIssues() Mock Data

| Scenario | Mock execSync Return | Expected Return |
|----------|---------------------|-----------------|
| Multiple matches | `'[{"number":42,"title":"Add payment processing module","state":"open"},{"number":38,"title":"Payment processing integration","state":"closed"}]'` | `{ matches: [{...}, {...}] }` |
| Empty results | `'[]'` | `{ matches: [] }` |
| Timeout | Throws `Object.assign(new Error("timed out"), { killed: true })` | `{ matches: [], error: "timeout" }` |
| Invalid JSON | `'"not valid json {"'` | `{ matches: [], error: "parse_error" }` |
| Shell-unsafe query | Input: `'test "query" with $vars'` -> verify escaped command | `{ matches: [] }` (focus is on command escaping) |
| Default options | Input: `"test query"` with no options -> verify `--limit 5` and `timeout: 3000` | `{ matches: [] }` (focus is on defaults) |

### createGitHubIssue() Mock Data

| Scenario | Mock execSync Return | Expected Return |
|----------|---------------------|-----------------|
| Successful creation | `"https://github.com/owner/repo/issues/73\n"` | `{ number: 73, url: "https://github.com/owner/repo/issues/73" }` |
| CLI failure | Throws `new Error("network error")` | `null` |
| Unparseable URL | `"Created issue successfully\n"` (no URL) | `null` |
| Default body | `"https://github.com/owner/repo/issues/99\n"` -> verify command contains default body | `{ number: 99, url: "..." }` |

## Boundary Values

| Boundary | Value | Test Case | Expected Behavior |
|----------|-------|-----------|-------------------|
| Empty query string | `""` | TC-SEARCH (edge) | Returns `{ matches: [], error: "empty_query" }` |
| Null query | `null` | TC-SEARCH (edge) | Returns `{ matches: [], error: "empty_query" }` |
| Whitespace-only query | `"   "` | TC-SEARCH (edge) | Returns `{ matches: [], error: "empty_query" }` after trim |
| Empty title for create | `""` | TC-CREATE (edge) | Returns `null` |
| Null title for create | `null` | TC-CREATE (edge) | Returns `null` |
| Limit at minimum (1) | `options.limit = 1` | TC-SEARCH-06 variant | Command includes `--limit 1` |
| Limit at maximum (20) | `options.limit = 20` | TC-SEARCH-06 variant | Command includes `--limit 20` |
| Limit below minimum (0) | `options.limit = 0` | TC-SEARCH-06 variant | Clamped to 1: `--limit 1` |
| Limit above maximum (50) | `options.limit = 50` | TC-SEARCH-06 variant | Clamped to 20: `--limit 20` |
| Timeout at minimum (1000) | `options.timeout = 1000` | TC-SEARCH-06 variant | execSync options `{ timeout: 1000 }` |
| Timeout below minimum (500) | `options.timeout = 500` | TC-SEARCH-06 variant | Clamped to 1000 |
| Issue number = 1 (smallest) | URL: `".../issues/1\n"` | TC-CREATE-01 variant | `{ number: 1, url: "..." }` |
| Issue number = 99999 (large) | URL: `".../issues/99999\n"` | TC-CREATE-01 variant | `{ number: 99999, url: "..." }` |

## Invalid Inputs

| Invalid Input | Function | Expected Behavior |
|--------------|----------|-------------------|
| `searchGitHubIssues("")` | searchGitHubIssues | `{ matches: [], error: "empty_query" }` |
| `searchGitHubIssues(null)` | searchGitHubIssues | `{ matches: [], error: "empty_query" }` |
| `searchGitHubIssues(undefined)` | searchGitHubIssues | `{ matches: [], error: "empty_query" }` |
| `searchGitHubIssues(123)` (non-string) | searchGitHubIssues | `{ matches: [], error: "empty_query" }` or converts to string |
| `createGitHubIssue("")` | createGitHubIssue | `null` |
| `createGitHubIssue(null)` | createGitHubIssue | `null` |
| `createGitHubIssue(undefined)` | createGitHubIssue | `null` |
| Query with only shell metacharacters | searchGitHubIssues | Escapes all characters, execSync runs safely |
| JSON with missing `number` field | searchGitHubIssues | Item filtered out from matches array |
| JSON with missing `title` field | searchGitHubIssues | Item filtered out from matches array |
| JSON with non-integer `number` | searchGitHubIssues | Item filtered out from matches array |

## Maximum-Size Inputs

| Input | Function | Expected Behavior |
|-------|----------|-------------------|
| 500-character query string | searchGitHubIssues | Passed through to `gh issue list --search` (gh CLI handles truncation) |
| 200-character title | createGitHubIssue | Passed through to `gh issue create --title` (gh CLI handles limits) |
| 10000-character body | createGitHubIssue | Passed through to `gh issue create --body` (gh CLI handles limits) |
| Query with 100 special characters | searchGitHubIssues | All characters escaped; command string is valid shell |

Note: The utility functions do not impose their own length limits. They delegate to the `gh` CLI which handles GitHub API limits (issue titles max ~256 chars, body max ~65536 chars).

## Shell Injection Test Vectors

These inputs specifically test the `sanitizeForShell()` helper:

| Input | Escaped Output |
|-------|---------------|
| `'hello "world"'` | `'hello \\"world\\"'` |
| `'price is $99'` | `'price is \\$99'` |
| `` 'run `whoami`' `` | `` 'run \\`whoami\\`' `` |
| `'back\\slash'` | `'back\\\\slash'` |
| `'all "in $one `cmd`'` | `'all \\"in \\$one \\`cmd\\`'` |
| `'normal text'` | `'normal text'` (unchanged) |

## Data Generation Strategy

No data generation tooling is needed. All test data is:
1. Defined as string literals in the test file
2. Used as mock return values for `execSync`
3. Hardcoded and deterministic (no randomization)

This approach ensures tests are reproducible, fast, and independent of external systems.
