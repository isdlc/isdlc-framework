# Requirements Specification: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json pruning at workflow completion
**Phase**: 01-requirements (revised)
**Scope**: MEDIUM, Complexity: MEDIUM-HIGH
**Date**: 2026-02-21
**Source**: BACKLOG.md #39, Phase 00 quick-scan (revised)

---

## 1. Business Context

### Problem Statement

State.json is the central nervous system of iSDLC. It is read by 23 hooks and 5 dispatchers on every build, and written to by 13 hooks. After 18+ completed workflows, the file has grown to 2,243 lines (~55 KB) because completed workflow data accumulates indefinitely -- skill usage logs, workflow history, phase iteration state, transient runtime fields -- none of it is ever removed.

This causes three problems:
- **Performance**: Every hook read/write operates on the full file (40+ reads, 25+ writes per workflow). The larger it gets, the slower every build becomes.
- **Debuggability**: 2,243 lines of JSON is impractical to inspect manually when diagnosing issues.
- **Correctness**: Stale transient fields (`pending_escalations`, `pending_delegation`, phase iteration data) from prior workflows bleed into subsequent runs, potentially confusing hooks.

### Stakeholders

- **Primary**: The iSDLC framework developer (maintains and debugs state.json)
- **Secondary**: The hook/dispatcher infrastructure (reads/writes state.json on every build)
- **Indirect**: End users of projects built with iSDLC (affected by performance degradation)

### Success Criterion

**State.json only contains what the current workflow needs, nothing more.** If no workflow is active, state.json holds only durable project configuration. All historical workflow data lives in a separate archive file, loadable on demand.

### Driving Factors

- State.json is already at 55 KB after just 18 workflows and will exceed 100 KB within ~15 more
- The file is read/written on every single build -- this is the hottest path in the framework
- Four FIFO-cap prune functions exist in `common.cjs` but have zero callers in production code
- The original GH-39 description focused on in-place pruning, but analysis revealed the user's actual need is a **hot/cold data architecture**: lean working copy + separate archive

### Strategic Decision: Archive Replaces In-Place Pruning

During Phase 00 quick scan, the user clarified that the desired approach is **Option A: Archive replaces pruning**. At finalize, completed workflow data moves entirely to a separate archive file. The working copy (state.json) resets to a clean state for the next workflow. No FIFO caps are applied to state.json itself -- data is moved out, not trimmed in place.

This supersedes the original spec's FR-001 through FR-004 which were designed around in-place FIFO-cap pruning. The existing prune functions in `common.cjs` may be repurposed for shaping archive entries, but they are no longer the core mechanism.

### Current State of Existing Prune Functions

| Function | Defined | Exported | Called in Enforcer | Called in Finalize |
|----------|---------|----------|-------------------|-------------------|
| `pruneSkillUsageLog(state, 20)` | common.cjs:2364 | Yes | Yes (line 219) | NO |
| `pruneCompletedPhases(state, [])` | common.cjs:2385 | Yes | Yes (line 220) | NO |
| `pruneHistory(state, 50, 200)` | common.cjs:2418 | Yes | Yes (line 221) | NO |
| `pruneWorkflowHistory(state, 50, 200)` | common.cjs:2442 | Yes | Yes (line 222) | NO |

These functions will be evaluated during architecture (Phase 03) for potential reuse in the archive-move pattern.

### Elaboration Insights (Roundtable Discussion)

<!-- Elaboration: step 01-01, 2026-02-21T10:30:00Z -->

**Key design decisions from multi-persona discussion (Maya, Alex, Jordan):**

1. **State.json between workflows is minimal.** Since only one workflow runs at a time and archive-at-finalize removes all workflow data, state.json at the start of any new workflow contains only durable config fields (~20-30 lines). This eliminates the need for FIFO caps entirely.

2. **Async archive model.** The critical path is: orchestrator finalize -> `workflow-completion-enforcer` runs -> control returns to user. Archive operations (snapshot, write to archive file) happen in the background after the user has control back. The user can start a new workflow immediately.

3. **Two-file write safety.** The background archive process writes the archive file unconditionally. It only cleans state.json if no new workflow has started (`active_workflow` is still `null`). If a new workflow has already begun, its init has already overwritten the stale data -- no cleanup needed.

4. **Failure handling.** Archive write is best-effort. If it fails, log a warning. Do not roll back state.json. Consistent with the fail-open principle.

5. **Archive format.** Compact data before archiving -- strip verbose phase sub-objects, truncate long strings. The existing `pruneCompletedPhases()` function may be repurposed for this.

**Open question for Phase 02:** `workflow-completion-enforcer.cjs` reads `workflow_history` from state.json to detect recent completions. With `workflow_history` archived out, the enforcer's detection logic needs an alternative signal.

---

## 2. Stakeholders and Personas

### 2.1 Hook/Dispatcher Infrastructure (Primary Consumer of state.json)

- **Role**: Automated runtime enforcement -- 23 hooks and 5 dispatchers
- **Goals**: Read active workflow state on every build to enforce gates, validate phases, track iterations, log skill usage
- **Pain points**: Larger state.json = slower reads/writes on every build. Stale transient fields from prior workflows cause false positives or confusion in validation logic.
- **Technical proficiency**: N/A (machine consumer)
- **Key tasks**: `readState()` (40+ calls per workflow), `writeState()` (25+ calls per workflow)
- **Needs from this feature**: A lean, minimal state.json that contains only active workflow data and durable config. No accumulated historical data slowing reads.

### 2.2 Orchestrator Agent (Primary Consumer of state.json)

- **Role**: Central coordinator of all iSDLC workflows
- **Goals**: Manage workflow lifecycle (init, phase transitions, finalize)
- **Pain points**: Currently manages a bloated state.json. No mechanism to archive completed workflow data.
- **Technical proficiency**: N/A (LLM agent, prompt-driven)
- **Key tasks**: Workflow init, phase delegation, finalize (including triggering archive write via enforcer)
- **Needs from this feature**: Clean state.json after finalize. Archive write happens automatically via enforcer hook.
- **Note**: The "was issue X fixed?" question is already answered by the base Claude agent via GitHub issues and BACKLOG.md -- not through state.json. Archive lookup capability (FR-012) is deferred to a follow-up.

### 2.3 Framework Developer (Indirect Beneficiary)

- **Role**: Maintains and evolves the iSDLC framework
- **Goals**: Debug issues, understand system behavior, evolve state schema
- **Pain points**: Never opens state.json directly today. Does not inspect the file manually.
- **Technical proficiency**: High
- **Key tasks**: Framework development, debugging via agent queries (not direct file inspection)
- **Needs from this feature**: Confidence that historical data is preserved (archive) even though they never read it directly. Clean separation between active and historical state.

### 2.4 Non-Consumer Clarification

- **Human readability of state.json is NOT a requirement.** The user confirmed they never open state.json. All access is mediated through the framework (hooks, orchestrator, agents).
- **Human readability of the archive is NOT a requirement.** The archive's consumer is programmatic (orchestrator lookup), not human inspection.
- **The original GH-39 goal of "audit and restructure state.json schema for human readability" is deprioritized.**

---

## 3. User Journeys

### 3.1 Journey 1: Invisible Finalize (MVP -- Primary Flow)

This is the core user journey for the feature. It is entirely invisible to the user.

**Entry point**: User completes the final phase of a workflow and the orchestrator runs MODE: finalize.

**Steps**:
1. User says "finalize" or the orchestrator detects all phases are complete.
2. Orchestrator executes MODE: finalize -- collects phase snapshots, prunes state.json, clears transient fields, moves workflow to `workflow_history`, sets `active_workflow = null`.
3. `workflow-completion-enforcer.cjs` fires on the next PostToolUse event (state.json write with `active_workflow = null`).
4. Enforcer calls `appendToArchive(workflowRecord)` to write the completed workflow record to `.isdlc/state-archive.json`.
5. If archive write succeeds: record is persisted with multi-key index entries. If it fails: warning logged to stderr, no user-visible effect.
6. State.json is now lean (~20-30 lines of durable config).

**Exit point**: The user sees the normal finalize confirmation. They notice nothing different. The next workflow init is marginally faster because state.json is smaller.

**User awareness**: None. This journey is entirely automatic. The user's experience is indistinguishable from a normal finalize, except state.json does not grow unboundedly over time.

### 3.2 Journey 2: Issue Lookup via Archive (Deferred -- Not MVP)

**Status**: DEFERRED to follow-up. The "was issue X fixed?" question is already answered by GitHub issues and BACKLOG.md. The archive lookup is a new capability that adds internal process data (which workflow handled it, duration, phases completed) but is not needed for the basic use case.

**Entry point** (future): User asks "was issue GH-39 fixed?" or "what happened with BUG-0012?"

**Steps** (future):
1. User asks the orchestrator about a past issue.
2. Orchestrator reads `.isdlc/state-archive.json` and looks up the identifier in the index.
3. If found: returns workflow record (completion date, branch, outcome, phase summary).
4. If not found: falls back to GitHub/BACKLOG lookup (existing behavior).

**Exit point** (future): User receives a richer answer that includes internal process data alongside the GitHub/BACKLOG information.

**Why deferred**: GitHub issues and BACKLOG.md already answer the fundamental question. The archive lookup adds supplementary data (workflow duration, phases, branch) that has value but is not essential. The archive is written from day one (Journey 1), so the data accumulates. The read path can be built later when the data volume justifies it.

### 3.3 Journey 3: Archive Write Failure (Error Path)

**Entry point**: Journey 1 executes, but the `appendToArchive()` call fails (disk full, permissions error, corrupted archive file).

**Steps**:
1. Steps 1-3 of Journey 1 execute normally.
2. Enforcer calls `appendToArchive()`, which catches the error internally.
3. Warning is logged to stderr. No user-visible error.
4. State.json is still pruned and lean (pruning is independent of archive write).
5. The archive file has a gap -- this workflow's record is missing.

**Exit point**: User sees normal finalize confirmation. They are unaware of the failure.

**Recovery**: The gap in the archive is permanent for this workflow. Future workflows archive normally. If the archive file itself is corrupted, the next `appendToArchive()` call will fail and log a warning. The self-healing index rebuild (deferred to architecture phase) could address index corruption but not missing records.

