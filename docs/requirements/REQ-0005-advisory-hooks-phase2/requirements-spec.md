# Requirements Specification: REQ-0005 Advisory Hooks Phase 2

**Version:** 1.0
**Date:** 2026-02-09
**Status:** Approved
**Workflow:** Feature (REQ-0005-advisory-hooks-phase2)
**Predecessor:** REQ-0004-advisory-behavior-hooks (Phase 1, completed 2026-02-09)

---

## 1. Overview

Phase 2 of the advisory behavior hooks initiative. Phase 1 (REQ-0004) added 7 deterministic enforcement hooks for the most critical advisory behaviors. This feature adds the remaining 7 enforcement hooks plus a centralized hook logging infrastructure, completing the conversion of all 14 advisory-only behaviors to hook-enforced guarantees.

## 2. Problem Statement

### 2.1 Remaining Advisory-Only Behaviors

After Phase 1, 7 advisory behaviors still lack hook enforcement:

1. **Automatic Phase Transitions** -- Agents ask "Would you like to proceed?" instead of auto-advancing when gates pass. This adds friction and defeats the purpose of automated gating.

2. **Constitutional Iteration Validation** -- Agents can claim constitutional compliance without actually performing iteration. The gate-blocker checks some fields but does not validate iteration completeness before gate passage.

3. **Menu Halt Enforcement** -- Agents present interactive menus (A/R/C, backlog picker) but continue generating output instead of stopping and waiting for user input. This defeats the purpose of interactive elicitation.

4. **Chat/Explore Read-Only Mode** -- The /discover Chat/Explore mode should be read-only (no state mutations, no file modifications), but nothing prevents the agent from writing files or modifying state.json.

5. **ATDD Completeness** -- When ATDD mode is active, test priority ordering (P0 through P3) is not enforced. Tests can be implemented out of order or skipped without detection.

6. **Output Format Validation** -- Artifacts like user-stories.json, ADR documents, test reports, and traceability matrices have expected structures, but nothing validates their format at write time.

7. **Test Adequacy Blocking** -- The upgrade workflow (Phase 14) requires adequate test coverage before proceeding, but nothing hard-blocks the upgrade when tests are missing or coverage is inadequate.

### 2.2 Missing Centralized Logging

Phase 1 hooks each use ad-hoc `debugLog()` calls for debugging. There is no unified logging infrastructure for:
- Tracking which hooks block vs allow vs warn across a session
- Aggregating hook activity for diagnostic reports
- Correlating hook events with workflow phases
- Providing a hook activity summary at workflow completion

### 2.3 Impact

Without these hooks, the framework's enforcement layer is incomplete. The 7 remaining behaviors can still be bypassed by LLMs, and there is no visibility into hook-level activity across the system.

## 3. Functional Requirements

### FR-01: Automatic Phase Transition Enforcer

**Hook name:** `phase-transition-enforcer.cjs`
**Hook type:** PostToolUse[Task]
**Purpose:** Detect "Would you like to proceed?" patterns in agent output and warn that automatic transitions should be used instead.

**Behavior:**
- On PostToolUse[Task], read the task result/output from stdin
- Scan the output for permission-asking patterns:
  - "Would you like to proceed"
  - "Ready to advance"
  - "Should I continue"
  - "Shall we proceed"
  - "Do you want me to move forward"
  - "Want me to go ahead"
  - Case-insensitive matching
- If a pattern is detected AND an active workflow exists in state.json:
  - Log warning to stderr: "TRANSITION WARNING: Agent asked for permission to proceed. Phase transitions should be automatic when gates pass. Pattern detected: '{matched_text}'"
- If no active workflow: silent (these patterns are fine outside workflows)
- Fail-open: always (PostToolUse is observational)

**Acceptance Criteria:**
- AC-01a: Hook detects "Would you like to proceed" pattern in task output
- AC-01b: Hook detects "Ready to advance" pattern in task output
- AC-01c: Hook detects "Should I continue" pattern in task output
- AC-01d: Hook detects "Shall we proceed" pattern in task output
- AC-01e: Hook is silent when no active workflow exists
- AC-01f: Hook is silent when no permission-asking patterns found
- AC-01g: Hook fails open on all errors (no output, exit 0)
- AC-01h: Hook handles empty or missing task output gracefully

