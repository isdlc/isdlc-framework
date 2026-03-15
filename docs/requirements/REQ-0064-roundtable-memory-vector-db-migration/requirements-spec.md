# Requirements Specification: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Business Context

The roundtable memory layer (REQ-0063) stores structured preferences in flat JSON files — topic depth preferences with weights, override counts, and session counts. This limits recall to exact key-value lookups by topic_id, missing the semantic context of *why* a user prefers a certain depth or *what* was discussed in past sessions.

REQ-0045 built a full embedding stack (FAISS flat index via Float32Array, embedding engine with CodeBERT/Voyage/OpenAI backends, store-manager with cosine similarity, MCP server, knowledge pipeline). ADR-004 in REQ-0063 explicitly deferred semantic search — this REQ activates it.

The migration replaces compacted JSON preference summaries with semantic vector search over enriched session records. Both user-level (`~/.isdlc/user-memory/`) and project-level memory migrate to vector storage. The storage format becomes an implementation detail — the user interacts with memory conversationally ("stop going deep on security", "what do you remember about my preferences?"), not by editing files.

**Cost of inaction**: Memory recall remains limited to exact topic_id matches. No semantic understanding of past session context. No team-shareable memory. Override mechanism requires manual JSON editing, which conflicts with the conversational UX model.

## 2. Stakeholders and Personas

| Stakeholder | Interest | Impact |
|---|---|---|
| **Framework user (primary)** | Richer memory recall, conversational override, no manual file editing | Direct beneficiary of semantic search and conversational control |
| **Team members (secondary)** | Shared project memory via `docs/.embeddings/` in git | Benefit from accumulated team analysis patterns |
| **Framework maintainers** | Backward compatibility, clean integration with existing embedding stack | Must maintain REQ-0063 flat JSON as fallback path |

## 3. User Journeys

### 3.1 Solo User — Semantic Memory Recall

**Current state**: Roundtable starts, reads `profile.json` and `roundtable-memory.json`, finds structured preference `{ depth: "brief", weight: 0.7 }` for security topic. Acknowledges: "From past sessions, you tend to brief on security."

**Desired state**: Roundtable starts, embeds current draft context, searches user and project vector indexes. Retrieves semantically relevant excerpts: "User prefers brief on security because they handle it at the org policy level. Last session they overrode to deep when the feature involved auth tokens." The roundtable uses this richer context to calibrate its approach.

### 3.2 Team Member — Inheriting Project Memory

**Current state**: New team member runs roundtable on existing project. `.isdlc/roundtable-memory.json` has structured summary but no team context.

**Desired state**: New team member pulls the repo, which includes `docs/.embeddings/roundtable-memory.emb`. Their roundtable retrieves team's accumulated analysis patterns: "This project goes deep on architecture due to custom auth integration. Error handling was amended once — team wanted explicit retry semantics."

### 3.3 User — Conversational Override

**Current state**: User edits `~/.isdlc/user-memory/profile.json` manually to change a depth preference. Fragile, requires knowledge of the file format.

**Desired state**: User tells the roundtable: "Remember that I prefer brief on security." The roundtable writes an enriched session record with this preference, which gets embedded and surfaces in future sessions via semantic search.

### 3.4 User — Querying Memory

**Desired state**: User asks the roundtable: "What do you remember about my preferences?" The roundtable searches both indexes and presents a conversational summary of accumulated memory.

## 4. Technical Context

### 4.1 Existing Infrastructure (REQ-0045)

- **Embedding engine** (`lib/embedding/engine/`): Pluggable backends — CodeBERT (local ONNX), Voyage-code-3 (cloud), OpenAI text-embedding-3-small (cloud)
- **Store manager** (`lib/embedding/mcp-server/store-manager.js`): Loads `.emb` packages, cosine similarity search via `findNearest()`
- **Knowledge pipeline** (`lib/embedding/knowledge/pipeline.js`): Document chunking + batch embedding for knowledge-base content
- **Package format** (`lib/embedding/package/`): `.emb` binary format — bundles vectors (Float32Array) + metadata JSON + manifest (tracks model, version, dimensions)

