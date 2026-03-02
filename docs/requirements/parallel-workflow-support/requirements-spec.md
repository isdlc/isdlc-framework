# Requirements Specification: Parallel Workflow Support (GH-30)

**Date**: 2026-02-21
**Analyst**: Maya Chen (Business Analyst)
**Source**: GitHub #30
**Phase**: 01-requirements (Deep Mode)
**Codebase Hash**: 1ed003f

---

## 1. Business Context

### Problem Statement

The iSDLC framework enforces a `single_active_workflow_per_project` rule (defined in `src/isdlc/config/workflows.json`, line 380). The root `.isdlc/state.json` contains a single `active_workflow` field, and all 35 hook files plus 5 dispatchers assume this single-workflow context. This blocks parallel development: a developer cannot work on a bug fix while a feature workflow is in progress. When parallel workflows were attempted, gateblocker hooks cross-contaminated state across workflows, mixing up phase stages and blocking progress on both.

### Usage Scenarios

Three distinct parallel development scenarios have been identified:

1. **Two-laptop flow** (works today): Developer analyzes on Laptop A, commits to GitHub, Laptop B pulls and builds. This works because each laptop has its own clone with independent state. Available during evenings/weekends when both laptops are present.
2. **Single-laptop parallel sessions** (blocked today): During office hours with only one laptop, developer needs multiple Claude Code sessions running simultaneously -- some performing analysis, some building -- within the same repository. This is completely blocked by the single-workflow constraint.
3. **Cross-workflow blast radius awareness** (not addressed today): When two concurrent workflows modify overlapping files, agents should detect the overlap and coordinate. Two-tier conflict model:
   - **Soft conflict** (different sections of same file): Agents self-coordinate by sequencing writes, inform user on screen.
   - **Hard conflict** (same lines/sections): Escalate to user with proposed resolution for conversational decision-making.

### Stakeholders

- **iSDLC Developers** (primary): Developers using Claude Code with iSDLC installed who need to context-switch between tasks or work on multiple tasks concurrently.
- **iSDLC Framework Maintainers** (secondary): The framework developers who dogfood across 2 laptops and 2 repos, explicitly needing parallel backlog items with minimal file conflict. Currently limited to sequential completion during single-laptop office hours.
- **Downstream features** (dependent): GH-39 (state pruning) and GH-40 (epic decomposition) both depend on the per-workflow state model.

### Success Metrics

- **SM-001**: Two workflows can run simultaneously with zero state interference (verified by integration test).
- **SM-002**: Hook invocation overhead increases by no more than +20ms per dispatcher run.
- **SM-003**: Zero data loss during automatic migration from monolithic to per-workflow state.
- **SM-004**: Existing single-workflow projects continue working identically without any user action.
- **SM-005**: Developer feature throughput increases 2-3x compared to sequential single-workflow baseline.

### Driving Factors

- Framework development is self-bottlenecked by the single-workflow constraint, reducing throughput to 1x.
- Single-laptop office hours are the primary bottleneck -- dual-laptop evenings/weekends already work via separate clones.
- Prerequisite for GH-39 (state pruning at workflow completion) and GH-40 (epic decomposition).
- The dual-laptop parallel development workflow documented in CLAUDE.md requires proper state isolation.

### Cost of Inaction

Without this feature, developer throughput stays at 1x (sequential only). Single-laptop parallel sessions are impossible. The "pick 2 parallel backlog items" strategy from CLAUDE.md remains impractical during office hours. GH-39 and GH-40 are blocked. The framework cannot dogfood its own parallel development recommendations.

### Elaboration: Blast Radius Awareness Scoping

<!-- Elaboration: step 01-01, 2026-02-21T00:00:00.000Z -->

Cross-team discussion established the following design parameters for the blast radius awareness capability:

