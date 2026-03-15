# Test Strategy: Roundtable Memory Vector DB Migration (REQ-0064)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0064
**Last Updated**: 2026-03-15
**Constitutional Articles**: II (Test-First), VII (Traceability), IX (Gate Integrity), XI (Integration Testing)

---

## Existing Infrastructure

- **Framework**: `node:test` (built-in Node.js test runner)
- **Assertion**: `node:assert/strict`
- **Coverage Tool**: `c8` (Istanbul-based, used for `lib/memory.js`)
- **Current Coverage**: 99.34% line coverage on `lib/memory.js` (75 tests, REQ-0063)
- **Existing Patterns**: Co-located test files (`lib/*.test.js` for ESM), temp directory isolation via `createTempDir`/`cleanupTempDir` from `lib/utils/test-helpers.js`
- **Naming Convention**: `{module}.test.js` co-located with source
- **Test Helpers**: `lib/utils/test-helpers.js` provides `createTempDir()`, `cleanupTempDir()`

## Strategy for This Requirement

- **Approach**: Extend existing test suite with new co-located test files for 3 new modules + extend `memory.test.js` for modified functions
- **New Test Types Needed**: Unit (all 4 modules), Integration (cross-module flows), Performance (< 200ms search latency)
- **Coverage Target**: >= 80% line coverage per new module (Article II standard tier)
- **Regression Baseline**: All 75 existing `memory.test.js` tests must continue passing

## Test Commands (use existing)

- Unit: `node --test lib/memory-store-adapter.test.js lib/memory-embedder.test.js lib/memory-search.test.js lib/memory.test.js`
- Integration: `node --test lib/memory-integration.test.js`
- Coverage: `npx c8 node --test lib/memory*.test.js`
- Single module: `node --test lib/memory-store-adapter.test.js`

---

## Test Pyramid

The test pyramid for REQ-0064 is weighted toward unit tests given the 4-module architecture with clear boundaries.

| Level | Count | Modules Covered | Rationale |
|-------|-------|----------------|----------|
| **Unit** | 118 | All 4 modules individually | Core logic: dedup tiers, scoring formulas, adapter operations, search ranking, enriched record handling |
| **Integration** | 24 | Cross-module flows (embedder->adapter, search->adapter->engine, memory->embedder) | Article XI: validate component interactions across module boundaries |
| **Performance** | 4 | memory-search.js, memory-store-adapter.js | FR-004 requires < 200ms search latency |
| **Total** | 146 | | |

### Unit Test Distribution

| Module | Test File | Test Count | Focus |
|--------|-----------|------------|-------|
| `memory-store-adapter.js` | `memory-store-adapter.test.js` | 42 | SQLite CRUD, .emb CRUD, MemoryStore interface, tiered dedup, self-ranking, curation, auto-pruning |
| `memory-embedder.js` | `memory-embedder.test.js` | 28 | embedSession flow, rebuildIndex, chunking, error handling, capacity limits |
| `memory-search.js` | `memory-search.test.js` | 30 | searchMemory, checkModelConsistency, formatSemanticMemoryContext, lazy embed, container filtering |
| `memory.js` (extended) | `memory.test.js` (extend) | 18 | EnrichedSessionRecord handling, extended compact with vectorPrune, backward compatibility |

### Integration Test Distribution

| Test File | Test Count | Flow |
|-----------|------------|------|
| `memory-integration.test.js` | 24 | End-to-end write path, end-to-end read path, compaction flow, fallback paths, curation flow, model mismatch recovery |

---

## Flaky Test Mitigation

The vector DB migration introduces several flakiness risks:

| Risk | Mitigation |
|------|------------|
| **SQLite file locking** | Each test uses a unique temp directory via `createTempDir()`. No shared database across tests. |
| **Floating-point cosine similarity** | Use `Math.abs(actual - expected) < epsilon` with epsilon = 0.001 for similarity comparisons. Never use strict equality on float scores. |
| **Async embedding timing** | All async operations are awaited directly in tests. No fire-and-forget patterns in test code. |
| **Temp file cleanup** | `afterEach`/`after` hooks always call `cleanupTempDir()`. Tests use `try/finally` for cleanup on assertion failure. |
| **Embedding engine dependency** | All tests mock the embedding engine. No real model inference during unit tests. A stub `embed()` returns deterministic Float32Arrays based on content hash. |
| **Order-dependent tests** | Each test creates its own store instances. No shared mutable state across `it()` blocks. |
| **Platform-specific SQLite paths** | Use `path.join()` and temp directories, never hardcoded paths. |

---

## Performance Test Plan

### PT-001: Search Latency Under Target (FR-004)
**Requirement**: Semantic search at roundtable startup must complete in < 200ms
**Setup**: Pre-populated user SQLite store with 200 vectors + project .emb store with 100 vectors
**Measure**: Wall-clock time from `searchMemory()` call to result return
**Threshold**: < 200ms (p95)
**Runs**: 10 iterations, report mean/p95/max

### PT-002: Search Latency at Capacity Limit
**Setup**: Both stores at capacity limit (500 vectors each)
**Measure**: Wall-clock time for `searchMemory()` with maxResults=10
**Threshold**: < 500ms (conservative upper bound at max capacity)

