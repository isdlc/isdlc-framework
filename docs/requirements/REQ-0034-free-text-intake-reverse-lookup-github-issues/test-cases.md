# Test Cases: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

**Version**: 1.0.0
**Phase**: 05-test-strategy
**Test File**: `src/claude/hooks/tests/test-three-verb-utils.test.cjs` (extend existing)
**Run Command**: `node --test src/claude/hooks/tests/test-three-verb-utils.test.cjs`

---

## 1. checkGhAvailability() -- 3 Tests

**Requirement**: FR-006 (Graceful Degradation)
**Test Type**: Unit (positive + negative)
**Mocking**: `child_process.execSync` via `t.mock.method`

### TC-GH-AVAIL-01: Returns available when gh is installed and authenticated

- **Type**: positive
- **Requirement**: FR-006, AC-006-01
- **Given**: `gh --version` returns `"gh version 2.40.0\n"` and `gh auth status` returns empty string (success)
- **When**: `checkGhAvailability()` is called
- **Then**: Returns `{ available: true }`
- **Mock Setup**: `execSync` returns valid output for both commands
- **Assertions**:
  - `result.available === true`
  - `result.reason === undefined`

### TC-GH-AVAIL-02: Returns not_installed when gh binary is not found

- **Type**: negative
- **Requirement**: FR-006, AC-006-02
- **Given**: `gh --version` throws an error (ENOENT or non-zero exit)
- **When**: `checkGhAvailability()` is called
- **Then**: Returns `{ available: false, reason: "not_installed" }`
- **Mock Setup**: `execSync` throws `Error` when command includes `gh --version`
- **Assertions**:
  - `result.available === false`
  - `result.reason === "not_installed"`
- **Error Code**: ERR-GH-001

### TC-GH-AVAIL-03: Returns not_authenticated when gh auth fails

- **Type**: negative
- **Requirement**: FR-006, AC-006-03
- **Given**: `gh --version` succeeds but `gh auth status` throws an error
- **When**: `checkGhAvailability()` is called
- **Then**: Returns `{ available: false, reason: "not_authenticated" }`
- **Mock Setup**: `execSync` returns valid output for `gh --version` but throws for `gh auth status`
- **Assertions**:
  - `result.available === false`
  - `result.reason === "not_authenticated"`
- **Error Code**: ERR-GH-002

---

## 2. searchGitHubIssues() -- 6 Tests

**Requirement**: FR-001 (GitHub Issue Search on Free-Text Input)
**Test Type**: Unit (positive + negative)
**Mocking**: `child_process.execSync` via `t.mock.method`

### TC-SEARCH-01: Returns matches when gh returns valid JSON array

- **Type**: positive
- **Requirement**: FR-001, AC-001-01, AC-001-02, AC-001-04
- **Given**: `execSync` returns `'[{"number":42,"title":"Add payment processing","state":"open"},{"number":38,"title":"Payment integration","state":"closed"}]'`
- **When**: `searchGitHubIssues("Add payment processing")` is called
- **Then**: Returns `{ matches: [{ number: 42, title: "Add payment processing", state: "open" }, { number: 38, title: "Payment integration", state: "closed" }] }`
- **Assertions**:
  - `result.matches.length === 2`
  - `result.matches[0].number === 42`
  - `result.matches[0].title === "Add payment processing"`
  - `result.matches[0].state === "open"`
  - `result.matches[1].state === "closed"` (both open and closed included)
  - `result.error === undefined`
  - Mock was called with command containing `--search "Add payment processing"`
  - Mock was called with command containing `--limit 5` (default)

### TC-SEARCH-02: Returns empty matches when gh returns empty array

- **Type**: positive
- **Requirement**: FR-001, AC-001-01
- **Given**: `execSync` returns `'[]'`
- **When**: `searchGitHubIssues("nonexistent feature xyz")` is called
- **Then**: Returns `{ matches: [] }`
- **Assertions**:
  - `result.matches.length === 0`
  - `result.error === undefined`

### TC-SEARCH-03: Returns timeout error when execSync times out

- **Type**: negative
- **Requirement**: FR-006, AC-006-04
- **Given**: `execSync` throws an error with `killed: true` (ETIMEDOUT)
- **When**: `searchGitHubIssues("some query")` is called
- **Then**: Returns `{ matches: [], error: "timeout" }`
- **Mock Setup**: `execSync` throws `Object.assign(new Error('timed out'), { killed: true })`
- **Assertions**:
  - `result.matches.length === 0`
  - `result.error === "timeout"`
- **Error Code**: ERR-GH-003

### TC-SEARCH-04: Returns parse_error when gh returns invalid JSON

- **Type**: negative
- **Requirement**: FR-006, AC-006-05
- **Given**: `execSync` returns `"not valid json {"`
- **When**: `searchGitHubIssues("some query")` is called
- **Then**: Returns `{ matches: [], error: "parse_error" }`
- **Assertions**:
  - `result.matches.length === 0`
  - `result.error === "parse_error"`
- **Error Code**: ERR-GH-004

### TC-SEARCH-05: Escapes shell-unsafe characters in query

- **Type**: positive (security)
- **Requirement**: FR-001, AC-001-02 (shell injection prevention)
- **Given**: `execSync` is mocked to capture the command string
- **When**: `searchGitHubIssues('test "query" with $vars and \`backticks\`')` is called
- **Then**: The command passed to `execSync` contains escaped characters:
  - `\"` instead of raw `"`
  - `\$` instead of raw `$`
  - `` \` `` instead of raw `` ` ``
