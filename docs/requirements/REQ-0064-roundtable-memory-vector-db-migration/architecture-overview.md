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

### ADR-004: Hybrid Storage — SQLite (User) + .emb (Project)

**Context**: Need storage formats for vector indexes. User index is personal and local. Project index must be portable and shareable via git for teams. These have different constraints.

**Options Considered**:

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. `.emb` for both | Bundle vectors + metadata in single binary for both layers | Consistent format; store-manager already reads it | Binary format; no SQL query flexibility; no self-ranking support; overkill portability for user-local data | Eliminated |
| B. SQLite for both | SQLite DB with embedded vectors for both layers | SQL queries; self-ranking via hit_rate; single file; `better-sqlite3` already a dependency | Binary diffs in git make team sharing harder; SQLite merge conflicts | Eliminated |
| C. SQLite for user + `.emb` for project | User index uses SQLite (query flexibility, self-ranking, local-only). Project index uses `.emb` (portable, git-friendly binary, store-manager support) | Best of both: user gets SQL power + self-ranking; project gets git portability; no new dependencies | Two storage implementations to maintain; adapter layer needed | **Selected** |

**Decision**: Option C. The user index benefits from SQLite's query flexibility and self-ranking (inspired by user-memories' `appeared_count`/`accessed_count` hit_rate pattern). `better-sqlite3` is already a project dependency from REQ-0045. The project index stays as `.emb` for git portability and team sharing. An adapter layer abstracts the storage difference from the search module.

