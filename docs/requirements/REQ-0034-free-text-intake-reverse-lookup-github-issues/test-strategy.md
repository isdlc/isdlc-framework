# Test Strategy: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

**Version**: 1.0.0
**Phase**: 05-test-strategy
**Requirement**: REQ-0034
**Date**: 2026-02-22

## Existing Infrastructure

- **Framework**: Node.js built-in `node:test` (describe/it/beforeEach/afterEach)
- **Assertions**: `node:assert/strict` (assert.strictEqual, assert.equal, assert.ok, assert.deepStrictEqual)
- **Existing Test File**: `src/claude/hooks/tests/test-three-verb-utils.test.cjs`
- **Existing Test Count**: 284 tests across the codebase
- **Test Patterns**: Temp directory creation for filesystem tests, direct function imports
- **Module System**: CommonJS (.cjs) for hooks and utilities
- **Run Command**: `node --test src/claude/hooks/tests/test-three-verb-utils.test.cjs`

## Strategy for This Requirement

- **Approach**: Extend the existing test suite (`test-three-verb-utils.test.cjs`) with 3 new describe blocks
- **New Test Types Needed**: Unit tests for 3 new exported functions; no new test types required
- **Coverage Target**: 100% line coverage for all 3 new functions (Article II)
- **No New Dependencies**: Uses only `node:test`, `node:assert/strict`, and `child_process` (already in use)

## Test Pyramid

### Unit Tests (13 tests)

All 3 new functions in `three-verb-utils.cjs` are pure synchronous functions that call `execSync` internally. Unit tests mock `execSync` via `node:test` mock API (`t.mock.method`) to isolate from real `gh` CLI.

| Function | Test Count | Mocking Strategy |
|----------|-----------|-----------------|
| `checkGhAvailability()` | 3 | Mock `execSync` to simulate installed/not-installed/not-authenticated |
| `searchGitHubIssues()` | 6 | Mock `execSync` to return JSON strings (matches, empty, timeout, parse error, shell escaping, defaults) |
| `createGitHubIssue()` | 4 | Mock `execSync` to return URL strings (success, failure, URL parse, default body) |

### Integration Tests (Not Required)

The 3 new functions are self-contained utilities with a single dependency (`execSync`). There are no cross-module interactions introduced by this change:
- `isdlc.md` calls the functions but is an instruction set (not testable code)
- `detectSource()` is UNCHANGED and already tested
- `meta.json` and `BACKLOG.md` writes are handled by existing (already-tested) functions

Per Article XI, integration tests validate component interactions. Since the new functions are leaf-node utilities with no inter-module coupling, unit tests with mocked `execSync` provide sufficient coverage. The instruction block in `isdlc.md` handles orchestration and is validated by manual acceptance testing.

### E2E Tests (Not Required for This Change)

The UX flow (match presentation, selection, create/skip) lives in `isdlc.md` as markdown instructions executed by the Claude agent. This is not programmatic code and cannot be tested with automated E2E tests. It is validated through manual acceptance testing during the quality loop phase.

### Security Tests (Covered in Unit Tests)

Shell injection prevention is tested as part of `searchGitHubIssues()` unit tests:
- Test case TC-SEARCH-05: Verifies that shell-unsafe characters in queries are escaped before `execSync`

### Performance Tests (Not Required)

Performance requirements (NFR-004: add handler under 5 seconds) apply to the overall `isdlc add` flow, not individual utility functions. The `timeout` parameter on `execSync` calls enforces subprocess time limits (2000ms for `checkGhAvailability`, 3000ms for `searchGitHubIssues`, 5000ms for `createGitHubIssue`). These timeouts are tested via mock error simulation in unit tests (TC-SEARCH-03).

## Flaky Test Mitigation

All tests mock `execSync` -- no real network calls, no real `gh` CLI invocations. This eliminates the primary sources of flakiness:
- No network dependency (GitHub API)
- No filesystem side effects (no temp directories needed)
- No timing sensitivity (mocked timeouts)
- Deterministic test data (hardcoded JSON responses)

The mock approach uses `child_process` module-level mocking via `node:test` context (`t.mock.method`), which is automatically restored after each test.

## Performance Test Plan

No dedicated performance test suite is needed. The functions are synchronous wrappers around `execSync` with explicit timeouts:
- `checkGhAvailability()`: 2000ms timeout per subprocess call
- `searchGitHubIssues()`: configurable timeout (default 3000ms, max 10000ms)
- `createGitHubIssue()`: 5000ms timeout

The timeout behavior is validated by unit tests that simulate ETIMEDOUT errors from `execSync`.

## Test Data Strategy

Test data is entirely synthetic (no external fixtures needed):

| Data Category | Examples |
|---------------|---------|
| gh version output | `"gh version 2.40.0 (2024-01-01)\n"` |
| gh auth status output | `""` (empty string on success, error on failure) |
| Search result JSON | `[{"number":42,"title":"Add payment","state":"open"}]` |
| Empty search result | `[]` |
| Malformed JSON | `"not valid json {"` |
| Issue creation URL | `"https://github.com/owner/repo/issues/73\n"` |
| Shell-unsafe input | `'test "query" with $vars and \`backticks\`'` |

## Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Line coverage | 100% | Article II requirement |
| Branch coverage | 100% | All error paths must be tested (6 error codes in error-taxonomy) |
| Function coverage | 100% (3/3 new functions) | Every exported function has at least one test |
| AC coverage | 100% of testable ACs | All AC mapped to at least one test case |

## Critical Paths

The following paths are critical and must have explicit test coverage:

1. **Happy path**: `checkGhAvailability()` returns available -> `searchGitHubIssues()` returns matches -> function returns structured data
2. **Graceful degradation (gh not installed)**: `checkGhAvailability()` returns `{ available: false, reason: "not_installed" }`
3. **Graceful degradation (not authenticated)**: `checkGhAvailability()` returns `{ available: false, reason: "not_authenticated" }`
4. **Search timeout**: `searchGitHubIssues()` catches ETIMEDOUT and returns `{ matches: [], error: "timeout" }`
5. **Issue creation failure**: `createGitHubIssue()` catches error and returns `null`
6. **Shell injection prevention**: Unsafe characters in query are escaped before shell execution

## Test Commands

```bash
# Run all three-verb-utils tests (existing + new)
node --test src/claude/hooks/tests/test-three-verb-utils.test.cjs

# Run with verbose output
node --test --test-reporter spec src/claude/hooks/tests/test-three-verb-utils.test.cjs
```

## Mocking Approach

The `child_process` module's `execSync` function is mocked at the module level. Since the functions under test import `execSync` at module load time via `require('child_process')`, the mock must intercept at the `child_process` module level.

**Pattern (node:test mock API)**:

```javascript
const childProcess = require('child_process');

describe('checkGhAvailability()', () => {
    it('returns available when gh is installed and authenticated', (t) => {
        t.mock.method(childProcess, 'execSync', (cmd) => {
            // Return appropriate output based on command
            if (cmd.includes('gh --version')) return 'gh version 2.40.0\n';
            if (cmd.includes('gh auth status')) return '';
            throw new Error('unexpected command: ' + cmd);
        });
        const result = checkGhAvailability();
        assert.deepStrictEqual(result, { available: true });
    });
});
```

This pattern is consistent with `node:test` best practices and auto-restores mocks after each test context.

## Regression Safety

The 3 new functions are additive -- they do not modify any existing function. `detectSource()` remains unchanged. The existing 284 tests continue to pass unmodified. New tests are appended to the existing `describe` blocks in the same test file.
