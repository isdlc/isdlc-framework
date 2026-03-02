# Module Design: workflow-completion-enforcer.cjs -- Archive Integration

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Module**: `src/claude/hooks/workflow-completion-enforcer.cjs`
**Designer**: Jordan Park (System Designer)
**Date**: 2026-02-21
**Traces to**: FR-004, FR-005, FR-010, NFR-001, NFR-007

---

## 1. Module Responsibility

Modify the existing workflow-completion-enforcer hook to:
1. Call `clearTransientFields(state)` after the prune sequence (FR-005)
2. Build and archive a workflow record via `appendToArchive()` (FR-010)
3. Update prune function call arguments to new retention limits (FR-004)

**Scope**: 3 code changes + 2 import additions. No new functions created in this module. All new logic delegates to common.cjs functions.

---

## 2. Import Block Changes

```javascript
// BEFORE (lines 29-40):
const {
    readState, writeState, debugLog, logHookEvent,
    outputSelfHealNotification, collectPhaseSnapshots,
    pruneSkillUsageLog, pruneCompletedPhases, pruneHistory, pruneWorkflowHistory
} = require('./lib/common.cjs');

// AFTER:
const {
    readState, writeState, debugLog, logHookEvent,
    outputSelfHealNotification, collectPhaseSnapshots,
    pruneSkillUsageLog, pruneCompletedPhases, pruneHistory, pruneWorkflowHistory,
    clearTransientFields,
    appendToArchive
} = require('./lib/common.cjs');
```

**2 new imports**: `clearTransientFields`, `appendToArchive`.

---

## 3. Execution Sequence Changes

### 3.1 Prune Call Argument Updates (FR-004)

```javascript
// BEFORE (lines 219-222):
pruneSkillUsageLog(state, 20);
pruneCompletedPhases(state, []);
pruneHistory(state, 50, 200);
pruneWorkflowHistory(state, 50, 200);

// AFTER:
pruneSkillUsageLog(state, 50);         // FR-004: was 20
pruneCompletedPhases(state, []);
pruneHistory(state, 100, 200);         // FR-004: was 50
pruneWorkflowHistory(state, 50, 200);
```

**2 argument changes**: `20 -> 50`, `50 -> 100`.

### 3.2 clearTransientFields Call (FR-005)

Insert after the prune sequence (after line 222):

```javascript
// Clear transient runtime fields (FR-005, GH-39)
clearTransientFields(state);
```

**1 new line**. No try/catch needed -- clearTransientFields is a pure function that cannot throw (null guard returns input unchanged). The enforcer's top-level try/catch (line 242) covers any unexpected error.

### 3.3 Archive Record Construction and Write (FR-010)

Insert after `clearTransientFields(state)`, before `writeState(state)` (line 225):

```javascript
// Archive workflow record (FR-010, GH-39)
try {
    const lastEntry = state.workflow_history[state.workflow_history.length - 1];
    if (lastEntry) {
        const archiveRecord = {
            source_id: lastEntry.id || null,
            slug: lastEntry.artifact_folder || null,
            workflow_type: lastEntry.type || null,
            completed_at: lastEntry.completed_at || lastEntry.cancelled_at || new Date().toISOString(),
            branch: lastEntry.git_branch?.name || null,
            outcome: lastEntry.status === 'cancelled' ? 'cancelled'
                   : lastEntry.git_branch?.status === 'merged' ? 'merged'
                   : 'completed',
            reason: lastEntry.cancellation_reason || null,
            phase_summary: (lastEntry.phase_snapshots || []).map(s => ({
                phase: s.key || s.phase,
                status: s.status,
                summary: s.summary || null
            })),
            metrics: lastEntry.metrics || {}
        };
        appendToArchive(archiveRecord);
    }
} catch (archiveErr) {
    debugLog('workflow-completion-enforcer: archive error:', archiveErr.message);
}
```