- **Scope**: File-level overlap detection for day 1. Line-level/section-level conflict detection deferred to a follow-on feature.
- **Trigger**: Blast radius check runs once at phase start (especially Phase 02 impact analysis and Phase 05 build), not on every dispatcher invocation. This preserves the 20ms performance budget.
- **Interface model**: Two read-only functions (`getSiblingWorkflows()`, `getWorkflowBlastRadius(workflowId)`) with no coupling to the write path. Each workflow writes exclusively to its own state; reads from siblings are safe and lock-free.
- **Missing data fallback**: When a sibling workflow has not yet completed impact analysis, `getWorkflowBlastRadius()` returns `null`. The calling agent treats this as "cannot determine overlap -- proceed with caution and inform user."
- **Priority**: Should Have within GH-30 (not a separate feature). State isolation (Must Have) ships independently; blast radius awareness enhances but does not block the core capability.

---

## 2. Stakeholders and Personas

### 2.1 iSDLC Developer (Primary)

- **Role**: Software developer using Claude Code with iSDLC framework for structured development.
- **Goals**: Work on multiple tasks (bugs, features) without workflow interference. Switch between tasks without losing progress.
- **Pain Points**: Must cancel active workflow to start a new one. Cancellation discards phase completion state. No pause/resume mechanism.
- **Technical Proficiency**: High (comfortable with git branches, worktrees, CLI tools).
- **Key Tasks**: Start workflows, switch between workflows, check status across workflows, complete workflows.

### 2.2 iSDLC Framework Maintainer (Secondary)

- **Role**: Developer and maintainer of the iSDLC framework itself, dogfooding across multiple machines.
- **Goals**: Run parallel backlog items on separate laptops. Minimize merge conflicts between concurrent work streams.
- **Pain Points**: Current workflow forces sequential task completion. Separate clones are the only workaround.
- **Technical Proficiency**: Expert (maintains the framework, understands hook internals).
- **Key Tasks**: All developer tasks plus framework-level debugging when state isolation fails.

### 2.3 Hook Dispatcher (Automated Consumer)

- **Role**: The 5 dispatcher processes that consolidate hooks and enforce workflow rules.
- **Goals**: Resolve the correct workflow state on each invocation. Pass consistent state to all downstream hooks.
- **Constraints**: Must resolve state in <20ms. Must handle missing/corrupt state gracefully. Must preserve the `check(ctx)` function signature for all hooks.

---

## 3. User Journeys

### Journey 1: Starting a Second Workflow (Happy Path -- Worktree)

1. Developer is mid-workflow on `BUG-0012` (branch: `fix/BUG-0012`).
2. Developer creates a git worktree: `git worktree add ../isdlc-gh30 -b feature/GH-30`.
3. Developer opens Claude Code in the worktree directory.
4. Developer runs `/isdlc feature "parallel workflow support"`.
5. Framework creates `workflows/GH-30/state.json`, adds entry to `workflows.index.json`.
6. All hooks in this session resolve state from `workflows/GH-30/state.json` via branch name.
7. Meanwhile, the original session on `fix/BUG-0012` continues undisturbed -- its hooks resolve to `workflows/BUG-0012/state.json`.

### Journey 2: Switching Workflows Without Worktrees (Sequential)

1. Developer is on branch `fix/BUG-0012`, workflow active.
2. Developer runs `git checkout feature/GH-30`.
3. Hook dispatcher detects branch change on next invocation, resolves to `workflows/GH-30/state.json`.
4. If no workflow exists for this branch, `/isdlc` (no args) presents the picker.
5. Developer selects or creates the workflow.
6. Developer can switch back to `fix/BUG-0012` anytime -- state is preserved in its own file.

### Journey 3: Session Start with Multiple Active Workflows

1. Developer opens Claude Code, runs `/isdlc`.
2. Framework reads `workflows.index.json`, finds 2+ active workflows.
3. Presents picker showing each workflow's ID, type, branch, current phase, and status.
4. Developer selects one; session scopes to that workflow.

### Journey 4: Error -- Branch Has No Workflow

