# Quick Scan: State.json Pruning at Workflow Completion

**Generated**: 2026-02-21T10:00:00Z
**Feature**: GH-39 - State.json pruning at workflow completion
**Phase**: 00-quick-scan
**Mode**: ANALYSIS (no state writes, no branches)

---

## 1. Scope

**Scope Classification**: MEDIUM
**Complexity**: MEDIUM-HIGH
**Confidence**: HIGH
**Rationale**: The core ask is a hot/cold data split for state.json. The working copy used by agents on every build stays lean (active workflow data + lightweight config). Accumulated data -- completed phase details, old skill usage logs, workflow history entries -- archives to a separate file at workflow finalize. Four prune functions already exist in `common.cjs` but have zero callers. The archive mechanism and on-demand load path are entirely new. The hot read path (23 hooks/dispatchers) should remain untouched, which bounds the blast radius.

**Key Insight from User**: This is not just "call prune functions at finalize." The user wants a **hot/cold architecture** -- a lightweight working copy for active use, with historical data archived separately and loadable on demand. The consumer of archived data (human vs programmatic) is an open question to resolve after mapping usage patterns.

---

## 2. Keywords

### Domain Keywords

| Keyword | Hits | Key Files |
|---------|------|-----------|
| `readState()` | 40+ calls | 23 hooks, 5 dispatchers, `common.cjs` |
| `writeState()` | 21+ calls | `common.cjs`, 5 dispatchers, `delegation-gate`, `workflow-completion-enforcer` |
| `active_workflow` | 23+ consumers | Every hook/dispatcher reads this field |
| `skill_usage_log` | 12+ matches | `log-skill-usage`, `gate-blocker`, `delegation-gate`, `common.cjs` |
| `workflow_history` | 2 consumers | `workflow-completion-enforcer`, `common.cjs` prune functions |
| `pruneSkillUsageLog` | Defined, 0 callers | `common.cjs` line 2364 |
| `pruneCompletedPhases` | Defined, 0 callers | `common.cjs` line 2385 |
| `pruneHistory` | Defined, 0 callers | `common.cjs` line 2418 |
| `pruneWorkflowHistory` | Defined, 0 callers | `common.cjs` line 2442 |
| `pending_escalations` | 6 functions | `common.cjs` read/write/clear helpers |
| `pending_delegation` | 5 functions | `common.cjs` read/write/clear helpers |
| `phases[*]` | 12 hook readers | gate-blocker, constitution-validator, menu-tracker, etc. |

### State.json Consumer Map

#### Hooks -- Read & Write (13 hooks)

| Hook File | R/W | Fields Accessed | Purpose |
|-----------|-----|-----------------|---------|
| `gate-blocker.cjs` | R+W | `active_workflow`, `phases[*]`, `skill_usage_log`, `pending_delegation`, `iteration_enforcement`, `cloud_configuration` | Gate validation; writes `phases[phase].gate_validation` |
| `phase-loop-controller.cjs` | R | `active_workflow.current_phase`, `phases[phase]` | Blocks delegation if phase not in_progress |
| `constitution-validator.cjs` | R+W | `active_workflow`, `phases[*].constitutional_validation`, `iteration_enforcement` | Writes constitutional validation results |
| `constitutional-iteration-validator.cjs` | R | `active_workflow`, `phases[*]` | Validates iteration state |
| `iteration-corridor.cjs` | R | `active_workflow`, `phases[*]` | Reads iteration config and corridor state |
| `menu-tracker.cjs` | R+W | `active_workflow`, `phases[*].iteration_requirements` | Tracks menu interactions |
| `test-watcher.cjs` | R+W | `active_workflow`, `phases[*].constitutional_validation` | Updates iteration counter, test results |
| `delegation-gate.cjs` | R+W | `active_workflow`, `skill_usage_log`, `pending_delegation`, `phases[*]` | Validates delegation; writes pending_delegation |
| `log-skill-usage.cjs` | R | `skill_enforcement`, `active_workflow.current_phase` | Reads enforcement mode |
| `state-write-validator.cjs` | R | `state_version`, `active_workflow`, `phases[*]` | Validates writes; checks version, phase regression |
| `workflow-completion-enforcer.cjs` | R+W | `active_workflow`, `phases[*]`, `workflow_history` | Post-completion self-healing |
| `blast-radius-validator.cjs` | R | `active_workflow.artifact_folder` | Reads artifact folder path |
| `plan-surfacer.cjs` | R | `active_workflow.current_phase` | Reads current phase |

