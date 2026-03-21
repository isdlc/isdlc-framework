# Requirements Specification: Execution Observability

**ID**: REQ-0068
**Source**: GitHub Issue #128
**Status**: Analyzed
**Labels**: hackability, user-experience

---

## 1. Business Context

iSDLC tracks extensive execution data in state.json and hook logs — phases run, hooks blocked, iterations used, artifacts produced, coverage metrics, constitutional compliance status — but none of it is surfaced to the user in a consumable form. Understanding what happened during a workflow requires reading raw JSON. The completion dashboard (REQ-0022) renders timing and budget after workflow completion, but provides no mid-workflow visibility, no historical query, and no visual representation.

**Success metric**: Users can see what's happening during a workflow and review what happened in past workflows without reading state.json.

**Driving factor**: Inspired by Arcturus "Runs" — execution graph showing agent tasks, intermediate outputs, and orchestration state. Adapted for iSDLC's CLI-first, phase-based workflow model.

---

## 2. Stakeholders and Personas

### Primary User: Developer using iSDLC
- **Role**: Runs iSDLC workflows (feature, fix, upgrade, test) on their codebase
- **Goals**: Understand workflow progress, identify slow phases, review past execution, tune gate profiles with data
- **Pain points**: Current task list shows phase names but no timing, no sub-agent visibility, no hook events. Completion dashboard is timing-only and ephemeral

---

## 3. User Journeys

### Journey 1: Monitoring an active workflow
- **Entry**: User starts a build workflow
- **Flow**: As phases complete, enriched CLI output shows timing, iterations, coverage per phase. If `live_dashboard: true` in CLAUDE.md, browser opens with a live DAG visualization showing phase and sub-agent nodes updating in real-time
- **Exit**: Workflow completes, completion dashboard shows full summary

### Journey 2: Reviewing a past workflow
- **Entry**: User says `/isdlc status -inline REQ-0066` or `/isdlc status -visual #125`
- **Flow**: System resolves the identifier, finds the workflow in history, renders structured report (CLI) or opens browser with DAG visualization (visual)
- **Exit**: User has full picture of what happened — timing, sub-agents, hook events, coverage, artifacts

### Journey 3: Quick status check
- **Entry**: User says `/isdlc status` with no arguments and no active workflow
- **Flow**: System shows summary of last 5 workflows with status, duration, coverage
- **Exit**: User picks one to drill into or moves on

---

## 4. Technical Context

- **Existing data**: `workflow_history[]`, `phase_snapshots[]`, `skill_usage_log[]`, per-phase timing (REQ-0022), test/coverage metrics, code review findings all captured in state.json
- **Existing presentation**: Completion dashboard (`formatCompletionDashboard()` in `performance-budget.cjs`), Phase-Loop Controller task list
- **Gaps**: No sub-agent tracking, no hook event history, no artifact inventory, no browser visualization, no historical query
- **Constraints**: Node.js 20+ required (already a prerequisite). No external dependencies for the dashboard. CLI-first — browser is additive

---

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Performance | Critical | Dashboard must not block or slow workflow execution (NFR-001) |
| Portability | High | Works on macOS, Linux, Windows; browser visual works offline (NFR-003) |
| Simplicity | High | Zero new npm dependencies (NFR-002) |
| Configurability | High | Display level configurable via CLAUDE.md |
| Graceful degradation | Medium | Historical workflows without new tracking data show phase-level only |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hand-rolled SVG layout breaks with complex DAGs (>20 nodes) | Low | Medium | Assumption A1: introduce dagre.js as fallback if needed |
| Port conflict on localhost | Low | Low | Try ports 3456-3460, report chosen port |
| state.json concurrent write corruption from hook_events | Low | High | Assumption A3: verify atomic writeState() in common.cjs |
| Token usage per sub-agent unavailable from Task tool | Medium | Low | Assumption RA6: show when available, omit when not |

---

## 6. Functional Requirements

### FR-001: Enriched CLI output during workflows
**Confidence**: High

- **AC-001-01**: Given `display_level: standard` in CLAUDE.md, when a phase completes, then the CLI shows phase name, wall-clock duration, and iteration count
- **AC-001-02**: Given `display_level: detailed`, when a phase completes, then the CLI additionally shows sub-agent breakdown, hook events encountered, and artifacts produced
- **AC-001-03**: Given `display_level: minimal` or no `## Observability` section, when a phase completes, then current behavior is preserved (task list only)
- **AC-001-04**: Given no `## Observability` section in CLAUDE.md, when a workflow starts, then `display_level` defaults to `standard`

### FR-002: Live browser dashboard
**Confidence**: High

- **AC-002-01**: Given `live_dashboard: true` in CLAUDE.md, when a workflow starts, then a local HTTP server starts and the browser opens to the dashboard URL
- **AC-002-02**: Given an active workflow, when the browser polls `/api/state`, then it receives current phase status, sub-agent status, timing, and hook events
- **AC-002-03**: Given a phase completes during a workflow, when the browser polls within 2 seconds, then the corresponding DAG node transitions from running to completed with timing displayed
- **AC-002-04**: Given the dashboard server is running, when the workflow completes, then the server auto-stops (if auto-started) and the browser shows the final state
- **AC-002-05**: Given `live_dashboard: false` or missing, when a workflow starts, then no server starts and no browser opens

