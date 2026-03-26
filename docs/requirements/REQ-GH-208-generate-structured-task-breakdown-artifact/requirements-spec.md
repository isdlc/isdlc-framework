# Requirements Specification: Structured Task Breakdown from Analysis

**Slug**: REQ-GH-208-generate-structured-task-breakdown-artifact
**Source**: GitHub Issue #208
**Type**: Enhancement
**Version**: 1.0.0

---

## 1. Business Context

After analysis completes (requirements, architecture, design accepted), there is no structured task breakdown visible to the user. The implementation plan only materializes during the build workflow (`3e-plan` after Phase 01, `3e-refine` after Phase 04), meaning the user commits to building without seeing what will actually be built.

**Problem Statement**: The user cannot review the implementation scope — which files will be created/modified, in what order, with what dependencies — before deciding to build. This makes scope estimation and build/no-build decisions opaque.

**Stakeholders**:
- **Framework users**: Need to see the full implementation plan before committing to a build workflow
- **Software-developer agent (Phase 06)**: Needs a pre-existing task list to execute against instead of self-decomposing
- **Quality-loop agent (Phase 16)**: Needs a task list to verify completeness against
- **QA agent (Phase 08)**: Needs a task list as review checklist

**Success Metrics**:
- Every analyzed feature has a tasks.md in the requirement folder before build starts
- The task list is visible to the user as the 4th confirmation in the roundtable
- Build workflow detects pre-existing tasks.md and skips redundant generation

**Driving Factors**:
- speckit's `/speckit.tasks` demonstrates the value of a visible task breakdown between planning and implementation
- Existing `3e-plan` (ORCH-012) and `3e-refine` already define the task format — the gap is timing and visibility, not format invention
- #210 (execution tracing) needs a task list as the spine for per-task event logging

---

## 2. Stakeholders and Personas

### Framework User
- **Role**: Developer using iSDLC to build features
- **Goals**: See the full implementation scope before committing, review/amend task breakdown, split large builds
- **Pain Points**: Commits to build blindly, discovers scope mid-workflow, no way to preview implementation plan

### Phase Agents (05, 06, 16, 08)
- **Role**: Automated agents consuming the task list
- **Goals**: Deterministic execution order, clear file targets, traceable work units
- **Pain Points**: Phase 06 currently self-decomposes; Phase 16 has no task-level verification; Phase 08 has no structured review checklist

---

## 3. User Journeys

### Journey 1: Analyze → Review Tasks → Build
- **Entry**: User runs `/isdlc analyze "#208"`, roundtable completes, design accepted
- **Flow**: Roundtable generates task breakdown from in-memory artifacts → presents summary (task count, phases, critical path) → user reviews → Accept or Amend → all artifacts written in batch
- **Exit**: `docs/requirements/{slug}/tasks.md` exists on disk. User runs `/isdlc build` and the task list is consumed by all subsequent phases.

### Journey 2: Amend Task Scope
- **Entry**: User sees the task breakdown summary with 45 tasks across 7 phases
- **Flow**: User says "too large — defer the Polish phase and the Codex adapter tasks" → roundtable amends by removing those tasks and adjusting dependencies → re-presents summary → Accept
- **Exit**: tasks.md reflects the reduced scope. Deferred tasks documented.

### Journey 3: Build Detects Pre-Existing Tasks
- **Entry**: User runs `/isdlc build "REQ-GH-208"` after analysis with tasks.md already generated
- **Flow**: `3e-plan` checks for `{artifact_folder}/tasks.md` → found → skips generation. `3e-refine` checks if tasks already have file-level detail → found → skips refinement.
- **Exit**: Build proceeds using the pre-generated task list without redundant regeneration.

---

## 4. Technical Context

### Existing Infrastructure
- **ORCH-012 (generate-plan)**: Generates high-level tasks.md after Phase 01 — one task per phase, no file paths, no dependencies. Writes to `docs/isdlc/tasks.md`.
- **3e-refine**: Refines Phase 06 tasks after Phase 04 — adds file paths, `blocked_by`/`blocks`, dependency graph, critical path. Reads design artifacts from disk.
- **plan-surfacer.cjs**: Hook that blocks implementation delegation if `docs/isdlc/tasks.md` doesn't exist.
- **Roundtable batch write**: All artifacts written in single batch after final Accept (Section 5.5 of roundtable-analyst.md).
- **Confirmation state machine**: `IDLE → PRESENTING_REQUIREMENTS → PRESENTING_ARCHITECTURE → PRESENTING_DESIGN → FINALIZING → COMPLETE` (roundtable-analyst.md line 147).

