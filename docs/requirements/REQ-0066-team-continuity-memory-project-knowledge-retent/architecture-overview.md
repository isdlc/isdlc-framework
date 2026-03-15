# Architecture Overview: Team Continuity Memory

**Status**: Final
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Architecture Decisions

### ADR-001: Hybrid Query via Extended searchMemory()

**Context**: REQ-0066 introduces hybrid search across memory and codebase embedding indexes. Need to decide whether to create a new function or extend the existing one.

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. New `hybridSearch()` function | Separate function that queries all three indexes | Clean separation; doesn't touch REQ-0064 code | Duplicates search logic; two search entry points to maintain | Eliminated |
| B. Extend `searchMemory()` with codebase index parameter | Add optional `codebaseIndexPath` to existing function | Single entry point; reuses ranking/merge logic; backward compatible (param is optional) | Couples memory and code search in one function | **Selected** |

**Decision**: Option B. `searchMemory()` already merges user + project results with layer tags. Adding a third source (`codebase`) follows the same pattern. Callers that don't pass the codebase path get current behavior unchanged.

**Rationale**: Maintaining a single search entry point prevents drift between two implementations. The coupling concern is mitigated by the fact that codebase search uses the exact same `.emb` format and `MemoryStore` interface — it's the same operation on a different index file.

**Consequences**: `searchMemory()` gains new optional parameters. Return type changes from `MemorySearchResult[]` to `HybridSearchResult` (breaking change for direct callers — but the analyze handler is the only consumer, and it adapts).

### ADR-002: Link Storage as Metadata, Not Graph DB

**Context**: REQ-0066 introduces relationships between memory entries. Need to decide on storage mechanism.

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. Graph database (FalkorDB/Neo4j) | Dedicated graph store for relationships | Fast multi-hop traversal; native graph queries | New dependency; operational complexity; overkill for 1-hop | Eliminated |
| B. Metadata links on existing stores | `links[]` array on each MemoryChunk in SQLite/.emb metadata | Zero new dependencies; uses existing stores; simple 1-hop via secondary query | Multi-hop requires recursive queries; link density limited | **Selected** |

**Decision**: Option B. REQ-0066 only needs 1-hop traversal. The `links[]` array on each chunk is a secondary query after primary search — fetch linked chunk IDs, batch-read from the same store. If link density grows to justify a graph DB, that's a future migration on a stable schema.

**Rationale**: The expected link density is low — max 5 links per chunk, with most chunks having 0-2 links. A graph DB adds a dependency and operational burden that isn't justified at this scale.

**Consequences**: Multi-hop traversal (2+ hops) would require recursive queries, which is inefficient on flat metadata. This is acceptable since multi-hop is explicitly deferred.

### ADR-003: Hook-Based Deterministic Execution Model

**Context**: REQ-0066 capabilities could be implemented via LLM prompt instructions or deterministic code. Need to decide the execution model.

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. LLM prompt injection | Instruct the LLM to call search/link functions via prompt | Flexible; LLM can decide what to search | Non-deterministic; blocks user; may skip steps | Eliminated |
| B. Hook + lib functions | Hooks trigger deterministic lib functions at session start/end; results delivered as context | Deterministic; non-blocking (async embedding); user never waits for new LLM calls | Less flexible; relationship classification limited to heuristics + curator hints | **Selected** |

**Decision**: Option B. All new capabilities as deterministic code. The analyze handler calls `searchMemory()` at startup (lib function, not LLM decision). The async embedding hook creates links mechanically. The only LLM touch point is extending REQ-0064's existing curator to annotate richer relationship hints — zero additional LLM cost.

**Rationale**: Determinism ensures critical memory operations aren't probabilistically skipped. Non-blocking async execution ensures the user is never waiting for memory infrastructure. The curator hint extension piggybacks on an existing LLM pass with no additional latency.

**Consequences**: Relationship classification is limited to what the curator can annotate and what cosine similarity can detect. Nuanced relationships that require deep language understanding will be less accurate than LLM-driven classification — but consistently applied, which is the higher priority.

