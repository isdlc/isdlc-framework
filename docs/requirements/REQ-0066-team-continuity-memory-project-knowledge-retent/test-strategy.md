# Test Strategy: Team Continuity Memory (REQ-0066)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0066
**Last Updated**: 2026-03-15
**Constitutional Articles**: II (Test-First), VII (Traceability), IX (Gate Integrity), XI (Integration Testing)

---

## Existing Infrastructure

- **Framework**: `node:test` (built-in Node.js test runner)
- **Assertion**: `node:assert/strict`
- **Coverage Tool**: `c8` (Istanbul-based)
- **Current Coverage**: 91.72% line coverage on memory modules (168 tests, REQ-0064)
- **Existing Patterns**: Co-located test files (`lib/*.test.js` for ESM), temp directory isolation via `createTempDir`/`cleanupTempDir` from `lib/utils/test-helpers.js`
- **Naming Convention**: `{module}.test.js` co-located with source
- **Test Helpers**: `lib/utils/test-helpers.js` provides `createTempDir()`, `cleanupTempDir()`
- **Mock Pattern**: Dependency injection via options object — `embed`, `createUserStore`, `createProjectStore` are injected, enabling pure unit tests with no real inference

## Strategy for This Requirement

- **Approach**: Extend existing REQ-0064 test files with new test cases for REQ-0066 capabilities. No new test files needed — all 4 modules already have co-located test files.
- **New Test Types Needed**: Unit (all 4 modules), Integration (cross-module link traversal + hybrid search + profile flows), Performance (< 300ms hybrid search with link traversal)
- **Coverage Target**: >= 80% line coverage per module (Article II standard tier)
- **Regression Baseline**: All 168 existing REQ-0064 tests must continue passing

## Test Commands (use existing)

- Unit: `node --test lib/memory-store-adapter.test.js lib/memory-embedder.test.js lib/memory-search.test.js lib/memory.test.js`
- Integration: `node --test lib/memory-integration.test.js`
- Coverage: `npx c8 node --test lib/memory*.test.js`
- Single module: `node --test lib/memory-search.test.js`

---

## Test Pyramid

The test pyramid extends REQ-0064's existing pyramid. REQ-0066 modifies 4 existing modules with no new modules, so tests are added to existing test files.

| Level | New Count | Modules Covered | Rationale |
|-------|-----------|----------------|----------|
| **Unit** | 78 | memory-search.js (32), memory-embedder.js (24), memory-store-adapter.js (16), memory.js (6) | Core logic: hybrid search, link traversal, link creation, profile recomputation, schema migration, new interface methods |
| **Integration** | 18 | Cross-module flows (search->traverse->store, embedder->links->store, profile->search) | Article XI: validate component interactions across module boundaries for new link and hybrid search flows |
| **Performance** | 4 | memory-search.js (hybrid search + traversal latency) | FR-001 requires < 300ms total hybrid search with link traversal |
| **Total** | 100 | | |

### Unit Test Distribution

| Module | Test File | New Tests | Focus |
|--------|-----------|-----------|-------|
| `memory-search.js` | `memory-search.test.js` | 32 | Hybrid search with codebase index, link traversal, profile loading, formatHybridMemoryContext, backward compat, fail-open on missing indexes |
| `memory-embedder.js` | `memory-embedder.test.js` | 24 | Search-driven link creation, curator-driven link creation, session linking, profile recomputation, createLinks:false opt-out, fail-open on link/session/profile errors |
| `memory-store-adapter.js` | `memory-store-adapter.test.js` | 16 | Schema migration (links column), getByIds() for SQLite and .emb, updateLinks() append behavior, broken ID handling, empty input handling |
| `memory.js` | `memory.test.js` | 6 | Extended ContextNote relationship_hint values (builds_on, contradicts, supersedes), backward compat with existing hints |

### Integration Test Distribution

| Test File | New Tests | Flow |
|-----------|-----------|------|
| `memory-integration.test.js` | 18 | Hybrid search end-to-end, link creation during embedding + traversal at search time, profile recomputation + delivery at search, session linking end-to-end, lineage chain traversal, backward compat (no new params = REQ-0064 behavior) |

