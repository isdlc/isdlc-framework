# Module Design: Structured Task Breakdown from Analysis

**Slug**: REQ-GH-208-generate-structured-task-breakdown-artifact
**Version**: 1.0.0

---

## 1. Overview

This feature has **zero new code modules** — all changes are protocol-level modifications to existing markdown specification files. The "modules" below are sections within those files.

| Change | Location | Type | Responsibility |
|---|---|---|---|
| Task Generation Protocol | `src/claude/agents/roundtable-analyst.md` | Protocol addition | Generate task list from in-memory artifacts (Claude) |
| Confirmation State Machine (Claude) | `src/claude/agents/roundtable-analyst.md` | State addition | `PRESENTING_TASKS` state between DESIGN and FINALIZING |
| Confirmation State Machine (Core) | `src/core/analyze/state-machine.js` | State + transition addition | `PRESENTING_TASKS` in STATES, transitionTable, and tierPaths (Codex + all providers) |
| Analyze Orchestrator (Core) | `src/core/orchestration/analyze.js` | Confirmation sequence update | `runConfirmationSequence()` handles PRESENTING_TASKS domain |
| Batch Write Extension | `src/claude/agents/roundtable-analyst.md` | Write list addition | Include tasks.md in the batch write set |
| Finalization Chain (Core) | `src/core/analyze/finalization-chain.js` | Artifact list update | Include tasks.md in the finalization artifact set |
| Build-Init Copy | `src/claude/commands/isdlc.md` | Step addition | Copy `{slug}/tasks.md` to `docs/isdlc/tasks.md` at build init |
| Build-Init Copy (Core) | `src/core/orchestration/phase-loop.js` | Step addition | Same copy logic for Codex provider |
| 3e-plan Guard | `src/claude/commands/isdlc.md` | Guard addition | Skip generation if pre-existing tasks.md found |
| 3e-refine Guard | `src/claude/commands/isdlc.md` | Guard addition | Skip refinement if tasks already have file-level detail |
| Contract Schema Extension | `src/core/validators/contract-schema.js` | Field addition | Add `task_display` and `task_scope` to presentation |

---

## 2. Task Generation Protocol (roundtable-analyst.md)

### Location
New section in roundtable-analyst.md, after Section 2.5 (confirmation sequence), referenced during the `PRESENTING_TASKS` state.

### Algorithm

After design acceptance (`PRESENTING_DESIGN` → Accept), the roundtable executes:

```
1. EXTRACT from in-memory artifacts:
   - From module-design.md: module list, public interfaces, file paths,
     dependencies between modules, estimated LOC per module
   - From requirements-spec.md: FR-NNN list with AC-NNN-NN identifiers,
     MoSCoW priorities
   - From architecture-overview.md: ADRs (for integration points, technology
     decisions), provider-specific changes

2. CLASSIFY each module/file into implementation phases:
   - Setup: config changes, directory creation, exports, initial schema
   - Foundational: shared utilities, state helpers, base types/interfaces
   - Core Implementation: primary business logic modules
   - Provider/Integration: provider-specific adapters, external integrations
   - Tests: test files per module (one test task per production file)
   - Polish: documentation, cleanup, generated artifacts

3. ASSIGN task IDs (T0001+) sequentially across all phases.

4. For each task:
   a. Set file path(s) with CREATE or MODIFY marker
   b. Compute blocked_by: if this file imports from another file in the
      task list, it's blocked by that file's task
   c. Compute blocks: inverse of blocked_by
   d. Set [P] marker if: no blocked_by dependencies AND no other task in
      the same tier is blocked_by this task's outputs
   e. Set | traces: annotation by matching the file's purpose against
      FR/AC descriptions from requirements-spec.md

5. VALIDATE:
   a. Acyclicity: no task transitively depends on itself
   b. Traceability: >= 80% of FRs have at least one task with traces
   c. Completeness: every module from module-design.md has at least one task
   d. Format: all tasks conform to v2.0 EBNF grammar

6. COMPUTE summary:
   a. Total tasks, tasks per phase
   b. Critical path: longest chain of blocked_by dependencies
   c. Parallel tiers: group tasks by dependency depth (Tier 0 = no deps,
      Tier 1 = depends only on Tier 0, etc.)
   d. Total files: count of unique file paths (CREATE + MODIFY)
```

