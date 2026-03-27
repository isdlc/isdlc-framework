# Requirements Specification: Task List Consumption Model for Build Phase Agents

**Slug**: REQ-GH-212-task-list-consumption-model-for-build-phase-agents
**Source**: GitHub Issue #212
**Type**: Enhancement
**Version**: 1.0.0
**Depends on**: REQ-GH-208 (task breakdown generation)

---

## 1. Business Context

After REQ-GH-208 generates a structured tasks.md during analysis, build phase agents (05, 06, 16, 08) need to consume it. Today, no phase agent reads tasks.md — Phase 05 self-decomposes from requirements/design artifacts, Phase 06 self-decomposes work, Phase 16 runs checks without task-level granularity, and Phase 08 groups review by directory.

**Problem Statement**: The task list exists for user visibility but is invisible to the agents executing the work. This means agents cannot use dependency ordering, file targeting, or FR/AC traceability from the task plan.

**Stakeholders**:
- **Framework users**: See task progress tracked against the plan they approved during analysis
- **Phase 05 (test-design-engineer)**: Needs task list to generate 1:1 test cases per implementation task
- **Phase 06 (software-developer)**: Needs dependency-ordered execution with file targets
- **Phase 16 (quality-loop-engineer)**: Needs task completion verification and coverage per task
- **Phase 08 (qa-engineer)**: Needs task-structured review units instead of directory grouping

**Success Metrics**:
- All four build phase agents read and act on tasks.md
- Task-to-test traceability flows from Phase 05 through Phase 06 to Phase 16
- Both Claude and Codex providers consume tasks via the same core module

**Driving Factors**:
- REQ-GH-208 produces the task list — this feature makes agents consume it
- #210 (execution tracing) needs task-level granularity that this feature enables
- Provider-neutral architecture requires a shared task reader in src/core/

---

## 2. Stakeholders and Personas

### Framework User
- **Role**: Developer using iSDLC to build features
- **Goals**: See agents execute against the task plan they approved, track progress per task
- **Pain Points**: No visibility into whether agents follow the plan; agents self-decompose independently

### Phase Agents (05, 06, 16, 08)
- **Role**: Automated agents consuming the task list
- **Goals**: Deterministic execution order, file-level targeting, traceable work units
- **Pain Points**: Phase 05 has no task awareness, Phase 06 self-decomposes, Phase 16 has no task-level verification, Phase 08 groups by directory not by logical change unit

---

## 3. User Journeys

### Journey 1: Full Build With Pre-Analyzed Tasks
- **Entry**: User runs `/isdlc build "REQ-GH-208"` after analysis with tasks.md generated
- **Flow**: Build-init copies tasks.md → Phase 05 reads tasks, generates 1:1 test cases → Phase 06 reads tasks + test mapping, executes in dependency order → Phase 16 verifies coverage per task → Phase 08 reviews by task unit
- **Exit**: All tasks marked `[X]`, code-review-report.md traces findings to task IDs

### Journey 2: Build Without Prior Analysis
- **Entry**: User runs `/isdlc build "new feature"` with no prior analysis
- **Flow**: Phase 01 completes → 3e-plan generates file-level tasks.md → Phase 05 reads tasks → rest of build proceeds as Journey 1
- **Exit**: Same as Journey 1

### Journey 3: Light Workflow Build
- **Entry**: User runs `/isdlc build "small change"` with light analysis (no design docs)
- **Flow**: 3e-plan derives file paths from requirements + impact analysis → generates file-level tasks.md → Phase 05 reads tasks → Phase 06 executes → Phase 16 verifies → Phase 08 reviews
- **Exit**: Same as Journey 1, with less precise file paths

---

## 4. Technical Context

### Existing Infrastructure
- **ORCH-012 (3e-plan)**: Generates high-level tasks (one per phase, no file paths). Needs upgrade to file-level detail.
- **3e-refine**: Adds file-level detail after Phase 04. Only runs in standard workflow (not light).
- **plan-surfacer.cjs**: Blocks Phase 06+ if tasks.md missing. Currently lists Phase 05 as EARLY_PHASE (not blocked).
- **Phase-loop controller**: Step 3e.8 already updates tasks.md (marks sections COMPLETE, tasks [X]).
- **Provider runtime**: Provider-neutral interface (executeTask, executeParallel, presentInteractive). Claude delegates via Task tool prompts. Codex delegates via codex exec with projection bundles.
- **state-machine.js**: Manages roundtable confirmation states. tierPaths.light currently excludes PRESENTING_TASKS.

