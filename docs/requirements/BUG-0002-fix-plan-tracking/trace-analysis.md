# Trace Analysis: Fix Plan Tracking Display (BUG-0002)

**Generated**: 2026-02-09T14:30:00Z
**Bug**: Plan tracking display has 3 issues: non-sequential numbering, no strikethrough on completion, stale display
**External ID**: N/A (internal framework bug)
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

The plan tracking display bugs all originate from the Phase-Loop Controller in `src/claude/commands/isdlc.md` (STEP 2 and STEP 3). The root cause is that the task creation instructions use plain subject strings without `[N]` prefixes, the task completion instructions only update `status` without modifying the `subject` to add `~~strikethrough~~` formatting, and there is no screen-clearing or task-list re-rendering mechanism at any point in the flow. These are pure instruction-level bugs in the command markdown file -- the Claude Code TaskCreate/TaskUpdate API fully supports all three fixes, the instructions simply do not use the available capabilities.

**Root Cause Confidence**: High
**Severity**: Medium (UX degradation, no data loss)
**Estimated Complexity**: Low (text changes to one markdown file, plus corresponding table in orchestrator)

---

## Symptom Analysis

### S1: Non-Sequential Task Numbering

**Symptom**: Tasks display with Claude Code's auto-assigned internal IDs (e.g., `#47`, `#48`) instead of sequential `[1], [2], [3]` numbers.

**Source location**: `src/claude/commands/isdlc.md`, lines 726-755 (STEP 2: FOREGROUND TASKS)

**Current task subject format** (from the table at line 730):
```
| Phase Key | subject | activeForm |
| `01-requirements` | Capture requirements (Phase 01) | Capturing requirements |
| `02-tracing` | Trace bug root cause (Phase 02) | Tracing bug root cause |
| `05-implementation` | Implement features (Phase 05) | Implementing features |
...
```

**Problem**: The `subject` column contains no `[N]` prefix. When Claude Code renders the task list, it uses its own internal auto-incrementing ID (which may not start at 1 and is not guaranteed to be sequential relative to the workflow). The user sees `#47 Capture requirements` instead of `[1] Capture requirements`.

**Evidence**: The requirements-spec.md at line 67 confirms: "TaskCreate does not control the display ID -- Claude Code assigns its own internal IDs."

### S2: No Strikethrough on Completed Tasks

**Symptom**: Completed tasks show "completed" status internally but have no visual strikethrough formatting.

**Source location**: `src/claude/commands/isdlc.md`, lines 757-795 (STEP 3: PHASE LOOP)

**Current completion handling** (line 793):
```
"passed" -> Mark task as `completed`, continue to next phase
```

**Problem**: The STEP 3 instructions only say to mark the task as `completed` via `TaskUpdate`. They do NOT instruct updating the `subject` field to wrap it in `~~strikethrough~~` markdown. The `TaskUpdate` tool supports updating `subject` alongside `status`, but the instructions never use that capability.

**Additional source**: Line 753 says:
```
Mark Phase 01's task as `completed` immediately (it already passed in Step 1).
```

Again, no instruction to update the subject with strikethrough formatting.

### S3: Stale Completed Tasks on Screen

**Symptom**: Previously completed tasks remain visible alongside new pending tasks, creating visual clutter.

**Source location**: `src/claude/commands/isdlc.md`, STEP 2 through STEP 4

**Problem**: The Phase-Loop Controller creates all tasks in STEP 2 and then updates them one-at-a-time in STEP 3. There is no instruction to clear or re-render the task list at any point. Claude Code's task system displays all tasks (completed, in_progress, and pending) together. This is actually expected behavior of the task system -- the visual clutter is a consequence of NOT using strikethrough (S2). If completed tasks had strikethrough formatting, the user could visually distinguish them from active/pending tasks. The "stale display" symptom is therefore a secondary effect of the missing strikethrough, not a separate root cause.

**STEP 4 analysis** (lines 797-807): STEP 4 only delegates to the orchestrator with `MODE: finalize` for branch merge. No task cleanup or display refresh occurs.

