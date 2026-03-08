# Module Design: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. Module Overview

The server is composed of four modules with clear single-responsibility boundaries:

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| `server.js` | MCP protocol handling, tool registration, request routing | MCP SDK, all operation modules |
| `file-ops.js` | Core file operations (atomic write, batch read, section update, directory creation) | `lock-manager.js` |
| `lock-manager.js` | Per-path mutex for concurrent write safety | None (Node.js built-ins) |
| `section-parser.js` | Markdown section identification and content splicing | None (string operations) |

## 2. Module: server.js (Entry Point)

### Responsibility
MCP protocol lifecycle management. Registers tools, parses incoming requests, routes to operation modules, and formats responses.

### Exports
- `main()` -- Process entry point, starts MCP server on stdio

### Tool Registrations

| Tool Name | Handler | Input Schema |
|-----------|---------|-------------|
| `write_files` | `fileOps.writeFiles(files)` | `{ files: [{ path: string, content: string }] }` |
| `read_files` | `fileOps.readFiles(paths)` | `{ paths: string[] }` |
| `append_section` | `fileOps.appendSection(path, sectionId, content, options)` | `{ path: string, section_id: string, content: string, match_by?: "heading" \| "marker" }` |
| `create_directories` | `fileOps.createDirectories(paths)` | `{ paths: string[] }` |

### Response Format (all tools)
```json
{
  "results": [
    { "path": "/abs/path/file.md", "success": true },
    { "path": "/abs/path/other.md", "success": false, "error": "EACCES: permission denied" }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

For `read_files`, successful results include a `content` field:
```json
{
  "results": [
    { "path": "/abs/path/file.md", "success": true, "content": "file content here" },
    { "path": "/abs/path/missing.md", "success": false, "error": "ENOENT: no such file" }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

## 3. Module: file-ops.js

### Responsibility
Core file I/O operations. Each operation validates inputs, acquires locks (for writes), performs the operation, and returns per-item results.

### Exports

#### `writeFiles(files: Array<{path: string, content: string}>): Promise<BatchResult>`

1. Validate all paths are absolute (reject relative paths)
2. For each file (concurrent via `Promise.allSettled`):
   a. Resolve absolute path
   b. Acquire per-path lock via `lockManager.acquire(absPath)`
   c. Ensure parent directory exists (`fs.mkdir` recursive)
   d. Generate temp path: `path.join(dir, '.${basename}.tmp.${process.pid}.${Date.now()}')`
   e. Write content to temp path (`fs.writeFile`)
   f. Flush to disk (`fs.fdatasync` or `fs.fsync`)
   g. Rename temp to target (`fs.rename`)
   h. Release lock
   i. Return `{ path, success: true }`
   j. On error: clean up temp file if exists, release lock, return `{ path, success: false, error: message }`
3. Aggregate results with summary counts

#### `readFiles(paths: string[]): Promise<BatchResult>`

1. Validate all paths are absolute
2. For each path (concurrent via `Promise.allSettled`):
   a. Read file (`fs.readFile` with `utf-8` encoding)
   b. Return `{ path, success: true, content }`
   c. On error: return `{ path, success: false, error: message }`
3. Aggregate results with summary counts

#### `appendSection(filePath: string, sectionId: string, content: string, options?: {matchBy: 'heading' | 'marker'}): Promise<SingleResult>`

1. Validate path is absolute
2. Acquire per-path lock
3. Read existing file content
4. Call `sectionParser.findSection(existingContent, sectionId, options.matchBy)`
5. If section not found: release lock, return error
6. Splice new content into section boundaries
7. Atomic write (same temp+rename pattern as `writeFiles`)
8. Release lock
9. Return result

#### `createDirectories(paths: string[]): Promise<BatchResult>`

1. Validate all paths are absolute
2. For each path (concurrent via `Promise.allSettled`):
   a. Create directory recursively (`fs.mkdir` with `{ recursive: true }`)
   b. Return `{ path, success: true }`
   c. On error: return `{ path, success: false, error: message }`
3. Aggregate results with summary counts

## 4. Module: lock-manager.js

### Responsibility
Per-path mutex management for concurrent write safety.

### Data Structures

```javascript
// Internal lock state
const locks = new Map();  // Map<absolutePath, { promise, resolve, waiters }>

// Lock entry
{
  promise: Promise,    // Resolves when lock is released
  resolve: Function,   // Call to release the lock
  waiters: number      // Number of pending acquirers
}
```

### Exports

#### `acquire(absPath: string, timeoutMs?: number): Promise<ReleaseFn>`

1. Normalize path (`path.resolve`)
2. If path not in `locks` map: create entry, return release function immediately
3. If path is locked: increment `waiters`, wait on existing promise with timeout
4. On timeout: decrement `waiters`, throw `LockTimeoutError`
5. On lock acquired: return release function
6. Release function: if `waiters > 0`, create new promise for next waiter; else delete from map

#### `isLocked(absPath: string): boolean`

Check if a path currently has an active lock.

### Configuration
- Default timeout: 30,000ms (30 seconds)
- Configurable per-call via `timeoutMs` parameter

## 5. Module: section-parser.js

### Responsibility
Markdown section identification and content splicing. Stateless string operations.

### Exports

#### `findSection(content: string, sectionId: string, matchBy?: 'heading' | 'marker'): SectionBounds | null`

1. If `matchBy === 'marker'` or marker found:
   a. Search for `<!-- section: ${sectionId} -->`
   b. If found: section starts at next line, ends at next heading of equal/higher level or next marker or EOF
2. If `matchBy === 'heading'` or default:
   a. Parse heading level from `sectionId` (e.g., `## Foo` -> level 2, `### Bar` -> level 3)
   b. If no heading prefix, assume `## ` (level 2)
   c. Search for heading line matching `sectionId`
   d. Section starts at next line after heading, ends at next heading of equal/higher level or EOF
3. Return `{ start: lineIndex, end: lineIndex, level: headingLevel }` or `null`

#### `spliceSection(content: string, bounds: SectionBounds, newContent: string): string`

1. Split content into lines
2. Replace lines from `bounds.start` to `bounds.end` with `newContent` lines
3. Rejoin and return

### Section Boundary Rules
- Section includes all content after the heading line until the next heading of **equal or higher** level
- A `## Foo` section ends at the next `##` or `#` heading, but NOT at a `###` sub-heading (sub-headings are part of the section)
- EOF terminates any open section