**Acceptable because**: The archive is supplementary. State.json pruning (the core value) is unaffected by archive failures. The fail-open principle means no user-facing degradation.

### 3.4 Journey 4: Abandoned Workflow Recovery (MVP -- Edge Case)

**Entry point**: User starts a workflow, gets partway through phases, types "clear" (clears the Claude Code session) and moves on. The next time they run `/isdlc feature` or `/isdlc fix`, the orchestrator detects the orphaned `active_workflow`.

**Steps**:
1. User starts a new workflow command (`/isdlc feature`, `/isdlc fix`).
2. Orchestrator init mode reads state.json and detects `active_workflow` is still populated from a previous session.
3. Orchestrator archives the orphaned workflow: collects whatever phase data exists, constructs a record with `outcome: "abandoned"`, calls `appendToArchive()`.
4. Orchestrator displays one-line notification: "Archived abandoned workflow for GH-XX."
5. Orchestrator clears transient fields (`clearTransientFields()`), resets state.json for the new workflow.
6. Normal workflow init proceeds.

**Exit point**: User sees the one-line archive notification followed by normal workflow init. The new workflow starts with a clean state.json.

**Detection mechanism**: Event-driven at next workflow init (Option 1). The orchestrator checks: "Is there an existing `active_workflow` that I am about to overwrite?" If yes, that is an orphaned workflow. No time-based detection (avoids false positives from users taking breaks).

**Abandoned record differences**:
- `outcome: "abandoned"` instead of `"merged"` or `"completed"`
- `phase_summary` reflects however far the workflow got (incomplete phases get `status: "abandoned"`)
- `metrics.total_duration_minutes` calculated from `started_at` to archive timestamp
- No `collectPhaseSnapshots()` has run, so phase data is best-effort from whatever exists in `phases` object

**Why MVP**: Without this journey, abandoned workflow data leaks transient fields into the next workflow. This is a correctness issue, not just a cleanup nicety. The archive write is secondary -- the cleanup is the critical part.

### 3.5 Journey 5: First-Run Migration (One-Time -- Should Have)

**Entry point**: First workflow init after the GH-39 feature is deployed. State.json has 2,243 lines of accumulated history from 18 prior workflows.

**Steps**:
1. User starts a new workflow (`/isdlc feature`).
2. Orchestrator init detects `pruning_migration_completed` flag is absent.
3. Migration runs:
   a. Read existing `workflow_history` (18 entries) from state.json.
   b. Call `seedArchiveFromHistory(workflowHistory)` -- transforms each entry to archive record format (compacting `phase_snapshots` to `phase_summary`, extracting `git_branch.name` as `branch`, mapping `git_branch.status` to `outcome`). Calls `appendToArchive()` for each.
   c. Run FIFO-cap prune functions on state.json.
   d. Call `clearTransientFields(state)` if `active_workflow` is null.
   e. Set `pruning_migration_completed = true`.
   f. Write state.json.
4. Normal workflow init proceeds.

**Exit point**: User experiences a normal workflow init. State.json is lean. Archive has all 18 historical records plus any new ones going forward.

**Critical ordering**: Step 3b (seed archive) runs BEFORE step 3c (FIFO prune) so the full historical data is available for seeding before any pruning removes it from state.json.

**Legacy data handling**: Historical entries may be missing `source_id` or `slug` if they predate the current schema. `seedArchiveFromHistory()` handles this gracefully -- indexes by whatever identifiers are available. Records with no identifiers still go into `records` but have no index entries.

<!-- Elaboration: step 01-03, 2026-02-21T11:30:00Z -->
<!-- Elaboration: step 01-03 (continued), 2026-02-21T12:00:00Z -->

### 3.6 Journey 6: Cancelled Workflow (MVP -- No New Handling Needed)

**Entry point**: User runs `/isdlc cancel` during an active workflow.

**Steps** (existing behavior -- no changes needed):
1. User runs `/isdlc cancel`.
2. Orchestrator prompts for a cancellation reason (required).
3. Orchestrator calls `collectPhaseSnapshots(state)` to capture progress.
4. If a git branch exists: commits WIP, checks out main, preserves branch. Sets `git_branch.status = "abandoned"`.
5. Orchestrator writes to `workflow_history` with `status: "cancelled"`, `cancelled_at`, `cancelled_at_phase`, `cancellation_reason`, `phase_snapshots`, `metrics`.
6. Orchestrator sets `active_workflow = null` and writes state.json.
7. `workflow-completion-enforcer` fires on the state write (detects `active_workflow = null`).
8. Enforcer constructs archive record: `outcome: "cancelled"`, `reason: cancellation_reason`.
9. Enforcer calls `appendToArchive(workflowRecord)`.
10. User sees normal cancellation confirmation.

**Exit point**: User sees cancellation confirmation with branch preservation note if applicable. The archive write is invisible.

**Why no new handling**: `/isdlc cancel` already writes to `workflow_history` and sets `active_workflow = null`. The enforcer already fires on this pattern. When FR-010 adds `appendToArchive()` to the enforcer, cancelled workflows get archived automatically -- the same code path that handles completed workflows.

**Key difference from abandoned (Journey 4)**: Cancel is deliberate and well-structured. `collectPhaseSnapshots` runs. A user-provided reason is captured. The `workflow_history` entry is complete. The archive record for a cancelled workflow has better data quality than an abandoned one.

### 3.7 Elaboration Insights (Roundtable Discussion on User Journeys)

**Key findings from multi-persona discussion (Maya, Alex, Jordan) -- three rounds:**

**Round 1: Lookup deferral and silent MVP**
1. **Existing lookup path discovery.** The "was issue X fixed?" question is already answered by the base Claude agent via GitHub issues and BACKLOG.md -- not through state.json or workflow_history. This was previously undocumented.
2. **Archive lookup is additive, not a replacement.** The archive would provide internal process data (workflow duration, phases, branch) that GitHub/BACKLOG cannot. But the basic question is already answered.
3. **FR-012 (lookupArchive) deferred to Could Have.** The function is not needed for the MVP goal of keeping state.json lean. The archive format (indexed-array with multi-key index) is still written from day one, avoiding migration debt when the read path is built later.
4. **MVP pruning is truly silent.** Hooks cannot produce user-visible output per CON-003. The orchestrator could add a summary line but it adds prompt complexity for a detail users do not care about. Observability goes to stderr debug log.

**Round 2: Migration seeding, abandoned workflows, edge cases**
5. **Migration seeds the archive.** FR-009 updated to include `seedArchiveFromHistory()` which transforms existing `workflow_history` entries to archive format and appends them before FIFO pruning runs. The archive starts with a complete picture from day one.
6. **Legacy entry transformation.** Historical entries have `git_branch` objects (not strings) and full `phase_snapshots` (not compact summaries). `seedArchiveFromHistory()` handles the format differences. Entries missing `source_id`/`slug` are indexed by whatever identifiers exist.
7. **Abandoned workflow recovery (Journey 4).** When the user clears a session and starts a new workflow, the orchestrator detects the orphaned `active_workflow` at init. It archives the abandoned workflow with `outcome: "abandoned"` and displays a one-line notification before proceeding with the new init.
8. **Detection is event-driven, not time-based.** The trigger is "I am about to overwrite an existing `active_workflow`" at workflow init. No stale-timestamp heuristics. Unambiguous.
9. **One-line notification for abandoned workflows.** User confirmed: the orchestrator should say "Archived abandoned workflow for GH-XX" -- informative but brief.

**Round 3: `/isdlc cancel` interaction with archive**
10. **Cancel already flows through the enforcer.** Codebase investigation confirmed: `/isdlc cancel` writes to `workflow_history` with `status: "cancelled"`, calls `collectPhaseSnapshots()`, and sets `active_workflow = null`. The enforcer fires on the subsequent state write. No special cancel handling needed -- FR-010 covers it.
11. **Three archive paths, two via enforcer.** Completed and cancelled workflows both go through the enforcer (same code path). Abandoned workflows go through orchestrator init (FR-013). The enforcer is the workhorse.
12. **Optional `reason` field in archive records.** Populated for cancelled workflows (from `cancellation_reason`), null for completed and abandoned. Provides context when reviewing history.
13. **`outcome` field values.** Four possible values: `"merged"`, `"completed"`, `"cancelled"`, `"abandoned"`. Derived from the workflow's termination path.

---

## 4. Technical Context

### 4.1 Runtime and Module System

- **Runtime**: Node.js (version specified by project, no minimum version constraint discovered)
- **Module system**: CommonJS (`.cjs`). All hooks, dispatchers, and the shared library use `require()`/`module.exports`.
- **I/O model**: All file I/O is synchronous (`fs.readFileSync`, `fs.writeFileSync`). Hooks run synchronously in the Claude Code lifecycle -- no async/await, no Promises. New functions (`appendToArchive`, `seedArchiveFromHistory`, `resolveArchivePath`) must follow this pattern.
- **No new dependencies**: CON-002 applies. All implementation uses Node.js built-in `fs` and `path` modules plus existing `common.cjs` utilities.

### 4.2 Central State Library (`common.cjs`)

The shared library at `src/claude/hooks/lib/common.cjs` is the single source of truth for all state I/O. Key patterns that new archive functions must follow:

| Pattern | Detail |
|---------|--------|
| **Read functions** return `null` on error | `readState()` returns `null` if file is missing or corrupt. Fail-open. |
| **Write functions** return `boolean` | `writeState()` returns `true` on success. Fail-open on error. |
| **No schema validation on write** | `writeState()` does not validate the state object before writing. It trusts the caller. `appendToArchive()` should follow the same trust model. |
| **Shallow copy before write** | `writeState()` creates `Object.assign({}, state)` to avoid mutating the caller's reference. `appendToArchive()` should not mutate the passed record object. |
| **Version increment on write** | `writeState()` reads current `state_version` from disk and increments. The archive file uses a static `version: 1` field (format version, not write counter) -- no auto-increment needed. |
| **Pretty-print JSON** | `JSON.stringify(obj, null, 2)` -- 2-space indent. Consistent across all state files. |
| **Directory creation** | `writeState()` creates the directory if missing (`fs.mkdirSync` with `recursive: true`). `appendToArchive()` should do the same. |
| **Per-process caching** | `getProjectRoot()` caches the resolved path for process lifetime (REQ-0020). Archive path resolution should use `getProjectRoot()` to benefit from this cache. |

