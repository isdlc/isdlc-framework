# Impact Analysis: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Blast Radius

### Tier 1 — Direct Changes

| File | Change Type | Description |
|---|---|---|
| `lib/memory.js` | Major modify | Rewrite read/write functions to support vector storage; add `searchMemory()` integration; preserve flat JSON fallback; modify `writeSessionRecord()` for enriched format; modify `compact()` for vector index maintenance |
| `lib/memory-embedder.js` | New | Async embedding orchestrator: chunks NL summary, embeds via engine, appends to `.emb` index |
| `lib/memory-search.js` | New | Semantic search: loads dual indexes, embeds query, cosine similarity via store-manager, merges results with layer tags |
| `src/claude/commands/isdlc.md` | Modify | Analyze handler: replace key-value memory read with semantic search; spawn async embedding post-ROUNDTABLE_COMPLETE; update MEMORY_CONTEXT format |
| `src/claude/agents/roundtable-analyst.md` | Modify | Update MEMORY_CONTEXT parsing to consume ranked semantic excerpts instead of structured preferences; update SESSION_RECORD output to include NL summary and context_notes |

### Tier 2 — Transitive Impact

| File | Impact |
|---|---|
| `lib/cli.js` | Extend `memory` subcommand: `compact` now handles vector pruning; potential new subcommands (`search`, `status`) |
| `lib/memory.test.js` | Major test rewrite: new test cases for embedding, search, dual-index, model consistency, fallback |
| `lib/memory-embedder.test.js` | New test file |
| `lib/memory-search.test.js` | New test file |
| `.gitignore` | Verify `docs/.embeddings/` is NOT in gitignore (must be tracked) |
| `docs/.embeddings/` | New directory: project vector index location |

### Tier 3 — Potential Side Effects

| Area | Risk | Mitigation |
|---|---|---|
| Roundtable prompt size | Semantic excerpts may be larger than structured preferences | Configurable result limit (default: 10); excerpt truncation |
| Embedding backend dependency | New soft dependency on embedding engine at write time | Fail-open: raw text persists; lazy embed on read; flat JSON fallback |
| Git repo size | `.emb` binary files increase repo size | Memory indexes are small (KB, not MB); compaction prunes old vectors |
| Team model divergence | Different team members may use different embedding models | Model consistency check at search time; `rebuildIndex` resolution |

## 2. Entry Points

| Entry Point | Description |
|---|---|
| `src/claude/commands/isdlc.md` (analyze handler) | Primary: reads memory at roundtable start, writes session record at end |
| `lib/cli.js` (memory subcommand) | Secondary: user-triggered compaction and index management |
| `src/claude/agents/roundtable-analyst.md` | Consumer: receives MEMORY_CONTEXT, produces SESSION_RECORD |

## 3. Implementation Order

1. **FR-001: Enriched session record format** — Define the new `EnrichedSessionRecord` type in `lib/memory.js`. Extend `writeSessionRecord()` to accept and persist enriched fields. Backward-compatible: existing callers still work.

2. **FR-003: Dual-index architecture** — Create `lib/memory-embedder.js` with `embedSession()` function. Create `docs/.embeddings/` directory. Define index paths for user and project.

3. **FR-002: Async write-time embedding** — Wire `embedSession()` into the analyze handler post-ROUNDTABLE_COMPLETE. Fire-and-forget pattern with error logging.

4. **FR-004: Semantic search at startup** — Create `lib/memory-search.js` with `searchMemory()`. Wire into analyze handler to replace `readUserProfile()`/`readProjectMemory()` read path. Format results as new MEMORY_CONTEXT.

5. **FR-007: Model consistency enforcement** — Add `checkModelConsistency()` to `lib/memory-search.js`. Call before search. Warn on mismatch.

6. **FR-010 + FR-011: Backward compatibility and fail-open** — Ensure flat JSON fallback in all read/write paths. Test degradation scenarios.

7. **FR-005: Conversational override** — Update roundtable agent prompt to recognize preference statements and include in enriched session record.

8. **FR-008: Lazy embed fallback** — Add un-embedded record detection to `searchMemory()`. Embed on the spot before returning results.

9. **FR-006: Conversational query** — Update roundtable agent prompt to handle "what do you remember?" queries.

10. **FR-009: Vector compaction** — Extend `compact()` in `lib/memory.js` for vector pruning (age, deduplication, rebuild).

## 4. Risk Zones

| Zone | Risk Level | Description |
|---|---|---|
| `lib/memory.js` rewrite | Medium | Major changes to existing working code. Must preserve all REQ-0063 behavior as fallback. |
| Analyze handler dispatch changes | Medium | Changes to prompt injection affect roundtable behavior. Must test both legacy and new MEMORY_CONTEXT formats. |
| Async embedding reliability | Low | Background job may fail silently. Lazy embed fallback covers this. |
| `.emb` format for memory content | Low | Using existing format for new content type. Manifest `contentType` field distinguishes from code embeddings. |

## 5. File Count Summary

| Category | Count |
|---|---|
| New files | 4 (memory-embedder.js, memory-search.js, + 2 test files) |
| Modified files | 4 (memory.js, isdlc.md, roundtable-analyst.md, cli.js) |
| Test files | 3 (memory.test.js rewrite, 2 new test files) |
| Config/other | 2 (.gitignore check, docs/.embeddings/ directory) |
| **Total** | ~13 files |

## Pending Sections

(none -- all sections complete)
