# Error Handling & Validation: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Phase**: 04-design (ANALYSIS MODE)
**Designer**: Jordan Park (System Designer)
**Date**: 2026-02-21
**Traces to**: NFR-001, NFR-007, FR-003, FR-004, FR-005, FR-010, FR-011, FR-013, FR-014, FR-015

---

## 1. Design Principle: Fail-Open Everywhere

Every error in this feature MUST be fail-open. The absolute invariant:

> **No error in pruning, clearing, or archiving shall ever block workflow completion.**

This principle traces to NFR-001 ("Must not break existing workflow") and NFR-007 ("Archive failures must be fail-open"). It is enforced structurally through try/catch placement and return value conventions:

- Functions that can fail return `void` (no success/failure signal to caller)
- Functions that mutate state return the input unchanged on error
- Every call site wraps archive operations in dedicated try/catch blocks
- The enforcer's top-level try/catch (line 64) catches anything that leaks through

**Correction from interface-spec.md**: The debug log environment variable is `SKILL_VALIDATOR_DEBUG=true` (not `ISDLC_DEBUG=1`). Debug messages go to stderr via `console.error('[skill-validator]', ...)`.

---

## 2. Error Taxonomy

### 2.1 Error Classification

| Code | Category | Severity | Recovery Strategy |
|------|----------|----------|-------------------|
| E-001 | Filesystem Read | Warning | Create fresh / return null |
| E-002 | Filesystem Write | Warning | Log and return void |
| E-003 | JSON Parse | Warning | Discard corrupt data, create fresh |
| E-004 | Missing Input | Info | Return input unchanged / skip |
| E-005 | Type Mismatch | Info | Guard clause, return early |
| E-006 | Duplicate Detection | Info | Skip (normal dedup behavior) |
| E-007 | Directory Missing | Recoverable | Create with recursive mkdir |
| E-008 | Transform Failure | Warning | Skip entry, continue with next |
| E-009 | Top-Level Unexpected | Critical | Catch-all, log, return allow |

### 2.2 Error Matrix by Function

#### resolveArchivePath(projectId?)

| ID | Error Condition | Trigger | Recovery | Impact | Test Case |
|----|----------------|---------|----------|--------|-----------|
| E-004-RAP | projectId is falsy | `resolveArchivePath('')` | Falls through to single-project default | None. Correct behavior. | RAP-4 |
| -- | getProjectRoot() fails | Corrupted filesystem | getProjectRoot falls back to cwd | Archive in wrong directory (unlikely) | RAP-5 |

**Error count**: 0 throwable errors. This function cannot fail in a way that needs handling.

#### clearTransientFields(state)

| ID | Error Condition | Trigger | Recovery | Impact | Test Case |
|----|----------------|---------|----------|--------|-----------|
| E-004-CTF | state is null/undefined/falsy | `clearTransientFields(null)` | Return input unchanged | None. Caller proceeds. | CTF-2, CTF-3 |
| E-005-CTF | state is truthy non-object | `clearTransientFields(42)` | Falsy check passes, property assignment on number is silent no-op | No fields cleared, but no throw either | CTF-8 |

**Error count**: 0 throwable errors. This function cannot throw (all operations are property assignment).

#### appendToArchive(record, projectId?)

