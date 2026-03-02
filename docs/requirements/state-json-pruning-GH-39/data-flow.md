# Data Flow & State Management: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Phase**: 04-design (ANALYSIS MODE)
**Designer**: Jordan Park (System Designer)
**Date**: 2026-02-21
**Traces to**: FR-001 through FR-015, NFR-001 through NFR-010

---

## 1. Data Flow Overview

Four distinct runtime data flow paths exist for the archive-and-prune feature. Each has a different trigger, different entry point, and different data transformations. All four share the same two output sinks: state.json (hot) and state-archive.json (cold).

| Path | Trigger | Entry Point | Writes state.json? | Writes state-archive.json? |
|------|---------|-------------|--------------------|-----------------------------|
| A: Completed/Cancelled | Orchestrator finalize writes state.json | Enforcer `check()` | Yes | Yes |
| B: Abandoned | User starts new workflow while old one exists | Orchestrator init | Yes (via normal init) | Yes |
| C: Migration | First workflow init after deployment | Orchestrator init | Yes (via normal init) | Yes |
| D: Re-trigger | Enforcer's own writeState triggers PostToolUse | Enforcer `check()` | No (early return) | No (early return) |

---

## 2. Path A: Completed/Cancelled Workflow (Primary Path)

**FR Trace**: FR-001, FR-003, FR-004, FR-005, FR-010, FR-011, FR-015
**Trigger**: PostToolUse event after orchestrator MODE: finalize writes state.json

### 2.1 Sequence Diagram

```
  Orchestrator (finalize)          Hook Dispatcher           Enforcer (check)              common.cjs                    Filesystem
  ========================         ===============           ================              ==========                    ==========
         |                                |                         |                           |                            |
  1. collectPhaseSnapshots()              |                         |                           |                            |
  2. prune (old defaults)                 |                         |                           |                            |
  3. move to workflow_history             |                         |                           |                            |
  4. active_workflow = null               |                         |                           |                            |
  5. writeState(state) ------------------>|                         |                           |                            |
         |                                |                         |                           |                       [state.json v(N)]
         |                         PostToolUse                      |                           |                            |
         |                         dispatched ---------------------->                           |                            |
         |                                |                  6. readState() ------------------->|                            |
         |                                |                         |                           |--- fs.readFileSync ------->|
         |                                |                         |                           |<-- state object -----------|
         |                                |                         |<--- state ----------------|                            |
         |                                |                         |                           |                            |
         |                                |                  7. Guard checks:                   |                            |
         |                                |                     active_workflow === null? YES    |                            |
         |                                |                     workflow_history exists?  YES    |                            |
         |                                |                     lastEntry < 2 min?       YES    |                            |
         |                                |                     has snapshots+metrics?   NO     |                            |
         |                                |                         |                           |                            |
         |                                |                  8. Self-heal:                      |                            |
         |                                |                     temp active_workflow             |                            |
         |                                |                     collectPhaseSnapshots() ------->|                            |
         |                                |                     patch lastEntry                 |                            |
         |                                |                     restore active_workflow=null     |                            |
         |                                |                         |                           |                            |
         |                                |                  9. Regression check (existing)     |                            |
         |                                |                         |                           |                            |
         |                                |                 10. PRUNE SEQUENCE:                 |                            |
         |                                |                     pruneSkillUsageLog(state,50) -->|                            |
         |                                |                     pruneCompletedPhases(state,[])->|                            |
         |                                |                     pruneHistory(state,100,200) --->|                            |
         |                                |                     pruneWorkflowHistory(state,50)->|                            |
         |                                |                         |                           |                            |
         |                                |                 11. clearTransientFields(state) --->|  [NEW]                     |
         |                                |                         |<-- state (mutated) -------|                            |
         |                                |                         |                           |                            |
         |                                |                 12. Build archiveRecord from        |                            |
         |                                |                     workflow_history[last]           |                            |
         |                                |                         |                           |                            |
         |                                |                 13. appendToArchive(record) ------->|  [NEW]                     |
         |                                |                         |                           |--- resolveArchivePath() -->|
         |                                |                         |                           |--- fs.readFileSync ------->|
         |                                |                         |                           |<-- archive or null --------|
         |                                |                         |                           |--- dedup check             |
         |                                |                         |                           |--- append + index          |
         |                                |                         |                           |--- fs.writeFileSync ------>|
         |                                |                         |                           |                       [state-archive.json]
         |                                |                         |<-- void ------------------|                            |
         |                                |                         |                           |                            |
         |                                |                 14. writeState(state) ------------->|                            |
         |                                |                         |                           |--- read disk version ----->|
         |                                |                         |                           |--- version N+1             |
         |                                |                         |                           |--- fs.writeFileSync ------>|
         |                                |                         |                           |                       [state.json v(N+1)]
         |                                |                         |<-- true ------------------|                            |
         |                                |                         |                           |                            |
         |                                |                 15. logHookEvent, notification      |                            |
         |                                |                         |                           |                            |
         |                                |                  return { allow, stateModified:false }                           |
```

