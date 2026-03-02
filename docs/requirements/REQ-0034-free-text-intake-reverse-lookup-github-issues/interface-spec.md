# Interface Specification: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. checkGhAvailability()

### Signature

```javascript
/**
 * @returns {{ available: boolean, reason?: string }}
 */
function checkGhAvailability()
```

### Return Type Schema

```javascript
// Success
{ available: true }

// Failure: gh not installed
{ available: false, reason: "not_installed" }

// Failure: gh not authenticated
{ available: false, reason: "not_authenticated" }
```

### Behavior Contract

| Condition | Action | Return |
|-----------|--------|--------|
| `gh --version` succeeds AND `gh auth status` succeeds | N/A | `{ available: true }` |
| `gh --version` throws (not installed) | Catch error | `{ available: false, reason: "not_installed" }` |
| `gh --version` succeeds BUT `gh auth status` throws | Catch error | `{ available: false, reason: "not_authenticated" }` |
| Either command times out (>2s) | Catch ETIMEDOUT | `{ available: false, reason: "not_installed" }` |

### Error Contract

This function NEVER throws. All errors are caught and returned as structured data.

### Example Usage

```javascript
const ghStatus = checkGhAvailability();
if (!ghStatus.available) {
    // Display message based on ghStatus.reason
    // Proceed with source: "manual"
}
```

---

## 2. searchGitHubIssues(query, options?)

### Signature

```javascript
/**
 * @param {string} query
 * @param {{ limit?: number, timeout?: number }} [options]
 * @returns {{ matches: Array<{ number: number, title: string, state: string }>, error?: string }}
 */
function searchGitHubIssues(query, options)
```

### Parameter Constraints

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | -- | Non-empty, trimmed. Shell-unsafe chars escaped internally. |
| `options.limit` | number | No | 5 | Range: 1-20. Values outside range clamped. |
| `options.timeout` | number | No | 3000 | Range: 1000-10000 ms. |

### Return Type Schema

```javascript
// Success with matches
{
    matches: [
        { number: 42, title: "Add payment processing module", state: "open" },
        { number: 38, title: "Payment processing integration", state: "closed" }
    ]
}

// Success with no matches
{ matches: [] }

// Error: timeout
{ matches: [], error: "timeout" }

// Error: JSON parse failure
{ matches: [], error: "parse_error" }

// Error: gh CLI failure
{ matches: [], error: "gh_error: HTTP 403: rate limit exceeded" }
```

### Match Object Schema

```javascript
{
    number: Number,   // GitHub issue number (positive integer)
    title: String,    // Issue title (non-empty string)
    state: String     // "open" or "closed"
}
```

### Shell Command Template

```bash
gh issue list --search "<escaped_query>" --json number,title,state --limit <limit>
```

### Input Sanitization

The `query` parameter is sanitized before shell interpolation:
- Double quotes (`"`) are escaped to `\"`
- Dollar signs (`$`) are escaped to `\$`
- Backticks are escaped to `` \` ``
- Backslashes (`\`) are escaped to `\\`

### Behavior Contract

| Condition | Action | Return |
|-----------|--------|--------|
| Valid query, gh returns matches | Parse JSON, validate fields | `{ matches: [...] }` |
| Valid query, gh returns `[]` | Parse JSON | `{ matches: [] }` |
| Valid query, gh times out | Catch ETIMEDOUT | `{ matches: [], error: "timeout" }` |
| Valid query, gh returns invalid JSON | Catch SyntaxError | `{ matches: [], error: "parse_error" }` |
| Valid query, gh returns non-zero exit | Catch error | `{ matches: [], error: "gh_error: ..." }` |
| Empty/null query | Return early | `{ matches: [], error: "empty_query" }` |
| Parsed JSON items missing required fields | Filter out invalid items | `{ matches: [valid_items_only] }` |

### Error Contract

This function NEVER throws. All errors are caught and returned as structured data.

### Example Usage

```javascript
const result = searchGitHubIssues("Add payment processing");
if (result.error) {
    // Display warning, proceed with manual
} else if (result.matches.length === 0) {
    // No matches -- offer to create
} else {
    // Present matches for selection
}
```

---

## 3. createGitHubIssue(title, body?)

### Signature

```javascript
/**
 * @param {string} title
 * @param {string} [body="Created via iSDLC framework"]
 * @returns {{ number: number, url: string } | null}
 */
