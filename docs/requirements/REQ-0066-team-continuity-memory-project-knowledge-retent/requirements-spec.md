# Requirements Specification: Team Continuity Memory — Project-Level Knowledge Retention

**Status**: Final
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Business Context

When a team resumes work on a project after days, weeks, or months, accumulated knowledge from past roundtable sessions is lost to the gap. Today, REQ-0064's memory layer provides semantic search over past session records, but it only searches memory indexes — it doesn't correlate with the codebase context, doesn't track how decisions evolved over time, and doesn't provide a ready-made team briefing for returning or new members.

REQ-0066 extends the REQ-0064 memory infrastructure with two high-leverage retrieval capabilities: (1) hybrid unified query that searches memory AND codebase embeddings in a single pass, so the roundtable can surface "this module was discussed 2 months ago when the team decided X because of code pattern Y", and (2) graph-based linking between memory entries with 1-hop traversal, so decision chains are queryable ("chose middleware → reconsidered → settled on direct integration").

**Cost of inaction**: Memory retrieval is limited to isolated session snapshots with no codebase correlation. Teams resuming after gaps lose context on why decisions were made and how they relate to the code. New team members have no curated onboarding beyond reading artifacts.

## 2. Stakeholders and Personas

| Stakeholder | Role | Interest |
|---|---|---|
| **Returning team member** (primary) | Developer resuming work after a gap | Needs past decisions and reasoning surfaced automatically with codebase context |
| **New team member** (secondary) | Developer joining an existing project | Needs curated team wisdom — bootstrap briefing of key decisions and patterns |
| **Framework user (solo)** (primary) | Individual developer using iSDLC | Benefits from cross-session continuity and codebase-correlated memory |

## 3. User Journeys

### 3.1 Returning After a Gap

**Entry**: Developer starts a roundtable analysis on a topic previously discussed weeks ago.
**Flow**: At startup, hybrid search retrieves semantically relevant past session memories AND related codebase chunks. Link traversal surfaces the decision chain — not just "we chose direct integration" but the evolution from middleware → reconsideration → direct integration, each linked to the relevant code files.
**Exit**: Developer has full context without reading old artifacts.

### 3.2 New Team Member Onboarding

**Entry**: New developer pulls the repo and runs their first roundtable.
**Flow**: Pre-computed team profile is delivered at startup — top high-value decisions (static profile) and recent session context (dynamic profile). Codebase search results are interleaved, grounding team decisions in actual code.
**Exit**: New member has a curated briefing of team wisdom in 5-10 key insights.

### 3.3 Cross-Session Continuity

**Entry**: Developer runs a series of roundtables over multiple sessions on related topics.
**Flow**: Each session's embedding step creates links to past sessions (search-driven `related_to`, curator-driven `builds_on`/`contradicts`). When a related topic surfaces later, linked memories are traversed, providing the full chain of reasoning.
**Exit**: Work across sessions maintains coherent context.

## 4. Technical Context

### 4.1 Existing Infrastructure (REQ-0064, Built)

- **`lib/memory-store-adapter.js`**: MemoryStore interface, SQLite user store, .emb project store
- **`lib/memory-search.js`**: Semantic search over dual stores, self-ranking, fallback to flat JSON
- **`lib/memory-embedder.js`**: Async embedding with tiered dedup, auto-pruning
- **`lib/memory.js`**: Enriched session records with playbook curator fields
- **`lib/embedding/`** (REQ-0045): Embedding engine (CodeBERT/Voyage/OpenAI), store-manager, knowledge pipeline, .emb package format

### 4.2 Existing Codebase Embedding

- **`code-index-mcp`**: MCP server providing structural/keyword search (tree-sitter + SQLite FTS5) — used by agents during workflows, independent of this REQ
- **`lib/embedding/` vector stack**: Semantic code embeddings via .emb packages — this is what the hybrid query integrates with

### 4.3 Architectural Constraint

All new capabilities MUST be implemented as deterministic hooks and lib functions. No new LLM calls introduced by this REQ. The only LLM involvement is extending REQ-0064's existing playbook curator pass to annotate richer relationship hints — zero additional LLM cost.

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|---|---|---|
| **Performance** | Critical | Hybrid search (3 indexes + link traversal + profile load) must complete in < 300ms total at roundtable startup |
| **Reliability** | Critical | All search paths fail-open. Missing codebase index → memory-only results. Broken links → skipped silently. Missing profile → no bootstrap context. |
| **Determinism** | Critical | All link creation, traversal, and profile generation must be deterministic. Same inputs → same outputs. |
| **Backward compatibility** | High | `searchMemory()` without new optional params behaves identically to REQ-0064 |
| **Non-blocking** | High | All embedding, link creation, and profile recomputation run async post-session. User never waits. |

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Link fan-out explosion (too many related_to links) | Medium | Medium | Max 5 links per chunk; similarity range 0.70-0.84 prevents noise |
| Codebase .emb index not available (embedding not configured) | Medium | Low | Fail-open: skip codebase results, return memory-only. Hybrid degrades gracefully. |
| Stale team profile (profile not recomputed after crash) | Low | Low | Profile is convenience, not critical. Stale profile is better than none. Recomputed on next successful embedding. |
| Broken links (target chunk pruned or corrupted) | Low | Low | Skip broken links silently during traversal. Log for debugging. |
| Schema migration on existing SQLite stores | Low | Medium | ALTER TABLE ADD COLUMN with DEFAULT values. Existing rows get empty links. No data loss. |