### 2.2 Data Transformations (Path A)

| Step | Input | Transform | Output |
|------|-------|-----------|--------|
| 8. Self-heal | state (missing snapshots) | collectPhaseSnapshots() | lastEntry patched with phase_snapshots, metrics |
| 10. Prune | state.skill_usage_log (N entries) | FIFO slice to 50 | state.skill_usage_log (min(N,50) entries) |
| 10. Prune | state.history (N entries) | FIFO slice to 100, truncate to 200 chars | state.history (min(N,100) entries) |
| 10. Prune | state.workflow_history (N entries) | FIFO slice to 50, compact git_branch | state.workflow_history (min(N,50) entries) |
| 10. Prune | state.phases (completed phases) | Remove completed, add _pruned_at | state.phases (active only) |
| 11. Clear | state (6 transient fields) | Reset to null/{}/[] | state (clean transient state) |
| 12. Build | workflow_history[last] | Transform to archive record | archiveRecord (compact) |
| 13. Archive | archiveRecord + existing archive | Append + index update | state-archive.json (updated) |
| 14. Write | state (pruned, cleared) | state_version++ | state.json (lean, incremented version) |

### 2.3 State Transitions (Path A)

**state.json transitions**:

```
BEFORE (orchestrator finalize write):
  active_workflow: null
  workflow_history: [...entries, lastEntry(patched by orch)]
  current_phase: "07-merge"          <-- stale
  active_agent: "merge-manager"      <-- stale
  phases: { "07-merge": {...} }      <-- stale
  skill_usage_log: [22 entries]
  history: [46 entries]
  state_version: N

AFTER (enforcer write):
  active_workflow: null
  workflow_history: [...entries, lastEntry(patched by enforcer)]  <-- re-patched
  current_phase: null                <-- cleared
  active_agent: null                 <-- cleared
  phases: {}                         <-- cleared
  blockers: []                       <-- cleared
  pending_escalations: []            <-- cleared
  pending_delegation: null           <-- cleared
  skill_usage_log: [min(22,50) entries]  <-- pruned
  history: [min(46,100) entries]         <-- pruned
  state_version: N+1                 <-- incremented by writeState
```

**state-archive.json transitions**:

```
BEFORE:
  { version: 1, records: [R0, R1, ...Rn], index: {...} }

AFTER:
  { version: 1, records: [R0, R1, ...Rn, Rnew], index: {..., source_id: [..., n+1], slug: [..., n+1]} }
```

---

## 3. Path B: Abandoned Workflow (Orchestrator Init)

**FR Trace**: FR-013, FR-003, FR-011, FR-015
**Trigger**: User starts new workflow (`/isdlc feature`) while `active_workflow` is non-null from a prior session

### 3.1 Sequence Diagram

