# Requirements Specification: REQ-0096 — Tracing Team Port

## 1. Business Context

The tracing orchestrator fans out to T1/T2/T3 in parallel. This orchestration is currently encoded in Claude-specific agent markdown. Codex needs a provider-neutral instance config describing the team composition and artifact mapping.

**Source**: GitHub #160 (CODEX-027)
**Dependencies**: REQ-0094 (team spec model — completed), REQ-0087 (Claude adapter boundary — completed)

## 2. Functional Requirements

### FR-001: Instance Config
**Confidence**: High
- AC-001-01: Instance config has `instance_id: 'tracing'`, `team_type: 'fan_out'`
- AC-001-02: Members array has T1 (symptom-analyzer, required), T2 (execution-path-tracer, required), T3 (root-cause-identifier, required)
- AC-001-03: `output_artifact: 'trace-analysis.md'`, `input_dependency: '01-requirements'`

### FR-002: Output/Input Mapping
**Confidence**: High
- AC-002-01: Output artifact is `trace-analysis.md`
- AC-002-02: Input dependency is `01-requirements` (bug report)

### FR-003: No Fail-Open
**Confidence**: High
- AC-003-01: All 3 members are `required: true`
- AC-003-02: `policies` is empty object (no fail-open)

## 3. Out of Scope
- Runtime fan-out engine (stays in agent markdown)
- Modifying tracing-orchestrator.md

## 4. MoSCoW
All FRs are Must Have.
