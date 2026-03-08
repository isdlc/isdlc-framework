# Data Flow: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. Write Files Flow

```
Caller (Agent)
  |
  | MCP call: write_files({ files: [{path, content}, ...] })
  v
server.js: parseRequest()
  |
  | Validate: all paths absolute, files array non-empty
  v
file-ops.js: writeFiles(files)
  |
  | Promise.allSettled(files.map(file => writeSingleFile(file)))
  |
  +---> For each file (concurrent):
  |       |
  |       v
  |     lock-manager.js: acquire(absPath)
  |       |
  |       | (wait if locked, timeout after 30s)
  |       v
  |     fs.mkdir(parentDir, { recursive: true })
  |       |
  |       v
  |     fs.writeFile(tempPath, content, 'utf-8')
  |       |
  |       v
  |     fs.open(tempPath) -> fd.sync() -> fd.close()
  |       |
  |       v
  |     fs.rename(tempPath, targetPath)  [ATOMIC]
  |       |
  |       v
  |     lock-manager.js: release()
  |       |
  |       v
  |     { path, success: true }
  |
  v
Aggregate results + summary counts
  |
  v
MCP response -> Caller
```

## 2. Read Files Flow

```
Caller (Agent)
  |
  | MCP call: read_files({ paths: [path1, path2, ...] })
  v
server.js: parseRequest()
  |
  | Validate: all paths absolute, paths array non-empty
  v
file-ops.js: readFiles(paths)
  |
  | Promise.allSettled(paths.map(p => readSingleFile(p)))
  |
  +---> For each path (concurrent, no locking):
  |       |
  |       v
  |     fs.readFile(path, 'utf-8')
  |       |
  |       +-- success --> { path, success: true, content }
  |       +-- error   --> { path, success: false, error: message }
  |
  v
Aggregate results + summary counts
  |
  v
MCP response -> Caller
```

## 3. Append Section Flow

```
Caller (Agent)
  |
  | MCP call: append_section({ path, section_id, content, match_by })
  v
server.js: parseRequest()
  |
  | Validate: path absolute, section_id non-empty
  v
file-ops.js: appendSection(path, sectionId, content, options)
  |
  v
lock-manager.js: acquire(absPath)
  |
  v
fs.readFile(path, 'utf-8')
  |
  +-- ENOENT --> release lock, return { success: false, error: "FILE_NOT_FOUND" }
  |
  v
section-parser.js: findSection(fileContent, sectionId, matchBy)
  |
  +-- null --> release lock, return { success: false, error: "SECTION_NOT_FOUND" }
  |
  v
section-parser.js: spliceSection(fileContent, bounds, newContent)
  |
  v
Atomic write (temp file -> fsync -> rename)
  |
  v
lock-manager.js: release()
  |
  v
MCP response: { path, success: true }
```

## 4. Create Directories Flow

```
Caller (Agent)
  |
  | MCP call: create_directories({ paths: [dir1, dir2, ...] })
  v
server.js: parseRequest()
  |
  | Validate: all paths absolute, paths array non-empty
  v
file-ops.js: createDirectories(paths)
  |
  | Promise.allSettled(paths.map(p => createSingleDir(p)))
  |
  +---> For each path (concurrent):
  |       |
  |       v
  |     fs.mkdir(path, { recursive: true })
  |       |
  |       +-- success (created or already exists) --> { path, success: true }
  |       +-- error --> { path, success: false, error: message }
  |
  v
Aggregate results + summary counts
  |
  v
MCP response -> Caller
```

## 5. Fail-Open Decision Flow

```
Consumer Agent (roundtable, test-design, software-developer)
  |
  | Need to write/read files
  v
Check: Is bulk-fs-mcp registered in .mcp.json?
  |
  +-- NO --> Use built-in Write/Read tools (standard behavior)
  |
  +-- YES --> Attempt MCP tool call
       |
       +-- Success --> Process BatchResult response
       |                |
       |                +-- All succeeded --> Continue
       |                +-- Some failed --> Retry failed items with built-in tools
       |
       +-- Server error / unreachable --> Fall back to built-in Write/Read tools
```

## 6. Atomic Write Detail (Crash Safety Trace)

```
State transitions for a single file write:

INITIAL STATE: target.md exists with old content (or does not exist)

Step 1: Write temp file
  Disk: target.md (old), .target.md.tmp.12345.1709856000000 (new)
  CRASH HERE: target.md intact, temp file is orphan (cleanable)

Step 2: fsync temp file
  Disk: target.md (old), .target.md.tmp.12345.1709856000000 (new, flushed)
  CRASH HERE: target.md intact, temp file is orphan (cleanable)

Step 3: rename temp -> target (ATOMIC)
  Disk: target.md (new content)
  CRASH HERE: target.md has new content (rename completed)

POST STATE: target.md has new content, no temp file

At no point does target.md contain partial content.
```

## 7. Concurrency Trace (Two Concurrent Writes to Same Path)

```
Writer A: write_files([{path: "/x/f.md", content: "A"}])
Writer B: write_files([{path: "/x/f.md", content: "B"}])

Time -->

Writer A: acquire("/x/f.md")  --> LOCKED (A holds)
Writer B: acquire("/x/f.md")  --> WAITING (B queued)

Writer A: write temp, fsync, rename  --> f.md = "A"
Writer A: release("/x/f.md")         --> B unblocked

Writer B: acquire("/x/f.md")  --> LOCKED (B holds)
Writer B: write temp, fsync, rename  --> f.md = "B"
Writer B: release("/x/f.md")

Result: f.md = "B" (last writer wins, but each write was atomic and serial)
No data corruption. No partial content.
```
