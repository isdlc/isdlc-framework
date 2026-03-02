# Test Strategy: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Phase**: 05-test-strategy
**Date**: 2026-02-21
**Traces to**: FR-001 through FR-015, NFR-001 through NFR-010

---

## 1. Existing Infrastructure

### 1.1 Framework and Conventions

| Aspect | Value | Source |
|--------|-------|--------|
| **Test runner** | `node:test` (built-in) | Article II, Constitution |
| **Assertion library** | `node:assert/strict` | Project convention |
| **Module system** | CommonJS (`.test.cjs`) | Article XII, Constitution |
| **File naming** | `{module-name}.test.cjs` | Project convention |
| **File location** | `src/claude/hooks/tests/` | Project convention |
| **Coverage tool** | None (manual traceability) | Project standard |
| **External frameworks** | Prohibited | Article II.3 |

### 1.2 Established Test Patterns (from existing tests)

The project uses a consistent pattern across 78 existing `.test.cjs` files:

1. **Temp directory isolation**: Each test suite creates a temp directory via `fs.mkdtempSync()`, writes fixtures to it, and cleans up in `afterEach()`.
2. **Module reloading**: Common.cjs is loaded per-suite with `CLAUDE_PROJECT_DIR` set to the temp directory, with `delete require.cache[path]` to ensure fresh module state.
3. **No mocking framework**: Tests use manual function replacement, temp directory I/O, and `CLAUDE_PROJECT_DIR` overrides rather than jest/sinon mocking.
4. **Fixture factories**: Helper functions like `bloatedState()`, `minimalActiveWorkflow()` produce realistic state objects for each test.
5. **Hook subprocess testing**: Integration tests for hooks execute the hook as a subprocess via `execSync('node hookPath < stdinFile')` to test the real stdin/stdout JSON protocol (Article XI.2).

### 1.3 What Exists for This Feature

No test files exist for the new functions (`clearTransientFields`, `resolveArchivePath`, `appendToArchive`, `seedArchiveFromHistory`). The four existing prune functions (`pruneSkillUsageLog`, `pruneCompletedPhases`, `pruneHistory`, `pruneWorkflowHistory`) have zero test coverage (noted in requirements-spec.md Section 15). The `cleanup-completed-workflow.test.cjs` file tests a related but different function and serves as a pattern reference.

---

## 2. Test Strategy Overview

### 2.1 Approach: Extend Existing Test Suite

This strategy extends the existing test infrastructure. No new frameworks, no new test runners, no new tooling. All new tests follow the established patterns documented in Section 1.2.

### 2.2 Scope

| In Scope | Out of Scope |
|----------|-------------|
| 4 new functions in common.cjs | FR-012 (lookupArchive -- deferred) |
| 4 existing prune functions (backfill) | FR-006 orchestrator prompt changes (not testable as code) |
| Enforcer integration (FR-005, FR-010) | FR-001 orchestrator finalize (prompt-driven, tested via enforcer fallback) |
| Default parameter changes (FR-004) | FR-013 orchestrator abandoned workflow detection (prompt-driven) |
| Error handling for all 28 error conditions | Human readability of state.json |
| NFR validation (performance, idempotency, isolation) | Archive rotation/cleanup |

### 2.3 Test Pyramid

```
           /\
          /  \   E2E / Subprocess Integration
         / 10 \  (hook stdin/stdout protocol tests)
        /------\
       /        \   Integration
      /    12    \  (multi-function sequences with real filesystem)
     /------------\
    /              \   Unit
   /      42        \  (individual function behavior, isolated)
  /------------------\
```

| Level | Count | Runner | I/O Model |
|-------|-------|--------|-----------|
| **Unit** | 42 tests | `node:test` | Temp dir + module reload |
| **Integration** | 12 tests | `node:test` | Temp dir + real fs + multi-function |
| **Subprocess** | 10 tests | `node:test` + `execSync` | Hook subprocess, stdin/stdout protocol |
| **Total** | **64 tests** | | |

### 2.4 Flaky Test Mitigation

| Risk | Mitigation |
|------|-----------|
| Temp directory collisions | Each test uses `fs.mkdtempSync()` with unique prefix per suite |
| Module cache pollution | `delete require.cache[commonPath]` in `beforeEach()` |
| Timestamp sensitivity | All timestamp comparisons use fixture-controlled ISO strings, never `Date.now()` |
| File permission tests | Skipped on Windows CI (detection via `process.platform`) |
| Process environment leaks | `afterEach()` restores `CLAUDE_PROJECT_DIR` and cleans env |
| Archive file state leaks | Each test writes its own archive file in its temp dir |

