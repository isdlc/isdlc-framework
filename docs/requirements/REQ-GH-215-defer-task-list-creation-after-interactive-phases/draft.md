# Defer task list creation until after interactive phases complete

**Source**: GitHub Issue #215
**State**: OPEN

## Problem

During fix/feature workflows, the Phase-Loop Controller creates all phase tasks (STEP 2) before the interactive relay (3d-relay) starts for Phase 01. Claude Code renders the task status bar at the bottom of every turn. During interactive phases (Phase 01 requirements capture), this pushes the agent's question above the fold — the user sees their conversation sandwiched between previous output and the task list at the bottom.

**Screenshot evidence**: The bug-gather presents a menu/question in the middle of the screen while the `[1]-[6]` task list occupies the bottom, creating a disjointed experience.

## Root Cause

The Phase-Loop Controller STEP 2 (TaskCreate × N phases) fires before STEP 3 (phase loop). During interactive relay (3d-relay), every relay cycle (agent returns → orchestrator outputs → user responds → resume) causes Claude Code to re-render the task status bar below the conversation. The task list is visual noise during conversational phases.

## Expected Behavior

Task list creation is deferred until after all interactive phases complete. The user sees a clean conversational flow during Phase 01, then the task list appears when non-interactive phases (02+) begin.

## Proposed Fix

Option 1 (recommended): Defer TaskCreate calls until the first non-interactive phase starts. In the Phase-Loop Controller, check `interactive_elicitation.enabled` for the current phase — if true, skip STEP 2. After the interactive phase completes and the next phase is non-interactive, execute STEP 2 at that point.

## Affected Workflows

- `/isdlc fix` — Phase 01 is interactive (bug-gather relay)
- `/isdlc feature` / `/isdlc build` — Phase 01 is interactive (requirements capture)

## Complexity

Low — conditional timing of TaskCreate calls in the Phase-Loop Controller.
