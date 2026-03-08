# REQ-0048: Bulk File I/O MCP Server

## Source
Manual entry — conversation on 2026-03-07

## Type
Feature / Performance optimization

## Problem
The iSDLC framework creates many files during workflows (requirements specs, impact analysis, architecture docs, module designs, meta.json, traceability artifacts, etc.). Each file write is a separate `Write` tool call with overhead — permission check, disk I/O, response serialization. Progressive artifact writes (rewriting the full file as content grows) multiply this further.

This slows down the user experience significantly, especially during analysis and implementation phases where 8-10+ files may be written in quick succession.

## Proposed Solution
A local MCP server that provides multi-file I/O operations — writing or reading multiple files in a single tool call. No in-memory buffering; every call hits disk immediately.

### Key Operations
- `write_files([{path, content}, ...])` — write multiple files to disk in one tool call
- `read_files([path, ...])` — read multiple files in one tool call
- `append_section(path, section_id, content)` — update a named section in a markdown file without rewriting the whole thing (addresses progressive rewrite overhead)

### Design Constraints
- **Disk-backed only** — no in-memory buffering. Must survive session crashes, context compaction, credit exhaustion, and laptop crashes.
- **Session-agnostic** — next session reads disk normally via standard Read tool. No state to recover.
- **Fail-open** — if the MCP server is unavailable, fall back to standard Write/Read tools.
- **Small footprint** — estimated ~100-150 lines of Node.js.

## Value
- Turns N sequential Write tool calls into 1 call (e.g., 8 writes → 1)
- Reduces round-trip overhead during artifact-heavy phases
- Section-level markdown updates avoid full-file rewrites during progressive writes
- No change to existing file layout or artifact structure
