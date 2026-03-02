# Data Flow: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. Primary Data Flow

```
User Input (free-text string)
    |
    v
[isdlc.md add handler step 3]
    |
    v
detectSource(input)              <-- EXISTING, UNCHANGED
    |
    +-- returns { source: "github", ... }   --> existing step 3a flow
    +-- returns { source: "jira", ... }     --> existing step 3b flow
    +-- returns { source: "manual", ... }   --> NEW: step 3c-prime
            |
            v
        checkGhAvailability()               <-- NEW
            |
            returns { available, reason? }
            |
            +-- available: false --> [display message] --> step 4 (manual)
            +-- available: true
                    |
                    v
                searchGitHubIssues(description)     <-- NEW
                    |
                    returns { matches[], error? }
                    |
                    +-- error present --> [display warning] --> step 4 (manual)
                    +-- matches.length === 0
                    |       |
                    |       v
                    |   [present: create new / skip]
                    |       |
                    |       +-- create --> createGitHubIssue(title)
                    |       |                   |
                    |       |                   returns { number, url } | null
                    |       |                   |
                    |       |                   +-- success --> source="github", source_id="GH-N"
                    |       |                   +-- null --> source="manual" (with warning)
                    |       |
                    |       +-- skip --> source="manual"
                    |
                    +-- matches.length > 0
                            |
                            v
                        [present: match list / create new / skip]
                            |
                            +-- select match --> source="github", source_id="GH-N"
                            |                    description = match.title (override)
                            +-- create new --> createGitHubIssue(description) (same as above)
                            +-- skip --> source="manual"
            |
            v
        [resolved: source, source_id, description]
            |
            v
[isdlc.md add handler step 4: generateSlug(description)]
    |
    v
[steps 5-11: sequence number, directory, draft.md, meta.json, BACKLOG.md, confirm]
```

## 2. Data Sources

| Source | Type | Data | Consumer |
|--------|------|------|----------|
| User input | String (CLI argument) | Free-text description | `detectSource()`, `searchGitHubIssues()` |
| `gh issue list --search` | JSON (subprocess stdout) | Array of `{ number, title, state }` | `searchGitHubIssues()` internal parser |
| `gh issue create` | URL string (subprocess stdout) | `https://github.com/.../issues/N` | `createGitHubIssue()` internal parser |
| User selection | Number (interactive prompt) | Menu option index | `isdlc.md` step 3c-prime flow |

## 3. Data Transformations

| Stage | Input | Output | Transformation |
|-------|-------|--------|---------------|
| Shell sanitization | Raw query string | Escaped string | Escape `"`, `$`, `` ` ``, `\` |
| gh JSON parsing | Raw stdout string | `Array<{ number, title, state }>` | `JSON.parse()` + field validation |
| URL number extraction | Issue URL string | `{ number, url }` | Regex `/\/issues\/(\d+)/` |
| Source override | `{ source: "manual", source_id: null }` | `{ source: "github", source_id: "GH-N" }` | Conditional assignment in add handler |
| Description override | User's free-text | Issue title from GitHub | Used for `generateSlug()` in step 4 |

## 4. State Management

### Session State (In-Memory Only)

The reverse-lookup flow modifies three local variables in the add handler:
- `source`: string ("manual" -> "github" if match selected/issue created)
- `source_id`: string|null (null -> "GH-N" if match selected/issue created)
- `description`: string (user input -> issue title if match selected)

These are consumed by steps 4-11 and then written to `meta.json` and `draft.md`.

### Persisted State

| File | Fields Written | By Step |
|------|---------------|---------|
| `meta.json` | `source`, `source_id` | Step 9 (existing `writeMetaJson()` call, no change needed) |
| `draft.md` | Source metadata header | Step 8 (existing creation logic, no change needed) |
| `BACKLOG.md` | Append line | Step 10 (existing `appendToBacklog()` call, no change needed) |

No new persisted state is introduced. The existing write points in steps 8-10 already consume the `source` and `source_id` variables regardless of their values.

### No Shared Mutable State

- The three new functions are stateless -- they read system state (gh CLI) and return values.
- No caching, no buffering, no global variables.
- No race conditions: the add handler is single-threaded and interactive.
- No state persisted across sessions by the new code (meta.json writes use existing paths).

## 5. Data Validation Points

| Point | Validation | Action on Failure |
|-------|-----------|-------------------|
| `searchGitHubIssues()` input | `query` must be non-empty string | Return `{ matches: [], error: "empty_query" }` |
| `searchGitHubIssues()` gh output | Must be valid JSON array | Return `{ matches: [], error: "parse_error" }` |
| `searchGitHubIssues()` match items | Each item must have `number` (int), `title` (string), `state` (string) | Filter out invalid items silently |
| `createGitHubIssue()` input | `title` must be non-empty string | Return `null` |
| `createGitHubIssue()` gh output | Must contain URL matching `/\/issues\/(\d+)/` | Return `null` |
| User selection (isdlc.md) | Must be valid option number | Re-prompt (handled by Claude's interactive flow) |
