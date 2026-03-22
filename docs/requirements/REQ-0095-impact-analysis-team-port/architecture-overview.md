# Architecture Overview: REQ-0095 — Impact Analysis Team Port

## Selected Architecture

### ADR-CODEX-009a: Impact Analysis Instance Config
- **Status**: Accepted
- **Context**: Impact analysis fan-out (M1-M4) is described in Claude agent markdown. Codex needs the team composition as data.
- **Decision**: Frozen instance config object in `src/core/teams/instances/impact-analysis.js` referencing the `fan_out` team spec.
- **Rationale**: Pure data, zero regression. Same pattern as REQ-0094 specs.
- **Consequences**: Claude agent markdown unchanged. Codex reads instance config.

## File Layout
- `src/core/teams/instances/impact-analysis.js` (NEW)
- `src/core/teams/instance-registry.js` (NEW — shared with REQ-0096/0097)
- `src/core/bridge/team-instances.cjs` (NEW — shared)
- 0 modified files

## Summary
| Metric | Value |
|--------|-------|
| New files | 1 (+ 2 shared) |
| Modified files | 0 |
| Risk level | Low |
