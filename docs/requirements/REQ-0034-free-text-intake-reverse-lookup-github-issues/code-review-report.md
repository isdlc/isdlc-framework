# Code Review Report: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

**Reviewer**: QA Engineer (Phase 08)
**Date**: 2026-02-22
**Scope Mode**: FULL SCOPE (no implementation_loop_state detected)
**Verdict**: APPROVED -- No critical or high-severity findings

---

## 1. Files Reviewed

| # | File | Type | Lines Changed |
|---|------|------|--------------|
| 1 | `src/claude/hooks/lib/three-verb-utils.cjs` | Production | +127 (lines 141-267) |
| 2 | `src/claude/hooks/tests/test-three-verb-utils.test.cjs` | Test | +182 (lines 3404-3585) |
| 3 | `src/claude/commands/isdlc.md` | Command Handler | +35 (step 3c-prime + utility docs) |
| 4 | `docs/requirements/REQ-0034-.../implementation-notes.md` | Documentation | +84 |

---

## 2. Code Review Checklist

### 2.1 Logic Correctness

| Check | Status | Notes |
|-------|--------|-------|
| `checkGhAvailability()` handles all states | PASS | Two-step probe: version then auth. All three outcomes covered. |
| `searchGitHubIssues()` query sanitization | PASS | Escapes `\`, `"`, `$`, backtick -- correct order (backslash first). |
| `searchGitHubIssues()` timeout detection | PASS | Uses `e.killed` to distinguish timeout from other errors. |
| `searchGitHubIssues()` JSON parse fallback | PASS | Separate try/catch for parse failure returns `parse_error` sentinel. |
| `createGitHubIssue()` URL extraction | PASS | Regex `/\/issues\/(\d+)/` correctly extracts issue number from gh output. |
| `createGitHubIssue()` default body | PASS | Falls back to "Created via iSDLC framework" when body is falsy. |
| `limit` parameter not sanitized for injection | INFO | The `limit` param is interpolated directly into the shell command. Since it defaults to `5` and callers provide integers, and `gh` CLI would reject non-numeric values, this is acceptable. See Finding F-001. |

### 2.2 Error Handling

| Check | Status | Notes |
|-------|--------|-------|
| All 3 functions never throw | PASS | Every code path wraps in try/catch or returns sentinel/null. |
| `checkGhAvailability()` returns structured sentinel | PASS | `{ available: false, reason: string }` on failure. |
| `searchGitHubIssues()` returns `{ matches: [], error: string }` on failure | PASS | Three distinct error sentinels: `timeout`, `command_error`, `parse_error`. |
| `createGitHubIssue()` returns null on failure | PASS | Both execution failure and parse failure return null. |
| No unhandled promise rejections | N/A | All functions are synchronous (execSync). |

### 2.3 Security

