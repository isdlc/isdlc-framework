# Requirements Specification: Codex Instruction Projection Service

**Item**: REQ-0116 | **GitHub**: #180 | **CODEX**: CODEX-047 | **Phase**: 8 | **Workstream**: C
**Status**: Analyzed | **Depends on**: REQ-0085, REQ-0114

---

## 1. Business Context

Claude uses per-tool injection (hooks, session cache, CLAUDE.md sections) to deliver context to agents. Codex uses a single system-context instruction bundle per task. This item implements the projection service that assembles core models into a Codex-compatible markdown instruction bundle, extending the basic projection module from REQ-0114.

## 2. Functional Requirements

### FR-001: Instruction Projection
- **AC-001-01**: `projectInstructions(phase, agent, options)` generates Codex instruction content by consuming core models.
- **AC-001-02**: Consumes: `getTeamSpec()`, `getTeamInstance()`, `getAgentClassification()` (role_spec sections), `computeInjectionPlan()`.
- **AC-001-03**: Returns `{ content: string, metadata: { phase, agent, skills_injected, team_type } }`.

### FR-002: Injection Model
- **AC-002-01**: Uses system-context injection: a single markdown bundle per task.
- **AC-002-02**: Does not use per-tool injection (no Claude-style hooks or session cache).

### FR-003: Output Format
- **AC-003-01**: Output is markdown instruction text ready for Codex task execution.
- **AC-003-02**: Markdown follows a consistent section structure: team context, agent role, skills, phase instructions.

### FR-004: Core Model Consumption
- **AC-004-01**: Loads team instance for the specified phase.
- **AC-004-02**: Loads agent classification (role_spec sections only).
- **AC-004-03**: Computes injection plan for built-in and external skills.
- **AC-004-04**: Assembles all loaded models into the markdown instruction bundle.

### FR-005: Fail-Open on Missing Models
- **AC-005-01**: If a core model is unavailable (team spec missing, agent classification not found), the function produces a minimal instruction with whatever context is available.
- **AC-005-02**: Missing models are reported in the returned metadata (e.g., `metadata.warnings: string[]`).

## 3. Out of Scope

- Codex CLI invocation
- Claude session cache equivalent
- Modifying core model APIs
- Runtime task scheduling

## 4. MoSCoW

FR-001, FR-002, FR-003, FR-004, FR-005: **Must Have**.