### PT-003: Embedding Throughput
**Setup**: EnrichedSessionRecord with 5 context_notes (typical session)
**Measure**: Wall-clock time for `embedSession()` to complete (with mocked engine returning immediately)
**Threshold**: < 100ms for the orchestration overhead (excluding actual model inference)

### PT-004: Auto-Prune Latency
**Setup**: Store at 510 vectors (10 over limit), trigger prune to 450
**Measure**: Wall-clock time for `prune(450)` to complete
**Threshold**: < 200ms

---

## Module-Level Test Strategy

### 1. memory-store-adapter.js (NEW)

**Test approach**: Direct unit tests against `createUserStore()` and `createProjectStore()` return values. Each test gets a fresh temp directory with its own SQLite DB or .emb file.

**Mocking strategy**:
- Mock `better-sqlite3` only for error simulation tests. Normal tests use real SQLite in temp directory (fast, isolated).
- Mock `store-manager.js` for .emb project store tests. Provide stub `readPackage()`, `findNearest()`, `buildPackage()`.
- Mock embedding engine for vector generation.

**Key test areas**:
- MemoryStore interface contract (both implementations)
- 4-tier dedup logic (Reject/Update/Extend/New) with all similarity thresholds
- Self-ranking formula: `cosine * (1 + log(1 + hit_rate)) * (1 + importance/20)`
- Curation operations (pin, archive, tag)
- Auto-pruning at capacity limit
- Schema creation on first open
- Graceful handling of missing/corrupt files

### 2. memory-embedder.js (NEW)

**Test approach**: Unit tests with mocked dependencies (engine, pipeline, store adapter). Focus on orchestration logic, error handling, and the never-throw contract.

**Mocking strategy**:
- Mock `embed()` from engine to return deterministic vectors
- Mock `chunkDocument()` from pipeline to return predictable chunks
- Mock `MemoryStore.add()` to verify dedup tier routing
- Mock file I/O for raw session JSON updates

**Key test areas**:
- embedSession happy path (both stores)
- embedSession with partial store failure (one succeeds, one fails)
- embedSession never throws (returns error in result)
- Auto-prune trigger when capacity exceeded
- rebuildIndex from raw session files
- Handling of non-enriched records (no summary field)

### 3. memory-search.js (NEW)

**Test approach**: Unit tests with mocked stores and engine. Integration tests with real SQLite store.

**Mocking strategy**:
- Mock `createUserStore()` and `createProjectStore()` to return stub MemoryStore
- Mock `embed()` for query vector generation
- Mock `embedSession()` for lazy embed tests

**Key test areas**:
- searchMemory merges results from both stores
- Score ranking and filtering (minScore, maxResults)
- Container filtering (FR-017)
- Model consistency check and mismatch handling
- Fail-open on individual store failure
- Lazy embed of un-embedded records
- `accessed_count` increment for returned results
- formatSemanticMemoryContext output format

### 4. memory.js (MODIFIED)

**Test approach**: Extend existing `memory.test.js` with new test blocks for enriched record handling and extended compact.

**Mocking strategy**:
- Same as existing tests (real file I/O in temp directories)
- No mocking needed for writeSessionRecord (it's pure file I/O)

**Key test areas**:
- writeSessionRecord accepts EnrichedSessionRecord
- writeSessionRecord returns `enriched: true` when NL fields present
- writeSessionRecord backward-compatible with plain SessionRecord
- compact with vectorPrune option
- compact with TTL expiry (expireTtl)
- Existing 75 tests continue passing (regression)

---

## Security Testing

| Area | Test | Article |
|------|------|---------|
| Path traversal in store paths | Verify `createUserStore()` and `createProjectStore()` reject paths with `..` | Article III |
| SQL injection in SQLite queries | All queries use parameterized statements; test with malicious content strings | Article III |
| Large input handling | Test with content strings > 1MB to verify no OOM or crash | Article III |
| Sensitive content in embeddings | Verify no API keys or secrets are embedded (content is NL summaries only) | Article III |

---

## Test Data Strategy

See `test-data-plan.md` for detailed test data specifications.

**Summary**: Test data is generated programmatically using factory functions (extending the `makeSessionRecord()` pattern from REQ-0063). No external test data files. Deterministic vector generation via content-hash-based Float32Array stubs.

---

## Critical Paths (100% coverage required)

1. **Write path**: writeSessionRecord -> embedSession -> store.add (4-tier dedup) -> auto-prune
2. **Read path**: searchMemory -> store.search -> merge -> rank -> incrementAccess
3. **Fallback path**: searchMemory returns [] -> fallback to flat JSON (REQ-0063 path)
4. **Fail-open path**: Any embedding/store failure -> graceful degradation, no crash
5. **Model consistency**: Mismatch detected -> skip store -> return partial results
6. **Backward compatibility**: Plain SessionRecord -> writeSessionRecord works unchanged

---

## GATE-05 Checklist

- [x] Test strategy covers unit, integration, E2E, security, performance
- [x] Test cases exist for all 17 functional requirements (146 total)
- [x] Traceability matrix complete (100% requirement coverage, 70 ACs mapped)
- [x] Coverage targets defined (>= 80% line per module, Article II standard tier)
- [x] Test data strategy documented (test-data-plan.md)
- [x] Critical paths identified (6 paths, 100% coverage)
- [x] Regression baseline established (75 existing tests must pass)
- [x] Constitutional articles validated (II, VII, IX, XI)