### 4.3 Monorepo Support (Hard Requirement)

The framework supports monorepo mode where multiple projects share a single `.isdlc/` directory. Monorepo mode is detected by the presence of `.isdlc/monorepo.json`.

**Path resolution**:
```
Single-project:  {projectRoot}/.isdlc/state.json
                 {projectRoot}/.isdlc/state-archive.json

Monorepo:        {projectRoot}/.isdlc/projects/{projectId}/state.json
                 {projectRoot}/.isdlc/projects/{projectId}/state-archive.json
```

A new `resolveArchivePath(projectId)` function must mirror `resolveStatePath(projectId)` exactly -- same monorepo detection, same project ID resolution, same fallback behavior. Without this, monorepo projects would share a single archive file, mixing records from different projects.

**Monorepo support is a hard requirement**, not a future concern. The project owner's users run in monorepo mode. All archive functions must accept an optional `projectId` parameter and route to the correct directory.

### 4.4 Hook Protocol

All hooks (including `workflow-completion-enforcer.cjs`) follow a strict protocol:

- **Return value**: `{ decision: 'allow' }` or `{ decision: 'block', message: '...' }`.
- **No stdout**: Hooks must not produce user-visible output. CON-003.
- **Stderr for debug**: `logHookEvent()` and `outputSelfHealNotification()` write to stderr only.
- **Self-managed I/O**: Hooks that modify state call `readState()`/`writeState()` directly. They do not return modified state to the framework.
- **PostToolUse trigger**: The enforcer runs on `PostToolUse[Write,Edit]` events that touch state.json.

### 4.5 Integration Points

| Component | Integration | Direction |
|-----------|-------------|-----------|
| `common.cjs` | New functions: `appendToArchive()`, `resolveArchivePath()`, `seedArchiveFromHistory()`, `clearTransientFields()`. Deferred: `lookupArchive()`. | **Add** |
| `workflow-completion-enforcer.cjs` | Add `appendToArchive()` call after prune functions. Add `clearTransientFields()` call. | **Modify** |
| `00-sdlc-orchestrator.md` | Add pruning instructions to MODE: finalize. Add abandoned workflow detection + archive at MODE: init. | **Modify** |
| `state-file-guard.cjs` | Verify it does not block `fs.writeFileSync` to `state-archive.json`. Expected: no change needed. | **Verify** |
| `state-write-validator.cjs` | Verify it accepts pruned state as valid (empty `phases`, null transient fields). Expected: no change needed. | **Verify** |
| 23 hooks + 5 dispatchers | Verify they handle post-prune state gracefully (null/empty transient fields when `active_workflow` is null). Expected: most use optional chaining already. | **Verify** |

### 4.6 Existing Prune Functions

Four prune functions exist in `common.cjs` (lines 2364-2442) with the following status:

| Function | Exported | Called by Enforcer | Called by Orchestrator | Test Coverage |
|----------|----------|-------------------|----------------------|--------------|
| `pruneSkillUsageLog(state, maxEntries)` | Yes | Yes (line 219) | No | **None** |
| `pruneCompletedPhases(state, protectedPhases)` | Yes | Yes (line 220) | No | **None** |
| `pruneHistory(state, maxEntries, maxCharLen)` | Yes | Yes (line 221) | No | **None** |
| `pruneWorkflowHistory(state, maxEntries, maxCharLen)` | Yes | Yes (line 222) | No | **None** |

All four are called by the enforcer with hardcoded defaults (`20`, `[]`, `50/200`, `50/200`). FR-004 updates these defaults. The functions mutate the state object in place and return it.

### 4.7 State File Guard

`state-file-guard.cjs` blocks:
- Bash commands that write to `.isdlc/state.json`
- Write/Edit tool operations on `.isdlc/state.json`

It does NOT block:
- `fs.writeFileSync` calls from hooks (hooks bypass the guard by design)
- Operations on other files in `.isdlc/` (only `state.json` is guarded)
- Read operations on any file

**Implication**: `appendToArchive()` writes to `state-archive.json` via `fs.writeFileSync` from a hook. The guard does not interfere. No changes needed.

---

## 5. Field Categorization

Complete audit of all top-level and nested fields in `.isdlc/state.json`, categorized by retention policy.

### 5.1 DURABLE Fields (Keep indefinitely)

These fields represent project-level configuration and identity. Never pruned.

| Field | Type | Purpose | Retention |
|-------|------|---------|-----------|
| `framework_version` | string | Framework version identifier | Permanent |
| `project` | object | Project metadata (name, created, description, tech_stack, discovery status) | Permanent |
| `complexity_assessment` | object | Initial complexity assessment (level, track, dimensions) | Permanent |
| `workflow` | object | Workflow track configuration | Permanent |
| `constitution` | object | Constitution enforcement status and article list | Permanent |
| `autonomous_iteration` | object | Governance settings (max iterations, timeouts) | Permanent |
| `skill_enforcement` | object | Skill enforcement mode config | Permanent |
| `cloud_configuration` | object | Cloud provider and deployment settings | Permanent |
| `iteration_enforcement` | object | Single boolean `{ enabled: true }` | Permanent |
| `discovery_context` | object | Discovery analysis results (tech stack, coverage, architecture) | Permanent |
| `counters` | object | `next_req_id` and `next_bug_id` monotonic counters | Permanent |
| `state_version` | number | Monotonic write counter for optimistic concurrency | Permanent |

### 5.2 BOUNDED Fields (Keep with FIFO cap)

These fields accumulate data across workflows and must be bounded.

| Field | Type | Current Size | Retention Policy |
|-------|------|-------------|-----------------|
| `skill_usage_log` | array | 22 entries (currently) | FIFO cap at 50 entries |
| `workflow_history` | array | 18 entries (currently) | FIFO cap at 50 entries, with compaction |
| `history` | array | 46 entries (currently) | FIFO cap at 100 entries, with truncation |

### 5.3 TRANSIENT Fields (Clear at workflow completion)

These fields exist only during an active workflow and must be cleared at finalize.

| Field | Type | Current Value | Clear Strategy |
|-------|------|--------------|----------------|
| `active_workflow` | object/null | `null` | Already cleared by orchestrator finalize |
| `current_phase` | string/null | `null` | Set to `null` |
| `active_agent` | string/null | `null` | Set to `null` |
| `phases` | object | `{}` | Set to `{}` (empty object) |
| `blockers` | array | `[]` | Set to `[]` (empty array) |
| `pending_escalations` | array | `[]` | Set to `[]` (empty array) |
| `pending_delegation` | object/null | `null` | Set to `null` |

### 5.4 PARTIAL PRUNE Fields (Strip verbose sub-objects from completed phases)

During an active workflow, phase objects accumulate verbose temporary state. Before archiving to `workflow_history`, these sub-objects should be stripped.

| Phase Sub-Field | Purpose | Strip at Finalize |
|----------------|---------|-------------------|
| `iteration_requirements` | Hook gate iteration tracking | YES |
| `constitutional_validation` | Constitutional compliance check state | YES |
| `gate_validation` | Gate validation details | YES |
| `testing_environment` | Phase-specific temp state | YES |
| `verification_summary` | Phase-specific temp state | YES |
| `atdd_validation` | ATDD test validation state | YES |
| `timing` | Phase wall-clock timing data | NO (preserved for metrics) |
| `summary` | 1-line phase summary | NO (preserved for snapshots) |
| `status` | Phase completion status | NO (preserved for snapshots) |
| `started` | Phase start timestamp | NO (preserved for snapshots) |
| `completed` | Phase completion timestamp | NO (preserved for snapshots) |
| `gate_passed` | Gate pass boolean | NO (preserved for snapshots) |
| `artifacts` | Phase artifact list | NO (preserved for snapshots) |

---

## 6. Functional Requirements

### FR-001: Wire prune functions into orchestrator finalize path (Must Have)

**Description**: The orchestrator's MODE: finalize execution must call all 4 existing prune functions after `collectPhaseSnapshots()` and before moving the workflow to `workflow_history`. This is the PRIMARY pruning path; the workflow-completion-enforcer is the FALLBACK.

**Rationale**: The orchestrator spec (line 655) already describes this sequence but the agent prompt does not instruct the LLM to emit the JavaScript calls. Since the orchestrator operates via prompt instructions (not executable code), the fix is to add explicit instructions in the finalize section of `00-sdlc-orchestrator.md` telling the agent to call the prune functions via state manipulation.

**Current behavior**: Orchestrator finalize does: `collectPhaseSnapshots() -> move to workflow_history -> clear active_workflow`. No pruning occurs.

**Required behavior**: Orchestrator finalize does: `collectPhaseSnapshots() -> prune (all 4 functions) -> clear transient fields -> move to workflow_history -> clear active_workflow`.

**Acceptance Criteria**:

- AC-001-01: Given a workflow has completed all phases, when the orchestrator runs MODE: finalize, then `pruneSkillUsageLog(state, 50)` is called after collectPhaseSnapshots and before the workflow_history move.
- AC-001-02: Given a workflow has completed all phases, when the orchestrator runs MODE: finalize, then `pruneCompletedPhases(state, [])` is called with an empty protected-phases array (since all phases are done).
- AC-001-03: Given a workflow has completed all phases, when the orchestrator runs MODE: finalize, then `pruneHistory(state, 100, 200)` is called.
- AC-001-04: Given a workflow has completed all phases, when the orchestrator runs MODE: finalize, then `pruneWorkflowHistory(state, 50, 200)` is called.
- AC-001-05: Given pruning completes, when the workflow is moved to workflow_history, then the archived entry contains `phase_snapshots` and `metrics` collected BEFORE pruning.

### FR-002: Clear transient fields at finalize (Must Have)