### 2.5 Performance Test Plan

| NFR | Test | Method | Threshold |
|-----|------|--------|-----------|
| NFR-002 | Full prune sequence on 100 KB state | Synthetic 100 KB state.json, `performance.now()` before/after | p95 < 50ms |
| NFR-005 | State.json size after prune with 50 workflows | Generate state with 50 `workflow_history` entries, run full prune, measure `Buffer.byteLength()` | < 30 KB |
| NFR-010 | Archive append on 200 KB file | Synthetic 200 KB archive (100 records), measure single append | p95 < 100ms |
| NFR-010 | Archive append on 1 MB file | Synthetic 1 MB archive (500 records), measure single append | p95 < 500ms |

Performance tests run 10 iterations and assert on the p95 value. They are tagged with `{ skip: process.env.CI === 'true' && process.platform === 'win32' }` to avoid flaky results on slow CI runners.

---

## 3. Test Files

### 3.1 File Map

| Test File | Module Under Test | Level | Test Count | FRs Covered |
|-----------|------------------|-------|------------|-------------|
| `prune-functions.test.cjs` | `common.cjs` (4 existing prune fns) | Unit | 18 | FR-004 |
| `archive-functions.test.cjs` | `common.cjs` (4 new fns) | Unit | 24 | FR-003, FR-011, FR-014, FR-015 |
| `archive-integration.test.cjs` | `common.cjs` (multi-fn sequences) | Integration | 12 | FR-002, FR-005, FR-009, FR-010, NFR-001 through NFR-010 |
| `workflow-completion-enforcer-archive.test.cjs` | `workflow-completion-enforcer.cjs` | Subprocess | 10 | FR-005, FR-010, NFR-001, NFR-007 |

All files reside in: `src/claude/hooks/tests/`

---

## 4. Test Case Specifications

### 4.1 Suite: prune-functions.test.cjs (Unit -- 18 tests)

Backfill tests for the 4 existing prune functions plus updated defaults (FR-004).

#### 4.1.1 pruneSkillUsageLog

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| PF-01 | Empty skill_usage_log | `state.skill_usage_log = []` | Returns state, array unchanged | -- | positive |
| PF-02 | Below cap (< 50) | 10 entries | All 10 preserved | AC-004-04 | positive |
| PF-03 | At cap (= 50) | 50 entries | All 50 preserved | AC-004-04 | positive |
| PF-04 | Above cap (60 entries) | 60 entries | Oldest 10 removed, 50 remain (FIFO) | AC-004-01 | positive |
| PF-05 | Non-array skill_usage_log | `state.skill_usage_log = null` | No TypeError, state returned | -- | negative |
| PF-06 | Default maxEntries is 50 | Call with 1 arg (no maxEntries) | Caps at 50, not 20 | AC-004-01 | positive |

#### 4.1.2 pruneCompletedPhases

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| PF-07 | Empty phases | `state.phases = {}` | Returns state unchanged | -- | positive |
| PF-08 | Completed phases stripped | 3 completed phases with verbose sub-objects | Sub-objects (iteration_requirements, constitutional_validation, gate_validation, testing_environment, verification_summary, atdd_validation) removed; timing/summary/status/started/completed/gate_passed/artifacts preserved | -- | positive |
| PF-09 | Protected phases preserved | 1 phase in protected list | That phase is not stripped | -- | positive |
| PF-10 | `_pruned_at` timestamp added | Completed phase | `_pruned_at` field set to ISO timestamp | -- | positive |

#### 4.1.3 pruneHistory

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| PF-11 | Below cap (< 100) | 50 entries | All 50 preserved | AC-004-04 | positive |
| PF-12 | Above cap (120 entries) | 120 entries | Oldest 20 removed, 100 remain | AC-004-02 | positive |
| PF-13 | Action string truncation | Entry with 300-char action | Truncated to 200 chars + "..." | -- | positive |
| PF-14 | Short action unchanged | Entry with 50-char action | No truncation | -- | positive |
| PF-15 | Default maxEntries is 100 | Call with 1 arg | Caps at 100, not 50 | AC-004-02 | positive |

