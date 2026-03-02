# Error Taxonomy: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. Error Code Table

| Error Code | Description | Trigger | Severity | Recovery Strategy |
|------------|-------------|---------|----------|-------------------|
| `ERR-GH-001` | gh CLI not installed | `gh --version` fails (ENOENT or non-zero exit) | Info | Display message: "GitHub CLI not available. Proceeding without issue linking. Install `gh` and run `gh auth login` to enable." Proceed with `source: "manual"`. |
| `ERR-GH-002` | gh CLI not authenticated | `gh auth status` fails (non-zero exit) | Info | Display message: "GitHub CLI is installed but not authenticated. Run `gh auth login` to enable issue linking." Proceed with `source: "manual"`. |
| `ERR-GH-003` | GitHub search timeout | `execSync` throws with `killed: true` (ETIMEDOUT) after 3000ms | Warning | Display: "GitHub search timed out. Proceeding without issue linking." Proceed with `source: "manual"`. |
| `ERR-GH-004` | GitHub search parse error | `JSON.parse()` throws `SyntaxError` on gh output | Warning | Display: "GitHub search returned unexpected output. Proceeding without issue linking." Proceed with `source: "manual"`. |
| `ERR-GH-005` | GitHub search CLI error | `gh issue list` returns non-zero exit code | Warning | Display: "GitHub search failed ({stderr summary}). Proceeding without issue linking." Proceed with `source: "manual"`. |
| `ERR-GH-006` | Issue creation failed | `gh issue create` returns non-zero exit code or times out | Warning | Display: "Could not create GitHub issue. Proceeding without linking." Proceed with `source: "manual"`. |
| `ERR-GH-007` | Issue creation URL parse failed | `gh issue create` stdout does not match `/\/issues\/(\d+)/` | Warning | Display: "GitHub issue may have been created but could not extract issue number. Check your GitHub repo." Proceed with `source: "manual"`. |
| `ERR-GH-008` | Empty search query | `query` parameter is empty/null/undefined | Debug | Return `{ matches: [], error: "empty_query" }`. No user-facing message (this is a programming error, not a runtime failure). |

## 2. Error Propagation Strategy

**Principle: Contain and Degrade**

No error from the reverse-lookup flow is ever propagated to the caller. Every error is caught at the function boundary and converted to a return value:

```
gh CLI error
    |
    v
try/catch in utility function
    |
    v
return sentinel value ({ matches: [], error: "..." } or null)
    |
    v
isdlc.md checks return value
    |
    v
display informational/warning message to user
    |
    v
proceed with source: "manual" (identical to current behavior)
```

**No error halts the add flow.** The add handler always completes, either with a GitHub-linked item or a manual item.

## 3. Error Severity Levels

| Level | Meaning | User Action Required | Example |
|-------|---------|---------------------|---------|
| **Info** | Expected degradation, not a failure | None (informational) | `ERR-GH-001`, `ERR-GH-002` |
| **Warning** | Unexpected failure, add flow continues | None (but may want to investigate) | `ERR-GH-003` through `ERR-GH-007` |
| **Debug** | Programming error, not user-facing | Developer fixes code | `ERR-GH-008` |

## 4. Input Validation Rules

### checkGhAvailability()

No input parameters. No validation needed.

### searchGitHubIssues(query, options?)

| Input | Validation | On Invalid |
|-------|-----------|-----------|
| `query` | Must be non-empty string after trimming | Return `{ matches: [], error: "empty_query" }` |
| `query` | Shell-unsafe characters escaped before interpolation | Automatic (internal sanitization) |
| `options.limit` | Must be number in range 1-20 | Clamp to range: `Math.max(1, Math.min(20, limit))` |
| `options.timeout` | Must be number in range 1000-10000 | Clamp to range: `Math.max(1000, Math.min(10000, timeout))` |
| gh JSON output | Must be valid JSON array | Return `{ matches: [], error: "parse_error" }` |
| gh JSON array items | Each must have `number` (positive int), `title` (non-empty string), `state` (string) | Filter out invalid items (do not reject entire result) |

### createGitHubIssue(title, body?)

| Input | Validation | On Invalid |
|-------|-----------|-----------|
| `title` | Must be non-empty string after trimming | Return `null` |
| `title` | Shell-unsafe characters escaped before interpolation | Automatic (internal sanitization) |
| `body` | If null/undefined, defaults to `"Created via iSDLC framework"` | Use default |
| `body` | Shell-unsafe characters escaped before interpolation | Automatic (internal sanitization) |
| gh stdout | Must contain URL matching `/\/issues\/(\d+)/` | Return `null` |

## 5. Shell Injection Prevention

All user-provided strings interpolated into shell commands are sanitized using a `sanitizeForShell()` helper:

```javascript
function sanitizeForShell(str) {
    return str
        .replace(/\\/g, '\\\\')   // backslash first (avoid double-escaping)
        .replace(/"/g, '\\"')      // double quotes
        .replace(/\$/g, '\\$')     // dollar signs (prevent variable expansion)
        .replace(/`/g, '\\`');     // backticks (prevent command substitution)
}
```

This helper is an internal function (not exported). It is used by `searchGitHubIssues()` and `createGitHubIssue()` before passing strings to `execSync`.

## 6. Graceful Degradation Matrix

| Scenario | checkGh | searchGH | createGH | User Sees | Result |
|----------|---------|----------|----------|-----------|--------|
| gh installed + authenticated, matches found | OK | OK | N/A | Match list | source="github" (if selected) |
| gh installed + authenticated, no matches | OK | OK (empty) | OK or fail | Create/skip prompt | Depends on selection |
| gh installed + NOT authenticated | FAIL | N/A | N/A | Auth instructions | source="manual" |
| gh NOT installed | FAIL | N/A | N/A | Install instructions | source="manual" |
| gh installed, search times out | OK | FAIL (timeout) | N/A | Timeout warning | source="manual" |
| gh installed, search parse error | OK | FAIL (parse) | N/A | Search warning | source="manual" |
| gh installed, issue creation fails | OK | OK | FAIL | Creation warning | source="manual" |

In every failure scenario, the add flow completes with `source: "manual"` -- identical to current behavior. The reverse-lookup is purely additive.