### 4.2 Existing Memory Layer (REQ-0063)

- **`lib/memory.js`**: 6 exported functions — `readUserProfile`, `readProjectMemory`, `mergeMemory`, `formatMemoryContext`, `writeSessionRecord`, `compact`
- **User storage**: `~/.isdlc/user-memory/profile.json` (compacted preferences) + `~/.isdlc/user-memory/sessions/*.json` (raw session records)
- **Project storage**: `.isdlc/roundtable-memory.json` (sessions array + compacted summary)
- **Dispatch injection**: Analyze handler reads, merges, formats as `MEMORY_CONTEXT` block in roundtable prompt
- **Session output**: Roundtable emits `SESSION_RECORD` JSON, handler calls `writeSessionRecord()`

## 5. Quality Attributes and Risks

| Attribute | Requirement |
|---|---|
| **Performance** | Embedding must not block user experience. Async write-time embedding with lazy fallback on read. Memory search at roundtable startup must complete in < 200ms (Supermemory achieves 50ms for profile retrieval — our target is conservative given dual-index search + embedding query). |
| **Reliability** | Fail-open on all read paths. Missing embeddings degrade to raw text, not failure. |
| **Compatibility** | Existing flat JSON path must continue working when vector DB is not configured. |
| **Shareability** | Project index must be committable to git and usable by team members. |
| **Consistency** | Embedding model must match between write and search. Model mismatch detected and handled. |

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embedding backend not configured | Medium | Medium | Fail-open: raw text records persist; flat JSON fallback; lazy embed on next read |
| Model mismatch across team | Low | High | `.emb` manifest records model; search layer rejects mismatch; `rebuildIndex` resolution path |
| `.emb` file corruption | Low | Medium | Fall back to flat JSON read; re-embed from raw session files |
| Large index rebuild time | Low | Low | Memory indexes are small (hundreds of vectors); rebuild is sub-second |

## 6. Functional Requirements

### FR-001: Enriched Session Record Format (Playbook Curator)
**Priority**: Must Have | **Confidence**: High

The analyze handler must generate enriched session records using an LLM playbook curator pass over its conversation state (REQ-0065: inline execution). The curator produces NL summaries written for a future reader with no context — richer than commit messages, more accessible than reading full artifacts. This is the content that makes vector search useful. (Pattern adapted from Hyperspace Playbook Curator.)

- **AC-001-01**: Session record includes a `summary` field containing an LLM-generated playbook entry — a concise NL summary of what was decided and why, written for future retrieval (e.g., "Team chose direct integration over middleware for auth because the custom token format requires access to the raw request. Brief on security — org handles it at policy level. Deep on architecture — custom auth integration points.")
- **AC-001-02**: Session record includes a `context_notes` array with per-topic NL notes, each explaining the outcome and reasoning for that topic — not just "depth_used: brief" but "brief on security because the user handles it at the org policy level; overrode to deep once when auth tokens were involved"
- **AC-001-03**: Session record includes a `playbook_entry` field — a 2-3 sentence distilled insight written as if for a teammate picking up this work next month
- **AC-001-04**: Session record includes an `embedded` boolean field (initially `false`, set to `true` after successful embedding)
- **AC-001-05**: Session record includes an `embed_model` field recording the model used for embedding (for consistency checks)
- **AC-001-06**: The enriched record is backward-compatible — existing `SessionRecord` fields (session_id, slug, timestamp, topics) are preserved unchanged
- **AC-001-07**: The playbook curator pass runs inline at session end (before async embedding) — it uses the conversation state already in memory, not a separate LLM call to an external service

### FR-002: Async Write-Time Embedding
**Priority**: Must Have | **Confidence**: High

Session record embedding must run asynchronously after the roundtable completes, never blocking the user experience.