### FR-02: Constitutional Iteration Validator

**Hook name:** `constitutional-iteration-validator.cjs`
**Hook type:** PreToolUse[Skill]
**Purpose:** Before gate advancement (when /isdlc gate-check or /isdlc advance is invoked), verify that constitutional_validation was actually performed for the current phase.

**Behavior:**
- On PreToolUse[Skill], check if the skill being invoked is `/isdlc` (the SDLC orchestrator command)
- Read the skill input/arguments for "gate-check", "advance", or phase transition indicators
- If this is a gate-related invocation:
  - Read state.json for the current phase
  - Check `phases[current_phase].constitutional_validation`:
    - `completed` must be `true`
    - `iterations_used` must be >= 1
    - `status` must be `"compliant"` or `"escalated"`
    - `articles_checked` must be a non-empty array
  - If any check fails: output `{"decision": "block", "reason": "Constitutional validation incomplete for phase {current_phase}. Field {field_name} is {actual_value}, expected {expected_value}. Complete constitutional validation before gate advancement."}`
- If not a gate-related invocation: allow (no output)
- Fail-open: if state.json is unreadable, no active_workflow, or field paths don't exist

**Acceptance Criteria:**
- AC-02a: Hook blocks gate advancement when constitutional_validation.completed is false
- AC-02b: Hook blocks when iterations_used is 0 (or missing)
- AC-02c: Hook blocks when articles_checked is empty
- AC-02d: Hook allows gate advancement when all validation fields are correct
- AC-02e: Hook allows non-gate skill invocations
- AC-02f: Hook fails open when state.json is unreadable
- AC-02g: Hook fails open when no active workflow exists
- AC-02h: Hook fails open when constitutional_validation section is missing entirely

### FR-03: Menu Halt Enforcer

**Hook name:** `menu-halt-enforcer.cjs`
**Hook type:** PostToolUse[Task]
**Purpose:** Detect when an agent presents an interactive menu but continues generating output instead of stopping. The agent should present the menu and then STOP to wait for user input.

**Behavior:**
- On PostToolUse[Task], read the task result/output
- Detect interactive menu patterns in the output:
  - A/R/C menu: text containing "[A]" AND "[R]" AND "[C]" (Adjust/Refine/Continue pattern)
  - Numbered menu: text containing "[1]" AND "[2]" AND at least one "Enter selection" prompt
  - Backlog picker: text containing "[O] Other" AND numbered items
- If a menu pattern is detected:
  - Check if the output continues significantly (>200 characters) after the menu/prompt
  - If output continues after the menu: log warning to stderr: "MENU HALT VIOLATION: Agent continued generating output after presenting an interactive menu. The agent should STOP and wait for user input after displaying menu options."
- If no menu pattern detected: silent
- Fail-open: always

**Acceptance Criteria:**
- AC-03a: Hook detects A/R/C menu pattern followed by additional output
- AC-03b: Hook detects numbered menu with "Enter selection" followed by additional output
- AC-03c: Hook is silent when menu is the last content in output (agent stopped correctly)
- AC-03d: Hook is silent when no menu patterns are detected
- AC-03e: Hook fails open on all errors
- AC-03f: Hook handles output with multiple menus (only checks last one)

### FR-04: Chat/Explore Read-Only Enforcer

**Hook name:** `explore-readonly-enforcer.cjs`
**Hook type:** PreToolUse[Write], PreToolUse[Edit]
**Purpose:** Block file writes and edits when Chat/Explore mode is active. Chat/Explore is a read-only exploration mode that should not modify project files.