#### 4.1.4 pruneWorkflowHistory

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| PF-16 | Below cap (< 50) | 10 entries | All 10 preserved | AC-004-03, AC-004-04 | positive |
| PF-17 | Above cap (60 entries) | 60 entries | Oldest 10 removed, 50 remain | AC-004-03 | positive |
| PF-18 | git_branch compacted | Entry with full git_branch object | Compacted to `{ name }` | -- | positive |

### 4.2 Suite: archive-functions.test.cjs (Unit -- 24 tests)

Tests for the 4 new functions in common.cjs.

#### 4.2.1 resolveArchivePath

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| RAP-01 | Single-project mode | No args, monorepo mode off | `{root}/.isdlc/state-archive.json` | AC-015-01 | positive |
| RAP-02 | Monorepo with explicit projectId | `'my-app'`, monorepo on | `{root}/.isdlc/projects/my-app/state-archive.json` | AC-015-02 | positive |
| RAP-03 | Monorepo auto-detect | No args, monorepo on, active project set | Uses `getActiveProject()` result | AC-015-03 | positive |
| RAP-04 | Same directory as resolveStatePath | Compare dirname of both | `path.dirname(resolveArchivePath(id)) === path.dirname(resolveStatePath(id))` | AC-015-04 | positive |
| RAP-05 | Filename is always state-archive.json | Any mode | `path.basename(result) === 'state-archive.json'` | AC-015-04 | positive |
| RAP-06 | Falsy projectId in monorepo | `resolveArchivePath('')` | Falls through to getActiveProject() or single-project default | -- | negative |

#### 4.2.2 clearTransientFields

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| CTF-01 | Clears pending_escalations | `state.pending_escalations = [{...}]` | `state.pending_escalations === []` | AC-003-01 | positive |
| CTF-02 | Clears pending_delegation | `state.pending_delegation = {...}` | `state.pending_delegation === null` | AC-003-02 | positive |
| CTF-03 | Clears current_phase | `state.current_phase = '06-implementation'` | `state.current_phase === null` | AC-003-03 | positive |
| CTF-04 | Clears active_agent | `state.active_agent = 'software-developer'` | `state.active_agent === null` | AC-003-04 | positive |
| CTF-05 | Clears phases | `state.phases = { '01-req': {...} }` | `state.phases` deep equals `{}` | AC-003-05 | positive |
| CTF-06 | Clears blockers | `state.blockers = [{...}]` | `state.blockers` deep equals `[]` | AC-003-06 | positive |
| CTF-07 | Returns mutated state object | Call and capture return | `return === state` (same reference) | AC-003-07 | positive |
| CTF-08 | Durable fields preserved | State with project, constitution, counters, discovery_context, framework_version, state_version, workflow, etc. | All durable fields unchanged after call | AC-003-08 | positive |
| CTF-09 | Null input | `clearTransientFields(null)` | Returns `null`, no TypeError | -- | negative |
| CTF-10 | Undefined input | `clearTransientFields(undefined)` | Returns `undefined`, no TypeError | -- | negative |
| CTF-11 | Idempotent | Call twice on same state | Second call produces identical state | NFR-006 | positive |

#### 4.2.3 appendToArchive

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| ATA-01 | New archive (file absent) | Record, no existing file | Creates `{ version: 1, records: [record], index: {...} }` | AC-011-02 | positive |
| ATA-02 | Append to existing archive | Record, existing archive with 1 record | `records.length === 2`, index updated | AC-011-01 | positive |
| ATA-03 | Multi-key index | Record with source_id="GH-39" + slug="state-json-pruning-GH-39" | Both keys in index, both pointing to same position | AC-011-03 | positive |
| ATA-04 | Dedup: skip duplicate | Same slug + completed_at as last record | `records.length` unchanged | -- | positive |
| ATA-05 | Dedup: allow different timestamp | Same slug, different completed_at | `records.length` increments | -- | positive |
| ATA-06 | Corrupt file recovery | Invalid JSON on disk | Fresh archive created, record appended | -- | negative |
| ATA-07 | Write error (read-only dir) | `fs.writeFileSync` fails | Warning logged to stderr, no throw | AC-011-04 | negative |
| ATA-08 | Record with null source_id | `source_id: null`, slug present | Only slug in index | -- | negative |
| ATA-09 | Record with null slug | slug null, source_id present | Only source_id in index | -- | negative |
| ATA-10 | Record with both null | Both null | Record appended, no index entries | -- | negative |
| ATA-11 | Monorepo: directory creation | Monorepo project dir absent | `mkdirSync` called, file created in project subdir | -- | positive |
| ATA-12 | Re-work: same source_id, two workflows | Two records with same source_id, different slugs | Index maps source_id to `[0, 1]` | AC-010-05 | positive |
| ATA-13 | Archive file is valid JSON after append | Append 3 records sequentially | `JSON.parse()` succeeds after each append | NFR-008 | positive |

