# Implementation Notes: Search Abstraction Layer

**Phase**: 06 - Implementation
**Requirement**: REQ-0041 (GH-34)
**Status**: Complete
**Date**: 2026-03-02

---

## 1. Implementation Summary

Implemented the search abstraction layer as 9 ESM modules under `lib/search/`:

| Module | Lines | Purpose |
|--------|-------|---------|
| `config.js` | ~110 | Read/write search configuration from `.isdlc/search-config.json` |
| `registry.js` | ~190 | Backend registry with health tracking, priority ordering, grep-glob invariant |
| `ranker.js` | ~130 | Result ranking (BM25 fallback), deduplication, token budget enforcement |
| `router.js` | ~220 | Main entry point: routing, fallback, validation, timeout |
| `backends/lexical.js` | ~100 | Grep/Glob adapter (baseline, always healthy) |
| `backends/structural.js` | ~100 | ast-grep MCP adapter |
| `backends/enhanced-lexical.js` | ~100 | Probe MCP adapter |
| `detection.js` | ~220 | Tool detection, project scale assessment |
| `install.js` | ~210 | Tool installation with consent, MCP server configuration |

## 2. Key Design Decisions

### 2.1 Dependency Injection for Testability

All backend adapters accept constructor options for injecting dependencies:
- `grepFn`/`globFn` for the lexical backend
- `mcpCallFn` for MCP-based backends
- `execFn` for detection and installation

This enables isolated unit testing without requiring actual tools to be installed.

### 2.2 Grep-Glob Invariant

The grep-glob backend cannot be removed from the registry or marked unhealthy. This is enforced at three levels:
1. `registry.removeBackend('grep-glob')` returns false
2. `registry.updateHealth('grep-glob', ...)` is a no-op
3. `config.writeSearchConfig()` always includes grep-glob in activeBackends

### 2.3 Fallback Strategy

The router tries backends in priority order within the requested modality. If all fail, it falls back to the grep-glob baseline. The router never throws to the caller when grep-glob is available -- only `INVALID_REQUEST` errors surface to callers.

### 2.4 Token Budget Enforcement

The ranker uses a chars/4 heuristic for token estimation (GPT-style). At least one result is always returned even if it exceeds the budget, preventing empty result sets from large single matches.

### 2.5 BM25 Fallback Scoring

When backends do not provide relevance scores, the ranker computes a simplified BM25-inspired score based on:
- Exact query match in content (0.4 bonus)
- Term overlap ratio (0.2 scaled)
- Inverse document length (0.1 scaled)
- Baseline score of 0.3

## 3. Security Considerations (Article III)

1. **Path traversal prevention**: Router validates `scope` parameter against project root
2. **Null byte rejection**: Query strings containing `\0` are rejected
3. **Query length limit**: Queries exceeding 10,000 characters are rejected
4. **No sensitive data logging**: Search queries are not written to state.json
5. **MCP config safety**: `configureMcpServers()` preserves existing configs and reports conflicts

## 4. Test Results

- **Total tests**: 180
- **Passing**: 180 (100%)
- **Line coverage**: 96.59%
- **Branch coverage**: 86.45%
- **Function coverage**: 96.43%

All tests use `node:test` runner with `node:assert/strict`, following existing project conventions.

## 5. Module System

All modules use ESM (import/export) per Article XIII, matching the `lib/` convention. Tests are `.test.js` files co-located with their modules.

## 6. Artifact Traceability (Article VII)

Each module file includes a JSDoc `@module` tag and references the relevant FR requirement:
- `FR-001` -> router.js
- `FR-002` -> registry.js
- `FR-003` -> detection.js
- `FR-004/005` -> install.js
- `FR-007` -> backends/structural.js
- `FR-008` -> backends/enhanced-lexical.js
- `FR-009` -> backends/lexical.js
- `FR-010` -> config.js
- `FR-011` -> ranker.js