- **AC-002-01**: After `writeSessionRecord()` writes the raw JSON, the embedding job is spawned asynchronously
- **AC-002-02**: Embedding is spawned after the handler completes the roundtable conversation and writes artifacts — no user-visible delay (REQ-0065: inline execution, no ROUNDTABLE_COMPLETE signal)
- **AC-002-03**: Embedding failure does not affect the raw session record — the JSON file persists regardless
- **AC-002-04**: Failed embedding jobs set `embedded: false` on the record; successful jobs set `embedded: true` and populate `embed_model`

### FR-003: Dual-Index Architecture (Hybrid Storage)
**Priority**: Must Have | **Confidence**: High

User and project memory must use separate vector indexes at separate filesystem locations, with storage formats optimized for each layer's constraints.

- **AC-003-01**: User vector index stored at `~/.isdlc/user-memory/memory.db` (SQLite via `better-sqlite3`)
- **AC-003-02**: Project vector index stored at `docs/.embeddings/roundtable-memory.emb` (`.emb` package format)
- **AC-003-03**: User SQLite index stores vectors as BLOBs alongside metadata columns (`appeared_count`, `accessed_count`, `hit_rate`, `session_id`, `timestamp`, `content`, `embed_model`)
- **AC-003-04**: Indexes are searched independently and results merged with layer tags (user/project)
- **AC-003-05**: Each index can exist independently — missing one does not prevent searching the other
- **AC-003-06**: A storage adapter abstraction allows `memory-search.js` to query both formats through a unified interface

### FR-004: Semantic Search at Roundtable Startup
**Priority**: Must Have | **Confidence**: High

The analyze handler must use semantic search over vector indexes to retrieve relevant past session content as inline conversation context (REQ-0065: no dispatch prompt — results are used directly by the handler).

- **AC-004-01**: The analyze handler embeds the current draft content and topic context as a query vector
- **AC-004-02**: Both user and project indexes are searched by cosine similarity
- **AC-004-03**: Results are ranked by score and formatted as semantic excerpts. The handler uses these as in-memory conversation priming context when executing the roundtable protocol inline — no dispatch prompt serialization
- **AC-004-04**: A configurable result limit (default: 10) caps the number of excerpts used
- **AC-004-05**: When no indexes exist (first run), memory context is empty — the handler proceeds without memory priming (same as current behavior)

### FR-005: Conversational Override Interface
**Priority**: Must Have | **Confidence**: High

Users must be able to set memory preferences conversationally through the roundtable, without editing files. The handler executes inline (REQ-0065) and has direct access to conversation state and memory write functions.

- **AC-005-01**: When a user says "remember that I prefer brief on security" (or equivalent natural language), the handler recognizes the preference statement and includes it in the enriched session record's `context_notes` and `summary`
- **AC-005-02**: The preference is embedded and surfaces in future sessions via semantic search
- **AC-005-03**: No file editing, CLI command, or config change is required from the user
- **AC-005-04**: The handler acknowledges the override conversationally: "Got it, I'll remember that for future sessions"

### FR-006: Conversational Query Interface
**Priority**: Should Have | **Confidence**: High

Users should be able to ask the roundtable what it remembers about their preferences.

- **AC-006-01**: When a user asks "what do you remember about my preferences?" (or equivalent), the roundtable searches both indexes and presents a conversational summary
- **AC-006-02**: Results are presented naturally, not as raw data dumps
- **AC-006-03**: Both user and project memory are included, with layer attribution when relevant

### FR-007: Model Consistency Enforcement
**Priority**: Must Have | **Confidence**: Medium

The embedding model used to write an index must match the model used to search it.

- **AC-007-01**: The `.emb` manifest records the embedding model used at build time
- **AC-007-02**: At search time, the configured model is compared against the index manifest
- **AC-007-03**: On model mismatch, the search layer warns and returns empty results for the mismatched index (does not silently return wrong results)
- **AC-007-04**: A `rebuildIndex` function is available to re-embed all raw session records with the current model

