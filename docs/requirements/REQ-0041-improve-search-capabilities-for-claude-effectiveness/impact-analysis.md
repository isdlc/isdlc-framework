# Impact Analysis: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Blast Radius (high), Entry Points (high), Risk Zones (medium), Implementation Order (medium)

---

## 1. Blast Radius

### Tier 1: Direct Changes

| File/Module | Change Type | Description |
|-------------|-------------|-------------|
| `lib/installer.js` | Modify | Add search capability detection and installation step to setup pipeline |
| `.claude/settings.json` | Modify | Add MCP server configuration for search backends |
| New: `lib/search/` | Create | Search abstraction layer, backend registry, router, result contract |
| New: `lib/search/backends/` | Create | Backend adapters (lexical, structural, semantic, indexed) |
| New: `lib/search/detection.js` | Create | System-level tool detection logic |
| New: `lib/search/install.js` | Create | Search tool installation orchestration |

### Tier 2: Transitive Changes (Agent Migration)

| File/Module | Change Type | Description |
|-------------|-------------|-------------|
| `src/claude/agents/quick-scan/quick-scan-agent.md` | Modify | Migrate from direct Grep/Glob to search abstraction calls |
| `src/claude/agents/impact-analysis/impact-analyzer.md` | Modify | Migrate search calls |
| `src/claude/agents/impact-analysis/risk-assessor.md` | Modify | Migrate search calls |
| `src/claude/agents/impact-analysis/entry-point-finder.md` | Modify | Migrate search calls |
| `src/claude/agents/impact-analysis/cross-validation-verifier.md` | Modify | Migrate search calls |
| `src/claude/agents/discover/*.md` | Modify | Discovery analyzers migrate search calls |
| `src/claude/agents/persona-solutions-architect.md` | Modify | Update codebase scan methodology references |
| `src/claude/agents/roundtable-analyst.md` | Modify | Update codebase scan references |

### Tier 3: Side Effects

| File/Module | Change Type | Description |
|-------------|-------------|-------------|
| `src/claude/skills/analysis-steps/00-quick-scan/*.md` | Modify | Update search methodology references |
| `src/claude/skills/analysis-topics/technical-analysis/*.md` | Modify | Update search references |
| `CLAUDE.md` | Modify | Document search abstraction convention for agents |
| `src/claude/agents/14-upgrade-engineer.md` | Modify | References Grep directly for upgrade scanning |
| Remaining 30+ agents | Future | Incremental migration as needed |

## 2. Entry Points

| Priority | Entry Point | Rationale |
|----------|-------------|-----------|
| 1 | `lib/search/` (new module) | Core abstraction must exist before anything else |
| 2 | `lib/search/backends/lexical.js` | Wrap existing Grep/Glob as baseline backend |
| 3 | `lib/search/detection.js` | Detection logic needed for setup integration |
| 4 | `lib/installer.js` | Wire detection into setup pipeline |
| 5 | `src/claude/agents/quick-scan/quick-scan-agent.md` | First agent migration (highest search density) |
| 6 | `lib/search/backends/structural.js` | ast-grep integration (Phase 1 value delivery) |

## 3. Implementation Order

### Phase 1a: Foundation (search abstraction)
1. Define search request/result contracts
2. Implement search router with modality-based routing
3. Implement backend registry with health checking
4. Wrap Grep/Glob as the `lexical` baseline backend
5. Unit tests for abstraction layer

### Phase 1b: Setup Integration
6. Implement search tool detection (ast-grep, Probe, system capabilities)
7. Implement installation orchestration with user consent flow
8. Wire detection into `lib/installer.js` and discover flow
9. MCP server configuration writer for `.claude/settings.json`
10. Integration tests for setup flow

### Phase 1c: Structural Backend + Agent Migration
11. Implement ast-grep backend adapter
12. Implement Probe backend adapter
13. Migrate quick-scan agent to search abstraction
14. Migrate impact analysis sub-agents (4 agents)
15. Integration tests for structural search

### Phase 1d: Degradation and Polish
16. Implement health monitoring and graceful fallback
17. User notification system for degradation events
18. Result ranking and token budget enforcement
19. Migration guide documentation
20. End-to-end testing

### Phase 2 (Future): Extended Backends
21. Semantic search backend (embeddings)
22. Indexed search backend (Zoekt/trigram)
23. Remaining agent migrations

## 4. Risk Zones

| Risk Zone | Files | Concern | Mitigation |
|-----------|-------|---------|------------|
| Setup pipeline | `lib/installer.js` | Adding installation step to existing flow without breaking current setup | Feature-flag the search setup; test on fresh init and existing projects |
| MCP configuration | `.claude/settings.json` | Modifying shared configuration file; must preserve existing entries | Read-merge-write pattern; never overwrite existing mcpServers |
| Agent behavior | 48 agent files | Changing search patterns could alter agent effectiveness | Incremental migration; A/B testing migrated vs non-migrated agents |
| Cross-platform | Detection/installation | Tool availability varies across macOS, Linux, Windows | Platform-specific detection paths; fallback at every step |
| Performance | Search router | Abstraction overhead for small codebases | Bypass threshold (skip router for projects < 10K files) |

## 5. Summary

**Blast radius**: Large -- touches setup pipeline, configuration, agent behavior, and skill definitions across the framework.

**Risk level**: Medium -- mitigated by the incremental migration strategy and permanent Grep/Glob fallback.

**Recommended approach**: Build the abstraction layer first with Grep/Glob as the baseline backend (zero behavioral change). Then add enhanced backends and migrate agents incrementally. This ensures no regression at any point.

**Estimated effort**: Phase 1 (lexical + structural + core agent migration) is a medium-to-large feature. Phase 2 (semantic + indexed) is an additional medium feature.
