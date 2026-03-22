# Requirements Specification: REQ-0095 — Impact Analysis Team Port

## 1. Business Context

The impact analysis orchestrator fans out to M1/M2/M3 (+M4 verifier) in parallel. This orchestration is currently encoded in Claude-specific agent markdown. Codex needs a provider-neutral instance config that describes which agents fill which roles, what the output artifact is, and what M4's fail-open policy is.

**Source**: GitHub #159 (CODEX-026)
**Dependencies**: REQ-0094 (team spec model — completed), REQ-0087 (Claude adapter boundary — completed)

## 2. Functional Requirements

### FR-001: Instance Config
**Confidence**: High
- AC-001-01: Instance config has `instance_id: 'impact_analysis'`, `team_type: 'fan_out'`
- AC-001-02: Members array has M1 (impact-analyzer, required), M2 (entry-point-finder, required), M3 (risk-assessor, required), M4 (cross-validation-verifier, not required)
- AC-001-03: `output_artifact: 'impact-analysis.md'`, `input_dependency: '01-requirements'`

### FR-002: M4 Fail-Open Policy
**Confidence**: High
- AC-002-01: Policy object has tier_1 (skip_if_unavailable), tier_2 (skip_if_task_fails), tier_3 (skip_if_timeout)

### FR-003: Output/Input Mapping
**Confidence**: High
- AC-003-01: Output artifact is `impact-analysis.md`
- AC-003-02: Input dependency is `01-requirements` phase

### FR-004: Scope Variants
**Confidence**: High
- AC-004-01: `scope_variants` includes `'feature'` and `'upgrade'`

## 3. Out of Scope
- Runtime fan-out engine (stays in agent markdown)
- Modifying impact-analysis-orchestrator.md
- Provider-specific prompt formatting

## 4. MoSCoW
All FRs are Must Have.
