# Impact Analysis: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json pruning at workflow completion
**Phase**: 02-impact-analysis
**Date**: 2026-02-21
**Analyst**: Alex Rivera (Solutions Architect)

---

## 1. Blast Radius

### 1.1 Summary

| Tier | File Count | Description |
|------|-----------|-------------|
| Tier 1: Direct Modification | 3 | Files we write new code or instructions into |
| Tier 2: New Files | 3 | Test files created from scratch |
| Tier 3: Indirect (Verify) | 12 | Files that consume modified code; must confirm they handle pruned state |
| Tier 4: Reference Update | 1 | Documentation that references finalize behavior |
| **Total blast radius** | **19** | |

### 1.2 Tier 1: Direct Modification

Files we will edit. These carry the highest risk.

| File | Lines | Change Type | FRs | Risk | Notes |
|------|-------|-------------|-----|------|-------|
| `src/claude/hooks/lib/common.cjs` | ~3,570 | Add functions | FR-003, FR-004, FR-011, FR-014, FR-015 | **HIGH** | Central state library. 27 hooks import it. New functions: `clearTransientFields()`, `resolveArchivePath()`, `appendToArchive()`, `seedArchiveFromHistory()`. Update prune function default args. Add to `module.exports` block (line 3455). |
| `src/claude/hooks/workflow-completion-enforcer.cjs` | ~270 | Modify | FR-005, FR-010 | **MEDIUM** | Add `clearTransientFields()` call after line 222 (existing prune calls). Add `appendToArchive()` call before `writeState()` (line 225). Update import block (line 29) to include new functions. Update prune call args (lines 219-222). |
| `src/claude/agents/00-sdlc-orchestrator.md` | ~1,600 | Modify | FR-001, FR-006, FR-013 | **MEDIUM** | Prompt-driven agent. Update MODE: finalize section (line 655) with explicit prune instructions and updated retention limits. Add abandoned workflow detection to initialization process (Section 3, near line 311). Add archive notification. |

### 1.3 Tier 2: New Files (Tests)

| File | Change Type | FRs | Notes |
|------|-------------|-----|-------|
| `src/claude/hooks/tests/prune-functions.test.cjs` | **Create** | FR-001 through FR-005 | Unit tests for all 4 prune functions + `clearTransientFields`. Edge cases: empty state, missing fields, durable field preservation, FIFO boundary conditions, idempotency (NFR-006). |
| `src/claude/hooks/tests/archive-functions.test.cjs` | **Create** | FR-010, FR-011, FR-014, FR-015 | Unit tests for `resolveArchivePath` (single-project + monorepo), `appendToArchive` (create, append, multi-key index, corrupt file, error handling), `seedArchiveFromHistory` (legacy format, missing fields, skip-on-error). |
| `src/claude/hooks/tests/workflow-completion-enforcer.test.cjs` | **Create** | FR-005, FR-010 | Integration tests verifying the enforcer calls `clearTransientFields` + `appendToArchive` after pruning. Verify fail-open on archive write failure. |

### 1.4 Tier 3: Indirect Impact (Verify Only)

These files import from `common.cjs` and read transient fields that will be `null`/empty after pruning. They need verification, NOT modification. The investigation below shows which ones are safe and which need closer inspection.

| File | Transient Fields Read | Guard Pattern | Verdict |
|------|----------------------|---------------|---------|
| `delegation-gate.cjs` | `pending_delegation` | `state.pending_delegation \|\| null` (via `readPendingDelegation()`); also checks `state.phases && state.phases[currentPhase]` at line 181 | **SAFE** -- all reads guarded with null checks |
| `gate-blocker.cjs` | `pending_delegation`, `phases` | `state.pending_delegation` with `if (pending && pending.required_agent)` (line 360-361); `state.phases?.[currentPhase]` with optional chaining (line 375, 712); `if (!state.phases) state.phases = {}` (line 817) | **SAFE** -- optional chaining and null guards throughout |
| `state-write-validator.cjs` | `phases` | `incomingPhases && typeof incomingPhases === 'object'` (line 361); `if (!phases \|\| typeof phases !== 'object')` (line 630) | **SAFE** -- empty `{}` passes the typeof check but `Object.entries({})` returns empty array, so no regression checks fire. Writing pruned state (`phases: {}`) will NOT trigger a block. |
| `iteration-corridor.cjs` | `phases` | `state.phases?.[currentPhase]` with optional chaining (line 90) | **SAFE** -- returns undefined for empty phases, hook early-returns |
| `phase-loop-controller.cjs` | `phases` | `state.phases && state.phases[currentPhase]` (line 84) | **SAFE** -- null-guarded |
| `constitutional-iteration-validator.cjs` | `phases` | `state.phases && state.phases[currentPhase]` (line 104) | **SAFE** -- null-guarded |
| `constitution-validator.cjs` | `phases` | `if (!state.phases) state.phases = {}` (line 185); `state.phases?.[currentPhase]` (line 289) | **SAFE** -- auto-initializes if missing |
| `menu-tracker.cjs` | `phases` | `if (!state.phases) state.phases = {}` (line 165) | **SAFE** -- auto-initializes if missing |
| `test-watcher.cjs` | `phases` | `if (!state.phases) state.phases = {}` (line 469) | **SAFE** -- auto-initializes if missing |
| `skill-delegation-enforcer.cjs` | `pending_delegation` (writes, not reads) | Writes via `writePendingDelegation()` helper | **SAFE** -- writer, not reader of cleared field |
| `state-file-guard.cjs` | (none) | Only guards `state.json` path; regex does NOT match `state-archive.json` | **SAFE** -- archive writes bypass guard by design |
| `plan-surfacer.cjs` | `phases` (referenced in early-phase check) | Checks phase name against hardcoded list, not phase data | **SAFE** -- does not read phase sub-objects |