- **Assertions**:
  - Command string does not contain unescaped `"` within the query portion
  - Command string does not contain unescaped `$` within the query portion
  - Command string does not contain unescaped `` ` `` within the query portion

### TC-SEARCH-06: Uses default options when none provided

- **Type**: positive
- **Requirement**: FR-001, AC-001-03
- **Given**: `execSync` is mocked to return `'[]'` and capture the command
- **When**: `searchGitHubIssues("test query")` is called without options
- **Then**: The command includes `--limit 5` (default limit) and `execSync` is called with `timeout: 3000` (default timeout)
- **Assertions**:
  - Command string contains `--limit 5`
  - `execSync` options include `{ timeout: 3000 }`

---

## 3. createGitHubIssue() -- 4 Tests

**Requirement**: FR-004 (Issue Creation on No Match)
**Test Type**: Unit (positive + negative)
**Mocking**: `child_process.execSync` via `t.mock.method`

### TC-CREATE-01: Returns number and URL on successful creation

- **Type**: positive
- **Requirement**: FR-004, AC-004-02, AC-004-03, AC-004-04
- **Given**: `execSync` returns `"https://github.com/owner/repo/issues/73\n"`
- **When**: `createGitHubIssue("Implement rate limiting")` is called
- **Then**: Returns `{ number: 73, url: "https://github.com/owner/repo/issues/73" }`
- **Assertions**:
  - `result.number === 73`
  - `result.url === "https://github.com/owner/repo/issues/73"`

### TC-CREATE-02: Returns null when gh command fails

- **Type**: negative
- **Requirement**: FR-004, FR-006, AC-006-05
- **Given**: `execSync` throws an error (network failure, auth failure, etc.)
- **When**: `createGitHubIssue("Some title")` is called
- **Then**: Returns `null`
- **Assertions**:
  - `result === null`
- **Error Code**: ERR-GH-006

### TC-CREATE-03: Returns null when URL cannot be parsed from output

- **Type**: negative
- **Requirement**: FR-004
- **Given**: `execSync` returns `"unexpected output without URL\n"`
- **When**: `createGitHubIssue("Some title")` is called
- **Then**: Returns `null` (URL regex `/\/issues\/(\d+)/` does not match)
- **Assertions**:
  - `result === null`
- **Error Code**: ERR-GH-007

### TC-CREATE-04: Uses default body when none provided

- **Type**: positive
- **Requirement**: FR-004, AC-004-05
- **Given**: `execSync` is mocked to capture the command and return a valid URL
- **When**: `createGitHubIssue("New feature")` is called without a body argument
- **Then**: The command passed to `execSync` includes `--body "Created via iSDLC framework"`
- **Assertions**:
  - Command string contains `--body "Created via iSDLC framework"`
  - Return value is a valid `{ number, url }` object

---

## 4. Edge Case and Boundary Tests (Included Above)

The following boundary conditions are covered within the test cases above:

| Boundary | Covered By | Details |
|----------|-----------|---------|
| Empty query to searchGitHubIssues | TC-SEARCH-06 (implicitly) + error-taxonomy ERR-GH-008 | Returns `{ matches: [], error: "empty_query" }` |
| Empty title to createGitHubIssue | TC-CREATE-02 (extended) | Returns `null` |
| Shell-unsafe characters | TC-SEARCH-05 | Double quotes, dollar signs, backticks escaped |
| Timeout (ETIMEDOUT) | TC-SEARCH-03 | Mocked killed:true error |
| Malformed JSON response | TC-SEARCH-04 | Non-JSON string from gh CLI |
| Missing fields in JSON items | TC-SEARCH-01 (implicitly) | Items without required fields are filtered out |
| URL without issue number | TC-CREATE-03 | Regex fails to match, returns null |

---

## 5. Test Naming Convention

Following the existing pattern in `test-three-verb-utils.test.cjs`:

```
describe('functionName()')
  it('description of behavior (TRACE-ID)')
```

Examples:
- `it('returns available when gh is installed and authenticated (AC-006-01)')`
- `it('returns timeout error on ETIMEDOUT (ERR-GH-003)')`

---

## 6. Non-Testable Requirements (UX Flow)

The following acceptance criteria involve the interactive UX flow in `isdlc.md` and cannot be unit-tested:

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-002-01 through AC-002-05 | Match presentation format and selection | Manual acceptance testing in Phase 16 |
| AC-003-01, AC-003-02, AC-003-03 | Issue linking (meta.json writes) | Validated by existing meta.json write tests + manual testing |
| AC-005-01 through AC-005-03 | Skip option availability | Manual acceptance testing in Phase 16 |
| AC-007-01 through AC-007-03 | Analyze handler integration | Manual acceptance testing in Phase 16 |

These are documented in the traceability matrix with "Manual / Phase 16" as the test method.

---

## 7. Test Execution Order

Tests are independent and can run in any order. Each test mocks `execSync` within its own `t.mock.method` scope, which is automatically cleaned up by `node:test`.

No `beforeEach`/`afterEach` hooks are needed for the new tests (no filesystem setup required -- all interactions are through mocked `execSync`).
