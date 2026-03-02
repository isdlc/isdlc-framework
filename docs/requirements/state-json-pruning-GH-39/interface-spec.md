# Interface Specification: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Phase**: 04-design (ANALYSIS MODE)
**Designer**: Jordan Park (System Designer)
**Date**: 2026-02-21
**Traces to**: FR-003, FR-004, FR-005, FR-010, FR-011, FR-013, FR-014, FR-015, NFR-001 through NFR-010

---

## 1. Public Function Interfaces

### 1.1 resolveArchivePath(projectId?)

**Module**: `src/claude/hooks/lib/common.cjs`
**FR**: FR-015 | **ACs**: AC-015-01 through AC-015-06

```typescript
/**
 * Resolve the absolute path to state-archive.json, accounting for monorepo mode.
 * Mirrors resolveStatePath() exactly -- same directory, different filename.
 *
 * @param projectId - Optional project ID override for monorepo mode
 * @returns Absolute path to state-archive.json
 *
 * @sideEffects None. Pure path resolution using cached getProjectRoot().
 * @throws Never. Inherits error handling from getProjectRoot() which falls back to cwd.
 * @idempotent Yes. Same input always produces the same output.
 */
function resolveArchivePath(projectId?: string): string;
```

**Parameter Specification**:

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `projectId` | `string \| undefined` | No | `undefined` | Non-empty string if provided. No path separators (`/`, `\`). |

**Return Value**:

| Type | Format | Example (single-project) | Example (monorepo) |
|------|--------|--------------------------|---------------------|
| `string` | Absolute filesystem path | `/Users/dev/project/.isdlc/state-archive.json` | `/Users/dev/project/.isdlc/projects/my-app/state-archive.json` |

**Valid Inputs**:

```javascript
resolveArchivePath()            // -> '/abs/path/.isdlc/state-archive.json'
resolveArchivePath('my-app')    // -> '/abs/path/.isdlc/projects/my-app/state-archive.json' (monorepo)
resolveArchivePath('my-app')    // -> '/abs/path/.isdlc/state-archive.json' (single-project, projectId ignored)
```

**Invalid Inputs** (handled gracefully):

```javascript
resolveArchivePath('')          // -> treated as falsy, falls through to default behavior
resolveArchivePath(null)        // -> treated as falsy, falls through to default behavior
resolveArchivePath(123)         // -> path.join coerces to string; functional but not intended usage
```

**Invariants**:
- `path.dirname(resolveArchivePath(id)) === path.dirname(resolveStatePath(id))` for any `id`
- `path.basename(resolveArchivePath(id)) === 'state-archive.json'` always
- Return value is always an absolute path (starts with `/` on POSIX, drive letter on Windows)

---

### 1.2 clearTransientFields(state)

**Module**: `src/claude/hooks/lib/common.cjs`
**FR**: FR-003 | **ACs**: AC-003-01 through AC-003-08

```typescript
/**
 * Reset all transient runtime fields to their null/empty defaults.
 * Called at workflow finalize to prevent stale data bleeding into subsequent workflows.
 *
 * Pure function: takes state, mutates it in place, returns it.
 * Does NOT perform any disk I/O. Caller manages readState/writeState.
 *
 * @param state - The state object to mutate (or null/undefined)
 * @returns The mutated state object, or the input unchanged if null/undefined
 *
 * @sideEffects Mutates the input state object in place (6 fields).
 * @throws Never. Null guard prevents TypeError on null/undefined input.
 * @idempotent Yes. Calling twice produces identical results.
 */
function clearTransientFields(state: object | null | undefined): object | null | undefined;
```

**Parameter Specification**:

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `state` | `object \| null \| undefined` | Yes (positional) | N/A | If object, expected to be a valid state.json structure. |

**Return Value**:

| Input | Return | Behavior |
|-------|--------|----------|
| Valid state object | Same object reference (mutated) | 6 transient fields reset |
| `null` | `null` | No mutation, early return |
| `undefined` | `undefined` | No mutation, early return |

**Transient Field Reset Contract** (ADR-002 explicit allowlist):

| Field | Reset To | Type After Reset |
|-------|----------|------------------|
| `current_phase` | `null` | `null` |
| `active_agent` | `null` | `null` |
| `phases` | `{}` | `object` (empty) |
| `blockers` | `[]` | `Array` (empty) |
| `pending_escalations` | `[]` | `Array` (empty) |
| `pending_delegation` | `null` | `null` |

**Durable Fields NOT Touched** (partial list -- these must survive the call unchanged):

| Field | Why Durable |
|-------|-------------|
| `project_config` | Project identity |
| `framework_version` | Framework identity |
| `state_version` | Concurrency control |
| `counters` | Accumulated metrics |
| `active_workflow` | Managed by orchestrator, already null at finalize |
| `workflow_history` | Managed by prune functions separately |
| `skill_usage_log` | Managed by pruneSkillUsageLog separately |
| `history` | Managed by pruneHistory separately |
| `constitution` | Constitutional reference |
| `pruning_migration_completed` | Migration flag (FR-009) |

**Valid Inputs**:

```javascript
// Normal use: full state object
clearTransientFields({
    current_phase: '06-implementation',
    active_agent: 'software-developer',
    phases: { '01-requirements': { status: 'completed' } },
    blockers: [{ id: 1, description: 'test' }],
    pending_escalations: [{ type: 'quality' }],
    pending_delegation: { target: 'reviewer' },
    project_config: { name: 'my-project' },  // durable -- untouched
    state_version: 42                         // durable -- untouched
})
// Returns same object with 6 fields reset, durables unchanged

// Null guard
clearTransientFields(null)       // -> null
clearTransientFields(undefined)  // -> undefined
```

**Invalid Inputs** (handled gracefully):

```javascript
// Missing transient fields -- no TypeError, assignment creates them
clearTransientFields({})
// -> { current_phase: null, active_agent: null, phases: {}, blockers: [], pending_escalations: [], pending_delegation: null }

// Non-object -- returns input unchanged (falsy check)
clearTransientFields(0)          // -> 0 (falsy, early return)
clearTransientFields('')         // -> '' (falsy, early return)
clearTransientFields(false)      // -> false (falsy, early return)
```

**Invariant**: After `clearTransientFields(state)` returns (for any non-falsy state):
- `state.current_phase === null`
- `state.active_agent === null`
- `JSON.stringify(state.phases) === '{}'`
- `state.blockers.length === 0`
- `state.pending_escalations.length === 0`
- `state.pending_delegation === null`

---

### 1.3 appendToArchive(record, projectId?)

**Module**: `src/claude/hooks/lib/common.cjs`
**FR**: FR-011 | **ACs**: AC-011-01 through AC-011-05

```typescript
/**
 * Append a workflow record to state-archive.json and update the multi-key index.
 *
 * Best-effort: never throws. On any error, logs a warning to stderr and returns.
 * On corrupt or missing archive file, creates a fresh archive.
 *
 * Dedup (ADR-009): If the last record in the archive has the same slug AND
 * completed_at as the incoming record, the append is skipped. O(1) check.
 *
 * Index maintenance (ADR-010): source_id and slug are added as index keys
 * pointing to the new record's array position.
 *
 * @param record - Archive record conforming to ArchiveRecord schema
 * @param projectId - Optional project ID for monorepo mode
 * @returns void (fire-and-forget semantics)
 *
 * @sideEffects
 *   - Reads state-archive.json from disk (or creates it)
 *   - Writes state-archive.json to disk
 *   - May create parent directories (monorepo first-use)
 *   - Writes to stderr via debugLog on warning/error
 * @throws Never. All errors caught internally. (NFR-007 fail-open)
 * @idempotent Yes. Dedup check prevents duplicate appends.
 */
function appendToArchive(record: ArchiveRecord, projectId?: string): void;
```

**Parameter Specification**:

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `record` | `ArchiveRecord` | Yes | N/A | Must have at least `completed_at` (string). See Section 2.2. |
| `projectId` | `string \| undefined` | No | `undefined` | Passed through to `resolveArchivePath()`. |

**Return Value**: `void`. No return value. Success or failure communicated only via stderr debug log.

**Side Effect Contract**:

| Operation | Condition | Filesystem Impact |
|-----------|-----------|-------------------|
| Read archive | File exists | `fs.readFileSync(archivePath, 'utf8')` |
| Create fresh archive | File missing OR corrupt JSON | New file: `{ version: 1, records: [record], index: {...} }` |
| Append to existing | File valid, no dedup match | Record appended, index updated, file overwritten |
| Dedup skip | Last record matches slug + completed_at | No file write. Debug log emitted. |
| Directory creation | Parent dir does not exist | `fs.mkdirSync(dir, { recursive: true })` |

**Dedup Contract** (ADR-009):

```javascript
// Dedup triggers when BOTH conditions are true:
archive.records[archive.records.length - 1].slug === record.slug
  && archive.records[archive.records.length - 1].completed_at === record.completed_at

// Dedup does NOT trigger when:
// - Archive is empty (no last record to compare)
// - slug matches but completed_at differs (re-work scenario)
// - completed_at matches but slug differs (different workflow)
// - Neither matches (normal append)
```

**Index Update Contract** (ADR-010):

```javascript
// For each non-null identifier, append position to index array:
if (record.source_id) {
    archive.index[record.source_id] = [...(archive.index[record.source_id] || []), position];
}
if (record.slug) {
    archive.index[record.slug] = [...(archive.index[record.slug] || []), position];
}
// When both are non-null: TWO index entries created for the same position.
// When both are null: ZERO index entries created. Record still appended to records[].
```

**Valid Inputs**:

```javascript
// Minimal valid record
appendToArchive({
    source_id: 'GH-39',
    slug: 'state-json-pruning-GH-39',
    workflow_type: 'feature',
    completed_at: '2026-02-21T15:30:00.000Z',
    branch: 'feature/state-json-pruning-GH-39',
    outcome: 'merged',
    reason: null,
    phase_summary: [{ phase: '01-requirements', status: 'completed', summary: 'Requirements gathered' }],
    metrics: { total_duration_minutes: 120 }
});

// Monorepo usage
appendToArchive(record, 'my-app');

// Record with null identifiers (still valid, just no index entries)
appendToArchive({
    source_id: null,
    slug: null,
    workflow_type: 'feature',
    completed_at: '2026-02-21T15:30:00.000Z',
    branch: null,
    outcome: 'completed',
    reason: null,
    phase_summary: [],
    metrics: {}
});
```

**Invalid Inputs** (handled gracefully -- never throws):

```javascript
// null or undefined record -- TypeError caught by top-level try/catch
appendToArchive(null);          // -> debugLog('appendToArchive: error: ...'), returns void
appendToArchive(undefined);     // -> debugLog('appendToArchive: error: ...'), returns void

// Record missing completed_at -- still appended (no validation on record shape)
appendToArchive({ slug: 'x' }); // -> appended to records[], dedup may behave unexpectedly

// Non-object record
appendToArchive('string');      // -> property access fails, caught, logged, returns void
```

**Error Recovery Matrix**:

| Error Condition | Recovery | Data Impact |
|-----------------|----------|-------------|
| Archive file missing | Create fresh `{ version: 1, records: [], index: {} }` | No data loss (first write) |
| Archive file corrupt JSON | Create fresh archive | Previous archive records lost |
| `fs.writeFileSync` throws (disk full, permissions) | Log to stderr, return void | Record not persisted |
| `fs.mkdirSync` throws | Caught at top level, logged | Record not persisted |
| `fs.readFileSync` throws (not ENOENT) | Caught at parse level, create fresh | Previous archive records lost |

---

### 1.4 seedArchiveFromHistory(workflowHistory, projectId?)

**Module**: `src/claude/hooks/lib/common.cjs`
**FR**: FR-014 | **ACs**: AC-014-01 through AC-014-05

```typescript
/**
 * Transform legacy workflow_history entries to archive record format
 * and append each to the archive via appendToArchive().
 *
 * Used by FR-009 (one-time migration) during orchestrator init.
 * Skip-on-error per entry: if one entry fails to transform, continue with the next.
 * Never throws.
 *
 * @param workflowHistory - Array of legacy workflow_history entries from state.json
 * @param projectId - Optional project ID for monorepo mode
 * @returns void
 *
 * @sideEffects
 *   - Calls appendToArchive() for each valid entry (delegates all I/O)
 *   - Writes to stderr via debugLog for skipped entries
 * @throws Never. Per-entry try/catch with continue.
 * @idempotent Yes. appendToArchive() dedup prevents duplicate entries.
 */
function seedArchiveFromHistory(workflowHistory: LegacyWorkflowEntry[], projectId?: string): void;
```

**Parameter Specification**:

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `workflowHistory` | `Array \| null \| undefined` | Yes | N/A | Expected to be state.workflow_history array. |
| `projectId` | `string \| undefined` | No | `undefined` | Passed through to `appendToArchive()`. |

**Return Value**: `void`. No return value. Progress communicated via stderr debug log only.

**Transformation Contract** (legacy entry -> archive record):

| Legacy Field | Archive Field | Transform |
|-------------|---------------|-----------|
| `entry.id` | `record.source_id` | Direct copy, `null` if missing |
| `entry.artifact_folder` | `record.slug` | Direct copy, `null` if missing |
| `entry.type` | `record.workflow_type` | Direct copy, `null` if missing |
| `entry.completed_at \|\| entry.cancelled_at` | `record.completed_at` | First non-null wins. If both null, entry skipped. |
| `entry.git_branch?.name` | `record.branch` | Optional chain, `null` if missing |
| `_deriveOutcome(entry)` | `record.outcome` | See Section 3.1 |
| `entry.cancellation_reason` | `record.reason` | Direct copy, `null` if missing |
| `_compactPhaseSnapshots(entry.phase_snapshots)` | `record.phase_summary` | See Section 3.2 |
| `entry.metrics` | `record.metrics` | Direct copy, `{}` if missing |

**Skip Conditions**:

| Condition | Behavior |
|-----------|----------|
| `workflowHistory` is `null` | Return immediately, no error |
| `workflowHistory` is `undefined` | Return immediately, no error |
| `workflowHistory` is empty array | Return immediately, no error |
| `workflowHistory` is not an array | Return immediately (guard: `!Array.isArray()`) |
| Individual entry has no `completed_at` AND no `cancelled_at` | Skip entry, increment `skipped` counter |
| Individual entry throws during transform | Catch, log, increment `skipped` counter, continue |

**Valid Inputs**:

```javascript
// Normal migration with 3 legacy entries
seedArchiveFromHistory([
    {
        id: 'GH-38',
        artifact_folder: 'feature-x-GH-38',
        type: 'feature',
        status: 'completed',
        completed_at: '2026-02-19T10:00:00Z',
        cancelled_at: null,
        cancellation_reason: null,
        git_branch: { name: 'feature/x', status: 'merged', created_at: '...' },
        phase_snapshots: [{ key: '01-requirements', status: 'completed', summary: '...' }],
        metrics: { total_duration_minutes: 90 }
    },
    // ... more entries
]);

// Monorepo usage
seedArchiveFromHistory(state.workflow_history, 'my-app');
```

**Invalid Inputs** (handled gracefully):

```javascript
seedArchiveFromHistory(null);       // -> returns immediately
seedArchiveFromHistory(undefined);  // -> returns immediately
seedArchiveFromHistory([]);         // -> returns immediately (empty array guard)
seedArchiveFromHistory('string');   // -> returns immediately (!Array.isArray guard)
seedArchiveFromHistory([null, {completed_at: '2026-02-21T00:00:00Z'}]);
// -> first entry: catch TypeError, skip; second entry: append normally
```

---

## 2. Data Structure Schemas

### 2.1 Archive File (state-archive.json)

```typescript
interface ArchiveFile {
    /** Format version for future migration. Always 1 for initial release. */
    version: 1;

    /** Append-only array of workflow records, chronologically ordered. */
    records: ArchiveRecord[];

    /**
     * Multi-key index: identifier -> array of record positions.
     * Keys are source_id values and slug values.
     * Values are arrays of integer positions into records[].
     */
    index: { [key: string]: number[] };
}
```

**Field Constraints**:

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `version` | `number` | Yes | `1` | Integer. Must be `1` for this release. |
| `records` | `ArchiveRecord[]` | Yes | `[]` | Array. Append-only. Never spliced, never reordered. |
| `index` | `object` | Yes | `{}` | Keys: string identifiers. Values: `number[]` (positions). |

**Invariants**:
- `archive.records.length` is monotonically non-decreasing (append-only)
- For every `archive.index[key][i]`, `0 <= i < archive.records.length`
- `archive.version === 1` (until a future migration changes it)
- If `archive.records[n].source_id === 'GH-39'`, then `archive.index['GH-39']` contains `n`
- If `archive.records[n].slug === 'state-json-pruning-GH-39'`, then `archive.index['state-json-pruning-GH-39']` contains `n`

**Example** (after 2 workflows):

```json
{
    "version": 1,
    "records": [
        {
            "source_id": "GH-38",
            "slug": "feature-x-GH-38",
            "workflow_type": "feature",
            "completed_at": "2026-02-19T10:00:00.000Z",
            "branch": "feature/feature-x-GH-38",
            "outcome": "merged",
            "reason": null,
            "phase_summary": [
                { "phase": "01-requirements", "status": "completed", "summary": "Requirements gathered" },
                { "phase": "06-implementation", "status": "completed", "summary": "Implemented feature" }
            ],
            "metrics": { "total_duration_minutes": 90, "phases_completed": 6 }
        },
        {
            "source_id": "GH-39",
            "slug": "state-json-pruning-GH-39",
            "workflow_type": "feature",
            "completed_at": "2026-02-21T15:30:00.000Z",
            "branch": "feature/state-json-pruning-GH-39",
            "outcome": "merged",
            "reason": null,
            "phase_summary": [
                { "phase": "01-requirements", "status": "completed", "summary": "Pruning requirements" }
            ],
            "metrics": { "total_duration_minutes": 120 }
        }
    ],
    "index": {
        "GH-38": [0],
        "feature-x-GH-38": [0],
        "GH-39": [1],
        "state-json-pruning-GH-39": [1]
    }
}
```

### 2.2 ArchiveRecord

```typescript
interface ArchiveRecord {
    /** Issue/ticket identifier (e.g., "GH-39"). Null for untracked workflows. */
    source_id: string | null;

    /** Artifact folder name / workflow slug. Null for legacy entries. */
    slug: string | null;

    /** Workflow type: "feature", "fix", "refactor", etc. Null for legacy entries. */
    workflow_type: string | null;

    /** Completion timestamp in ISO-8601 format. REQUIRED. */
    completed_at: string;

    /** Git branch name. Null if no branch was created. */
    branch: string | null;

    /** Workflow outcome. REQUIRED. */
    outcome: 'merged' | 'completed' | 'cancelled' | 'abandoned';

    /** Cancellation or abandonment reason. Null for completed/merged workflows. */
    reason: string | null;

    /** Compact phase summaries. Empty array if no phase data available. */
    phase_summary: PhaseSummary[];

    /** Workflow metrics. Empty object if no metrics available. */
    metrics: object;
}
```

**Field Constraints**:

| Field | Type | Required | Nullable | Constraints |
|-------|------|----------|----------|-------------|
| `source_id` | `string` | No | Yes | If present, non-empty. Used as index key. |
| `slug` | `string` | No | Yes | If present, non-empty. Used as index key. |
| `workflow_type` | `string` | No | Yes | One of: `"feature"`, `"fix"`, `"refactor"`, `"chore"`, or null. |
| `completed_at` | `string` | **Yes** | No | ISO-8601 datetime string. Must be parseable by `new Date()`. |
| `branch` | `string` | No | Yes | Git branch name. No validation on format. |
| `outcome` | `string` | **Yes** | No | Enum: `"merged"`, `"completed"`, `"cancelled"`, `"abandoned"`. |
| `reason` | `string` | No | Yes | Free-text. Populated only for cancelled/abandoned outcomes. |
| `phase_summary` | `PhaseSummary[]` | No | No | Array (may be empty). Never null. |
| `metrics` | `object` | No | No | Object (may be empty). Never null. |

**Validation**: `appendToArchive()` does NOT validate the record schema. It appends whatever is passed. Schema validation is the caller's responsibility. The rationale is fail-open: a slightly malformed record is better than a lost record.

### 2.3 PhaseSummary

```typescript
interface PhaseSummary {
    /** Phase key (e.g., "01-requirements", "06-implementation"). */
    phase: string | null;

    /** Phase completion status. */
    status: string | null;

    /** One-line summary. Null if not available. */
    summary: string | null;
}
```

**Field Constraints**:

| Field | Type | Required | Nullable | Constraints |
|-------|------|----------|----------|-------------|
| `phase` | `string` | No | Yes | Expected format: `"NN-name"` (e.g., `"01-requirements"`). Not validated. |
| `status` | `string` | No | Yes | One of: `"completed"`, `"abandoned"`, `"skipped"`, or null. Not validated. |
| `summary` | `string` | No | Yes | Free-text, typically under 100 characters. |

### 2.4 LegacyWorkflowEntry (input to seedArchiveFromHistory)

This is the existing `workflow_history` entry format in state.json. Not owned by GH-39 -- documented here as an input contract.

```typescript
interface LegacyWorkflowEntry {
    id?: string;                    // -> source_id
    artifact_folder?: string;       // -> slug
    type?: string;                  // -> workflow_type
    status?: string;                // Used by _deriveOutcome()
    completed_at?: string;          // -> completed_at (primary)
    cancelled_at?: string;          // -> completed_at (fallback)
    cancellation_reason?: string;   // -> reason
    git_branch?: {
        name?: string;              // -> branch
        status?: string;            // Used by _deriveOutcome()
        created_from?: string;      // Dropped (not in archive schema)
        created_at?: string;        // Dropped
        merged_at?: string;         // Dropped
        merge_commit?: string;      // Dropped
    };
    phase_snapshots?: Array<{
        key?: string;               // -> phase_summary[].phase
        phase?: string;             // -> phase_summary[].phase (fallback)
        status?: string;            // -> phase_summary[].status
        summary?: string;           // -> phase_summary[].summary
        started?: string;           // Dropped
        completed?: string;         // Dropped
        timing?: object;            // Dropped
    }>;
    metrics?: object;               // -> metrics (direct copy)
}
```

---

## 3. Private Helper Interfaces

These functions are NOT exported. They exist in common.cjs as module-scoped helpers for `seedArchiveFromHistory`. Documented here for implementer and test reference.

### 3.1 _deriveOutcome(entry)

```typescript
/**
 * Derive archive outcome from a legacy workflow_history entry.
 * Priority: cancelled > merged > completed (default).
 *
 * @param entry - Legacy workflow_history entry
 * @returns One of: "merged", "completed", "cancelled", "abandoned"
 * @throws Never. Returns "completed" as default fallback.
 */
function _deriveOutcome(entry: LegacyWorkflowEntry): string;
```

**Decision Table**:

| `entry.status` | `entry.git_branch?.status` | Return |
|----------------|----------------------------|--------|
| `'cancelled'` | (any) | `'cancelled'` |
| (any except cancelled) | `'merged'` | `'merged'` |
| `'completed'` | (not merged) | `'completed'` |
| (any other) | (any other) | `'completed'` (default) |

Note: `'abandoned'` is never returned by `_deriveOutcome`. Abandoned workflows are only created by the orchestrator init path (FR-013), which sets `outcome: 'abandoned'` directly.

### 3.2 _compactPhaseSnapshots(snapshots)

```typescript
/**
 * Compact full phase_snapshots to phase_summary format.
 * Drops timing, started, completed fields. Keeps only phase, status, summary.
 *
 * @param snapshots - Full phase_snapshots array (or undefined/null)
 * @returns Compact array of { phase, status, summary }
 * @throws Never. Returns [] for non-array input.
 */
function _compactPhaseSnapshots(snapshots: any): PhaseSummary[];
```

**Transform**:

```javascript
// Input (legacy phase_snapshots entry):
{ key: '01-requirements', status: 'completed', summary: 'Done', started: '...', timing: {...} }

// Output (compact PhaseSummary):
{ phase: '01-requirements', status: 'completed', summary: 'Done' }
```

**Field Mapping**: `s.key || s.phase` -> `phase` (the `key` field comes from `collectPhaseSnapshots`; the `phase` field comes from entries already compacted by `seedArchiveFromHistory`).

---

## 4. Boundary Validation

### 4.1 Validation at Each Interface Boundary

| Interface | Validation Performed | Validation NOT Performed |
|-----------|---------------------|--------------------------|
| `resolveArchivePath(projectId)` | Falsy check on projectId (falls through to default) | No format validation on projectId string |
| `clearTransientFields(state)` | Falsy check on state (`if (!state) return state`) | No type check on state (truthy non-objects pass through) |
| `appendToArchive(record, projectId)` | None on record shape. Existence check on archive file. Structural check on loaded archive (`!archive \|\| !Array.isArray(archive.records)`). | No record schema validation. No type checking on record fields. |
| `seedArchiveFromHistory(history, projectId)` | `Array.isArray(history)` guard. `!record.completed_at` skip. Per-entry try/catch. | No type checking on individual entry fields. |
| `_deriveOutcome(entry)` | Implicit: optional chain `entry.git_branch?.status` | No null check on entry itself (caller's try/catch covers) |
| `_compactPhaseSnapshots(snapshots)` | `!Array.isArray(snapshots)` returns `[]` | No validation on individual snapshot objects |

### 4.2 Validation Rationale

The design deliberately avoids strict input validation at these boundaries for three reasons:

1. **Fail-open requirement (NFR-007)**: Rejecting a malformed record means losing it. Appending a partially malformed record preserves what data is available.
2. **Single caller context**: Each function has 1-2 callers, all within the same codebase. The callers construct records from known data structures.
3. **Performance (NFR-004)**: Schema validation on every append adds I/O overhead to the critical path.

### 4.3 Where Validation IS Critical

| Boundary | Validation | Why Critical |
|----------|-----------|--------------|
| Archive file structure on read | `!archive \|\| !Array.isArray(archive.records)` | Prevents TypeError when accessing `records.length`. Corrupt file recovery depends on this. |
| Index structure on write | `typeof archive.index !== 'object'` | Prevents property assignment on non-object. |
| Dedup fields | `lastRecord.slug === record.slug && lastRecord.completed_at === record.completed_at` | Both must be strict equality. Loose comparison could match `null === undefined`. |

---

## 5. Error Communication Across Interfaces

### 5.1 Error Communication Strategy

| Pattern | Where Used | Mechanism |
|---------|-----------|-----------|
| **Return input unchanged** | `clearTransientFields(null)` | Return `null`/`undefined` as-is. No error signal. |
| **Silent return (fire-and-forget)** | `appendToArchive` on any error | `debugLog()` to stderr, return `void`. Caller does not know if write succeeded. |
| **Skip-and-continue** | `seedArchiveFromHistory` per entry | `debugLog()` per skipped entry. Counter logged at end if skips > 0. |
| **Inherit from caller** | `resolveArchivePath` | Falls through to `getProjectRoot()` error handling (returns cwd). |

### 5.2 Error Propagation Map

```
Caller (enforcer/orchestrator)
  |
  | calls appendToArchive(record)
  |   |
  |   | resolveArchivePath(projectId)
  |   |   -> ERROR: falls back to cwd (getProjectRoot behavior)
  |   |   -> returns a path (possibly wrong, but never throws)
  |   |
  |   | fs.existsSync(dir) -> fs.mkdirSync
  |   |   -> ERROR: caught at top-level try/catch, logged, return void
  |   |
  |   | fs.existsSync(archivePath) -> fs.readFileSync -> JSON.parse
  |   |   -> PARSE ERROR: caught at inner try/catch, archive = null, continue with fresh
  |   |   -> READ ERROR (not ENOENT): caught at inner try/catch, archive = null
  |   |
  |   | Dedup check
  |   |   -> No error possible (property access on known-good objects)
  |   |
  |   | fs.writeFileSync
  |   |   -> ERROR: caught at top-level try/catch, logged, return void
  |   |
  |   | RESULT: void (caller never knows if it succeeded)
  |
  | continues to writeState(state) regardless of appendToArchive outcome
```

### 5.3 Debug Log Messages

All debug messages go to stderr via `debugLog()` -> `console.error('[skill-validator]', ...)` and are only visible when `SKILL_VALIDATOR_DEBUG=true`.

| Function | Message Pattern | Severity |
|----------|----------------|----------|
| `appendToArchive` | `'appendToArchive: corrupt archive file, creating fresh: {message}'` | Warning |
| `appendToArchive` | `'appendToArchive: duplicate detected, skipping'` | Info |
| `appendToArchive` | `'appendToArchive: error: {message}'` | Warning |
| `seedArchiveFromHistory` | `'seedArchiveFromHistory: skipping entry: {message}'` | Warning |
| `seedArchiveFromHistory` | `'seedArchiveFromHistory: seeded {n}, skipped {m}'` | Info |
| `workflow-completion-enforcer` | `'workflow-completion-enforcer: archive error: {message}'` | Warning |

---

## 6. Integration Interface: Enforcer-to-Common.cjs Contract

### 6.1 Invocation Sequence

The workflow-completion-enforcer calls common.cjs functions in this exact order:

```
1. pruneSkillUsageLog(state, 50)        // existing, updated arg
2. pruneCompletedPhases(state, [])       // existing, unchanged
3. pruneHistory(state, 100, 200)         // existing, updated arg
4. pruneWorkflowHistory(state, 50, 200)  // existing, unchanged
5. clearTransientFields(state)           // NEW
6. appendToArchive(archiveRecord)        // NEW (inside dedicated try/catch)
7. writeState(state)                     // existing
```

**Ordering Invariants**:
- Steps 1-5 MUST complete before step 7 (prune/clear state before writing)
- Step 6 MUST be before step 7 (archive before state write, for dedup on re-trigger)
- Step 6 failure MUST NOT prevent step 7 (dedicated try/catch around step 6)
- Steps 1-4 have no ordering dependency among themselves (but are called sequentially for readability)

### 6.2 Archive Record Construction (in enforcer)

The enforcer constructs the `ArchiveRecord` from `state.workflow_history[last]`:

```javascript
// Construction contract: enforcer -> appendToArchive
const lastEntry = state.workflow_history[state.workflow_history.length - 1];
const archiveRecord = {
    source_id:     lastEntry.id || null,
    slug:          lastEntry.artifact_folder || null,
    workflow_type: lastEntry.type || null,
    completed_at:  lastEntry.completed_at || lastEntry.cancelled_at || new Date().toISOString(),
    branch:        lastEntry.git_branch?.name || null,
    outcome:       lastEntry.status === 'cancelled' ? 'cancelled'
                 : lastEntry.git_branch?.status === 'merged' ? 'merged'
                 : 'completed',
    reason:        lastEntry.cancellation_reason || null,
    phase_summary: (lastEntry.phase_snapshots || []).map(s => ({
        phase:   s.key || s.phase,
        status:  s.status,
        summary: s.summary || null
    })),
    metrics:       lastEntry.metrics || {}
};
```

**completed_at Fallback Chain**: `completed_at` -> `cancelled_at` -> `new Date().toISOString()`

**outcome Decision**: Same priority as `_deriveOutcome` but inline (enforcer does not call the private helper).

### 6.3 Enforcer Import Contract

```javascript
// Enforcer MUST import these 2 new functions from common.cjs:
const {
    // ... existing imports ...
    clearTransientFields,    // FR-003, FR-005
    appendToArchive          // FR-011, FR-010
} = require('./lib/common.cjs');
```

---

## 7. Existing Prune Function Interface Updates

These are existing functions with updated default parameters. Signatures documented for completeness.

### 7.1 pruneSkillUsageLog(state, maxEntries?)

```typescript
function pruneSkillUsageLog(state: object, maxEntries?: number): object;
// Default change: maxEntries 20 -> 50 (FR-004, AC-004-01)
// Behavior: FIFO slice state.skill_usage_log to last maxEntries
```

### 7.2 pruneHistory(state, maxEntries?, maxCharLen?)

```typescript
function pruneHistory(state: object, maxEntries?: number, maxCharLen?: number): object;
// Default change: maxEntries 50 -> 100 (FR-004, AC-004-02)
// maxCharLen unchanged at 200
// Behavior: FIFO slice state.history to last maxEntries, truncate action strings
```

### 7.3 pruneCompletedPhases(state, protectedPhases?)

```typescript
function pruneCompletedPhases(state: object, protectedPhases?: string[]): object;
// No default changes
// Behavior: Remove completed phases from state.phases, add _pruned_at timestamp
```

### 7.4 pruneWorkflowHistory(state, maxEntries?, maxCharLen?)

```typescript
function pruneWorkflowHistory(state: object, maxEntries?: number, maxCharLen?: number): object;
// No default changes (stays at 50, 200)
// Behavior: FIFO slice state.workflow_history, compact git_branch, truncate descriptions
```

---

## 8. Versioning Considerations

### 8.1 Archive Format Versioning

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Version field | `archive.version = 1` | Integer, for future format migration |
| Checked on read? | No | appendToArchive does not check version. Future migration logic would. |
| Increment on write? | No | Version represents format, not concurrency. Unlike `state_version`. |
| Migration path | Future `migrateArchive(archive)` function if schema changes | Not implemented in GH-39. |

### 8.2 State Version Interaction

`appendToArchive()` does NOT interact with `state_version` in state.json. The archive file has its own `version` field (format version, not concurrency counter). The state-write-validator hook validates `state_version` on state.json writes only -- it does not inspect state-archive.json.

### 8.3 Backward Compatibility

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Old code reads new state.json | `pruning_migration_completed` flag is an unrecognized field | Old code ignores unknown fields (no schema validation on read) |
| New code reads old state.json | `pruning_migration_completed` is undefined | FR-009 migration runs (correct behavior for first run) |
| Old code encounters state-archive.json | File is ignored (no old code references it) | No impact |
| New code encounters missing state-archive.json | `appendToArchive` creates it fresh | Correct behavior |
| Archive format v2 in the future | New `migrateArchive` function reads version, transforms | Forward-compatible: version field exists from day one |

### 8.4 No Breaking Changes

All interfaces in this specification are additive:
- 4 new exports added to common.cjs `module.exports` (existing exports unchanged)
- 2 new imports in enforcer (existing imports unchanged)
- 1 new file (state-archive.json) created on first use
- 2 default parameter value changes (20->50, 50->100) -- callers passing explicit values are unaffected

No existing function signatures are changed. No existing return types are changed. No existing error behaviors are changed.

---

## Metadata

- **Step**: 04-02 (Interface Contracts)
- **Depth**: deep
- **Persona**: Jordan Park (System Designer)
- **Traces**: FR-003, FR-004, FR-005, FR-010, FR-011, FR-013, FR-014, FR-015
- **NFR Traces**: NFR-001 (must not break), NFR-004 (performance), NFR-006 (idempotent), NFR-007 (fail-open)
- **Dependencies**: module-design-common-cjs.md (step 04-01), module-design-enforcer.md (step 04-01)