**Design notes**:
- Dedicated try/catch separate from the prune sequence. Archive failure must not prevent `writeState()`.
- `lastEntry` is guaranteed to exist (guard at line 105-107 already verified `workflow_history.length > 0`).
- `completed_at` fallback chain: `completed_at` (completed) -> `cancelled_at` (cancelled) -> `new Date().toISOString()` (safety net).
- `outcome` derivation: explicit `cancelled` check first, then `merged` from git_branch, then default `completed`.
- `phase_summary` maps from full snapshots (key `s.key` from collectPhaseSnapshots output) to compact format (field `phase`). Note: `s.key` is the field name in phase_snapshots (from collectPhaseSnapshots line 2321); for archive records from seedArchiveFromHistory, the field is `s.phase`. The `.key || .phase` pattern handles both.
- `appendToArchive()` handles its own errors internally. The outer try/catch is defense-in-depth for unexpected errors in record construction.
- **~20 lines of code** (including try/catch and record construction).

### 3.4 Ordering Constraint

The final execution sequence after all changes:

```
Line 218:  // Apply pruning (BUG-0004, GH-39)
Line 219:  pruneSkillUsageLog(state, 50);
Line 220:  pruneCompletedPhases(state, []);
Line 221:  pruneHistory(state, 100, 200);
Line 222:  pruneWorkflowHistory(state, 50, 200);
Line 223:  clearTransientFields(state);              // NEW (FR-005)
Line 224:
Line 225:  // Archive workflow record (FR-010, GH-39)  // NEW block
Line 226:  try {
Line 227:      ... archive record construction ...
Line 238:      appendToArchive(archiveRecord);
Line 239:  } catch (archiveErr) {
Line 240:      debugLog(...);
Line 241:  }
Line 242:
Line 243:  // Write back to disk
Line 244:  writeState(state);
```

**Critical ordering**: `appendToArchive()` BEFORE `writeState()`. This ensures:
1. The archive record is written to disk before state.json is updated.
2. If the enforcer re-triggers (writeState triggers PostToolUse), the dedup check in appendToArchive finds the record already archived and skips.

---

## 4. Data Flow Through Enforcer

```
PostToolUse event (state.json write)
  |
  v
check(ctx)
  |
  readState() -> fresh state from disk
  |
  Guard: active_workflow === null?  ----NO----> return allow
  Guard: workflow_history exists?   ----NO----> return allow
  Guard: lastEntry < 2 min old?    ----NO----> return allow
  Guard: has snapshots + metrics?   ----YES---> return allow (orchestrator did it)
  |
  v
Self-heal: reconstruct temp active_workflow
  -> collectPhaseSnapshots(state)
  -> patch lastEntry with snapshots + metrics
  -> regression check (existing)
  |
  v
Prune: pruneSkillUsageLog(state, 50)            [UPDATED ARG]
  -> pruneCompletedPhases(state, [])
  -> pruneHistory(state, 100, 200)               [UPDATED ARG]
  -> pruneWorkflowHistory(state, 50, 200)
  -> clearTransientFields(state)                  [NEW]
  |
  v
Archive: build archiveRecord from lastEntry       [NEW]
  -> appendToArchive(archiveRecord)               [NEW]
  |
  v
writeState(state)
  -> return { decision: 'allow', stateModified: false }
```

---

## 5. Error Boundary Analysis

```
+-- Top-level try/catch (line 64, existing) ----------------------+
|                                                                   |
|  readState() -- returns null on error -> early return             |
|  Guard checks -- early return on any failure                      |
|                                                                   |
|  Self-heal block (existing)                                       |
|                                                                   |
|  +-- Regression check try/catch (line 172, existing) -----+      |
|  |  Performance regression detection                       |      |
|  |  On error: debugLog, continue                           |      |
|  +--------------------------------------------------------+      |
|                                                                   |
|  Prune sequence (no individual catch -- all functions safe)       |
|  clearTransientFields(state) -- pure, cannot throw                |
|                                                                   |
|  +-- Archive try/catch (NEW, dedicated) ------------------+       |
|  |  Build archiveRecord from lastEntry                    |       |
|  |  appendToArchive(archiveRecord)                        |       |
|  |    +-- appendToArchive internal try/catch ---------+   |       |
|  |    |  resolveArchivePath, fs ops, dedup, write     |   |       |
|  |    |  On ANY error: debugLog, return               |   |       |
|  |    +----------------------------------------------+   |       |
|  |  On ANY error: debugLog, continue                      |       |
|  +--------------------------------------------------------+       |
|                                                                   |
|  writeState(state)                                                |
|                                                                   |
|  On ANY error at top level: return { decision: 'allow' }          |
+-------------------------------------------------------------------+
```