---

## Flaky Test Mitigation

REQ-0066 introduces additional flakiness risks beyond REQ-0064:

| Risk | Mitigation |
|------|------------|
| **SQLite schema migration race** | Each test creates a fresh store in a unique temp directory. Migration runs on first open. No shared stores across tests. |
| **Floating-point similarity thresholds (0.70-0.84)** | Use deterministic mock vectors with known cosine similarities. Pre-compute expected similarities and use epsilon=0.001 comparisons. |
| **Link creation order non-determinism** | Assert on link existence and count, not on insertion order. Use Set-based comparisons for link targets. |
| **File I/O for profile and session-links JSON** | Each test uses a unique temp directory. Write/read within same test. Clean up via afterEach. |
| **Async embedding + link creation timing** | All async steps are awaited. embedSession() returns only after all steps (A-D) complete. No fire-and-forget. |
| **Codebase .emb index availability** | Tests provide mock codebase store via dependency injection. No real .emb file I/O in unit tests. |
| **Platform-specific path separators** | Use `path.join()` for all paths. Profile and session-links paths constructed from temp directory. |

---

## Performance Test Plan

### PT-001: Hybrid Search Latency (FR-001)
**Requirement**: Hybrid search across 3 indexes + link traversal + profile load must complete in < 300ms
**Setup**: Pre-populated user SQLite store (200 vectors), project .emb store (100 vectors), codebase .emb store (500 vectors). 10 results with 3 links each.
**Measure**: Wall-clock time from `searchMemory()` call to `HybridSearchResult` return
**Threshold**: < 300ms (p95)
**Runs**: 10 iterations, report mean/p95/max

### PT-002: Link Traversal Overhead
**Requirement**: Link traversal should add < 50ms overhead to base search
**Setup**: 10 search results, each with 5 links. 50 unique linked chunks to batch-fetch.
**Measure**: Wall-clock delta between `traverseLinks: false` and `traverseLinks: true`
**Threshold**: < 50ms additional latency

### PT-003: Profile Recomputation Throughput
**Setup**: User store with 200 entries (varied scores), project store with 50 entries
**Measure**: Wall-clock time for profile recomputation step in `embedSession()`
**Threshold**: < 100ms for query + JSON write

### PT-004: Link Creation Throughput
**Setup**: 5 new chunks embedded, each requiring similarity search + up to 5 link creations (bidirectional = up to 50 store operations)
**Measure**: Wall-clock time for search-driven link creation step
**Threshold**: < 200ms for all link operations

---

## Security Considerations

| Concern | Test Coverage |
|---------|---------------|
| Path traversal via `codebaseIndexPath` | Negative test: verify path validation rejects `../` sequences |
| Malformed JSON in `team-profile.json` | Negative test: verify graceful handling returns `profile: null` |
| Malformed JSON in `session-links.json` | Negative test: verify graceful handling, no crash |
| Oversized `links[]` array (DoS via link fan-out) | Test: verify max 5 links per chunk cap is enforced |

---

## Test Data Strategy

See `test-data-plan.md` for detailed test data specifications. Summary:

- **Mock stores**: Injected via options object, returning deterministic results
- **Mock vectors**: `makeVector(seed)` produces deterministic Float32Arrays for cosine similarity testing
- **Pre-computed similarities**: Test fixtures include vector pairs with known similarity values spanning the 0.70-0.84 link creation range
- **Profile fixtures**: Static and dynamic profile entries with known scores for threshold testing
- **Session fixtures**: Session records with varied summaries for session linking threshold testing

---

## Gate Dependencies

- **GATE-04 (this phase)**: Test strategy approved, test cases designed, traceability matrix 100% coverage
- **GATE-05 (implementation)**: All 100 new tests passing, >= 80% line coverage, 168 existing tests still passing
- **Article II**: Test-first — all test cases defined before implementation
- **Article VII**: Traceability — 100% FR/AC coverage in matrix
- **Article IX**: All required artifacts present and validated
- **Article XI**: Integration tests validate cross-module interactions
