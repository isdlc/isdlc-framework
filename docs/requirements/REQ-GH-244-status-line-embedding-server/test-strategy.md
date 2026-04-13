# Test Strategy: REQ-GH-244 Status Line Embedding Server

**Requirement**: REQ-GH-244 — Claude Code status line integration for embedding server
**Phase**: 05 - Test Strategy & Design
**Created**: 2026-04-12

---

## Existing Infrastructure (from test evaluation)

- **Framework**: `node --test` (Node.js built-in test runner)
- **Assertion**: `node:assert/strict`
- **Coverage Tool**: None formal (estimated ~85% from file presence)
- **Current Baseline**: 7,400+ tests across 597 test files
- **Existing Patterns**: CJS hooks use `.test.cjs` co-located; ESM lib uses `.test.js` co-located; integration tests in `tests/integration/`
- **Relevant Existing Tests**: `lib/embedding/server/health-probe.test.cjs`, `src/core/embedding/query-classifier.test.cjs`, `tests/integration/embedding-fail-open.test.js`

## Strategy for This Requirement

- **Approach**: Extend existing test suite (NOT replace). Follow established `node --test` + `node:assert/strict` patterns.
- **New Test Types Needed**: Unit tests for 3 new modules, integration tests for cross-module flows, fail-open tests for Article X compliance.
- **Coverage Target**: >=80% unit, >=70% integration (standard tier per constitution Article II).
- **Naming Convention**: `[PN] AC-NNN-NN: Given ... When ... Then ...` (matches existing health-probe.test.cjs pattern).

## Test Commands (use existing)

- Unit (new CJS): `node --test src/core/vcs/staleness.test.cjs src/core/embedding/health-monitor.test.cjs src/providers/claude/embedding-statusline.test.cjs`
- Unit (modified ESM): `node --test lib/embedding/package/manifest.test.js` (existing, extend)
- Integration: `node --test tests/integration/embedding-statusline.test.cjs tests/integration/embedding-statusline-failopen.test.cjs`
- All: `npm run test:all` (existing scripts cover glob patterns)

---

## Test Pyramid

### Unit Tests (Layer 1 — ~35 test cases)

| Module | Test File | Trace | Count |
|--------|-----------|-------|-------|
| `staleness.cjs` | `src/core/vcs/staleness.test.cjs` | FR-003 | 12 |
| `health-monitor.cjs` | `src/core/embedding/health-monitor.test.cjs` | FR-002 | 10 |
| `embedding-statusline.cjs` | `src/providers/claude/embedding-statusline.test.cjs` | FR-001 | 10 |
| `manifest.js` (modify) | `lib/embedding/package/manifest.test.js` (extend) | FR-003 AC-003-06 | 3 |

### Integration Tests (Layer 2 — ~10 test cases)

| Scope | Test File | Trace | Count |
|-------|-----------|-------|-------|
| End-to-end status line flow | `tests/integration/embedding-statusline.test.cjs` | FR-001, FR-002, FR-003 | 5 |
| Fail-open all error paths | `tests/integration/embedding-statusline-failopen.test.cjs` | FR-004 | 5 |

### E2E Tests (Layer 3 — out of scope)

Full E2E testing of Claude Code status line API requires a running Claude Code session. This is validated manually during Phase 16 quality loop. The integration tests simulate the script execution path.

---

## Flaky Test Mitigation

| Risk | Source | Mitigation |
|------|--------|------------|
| Temp directory cleanup failures | `fs.rmSync` race on Windows | Wrap in try/catch, use `{ force: true }` |
| Port collision in HTTP probe tests | Multiple test suites binding localhost | Do NOT bind ports — mock `http.request` in unit tests; integration tests use health file reads only |
| `git fetch` network dependency | VCS staleness git tests | All git/svn commands mocked via `child_process.execSync` stub — no real VCS operations in tests |
| Timestamp precision | `shouldRefresh()` interval checks | Use explicit clock injection (pass `Date.now()` or set file mtime via `fs.utimesSync`) |
| PID-based process checks | `process.kill(pid, 0)` | Use `process.pid` for alive case, `999999999` for dead case (established pattern from health-probe.test.cjs) |

---

## Performance Test Plan

| Metric | Target | Test Method |
|--------|--------|-------------|
| Display-refresh latency | < 5ms | Unit test: time health file read + format — assert < 5ms (AC-001-09) |
| Data-refresh latency | < 5s | Integration test: measure full `refreshHealth()` with mocked HTTP + VCS — assert < 5s |
| `getCommitsBehind()` timeout | 5s git, 3s svn | Unit test: verify timeout params passed to `execSync` |

