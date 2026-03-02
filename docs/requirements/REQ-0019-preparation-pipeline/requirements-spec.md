# Requirements Specification: REQ-0019 Preparation Pipeline

**Project:** iSDLC Framework
**Feature:** 3.2 Preparation pipeline -- decouple requirements capture from implementation via Phase A (preparation) and Phase B (execution) split
**Version:** 1.0
**Created:** 2026-02-16
**Status:** Approved
**Primary Quality Attribute:** Reliability

---

## 1. Overview

Split the iSDLC workflow lifecycle into two independent phases:

- **Phase A (Preparation)**: Interactive requirements capture that runs OUTSIDE the workflow machinery. No state.json, no hooks, no gates, no branches. Artifacts land in `docs/requirements/{slug}/`. Multiple Phase A sessions can run concurrently, and they can run in parallel with an active Phase B workflow.

- **Phase B (Execution)**: The automated implementation pipeline that starts from Phase 02 (impact analysis), consuming the already-prepared requirements. Creates branch, initializes state.json, runs through all remaining phases.

The key enabler is zero-resource-sharing design -- Phase A writes only to `docs/requirements/{slug}/` (no state.json), while Phase B owns state.json. This eliminates the bottleneck where developers wait idle during implementation.

Additionally, BACKLOG.md gets restructured from a ~650-line inline spec repository to an ~80-line lightweight index with links to `docs/requirements/{slug}/` folders. Intent detection in CLAUDE.md.template enables natural language routing.

---

## 2. Functional Requirements

### FR-001: Phase A Intake

User provides a work item via natural language ("add Jira-1250 to the backlog", "analyze the payment feature", or a manual description). The system creates a lightweight BACKLOG.md entry (one line: ID + title + link to requirements folder) and a `docs/requirements/{slug}/draft.md` containing the source content.

**Acceptance Criteria:**

**AC-001-01**: Given a user says "add Jira-1250 to the backlog", when the system processes the intake, then a one-line entry is appended to BACKLOG.md in the format `- {id} [ ] {title} -> [requirements](docs/requirements/{slug}/)` and the folder `docs/requirements/{slug}/` is created with `draft.md` containing the source content.

**AC-001-02**: Given a user provides a manual description without a ticket reference, when the system processes the intake, then the slug is derived from the description (lowercase, hyphens, max 50 chars) and `draft.md` contains the user-provided description verbatim.

**AC-001-03**: Given `docs/requirements/{slug}/` already exists, when the user runs intake for the same item, then the system detects the existing folder and asks "This item already has a draft. Update it or skip?" rather than overwriting silently.

---

### FR-002: Phase A Deep Analysis (Optional)

After intake, the system offers: "Want me to do a deep analysis and keep it ready for implementation?" If yes, runs quick scan (Phase 00 logic) and full requirements capture with personas (Phase 01 logic) -- producing `quick-scan.md` and `requirements.md` in the same folder. All without state.json, hooks, gates, or branches.

**Acceptance Criteria:**

**AC-002-01**: Given the user accepts the deep analysis offer after intake, when the system runs analysis, then `quick-scan.md` is written to the requirements folder containing codebase scope estimate, keyword matches, and estimated file count.

**AC-002-02**: Given the user accepts the deep analysis offer, when requirements capture completes, then `requirements.md` is written to the folder containing FRs with IDs, ACs in Given/When/Then format, NFRs with measurable metrics, and user stories -- all produced through the persona-based elicitation flow.

**AC-002-03**: Given the user declines the deep analysis offer, when intake completes, then only `draft.md` and `meta.json` exist in the folder, `meta.json.phase_a_completed` is `false`, and no quick-scan or requirements artifacts are produced.

**AC-002-04**: Given the deep analysis is running, when any step executes, then no writes occur to `.isdlc/state.json`, no hook stdin/stdout traffic is generated, no git branches are created, and no gate validations are triggered.

---

### FR-003: Source-Agnostic Intake

The intake step works identically regardless of source: Jira (via MCP), GitHub Issues (via `gh`), manual description, or existing BACKLOG.md migration.

**Acceptance Criteria:**

**AC-003-01**: Given a Jira ticket URL is provided and the Jira MCP server is available, when the system runs intake, then the ticket summary, description, and linked Confluence page content are pulled and written to `draft.md` with source attribution.