| ID | Error Condition | Trigger | Recovery | Impact | Test Case |
|----|----------------|---------|----------|--------|-----------|
| E-007-ATA | Archive directory missing | First use in monorepo | `fs.mkdirSync(dir, { recursive: true })` | None. Self-healing. | ATA-11 |
| E-001-ATA-1 | Archive file does not exist | First workflow ever | Create fresh: `{ version: 1, records: [], index: {} }` | None. Expected path. | ATA-1 |
| E-003-ATA | Archive file contains invalid JSON | Manual edit, partial write, disk corruption | Log warning, create fresh archive | **Previous archive records lost.** | ATA-6 |
| E-001-ATA-2 | fs.readFileSync throws (not ENOENT) | Permissions, IO error | Caught at inner try/catch, archive = null, create fresh | **Previous archive records lost.** | ATA-12 |
| E-005-ATA-1 | Loaded archive has no records array | Malformed file: `{ version: 1 }` | Detected by `!Array.isArray(archive.records)`, create fresh | **Previous archive records lost.** | ATA-13 |
| E-006-ATA | Duplicate record detected | Enforcer re-trigger, or migration re-run | Skip append, log info | None. Dedup working correctly. | ATA-4 |
| E-005-ATA-2 | archive.index is not an object | Corrupt index | Reset to `{}`, rebuild for this record only | Existing index entries lost. Future lookups may miss old records. | ATA-14 |
| E-002-ATA | fs.writeFileSync throws | Disk full, permissions, read-only FS | Caught at top-level try/catch, log warning, return void | **Record not persisted. Silent data loss.** | ATA-7 |
| E-007-ATA-2 | fs.mkdirSync throws | Permissions on parent | Caught at top-level try/catch | Record not persisted. | ATA-15 |
| E-004-ATA | record is null/undefined | Bug in caller | Property access throws TypeError, caught at top-level | Record not persisted. Logged. | ATA-16 |
| E-005-ATA-3 | record.slug or record.completed_at is undefined | Incomplete record from caller | Dedup comparison uses `undefined === undefined` (could match incorrectly) | See Section 3.2 | ATA-17 |

**Error count**: 11 conditions. All caught. None thrown to caller.

#### seedArchiveFromHistory(workflowHistory, projectId?)

| ID | Error Condition | Trigger | Recovery | Impact | Test Case |
|----|----------------|---------|----------|--------|-----------|
| E-004-SAH-1 | workflowHistory is null | `seedArchiveFromHistory(null)` | Guard: return immediately | None. | SAH-7 |
| E-004-SAH-2 | workflowHistory is undefined | `seedArchiveFromHistory(undefined)` | Guard: `!Array.isArray()` return | None. | SAH-7 |
| E-005-SAH | workflowHistory is not an array | `seedArchiveFromHistory('string')` | Guard: `!Array.isArray()` return | None. | SAH-8 |
| E-004-SAH-3 | workflowHistory is empty array | `seedArchiveFromHistory([])` | Guard: `.length === 0` return | None. | SAH-6 |
| E-004-SAH-4 | Entry has no completed_at or cancelled_at | Legacy entry with no timestamp | Skip entry, increment counter | Entry not archived. Acceptable (no meaningful timestamp). | SAH-4 |
| E-008-SAH | Entry throws during transformation | Null entry, missing nested field | Per-entry try/catch, log, skip, continue | Single entry lost. Others proceed. | SAH-5 |
| E-005-SAH-2 | entry.git_branch is not an object | `entry.git_branch = 'string'` | Optional chain `?.name` returns undefined -> branch: null | None. Degraded data. | SAH-9 |
| E-005-SAH-3 | entry.phase_snapshots is not an array | `entry.phase_snapshots = {}` | `_compactPhaseSnapshots` guard returns `[]` | phase_summary is empty. Acceptable. | SAH-10 |

**Error count**: 8 conditions. All handled. None thrown to caller.

#### Enforcer Integration (archive block in workflow-completion-enforcer.cjs)

| ID | Error Condition | Trigger | Recovery | Impact | Test Case |
|----|----------------|---------|----------|--------|-----------|
| E-004-ENF-1 | workflow_history is empty or missing | Edge case: no workflow_history after init | Guard at line 105-106 returns early before reaching archive block | No archive, no prune. | ENF-9 |
| E-004-ENF-2 | lastEntry is null/undefined | Empty array (length check passed but entry undefined) | Guard at line 111-113 returns early | No archive, no prune. | ENF-10 |
| E-008-ENF | Error constructing archiveRecord | Missing fields on lastEntry | Dedicated try/catch around archive block | writeState still runs. | ENF-6 |
| E-002-ENF | appendToArchive throws (hypothetical, should not happen) | Bug in appendToArchive bypasses its own catch | Caught by archive block try/catch | writeState still runs. | ENF-6 |
| E-009-ENF | Any unexpected error in check() | OOM, stack overflow, unknown bug | Top-level try/catch at line 64/242 | Returns `{ decision: 'allow' }`. Workflow unblocked. | ENF-11 |

**Error count**: 5 conditions. All caught. Hook always returns allow.

#### Migration Path (orchestrator init)

