# Requirements Specification: Manual Code Review Break

**Document ID**: REQ-0002
**Feature**: Manual Code Review Break (Pause Point Before Merge)
**Version**: 1.0
**Created**: 2026-02-08
**Status**: Approved
**Workflow Phase**: 01-requirements

---

## 1. Executive Summary

Add a configurable human code review checkpoint to SDLC workflows. After the AI-driven code review phase (Phase 08) completes, the workflow pauses and presents a review request to the human developer. For git-based projects, a Pull Request is created. For non-git projects, a review request document is generated. The feature is team-size-aware: it activates automatically when team_size > 1 and provides persistent reminders when bypassed.

---

## 2. Problem Statement

Currently, SDLC phase transitions are fully automatic -- when a gate passes, the workflow immediately advances to the next phase and ultimately merges to main. There is no pause point for a human to review the AI agent's cumulative work before it is merged. For teams with multiple developers, this creates a gap where AI-generated code enters the main branch without human oversight, violating standard code review practices.

---

## 3. Scope

### In Scope

- Human review pause point after Phase 08 (Code Review & QA)
- PR creation for git-based projects
- Review request document for non-git projects
- Review summary document with links to all artifacts and changed files
- Bypass mechanism with mandatory comments
- Team-size-based activation (team_size > 1)
- Installer prompt for team size during `isdlc init`
- Configuration storage in `.isdlc/state.json` under `code_review` section
- Commit-time reminder hook when feature is bypassed

### Out of Scope

- Integration with specific code review tools (Gerrit, Crucible, etc.) beyond git PRs
- Automated merge after human approval (human merges manually)
- Multi-reviewer approval workflows (single human approval is sufficient)
- Review assignment to specific team members

---

## 4. Stakeholders

| Role | Interest |
|------|----------|
| Solo developer | May bypass; receives reminders when team grows |
| Team developer | Primary user; reviews AI-generated changes |
| Team lead | Ensures all AI changes are reviewed before merge |
| iSDLC framework maintainer | Implements and maintains the feature |

---

## 5. Functional Requirements

### FR-01: Workflow Pause After Phase 08

**Priority**: P0 (Critical)

After GATE-08 passes (the current final phase in feature/fix workflows), the orchestrator MUST pause workflow execution and present the review request to the user instead of immediately proceeding to branch merge.

**Acceptance Criteria**:
- AC-01.1: When `code_review.enabled == true` in state.json and GATE-08 passes, the workflow enters a `paused_for_review` state.
- AC-01.2: When `code_review.enabled == false`, the workflow proceeds to merge as it does today (no pause).
- AC-01.3: The `active_workflow.phase_status` for the new review phase shows `"awaiting_human_review"`.
- AC-01.4: The workflow does NOT advance or merge until the user explicitly approves or bypasses.

### FR-02: Pull Request Creation (Git Projects)

**Priority**: P0 (Critical)

For projects using git as VCS, a Pull Request is created when the review pause activates.

**Acceptance Criteria**:
- AC-02.1: If `git rev-parse --is-inside-work-tree` succeeds and `gh` CLI is available, create a PR via `gh pr create`.
- AC-02.2: The PR title follows the format: `[REQ-NNNN] Feature description` or `[BUG-NNNN] Fix description`.
- AC-02.3: The PR body includes the review summary (see FR-05).
- AC-02.4: If `gh` is not available, fall back to generating the review summary document only (FR-03) and instruct the user to create a PR manually.
- AC-02.5: The PR URL is recorded in `active_workflow.review.pr_url` in state.json.
- AC-02.6: If `gh` is available but PR creation fails (network error, permissions, etc.), fall back to document-only review (same as AC-02.4), log the error to state.json history, and inform the user they can create the PR manually.

### FR-03: Review Request Document (Non-Git Projects)

**Priority**: P1 (High)

For projects not using git, a review request document is generated.

**Acceptance Criteria**:
- AC-03.1: A file `docs/requirements/{artifact_folder}/review-request.md` is created.
- AC-03.2: The document contains all information that would be in a PR (see FR-05).
- AC-03.3: The document is presented to the user in the terminal output.

### FR-04: Artifact and File Links in Review Request

**Priority**: P0 (Critical)

The review request includes links to all documentation artifacts generated during the workflow and all files created or modified.

