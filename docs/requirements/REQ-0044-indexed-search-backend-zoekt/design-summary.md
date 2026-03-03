# Design Summary: Indexed Search Backend

**Accepted**: 2026-03-03
**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Module Design (high), Interface Contracts (high), Data Flow (high), Error Handling (high)

---

## Overview

This design integrates an indexed search backend (ViperJuice/Code-Index-MCP) into the existing search abstraction layer, filling the empty `'indexed'` modality slot. The design follows the established pattern for search backends: detect, install, configure MCP, register in the backend registry, and route searches through the router.

## Module Summary

| Module | Type | Single Responsibility |
|--------|------|----------------------|
| `lib/search/backends/indexed.js` (M1) | New | MCP transport adapter for indexed search modality |
| `lib/search/detection.js` (M2) | Modified | Python/pip detection and code-index-mcp tool entry |
| `lib/search/install.js` (M3) | Modified | code-index MCP server configuration entry |
| `lib/search/registry.js` (M4) | Modified | code-index modality and priority mappings |

## Key Design Decisions

1. **ViperJuice/Code-Index-MCP selected** over Zoekt due to built-in file watching, cross-platform support, and existing MCP server implementation
2. **Config-driven registration** follows the established pattern -- no new registration mechanisms
3. **Python/pip as new package manager** in detection, extending the existing npm/cargo/brew pattern
4. **Zero-maintenance index** via MCP server's built-in Watchdog file watcher -- no custom daemon management

## Interface Contracts Summary

| Interface | Input | Output |
|-----------|-------|--------|
| `createIndexedBackend()` | Optional MCP client config | BackendAdapter with search() and healthCheck() |
| `adapter.search(request)` | SearchRequest with modality 'indexed' | RawSearchHit[] (never throws) |
| `adapter.healthCheck()` | None | 'healthy' or 'unavailable' (never throws) |
| `detectPython(execFn)` | Exec function | { available, command, version, pipCommand } |

## Data Flow Summary

1. **Setup**: detection -> install via pip -> MCP config in `.claude/settings.json` -> record in `search-config.json`
2. **Runtime**: Agent requests `modality: 'indexed'` -> router -> code-index adapter -> MCP call to `search_code_advanced` -> normalize to RawSearchHit[] -> rank and bound
3. **Degradation**: MCP failure -> adapter returns [] -> registry marks degraded -> router falls back to grep-glob -> one-time notification
4. **Index lifecycle**: MCP server manages index build, file watching, incremental updates, and persistence independently

## Error Handling Philosophy

Every error in this system is non-fatal. The architecture enforces a strict fail-open policy:
- Detection errors: skip recommendation silently
- Installation errors: log warning, continue setup
- Configuration errors: log warning, grep-glob baseline active
- Runtime errors: automatic fallback to grep-glob with degradation notification
- Index errors: managed by the MCP server internally; searches degrade gracefully

## File Impact

- 2 new files (backend adapter + tests)
- 6 modified library files (detection, install, registry + tests)
- 3 agent markdown files (optional, Should Have)
- 2 config files at runtime (.claude/settings.json, .isdlc/search-config.json)