### ADR-004: Team Profile as Materialized View

**Context**: Need to provide a curated team briefing at roundtable startup. Could compute on-demand or pre-compute.

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. On-demand LLM summarization | Generate team profile via LLM at each roundtable startup | Rich NL summaries; adapts to context | Blocks user; non-deterministic; latency at every startup | Eliminated |
| B. Materialized aggregate | Compute profile from stored metadata during async embedding; serve pre-computed at startup | Instant retrieval; deterministic; zero startup latency | Less nuanced than LLM summary; stale until next embedding run | **Selected** |

**Decision**: Option B. The team profile is a materialized view over the memory index — top-N entries by combined score, split into static (persistent high-scorers) and dynamic (last 5 sessions). Recomputed after each async embedding pass. Served as a pre-built JSON at roundtable startup.

**Rationale**: Startup performance is critical — the user should not wait for profile generation. The materialized view updates after every session embedding (async, non-blocking). Staleness between sessions is acceptable since the profile is convenience context, not authoritative data.

**Consequences**: Profile content is limited to stored metadata fields. No NL summarization beyond what REQ-0064's curator already provides in session summaries. Profile quality depends on the quality of REQ-0064's enriched session records.

### ADR-005: Full Codebase Search (No Scoping Filter)

**Context**: The hybrid query could scope codebase search to topic-relevant files or search the full index. Need to decide.

**Decision**: Full codebase search with no scoping filter. Cosine similarity handles relevance naturally.

**Rationale**: The codebase `.emb` index for a project like iSDLC (~250 source files) contains roughly 2,000-5,000 vectors. Cosine similarity over 5,000 Float32Array vectors is sub-millisecond on modern hardware. Even 50,000 vectors completes in single-digit milliseconds. The expensive part is the query embedding (~50-200ms), which is fixed regardless of index size. Scoping adds complexity without meaningful performance benefit.

**Consequences**: Results may include code from unrelated areas of the codebase — but they'll rank low by cosine similarity and be filtered by `minScore` threshold. No false negatives from over-scoping.

## 2. Technology Decisions

- **Zero new dependencies**: Extends existing REQ-0064 modules and REQ-0045 embedding stack
- **Storage**: Links stored in existing SQLite columns (user) and .emb metadata JSON (project). Schema migration via `ALTER TABLE ADD COLUMN` with defaults.
- **Team profile**: Materialized as `team-profile.json` at user (`~/.isdlc/user-memory/`) and project (`.isdlc/`) level
- **Session links**: Stored in `session-links.json` at user (`~/.isdlc/user-memory/`) and project (`.isdlc/`) level

## 3. Integration Points

| Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|
| Analyze handler | `lib/memory-search.js` (extended) | Function call at startup | Query text + codebase index path in, HybridSearchResult out | Fail-open: missing codebase index → skip, return memory-only |
| `lib/memory-search.js` | Link traversal (internal) | Secondary query after primary search | Chunk IDs from `links[]` → batch fetch | Fail-open: broken links skipped |
| `lib/memory-embedder.js` | Search-driven link creation (internal) | Post-dedup step during async embedding | Similarity 0.70-0.84 → bidirectional `related_to` link | Non-blocking: link creation failure doesn't affect embedding |
| REQ-0064 playbook curator | `relationship_hint` (extended) | Inline annotation at session end | `builds_on \| contradicts \| supersedes \| null` (added to existing `updates \| extends \| null`) | Default `null` → no intentional link |
| `lib/memory-embedder.js` | Curator-driven link creation (internal) | Post-dedup step, after search-driven links | Hint from curator → directional + inverse link | Non-blocking: link creation failure doesn't affect embedding |
| `lib/memory-embedder.js` | Session linking (internal) | Post-link step during async embedding | Compare session summaries → session-links.json | Non-blocking: session linking failure doesn't affect embedding |
| `lib/memory-embedder.js` | Team profile recomputation (internal) | Post-all step during async embedding | Aggregate top-N → team-profile.json | Fail-open: stale profile served if recomputation fails |
| Team profile JSON | Analyze handler | File read at startup | Pre-computed static + dynamic profile | Fail-open: missing profile → proceed without bootstrap context |