**Behavior:**
- On PreToolUse[Write] or PreToolUse[Edit], read stdin JSON
- Check state.json for `discovery_context.mode === "explore"` OR check if the current agent context indicates Chat/Explore mode (look for `explore` in pending_delegation or recent skill usage)
- Alternative detection: Check state.json for a `chat_explore_active` boolean field (to be written by the discover-orchestrator when entering Chat/Explore mode)
- If Chat/Explore mode IS active:
  - Check the target file path from tool_input:
    - If the file is inside the project (not in /tmp or similar): block with `{"decision": "block", "reason": "Chat/Explore mode is read-only. File writes are not permitted during exploration. Exit Chat/Explore mode first to make changes."}`
    - If the file is in /tmp or other temp directory: allow (scratch work is OK)
  - Special case: allow writes to state.json (state tracking is necessary)
- If Chat/Explore mode is NOT active: allow
- Fail-open: if state.json is unreadable or mode detection fails

**Acceptance Criteria:**
- AC-04a: Hook blocks Write to project files when Chat/Explore mode active
- AC-04b: Hook blocks Edit to project files when Chat/Explore mode active
- AC-04c: Hook allows Write to /tmp files during Chat/Explore mode
- AC-04d: Hook allows Write to state.json during Chat/Explore mode
- AC-04e: Hook allows all writes when Chat/Explore mode is NOT active
- AC-04f: Hook fails open when state.json is unreadable
- AC-04g: Hook detects Chat/Explore mode from state.json chat_explore_active field

### FR-05: ATDD Completeness Validator

**Hook name:** `atdd-completeness-validator.cjs`
**Hook type:** PostToolUse[Bash]
**Purpose:** When ATDD mode is active, monitor test execution output for priority ordering violations and orphaned skipped tests.

**Behavior:**
- On PostToolUse[Bash], check if the bash command was a test execution (contains `node --test`, `npm test`, or similar test runner patterns)
- Check state.json for `active_workflow.options.atdd_mode === true`
- If ATDD mode is NOT active: silent
- If ATDD mode IS active AND this was a test command:
  - Scan the test output for priority markers (P0, P1, P2, P3)
  - Check for violations:
    - **Out-of-order execution**: P1 tests running before all P0 tests pass
    - **Orphan skips**: test.skip() tests at priority P0 or P1 that have not been implemented
  - If violations found: log warning to stderr with details
- Fail-open: always (PostToolUse is observational)

**Acceptance Criteria:**
- AC-05a: Hook detects P1 tests running before all P0 tests pass
- AC-05b: Hook detects orphaned test.skip() at P0 priority level
- AC-05c: Hook is silent when ATDD mode is not active
- AC-05d: Hook is silent when the bash command is not a test execution
- AC-05e: Hook is silent when priority ordering is correct
- AC-05f: Hook fails open on all errors

### FR-06: Output Format Validator

**Hook name:** `output-format-validator.cjs`
**Hook type:** PostToolUse[Write]
**Purpose:** Validate that known artifact files conform to expected schemas when written. Validates structure, not content.

**Behavior:**
- On PostToolUse[Write], check the file path of the written file
- Match against known artifact patterns:
  - `**/user-stories.json` -- must be valid JSON, must have `stories` array with `id`, `title`, `acceptance_criteria` fields
  - `**/traceability-matrix.csv` -- must have header row with required columns (ID, Requirement, Test, Status)
  - `**/adr-*.md` -- must have Status, Context, Decision, Consequences sections
  - `**/test-strategy.md` -- must have Scope, Approach, Entry/Exit Criteria sections
- If the file matches a known pattern:
  - Read the written file and validate its structure
  - If validation fails: log warning to stderr with specific missing fields/sections
- If the file does not match any known pattern: silent
- Fail-open: always (PostToolUse is observational)

**Acceptance Criteria:**
- AC-06a: Hook validates user-stories.json has required fields (stories array, id, title, acceptance_criteria)
- AC-06b: Hook validates traceability-matrix.csv has required header columns
- AC-06c: Hook validates ADR files have required sections
- AC-06d: Hook validates test-strategy.md has required sections
- AC-06e: Hook is silent for unrecognized file types
- AC-06f: Hook fails open on read/parse errors
- AC-06g: Hook outputs specific missing field names in warning