## 6. Functional Requirements

### FR-001: Hybrid Unified Query
**Priority**: Must Have | **Confidence**: High

Extend `searchMemory()` to search user memory, project memory, AND codebase embedding indexes in a single call, returning merged results with source tags.

- **AC-001-01**: Given a codebase .emb index exists at the provided path, when `searchMemory()` is called with `codebaseIndexPath`, then the codebase index is searched with the same query vector and results are tagged with `layer: 'codebase'`
- **AC-001-02**: Given all three indexes exist, when `searchMemory()` executes, then all three searches run in parallel via `Promise.allSettled()` — one failure does not block the others
- **AC-001-03**: Given results from multiple sources, when results are merged, then they are ranked by score with a configurable `maxResultsPerSource` limit (default: 5 per source)
- **AC-001-04**: Given the codebase index is missing or corrupted, when `searchMemory()` is called with `codebaseIndexPath`, then it returns memory-only results without error
- **AC-001-05**: Given `codebaseIndexPath` is not provided, when `searchMemory()` is called, then behavior is identical to REQ-0064 (backward compatible)

### FR-002: Auto-Generated Team Profile
**Priority**: Must Have | **Confidence**: High

A pre-computed team profile (static high-value entries + dynamic recent sessions) is materialized during async embedding and served at roundtable startup with zero computation.

- **AC-002-01**: Given the async embedding step completes successfully, when profile recomputation runs, then it queries both stores for top entries by combined score (hit_rate * importance * recency_factor) and writes `team-profile.json`
- **AC-002-02**: Given a team-profile.json exists, when `searchMemory()` is called with `includeProfile: true`, then the pre-computed profile is read and included in the result
- **AC-002-03**: Given team-profile.json is missing, when `searchMemory()` is called with `includeProfile: true`, then the result's `profile` field is null — no error, no computation
- **AC-002-04**: Given the profile is recomputed, then the static segment contains entries with `appeared_count > 3` and `accessed_count > 5` (stable high-value), and the dynamic segment contains the last 5 session summaries
- **AC-002-05**: Given profile recomputation fails, when the next roundtable starts, then the stale profile from the previous successful recomputation is served

### FR-003: Extended Link Types Schema
**Priority**: Must Have | **Confidence**: High

Memory chunks carry a `links[]` metadata array with typed relationships.

- **AC-003-01**: Given the SQLite user store schema, then a `links` TEXT column exists (JSON array of `{ targetChunkId, relationType, createdAt, createdBy }`)
- **AC-003-02**: Given the .emb project store metadata, then each chunk's metadata JSON includes a `links` array with the same structure
- **AC-003-03**: Given supported relation types are `builds_on`, `contradicts`, `related_to`, and `supersedes`, when a link is created, then its `relationType` must be one of these values
- **AC-003-04**: Given an existing REQ-0064 store with no links column, when the store is opened, then the schema migration adds the column with DEFAULT '[]' — no data loss, no errors

### FR-004: Curator-Driven Link Annotation
**Priority**: Must Have | **Confidence**: High

REQ-0064's playbook curator is extended to emit richer relationship hints consumed deterministically by the async embedding hook.

- **AC-004-01**: Given the `ContextNote.relationship_hint` type, then it supports: `'updates' | 'extends' | 'builds_on' | 'contradicts' | 'supersedes' | null`
- **AC-004-02**: Given a curator hint of `builds_on`, `contradicts`, or `supersedes`, when the async embedder processes the chunk, then it creates a directional link with the matched existing chunk from tiered dedup
- **AC-004-03**: Given a curator hint creates a link, then the inverse link is also created on the target chunk (`builds_on` ↔ `builds_on`, `contradicts` ↔ `contradicts`, `supersedes` → `superseded_by` mapped to `supersedes` with reversed direction)
- **AC-004-04**: Given no curator hint (null), when the async embedder processes the chunk, then no curator-driven link is created (existing REQ-0064 behavior preserved)

### FR-005: Search-Driven Link Creation
**Priority**: Must Have | **Confidence**: High

During async embedding, newly added chunks are mechanically linked to existing memories with cosine similarity in the 0.70-0.84 range.

- **AC-005-01**: Given a newly embedded chunk (Tier 4 New or Tier 3 Extend), when the embedder searches the same store, then existing chunks with similarity 0.70-0.84 receive bidirectional `related_to` links
- **AC-005-02**: Given a chunk already has 5 links, when search-driven link creation runs, then no additional links are created for that chunk (max 5 per chunk)
- **AC-005-03**: Given link creation fails for any chunk, when the embedder continues, then the embedding result is unaffected — link failures are non-blocking
- **AC-005-04**: Given `createLinks: false` is passed to `embedSession()`, then no search-driven links are created

