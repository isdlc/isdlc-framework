# Code Review Report: REQ-0066 Team Continuity Memory

**Phase**: 08 - Code Review & QA
**Reviewer**: QA Engineer (Phase 08)
**Scope**: HUMAN REVIEW ONLY (per-file checks completed by Phase 06 Reviewer)
**Date**: 2026-03-16
**Verdict**: APPROVED

---

## Review Scope

Per-file implementation review was completed by the Phase 06 Reviewer during implementation. This review focuses on cross-cutting concerns: architecture coherence, business logic consistency, design pattern compliance, integration correctness, requirement completeness, and non-obvious security concerns.

### Files Reviewed

| File | Lines | Type | Role |
|------|-------|------|------|
| `lib/memory-store-adapter.js` | 1058 | Modified | Schema migration, getByIds(), updateLinks() |
| `lib/memory-search.js` | 483 | Modified | Hybrid search, link traversal, profile loading, formatHybridMemoryContext() |
| `lib/memory-embedder.js` | 714 | Modified | Search-driven links, curator links, session linking, profile recomputation |
| `lib/memory.js` | 694 | Modified | Extended ContextNote relationship_hint values |
| `lib/memory-integration.test.js` | 549 | New | Cross-module integration tests (INT-001 through INT-018) |

---

## Cross-Cutting Review Checklist

- [X] Architecture decisions align with design specifications
- [X] Business logic is coherent across all new/modified files
- [X] Design patterns are consistently applied
- [X] Non-obvious security concerns (cross-file data flow, auth boundaries) -- none found
- [X] All requirements from requirements-spec.md are implemented
- [X] Integration points between new/modified files are correct
- [X] No unintended side effects on existing functionality
- [X] Overall code quality impression (human judgment) -- good
- [X] Merge approval: ready for main branch

---

## Architecture Coherence

The implementation adheres to the core architectural constraint: ALL new code is deterministic hooks/lib functions. No new LLM calls. Zero new dependencies. All paths fail-open. The "extend, don't create" principle from the module design is followed -- 4 existing REQ-0064 modules are extended with no new module files.

Module boundaries match the diagram in module-design.md Section 7:
- `memory-search.js` owns search orchestration, traversal, and formatting
- `memory-embedder.js` owns post-dedup steps (link creation, session linking, profile recomputation)
- `memory-store-adapter.js` owns data access (schema migration, batch fetch, link persistence)
- `memory.js` owns session record types (extended ContextNote hints)

No cross-boundary violations detected. Each module imports only its documented dependencies.

## Business Logic Coherence

### Hybrid Search Flow (FR-001)

The end-to-end flow is coherent:
1. `searchMemory()` detects hybrid mode via option presence (line 47-48)
2. Three stores opened in parallel with fail-open patterns (lines 89-120)
3. `Promise.allSettled()` runs all searches concurrently (lines 123-147)
4. Results tagged by source and merged by score (lines 148-200)
5. Link traversal and profile loading run after search (lines 164-185)
6. Backward compatibility preserved: no new options = array return (line 220-233)

### Link Creation Flow (FR-004, FR-005)

Coherent across embedder and store:
1. `embedSession()` runs tiered dedup (existing), then Steps A-D (new)
2. Step A: `createSearchDrivenLinks()` searches same store for 0.70-0.84 similarity, creates bidirectional `related_to` links
3. Step B: `createCuratorDrivenLinks()` reads `relationship_hint` from chunks, creates directional links with inverse
4. Both steps call `store.updateLinks()` -- implemented identically in SQLite and .emb stores
5. Link validation uses `VALID_TYPES` set in both store and embedder

### Profile Lifecycle (FR-002)

Coherent across embedder (write) and search (read):
1. `recomputeTeamProfile()` queries stores for static (top 10 by score) and dynamic (last 5 by timestamp) entries
2. Writes to all profile paths with fail-open per path
3. `searchMemory()` reads profile via `readFile()` with fail-open (stale profile served if recompute fails)

## Integration Point Correctness

| Caller | Callee | Interface | Verified |
|--------|--------|-----------|----------|
| `memory-search.js:traverseLinks()` | `store.getByIds()` | `string[] -> MemorySearchResult[]` | Both SQLite and .emb implement identical signatures |
| `memory-search.js:searchMemory()` | `store.search()` | Extended to return `links[]` on each result | Both stores populate `links` field |
| `memory-embedder.js:createSearchDrivenLinks()` | `store.updateLinks()` | `(chunkId, MemoryLink[]) -> void` | Both stores validate via VALID_TYPES, append to existing |
| `memory-embedder.js:createCuratorDrivenLinks()` | `store.search()` + `store.updateLinks()` | Search for match, then link | Correctly handles both user and project stores |
| `memory-embedder.js:recomputeTeamProfile()` | `store.search()` | Uses Float32Array(4) as generic query vector | Both stores handle arbitrary-dimension queries |

