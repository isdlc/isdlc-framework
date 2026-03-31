# Requirements Specification: Bug-Specific Roundtable Analysis in Analyze Command

**Slug**: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
**Source**: GitHub Issue #218
**Type**: Enhancement
**Version**: 1.0.0

---

## 1. Business Context

### Problem Statement

When a ticket is classified as a bug, the analyze command uses the `bug-gather-analyst` inline protocol — a lightweight Q&A flow that produces `bug-report.md` and `requirements-spec.md`. Feature tickets get the full roundtable conversation (Maya/Alex/Jordan) with rich multi-domain analysis, four-domain confirmation, task list generation, and seamless build handoff.

Bugs deserve equal analytical depth with outputs tailored to diagnosis: root cause analysis via tracing sub-agents, fix strategy options, and a structured task list — all confirmed by the user before an automatic build kickoff.

### Stakeholders

- **Framework users**: Get deeper bug analysis with root cause hypotheses, fix strategy options, and a reviewable task plan before any code changes
- **Maya (Business Analyst)**: Owns bug summary, severity classification, reproduction steps, affected user journeys
- **Alex (Solutions Architect)**: Owns root cause investigation via T1/T2/T3 tracing sub-agents, blast radius, affected code paths
- **Jordan (System Designer)**: Owns fix strategy options, interface/contract implications, regression risk assessment

### Success Metrics

- Bug analysis produces 4 artifacts: bug-report.md, root-cause-analysis.md, fix-strategy.md, tasks.md
- User reviews and accepts/amends each domain before artifacts are written
- Build phase kicks off automatically after acceptance, starting at Phase 05

### Driving Factors

- Feature roundtable (REQ-0027) established the multi-persona conversation pattern
- GH-208 established task list generation as the 4th confirmation domain
- GH-212 established task consumption by build phase agents
- REQ-0061 established the bug classification gate and bug-gather protocol (now being replaced)

---

## 2. Stakeholders and Personas

### Framework User
- **Role**: Developer using iSDLC to fix bugs
- **Goals**: Understand root cause before committing to a fix, review fix strategy options, see the implementation plan
- **Pain Points**: Current lightweight bug-gather flow misses root cause analysis and doesn't produce a task plan

---

## 3. User Journeys

### Journey 1: Bug Analysis → Build
- **Entry**: User runs `/isdlc analyze "#218"` or describes a bug
- **Flow**: Bug classification gate identifies bug → Maya opens with structured summary → conversation with clarifying questions → bug-report.md written → tracing sub-agents (T1/T2/T3) run → Alex presents root cause → Jordan proposes fix strategy → 4-domain confirmation → artifacts written → build kicks off at Phase 05
- **Exit**: Build workflow completes with fix implemented and reviewed

### Journey 2: Bug Analysis → Defer
- **Entry**: User analyzes a bug but decides not to fix immediately
- **Flow**: Same as Journey 1 through confirmation → user declines build kickoff
- **Exit**: Artifacts preserved on disk for later `/isdlc build "{slug}"`

---

## 4. Technical Context

### Existing Infrastructure
- **Bug classification gate**: `isdlc.md` step 6.5a-b classifies tickets as bug or feature
- **Bug-gather protocol**: `bug-gather-analyst.md` — lightweight Q&A, produces 2 artifacts (being replaced)
- **Feature roundtable**: `roundtable-analyst.md` — Maya/Alex/Jordan conversation with 4-domain confirmation
- **Tracing orchestrator**: `tracing-orchestrator.md` — fans out T1/T2/T3 in parallel, produces `trace-analysis.md`
- **Confirmation templates**: `src/claude/hooks/config/templates/` — JSON templates for domain confirmations
- **Task reader**: `src/core/tasks/task-reader.js` — parses tasks.md for build phase agent consumption (GH-212)

### Constraints
- Must work for both Claude and Codex providers
- Tracing sub-agents (T1/T2/T3) are reused without modification
- Bug roundtable uses existing persona files — no new persona definitions
- Analysis flow is inline (no state.json writes, no branches, no hooks)

---

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Consistency | High | Bug analysis flow mirrors feature flow structure |
| Reuse | High | Tracing sub-agents, persona files, task template reused as-is |
| Fail-safe | High | Tracing delegation failure must not block analysis (Article X) |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tracing-orchestrator reads state.json for discovery status | High | Medium | Pass discovery context in delegation prompt, add ANALYSIS_MODE flag |
| Task list format doesn't match GH-212 consumption conventions | Medium | High | Use tasks.template.json, include traceability matrix |

---

## 6. Functional Requirements

### FR-001: Bug roundtable conversation

**Confidence**: High

When a ticket is classified as a bug in the analyze handler (step 6.5), launch a bug-specific roundtable conversation with Maya/Alex/Jordan instead of the lightweight bug-gather protocol.

