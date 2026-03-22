# Architecture Overview: REQ-0098 — Debate Team Orchestration Pattern

## ADR-CODEX-011: Debate Instance Configs
- **Status**: Accepted
- **Context**: 4 debate teams (req/arch/design/test) need instance configs for Codex consumption
- **Decision**: Same frozen-config pattern as REQ-0095-0097. Add 4 files to instances/, update registry.
- **Rationale**: Consistent with Phase 4 pattern. One registry modification (additive imports).

## File Layout
- `src/core/teams/instances/debate-requirements.js` (NEW)
- `src/core/teams/instances/debate-architecture.js` (NEW)
- `src/core/teams/instances/debate-design.js` (NEW)
- `src/core/teams/instances/debate-test-strategy.js` (NEW)
- `src/core/teams/instance-registry.js` (MODIFY — add 4 imports to Map)

## Summary
| Metric | Value |
|--------|-------|
| New files | 4 |
| Modified files | 1 (instance-registry.js — additive imports only) |
| Risk level | Low |