| ID | Error Condition | Trigger | Recovery | Impact | Test Case |
|----|----------------|---------|----------|--------|-----------|
| E-004-MIG-1 | state.workflow_history is undefined | Fresh state, never had a workflow | seedArchiveFromHistory guard returns immediately | None. Nothing to migrate. | MIG-1 |
| E-008-MIG | seedArchiveFromHistory errors on some entries | Corrupt legacy entries | Per-entry skip-and-continue in seedArchiveFromHistory | Some entries not archived. Logged. | MIG-2 |
| E-002-MIG | appendToArchive fails during seed | Filesystem error during migration | seedArchiveFromHistory continues with next entry | Some entries not archived. | MIG-3 |
| E-004-MIG-2 | pruning_migration_completed already true | Re-run (idempotent) | Flag check, skip entire migration | None. Correct behavior. | MIG-4 |

**Error count**: 4 conditions. All handled by existing function-level error handling.

---

## 3. Error Scenarios Deep Dive

### 3.1 Corrupt Archive Recovery (E-003-ATA)

This is the highest-impact error: previous archive records are lost when the file contains invalid JSON.

**Trigger scenarios**:
- Process killed mid-write (partial JSON on disk)
- Manual user edit introduces syntax error
- Disk corruption

**What happens**:
```
1. appendToArchive reads file -> fs.readFileSync returns corrupt content
2. JSON.parse throws SyntaxError
3. Inner catch: debugLog('appendToArchive: corrupt archive file, creating fresh: SyntaxError: ...')
4. archive = null
5. Outer code: !archive -> archive = { version: 1, records: [], index: {} }
6. New record appended to fresh archive
7. fs.writeFileSync overwrites corrupt file with valid archive containing only the new record
```

**Data loss**: All previous records and the entire index. The new record is saved.

**Mitigation options considered**:
1. **Backup before overwrite** -- Write `state-archive.json.bak` before creating fresh. REJECTED: adds filesystem I/O to every corrupt recovery, and the backup itself could be corrupt.
2. **Append to a .jsonl fallback** -- On parse error, append the new record as a single JSON line to `state-archive.jsonl`. REJECTED: introduces a second format and a recovery tool.
3. **Accept the loss** -- SELECTED. The archive is a convenience store, not a source of truth. GitHub issues and BACKLOG.md are the authoritative record. Silent data loss is acceptable per NFR-007.

### 3.2 Dedup Edge Case: Undefined Fields (E-005-ATA-3)

When `record.slug` and `record.completed_at` are both undefined, the dedup check becomes:
```javascript
lastRecord.slug === record.slug           // undefined === undefined -> true
lastRecord.completed_at === record.completed_at  // undefined === undefined -> true
```

This means two consecutive records with undefined slug AND undefined completed_at will be deduped (second one skipped).

**Impact**: Minimal. Records without `completed_at` are skipped by `seedArchiveFromHistory` before they reach `appendToArchive`. The enforcer always provides a `completed_at` (fallback: `new Date().toISOString()`). The only path that could hit this is a direct `appendToArchive` call with a malformed record -- a bug, not a normal condition.

**Decision**: Accept. Documenting as a known edge case. No code change needed.

### 3.3 Partial Write Crash (E-002-ATA timing)

If the process is killed between `appendToArchive`'s `writeFileSync` and the enforcer's `writeState`:

```
appendToArchive(record)  -> state-archive.json written (SUCCESS)
--- PROCESS KILLED ---
writeState(state)        -> NEVER RUNS

Result:
  state-archive.json: has the new record (good)
  state.json: still has stale transient fields (bad, but not corrupt)

On next workflow start:
  Orchestrator init reads state.json
  active_workflow is null (orchestrator finalize already cleared it)
  Transient fields are stale but non-blocking
  Enforcer re-fires on next state.json write
  Prune + clear runs again (idempotent)
  appendToArchive dedup catches the already-archived record
```

**Conclusion**: Self-healing. No data loss. Transient fields persist one extra workflow but get cleaned on next enforcer fire.

### 3.4 Reverse Crash: State Written, Archive Not

If the process is killed BEFORE `appendToArchive` but AFTER a hypothetical reordering (which our design prevents):

**This cannot happen with our design.** The ordering constraint (archive BEFORE state write) ensures that if state.json is updated, the archive was already attempted. The enforcer sequence is:

```
clearTransientFields(state)   -- in-memory only
appendToArchive(archiveRecord) -- writes to disk
writeState(state)              -- writes to disk
```

