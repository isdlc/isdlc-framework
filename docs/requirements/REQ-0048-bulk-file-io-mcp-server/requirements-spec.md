# Requirements Specification: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 95%
**Source**: REQ-0048 / GH-114

---

## 1. Problem Statement

The iSDLC framework performs extensive file I/O during workflow execution. Analysis phases write 8-10+ artifacts sequentially, each as a separate `Write` tool call with per-call overhead (permission checks, disk I/O, response serialization). Progressive artifact writes compound this by rewriting full files as content grows. The result is 6-8 minute waits after analysis finalization and additional delays during test design-to-implementation handoffs. Batch reads of known files (cross-checks, test case loading) also suffer from sequential overhead, with minutes-long waits before agents can proceed.

This is not iSDLC-specific -- any Claude Code project performing multi-file operations suffers from the same sequential overhead.

**Cost of inaction**: Users experience multi-minute delays during artifact-heavy phases, reducing productivity and breaking flow. The overhead scales linearly with artifact count.

## 2. User Types

| User Type | Role | Interest |
|-----------|------|----------|
| **Framework developer** | Primary. iSDLC contributor building/analyzing features | Faster analysis and build cycles |
| **Claude Code user** | Primary. Any developer using Claude Code with multi-file workflows | Reduced I/O overhead for any file-heavy task |
| **MCP server consumer** | Secondary. Developers integrating the server into their own toolchains | Clean, generic API with no framework coupling |

## 3. Success Metrics

- Batch write of 8-10 files completes in a single tool call instead of 8-10 sequential calls
- Post-analysis finalization time reduced from 6-8 minutes to under 1 minute
- Zero data loss from crashes during write operations (atomic write guarantee)
- Per-file error reporting enables automatic recovery from partial batch failures
- Batch read of known-path files completes in a single tool call instead of sequential reads

## 4. Functional Requirements

### FR-001: Batch File Write (Must Have)
**Confidence**: High

The server must accept a batch of file write operations and execute them in a single tool call. Each file in the batch is written atomically using the temp-file-then-rename pattern.

**Acceptance Criteria**:
- **AC-001-01**: `write_files` accepts an array of `{path, content}` objects and writes all files to disk
- **AC-001-02**: Each file is written to a temporary file first, then atomically renamed to the target path
- **AC-001-03**: If a crash occurs mid-batch, completed files are intact on disk and incomplete files retain their original content (or do not exist if new)
- **AC-001-04**: The response returns a per-file status array with `{path, success, error?}` for each input file
- **AC-001-05**: Parent directories are created automatically if they do not exist (recursive mkdir)
- **AC-001-06**: Concurrent writes to the same file path are serialized via a per-path mutex to prevent race conditions

### FR-002: Batch File Read (Must Have)
**Confidence**: High

The server must accept a batch of file read operations and return all file contents in a single tool call. This operation is for reading files whose paths are already known -- not for file discovery (which is handled by semantic search via `code-index-mcp`).

**Acceptance Criteria**:
- **AC-002-01**: `read_files` accepts an array of file paths and returns the content of each file
- **AC-002-02**: If a file does not exist or is unreadable, its entry in the response includes an error and remaining files are still read
- **AC-002-03**: The response returns a per-file result array with `{path, content?, error?}` for each input path
- **AC-002-04**: Files are read concurrently for maximum throughput

**Usage Boundary** (FR-002 vs semantic search):

| Scenario | Tool | Rationale |
|----------|------|-----------|
| Search codebase for relevant files during analysis | `code-index-mcp` (semantic search) | Discovery -- agent does not know which files are relevant |
| Search for patterns during implementation | `code-index-mcp` (semantic search) | Discovery -- agent is finding code to understand or modify |
| Read specific artifact files for cross-check | `bulk-fs-mcp` `read_files` | Known paths -- agent has the exact file list |
| Read test case files before implementation | `bulk-fs-mcp` `read_files` | Known paths -- file paths come from test design output |
| Read persona/topic files at startup | `bulk-fs-mcp` `read_files` | Known paths -- file paths are configured |
| Read a single file | Built-in `Read` tool | Simplest path for single files |

### FR-003: Incremental Section Update (Should Have)
**Confidence**: High

The server must support updating a named section within a markdown file without the caller needing to read and rewrite the full file.

