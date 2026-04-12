# Requirements Specification: GH-251 Track 1 — Task-Level Dispatch for test-generate

**Source**: GitHub Issue #251 (Track 1 only — test-generate workflow)
**Analysis Date**: 2026-04-12
**Status**: Analyzed

---

## Functional Requirements

### FR-001: Discover Precondition Gate
**Priority**: Must Have
**Confidence**: High

When a user runs `/isdlc test generate`, the system checks for characterization scaffolds in `tests/characterization/`. If no scaffolds exist, the system blocks workflow initialization and directs the user to run `/discover` first. No workflow is created, no state.json is touched.

**Acceptance Criteria**:

**AC-001-01**: Precondition gate blocks on missing scaffolds
**Given** no files matching `tests/characterization/**/*.characterization.*` exist
**When** the user runs `/isdlc test generate`
**Then** the system displays a message directing the user to run `/discover` first
**And** no `active_workflow` is created in state.json
**And** no branch is created

---

### FR-002: Artifact Folder Creation
**Priority**: Must Have
**Confidence**: High

When the test-generate workflow initializes (scaffolds exist), the system creates an artifact folder following the build convention with meta.json tracking.

**Acceptance Criteria**:

**AC-002-01**: Artifact folder created on workflow init
**Given** characterization scaffolds exist in `tests/characterization/`
**When** the test-generate workflow initializes
**Then** a folder `docs/requirements/TEST-GEN-{slug}/` is created
**And** a `meta.json` file is created with v2 schema, `source: "test-generate"`, `analysis_status: "raw"`
**And** `ARTIFACT_FOLDER` is passed to the orchestrator init prompt

---

### FR-003: Phase 05 Scaffold-to-Tasks Generation
**Priority**: Must Have
**Confidence**: High

Phase 05 (test-design-engineer) detects the test-generate workflow context, reads characterization scaffolds, extracts AC-RE references, classifies each scaffold as unit or system, and emits `docs/isdlc/tasks.md` with one task per scaffold file.

**Acceptance Criteria**:

**AC-003-01**: tasks.md generated from scaffolds
**Given** scaffolds exist in `tests/characterization/{domain}/*.characterization.*`
**When** Phase 05 runs in test-generate mode (WORKFLOW_TYPE: test-generate)
**Then** `docs/isdlc/tasks.md` is emitted with one Phase 06 task per scaffold file
**And** each task's `files:` points to the scaffold path with (MODIFY) operation
**And** each task's `traces:` is populated from `AC-RE-{NNN}` references extracted from the scaffold's comments

---

### FR-004: Test Type Tier Ordering
**Priority**: Must Have
**Confidence**: Medium

Unit test tasks are placed in an earlier execution tier than system test tasks. System test tasks have `blocked_by` edges to all unit test tasks, enforcing unit-first execution order.

**Acceptance Criteria**:

**AC-004-01**: Unit tasks precede system tasks
**Given** tasks.md contains both unit-classified and system-classified scaffold tasks
**When** the tasks are organized into tiers
**Then** all unit test tasks are in tier 0 (parallel within tier)
**And** all system test tasks have `blocked_by` edges referencing every unit test task
**And** system test tasks execute only after all unit test tasks complete

---

### FR-005: Phase 06 Dispatch via Existing 3d-check
**Priority**: Must Have
**Confidence**: High

Phase 06 task dispatch triggers automatically through the existing `shouldUseTaskDispatch()` path without changes to task-dispatcher.js or task-reader.js.

**Acceptance Criteria**:

**AC-005-01**: Existing dispatch fires for test-generate
**Given** `docs/isdlc/tasks.md` exists with >= `min_tasks_for_dispatch` (default 3) pending Phase 06 tasks
**When** Phase 06 begins in the test-generate workflow
**Then** the Phase-Loop Controller's 3d-check calls `shouldUseTaskDispatch()` and receives `true`
**And** 3d-tasks dispatch executes — one scaffold per agent, parallel within tiers
**And** no modifications were made to `task-dispatcher.js` or `task-reader.js`

---

### FR-006: Phase 05 Test Strategy Artifacts
**Priority**: Must Have
**Confidence**: High

Phase 05 writes standard test strategy artifacts to the artifact folder, following the same structure as build Phase 05.

**Acceptance Criteria**:

**AC-006-01**: Standard artifacts written to artifact folder
**Given** Phase 05 completes in test-generate mode
**When** artifacts are written
**Then** `test-strategy.md` exists in the artifact folder
**And** `test-cases/` directory exists in the artifact folder
**And** `traceability-matrix.csv` exists in the artifact folder
**And** artifact structure matches the build Phase 05 output convention

---

## Assumptions and Inferences

| # | Assumption | Trigger | Confidence | Related FRs |
|---|-----------|---------|------------|-------------|
| A1 | Scaffold convention is stable: `tests/characterization/{domain}/{feature}.characterization.ts` with `AC-RE-{NNN}` in comments | Discover characterization-test-generator.md defines this convention | High | FR-001, FR-003 |
| A2 | Classification heuristic is sufficient: Phase 05 can reliably classify scaffolds as unit vs system from content analysis (single function/mock = unit, HTTP/multi-module = system) | No existing type tagging in scaffolds | Medium | FR-004 |
| A3 | Artifact folder naming `TEST-GEN-{slug}` is a working convention | Consistent with build's `REQ-GH-NNN-slug` pattern but distinct prefix | High | FR-002 |
| A4 | Codex serial dispatch within tiers is acceptable | Codex lacks parallel Task tool dispatch | High | FR-005 |

## Non-Functional Requirements

- **NFR-001**: Discover precondition check completes in under 2 seconds (filesystem glob scan only).
- **NFR-002**: No changes to `task-dispatcher.js` or `task-reader.js` — all changes scoped to Phase 05 agent behavior and the `isdlc.md` test-generate handler.

## Out of Scope

- Track 2 (upgrade workflow task dispatch) — separate analysis under GH-251
- Changes to `/discover` or the characterization-test-generator agent
- From-scratch test generation path (no scaffolds) — eliminated by precondition gate (FR-001)

## Prioritization

| FR | Priority | Rationale |
|----|----------|-----------|
| FR-001 | Must Have | Gate prevents broken workflow without scaffolds |
| FR-002 | Must Have | Consistency with build convention for artifact tracking |
| FR-003 | Must Have | Core feature — task generation from scaffolds |
| FR-004 | Must Have | User requirement — unit tests before system tests |
| FR-005 | Must Have | Leverages existing dispatch infrastructure |
| FR-006 | Must Have | Standard artifacts for traceability and quality gates |
