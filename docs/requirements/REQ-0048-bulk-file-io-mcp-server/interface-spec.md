# Interface Specification: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. MCP Tool Interfaces

### 1.1 write_files

**Description**: Write multiple files to disk atomically in a single call.

**Input Schema**:
```typescript
interface WriteFilesInput {
  files: Array<{
    path: string;     // Absolute file path
    content: string;  // File content (UTF-8)
  }>;
}
```

**Output Schema**:
```typescript
interface BatchResult {
  results: Array<{
    path: string;
    success: boolean;
    error?: string;   // Present when success === false
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
```

**Validation Rules**:
- All paths must be absolute (reject relative paths with error)
- `files` array must not be empty
- `content` must be a string (not null or undefined)

**Error Conditions**:
| Error | Cause | Recovery |
|-------|-------|----------|
| `INVALID_PATH` | Relative path provided | Caller resolves to absolute path and retries |
| `EACCES` | Permission denied | Caller checks permissions |
| `ENOSPC` | Disk full | Caller frees space and retries |
| `LOCK_TIMEOUT` | Another write to same path did not complete within 30s | Caller retries after delay |

### 1.2 read_files

**Description**: Read multiple files from disk in a single call.

**Input Schema**:
```typescript
interface ReadFilesInput {
  paths: string[];  // Array of absolute file paths
}
```

**Output Schema**:
```typescript
interface ReadBatchResult {
  results: Array<{
    path: string;
    success: boolean;
    content?: string;  // Present when success === true
    error?: string;    // Present when success === false
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
```

**Validation Rules**:
- All paths must be absolute
- `paths` array must not be empty

**Error Conditions**:
| Error | Cause | Recovery |
|-------|-------|----------|
| `INVALID_PATH` | Relative path provided | Caller resolves to absolute path |
| `ENOENT` | File does not exist | Caller handles missing file |
| `EACCES` | Permission denied | Caller checks permissions |

### 1.3 append_section

**Description**: Update a named section within a markdown file without rewriting the entire file from the caller's side.

**Input Schema**:
```typescript
interface AppendSectionInput {
  path: string;          // Absolute file path
  section_id: string;    // Section identifier (heading text or marker ID)
  content: string;       // New content to replace section body
  match_by?: 'heading' | 'marker';  // Default: 'heading'
}
```

**Output Schema**:
```typescript
interface SingleResult {
  path: string;
  success: boolean;
  error?: string;
}
```

**Validation Rules**:
- `path` must be absolute
- `section_id` must not be empty
- `content` must be a string

**Section Matching Behavior**:
- `match_by: 'heading'` (default): Searches for a markdown heading matching `section_id`. If `section_id` does not include a heading prefix (e.g., `##`), assumes `## ` (level 2).
- `match_by: 'marker'`: Searches for `<!-- section: {section_id} -->` comment.

**Error Conditions**:
| Error | Cause | Recovery |
|-------|-------|----------|
| `SECTION_NOT_FOUND` | No section matching `section_id` found | Caller verifies section ID or uses full write |
| `FILE_NOT_FOUND` | File at `path` does not exist | Caller creates file first via `write_files` |
| `INVALID_PATH` | Relative path provided | Caller resolves to absolute path |
| `LOCK_TIMEOUT` | Concurrent write in progress | Caller retries after delay |

### 1.4 create_directories

**Description**: Create multiple directories with recursive parent creation.

**Input Schema**:
```typescript
interface CreateDirectoriesInput {
  paths: string[];  // Array of absolute directory paths
}
```

**Output Schema**:
```typescript
interface BatchResult {
  results: Array<{
    path: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
```

**Validation Rules**:
- All paths must be absolute
- `paths` array must not be empty

**Error Conditions**:
| Error | Cause | Recovery |
|-------|-------|----------|
| `INVALID_PATH` | Relative path provided | Caller resolves to absolute path |
| `EACCES` | Permission denied | Caller checks permissions |
| `ENOTDIR` | Component of path is a file, not a directory | Caller resolves path conflict |

## 2. Internal Module Interfaces

### 2.1 lock-manager.js

```typescript
interface LockManager {
  acquire(absPath: string, timeoutMs?: number): Promise<() => void>;
  isLocked(absPath: string): boolean;
}
```

- `acquire` returns a release function. Caller MUST call the release function in a `finally` block.
- Default `timeoutMs`: 30000 (30 seconds)
- Throws `LockTimeoutError` if timeout expires

### 2.2 section-parser.js

```typescript
interface SectionBounds {
  start: number;   // Line index (0-based) of first content line after heading
  end: number;     // Line index (0-based) of line BEFORE next section (exclusive)
  level: number;   // Heading level (1-6)
}

interface SectionParser {
  findSection(content: string, sectionId: string, matchBy?: 'heading' | 'marker'): SectionBounds | null;
  spliceSection(content: string, bounds: SectionBounds, newContent: string): string;
}
```

## 3. MCP Server Configuration

### .mcp.json Entry

```json
{
  "mcpServers": {
    "code-index-mcp": {
      "command": "code-index-mcp",
      "args": ["--project-path", "."]
    },
    "bulk-fs-mcp": {
      "command": "node",
      "args": ["packages/bulk-fs-mcp/index.js"]
    }
  }
}
```

### Alternative (npx, post-extraction)

```json
{
  "mcpServers": {
    "bulk-fs-mcp": {
      "command": "npx",
      "args": ["bulk-fs-mcp"]
    }
  }
}
```