1. Developer checks out an arbitrary branch (no workflow associated).
2. Developer runs `/isdlc status`.
3. Framework reports: "No workflow associated with branch `my-branch`."
4. Developer can start a new workflow or associate the branch with an existing one.

### Journey 5: Error -- State File Corruption

1. Workflow state file is corrupted (invalid JSON, partial write).
2. Hook dispatcher attempts to read, gets parse error.
3. Framework logs warning, returns null state (hooks requiring active workflow are skipped).
4. Developer is prompted to repair or recreate the workflow state.

### Journey 6: Migration from Monolithic State

1. Developer updates iSDLC framework (has existing `state.json` with `active_workflow`).
2. On first `/isdlc` invocation, framework detects old format.
3. Auto-migrates: creates `workflows/{id}/state.json` from the `active_workflow` block, creates `workflows.index.json`, strips `active_workflow` from root state.
4. Saves backup as `state.json.pre-parallel-migration`.
5. Logs migration summary.

---

## 4. Technical Context

### Runtime and Module System

- **Language**: JavaScript (Node.js)
- **Module system**: CommonJS (`.cjs` files, `require()` / `module.exports`)
- **No ESM**: The entire hooks system is CJS. No hybrid patterns.

### Architectural Patterns

- **Dispatcher consolidation**: 5 dispatchers (`pre-task`, `post-write-edit`, `pre-skill`, `post-bash`, `post-task`) each read state once and pass a `ctx` object to hook `check()` functions.
- **State resolution**: `resolveStatePath(projectId)` in `common.cjs` (line 327) returns the path to `state.json`. In monorepo mode, it already supports per-project paths: `.isdlc/projects/{id}/state.json`.
- **Guard pattern**: `hasActiveWorkflow = (ctx) => !!ctx.state?.active_workflow` used by all dispatchers as hook activation guard.
- **State I/O**: `readState(projectId)` (line 1063), `writeState(state, projectId)` (line 1089), `readStateValue(jsonPath, projectId)` (line 1031) are the three state access functions.

### Hard Constraints

- **C-001: Backward compatibility**: Existing projects with monolithic `state.json` must continue working. Migration must be automatic and non-destructive.
- **C-002: Performance budget**: +20ms max per hook invocation. Dispatchers already batch hooks -- resolution overhead happens once per dispatcher.
- **C-003: Hook signature preservation**: The `check(ctx)` function signature must be preserved. Hooks receive state via `ctx.state`, not by calling `readState()` directly.
- **C-004: Monorepo composition**: Per-workflow state must compose with per-project monorepo state. Path: `.isdlc/projects/{id}/workflows/{workflow-id}/state.json`.
- **C-005: No new dependencies**: The change must not introduce new npm packages or external dependencies.
- **C-006: Atomic writes**: State file writes must use write-rename pattern to prevent corruption during concurrent access.

### Known Technical Debt

- `common.cjs` is ~3500 lines with ~50 exports (maintainability concern).
- Zero test coverage on `readState()`, `writeState()`, `resolveStatePath()`.
- `active_workflow` in root state mixes workflow state with project-level state.

---

## 5. Quality Attributes & Risks

### Quality Attribute Priorities

| Attribute | Priority (1-5) | Threshold |
|-----------|----------------|-----------|
| Reliability | 5 | Zero data loss during concurrent access. Corruption recoverable. |
| Testability | 5 | State layer must have unit tests. Currently has zero. |
| Maintainability | 5 | Must improve modularity of `common.cjs`, not worsen it. |
| Backward Compatibility | 5 | Existing single-workflow projects work unchanged. |
| Performance | 4 | +20ms max per dispatcher invocation. |
| Usability | 3 | Workflow picker UX functional, not necessarily polished. |
| Security | 2 | State files are local, gitignored, no secrets. |