### FR-07: Test Adequacy Blocker

**Hook name:** `test-adequacy-blocker.cjs`
**Hook type:** PreToolUse[Task]
**Purpose:** Hard-block Phase 14 (upgrade) delegation when test coverage is inadequate. The upgrade workflow requires a passing regression baseline before proceeding.

**Behavior:**
- On PreToolUse[Task], detect if this is a delegation to the upgrade-engineer agent (phase 14)
- If it IS an upgrade-engineer delegation:
  - Read state.json for test coverage data:
    - Check `discovery_context.coverage_summary.total_tests` -- must be > 0
    - Check `discovery_context.coverage_summary.unit_test_pct` -- must be >= constitution threshold (or >= 50% if no threshold configured)
    - Check if any test results exist in `phases` (any phase with `test_results.total > 0`)
  - If test coverage is inadequate:
    - Output `{"decision": "block", "reason": "TEST ADEQUACY REQUIRED: Upgrade workflow requires adequate test coverage before proceeding. Current: {total_tests} tests, {unit_test_pct}% unit coverage. Run /isdlc test generate first to establish a regression baseline."}`
  - If coverage is adequate: allow
- If NOT an upgrade delegation: allow
- Fail-open: if state.json is unreadable or coverage data is missing (but warn in debug log)

**Acceptance Criteria:**
- AC-07a: Hook blocks upgrade delegation when total_tests is 0
- AC-07b: Hook blocks upgrade delegation when unit_test_pct is below threshold
- AC-07c: Hook allows upgrade delegation when coverage is adequate
- AC-07d: Hook allows non-upgrade Task delegations
- AC-07e: Hook fails open when state.json is unreadable
- AC-07f: Hook fails open when coverage data is missing (with debug warning)

### FR-08: Centralized Hook Logging Infrastructure

**Module name:** Hook logging additions to `common.cjs`
**Purpose:** Provide centralized, structured logging for all hooks to enable diagnostics and visibility.

**Behavior:**
- Add a `logHookEvent(hookName, eventType, details)` function to common.cjs
- Event types: `block`, `allow`, `warn`, `error`, `skip`
- Details object includes: `{ phase, agent, reason, timestamp }`
- Log entries are appended to `.isdlc/hook-activity.log` (one JSON line per event, JSONL format)
- Log file is gitignored (add to .gitignore if not already there)
- Log rotation: if file exceeds 1MB, truncate to last 500 entries
- All 7 new hooks AND the 7 existing Phase 1 hooks should use this function
- Existing hooks get updated to add `logHookEvent()` calls alongside existing `debugLog()` calls

**Acceptance Criteria:**
- AC-08a: `logHookEvent()` function exists in common.cjs and is exported
- AC-08b: Log entries are written in JSONL format to `.isdlc/hook-activity.log`
- AC-08c: Each log entry includes hookName, eventType, details (phase, timestamp, reason)
- AC-08d: Log file is rotated when it exceeds 1MB (truncate to 500 newest entries)
- AC-08e: Log file path is added to .gitignore
- AC-08f: Logging fails silently (never crashes the hook)
- AC-08g: All 7 new hooks use logHookEvent() for their block/warn/skip events
- AC-08h: All 7 existing Phase 1 hooks are updated to use logHookEvent()

## 4. Non-Functional Requirements

### NFR-01: Fail-Open Behavior (Article X)

ALL hooks MUST fail open. Same requirements as Phase 1 (REQ-0004 NFR-01). If a hook encounters any error, it MUST:
- Produce no stdout output (which means "allow" to Claude Code)
- Optionally log to stderr for debugging
- Never crash with a non-zero exit code

### NFR-02: Performance

- PreToolUse hooks: must complete within 10 seconds (existing timeout)
- PostToolUse hooks: must complete within 5 seconds (existing timeout)
- `logHookEvent()` must complete within 50ms (async-safe file append)
- No network calls
- Log file I/O should not block hook decision-making

