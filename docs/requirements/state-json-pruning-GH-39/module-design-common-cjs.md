# Module Design: common.cjs -- Archive & Prune Extension

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Module**: `src/claude/hooks/lib/common.cjs`
**Designer**: Jordan Park (System Designer)
**Date**: 2026-02-21
**Traces to**: FR-003, FR-004, FR-011, FR-014, FR-015, NFR-001 through NFR-010

---

## 1. Module Responsibility

Extend the existing `common.cjs` shared library with 4 new functions and 2 default parameter changes for the archive-and-prune feature. This module owns all archive I/O and all prune/clear logic. No other module reads or writes state-archive.json directly.

**Single Responsibility**: State lifecycle management (read, write, prune, archive, resolve paths).

---

## 2. New Functions

### 2.1 resolveArchivePath(projectId?)

**FR**: FR-015 | **ACs**: AC-015-01 through AC-015-06

```javascript
/**
 * Resolve the path to state-archive.json, accounting for monorepo mode.
 * Mirrors resolveStatePath() exactly -- same directory, different filename.
 *
 * - Single project: .isdlc/state-archive.json
 * - Monorepo: .isdlc/projects/{project-id}/state-archive.json
 *
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to state-archive.json
 */
function resolveArchivePath(projectId) {
    const projectRoot = getProjectRoot();

    if (isMonorepoMode()) {
        const id = projectId || getActiveProject();
        if (id) {
            return path.join(projectRoot, '.isdlc', 'projects', id, 'state-archive.json');
        }
    }

    // Default: single-project mode
    return path.join(projectRoot, '.isdlc', 'state-archive.json');
}
```

**Design notes**:
- Line-for-line clone of `resolveStatePath()` (lines 327-339) with `'state.json'` replaced by `'state-archive.json'`.
- Reuses `getProjectRoot()` (cached), `isMonorepoMode()`, `getActiveProject()` -- no new internal dependencies.
- No I/O. No error handling needed (inherits from getProjectRoot).
- **12 lines of code**.

**Insert location**: After `resolveStatePath()` (line 339), before `resolveConstitutionPath()` (line 341).

### 2.2 clearTransientFields(state)

**FR**: FR-003 | **ACs**: AC-003-01 through AC-003-08

```javascript
/**
 * Reset all transient runtime fields to their null/empty defaults.
 * Called at workflow finalize to prevent stale data bleeding into
 * subsequent workflows.
 *
 * Pure function: takes state, mutates it, returns it.
 * Does NOT perform any disk I/O. Caller manages readState/writeState.
 *
 * Transient field list (explicit allowlist -- ADR-002):
 *   current_phase, active_agent, phases, blockers,
 *   pending_escalations, pending_delegation
 *
 * @param {Object} state - The state object to mutate
 * @returns {Object} The mutated state object (or input unchanged if null/undefined)
 */
function clearTransientFields(state) {
    if (!state) return state;

    state.current_phase = null;
    state.active_agent = null;
    state.phases = {};
    state.blockers = [];
    state.pending_escalations = [];
    state.pending_delegation = null;

    return state;
}
```

**Design notes**:
- Follows prune function pattern: `(state) -> state`, mutate in place, caller manages I/O.
- Explicit allowlist of 6 fields (ADR-002). No key iteration, no wildcards, no denylist.
- Null guard: `if (!state) return state` prevents TypeError on null/undefined input.
- Does NOT touch `active_workflow` (already set to null by orchestrator before this runs).
- Does NOT touch any durable field (`project_config`, `framework_version`, `state_version`, etc.).
- **10 lines of code** (body).

**Insert location**: After `pruneWorkflowHistory()` (line 2462), before `resetPhasesForWorkflow()` (line 2471).

### 2.3 appendToArchive(record, projectId?)

**FR**: FR-011 | **ACs**: AC-011-01 through AC-011-05