**Description**: At finalize, all transient runtime fields must be reset to their null/empty state. This prevents stale data from prior workflows from leaking into subsequent runs.

**Acceptance Criteria**:

- AC-002-01: Given a workflow is being finalized, when transient field cleanup runs, then `pending_escalations` is set to `[]`.
- AC-002-02: Given a workflow is being finalized, when transient field cleanup runs, then `pending_delegation` is set to `null`.
- AC-002-03: Given a workflow is being finalized, when transient field cleanup runs, then `current_phase` is set to `null`.
- AC-002-04: Given a workflow is being finalized, when transient field cleanup runs, then `active_agent` is set to `null`.
- AC-002-05: Given a workflow is being finalized, when transient field cleanup runs, then `phases` is set to `{}`.
- AC-002-06: Given a workflow is being finalized, when transient field cleanup runs, then `blockers` is set to `[]`.

### FR-003: Add clearTransientFields() function to common.cjs (Must Have)

**Description**: Create a single function `clearTransientFields(state)` in `common.cjs` that resets all transient fields in one call. This centralizes the cleanup logic and makes it callable from both the orchestrator finalize path and the workflow-completion-enforcer fallback.

**Acceptance Criteria**:

- AC-003-01: Given `clearTransientFields(state)` is called, when state has `pending_escalations: [...]`, then `state.pending_escalations` is set to `[]`.
- AC-003-02: Given `clearTransientFields(state)` is called, when state has `pending_delegation: {...}`, then `state.pending_delegation` is set to `null`.
- AC-003-03: Given `clearTransientFields(state)` is called, when state has `current_phase: "06-implementation"`, then `state.current_phase` is set to `null`.
- AC-003-04: Given `clearTransientFields(state)` is called, when state has `active_agent: "software-developer"`, then `state.active_agent` is set to `null`.
- AC-003-05: Given `clearTransientFields(state)` is called, when state has `phases: { "01-requirements": {...} }`, then `state.phases` is set to `{}`.
- AC-003-06: Given `clearTransientFields(state)` is called, when state has `blockers: [...]`, then `state.blockers` is set to `[]`.
- AC-003-07: Given `clearTransientFields(state)` is called, when the function returns, then the function returns the mutated state object (consistent with prune function signatures).
- AC-003-08: Given `clearTransientFields(state)` is called, when durable fields exist (e.g., `project`, `constitution`, `counters`), then those fields are NOT modified.

### FR-004: Update retention limits to reflect actual usage (Should Have)

**Description**: Adjust the default FIFO cap parameters for the 4 prune functions based on real-world usage data from the current state.json (18 workflows over 12 days). The current defaults (`skill_usage_log: 20`, `history: 50`, `workflow_history: 50`) should be revised based on observed growth rates and usefulness.

**Rationale**:
- `skill_usage_log` currently has 22 entries for ~18 workflows (~1.2 entries per workflow). A cap of 50 gives ~40 workflows of history -- adequate for debugging.
- `workflow_history` currently has 18 entries. A cap of 50 gives ~2.8x headroom -- adequate.
- `history` currently has 46 entries for ~18 workflows (~2.6 entries per workflow). A cap of 100 gives ~38 workflows of history -- adequate.

**Acceptance Criteria**:

- AC-004-01: Given `pruneSkillUsageLog` is called at finalize, when maxEntries is used, then the default is 50 (up from 20).
- AC-004-02: Given `pruneHistory` is called at finalize, when maxEntries is used, then the default is 100 (up from 50).
- AC-004-03: Given `pruneWorkflowHistory` is called at finalize, when maxEntries is used, then the default is 50 (unchanged).
- AC-004-04: Given any prune function is called, when the array length is at or below the cap, then no entries are removed.

### FR-005: Update workflow-completion-enforcer to call clearTransientFields (Should Have)

**Description**: The workflow-completion-enforcer already calls the 4 prune functions (lines 219-222). It should also call `clearTransientFields(state)` to match the orchestrator finalize behavior.

**Acceptance Criteria**:

- AC-005-01: Given the workflow-completion-enforcer detects a completed workflow, when it self-heals missing snapshots, then it also calls `clearTransientFields(state)` after pruning.
- AC-005-02: Given the enforcer calls clearTransientFields, when it writes state back to disk, then `pending_escalations`, `pending_delegation`, `current_phase`, `active_agent`, `phases`, and `blockers` are all reset.

### FR-006: Add orchestrator finalize instructions for pruning (Must Have)

**Description**: Update the MODE: finalize section of `00-sdlc-orchestrator.md` to include explicit agent instructions for invoking pruning. Since the orchestrator is a prompt-driven agent (not executable code), the instructions must tell the LLM to write the pruned state to state.json.

**Acceptance Criteria**:

- AC-006-01: Given the orchestrator agent file `00-sdlc-orchestrator.md`, when MODE: finalize instructions are read, then there is an explicit step for "Apply pruning: call pruneSkillUsageLog, pruneCompletedPhases, pruneHistory, pruneWorkflowHistory, clearTransientFields on the state before writing".
- AC-006-02: Given the finalize instructions, when the pruning step is described, then the instruction specifies the order: collectPhaseSnapshots FIRST, then prune, then move to workflow_history.
- AC-006-03: Given the finalize instructions, when the pruning step is described, then retention limits are specified explicitly (skill_usage_log: 50, history: 100, workflow_history: 50).

### FR-007: Compact workflow_history entries during pruning (Could Have)

**Description**: Older workflow_history entries (those beyond the most recent 10) should have their `phase_snapshots` array compacted -- keeping only the phase key and summary, dropping timing, started, completed, and status fields. This reduces per-entry size for historical records that are rarely inspected in detail.

**Acceptance Criteria**:

- AC-007-01: Given `pruneWorkflowHistory` is called, when entries beyond the most recent 10 exist, then `phase_snapshots` in older entries are compacted to `[{ phase, summary }]` only.
- AC-007-02: Given `pruneWorkflowHistory` is called, when entries are within the most recent 10, then `phase_snapshots` are preserved in full.
- AC-007-03: Given `pruneWorkflowHistory` is called with compaction, when the function returns, then the compacted entries have a `_compacted: true` flag for diagnosis.

### FR-008: Compact git_branch in workflow_history entries (Could Have)

**Description**: The `git_branch` object in workflow_history entries currently stores `name`, `created_from`, `created_at`, `status`, `merged_at`, and `merge_commit`. For entries beyond the most recent 5, compact to `{ name, status }` only.

**Note**: `pruneWorkflowHistory` already compacts git_branch to `{ name }` for ALL entries. This requirement extends the existing behavior to preserve `status` as well, and only applies compaction to older entries (not the most recent 5).

**Acceptance Criteria**:

- AC-008-01: Given `pruneWorkflowHistory` is called, when entries beyond the most recent 5 exist, then `git_branch` is compacted to `{ name, status }`.
- AC-008-02: Given `pruneWorkflowHistory` is called, when entries are within the most recent 5, then `git_branch` is preserved in full (no compaction).

### FR-009: One-time migration of existing state.json (Should Have)

**Description**: Run pruning on the existing state.json to bring it under control immediately, rather than waiting for the next workflow finalize to trigger it. This is a one-time operation. The migration also seeds the archive with all existing `workflow_history` entries so the archive has a complete picture from day one.

**Critical ordering**: Seed the archive BEFORE running FIFO-cap prune functions. The full historical data must be available for seeding before any pruning removes entries from state.json.

**Acceptance Criteria**:

- AC-009-01: Given the feature is deployed, when the first workflow initializes after deployment, then the orchestrator init mode applies migration to the existing state.json.
- AC-009-02: Given the migration runs, when `workflow_history` contains entries, then `seedArchiveFromHistory(workflowHistory)` is called to seed the archive BEFORE any FIFO pruning.
- AC-009-03: Given `seedArchiveFromHistory` is called, when a historical entry has `git_branch: { name, status, ... }`, then the archive record uses `branch: git_branch.name` and `outcome: git_branch.status`.
- AC-009-04: Given `seedArchiveFromHistory` is called, when a historical entry has full `phase_snapshots`, then the archive record compacts them to `phase_summary` format (`phase`, `status`, `summary` only).
- AC-009-05: Given `seedArchiveFromHistory` is called, when a historical entry is missing `source_id` or `slug`, then the record is still appended to `records` and indexed by whatever identifiers are available. No error is thrown.
- AC-009-06: Given archive seeding completes, when FIFO pruning runs, then `skill_usage_log` is capped to 50, `history` is capped to 100, `workflow_history` is capped to 50.
- AC-009-07: Given the migration runs, when transient fields have stale values and `active_workflow` is null, then transient fields are cleared.
- AC-009-08: Given the migration has already run, when a subsequent workflow initializes, then the migration does not run again (idempotent -- check for a `pruning_migration_completed` flag).

### FR-010: Archive completed workflows to state-archive.json (Must Have)

**Description**: At workflow finalize, the completed workflow record (compact phase summaries, metrics, identifiers) must be appended to `.isdlc/state-archive.json`. The archive uses an indexed-array format with a multi-key index for O(1) lookup by issue identifier.

**Rationale**: This is the core mechanism that enables the hot/cold data split. Completed workflow data moves out of state.json and into the archive, keeping state.json lean. The archive provides the only programmatic lookup path for answering "was issue X fixed?"

**Acceptance Criteria**:

- AC-010-01: Given a workflow has completed finalize, when the enforcer detects `active_workflow` is null, then a compact record is appended to `.isdlc/state-archive.json`.
- AC-010-02: Given a workflow record is appended, when the record is written, then the `index` object is updated with entries for both `source_id` (e.g., "GH-39") and `slug` (e.g., "state-json-pruning-GH-39"), each mapping to the new record's array position.
- AC-010-03: Given `state-archive.json` does not exist, when the first archive write occurs, then the file is created with `{ "version": 1, "records": [...], "index": {...} }`.
- AC-010-04: Given the archive write fails for any reason, when the error is caught, then a warning is logged to stderr and state.json is NOT rolled back. Fail-open.
- AC-010-05: Given the same issue goes through multiple workflows (re-work), when each workflow finalizes, then the index maps the issue identifier to multiple record positions (e.g., `"GH-39": [0, 5]`).
- AC-010-06: Given a cancelled workflow (via `/isdlc cancel`), when the enforcer constructs the archive record, then `outcome` is `"cancelled"` and `reason` is populated from `workflow_history[last].cancellation_reason`.
- AC-010-07: Given a completed workflow, when the enforcer constructs the archive record, then `reason` is `null`.