### NFR-03: Compatibility

- All hooks must be CJS (.cjs extension) per Article XII
- Must work with Node.js 18, 20, 22, 24 (CI matrix)
- Must work on macOS, Linux, and Windows
- Must use only Node.js built-in modules (no npm dependencies) per Article V
- Must follow the existing hook stdin/stdout JSON protocol per Article XIII

### NFR-04: Testability

- Each hook must have a co-located test file (`*.test.cjs` in `src/claude/hooks/tests/`)
- Tests must use `node:test` per Article II
- Minimum: 10 test cases per hook (covering all AC + error paths)
- Logging infrastructure must have dedicated tests

### NFR-05: No Regressions

- Existing 164 CJS hook tests must continue passing
- Existing 18 hooks must not be broken by new hook registration
- settings.json hook ordering must be preserved for existing hooks

### NFR-06: Logging Non-Interference

- Hook logging must never affect hook decision-making (block/allow)
- If logging fails (disk full, permission error), the hook must still function correctly
- Log writes must not slow down hook execution beyond NFR-02 budgets

## 5. Constraints

- Maximum 7 new hook files + logging changes to common.cjs
- Each hook must be a single .cjs file
- Shared utilities go in existing `src/claude/hooks/lib/common.cjs`
- Hook registration in `src/claude/settings.json`
- Log file in `.isdlc/hook-activity.log` (JSONL format, gitignored)

## 6. Dependencies

- Existing `common.cjs` library (readState, readStdin, outputBlockResponse, debugLog, detectPhaseDelegation)
- Existing `iteration-requirements.json` (for constitution thresholds)
- Existing `skills-manifest.json` (for agent name lookups)
- Phase 1 hooks (7 existing hooks to be updated with logging calls)
- `.isdlc/state.json` (workflow state, discovery context, phase data)

## 7. Hook Registration Plan

### New PreToolUse Hooks

| Matcher | Hook | Position |
|---------|------|----------|
| PreToolUse[Skill] | `constitutional-iteration-validator.cjs` | After `gate-blocker.cjs` |
| PreToolUse[Task] | `test-adequacy-blocker.cjs` | After `constitution-validator.cjs` |
| PreToolUse[Write] | `explore-readonly-enforcer.cjs` | New matcher section |
| PreToolUse[Edit] | `explore-readonly-enforcer.cjs` | New matcher section |

### New PostToolUse Hooks

| Matcher | Hook | Position |
|---------|------|----------|
| PostToolUse[Task] | `phase-transition-enforcer.cjs` | After `discover-menu-guard.cjs` |
| PostToolUse[Task] | `menu-halt-enforcer.cjs` | After `phase-transition-enforcer.cjs` |
| PostToolUse[Bash] | `atdd-completeness-validator.cjs` | After `review-reminder.cjs` |
| PostToolUse[Write] | `output-format-validator.cjs` | After `state-write-validator.cjs` |

### Updated Settings.json Structure

```
PreToolUse:
  Task: [existing 7] + test-adequacy-blocker
  Skill: [existing 2] + constitutional-iteration-validator
  Bash: [existing 1]
  Write: NEW [explore-readonly-enforcer]
  Edit: NEW [explore-readonly-enforcer]

PostToolUse:
  Task: [existing 4] + phase-transition-enforcer + menu-halt-enforcer
  Skill: [existing 1]
  Bash: [existing 2] + atdd-completeness-validator
  Write: [existing 1] + output-format-validator
  Edit: [existing 1]
```

## 8. Traceability to REQ-0004 Phase 2 Backlog

| REQ-0004 Phase 2 Item | This Feature |
|------------------------|--------------|
| "Remaining ~7 advisory behaviors not covered by this feature" | FR-01 through FR-07 |
| "Centralized logging infrastructure for hook warnings/blocks" | FR-08 |
| "Hook metrics dashboard" | Out of scope (future) |
| "Hook dry-run mode" | Out of scope (future) |
| "Hook configuration in settings.local.json" | Out of scope (future) |