### FR-008: Lazy Embed Fallback
**Priority**: Should Have | **Confidence**: Medium

Un-embedded session records should be embedded on the next read if the async job failed.

- **AC-008-01**: At search time, `searchMemory` checks for raw session records with `embedded: false`
- **AC-008-02**: Un-embedded records are embedded on the spot before search completes
- **AC-008-03**: Lazy embedding is best-effort — if it fails, the search proceeds without those records
- **AC-008-04**: Successfully lazy-embedded records are updated to `embedded: true`

### FR-009: Vector Compaction
**Priority**: Should Have | **Confidence**: Medium

The `isdlc memory compact` command must be extended to support vector index maintenance.

- **AC-009-01**: Compaction prunes vectors older than a configurable age threshold (default: 6 months)
- **AC-009-02**: Compaction removes near-duplicate vectors (cosine similarity > 0.95)
- **AC-009-03**: Compaction rebuilds the `.emb` index after pruning
- **AC-009-04**: Existing flat JSON compaction continues to work for backward compatibility

### FR-010: Backward Compatibility
**Priority**: Must Have | **Confidence**: High

The existing flat JSON memory path must continue working when vector storage is not configured or not available.

- **AC-010-01**: When no embedding backend is configured, `lib/memory.js` falls back to the existing flat JSON read/write path from REQ-0063
- **AC-010-02**: The `MEMORY_CONTEXT` format supports both structured preferences (legacy) and semantic excerpts (new)
- **AC-010-03**: The roundtable agent can consume either format without error
- **AC-010-04**: Migration from flat JSON to vector is gradual — both can coexist during transition

### FR-011: Fail-Open on Embedding Unavailability
**Priority**: Must Have | **Confidence**: High

All read and write paths must fail open when embedding infrastructure is unavailable.

- **AC-011-01**: Missing embedding backend results in raw text records only — no embedding, no failure
- **AC-011-02**: Missing `.emb` index files result in empty search results — `MEMORY_CONTEXT` omitted
- **AC-011-03**: Corrupted `.emb` files trigger fallback to flat JSON read — no crash
- **AC-011-04**: No error messages or warnings shown to the user for expected degradation scenarios

### FR-012: Self-Ranking Memory Retrieval
**Priority**: Must Have | **Confidence**: High

Memory entries must track usage frequency to surface frequently-useful memories higher in search results (pattern from user-memories).

- **AC-012-01**: Each memory entry in the user SQLite index tracks `appeared_count` (times stored/updated) and `accessed_count` (times retrieved during search)
- **AC-012-02**: `hit_rate = accessed_count / appeared_count` is computed and used as a boost factor in search ranking alongside cosine similarity
- **AC-012-03**: `accessed_count` is incremented when a memory excerpt is included in the handler's conversation priming context at roundtable startup (REQ-0065: inline execution, no dispatch prompt)
- **AC-012-04**: Memories with zero `accessed_count` after 5+ sessions decay faster in relevance (age decay penalty)

### FR-013: Tiered Semantic Deduplication with Contradiction Detection
**Priority**: Must Have | **Confidence**: High

