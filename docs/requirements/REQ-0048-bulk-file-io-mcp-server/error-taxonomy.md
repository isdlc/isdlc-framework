# Error Taxonomy: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 85%

---

## 1. Error Categories

### 1.1 Validation Errors (Client-Side)

Errors caused by invalid input from the caller. The server rejects the entire request.

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| `INVALID_PATH` | Error | A path is not absolute | Caller resolves to absolute path and retries |
| `EMPTY_BATCH` | Error | The files/paths array is empty | Caller provides at least one item |
| `MISSING_CONTENT` | Error | A file entry has null/undefined content | Caller provides content string |
| `MISSING_SECTION_ID` | Error | `section_id` is empty or missing in `append_section` | Caller provides section identifier |

### 1.2 Filesystem Errors (Server-Side)

Errors from the underlying filesystem. Reported per-item in batch results.

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| `ENOENT` | Error | File or directory does not exist | Caller creates file/directory first |
| `EACCES` | Error | Permission denied | Caller checks file/directory permissions |
| `ENOSPC` | Critical | Disk full | Caller frees disk space and retries |
| `ENOTDIR` | Error | Path component is not a directory | Caller resolves path conflict |
| `EISDIR` | Error | Target is a directory, not a file | Caller provides correct path |
| `EMFILE` | Warning | Too many open files | Server retries with backoff; caller retries if persists |

### 1.3 Concurrency Errors

Errors from the per-path locking mechanism.

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| `LOCK_TIMEOUT` | Error | Could not acquire lock within timeout period (default 30s) | Caller retries after delay |

### 1.4 Section Parsing Errors (append_section only)

Errors specific to section identification in markdown files.

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| `SECTION_NOT_FOUND` | Error | No heading or marker matching `section_id` found | Caller verifies section ID or uses `write_files` for full replacement |
| `FILE_NOT_FOUND` | Error | The target file does not exist | Caller creates file first via `write_files` |

### 1.5 Server Errors

Errors from the MCP server infrastructure.

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| `INTERNAL_ERROR` | Critical | Unexpected server error | Caller falls back to built-in tools |
| `PROTOCOL_ERROR` | Critical | MCP protocol violation | Caller falls back to built-in tools |

## 2. Error Response Format

### Per-Item Error (in batch results)
```json
{
  "path": "/absolute/path/to/file.md",
  "success": false,
  "error": "EACCES: permission denied, open '/absolute/path/to/file.md'"
}
```

### Request-Level Error (validation failures)
```json
{
  "error": {
    "code": "INVALID_PATH",
    "message": "All paths must be absolute. Relative path found: 'relative/path.md'"
  }
}
```

## 3. Error Propagation Rules

1. **Validation errors** reject the entire request before any I/O occurs
2. **Filesystem errors** are captured per-item; other items in the batch continue processing
3. **Lock timeout errors** are captured per-item; other items proceed independently
4. **Section parsing errors** return immediately (single-item operation)
5. **Server errors** fall through to the MCP protocol error handling

## 4. Temp File Cleanup

Orphaned temp files (from crashes) follow this convention:
- Pattern: `.{filename}.tmp.{pid}.{timestamp}`
- Identification: Any file matching `.*.tmp.*.*` in the target directory
- Cleanup: Not automatic. The server does not clean up orphans from previous sessions. Users or external tooling can safely delete files matching this pattern.
- Safety: Temp files are never the canonical version of any file. Deleting them is always safe.
