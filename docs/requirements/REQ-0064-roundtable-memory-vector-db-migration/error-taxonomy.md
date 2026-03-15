# Error Taxonomy: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Error Codes

### 1.1 Embedding Errors (EMB-*)

| Code | Name | Trigger | Severity | Recovery |
|---|---|---|---|---|
| EMB-001 | Embedding backend unavailable | No embedding engine configured or engine health check fails | Warning | Raw session record persists; no embedding; lazy embed on next read |
| EMB-002 | Embedding failed | Engine returns error during embed() call | Warning | Record stays `embedded: false`; retry on next session or lazy embed |
| EMB-003 | Chunk generation failed | Knowledge pipeline cannot chunk session text | Warning | Skip embedding for this record; raw JSON persists |
| EMB-004 | Index write failed | Cannot write .emb file (permissions, disk full) | Warning | Raw JSON persists; index unchanged; retry on next session |

### 1.2 Search Errors (SRC-*)

| Code | Name | Trigger | Severity | Recovery |
|---|---|---|---|---|
| SRC-001 | Index not found | .emb file does not exist at expected path | Info | Skip this index; search other index; fall back to flat JSON if both missing |
| SRC-002 | Index corrupted | .emb file cannot be read or deserialized | Warning | Skip this index; fall back to flat JSON |
| SRC-003 | Model mismatch | Index model differs from configured model | Warning | Skip this index; warn user; suggest rebuildIndex |
| SRC-004 | Query embedding failed | Cannot embed the query text | Warning | Fall back to flat JSON read path entirely |
| SRC-005 | Search returned no results | Cosine similarity below minScore for all vectors | Info | Fall back to flat JSON if available; otherwise omit MEMORY_CONTEXT |

### 1.3 Write Errors (WRT-*)

| Code | Name | Trigger | Severity | Recovery |
|---|---|---|---|---|
| WRT-001 | User session write failed | Cannot write to ~/.isdlc/user-memory/sessions/ | Warning | Skip user layer; continue with project layer |
| WRT-002 | Project session write failed | Cannot write to .isdlc/roundtable-memory.json | Warning | Skip project layer; continue with user layer |
| WRT-003 | Session directory creation failed | Cannot mkdir for sessions directory | Warning | Skip that layer's write |

### 1.4 Compaction Errors (CMP-*)

| Code | Name | Trigger | Severity | Recovery |
|---|---|---|---|---|
| CMP-001 | Vector index load failed | Cannot read .emb for pruning | Error | Report to CLI user; skip vector compaction |
| CMP-002 | Vector rebuild failed | Cannot rebuild .emb after pruning | Error | Report to CLI user; original index unchanged |
| CMP-003 | Age metadata missing | Vector metadata lacks timestamp for age-based pruning | Warning | Skip age pruning; proceed with deduplication |

### 1.5 Consistency Errors (CON-*)

| Code | Name | Trigger | Severity | Recovery |
|---|---|---|---|---|
| CON-001 | Model field missing in manifest | .emb manifest does not contain model identifier | Warning | Treat as unknown model; skip index in search |
| CON-002 | Rebuild required | Model mismatch detected; index needs re-embedding | Info | Suggest `rebuildIndex` to user; skip index until rebuilt |

## 2. Error Handling Strategy

### 2.1 Fail-Open Principle

All read and search paths fail open. No error in the memory/embedding layer prevents the roundtable from functioning. The degradation chain:

1. **Best case**: Semantic search over dual vector indexes → rich MEMORY_CONTEXT
2. **One index fails**: Semantic search over remaining index → partial MEMORY_CONTEXT
3. **Both indexes fail**: Flat JSON fallback (REQ-0063 path) → structured MEMORY_CONTEXT
4. **Flat JSON also fails**: No MEMORY_CONTEXT → roundtable operates without memory (as before REQ-0063)

### 2.2 Write Path Error Isolation

Write errors are isolated per layer (user vs project). A failure in one layer does not prevent writing to the other. The `writeSessionRecord()` return value reports per-layer success:

```typescript
{ userWritten: boolean, projectWritten: boolean, enriched: boolean }
```

### 2.3 Async Embedding Error Handling

Embedding runs asynchronously after `ROUNDTABLE_COMPLETE`. Errors are:
- Logged internally (not shown to user)
- Recorded in the session file (`embedded: false`)
- Recovered via lazy embed on next read

### 2.4 User-Facing Error Display

| Context | User sees error? | Error destination |
|---|---|---|
| Session start (search) | No | Internal log only |
| Session end (write) | No | Internal log only |
| Async embedding | No | Internal log only |
| `isdlc memory compact` | Yes | CLI output (user-triggered command) |
| `isdlc memory status` | Yes | CLI output (user-triggered command) |

## Pending Sections

(none -- all sections complete)