#### Hooks -- Read Only (10 hooks)

| Hook File | Fields Accessed | Purpose |
|-----------|-----------------|---------|
| `phase-sequence-guard.cjs` | `active_workflow.current_phase` | Guards phase ordering |
| `branch-guard.cjs` | `active_workflow` | Validates git branch |
| `skill-delegation-enforcer.cjs` | `active_workflow`, `pending_delegation` | Enforces skill delegation |
| `skill-validator.cjs` | `active_workflow` | Validates skill usage |
| `test-adequacy-blocker.cjs` | `active_workflow.current_phase`, `discovery_context.coverage_summary` | Checks test adequacy |
| `explore-readonly-enforcer.cjs` | `active_workflow` | Enforces read-only |
| `review-reminder.cjs` | `active_workflow`, `code_review` | Reminds about code review |
| `walkthrough-tracker.cjs` | `discovery_context` | Reads discovery context |
| `state-file-guard.cjs` | (path only) | Blocks direct bash writes |
| `discover-menu-guard.cjs` | `active_workflow` | Guards discover menu |

#### Dispatchers -- Read & Write (5 dispatchers)

| Dispatcher | R/W | Fields Accessed |
|------------|-----|-----------------|
| `pre-task-dispatcher.cjs` | R+W | `active_workflow`, `pending_delegation` |
| `post-task-dispatcher.cjs` | R+W | `active_workflow` |
| `post-write-edit-dispatcher.cjs` | R | `active_workflow` |
| `pre-skill-dispatcher.cjs` | R+W | `active_workflow`, `skill_usage_log` |
| `post-bash-dispatcher.cjs` | R+W | `active_workflow` |

#### Shared Library -- `common.cjs`

| Function | R/W | Fields Touched |
|----------|-----|----------------|
| `readState()` | R | Entire state object |
| `writeState()` | W | Entire state (with version increment) |
| `appendSkillLog()` | W | `skill_usage_log[]` |
| `writePendingEscalation()` | W | `pending_escalations[]` |
| `readPendingEscalations()` | R | `pending_escalations` |
| `clearPendingEscalations()` | W | `pending_escalations = []` |
| `readPendingDelegation()` | R | `pending_delegation` |
| `writePendingDelegation()` | W | `pending_delegation` |
| `clearPendingDelegation()` | W | `pending_delegation = null` |
| `pruneSkillUsageLog()` | W | `skill_usage_log` (cap to 20) |
| `pruneCompletedPhases()` | W | `phases[*]` (strip temp fields) |
| `pruneHistory()` | W | `history` (cap to 50) |
| `pruneWorkflowHistory()` | W | `workflow_history` (cap to 50) |
| `resetPhasesForWorkflow()` | W | `phases` (reset for new workflow) |
| `collectPhaseSnapshots()` | R+W | `phases`, `active_workflow` |

#### Agents (70 `.md` files reference state.json)

Agents do not call `readState()` directly. They instruct the orchestrator or hooks to manage state. The orchestrator (`00-sdlc-orchestrator.md`) coordinates state reads/writes through the hook infrastructure. All 16 phase agents + discover agents reference state.json in their specs but rely on hooks for actual I/O.

### Field Heat Map

| State Field | Readers | Writers | Hot/Cold |
|-------------|---------|---------|----------|
| `active_workflow` | 23 hooks/dispatchers | orchestrator, hooks | **HOT** -- every build |
| `phases[*]` | 12 hooks | 5 hooks | **HOT** during workflow, **COLD** after |
| `skill_usage_log` | 3 hooks | 2 writers | **HOT** -- every skill invocation |
| `pending_escalations` | 1 reader | 2 writers | **HOT** during phase, **COLD** after |
| `pending_delegation` | 3 hooks | 2 hooks | **HOT** during phase, **COLD** after |
| `workflow_history` | 1 consumer | 1 writer | **COLD** -- only at finalize |
| `discovery_context` | 2 hooks | 0 hooks | **COLD** -- written once |
| `iteration_enforcement` | 2 hooks | 0 hooks | **COLD** -- config |
| `constitution` | 0 hooks | 0 hooks | **COLD** -- set once |
| `framework_version` | 0 hooks | 0 hooks | **COLD** -- immutable |
| `project` | 0 hooks | 0 hooks | **COLD** -- set once |
| `cloud_configuration` | 1 hook | 0 hooks | **COLD** -- set once |
| `complexity_assessment` | 0 hooks | 0 hooks | **COLD** -- set once |