| Check | Status | Notes |
|-------|--------|-------|
| Shell injection via query string | PASS | 4-character escaping (`\`, `"`, `$`, backtick) covers the principal shell metacharacters within double-quoted strings. |
| Shell injection via title/body | PASS | Same 4-character escaping applied to `createGitHubIssue` params. |
| Missing escaping for newlines | LOW | See Finding F-002. Newline characters in user input are not escaped. |
| Missing escaping for `!` (history expansion) | LOW | See Finding F-003. `!` in interactive bash triggers history expansion. |
| `limit` integer interpolation | INFO | See Finding F-001. |
| Timeouts prevent hanging | PASS | 2s for availability, 3s for search, 5s for create. |
| stdio: 'pipe' prevents terminal leakage | PASS | All three functions use `stdio: 'pipe'`. |

### 2.4 Performance

| Check | Status | Notes |
|-------|--------|-------|
| Search timeout respects 5s budget | PASS | Default 3000ms, configurable. |
| Create timeout at 5000ms | PASS | Reasonable for network operation. |
| Availability check fast | PASS | 2000ms timeout per call, max 4000ms total. |
| No synchronous blocking of event loop | INFO | Uses `execSync` which blocks. Acceptable since the CLI is single-threaded and this runs in an interactive prompt. |

### 2.5 Test Coverage

| Check | Status | Notes |
|-------|--------|-------|
| All 13 new tests pass | PASS | 306/306 total, 0 regressions. |
| Line coverage | PASS | 96.83% |
| Branch coverage | PASS | 93.01% |
| Function coverage | PASS | 97.67% |
| Mock strategy correct | PASS | Uses `t.mock.method(childProcess, 'execSync', ...)` which correctly intercepts `childProcess.execSync()` calls. |
| Error paths tested | PASS | Timeout, command_error, parse_error, null returns all tested. |
| Shell escaping tested | PASS | TC-SEARCH-05 verifies `"`, `$`, backtick escaping. |
| Default options tested | PASS | TC-SEARCH-06 and TC-CREATE-04 verify defaults. |

### 2.6 Code Quality

| Check | Status | Notes |
|-------|--------|-------|
| JSDoc complete | PASS | All 3 functions have complete JSDoc with @param, @returns, traces. |
| Naming clarity | PASS | Function names are descriptive and follow existing conventions. |
| DRY principle | INFO | Shell sanitization logic duplicated in `searchGitHubIssues` and `createGitHubIssue`. See Finding F-004. |
| Single Responsibility | PASS | Each function has one clear purpose. |
| Consistent patterns | PASS | Follows existing error-safe sentinel pattern (like `readMetaJson`). |
| Section headers/comments | PASS | Uses the same separator block pattern as existing functions. |
| Module.exports updated | PASS | All 3 functions exported with REQ-0034 comment. |

### 2.7 Documentation

| Check | Status | Notes |
|-------|--------|-------|
| Requirements traces in code | PASS | REQ-0034, FR, and AC references present in JSDoc. |
| Requirements traces in tests | PASS | AC references in test descriptions. |
| Implementation notes complete | PASS | Covers design decisions, test results, architecture constraints. |
| isdlc.md flow documented | PASS | Step 3c-prime is clear and covers all branches. |

---

## 3. Findings

### F-001: `limit` parameter interpolated without sanitization (INFO)

**File**: `src/claude/hooks/lib/three-verb-utils.cjs`, line 198
**Severity**: Info (not exploitable in current context)
**Category**: Security (defense-in-depth)

The `limit` parameter is interpolated into the shell command string without validation:
```javascript
const cmd = `gh issue list --search "${sanitized}" --json number,title,state --limit ${limit}`;
```

While the default value is `5` and callers are expected to provide numeric values, a non-numeric or negative value would produce a malformed command rather than a security issue (gh CLI rejects invalid `--limit` values).

**Recommendation**: Consider adding `const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 5, 25));` for defense-in-depth. This is a low-priority enhancement, not a blocker.

---

### F-002: Newline characters not escaped in shell arguments (LOW)

**File**: `src/claude/hooks/lib/three-verb-utils.cjs`, lines 192-196, 238-247
**Severity**: Low
**Category**: Security (shell injection)

The sanitization escapes `\`, `"`, `$`, and backtick, but does not escape newline characters (`\n`, `\r`). A user input containing a newline could break out of the double-quoted string context in some shell implementations.

Example input: `"query\nmalicious command"`

In practice, `gh` CLI would likely reject the malformed argument, and the `execSync` call uses the default `/bin/sh -c` execution which handles embedded newlines within double quotes. However, for defense-in-depth, newlines should be stripped or replaced with spaces.

**Recommendation**: Add `.replace(/[\n\r]/g, ' ')` to the sanitization chain. Low priority -- acceptable for current release.

---

### F-003: `!` (history expansion) not escaped (LOW)

**File**: `src/claude/hooks/lib/three-verb-utils.cjs`, lines 192-196, 238-247
**Severity**: Low
**Category**: Security (shell injection)

In interactive bash shells, `!` within double quotes triggers history expansion. While `execSync` uses `/bin/sh -c` (not interactive bash), and the `stdio: 'pipe'` option prevents terminal interaction, this is a defense-in-depth concern.

**Recommendation**: Add `.replace(/!/g, '\\!')` to the sanitization chain if interactive shell contexts are ever supported. Low priority.

---

### F-004: Duplicated shell sanitization logic (LOW)

**File**: `src/claude/hooks/lib/three-verb-utils.cjs`, lines 192-196 and 238-247
**Severity**: Low
**Category**: Code quality (DRY)

The same 4-line sanitization chain is duplicated across `searchGitHubIssues` (1 occurrence) and `createGitHubIssue` (2 occurrences). Extracting a `sanitizeForShell(str)` helper would reduce duplication and make future security fixes apply uniformly.

**Recommendation**: Extract to a shared helper. This is a minor code quality improvement, not a blocker. Documented as tech debt.

---

## 4. Requirement Traceability

### Unit-Tested ACs (via three-verb-utils tests)

| AC | Test Case | Status |
|----|-----------|--------|
| AC-001-01 | TC-SEARCH-01, TC-SEARCH-02 | Covered |
| AC-001-02 | TC-SEARCH-05 | Covered |
| AC-001-03 | TC-SEARCH-06 | Covered |
| AC-004-02 | TC-CREATE-01 | Covered |
| AC-004-05 | TC-CREATE-04 | Covered |
| AC-006-01 | TC-GH-AVAIL-01 | Covered |
| AC-006-02 | TC-GH-AVAIL-02 | Covered |
| AC-006-03 | TC-GH-AVAIL-03 | Covered |
| ERR-GH-003 | TC-SEARCH-03 | Covered |
| ERR-GH-004 | TC-SEARCH-04 | Covered |
| ERR-GH-006 | TC-CREATE-02 | Covered |
| ERR-GH-007 | TC-CREATE-03 | Covered |

### UX-Flow ACs (via isdlc.md step 3c-prime)

| AC | Implementation | Status |
|----|---------------|--------|
| AC-001-04, AC-001-05 | isdlc.md step 3c-prime #1 (searches both open/closed; runs only after detectSource returns manual) | Specified |
| AC-002-01..05 | isdlc.md step 3c-prime #3 (numbered list with state, create/skip options) | Specified |
| AC-003-01..03 | isdlc.md step 3c-prime #3 (override source/source_id, re-fetch title) | Specified |
| AC-004-01, AC-004-03, AC-004-04 | isdlc.md step 3c-prime #4 (create prompt, extract number, link) | Specified |
| AC-005-01..03 | isdlc.md step 3c-prime #3 and #4 (skip option always present, no warning) | Specified |
| AC-006-04, AC-006-05 | Implementation: 3s search timeout, all errors non-blocking | Specified |
| AC-007-01..03 | isdlc.md analyze handler chains to add flow | Specified |

---

## 5. Constitutional Compliance

| Article | Status | Evidence |
|---------|--------|----------|
| Article II (Test-First) | PASS | 13 new tests, TDD workflow documented, 96.83% line coverage |
| Article V (Simplicity) | PASS | 3 focused functions, no new dependencies, simple patterns |
| Article VI (Code Review) | PASS | This review |
| Article VII (Traceability) | PASS | FR/AC traces in code, tests, and documentation |
| Article IX (Quality Gate) | PASS | All artifacts present, metrics meet thresholds |
| Article XI (Integration Testing) | N/A | Unit tests use mocked execSync; integration testing of isdlc.md UX flow is out of scope for Phase 08 |
| Article XII (Dual Module) | PASS | CJS format maintained in three-verb-utils.cjs |

---

## 6. Summary

**Overall Verdict**: APPROVED

- 0 Critical findings
- 0 High findings
- 3 Low findings (F-002, F-003, F-004)
- 1 Info finding (F-001)
- All low findings are defense-in-depth recommendations, not blockers
- 306/306 tests pass, 0 regressions
- Coverage exceeds thresholds
- All requirements traceable to implementation and tests
- Constitutional compliance verified
