# Impact Analysis: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. Blast Radius

| File | Module | Impact Tier | Change Type |
|------|--------|-------------|-------------|
| `src/claude/hooks/lib/three-verb-utils.cjs` | Core utilities | Tier 1 (direct) | Modify -- add `searchGitHubIssues()` and `createGitHubIssue()` functions |
| `src/claude/commands/isdlc.md` | CLI command handler | Tier 1 (direct) | Modify -- update add handler step 3c and analyze handler |
| `src/claude/hooks/tests/test-three-verb-utils.test.cjs` | Test suite | Tier 1 (direct) | Modify -- add tests for new functions |
| `src/claude/hooks/tests/test-three-verb-utils-steps.test.cjs` | Integration tests | Tier 1 (direct) | Modify -- add integration test for add flow with reverse-lookup |
| `docs/requirements/REQ-0034-*/` | Requirements docs | Tier 1 (direct) | New -- analysis artifacts (this file, architecture, design docs) |
| `BACKLOG.md` | Project tracking | Tier 2 (transitive) | No code change -- existing `appendToBacklog()` logic is source-agnostic |
| `docs/requirements/*/meta.json` | Item metadata | Tier 2 (transitive) | No schema change -- existing `source` and `source_id` fields suffice |
| `src/claude/agents/00-sdlc-orchestrator.md` | Orchestrator | Tier 3 (potential) | No change needed -- orchestrator delegates to add/analyze handlers which live in isdlc.md |

**Blast Radius Summary**: 4 files directly modified (2 production, 2 test), 0-1 new files (if gh utility is extracted). The blast radius is contained because:

1. `detectSource()` is a leaf function -- nothing calls it except the add handler in `isdlc.md`
2. `three-verb-utils.cjs` is not `require()`-ed by any hooks (only referenced by test files and isdlc.md)
3. The `meta.json` schema already supports `source: "github"` and `source_id: "GH-N"` -- no schema migration needed
4. The `appendToBacklog()` function is source-agnostic -- it does not need changes

## 2. Entry Points

**Recommended Starting Point**: `src/claude/hooks/lib/three-verb-utils.cjs`

The new utility functions (`searchGitHubIssues()`, `createGitHubIssue()`, `checkGhAvailability()`) are the foundation. Everything else depends on them. They should be implemented and tested before modifying the command handler.

**Rationale**: The utility functions are pure Node.js code with clear inputs/outputs and can be unit-tested with mocked `gh` CLI. Once these work, the command handler modification is a straightforward wiring change.

## 3. Implementation Order

| # | Change | Depends On | Risk | Parallelizable |
|---|--------|-----------|------|---------------|
| 1 | Add `checkGhAvailability()` to `three-verb-utils.cjs` | None | Low | -- |
| 2 | Add `searchGitHubIssues(query)` to `three-verb-utils.cjs` | #1 | Medium | -- |
| 3 | Add `createGitHubIssue(title, body)` to `three-verb-utils.cjs` | #1 | Medium | Yes (with #2) |
| 4 | Write unit tests for #1, #2, #3 | #1, #2, #3 | Low | -- |
| 5 | Modify `isdlc.md` add handler step 3c to call new functions | #2, #3 | Medium | -- |
| 6 | Modify `isdlc.md` analyze handler to use reverse-lookup on add trigger | #5 | Low | -- |
| 7 | Write integration tests for add flow with reverse-lookup | #5 | Low | -- |
| 8 | Update exports in `three-verb-utils.cjs` module.exports | #2, #3 | Low | Yes (with #4) |

**Critical Path**: #1 -> #2 -> #5 -> #7

**Minimum Viable Implementation**: Steps #1, #2, #4, #5 (search + link, without issue creation). This delivers FR-001, FR-002, FR-003, FR-005, FR-006.

## 4. Risk Zones

| Risk | Area | Likelihood | Impact | Mitigation |
|------|------|-----------|--------|-----------|
| **Async execution model change** | `detectSource()` / add handler | Medium | High | Do NOT make `detectSource()` async. Add the reverse-lookup as a SEPARATE function called from the add handler after `detectSource()` returns `manual`. This preserves the existing synchronous contract. |
| **`gh` CLI subprocess timeout** | `searchGitHubIssues()` | Medium | Medium | Use `child_process.execSync` with a 3-second timeout. Catch `ETIMEDOUT` and fall back to manual. |
| **`gh` CLI output parsing** | `searchGitHubIssues()` | Low | Medium | Use `--json` flag for structured output. Parse with `JSON.parse()`, wrap in try/catch for malformed output. |
| **Regression in `#N` / `PROJECT-N` paths** | `detectSource()` | Low | High | Do NOT modify `detectSource()` at all. The reverse-lookup is a new code path that runs AFTER `detectSource()` returns `manual`, not inside it. Existing tests continue to pass unchanged. |
| **Test file size growth** | Test files | Low | Low | Group new tests in a dedicated `describe('reverseGitHubLookup()')` block. Consider extracting to a new test file if it exceeds 200 lines. |
| **UX flow complexity** | `isdlc.md` add handler | Medium | Medium | The add handler is a markdown instruction set for Claude -- keep the new step 3c-prime instructions clear and unambiguous. Test with multiple Claude sessions. |
| **Rate limiting from GitHub API** | `searchGitHubIssues()` | Low | Low | `gh issue list` uses GitHub's search API which has generous rate limits (30 req/min for search). Single-user CLI tool will not hit this. |

## 5. Summary

**Total files affected**: 4-5 (2 production code, 2 test files, 0-1 optional extraction)
**Risk level**: Medium -- the change is well-scoped but introduces external CLI dependency in a critical path
**Key concerns**:
- Preserving the synchronous `detectSource()` contract is essential -- the reverse-lookup must be a separate step
- Graceful degradation when `gh` is unavailable must be bulletproof -- the add flow must never block
- The UX flow in `isdlc.md` must be unambiguous for Claude to execute reliably

**Go/No-Go Recommendation**: GO -- the blast radius is contained, the architectural approach (separate function, not modifying `detectSource()`) minimizes regression risk, and all high-impact risks have clear mitigations.

## 6. Implementation Recommendations

1. **Do NOT modify `detectSource()`**. Add a new `reverseGitHubLookup(description)` function that is called from the add handler when `detectSource()` returns `source: "manual"`.
2. **Implement `checkGhAvailability()` first** -- this is the graceful degradation gate. If `gh` is not available, skip the entire reverse-lookup silently.
3. **Use `child_process.execSync` with timeout** for `gh` CLI calls. The add handler targets 5-second total time; budget 3 seconds for the `gh` search.
4. **Keep the UX flow in `isdlc.md` as a numbered list** consistent with the existing step 3a/3b pattern. Add step 3c-prime after step 3c.
5. **Write tests with mocked `gh` CLI** using `child_process` stubbing or a test helper that writes mock `gh` output.