---

## 3. File Count

| Category | Count | Files |
|----------|-------|-------|
| **Modify** | 3 | `src/claude/hooks/lib/common.cjs` (archive write/load, wire prune calls), `src/claude/agents/00-sdlc-orchestrator.md` (finalize path), `src/claude/hooks/workflow-completion-enforcer.cjs` (defensive prune) |
| **New** | 1 | Archive mechanism (new module or new functions in `common.cjs`) |
| **Test - New** | 2 | Unit tests for prune+archive, integration test for finalize sequence |
| **Verify (no changes)** | 5 | `state-write-validator.cjs`, `gate-blocker.cjs`, `phase-loop-controller.cjs`, `delegation-gate.cjs`, `state-file-guard.cjs` |
| **Config/Schema** | 1 | Schema updates if archive format needs validation |

**Total files changed/created**: ~7
**Files to verify unchanged**: 5
**Confidence**: HIGH -- consumer map provides clear blast radius boundaries

---

## 4. Final Scope

**Final Classification**: MEDIUM scope, MEDIUM-HIGH complexity

**Summary**: State.json needs a hot/cold data split. The working copy stays lean for the 23 hooks/dispatchers that read it every build. At workflow finalize, accumulated data (completed phase verbose details, old skill usage log entries, old workflow history entries, transient fields) gets pruned from the working copy and archived to a separate file. Four prune functions already exist in `common.cjs` with zero callers -- they need to be wired into the finalize path. The new work is the archive file mechanism and the on-demand load path for historical data.

**Open Questions for Phase 01 (Requirements)**:
1. Archive consumer: Who loads archived data -- humans only, or do agents/hooks need programmatic access?
2. Archive format: Single file per workflow, or one rolling archive file?
3. Retention policy: Current defaults (20 skill entries, 50 history entries) -- acceptable?
4. Migration: Clean up existing large state.json files, or only prevent future growth?
5. Defensive pruning: Should `workflow-completion-enforcer.cjs` also prune as a safety net?
6. Transient field removal: Soft-delete (set to `[]`/`null`) or hard-delete from state object?

---

## Existing Pruning Implementation

### Functions Already Defined in `common.cjs`

```javascript
// Line 2364: pruneSkillUsageLog(state, maxEntries = 20)
// Keeps last N entries, discards older ones (FIFO)

// Line 2385: pruneCompletedPhases(state, protectedPhases = [])
// Strips verbose sub-objects from COMPLETED phases
// Removes: iteration_requirements, constitutional_validation,
//          gate_validation, testing_environment, verification_summary,
//          atdd_validation. Adds _pruned_at timestamp.

// Line 2418: pruneHistory(state, maxEntries = 50, maxCharLen = 200)
// FIFO cap + truncation of long action strings

// Line 2442: pruneWorkflowHistory(state, maxEntries = 50, maxCharLen = 200)
// FIFO cap + description truncation + git_branch compaction
```

All four functions are exported in `module.exports` but have **zero callers** in production code.

### Missing/Incomplete

1. No callers of prune functions in finalize path
2. No cleanup of transient fields (`pending_escalations`, `pending_delegation`, `supervised_review`, `chat_explore_active`)
3. No archive file mechanism
4. No integration test for finalize + pruning sequence
5. Schema validation does not account for pruned state

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Loss of historical data | LOW | Archive preserves full data; working copy retains recent entries |
| Data corruption during prune | MEDIUM | Validate prune functions, add integration test |
| Backward compat with old state.json | MEDIUM | Schema should gracefully handle missing fields |
| Finalize not called (bypass) | MEDIUM | Defensive prune in workflow-completion-enforcer |
| Archive read performance | LOW | On-demand load, not on hot path |
| Incomplete field cleanup | LOW | Full enumeration of transient fields in requirements phase |

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-21T10:00:00Z",
  "keywords_searched": 12,
  "consumers_mapped": 28,
  "scope_estimate": "MEDIUM",
  "complexity_estimate": "MEDIUM-HIGH",
  "file_count_estimate": 7,
  "confidence": "HIGH",
  "blocking_unknowns": [
    "Archive consumer model (human vs programmatic) -- defer to Phase 02",
    "Archive file format -- defer to Phase 03"
  ]
}
```