### FR-011: Add appendToArchive() function to common.cjs (Must Have)

**Description**: Create a function `appendToArchive(record)` in `common.cjs` that reads the archive file (or creates it), appends a workflow record, updates the multi-key index, and writes the file. Best-effort, never throws.

**Acceptance Criteria**:

- AC-011-01: Given `appendToArchive(record)` is called, when the archive file exists, then the record is appended to the `records` array and the index is updated.
- AC-011-02: Given `appendToArchive(record)` is called, when the archive file does not exist, then a new file is created with version 1, the record as the first entry, and the corresponding index.
- AC-011-03: Given `appendToArchive(record)` is called with a record containing `source_id` and `slug`, when the index is updated, then both identifiers are added as index keys pointing to the new record's position.
- AC-011-04: Given `appendToArchive(record)` encounters a file read/write error, when the error is caught, then a warning is logged to stderr and the function returns without throwing.
- AC-011-05: Given the function is exported from `common.cjs`, when other modules require it, then it is available as `appendToArchive`.

### FR-012: Add lookupArchive() function to common.cjs (Could Have -- Deferred)

**Description**: Create a function `lookupArchive(identifier)` in `common.cjs` that reads `.isdlc/state-archive.json`, looks up the identifier in the index (exact match), and returns matching records sorted by `completed_at` descending. Never throws.

**Deferral rationale**: The "was issue X fixed?" question is already answered by the base Claude agent via GitHub issues and BACKLOG.md. The archive lookup adds supplementary internal process data (workflow duration, phases, branch) but is not needed for the MVP. The archive format (indexed-array with multi-key index) is written from day one by FR-010/FR-011, so data accumulates and the read path can be built later without migration.

**Acceptance Criteria**:

- AC-012-01: Given `lookupArchive("GH-39")` is called and the archive contains a record with `source_id: "GH-39"`, when the index is consulted, then `{ found: true, records: [<matching record(s)>] }` is returned.
- AC-012-02: Given `lookupArchive("nonexistent")` is called, when the identifier is not in the index, then `{ found: false, records: [] }` is returned.
- AC-012-03: Given the archive file does not exist, when `lookupArchive` is called, then `{ found: false, records: [] }` is returned without error.
- AC-012-04: Given multiple records match (re-work scenario), when records are returned, then they are sorted by `completed_at` descending (most recent first).
- AC-012-05: Given any error occurs during file read or parse, when the error is caught, then `{ found: false, records: [] }` is returned without throwing.

### FR-013: Archive abandoned workflows at orchestrator init (Must Have)

**Description**: When the orchestrator starts a new workflow and detects an existing `active_workflow` from a previous session (orphaned workflow), it must archive the orphaned workflow with `outcome: "abandoned"` before initializing the new one. This prevents stale transient fields from leaking into the new workflow and preserves a record of what happened.

**Rationale**: Users abandon workflows by typing "clear" and moving on. There is no formal cancel command. Without this, the orphaned `active_workflow` data persists in state.json and leaks transient fields into subsequent workflows -- a correctness issue.

**Detection mechanism**: Event-driven at workflow init. The orchestrator checks: "Is there an existing `active_workflow` that I am about to overwrite?" If yes, that is an orphaned workflow.

**Acceptance Criteria**:

- AC-013-01: Given the user starts a new workflow (`/isdlc feature`, `/isdlc fix`), when `active_workflow` is non-null from a prior session, then the orchestrator detects the orphaned workflow before proceeding with init.
- AC-013-02: Given an orphaned workflow is detected, when the orchestrator archives it, then the archive record has `outcome: "abandoned"`.
- AC-013-03: Given an orphaned workflow is detected, when the orchestrator archives it, then `phase_summary` reflects however far the workflow got. Incomplete phases get `status: "abandoned"`.
- AC-013-04: Given an orphaned workflow is detected, when the orchestrator archives it, then `metrics.total_duration_minutes` is calculated from `active_workflow.started_at` to the current timestamp.
- AC-013-05: Given an orphaned workflow is detected, when the archive write completes (or fails), then `clearTransientFields(state)` is called to reset state.json before the new workflow init.
- AC-013-06: Given an orphaned workflow is detected, when the orchestrator proceeds, then it displays a one-line notification: "Archived abandoned workflow for {source_id}."
- AC-013-07: Given the archive write for the orphaned workflow fails, when the error is caught, then cleanup still proceeds (clearTransientFields runs regardless). Fail-open.

### FR-014: Add seedArchiveFromHistory() function to common.cjs (Should Have)

**Description**: Create a function `seedArchiveFromHistory(workflowHistory)` in `common.cjs` that transforms existing `workflow_history` entries from the legacy format to archive record format and calls `appendToArchive()` for each. Used by FR-009 during one-time migration.

**Acceptance Criteria**:

- AC-014-01: Given `seedArchiveFromHistory(workflowHistory)` is called with an array of legacy entries, when each entry has `git_branch: { name, status, ... }`, then the archive record uses `branch: git_branch.name` and `outcome: git_branch.status`.
- AC-014-02: Given a legacy entry has full `phase_snapshots`, when transformed, then the archive record compacts them to `phase_summary` format (`phase`, `status`, `summary` only).
- AC-014-03: Given a legacy entry is missing `source_id`, when transformed, then the record is still appended and indexed by `slug` only. No error.
- AC-014-04: Given a legacy entry is missing both `source_id` and `slug`, when transformed, then the record is appended to `records` with no index entries. No error.
- AC-014-05: Given any individual entry fails to transform or append, when the error is caught, then the function continues with the next entry (skip on error, do not abort).

### FR-015: Add resolveArchivePath() function to common.cjs (Must Have)

**Description**: Create a function `resolveArchivePath(projectId)` in `common.cjs` that resolves the absolute path to `state-archive.json` for a given project. Must mirror the behavior of `resolveStatePath(projectId)` exactly -- same monorepo detection via `isMonorepoMode()`, same project ID resolution, same directory structure, same fallback to single-project mode. The only difference is the filename: `state-archive.json` instead of `state.json`.

**Rationale**: CON-005 mandates monorepo support. Without a dedicated path resolution function, every caller of `appendToArchive()` would need to know the monorepo layout. Centralizing path resolution prevents cross-project contamination and ensures consistency with `resolveStatePath()`.

**Acceptance Criteria**:

- AC-015-01: Given the project is in single-project mode (no `.isdlc/monorepo.json`), when `resolveArchivePath()` is called with no arguments, then it returns `{projectRoot}/.isdlc/state-archive.json`.
- AC-015-02: Given the project is in monorepo mode, when `resolveArchivePath('my-app')` is called, then it returns `{projectRoot}/.isdlc/projects/my-app/state-archive.json`.
- AC-015-03: Given the project is in monorepo mode, when `resolveArchivePath()` is called with no arguments, then it resolves the project ID using the same logic as `resolveStatePath()` (auto-detection from cwd).
- AC-015-04: Given `resolveArchivePath(projectId)` is called, when `resolveStatePath(projectId)` returns `{dir}/state.json`, then `resolveArchivePath(projectId)` returns `{dir}/state-archive.json` (same directory, different filename).
- AC-015-05: Given `resolveArchivePath` is called, when `getProjectRoot()` is used internally, then the cached project root is reused (no redundant filesystem traversal).
- AC-015-06: Given the function is exported from `common.cjs`, when other modules require it, then it is available as `resolveArchivePath`.

### FR Dependency Chain

The following table documents implementation dependencies between FRs. The "Depends On" column lists FRs that must be implemented before the given FR can work.

| FR | Depends On | Reason |
|----|-----------|--------|
| FR-001 | FR-003, FR-006 | Finalize path calls `clearTransientFields()` (FR-003) per orchestrator instructions (FR-006) |
| FR-005 | FR-003 | Enforcer calls `clearTransientFields()` |
| FR-009 | FR-011, FR-014, FR-015 | Migration calls `seedArchiveFromHistory()` (FR-014) which calls `appendToArchive()` (FR-011) which calls `resolveArchivePath()` (FR-015) |
| FR-010 | FR-011, FR-015 | Archive write calls `appendToArchive()` (FR-011) which calls `resolveArchivePath()` (FR-015) |
| FR-011 | FR-015 | `appendToArchive()` calls `resolveArchivePath()` to locate the archive file |
| FR-013 | FR-003, FR-011 | Abandoned workflow archive calls `appendToArchive()` (FR-011) and `clearTransientFields()` (FR-003) |
| FR-014 | FR-011 | `seedArchiveFromHistory()` calls `appendToArchive()` for each entry |

**Build order** (derived from dependency chain):
1. FR-003 (`clearTransientFields`) and FR-015 (`resolveArchivePath`) -- no dependencies, can be built in parallel
2. FR-011 (`appendToArchive`) -- depends on FR-015
3. FR-014 (`seedArchiveFromHistory`) -- depends on FR-011
4. FR-002, FR-004, FR-006 -- independent of archive, can be built any time
5. FR-001, FR-005, FR-010, FR-013 -- depend on functions from steps 1-3
6. FR-009 -- depends on FR-011 + FR-014; runs at init time

---

## 7. Non-Functional Requirements

### NFR-001: Pruning must not block workflow finalize (Must Have)

**Description**: If any prune function throws an error, finalize must continue. Pruning is non-blocking -- errors are logged to stderr but never prevent workflow completion.

**Metric**: Zero workflow finalize failures caused by pruning errors.
**Measurement**: Integration test verifying finalize completes even when a prune function throws.

### NFR-002: Pruning must complete within performance budget (Must Have)

**Description**: The complete pruning sequence (all 4 prune functions + clearTransientFields) must complete within 50ms on a state.json of up to 100 KB.

**Metric**: p95 < 50ms for the full pruning sequence.
**Measurement**: Benchmark test with a 100 KB synthetic state.json.