**Investigation conclusion**: All 12 Tier 3 files are safe. Every hook that reads transient fields uses either optional chaining (`?.`), explicit null guards (`if (!state.phases)`), or auto-initialization patterns (`if (!state.phases) state.phases = {}`). No hooks will break when transient fields are null/empty after pruning.

### 1.5 Tier 4: Reference Update

| File | Change Type | FRs | Notes |
|------|-------------|-----|-------|
| `src/claude/commands/isdlc.md` | Minor update | FR-006 | Line 2119 references "applies state pruning" generically. Should mention updated retention limits to stay consistent with orchestrator instructions. Low risk -- prose only. |

### 1.6 Files Explicitly NOT Affected

| File | Why Not |
|------|---------|
| `src/claude/hooks/lib/provider-utils.cjs` | Reads `readState`/`writeState` and `currentPhase` but only during active workflows (when transients are populated). Never runs post-finalize. |
| `src/claude/hooks/lib/performance-budget.cjs` | Reads `phases` timing array from `active_workflow.phases` (not `state.phases`). Different data structure. |
| `src/claude/hooks/lib/gate-requirements-injector.cjs` | Reads `artifactPathsConfig.phases` -- a config object, not state.phases. Different data. |
| All 5 dispatcher files | Route hooks but don't read transient fields themselves. They pass `ctx` through. |
| `src/claude/hooks/branch-guard.cjs` | Reads `active_workflow.git_branch` but only during active workflows. |
| `src/claude/hooks/explore-readonly-enforcer.cjs` | Reads `active_workflow` presence only (null check). Already handles null. |

---

## 2. Entry Points

### 2.1 Primary Entry: Orchestrator Finalize

```
User says "finalize" or all phases complete
  -> isdlc.md STEP 4: delegates to sdlc-orchestrator with MODE: finalize
    -> 00-sdlc-orchestrator.md MODE: finalize executes
      -> collectPhaseSnapshots(state)                     [existing]
      -> pruneSkillUsageLog(state, 50)                    [FR-001, FR-004]
      -> pruneCompletedPhases(state, [])                  [FR-001]
      -> pruneHistory(state, 100, 200)                    [FR-001, FR-004]
      -> pruneWorkflowHistory(state, 50, 200)             [FR-001]
      -> clearTransientFields(state)                      [FR-002, FR-003]
      -> move to workflow_history                          [existing]
      -> active_workflow = null                            [existing]
      -> writeState(state)                                [existing]
        -> workflow-completion-enforcer.cjs fires          [PostToolUse trigger]
          -> detects active_workflow = null                [existing]
          -> self-heals if needed                          [existing]
          -> pruneSkillUsageLog, etc.                      [existing fallback]
          -> clearTransientFields(state)                   [FR-005]
          -> appendToArchive(workflowRecord)               [FR-010, FR-011]
          -> writeState(state)                             [existing]
```

### 2.2 Secondary Entry: Abandoned Workflow at Init

```
User starts new workflow (/isdlc feature, /isdlc fix)
  -> isdlc.md delegates to sdlc-orchestrator with MODE: init-only
    -> 00-sdlc-orchestrator.md Section 3: Initialization
      -> reads state.json, checks active_workflow          [existing check at line 311]
      -> IF active_workflow is non-null (orphaned):
        -> construct archive record with outcome: "abandoned"  [FR-013]
        -> appendToArchive(abandonedRecord)                     [FR-013, FR-011]
        -> clearTransientFields(state)                          [FR-013, FR-003]
        -> display "Archived abandoned workflow for GH-XX"      [FR-013]
      -> proceed with normal init                               [existing]
```

### 2.3 Tertiary Entry: One-Time Migration

```
First workflow init after GH-39 deployment
  -> orchestrator init detects pruning_migration_completed absent  [FR-009]
  -> seedArchiveFromHistory(state.workflow_history)                 [FR-009, FR-014]
    -> for each legacy entry: appendToArchive(transformedRecord)   [FR-014, FR-011]
  -> pruneSkillUsageLog, etc. (FIFO caps)                          [FR-009]
  -> clearTransientFields(state) if active_workflow is null        [FR-009, FR-003]
  -> set pruning_migration_completed = true                        [FR-009]
  -> writeState(state)                                             [FR-009]
```

---

## 3. Risk Zones

### 3.1 Critical Path Analysis

