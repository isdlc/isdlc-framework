# Data Flow: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Write Path — Session End

> **REQ-0065 impact**: The handler executes the roundtable inline — no agent output, no SESSION_RECORD parsing. The handler constructs the enriched record from its own conversation state.

```
┌─────────────────────────────────────────────────────────┐
│ Analyze Handler (isdlc.md) — Inline Roundtable          │
│                                                         │
│  Conversation completes (confirmationState = COMPLETE)  │
│                                                         │
│  1. Construct EnrichedSessionRecord from in-memory      │
│     conversation state:                                 │
│     - summary: NL summary of memory-relevant outcomes   │
│     - context_notes: per-topic NL notes from exchanges  │
│     - topics: coverage, depths, overrides observed      │
│                                                         │
│  2. writeSessionRecord(record, projectRoot)             │
│     ├── User: ~/.isdlc/user-memory/sessions/{id}.json  │
│     └── Project: .isdlc/roundtable-memory.json         │
│                                                         │
│  3. Spawn async: embedSession()                        │
└─────────┬──────────────────────┬────────────────────────┘
          │ (immediate)          │ (async, non-blocking)
          ▼                      ▼
┌──────────────────┐  ┌──────────────────────────────────┐
│ Raw JSON Files   │  │ memory-embedder.js               │
│                  │  │                                    │
│ sessions/        │  │  1. Extract text: summary +       │
│  sess_xxx.json   │  │     context_notes                 │
│                  │  │  2. Chunk via knowledge pipeline   │
│ roundtable-      │  │  3. Embed via engine               │
│  memory.json     │  │  4. Check supersession (>= 0.92)  │
│                  │  │  5. Add/supersede via store adapter│
└──────────────────┘  │  6. Update record: embedded=true   │
                      └──────────┬──────────┬──────────────┘
                                 │          │
                                 ▼          ▼
                      ┌────────────┐  ┌──────────────────┐
                      │ User Index │  │ Project Index     │
                      │ ~/.isdlc/  │  │ docs/.embeddings/ │
                      │ memory.db  │  │ roundtable-       │
                      │ (SQLite)   │  │ memory.emb        │
                      └────────────┘  └──────────────────┘
```

## 2. Read Path — Session Start

```
┌─────────────────────────────────────────────────────────┐
│ Analyze Handler (isdlc.md)                              │
│                                                         │
│  1. Determine embedding config from project settings    │
│  2. Call searchMemory(draftContent, ...)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ memory-search.js :: searchMemory()                      │
│                                                         │
│  1. Check for un-embedded records                       │
│     └── Lazy embed if found (best-effort)               │
│                                                         │
│  2. Load user .emb index                                │
│     ├── Success: proceed to search                      │
│     └── Fail: skip user index                           │
│                                                         │
│  3. Load project .emb index                             │
│     ├── Success: proceed to search                      │
│     └── Fail: skip project index                        │
│                                                         │
│  4. Check model consistency for each loaded index       │
│     └── Mismatch: warn, skip that index                 │
│                                                         │
│  5. Embed query text (draft + topic context)            │
│                                                         │
│  6. Search user index: cosine similarity, top K         │
│  7. Search project index: cosine similarity, top K      │
│                                                         │
│  8. Merge results with layer tags                       │
│  9. Sort by score, apply limits                         │
│ 10. Format as MEMORY_CONTEXT                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Has results?   │
            ├── Yes ─────────┼──▶ Store as in-memory conversation
            │                │    priming context (handler uses
            │                │    directly — no dispatch prompt)
            └── No ──────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Fallback path  │
            │                │
            │ readUserProfile│──▶ Store as in-memory legacy
            │ readProjectMem │    context (structured preferences)
            │ mergeMemory    │
            │ formatMemCtx   │
            └────────────────┘
```

## 3. Fallback Decision Tree

