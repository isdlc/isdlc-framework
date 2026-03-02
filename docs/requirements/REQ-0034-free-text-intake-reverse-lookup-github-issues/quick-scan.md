# Quick Scan: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. Scope

**Scope Classification**: Medium
**Complexity**: Medium

**Rationale**: The feature modifies the existing `detectSource()` flow in `three-verb-utils.cjs` and the `add` handler in `isdlc.md` to add GitHub issue search before defaulting to `source: "manual"`. It involves external CLI dependency (`gh`), UX flow decisions (match presentation, disambiguation, confirmation), and error handling for network/auth/CLI failures.

The change is mixed: modifying existing behavior (the free-text → manual fallback path) and adding new code (GitHub search, match presentation, issue creation prompt).

## 2. Keywords

| Keyword | Hits | Key Files |
|---------|------|-----------|
| `detectSource` | 5 hits, 3 files | `three-verb-utils.cjs` (3), `isdlc.md` (1), `coverage-report.md` (1) |
| `source.*manual` | 8 hits, 4 files | `three-verb-utils.cjs` (4), `isdlc.md` (2), `00-sdlc-orchestrator.md` (1), `coverage-report.md` (1) |
| `gh issue` | 13 hits, 5 files | `isdlc.md` (3), `BACKLOG.md` (6), `security-compliance-auditor.md` (2), `test-deploy-gate.md` (1), `coverage-report.md` (1) |
| `generateSlug` | 7 hits, 3 files | `three-verb-utils.cjs` (3), `isdlc.md` (3), `coverage-report.md` (1) |
| `execSync`/`child_process` | 9 hits, 4 files | `three-verb-utils.cjs` (2), `branch-guard.cjs` (3), `blast-radius-validator.cjs` (2), `common.cjs` (2) |

**Notable**: `execSync` is already imported in `three-verb-utils.cjs`. No `gh issue list --search` pattern exists anywhere -- this is new functionality.

## 3. File Count

| Category | Count | Files |
|----------|-------|-------|
| Modify | 2 | `src/claude/hooks/lib/three-verb-utils.cjs` (add `checkGhAvailability()`, `searchGitHubIssues()`, `createGitHubIssue()`), `src/claude/commands/isdlc.md` (add handler step 3c-prime) |
| New | 0 | All new functions fit in `three-verb-utils.cjs` alongside existing `detectSource()` |
| Test | 2 | `test-three-verb-utils.test.cjs` (unit tests), `test-three-verb-utils-steps.test.cjs` (integration) |
| Config | 0 | No configuration changes expected |
| Docs | 1 | This requirement folder artifacts |

**Total**: 5 files
**Confidence**: High (`execSync` already imported, `detectSource()` called from single site in `isdlc.md`)

## 4. Final Scope

**Final Scope**: Medium (5 files, medium complexity)

**Summary**: A well-scoped feature that modifies the intake pipeline at a single decision point (`detectSource` / add handler step 3c) to insert a GitHub reverse-lookup step. The main complexity comes from:
- External `gh` CLI subprocess management with timeout (3-second budget within 5-second NFR)
- UX flow for match presentation in the markdown command handler
- Graceful degradation for all `gh` failure modes (not installed, not authenticated, network timeout)
- The create-if-not-found prompt flow