### Constraints
- Must work for both Claude and Codex providers
- Task parsing must be in src/core/ (provider-neutral)
- Must use existing v2.0 task format (no format changes)
- Must be backward compatible — builds without tasks.md still work (agents fall back to self-decomposition)
- Phase 06 Writer/Reviewer/Updater agent team model (Claude only) must be preserved
- Phase 16 dual-track parallel model must be preserved

---

## 5. Quality Attributes and Risks

| Quality Attribute | Priority | Threshold |
|---|---|---|
| Provider neutrality | Critical | Task reader in src/core/ used by both Claude and Codex paths |
| Format compatibility | Critical | Parsed output matches v2.0 EBNF grammar from ORCH-012 |
| Backward compatibility | Critical | Builds without tasks.md still work (agents self-decompose) |
| Parse reliability | High | Malformed tasks.md returns error object, never throws |
| Prompt size impact | Medium | TASK_CONTEXT block adds < 1000 tokens per phase delegation |

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 3e-plan produces inaccurate file paths without design docs | Medium | Medium | Accepted trade-off — less precise but structurally sound. 3e-refine improves later if Phase 04 runs. |
| TASK_CONTEXT increases prompt size beyond context limits | Low | Medium | Format only includes current phase's tasks, not all phases. Summary keeps dependency graph compact. |
| Agent ignores TASK_CONTEXT and self-decomposes anyway | Medium | Low | Agent specs explicitly instruct "read TASK_CONTEXT first." Plan-surfacer ensures tasks.md exists. |
| Task reader parse fails on edge-case formatting | Medium | Low | Error return (not throw). Agent falls back to self-decomposition. Comprehensive test coverage. |

---

## 6. Functional Requirements

### FR-001: 3e-plan Produces File-Level Tasks
**Confidence**: High

Upgrade 3e-plan (ORCH-012) to generate file-level tasks with v2.0 detail for ALL build phases.

- **AC-001-01**: Given no pre-existing tasks.md and design artifacts available, When 3e-plan runs after Phase 01, Then it generates tasks with `files:` sub-lines, `blocked_by:`/`blocks:` dependencies, `[P]` parallel markers, and `| traces:` annotations for all build phases (05, 06, 16, 08)
- **AC-001-02**: Given no pre-existing tasks.md and NO design artifacts (light workflow), When 3e-plan runs after Phase 01, Then it derives file paths from requirements-spec.md and impact-analysis.md, producing the same v2.0 format with best-effort file paths
- **AC-001-03**: Given the generated tasks, When dependency ordering is computed, Then no circular dependencies exist
- **AC-001-04**: Given the generated tasks, When traceability is computed, Then at least 80% of FRs have at least one task with matching `| traces:` annotation

### FR-002: Light Analysis Includes Task Breakdown
**Confidence**: High

Fix the light analysis path so the roundtable presents a task breakdown even without architecture/design phases.

- **AC-002-01**: Given a light analysis, When the roundtable confirmation sequence runs, Then `PRESENTING_TASKS` is NOT skipped — the roundtable derives tasks from requirements + impact analysis
- **AC-002-02**: Given the light-generated task breakdown, When presented, Then the summary shows task count, phase breakdown, files affected, and traceability coverage
- **AC-002-03**: Given the user accepts, Then `tasks.md` is included in the batch write

### FR-003: Phase 05 Consumes tasks.md (Test Strategy)
**Confidence**: High

The test-design-engineer agent reads tasks.md and generates one test case per implementation task.

- **AC-003-01**: Given `docs/isdlc/tasks.md` with file-level tasks, When Phase 05 starts, Then the agent reads and parses the v2.0 format, extracting its Phase 05 section tasks
- **AC-003-02**: Given the parsed task list, When test cases are designed, Then each implementation task (TNNNN) from Phase 06 maps to exactly one test case with the task's `| traces:` carried forward
- **AC-003-03**: Given the test cases, When test-strategy.md is written, Then it includes a task-to-test traceability table (Task ID, File Under Test, Test File, FR/AC traces, Scenario count)
- **AC-003-04**: Given tasks.md is absent when Phase 05 starts, Then plan-surfacer blocks and the phase-loop retries (per FR-005/FR-006)
- **AC-003-05**: Given the Claude provider, When Phase 05 runs, Then the test-design-engineer agent receives task context in its delegation prompt and generates test cases per task within the debate loop
- **AC-003-06**: Given the Codex provider, When Phase 05 runs, Then the projection layer includes task context in the instruction bundle for the debate-test-strategy team instance