### Task Format (v2.0, from ORCH-012)
```
- [ ] T0001 [P] Description with file path | traces: FR-001, AC-001-01
    files: src/core/validators/contract-schema.js (CREATE)
    blocked_by: none
    blocks: T0002, T0003
```
EBNF grammar defined in ORCH-012 SKILL.md (lines 256-280).

### Constraints
- Task generation must happen inline in the roundtable (same context window — all three artifacts in memory)
- Must use the existing v2.0 task format for compatibility with `3e-refine`, plan-surfacer, and Phase 06 agent
- Light workflows (no architecture/design phases) skip the task breakdown confirmation — not enough design detail
- Task list written to `docs/requirements/{slug}/tasks.md` (per-requirement), not `docs/isdlc/tasks.md` (workflow-level)

---

## 5. Quality Attributes and Risks

| Quality Attribute | Priority | Threshold |
|---|---|---|
| Format compatibility | Critical | Generated tasks.md must parse correctly by existing ORCH-012 consumers, 3e-refine, and plan-surfacer |
| Generation latency | High | Task breakdown generated within the roundtable context — no additional agent delegation or file reads |
| Traceability | High | 100% of FRs have at least one task with `traces:` annotation |
| Backward compatibility | Critical | Build workflows that don't have a pre-existing tasks.md must still work (3e-plan/3e-refine as fallback) |

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Context window pressure from large task lists | Medium | Medium | Present summary to user, not full dump. Full list written to disk only. |
| Task format drift between roundtable-generated and 3e-refine-generated | Low | High | Both use same v2.0 EBNF grammar. Test with format validator. |
| Light workflows have no design detail for file-level tasks | Medium | Low | Skip task confirmation for light workflows. Guard in state machine. |
| 3e-plan/3e-refine run redundantly when tasks.md already exists | Low | Low | Guard: check for `{artifact_folder}/tasks.md` before generating |

---

## 6. Functional Requirements

### FR-001: Task Generation in Roundtable
**Confidence**: High

Generate a file-level task breakdown from analysis artifacts (requirements-spec.md, architecture-overview.md, module-design.md) inline during the roundtable, after design acceptance.

- **AC-001-01**: Given all three analysis artifacts in memory, When the design domain is accepted, Then the roundtable generates a task list with sequential IDs (T0001+), file paths, CREATE/MODIFY markers, `blocked_by`/`blocks` dependencies, `[P]` parallel markers, and `| traces:` FR/AC annotations
- **AC-001-02**: Given the generated task list, When dependency ordering is computed, Then no circular dependencies exist (acyclicity validated)
- **AC-001-03**: Given the generated task list, When traceability is computed, Then at least 80% of FRs from requirements-spec.md have at least one task with matching `traces:` annotation
- **AC-001-04**: Given the task format, When parsed, Then it conforms to the v2.0 EBNF grammar defined in ORCH-012 SKILL.md

### FR-002: Task Breakdown as 4th Confirmation Domain
**Confidence**: High

Present the task breakdown as the 4th step in the roundtable confirmation sequence, after Design and before batch write.

- **AC-002-01**: Given the confirmation state machine, When design is accepted, Then the state transitions to `PRESENTING_TASKS` (new state) before `FINALIZING`
- **AC-002-02**: Given the `PRESENTING_TASKS` state, When the summary is presented, Then it shows: total task count, phase breakdown (tasks per phase), critical path length, parallel tier count, total files affected (CREATE + MODIFY)
- **AC-002-03**: Given the summary, When the user responds with Accept, Then the state transitions to `FINALIZING` and the batch write includes tasks.md
- **AC-002-04**: Given the summary, When the user responds with Amend, Then the roundtable re-enters conversation to adjust tasks (remove tasks, defer phases, adjust dependencies) and re-presents the summary
- **AC-002-05**: Given a light workflow (no architecture/design phases), When the confirmation sequence runs, Then the `PRESENTING_TASKS` step is still presented — requirements + impact analysis provide enough detail (affected files, FR/AC traces, blast radius) to derive tasks. Only trivial tier skips task confirmation.

### FR-003: Task List Artifact Persistence
**Confidence**: High

Write the task list to the requirement folder as part of the batch write.