```javascript
/**
 * Append a workflow record to state-archive.json and update the multi-key index.
 *
 * Best-effort: never throws. On any error, logs a warning to stderr and returns.
 * On corrupt or missing archive file, creates a fresh archive.
 *
 * Dedup (ADR-009): If the last record in the archive has the same `slug` AND
 * `completed_at` as the incoming record, the append is skipped. O(1) check.
 *
 * Index maintenance (ADR-010): source_id and slug are added as index keys
 * pointing to the new record's array position. Existing keys are appended
 * (supports re-work: same issue, multiple workflows).
 *
 * @param {Object} record - Archive record conforming to the schema (Section 19.4)
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {void}
 */
function appendToArchive(record, projectId) {
    try {
        const archivePath = resolveArchivePath(projectId);

        // Ensure directory exists (monorepo first-use)
        const dir = path.dirname(archivePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Read existing archive or create fresh
        let archive;
        if (fs.existsSync(archivePath)) {
            try {
                const content = fs.readFileSync(archivePath, 'utf8');
                archive = JSON.parse(content);
            } catch (parseErr) {
                // Corrupt file: log warning, start fresh
                debugLog('appendToArchive: corrupt archive file, creating fresh:', parseErr.message);
                archive = null;
            }
        }

        if (!archive || !Array.isArray(archive.records)) {
            archive = { version: 1, records: [], index: {} };
        }

        // Dedup check (ADR-009): skip if last record matches slug + completed_at
        if (archive.records.length > 0) {
            const lastRecord = archive.records[archive.records.length - 1];
            if (lastRecord.slug === record.slug && lastRecord.completed_at === record.completed_at) {
                debugLog('appendToArchive: duplicate detected, skipping');
                return;
            }
        }

        // Append record
        const position = archive.records.length;
        archive.records.push(record);

        // Update index (ADR-010): add source_id and slug keys
        if (!archive.index || typeof archive.index !== 'object') {
            archive.index = {};
        }

        if (record.source_id) {
            if (!Array.isArray(archive.index[record.source_id])) {
                archive.index[record.source_id] = [];
            }
            archive.index[record.source_id].push(position);
        }

        if (record.slug) {
            if (!Array.isArray(archive.index[record.slug])) {
                archive.index[record.slug] = [];
            }
            archive.index[record.slug].push(position);
        }

        // Write archive
        fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));

    } catch (err) {
        // Fail-open: log warning, never throw (NFR-007)
        debugLog('appendToArchive: error:', err.message);
    }
}
```

**Design notes**:
- Follows `writeState()` pattern (line 1089): resolve path, ensure dir, read-modify-write.
- Three error handling layers:
  1. Parse error on existing file -> create fresh archive (loses old records, unblocks writes)
  2. Missing file -> create fresh archive
  3. Any other error -> catch at top level, log, return
- Dedup is O(1): only checks the last record in the array.
- Index is additive: push to existing array (supports re-work scenario).
- No `state_version` equivalent for the archive -- version field is for format migration, not concurrency.
- **~50 lines of code** (body).

**Insert location**: After `clearTransientFields()`, before `resetPhasesForWorkflow()`.

### 2.4 seedArchiveFromHistory(workflowHistory, projectId?)

**FR**: FR-014 | **ACs**: AC-014-01 through AC-014-05