```
  User                    Orchestrator (init)             common.cjs                    Filesystem
  ====                    ====================            ==========                    ==========
    |                            |                            |                            |
  /isdlc feature -------------->|                            |                            |
    |                     1. readState() ------------------->|                            |
    |                            |                            |--- fs.readFileSync ------->|
    |                            |                            |<-- state ------------------|
    |                            |<--- state ----------------|                            |
    |                            |                            |                            |
    |                     2. Check: active_workflow !== null  |                            |
    |                        (orphaned workflow detected)     |                            |
    |                            |                            |                            |
    |                     3. Build abandoned record:          |                            |
    |                        source_id from active_workflow   |                            |
    |                        outcome: "abandoned"             |                            |
    |                        completed_at: now                |                            |
    |                        phase_summary from phases{}      |                            |
    |                            |                            |                            |
    |                     4. appendToArchive(record) -------->|                            |
    |                            |                            |--- resolve, read, append -->|
    |                            |                            |                       [state-archive.json]
    |                            |<--- void ------------------|                            |
    |                            |                            |                            |
    |                     5. clearTransientFields(state) ---->|                            |
    |                            |<--- state (cleared) -------|                            |
    |                            |                            |                            |
    |  "Archived abandoned       |                            |                            |
    |   workflow for GH-XX" <----|                            |                            |
    |                            |                            |                            |
    |                     6. Continue normal init:            |                            |
    |                        active_workflow = new {...}      |                            |
    |                        writeState(state) -------------->|                            |
    |                            |                            |--- fs.writeFileSync ------>|
    |                            |                            |                       [state.json]
```

### 3.2 Data Transformations (Path B)

| Step | Input | Transform | Output |
|------|-------|-----------|--------|
| 3. Build record | active_workflow, phases{}, workflow_history | Extract source_id, phases, compute duration | archiveRecord (outcome: "abandoned") |
| 4. Archive | archiveRecord + existing archive | Append + index | state-archive.json (updated) |
| 5. Clear | state (6 transient fields) | Reset to null/{}/[] | state (clean for new workflow) |

### 3.3 Abandoned Record Construction

```javascript
// Orchestrator builds record from CURRENT state (not workflow_history)
const archiveRecord = {
    source_id: state.active_workflow.id || null,
    slug: state.active_workflow.artifact_folder || null,
    workflow_type: state.active_workflow.type || null,
    completed_at: new Date().toISOString(),          // NOW, not a historical timestamp
    branch: state.active_workflow.git_branch?.name || null,
    outcome: 'abandoned',                             // Always "abandoned"
    reason: null,                                     // No explicit reason
    phase_summary: Object.entries(state.phases || {}).map(([key, val]) => ({
        phase: key,
        status: 'abandoned',                          // All phases marked abandoned
        summary: val.summary || null
    })),
    metrics: {
        total_duration_minutes: state.active_workflow.started_at
            ? Math.round((Date.now() - new Date(state.active_workflow.started_at).getTime()) / 60000)
            : null
    }
};
```

---

## 4. Path C: One-Time Migration (Orchestrator Init)

**FR Trace**: FR-009, FR-014, FR-011, FR-015, FR-003, FR-004
**Trigger**: First workflow init after deployment when `state.pruning_migration_completed` is falsy

### 4.1 Sequence Diagram

```
  Orchestrator (init)             common.cjs                    Filesystem
  ====================            ==========                    ==========
         |                            |                            |
  1. readState() ------------------->|                            |
         |<--- state ----------------|                            |
         |                            |                            |
  2. Check: pruning_migration_completed?                           |
     FALSE -> run migration           |                            |
         |                            |                            |
  3. SEED FIRST (before prune!):      |                            |
     seedArchiveFromHistory(          |                            |
       state.workflow_history) ------>|                            |
         |                            |--- for each entry:         |
         |                            |    transform to record     |
         |                            |    appendToArchive(record) |
         |                            |      resolve, read,        |
         |                            |      dedup, append, write  |
         |                            |                       [state-archive.json x N writes]
         |<--- void ------------------|                            |
         |                            |                            |
  4. THEN PRUNE:                      |                            |
     pruneSkillUsageLog(state,50) --->|                            |
     pruneCompletedPhases(state,[]) ->|                            |
     pruneHistory(state,100,200) ---->|                            |
     pruneWorkflowHistory(state,50) ->|                            |
         |                            |                            |
  5. clearTransientFields(state) ---->|   (if active_workflow null) |
         |<--- state (cleaned) -------|                            |
         |                            |                            |
  6. state.pruning_migration_completed = true                      |
         |                            |                            |
  7. Continue normal init...          |                            |
     writeState(state) -------------->|                            |
         |                            |--- fs.writeFileSync ------>|
         |                            |                       [state.json]
```

