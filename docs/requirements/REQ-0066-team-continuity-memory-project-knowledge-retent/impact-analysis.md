# Impact Analysis: Team Continuity Memory

**Status**: Final
**Confidence**: High
**Last Updated**: 2026-03-15

---

## 1. Blast Radius

### Tier 1 — Direct Changes

| File | Module | Change Type | Requirement Traces |
|---|---|---|---|
| `lib/memory-search.js` | memory-search | Modify | FR-001, FR-006, FR-008 |
| `lib/memory-embedder.js` | memory-embedder | Modify | FR-004, FR-005, FR-007 |
| `lib/memory-store-adapter.js` | memory-store-adapter | Modify | FR-003, FR-006 |
| `src/claude/commands/isdlc.md` | analyze handler | Modify | FR-001, FR-002 |

### Tier 2 — Transitive Impact

| File | Module | Impact | Change Needed |
|---|---|---|---|
| `lib/memory.js` | memory core | Consumes extended EnrichedSessionRecord with new relationship_hint values | No code change — existing writeSessionRecord() handles arbitrary fields |
| `tests/lib/memory-search.test.js` | tests | New test cases for hybrid search, link traversal, profile loading | Add tests |
| `tests/lib/memory-embedder.test.js` | tests | New test cases for link creation, session linking, profile recomputation | Add tests |
| `tests/lib/memory-store-adapter.test.js` | tests | New test cases for getByIds, updateLinks, schema migration | Add tests |

### Tier 3 — Potential Side Effects

| Area | Potential Impact | Risk Level |
|---|---|---|
| Existing roundtable memory behavior | `searchMemory()` return type changes from array to object — analyze handler must adapt | Medium (single consumer, controlled change) |
| `.emb` rebuild frequency | Curator-driven and search-driven link updates on project store trigger .emb rebuilds | Low (sub-second for < 500 vectors, same pattern as pin/archive) |
| SQLite schema | ALTER TABLE on user store — existing rows get empty links column | Low (safe migration with defaults) |

## 2. Entry Points

**Recommended starting point**: `lib/memory-store-adapter.js` — schema migration and new interface methods. Everything else depends on the store having link support.

**Rationale**: The store adapter is the foundation. `memory-search.js` and `memory-embedder.js` both consume the extended interface. Starting from the bottom ensures the interface contract is stable before building on it.

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel | Depends On |
|---|---|---|---|---|---|
| 1 | FR-003 | Store adapter: schema migration, getByIds, updateLinks | Low | — | None |
| 2 | FR-001 | memory-search: extend searchMemory() with codebase index | Medium | Can parallel with 3 | 1 |
| 3 | FR-005 | memory-embedder: search-driven link creation | Low | Can parallel with 2 | 1 |
| 4 | FR-004 | memory-embedder: curator-driven link creation | Low | — | 3 |
| 5 | FR-006 | memory-search: link traversal | Low | — | 1, 2 |
| 6 | FR-002 | memory-embedder: team profile recomputation + memory-search: profile loading | Low | — | 1, 2 |
| 7 | FR-007 | memory-embedder: session linking | Low | — | 1, 3 |
| 8 | FR-008 | memory-search: formatHybridMemoryContext with lineage | Low | — | 5, 6 |
| 9 | — | Analyze handler integration | Low | — | 2, 5, 6 |
| 10 | — | Backward compatibility + fail-open testing | Low | — | All |

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| RZ-001 | searchMemory() return type change breaks analyze handler | memory-search.js → analyze handler | Medium | Medium | Single consumer — update analyze handler in same PR. Test backward compat with no new params. |
| RZ-002 | SQLite schema migration fails on corrupted user store | memory-store-adapter.js | Low | Medium | Detect column existence before ALTER. On failure, create fresh DB (user memory is rebuild-able from session files). |
| RZ-003 | Link fan-out creates performance overhead in .emb rebuilds | memory-embedder.js → project store | Low | Low | Max 5 links per chunk. Rebuild is sub-second for < 500 vectors. |
| RZ-004 | Session linking reads many past session files | memory-embedder.js | Low | Low | Capped at 10 files. Each file is small (< 10KB). Total I/O < 100KB. |
| RZ-005 | Codebase .emb index model differs from memory index model | memory-search.js | Medium | Low | Model consistency check already exists (REQ-0064 FR-007). Skip mismatched codebase index, log warning. |

## 5. Summary

| Metric | Count |
|---|---|
| Direct modifications | 4 files |
| New files | 0 |
| New data files | 2 (team-profile.json, session-links.json per store) |
| Test modifications | 3 files |
| Config changes | 0 |
| Total affected | ~9 files |

**Overall risk**: Low. All changes extend existing modules with new optional parameters. Backward compatibility maintained via optional params with defaults. All new paths fail-open. No new dependencies.

**Recommendation**: Proceed. The blast radius is small and well-contained within the memory subsystem. No cross-cutting concerns outside lib/memory-*.

## Pending Sections

(none -- all sections complete)