---

## Module-by-Module Test Design

### M1: src/core/vcs/staleness.cjs (FR-003)

**Test file**: `src/core/vcs/staleness.test.cjs`

Tests require mocking `child_process.execSync` and `fs.existsSync` to simulate Git, SVN, and no-VCS environments. No real VCS commands are executed.

| # | Priority | AC | Type | Scenario |
|---|----------|----|------|----------|
| 1 | P0 | AC-003-01 | positive | Git repo: returns commits_behind + files_changed from rev-list and diff |
| 2 | P0 | AC-003-02 | positive | SVN repo: returns files_changed from svn status, commits_behind from revision delta |
| 3 | P0 | AC-003-03 | positive | No VCS: returns { commits_behind: null, files_changed: null, vcs: "unknown" } |
| 4 | P1 | AC-003-04 | positive | Git no upstream: falls back to local HEAD, still reports files_changed |
| 5 | P1 | AC-003-05 | negative | Git fetch fails (network error): falls back to local HEAD, reports files_changed |
| 6 | P0 | AC-003-07 | positive | Local files modified but not committed: files_changed > 0 |
| 7 | P1 | AC-003-01 | positive | Git: zero commits behind, zero files changed → both return 0 |
| 8 | P1 | AC-003-02 | positive | SVN: zero revisions behind, zero files changed → both return 0 |
| 9 | P2 | AC-003-05 | negative | Git rev-list fails: commits_behind = null, continues |
| 10 | P2 | AC-003-04 | negative | Git diff fails: files_changed = null, continues |
| 11 | P2 | AC-003-02 | negative | SVN info fails: commits_behind = null, continues |
| 12 | P2 | AC-003-02 | negative | SVN status fails: files_changed = null, continues |

### M2: src/core/embedding/health-monitor.cjs (FR-002)

**Test file**: `src/core/embedding/health-monitor.test.cjs`

Tests use tmp directories with crafted health files, mock HTTP probe and VCS staleness calls.

| # | Priority | AC | Type | Scenario |
|---|----------|----|------|----------|
| 1 | P0 | AC-002-01 | positive | Server healthy + fresh: health file shows status "healthy" with chunks + port |
| 2 | P0 | AC-002-02 | positive | Server offline: health file updates to "offline", transition logged |
| 3 | P0 | AC-002-04 | negative | HTTP probe timeout: health file shows "offline" with error, no crash |
| 4 | P0 | — | positive | No .emb files: returns "missing" |
| 5 | P0 | — | positive | Generation lock exists: returns "loading" |
| 6 | P1 | AC-002-03 | positive | Interval config 2 min: shouldRefresh uses 2-minute threshold |
| 7 | P1 | — | positive | Stale commits: status "stale" with commits_behind |
| 8 | P1 | — | positive | Stale files: status "stale" with files_changed |
| 9 | P1 | AC-002-02 | positive | Transition detection: previous "healthy" → new "offline" logged |
| 10 | P2 | AC-002-05 | positive | Health file schema matches tool-router contract |

### M3: src/providers/claude/embedding-statusline.cjs (FR-001)

**Test file**: `src/providers/claude/embedding-statusline.test.cjs`

Tests mock the health-monitor and config read to validate output formatting.

| # | Priority | AC | Type | Scenario |
|---|----------|----|------|----------|
| 1 | P0 | AC-001-01 | positive | Healthy: outputs `emb: {N} chunks checkmark` |
| 2 | P0 | AC-001-02 | positive | Stale commits only: `emb: stale ({N} commits behind)` |
| 3 | P0 | AC-001-03 | positive | Stale files only: `emb: stale ({N} files modified)` |
| 4 | P0 | AC-001-04 | positive | Stale both: `emb: stale ({N} commits behind, {M} files modified)` |
| 5 | P0 | AC-001-05 | positive | Offline: `emb: offline` |
| 6 | P0 | AC-001-06 | positive | Loading: `emb: loading...` |
| 7 | P0 | AC-001-07 | positive | Missing: `emb: not configured` |
| 8 | P1 | AC-001-08 | positive | Config disabled: no output, exit 0 |
| 9 | P1 | AC-001-09 | positive | Display-refresh (fresh file): reads from cache, < 5ms |
| 10 | P2 | AC-001-01 | negative | Unexpected error: no output, exit 0 |