**Acceptance Criteria**:
- AC-04.1: All artifacts from `active_workflow.phase_status` and each phase's `artifacts` array in state.json are listed with relative paths.
- AC-04.2: Git diff (`git diff main...HEAD --name-only`) is used to list all changed files.
- AC-04.3: For non-git projects, the artifact list from state.json is used (changed files cannot be determined without VCS).
- AC-04.4: Files are grouped by category: Documentation, Source Code, Tests, Configuration.

### FR-05: Review Summary Document

**Priority**: P0 (Critical)

A review summary document is generated and persisted.

**Acceptance Criteria**:
- AC-05.1: File saved at `docs/requirements/{artifact_folder}/review-summary.md`.
- AC-05.2: Contains: feature description, workflow type, phases completed, gate results, artifact list, changed files list, test results summary, constitutional compliance status.
- AC-05.3: The document is displayed to the user when the review pause activates.
- AC-05.4: If the review is bypassed, the bypass reason is appended to this document.

### FR-06: Review Bypass with Mandatory Comments

**Priority**: P0 (Critical)

Users can bypass the human review but must provide a reason.

**Acceptance Criteria**:
- AC-06.1: When the review pause activates, the user is presented with options: `[A] Approve -- proceed to merge`, `[B] Bypass -- skip review with mandatory comment`, `[R] Reject -- cancel the workflow`.
- AC-06.2: If `[B]` is selected, the user MUST enter a non-empty comment (minimum 10 characters).
- AC-06.3: Empty or too-short bypass comments are rejected with a prompt to re-enter.
- AC-06.4: The bypass reason is recorded in `active_workflow.review.bypass_reason` in state.json.
- AC-06.5: The bypass reason is appended to the review summary document.
- AC-06.6: The bypass event is logged to `state.json.history[]`.
- AC-06.7: If `[R]` Reject is selected, the workflow is cancelled with reason "rejected at human review". The feature branch is preserved (not deleted). This is equivalent to `/sdlc cancel` with a pre-filled reason.

### FR-07: Team-Size-Based Activation

**Priority**: P1 (High)

The feature is only active when team_size > 1.

**Acceptance Criteria**:
- AC-07.1: `state.json` contains a `code_review` section: `{ "enabled": false, "team_size": 1 }`.
- AC-07.2: When `team_size > 1`, `enabled` is automatically set to `true` by the installer.
- AC-07.3: When `team_size == 1`, `enabled` defaults to `false`.
- AC-07.4: The `enabled` field can be manually overridden regardless of team size (a solo dev can opt in, a team can opt out).

### FR-08: Installer Team Size Prompt

**Priority**: P1 (High)

The installer captures team size during `isdlc init`.

**Acceptance Criteria**:
- AC-08.1: During `isdlc init`, after project detection, the installer asks: "How many developers will work on this project? (1)".
- AC-08.2: Default value is 1 (solo developer).
- AC-08.3: The response is stored in `state.json` under `code_review.team_size`.
- AC-08.4: If `team_size > 1`, `code_review.enabled` is set to `true` and the user is informed.
- AC-08.5: The prompt accepts numeric input only; non-numeric input defaults to 1.

### FR-09: Configuration Persistence and Mutability

**Priority**: P1 (High)

The configuration is stored in `.isdlc/state.json` and can be changed later.

**Acceptance Criteria**:
- AC-09.1: The `code_review` section in state.json is the single source of truth.
- AC-09.2: The user can modify `code_review.enabled` and `code_review.team_size` at any time.
- AC-09.3: Changes take effect on the next workflow run (no restart required).
- AC-09.4: The updater (`isdlc update`) preserves existing `code_review` configuration.

### FR-10: Commit-Time Bypass Reminder Hook

**Priority**: P1 (High)

When the feature is bypassed (enabled == false), every commit shows a reminder.

**Acceptance Criteria**:
- AC-10.1: A new hook (or extension of an existing hook) fires on commit events.
- AC-10.2: If `code_review.enabled == false` AND `code_review.team_size > 1`, display a warning message.
- AC-10.3: If `code_review.enabled == false` AND `code_review.team_size == 1`, display no message (solo dev, expected state).
- AC-10.4: Message text: "Manual code review is currently bypassed. If your team has grown beyond 1 developer, consider enabling it by setting code_review.enabled to true in .isdlc/state.json."
- AC-10.5: The hook must not block the commit (fail-open per Article X).
- AC-10.6: The hook must complete in < 100ms (read state.json, check 2 fields, print message).

