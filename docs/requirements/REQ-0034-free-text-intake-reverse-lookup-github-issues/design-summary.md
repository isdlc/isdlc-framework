# Design Summary: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## Overview

| Metric | Value |
|--------|-------|
| **Modules modified** | 2 (`three-verb-utils.cjs`, `isdlc.md`) |
| **New functions** | 3 (`checkGhAvailability`, `searchGitHubIssues`, `createGitHubIssue`) + 1 internal helper (`sanitizeForShell`) |
| **New interfaces** | 3 (one per function) |
| **Error codes** | 8 (`ERR-GH-001` through `ERR-GH-008`) |
| **Test cases (estimated)** | 13 unit tests (3 + 6 + 4) |
| **Functional requirements covered** | 7 (FR-001 through FR-007) |
| **Acceptance criteria covered** | 29 |
| **Architecture** | Post-Detection Hook (Option A) |
| **New dependencies** | None (uses Node.js built-ins + user-installed `gh` CLI) |

## Key Design Decisions

1. **`detectSource()` is NOT modified.** The reverse-lookup is a new step (3c-prime) in the add handler that runs AFTER `detectSource()` returns `manual`. This eliminates all regression risk.

2. **All new functions are error-safe.** They return sentinel values (`{ available: false }`, `{ matches: [] }`, `null`) on failure. They NEVER throw exceptions. The add flow always completes.

3. **`execSync` with timeout** for all `gh` CLI calls. 2-second timeout for availability checks, 3-second timeout for search, 5-second timeout for issue creation. The synchronous model matches the existing pattern in `three-verb-utils.cjs`.

4. **Shell input sanitization** via internal `sanitizeForShell()` helper. Escapes `"`, `$`, `` ` ``, `\` before shell interpolation. Prevents injection attacks from user-provided free-text.

5. **UX flow follows existing patterns** in `isdlc.md`. Numbered options (`[1]`, `[2]`, etc.) consistent with step 3a/3b. "Create new" and "Skip" always available. Never auto-selects.

## Implementation Checklist for Developer

1. [ ] Add `sanitizeForShell()` internal helper to `three-verb-utils.cjs` (after line 138)
2. [ ] Add `checkGhAvailability()` function (see `interface-spec.md` section 1)
3. [ ] Add `searchGitHubIssues(query, options?)` function (see `interface-spec.md` section 2)
4. [ ] Add `createGitHubIssue(title, body?)` function (see `interface-spec.md` section 3)
5. [ ] Export all 3 new functions from `module.exports` under "GitHub reverse-lookup utilities (REQ-0034)" comment
6. [ ] Add step 3c-prime instruction block to `isdlc.md` add handler (see `interface-spec.md` section 4)
7. [ ] Write unit tests in `test-three-verb-utils.test.cjs`:
   - `describe('checkGhAvailability()')` -- 3 tests
   - `describe('searchGitHubIssues()')` -- 6 tests
   - `describe('createGitHubIssue()')` -- 4 tests
8. [ ] Import new exports in test file
9. [ ] Run full test suite to verify zero regressions
10. [ ] Manual test: `/isdlc add "test description"` with gh available
11. [ ] Manual test: `/isdlc add "test description"` with gh unavailable

## Open Questions

None. The design is fully specified and ready for implementation.

## Artifact Index

| File | Content |
|------|---------|
| `quick-scan.md` | Scope estimation, keyword search, file count |
| `requirements-spec.md` | Business context, stakeholders, user journeys, FRs, ACs, MoSCoW |
| `user-stories.json` | 7 user stories with AC traceability |
| `traceability-matrix.csv` | FR-to-AC-to-US mapping |
| `impact-analysis.md` | Blast radius, entry points, risk zones, implementation order |
| `architecture-overview.md` | Architecture options, selected approach, ADRs, technology decisions, integration design |
| `module-design.md` | Module boundaries, function signatures, responsibilities, test strategy |
| `interface-spec.md` | Precise interface contracts with types, examples, behavior tables |
| `data-flow.md` | Data flow diagrams, state management, validation points |
| `error-taxonomy.md` | Error codes, propagation strategy, graceful degradation matrix |
| `design-summary.md` | This file -- executive summary and implementation checklist |