**Acceptance Criteria**:
- **AC-003-01**: `append_section` accepts a file path, section identifier, and new content
- **AC-003-02**: Section identification uses markdown heading text matching by default (e.g., `## Section Name`)
- **AC-003-03**: An optional marker comment format (`<!-- section: id -->`) is supported for precise section identification
- **AC-003-04**: The section content is replaced between the identified heading and the next heading of equal or higher level
- **AC-003-05**: The write uses the same atomic temp-file-then-rename pattern as `write_files`
- **AC-003-06**: If the section is not found, the server returns an error (does not silently append to end of file)
- **AC-003-07**: If the file does not exist, the server returns an error

### FR-004: Batch Directory Creation (Must Have)
**Confidence**: High

The server must support creating multiple directories in a single tool call with recursive semantics.

**Acceptance Criteria**:
- **AC-004-01**: `create_directories` accepts an array of directory paths
- **AC-004-02**: Each directory is created with `mkdir -p` semantics (parent directories created as needed, no error if already exists)
- **AC-004-03**: The response returns a per-path status array with `{path, success, error?}`
- **AC-004-04**: Success means the directory exists after the call (whether created or already present)

### FR-005: Per-File Error Reporting (Must Have)
**Confidence**: High

All batch operations must report success or failure individually for each item in the batch, enabling callers to identify and retry only failed items.

**Acceptance Criteria**:
- **AC-005-01**: Every batch operation returns an array of results with one entry per input item
- **AC-005-02**: Each result entry includes the input path, a boolean success indicator, and an optional error message
- **AC-005-03**: A failure in one item does not abort processing of remaining items in the batch
- **AC-005-04**: The overall response includes a summary `{total, succeeded, failed}` count

### FR-006: Atomic Write Safety (Must Have)
**Confidence**: High

All write operations (including `append_section`) must use the atomic temp-file-then-rename pattern to guarantee crash safety.

**Acceptance Criteria**:
- **AC-006-01**: Write operations create a temporary file in the same directory as the target (ensuring same filesystem for atomic rename)
- **AC-006-02**: Content is fully written and flushed to the temporary file before rename
- **AC-006-03**: The rename operation replaces the target file atomically (POSIX rename semantics)
- **AC-006-04**: If the process crashes before rename, the original file is untouched
- **AC-006-05**: Temporary files use a naming convention that allows cleanup if orphaned (e.g., `.{filename}.tmp.{pid}`)

### FR-007: Concurrency Control (Should Have)
**Confidence**: High

The server must handle concurrent tool calls safely using per-path locking.

**Acceptance Criteria**:
- **AC-007-01**: A per-path mutex prevents concurrent writes to the same file path
- **AC-007-02**: The mutex is keyed by the absolute resolved file path (handles symlinks and relative paths)
- **AC-007-03**: Lock acquisition has a configurable timeout (default: 30 seconds) to prevent deadlocks
- **AC-007-04**: Concurrent operations on different file paths proceed in parallel without blocking
- **AC-007-05**: The mutex applies across all write operations (`write_files`, `append_section`, `create_directories`)

### FR-008: Fail-Open Fallback (Must Have)
**Confidence**: High

Consumers of the MCP server must be able to detect server unavailability and fall back to the built-in Read/Write tools without workflow interruption.

**Acceptance Criteria**:
- **AC-008-01**: The server's presence is detected via `.mcp.json` configuration
- **AC-008-02**: If the server process is not running or unresponsive, consumers use built-in Read/Write tools
- **AC-008-03**: No workflow fails due to MCP server unavailability -- all operations have built-in tool equivalents
- **AC-008-04**: The fail-open detection follows the same pattern as the existing search abstraction layer (check config, try MCP, fall back)

### FR-009: Standalone Package Structure (Should Have)
**Confidence**: High

The server must be structured as a self-contained package within the iSDLC monorepo, ready for future extraction to an independent repository.

**Acceptance Criteria**:
- **AC-009-01**: Server code lives in a dedicated directory (e.g., `packages/bulk-fs-mcp/`)
- **AC-009-02**: The package has its own `package.json` with no dependencies on iSDLC internals
- **AC-009-03**: The entry point is executable via `npx` or direct `node` invocation
- **AC-009-04**: The package can be extracted to a separate repository without code changes

## 5. Non-Functional Requirements

