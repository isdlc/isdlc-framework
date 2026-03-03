# Quick Scan: Indexed Search Backend

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-03

---

## Codebase Summary

The search abstraction layer (`lib/search/`) contains 9 modules with full test coverage. The `'indexed'` modality is already recognized by the router (`VALID_MODALITIES`), the registry (`inferModality`, `inferPriority`), and the config system (`activeBackends`) -- but no indexed backend adapter exists.

## Relevant Files

| File | Relevance |
|------|-----------|
| `lib/search/router.js` | Routes search requests by modality; already supports 'indexed' |
| `lib/search/registry.js` | Backend registration; has 'zoekt' -> 'indexed' mapping; needs 'code-index' -> 'indexed' |
| `lib/search/detection.js` | Tool detection; has ast-grep and probe; needs code-index-mcp entry |
| `lib/search/install.js` | Tool installation + MCP config; has ast-grep and probe; needs code-index entry |
| `lib/search/config.js` | Config read/write; no changes needed (picks up new backends automatically) |
| `lib/search/ranker.js` | Result ranking/bounding; no changes needed |
| `lib/search/backends/lexical.js` | Baseline backend adapter; reference implementation for new adapter |
| `lib/search/backends/structural.js` | ast-grep adapter; reference for MCP-based adapter |
| `lib/search/backends/enhanced-lexical.js` | Probe adapter; reference for MCP-based adapter |
| `lib/setup-search.js` | Setup pipeline orchestrator; no changes needed (picks up new KNOWN_TOOLS) |

## Module Structure

```
lib/search/
  router.js          -- Search request routing (modality-based)
  registry.js        -- Backend registration and health tracking
  ranker.js          -- Result ranking and token budget enforcement
  config.js          -- Search configuration persistence
  detection.js       -- Tool availability detection
  install.js         -- Tool installation and MCP server configuration
  backends/
    lexical.js       -- Grep/Glob baseline adapter
    enhanced-lexical.js -- Probe adapter
    structural.js    -- ast-grep adapter
    (indexed.js)     -- NEW: code-index-mcp adapter
```

## Key Observations

- The architecture was designed for exactly this extension -- adding a new backend is a well-defined pattern
- All three existing backend adapters follow the same interface: `{ search(), healthCheck() }`
- The setup pipeline (`setup-search.js`) already orchestrates detection -> install -> MCP config -> write config; it picks up new KNOWN_TOOLS entries without code changes
- The router's fallback chain (`routeWithFallback`) handles backend failures automatically
- Python/pip is not currently in the package manager detection list (npm, cargo, brew) -- this is a new addition

## Estimated Scope

- 2 new files (backend adapter + tests)
- 6 modified library files (detection, install, registry + their tests)
- 3 agent markdown files (optional, Should Have)
- Total: ~13 files touched