```javascript
/**
 * Transform legacy workflow_history entries to archive record format
 * and append each to the archive via appendToArchive().
 *
 * Used by FR-009 (one-time migration) during orchestrator init.
 * Skip-on-error per entry: if one entry fails to transform, continue with the next.
 * Never throws.
 *
 * @param {Array} workflowHistory - Array of legacy workflow_history entries
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {void}
 */
function seedArchiveFromHistory(workflowHistory, projectId) {
    if (!Array.isArray(workflowHistory) || workflowHistory.length === 0) {
        return;
    }

    let seeded = 0;
    let skipped = 0;

    for (const entry of workflowHistory) {
        try {
            const record = {
                source_id: entry.id || null,
                slug: entry.artifact_folder || null,
                workflow_type: entry.type || null,
                completed_at: entry.completed_at || entry.cancelled_at || null,
                branch: entry.git_branch?.name || null,
                outcome: _deriveOutcome(entry),
                reason: entry.cancellation_reason || null,
                phase_summary: _compactPhaseSnapshots(entry.phase_snapshots),
                metrics: entry.metrics || {}
            };

            // Skip entries with no timestamp (cannot be meaningfully archived)
            if (!record.completed_at) {
                skipped++;
                continue;
            }

            appendToArchive(record, projectId);
            seeded++;
        } catch (entryErr) {
            // Skip-on-error per entry (AC-014-05)
            debugLog('seedArchiveFromHistory: skipping entry:', entryErr.message);
            skipped++;
        }
    }

    if (skipped > 0) {
        debugLog(`seedArchiveFromHistory: seeded ${seeded}, skipped ${skipped}`);
    }
}

/**
 * Derive archive outcome from a legacy workflow_history entry.
 * @param {Object} entry - Legacy workflow_history entry
 * @returns {string} One of: "merged", "completed", "cancelled", "abandoned"
 */
function _deriveOutcome(entry) {
    if (entry.status === 'cancelled') return 'cancelled';
    if (entry.git_branch?.status === 'merged') return 'merged';
    if (entry.status === 'completed') return 'completed';
    return 'completed'; // Default fallback for legacy entries without explicit status
}

/**
 * Compact full phase_snapshots to phase_summary format.
 * @param {Array} snapshots - Full phase_snapshots array (or undefined)
 * @returns {Array} Compact array of { phase, status, summary }
 */
function _compactPhaseSnapshots(snapshots) {
    if (!Array.isArray(snapshots)) return [];
    return snapshots.map(s => ({
        phase: s.key || s.phase || null,
        status: s.status || null,
        summary: s.summary || null
    }));
}
```

**Design notes**:
- Iterates all entries, transforms each to archive record schema, calls `appendToArchive()`.
- Two private helpers (`_deriveOutcome`, `_compactPhaseSnapshots`) keep the main function clean.
- Private helpers prefixed with `_` per Node.js convention. NOT exported.
- Skip entries with no `completed_at` -- these are incomplete and cannot be meaningfully timestamped.
- `appendToArchive()` handles dedup internally, so if the migration is accidentally run twice, no duplicates.
- **~45 lines of code** (body + helpers).

**Insert location**: After `appendToArchive()`, before `resetPhasesForWorkflow()`.

---

## 3. Existing Function Modifications

### 3.1 pruneSkillUsageLog default change

**FR**: FR-004 | **AC**: AC-004-01

```javascript
// BEFORE (line 2364):
function pruneSkillUsageLog(state, maxEntries = 20) {

// AFTER:
function pruneSkillUsageLog(state, maxEntries = 50) {
```

**One character change**: `20` -> `50`.

### 3.2 pruneHistory default change

**FR**: FR-004 | **AC**: AC-004-02

```javascript
// BEFORE (line 2418):
function pruneHistory(state, maxEntries = 50, maxCharLen = 200) {

// AFTER:
function pruneHistory(state, maxEntries = 100, maxCharLen = 200) {
```

**One character change**: `50` -> `100`.

---

## 4. Module Exports Changes

### 4.1 New exports in module.exports block

```javascript
module.exports = {
    // ... existing exports ...

    // Monorepo support
    resolveStatePath,
    resolveArchivePath,          // NEW (FR-015) -- insert after resolveStatePath
    resolveConstitutionPath,
    // ...

    // State pruning (BUG-0004)
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory,
    clearTransientFields,        // NEW (FR-003) -- insert after pruneWorkflowHistory
    resetPhasesForWorkflow,

    // Archive operations (GH-39)   -- NEW section comment
    appendToArchive,             // NEW (FR-011)
    seedArchiveFromHistory,      // NEW (FR-014)

    // Dispatcher helpers (REQ-0010)
    // ... existing exports ...
};
```

**4 new exports**, organized into 2 existing sections + 1 new section.

---

## 5. Data Structures Owned

### 5.1 Archive File Structure (state-archive.json)

```javascript
{
    version: 1,                           // Format version (integer, for future migration)
    records: [ArchiveRecord, ...],        // Append-only array, chronologically ordered
    index: {                              // Multi-key index: identifier -> [positions]
        "GH-39": [0],
        "state-json-pruning-GH-39": [0],
        "GH-40": [1, 3],                 // Re-work: same issue, positions 1 and 3
        "feature-x-GH-40": [1],
        "bugfix-x-GH-40": [3]
    }
}
```