### NFR-003: No data loss for durable fields (Must Have)

**Description**: Pruning must never modify, delete, or corrupt any field categorized as DURABLE in Section 2.1. This includes `project`, `constitution`, `counters`, `discovery_context`, etc.

**Metric**: Zero durable field modifications during pruning.
**Measurement**: Unit test asserting durable fields are unchanged after all prune functions run.

### NFR-004: Backward compatibility with existing state.json (Must Have)

**Description**: The updated prune functions must handle state.json files written by prior framework versions gracefully. Missing fields should not cause errors. Extra/unknown fields should be preserved (not deleted).

**Metric**: Zero errors when running prune functions on state.json files from framework versions 0.1.0-alpha through current.
**Measurement**: Unit test with minimal state.json (only `framework_version`) and maximal state.json (all fields populated).

### NFR-005: State.json size target (Should Have)

**Description**: After pruning at finalize, state.json should be under 30 KB for projects with up to 50 completed workflows.

**Metric**: File size < 30 KB after finalize with 50 workflow_history entries.
**Measurement**: Integration test creating a state.json with 50 synthetic workflow_history entries and running full prune sequence.

### NFR-006: Idempotent pruning (Must Have)

**Description**: Running the prune sequence multiple times on the same state.json must produce the same result. `f(f(state)) === f(state)`.

**Metric**: Output identical after 1st and 2nd application.
**Measurement**: Unit test running prune twice and comparing JSON output.

### NFR-007: Archive write must not block workflow finalize (Must Have)

**Description**: The `appendToArchive()` call in the enforcer must be wrapped in try/catch with fail-open behavior. If the archive write fails for any reason (disk full, permissions, corrupt file), finalize completes normally and the user is unaffected. This is the archive-specific extension of NFR-001.

**Metric**: Zero workflow finalize failures caused by archive write errors.
**Measurement**: Integration test where `appendToArchive()` is called with a read-only archive file path; verify finalize still completes and state.json is pruned.

### NFR-008: Archive file must remain parseable after every append (Must Have)

**Description**: After every successful `appendToArchive()` call, `state-archive.json` must be valid JSON parseable by `JSON.parse()`. No partial writes, no trailing commas, no truncated records. The function must read the entire file, modify the in-memory object, and write the entire file atomically (single `writeFileSync` call).

**Metric**: `JSON.parse(fs.readFileSync(archivePath))` succeeds after every append operation.
**Measurement**: Unit test that appends 50 records sequentially, verifying `JSON.parse` succeeds after each append. Edge case: append to a file with 500+ records.

### NFR-009: Monorepo archive isolation (Must Have)

**Description**: In monorepo mode, each project's archive file must be completely isolated. A write to project A's archive must not read, modify, or affect project B's archive. `resolveArchivePath(projectId)` must produce distinct paths per project, consistent with `resolveStatePath(projectId)`.

**Metric**: Zero cross-project archive contamination.
**Measurement**: Unit test that writes archive records for two different project IDs and verifies each file contains only its own records.

### NFR-010: Archive append performance (Should Have)

**Description**: A single `appendToArchive()` call must complete within 100ms for archive files up to 200 KB (~100 workflow records). Beyond 200 KB, performance may degrade gracefully but must not exceed 500ms.

**Metric**: p95 < 100ms for files up to 200 KB; p95 < 500ms for files up to 1 MB.
**Measurement**: Benchmark test appending to a synthetic 200 KB archive file (100 records). Repeat for 1 MB (500 records).

---

## 8. MoSCoW Prioritization

### Must Have (MVP)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| FR-001 | Wire prune functions into orchestrator finalize | Core fix -- activates existing dead code |
| FR-002 | Clear transient fields at finalize | Prevents stale data bleeding across workflows |
| FR-003 | Add clearTransientFields() function | Centralizes cleanup, enables FR-002 |
| FR-006 | Add orchestrator finalize instructions | Required for prompt-driven agent to execute pruning |
| FR-010 | Archive completed workflows to state-archive.json | Core hot/cold split -- moves data out of state.json |
| FR-011 | Add appendToArchive() function | Enables archive writes from enforcer hook |
| FR-013 | Archive abandoned workflows at orchestrator init | Prevents stale data leaking into new workflows -- correctness fix |
| FR-015 | Add resolveArchivePath() function | Enables monorepo-safe archive path resolution; required by FR-011 |
| NFR-001 | Non-blocking pruning | Safety -- pruning must never break finalize |
| NFR-003 | No data loss for durable fields | Safety -- correctness guarantee |
| NFR-004 | Backward compatibility | Safety -- must work with existing state files |
| NFR-006 | Idempotent pruning | Safety -- deterministic behavior |
| NFR-007 | Archive write non-blocking | Safety -- archive failures must never break finalize |
| NFR-008 | Archive file parseable after append | Data integrity -- no partial/corrupt JSON |
| NFR-009 | Monorepo archive isolation | Correctness -- per-project archive files, no cross-contamination |

### Should Have

| ID | Requirement | Rationale |
|----|-------------|-----------|
| FR-004 | Update retention limits | Better defaults based on real usage data |
| FR-005 | Update enforcer to call clearTransientFields | Consistency between primary and fallback paths |
| FR-009 | One-time migration (with archive seeding) | Immediate benefit for existing state.json; seeds archive with historical data |
| FR-014 | Add seedArchiveFromHistory() function | Enables FR-009 migration to seed archive from legacy workflow_history |
| NFR-002 | Performance budget | Ensures pruning doesn't slow down finalize |
| NFR-005 | Size target | Measurable outcome for the feature |
| NFR-010 | Archive append performance | Ensures archive writes don't degrade with file growth |

### Could Have

| ID | Requirement | Rationale |
|----|-------------|-----------|
| FR-007 | Compact phase_snapshots in older entries | Further size reduction, diminishing returns |
| FR-008 | Compact git_branch in older entries | Further size reduction, diminishing returns |
| FR-012 | Add lookupArchive() function | Deferred -- GitHub/BACKLOG already answers "was issue X fixed?"; archive data accumulates via write path for future use |

### Won't Have (This Release)

| ID | Description | Rationale |
|----|-------------|-----------|
| -- | Configurable retention limits via state.json | Over-engineering; hardcoded defaults are sufficient for now |
| -- | Real-time pruning during workflow (not just at finalize) | Adds complexity; finalize-time pruning is sufficient |
| -- | State.json schema migration tool | Out of scope; the prune functions handle missing fields gracefully |
| -- | State.json compression (gzip) | Alternative approach; pruning is simpler and sufficient |
| -- | Fuzzy/substring matching in archive lookup | Exact match on index keys is sufficient for MVP; revisit if user feedback demands it |
| -- | Archive file rotation or size management | Archive grows ~1 MB per 1.4 years at current usage; not a concern for MVP. Revisit if archive exceeds 1 MB. |

---

## 9. Archive Design

### 9.1 Archive File

- **Path**: `.isdlc/state-archive.json`
- **Purpose**: Persistent store for completed workflow records, enabling historical lookup by issue identifier
- **Naming rationale**: `state-archive.json` makes the relationship to `state.json` explicit

### 9.2 Archive Format

The archive uses an indexed-array structure (format version 1):

```json
{
  "version": 1,
  "records": [
    {
      "source_id": "GH-39",
      "slug": "state-json-pruning-GH-39",
      "workflow_type": "feature",
      "completed_at": "2026-02-21T14:00:00Z",
      "branch": "feature/state-json-pruning-GH-39",
      "outcome": "merged",
      "reason": null,
      "phase_summary": [
        { "phase": "01-requirements", "status": "completed", "summary": "..." }
      ],
      "metrics": { "total_duration_minutes": 180, "phases_completed": 8 }
    }
  ],
  "index": {
    "GH-39": [0],
    "state-json-pruning-GH-39": [0]
  }
}
```

**Design rationale**:
- **`version` field**: Enables future format migration. Starts at 1.
- **`records` array**: Append-only. Each entry represents one completed workflow. Records are compact -- `phase_summary` keeps only `phase`, `status`, `summary` (consistent with `pruneCompletedPhases()` output). No verbose phase sub-objects.
- **`outcome` field**: One of `"merged"`, `"completed"`, `"cancelled"`, or `"abandoned"`. Derived from the workflow's termination path.
- **`reason` field**: Optional. Populated for cancelled workflows (from `cancellation_reason`). Null for completed and abandoned workflows. Provides context when reviewing historical records.
- **`index` object**: Maps known identifiers to record array positions for O(1) lookup. Each record produces multiple index entries (at minimum `source_id` and `slug`). This supports flexible lookup -- e.g., both "GH-39" and "state-json-pruning-GH-39" resolve to the same record.
- **Multi-key indexing**: The index supports multiple keys per record. If the same issue goes through multiple workflows (re-work scenario), the index maps the identifier to multiple array positions: `"GH-39": [0, 5]`.
- **Self-healing index**: The index is treated as a rebuildable cache. If corrupted, it can be reconstructed by iterating records and extracting `source_id` and `slug` from each. Architecture phase to determine if auto-rebuild belongs in `lookupArchive()` or a separate utility.

### 9.3 Write Paths

Three distinct paths produce archive records:

| Path | Trigger | Owner | `outcome` | `reason` | Data Quality |
|------|---------|-------|-----------|----------|--------------|
| Completed | Finalize, `active_workflow = null` | `workflow-completion-enforcer.cjs` | `"merged"` or `"completed"` (from `git_branch.status`) | `null` | Full -- all phases done, snapshots collected |
| Cancelled | `/isdlc cancel`, `active_workflow = null` | `workflow-completion-enforcer.cjs` | `"cancelled"` | User-provided cancellation reason | Good -- `collectPhaseSnapshots` runs, reason captured |
| Abandoned | FR-013, orphan detected at next init | `00-sdlc-orchestrator.md` (init mode) | `"abandoned"` | `null` | Best-effort -- no formal snapshot collection |