- **AC-003-01**: Given the final Accept in the confirmation sequence, When the batch write executes, Then `docs/requirements/{slug}/tasks.md` is created alongside requirements-spec.md, architecture-overview.md, and module-design.md
- **AC-003-02**: Given the written tasks.md, When meta.json is updated, Then `phases_completed` includes all 5 analysis phases AND a new `task_breakdown_generated: true` field is set
- **AC-003-03**: Given the tasks.md format, When it includes a header block, Then the header contains: source slug, generated timestamp, FR count, task count, format version (v2.0)

### FR-004: Build Workflow Integration (Skip Redundant Generation)
**Confidence**: High

When a build workflow starts and tasks.md already exists in the artifact folder, skip redundant task generation.

- **AC-004-01**: Given `docs/requirements/{slug}/tasks.md` exists, When `3e-plan` runs after Phase 01, Then it detects the pre-existing file and skips generation (logs: "Pre-existing task plan found, skipping generation")
- **AC-004-02**: Given `docs/requirements/{slug}/tasks.md` has file-level task detail (files:, blocked_by:, blocks:), When `3e-refine` runs after Phase 04, Then it detects refinement is already done and skips (checks for presence of `files:` sub-lines in Phase 06 tasks)
- **AC-004-03**: Given no pre-existing tasks.md, When a build starts, Then `3e-plan` and `3e-refine` run as they do today (backward compatibility)
- **AC-004-04**: Given a pre-existing tasks.md, When it's copied to `docs/isdlc/tasks.md` for the build workflow, Then the plan-surfacer hook is satisfied and does not block Phase 06 delegation

### FR-005: Task Phase Grouping
**Confidence**: High

Tasks are grouped into named phases within the implementation scope.

- **AC-005-01**: Given the generated task list, When phases are assigned, Then tasks are grouped into: Setup, Foundational, Core Implementation, Provider/Integration, Tests, Polish (or a subset if fewer phases are warranted)
- **AC-005-02**: Given the phase grouping, When dependency ordering is applied, Then tasks in earlier phases are never `blocked_by` tasks in later phases (topological sort respects phase boundaries)

### FR-006: Configurable Task Scope
**Confidence**: High

The task list scope (full workflow vs implementation only) is configurable.

- **AC-006-01**: Given the execution contract `presentation.task_scope` field, When set to `"full-workflow"` (default), Then the task list includes all build phases (05-test-strategy, 06-implementation, 16-quality-loop, 08-code-review) with tasks for each
- **AC-006-02**: Given `presentation.task_scope` set to `"implementation-only"`, Then the task list includes only file-level implementation tasks (Phase 06 equivalent) without mechanical phases

### FR-007: Configurable Task Display
**Confidence**: High

The task display mode during build execution is configurable.

- **AC-007-01**: Given the execution contract `presentation.task_display` field, When set to `"counter"` (default), Then the build phase-loop shows: `⏳ 12/22 tasks (T010: contract-evaluator.js)` inline with the phase task
- **AC-007-02**: Given `presentation.task_display` set to `"expanded"`, Then the build phase-loop shows the full task tree under each phase
- **AC-007-03**: Given `presentation.task_display` set to `"phase-only"`, Then the build phase-loop shows only the 4 phase-level tasks (current behavior, no task info)

---

## 7. Out of Scope

| Item | Reason | Dependency |
|---|---|---|
| How Phase 05/06/16/08 consume the task list | Separate concern — consumption model is a different feature | This feature (tasks must exist first) |
| Execution logging per task | Separate concern — #210 execution tracing | #210 |
| Folder naming convention fix | Separate bug — #211 | #211 |
| Task list for bug/fix workflows | Bug analysis produces a simpler artifact set — task breakdown less applicable | Future enhancement |
| Ralph Wiggum autonomous execution loop | Separate concern — autonomous task execution | Future enhancement |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|---|---|---|---|
| FR-001 | Task Generation in Roundtable | Must Have | Core feature — generate the breakdown |
| FR-002 | 4th Confirmation Domain | Must Have | User visibility — the whole point |
| FR-003 | Artifact Persistence | Must Have | Must survive to disk for build consumption |
| FR-004 | Build Skip Redundant Generation | Must Have | Without this, tasks are generated twice |
| FR-005 | Task Phase Grouping | Must Have | Ungrouped flat list is unusable at 30+ tasks |
| FR-006 | Configurable Task Scope | Should Have | Sensible default covers most users |
| FR-007 | Configurable Task Display | Should Have | Sensible default covers most users |

---

## Pending Sections

*(none — all sections written)*
