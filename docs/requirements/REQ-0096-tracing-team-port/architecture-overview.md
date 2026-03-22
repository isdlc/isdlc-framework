# Architecture Overview: REQ-0096 — Tracing Team Port

## Selected Architecture

### ADR-CODEX-009b: Tracing Instance Config
- **Status**: Accepted
- **Context**: Tracing fan-out (T1-T3) is described in Claude agent markdown. Codex needs the team composition as data.
- **Decision**: Frozen instance config object in `src/core/teams/instances/tracing.js` referencing the `fan_out` team spec.
- **Rationale**: Same pattern as impact analysis instance. Pure data, zero regression.
- **Consequences**: Claude agent markdown unchanged. Codex reads instance config.

## File Layout
- `src/core/teams/instances/tracing.js` (NEW)
- Shares instance-registry.js and bridge/team-instances.cjs with REQ-0095/0097

## Summary
| Metric | Value |
|--------|-------|
| New files | 1 (+ 2 shared) |
| Modified files | 0 |
| Risk level | Low |