**AC-003-02**: Given a GitHub issue URL is provided and `gh` CLI is authenticated, when the system runs intake, then the issue title, body, and labels are pulled and written to `draft.md` with source attribution.

**AC-003-03**: Given a plain text description is provided without any ticket reference, when the system runs intake, then `draft.md` is created with the description and `meta.json.source` is set to `"manual"`.

**AC-003-04**: Given an existing BACKLOG.md item with inline spec is being migrated, when the system runs intake, then the inline spec content moves to `docs/requirements/{slug}/draft.md`, the BACKLOG.md line is replaced with an index entry linking to the folder, and the original spec content is removed from BACKLOG.md.

---

### FR-004: Phase A Meta Tracking

Each requirements folder contains `meta.json` with: `{ source, source_id, slug, created_at, phase_a_completed, codebase_hash }`. The `codebase_hash` enables staleness detection in Phase B.

**Acceptance Criteria:**

**AC-004-01**: Given Phase A intake completes, when `meta.json` is written, then it contains all required fields: `source` (string: "jira"|"github"|"manual"|"backlog-migration"), `source_id` (string or null), `slug` (string), `created_at` (ISO-8601), `phase_a_completed` (boolean), and `codebase_hash` (string).

**AC-004-02**: Given the deep analysis completes successfully, when `meta.json` is updated, then `phase_a_completed` is set to `true` and `codebase_hash` is set to the current git HEAD short SHA.

**AC-004-03**: Given only intake (no deep analysis) was performed, when `meta.json` is written, then `phase_a_completed` is `false` and `codebase_hash` is the git HEAD short SHA at time of intake.

---

### FR-005: Phase B Consumption

When user says "start {item}" or "let's work on {item}", the system locates the matching requirements folder, validates preparation completeness, performs staleness check, and starts the workflow from Phase 02.

**Acceptance Criteria:**

**AC-005-01**: Given a user says "start {item}" and a matching `docs/requirements/{slug}/` folder exists with `meta.json.phase_a_completed == true`, when the system initiates Phase B, then a branch is created, state.json is initialized with `active_workflow`, and the workflow starts at Phase 02 (impact analysis), skipping Phases 00 and 01.

**AC-005-02**: Given a user says "start {item}" and no matching requirements folder exists, when the system attempts Phase B, then it reports "No prepared requirements found for '{item}'. Run intake first or use /isdlc feature to start from scratch." and does not create a branch or initialize state.json.

**AC-005-03**: Given a user says "start {item}" and `meta.json.phase_a_completed == false`, when the system attempts Phase B, then it reports "Requirements for '{item}' are incomplete (draft only, no deep analysis). Complete Phase A first or use /isdlc feature to start from scratch." and does not proceed.

**AC-005-04**: Given `meta.json.codebase_hash` differs from current git HEAD short SHA by more than 10 commits, when Phase B is initiated, then the system warns "Codebase has changed significantly since requirements were captured ({N} commits). Recommend refreshing requirements." and offers: [P] Proceed anyway, [R] Refresh requirements, [C] Cancel.

**AC-005-05**: Given the user selects [P] Proceed anyway on a staleness warning, when Phase B continues, then the staleness acknowledgment is logged in the workflow's `active_workflow` metadata and the workflow proceeds from Phase 02.

**AC-005-06**: Given Phase B starts from Phase 02, when the impact analysis agent reads requirements, then it reads from `docs/requirements/{slug}/requirements.md` (the Phase A artifact) rather than expecting artifacts in the usual workflow artifact path.

---

### FR-006: Phase B Artifact Folder Unification

Phase B writes all subsequent artifacts into the same `docs/requirements/{slug}/` folder alongside the Phase A artifacts.

**Acceptance Criteria:**

**AC-006-01**: Given Phase B is running for a prepared item, when any phase agent produces artifacts (impact-analysis.md, architecture.md, test-strategy.md, etc.), then those artifacts are written to the same `docs/requirements/{slug}/` folder alongside the Phase A artifacts.

**AC-006-02**: Given Phase B completes all phases, when the workflow finalizes, then the `docs/requirements/{slug}/` folder contains the complete artifact chain: `draft.md`, `quick-scan.md`, `requirements.md`, `meta.json`, `impact-analysis.md`, and all subsequent phase artifacts.

---

### FR-007: BACKLOG.md Restructure