## Requirement Completeness

All 8 FRs and their ACs are implemented:

| FR | Status | ACs Covered | Implementation |
|----|--------|-------------|----------------|
| FR-001 Hybrid Query | Complete | AC-001-01..05 | `searchMemory()` extended with codebase store, parallel search, source tags |
| FR-002 Team Profile | Complete | AC-002-01..05 | `recomputeTeamProfile()` + profile loading in search |
| FR-003 Link Schema | Complete | AC-003-01..04 | SQLite migration, .emb metadata, VALID_TYPES, schema migration |
| FR-004 Curator Links | Complete | AC-004-01..04 | `createCuratorDrivenLinks()` with CURATOR_HINTS and INVERSE_MAP |
| FR-005 Search Links | Complete | AC-005-01..04 | `createSearchDrivenLinks()` with bidirectional related_to |
| FR-006 1-Hop Traversal | Complete | AC-006-01..05 | `traverseLinks()` with batch fetch, dedup, broken link skip |
| FR-007 Session Linking | Complete | AC-007-01..04 | `createSessionLinks()` with session-links.json append |
| FR-008 Lineage Tracking | Complete | AC-008-01..04 | Traversal + `formatHybridMemoryContext()` with relationship annotations |

No unimplemented requirements. No orphan code (all new functions trace to specific FRs).

## Non-Obvious Security Concerns

- **SQL injection in `getByIds()`**: Uses parameterized placeholders (`?`) for IN clause (line 462). Safe.
- **Link type validation**: `VALID_TYPES` Set enforces allowed relation types in both `updateLinks()` implementations. Invalid types silently filtered. Safe.
- **JSON parsing of links column**: All `JSON.parse(row.links)` calls wrapped in try/catch with fallback to empty array. Safe.
- **Path traversal**: No new user-controlled path inputs. Profile and session-links paths are provided by callers (framework code), not end users.
- **Data integrity**: `updateLinks()` reads-then-writes (not atomic) but acceptable for single-writer use case in CLI context.

## Findings

### Finding 1: updateLinks() implementation deviates from spec (Informational)

**File**: `lib/memory-store-adapter.js` lines 499-505
**Category**: Specification deviation
**Severity**: Informational (not blocking)
**Description**: Module-design.md Section 4.4 specifies `json_insert(links, '$[#]', json(?))` for SQLite link updates. The actual implementation reads JSON, parses in JS, appends, and writes back via UPDATE. This avoids a dependency on SQLite's JSON1 extension, which is more portable.
**Verdict**: Acceptable deviation. The implementation is functionally equivalent and more portable. No action required.

### Finding 2: Duplicate cosine similarity function (Low)

**File**: `lib/memory-embedder.js` lines 496-506
**Category**: Technical debt (DRY)
**Severity**: Low
**Description**: `cosineSim()` in memory-embedder.js duplicates `cosineSimilarity()` from memory-store-adapter.js. This avoids a circular import path since memory-embedder already imports from memory-store-adapter indirectly.
**Suggestion**: Consider extracting shared math utilities to a common module in a future cleanup. Not blocking for this REQ.

### Finding 3: INVERSE_MAP symmetry for supersedes (Informational)

**File**: `lib/memory-embedder.js` lines 338-342
**Category**: Design decision
**Severity**: Informational
**Description**: The `INVERSE_MAP` maps `supersedes -> supersedes` (symmetric) rather than introducing a `superseded_by` type. This is consistent with the module design text and the VALID_TYPES set which does not include `superseded_by`. Direction is encoded by which chunk holds the link.
**Verdict**: Correct interpretation of the spec. No action required.

---

## Summary

| Metric | Value |
|--------|-------|
| Files reviewed | 5 (4 production + 1 integration test) |
| Critical findings | 0 |
| High findings | 0 |
| Medium findings | 0 |
| Low findings | 1 (duplicate cosine function) |
| Informational | 2 |
| Tests passing | 260/260 |
| Line coverage | 91.35% |
| Branch coverage | 74.37% |
| Function coverage | 93.24% |
| New tests | 92 |
| Existing tests preserved | 168 |
| Regressions | 0 |
| FRs implemented | 8/8 |
| ACs covered | All |

**Verdict: APPROVED** -- Code is ready for merge to main. All cross-cutting concerns validated. No blocking findings. Architecture, business logic, and integration points are coherent. All requirements implemented. All constitutional articles satisfied.