```
searchMemory() called
  │
  ├── Embedding backend configured?
  │     ├── No ──▶ FALLBACK: flat JSON path (REQ-0063)
  │     └── Yes
  │           │
  │           ├── Any .emb indexes exist?
  │           │     ├── No ──▶ FALLBACK: flat JSON path
  │           │     └── Yes
  │           │           │
  │           │           ├── Model consistent?
  │           │           │     ├── No (both) ──▶ FALLBACK: flat JSON path
  │           │           │     ├── No (one) ──▶ Search other index only
  │           │           │     └── Yes ──▶ SEARCH: both indexes
  │           │           │
  │           │           └── Search returns results?
  │           │                 ├── No ──▶ FALLBACK: flat JSON path
  │           │                 └── Yes ──▶ USE: semantic MEMORY_CONTEXT
  │           │
  │           └── Embed query fails?
  │                 └── Yes ──▶ FALLBACK: flat JSON path
  │
  └── Any error during search?
        └── Yes ──▶ FALLBACK: flat JSON path
```

## 4. Compaction Path

```
isdlc memory compact [--vectors]
  │
  ├── Flat JSON compaction (always runs, REQ-0063 behavior)
  │     │
  │     ├── User layer:
  │     │     ├── Read ~/.isdlc/user-memory/sessions/*.json
  │     │     ├── Aggregate per-topic (weighted depth scores)
  │     │     └── Write ~/.isdlc/user-memory/profile.json
  │     │
  │     └── Project layer:
  │           ├── Read .isdlc/roundtable-memory.json sessions
  │           ├── Aggregate per-topic for project summary
  │           └── Write .isdlc/roundtable-memory.json summary
  │
  └── Vector pruning (only if --vectors flag)
        │
        ├── User index (SQLite):
        │     ├── Open ~/.isdlc/user-memory/memory.db
        │     ├── DELETE WHERE timestamp < N months ago
        │     ├── Deduplicate (cosine > 0.95 via SQL + vector scan)
        │     ├── VACUUM (reclaim space)
        │     └── Report: removed N, remaining M
        │
        └── Project index (.emb):
              ├── Load docs/.embeddings/roundtable-memory.emb
              ├── Prune vectors older than N months
              ├── Deduplicate (cosine > 0.95)
              ├── Rebuild .emb package
              └── Write updated index
```

## 5. Conversational Override Flow

> **REQ-0065 impact**: The handler executes inline — it directly recognizes preference statements and writes to memory. No agent output parsing.

```
User: "Remember that I prefer brief on security"
  │
  ▼
Analyze Handler (inline roundtable conversation)
  ├── Recognizes preference statement in conversation
  ├── Acknowledges: "Got it, I'll remember that for future sessions"
  ├── Adds to in-memory conversation state:
  │     context_notes: ["User explicitly requested brief depth on
  │                      security — handles it at org policy level"]
  └── Includes in enriched session record at session end
        │
        ▼
[Normal write path — Section 1 above]
  ├── Handler constructs EnrichedSessionRecord with preference
  ├── Raw JSON write + async embed
  └── Preference becomes searchable vector
        │
        ▼
[Next session — Section 2 above]
  ├── Draft context embedded as query
  ├── Semantic search finds: "User explicitly requested brief
  │   depth on security..."
  └── Handler uses as conversation priming context
```

## 6. Conversational Query Flow

> **REQ-0065 impact**: The handler has direct access to search results in memory — no agent delegation needed.

```
User: "What do you remember about my preferences?"
  │
  ▼
Analyze Handler (inline roundtable conversation)
  ├── Already has memory search results from session start
  ├── Can call searchMemory() again with broad query if needed
  ├── Presents conversational summary:
  │     "Based on past sessions:
  │      - You tend to go brief on security (org-level policy)
  │      - This project usually goes deep on architecture
  │        (custom auth integration)
  │      - Error handling was discussed in detail once —
  │        the team wanted explicit retry semantics"
  └── No additional file I/O needed (memory already loaded)
```

## 7. Team Sharing Flow

```
Developer A (commits project memory):
  ├── Roundtable session completes
  ├── Async embed writes docs/.embeddings/roundtable-memory.emb
  ├── git add docs/.embeddings/roundtable-memory.emb
  └── git push

Developer B (inherits project memory):
  ├── git pull (receives roundtable-memory.emb)
  ├── Starts roundtable analysis
  ├── searchMemory() loads project index from docs/.embeddings/
  ├── checkModelConsistency() validates model match
  │     ├── Match: search proceeds normally
  │     └── Mismatch: warn, suggest rebuildIndex
  └── MEMORY_CONTEXT includes team's accumulated patterns
```

## Pending Sections

(none -- all sections complete)