## 4. Data Flow

### 4.1 Startup: Hybrid Search + Link Traversal + Profile

```
Analyze handler starts
  → searchMemory(query, ..., { codebaseIndexPath, traverseLinks: true, includeProfile: true })
    → Embed query text via engine (one call, ~50-200ms)
    → Promise.allSettled([
        userStore.search(queryVector, maxResultsPerSource),
        projectStore.search(queryVector, maxResultsPerSource),
        codebaseStore.search(queryVector, maxResultsPerSource)
      ])                                                        // Parallel, sub-ms each
    → traverseLinks(primaryResults, userStore, projectStore)
      ├── Collect unique targetChunkIds from all results' links[]
      ├── Batch: userStore.getByIds(userChunkIds)
      ├── Batch: projectStore.getByIds(projectChunkIds)
      └── Attach as linkedMemories[] on each parent result
    → Read team-profile.json (pre-computed, instant)
    → Merge all sources, rank by score, apply limits
    → Return HybridSearchResult { results, codebaseResults, profile, sources }
  → Format as conversation priming context
  → Roundtable proceeds with enriched context
```

### 4.2 Session End: Async Embedding + Link Creation + Profile Recomputation

```
Analyze handler completes inline roundtable
  → Curator annotates relationship_hints (existing updates/extends + new builds_on/contradicts/supersedes)
  → writeSessionRecord(enrichedRecord) — immediate raw JSON write
  → Spawn async: embedSession(record, ..., { createLinks: true, recomputeProfile: true })
    │
    ├── 1. Embed chunks via engine (existing REQ-0064)
    ├── 2. Tiered dedup: Reject/Update/Extend/New (existing REQ-0064)
    ├── 3. Search-driven link creation (NEW):
    │     For each new/extended chunk:
    │       Search same store for similarity 0.70-0.84
    │       Create bidirectional related_to links (max 5 per chunk)
    ├── 4. Curator-driven link creation (NEW):
    │     For chunks with relationship_hint in (builds_on, contradicts, supersedes):
    │       Create directional link to matched chunk from dedup
    │       Create inverse link on target chunk
    ├── 5. Session linking (NEW):
    │     Read last 10 session JSONs
    │     Compare session summary vectors
    │     Store related sessions (similarity > 0.60) in session-links.json
    ├── 6. Team profile recomputation (NEW):
    │     Query both stores: top-N by combined score
    │     Static: appeared_count > 3, accessed_count > 5
    │     Dynamic: last 5 session summaries
    │     Write team-profile.json
    ├── 7. Auto-prune if capacity exceeded (existing REQ-0064)
    └── 8. Update raw JSON: embedded=true, embed_model (existing REQ-0064)
```

## 5. Blast Radius

**Modified files**: 3 (memory-search.js, memory-embedder.js, memory-store-adapter.js)
**New files**: 0 (all capabilities added to existing modules)
**New data files**: 2 (team-profile.json, session-links.json — per store)
**Test files**: 3 (extend existing test files for new capabilities)
**Config changes**: 0

Total affected: ~8 files

## 6. Implementation Order

1. `lib/memory-store-adapter.js` — schema migration (links column), new methods (getByIds, updateLinks, getSessionLinks)
2. `lib/memory-search.js` — extend searchMemory() with codebase index, link traversal, profile loading
3. `lib/memory-embedder.js` — search-driven link creation, curator-driven link creation, session linking, profile recomputation
4. REQ-0064 playbook curator — extend relationship_hint values (builds_on, contradicts, supersedes)
5. Analyze handler — pass codebaseIndexPath, traverseLinks, includeProfile to searchMemory()
6. Backward compatibility + fail-open testing
7. Session linking + lineage tracking

## Pending Sections

(none -- all sections complete)