### Risk Assessment

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | Concurrent write corruption -- two sessions write to the same index file simultaneously | Medium | High | Per-workflow state files eliminate shared writes. Index writes use atomic write-rename pattern. |
| R2 | Migration data loss -- automatic migration from monolithic state loses or corrupts existing workflow progress | Low | Critical | Validate migration by reading back. Keep backup of original state.json. Provide rollback. |
| R3 | Hook regression -- changing state resolution breaks one or more of the 27 standalone hooks | Medium | High | Hooks use the same `readState()` import. If interface is backward-compatible, risk is contained. Requires comprehensive test coverage. |
| R4 | Monorepo interaction complexity -- per-project + per-workflow creates 3-level directory hierarchy | Low | Medium | Design the path resolution as composable layers. Test monorepo + parallel workflow scenarios explicitly. |
| R5 | Performance budget exceeded -- branch resolution subprocess adds overhead beyond 20ms | Low | Medium | Cache `git branch --show-current` result within dispatcher runs. Subprocess is ~5ms. |
| R6 | Stale index -- `workflows.index.json` becomes inconsistent with actual workflow directories | Medium | Low | Index rebuild from directory scan as fallback. Health check command. |

### Testing Strategy Implications

- **Non-negotiable**: Unit tests for workflow resolver, index management, state read/write.
- **Required**: Integration tests for parallel state isolation, migration correctness.
- **Recommended**: Regression tests for all 5 dispatchers with the new resolution path.

---

## 6. Functional Requirements

### FR-001: Per-Workflow State Isolation

**Description**: The system must store each workflow's state in a separate file (`workflows/{workflow-id}/state.json`) instead of a single shared `active_workflow` field.

**Acceptance Criteria**:
- **AC-001-01**: Given a new workflow is started, When the framework initializes state, Then a new directory `workflows/{workflow-id}/` is created with its own `state.json` containing phases, current_phase, escalations, and skill_usage_log.
- **AC-001-02**: Given two workflows exist, When Hook A reads state for workflow 1, Then it receives only workflow 1's state and cannot access workflow 2's state.
- **AC-001-03**: Given a workflow state file exists, When the workflow is completed or cancelled, Then the state file is preserved (not deleted) and marked with status "completed" or "cancelled".
- **AC-001-04**: Given the workflows directory does not exist, When the first workflow is created, Then the directory is created automatically with `{ recursive: true }`.

**Priority**: Must Have
**Traces**: SM-001, C-001

---

### FR-002: Workflow Index Management

**Description**: The system must maintain a `workflows.index.json` file that serves as a lightweight registry of all workflows.

**Acceptance Criteria**:
- **AC-002-01**: Given a new workflow is started, When the framework creates its state, Then an entry is appended to `workflows.index.json` with fields: `{ id, type, branch, status, started }`.
- **AC-002-02**: Given a workflow is completed/cancelled, When the status changes, Then the index entry is updated to reflect the new status.
- **AC-002-03**: Given the index file is read, When multiple workflows exist, Then the response is an array sorted by `started` descending (most recent first).
- **AC-002-04**: Given the index file does not exist, When any workflow operation is attempted, Then the index is created automatically with an empty array.
- **AC-002-05**: Given the index file is corrupted (invalid JSON), When a read is attempted, Then the framework logs a warning and rebuilds the index by scanning the `workflows/` directory.

**Priority**: Must Have
**Traces**: SM-001, R6

---

### FR-003: Branch-to-Workflow Resolution

**Description**: The system must resolve the current git branch to a workflow ID, enabling hooks to determine which workflow state to read.

**Acceptance Criteria**:
- **AC-003-01**: Given a session is on branch `fix/BUG-0012`, When a hook dispatcher runs, Then it resolves to workflow ID `BUG-0012` by reading `workflows.index.json` and matching the `branch` field.
- **AC-003-02**: Given a session is on a branch with no matching workflow, When a hook dispatcher runs, Then `resolveWorkflow()` returns `null` and hooks that require active workflow are skipped.
- **AC-003-03**: Given the branch resolution succeeds, When the same dispatcher processes multiple hooks, Then the resolution result is cached for the duration of that dispatcher run (no repeated subprocess calls).
- **AC-003-04**: Given `git branch --show-current` fails (detached HEAD, not a git repo), When resolution is attempted, Then the framework falls back to returning `null` with a debug log.