#### 4.2.4 seedArchiveFromHistory

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| SAH-01 | Normal history array (3 entries) | 3 entries with all fields | 3 records in archive | AC-014-01 | positive |
| SAH-02 | Entry missing source_id | Entry without `id` field | Record appended, indexed by slug only | AC-014-03 | positive |
| SAH-03 | Entry missing both identifiers | No id, no artifact_folder | Record appended, no index entries | AC-014-04 | negative |
| SAH-04 | Entry with no timestamp | No completed_at or cancelled_at | Entry skipped, not in archive | -- | negative |
| SAH-05 | One entry throws during transform | Middle entry causes error in appendToArchive | First and third still seeded | AC-014-05 | negative |
| SAH-06 | Empty array input | `[]` | No records in archive | -- | negative |
| SAH-07 | Null input | `null` | Returns immediately, no error | -- | negative |
| SAH-08 | Outcome derivation: cancelled | `status: 'cancelled'` | `outcome: 'cancelled'` | -- | positive |
| SAH-09 | Outcome derivation: merged | `git_branch: { status: 'merged' }` | `outcome: 'merged'` | -- | positive |
| SAH-10 | Phase snapshot compaction | Full snapshots with timing, gate_passed, etc. | Compacted to `{ phase, status, summary }` only | AC-014-02 | positive |
| SAH-11 | Idempotent (call twice) | Same history array twice | Dedup in appendToArchive prevents duplicates | NFR-006 | positive |

### 4.3 Suite: archive-integration.test.cjs (Integration -- 12 tests)

Multi-function integration tests with real filesystem operations (Article XI.1).

#### 4.3.1 Full Prune + Clear Sequence

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| INT-01 | Full sequence on realistic state | Bloated state (25 skill entries, 18 workflow_history, 120 history, 6 transient fields populated) | All arrays FIFO-capped, all transient fields cleared, durable fields unchanged | FR-002, FR-004, AC-003-01 through AC-003-08 | positive |
| INT-02 | Idempotent prune sequence | Run full sequence twice | Second run produces identical JSON output | NFR-006 | positive |
| INT-03 | Durable field protection (all 12 fields) | State with all 12 durable fields populated | All 12 durable fields bit-for-bit identical after full prune + clear | NFR-003 | positive |
| INT-04 | Prune error does not block clear | `pruneHistory` receives non-array `history` field | `clearTransientFields` still runs, transient fields cleared | NFR-001 | negative |

#### 4.3.2 Archive Write Path Integration

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| INT-05 | Archive-first-then-prune ordering | Full state, call appendToArchive then clearTransientFields | Archive record has pre-prune data; state.json has post-prune data | FR-010, FR-002 | positive |
| INT-06 | seedArchiveFromHistory + FIFO prune | 18-entry workflow_history, seed then prune | Archive has 18 records, state.json workflow_history capped at 50 | FR-009 | positive |
| INT-07 | Migration flag idempotency | Seed archive, set `pruning_migration_completed = true`, attempt migration again | Second migration does not re-seed | AC-009-08 | positive |
| INT-08 | Archive write failure does not block state prune | Corrupt archive file (unwritable), call prune sequence | State.json still pruned, archive error logged | NFR-001, NFR-007 | negative |

#### 4.3.3 NFR Validation (Performance and Size)

| ID | Test Case | Input | Expected | AC | Type |
|----|-----------|-------|----------|-----|------|
| INT-09 | Prune performance on 100 KB state | Synthetic 100 KB state.json | Full prune sequence < 50ms (p95 over 10 runs) | NFR-002 | positive |
| INT-10 | State size after prune with 50 workflows | 50 workflow_history entries + durable fields | `Buffer.byteLength(JSON.stringify(state)) < 30720` (30 KB) | NFR-005 | positive |
| INT-11 | Archive append performance on 200 KB file | 100-record archive (~200 KB) | Single append < 100ms (p95 over 10 runs) | NFR-010 | positive |
| INT-12 | Monorepo archive isolation | Two temp dirs simulating two projects | Each archive contains only its own records, zero cross-contamination | NFR-009 | positive |