The two most critical files in the blast radius:

| File | Criticality | Why | Consumers |
|------|-------------|-----|-----------|
| `common.cjs` | **CRITICAL** | Single module imported by ALL 27 hooks. A syntax error here disables the entire framework. | 27 hooks, 5 dispatchers (indirect) |
| `workflow-completion-enforcer.cjs` | **HIGH** | Fallback safety net for all pruning/archiving. If broken, the primary path (orchestrator) has no backup. | Triggered by PostToolUse dispatcher on every state.json write |

No other file in the blast radius has this cascading failure characteristic. The 12 Tier 3 files are consumers only -- they degrade gracefully (optional chaining, null guards) if state fields are missing.

### 3.2 Test Coverage Analysis

**Finding: ZERO test coverage for ALL affected functions.**

Investigation confirmed that the `src/claude/hooks/tests/` directory contains 78 test files, but NONE cover:

| Function / Module | Existing Tests | Gap |
|-------------------|---------------|-----|
| `pruneSkillUsageLog()` | 0 | No tests for FIFO boundary, empty array, missing field |
| `pruneCompletedPhases()` | 0 | No tests for protected phases, strip field list, idempotency |
| `pruneHistory()` | 0 | No tests for FIFO cap, action string truncation |
| `pruneWorkflowHistory()` | 0 | No tests for FIFO cap, description truncation, git_branch compaction |
| `collectPhaseSnapshots()` | 0 | No tests for empty phases, missing active_workflow, timing extraction |
| `workflow-completion-enforcer.cjs` | 0 | No tests for detection logic, self-heal, staleness check, prune integration |

This means we are modifying code that has NEVER been tested in isolation. Every existing behavior is verified only by the fact that "it works in production." Any change could introduce a silent regression with no automated detection.

**Implication**: TDD is not optional for this feature. Every new function AND every modification to existing prune functions MUST have tests written BEFORE deployment. The test files in Tier 2 (Section 1.3) are not nice-to-have -- they are critical risk mitigation.

### 3.3 Race Condition and Concurrency Analysis

#### 3.3.1 Enforcer Read-Modify-Write Window

The enforcer's execution flow is:
```
readState()          -- line 89: reads state.json from disk
... ~136 lines of synchronous computation ...
writeState(state)    -- line 225: writes state.json to disk
```

**Risk**: Non-atomic read-modify-write. Another process could modify state.json between read and write.

**Analysis**: Claude Code hooks execute sequentially in a single-threaded Node.js process. No other hook can interleave during the enforcer's execution. The Claude tool runtime calls hooks one at a time per event. There is no parallelism within a single Claude session.

**Cross-session risk**: Two Claude sessions running on the same project could theoretically write state.json simultaneously. This is a pre-existing risk (not introduced by GH-39) and is mitigated by `state_version` auto-increment in `writeState()` -- the second writer reads the first writer's version and increments.

**Verdict**: No new race condition introduced. Existing single-threaded execution model provides sufficient protection.

#### 3.3.2 Enforcer Re-Triggering Analysis

The enforcer's `writeState()` at line 225 writes state.json to disk, which constitutes a Write tool event. This triggers PostToolUse hooks again, including the enforcer itself.

**Protection chain (3 layers)**:
1. **Staleness check** (line 116-124): `completed_at` timestamp has not changed, still within the 2-minute window -- but this does NOT prevent re-entry.
2. **Completeness guard** (line 127-133): After the first run, the entry HAS `phase_snapshots` (array) AND `metrics` (object with keys). This guard returns early. **This is the primary re-entry protection.**
3. **stateModified: false** (line 240): The enforcer tells the dispatcher not to re-write state, but this only prevents the dispatcher from overwriting -- it does not prevent the enforcer's own `writeState()` from triggering hooks.

**New risk from GH-39**: Adding `appendToArchive()` before `writeState()` means the archive write happens BEFORE the completeness guard can kick in on re-entry. If `appendToArchive` is called on EVERY enforcer invocation (not just the first), duplicates could appear in the archive.

**Mitigation**: The dedup check MUST live inside `appendToArchive()` itself (not in the enforcer), because the orchestrator is also a caller. The check is: if the last record in the archive has the same `slug` AND `completed_at` timestamp, skip the append. O(1) cost.

#### 3.3.3 Archive File Concurrency

`state-archive.json` is a NEW file. Today it has zero writers. After GH-39:

| Writer | When | Frequency |
|--------|------|-----------|
| Enforcer (`appendToArchive`) | After workflow completion | Once per workflow |
| Orchestrator init (`appendToArchive`) | On abandoned workflow detection | Rare |
| Migration (`seedArchiveFromHistory`) | First run only | Once ever |

The orchestrator and enforcer NEVER run simultaneously (orchestrator is an agent prompt, enforcer is a PostToolUse hook -- different lifecycle phases). The migration runs during orchestrator init, before any enforcer trigger. No concurrent writers.

**Verdict**: No concurrency risk for the archive file.

### 3.4 Data Integrity Analysis

#### 3.4.1 Partial Write Corruption