### FR-004: Build-Init Copy With Retry
**Confidence**: High

When a build starts and tasks.md exists in the artifact folder, copy it to docs/isdlc/tasks.md with retry on failure.

- **AC-004-01**: Given `docs/requirements/{slug}/tasks.md` exists, When build init runs, Then it copies to `docs/isdlc/tasks.md` and logs success
- **AC-004-02**: Given the copy fails, Then the phase-loop retries up to 3 times before escalating
- **AC-004-03**: Given the copy succeeds with matching slug in header, When 3e-plan checks, Then it skips generation

### FR-005: Retry on Task Generation Failure
**Confidence**: High

If task generation fails, retry instead of silent fallback.

- **AC-005-01**: Given task generation fails in the roundtable, Then it retries up to 2 times before skipping PRESENTING_TASKS and setting `meta.task_breakdown_generated = false`
- **AC-005-02**: Given 3e-plan fails, When plan-surfacer detects missing tasks.md, Then the phase-loop re-delegates to 3e-plan (up to 3 retries)
- **AC-005-03**: Given all retries exhausted, Then the user gets options: [R] Retry, [S] Skip (agents fall back to self-decomposition), [C] Cancel

### FR-006: Plan-Surfacer Blocks Phase 05
**Confidence**: High

Update plan-surfacer to require tasks.md before Phase 05.

- **AC-006-01**: Given EARLY_PHASES in plan-surfacer.cjs, When updated, Then `05-test-strategy` is removed
- **AC-006-02**: Given Phase 05 delegated without tasks.md, Then plan-surfacer blocks with "PLAN REQUIRED: tasks.md must exist before Phase 05"
- **AC-006-03**: Given the block, Then the phase-loop follows 3f-retry-protocol to generate via 3e-plan

### FR-007: Consumption Pattern Contract
**Confidence**: High

Define the standard consumption contract for all phase agents.

- **AC-007-01**: Given any phase agent consuming tasks.md, Then it follows: (1) read docs/isdlc/tasks.md, (2) parse v2.0 format, (3) extract tasks for its phase section, (4) execute phase-specific logic per task, (5) report completion per task
- **AC-007-02**: Given Phase 05 implements the contract, Then it serves as the reference implementation for Phases 06, 16, and 08
- **AC-007-03**: Given a format change to tasks.md, Then only the parse step needs updating
- **AC-007-04**: Given the task reader, When implemented, Then it lives in `src/core/tasks/` as a provider-neutral module
- **AC-007-05**: Given the Claude provider, When a phase is delegated, Then the phase-loop injects parsed task context into the delegation prompt
- **AC-007-06**: Given the Codex provider, When projection builds the instruction bundle, Then it includes parsed task context from the same src/core/tasks/ module

### FR-008: Phase 06 Consumes tasks.md (Implementation)
**Confidence**: High

The software-developer agent reads tasks.md to determine execution order within the Writer/Reviewer/Updater loop.

- **AC-008-01**: Given file-level Phase 06 tasks, When Phase 06 starts, Then the agent orders execution by `blocked_by` dependency chains
- **AC-008-02**: Given a task with multiple `files:` entries, When the Writer executes, Then it follows the per-file loop within the scope of that task
- **AC-008-03**: Given a `[P]` task with no unresolved `blocked_by`, Then it can execute concurrently with other `[P]` tasks
- **AC-008-04**: Given each task's `| traces:`, When the Writer produces a file, Then WRITER_CONTEXT includes the task's FR/AC traces for the Reviewer
- **AC-008-05**: Given Phase 05's task-to-test mapping, When implementing a task, Then the Writer uses the mapped test file for TDD ordering
- **AC-008-06**: Given task completion, When all files are produced and reviewed, Then the agent marks the task `[X]`
- **AC-008-07**: Given the Claude provider, When Phase 06 runs, Then the Writer/Reviewer/Updater agent team receives per-task context via WRITER_CONTEXT
- **AC-008-08**: Given the Codex provider, When Phase 06 runs, Then the implementation-review-loop team instance receives task ordering and file targets via the projection bundle