### 4.4 Suite: workflow-completion-enforcer-archive.test.cjs (Subprocess -- 10 tests)

Integration tests for the enforcer hook using subprocess execution (Article XI.2). These test the real hook stdin/stdout protocol.

| ID | Test Case | Setup | Assertion | AC | Type |
|----|-----------|-------|----------|-----|------|
| ENF-01 | Enforcer calls clearTransientFields after prune | State: active_workflow=null, recent entry, missing snapshots | State on disk has all 6 transient fields cleared | AC-005-01, AC-005-02 | positive |
| ENF-02 | Enforcer uses updated retention limits | State with 60 skill_usage_log entries | After enforcer runs: skill_usage_log has 50 entries | AC-004-01 | positive |
| ENF-03 | Enforcer archives completed workflow | Entry with git_branch.status='merged' | state-archive.json exists, record has outcome='merged' | AC-010-01 | positive |
| ENF-04 | Enforcer archives cancelled workflow | Entry with status='cancelled', cancellation_reason set | Archive record: outcome='cancelled', reason populated | AC-010-06 | positive |
| ENF-05 | Enforcer archives completed workflow with null reason | Entry with status='completed' | Archive record: outcome='completed', reason=null | AC-010-07 | positive |
| ENF-06 | Archive error does not block state write | Archive path set to read-only directory | Hook returns `{ decision: 'allow' }`, state.json still pruned | NFR-007, AC-010-04 | negative |
| ENF-07 | Guard: already has snapshots | Entry with phase_snapshots and metrics | No prune/archive calls, early return with `{ decision: 'allow' }` | -- | positive |
| ENF-08 | Guard: stale entry (> 2 min old) | Entry with completed_at > 2 minutes ago | No prune/archive calls, early return | -- | negative |
| ENF-09 | Multi-key index in archive | Entry with both id and artifact_folder | Archive index has entries for both keys | AC-010-02 | positive |
| ENF-10 | Full flow: self-heal + prune + clear + archive + write | State missing snapshots, all transient fields populated, no archive file | After: snapshots patched, state pruned, transient cleared, archive created with 1 record | FR-005, FR-010 | positive |

---

## 5. Traceability Matrix

### 5.1 Functional Requirements to Test Cases

| Requirement | ACs | Test Cases | Coverage |
|-------------|-----|------------|----------|
| FR-001 | AC-001-01 to AC-001-05 | ENF-01, ENF-02 (enforcer fallback verifies orchestrator path) | Covered via fallback |
| FR-002 | AC-002-01 to AC-002-06 | CTF-01 through CTF-06, INT-01, ENF-01 | 100% |
| FR-003 | AC-003-01 to AC-003-08 | CTF-01 through CTF-11 | 100% |
| FR-004 | AC-004-01 to AC-004-04 | PF-06, PF-15, PF-03, PF-16, ENF-02 | 100% |
| FR-005 | AC-005-01, AC-005-02 | ENF-01, ENF-10 | 100% |
| FR-006 | AC-006-01 to AC-006-03 | (Prompt-driven; verified via enforcer fallback ENF-01, ENF-02) | Covered via fallback |
| FR-007 | AC-007-01 to AC-007-03 | (Could Have -- deferred from this test cycle) | Deferred |
| FR-008 | AC-008-01, AC-008-02 | (Could Have -- deferred from this test cycle) | Deferred |
| FR-009 | AC-009-01 to AC-009-08 | INT-06, INT-07, SAH-01 through SAH-11 | 100% |
| FR-010 | AC-010-01 to AC-010-07 | ATA-01 through ATA-13, ENF-03 through ENF-05, ENF-09 | 100% |
| FR-011 | AC-011-01 to AC-011-05 | ATA-01 through ATA-13 | 100% |
| FR-012 | AC-012-01 to AC-012-05 | (Deferred with FR-012) | Deferred |
| FR-013 | AC-013-01 to AC-013-07 | (Prompt-driven orchestrator init; tested indirectly via common.cjs unit tests for clearTransientFields + appendToArchive) | Covered via unit tests |
| FR-014 | AC-014-01 to AC-014-05 | SAH-01 through SAH-11 | 100% |
| FR-015 | AC-015-01 to AC-015-06 | RAP-01 through RAP-06 | 100% |

