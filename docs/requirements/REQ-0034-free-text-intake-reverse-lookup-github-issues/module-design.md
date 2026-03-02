# Module Design: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## Module: three-verb-utils.cjs (Extended)

**Responsibility**: Provide GitHub issue search and creation utilities for the add handler's free-text reverse-lookup flow. All functions are synchronous, error-safe, and use `execSync` with timeout.

**Location**: `src/claude/hooks/lib/three-verb-utils.cjs` (insert after `detectSource()`, before `deriveAnalysisStatus()`)

### Function 1: checkGhAvailability()

```javascript
/**
 * Checks whether the gh CLI is installed and authenticated.
 *
 * Traces: FR-006 (AC-006-01, AC-006-02, AC-006-03)
 *
 * @returns {{ available: boolean, reason?: string }}
 *   - { available: true } when gh is installed and authenticated
 *   - { available: false, reason: "not_installed" } when gh binary is not found
 *   - { available: false, reason: "not_authenticated" } when gh is not logged in
 */
function checkGhAvailability() {
    // Implementation:
    // 1. Try execSync('gh --version', { timeout: 2000, stdio: 'pipe' })
    //    - catch -> return { available: false, reason: 'not_installed' }
    // 2. Try execSync('gh auth status', { timeout: 2000, stdio: 'pipe' })
    //    - catch -> return { available: false, reason: 'not_authenticated' }
    // 3. return { available: true }
}
```

**Data structures owned**: None (stateless check).
**Dependencies**: `child_process.execSync` (already imported).
**Testability**: Mock `execSync` to simulate installed/not-installed/not-authenticated states.

---

### Function 2: searchGitHubIssues(query, options?)

```javascript
/**
 * Searches GitHub issues using the gh CLI.
 *
 * Traces: FR-001 (AC-001-01..05)
 *
 * @param {string} query - The free-text search query (user's original input)
 * @param {object} [options]
 * @param {number} [options.limit=5] - Maximum number of results
 * @param {number} [options.timeout=3000] - Subprocess timeout in ms
 * @returns {{ matches: Array<{ number: number, title: string, state: string }>, error?: string }}
 *   - On success: { matches: [{ number: 42, title: "...", state: "open" }, ...] }
 *   - On empty results: { matches: [] }
 *   - On error: { matches: [], error: "timeout" | "parse_error" | "gh_error: <message>" }
 */
function searchGitHubIssues(query, options) {
    // Implementation:
    // 1. Sanitize query: escape shell-unsafe characters (double quotes -> \")
    // 2. Build command: `gh issue list --search "${sanitized}" --json number,title,state --limit ${limit}`
    // 3. Try execSync(command, { encoding: 'utf8', timeout, stdio: 'pipe' })
    //    - On ETIMEDOUT: return { matches: [], error: 'timeout' }
    //    - On other error: return { matches: [], error: `gh_error: ${e.message}` }
    // 4. Try JSON.parse(stdout)
    //    - On parse error: return { matches: [], error: 'parse_error' }
    // 5. Validate parsed array: filter to objects with number, title, state fields
    // 6. Return { matches: validated_array }
}
```

**Data structures owned**:
```javascript
// Match object shape
{ number: 42, title: "Add payment processing module", state: "open" }
```

**Dependencies**: `child_process.execSync`.
**Testability**: Mock `execSync` to return JSON strings simulating various gh outputs (matches, empty, malformed, timeout).

---

### Function 3: createGitHubIssue(title, body?)

```javascript
/**
 * Creates a new GitHub issue using the gh CLI.
 *
 * Traces: FR-004 (AC-004-02..05)
 *
 * @param {string} title - Issue title
 * @param {string} [body="Created via iSDLC framework"] - Issue body
 * @returns {{ number: number, url: string } | null}
 *   - On success: { number: 73, url: "https://github.com/owner/repo/issues/73" }
 *   - On failure: null
 */
function createGitHubIssue(title, body) {
    // Implementation:
    // 1. Sanitize title: escape shell-unsafe characters
    // 2. Default body: "Created via iSDLC framework"
    // 3. Build command: `gh issue create --title "${sanitized_title}" --body "${sanitized_body}"`
    // 4. Try execSync(command, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' })
    //    - On error: return null
    // 5. Parse stdout for the issue URL (gh outputs the URL on success)
    // 6. Extract issue number from URL: match /\/issues\/(\d+)/
    //    - On parse failure: return null
    // 7. Return { number, url }
}
```

**Data structures owned**: None (returns a simple object or null).
**Dependencies**: `child_process.execSync`.
**Testability**: Mock `execSync` to return URL strings simulating successful/failed creation.

---

## Module: isdlc.md (Modified)

**Responsibility**: Orchestrate the user-facing reverse-lookup UX flow by calling the utility functions and presenting options.

**Location**: `src/claude/commands/isdlc.md`, add handler, between step 3c and step 4.

**Change summary**: Insert a new step 3c-prime instruction block that:
1. Checks `checkGhAvailability()` -- if unavailable, display message and proceed as manual
2. Calls `searchGitHubIssues(description)` -- if error, display warning and proceed as manual
3. If matches found: present numbered list with "Create new" and "Skip" options
4. If user selects match: override `source = "github"`, `source_id = "GH-{N}"`, refetch title for slug
5. If user selects "Create new": call `createGitHubIssue(description)`, override source/source_id
6. If user selects "Skip": proceed unchanged (manual)
7. If no matches: present "Create new issue?" or "Skip" options

**Boundary enforcement**: `isdlc.md` ONLY calls the three exported functions. It does NOT execute `gh` commands directly. All `gh` interaction is encapsulated in `three-verb-utils.cjs`.

---

## Module: test-three-verb-utils.test.cjs (Extended)

**Responsibility**: Unit tests for the 3 new functions.

**New describe blocks**:
- `describe('checkGhAvailability()')` -- 3 tests (available, not installed, not authenticated)
- `describe('searchGitHubIssues()')` -- 6 tests (matches found, empty, timeout, parse error, shell escaping, default options)
- `describe('createGitHubIssue()')` -- 4 tests (success, failure, URL parsing, default body)

**Test strategy**: Mock `execSync` using Node.js `node:test` mock API (`t.mock.method`). No real `gh` CLI calls in unit tests.

---

## Exports Update

Add to `module.exports` in `three-verb-utils.cjs`:

```javascript
module.exports = {
    // ... existing exports ...

    // GitHub reverse-lookup utilities (REQ-0034)
    checkGhAvailability,
    searchGitHubIssues,
    createGitHubIssue,
};
```