**Completed + Cancelled paths** (enforcer):
1. Enforcer detects state.json write with `active_workflow = null`.
2. Enforcer reads the last `workflow_history` entry (just written by orchestrator finalize or cancel).
3. Enforcer extracts workflow data, constructs archive record. For cancelled workflows: `outcome = "cancelled"`, `reason = entry.cancellation_reason`.
4. Enforcer calls `appendToArchive(workflowRecord)` in `common.cjs`.
5. If any step fails: log warning, do not roll back `state.json`. Fail-open.

**Note**: `/isdlc cancel` already flows through the enforcer today (cancel writes to `workflow_history` and sets `active_workflow = null`). No special cancel handling is needed -- the enforcer's archive write naturally covers both completed and cancelled workflows.

**Abandoned path** (orchestrator init):
1. Orchestrator detects orphaned `active_workflow` at new workflow init (FR-013).
2. Orchestrator constructs a best-effort archive record from whatever phase data exists.
3. Orchestrator calls `appendToArchive(workflowRecord)` with `outcome = "abandoned"`.
4. Orchestrator displays one-line notification.

**File guard compatibility**: `state-file-guard.cjs` blocks Bash writes and tool writes to `state.json` specifically. It does not block `fs.writeFileSync` calls by hooks, and does not affect other files in `.isdlc/`. No guard changes needed.

### 9.4 Read Path (Deferred -- Not MVP)

**Status**: DEFERRED. The read path is not needed for the MVP. The "was issue X fixed?" question is already answered by the base Claude agent via GitHub issues and BACKLOG.md. The archive accumulates data via the write path (Section 8.3) from day one, so the read path can be built later without migration.

**Future primary consumer**: Orchestrator agent (reads `state-archive.json` via Read tool).

**Future flow** (when built):
1. User asks about a past issue.
2. Orchestrator reads `.isdlc/state-archive.json` directly.
3. Parses the `index` object to find matching record positions.
4. Returns the matching record(s) to the user, supplementing GitHub/BACKLOG data with internal process details.

**Future secondary consumer**: Any hook that needs archive data can call `lookupArchive(identifier)` from `common.cjs`.

### 9.5 Lookup API (Deferred -- Not MVP)

**Status**: DEFERRED with FR-012. Specification retained for future implementation.

```javascript
/**
 * lookupArchive(identifier) -> { found: boolean, records: Array }
 *
 * - Reads .isdlc/state-archive.json
 * - Looks up identifier in the index (exact match)
 * - Returns matching records sorted by completed_at descending
 * - If file doesn't exist or identifier not found: { found: false, records: [] }
 * - Best-effort: never throws, returns empty on any error
 */
function lookupArchive(identifier) { ... }
```

**Contract** (when implemented):
- Exact match only (no substring or fuzzy matching).
- Returns array of records (handles re-work scenario where same issue has multiple workflows).
- Never throws -- returns `{ found: false, records: [] }` on any error.
- Consistent with the fail-open principle established for all archive operations.

### 9.6 New Functions for common.cjs

| Function | Signature | Purpose | MVP? |
|----------|-----------|---------|------|
| `resolveArchivePath(projectId)` | `(projectId?: string) -> string` | Resolves path to `state-archive.json`, mirroring `resolveStatePath()` for monorepo support. | **Yes** |
| `appendToArchive(record, projectId)` | `(record: object, projectId?: string) -> void` | Appends a workflow record to `state-archive.json`, updates index. Best-effort, logs warning on failure. | **Yes** |
| `seedArchiveFromHistory(workflowHistory)` | `(workflowHistory: Array) -> void` | Transforms legacy `workflow_history` entries to archive format and appends each. Used by FR-009 migration. | **Should Have** |
| `lookupArchive(identifier)` | `(identifier: string) -> { found: boolean, records: Array }` | Reads archive, looks up identifier in index, returns matching records. Never throws. | **Deferred** |

<!-- Elaboration: step 01-02, 2026-02-21T11:00:00Z -->

### 9.7 Elaboration Insights (Roundtable Discussion on Archive Format)

**Key design decisions from multi-persona discussion (Maya, Alex, Jordan):**