### FR-006: 1-Hop Link Traversal at Search Time
**Priority**: Must Have | **Confidence**: High

When a memory is retrieved by search, its linked memories are also fetched and attached.

- **AC-006-01**: Given `traverseLinks: true` (default), when search results are returned, then each result's `links[]` metadata is read and linked chunks are batch-fetched from the same stores
- **AC-006-02**: Given a linked chunk ID does not exist in the store (pruned or corrupted), when traversal runs, then the broken link is skipped silently
- **AC-006-03**: Given linked chunks are fetched, then they are attached as `linkedMemories[]` on the parent result — not merged into the main results list
- **AC-006-04**: Given the same chunk is linked from multiple results, when traversal runs, then it is fetched only once (deduplicated)
- **AC-006-05**: Given `traverseLinks: false`, when search results are returned, then no link traversal occurs (performance optimization for simple searches)

### FR-007: Session Linking
**Priority**: Should Have | **Confidence**: High

Each session's embedding step compares against past sessions and creates session-level relationships.

- **AC-007-01**: Given a newly embedded session, when the embedder reads the last 10 raw session JSON files, then it compares session-level summary vectors by cosine similarity
- **AC-007-02**: Given a past session has similarity > 0.60, when comparison runs, then a session-level `related_to` link is stored in `session-links.json`
- **AC-007-03**: Given session-links.json exists, then it contains `{ sessionId, relatedSessions: [{ sessionId, similarity, createdAt }] }` entries for user and project stores respectively
- **AC-007-04**: Given session linking fails, when the embedder continues, then embedding completes normally — session linking is non-blocking

### FR-008: Lineage Tracking via Link Traversal
**Priority**: Should Have | **Confidence**: High

Decision evolution chains are queryable through link traversal — following `builds_on`, `supersedes`, and `contradicts` links.

- **AC-008-01**: Given a memory with a `supersedes` link, when 1-hop traversal runs, then the superseded memory is fetched and attached as a linked memory with its relationship type
- **AC-008-02**: Given a chain of `builds_on` links (A → B → C), when traversal runs for C, then B is fetched (1-hop). A is not fetched (would require 2-hop, out of scope)
- **AC-008-03**: Given linked memories are attached, then each linked memory includes its `relationType` so the consumer can reconstruct the decision sequence
- **AC-008-04**: Given the `formatSemanticMemoryContext()` function, when linked memories exist, then the formatted output includes relationship context: "Related (builds_on): {linked content}"

## 7. Out of Scope

| Item | Reason | Dependency |
|---|---|---|
| Formal memory type tagging (fact/preference/episode) | Cluster 1 — improves storage, not retrieval. Lower leverage. | Future REQ |
| Memory evolution/consolidation engine | Cluster 2 — periodic LLM pass for pattern extraction. Requires formal types. | Future REQ (depends on cluster 1) |
| Derives link creation | Schema defined here (FR-003), but creation requires consolidation engine | Future REQ (depends on cluster 2) |
| Cross-domain propagation hypotheses | Requires consolidation engine to identify cross-domain patterns | Future REQ |
| Gossip-style propagation / conflict-aware merge | Git-based sharing already works via .emb in repo. Conflict resolution deferred. | Future REQ |
| Multi-hop traversal (2+ hops) | 1-hop covers primary use case. Multi-hop adds complexity without clear benefit yet. | Future REQ if link density justifies |
| Cross-project memory | Different repos, different contexts. Out of scope for single-project memory. | Separate ticket |

## 8. MoSCoW Prioritization

| Priority | Requirements |
|---|---|
| **Must Have** | FR-001 (hybrid query), FR-002 (team profile), FR-003 (link types), FR-004 (curator links), FR-005 (search links), FR-006 (link traversal) |
| **Should Have** | FR-007 (session linking), FR-008 (lineage tracking) |
| **Won't Have** | Formal memory types, consolidation engine, Derives creation, cross-domain hypotheses, gossip propagation, multi-hop traversal |

## 9. Dependency Map

```
FR-001 (hybrid query) ← FR-006 (link traversal) — traversal extends search results
FR-001 (hybrid query) ← FR-002 (team profile) — profile delivered alongside search results
FR-003 (link types schema) ← FR-004 (curator links) — links stored using schema
FR-003 (link types schema) ← FR-005 (search links) — links stored using schema
FR-003 (link types schema) ← FR-006 (link traversal) — traversal reads link schema
FR-004 (curator links) depends on REQ-0064 playbook curator (extended hints)
FR-005 (search links) depends on REQ-0064 async embedding (extended post-dedup step)
FR-007 (session linking) depends on FR-003 (link types) for storage format
FR-008 (lineage tracking) depends on FR-006 (link traversal) for query mechanism

Cross-ticket: REQ-0064 (built) provides memory-store-adapter, memory-search,
memory-embedder, enriched session records, MemoryStore interface, tiered dedup,
playbook curator
```

## Pending Sections

(none -- all sections complete)