---

## Execution Path

### Entry Point

User invokes `/isdlc fix "description"` (or any workflow command with a description argument).

### Call Chain

```
1. isdlc.md detects WORKFLOW command with description
2. STEP 1: INIT - delegates to sdlc-orchestrator with MODE: init-and-phase-01
   - Orchestrator initializes workflow, runs Phase 01, validates GATE-01
   - Returns: { phases: [...], artifact_folder, next_phase_index: 1 }
   - Orchestrator does NOT create tasks (MODE suppresses task creation)

3. STEP 2: FOREGROUND TASKS - isdlc.md creates TaskCreate per phase
   - Iterates over phases[] array from init result
   - For each phase: TaskCreate with subject from lookup table
   - BUG: subject has no [N] prefix  <--- ROOT CAUSE #1
   - Phase 01's task marked completed immediately
   - BUG: no ~~strikethrough~~ on Phase 01 subject  <--- ROOT CAUSE #2

4. STEP 3: PHASE LOOP - for each remaining phase:
   - 3a: TaskUpdate { status: "in_progress" } for current phase
   - 3d: Delegate to orchestrator with MODE: single-phase
   - 3e: On "passed" result: TaskUpdate { status: "completed" }
   - BUG: no subject update with ~~strikethrough~~  <--- ROOT CAUSE #2 (repeated)
   - No screen clear or task re-render  <--- ROOT CAUSE #3 (secondary)

5. STEP 4: FINALIZE - delegates to orchestrator with MODE: finalize
   - No task cleanup occurs
```

### Data Flow

```
phases[] array (from init-and-phase-01)
  |
  v
STEP 2: for i in 0..phases.length:
  TaskCreate({
    subject: lookup_table[phases[i]],   // <-- missing [i+1] prefix
    activeForm: lookup_table[phases[i]],
    description: "Phase {NN} of {type} workflow"
  })
  if i == 0: TaskUpdate({ status: "completed" })  // <-- missing subject update
  |
  v
STEP 3: for i in next_phase_index..phases.length:
  TaskUpdate({ status: "in_progress" })
  ... delegate to orchestrator ...
  TaskUpdate({ status: "completed" })  // <-- missing subject update
```

### Failure Points

| Point | Location | Current Behavior | Expected Behavior |
|-------|----------|-----------------|-------------------|
| FP-1 | STEP 2, TaskCreate | `subject: "Capture requirements (Phase 01)"` | `subject: "[1] Capture requirements (Phase 01)"` |
| FP-2 | STEP 2, Phase 01 completion | `TaskUpdate({ status: "completed" })` | `TaskUpdate({ status: "completed", subject: "~~[1] Capture requirements (Phase 01)~~" })` |
| FP-3 | STEP 3, step 3e | `TaskUpdate({ status: "completed" })` | `TaskUpdate({ status: "completed", subject: "~~[N] {original subject}~~" })` |

---

## Root Cause Analysis

### Hypothesis 1: Missing `[N]` prefix in subject strings (HIGH confidence)

**Root Cause**: The task definition tables in both `isdlc.md` (line 730) and `00-sdlc-orchestrator.md` (line 2127) define subjects without any sequential numbering prefix. The subjects are static strings like `"Capture requirements (Phase 01)"` rather than dynamically constructed strings like `"[1] Capture requirements (Phase 01)"`.

**Evidence**:
- Task table at `isdlc.md:730` has no `[N]` column or prefix
- Identical table at `00-sdlc-orchestrator.md:2127` also has no prefix
- The `phases[]` array provides iteration order but the instructions never say to use the loop index

**Fix**: In STEP 2, when iterating over `phases[]`, prefix each subject with `[{loop_index + 1}]`. Update both tables to document the expected format.

### Hypothesis 2: Missing subject update on TaskUpdate completion (HIGH confidence)