### 5.2 Archive Record Schema

```javascript
/** @typedef {Object} ArchiveRecord */
{
    source_id: string | null,
    slug: string | null,
    workflow_type: string | null,
    completed_at: string,          // REQUIRED: ISO-8601
    branch: string | null,
    outcome: string,               // REQUIRED: "merged"|"completed"|"cancelled"|"abandoned"
    reason: string | null,
    phase_summary: PhaseSummary[],
    metrics: object
}

/** @typedef {Object} PhaseSummary */
{
    phase: string,                 // e.g., "01-requirements"
    status: string,                // e.g., "completed"
    summary: string | null         // One-line description
}
```

### 5.3 Transient Field Reset Map (owned by clearTransientFields)

| Field | Reset Value | Type |
|-------|-------------|------|
| `current_phase` | `null` | string/null |
| `active_agent` | `null` | string/null |
| `phases` | `{}` | object |
| `blockers` | `[]` | array |
| `pending_escalations` | `[]` | array |
| `pending_delegation` | `null` | object/null |

---

## 6. Cross-Cutting Concerns

### 6.1 Logging

All functions use `debugLog()` (existing common.cjs utility, line 3519 export) for warnings and debug output. `debugLog` writes to stderr only when `ISDLC_DEBUG=1` is set. No stdout output (CON-003 hook protocol).

### 6.2 Error Handling Pattern

| Function | On Error | Mechanism |
|----------|----------|-----------|
| `resolveArchivePath` | Inherits from `getProjectRoot()` | Falls back to cwd |
| `clearTransientFields` | Returns input unchanged | `if (!state) return state` |
| `appendToArchive` | Logs warning, returns void | Top-level try/catch |
| `seedArchiveFromHistory` | Skips entry, continues | Per-entry try/catch |
| `_deriveOutcome` | Returns `"completed"` | Default fallback |
| `_compactPhaseSnapshots` | Returns `[]` | Guard for non-array input |

### 6.3 Idempotency (NFR-006)

| Function | Idempotent? | Mechanism |
|----------|-------------|-----------|
| `clearTransientFields` | Yes | Setting null to null and [] to [] is a no-op |
| `appendToArchive` | Yes | Dedup check: skip if last record matches slug + completed_at |
| `seedArchiveFromHistory` | Yes | Each call to appendToArchive is individually deduped |

---

## 7. Test Strategy

### 7.1 Test File: `src/claude/hooks/tests/archive-functions.test.cjs`

**Mocks required**:
- `fs.existsSync` -- control archive file existence
- `fs.readFileSync` -- return synthetic archive content (or throw for corrupt)
- `fs.writeFileSync` -- capture written content for assertions (or throw for write failure)
- `fs.mkdirSync` -- verify directory creation for monorepo

**Test isolation**: Each test creates its own mock filesystem state. No shared state between tests.

#### resolveArchivePath tests

| Test Case | Input | Expected | AC |
|-----------|-------|----------|-----|
| Single-project mode | No args, monorepo mode off | `{root}/.isdlc/state-archive.json` | AC-015-01 |
| Monorepo with explicit projectId | `'my-app'`, monorepo on | `{root}/.isdlc/projects/my-app/state-archive.json` | AC-015-02 |
| Monorepo auto-detect | No args, monorepo on | Uses `getActiveProject()` result | AC-015-03 |
| Same directory as state | Compare with `resolveStatePath()` | Same dir, different filename | AC-015-04 |

#### clearTransientFields tests

| Test Case | Input | Expected | AC |
|-----------|-------|----------|-----|
| All 6 fields populated | Full state | All 6 reset to defaults | AC-003-01 to AC-003-06 |
| Null input | `null` | Returns `null` | -- |
| Undefined input | `undefined` | Returns `undefined` | -- |
| Missing fields | State without `blockers` | No TypeError, other fields still cleared | -- |
| Durable fields preserved | State with `project_config`, `framework_version`, etc. | All durables unchanged | AC-003-08 |
| Idempotency | Call twice on same state | Second call produces identical result | NFR-006 |
| Returns state | Call and capture return | Return value === input state object | AC-003-07 |

#### appendToArchive tests

