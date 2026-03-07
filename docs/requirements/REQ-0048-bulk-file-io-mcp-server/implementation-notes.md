# Implementation Notes: Bulk File I/O MCP Server

**Phase**: 06-implementation
**Requirement**: REQ-0048 / GH-114
**Package**: `packages/bulk-fs-mcp/`
**Date**: 2026-03-07

---

## 1. Architecture Summary

The implementation follows the module design exactly with 4 source modules:

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `section-parser.js` | ~95 | Markdown section identification and content splicing |
| `lock-manager.js` | ~85 | Per-path mutex with FIFO ordering and configurable timeout |
| `file-ops.js` | ~165 | Core file operations (write, read, appendSection, createDirectories) |
| `server.js` | ~155 | MCP server entry point, tool registration, request routing |

Supporting files:
- `index.js` — Shebang entry point (`#!/usr/bin/env node`)
- `package.json` — Standalone package with `@modelcontextprotocol/sdk` as sole dependency

## 2. Key Implementation Decisions

### 2.1 Atomic Write Pattern (FR-006)
- Writes to temp file `.{basename}.tmp.{pid}.{timestamp}` in same directory as target
- Uses `fd.datasync()` to flush to disk before rename
- On error: closes fd, cleans up temp file, re-throws
- Same-directory placement ensures atomic rename (same filesystem)

### 2.2 Per-Path Mutex (FR-007)
- Factory function `createLockManager()` creates isolated instances (one per `createFileOps()`)
- Paths normalized via `path.resolve()` before lock map lookup
- FIFO queue ordering via array-based waiter queue
- Timeout via `setTimeout` per-waiter; cleared on acquire
- Release idempotent (guarded by `released` boolean)
- Lock map entry cleaned up when queue drains to zero

### 2.3 Section Parser (FR-003)
- Heading match: exact string comparison (strict, no regex fuzziness)
- No heading prefix in sectionId defaults to `## ` (level 2)
- Marker match: searches for `<!-- section: {id} -->` verbatim
- Section bounds are line-based (0-indexed), exclusive end
- `spliceSection` is pure string operation using array splice

### 2.4 MCP SDK Integration (FR-009)
- Uses `McpServer` (high-level API) from `@modelcontextprotocol/sdk/server/mcp.js`
- Uses `StdioServerTransport` for stdio communication
- Tool schemas defined using Zod (available as transitive dependency of SDK)
- `createServer()` exposes `callTool()` for direct testing without transport

### 2.5 CommonJS Module System
- All modules use `require()`/`module.exports` (CJS)
- MCP SDK imported via `require('@modelcontextprotocol/sdk/server/mcp.js')` — uses the SDK's `exports["./\*"]` wildcard map

## 3. Test Summary

| Test File | Tests | Type |
|-----------|-------|------|
| `section-parser.test.js` | 22 | Unit |
| `lock-manager.test.js` | 14 | Unit |
| `file-ops.test.js` | 32 | Unit |
| `server.test.js` | 10 | Unit |
| `integration/file-ops-locking.test.js` | 8 | Integration |
| `integration/section-update.test.js` | 6 | Integration |
| `integration/server-e2e.test.js` | 8 | Integration |
| `e2e/server-lifecycle.test.js` | 4 | E2E |
| **Total** | **104** | |

### Coverage (unit tests only)

| Module | Line % | Branch % | Function % |
|--------|--------|----------|------------|
| `section-parser.js` | 100.00 | 100.00 | 100.00 |
| `lock-manager.js` | 100.00 | 89.47 | 100.00 |
| `file-ops.js` | 96.86 | 91.38 | 100.00 |
| `server.js` | 68.85 | 100.00 | 36.36 |
| **Overall** | **90.82** | **94.31** | **82.50** |

Server.js line/function coverage is lower because the MCP tool handler wrappers (lines that format `{ content: [{ type: 'text', text: ... }] }`) are only exercised through the MCP transport path, which is covered by integration and E2E tests. The overall coverage well exceeds the 80% threshold.

## 4. Dependencies

- **Runtime**: `@modelcontextprotocol/sdk` ^1.0.0 (installed as ^1.27.1)
- **Transitive**: `zod` (used for tool schema definitions)
- **Node.js built-ins**: `fs`, `fs/promises`, `path`, `os`, `child_process` (test only)
- **Zero iSDLC imports**: Package is fully self-contained

## 5. File Structure

```
packages/bulk-fs-mcp/
  package.json
  index.js                              # Entry point
  server.js                             # MCP server + tool registration
  file-ops.js                           # Core file operations
  lock-manager.js                       # Per-path mutex
  section-parser.js                     # Markdown section operations
  section-parser.test.js                # 22 unit tests
  lock-manager.test.js                  # 14 unit tests
  file-ops.test.js                      # 32 unit tests
  server.test.js                        # 10 unit tests
  integration/
    file-ops-locking.test.js            # 8 integration tests
    section-update.test.js              # 6 integration tests
    server-e2e.test.js                  # 8 integration tests
  e2e/
    server-lifecycle.test.js            # 4 E2E tests
  node_modules/                         # (gitignored)
```

## 6. Configuration Changes

- `.mcp.json`: Added `bulk-fs-mcp` entry pointing to `packages/bulk-fs-mcp/index.js`

## 7. TDD Compliance (Article II)

All modules implemented using TDD Red-Green-Refactor:
1. Tests written first for each module
2. Implementation followed to make tests pass
3. One test fix iteration (FO-13 had incorrect test setup using relative path in batch)

## 8. Security Considerations (Article III)

- All paths validated as absolute before any I/O (`path.isAbsolute()`)
- Path traversal prevented: relative paths rejected at validation layer
- Temp file cleanup on error prevents orphaned data
- Lock timeout prevents indefinite blocking (30s default)
- No shell execution — all operations use Node.js built-in APIs