**Root Cause**: The Phase-Loop Controller's STEP 3 (line 793) and STEP 2 Phase 01 completion (line 753) only instruct setting `status: "completed"`. They do not instruct also setting `subject: "~~[N] {original}~~"`. The Claude Code `TaskUpdate` API accepts a `subject` parameter alongside `status`, so the capability exists but is unused.

**Evidence**:
- STEP 3 step 3e (line 793): `"passed" -> Mark task as completed, continue to next phase` -- no mention of subject update
- STEP 2 (line 753): `Mark Phase 01's task as completed immediately` -- no mention of subject update
- The requirements-spec.md AC-03 explicitly requires: `TaskUpdate sets both status: "completed" and updates subject to ~~[N] {original subject}~~`

**Fix**: In STEP 3 step 3e, change the instruction to: "Mark task as `completed` using `TaskUpdate` and update `subject` to wrap in `~~strikethrough~~` markdown." Add the same instruction for Phase 01 completion in STEP 2.

### Hypothesis 3: No screen-clear mechanism (LOW confidence -- secondary symptom)

**Root Cause**: There is no instruction in the Phase-Loop Controller to clear the screen or re-render the task list after a phase completes. However, this is a secondary symptom. Claude Code's task system already shows all tasks in a single list. If completed tasks had `~~strikethrough~~` formatting, the display would be clear and not confusing. The "stale display" complaint is actually about lack of visual differentiation, not about literal duplicate entries.

**Evidence**:
- Claude Code's TaskCreate/TaskUpdate system does not have a "clear" or "refresh" API
- The requirements-spec.md AC-07 says: "Phase N's task shows strikethrough (completed) and Phase N+1's task shows the spinner (in_progress), with no duplicate or stale entries"
- This AC is satisfied by fixing Hypotheses 1 and 2 -- the visual differentiation via strikethrough eliminates the "stale" perception

**Fix**: No separate fix needed. Implementing strikethrough (Hypothesis 2) resolves this symptom.

### Suggested Fix Summary

**Files to modify**:
1. `src/claude/commands/isdlc.md` -- STEP 2 and STEP 3 sections
2. `src/claude/agents/00-sdlc-orchestrator.md` -- PROGRESS TRACKING section (for consistency, though it is only used in full-workflow mode)

**Changes required**:

1. **STEP 2 (isdlc.md, ~line 728)**: Add instruction before the TaskCreate loop: "For each phase at index `i` (0-based), prefix the subject with `[{i+1}]`." Example: `[1] Capture requirements (Phase 01)`.

2. **STEP 2 (isdlc.md, ~line 753)**: Change Phase 01 completion from just `status: "completed"` to also update `subject` with strikethrough: `~~[1] Capture requirements (Phase 01)~~`.

3. **STEP 3 step 3e (isdlc.md, ~line 793)**: Change completion handling to also update `subject` with strikethrough wrapping.

4. **Orchestrator PROGRESS TRACKING (00-sdlc-orchestrator.md, ~line 2127)**: Update the task definition table and examples to include `[N]` prefixes and document the strikethrough convention in the Task Lifecycle section.

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-02-09T14:30:00Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "primary_file": "src/claude/commands/isdlc.md",
  "secondary_file": "src/claude/agents/00-sdlc-orchestrator.md",
  "error_keywords": ["TaskCreate", "TaskUpdate", "subject", "strikethrough", "sequential", "numbering", "Phase-Loop Controller"],
  "lines_of_interest": {
    "isdlc.md": [726, 728, 730, 753, 757, 761, 793, 797],
    "00-sdlc-orchestrator.md": [2113, 2127, 2150, 2152, 2154, 2162, 2177]
  },
  "hypotheses": [
    { "id": "H1", "description": "Missing [N] prefix in subject strings", "confidence": "high", "fix_complexity": "low" },
    { "id": "H2", "description": "Missing subject update on TaskUpdate completion", "confidence": "high", "fix_complexity": "low" },
    { "id": "H3", "description": "No screen-clear mechanism", "confidence": "low", "fix_complexity": "none (secondary symptom)", "note": "Resolved by H2" }
  ]
}
```
