# Architecture Overview: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Architecture Decisions

### ADR-001: Two-Phase Write (Immediate Raw + Async Embed)

**Context**: Session records must be persisted at roundtable end. Embedding requires an embedding backend and takes time. The user should never wait for embedding.

**Options Considered**:

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. Synchronous embed-then-write | Embed and write in one step before ROUNDTABLE_COMPLETE | Index always up to date; simple read path | Blocks user; requires embedding backend at session end; increases roundtable latency | Eliminated |
| B. Two-phase: immediate raw + async embed | Write raw JSON immediately; spawn embedding in background | Non-blocking UX; raw record always persists; matches discover-integration pattern | Index may lag; requires lazy embed fallback on read | **Selected** |
| C. Embed on next read only | Write raw JSON; embed lazily when next session starts | Simplest write path; no background job | Adds latency to session start; first-session-after-write always slow | Eliminated |

**Decision**: Option B. The user experience priority is clear: `ROUNDTABLE_COMPLETE` fires immediately. Background embedding provides eventual consistency. The discover-integration pipeline uses the same pattern successfully.

### ADR-002: Dual Separate Indexes (User + Project)

**Context**: Memory has two layers — user-level (personal preferences) and project-level (team patterns). These serve different audiences and have different sharing requirements.

**Options Considered**:

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. Single unified index | One `.emb` file with metadata tags for layer | Simpler search (one index); single rebuild | Cannot share project memory without exposing user preferences; location ambiguity | Eliminated |
| B. Dual separate indexes | User index at `~/.isdlc/`, project index at `docs/.embeddings/` | Clean separation; project index is shareable via git; user preferences stay private | Two indexes to search and maintain; merge logic needed | **Selected** |

**Decision**: Option B. The shareability requirement is non-negotiable — project memory must be committable and usable by team members. User memory must remain private. Two separate indexes at two separate locations is the only option that satisfies both.

### ADR-003: Reuse Existing Embedding Stack

**Context**: REQ-0045 built a full embedding infrastructure — engine with pluggable backends, store-manager with cosine similarity, knowledge pipeline for document chunking, `.emb` package format.

**Options Considered**:

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. New lightweight embedding layer | Custom minimal embedding for memory (simpler, fewer dependencies) | Tailored to memory use case; no coupling to REQ-0045 code | Duplicates embedding logic; divergent maintenance; two embedding stacks | Eliminated |
| B. Reuse REQ-0045 stack | Use existing engine, store-manager, knowledge pipeline, .emb format | Zero new dependencies; proven code; consistent model management; .emb format handles portability | Couples memory to embedding infrastructure; memory is a different content type than code | **Selected** |

**Decision**: Option B. The existing stack is exactly what we need — pluggable model backends, cosine similarity search, document chunking, portable package format. The `contentType` field in the knowledge pipeline already supports distinguishing content types.

### ADR-004: .emb Package Format for Memory Indexes

**Context**: Need a storage format for vector indexes that supports portability (team sharing), metadata (model tracking), and efficient search.

**Options Considered**:

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. Raw Float32Array + JSON sidecar | Separate files for vectors and metadata | Simple; human-inspectable metadata | Two files to manage; no integrity guarantee; no manifest | Eliminated |
| B. SQLite with vector extension | SQLite DB with embedded vectors | SQL query flexibility; single file | New dependency (better-sqlite3); overkill for small indexes; binary diffs in git | Eliminated |
| C. Existing .emb package format | Bundle vectors + metadata + manifest in single binary | Already implemented; portable; manifest tracks model/version; store-manager already reads it | Binary format (not human-readable); requires rebuild on append | **Selected** |

**Decision**: Option C. The `.emb` format is already built, tested, and supported by the store-manager. Memory indexes are small enough that full rebuild on append is acceptable.

### ADR-005: Conversational Override as Memory Content

**Context**: Users need to control memory without editing files. The storage format is opaque (vector DB). The override mechanism must be conversational.

**Decision**: User preference overrides are captured as natural language content in enriched session records, not as structured configuration. When a user says "remember I prefer brief on security", the roundtable includes this in the session summary, which gets embedded. Future semantic searches retrieve this preference by content similarity, not by key lookup.

**Rationale**: This aligns with the semantic search model — everything is content, everything is searchable by meaning. No separate configuration layer is needed. The more a user reinforces a preference across sessions, the higher its relevance score in search results.

## 2. Technology Decisions

- **No new dependencies**: Reuses existing embedding engine, store-manager, knowledge pipeline, `.emb` format from REQ-0045
- **Existing infrastructure**: `lib/embedding/engine/` (CodeBERT/Voyage/OpenAI), `lib/embedding/mcp-server/store-manager.js` (cosine similarity), `lib/embedding/knowledge/pipeline.js` (document chunking)
- **Storage locations**: User index at `~/.isdlc/user-memory/user-memory.emb`, project index at `docs/.embeddings/roundtable-memory.emb`
- **Async pattern**: Background embedding via spawned process or promise chain, matching the discover-integration pattern

## 3. Integration Points

| Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|
| Analyze handler | `lib/memory-search.js` | Function call | Query text in, ranked excerpts out | Fail-open: empty results on any error |
| Analyze handler | `lib/memory-embedder.js` | Async spawn | EnrichedSessionRecord in, embedded index out | Fire-and-forget; log failures |
| `lib/memory-embedder.js` | `lib/embedding/engine/` | Function call | Text chunks in, Float32Array out | Throw on failure; caller handles |
| `lib/memory-embedder.js` | `lib/embedding/knowledge/pipeline.js` | Function call | NL summary in, chunks out | Throw on failure; caller handles |
| `lib/memory-embedder.js` | `.emb` index file | File write | Rebuilt .emb package | Write failure logged; raw JSON persists |
| `lib/memory-search.js` | `lib/embedding/mcp-server/store-manager.js` | Function call | Query vector in, SearchResult[] out | Empty results on error |
| `lib/memory-search.js` | `lib/embedding/engine/` | Function call | Query text in, query vector out | Fail-open: skip semantic search |
| Roundtable agent | `MEMORY_CONTEXT` | Prompt injection | Ranked semantic excerpts | Omit block if empty |
| Roundtable agent | `SESSION_RECORD` | Output parsing | Enriched JSON with NL summary | Handler parses; embed async |
| `isdlc memory compact` | `lib/memory.js` | CLI call | Compact options in, result out | Report errors to CLI user |

## 4. Data Flow

### 4.1 Write Path (Session End)

```
[Roundtable emits SESSION_RECORD with enriched content]
  Analyze handler
    ├── Parse enriched session record (summary, context_notes, topics)
    ├── Call writeSessionRecord() — immediate raw JSON write
    │     ├── User: ~/.isdlc/user-memory/sessions/{session_id}.json
    │     └── Project: .isdlc/roundtable-memory.json (append to sessions array)
    ├── Emit ROUNDTABLE_COMPLETE to user (no delay)
    └── Spawn async: embedSession(record, indexPath, engineConfig)
          ├── Chunk NL summary via knowledge pipeline
          ├── Embed chunks via configured engine
          ├── Load existing .emb index (or create new)
          ├── Append vectors + metadata
          ├── Rebuild .emb package
          ├── Write user index: ~/.isdlc/user-memory/user-memory.emb
          ├── Write project index: docs/.embeddings/roundtable-memory.emb
          ├── Update record: embedded=true, embed_model=<model>
          └── On failure: log error, record stays embedded=false
```

### 4.2 Read Path (Session Start)

```
[Analyze handler starts roundtable dispatch]
  searchMemory(draftContent, topicContext, userIndexPath, projectIndexPath, engineConfig)
    ├── Check for un-embedded records (embedded: false)
    │     └── If found: lazy embed (best-effort, non-blocking on failure)
    ├── Load user .emb index (fail-open: skip if missing/corrupt)
    ├── Load project .emb index (fail-open: skip if missing/corrupt)
    ├── Check model consistency for each index
    │     └── If mismatch: warn, skip that index
    ├── Embed query text (draft keywords + topic names)
    ├── Search user index: cosine similarity, top K results
    ├── Search project index: cosine similarity, top K results
    ├── Merge results, tag with layer (user/project)
    ├── Rank by score, apply result limit
    └── Format as MEMORY_CONTEXT block (ranked semantic excerpts)

  [Fallback path — no indexes or no embedding backend]
    ├── Read ~/.isdlc/user-memory/profile.json (flat JSON)
    ├── Read .isdlc/roundtable-memory.json (flat JSON)
    ├── mergeMemory() + formatMemoryContext() (REQ-0063 path)
    └── Format as legacy MEMORY_CONTEXT block (structured preferences)
```

### 4.3 Compaction Path (User-Triggered)

```
[isdlc memory compact]
  ├── Flat JSON compaction (existing REQ-0063 behavior — preserved)
  │     ├── Read session files, aggregate per-topic, write profile.json
  │     └── Read project sessions, aggregate summary, write roundtable-memory.json
  └── Vector compaction (new)
        ├── Load .emb index
        ├── Prune vectors older than age threshold
        ├── Deduplicate near-identical vectors (cosine > 0.95)
        ├── Rebuild .emb package
        └── Write updated index
```

## 5. Blast Radius

See impact-analysis.md for full blast radius assessment.

**Summary**: 4 modified files, 4 new files, 3 test files, 2 config/directory changes. ~13 files total.

## 6. Implementation Order

1. `lib/memory.js` — enriched session record format (FR-001)
2. `lib/memory-embedder.js` — embedding orchestrator (FR-002, FR-003)
3. `lib/memory-search.js` — semantic search (FR-004, FR-007)
4. Analyze handler changes — dispatch integration (FR-004, FR-002)
5. Roundtable agent prompt — MEMORY_CONTEXT format + SESSION_RECORD enrichment (FR-005)
6. Backward compatibility + fail-open testing (FR-010, FR-011)
7. Lazy embed fallback (FR-008)
8. Conversational query (FR-006)
9. Vector compaction (FR-009)
10. CLI extensions (FR-009)

## Pending Sections

(none -- all sections complete)
