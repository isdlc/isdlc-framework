# Design Summary: Bulk File I/O MCP Server

**Accepted**: 2026-03-07

---

**Module Architecture** (4 modules, single responsibility each):

| Module | Responsibility |
|--------|---------------|
| `server.js` | MCP protocol lifecycle, tool registration, request routing |
| `file-ops.js` | Core operations: atomic write, batch read, section update, directory creation |
| `lock-manager.js` | Per-path mutex with 30s configurable timeout |
| `section-parser.js` | Markdown heading/marker identification, content splicing |

**Data Flow for Key Workflows**:
- **Batch write**: Validate paths -> concurrent per-file processing (acquire lock -> mkdir parent -> write temp -> fsync -> atomic rename -> release lock) -> aggregate per-file results
- **Batch read**: Validate paths -> concurrent `fs.readFile` (no locking) -> aggregate per-file results with content
- **Section update**: Validate -> acquire lock -> read file -> find section boundaries (heading or marker) -> splice content -> atomic write -> release lock
- **Directory creation**: Validate paths -> concurrent `fs.mkdir` recursive -> aggregate per-path results

**Interface Contracts**:
- All batch operations return `{ results: [{path, success, error?}], summary: {total, succeeded, failed} }`
- `read_files` results additionally include `content` field on success
- `append_section` returns a single result (not a batch)
- All paths must be absolute (validation rejects relative paths)

**Section Boundary Rules**:
- Section ends at next heading of equal or higher level (sub-headings are part of the section)
- Default matching: heading text (`## Section Name`). Override: marker comment (`<!-- section: id -->`)
- Section not found returns error -- no silent append

**Error Handling**:
- Validation errors reject the entire request before I/O
- Filesystem errors captured per-item; other items continue
- Lock timeout captured per-item; other items proceed
- Orphaned temp files (`.{name}.tmp.{pid}.{ts}`) are safe to delete -- never canonical

**Assumptions and Inferences**: None. All design decisions flow from confirmed requirements and architecture.

Detailed artifacts: `module-design.md`, `interface-spec.md`, `data-flow.md`, `error-taxonomy.md`