### M4: lib/embedding/package/manifest.js (FR-003 AC-003-06)

**Test file**: `lib/embedding/package/manifest.test.js` (extend existing)

| # | Priority | AC | Type | Scenario |
|---|----------|----|------|----------|
| 1 | P0 | AC-003-06 | positive | generatedAtCommit included when provided |
| 2 | P1 | AC-003-06 | positive | generatedAtCommit omitted when not provided (backward compat) |
| 3 | P2 | AC-003-06 | negative | generatedAtCommit null: field omitted |

### M5: src/providers/codex/projection.js (FR-001 AC-001-10)

**Test file**: Extend existing Codex projection tests (tests/providers/codex/)

| # | Priority | AC | Type | Scenario |
|---|----------|----|------|----------|
| 1 | P1 | AC-001-10 | positive | Health file present: EMBEDDING_STATUS injected into projection |
| 2 | P1 | AC-001-10 | negative | Health file missing: EMBEDDING_STATUS omitted |

### M6: Integration — End-to-End Status Line Flow (FR-001, FR-002, FR-003)

**Test file**: `tests/integration/embedding-statusline.test.cjs`

| # | Priority | Trace | Type | Scenario |
|---|----------|-------|------|----------|
| 1 | P0 | FR-001,FR-002 | positive | Full cycle: refreshHealth writes file, statusline reads and formats |
| 2 | P0 | FR-002,FR-003 | positive | VCS staleness flows through health monitor to status output |
| 3 | P1 | FR-001 | positive | Two-tier: fresh file skips refresh, stale file triggers refresh |
| 4 | P1 | FR-002 | positive | Transition: healthy → stale logged to stderr |
| 5 | P1 | FR-001,FR-002 | positive | Health file shared: tool-router and statusline read same data |

### M7: Integration — Fail-Open (FR-004)

**Test file**: `tests/integration/embedding-statusline-failopen.test.cjs`

| # | Priority | AC | Type | Scenario |
|---|----------|----|------|----------|
| 1 | P0 | AC-004-01 | negative | Status line script error: exit 0, no output |
| 2 | P0 | AC-004-02 | negative | Health probe timeout: status = "offline", continues |
| 3 | P0 | AC-004-03 | negative | VCS commands fail: nulls, continues |
| 4 | P1 | AC-004-01 | negative | Corrupt health file: exit 0, no output |
| 5 | P1 | AC-004-03 | negative | Missing .emb manifest: graceful degradation |

---

## Task-to-Test Traceability

| Task | File Under Test | Test File | Traces | Scenarios |
|------|----------------|-----------|--------|-----------|
| T002 | `src/core/vcs/staleness.cjs` | `src/core/vcs/staleness.test.cjs` | FR-003, AC-003-01..05,07 | 12 |
| T003 | `src/core/embedding/health-monitor.cjs` | `src/core/embedding/health-monitor.test.cjs` | FR-002, AC-002-01..05 | 10 |
| T004 | `lib/embedding/package/manifest.js`, `builder.js` | `lib/embedding/package/manifest.test.js` | FR-003, AC-003-06 | 3 |
| T005 | `src/providers/claude/embedding-statusline.cjs` | `src/providers/claude/embedding-statusline.test.cjs` | FR-001, AC-001-01..09 | 10 |
| T006 | `src/providers/codex/projection.js` | Codex projection tests | FR-001, AC-001-10 | 2 |
| T008 | (test task) | `src/core/vcs/staleness.test.cjs` | FR-003 | — |
| T009 | (test task) | `src/core/embedding/health-monitor.test.cjs` | FR-002 | — |
| T010 | (test task) | `src/providers/claude/embedding-statusline.test.cjs` | FR-001 | — |
| T011 | (test task) | `lib/embedding/package/manifest.test.js` | FR-003 | — |
| T012 | (test task) | `tests/integration/embedding-statusline.test.cjs` | FR-001,FR-002,FR-003 | 5 |
| T013 | (test task) | `tests/integration/embedding-statusline-failopen.test.cjs` | FR-004 | 5 |

---

## Security Considerations (Article III)

- No secrets in test data or fixtures
- Health file path validated to prevent directory traversal in tests
- Test fixtures use synthetic data only (no real VCS refs)

## Cross-Platform Notes (Article XII)

- All path operations use `path.join()` / `path.resolve()`
- Temp directories created via `os.tmpdir()` + `fs.mkdtempSync()`
- No platform-specific commands in test scaffolds (VCS commands are mocked)