- **AC-001-01**: Given a bug-classified ticket with GitHub/Jira data, when the bug roundtable opens, then Maya presents a structured summary of the bug and asks clarifying questions
- **AC-001-02**: Given the bug roundtable is active, when personas contribute, then the conversation follows the same flow rules as the feature roundtable (no phase headers, no menus, bulleted format, natural steering)
- **AC-001-03**: Given the bug roundtable is active, when the first 3 exchanges complete, then all three personas (Maya, Alex, Jordan) have contributed

### FR-002: Tracing delegation during analysis

**Confidence**: High

After the initial bug conversation produces `bug-report.md`, the analyze handler delegates to the tracing-orchestrator (T1/T2/T3 sub-agents) within the analysis session.

- **AC-002-01**: Given a bug-report.md exists in the artifact folder, when tracing is invoked, then the tracing-orchestrator receives the bug-report.md path as input
- **AC-002-02**: Given the tracing-orchestrator is invoked, when it executes, then T1 (symptom-analyzer), T2 (execution-path-tracer), T3 (root-cause-identifier) run in parallel
- **AC-002-03**: Given tracing completes, when Alex presents findings, then the root cause hypotheses are shown ranked by likelihood with affected code paths
- **AC-002-04**: Given tracing is invoked during analysis, when the bug-report.md is written, then it is the only artifact written before the confirmation sequence

### FR-003: Fix strategy

**Confidence**: High

Jordan produces fix approach options based on the root cause analysis.

- **AC-003-01**: Given root cause analysis is complete, when Jordan presents fix strategy, then at least 2 fix approaches are presented with tradeoffs
- **AC-003-02**: Given fix approaches are presented, when each approach is described, then regression risk is assessed
- **AC-003-03**: Given multiple approaches exist, when Jordan summarizes, then a recommended approach is identified with rationale

### FR-004: Four-domain confirmation sequence

**Confidence**: High

After the conversation and tracing are complete, present domain summaries sequentially for Accept/Amend. Artifacts are written only after all domains are accepted.

- **AC-004-01**: Given analysis is complete, when confirmation begins, then Domain 1 (Bug Summary by Maya) is presented with severity, reproduction steps, and affected users
- **AC-004-02**: Given Domain 1 is accepted, when Domain 2 is presented, then Root Cause Analysis (by Alex) shows hypotheses, affected code paths, and blast radius
- **AC-004-03**: Given Domain 2 is accepted, when Domain 3 is presented, then Fix Strategy (by Jordan) shows approaches, tradeoffs, and recommendation
- **AC-004-04**: Given Domain 3 is accepted, when Domain 4 is presented, then Tasks shows the task list for build phases 05/06/16/08 using tasks.template.json format with traces, files, blocked_by, blocks
- **AC-004-05**: Given any domain is presented, when user chooses Amend, then confirmation restarts from Domain 1
- **AC-004-06**: Given all 4 domains are accepted, when finalization runs, then root-cause-analysis.md, fix-strategy.md, and tasks.md are written to the artifact folder in a single batch

### FR-005: Automatic build kickoff

**Confidence**: High

After task list acceptance and artifact write, inform the user and kick off the build phase directly.

- **AC-005-01**: Given all domains are accepted and artifacts written, when the completion message is displayed, then all produced artifacts are listed
- **AC-005-02**: Given the completion message is displayed, when build starts, then the build workflow is invoked starting at Phase 05 (test-strategy), skipping Phase 01 and Phase 02 which are complete from analysis
- **AC-005-03**: Given build is invoked, when the workflow initializes, then the build uses phases ["05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]

### FR-006: Deprecate lightweight bug-gather protocol

**Confidence**: High

The `bug-gather-analyst.md` protocol is replaced by the bug roundtable.

- **AC-006-01**: Given a bug is classified in step 6.5, when the analyze handler routes, then step 6.5c reads bug-roundtable-analyst.md instead of bug-gather-analyst.md
- **AC-006-02**: Given bug-gather-analyst.md exists, when deprecation is applied, then a deprecation header is added pointing to the new protocol

---

## 7. Out of Scope

| Item | Reason | Future Reference |
|------|--------|-----------------|
| New persona definitions for bug-specific behavior | Existing personas cover the required domains | N/A |
| Changes to tracing sub-agent internals (T1/T2/T3) | Reused as-is, only invocation point changes | N/A |
| Changes to build phase agents (05/06/16/08) | Build phase is identical for features and bugs | N/A |
| Task list validation hook for GH-212 consumption conventions | Structural gap identified during analysis — task lists generated in analysis are not validated for consumption-readiness | Recommend tracking as separate backlog item |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Bug roundtable conversation | Must Have | Core capability — replaces lightweight flow |
| FR-002 | Tracing delegation during analysis | Must Have | Root cause is the primary value-add over current flow |
| FR-003 | Fix strategy | Must Have | Gives user actionable fix options before committing |
| FR-004 | Four-domain confirmation sequence | Must Have | Mirrors feature flow, ensures user review |
| FR-005 | Automatic build kickoff | Must Have | Seamless transition from analysis to build |
| FR-006 | Deprecate bug-gather protocol | Must Have | Clean routing, no dead code paths |
