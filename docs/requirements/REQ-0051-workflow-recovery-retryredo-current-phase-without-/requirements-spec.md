# Requirements Specification: Workflow Recovery — Retry/Redo Current Phase

**REQ-0051** | Source: GH-98 | Hackability Roadmap — Tier 1 (Foundation), Layer 1 (Configure)
**Related**: REQ-0052 (Rollback to earlier phase) — shares governance changes

---

## 1. Business Context

When a phase produces wrong output (e.g., implementation is incorrect, test strategy is misguided), the developer's only option today is to cancel the entire workflow and start from scratch. All prior phase work — requirements gathering, impact analysis, architecture — is wasted.

**Cost of inaction**: Developers avoid the framework for iterative work, falling back to manual editing. This undermines adoption and trust.

**Success metric**: A developer can redo the current phase without losing prior phase work, and receives clear feedback about what was reset.

**Stakeholders**:
- Primary: Developers using iSDLC workflows
- Secondary: Framework maintainers (governance integrity)

## 2. Stakeholders and Personas

### Developer (Primary User)
- **Role**: Uses iSDLC to build features or fix bugs
- **Goal**: Recover from a bad phase output without restarting the whole workflow
- **Pain point**: Currently must cancel and re-run all phases from scratch
- **Proficiency**: Familiar with iSDLC workflows and phase progression

## 3. User Journeys

### Happy Path — Retry Implementation
1. Developer is in Phase 06 (Implementation), agent produces incorrect code
2. Developer says "that's wrong, try again"
3. Framework detects retry intent, runs `workflow-retry.cjs`
4. Framework displays summary: phase reset, iteration state cleared, artifacts preserved, next steps
5. Framework re-reads Phase 06 agent instructions, starts fresh
6. Agent sees existing code on disk, references it, produces better output

### Happy Path — Retry Requirements
1. Developer is in Phase 01 (Requirements), unsatisfied with the spec
2. Developer says "redo this"
3. Framework resets Phase 01 iteration state (elicitation counters, constitutional validation)
4. Framework displays summary and re-engages requirements agent
5. Agent sees existing requirements-spec.md, revises it

### Edge Case — No Active Workflow
1. Developer says "try again" with no active workflow
2. Framework returns error: "No active workflow to retry"

### Edge Case — Retry at Workflow Complete
1. All phases completed, developer says "redo this"
2. Framework returns error: "Workflow is complete. Use rollback to return to a specific phase."

## 4. Technical Context

### Existing Patterns
- `phase-advance.cjs` — advances forward only (index + 1)
- `validate-state.cjs` — wraps `state-logic.cjs` for CLI validation
- `state-logic.cjs` V8 (`checkPhaseFieldProtection`) — blocks phase regression with narrow `supervised_review` exception
- `workflow-init.cjs` — creates initial workflow state
- `gate-logic.cjs` — 5-check gate validation before advancement

### Key Constraint
- Retry does NOT trigger V8 phase index regression (index stays the same)
- Retry does NOT trigger V8 status regression (status stays `in_progress`)
- Retry only resets iteration counters within the current phase
- The V8 exception generalization is needed for REQ-0052 (rollback), not retry

### Integration Points
- `state.json` — iteration state fields cleared, `retry_count` incremented
- `ANTIGRAVITY.md.template` — intent detection table
- `CLAUDE.md` template — intent detection table
- Hook system — `state-logic.cjs` updated for recovery action flag (shared with REQ-0052)

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Reliability | Critical | Retry must never corrupt state.json or lose workflow context |
| Usability | High | Recovery summary must clearly show what changed and what to do next |
| Safety | High | Retry must bump state_version atomically |
| Simplicity | High | Single script, no new dependencies |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Retry resets state but agent re-produces same bad output | Medium | Low | Track retry_count for visibility; user can escalate to rollback |
| Stale code on disk confuses agent after implementation retry | Medium | Medium | Agent instructions note: "on retry, review existing code before rewriting" |
| Concurrent state writes during retry | Low | High | Atomic write with state_version bump |

## 6. Functional Requirements

### FR-001: Retry Script
**Confidence**: High