1. **Indexed-array format** (Jordan's Option 2 over keyed-object Option 1). The append-only records array with a separate index object handles the re-work scenario cleanly, is safer for concurrent writes, and the index is rebuildable from records if corrupted.
2. **Multi-key indexing** (user decision). Each record produces at least two index entries (`source_id` and `slug`). Enables flexible lookup by any known identifier without requiring the user to remember the exact key format.
3. **File naming** (user decision). `state-archive.json` at `.isdlc/state-archive.json` -- naming makes the relationship to `state.json` explicit.
4. **Lookup API** (user + Maya). `lookupArchive(identifier)` in `common.cjs` provides a clean programmatic interface. The orchestrator can also read the file directly via Read tool.
5. **Write ownership** (Alex). `workflow-completion-enforcer.cjs` owns the archive write via `appendToArchive()`. Single write path, fires on finalize detection, best-effort.

**Open questions deferred to Phase 03 (Architecture):**
- Should `lookupArchive()` auto-rebuild a corrupted index from records?
- Should lookup support partial/substring matching for convenience?

---

## 10. Pruning Strategy

### 10.1 Execution Order

The pruning sequence must execute in this order during finalize:

```
1. collectPhaseSnapshots(state)     -- BEFORE pruning, captures full phase data
2. pruneCompletedPhases(state, [])  -- Strip verbose phase sub-objects
3. pruneSkillUsageLog(state, 50)    -- FIFO cap on skill log
4. pruneHistory(state, 100, 200)    -- FIFO cap + truncation on history
5. pruneWorkflowHistory(state, 50, 200)  -- FIFO cap + compaction on workflow history
6. clearTransientFields(state)      -- Reset all transient runtime fields
7. Move to workflow_history          -- Archive with snapshots/metrics from step 1
8. active_workflow = null            -- Clear active workflow
9. writeState(state)                 -- Persist pruned state
```

**Critical**: `collectPhaseSnapshots` MUST run before `pruneCompletedPhases` because the former reads phase sub-objects that the latter strips.

### 10.2 Dual-Path Architecture

```
PRIMARY PATH (orchestrator finalize):
  00-sdlc-orchestrator.md MODE: finalize
  -> Agent follows prompt instructions to prune
  -> Calls all 4 prune functions + clearTransientFields
  -> This is the INTENDED path for every workflow

FALLBACK PATH (workflow-completion-enforcer.cjs):
  PostToolUse[Write,Edit] hook
  -> Detects state.json write with active_workflow=null
  -> Self-heals missing phase_snapshots/metrics
  -> Calls all 4 prune functions + clearTransientFields
  -> This is the SAFETY NET if the orchestrator forgets
```

### 10.3 Retention Policy Summary

| Array | FIFO Cap | Truncation | Compaction | Notes |
|-------|----------|------------|------------|-------|
| `skill_usage_log` | 50 entries | None | None | Keep most recent 50 |
| `history` | 100 entries | Action strings > 200 chars | None | Keep most recent 100, truncate long strings |
| `workflow_history` | 50 entries | Description > 200 chars | git_branch to `{ name }` | Keep most recent 50 |

### 10.4 Transient Field Reset Values

| Field | Reset Value | Type |
|-------|-------------|------|
| `active_workflow` | `null` | Already handled by orchestrator |
| `current_phase` | `null` | string/null |
| `active_agent` | `null` | string/null |
| `phases` | `{}` | object |
| `blockers` | `[]` | array |
| `pending_escalations` | `[]` | array |
| `pending_delegation` | `null` | object/null |

---

## 11. Files Affected

### Must Change

| File | Change Description | FR |
|------|-------------------|-----|
| `src/claude/agents/00-sdlc-orchestrator.md` | Add pruning instructions to MODE: finalize section; add abandoned workflow detection + archive at MODE: init; add one-line notification for archived abandoned workflows | FR-001, FR-006, FR-013 |
| `src/claude/hooks/lib/common.cjs` | Add `clearTransientFields()`, `resolveArchivePath()`, `appendToArchive()`, `seedArchiveFromHistory()` functions; update `pruneSkillUsageLog` default to 50, update `pruneHistory` default to 100; export new functions. (`lookupArchive()` deferred.) | FR-003, FR-004, FR-011, FR-014, FR-015 |
| `src/claude/hooks/workflow-completion-enforcer.cjs` | Add `clearTransientFields()` call after existing prune calls; add `appendToArchive()` call to write archive at finalize; update retention limit args to match new defaults | FR-005, FR-010 |

### Should Change

| File | Change Description | FR |
|------|-------------------|-----|
| `src/claude/commands/isdlc.md` | Minor: ensure STEP 4 finalize description mentions pruning happens | FR-006 |

### Must Add (Tests)

| File | Description | FR |
|------|-------------|-----|
| `src/claude/hooks/tests/prune-functions.test.cjs` | Unit tests for all 4 prune functions + clearTransientFields | FR-001-005 |
| `src/claude/hooks/tests/archive-functions.test.cjs` | Unit tests for appendToArchive (create, append, multi-key index, format validation, error handling) + seedArchiveFromHistory (legacy format transformation, missing fields). Lookup tests deferred with FR-012. | FR-010, FR-011, FR-014 |
| `src/claude/hooks/tests/workflow-completion-enforcer.test.cjs` | Integration test: enforcer calls clearTransientFields + appendToArchive | FR-005, FR-010 |

### Verify (No Breaking Changes)

| File | Concern |
|------|---------|
| `src/claude/hooks/gate-blocker.cjs` | Reads `pending_delegation` -- must handle `null` gracefully (already does via optional chaining) |
| `src/claude/hooks/delegation-gate.cjs` | Reads `pending_delegation` -- must handle `null` gracefully |
| `src/claude/hooks/state-write-validator.cjs` | Validates state writes -- must accept pruned state as valid |
| `src/claude/hooks/phase-loop-controller.cjs` | Reads `active_workflow` and `phases` -- must handle empty `{}` phases |
| `src/claude/hooks/iteration-corridor.cjs` | Reads iteration state from phases -- must handle missing sub-objects |
| `src/claude/hooks/constitutional-iteration-validator.cjs` | Reads constitutional validation from phases -- must handle missing sub-objects |
| `src/claude/hooks/menu-tracker.cjs` | Reads menu interaction state from phases -- must handle missing sub-objects |

---

## 12. Constraints

### CON-001: Prompt-driven agent architecture

The orchestrator is a prompt-driven LLM agent, not executable code. Pruning instructions must be expressed as clear prose instructions in the agent's markdown file, not as JavaScript function calls. The agent must be told to read state, apply transformations, and write state back.

### CON-002: No new dependencies

All pruning logic must use existing functions in `common.cjs`. No new npm packages or external dependencies.

### CON-003: Hook protocol compliance

The workflow-completion-enforcer must continue to return `{ decision: 'allow', stateModified: false }` and manage its own state I/O. No stdout output from hooks.

### CON-004: Fail-open principle

All pruning operations must be wrapped in try/catch with fail-open behavior. A pruning failure must never prevent workflow completion, branch merging, or state persistence.

### CON-005: Monorepo support

All archive functions must support monorepo mode. Archive files live alongside their project's `state.json` -- single-project at `.isdlc/state-archive.json`, monorepo at `.isdlc/projects/{id}/state-archive.json`. A `resolveArchivePath(projectId)` function must mirror `resolveStatePath(projectId)`. All functions that read or write the archive must accept an optional `projectId` parameter.

---

## 13. Assumptions

1. The 4 existing prune functions in `common.cjs` are correct and well-tested (they are not -- see risk section). Their implementations were reviewed during this analysis and appear sound, but have zero test coverage.
2. The `workflow-completion-enforcer.cjs` hook runs reliably on every state.json write. This is the safety net if the orchestrator forgets to prune.
3. Retention limits (50/100/50) are sufficient for the foreseeable future. The project averages ~1 workflow per day; at these limits, state.json holds ~50 days of history.
4. No other agents or hooks depend on the transient fields being populated when `active_workflow` is null.

---

## 14. Open Questions (Resolved)

| Question | Resolution |
|----------|-----------|
| Should pruning happen only at finalize or also during phases? | **Finalize only**. Transient fields are needed during active workflows. |
| Which phases should be protected during pruneCompletedPhases? | **None (empty array)** at finalize, since all phases are done. During active workflows (if ever called), the current workflow's phases should be protected. |
| Soft-delete or hard-delete for pending_escalations? | **Soft-delete** (set to `[]`). The field must exist for hooks that check `Array.isArray(state.pending_escalations)`. |
| Should retention limits be configurable? | **No**. Hardcoded defaults are sufficient. Configurability adds complexity without benefit. |
| Should the enforcer also prune, or just the orchestrator? | **Both**. Orchestrator is primary; enforcer is fallback. Defense-in-depth. |

---

## 15. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Prune functions have bugs (0 test coverage) | MEDIUM | HIGH | Write comprehensive unit tests BEFORE deploying (TDD). Verify each function with edge cases. |
| Orchestrator LLM ignores pruning instructions | MEDIUM | LOW | Enforcer hook provides fallback. Also, instructions will be explicit and positioned prominently. |
| Pruning corrupts state.json | LOW | HIGH | Fail-open wrapping, idempotent design, and durable field protection. Integration test with real state.json snapshot. |
| Hooks break on pruned state (missing fields) | LOW | MEDIUM | Verify all downstream hooks handle null/empty for transient fields. Most already use optional chaining. |
| state_version counter confuses tools | LOW | LOW | `state_version` is durable and never pruned. |
| Archive file corruption (partial write, invalid JSON) | LOW | MEDIUM | NFR-008 enforces read-modify-write with single `writeFileSync`. If file is corrupt on read, `appendToArchive()` logs warning and creates a fresh archive (loses existing records but unblocks future writes). Unit test with corrupt file input. |
| Migration seeding partial failure (some entries fail to transform) | LOW | LOW | FR-014 specifies skip-on-error per entry. `seedArchiveFromHistory()` continues with remaining entries if one fails. Partial archive is better than no archive. Log count of skipped entries to stderr. |
| Archive file grows unboundedly | LOW | LOW | With ~1 workflow/day and ~2 KB per record, the archive reaches 1 MB after ~500 workflows (~1.4 years). NFR-010 sets performance thresholds up to 1 MB. Long-term: archive rotation or compaction can be added in a follow-up if needed. Not an MVP concern. |
| Monorepo archive path mismatch with state path | LOW | HIGH | `resolveArchivePath()` must mirror `resolveStatePath()` exactly. NFR-009 mandates isolation testing. Code review to ensure both functions share the same monorepo detection logic. |

---

## 16. Glossary

| Term | Definition |
|------|-----------|
| **Durable field** | A state.json field that persists across all workflows. Never pruned. |
| **Transient field** | A state.json field that exists only during an active workflow. Cleared at finalize. |
| **Bounded field** | A state.json array that grows across workflows but is capped via FIFO pruning. |
| **FIFO cap** | First-In-First-Out pruning: keep the N most recent entries, discard older ones. |
| **Compaction** | Reducing the size of individual entries by stripping verbose sub-objects. |
| **Primary path** | The orchestrator's MODE: finalize execution -- the intended pruning trigger. |
| **Fallback path** | The workflow-completion-enforcer hook -- safety net if primary path fails. |
| **clearTransientFields** | New function to reset all transient fields to their null/empty defaults. |
| **state-archive.json** | Archive file at `.isdlc/state-archive.json` storing completed workflow records with an indexed-array format. |
| **Multi-key index** | The archive's `index` object maps multiple identifiers (source_id, slug) to the same record position for flexible O(1) lookup. |
| **appendToArchive** | New function to append a workflow record to the archive file and update the index. Best-effort, never throws. |
| **lookupArchive** | New function to look up a workflow record by identifier in the archive. Returns `{ found, records }`. Never throws. Deferred to follow-up. |
| **seedArchiveFromHistory** | New function to transform legacy `workflow_history` entries to archive record format and seed the archive. Used during one-time migration (FR-009). |
| **Orphaned workflow** | A workflow whose `active_workflow` is still populated in state.json but whose session has ended (user typed "clear"). Detected at next workflow init and archived with `outcome: "abandoned"`. |
| **Archive outcome** | One of four values: `"merged"` (completed with branch merge), `"completed"` (completed without branch), `"cancelled"` (explicit `/isdlc cancel`), `"abandoned"` (session cleared without cancel). |
| **Archive reason** | Optional field in archive records. Populated with user-provided cancellation reason for cancelled workflows. Null for all other outcomes. |

---

## 17. Traceability

| Requirement | User Story | Acceptance Criteria | Priority |
|-------------|-----------|-------------------|----------|
| FR-001 | As the orchestrator, I want to prune state at finalize so that state.json stays bounded | AC-001-01 through AC-001-05 | Must |
| FR-002 | As a developer, I want transient fields cleared at finalize so stale data does not affect new workflows | AC-002-01 through AC-002-06 | Must |
| FR-003 | As a developer, I want a single clearTransientFields() function so cleanup logic is centralized | AC-003-01 through AC-003-08 | Must |
| FR-004 | As a developer, I want retention limits that match real usage so neither too much nor too little is kept | AC-004-01 through AC-004-04 | Should |
| FR-005 | As the enforcer hook, I want to also clear transient fields so the fallback path is comprehensive | AC-005-01, AC-005-02 | Should |
| FR-006 | As the orchestrator agent, I need explicit pruning instructions in my prompt so I know to prune at finalize | AC-006-01 through AC-006-03 | Must |
| FR-007 | As a developer, I want older workflow history entries compacted so state.json stays lean over time | AC-007-01 through AC-007-03 | Could |
| FR-008 | As a developer, I want git_branch compaction tiered by recency so recent entries keep full detail | AC-008-01, AC-008-02 | Could |
| FR-009 | As a developer, I want existing state.json pruned and archived immediately so I see benefits before the next finalize | AC-009-01 through AC-009-08 | Should |
| FR-010 | As the enforcer, I want to archive completed and cancelled workflow data to state-archive.json so state.json stays lean | AC-010-01 through AC-010-07 | Must |
| FR-011 | As a developer, I want an appendToArchive() function so archive writes are encapsulated and fail-safe | AC-011-01 through AC-011-05 | Must |
| FR-012 | As the orchestrator, I want a lookupArchive() function so I can answer "was issue X fixed?" queries | AC-012-01 through AC-012-05 | Could (deferred) |
| FR-013 | As the orchestrator, I want to detect and archive abandoned workflows at init so stale data does not leak into new workflows | AC-013-01 through AC-013-07 | Must |
| FR-014 | As a developer, I want a seedArchiveFromHistory() function so the migration can seed the archive from legacy data | AC-014-01 through AC-014-05 | Should |
| FR-015 | As the framework, I want a resolveArchivePath() function so archive files are routed to the correct monorepo project directory | AC-015-01 through AC-015-06 | Must |
| NFR-001 | As the framework, I want pruning to be non-blocking so finalize never fails due to pruning errors | p95 zero failures | Must |
| NFR-002 | As the framework, I want pruning to complete within 50ms so finalize performance is not degraded | p95 < 50ms for 100 KB state | Must |
| NFR-003 | As the framework, I want durable fields protected so project configuration is never lost during pruning | Zero durable field modifications | Must |
| NFR-004 | As the framework, I want backward compatibility so existing state files work without migration | Zero errors on legacy state files | Must |
| NFR-005 | As the framework, I want state.json under 30 KB after pruning so file size stays bounded | < 30 KB with 50 workflow_history entries | Should |
| NFR-006 | As the framework, I want idempotent pruning so repeated application produces identical results | f(f(state)) === f(state) | Must |
| NFR-007 | As the framework, I want archive writes to be non-blocking so finalize never fails due to archive errors | Zero finalize failures from archive errors | Must |
| NFR-008 | As the framework, I want the archive file parseable after every append so data integrity is maintained | JSON.parse succeeds after every append | Must |
| NFR-009 | As the framework, I want monorepo archive isolation so per-project archives never cross-contaminate | Zero cross-project records | Must |
| NFR-010 | As the framework, I want archive append under 100ms so archive writes don't degrade finalize performance | p95 < 100ms for files up to 200 KB | Should |
