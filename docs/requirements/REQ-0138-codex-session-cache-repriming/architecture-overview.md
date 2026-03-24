# Architecture Overview: REQ-0138 — Codex Session Cache Re-priming + AGENTS.md Template

## ADR-CODEX-039: AGENTS.md Template + Cache Re-priming
- **Status**: Accepted
- **Context**: Codex needs a shipped instruction template (like CLAUDE.md.template) plus a session cache re-prime path
- **Decision**: Ship src/codex/AGENTS.md.template with full behavioral instructions adapted for Codex. Cache re-priming is adapter behavior — projectInstructions() reads cache, AGENTS.md instructs conditional read-not-rebuild. Governance splits into three tiers.
- **Rationale**: Matches Claude's template pattern. Assumptions softened per review: AGENTS.md is primary but not exclusive surface, intent routing is probabilistic, governance is split not instruction-only.
- **Consequences**: Codex end-user projects get a working instruction file on install. Cache continuity across clear/resume.

## File Layout
| File | Action | Lines |
|------|--------|-------|
| `src/codex/AGENTS.md.template` | NEW | ~300 |
| `src/providers/codex/installer.js` | MODIFY | +20 |
| `src/providers/codex/projection.js` | MODIFY | +45 (injection + parseCacheSections helper) |
| `src/core/installer/index.js` | MODIFY (minor) | +5 (.codex/ dir creation) |

## Summary
| Metric | Value |
|--------|-------|
| New files | 1 |
| Modified files | 3 |
| Risk level | Low-Medium (template content quality is subjective) |