### Task Scope Modes

Read `task_scope` from execution contract `presentation` section (default: `"full-workflow"`):

**full-workflow**: Generate tasks for ALL build phases:
- Phase 05 (Test Strategy): one task per test file group
- Phase 06 (Implementation): file-level tasks with dependencies (the bulk)
- Phase 16 (Quality Loop): test execution, coverage check, lint, security scan
- Phase 08 (Code Review): review per module group

**implementation-only**: Generate tasks for implementation scope only:
- Setup, Foundational, Core, Provider/Integration, Tests, Polish
- No Phase 05/16/08 mechanical tasks

### Error Handling

If task generation fails (LLM produces malformed output, context window exhausted):
- Log warning: "Task breakdown generation failed: {reason}"
- Skip `PRESENTING_TASKS` state — transition directly to `FINALIZING`
- Write the other three artifacts in the batch (requirements-spec, architecture-overview, module-design)
- Set `meta.task_breakdown_generated = false`
- The build workflow will generate tasks via `3e-plan`/`3e-refine` as fallback

---

## 3. Core State Machine Update (src/core/analyze/state-machine.js)

This is the provider-neutral FSM that Codex's `runAnalyze()` uses. Must be updated in lockstep with the Claude protocol.

### Current STATES
```js
const STATES = Object.freeze({
  IDLE, PRESENTING_REQUIREMENTS, PRESENTING_ARCHITECTURE, PRESENTING_DESIGN,
  AMENDING, FINALIZING, COMPLETE
});
```

### Updated STATES
```js
const STATES = Object.freeze({
  IDLE, PRESENTING_REQUIREMENTS, PRESENTING_ARCHITECTURE, PRESENTING_DESIGN,
  PRESENTING_TASKS,  // NEW
  AMENDING, FINALIZING, COMPLETE
});
```

### Updated transitionTable
```js
// Existing — change target:
'PRESENTING_DESIGN:accept':    'PRESENTING_TASKS',    // was 'FINALIZING'
'PRESENTING_DESIGN:amend':     'AMENDING',             // unchanged

// New:
'PRESENTING_TASKS:accept':     'FINALIZING',
'PRESENTING_TASKS:amend':      'AMENDING',
```

### Updated tierPaths
```js
const tierPaths = Object.freeze({
  standard: Object.freeze(['PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']),
  light:    Object.freeze(['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN']),  // NO tasks — no design detail
  trivial:  Object.freeze(['FINALIZING'])
});
```

---

## 4. Core Analyze Orchestrator Update (src/core/orchestration/analyze.js)

### runConfirmationSequence()

The function iterates `getConfirmationSequence(sizing)` and presents each domain. With `PRESENTING_TASKS` added to the tier path, the orchestrator automatically picks it up — no structural changes needed to the loop.

However, the domain-to-presentation mapping needs a new entry:

```js
// In stateToDomain() or equivalent mapping:
'PRESENTING_TASKS': 'tasks'
```

And the `runtime.presentInteractive()` call for the `tasks` domain needs to:
1. Generate the task summary (task count, phases, critical path) from the in-memory conversation history
2. Present it to the user for Accept/Amend

For Codex, the task generation happens within the `presentInteractive()` call — the Codex runtime builds the instruction bundle via `projectInstructions()` which includes the task generation prompt.

---

## 5. Core Finalization Chain Update (src/core/analyze/finalization-chain.js)

The finalization chain defines which artifacts are written at the end of analysis. Add `tasks.md` to the artifact list:

```js
// In getFinalizationChain() or equivalent:
artifacts: [
  'requirements-spec.md',
  'architecture-overview.md',
  'module-design.md',
  'tasks.md',           // NEW — only when task_breakdown_generated is true
  'user-stories.json',
  'traceability-matrix.csv',
  'meta.json'
]
```

Guard: only include `tasks.md` if `PRESENTING_TASKS` was in the confirmation sequence (i.e., not trivial tier — light tier DOES include tasks).

---

## 6. Confirmation State Machine Update (roundtable-analyst.md — Claude-specific)

### Current State Flow (line 147)
```
IDLE → PRESENTING_REQUIREMENTS → (Accept) → PRESENTING_ARCHITECTURE → (Accept) → PRESENTING_DESIGN → (Accept) → FINALIZING → COMPLETE
```

### New State Flow
```
IDLE → PRESENTING_REQUIREMENTS → (Accept) → PRESENTING_ARCHITECTURE → (Accept) → PRESENTING_DESIGN → (Accept) → PRESENTING_TASKS → (Accept) → FINALIZING → COMPLETE
```

### New State: PRESENTING_TASKS

**Entry**: After `PRESENTING_DESIGN` Accept.

**Guard**: Skip only if `sizing_decision.effective_intensity === "trivial"`. Light workflows DO present tasks — requirements + impact analysis provide enough detail (affected files, FR/AC traces, blast radius) to derive a file-level task breakdown even without formal architecture/design artifacts.

**Presentation format** (summary, not full dump):

```
**Task Breakdown**:

| Phase | Tasks | Files |
|-------|-------|-------|
| Setup | 3 | 3 CREATE |
| Foundational | 4 | 1 MODIFY |
| Core Implementation | 6 | 4 CREATE, 1 MODIFY |
| Provider Integration | 4 | 3 MODIFY |
| Tests | 9 | 9 CREATE |
| Polish | 3 | 2 CREATE, 1 MODIFY |
| **Total** | **29** | **14 CREATE, 6 MODIFY** |

Critical path: 8 tasks (T007 → T008 → T010 → T014 → T029)
Parallel tiers: 6 (Tier 0: 4 tasks can start immediately)
Traceability: 9/9 FRs covered (100%)

Accept or amend?
```

**Transitions**:
- Accept → `FINALIZING` (batch write all 4 artifacts)
- Amend → `AMENDING` (re-enter conversation, user specifies what to change)

### Amend Behavior

When user amends the task breakdown:
- User can: remove specific tasks, defer entire phases, request different grouping, flag missing tasks
- The roundtable adjusts the in-memory task list, recomputes dependencies (removing blocked_by/blocks edges for removed tasks), recomputes summary
- Re-presents the summary
- Loops until Accept

---

## 4. Batch Write Extension (roundtable-analyst.md Section 5.5)

### Current Batch Write Set
1. `requirements-spec.md`
2. `architecture-overview.md`
3. `module-design.md`
4. `user-stories.json` (if generated)
5. `traceability-matrix.csv` (if generated)
6. `meta.json` (progress update)

### Updated Batch Write Set
Add after item 3:
4. `tasks.md` — task breakdown (v2.0 format)

Only written if `PRESENTING_TASKS` was not skipped (i.e., non-light workflows where task generation succeeded).

### tasks.md Header Block

```markdown
# Task Plan: {slug}

**Source**: {source} {source_id}
**Generated after**: Analysis acceptance
**FRs**: {count} | **ADRs**: {count} | **Estimated LOC**: {sum from module-design}
**Blast Radius**: {from architecture-overview if available}
**Format**: v2.0

---
```

---

## 5. Build-Init Copy (isdlc.md)

### Location
After STEP 1 (orchestrator init-only returns), before STEP 2 (task creation).

### New Step: Copy Pre-Existing Tasks

```
After init returns with artifact_folder:

1. Check if docs/requirements/{artifact_folder}/tasks.md exists
2. If found:
   a. Read the file
   b. Write to docs/isdlc/tasks.md (or docs/isdlc/projects/{project-id}/tasks.md for monorepo)
   c. Log: "Pre-generated task plan found, copied to docs/isdlc/tasks.md"
3. If not found:
   a. Skip — 3e-plan will generate after Phase 01 (backward compat)
```