### 4.2 Critical Ordering: Seed Before Prune

```
  workflow_history: [W1, W2, W3, ..., W18]   (18 entries, full data)
                          |
                 seedArchiveFromHistory()
                          |
                          v
  state-archive.json: [R1, R2, R3, ..., R18]  (18 archive records)
                          |
                 pruneWorkflowHistory(state, 50)
                          |
                          v
  workflow_history: [W1, W2, W3, ..., W18]   (18 < 50, no prune needed here)

  BUT if history had 60 entries:
  workflow_history: [W1, ..., W60]            (60 entries, full data)
                          |
                 seedArchiveFromHistory()     MUST happen FIRST
                          |
                          v
  state-archive.json: [R1, ..., R60]          (60 archive records, all seeded)
                          |
                 pruneWorkflowHistory(state, 50)
                          |
                          v
  workflow_history: [W11, ..., W60]           (50 entries, W1-W10 pruned from state)
                                              (but preserved in archive)
```

### 4.3 Idempotency Guard

```javascript
// Migration runs only once:
if (!state.pruning_migration_completed) {
    // ... seed + prune + clear ...
    state.pruning_migration_completed = true;
}

// If accidentally re-entered:
// - seedArchiveFromHistory calls appendToArchive for each entry
// - appendToArchive dedup: last record matches slug + completed_at -> skip
// - Prune functions are idempotent (FIFO on already-pruned data is no-op)
// - clearTransientFields is idempotent (null -> null, [] -> [])
// Result: safe, just wastes I/O on the dedup checks
```

---

## 5. Path D: Re-Trigger (Enforcer Self-Invocation)

**Trigger**: Enforcer's `writeState()` at step 14 (Path A) writes state.json, triggering PostToolUse, which dispatches the enforcer again.

### 5.1 Guard Evaluation on Re-Trigger

```
  Second Enforcer Invocation
  ==========================
         |
  1. readState() -> fresh state (just written by first invocation)
         |
  2. Guard: active_workflow === null?
     YES -> continue
         |
  3. Guard: workflow_history exists?
     YES -> continue
         |
  4. Guard: lastEntry < 2 min old?
     YES -> continue (same timestamp, still fresh)
         |
  5. Guard: has phase_snapshots AND metrics?
     *** YES *** -> first invocation already patched them
         |
  6. EARLY RETURN: { decision: 'allow', stateModified: false }
         |
     NO PRUNE. NO ARCHIVE. NO WRITE.
```

### 5.2 Defense-in-Depth (if guard 5 somehow fails)

```
  Hypothetical: guard 5 fails (should not happen)
  ===============================================
         |
  Self-heal: re-collects snapshots (idempotent)
  Prune: re-prunes (already pruned, no-op for FIFO)
  Clear: re-clears (already null/{}/[], idempotent)
         |
  Archive: appendToArchive(record)
     -> dedup check: last record has same slug + completed_at
     -> SKIP (duplicate detected)
     -> No file write
         |
  writeState: triggers THIRD invocation
     -> Same guards apply
     -> Eventually staleness threshold (2 min) expires
     -> All subsequent invocations return early
```

---

## 6. State Storage Model

### 6.1 File Locations

```
.isdlc/
  state.json                          # HOT: active workflow, transient + durable fields
  state-archive.json                  # COLD: append-only archive of completed workflows  [NEW]
  projects/                           # Monorepo mode
    {project-id}/
      state.json                      #   Per-project hot state
      state-archive.json              #   Per-project cold archive  [NEW]
```

### 6.2 State.json Lifecycle (Hot Store)