### 5.2 Non-Functional Requirements to Test Cases

| NFR | Metric | Test Cases | Coverage |
|-----|--------|------------|----------|
| NFR-001 | Zero finalize failures from prune errors | INT-04, INT-08, ENF-06 | 100% |
| NFR-002 | p95 < 50ms for 100 KB state | INT-09 | 100% |
| NFR-003 | Zero durable field modifications | CTF-08, INT-03 | 100% |
| NFR-004 | Zero errors on legacy state files | CTF-09, CTF-10, ATA-06, SAH-07 | 100% |
| NFR-005 | < 30 KB with 50 workflow_history entries | INT-10 | 100% |
| NFR-006 | f(f(state)) === f(state) | CTF-11, INT-02, SAH-11 | 100% |
| NFR-007 | Zero finalize failures from archive errors | ATA-07, INT-08, ENF-06 | 100% |
| NFR-008 | JSON.parse succeeds after every append | ATA-13 | 100% |
| NFR-009 | Zero cross-project archive contamination | INT-12 | 100% |
| NFR-010 | p95 < 100ms for 200 KB archive | INT-11 | 100% |

---

## 6. Test Data Plan

### 6.1 Fixture Factories

All fixtures are defined as factory functions in the test files. No external fixture files.

| Factory | Purpose | Used By |
|---------|---------|---------|
| `minimalState()` | State with only durable fields, no transient data | CTF-09, CTF-10, RAP tests |
| `bloatedState()` | Realistic state with all fields populated, 25 skill entries, 18 workflow_history, 120 history entries, 6 transient fields set | INT-01 through INT-04, PF tests |
| `minimalActiveWorkflow()` | Active workflow fixture with completed phases and merged branch | ENF tests |
| `makeArchiveRecord(overrides)` | Archive record with sensible defaults, overridable fields | ATA tests, SAH tests |
| `makeLegacyHistoryEntry(overrides)` | Legacy workflow_history entry in old format (full git_branch, full phase_snapshots) | SAH tests |
| `syntheticLargeState(sizeKB)` | Generates a state.json of approximately the target size in KB | INT-09, INT-10 |
| `syntheticLargeArchive(recordCount)` | Generates an archive with the specified number of records | INT-11 |

### 6.2 Boundary Values

| Category | Boundary | Test Cases |
|----------|----------|------------|
| Array at FIFO cap | `skill_usage_log.length === 50` | PF-03 |
| Array at FIFO cap + 1 | `skill_usage_log.length === 51` | PF-04 |
| Array empty | `skill_usage_log.length === 0` | PF-01 |
| String at truncation limit | `action.length === 200` | PF-14 |
| String at truncation limit + 1 | `action.length === 201` | PF-13 |
| Archive with 0 records | Fresh archive file | ATA-01 |
| Archive with 1 record (dedup boundary) | Single existing record | ATA-04, ATA-05 |
| State size at 100 KB | Synthetic padded state | INT-09 |
| Archive size at 200 KB | 100-record archive | INT-11 |
| Archive size at 1 MB | 500-record archive | INT-11 (extended) |

### 6.3 Invalid Inputs

| Category | Invalid Input | Expected Behavior | Test Cases |
|----------|--------------|-------------------|------------|
| Null state | `clearTransientFields(null)` | Returns null | CTF-09 |
| Undefined state | `clearTransientFields(undefined)` | Returns undefined | CTF-10 |
| Null history array | `seedArchiveFromHistory(null)` | Returns immediately | SAH-07 |
| Empty history array | `seedArchiveFromHistory([])` | Returns immediately | SAH-06 |
| Corrupt JSON archive | `"not json{["` on disk | Fresh archive created | ATA-06 |
| Missing archive fields | `{ version: 1 }` (no records array) | Fresh archive created | ATA-06 variant |
| Record with null identifiers | `{ source_id: null, slug: null, ... }` | Appended, no index | ATA-10 |
| Non-array skill_usage_log | `state.skill_usage_log = null` | No TypeError | PF-05 |
| Entry with no timestamp | `{ completed_at: null, cancelled_at: null }` | Skipped | SAH-04 |

### 6.4 Maximum-Size Inputs

