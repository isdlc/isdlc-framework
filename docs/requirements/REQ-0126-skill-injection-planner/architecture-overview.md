# Architecture Overview: REQ-0126 — Skill Injection Planner

## Selected Architecture

### ADR-CODEX-010: Skill Injection Planner
- **Status**: Accepted
- **Context**: Skill injection logic is inline in isdlc.md Phase-Loop Controller (Claude-specific). The rules (manifest lookup, precedence, phase matching) are provider-neutral.
- **Decision**: Core planner in `src/core/skills/injection-planner.js` computes WHAT to inject. Provider adapter computes HOW to deliver.
- **Rationale**: Separates provider-neutral computation from provider-specific formatting.
- **Consequences**: Claude's Phase-Loop Controller can delegate to this planner. Codex adapter uses the same planner.

## File Layout
- `src/core/skills/injection-planner.js` (NEW)
- `src/core/bridge/skill-planner.cjs` (NEW)
- 0 modified files

## Summary
| Metric | Value |
|--------|-------|
| New files | 2 |
| Modified files | 0 |
| Risk level | Low |