```
                      +------------------+
                      |   CLEAN STATE    |
                      |  active_workflow  |
                      |     = null       |
                      | transient fields |
                      |    = defaults    |
                      +--------+---------+
                               |
                  /isdlc feature|
                               v
                      +------------------+
                      |  ACTIVE WORKFLOW |
                      | active_workflow   |
                      |   = {...}        |
                      | current_phase    |
                      |   = "01-req"     |
                      | phases = {...}   |
                      +--------+---------+
                               |
              phase progression|  (multiple writes)
                               v
                      +------------------+
                      | WORKFLOW COMPLETE|
                      | active_workflow   |
                      |   = null         |
                      | workflow_history  |
                      |   += [entry]     |
                      | transient fields |
                      |   = STALE        |<-- orchestrator clears active_workflow
                      +--------+---------+    but leaves transient fields
                               |
                  enforcer fires|  (PostToolUse)
                               v
                      +------------------+
                      |  CLEAN STATE    |
                      | active_workflow   |
                      |   = null         |
                      | workflow_history  |
                      |   = pruned       |
                      | transient fields |
                      |   = defaults     |<-- clearTransientFields resets them
                      | state_version++  |
                      +------------------+
```

### 6.3 State-Archive.json Lifecycle (Cold Store)

```
                      +------------------+
                      |  FILE ABSENT     |
                      |  (pre-GH-39 or   |
                      |   first workflow) |
                      +--------+---------+
                               |
            first appendToArchive call
                               |
                               v
                      +------------------+
                      | INITIALIZED      |
                      | version: 1       |
                      | records: [R0]    |
                      | index: {id:[0]}  |
                      +--------+---------+
                               |
             subsequent appends|  (one per workflow completion)
                               v
                      +------------------+
                      | ACCUMULATING     |
                      | version: 1       |
                      | records: [R0..Rn]|
                      | index: {...}     |
                      +--------+---------+
                               |
                         (no cap, no prune,
                          no deletion ever)
```

### 6.4 Field Classification

**State.json fields after enforcer prune+clear**:

| Category | Fields | Lifecycle |
|----------|--------|-----------|
| **Durable** | `project_config`, `framework_version`, `state_version`, `counters`, `constitution`, `pruning_migration_completed` | Survive across all workflows. Never pruned. |
| **Capped (FIFO)** | `skill_usage_log` (50), `history` (100), `workflow_history` (50) | Oldest entries removed when cap exceeded. |
| **Transient (cleared)** | `current_phase`, `active_agent`, `phases`, `blockers`, `pending_escalations`, `pending_delegation` | Reset to null/{}/[] between workflows. |
| **Managed** | `active_workflow` | Set by orchestrator init, cleared by orchestrator finalize. |

---

## 7. I/O Characteristics

### 7.1 Synchronous I/O Model

All file operations use Node.js synchronous APIs. No async, no callbacks, no promises.

| Operation | API | Blocking? | Why Synchronous |
|-----------|-----|-----------|-----------------|
| Read state | `fs.readFileSync` | Yes | Hook protocol: check() must return synchronously |
| Write state | `fs.writeFileSync` | Yes | Atomic write semantics (no partial write visible) |
| Read archive | `fs.readFileSync` | Yes | Same hook context as state read |
| Write archive | `fs.writeFileSync` | Yes | Must complete before writeState for dedup safety |
| Create directory | `fs.mkdirSync` | Yes | Must exist before file write |
| Check existence | `fs.existsSync` | Yes | Gate for conditional read/create |

### 7.2 I/O Budget Per Path

| Path | Reads | Writes | Total I/O Calls |
|------|-------|--------|-----------------|
| A: Completed/Cancelled | 2 (state + archive) | 2 (archive + state) | 4 + existence checks |
| B: Abandoned | 1 (state, already loaded) + 1 (archive) | 2 (archive + state) | 4 + existence checks |
| C: Migration (N entries) | 1 (state) + N (archive per entry) | N (archive per entry) + 1 (state) | 2N + 2 + existence checks |
| D: Re-trigger | 1 (state) | 0 | 1 + existence checks |