### FR-009: Phase 16 Consumes tasks.md (Quality Loop)
**Confidence**: High

The quality-loop-engineer reads tasks.md to structure verification across both parallel tracks.

- **AC-009-01**: Given completed Phase 06 tasks, When Phase 16 starts, Then the agent parses all tasks and extracts file paths and traces
- **AC-009-02**: Given Track A (Testing), When coverage is analysed, Then the agent verifies each task's files have corresponding test files
- **AC-009-03**: Given Track B (Automated QA), When traceability runs, Then the agent cross-references traces against requirements-spec.md
- **AC-009-04**: Given any task marked `[X]` but with no file changes, Then Track B flags a completion gap
- **AC-009-05**: Given fan-out active for Track A, When chunks are split, Then tasks.md file paths inform grouping
- **AC-009-06**: Given the Claude provider, When Phase 16 runs, Then both tracks receive task context in delegation prompts
- **AC-009-07**: Given the Codex provider, When Phase 16 runs, Then the dual-track orchestrator passes task context via executeParallel()

### FR-010: Phase 08 Consumes tasks.md (Code Review)
**Confidence**: High

The QA-engineer reads tasks.md to structure code review by task units.

- **AC-010-01**: Given completed Phase 06 tasks, When Phase 08 starts, Then the agent structures review by task unit
- **AC-010-02**: Given each task's `files:` sub-lines, Then the agent reviews those files as a cohesive change
- **AC-010-03**: Given traces annotations, Then each finding in code-review-report.md includes task ID and FR/AC traces
- **AC-010-04**: Given fan-out active, Then task units are the grouping unit, falling back to directory when task count < min_files_threshold
- **AC-010-05**: Given the Claude provider, When Phase 08 runs, Then the QA-engineer receives task-structured review units in its delegation prompt
- **AC-010-06**: Given the Codex provider, When Phase 08 runs, Then the projection bundle includes task-structured review units

### FR-011: Provider-Neutral Task Reader Module
**Confidence**: High

A shared module in src/core/tasks/ that reads and parses tasks.md.

- **AC-011-01**: Given docs/isdlc/tasks.md exists, When readTaskPlan() is called, Then it returns a structured TaskPlan object with phases, tasks, and summary
- **AC-011-02**: Given each parsed task, Then it contains: id, description, files, blockedBy, blocks, parallel, traces, status
- **AC-011-03**: Given docs/isdlc/tasks.md does not exist, When readTaskPlan() is called, Then it returns null
- **AC-011-04**: Given malformed content, When parsing fails, Then it returns an error object instead of throwing
- **AC-011-05**: Given the module, When used by the phase-loop (Claude), Then it injects the result as a TASK_CONTEXT block
- **AC-011-06**: Given the module, When used by projection (Codex), Then it includes the result in the instruction bundle

---

## 7. Out of Scope

| Item | Reason |
|---|---|
| Execution tracing per task (#210) | Separate concern — task events/logging |
| Task display modes during build (counter/expanded/phase-only) | Build-time UX from REQ-GH-208 FR-007 |
| Task completion state tracking in phase-loop step 3e.8 | Already implemented |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|---|---|---|---|
| FR-001 | 3e-plan File-Level Tasks | Must Have | Without this, tasks.md lacks detail in fallback scenarios |
| FR-002 | Light Analysis Task Breakdown | Must Have | Ensures tasks.md exists for all analyzed items |
| FR-003 | Phase 05 Consumes tasks.md | Must Have | Prototype consumption — reference for other phases |
| FR-004 | Build-Init Copy With Retry | Must Have | Ensures pre-generated tasks survive to build |
| FR-005 | Retry on Generation Failure | Must Have | No silent fallbacks |
| FR-006 | Plan-Surfacer Blocks Phase 05 | Must Have | Enforces the always-file-level guarantee |
| FR-007 | Consumption Pattern Contract | Must Have | Shared infrastructure for all four phases |
| FR-008 | Phase 06 Consumes tasks.md | Must Have | Core execution — dependency-ordered implementation |
| FR-009 | Phase 16 Consumes tasks.md | Must Have | Verification — coverage and traceability per task |
| FR-010 | Phase 08 Consumes tasks.md | Must Have | Review — task-structured code review |
| FR-011 | Provider-Neutral Task Reader | Must Have | Foundation — both providers depend on it |

---

## Pending Sections

*(none — all sections written)*
