# Requirements Specification: REQ-0105 — Discover State/Resume

## 1. Business Context
Discover state tracks completion, current step, flow type, and enables resume after interruption. This state schema needs to be provider-neutral.

**Source**: GitHub #169 (CODEX-036)

## 2. Functional Requirements

### FR-001: State Schema
**Confidence**: High
- AC-001-01: Schema includes: status (pending|in_progress|completed), current_step, completed_steps[], flow_type, depth_level
- AC-001-02: Schema includes: discovery_context metadata (tech_stack, architecture, test_coverage)
- AC-001-03: Schema includes: started_at, completed_at, last_resumed_at timestamps

### FR-002: Resume Semantics
**Confidence**: High
- AC-002-01: computeResumePoint(state) returns the next uncompleted step
- AC-002-02: Known limitation documented: interrupted agent groups restart from beginning (not mid-group)

### FR-003: Completion Flags
**Confidence**: High
- AC-003-01: isDiscoverComplete(state) checks all required steps for the mode are in completed_steps

## 3. Out of Scope
State persistence (handled by StateStore). Modifying state.json schema.

## 4. MoSCoW
All Must Have.