**Priority**: Must Have
**Traces**: SM-002, R5

---

### FR-004: Dispatcher State Injection

**Description**: All 5 dispatchers must resolve the workflow once at invocation start and pass the resolved workflow state to all hook check functions.

**Acceptance Criteria**:
- **AC-004-01**: Given a dispatcher starts execution, When it reads state, Then it calls `resolveWorkflow()` to determine the active workflow ID, reads that workflow's state file, and sets `ctx.state.active_workflow` from the workflow state.
- **AC-004-02**: Given the `ctx` object is passed to a hook check function, When the hook reads `ctx.state.active_workflow`, Then the value reflects the resolved per-workflow state (not the monolithic root state).
- **AC-004-03**: Given a hook calls `writeState()` to update workflow progress, When the write occurs, Then only the resolved workflow's state file is written -- not the root `state.json`.
- **AC-004-04**: Given no workflow is resolved (null), When `ctx.state.active_workflow` is accessed, Then it is `undefined` and hooks with `shouldActivate: hasActiveWorkflow` are skipped (current behavior preserved).

**Priority**: Must Have
**Traces**: SM-001, SM-002, C-003, R3

---

### FR-005: Root State Separation

**Description**: The root `.isdlc/state.json` must retain only project-level data (counters, project info, workflow_history, constitution) and no longer contain the `active_workflow` field.

**Acceptance Criteria**:
- **AC-005-01**: Given a project with the new state structure, When `readState()` is called without a workflow context, Then it returns the root state without any `active_workflow` field.
- **AC-005-02**: Given a workflow is completed, When its summary is recorded, Then the entry is appended to `workflow_history` in the root state (existing behavior preserved).
- **AC-005-03**: Given the root state and workflow state are separate files, When both are written in a single dispatcher run, Then each write is atomic and independent.

**Priority**: Must Have
**Traces**: SM-001, C-001

---

### FR-006: Session Binding (Workflow Picker)

**Description**: When `/isdlc` is invoked with no arguments and multiple workflows are active, the system must present a picker for the user to select which workflow to scope the session to.

**Acceptance Criteria**:
- **AC-006-01**: Given 2+ active workflows exist, When `/isdlc` is invoked with no arguments, Then a picker is displayed showing each workflow's ID, type, branch, current phase, and status.
- **AC-006-02**: Given the user selects a workflow from the picker, When the selection is confirmed, Then all subsequent hook invocations in this session scope to the selected workflow's state.
- **AC-006-03**: Given only 1 active workflow exists, When `/isdlc` is invoked, Then the picker is skipped and the single workflow is auto-selected.
- **AC-006-04**: Given 0 active workflows exist, When `/isdlc` is invoked, Then the standard new-workflow menu is shown (existing Scenarios 1-4).

**Priority**: Should Have
**Traces**: SM-004

---

### FR-007: Backward-Compatible Migration

**Description**: The system must automatically migrate existing monolithic `state.json` files to the per-workflow structure on first use.

**Acceptance Criteria**:
- **AC-007-01**: Given an existing `state.json` with an `active_workflow` field, When the framework starts for the first time after upgrade, Then it creates `workflows/{id}/state.json` from the `active_workflow` data, creates `workflows.index.json` with one entry, and removes `active_workflow` from root state.
- **AC-007-02**: Given migration is triggered, When the migration completes, Then a backup of the original `state.json` is saved as `state.json.pre-parallel-migration`.
- **AC-007-03**: Given migration fails (file write error), When the error is caught, Then the original `state.json` is preserved unchanged, an error is logged, and the framework continues with the monolithic state.
- **AC-007-04**: Given a project has no `state.json` (new project), When the framework starts, Then no migration is needed -- the new structure is used from the start.

