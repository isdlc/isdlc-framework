# Quick Scan: Improve Search Capabilities for Claude Effectiveness

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-02
**Phase**: 00-quick-scan

---

## 1. Scope

**Core change**: Introduce a search abstraction layer that routes agent search requests to the best available backend (lexical, structural, semantic, indexed, LSP). Add search tool detection, installation, and MCP configuration to the project setup pipeline. Migrate high-impact agents to use the abstraction.

**Type**: Additive (new capability) + Modifying (agent search patterns, setup pipeline)

## 2. Keywords

| Keyword | Grep Hits | Glob Hits | Notes |
|---------|-----------|-----------|-------|
| `Grep` | 30+ files in src/claude/ | N/A | Used directly by agents for codebase search |
| `Glob` | 30+ files in src/claude/ | N/A | Used for file discovery by agents |
| `search` | 30+ files | N/A | Generic term, high noise |
| `scan` | 15+ files | N/A | Quick-scan agent, discovery agents |
| `MCP` / `mcpServers` | 0 in settings.json | N/A | No MCP servers currently configured |
| `installer` | 1 (lib/installer.js) | N/A | Setup pipeline entry point |
| `ast-grep` / `tree-sitter` | 0 | N/A | Not currently used in framework |

## 3. File Count

| Category | Estimated Count | Notes |
|----------|----------------|-------|
| New files | 8-12 | Search abstraction, backend adapters, detection logic, config schema |
| Modified files | 15-20 | High-impact agents, installer, settings, skill/topic files |
| Test files | 10-15 | Unit tests for abstraction, integration tests per backend |
| Config files | 2-3 | Settings.json template, search config schema |
| Documentation | 3-5 | Migration guide, search architecture docs |

**Total estimated**: 38-55 files

## 4. Final Scope

**Scope tier**: Large
**Confidence**: Medium

This is a cross-cutting framework enhancement that touches the setup pipeline, agent behavior, MCP configuration, and introduces a new abstraction layer. Phase 1 (lexical + structural) is medium scope. Full vision (all five modalities) is large scope.
