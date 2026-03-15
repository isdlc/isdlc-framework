# Implementation Notes: REQ-0064 Roundtable Memory Vector DB Migration

**Phase**: 06 - Implementation
**Date**: 2026-03-15
**Status**: Complete

---

## Files Created

| File | Type | Description |
|------|------|-------------|
| `lib/memory-store-adapter.js` | New | Unified MemoryStore interface — SQLite user store + .emb project store |
| `lib/memory-embedder.js` | New | Async embedding orchestrator — chunks, embeds, deduplicates, prunes |
| `lib/memory-search.js` | New | Semantic search over dual stores with self-ranking and fallback |
| `lib/memory-store-adapter.test.js` | Test | 45 unit tests for store adapter (both backends) |
| `lib/memory-embedder.test.js` | Test | 18 unit tests for embedding orchestrator |
| `lib/memory-search.test.js` | Test | 22 unit tests for search module |

## Files Modified

| File | Change | Description |
|------|--------|-------------|
| `lib/memory.js` | Extended | writeSessionRecord returns `enriched: boolean`; compact supports vectorPrune, ageThresholdMonths, dedupeThreshold, expireTtl |
| `lib/memory.test.js` | Extended | +8 tests for EnrichedSessionRecord and vectorPrune extension |

## Test Results

- **Total REQ-0064 tests**: 93 (45 + 18 + 22 + 8)
- **Existing tests preserved**: 75 (all passing, 0 regressions)
- **Full suite**: 1442/1445 pass (3 pre-existing failures)
- **Coverage**: 91.72% line (memory-store-adapter 94%, memory-embedder 89%, memory-search 84%, memory.js 92%)

## Key Implementation Decisions

### 1. Dependency Injection for Testing
All three new modules accept a `deps` parameter for injectable dependencies (embed, chunkDocument, createUserStore, createProjectStore). This allows unit tests to mock the embedding engine and store backends without real model inference.

### 2. SQLite User Store via better-sqlite3
Uses synchronous `better-sqlite3` (already an optional dependency) for the user memory SQLite backend. Vectors stored as BLOBs with Float32Array <-> Buffer conversion. WAL journal mode for concurrent read performance.

### 3. .emb Project Store as In-Memory + Persist
The project store holds entries in memory and persists to .emb tar format on mutations. Uses the same tar format as the existing package builder (manifest.json + index.faiss + metadata.sqlite) for compatibility.

### 4. 4-Tier Dedup with Curator Hints
The `relationship_hint` field from the playbook curator determines whether a high-similarity match (0.85-0.94) is an Update (contradiction) or Extend (enrichment). This enables accurate knowledge evolution without duplicate proliferation.

### 5. Fail-Open Everywhere
Every public function follows Article X: searchMemory returns [], embedSession returns {embedded: false, error}, compact's vectorPrune catches all errors. Individual store failures are isolated.

### 6. Self-Ranking Formula
`final_score = cosine_similarity * (1 + log(1 + hit_rate)) * (1 + importance/20)`
where hit_rate = accessed_count / appeared_count. This rewards memories that are frequently useful.

## Traceability

- FR-003 (dual store): `memory-store-adapter.js` createUserStore/createProjectStore
- FR-004 (search): `memory-search.js` searchMemory with self-ranking
- FR-005 (embedding): `memory-embedder.js` embedSession
- FR-013 (dedup): 4-tier in both store add() methods
- FR-015 (curation): pin/archive/tag on both stores
- FR-016 (TTL): expireTtl in compact vectorPrune path
- FR-017 (container): container filter in search
