# Requirements Specification: Workflow Recovery — Rollback to Earlier Phase

**REQ-0052** | Source: GH-99 | Hackability Roadmap — Tier 1 (Foundation), Layer 1 (Configure)
**Depends on**: REQ-0051 (Retry — shares governance changes, specifically FR-004 Recovery Action Flag)

---

## 1. Business Context

Sometimes the problem isn't in the current phase — the requirements or architecture were wrong. The developer needs to go back to a specific earlier phase and redo from there, without losing the entire workflow.

**Cost of inaction**: Developers must cancel and restart from Phase 01 even when only one upstream phase needs revision. This wastes all completed work and discourages course corrections.

**Success metric**: A developer can roll back to any earlier phase in the current workflow, see a clear summary of what changed, and resume work from that point.

**Stakeholders**:
- Primary: Developers using iSDLC workflows
- Secondary: Framework maintainers (governance integrity)

## 2. Stakeholders and Personas

### Developer (Primary User)
- **Role**: Uses iSDLC to build features or fix bugs
- **Goal**: Go back to an earlier phase when upstream decisions were wrong
- **Pain point**: Must cancel entire workflow to fix an upstream mistake
- **Proficiency**: Familiar with iSDLC workflows and phase progression

## 3. User Journeys

### Happy Path — Rollback to Requirements
1. Developer is in Phase 06 (Implementation), realizes the requirements missed a key constraint
2. Developer says "go back to requirements"
3. Framework detects rollback intent, asks for confirmation: "This will reset phases 02 through 06 back to pending. Phase 01 will resume as in-progress. Continue?"
4. Developer confirms
5. Framework runs `workflow-rollback.cjs --to-phase 01-requirements`
6. Framework displays summary: current phase, which phases were reset, artifacts preserved, next steps
7. Framework re-reads Phase 01 agent instructions
8. Agent sees existing requirements-spec.md on disk, revises it based on developer's feedback

### Happy Path — Rollback to Architecture
1. Developer is in Phase 06, realizes the architecture pattern choice was wrong
2. Developer says "the architecture was wrong"
3. Framework rolls back to Phase 03 (Architecture)
4. Phases 04-06 reset to pending, Phase 03 set to in-progress

### Edge Case — Rollback to Current Phase
1. Developer says "go back to implementation" while already in Phase 06
2. Framework detects this is effectively a retry, suggests: "You're already on Phase 06. Did you mean to retry it?"

### Edge Case — Rollback to Skipped Phase (Light Mode)
1. Workflow was initialized with `--light` (phases 03/04 skipped)
2. Developer says "go back to architecture"
3. Framework returns error: "Phase 03-architecture is not in this workflow's phase list"

### Edge Case — No Active Workflow
1. Developer says "go back to requirements" with no active workflow
2. Framework returns error: "No active workflow to roll back"

### Edge Case — Rollback to First Phase
1. Developer says "start over" while in Phase 06
2. Framework rolls back to Phase 00 (or 01), resetting all subsequent phases

## 4. Technical Context

### Existing Patterns
- `phase-advance.cjs` — forward-only phase advancement
- `state-logic.cjs` V8 — blocks phase index regression AND phase status regression
- `workflow-init.cjs` — builds initial `phase_status` map with all phases pending
- REQ-0051 FR-004 — introduces `recovery_action` flag to allow controlled regression

### Key Constraint
- Rollback DOES trigger V8 phase index regression (`current_phase_index` decreases)
- Rollback DOES trigger V8 status regression (`completed → pending` for multiple phases)
- Requires the `recovery_action` flag from REQ-0051 FR-004 to bypass V8
- Rollback target must be in `active_workflow.phases` array
- Artifacts preserved on disk — agents revise existing work

### Integration Points
- `state.json` — phase index, phase statuses, iteration state for multiple phases
- `ANTIGRAVITY.md.template` — intent detection table
- `CLAUDE.md` template — intent detection table
- `state-logic.cjs` V8 — must allow index regression when `recovery_action.type === "rollback"`

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Reliability | Critical | Rollback must never corrupt state.json or produce inconsistent cross-location state |
| Safety | Critical | Requires explicit user confirmation before execution |
| Usability | High | Recovery summary must list every phase that changed status |
| Simplicity | High | Single script, no new dependencies |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stale artifacts from later phases confuse agents | Medium | Medium | Agents overwrite artifacts naturally; agent instructions note existing artifacts may be stale |
| User accidentally rolls back too far | Low | Medium | Require explicit confirmation showing all phases that will be reset |
| V8 exception too broad — allows unintended regressions | Low | High | `recovery_action` is scoped to specific phase and cleared after recovery completes |
| Cross-location consistency after multi-phase reset | Medium | Medium | Script updates both `active_workflow.phase_status` and `phases[].status` atomically |

## 6. Functional Requirements

### FR-001: Rollback Script
**Confidence**: High

New script `src/antigravity/workflow-rollback.cjs` that resets the workflow to a target phase.