**Three layers of defense**: Any error at any level is caught and logged. The hook always returns `{ decision: 'allow', stateModified: false }`.

---

## 6. Re-Triggering Analysis

The enforcer's `writeState()` (line 244 post-change) writes state.json, which triggers PostToolUse hooks again, including the enforcer itself.

**Protection on second invocation**:
1. `readState()` reads the just-written state.
2. `active_workflow === null` -- passes guard.
3. `workflow_history` exists with lastEntry -- passes guard.
4. Staleness check: `completed_at` is the same (< 2 min old) -- passes guard.
5. **Completeness guard (line 127-133)**: lastEntry NOW has `phase_snapshots` (array) AND `metrics` (object with keys) because the first invocation just patched them. This guard returns `{ decision: 'allow' }` early. **The second invocation never reaches the prune/archive block.**

Even if the completeness guard somehow fails:
6. `appendToArchive()` dedup check: last record in archive has same slug + completed_at. Append is skipped.
7. `writeState()` runs again, triggering a third invocation. Same guards apply. Eventually the staleness threshold (2 min) expires and subsequent invocations are skipped.

**Conclusion**: No infinite loop. No duplicate archive entries.

---

## 7. Test Strategy

### 7.1 Test File: `src/claude/hooks/tests/workflow-completion-enforcer.test.cjs`

**Mocks required**:
- `readState()` -- return synthetic state objects
- `writeState()` -- capture calls, verify arguments
- `appendToArchive()` -- capture calls, verify record shape
- `clearTransientFields()` -- capture calls, verify it is called
- `collectPhaseSnapshots()` -- return synthetic snapshots
- `logHookEvent()` -- capture calls
- `outputSelfHealNotification()` -- capture calls
- `debugLog()` -- capture calls

**Mock strategy**: Use `jest.mock('./lib/common.cjs')` or manual mock injection. The enforcer imports all functions from common.cjs via destructuring, so replacing the require path with a mock module is sufficient.

#### Test Cases

| Test Case | Setup | Assertion | AC |
|-----------|-------|----------|-----|
| Enforcer calls clearTransientFields | State with active_workflow=null, recent entry, missing snapshots | clearTransientFields called with state | AC-005-01, AC-005-02 |
| Enforcer uses updated retention limits | Same setup | pruneSkillUsageLog called with 50, pruneHistory with 100 | AC-004-01, AC-004-02 |
| Enforcer builds archive record for completed workflow | Entry with status='completed', git_branch.status='merged' | archiveRecord.outcome === 'merged' | AC-010-01 |
| Enforcer builds archive record for cancelled workflow | Entry with status='cancelled', cancellation_reason set | archiveRecord.outcome === 'cancelled', reason populated | AC-010-06 |
| Enforcer calls appendToArchive | Valid state with recent entry | appendToArchive called once with correct record shape | AC-010-01 |
| Archive error does not block writeState | appendToArchive mock throws | writeState still called | NFR-007, AC-010-04 |
| clearTransientFields error does not block | Mock clearTransientFields to throw (hypothetical) | writeState still called (top-level catch) | NFR-001 |
| Full flow: self-heal + prune + clear + archive + write | Complete state with missing snapshots | All functions called in correct order | FR-005, FR-010 |
| Guard: already has snapshots | Entry with phase_snapshots and metrics | No prune/clear/archive calls, early return | -- |
| Guard: stale entry | Entry > 2 min old | No prune/clear/archive calls, early return | -- |

---

## 8. Orchestrator Prompt Changes (Reference)

The orchestrator (`00-sdlc-orchestrator.md`) is a prompt-driven module, not executable code. Its changes are prose updates documented here for completeness.

### 8.1 MODE: finalize (line 655)

Update the prune specification to include `clearTransientFields(state)` and updated retention limits. See architecture-overview.md Section 9.1.

### 8.2 Workflow Completion (lines 688-695)

Replace step 3 with the expanded prune sequence including explicit values. See architecture-overview.md Section 9.1.

### 8.3 Initialization Process (line 311)

Add abandoned workflow detection and archive (FR-013). Add migration check (FR-009). See architecture-overview.md Section 8.

**No test file for orchestrator changes**: These are prompt instructions. Compliance is verified by the enforcer fallback (if the orchestrator skips, the enforcer catches it).
