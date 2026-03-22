# Architecture Overview: REQ-0128 — ProviderRuntime Interface

## ADR-CODEX-029: ProviderRuntime Contract
- **Status**: Accepted
- **Context**: Multiple developer tools need a common execution interface
- **Decision**: Frozen interface definition + factory + validation helper in src/core/orchestration/. Provider adapters implement the interface in src/providers/{name}/runtime.js. Factory uses dynamic import for lazy loading.
- **Rationale**: Same pattern as the spawnAgent(role, context) callback in the Codex implementation-loop-runner. Proven in production. Extends to all orchestration patterns.
- **Consequences**: Core orchestrators depend only on the interface. Adding a new provider = implementing 5 methods.

## File Layout
- src/core/orchestration/provider-runtime.js (NEW — ~120 lines)
- src/core/bridge/orchestration.cjs (NEW — CJS bridge, ~30 lines)

## Summary
| Metric | Value |
|--------|-------|
| New files | 2 |
| Modified files | 0 |
| Risk level | Low |