If the process dies after `clearTransientFields` but before `appendToArchive`:
- state.json is untouched (still has the stale version from orchestrator)
- state-archive.json is untouched
- On next enforcer fire: entire prune+clear+archive sequence runs again

---

## 4. Error Boundary Architecture

### 4.1 Three-Layer Defense Model

```
Layer 3 (outermost): Enforcer top-level try/catch
  |
  |  Catches: ANY uncaught error from anywhere in check()
  |  Recovery: return { decision: 'allow', stateModified: false }
  |  Scope: lines 64-245 of workflow-completion-enforcer.cjs
  |
  +-- Layer 2 (archive block): Dedicated archive try/catch
  |     |
  |     |  Catches: errors in archiveRecord construction or appendToArchive call
  |     |  Recovery: debugLog, continue to writeState
  |     |  Scope: NEW block inserted between clearTransientFields and writeState
  |     |
  |     +-- Layer 1 (innermost): appendToArchive internal try/catch
  |           |
  |           |  Catches: fs errors, JSON parse errors, property access errors
  |           |  Recovery: debugLog, return void
  |           |  Scope: entire appendToArchive function body
  |           |
  |           +-- Layer 0 (parse recovery): JSON.parse try/catch
  |                 |
  |                 |  Catches: SyntaxError from corrupt archive file
  |                 |  Recovery: archive = null (triggers fresh creation)
  |                 |  Scope: fs.readFileSync + JSON.parse inside appendToArchive
```

### 4.2 Error Flow Through Layers

| Error Origin | Caught At | Leaks To | writeState Runs? |
|-------------|-----------|----------|------------------|
| JSON.parse in appendToArchive | Layer 0 | No | Yes |
| fs.writeFileSync in appendToArchive | Layer 1 | No | Yes |
| fs.mkdirSync in appendToArchive | Layer 1 | No | Yes |
| record.slug property access | Layer 1 (TypeError) | No | Yes |
| archiveRecord construction (enforcer) | Layer 2 | No | Yes |
| appendToArchive itself throws (bypasses its own catch) | Layer 2 | No | Yes |
| clearTransientFields (cannot throw, but hypothetically) | Layer 3 | No | Yes (in catch handler, the enforcer returns allow but writeState may not run) |
| readState returns null | Guard, early return | No | No (early return before prune/archive block) |
| collectPhaseSnapshots throws | Layer 3 | No | No (but returns allow) |
| pruneSkillUsageLog throws (cannot, but hypothetically) | Layer 3 | No | No (but returns allow) |
| writeState itself throws | Layer 3 | No | N/A (is the failing call) |

### 4.3 Key Invariant

From the table above: **every row shows writeState either runs successfully or the enforcer returns `{ decision: 'allow' }`**. There is no path where the enforcer blocks.

---

## 5. Input Validation Rules

### 5.1 Validation by Boundary

| Boundary | What Is Validated | What Is NOT Validated | Why |
|----------|-------------------|----------------------|-----|
| `clearTransientFields` entry | `!state` (falsy check) | state type, field existence | Pure assignment; missing fields get created, extra fields ignored |
| `appendToArchive` entry | Archive file structure on read: `!archive \|\| !Array.isArray(archive.records)` | Record shape, field types, required fields | Fail-open: malformed record > lost record |
| `appendToArchive` dedup | `lastRecord.slug === record.slug && lastRecord.completed_at === record.completed_at` | No normalization (case, whitespace, timezone) | Strict equality is sufficient for records we construct |
| `appendToArchive` index | `typeof archive.index !== 'object'` (reset if broken) | Index key format, position validity | Self-healing on write; deferred lookupArchive can validate on read |
| `seedArchiveFromHistory` entry | `Array.isArray(workflowHistory)`, `.length === 0`, `!record.completed_at` per entry | Entry shape, field types, nested object types | Per-entry try/catch handles anything unexpected |
| Enforcer guard chain | 5 guards before reaching prune/archive block (active_workflow, workflow_history, lastEntry, staleness, completeness) | No validation on prune function inputs | Prune functions have their own guards (`!Array.isArray` checks) |

### 5.2 Validation We Explicitly Chose NOT to Add