function createGitHubIssue(title, body)
```

### Parameter Constraints

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `title` | string | Yes | -- | Non-empty, trimmed. Shell-unsafe chars escaped internally. |
| `body` | string | No | `"Created via iSDLC framework"` | Shell-unsafe chars escaped internally. |

### Return Type Schema

```javascript
// Success
{ number: 73, url: "https://github.com/owner/repo/issues/73" }

// Failure
null
```

### Shell Command Template

```bash
gh issue create --title "<escaped_title>" --body "<escaped_body>"
```

### URL Parsing

The `gh issue create` command outputs the new issue URL to stdout on success:
```
https://github.com/owner/repo/issues/73
```

The issue number is extracted via: `/\/issues\/(\d+)/`

### Behavior Contract

| Condition | Action | Return |
|-----------|--------|--------|
| Valid title, gh creates issue successfully | Parse URL from stdout, extract number | `{ number, url }` |
| Valid title, gh fails (network, auth, etc.) | Catch error | `null` |
| Valid title, gh returns unexpected output | URL regex fails | `null` |
| Empty/null title | Return early | `null` |
| Subprocess timeout (>5s) | Catch ETIMEDOUT | `null` |

### Error Contract

This function NEVER throws. All errors are caught and `null` is returned.

### Example Usage

```javascript
const created = createGitHubIssue("Implement rate limiting for API endpoints");
if (created) {
    // source = "github", source_id = `GH-${created.number}`
} else {
    // Display warning, proceed with manual
}
```

---

## 4. isdlc.md Add Handler Step 3c-prime (Instruction Block)

This is not a function interface but a markdown instruction specification for Claude to follow.

### Insertion Point

After existing step 3c (`All other input: source = "manual", source_id = null.`), before step 4 (`Generate description slug`).

### Instruction Block Specification

```markdown
   c-prime. **GitHub reverse-lookup** (only when step 3c resulted in source = "manual"):
      1. Call `checkGhAvailability()`:
         - If `{ available: false, reason: "not_installed" }`: display "GitHub CLI not available.
           Proceeding without issue linking. Install `gh` and run `gh auth login` to enable."
           Skip to step 4.
         - If `{ available: false, reason: "not_authenticated" }`: display "GitHub CLI is installed
           but not authenticated. Run `gh auth login` to enable issue linking."
           Skip to step 4.
      2. Call `searchGitHubIssues(description)` where description is the user's free-text input:
         - If `error` field is present: display "GitHub search unavailable ({error}).
           Proceeding without issue linking." Skip to step 4.
         - If `matches` is empty: go to sub-step 5 (no matches flow).
         - If `matches` has results: go to sub-step 3 (match presentation).
      3. **Match presentation** -- display:
         ```
         Found matching GitHub issues:
         [1] #{matches[0].number} - {matches[0].title} ({matches[0].state})
         [2] #{matches[1].number} - {matches[1].title} ({matches[1].state})
         ...
         [{N+1}] None of these -- create a new issue
         [{N+2}] Skip -- proceed without linking
         ```
      4. **Match selection**:
         - If user selects a match [1..N]: set source = "github", source_id = "GH-{number}".
           Fetch the issue title: use the selected match's title for slug generation in step 4
           (override the description variable). Also check: if title contains "bug" or "fix"
           (case-insensitive), suggest item_type = "BUG" (user confirms).
         - If user selects "create new": go to sub-step 5.
         - If user selects "skip": leave source = "manual", source_id = null. Skip to step 4.
      5. **No matches / create new flow**:
         - Display: "No matching GitHub issues found." (only if coming from empty matches)
         - Display: "[1] Create a new GitHub issue and link it" / "[2] Skip -- proceed without linking"
         - If user selects create: call `createGitHubIssue(description)`.
           - If success: set source = "github", source_id = "GH-{number}".
             Display "Created GitHub issue #{number}."
           - If null: display "Could not create GitHub issue. Proceeding without linking."
             Leave source = "manual".
         - If user selects skip: leave source = "manual", source_id = null.
      6. Continue to step 4 with the (possibly updated) source, source_id, and description.
```

### Interaction Contract with three-verb-utils.cjs

| Step | Calls | Reads | Writes |
|------|-------|-------|--------|
| c-prime.1 | `checkGhAvailability()` | Return value | None |
| c-prime.2 | `searchGitHubIssues(description)` | Return value | None |
| c-prime.4/5 | `createGitHubIssue(description)` | Return value | None (gh CLI creates issue externally) |

All state changes (source, source_id, description override) are local to the add handler flow and are consumed by subsequent steps (4-11).