`writeFileSync` is used for both `state.json` and the future `state-archive.json`. On modern filesystems (APFS, ext4), `writeFileSync` with a complete buffer is effectively atomic for small files. However, for files approaching the page size boundary (~4 KB), a crash during write could leave a partial file.

**state.json risk**: LOW. `writeState()` already uses `JSON.stringify(state, null, 2)` which produces the complete buffer before writing. The file is overwritten atomically. If the write fails mid-stream, the next `readState()` returns `null` (catch in JSON.parse), and the hook returns early. Fail-open.

**state-archive.json risk**: LOW-MEDIUM. The archive uses read-modify-write: `readFileSync` -> parse -> push record -> `writeFileSync`. If the write fails mid-stream, the archive is corrupted. `appendToArchive()` must handle this gracefully.

**Mitigation**: `appendToArchive()` reads the file, wraps the parse in try/catch. If the file is corrupt (invalid JSON), it logs a warning and starts a fresh archive. This loses existing records but unblocks future writes. The lost records are still available in `workflow_history` (they were just summaries anyway).

#### 3.4.2 Durable Field Protection

The following fields MUST survive pruning unchanged:

| Durable Field | Who reads it | Protection |
|---------------|-------------|-----------|
| `framework_version` | Orchestrator | Not referenced by any prune function |
| `initialized_at` | Orchestrator | Not referenced by any prune function |
| `project_config` | Orchestrator, hooks | Not referenced by any prune function |
| `state_version` | `writeState()`, `state-write-validator` | Auto-incremented by `writeState()`, never pruned |
| `workflow_history` | Enforcer, orchestrator | FIFO-capped but never deleted entirely |
| `skill_usage_log` | `log-skill-usage` hook | FIFO-capped but never deleted entirely |
| `history` | Orchestrator | FIFO-capped but never deleted entirely |

`clearTransientFields()` only touches the 6 transient fields documented in requirements-spec.md Section 5.3. It does NOT iterate over all state keys. No durable field is at risk.

**Verification**: Unit test that creates a state with all durable fields populated, calls `clearTransientFields()`, and asserts every durable field is unchanged.

#### 3.4.3 Archive Index Integrity

The archive's multi-key index maps `source_id` and `slug` to record indices. If `appendToArchive()` writes the record but crashes before updating the index, the index will be stale (record exists but index does not point to it).

**Mitigation**: The index is rebuilt from the records array on every append. Alternatively, the index is a convenience optimization for `lookupArchive()` (deferred, not MVP). If the index is wrong, the worst case is a linear scan on lookup. Since `lookupArchive()` is deferred, this risk is effectively deferred too.

**Design decision for architecture phase**: Should the index be maintained on write (optimistic, small risk of staleness) or rebuilt on read (pessimistic, always correct, slightly slower lookup)?

### 3.5 Backward Compatibility Analysis

#### 3.5.1 Existing State Files Without New Fields

After GH-39, new code will reference `pruning_migration_completed` (a flag in state.json). Existing state files do not have this field.

**Risk**: Code that reads `state.pruning_migration_completed` on an old state file gets `undefined`.

**Mitigation**: The migration check uses `if (!state.pruning_migration_completed)` which is falsy for both `false` and `undefined`. Old state files trigger the migration, which is the correct behavior.

#### 3.5.2 Enforcer on Pre-GH-39 State Files

The enforcer currently imports `pruneSkillUsageLog`, `pruneCompletedPhases`, `pruneHistory`, `pruneWorkflowHistory`. After GH-39, it will also import `clearTransientFields` and `appendToArchive`.

**Risk**: If a user updates `common.cjs` but not the enforcer (partial deployment), the enforcer will try to import functions that do not exist and crash.

**Mitigation**: All changes ship in a single commit. The iSDLC framework is always deployed as a whole (npm package). Partial deployment is not a supported scenario.

#### 3.5.3 State-Write-Validator and Pruned State

Verified in step 02-01: `state-write-validator.cjs` Check 3 compares `phases` between incoming and disk. When incoming has `phases: {}` and disk has populated phases, `Object.entries({})` returns `[]` so the regression loop body never executes. Safe.

**Additional check**: Check 7 (state_version) in the validator compares version numbers. Since `writeState()` auto-increments from disk, the enforcer's write will always have version > disk. Safe.

#### 3.5.4 Archive File Absence

Before GH-39, `state-archive.json` does not exist. After GH-39, `appendToArchive()` will be called on workflow completion.

**Risk**: `readFileSync` throws `ENOENT` if the file does not exist.

**Mitigation**: `appendToArchive()` checks `existsSync` before reading. If the file does not exist, it creates a new archive with `{ version: 1, records: [], index: {} }`. This is documented in FR-011 AC-011-01.

### 3.6 Prompt Compliance Risk

**Why**: FR-006 adds pruning instructions to the orchestrator prompt (an LLM agent). The LLM may not follow them perfectly.

**Analysis**: The orchestrator prompt is ~1,600 lines. Adding 10-15 lines of explicit prune instructions to MODE: finalize has high compliance probability -- the orchestrator has reliably followed finalize instructions across 18+ workflows. The instructions will be positioned at the exact point in the flow where pruning should occur (after snapshot collection, before state write).

