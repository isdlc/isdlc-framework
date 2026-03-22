# Architecture Overview: REQ-0097 — Quality Loop Team Port

## Selected Architecture

### ADR-CODEX-009c: Quality Loop Instance Config
- **Status**: Accepted
- **Context**: Quality dual-track (A/B) with fan-out is described in Claude agent markdown. Codex needs the track composition, fan-out policy, scope modes, and retry rules as data.
- **Decision**: Frozen instance config object in `src/core/teams/instances/quality-loop.js` referencing the `dual_track` team spec.
- **Rationale**: Same pattern. Most complex of the 3 instances due to fan-out and scope policies.
- **Consequences**: Claude agent markdown unchanged. Codex reads instance config.

## File Layout
- `src/core/teams/instances/quality-loop.js` (NEW)
- `src/core/teams/instance-registry.js` (NEW — shared)
- `src/core/bridge/team-instances.cjs` (NEW — shared)

## Summary
| Metric | Value |
|--------|-------|
| New files | 1 (+ 2 shared) |
| Modified files | 0 |
| Risk level | Low |