**Patterns adopted from user-memories (github.com/m13v/user-memories)**:
- **Self-ranking**: Track `appeared_count` (how often a memory is stored/updated) and `accessed_count` (how often it's retrieved during search). The `hit_rate = accessed_count / appeared_count` surfaces frequently-useful memories higher.
- **Tiered deduplication**: Refined from user-memories' binary supersession into a 4-tier model (with smartmemorymcp and Supermemory patterns): Reject >= 0.95, Update 0.85-0.94 if contradicts, Extend 0.85-0.94 if additive, New < 0.85.

### ADR-005: LLM Playbook Curator at Session End

**Context**: Vector search is only as good as the content it indexes. Raw structured data (`{ depth_used: "brief" }`) produces low-quality embeddings. The enriched session records need high-quality NL content that captures *what was decided, why, and what a future reader needs to know*. (Pattern adapted from Hyperspace Playbook Curator — LLM explains why winning mutations work, new joiners bootstrap from accumulated wisdom.)

**Decision**: At session end, the handler runs an LLM playbook curator pass over its in-memory conversation state. This generates three NL fields: `summary` (full session synthesis), `context_notes` (per-topic reasoning), and `playbook_entry` (2-3 sentence distilled insight). These are the content that gets embedded and retrieved via semantic search.

**Rationale**: The handler already has the full conversation context (REQ-0065 inline execution). The curator pass is a synthesis step, not a separate LLM call — it uses the same context window. The output is optimized for future retrieval: written for a reader with no prior context, capturing decisions and reasoning rather than just outcomes. This is what makes the difference between "brief on security" (useless for vector search) and "Team chose brief on security because org handles it at policy level; overrode to deep once when auth tokens were directly involved" (semantically searchable).

### ADR-006: Conversational Override as Memory Content

**Context**: Users need to control memory without editing files. The storage format is opaque (vector DB). The override mechanism must be conversational.

**Decision**: User preference overrides are captured as natural language content in enriched session records, not as structured configuration. When a user says "remember I prefer brief on security", the handler includes this in the playbook curator output, which gets embedded. Future semantic searches retrieve this preference by content similarity, not by key lookup.

**Rationale**: This aligns with the semantic search model — everything is content, everything is searchable by meaning. No separate configuration layer is needed. The more a user reinforces a preference across sessions, the higher its relevance score in search results (boosted by self-ranking hit_rate).

## 2. Technology Decisions

- **No new dependencies**: Reuses existing embedding engine, store-manager, knowledge pipeline, `.emb` format from REQ-0045. `better-sqlite3` already a dependency.
- **Existing infrastructure**: `lib/embedding/engine/` (CodeBERT/Voyage/OpenAI), `lib/embedding/mcp-server/store-manager.js` (cosine similarity), `lib/embedding/knowledge/pipeline.js` (document chunking)
- **Storage locations**:
  - User index: `~/.isdlc/user-memory/memory.db` (SQLite via `better-sqlite3` — self-ranking, SQL queries, local-only)
  - Project index: `docs/.embeddings/roundtable-memory.emb` (`.emb` package — git-portable, team-shareable)
- **Async pattern**: Background embedding via spawned process or promise chain, matching the discover-integration pattern
- **Self-ranking** (from user-memories pattern): SQLite user index tracks `appeared_count` and `accessed_count` per memory entry. `hit_rate = accessed_count / appeared_count` boosts frequently-retrieved memories in search results.
- **Tiered deduplication**: 4-tier model (Reject >= 0.95 / Update if contradicts / Extend if additive / New < 0.85). Curator annotates `relationship_hint` at session end; embedder uses hint during dedup.

## 3. Integration Points

> **Note**: REQ-0065 eliminated the subagent dispatch for roundtable analysis. The analyze handler now executes the roundtable conversation protocol inline. There is no dispatch prompt, no relay-and-resume loop, no SESSION_RECORD output parsing, and no ROUNDTABLE_COMPLETE signal. The handler has direct access to conversation state and memory functions.

| Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|
| Analyze handler (inline) | `lib/memory-search.js` | Function call at step 3a | Query text in, ranked excerpts out | Fail-open: empty results → proceed without memory priming |
| Analyze handler (inline) | In-memory conversation context | Internal state | Formatted excerpts used as conversation priming | No excerpts → handler proceeds without memory |
| Analyze handler (inline) | `lib/memory.js` | Function call at session end | Handler-constructed EnrichedSessionRecord | Fail-open: write failures non-blocking |
| Analyze handler (inline) | `lib/memory-embedder.js` | Async spawn post-session | EnrichedSessionRecord in, embedded index out | Fire-and-forget; log failures |
| `lib/memory-embedder.js` | `lib/embedding/engine/` | Function call | Text chunks in, Float32Array out | Throw on failure; caller handles |
| `lib/memory-embedder.js` | `lib/embedding/knowledge/pipeline.js` | Function call | NL summary in, chunks out | Throw on failure; caller handles |
| `lib/memory-embedder.js` | `memory-store-adapter.js` | Function call | Chunks + vectors in, index updated | Write failure logged; raw JSON persists |
| `lib/memory-search.js` | `memory-store-adapter.js` | Function call | Query vector in, SearchResult[] out | Empty results on error |
| `lib/memory-search.js` | `lib/embedding/engine/` | Function call | Query text in, query vector out | Fail-open: skip semantic search |
| `isdlc memory compact` | `lib/memory.js` | CLI call | Compact options in, result out | Report errors to CLI user |

**Removed integration points** (eliminated by REQ-0065):
- ~~Roundtable agent → `MEMORY_CONTEXT` (prompt injection)~~ → Handler uses search results as in-memory context
- ~~Roundtable agent → `SESSION_RECORD` (output parsing)~~ → Handler constructs enriched record from conversation state

## 4. Data Flow

> See `data-flow.md` for full diagrams. Summary below updated for REQ-0065 (inline execution) and hybrid storage.

### 4.1 Write Path (Session End)

```
[Analyze handler completes inline roundtable (confirmationState = COMPLETE)]
  Handler constructs EnrichedSessionRecord from conversation state:
    ├── Playbook curator pass: summary, context_notes (with relationship_hints),
    │   playbook_entry, importance score, container tag
    ├── writeSessionRecord(record, projectRoot) — immediate raw JSON write
    │     ├── User: ~/.isdlc/user-memory/sessions/{session_id}.json
    │     └── Project: .isdlc/roundtable-memory.json (append to sessions array)
    └── Spawn async: embedSession(record, storeAdapter, engineConfig)
          ├── Chunk NL summary via knowledge pipeline
          ├── Embed chunks via configured engine
          ├── Tiered dedup: check similarity against existing vectors
          │     ├── >= 0.95: reject (duplicate)
          │     ├── 0.85-0.94 + relationship_hint=updates: Update (supersede)
          │     ├── 0.85-0.94 + relationship_hint=extends: Extend (merge)
          │     └── < 0.85: New entry
          ├── Write to user store: ~/.isdlc/user-memory/memory.db (SQLite)
          ├── Write to project store: docs/.embeddings/roundtable-memory.emb
          ├── Auto-prune if capacity exceeded (500 default)
          ├── Update record: embedded=true, embed_model=<model>
          └── On failure: log error, record stays embedded=false
```

### 4.2 Read Path (Session Start)

```
[Analyze handler starts inline roundtable]
  searchMemory(draftContent, userDbPath, projectIndexPath, engineConfig)
    ├── Check for un-embedded records (embedded: false)
    │     └── If found: lazy embed (best-effort, non-blocking on failure)
    ├── Open user SQLite store (fail-open: skip if missing/corrupt)
    ├── Load project .emb store (fail-open: skip if missing/corrupt)
    ├── Check model consistency for each store
    │     └── If mismatch: warn, skip that store
    ├── Embed query text (draft keywords + topic names)
    ├── Search user store: cosine similarity + self-ranking boost, top K
    ├── Search project store: cosine similarity, top K
    ├── Merge results, tag with layer (user/project)
    ├── Rank by final_score, apply result limit
    ├── Increment accessed_count for returned user results
    └── Return as in-memory conversation priming context

  [Fallback path — no indexes or no embedding backend]
    ├── Read ~/.isdlc/user-memory/profile.json (flat JSON)
    ├── Read .isdlc/roundtable-memory.json (flat JSON)
    ├── mergeMemory() + formatMemoryContext() (REQ-0063 path)
    └── Use as in-memory legacy conversation context
```

### 4.3 Compaction Path (User-Triggered)

```
[isdlc memory compact]
  ├── Flat JSON compaction (existing REQ-0063 behavior — preserved)
  │     ├── Read session files, aggregate per-topic, write profile.json
  │     └── Read project sessions, aggregate summary, write roundtable-memory.json
  └── Vector compaction (new, --vectors flag)
        ├── User store (SQLite):
        │     DELETE WHERE timestamp < N months, VACUUM
        ├── Project store (.emb):
        │     Load, prune old vectors, deduplicate (cosine > 0.95), rebuild
        └── Both: auto-archive expired TTL memories
```

## 5. Blast Radius

See impact-analysis.md for full blast radius assessment.

**Summary**: 4 modified files, 4 new files, 3 test files, 2 config/directory changes. ~13 files total.

## 6. Implementation Order

1. `lib/memory-store-adapter.js` — MemoryStore interface, SQLite user store, .emb project store (FR-003)
2. `lib/memory.js` — enriched session record format with playbook curator fields (FR-001, FR-014)
3. `lib/memory-embedder.js` — async embedding with tiered dedup + auto-pruning (FR-002, FR-013, FR-016)
4. `lib/memory-search.js` — semantic search with self-ranking + importance boost (FR-004, FR-007, FR-012)
5. Analyze handler — inline memory search at startup + enriched record construction at session end (FR-004, FR-001, FR-005)
6. Backward compatibility + fail-open testing (FR-010, FR-011)
7. Lazy embed fallback (FR-008)
8. Conversational override + query (FR-005, FR-006)
9. Memory curation: pin, archive, tag (FR-015)
10. Container tags (FR-017)
11. Vector compaction + temporal decay (FR-009, FR-016)
12. CLI extensions: `isdlc memory compact --vectors`, `isdlc memory status`

## Pending Sections

(none -- all sections complete)
