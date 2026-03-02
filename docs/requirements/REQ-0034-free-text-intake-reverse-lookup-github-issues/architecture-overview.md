# Architecture Overview: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. Architecture Options

| Option | Approach | Pros | Cons | Risk |
|--------|----------|------|------|------|
| **A: Post-Detection Hook** | New `reverseGitHubLookup()` called after `detectSource()` returns `manual` | Zero regression risk, testable in isolation, follows existing patterns | Two-step source detection | Low |
| **B: Extended detectSource()** | Modify `detectSource()` to add GitHub search as fourth branch | Single detection point, cleaner API | Breaks sync contract, regression risk, hard to test | High |
| **C: Middleware Pipeline** | Configurable pipeline of source detectors | Highly extensible, clean architecture | Over-engineered, migration cost, YAGNI | Medium |

## 2. Selected Architecture

**Option A: Post-Detection Hook**

### Rationale

1. `detectSource()` is a pure synchronous function with a clean three-way branch. Adding I/O (subprocess call) would break its contract and every existing test.
2. The new reverse-lookup is logically a separate concern: "given that we know this is free-text, should we search GitHub?" This is a post-processing step, not a detection refinement.
3. The blast radius is minimized: `detectSource()` and its tests are untouched.
4. Migration to Option C (middleware pipeline) is straightforward if needed later.

### Architecture Flow

```
User Input
    |
    v
detectSource(input)  <-- UNCHANGED
    |
    +-- "github" (#N)  --> existing flow (fetch issue title, labels)
    +-- "jira" (PROJECT-N)  --> existing flow (fetch summary, type)
    +-- "manual" (free-text)
            |
            v
        checkGhAvailability()
            |
            +-- not available --> proceed with manual (display info message)
            +-- available
                    |
                    v
                searchGitHubIssues(description)
                    |
                    +-- matches found --> presentMatchSelection(matches)
                    |                         |
                    |                         +-- user selects match --> source="github", source_id="GH-N"
                    |                         +-- user selects "create new" --> createGitHubIssue(description)
                    |                         +-- user selects "skip" --> proceed with manual
                    |
                    +-- no matches --> offerIssueCreation(description)
                    |                     |
                    |                     +-- user confirms --> createGitHubIssue(description)
                    |                     +-- user declines --> proceed with manual
                    |
                    +-- error/timeout --> proceed with manual (display warning)
            |
            v
        Continue to step 4 (slug generation) with resolved source/source_id
```

### Key Architectural Decisions

**ADR-001: Separate function, not modified detectSource()**
- Decision: Add `reverseGitHubLookup()` as a new function in `three-verb-utils.cjs`
- Rationale: Preserves synchronous contract, zero regression risk
- Consequences: Two-step source resolution in the add handler (acceptable trade-off)

**ADR-002: execSync with timeout for gh CLI**
- Decision: Use `child_process.execSync` with `{ timeout: 3000 }` for all `gh` calls
- Rationale: Synchronous fits the existing pattern; 3-second timeout stays within 5-second NFR budget
- Consequences: Blocking I/O during search (acceptable for interactive CLI)

**ADR-003: UX flow via numbered options in isdlc.md**
- Decision: Present match results as numbered options consistent with existing step 3a/3b patterns
- Rationale: Claude can parse and execute numbered option flows reliably
- Consequences: The instruction block in isdlc.md grows by ~20 lines

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| `child_process.execSync` | Node.js built-in | Already imported in `three-verb-utils.cjs` (line 17), used for `git diff` calls; synchronous model fits the interactive CLI flow | `child_process.exec` (async -- breaks existing synchronous pattern), `execa` (new dependency -- unnecessary) |
| `gh` CLI | >= 2.0 (user-installed) | Already used in 5+ files across the codebase; provides `--json` structured output; handles auth/token management transparently | Direct GitHub REST API via `fetch` (requires manual token management, adds complexity), `octokit` (new npm dependency -- overkill for 2 API calls) |
| JSON output parsing (`--json` flag) | gh CLI feature | Structured output avoids fragile text parsing; `JSON.parse()` with try/catch handles malformed output safely | Text output parsing with regex (fragile, locale-dependent) |

**No new npm dependencies introduced.** All functionality uses Node.js built-ins and the `gh` CLI (user-supplied external tool).

## 4. Integration Architecture

| # | Source | Target | Interface | Data Format | Error Handling |
|---|--------|--------|-----------|-------------|---------------|
| 1 | `isdlc.md` add handler (step 3c) | `checkGhAvailability()` | Function call (synchronous) | Returns `{ available: boolean, reason?: string }` | Returns `{ available: false, reason: "..." }` -- never throws |
| 2 | `isdlc.md` add handler (step 3c) | `searchGitHubIssues(query)` | Function call (synchronous, execSync internally) | Returns `{ matches: Array<{number, title, state}>, error?: string }` | On timeout/error: returns `{ matches: [], error: "..." }` -- never throws |
| 3 | `isdlc.md` add handler (step 3c) | `createGitHubIssue(title, body)` | Function call (synchronous, execSync internally) | Returns `{ number: int, url: string }` or `null` | On failure: returns `null` -- never throws |
| 4 | `searchGitHubIssues()` | `gh` CLI subprocess | `execSync("gh issue list --search ...")` | JSON string parsed to array | Caught in try/catch; timeout at 3000ms |
| 5 | `createGitHubIssue()` | `gh` CLI subprocess | `execSync("gh issue create ...")` | URL string from stdout | Caught in try/catch; timeout at 3000ms |

**Key integration contracts:**
- All new functions in `three-verb-utils.cjs` are **error-safe**: they return sentinel values (empty arrays, null, false) on failure. They never throw exceptions that could crash the add handler.
- The `isdlc.md` instructions handle the UX flow (presenting options, interpreting user selection). The utility functions handle the `gh` CLI interaction only.
- Data flows one direction: `isdlc.md` -> utility functions -> `gh` subprocess. No callbacks, no events, no shared state.

## 5. Architecture Summary

**Approach**: Post-Detection Hook (Option A) -- a new `reverseGitHubLookup()` function in `three-verb-utils.cjs` called from the add handler when `detectSource()` returns `manual`.

**Key decisions**:
1. `detectSource()` is untouched (zero regression risk)
2. `execSync` with 3-second timeout for `gh` CLI calls (within 5-second NFR budget)
3. All new functions are error-safe (return sentinels, never throw)
4. UX flow follows existing numbered-option pattern in `isdlc.md`
5. No new npm dependencies

**Trade-offs acknowledged**:
- Two-step source resolution (detectSource then reverseGitHubLookup) is less elegant than a single detection point, but eliminates regression risk
- 3-second timeout consumes 60% of the NFR budget, but the alternative (no timeout) risks hanging the add flow indefinitely
- `execSync` blocks the Node.js event loop during search, but the add handler is interactive (not concurrent) so this is acceptable

**Go-forward plan**: Proceed to detailed design with 3 new functions (`checkGhAvailability`, `searchGitHubIssues`, `createGitHubIssue`) in `three-verb-utils.cjs` and a modified step 3c block in `isdlc.md`.