- **AC-001-01**: Given an active workflow and `--to-phase 01-requirements`, when `workflow-rollback.cjs` is executed, then `current_phase` is set to `01-requirements` and `current_phase_index` is set to that phase's index in the phases array
- **AC-001-02**: Given rollback to phase X, when executed, then phase X's status is set to `in_progress` and all subsequent phases are set to `pending`
- **AC-001-03**: Given rollback to phase X, when executed, then iteration state (`test_iteration`, `constitutional_validation`, `interactive_elicitation`) is cleared for phase X and all subsequent phases
- **AC-001-04**: Given rollback, when executed, then `state_version` is bumped
- **AC-001-05**: Given rollback, when executed, then all artifacts remain on disk (no file deletion)
- **AC-001-06**: Given no active workflow, when executed, then output `{ "result": "ERROR", "message": "No active workflow" }`

### FR-002: Rollback Target Validation
**Confidence**: High

The rollback target must be a valid, earlier phase in the current workflow.

- **AC-002-01**: Given `--to-phase 03-architecture` and a light-mode workflow (phases 03/04 not in array), when executed, then output `{ "result": "ERROR", "message": "Phase '03-architecture' is not in this workflow" }`
- **AC-002-02**: Given `--to-phase 06-implementation` and current phase is `06-implementation`, when executed, then output `{ "result": "ERROR", "message": "Cannot rollback to current phase. Use retry instead." }` with a hint suggesting retry
- **AC-002-03**: Given `--to-phase 08-code-review` and current phase is `06-implementation`, when executed, then output `{ "result": "ERROR", "message": "Cannot rollback forward" }`

### FR-003: User Confirmation
**Confidence**: High

Rollback is destructive to phase state and requires explicit confirmation.

- **AC-003-01**: Given a rollback request, when the framework processes it, then it displays: target phase, list of phases that will be reset, and asks "Continue? [y/N]"
- **AC-003-02**: Given the user declines confirmation, when the framework processes the response, then no state changes are made
- **AC-003-03**: Given the script is called with `--confirm` flag, when executed, then confirmation is skipped (for programmatic use)

### FR-004: Recovery Feedback
**Confidence**: High

After rollback, display a detailed summary of what changed.

- **AC-004-01**: Given a successful rollback, when the script completes, then output includes: `result`, `from_phase`, `to_phase`, `phases_reset` (list of phase names and their old → new status), `artifacts_preserved: true`, and `rollback_count`
- **AC-004-02**: Given a successful rollback, when the framework presents the result, then the message shows: target phase name, all phases that were reset, that artifacts are preserved, and suggested next action ("re-read phase agent and revise existing artifacts")

### FR-005: Intent Detection — Rollback
**Confidence**: High

Add rollback intent to the framework's intent detection table.

- **AC-005-01**: Given user input matching rollback signals ("go back to requirements", "the architecture was wrong", "return to design", "rollback to"), when intent detection runs, then the framework maps to the rollback action and extracts the target phase name
- **AC-005-02**: Given rollback intent detected, when the framework responds, then it presents the confirmation prompt from FR-003 before executing
- **AC-005-03**: Given ambiguous input ("start over"), when intent detection runs, then the framework asks: "Do you want to retry the current phase or go back to an earlier one?"

### FR-006: Rollback Count Tracking
**Confidence**: High

Track rollback count per workflow for visibility.

- **AC-006-01**: Given a workflow with no prior rollbacks, when rollback is executed, then `active_workflow.rollback_count` is set to 1
- **AC-006-02**: Given a workflow with `rollback_count: 1`, when rollback is executed again, then `rollback_count` becomes 2
- **AC-006-03**: Given any rollback_count value, when the gate is validated, then rollback_count does not block advancement

### FR-007: V8 Exception for Index Regression (Depends on REQ-0051 FR-004)
**Confidence**: High

The `recovery_action` flag from REQ-0051 must also allow phase index regression for rollback.

- **AC-007-01**: Given `recovery_action.type === "rollback"` in a state write, when V8 evaluates the write, then phase index regression is allowed
- **AC-007-02**: Given `recovery_action.type === "rollback"` in a state write, when V8 evaluates the write, then phase status regression from `completed` to `pending` is allowed for all phases after the target
- **AC-007-03**: Given no `recovery_action` in a state write, when V8 evaluates the write, then existing regression blocking behavior is unchanged

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Automatic file revert/cleanup | Artifacts preserved; agents overwrite naturally | Could be added as `--clean` flag later |
| Selective phase rollback (skip some phases) | Adds complexity; phases must re-run in sequence | None |
| Branch management on rollback | Git branch stays the same; no commit revert | None |
| Retry current phase | Separate feature — REQ-0051 | This spec depends on REQ-0051 |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Rollback Script | Must Have | Core capability |
| FR-002 | Target Validation | Must Have | Prevents invalid state — safety critical |
| FR-003 | User Confirmation | Must Have | Destructive operation requires explicit consent |
| FR-004 | Recovery Feedback | Must Have | User must know what happened and what to do next |
| FR-005 | Intent Detection | Must Have | Invisible UX pattern |
| FR-006 | Rollback Count Tracking | Should Have | Observability |
| FR-007 | V8 Exception | Must Have | Without this, rollback state writes are blocked |

## Pending Sections

*All sections complete.*