New script `src/antigravity/workflow-retry.cjs` that resets the current phase's iteration state.

- **AC-001-01**: Given an active workflow with current phase `in_progress`, when `workflow-retry.cjs` is executed, then the phase's `test_iteration`, `constitutional_validation`, and `interactive_elicitation` state are cleared
- **AC-001-02**: Given an active workflow, when `workflow-retry.cjs` is executed, then `retry_count` is incremented on the current phase (starting from 0)
- **AC-001-03**: Given an active workflow, when `workflow-retry.cjs` is executed, then `state_version` is bumped
- **AC-001-04**: Given an active workflow, when `workflow-retry.cjs` is executed, then `current_phase` and `current_phase_index` remain unchanged
- **AC-001-05**: Given no active workflow, when `workflow-retry.cjs` is executed, then output `{ "result": "ERROR", "message": "No active workflow" }`

### FR-002: Recovery Feedback
**Confidence**: High

After retry, the script outputs a detailed JSON summary that the framework translates to a human-readable message.

- **AC-002-01**: Given a successful retry, when the script completes, then output includes: `result`, `phase`, `retry_count`, `cleared_state` (list of what was reset), and `artifacts_preserved: true`
- **AC-002-02**: Given a successful retry, when the framework presents the result to the user, then the message shows: current phase name, what was cleared, retry count, and suggested next action
- **AC-002-03**: Given a retry on Phase 06, when the feedback is displayed, then the message notes that existing code is preserved on disk for the agent to reference

### FR-003: Intent Detection — Retry
**Confidence**: High

Add retry intent to the framework's intent detection table.

- **AC-003-01**: Given user input matching retry signals ("try again", "redo this", "that's wrong", "start over", "retry"), when intent detection runs, then the framework maps to the retry action
- **AC-003-02**: Given retry intent detected, when the framework responds, then it asks for brief confirmation before executing
- **AC-003-03**: Given the user confirms, when the framework proceeds, then it runs `workflow-retry.cjs` and presents the recovery feedback

### FR-004: Recovery Action Flag (Shared with REQ-0052)
**Confidence**: High

Introduce a `recovery_action` field in state writes to signal recovery operations. This generalizes the existing `supervised_review.redo_pending` exception in `state-logic.cjs`.

- **AC-004-01**: Given a retry operation, when state is written, then `active_workflow.recovery_action` is set to `{ "type": "retry", "phase": "<phase>", "timestamp": "<ISO-8601>" }`
- **AC-004-02**: Given `recovery_action` is present in a state write, when V8 (`checkPhaseFieldProtection`) evaluates the write, then phase status regression from `completed` to `in_progress` is allowed for the specified phase
- **AC-004-03**: Given `recovery_action` is present, when the recovery operation completes (phase re-advances), then `recovery_action` is cleared from state

### FR-005: Retry Count Tracking (No Cap)
**Confidence**: High

Track retry count per phase for visibility but do not enforce a maximum.

- **AC-005-01**: Given a phase with no prior retries, when retry is executed, then `phases[phase].retry_count` is set to 1
- **AC-005-02**: Given a phase with `retry_count: 2`, when retry is executed again, then `retry_count` becomes 3
- **AC-005-03**: Given any retry_count value, when the gate is validated, then retry_count does not block advancement

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Rolling back to earlier phases | Separate feature — REQ-0052 | REQ-0052 depends on FR-004 from this spec |
| Automatic file revert (git checkout) | Adds complexity; artifacts preserved instead | Could be added later as `--revert` flag |
| Retry count cap/limit | User is in control; no business need for a cap | None |
| Claude Code hook integration | Antigravity-first; hooks updated for compatibility only | None |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Retry Script | Must Have | Core capability — without this, the feature doesn't exist |
| FR-002 | Recovery Feedback | Must Have | User must know what happened and what to do next |
| FR-003 | Intent Detection | Must Have | Invisible UX pattern — users shouldn't need to know the command |
| FR-004 | Recovery Action Flag | Must Have | Shared governance foundation for both retry and rollback |
| FR-005 | Retry Count Tracking | Should Have | Observability — useful but not blocking |

## Pending Sections

*All sections complete.*
