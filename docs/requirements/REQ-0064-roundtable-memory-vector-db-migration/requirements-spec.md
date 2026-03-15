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
| **Performance** | Embedding must not block user experience. Async write-time embedding with lazy fallback on read. |
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

### FR-001: Enriched Session Record Format
**Priority**: Must Have | **Confidence**: High

The session record output from the roundtable must include natural language content beyond the current structured fields.

- **AC-001-01**: Session record includes a `summary` field containing a natural language summary of the session's memory-relevant outcomes (e.g., "User prefers brief on security because they handle it at org level")
- **AC-001-02**: Session record includes a `context_notes` array with per-topic natural language notes from the conversation
- **AC-001-03**: Session record includes an `embedded` boolean field (initially `false`, set to `true` after successful embedding)
- **AC-001-04**: Session record includes an `embed_model` field recording the model used for embedding (for consistency checks)
- **AC-001-05**: The enriched record is backward-compatible — existing `SessionRecord` fields (session_id, slug, timestamp, topics) are preserved unchanged

### FR-002: Async Write-Time Embedding
**Priority**: Must Have | **Confidence**: High

Session record embedding must run asynchronously after the roundtable completes, never blocking the user experience.

- **AC-002-01**: After `writeSessionRecord()` writes the raw JSON, the embedding job is spawned asynchronously
- **AC-002-02**: The `ROUNDTABLE_COMPLETE` signal fires before embedding starts — no user-visible delay
- **AC-002-03**: Embedding failure does not affect the raw session record — the JSON file persists regardless
- **AC-002-04**: Failed embedding jobs set `embedded: false` on the record; successful jobs set `embedded: true` and populate `embed_model`

### FR-003: Dual-Index Architecture
**Priority**: Must Have | **Confidence**: High

User and project memory must use separate vector indexes at separate filesystem locations.

- **AC-003-01**: User vector index stored at `~/.isdlc/user-memory/user-memory.emb`
- **AC-003-02**: Project vector index stored at `docs/.embeddings/roundtable-memory.emb`
- **AC-003-03**: Both indexes use the `.emb` package format from REQ-0045
- **AC-003-04**: Indexes are searched independently and results merged with layer tags (user/project)
- **AC-003-05**: Each index can exist independently — missing one does not prevent searching the other

### FR-004: Semantic Search at Roundtable Startup
**Priority**: Must Have | **Confidence**: High

The analyze handler must use semantic search over vector indexes to retrieve relevant past session content for the roundtable dispatch.

- **AC-004-01**: The analyze handler embeds the current draft content and topic context as a query vector
- **AC-004-02**: Both user and project indexes are searched by cosine similarity
- **AC-004-03**: Results are ranked by score and formatted as `MEMORY_CONTEXT` with semantic excerpts (replacing the current structured preference format)
- **AC-004-04**: A configurable result limit (default: 10) caps the number of excerpts injected into the prompt
- **AC-004-05**: When no indexes exist (first run), `MEMORY_CONTEXT` is omitted — same as current behavior

### FR-005: Conversational Override Interface
**Priority**: Must Have | **Confidence**: High

Users must be able to set memory preferences conversationally through the roundtable, without editing files.

- **AC-005-01**: When a user says "remember that I prefer brief on security" (or equivalent natural language), the roundtable includes this preference in the enriched session record summary
- **AC-005-02**: The preference is embedded and surfaces in future sessions via semantic search
- **AC-005-03**: No file editing, CLI command, or config change is required from the user
- **AC-005-04**: The roundtable acknowledges the override: "Got it, I'll remember that for future sessions"

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

## 7. Out of Scope

- **Real-time embedding during conversation**: Embedding happens post-session, not during the roundtable
- **Cross-project memory sharing**: User memory is personal; project memory is per-repo. No cross-repo memory federation
- **Memory deletion UI**: No conversational "forget this" command in this REQ (future extension)
- **Embedding model selection UI**: Model is configured via existing REQ-0045 configuration, not a new UI
- **Code embedding migration**: This REQ covers roundtable memory only, not the code-level embeddings from REQ-0045

## 8. MoSCoW Prioritization

| Priority | Requirements |
|---|---|
| **Must Have** | FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-010, FR-011 |
| **Should Have** | FR-006, FR-008, FR-009 |
| **Could Have** | (none) |
| **Won't Have** | Memory deletion, cross-project sharing, real-time embedding |

## 9. Dependency Map

```
FR-001 (enriched records) ← FR-002 (async embedding) depends on enriched content
FR-003 (dual index) ← FR-004 (semantic search) depends on indexes existing
FR-002 (async embedding) ← FR-008 (lazy fallback) handles FR-002 failures
FR-003 (dual index) ← FR-007 (model consistency) validates index model
FR-004 (semantic search) ← FR-006 (query interface) uses same search path
FR-010 (backward compat) is independent — fallback path
FR-011 (fail-open) cross-cuts all other requirements
```

## Pending Sections

(none -- all sections complete)