| Validation | Why Rejected | Risk If Absent |
|-----------|-------------|----------------|
| Archive record JSON Schema validation | Adds complexity and I/O; fail-open means we accept partial data | Malformed records stored but still queryable by index |
| `completed_at` format check (ISO-8601) | Single-caller context; enforcer always provides valid timestamp | Invalid timestamp stored; sort order in future lookupArchive may be wrong |
| `outcome` enum check | Three callers all use hardcoded string literals | Invalid outcome stored; cosmetic issue only |
| `state_version` check on archive | Archive has no concurrency control by design | N/A -- there is no concurrent access to the archive |
| Max archive size check | No cap requirement; append-only by design | Archive grows without bound. At ~500 bytes/record and 1 workflow/day, reaches 1MB in ~5 years. |
| `source_id`/`slug` format validation | Both are free-form strings from existing state.json | Index keys may be unexpected strings; lookupArchive handles this |

---

## 6. Debug Observability

### 6.1 Debug Log Catalog

All messages emitted via `debugLog()` -> `console.error('[skill-validator]', ...)` when `SKILL_VALIDATOR_DEBUG=true`.

| Function | Message | Condition | Severity |
|----------|---------|-----------|----------|
| `appendToArchive` | `'appendToArchive: corrupt archive file, creating fresh: {err.message}'` | JSON.parse fails on existing file | WARNING |
| `appendToArchive` | `'appendToArchive: duplicate detected, skipping'` | Dedup check matches last record | INFO |
| `appendToArchive` | `'appendToArchive: error: {err.message}'` | Any top-level catch | WARNING |
| `seedArchiveFromHistory` | `'seedArchiveFromHistory: skipping entry: {err.message}'` | Per-entry transform/append fails | WARNING |
| `seedArchiveFromHistory` | `'seedArchiveFromHistory: seeded {n}, skipped {m}'` | At least one entry skipped | INFO |
| `workflow-completion-enforcer` | `'workflow-completion-enforcer: archive error: {err.message}'` | Archive block catch | WARNING |
| `workflow-completion-enforcer` | `'workflow-completion-enforcer: error: {err.message}'` | Top-level catch | ERROR |
| `workflow-completion-enforcer` | `'workflow-completion-enforcer: entry is stale, skipping'` | Staleness guard | INFO |
| `workflow-completion-enforcer` | `'workflow-completion-enforcer: auto-remediating missing snapshots/metrics'` | Self-heal triggered | INFO |

### 6.2 Debugging a Failed Archive Write

When `SKILL_VALIDATOR_DEBUG=true`, a failed archive write produces this stderr sequence:

```
[skill-validator] workflow-completion-enforcer: auto-remediating missing snapshots/metrics
[skill-validator] appendToArchive: error: EACCES: permission denied, open '/path/state-archive.json'
[skill-validator] workflow-completion-enforcer: archive error: EACCES: permission denied, open '/path/state-archive.json'
```

The double logging (once in appendToArchive Layer 1, once in enforcer Layer 2) is intentional. Layer 1 logs the specific filesystem error. Layer 2 logs that the archive block failed. Without debug mode, both are silent.

### 6.3 No User-Visible Error Messages

Per CON-003 (hook protocol): hooks produce NO stdout output. All error communication is via:
- stderr debug log (visible only with `SKILL_VALIDATOR_DEBUG=true`)
- `logHookEvent()` entries (written to state.json `hook_activity_log`)
- Return value `{ decision: 'allow' }` (always allow, never block)

The user never sees an error message from pruning or archiving. This is by design.

---

## 7. Recovery Scenarios

### 7.1 Recovery Matrix

| Scenario | Automatic Recovery? | Manual Recovery? | Data Impact |
|----------|--------------------|--------------------|-------------|
| Archive file missing | Yes (created on next append) | N/A | None (expected first-use) |
| Archive file corrupt | Yes (replaced with fresh on next append) | Restore from backup if available | Previous records lost |
| Archive file permissions denied | No (logged, skipped) | `chmod` the file | Records not persisted until fixed |
| state.json has stale transient fields | Yes (enforcer clears on next fire) | N/A | Fields persist one extra cycle |
| Migration ran twice | Yes (dedup in appendToArchive) | N/A | No duplicates |
| Process killed mid-prune | Yes (enforcer re-fires, prune is idempotent) | N/A | None |
| Process killed mid-archive-write | Partial: archive may be corrupt | Delete corrupt file; fresh created on next workflow | Previous records lost |
| Disk full | No (both writes fail) | Free disk space | Neither file updated |
| monorepo project dir missing | Yes (mkdirSync with recursive) | N/A | None |

