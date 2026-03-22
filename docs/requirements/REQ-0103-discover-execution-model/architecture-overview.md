# Architecture Overview: REQ-0103 — Discover Execution Model

## ADR-CODEX-013: Discover Program Model
- **Status**: Accepted
- **Context**: 24 discover agents need provider-neutral execution model
- **Decision**: Frozen mode/group/depth configs in src/core/discover/. Same pure-data pattern.
- **Rationale**: Consistent with Phase 4/5 approach.

## File Layout
- src/core/discover/modes.js (NEW)
- src/core/discover/agent-groups.js (NEW)
- src/core/discover/index.js (NEW — re-exports + registry functions)