| Test Case | Input | Expected | AC |
|-----------|-------|----------|-----|
| New archive (file absent) | Record, no existing file | Creates `{ version: 1, records: [record], index: {...} }` | AC-011-02 |
| Append to existing | Record, existing archive with 1 record | records.length === 2, index updated | AC-011-01 |
| Multi-key index | Record with source_id + slug | Both keys in index pointing to same position | AC-011-03 |
| Dedup: skip duplicate | Same slug + completed_at as last record | records.length unchanged, returns early | ADR-009 |
| Dedup: allow different completed_at | Same slug, different timestamp | records.length increments | -- |
| Corrupt file recovery | Invalid JSON on disk | Fresh archive created, record appended | -- |
| Write error | fs.writeFileSync throws | Warning logged, no throw | AC-011-04 |
| Record with null source_id | source_id null, slug present | Only slug added to index | -- |
| Record with null slug | slug null, source_id present | Only source_id added to index | -- |
| Record with both null | Both null | Record appended, no index entries | -- |
| Monorepo: directory creation | Monorepo project dir does not exist | mkdirSync called with recursive | -- |

#### seedArchiveFromHistory tests

| Test Case | Input | Expected | AC |
|-----------|-------|----------|-----|
| Normal history array | 3 entries with all fields | 3 records appended | AC-014-01, AC-014-02 |
| Entry missing source_id | Entry without `id` field | Record appended, indexed by slug only | AC-014-03 |
| Entry missing both identifiers | No id, no artifact_folder | Record appended, no index entries | AC-014-04 |
| Entry with no timestamp | No completed_at or cancelled_at | Entry skipped | -- |
| One entry throws | Middle entry causes error | First and third still seeded | AC-014-05 |
| Empty array | `[]` | No calls to appendToArchive | -- |
| Null input | `null` | Returns immediately | -- |
| Outcome derivation: cancelled | `status: 'cancelled'` | `outcome: 'cancelled'` | -- |
| Outcome derivation: merged | `git_branch.status: 'merged'` | `outcome: 'merged'` | -- |
| Phase snapshot compaction | Full snapshots with timing | Compacted to `{ phase, status, summary }` | AC-014-02 |
| Idempotency | Call twice with same history | appendToArchive dedup prevents duplicates | NFR-006 |

### 7.2 Test File: `src/claude/hooks/tests/prune-functions.test.cjs`

**Existing prune function tests** (currently 0% coverage):

| Function | Key Test Cases |
|----------|---------------|
| `pruneSkillUsageLog` | Empty array, below cap, at cap, above cap (FIFO), non-array, **new default 50** |
| `pruneCompletedPhases` | Empty phases, completed stripped, protected preserved, non-completed preserved, `_pruned_at` added |
| `pruneHistory` | Empty, FIFO cap, action truncation at 200 chars, short strings unchanged, **new default 100** |
| `pruneWorkflowHistory` | Empty, FIFO cap, description truncation, git_branch compaction to `{ name }` |
| `clearTransientFields` | (covered in archive-functions.test.cjs, but cross-listed here for combined sequence test) |
| **Combined sequence** | Run all 5 in order on a realistic state, verify final shape |
| **Idempotency** | `f(f(state))` === `f(state)` for each function |
| **Durable field protection** | Run all functions, verify ~15 durable fields unchanged |

---

## 8. Module Dependency Graph

```
resolveArchivePath
  |- getProjectRoot()        [existing, cached]
  |- isMonorepoMode()        [existing]
  |- getActiveProject()      [existing]

appendToArchive
  |- resolveArchivePath()    [new]
  |- fs.existsSync           [node builtin]
  |- fs.readFileSync         [node builtin]
  |- fs.writeFileSync        [node builtin]
  |- fs.mkdirSync            [node builtin]
  |- path.dirname            [node builtin]
  |- debugLog()              [existing]

seedArchiveFromHistory
  |- appendToArchive()       [new]
  |- _deriveOutcome()        [new, private]
  |- _compactPhaseSnapshots() [new, private]
  |- debugLog()              [existing]

clearTransientFields
  |- (none)                  [pure function, no dependencies]
```

No circular dependencies. Dependency direction is strictly downward.