**Priority**: Must Have
**Traces**: SM-003, SM-004, R2

---

### FR-008: Workflow Rules Update

**Description**: The `single_active_workflow_per_project` rule in `workflows.json` must be removed or set to `false`, replaced by the per-workflow isolation model.

**Acceptance Criteria**:
- **AC-008-01**: Given `workflows.json` is updated, When the rules section is read, Then `single_active_workflow_per_project` is either removed or set to `false`.
- **AC-008-02**: Given the rule is removed, When a user starts a second workflow while one is active, Then the framework creates a new workflow entry instead of blocking.

**Priority**: Must Have
**Traces**: SM-001

---

### FR-009: Monorepo Compatibility

**Description**: The per-workflow state model must compose correctly with the existing monorepo per-project state model.

**Acceptance Criteria**:
- **AC-009-01**: Given a monorepo project with ID `api-service`, When a workflow is started, Then the workflow state is stored at `.isdlc/projects/api-service/workflows/{id}/state.json`.
- **AC-009-02**: Given two monorepo projects each have active workflows, When hooks resolve state, Then each project's workflows are completely isolated.

**Priority**: Should Have
**Traces**: C-004, R4

---

## 7. Out of Scope

| ID | Excluded Capability | Rationale |
|----|---------------------|-----------|
| OS-001 | Workflow archival/cleanup | Deferred to GH-39 (state pruning at workflow completion) |
| OS-002 | Epic decomposition with parent/sub-feature tracking | Deferred to GH-40 |
| OS-003 | Concurrent hook execution within a single dispatcher | Not needed; dispatchers are sequential by design |
| OS-004 | Remote/cloud state synchronization | Out of framework scope |
| OS-005 | Workflow priority ordering or scheduling | No use case identified |
| OS-006 | Automatic git worktree creation | Manual worktree management is sufficient |

---

## 8. MoSCoW Prioritization

### Summary Table

| FR | Title | Priority | Dependency |
|----|-------|----------|------------|
| FR-001 | Per-Workflow State Isolation | Must Have | -- |
| FR-002 | Workflow Index Management | Must Have | -- |
| FR-003 | Branch-to-Workflow Resolution | Must Have | FR-002 |
| FR-004 | Dispatcher State Injection | Must Have | FR-003 |
| FR-005 | Root State Separation | Must Have | FR-001 |
| FR-007 | Backward-Compatible Migration | Must Have | FR-001, FR-002 |
| FR-008 | Workflow Rules Update | Must Have | -- |
| FR-006 | Session Binding (Workflow Picker) | Should Have | FR-002 |
| FR-009 | Monorepo Compatibility | Should Have | FR-001, FR-003 |

### Minimum Viable Slice

FR-001 + FR-002 + FR-003 + FR-004 + FR-005 + FR-007 + FR-008 (7 Must Haves). This delivers full state isolation with migration. The picker (FR-006) and monorepo composition (FR-009) can follow.

### Recommended Implementation Order

1. FR-001 (Per-Workflow State Isolation) -- foundation
2. FR-002 (Workflow Index Management) -- registry
3. FR-003 (Branch-to-Workflow Resolution) -- resolver
4. FR-005 (Root State Separation) -- decouple root state
5. FR-004 (Dispatcher State Injection) -- wire dispatchers
6. FR-008 (Workflow Rules Update) -- remove blocker rule
7. FR-007 (Backward-Compatible Migration) -- safe upgrade path
8. FR-006 (Session Binding / Picker) -- UX layer
9. FR-009 (Monorepo Compatibility) -- extended support

### Priority Dependency Check

No conflicts found. All Must Haves form a coherent, deliverable set. FR-004 (Must Have) depends on FR-003 (Must Have) -- consistent. FR-006 (Should Have) depends on FR-002 (Must Have) -- valid (higher priority enables lower).