---

## 6. Non-Functional Requirements

| ID | Requirement | Category | Target |
|----|-------------|----------|--------|
| NFR-01 | Review summary document works offline | Availability | No external service dependency for document generation |
| NFR-02 | Bypass comments must be >= 10 characters | Data Integrity | Minimum validation length |
| NFR-03 | Configuration changes take effect immediately | Usability | No process restart needed |
| NFR-04 | Reminder hook < 100ms overhead | Performance | Must not slow down commits |
| NFR-05 | Feature must work for any language/framework | Portability | Per Article XIV |
| NFR-06 | State.json writes must be atomic (read-modify-write) | Consistency | Per Article XVI |

---

## 7. Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| New hook must be `.cjs` extension | Article XII, Article XIII: Node 24 compatibility |
| Use `node:test` for all tests | Article II: Standard test runner |
| No new runtime dependencies | Article V: Simplicity First |
| Fail-open on hook errors | Article X: Fail-Safe Defaults |
| Git operations via `gh` CLI only | Existing pattern in orchestrator |

---

## 8. Dependencies

| Dependency | Type | Impact |
|------------|------|--------|
| `gh` CLI (optional) | External tool | PR creation requires `gh`; graceful degradation if absent |
| `state.json` schema | Internal | New `code_review` section added |
| `workflows.json` | Internal | Workflow definitions may need awareness of review pause |
| `installer.js` | Internal | Team size prompt added |
| `gate-blocker.cjs` | Internal | May need awareness of review phase |
| Orchestrator agent | Internal | Phase transition logic updated |

---

## 9. Edge Case Decisions (Resolved in Elicitation Round 3)

| Edge Case | Decision | Rationale |
|-----------|----------|-----------|
| User selects [R] Reject | Cancel workflow with reason "rejected at human review". Branch preserved, not deleted. Equivalent to `/sdlc cancel`. | Keeps behavior simple and consistent with existing cancellation flow |
| PR creation fails (gh available but error) | Fall back to document-only review. Log error. Instruct user to create PR manually. | Fail-gracefully; never block the review process due to tooling failure |
| Which workflows get review pause | Feature, fix, full-lifecycle, upgrade (all with `requires_branch: true`). Skip test-run and test-generate. | Only workflows that create branches and merge need human review. Test workflows don't modify main. |

---

## 10. Workflow Applicability

The review pause applies to workflows based on their `requires_branch` setting in `workflows.json`:

| Workflow | `requires_branch` | Review Pause | Rationale |
|----------|-------------------|--------------|-----------|
| feature | true | Yes | AI changes merge to main |
| fix | true | Yes | AI changes merge to main |
| full-lifecycle | true | Yes | AI changes merge to main |
| upgrade | true | Yes | Dependency changes merge to main |
| test-run | false | No | No branch, no merge |
| test-generate | false | No | No branch, no merge |

The orchestrator reads `requires_branch` from the active workflow definition. If `requires_branch == true` AND `code_review.enabled == true`, the review pause activates after the final phase gate passes.

---

## 11. Assumptions

1. The `gh` CLI is the standard way to create PRs (GitHub-focused). Other git hosting platforms (GitLab, Bitbucket) are not supported in v1.
2. A single human approval is sufficient (no multi-reviewer workflow).
3. The review pause is a workflow-level concept, not a new numbered phase (it sits between the final gate and the merge step).
4. Solo developers (team_size == 1) will NOT see the review pause by default.
5. The review pause applies to all workflows with `requires_branch: true` in workflows.json.

---

## 12. Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User ignores reminder messages | Medium | Low | Message is non-blocking by design; escalation is not warranted |
| `gh` CLI not installed | Medium | Medium | Graceful fallback to document-only review |
| State.json corruption during write | Low | High | Atomic read-modify-write per Article XVI |
| Hook performance regression | Low | Medium | 100ms budget, fail-open design |

---

## 13. Open Questions

None. All ambiguities resolved during elicitation (3 rounds: initial questions, clarification, edge cases).

---

## 14. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Stakeholder | User | 2026-02-08 | Approved |
| Requirements Analyst | Agent 01 | 2026-02-08 | Approved |