Transform BACKLOG.md from a ~650-line inline spec repository to an ~80-line lightweight index.

**Acceptance Criteria:**

**AC-007-01**: Given the BACKLOG.md restructure is executed, when the migration completes, then BACKLOG.md contains only index entries (one line per item: ID, checkbox, title, link to requirements folder) and section headings, with a total line count under 120 lines.

**AC-007-02**: Given an inline spec exists in BACKLOG.md for an open item, when that item is migrated, then its full spec content is moved to `docs/requirements/{slug}/draft.md` and the BACKLOG.md line becomes an index entry with a relative link.

**AC-007-03**: Given a completed item exists in BACKLOG.md, when migration runs, then completed items are preserved as one-line entries with `[x]` checkbox and completion date, with no inline spec (inline specs, if any, move to the requirements folder).

---

### FR-008: Intent Detection in CLAUDE.md.template

Add natural language patterns to `src/claude/CLAUDE.md.template` and the dogfooding project's `CLAUDE.md`.

**Acceptance Criteria:**

**AC-008-01**: Given `src/claude/CLAUDE.md.template` is updated, when a user says "add {ticket} to the backlog" in a project using iSDLC, then the intent is routed to the Phase A intake flow without the user needing to know about `/isdlc` commands.

**AC-008-02**: Given `src/claude/CLAUDE.md.template` is updated, when a user says "analyze {description}" or "analyze {ticket}", then the intent is routed to Phase A intake + deep analysis (FR-001 + FR-002).

**AC-008-03**: Given `src/claude/CLAUDE.md.template` is updated, when a user says "start {item}" or "let's work on {item}", then the intent is routed to Phase B consumption (FR-005).

**AC-008-04**: Given the dogfooding project's `CLAUDE.md`, when updated, then it contains matching intent detection patterns that mirror `CLAUDE.md.template` so this project itself uses the preparation pipeline.

---

### FR-009: Documentation Updates

Update framework documentation to explain the preparation pipeline.

**Acceptance Criteria:**

**AC-009-01**: Given the feature is implemented, when documentation is reviewed, then there exists clear documentation explaining the Phase A / Phase B split, the requirements folder structure, and example UX flows.

**AC-009-02**: Given the documentation is updated, when a new user reads it, then they can understand how to use natural language intake ("add X to the backlog"), deep analysis ("analyze X"), and execution ("start X") without reading source code.

---

## 3. Non-Functional Requirements

### NFR-001: Reliability (PRIMARY)

Phase B must never silently consume stale or incomplete Phase A artifacts. If `meta.json` is missing, malformed, or `phase_a_completed` is false, Phase B must fail with a clear error message and actionable guidance. Zero silent failures.

**Acceptance Criteria:**

**AC-NFR-001-01**: Given `meta.json` is missing from a requirements folder, when Phase B attempts consumption, then it fails with error "Missing meta.json in docs/requirements/{slug}/. Cannot verify preparation status. Run Phase A first." and does not initialize a workflow.

**AC-NFR-001-02**: Given `meta.json` exists but is malformed JSON, when Phase B attempts consumption, then it fails with error "Corrupted meta.json in docs/requirements/{slug}/. Cannot parse preparation metadata. Re-run Phase A." and does not initialize a workflow.

**AC-NFR-001-03**: Given `meta.json` is valid but `phase_a_completed` is missing (field absent), when Phase B attempts consumption, then it treats the missing field as `false` and blocks with the incomplete-preparation message (AC-005-03).

**AC-NFR-001-04**: Given `meta.json.codebase_hash` is null or empty, when Phase B attempts consumption, then it treats the requirements as stale (worst-case assumption) and presents the staleness warning (AC-005-04).

**AC-NFR-001-05**: Given `requirements.md` is referenced in `meta.json` but the file does not exist on disk, when Phase B attempts consumption, then it fails with error "requirements.md missing from docs/requirements/{slug}/ despite meta.json indicating completion. Re-run Phase A deep analysis." and does not proceed.

**AC-NFR-001-06**: Given Phase A is interrupted mid-execution (user cancels, session crashes), when the folder is inspected, then `meta.json.phase_a_completed` remains `false` (it is only set to `true` as the final step), preventing Phase B from consuming incomplete artifacts.

**AC-NFR-001-07**: Given Phase B is consuming prepared requirements, when any validation check fails (missing meta, malformed meta, incomplete preparation, missing requirements.md), then the error message includes the specific file path, what is wrong, and the remediation command.