**Mitigation**: Defense-in-depth. Primary (orchestrator) + fallback (enforcer). Even if the LLM skips pruning, the enforcer runs the same operations on the next state.json write. The user never notices.

### 3.7 Migration Ordering Risk

**Why**: FR-009 requires `seedArchiveFromHistory()` to run BEFORE FIFO pruning. If the ordering is wrong, historical entries could be pruned from `workflow_history` before they are seeded to the archive, resulting in data loss.

**Analysis**: The migration is a synchronous sequence in the orchestrator init. There is no mechanism for the operations to be reordered at runtime. The risk is purely a code authoring error.

**Mitigation**: The orchestrator prompt will document the sequence prominently:
1. Seed archive from history (captures ALL entries)
2. Apply FIFO pruning (caps arrays)
3. Clear transient fields
4. Set `pruning_migration_completed = true`
5. Write state

Unit test for `seedArchiveFromHistory()` with a workflow_history containing more entries than the FIFO cap to verify all entries are captured before cap is applied.

### 3.8 Comprehensive Risk Matrix

| # | Risk | Area | Likelihood | Impact | Mitigation | FR/NFR Trace |
|---|------|------|-----------|--------|-----------|-------------|
| R1 | Syntax error in common.cjs breaks all 27 hooks | Critical path | LOW | **CRITICAL** | `node -c` syntax check in CI/pre-commit; unit tests verify all exports are callable | All FRs |
| R2 | Zero test coverage: existing prune functions have unknown edge case bugs | Test coverage | **MEDIUM** | **HIGH** | TDD: write tests before modifying any function; cover empty state, missing fields, FIFO boundaries, idempotency | NFR-006 |
| R3 | Enforcer re-triggers and creates duplicate archive entries | Race condition | **MEDIUM** | MEDIUM | O(1) dedup check in `appendToArchive()`: skip if last record has same `slug` + `completed_at` | FR-011 |
| R4 | Archive file corruption from partial `writeFileSync` | Data integrity | LOW | MEDIUM | Read-parse in try/catch; corrupt file triggers fresh archive creation with warning log | NFR-008 |
| R5 | Durable fields accidentally modified by pruning | Data integrity | LOW | **HIGH** | `clearTransientFields()` only touches named transient fields; unit test verifies all durables unchanged | NFR-003 |
| R6 | State-write-validator blocks pruned state write | Backward compat | LOW | **HIGH** | Verified safe: `Object.entries({})` returns `[]`; integration test confirms no block | NFR-004 |
| R7 | Migration seeds archive then FIFO prune drops entries before write | Data integrity | LOW | **HIGH** | Seed BEFORE prune (documented sequence); test with >50 workflow_history entries | FR-009, FR-014 |
| R8 | Orchestrator LLM ignores pruning instructions | Prompt compliance | MEDIUM | LOW | Enforcer fallback runs identical operations; defense-in-depth | FR-006, NFR-001 |
| R9 | Archive file grows unboundedly over years | Data integrity | LOW | LOW | ~2 KB/record; 1 MB after 500 workflows (~1.4 years); rotation deferred to follow-up | NFR-010 |
| R10 | Monorepo archive path diverges from state path | Backward compat | LOW | **HIGH** | `resolveArchivePath()` clones `resolveStatePath()` logic; NFR-009 isolation test | NFR-009, FR-015 |
| R11 | `appendToArchive()` called on non-existent file throws ENOENT | Backward compat | **HIGH** (guaranteed on first use) | LOW | `existsSync` check; create fresh archive if absent; AC-011-01 | FR-011 |
| R12 | Partial deployment: enforcer imports new functions from old common.cjs | Backward compat | LOW | **HIGH** | All changes ship in single commit; npm package is atomic deployment unit | All |
| R13 | Archive index becomes stale if write crashes after record append | Data integrity | LOW | LOW | Index rebuilt on each append; `lookupArchive()` (deferred) can fall back to linear scan | FR-011 |

### 3.9 Risk Priority Summary

**Must address before implementation** (blocking):
- R1: Syntax check gate
- R2: TDD for all functions (no code without tests)
- R3: Dedup in `appendToArchive()`

**Must address during implementation** (inline):
- R5: Durable field protection test
- R6: Validator interaction test
- R7: Migration ordering test
- R11: First-use archive creation

**Accept and monitor** (no action needed):
- R4, R8, R9, R10, R12, R13

---

## 4. Dependency Map

### 4.1 Import Chain