### NFR-001: Performance
- Batch write of 10 files must complete faster than 10 sequential built-in Write tool calls
- Batch read of 10 files must complete faster than 10 sequential built-in Read tool calls
- Server cold start time under 500ms (Node.js process spawn)
- Memory footprint under 50MB during normal operation (no caching, no state)

### NFR-002: Reliability
- Zero data loss guarantee via atomic writes
- Graceful degradation on partial batch failures
- No in-memory buffering -- every operation hits disk immediately

### NFR-003: Compatibility
- Node.js 18+ (matches iSDLC minimum)
- MCP protocol compliant (stdio transport)
- Works on macOS, Linux, and Windows (POSIX rename semantics, with Windows fallback)

### NFR-004: Footprint
- Server implementation under 300 lines of Node.js (excluding tests)
- Zero external runtime dependencies (Node.js built-in modules only)
- Self-contained -- no imports from host project

## 6. Tool Selection Guidance

Consumer agents must use the correct tool for each I/O scenario. This server complements -- not replaces -- semantic search and built-in tools.

| I/O Pattern | Tool | When to Use |
|-------------|------|-------------|
| **File discovery** (find relevant files by content/pattern) | `code-index-mcp` (semantic search) | Codebase scanning during analysis, pattern search during implementation, dependency tracing |
| **Known-path batch read** (fetch files whose paths you know) | `bulk-fs-mcp` `read_files` | Cross-check reads, test case loading, startup file reads |
| **Known-path batch write** (write multiple files at once) | `bulk-fs-mcp` `write_files` | Artifact finalization, test case output, batch file creation |
| **Section update** (update part of a markdown file) | `bulk-fs-mcp` `append_section` | Progressive artifact writes during analysis |
| **Directory setup** (create folder structures) | `bulk-fs-mcp` `create_directories` | Artifact folder creation in add/analyze verbs |
| **Single file read** | Built-in `Read` tool | One-off file reads where batching adds no value |
| **Single file write** | Built-in `Write` tool | One-off file writes where batching adds no value |

## 7. Out of Scope

- **File deletion**: Handled by existing tooling. Not included to keep the server constructive-only.
- **File search or indexing**: Handled by the semantic search MCP server (`code-index-mcp`).
- **In-memory buffering or caching**: Conflicts with crash safety goal. Every call hits disk.
- **iSDLC-specific awareness**: No knowledge of artifacts, slugs, meta.json, or workflow concepts.
- **Directory deletion**: Destructive operation with recursive safety concerns. Not included.
- **Binary file handling**: Server targets text files (UTF-8). Binary file support is out of scope.
- **File watching or notifications**: Server is passive -- responds to calls, does not monitor the filesystem.

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MCP protocol serializes calls to a single server, limiting concurrency | Medium | High | Batch operations are the primary parallelism mechanism; single-call batching eliminates the need for concurrent MCP calls to the same server |
| Atomic rename not supported on all filesystems (e.g., cross-device moves) | Low | Medium | Temp file created in same directory as target, ensuring same filesystem |
| Per-path mutex introduces deadlocks under pathological concurrent access | Low | Medium | Lock timeout (30s default) prevents indefinite blocking |
| Consumer integration requires agent file updates across multiple verbs | Medium | Low | Fail-open pattern means updates are additive -- existing behavior preserved if server is absent |
| Agents use `read_files` for discovery instead of semantic search | Medium | Low | Tool selection guidance (Section 6) explicitly documents when to use each tool; agent instructions enforce the boundary |

## 9. Dependencies

- Node.js built-in modules: `fs`, `path`, `os`, `crypto` (for temp file naming)
- MCP SDK: `@modelcontextprotocol/sdk` (for MCP protocol compliance)
- No other external dependencies

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Atomic write** | Write pattern using temp file + rename to ensure the target file is never in a partial state |
| **MCP** | Model Context Protocol -- standard for tool servers that Claude Code communicates with |
| **Fail-open** | Design pattern where failure of an optional component does not block the primary workflow |
| **Per-path mutex** | Concurrency lock keyed by absolute file path, preventing simultaneous writes to the same file |
| **Progressive write** | Pattern where an artifact file is rewritten in full each time new content is added during analysis |
| **Semantic search** | File discovery via content relevance using `code-index-mcp` -- distinct from known-path batch reads |
