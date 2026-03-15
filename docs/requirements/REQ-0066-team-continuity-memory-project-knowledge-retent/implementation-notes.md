# Implementation Notes: REQ-0066 Team Continuity Memory

**Phase**: 06 - Implementation
**Status**: Complete
**Date**: 2026-03-16
**TDD Iterations**: 2 (1 failure fix round)

---

## Summary

Extended 4 existing REQ-0064 modules with team continuity capabilities:
- Hybrid unified query (memory + codebase + profile in one call)
- Graph-based linking with 1-hop traversal
- Auto-generated team profile (materialized aggregate)
- Session linking and lineage tracking

**Zero new modules. Zero new dependencies. All paths fail-open.**

## Modified Files

| File | Changes | Lines Added |
|------|---------|-------------|
| `lib/memory-store-adapter.js` | Schema migration (links column), `getByIds()`, `updateLinks()` for both SQLite and .emb stores. Links field in search results. | ~120 |
| `lib/memory-search.js` | Extended `searchMemory()` with hybrid mode (codebase index, link traversal, profile loading). New `traverseLinks()` and `formatHybridMemoryContext()` exports. Backward compatible: no new options = REQ-0064 behavior. | ~200 |
| `lib/memory-embedder.js` | Extended `embedSession()` with 4 post-dedup steps: search-driven links (similarity 0.70-0.84), curator-driven links (builds_on/contradicts/supersedes), session linking, profile recomputation. Each step independently wrapped in try/catch (fail-open). | ~250 |
| `lib/memory.js` | No code changes. ContextNote relationship_hint extended at type level (pass-through: validation at consumer). | 0 |

## New Test Files

| File | New Tests | Total |
|------|-----------|-------|
| `lib/memory-store-adapter.test.js` | 17 | 62 |
| `lib/memory-search.test.js` | 31 | 53 |
| `lib/memory-embedder.test.js` | 21 | 39 |
| `lib/memory.test.js` | 6 | 89 |
| `lib/memory-integration.test.js` | 17 | 17 (new file) |
| **Total** | **92** | **260** |

## Coverage

| Module | Line % | Branch % | Function % |
|--------|--------|----------|------------|
| memory-store-adapter.js | 94.51 | 69.29 | 100 |
| memory-search.js | 92.94 | 76.24 | 87.5 |
| memory-embedder.js | 93.40 | 71.28 | 80 |
| memory.js | 92.20 | 83.97 | 100 |
| **Overall** | **91.35** | **74.37** | **93.24** |

## Key Design Decisions

### 1. Backward Compatibility via Hybrid Mode Detection

`searchMemory()` detects hybrid mode by checking for any REQ-0066 option (codebaseIndexPath, traverseLinks, includeProfile, profilePath, maxResultsPerSource). Without these options, it returns a plain `MemorySearchResult[]` identical to REQ-0064. With any option, it returns `HybridSearchResult`.

### 2. Links as Metadata, Not Graph DB (ADR-002)

Links stored as `links TEXT DEFAULT '[]'` column in SQLite (user store) and as `links[]` in .emb metadata (project store). Schema migration via `ALTER TABLE ADD COLUMN` runs on store open, checking `PRAGMA table_info` first to avoid duplicate column errors.

### 3. Fail-Open on Every New Step

All 4 post-dedup steps in `embedSession()` (search-driven links, curator links, session linking, profile recomputation) are individually wrapped in try/catch. Failure in any step does not affect:
- Core embedding result (still returns embedded: true)
- Other steps (each runs independently)
- The user experience (async, non-blocking)

### 4. Link Traversal Deduplication

`traverseLinks()` collects all unique `targetChunkId` values from all results' links[], batch-fetches them in one `getByIds()` call per store, then distributes fetched chunks back to their parent results. Same chunk linked from multiple results is fetched only once.

### 5. Validation at Consumer

`writeSessionRecord()` stores any `relationship_hint` value (pass-through). Validation happens in the embedder: only `builds_on`, `contradicts`, `supersedes` trigger curator-driven link creation. The existing `updates` and `extends` hints continue to work through REQ-0064's tiered dedup.

## Regression Status

- 168 existing REQ-0064 tests: All passing
- Full project suite: 1534/1537 (3 pre-existing failures unrelated to REQ-0066)