```
common.cjs (Tier 1)
  |-- workflow-completion-enforcer.cjs (Tier 1) -- imports new functions
  |-- gate-blocker.cjs (Tier 3) -- reads phases, pending_delegation
  |-- delegation-gate.cjs (Tier 3) -- reads pending_delegation
  |-- state-write-validator.cjs (Tier 3) -- validates phase writes
  |-- iteration-corridor.cjs (Tier 3) -- reads phases
  |-- phase-loop-controller.cjs (Tier 3) -- reads phases
  |-- constitutional-iteration-validator.cjs (Tier 3) -- reads phases
  |-- constitution-validator.cjs (Tier 3) -- reads/writes phases
  |-- menu-tracker.cjs (Tier 3) -- reads/writes phases
  |-- test-watcher.cjs (Tier 3) -- reads/writes phases
  |-- skill-delegation-enforcer.cjs (Tier 3) -- writes pending_delegation
  |-- plan-surfacer.cjs (Tier 3) -- reads phase names
  +-- 15 other hooks (Tier 5: unaffected) -- read active_workflow, skill_usage_log, etc.

00-sdlc-orchestrator.md (Tier 1)
  |-- isdlc.md (Tier 4) -- references finalize behavior
  +-- No code imports (prompt-driven agent)
```

### 4.2 New File (state-archive.json) Impact

```
state-archive.json (NEW runtime file)
  |-- Written by: appendToArchive() in common.cjs
  |   |-- Called by: workflow-completion-enforcer.cjs (completed + cancelled workflows)
  |   |-- Called by: 00-sdlc-orchestrator.md init (abandoned workflows, FR-013)
  |   +-- Called by: seedArchiveFromHistory() (one-time migration, FR-009)
  |-- Read by: lookupArchive() in common.cjs (DEFERRED, FR-012)
  +-- NOT guarded by: state-file-guard.cjs (only guards state.json)
```

---

## 5. Scope Consistency Check

| Attribute | Quick-Scan Estimate | Actual (This Analysis) | Match? |
|-----------|-------------------|----------------------|--------|
| Scope | MEDIUM | MEDIUM | Yes |
| Complexity | MEDIUM-HIGH | MEDIUM-HIGH | Yes |
| Files modified | 3 | 3 (+ 1 minor) | Yes |
| Files created | 3 (tests) | 3 (tests) | Yes |
| Files verified | 7 | 12 (more thorough) | Expanded |
| Total blast radius | ~13 | 19 | Expanded (better coverage) |

The actual blast radius is larger than the quick-scan estimate because the investigation traced all 24 hooks that reference transient fields, not just the 7 highlighted in the requirements spec. The 12 extra files are all Tier 3 (verify only) -- no additional modifications needed. The scope and complexity ratings from Phase 00 remain accurate.

---

## 6. Implementation Starting Point

### 6.1 Recommended Starting Point: `common.cjs` -- Foundation Functions

The implementation starts in `src/claude/hooks/lib/common.cjs` because every other change depends on functions defined there. No integration file can be touched until the foundation functions exist and are tested.

**Why not start with the orchestrator prompt?** The orchestrator prompt changes (FR-001, FR-006, FR-013) reference function names that must exist in `common.cjs` first. The enforcer changes (FR-005, FR-010) import the new functions. Starting anywhere else creates forward references to non-existent code.

**Why not start with tests?** TDD is the correct approach for the foundation functions. But the "starting point" is still `common.cjs` -- write a function, write its test, repeat. The test files are created alongside the functions, not before.

### 6.2 Critical Path

The critical path is the longest dependency chain that determines minimum implementation time:

```
FR-015 (resolveArchivePath)
  -> FR-011 (appendToArchive)
    -> FR-010 (enforcer: archive write)
      -> FR-009 (migration: seedArchiveFromHistory)
```

This chain has 4 links. Every other FR either runs in parallel with this chain or branches off it. The critical path determines that implementation requires at minimum 4 sequential work units.

---

## 7. Implementation Order

### Layer 0: Foundation Functions (No Dependencies -- Parallel)

These two functions have zero dependencies on other new code. They can be built simultaneously.

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 0a | `common.cjs` | FR-003 | `clearTransientFields(state)` | `prune-functions.test.cjs` | Simple: set 6 fields to null/empty. Returns mutated state. Pattern: same as existing prune functions (mutate + return). |
| 0b | `common.cjs` | FR-015 | `resolveArchivePath(projectId)` | `archive-functions.test.cjs` | Clone `resolveStatePath()` (line 327), replace `'state.json'` with `'state-archive.json'`. 12 lines of code. |

**Verification gate**: Both functions exported, both test suites green, `node -c common.cjs` passes.

### Layer 1: Archive Write Function (Depends on Layer 0b)

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 1 | `common.cjs` | FR-011 | `appendToArchive(record, projectId)` | `archive-functions.test.cjs` | Reads archive via `resolveArchivePath()`, appends record, updates multi-key index, writes file. Try/catch entire body, log warning on failure, never throw. Pattern: mirrors `writeState()` -- read from disk, modify in memory, `JSON.stringify(obj, null, 2)`, `writeFileSync`. Dedup check: if last record has same `slug` + `completed_at`, skip append. |

**Verification gate**: Test covers create-new, append-existing, multi-key index, corrupt file recovery, monorepo isolation.

### Layer 2: Migration Seed Function (Depends on Layer 1)

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 2 | `common.cjs` | FR-014 | `seedArchiveFromHistory(workflowHistory)` | `archive-functions.test.cjs` | Iterates legacy entries, transforms format (`git_branch.name` -> `branch`, `git_branch.status` -> `outcome`, `phase_snapshots` -> compact `phase_summary`). Calls `appendToArchive()` for each. Skip-on-error per entry. |