---

### NFR-002: Zero Resource Contention

Phase A must not read or write state.json, must not invoke hooks, must not create git branches, and must not set gates.

**Acceptance Criteria:**

**AC-NFR-002-01**: Given Phase A is running and an active Phase B workflow exists in state.json, when Phase A executes any step, then it makes zero reads from and zero writes to `.isdlc/state.json`.

**AC-NFR-002-02**: Given Phase A is running, when any step executes, then no files under `.isdlc/` are read or written except the requirements folder under `docs/requirements/`.

**AC-NFR-002-03**: Given Phase A is running, when any step executes, then no git branch operations (create, checkout, commit) are performed -- all work happens on whatever branch is currently checked out.

---

### NFR-003: Idempotent Intake

Running Phase A intake twice for the same item must not corrupt or duplicate data.

**Acceptance Criteria:**

**AC-NFR-003-01**: Given `docs/requirements/{slug}/` already exists with `draft.md`, when intake is run for the same item a second time, then the system asks "This item already has a draft. Update it or skip?" and does not overwrite without confirmation.

**AC-NFR-003-02**: Given the user confirms update on re-intake, when the update completes, then `draft.md` is overwritten with fresh content, `meta.json.created_at` is preserved (not reset), and a new field `meta.json.updated_at` is set to the current timestamp.

---

### NFR-004: Graceful Degradation on Source Unavailability

If Jira MCP or GitHub `gh` is unavailable during intake, the system falls back to manual description entry.

**Acceptance Criteria:**

**AC-NFR-004-01**: Given a Jira ticket URL is provided but the Jira MCP server is unavailable, when intake is attempted, then the system reports "Jira MCP unavailable. Please paste the ticket description manually." and falls back to manual intake.

**AC-NFR-004-02**: Given a GitHub issue URL is provided but `gh` CLI is not authenticated or unavailable, when intake is attempted, then the system reports "GitHub CLI unavailable or not authenticated. Please paste the issue description manually." and falls back to manual intake.

---

## 4. User Stories

### US-001
**As a** developer, **I want to** prepare requirements for the next work item while implementation runs on the current one, **so that** I stay productive during the 10-30 minute autonomous execution window.

### US-002
**As a** developer, **I want to** say "add Jira-1250 to the backlog" and have the system pull the ticket content and create a draft, **so that** I don't manually copy-paste between tools.

### US-003
**As a** developer, **I want to** say "start Jira-1250" and have the system find the prepared requirements and begin implementation from Phase 02, **so that** I skip redundant requirements capture.

### US-004
**As a** developer, **I want to** be warned if requirements are stale (codebase changed since Phase A), **so that** I don't implement against outdated assumptions.

### US-005
**As a** developer, **I want** BACKLOG.md to be a scannable index rather than a 650-line spec repository, **so that** I can quickly find and prioritize work items.

### US-006
**As a** developer, **I want** framework docs updated to explain the preparation pipeline, **so that** future users (and my future self) understand the new workflow.

### US-007
**As a** developer, **I want** Phase A to run without state.json or hooks, **so that** it never conflicts with an active Phase B workflow.

---

## 5. Constraints

1. No new agents needed -- reuses existing requirements-analyst with personas
2. No hook changes -- Phase A runs outside hook enforcement
3. No state.json schema changes -- Phase B uses existing `active_workflow` structure
4. Phase A and Phase B share zero resources (by design)
5. Framework is pre-release, single user -- no backward compatibility constraints

---

## 6. Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/claude/commands/isdlc.md` | Modify | New SCENARIO for analyze command, Phase B consumption logic in phase-loop STEP 3 |
| `src/claude/CLAUDE.md.template` | Modify | Intent detection patterns for intake/analyze/start |
| `CLAUDE.md` (project root) | Modify | Mirror intent patterns for dogfooding |
| `BACKLOG.md` | Restructure | Migrate from inline specs to lightweight index |

---

## 7. Metrics Summary

- **9** Functional Requirements (FR-001 through FR-009)
- **4** Non-Functional Requirements (NFR-001 through NFR-004)
- **7** User Stories (US-001 through US-007)
- **35** Acceptance Criteria (25 functional + 10 non-functional)
- **Primary Quality Attribute**: Reliability (NFR-001, 7 ACs)