---

## 6. 3e-plan Guard (isdlc.md line 2032)

### Current Behavior
```
If phase just completed is 01-requirements AND docs/isdlc/tasks.md does NOT exist:
  → generate plan via ORCH-012
```

### Updated Behavior
```
If phase just completed is 01-requirements:
  1. Check if docs/isdlc/tasks.md already exists (from build-init copy)
  2. If exists AND its header contains the current artifact_folder slug:
     → Skip generation, log: "Pre-existing task plan found, skipping 3e-plan"
  3. If exists BUT header contains a different slug:
     → Overwrite with new generation (stale plan from different feature)
  4. If does not exist:
     → Generate as today via ORCH-012 (backward compat)
```

---

## 7. 3e-refine Guard (isdlc.md line 2253)

### Current Behavior
```
If phase_key === '04-design' AND refinement_completed is NOT true:
  → execute refinement
```

### Updated Behavior
```
If phase_key === '04-design' AND refinement_completed is NOT true:
  1. Read docs/isdlc/tasks.md
  2. Find Phase 06 section tasks
  3. Check if any Phase 06 task has 'files:' sub-lines
  4. If yes (already refined — from analyze-time generation):
     → Set refinement_completed = true, skip refinement
     → Log: "Phase 06 tasks already refined, skipping 3e-refine"
  5. If no (high-level tasks from 3e-plan):
     → Execute refinement as today
```

---

## 8. Contract Schema Extension (contract-schema.js)

### Current Presentation Schema
```json
"presentation": {
  "confirmation_sequence": ["string[]"],
  "persona_format": "string",
  "progress_format": "string",
  "completion_summary": "boolean"
}
```

### Updated Presentation Schema
```json
"presentation": {
  "confirmation_sequence": ["string[]"],
  "persona_format": "string",
  "progress_format": "string",
  "completion_summary": "boolean",
  "task_display": "counter | expanded | phase-only",
  "task_scope": "full-workflow | implementation-only"
}
```

Defaults (in contract generator):
- `task_display`: `"counter"`
- `task_scope`: `"full-workflow"`

Validation: both are optional string enum fields. Unknown values fall back to defaults.

---

## 12. Estimated Size

| Change | Location | Estimated Lines |
|---|---|---|
| Task Generation Protocol | roundtable-analyst.md | ~80 lines of spec |
| PRESENTING_TASKS state + summary (Claude) | roundtable-analyst.md | ~40 lines of spec |
| Batch write extension | roundtable-analyst.md | ~5 lines |
| Core state machine update | state-machine.js | ~15 lines of code |
| Core analyze orchestrator update | analyze.js | ~20 lines of code |
| Core finalization chain update | finalization-chain.js | ~10 lines of code |
| Build-init copy (Claude) | isdlc.md | ~15 lines of spec |
| Build-init copy (Core) | phase-loop.js | ~15 lines of code |
| 3e-plan guard | isdlc.md | ~10 lines of spec |
| 3e-refine guard | isdlc.md | ~10 lines of spec |
| Contract schema fields | contract-schema.js | ~10 lines of code |
| Contract generator defaults | generate-contracts.js | ~5 lines of code |
| **Total** | | **~235 lines (spec + code)** |

### Tests Needed

| Test File | Tests | Scope |
|---|---|---|
| `tests/core/analyze/state-machine.test.js` (extend) | ~8 | PRESENTING_TASKS transitions, tier paths, amend from tasks |
| `tests/core/orchestration/analyze.test.js` (extend) | ~5 | Confirmation sequence with 4 domains, light workflow skip |
| `tests/core/analyze/finalization-chain.test.js` (extend) | ~3 | tasks.md in artifact list, guard for light tier |
| Guard tests for 3e-plan/3e-refine | ~15 | Slug match, file existence, content check |
| **Total new tests** | **~31** | |