**Verification gate**: Test with real format from current state.json workflow_history entries. Handle missing `source_id`, missing `slug`, entries with neither.

### Layer 3: Prune Function Defaults (No Dependencies)

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 3 | `common.cjs` | FR-004 | Update default args | `prune-functions.test.cjs` | Change `pruneSkillUsageLog` default from 20 to 50, `pruneHistory` default from 50 to 100. Two lines changed. |

**Verification gate**: Existing prune behavior preserved at new defaults. FIFO boundary tests green.

### Layer 4: Enforcer Integration (Depends on Layers 0a, 1)

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 4a | `workflow-completion-enforcer.cjs` | FR-005 | Add `clearTransientFields(state)` call | `workflow-completion-enforcer.test.cjs` | Insert after line 222 (post-prune). Add `clearTransientFields` to import block (line 29). |
| 4b | `workflow-completion-enforcer.cjs` | FR-010 | Add `appendToArchive()` call | `workflow-completion-enforcer.test.cjs` | Construct archive record from `lastEntry` fields. Insert between prune block and `writeState()`. Add `appendToArchive` to import block. Wrap in try/catch (fail-open). |
| 4c | `workflow-completion-enforcer.cjs` | FR-004 | Update prune call args | -- | Lines 219-222: change `pruneSkillUsageLog(state, 20)` to `(state, 50)`, `pruneHistory(state, 50, 200)` to `(state, 100, 200)`. |

**Archive record construction** (step 4b -- most complex part of enforcer changes):
```
const lastEntry = state.workflow_history[state.workflow_history.length - 1];
const archiveRecord = {
    source_id: lastEntry.id || null,           // e.g., "GH-39" or "REQ-0001"
    slug: lastEntry.artifact_folder || null,   // e.g., "state-json-pruning-GH-39"
    workflow_type: lastEntry.type || null,      // e.g., "feature"
    completed_at: lastEntry.completed_at || lastEntry.cancelled_at || new Date().toISOString(),
    branch: lastEntry.git_branch?.name || null,
    outcome: lastEntry.status === 'cancelled' ? 'cancelled'
           : lastEntry.git_branch?.status === 'merged' ? 'merged'
           : 'completed',
    reason: lastEntry.cancellation_reason || null,
    phase_summary: (lastEntry.phase_snapshots || []).map(s => ({
        phase: s.key, status: s.status, summary: s.summary || null
    })),
    metrics: lastEntry.metrics || {}
};
appendToArchive(archiveRecord);
```

**Data source mapping** (verified from codebase investigation):

| Archive Field | Source in `workflow_history` Entry | Available? |
|--------------|-----------------------------------|-----------|
| `source_id` | `lastEntry.id` (set during init from `artifact_prefix + counter`) | Yes -- may be null for legacy entries |
| `slug` | `lastEntry.artifact_folder` (set during init) | Yes -- may be null for legacy entries |
| `workflow_type` | `lastEntry.type` | Yes |
| `completed_at` | `lastEntry.completed_at` or `lastEntry.cancelled_at` | Yes |
| `branch` | `lastEntry.git_branch.name` | Yes (may be absent for branchless workflows) |
| `outcome` | Derived from `lastEntry.status` + `lastEntry.git_branch.status` | Yes |
| `reason` | `lastEntry.cancellation_reason` | Yes (null for non-cancelled) |
| `phase_summary` | Compact from `lastEntry.phase_snapshots` | Yes (just collected by enforcer) |
| `metrics` | `lastEntry.metrics` | Yes (just collected by enforcer) |

**Verification gate**: Integration test with mock state.json demonstrating full enforcer flow: detect completion -> self-heal -> prune -> clear transients -> archive -> write.

### Layer 5: Orchestrator Prompt Updates (Depends on Layer 0a vocabulary)

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 5a | `00-sdlc-orchestrator.md` | FR-006 | Update MODE: finalize instructions | -- | Line 655 + line 693: update retention limits (50/100/50), add `clearTransientFields`, make execution order explicit. Prose only. |
| 5b | `00-sdlc-orchestrator.md` | FR-001 | (Covered by 5a) | -- | FR-001 is satisfied by the updated finalize instructions from FR-006. |
| 5c | `00-sdlc-orchestrator.md` | FR-013 | Add abandoned workflow detection to init | -- | Section 3, line 311: change "inform user and suggest `/isdlc cancel`" to auto-archive with `outcome: "abandoned"`, call `appendToArchive`, `clearTransientFields`, display one-line notification. |
| 5d | `src/claude/commands/isdlc.md` | FR-006 | Update line 2119 | -- | Minor: mention updated retention limits. Prose only. |

**No test needed**: These are prompt/documentation changes. The enforcer (Layer 4) is the testable safety net.

### Layer 6: Migration (Depends on Layers 1, 2)

