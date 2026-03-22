# Requirements Specification: REQ-0097 — Quality Loop Team Port

## 1. Business Context

The quality loop runs dual-track (Track A: testing, Track B: QA) in parallel with optional fan-out for Track A when test count exceeds 250. This orchestration is encoded in Claude agent markdown. Codex needs a provider-neutral instance config describing tracks, checks, fan-out policy, scope modes, and retry rules.

**Source**: GitHub #161 (CODEX-028)
**Dependencies**: REQ-0094 (team spec model — completed), REQ-0087 (Claude adapter boundary — completed)

## 2. Functional Requirements

### FR-001: Instance Config
**Confidence**: High
- AC-001-01: Instance config has `instance_id: 'quality_loop'`, `team_type: 'dual_track'`
- AC-001-02: Track A has checks: QL-002, QL-003, QL-004, QL-005, QL-006, QL-007
- AC-001-03: Track B has checks: QL-008, QL-009, QL-010
- AC-001-04: `output_artifact: 'quality-report.md'`, `input_dependency: '06-implementation'`

### FR-002: Fan-Out Policy
**Confidence**: High
- AC-002-01: Trigger threshold is 250 test files
- AC-002-02: Max chunks is 8
- AC-002-03: Distribution strategy is `round_robin`
- AC-002-04: Fan-out applies to `track_a` only

### FR-003: Scope Modes
**Confidence**: High
- AC-003-01: `scope_modes` includes `FULL_SCOPE` and `FINAL_SWEEP`

### FR-004: Retry Policy
**Confidence**: High
- AC-004-01: `retry_both_on_failure: true` — both tracks retry if either fails
- AC-004-02: `max_iterations: 10`

## 3. Out of Scope
- Runtime dual-track engine (stays in agent markdown)
- Modifying 16-quality-loop-engineer.md

## 4. MoSCoW
All FRs are Must Have.
