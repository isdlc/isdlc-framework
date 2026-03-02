# Architecture Summary: Improve Search Capabilities for Claude Effectiveness

**Accepted**: 2026-03-02

## Selected Architecture

Search Abstraction Layer with Backend Registry (Strategy pattern + service registry). Agents call intent-based search; router selects best backend; uniform result contract regardless of backend.

## Architecture Decisions

- **ADR-001**: Strategy pattern with backend registry -- centralized routing, fallback, health monitoring
- **ADR-002**: Local-first tool strategy -- Phase 1 tools (ast-grep, Probe) fully local; cloud opt-in only
- **ADR-003**: Auto-detect with opt-out -- detection and installation during setup, --no-search-setup to skip

## Technology Selections

| Tool | Role | Phase | License |
|------|------|-------|---------|
| ast-grep | Structural search | Phase 1 | MIT |
| Probe | Enhanced lexical search | Phase 1 | MIT |
| Grep/Glob | Baseline lexical | Always | Built-in |
| Zoekt | Trigram indexed search | Phase 2 | Apache 2.0 |
| CodeBERT | Local embeddings | Phase 2 | MIT |

## Integration Points

- `lib/installer.js` -- search detection step in setup pipeline
- `.claude/settings.json` -- MCP server configuration
- Quick-scan agent + 4 impact analysis sub-agents -- first migration targets
- Grep/Glob wrapped as baseline from day one (zero-regression)

## Risk Assessment

All risks mitigated by permanent Grep/Glob fallback. Multi-level degradation with user notification. No error is fatal.