### 7.2 The "Everything Fails" Scenario

What happens when every new operation fails on a given workflow completion?

```
1. clearTransientFields(state)     -- SUCCEEDS (pure function, cannot fail)
2. appendToArchive(archiveRecord)  -- FAILS (e.g., disk full)
   -> debugLog, return void
3. writeState(state)               -- FAILS (disk full)
   -> returns false (ignored by enforcer)
4. Enforcer returns { decision: 'allow', stateModified: false }

Result:
  - state.json: still has stale transient fields (writeState failed)
  - state-archive.json: record not persisted
  - Workflow: NOT BLOCKED. User continues normally.
  - On next disk-available state.json write: enforcer re-fires
  - Staleness guard (2 min): if within 2 min, prune+archive retried
  - If past 2 min: stale entry, skipped. Transient fields remain until next workflow.
```

**Worst case**: Transient fields persist and archive record is lost. The user's workflow is never blocked. The next workflow init's `clearTransientFields` (via enforcer or orchestrator) cleans up.

---

## 8. Error Handling Test Requirements

### 8.1 Required Error Path Tests

Each error in the taxonomy (Section 2.2) that results in a recovery action MUST have a corresponding test. Tests verify both the recovery behavior AND that the error does not propagate.

| Test ID | Error ID | Test Description | Assertion |
|---------|----------|------------------|-----------|
| ATA-E-001 | E-001-ATA-1 | appendToArchive with no existing file | Creates fresh archive, record appended |
| ATA-E-003 | E-003-ATA | appendToArchive with corrupt JSON file | Fresh archive created, warning logged |
| ATA-E-002 | E-002-ATA | appendToArchive with writeFileSync throwing | No throw, warning logged, returns void |
| ATA-E-005 | E-005-ATA-1 | appendToArchive with archive missing records array | Fresh archive created |
| ATA-E-006 | E-006-ATA | appendToArchive with duplicate record | Skip logged, records.length unchanged |
| ATA-E-007 | E-007-ATA | appendToArchive with missing directory | mkdirSync called, record appended |
| ATA-E-004 | E-004-ATA | appendToArchive with null record | No throw, error logged |
| SAH-E-004 | E-004-SAH-1 | seedArchiveFromHistory with null | Returns immediately, no appendToArchive calls |
| SAH-E-008 | E-008-SAH | seedArchiveFromHistory with one bad entry | Bad entry skipped, others seeded |
| SAH-E-TS | E-004-SAH-4 | seedArchiveFromHistory with entry missing timestamp | Entry skipped, others seeded |
| CTF-E-004 | E-004-CTF | clearTransientFields with null | Returns null, no throw |
| ENF-E-008 | E-008-ENF | Enforcer archive block throws | writeState still called |
| ENF-E-009 | E-009-ENF | Enforcer top-level error | Returns { decision: 'allow' } |

### 8.2 Integration Error Tests

| Test ID | Scenario | Setup | Assertion |
|---------|----------|-------|-----------|
| INT-E-001 | Full enforcer flow with archive write failure | Mock appendToArchive to throw | writeState called, returns allow |
| INT-E-002 | Full enforcer flow with writeState failure | Mock writeState to return false | Returns allow (enforcer ignores writeState return) |
| INT-E-003 | Migration with mixed good/bad entries | 3 entries: 1 good, 1 no timestamp, 1 throws | 1 archived, 2 skipped, flag set |

---

## Metadata

- **Step**: 04-04 (Error Handling & Validation)
- **Depth**: standard
- **Persona**: Jordan Park (System Designer)
- **Traces**: NFR-001, NFR-007, FR-003, FR-005, FR-010, FR-011, FR-013, FR-014, FR-015
- **Dependencies**: module-design-common-cjs.md, module-design-enforcer.md, interface-spec.md, data-flow.md
- **Correction**: interface-spec.md Section 5.3 states `ISDLC_DEBUG=1` -- actual env var is `SKILL_VALIDATOR_DEBUG=true`
