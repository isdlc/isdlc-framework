# Design Summary: Improve Search Capabilities for Claude Effectiveness

**Status**: Accepted
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Accepted**: 2026-03-02
**Coverage**: All design domains covered

---

## Overview

This design introduces a search abstraction layer into the iSDLC framework, enabling agents to search codebases through intent-based requests that are routed to the best available backend. The system auto-detects and installs search tools during project setup, prefers local tools by default, and degrades gracefully to the existing Grep/Glob baseline when enhanced backends are unavailable.

## Key Design Decisions

1. **Strategy Pattern with Backend Registry**: Agents call a unified search interface. The router selects the best backend based on requested modality and backend health. Adding new backends requires no agent code changes.

2. **Local-First, Cloud-Optional**: All Phase 1 tools (ast-grep, Probe) are fully local. Cloud-based semantic search is Phase 2 and user-opt-in only.

3. **Auto-Detect with Opt-Out**: Setup pipeline detects system capabilities, recommends tools, installs with user consent. `--no-search-setup` skips entirely.

4. **Graceful Degradation**: Multi-level fallback with Grep/Glob as the permanent baseline. User notified once per session on degradation. Workflow never blocked.

5. **Incremental Agent Migration**: Grep/Glob wrapped as baseline backend from day one. Agents migrate incrementally, starting with highest-impact consumers (quick-scan, impact analysis).

## Module Structure

```
lib/search/
  router.js          -- Request routing, fallback orchestration
  registry.js        -- Backend lifecycle, health tracking
  ranker.js          -- Result ranking, dedup, token budget
  config.js          -- Configuration persistence
  detection.js       -- System tool detection
  install.js         -- Tool installation, MCP configuration
  backends/
    lexical.js       -- Grep/Glob adapter (always available)
    structural.js    -- ast-grep adapter (Phase 1)
    enhanced-lexical.js -- Probe adapter (Phase 1)
    semantic.js      -- Embedding adapter (Phase 2)
    indexed.js       -- Zoekt adapter (Phase 2)
```

## Data Flow Summary

1. **Setup**: Detect tools -> Recommend -> Install with consent -> Configure MCP -> Persist config
2. **Search**: Agent request -> Router -> Registry lookup -> Backend call -> Rank -> Bound -> Return
3. **Degradation**: Backend failure -> Mark unhealthy -> Fallback -> Notify user -> Continue

## Interface Contracts

- `SearchRequest`: query, modality, scope, fileGlob, tokenBudget, maxResults, includeAstContext
- `SearchResult`: hits[] + meta (backendUsed, modalityUsed, degraded, durationMs, tokenCount)
- `BackendAdapter`: id, modality, priority, search(), healthCheck(), displayName, requiresMcp
- Uniform contract across all backends

## Error Handling

- 22 error codes across 4 categories (search, installation, configuration, MCP)
- Core invariant: no error is fatal; every failure path degrades to Grep/Glob
- Agents do not handle SearchError directly -- router resolves fallback internally

## Phasing

- **Phase 1**: Search abstraction + lexical baseline + ast-grep + Probe + setup integration + core agent migration
- **Phase 2**: Semantic search (embeddings) + indexed search (Zoekt) + remaining agent migrations

## Scale Target

Up to 500,000 files. Phase 1 achieves this through structural search (ast-grep). Phase 2 adds trigram indexing (Zoekt) for sub-second full-codebase queries at this scale.

## Risk Mitigation

Every risk is mitigated by the same principle: Grep/Glob is always available and never removed. Enhanced search improves the experience; its absence returns to the current baseline.
