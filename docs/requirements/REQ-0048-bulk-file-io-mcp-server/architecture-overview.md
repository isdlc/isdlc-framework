# Architecture Overview: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. Architecture Decision Records

### ADR-001: Server vs. Library

**Context**: The bulk I/O capability could be delivered as an MCP server (separate process) or as a shared library imported by agents.

| Option | Pros | Cons |
|--------|------|------|
| **A: MCP Server** | Protocol-standard; reusable across projects; matches existing `code-index-mcp` pattern; no changes to Claude Code internals | Separate process overhead; MCP protocol serialization cost |
| **B: Shared Library** | No IPC overhead; direct function calls | Not reusable outside iSDLC; no MCP ecosystem benefit; requires changes to Claude Code tool infrastructure |

**Decision**: Option A -- MCP Server. Matches the existing infrastructure pattern (`.mcp.json`), is reusable as a standalone npm package, and keeps the server decoupled from framework internals.

### ADR-002: Atomic Write Strategy

**Context**: Writes must be crash-safe. Multiple approaches exist for atomic file writes.

| Option | Pros | Cons |
|--------|------|------|
| **A: Temp file + rename (same directory)** | Atomic on POSIX; simple; guaranteed same-filesystem | Temp files visible briefly in directory listings |
| **B: Write to temp directory + rename** | Temp files not visible in target directory | Cross-filesystem rename fails; requires cleanup on crash |
| **C: fsync + direct overwrite** | No temp files | Not atomic -- crash mid-write leaves partial file |

**Decision**: Option A -- Temp file + rename in the same directory. POSIX `rename(2)` is atomic when source and target are on the same filesystem. Creating the temp file alongside the target guarantees this. Temp file naming convention `.{filename}.tmp.{pid}.{timestamp}` allows cleanup of orphans.

### ADR-003: Concurrency Model

**Context**: Multiple concurrent MCP tool calls may target the same file.

| Option | Pros | Cons |
|--------|------|------|
| **A: Per-path mutex** | Correct; prevents write races; cheap for typical workloads | Serializes concurrent writes to same path (acceptable -- rare case) |
| **B: Last-write-wins** | Simple; no locking overhead | Silent data loss if two callers write same file concurrently |
| **C: Conflict detection (fail second writer)** | Explicit conflict surfacing | Caller must retry; more complex error handling |

**Decision**: Option A -- Per-path mutex. The lock is keyed by absolute resolved path. Lock timeout of 30 seconds prevents deadlocks. Concurrent operations on different paths are fully parallel.

### ADR-004: Section Identification for `append_section`

**Context**: Markdown files do not have native section IDs. The server needs to locate sections for incremental updates.

| Option | Pros | Cons |
|--------|------|------|
| **A: Heading text match** | Works with standard markdown; no special markup required | Fragile if headings are renamed |
| **B: Marker comments** | Precise; rename-resistant | Requires all producers to emit markers |
| **C: Heading text + optional marker override** | Best of both; default works everywhere; precise when needed | Slightly more complex parsing |

**Decision**: Option C -- Heading text with optional marker override. Default behavior matches by heading text (`## Section Name`). If a marker comment (`<!-- section: id -->`) is present before a heading, it takes precedence. This keeps the API accessible for general use while supporting precision for power users.

### ADR-005: Package Location

**Context**: The server is general-purpose but developed within the iSDLC monorepo first.

| Option | Pros | Cons |
|--------|------|------|
| **A: `packages/bulk-fs-mcp/`** | Clear package boundary; standard monorepo convention; clean extraction path | New directory convention for iSDLC |
| **B: `lib/bulk-fs-mcp/`** | Consistent with existing `lib/` structure | `lib/` implies internal library, not standalone package |
| **C: `tools/bulk-fs-mcp/`** | Separates tools from library code | New convention; inconsistent with existing structure |

**Decision**: Option A -- `packages/bulk-fs-mcp/`. Establishes a clear `packages/` convention for standalone MCP servers. The directory contains its own `package.json`, entry point, and tests with zero imports from the parent project.

## 2. Technology Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Runtime | Node.js 18+ | Deno, Python | Matches iSDLC runtime; no additional dependencies for users |
| MCP SDK | `@modelcontextprotocol/sdk` | Raw stdio protocol | Official SDK reduces boilerplate; well-tested protocol handling |
| Dependencies | Zero runtime deps (except MCP SDK) | Express, Fastify | Minimal footprint; Node.js built-ins (`fs`, `path`, `os`, `crypto`) are sufficient |
| Transport | stdio | HTTP, WebSocket | MCP standard for local servers; matches `code-index-mcp` pattern |
| Temp file naming | `.{name}.tmp.{pid}.{ts}` | UUID-based, counter-based | PID+timestamp is unique enough; allows orphan identification |

## 3. Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| Claude Code runtime | bulk-fs-mcp server | MCP protocol (stdio) | JSON-RPC over stdio |
| `.mcp.json` | Claude Code | Server registration | JSON config |
| Roundtable analyst agent | bulk-fs-mcp `write_files` | MCP tool call | `{files: [{path, content}]}` |
| Roundtable analyst agent | bulk-fs-mcp `read_files` | MCP tool call | `{paths: [string]}` |
| Test design engineer | bulk-fs-mcp `write_files` | MCP tool call | `{files: [{path, content}]}` |
| Software developer agent | bulk-fs-mcp `read_files` | MCP tool call | `{paths: [string]}` |
| Add verb (isdlc.md) | bulk-fs-mcp `create_directories` | MCP tool call | `{paths: [string]}` |
| All consumers | Built-in Read/Write | Fallback tools | Standard tool protocol |

## 4. Data Flow

```
Consumer Agent
    |
    | MCP tool call (JSON-RPC)
    v
bulk-fs-mcp server (Node.js process)
    |
    | Parse request, validate inputs
    | Acquire per-path mutex (for writes)
    |
    +---> write_files: for each file:
    |       1. Ensure parent directory exists (mkdir -p)
    |       2. Write content to temp file (.name.tmp.pid.ts)
    |       3. fsync temp file
    |       4. Rename temp file to target (atomic)
    |       5. Release mutex
    |       6. Record per-file result
    |
    +---> read_files: for each file (concurrent):
    |       1. Read file content (fs.readFile)
    |       2. Record per-file result (content or error)
    |
    +---> append_section:
    |       1. Read existing file
    |       2. Parse section boundaries (heading or marker)
    |       3. Splice new content into section
    |       4. Atomic write (same as write_files)
    |
    +---> create_directories: for each path:
    |       1. mkdir recursive
    |       2. Record per-path result
    |
    v
Response (JSON-RPC)
    |
    | Per-item results array + summary counts
    v
Consumer Agent (processes results, retries failures if needed)
```

## 5. Fail-Open Architecture

```
Consumer Agent Decision Flow:

1. Check .mcp.json for bulk-fs-mcp registration
   |
   +-- Not registered --> Use built-in Read/Write tools
   |
   +-- Registered --> Attempt MCP tool call
       |
       +-- Server responds --> Use response
       |
       +-- Server unreachable / error --> Fall back to built-in Read/Write tools
```

This matches the existing pattern used by the search abstraction layer (`.isdlc/search-config.json` check, try enhanced search, fall back to Grep/Glob).
