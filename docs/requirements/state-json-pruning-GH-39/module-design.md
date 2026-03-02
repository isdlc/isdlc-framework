# Module Design: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json pruning at workflow completion
**Phase**: 04-design (ANALYSIS MODE)
**Date**: 2026-02-20
**Traces to**: FR-001 through FR-009, NFR-001 through NFR-006
**Input**: requirements-spec.md, architecture-overview.md, impact-analysis.md

---

## 1. Per-File Change Specifications

### 1.1 `src/claude/hooks/lib/common.cjs`

#### Change A: Add `clearTransientFields()` function (FR-003)

**Location**: After line 2462 (after `pruneWorkflowHistory` function, before `resetPhasesForWorkflow`)

**Insert between**:
- Line 2462: closing `}` of `pruneWorkflowHistory`
- Line 2464: JSDoc comment for `resetPhasesForWorkflow`

**Exact code to insert** (after line 2462):

```javascript

/**
 * Reset all transient runtime fields to their null/empty defaults.
 * Called at workflow finalize to prevent stale data bleeding into
 * subsequent workflows.
 *
 * Pure function: takes state, mutates it, returns it.
 * Does NOT perform any disk I/O. Caller manages readState/writeState.
 *
 * Uses an explicit allowlist of 6 fields (ADR-002). New transient fields
 * added in the future must be explicitly added here.
 *
 * @param {Object} state - The state object to mutate
 * @returns {Object} The mutated state object (or original if null/undefined)
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

**Rationale**: Pure mutation function consistent with the 4 existing prune functions. Explicit 6-field allowlist per ADR-002. Null guard on line 1 matches the pattern in `pruneSkillUsageLog` (line 2365).

#### Change B: Update `pruneSkillUsageLog` default parameter (FR-004)

**Location**: Line 2364

**Old**:
```javascript
function pruneSkillUsageLog(state, maxEntries = 20) {
```

**New**:
```javascript
function pruneSkillUsageLog(state, maxEntries = 50) {
```

#### Change C: Update `pruneHistory` default parameter (FR-004)

**Location**: Line 2418

**Old**:
```javascript
function pruneHistory(state, maxEntries = 50, maxCharLen = 200) {
```

**New**:
```javascript
function pruneHistory(state, maxEntries = 100, maxCharLen = 200) {
```

#### Change D: Export `clearTransientFields` (FR-003)

**Location**: Line 3542 (inside `module.exports` block, after `pruneWorkflowHistory`)

**Old** (lines 3538-3543):
```javascript
    // State pruning (BUG-0004)
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory,
    resetPhasesForWorkflow,
```

**New**:
```javascript
    // State pruning (BUG-0004, GH-39)
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory,
    clearTransientFields,
    resetPhasesForWorkflow,
```

**Net change**: +24 lines (function body) + 1 line (export) + 2 lines (default param changes) = ~27 lines modified/added

---

### 1.2 `src/claude/hooks/workflow-completion-enforcer.cjs`

#### Change E: Import `clearTransientFields` (FR-005)

**Location**: Lines 29-40 (destructured import from common.cjs)

**Old** (lines 29-40):
```javascript
const {
    readState,
    writeState,
    debugLog,
    logHookEvent,
    outputSelfHealNotification,
    collectPhaseSnapshots,
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory
} = require('./lib/common.cjs');
```

**New**:
```javascript
const {
    readState,
    writeState,
    debugLog,
    logHookEvent,
    outputSelfHealNotification,
    collectPhaseSnapshots,
    pruneSkillUsageLog,
    pruneCompletedPhases,
    pruneHistory,
    pruneWorkflowHistory,
    clearTransientFields
} = require('./lib/common.cjs');
```

#### Change F: Update retention limits in prune calls (FR-004)

**Location**: Lines 219-222

**Old** (lines 218-222):
```javascript
        // Apply pruning (BUG-0004)
        pruneSkillUsageLog(state, 20);
        pruneCompletedPhases(state, []);
        pruneHistory(state, 50, 200);
        pruneWorkflowHistory(state, 50, 200);
```

**New** (lines 218-224):
```javascript
        // Apply pruning (BUG-0004, GH-39)
        pruneSkillUsageLog(state, 50);
        pruneCompletedPhases(state, []);
        pruneHistory(state, 100, 200);
        pruneWorkflowHistory(state, 50, 200);
        clearTransientFields(state);
```

**Net change**: 3 lines modified (import, two limit args), 1 line added (`clearTransientFields` import), 1 line added (`clearTransientFields` call) = ~5 lines changed

---

### 1.3 `src/claude/agents/00-sdlc-orchestrator.md`

#### Change G: Update MODE: finalize description (FR-006)

**Location**: Line 655

**Old** (line 655):
```
3. **finalize**: Human Review (if enabled) -> merge branch -> `collectPhaseSnapshots(state)` -> prune (`pruneSkillUsageLog(20)`, `pruneCompletedPhases([])`, `pruneHistory(50,200)`, `pruneWorkflowHistory(50,200)`) -> move to `workflow_history` (include `phase_snapshots`, `metrics`, `phases` array, and `review_history` if present) -> clear `active_workflow`.
```

**New** (line 655):
```
3. **finalize**: Human Review (if enabled) -> merge branch -> `collectPhaseSnapshots(state)` -> prune (`pruneCompletedPhases(state, [])`, `pruneSkillUsageLog(state, 50)`, `pruneHistory(state, 100, 200)`, `pruneWorkflowHistory(state, 50, 200)`, `clearTransientFields(state)`) -> move to `workflow_history` (include `phase_snapshots`, `metrics`, `phases` array, and `review_history` if present) -> clear `active_workflow`.
```

**Changes from old to new**:
1. Updated `pruneSkillUsageLog(20)` to `pruneSkillUsageLog(state, 50)` -- added `state` param, changed limit 20->50
2. Updated `pruneHistory(50,200)` to `pruneHistory(state, 100, 200)` -- added `state` param, changed limit 50->100
3. Added `state` param to `pruneCompletedPhases` and `pruneWorkflowHistory` for consistency
4. Added `clearTransientFields(state)` at the end of the prune list
5. Reordered: `pruneCompletedPhases` now first (must run before phases are cleared)

#### Change H: Update Workflow Completion steps (FR-006)

**Location**: Lines 688-695

**Old** (lines 688-695):
```markdown
### Workflow Completion

When the last phase completes:
1. If git branch exists: Human Review -> merge (on conflict: STOP, escalate; on reject: cancel)
2. `collectPhaseSnapshots(state)` -> `{ phase_snapshots, metrics }` (BEFORE pruning)
3. Prune: `pruneSkillUsageLog(20)`, `pruneCompletedPhases([])`, `pruneHistory(50,200)`, `pruneWorkflowHistory(50,200)`
4. Move to `workflow_history` with: `status: "completed"`, `phases` (array copy), `phase_snapshots`, `metrics`, `id` (`{prefix}-{NNNN}`), `merged_commit` (short SHA or null), `git_branch` info
5. Set `active_workflow = null`, display completion summary
```

**New**:
```markdown
### Workflow Completion

When the last phase completes:
1. If git branch exists: Human Review -> merge (on conflict: STOP, escalate; on reject: cancel)
2. `collectPhaseSnapshots(state)` -> `{ phase_snapshots, metrics }` (BEFORE pruning -- snapshots read phase sub-objects that pruning strips)
3. Apply state pruning (all operations are fail-open -- if any step fails, skip it and continue):
   a. `pruneCompletedPhases(state, [])` -- strip verbose sub-objects (iteration_requirements, constitutional_validation, gate_validation, testing_environment, verification_summary, atdd_validation) from completed phases
   b. `pruneSkillUsageLog(state, 50)` -- keep most recent 50 skill log entries
   c. `pruneHistory(state, 100, 200)` -- keep most recent 100 history entries, truncate action strings > 200 chars
   d. `pruneWorkflowHistory(state, 50, 200)` -- keep most recent 50 workflow history entries, truncate descriptions > 200 chars, compact git_branch
   e. `clearTransientFields(state)` -- reset: `current_phase` to `null`, `active_agent` to `null`, `phases` to `{}`, `blockers` to `[]`, `pending_escalations` to `[]`, `pending_delegation` to `null`
4. Move to `workflow_history` with: `status: "completed"`, `phases` (array copy from `active_workflow.phases`, NOT from `state.phases` which was just cleared), `phase_snapshots`, `metrics` (from step 2), `id` (`{prefix}-{NNNN}`), `merged_commit` (short SHA or null), `git_branch` info
5. Set `active_workflow = null`, display completion summary
```

**Key changes**:
1. Step 3 expanded from 1-line shorthand to detailed sub-steps with explicit retention limits
2. Each sub-step has a description of what it does (for LLM clarity)
3. Added fail-open instruction at the top of step 3
4. Step 4 clarifies: `phases` array comes from `active_workflow.phases`, NOT from `state.phases` (which `clearTransientFields` just set to `{}`)
5. `clearTransientFields` fields are enumerated explicitly so the LLM knows what to write

#### Change I: Add migration step to Initialization Process (FR-009)

**Location**: After step 1 in Section 3 "Initialization Process" (after line 310, before step 2)

**Insert after line 310** (`1. **Validate prerequisites:**`) block:

```markdown
1b. **One-time state pruning migration** (GH-39):
   - Check: does `state.pruning_migration_completed` exist and equal `true`?
   - If YES: skip (migration already applied)
   - If NO and `active_workflow` is `null`:
     a. `pruneSkillUsageLog(state, 50)`
     b. `pruneCompletedPhases(state, [])`
     c. `pruneHistory(state, 100, 200)`
     d. `pruneWorkflowHistory(state, 50, 200)`
     e. `clearTransientFields(state)` (safe because no active workflow)
     f. Set `state.pruning_migration_completed = true`
     g. Write state
   - If NO and `active_workflow` is NOT null:
     a. Apply only FIFO pruning (steps a-d above), skip `clearTransientFields`
     b. Set `state.pruning_migration_completed = true`
     c. Write state
   - This is fail-open: if any step errors, skip migration and continue with init
```

**Net change**: ~20 lines added to orchestrator

---

### 1.4 `src/claude/commands/isdlc.md` (Optional)

#### Change J: Update STEP 4 finalize description (FR-006)

**Location**: Line 2101

**Old** (line 2101):
```
After Jira sync, the orchestrator collects workflow progress snapshots (`collectPhaseSnapshots()`), applies state pruning, moves the workflow to `workflow_history` (with `phases`, `phase_snapshots`, and `metrics`), and clears `active_workflow`.
```

**New**:
```
After Jira sync, the orchestrator collects workflow progress snapshots (`collectPhaseSnapshots()`), applies state pruning (prune completed phases, cap skill_usage_log at 50, history at 100, workflow_history at 50, and clear transient fields), moves the workflow to `workflow_history` (with `phases`, `phase_snapshots`, and `metrics`), and clears `active_workflow`.
```

**Net change**: 1 line modified (minor rewording)

---

## 2. clearTransientFields() Implementation Design

### 2.1 Function Signature

```javascript
function clearTransientFields(state)
```

- **Parameter**: `state` (Object) -- the full state.json object, already in memory
- **Returns**: `state` (Object) -- the same object, mutated, for chaining
- **Side effects**: None (pure mutation, no I/O)
- **Error behavior**: Returns `state` unchanged if `state` is falsy (null, undefined)

### 2.2 Fields Reset

| # | Field Path | Type | Reset Value | Guard Needed |
|---|-----------|------|-------------|-------------|
| 1 | `state.current_phase` | string/null | `null` | No -- assignment to null is always safe |
| 2 | `state.active_agent` | string/null | `null` | No |
| 3 | `state.phases` | object | `{}` | No -- empty object is the expected "no workflow" state |
| 4 | `state.blockers` | array | `[]` | No |
| 5 | `state.pending_escalations` | array | `[]` | No -- hooks check `Array.isArray(state.pending_escalations)`, and `[]` passes |
| 6 | `state.pending_delegation` | object/null | `null` | No -- hooks check via `readPendingDelegation()` which returns `state.pending_delegation || null` |

### 2.3 Fields NOT Reset (Durable -- Must Remain Untouched)

| Field | Reason |
|-------|--------|
| `framework_version` | Project identity |
| `project` | Project metadata |
| `complexity_assessment` | Project-level assessment |
| `workflow` | Workflow track config |
| `constitution` | Governance |
| `autonomous_iteration` | Governance settings |
| `skill_enforcement` | Enforcement config |
| `cloud_configuration` | Deployment settings |
| `iteration_enforcement` | Enforcement flag |
| `discovery_context` | Discovery results |
| `counters` | Monotonic counters (next_req_id, next_bug_id) |
| `state_version` | Optimistic concurrency counter |
| `skill_usage_log` | Bounded array (pruned separately) |
| `workflow_history` | Bounded array (pruned separately) |
| `history` | Bounded array (pruned separately) |
| `active_workflow` | Cleared separately by orchestrator (step 11 in finalize) |
| `code_review` | Configuration (durable) |
| `supervised_mode` | Configuration (durable) |
| `pruning_migration_completed` | Migration flag (durable, FR-009) |

### 2.4 Why NOT Reset `active_workflow`

`active_workflow` is set to `null` by the orchestrator in a separate step (step 11) AFTER the workflow_history entry is constructed. If `clearTransientFields` set it to `null`, the orchestrator would lose access to `active_workflow.phases` needed to build the `workflow_history.phases` array in step 10. The function's scope is limited to the 6 fields that have no ordering dependency with other finalize steps.

### 2.5 Relationship to Existing clearPending* Functions

```
clearPendingEscalations()       -- Standalone I/O: calls readState(), sets [], calls writeState()
clearPendingDelegation()        -- Standalone I/O: calls readState(), sets null, calls writeState()
clearTransientFields(state)     -- Pure mutation: takes state param, resets 6 fields, returns state
```

Both patterns coexist. The standalone functions are called by individual hooks during active workflows (e.g., after processing an escalation). The new function is for the finalize sequence where a single readState/writeState brackets multiple mutations.

---

## 3. Orchestrator Prompt Additions

### 3.1 MODE: finalize (Change G -- Exact Text)

Replace the single line 655 in `00-sdlc-orchestrator.md`. The old line:

```
3. **finalize**: Human Review (if enabled) -> merge branch -> `collectPhaseSnapshots(state)` -> prune (`pruneSkillUsageLog(20)`, `pruneCompletedPhases([])`, `pruneHistory(50,200)`, `pruneWorkflowHistory(50,200)`) -> move to `workflow_history` (include `phase_snapshots`, `metrics`, `phases` array, and `review_history` if present) -> clear `active_workflow`.
```

becomes:

```
3. **finalize**: Human Review (if enabled) -> merge branch -> `collectPhaseSnapshots(state)` -> prune (`pruneCompletedPhases(state, [])`, `pruneSkillUsageLog(state, 50)`, `pruneHistory(state, 100, 200)`, `pruneWorkflowHistory(state, 50, 200)`, `clearTransientFields(state)`) -> move to `workflow_history` (include `phase_snapshots`, `metrics`, `phases` array, and `review_history` if present) -> clear `active_workflow`.
```

### 3.2 Workflow Completion (Change H -- Exact Text)

Replace lines 688-695 with the expanded version shown in Section 1.3, Change H above. The key design decisions for the prompt wording:

1. **Explicit retention limits** in the prompt text (`50`, `100`, `50`) because the orchestrator is an LLM that reads values from its prompt, not from JavaScript function defaults.
2. **Fail-open instruction** at step 3 header: "all operations are fail-open -- if any step fails, skip it and continue". This tells the LLM to not abort finalize if pruning errors occur.
3. **Enumerated field resets** in step 3e: listing all 6 fields and their reset values explicitly so the LLM writes the correct JSON.
4. **Step 4 clarification**: the `phases` array in the workflow_history entry comes from `active_workflow.phases` (which is still populated at this point), NOT from `state.phases` (which step 3e just cleared to `{}`).

### 3.3 Migration Step (Change I -- Exact Text)

Insert the migration step shown in Section 1.3, Change I, into the Initialization Process section. The migration text is self-contained and includes:
- Idempotency guard (`pruning_migration_completed` flag)
- Safety guard (different behavior when `active_workflow` is null vs not)
- Fail-open wrapper
- Explicit function calls with retention limits

---

## 4. Enforcer Update Design

### 4.1 Current Call Site (Lines 218-222)

```javascript
// Apply pruning (BUG-0004)
pruneSkillUsageLog(state, 20);
pruneCompletedPhases(state, []);
pruneHistory(state, 50, 200);
pruneWorkflowHistory(state, 50, 200);
```

### 4.2 Updated Call Site

```javascript
// Apply pruning (BUG-0004, GH-39)
pruneSkillUsageLog(state, 50);
pruneCompletedPhases(state, []);
pruneHistory(state, 100, 200);
pruneWorkflowHistory(state, 50, 200);
clearTransientFields(state);
```

### 4.3 Error Handling

No additional try/catch is needed. The entire `check()` function is already wrapped in a top-level try/catch (lines 64-245). The new `clearTransientFields(state)` call at line 223 is inside this existing catch boundary. If `clearTransientFields` throws (which it should not since it only does property assignments), the top-level catch returns `{ decision: 'allow', stateModified: false }`, preserving fail-open behavior (NFR-001, CON-004).

### 4.4 Enforcer Guard Behavior

The enforcer's existing guards (lines 99-133) determine whether the prune sequence runs:
1. `active_workflow` must be `null` (workflow completed)
2. `workflow_history` must have at least one entry
3. Last entry must be recent (< 2 minutes old)
4. Last entry must be missing `phase_snapshots` OR `metrics`

If the orchestrator already pruned correctly (primary path), guard #4 will fail (snapshots exist), and the enforcer exits early without pruning. The prune sequence only runs when the enforcer is self-healing -- which is the correct fallback behavior.

### 4.5 Synchronization Requirement

The retention limits in the enforcer (lines 219, 221) MUST match those in the orchestrator prompt (line 655 and lines 693-694). Both call sites must use:

| Function | Value |
|----------|-------|
| `pruneSkillUsageLog` | `50` |
| `pruneHistory` | `100, 200` |
| `pruneWorkflowHistory` | `50, 200` |

If one is updated, the other MUST be updated in the same commit to prevent drift.

---

## 5. Retention Limit Changes

### 5.1 Constants to Update

| Location | Function | Old Default | New Default | Line |
|----------|----------|-------------|-------------|------|
| `common.cjs` function signature | `pruneSkillUsageLog` | `maxEntries = 20` | `maxEntries = 50` | 2364 |
| `common.cjs` function signature | `pruneHistory` | `maxEntries = 50` | `maxEntries = 100` | 2418 |
| `workflow-completion-enforcer.cjs` call | `pruneSkillUsageLog` | `state, 20` | `state, 50` | 219 |
| `workflow-completion-enforcer.cjs` call | `pruneHistory` | `state, 50, 200` | `state, 100, 200` | 221 |
| `00-sdlc-orchestrator.md` text | `pruneSkillUsageLog` | `(20)` | `(state, 50)` | 655 |
| `00-sdlc-orchestrator.md` text | `pruneHistory` | `(50,200)` | `(state, 100, 200)` | 655, 693 |

### 5.2 Unchanged Constants

| Function | Current Default | New Default | Reason |
|----------|----------------|-------------|--------|
| `pruneWorkflowHistory` | `maxEntries = 50` | `50` (no change) | 1 entry per workflow; 50 gives ~50 workflows of history |
| `pruneCompletedPhases` | `protectedPhases = []` | `[]` (no change) | No protected phases at finalize |
| All `maxCharLen` params | `200` | `200` (no change) | Adequate for description/action truncation |

### 5.3 Impact of Changes

Current array sizes vs. new caps:

| Array | Current Size | New Cap | Pruned at Deploy? |
|-------|-------------|---------|------------------|
| `skill_usage_log` | 22 entries | 50 | NO (22 < 50) |
| `history` | 46 entries | 100 | NO (46 < 100) |
| `workflow_history` | 18 entries | 50 | NO (18 < 50) |

Increasing the cap means LESS pruning, not more. Zero data loss on deployment.

---

## 6. Test Case Specifications

### 6.1 File: `src/claude/hooks/tests/prune-functions.test.cjs`

**Test framework**: `node:test` (built-in, consistent with existing tests)
**Assertion library**: `node:assert/strict`
**Pattern**: Follow `cleanup-completed-workflow.test.cjs` pattern -- import functions directly from common.cjs, test with synthetic state objects (no disk I/O needed for pure functions)

#### Test Suite: `pruneSkillUsageLog`

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `should return state unchanged when skill_usage_log is missing` | `{ project: {} }` | `state.skill_usage_log === undefined` | NFR-004 |
| `should return state unchanged when skill_usage_log is not an array` | `{ skill_usage_log: "invalid" }` | `state.skill_usage_log === "invalid"` | NFR-004 |
| `should not remove entries when array is below cap` | 30 entries, cap 50 | `state.skill_usage_log.length === 30` | AC-004-04 |
| `should not remove entries when array is at cap` | 50 entries, cap 50 | `state.skill_usage_log.length === 50` | AC-004-04 |
| `should remove oldest entries when array exceeds cap` | 80 entries, cap 50 | `state.skill_usage_log.length === 50`, first entry is entry #31 | AC-001-01 |
| `should use default cap of 50` | 80 entries, no cap arg | `state.skill_usage_log.length === 50` | AC-004-01 |
| `should return the mutated state object` | any | `result === state` (reference equality) | AC-003-07 pattern |

#### Test Suite: `pruneCompletedPhases`

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `should return state unchanged when phases is missing` | `{ project: {} }` | no error thrown | NFR-004 |
| `should return state unchanged when phases is not an object` | `{ phases: "invalid" }` | no error thrown | NFR-004 |
| `should strip verbose fields from completed phases` | phase with `status: "completed"` and all 6 STRIP_FIELDS | all 6 fields deleted, `_pruned_at` added | AC-001-02 |
| `should strip verbose fields from gate_passed phases` | phase with `gate_passed: true` | fields stripped | |
| `should not strip fields from pending phases` | phase with `status: "pending"` | all fields preserved | |
| `should not strip fields from protected phases` | completed phase in protectedPhases array | all fields preserved | |
| `should add _pruned_at timestamp to stripped phases` | completed phase | `_pruned_at` is ISO-8601 string | |
| `should preserve status, started, completed, gate_passed, artifacts, timing, summary` | completed phase with all fields | preserved fields still exist after strip | |

#### Test Suite: `pruneHistory`

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `should return state unchanged when history is missing` | `{ project: {} }` | no error | NFR-004 |
| `should return state unchanged when history is not an array` | `{ history: {} }` | no error | NFR-004 |
| `should not remove entries when below cap` | 50 entries, cap 100 | length === 50 | AC-004-04 |
| `should remove oldest entries when above cap` | 150 entries, cap 100 | length === 100, first entry is #51 | AC-001-03 |
| `should truncate long action strings` | entry with 300-char action | `action.length === 203` (200 + "...") | |
| `should not truncate short action strings` | entry with 50-char action | `action.length === 50` | |
| `should handle entries without action field` | `{ timestamp: "..." }` | no error | NFR-004 |
| `should use default cap of 100` | 150 entries, no cap arg | length === 100 | AC-004-02 |

#### Test Suite: `pruneWorkflowHistory`

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `should return state unchanged when workflow_history is missing` | `{}` | no error | NFR-004 |
| `should not remove entries when below cap` | 30 entries, cap 50 | length === 30 | AC-004-04 |
| `should remove oldest entries when above cap` | 80 entries, cap 50 | length === 50 | AC-001-04 |
| `should truncate long description strings` | entry with 300-char description | `description.length === 203` | |
| `should compact git_branch to name only` | entry with full git_branch | `git_branch` has only `name` key | |
| `should handle entries without git_branch` | entry without git_branch | no error | NFR-004 |
| `should handle null git_branch` | `{ git_branch: null }` | no error | NFR-004 |
| `should use default cap of 50` | 80 entries, no cap arg | length === 50 | AC-004-03 |

#### Test Suite: `clearTransientFields`

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `should return null/undefined state unchanged` | `null` | `result === null` | AC-003-07 |
| `should reset current_phase to null` | `{ current_phase: "06-implementation" }` | `state.current_phase === null` | AC-003-03 |
| `should reset active_agent to null` | `{ active_agent: "software-developer" }` | `state.active_agent === null` | AC-003-04 |
| `should reset phases to empty object` | `{ phases: { "01-requirements": { status: "completed" } } }` | `deepEqual(state.phases, {})` | AC-003-05 |
| `should reset blockers to empty array` | `{ blockers: [{ type: "test" }] }` | `deepEqual(state.blockers, [])` | AC-002-06 |
| `should reset pending_escalations to empty array` | `{ pending_escalations: [{ type: "gate_failure" }] }` | `deepEqual(state.pending_escalations, [])` | AC-003-01 |
| `should reset pending_delegation to null` | `{ pending_delegation: { skill: "test", invoked_at: "2026-01-01" } }` | `state.pending_delegation === null` | AC-003-02 |
| `should not modify durable fields` | full state with all durable + transient fields | all 12 durable fields unchanged (deep equality) | AC-003-08, NFR-003 |
| `should return the mutated state object` | any | `result === state` (reference equality) | AC-003-07 |
| `should handle state with missing transient fields` | `{ project: { name: "test" } }` | `state.current_phase === null`, no error | NFR-004 |
| `should set fields even if they did not previously exist` | `{}` | all 6 fields exist with their reset values | |

#### Test Suite: Cross-Cutting (Idempotency)

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `pruneSkillUsageLog is idempotent` | 80 entries | `JSON.stringify(f(f(state))) === JSON.stringify(f(state))` | NFR-006 |
| `pruneCompletedPhases is idempotent` | completed phases | after 2nd call, no additional changes (except _pruned_at timestamp may differ -- use fixed mock or ignore) | NFR-006 |
| `pruneHistory is idempotent` | 150 entries with long actions | identical after 2nd call | NFR-006 |
| `pruneWorkflowHistory is idempotent` | 80 entries | identical after 2nd call | NFR-006 |
| `clearTransientFields is idempotent` | full transient state | identical after 2nd call | NFR-006 |
| `full prune sequence is idempotent` | full state with all fields | run all 5 functions twice, compare JSON | NFR-006 |

#### Test Suite: Cross-Cutting (Durable Field Protection)

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `full prune sequence does not modify any durable field` | state with all durable fields populated + transient + bounded fields | after running all 5 functions, every durable field passes deep equality check | NFR-003 |

**Fixture for durable field protection test**:

```javascript
function fullState() {
    return {
        // Durable fields (must survive pruning)
        framework_version: "0.1.0-alpha",
        project: { name: "test-project", created: "2026-01-01", description: "Test" },
        complexity_assessment: { level: "medium", track: "standard" },
        workflow: { track: "standard" },
        constitution: { enforced: true, articles: ["I", "II"] },
        autonomous_iteration: { max_iterations: 5 },
        skill_enforcement: { mode: "advisory" },
        cloud_configuration: { provider: "aws" },
        iteration_enforcement: { enabled: true },
        discovery_context: { tech_stack: "node" },
        counters: { next_req_id: 15, next_bug_id: 30 },
        state_version: 42,
        // Bounded fields (pruned but not deleted)
        skill_usage_log: generateEntries(80),
        history: generateHistoryEntries(150),
        workflow_history: generateWorkflowEntries(80),
        // Transient fields (cleared)
        current_phase: "06-implementation",
        active_agent: "software-developer",
        phases: { "01-requirements": { status: "completed", iteration_requirements: {} } },
        blockers: [{ type: "test" }],
        pending_escalations: [{ type: "gate_failure" }],
        pending_delegation: { skill: "test" },
        active_workflow: null
    };
}
```

**Estimated line count**: ~300-350 lines

### 6.2 File: `src/claude/hooks/tests/workflow-completion-enforcer.test.cjs`

**Test framework**: `node:test`
**Pattern**: Mock the file system I/O using temp directories (same pattern as `cleanup-completed-workflow.test.cjs`)

#### Test Suite: `workflow-completion-enforcer`

| Test Name | Fixture | Assertion | Traces |
|-----------|---------|-----------|--------|
| `should call clearTransientFields after pruning` | state with missing snapshots, recent entry | after check(), state on disk has all 6 transient fields reset | AC-005-01, AC-005-02 |
| `should use updated retention limit 50 for pruneSkillUsageLog` | state with 80 skill_usage_log entries | after check(), `skill_usage_log.length === 50` | FR-004 |
| `should use updated retention limit 100 for pruneHistory` | state with 150 history entries | after check(), `history.length === 100` | FR-004 |
| `should skip remediation when snapshots already exist` | state with snapshots present | no state modification | |
| `should skip remediation when entry is stale` | entry older than 2 minutes | no state modification | |
| `should skip remediation when active_workflow is present` | `active_workflow: { ... }` | no state modification | |
| `should handle clearTransientFields error gracefully (fail-open)` | inject error via monkeypatch | check() returns `{ decision: 'allow' }`, no throw | NFR-001 |
| `should write state back to disk after remediation` | missing snapshots state | state.json on disk contains remediated data | |

**Testing approach for the enforcer**: Because the enforcer does its own `readState()`/`writeState()`, tests must:
1. Create a temp directory with `.isdlc/state.json`
2. Set `CLAUDE_PROJECT_DIR` env var to the temp directory
3. Require the enforcer module (with fresh `require.cache`)
4. Call `check(ctx)` with appropriate input
5. Read state.json from disk and verify

**Estimated line count**: ~150-180 lines

---

## 7. Implementation Sequence

### Step 1: Add `clearTransientFields()` to common.cjs (FR-003, FR-004)

**Files**: `src/claude/hooks/lib/common.cjs`
**Changes**: A, B, C, D (from Section 1.1)
**Details**:
1. Insert `clearTransientFields()` function after line 2462 (Change A)
2. Update `pruneSkillUsageLog` default: `20` -> `50` on line 2364 (Change B)
3. Update `pruneHistory` default: `50` -> `100` on line 2418 (Change C)
4. Add `clearTransientFields` to `module.exports` after `pruneWorkflowHistory` (Change D)

**Verification**: `node -e "const c = require('./src/claude/hooks/lib/common.cjs'); console.log(typeof c.clearTransientFields);"` should print `function`

### Step 2: Write `prune-functions.test.cjs` (All FRs)

**Files**: `src/claude/hooks/tests/prune-functions.test.cjs` (NEW)
**Details**: Create the test file per Section 6.1. All tests should pass on the CURRENT code (after Step 1) -- this validates the existing prune functions AND the new `clearTransientFields`.

**Verification**: `node --test src/claude/hooks/tests/prune-functions.test.cjs` should pass all tests

**TDD note**: The tests for existing functions (pruneSkillUsageLog, etc.) validate CURRENT behavior. The updated default parameters (Step 1) are tested by the "should use default cap of N" tests. If any existing function has a bug, the test will catch it here, BEFORE we wire it into new call sites.

### Step 3: Update `workflow-completion-enforcer.cjs` (FR-005, FR-004)

**Files**: `src/claude/hooks/workflow-completion-enforcer.cjs`
**Changes**: E, F (from Section 1.2)
**Details**:
1. Add `clearTransientFields` to destructured import (Change E)
2. Update retention limits and add `clearTransientFields(state)` call (Change F)

**Verification**: `node -e "require('./src/claude/hooks/workflow-completion-enforcer.cjs')"` should not throw

### Step 4: Write `workflow-completion-enforcer.test.cjs` (FR-005)

**Files**: `src/claude/hooks/tests/workflow-completion-enforcer.test.cjs` (NEW)
**Details**: Create the test file per Section 6.2.

**Verification**: `node --test src/claude/hooks/tests/workflow-completion-enforcer.test.cjs` should pass all tests

### Step 5: Update `00-sdlc-orchestrator.md` (FR-006, FR-009)

**Files**: `src/claude/agents/00-sdlc-orchestrator.md`
**Changes**: G, H, I (from Section 1.3)
**Details**:
1. Replace MODE: finalize description on line 655 (Change G)
2. Replace Workflow Completion steps on lines 688-695 (Change H)
3. Insert migration step in Initialization Process after line 310 (Change I)

**Verification**: Manual review of prompt text. No executable verification needed (markdown file).

### Step 6: Update `isdlc.md` (Optional, FR-006)

**Files**: `src/claude/commands/isdlc.md`
**Changes**: J (from Section 1.4)
**Details**: Update line 2101 to mention the specific pruning operations.

**Verification**: Manual review.

### Step 7: Run full test suite

**Command**: `node --test src/claude/hooks/tests/prune-functions.test.cjs src/claude/hooks/tests/workflow-completion-enforcer.test.cjs`
**Also run**: `node --test src/claude/hooks/tests/` (full test suite to verify no regressions)

---

## 8. Finalize Sequence -- Complete Ordered Operation List

This is the definitive operation sequence for the orchestrator's MODE: finalize, incorporating all changes from this design.

```
 1. Human Review checkpoint (if supervised mode enabled)
 2. Merge git branch (if branch exists)
 3. readState()
 4. collectPhaseSnapshots(state)     -- Returns { phase_snapshots, metrics }
                                      -- MUST run before step 5 (reads phase sub-objects
                                      -- that step 5 strips)
 5. pruneCompletedPhases(state, [])  -- Strip: iteration_requirements,
                                      --   constitutional_validation, gate_validation,
                                      --   testing_environment, verification_summary,
                                      --   atdd_validation
                                      -- Add: _pruned_at timestamp
 6. pruneSkillUsageLog(state, 50)    -- FIFO: keep most recent 50 entries
 7. pruneHistory(state, 100, 200)    -- FIFO: keep most recent 100 entries
                                      -- Truncate: action strings > 200 chars
 8. pruneWorkflowHistory(state, 50, 200)
                                      -- FIFO: keep most recent 50 entries
                                      -- Truncate: description > 200 chars
                                      -- Compact: git_branch to { name }
 9. clearTransientFields(state)      -- Reset: current_phase=null, active_agent=null,
                                      --   phases={}, blockers=[], pending_escalations=[],
                                      --   pending_delegation=null
10. Construct workflow_history entry:
      - id: "{prefix}-{NNNN}"
      - status: "completed"
      - phases: [...active_workflow.phases]     (array COPY, not state.phases)
      - phase_snapshots: from step 4
      - metrics: from step 4
      - started_at: active_workflow.started_at
      - completed_at: new Date().toISOString()
      - description: active_workflow.description
      - merged_commit: short SHA or null
      - git_branch: active_workflow.git_branch
      - review_history: (if supervised mode)
      - supervised_mode_enabled: true/false
      - sizing: active_workflow.sizing (if present)
11. Push entry to state.workflow_history[]
12. state.active_workflow = null
13. writeState(state)
14. Display completion summary
```

**Critical ordering constraints**:
- Step 4 BEFORE Step 5: `collectPhaseSnapshots` reads `state.phases` sub-objects that `pruneCompletedPhases` strips
- Step 9 BEFORE Step 10: Clearing `phases` to `{}` means step 10 must use `active_workflow.phases` (not `state.phases`) for the phases array
- Step 10 BEFORE Step 12: Step 12 sets `active_workflow` to `null`, so step 10 must read from it first

---

## 9. Migration Design (FR-009)

### 9.1 Trigger

The migration runs during orchestrator MODE: init (Section 3, Initialization Process), after prerequisite validation (step 1) and before workflow definition loading (step 2).

### 9.2 Guard Conditions

```
IF state.pruning_migration_completed === true:
    SKIP migration (already applied)

IF state.active_workflow === null:
    Apply full prune sequence including clearTransientFields
    Set state.pruning_migration_completed = true

IF state.active_workflow !== null:
    Apply FIFO pruning only (steps a-d), skip clearTransientFields
    Set state.pruning_migration_completed = true
```

### 9.3 `pruning_migration_completed` Field

- **Type**: boolean
- **Location**: top-level in state.json
- **Category**: Durable (once set, never cleared)
- **Size impact**: ~35 bytes (key + value)

### 9.4 Idempotency

Even without the flag, all prune operations are idempotent. The flag prevents unnecessary processing on every init, not data corruption from re-execution.

---

## 10. Error Handling Summary

| Call Site | Error Handling | Mechanism | Traces |
|-----------|---------------|-----------|--------|
| Orchestrator finalize (primary path) | Fail-open, skip on error | Prompt instruction: "if any step fails, skip it and continue" | NFR-001 |
| Enforcer fallback path | Fail-open, top-level try/catch | JavaScript try/catch at lines 64-245 | NFR-001, CON-004 |
| Migration (init path) | Fail-open, skip migration | Prompt instruction: "if any step errors, skip migration and continue with init" | NFR-001 |
| `clearTransientFields` itself | Null guard on entry | `if (!state) return state;` | NFR-004 |
| All prune functions | Null/type guards on entry | Each checks for missing/invalid field before operating | NFR-004 |

---

## 11. Traceability Matrix

| FR/NFR | Implementation Artifact | Test Case(s) |
|--------|------------------------|--------------|
| FR-001 (wire prune into finalize) | Change H (orchestrator Workflow Completion) | Integration: orchestrator produces pruned state (manual verification via workflow run) |
| FR-002 (clear transient fields) | Change A (clearTransientFields function) | `clearTransientFields` test suite (8 tests) |
| FR-003 (add clearTransientFields) | Change A (function body), Change D (export) | `clearTransientFields` test suite (8 tests) |
| FR-004 (retention limits) | Changes B, C (defaults), Change F (enforcer args), Changes G, H (prompt) | `should use default cap of N` tests for each function |
| FR-005 (enforcer update) | Changes E, F (import + call) | Enforcer test suite (8 tests) |
| FR-006 (orchestrator instructions) | Changes G, H (prompt text) | Manual verification (prompt file) |
| FR-007 (compact snapshots) | Deferred (Could Have) | -- |
| FR-008 (compact git_branch) | Deferred (Could Have) | -- |
| FR-009 (migration) | Change I (init step) | Manual verification via first workflow after deploy |
| NFR-001 (non-blocking) | Fail-open design at all 3 call sites | Enforcer fail-open test |
| NFR-003 (no durable data loss) | Explicit 6-field allowlist in clearTransientFields | `full prune sequence does not modify any durable field` test |
| NFR-004 (backward compat) | Null/type guards in all functions | `should return state unchanged when X is missing` tests |
| NFR-006 (idempotent) | FIFO slices, field resets to fixed values | Idempotency test suite (6 tests) |

---

## 12. File Change Summary

| # | File | Change Type | Lines Changed | Risk |
|---|------|------------|---------------|------|
| 1 | `src/claude/hooks/lib/common.cjs` | Add function + update defaults + export | ~27 lines | LOW |
| 2 | `src/claude/hooks/workflow-completion-enforcer.cjs` | Import + call + update args | ~5 lines | LOW |
| 3 | `src/claude/agents/00-sdlc-orchestrator.md` | Prompt text updates in 3 sections | ~30 lines | LOW |
| 4 | `src/claude/commands/isdlc.md` | Minor text update (optional) | ~1 line | VERY LOW |
| 5 | `src/claude/hooks/tests/prune-functions.test.cjs` | NEW test file | ~300-350 lines | NONE |
| 6 | `src/claude/hooks/tests/workflow-completion-enforcer.test.cjs` | NEW test file | ~150-180 lines | NONE |

**Total production code changed**: ~63 lines
**Total test code added**: ~450-530 lines

---

## Metadata

```json
{
  "phase": "04-design",
  "mode": "ANALYSIS",
  "feature": "GH-39",
  "date": "2026-02-20",
  "artifacts_produced": ["module-design.md"],
  "traces_to": ["FR-001", "FR-002", "FR-003", "FR-004", "FR-005", "FR-006", "FR-009", "NFR-001", "NFR-003", "NFR-004", "NFR-006"],
  "deferred": ["FR-007 (compact snapshots)", "FR-008 (compact git_branch)"],
  "estimated_production_loc": 63,
  "estimated_test_loc": 500,
  "implementation_steps": 7,
  "files_modified": 4,
  "files_created": 2
}
```