### 7.3 Migration I/O Concern

Path C performs `2N` archive I/O operations (read + write per entry) for N workflow_history entries. With 18 current entries, this is 36 file operations -- acceptable. At 100 entries, it would be 200 operations. This is a one-time cost, not a recurring one.

**Optimization note (not implemented)**: A batched `seedArchiveFromHistory` could read the archive once, append all records, write once. This reduces I/O from 2N to 2. Deferred because: (a) it is one-time, (b) 18 entries is small, (c) the per-entry approach reuses `appendToArchive` dedup logic without special-casing.

---

## 8. Concurrency and Atomicity

### 8.1 No True Concurrency

Claude Code hooks run in a single-threaded Node.js process. There is no concurrent access to state.json or state-archive.json from multiple hook instances. The "concurrency" concern is re-triggering (Path D), not true parallelism.

### 8.2 Atomicity Guarantees

| Operation | Atomic? | Mechanism | Failure Mode |
|-----------|---------|-----------|--------------|
| `writeState` | Best-effort | `fs.writeFileSync` (OS-level write) | Partial write on process kill or disk full |
| `appendToArchive` | Best-effort | `fs.writeFileSync` (entire file) | Partial write on process kill or disk full |
| Read-modify-write cycle | NOT atomic | No file locking | Re-trigger path mitigated by dedup + guards |

### 8.3 Write Ordering

```
  appendToArchive(record)    <-- archive written to disk FIRST
         |
         v
  writeState(state)          <-- state written to disk SECOND
         |
         v
  PostToolUse re-trigger     <-- dedup finds record already in archive
```

This ordering ensures that if the process is killed between the two writes:
- Archive has the record (persisted)
- State.json has stale transient fields (not yet cleared)
- On next workflow init: orchestrator detects stale active_workflow = null + uncleaned fields
- Enforcer will re-fire on next state write and re-run prune+clear (idempotent)
- appendToArchive dedup prevents duplicate archive entry

---

## 9. Cross-Path Data Flow Summary

```
                            +-----------+
                            |   User    |
                            +-----+-----+
                                  |
                   +--------------+--------------+
                   |                              |
            /isdlc feature                  (workflow runs)
            /isdlc fix                            |
                   |                        orchestrator finalize
                   v                              |
            +------+-------+                      v
            | Orchestrator  |              +------+--------+
            |    (init)     |              | Orchestrator   |
            +------+-------+              |   (finalize)   |
                   |                       +------+---------+
          +--------+--------+                     |
          |                 |               writeState
     active_workflow   active_workflow            |
     === null          !== null             PostToolUse
     (clean)           (orphaned)                 |
          |                 |                     v
     Check migration   PATH B:             +-----+------+
     flag              Archive             | Enforcer    |
          |            abandoned            | (check)     |
     +----+----+       record              +-----+------+
     |         |           |                     |
  flag set  flag unset     v              +------+------+
  (skip)    (run)    clearTransient       |             |
              |        fields            has          missing
              v           |            snapshots    snapshots
        PATH C:           v            + metrics   (self-heal)
        Seed archive    Continue          |             |
        from history    with init       PATH D:       PATH A:
              |                        Early          Prune +
              v                        return         Clear +
        Prune state                      |            Archive
              |                          v               |
              v                       { allow }          v
        Set migration                                 writeState
        flag = true                                      |
              |                                    +-----+-----+
              v                                    |           |
        Continue init                          PATH D       { allow }
                                              (re-trigger,
                                               early return)
```

---

## Metadata

- **Step**: 04-03 (Data Flow & State Management)
- **Depth**: standard
- **Persona**: Jordan Park (System Designer)
- **Traces**: FR-001, FR-003, FR-004, FR-005, FR-009, FR-010, FR-011, FR-013, FR-014, FR-015
- **NFR Traces**: NFR-001 (must not break), NFR-004 (performance), NFR-006 (idempotent), NFR-007 (fail-open)
- **Dependencies**: module-design-common-cjs.md, module-design-enforcer.md, interface-spec.md