| Step | File | FR | Function | Test | Notes |
|------|------|-----|----------|------|-------|
| 6 | `00-sdlc-orchestrator.md` | FR-009 | Add migration instructions to init | -- | Section 3: check `pruning_migration_completed` flag. If absent: `seedArchiveFromHistory(state.workflow_history)`, then FIFO prune, then `clearTransientFields` if `active_workflow` is null, then set flag. |

**No test needed**: Migration is a one-time orchestrator action. The underlying functions (`seedArchiveFromHistory`, `appendToArchive`) are unit-tested in Layers 1-2.

### 7.1 Parallel Opportunities

```
                    Layer 0
                   /       \
              0a: clear   0b: resolve
              Transient   ArchivePath
                   |         |
                   |    Layer 1: appendToArchive
                   |         |
                   |    Layer 2: seedArchiveFromHistory
                   |         |
                Layer 4:  Layer 4b:         Layer 3:
                enforcer  enforcer          prune defaults
                clear     archive           (independent)
                   \       /
                   Layer 5:
                 orchestrator
                   prompt
                     |
                   Layer 6:
                   migration
```

**Parallel track A** (pure functions): 0a -> 3 -> (done, awaits Layer 4 integration)
**Parallel track B** (archive chain): 0b -> 1 -> 2 -> (done, awaits Layer 4/6 integration)
**Integration**: 4 (enforcer, needs A+B) -> 5 (orchestrator, prose) -> 6 (migration, prose)

### 7.2 Minimum Implementation Sequence (Serial)

If working single-threaded (one developer), the optimal order is:

| Order | Layer | FR(s) | File | Effort | Cumulative |
|-------|-------|-------|------|--------|------------|
| 1 | 0a | FR-003 | common.cjs | Small | Small |
| 2 | 0b | FR-015 | common.cjs | Small | Small |
| 3 | 1 | FR-011 | common.cjs | Medium | Medium |
| 4 | 3 | FR-004 | common.cjs | Trivial | Medium |
| 5 | 2 | FR-014 | common.cjs | Small | Medium |
| 6 | 4 | FR-005, FR-010 | enforcer.cjs | Medium | Medium-Large |
| 7 | 5 | FR-001, FR-006, FR-013 | orchestrator.md | Medium | Large |
| 8 | 5d | FR-006 | isdlc.md | Trivial | Large |
| 9 | 6 | FR-009 | orchestrator.md | Small | Large |

**All common.cjs work completes first** (orders 1-5), minimizing context switches. Then the enforcer integration (order 6). Then all prompt changes (orders 7-9).

### 7.3 Could Have / Deferred (Not in Critical Path)

| FR | Layer | When to Implement | Notes |
|----|-------|-------------------|-------|
| FR-007 | -- | After MVP ships | Compact phase_snapshots in older entries. Enhances `pruneWorkflowHistory`. |
| FR-008 | -- | After MVP ships | Compact git_branch in older entries. Enhances `pruneWorkflowHistory`. |
| FR-012 | -- | Follow-up feature | `lookupArchive()`. Read path for archive. Data accumulates via write path. |

---

## 8. Executive Summary

### 8.1 Impact Overview

| Metric | Value |
|--------|-------|
| Total blast radius | 19 files |
| Files modified | 3 |
| Files created (tests) | 3 |
| Files verified safe | 12 |
| Files updated (reference) | 1 |
| Overall risk level | **MEDIUM-HIGH** |
| Blocking risks | 3 (R1, R2, R3) |
| Inline risks | 4 (R5, R6, R7, R11) |
| Accepted risks | 6 (R4, R8, R9, R10, R12, R13) |
| Critical path depth | 4 layers |
| Implementation steps | 9 (serial) |

### 8.2 Key Findings

1. **Scope confirmed**: The quick-scan estimate of MEDIUM scope / MEDIUM-HIGH complexity holds. The blast radius expanded from 13 to 19 files, but the additional 6 files are verify-only (no changes needed).

2. **All downstream hooks are safe**: Every one of the 12 Tier 3 hooks that read transient fields uses optional chaining, null guards, or auto-initialization. Zero hooks will break when fields are pruned.

3. **Zero test coverage is the biggest risk**: None of the 4 prune functions, `collectPhaseSnapshots`, or the workflow-completion-enforcer have any tests. TDD is mandatory for this feature.

4. **No new concurrency risks**: The single-threaded hook execution model prevents race conditions. The archive file has no concurrent writers. The enforcer's re-triggering is prevented by the existing completeness guard (lines 127-133).

5. **Dedup is a design decision**: The architecture phase must decide whether `appendToArchive()` deduplicates internally or whether callers are responsible. The recommendation is internal dedup (O(1) check on last record).

### 8.3 Go/No-Go Recommendation

**GO** -- proceed to architecture phase. All risks have concrete mitigations. The implementation order sequences work to minimize cascading failure risk (all `common.cjs` work first, tested in isolation, then integrations).

### 8.4 Open Questions for Architecture Phase

1. Should the archive index be maintained on write (optimistic) or rebuilt on read (pessimistic)?
2. Should dedup live in `appendToArchive()` or in each caller?
3. Should `clearTransientFields()` accept a field list parameter (extensible) or hardcode the 6 known transient fields (simple)?