New session records must be handled based on their semantic similarity and relationship to existing records, using a 4-tier model (patterns from smartmemorymcp + Supermemory's Updates/Extends/Derives graph relationships).

- **AC-013-01**: Before embedding a new session record, compute cosine similarity against existing vectors in the target index
- **AC-013-02**: **Tier 1 — Reject** (similarity >= 0.95): Near-identical content is rejected as a duplicate. No new entry created.
- **AC-013-03**: **Tier 2 — Update** (similarity 0.85-0.94, content contradicts): The new record supersedes the old. Old entry is preserved with `isLatest: false`, new entry is marked `isLatest: true` with an `updates` link to the old entry. Example: "team chose middleware" → later "team switched to direct integration" — both preserved, only latest surfaces in search. (Pattern from Supermemory's Updates relationship.)
- **AC-013-04**: **Tier 3 — Extend** (similarity 0.85-0.94, content is additive): New information enriches the existing entry without replacing it. Both memories remain valid and searchable. `appeared_count` incremented, `merge_history` updated. Example: "team prefers brief on security" → later "specifically because org handles it at policy level" — context is richer, not contradictory. (Pattern from Supermemory's Extends relationship.)
- **AC-013-05**: **Tier 4 — New** (similarity < 0.85): Novel information. A new entry is created in the index.
- **AC-013-06**: The playbook curator (FR-001) annotates each `context_notes` entry with a `relationship_hint: "updates" | "extends" | null` at session end. The async embedder (FR-002) uses this hint during tiered deduplication — no additional LLM call during embedding.
- **AC-013-07**: Tiered deduplication applies independently per index (user and project)

### FR-014: Importance Scoring
**Priority**: Should Have | **Confidence**: High

Each memory entry must receive an LLM-assigned importance score at write time, providing a ranking signal alongside usage-based hit_rate (pattern from smartmemorymcp).

- **AC-014-01**: The playbook curator (FR-001) assigns an `importance` score (1-10) to each memory entry based on the significance of the decision or preference captured
- **AC-014-02**: Importance score is stored alongside the vector in the index (SQLite column for user, metadata for project `.emb`)
- **AC-014-03**: Search ranking combines three signals: `final_score = cosine_similarity * (1 + log(1 + hit_rate)) * (1 + importance/20)` — cosine similarity is primary, hit_rate and importance are boost factors
- **AC-014-04**: Importance scores are not manually editable in this REQ (conversational adjustment is a future extension)

### FR-015: Memory Curation (Pin, Archive, Tag)
**Priority**: Should Have | **Confidence**: High

Users must be able to curate memories conversationally — pinning critical memories, archiving outdated ones, and tagging for filtering (pattern from smartmemorymcp).

- **AC-015-01**: **Pin**: When a user says "always remember this" (or equivalent), the memory entry is flagged as `pinned: true`. Pinned memories never decay and are always included in search results regardless of score.
- **AC-015-02**: **Archive**: When a user says "forget that" or "that's no longer relevant", the memory entry is flagged as `archived: true`. Archived memories are excluded from search results but retained for audit.
- **AC-015-03**: **Tag**: When a user says "tag this as architecture" (or equivalent), a tag is added to the memory entry's `tags` array. Tags can be used as search filters.
- **AC-015-04**: All curation operations are conversational — no CLI commands or file edits required.
- **AC-015-05**: Curation state is stored in the index (SQLite columns for user, metadata for project `.emb`)

### FR-016: Auto-Pruning with Temporal Decay
**Priority**: Should Have | **Confidence**: Medium

Vector indexes must auto-prune using both capacity limits and temporal awareness, preventing unbounded growth and stale memories (patterns from smartmemorymcp capacity limits + Supermemory automatic forgetting).

- **AC-016-01**: A configurable capacity limit (default: 500 vectors per index) triggers auto-pruning when exceeded
- **AC-016-02**: Auto-pruning removes the lowest-ranked entries (by combined score of hit_rate, importance, and age) until the index is at 90% capacity
- **AC-016-03**: Pinned memories are never auto-pruned
- **AC-016-04**: Auto-pruning runs during the async embedding step (after session end), not during search
- **AC-016-05**: A warning is logged when auto-pruning removes entries: "{N} memories pruned to stay within {limit} capacity"
- **AC-016-06**: **Temporal decay**: Episodic memories (one-off session observations) decay faster than preference memories (reinforced across sessions). Memories with `appeared_count > 3` are treated as preferences and decay at half the rate. (Pattern from Supermemory: episodes decay unless significant, preferences strengthen through repetition.)
- **AC-016-07**: Time-bound memories (e.g., "sprint deadline is Friday") should be detectable by the playbook curator and given a short TTL. After expiry, they are auto-archived (not deleted). (Pattern from Supermemory's automatic forgetting of temporal facts.)

### FR-017: Container Tags for Context Scoping
**Priority**: Could Have | **Confidence**: Medium

Memories should be scopeable to specific contexts within a project, preventing cross-domain noise (pattern from Supermemory's container tag isolation).

- **AC-017-01**: Memory entries can carry a `container` tag (e.g., "auth", "deployment", "error-handling") identifying the domain context
- **AC-017-02**: The playbook curator auto-assigns container tags based on the analysis topic at session end
- **AC-017-03**: `searchMemory()` accepts an optional `container` filter to scope results to the current domain
- **AC-017-04**: When no container filter is provided, all memories are searched (backward-compatible default)

## 7. Out of Scope

- **Real-time embedding during conversation**: Embedding happens post-session, not during the roundtable
- **Cross-project memory sharing**: User memory is personal; project memory is per-repo. No cross-repo memory federation
- **Embedding model selection UI**: Model is configured via existing REQ-0045 configuration, not a new UI
- **Code embedding migration**: This REQ covers roundtable memory only, not the code-level embeddings from REQ-0045
- **Graph-based memory linking and traversal**: Link data structure is defined (Update/Extend from FR-013), but multi-hop traversal, Derives relationships, and `builds_on`/`contradicts`/`related_to` types deferred to REQ-0066
- **Memory evolution/consolidation**: Periodic LLM pass to consolidate individual records into distilled wisdom deferred to REQ-0066
- **Formal memory type classification**: REQ-0064 uses `appeared_count > 3` as an informal preference heuristic for decay rates (FR-016). Formal Fact/Preference/Episode tagging with `memory_type` field and promotion rules deferred to REQ-0066
- **Hybrid memory + RAG query**: Unified search across memory index and codebase index deferred to REQ-0066

## 8. MoSCoW Prioritization

| Priority | Requirements |
|---|---|
| **Must Have** | FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-010, FR-011, FR-012, FR-013 |
| **Should Have** | FR-006, FR-008, FR-009, FR-014, FR-015, FR-016 |
| **Could Have** | FR-017 |
| **Won't Have** | Cross-project sharing, real-time embedding, graph traversal, memory evolution, formal memory types, hybrid memory+RAG query |

## 9. Dependency Map

```
FR-001 (playbook curator) ← FR-002 (async embedding) depends on enriched content
FR-001 (playbook curator) ← FR-013 (tiered dedup) — curator annotates relationship_hint
FR-001 (playbook curator) ← FR-014 (importance) — curator assigns importance score
FR-001 (playbook curator) ← FR-017 (containers) — curator assigns container tag
FR-003 (dual index) ← FR-004 (semantic search) depends on indexes existing
FR-003 (dual index) ← FR-017 (containers) — both stores need container support
FR-002 (async embedding) ← FR-008 (lazy fallback) handles FR-002 failures
FR-002 (async embedding) ← FR-013 (tiered dedup) — dedup runs during embedding
FR-003 (dual index) ← FR-007 (model consistency) validates index model
FR-004 (semantic search) ← FR-006 (query interface) uses same search path
FR-010 (backward compat) is independent — fallback path
FR-011 (fail-open) cross-cuts all other requirements
FR-012 (self-ranking) ← FR-016 (auto-pruning) — pruning uses same ranking formula
FR-015 (curation: pin) ← FR-016 (auto-pruning) — pinned memories exempt from pruning
FR-016 (auto-pruning) depends on FR-012 (self-ranking) for decay scoring

Cross-ticket dependencies (REQ-0066 builds on REQ-0064):
  FR-013 (Update/Extend links) → REQ-0066 extends with Derives, builds_on, related_to
  FR-015 (user curation) → REQ-0066 extends to team-level curation
  FR-016 (informal preference heuristic) → REQ-0066 formalizes as memory_type tagging
  FR-017 (container tags) → REQ-0066 extends for team domain filtering
```

## Pending Sections

(none -- all sections complete)