| Input | Size | Purpose | Test Cases |
|-------|------|---------|------------|
| State.json 100 KB | ~2500 lines, 50+ workflow_history entries, 200+ history entries | NFR-002 performance ceiling | INT-09 |
| State.json 55 KB (current real size) | Real-world reproduction | Baseline performance | INT-01 |
| Archive 200 KB | 100 compact records | NFR-010 performance ceiling | INT-11 |
| Archive 1 MB | 500 compact records | NFR-010 degradation ceiling | INT-11 extended |
| Single workflow_history entry with 20 phase_snapshots | ~2 KB per entry | seedArchiveFromHistory transform performance | SAH-01 |

---

## 7. Critical Paths

### 7.1 Path A: Normal Workflow Completion (Highest Priority)

```
orchestrator finalize
  -> writeState(state) with active_workflow=null
  -> PostToolUse fires enforcer
  -> enforcer: readState -> guard checks pass
  -> enforcer: self-heal (if needed) -> prune -> clearTransientFields -> archive -> writeState
```

**Test coverage**: ENF-01 through ENF-05, ENF-09, ENF-10

### 7.2 Path B: Archive Write Failure (Fail-Open Critical)

```
same as Path A, but appendToArchive encounters error
  -> error caught at archive try/catch
  -> warning logged
  -> writeState still called with pruned state
  -> state.json is lean despite archive failure
```

**Test coverage**: ATA-07, INT-08, ENF-06

### 7.3 Path C: One-Time Migration

```
orchestrator init detects pruning_migration_completed absent
  -> seedArchiveFromHistory(workflow_history) -> FIFO prune -> clearTransientFields
  -> set pruning_migration_completed = true
  -> writeState
```

**Test coverage**: INT-06, INT-07, SAH-01 through SAH-11

### 7.4 Path D: Enforcer Re-Trigger Guard

```
enforcer writeState triggers PostToolUse -> enforcer runs again
  -> readState -> guard: lastEntry already has snapshots + metrics
  -> early return { decision: 'allow' }
  -> no infinite loop, no duplicate archive
```

**Test coverage**: ENF-07, ATA-04

---

## 8. Test Commands

All tests use the project's existing test runner configuration:

```bash
# Run all new test files
node --test src/claude/hooks/tests/prune-functions.test.cjs
node --test src/claude/hooks/tests/archive-functions.test.cjs
node --test src/claude/hooks/tests/archive-integration.test.cjs
node --test src/claude/hooks/tests/workflow-completion-enforcer-archive.test.cjs

# Run all tests for this feature
node --test src/claude/hooks/tests/prune-functions.test.cjs src/claude/hooks/tests/archive-functions.test.cjs src/claude/hooks/tests/archive-integration.test.cjs src/claude/hooks/tests/workflow-completion-enforcer-archive.test.cjs

# Run full regression suite (existing + new)
node --test src/claude/hooks/tests/*.test.cjs
```

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Existing prune functions have undiscovered bugs | MEDIUM | HIGH | Backfill tests (PF-01 through PF-18) run first to establish baseline |
| Monorepo path tests fail on CI due to OS differences | LOW | MEDIUM | Use `path.join()` in assertions, never hardcoded path separators |
| Performance tests flaky on slow CI runners | MEDIUM | LOW | Tag with skip on known-slow environments; use p95 not p50 |
| Enforcer subprocess tests slow | LOW | LOW | 5-second timeout per test; tests are independent, can run in parallel |
| Archive file corruption between test runs | LOW | MEDIUM | Each test uses its own temp directory; `afterEach` cleanup |

---

## 10. Phase Gate Checklist (GATE-05)

- [x] Test strategy covers unit, integration, E2E (subprocess), security (fail-open), performance
- [x] Test cases exist for all in-scope requirements (FR-002 through FR-005, FR-009 through FR-011, FR-014, FR-015)
- [x] Traceability matrix complete (100% requirement coverage for in-scope FRs and all NFRs)
- [x] Coverage targets defined (100% line coverage per Article II)
- [x] Test data strategy documented (fixtures, boundaries, invalid inputs, max-size inputs)
- [x] Critical paths identified (4 paths: normal, fail-open, migration, re-trigger guard)
- [x] Existing infrastructure reused (node:test, .test.cjs, temp dir pattern, subprocess hook testing)
- [x] No external test frameworks introduced (Article II.3)
- [x] Deferred items documented (FR-007, FR-008, FR-012)