### FR-003: Status command — inline mode
**Confidence**: High

- **AC-003-01**: Given `/isdlc status -inline REQ-0066`, when the command executes, then it resolves the identifier and renders a structured CLI report with phase timeline, sub-agent tree, hook events, coverage, and artifacts
- **AC-003-02**: Given `/isdlc status -inline #125`, when the command executes, then it resolves the GitHub issue to the corresponding workflow in history
- **AC-003-03**: Given `/isdlc status -inline last`, when the command executes, then it shows the most recently completed workflow
- **AC-003-04**: Given a workflow completed before this feature shipped (no sub_agent_log), when status is requested, then it shows phase-level data only without error

### FR-004: Status command — visual mode
**Confidence**: High

- **AC-004-01**: Given `/isdlc status -visual REQ-0066`, when the command executes, then it starts the dashboard server and opens the browser showing that workflow's DAG
- **AC-004-02**: Given an active workflow, when `/isdlc status -visual` is run from a second terminal, then the browser shows the live updating view
- **AC-004-03**: Given no matching workflow found, when status is requested, then it displays "No matching workflow found" and lists recent workflows

### FR-005: Sub-agent visibility in DAG
**Confidence**: High

- **AC-005-01**: Given a phase with sub-agents (e.g., Impact Analysis), when rendered in the DAG, then the phase shows as a group with child nodes for each sub-agent (M1, M2, M3, M4)
- **AC-005-02**: Given a phase without sub-agents (e.g., Requirements), when rendered in the DAG, then it shows as a single node
- **AC-005-03**: Given sub-agent topology defined in phase-topology.json, when a new sub-agent is added to a phase, then updating the config file is sufficient to reflect it in the visualization
- **AC-005-04**: Given a sub-agent is running, when the browser polls, then that node shows blue with pulse animation; when completed, green; when failed, red

### FR-006: State tracking enhancements
**Confidence**: High

- **AC-006-01**: Given a phase agent delegates to a sub-agent via Task tool, when the delegation occurs, then a `sub_agent_log` entry is appended with parent_agent, agent, phase, started_at
- **AC-006-02**: Given a sub-agent completes, when the Task result returns, then the `sub_agent_log` entry is updated with completed_at, status, and tokens_used (if available)
- **AC-006-03**: Given a hook blocks an action, when the block occurs, then a `hook_events` entry is appended with timestamp, hook name, phase, action, reason
- **AC-006-04**: Given a workflow completes, when `collectPhaseSnapshots()` runs, then `sub_agent_log`, `hook_events`, and `artifacts_produced` are preserved in the `workflow_history` entry

---

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Intervention (pause/message/reassign mid-workflow) | Separate ticket — requires different interaction model | Creates separate GH issue |
| Re-run / replay (re-execute a single phase from history) | Complex state management, not needed for observability | Future feature |
| Hackable report formats (custom formatters, export to Grafana) | Deferred to follow-up hackability feature | GH #130 (diagnostics dashboard) |
| WebSocket for real-time updates | Polling at 2s is sufficient for phase-level granularity | Reconsider if sub-second updates needed |
| Multi-workflow dashboard | Single active workflow constraint (backlog #30) | Parallel workflow support |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Enriched CLI output | Must Have | Default experience for all users, no dependencies |
| FR-002 | Live browser dashboard | Must Have | Core visual feature, primary differentiator |
| FR-003 | Status inline | Must Have | Historical review without browser |
| FR-004 | Status visual | Should Have | Depends on FR-002 infrastructure |
| FR-005 | Sub-agent visibility | Must Have | Key user requirement — phase-level alone isn't enough |
| FR-006 | State tracking | Must Have | Data foundation for FR-001 through FR-005 |

---

## Requirements Assumptions

| # | Assumption | Impact if wrong | Resolution |
|---|-----------|----------------|------------|
| RA1 | Users have a modern browser available on their development machine | Browser dashboard (FR-002, FR-004) unusable for headless/SSH environments | CLI inline mode (FR-001, FR-003) is always available as full-featured fallback |
| RA2 | Existing completion dashboard (REQ-0022) is replaced by enriched CLI, not run alongside | Users depending on current format get different output | Keep current dashboard as `display_level: minimal` |
| RA3 | `/isdlc status` replaces the existing basic status handler | Users expecting old behavior get different output | New command is a superset — basic info included |
| RA4 | `-inline` and `-visual` flags accept any identifier format | Requires same resolution logic as analyze/build | Reuse `resolveItem()` from three-verb-utils.cjs |
| RA5 | Sub-agent data unavailable for pre-existing workflows | Historical views show phase-level only | Degrade gracefully, no backfill |
| RA6 | Token/cost per sub-agent may not be available from Task tool | FR-005 token display incomplete | Show when available, omit when not |
| RA7 | `## Observability` section is new — no existing projects have it | Users won't get enriched output until added | Default to `standard` when section missing |
| RA8 | Intervention is cleanly separable | Dashboard UI may need retrofit later | Reserve panel area in layout for future controls |
