# Bug Report: BUG-0002 — Fix Plan Tracking Display

**Type:** Bug Fix
**Severity:** Medium (UX degradation, no data loss)
**Status:** Confirmed
**Reported:** 2026-02-09
**Reporter:** Project maintainer (manual observation)
**External Link:** N/A (internal framework bug)

---

## Summary

The plan tracking display shown during SDLC workflow execution has three distinct UX issues that degrade the user's ability to understand workflow progress:

1. **Task numbering is non-sequential** — Tasks display with arbitrary IDs instead of sequential `[1], [2], [3]...` format
2. **Completed tasks are not visually distinguished** — When a phase completes, its task is marked as "completed" in the internal state but the display does not strike through or visually differentiate it from pending tasks
3. **Stale completed tasks persist on screen** — After implementation phases complete, previously completed task spinners/status remain visible alongside new pending ones, creating a confusing duplicate display

---

## Environment

- **Component:** Phase-Loop Controller in `src/claude/commands/isdlc.md`
- **Mechanism:** `TaskCreate` / `TaskUpdate` tool calls made by the orchestrator command during workflow execution
- **Runtime:** Claude Code's built-in Task management system
- **Affected workflows:** All workflow types (feature, fix, test-run, test-generate, start, upgrade)

---

## Reproduction Steps

1. Run `/isdlc feature "any feature description"`
2. Observe the task list displayed during Phase-Loop Controller STEP 2
3. Note task numbering uses internal IDs, not sequential `[1], [2], [3]` format
4. Wait for Phase 01 to complete and the loop to advance to Phase 02
5. Observe that Phase 01's task does not have strikethrough or visual completion marking on screen
6. Continue through several phases
7. Observe that completed phase tasks remain visible with their old status, creating visual clutter alongside active/pending tasks

---

## Expected Behavior

**EB-1: Sequential numbering** — Tasks should display as `[1] Capture requirements (Phase 01)`, `[2] Design architecture (Phase 02)`, etc., using ascending sequential numbers starting from 1.

**EB-2: Visual completion marking** — When a task completes (gate passes), it should be visually struck through or clearly marked as done in the on-screen task list, so the user can instantly distinguish completed from pending/active phases.

**EB-3: Clean display state** — The screen should not show stale completed tasks alongside fresh pending tasks. After a phase completes, the task list should either: (a) update in place with strikethrough, or (b) clear and re-render the current state cleanly.

---

## Actual Behavior

**AB-1:** Tasks display with Claude Code's internal auto-assigned task IDs (e.g., `#47`, `#48`) rather than sequential `[1], [2], [3]` numbers.

**AB-2:** Completed tasks show status "completed" internally but the on-screen rendering does not apply strikethrough or visual differentiation.

**AB-3:** As the workflow progresses through phases, completed task entries from earlier phases remain on screen in their last-rendered state, while new phase tasks are created below them. This creates a growing, cluttered display where the user cannot quickly identify which phase is currently active.

---

## Root Cause Analysis

The Phase-Loop Controller (isdlc.md, STEP 2 and STEP 3) uses `TaskCreate` and `TaskUpdate` to manage visible progress. The issues stem from:

1. **Numbering:** `TaskCreate` does not control the display ID — Claude Code assigns its own internal IDs. The documentation says "display sequential ascending numbers in format [1], [2], etc." but the implementation relies on Claude Code's built-in task list rendering which uses auto-incrementing IDs that may not start at 1.

2. **Strikethrough:** `TaskUpdate` with `status: "completed"` marks the task internally but the visual rendering depends on Claude Code's task display system. The orchestrator instructions don't include any mechanism for applying strikethrough formatting in the task subject line.

3. **Screen clearing:** The Phase-Loop Controller creates all tasks in STEP 2 and then updates them one at a time in STEP 3. It never clears or re-renders the full task list. Claude Code's task system may show stale entries because previous task states persist in the conversation display.

---

## Functional Requirements

### FR-01: Sequential Task Numbering in Display
The Phase-Loop Controller MUST prefix task subjects with sequential numbers in `[N]` format (e.g., `[1] Capture requirements (Phase 01)`). Numbers start at 1 and increment by 1 for each phase in the workflow.

### FR-02: Strikethrough for Completed Tasks
When a phase gate passes and the task is marked completed, the task subject MUST be updated to include strikethrough formatting using `~~text~~` markdown. Example: `~~[1] Capture requirements (Phase 01)~~`.

### FR-03: Clean Phase 01 Completion on Return from Init
When the init-and-phase-01 step returns and Phase 01's task is created as already completed, it MUST immediately use the strikethrough format: `~~[1] Capture requirements (Phase 01)~~`.

### FR-04: Active Phase Indicator
The currently active phase task (status: in_progress) SHOULD have a clear indicator that it is the active one. The TaskUpdate's `activeForm` already provides a spinner, but the subject can optionally include a marker.

### FR-05: Subject Update on Completion
When marking a task as `completed` via `TaskUpdate`, the orchestrator MUST also update the `subject` field to apply the strikethrough formatting, not just the `status` field.

---

## Non-Functional Requirements

### NFR-01: Backward Compatibility
The fix must not break any existing workflow or hook behavior. TaskCreate/TaskUpdate API usage must remain compatible with Claude Code's tool contract.

### NFR-02: All Workflow Types
The fix must apply consistently across all 6 workflow types (feature, fix, test-run, test-generate, full-lifecycle, upgrade).

### NFR-03: Minimal Changes
The fix should modify only the Phase-Loop Controller section in `src/claude/commands/isdlc.md` and the PROGRESS TRACKING section in the orchestrator agent. No hook or agent changes should be needed.

### NFR-04: Constitution Compliance
The fix must comply with Article V (Simplicity First) — no new abstractions or dependencies. Article VIII (Documentation Currency) — update CLAUDE.md checklist item.

---

## Acceptance Criteria

### AC-01: Sequential Numbering
**Given** a fix workflow with 8 phases is initialized
**When** STEP 2 creates the task list
**Then** task subjects are `[1] Capture bug report (Phase 01)`, `[2] Trace bug root cause (Phase 02)`, ..., `[8] Perform code review and QA (Phase 07)`

### AC-02: Phase 01 Strikethrough on Init Return
**Given** Phase 01 completes successfully during init-and-phase-01
**When** STEP 2 creates the task list
**Then** Phase 01's task subject is `~~[1] Capture bug report (Phase 01)~~` with status `completed`

### AC-03: Strikethrough on Phase Completion
**Given** a phase is currently in_progress
**When** the phase gate passes
**Then** TaskUpdate sets both `status: "completed"` and updates `subject` to `~~[N] {original subject}~~`

### AC-04: Active Phase Spinner
**Given** a phase task is marked in_progress
**When** the user views the task list
**Then** the task shows the `activeForm` spinner text (existing behavior, must not regress)

### AC-05: Feature Workflow Numbering
**Given** a feature workflow with 11 phases (00 through 08)
**When** STEP 2 creates the task list
**Then** subjects use numbers [1] through [11] sequentially, Phase 00 quick-scan is [1], Phase 01 is [2], etc.

### AC-06: Upgrade Workflow Numbering
**Given** an upgrade workflow with 3 phases
**When** STEP 2 creates the task list
**Then** subjects use numbers [1] through [3] sequentially

### AC-07: No Stale Display
**Given** Phase N completes and Phase N+1 begins
**When** the user views the terminal
**Then** Phase N's task shows strikethrough (completed) and Phase N+1's task shows the spinner (in_progress), with no duplicate or stale entries
