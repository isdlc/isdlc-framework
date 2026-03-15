# Data Flow: Team Continuity Memory

**Status**: Final
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Startup: Hybrid Search + Link Traversal + Profile

```
Analyze handler starts inline roundtable
  │
  ▼
searchMemory(queryText, userDbPath, projectIndexPath, engineConfig, {
  codebaseIndexPath: 'docs/.embeddings/codebase.emb',
  traverseLinks: true,
  includeProfile: true,
  profilePath: '.isdlc/team-profile.json'
})
  │
  ├── 1. Embed query text via engine (one call, ~50-200ms)
  │     └── Returns Float32Array queryVector
  │
  ├── 2. Parallel search (Promise.allSettled):
  │     ├── userStore.search(queryVector, maxResultsPerSource)
  │     │     └── SQLite: cosine similarity + self-ranking boost
  │     │         Returns MemorySearchResult[] with layer='user'
  │     ├── projectStore.search(queryVector, maxResultsPerSource)
  │     │     └── .emb: cosine similarity via store-manager
  │     │         Returns MemorySearchResult[] with layer='project'
  │     └── codebaseStore.search(queryVector, maxResultsPerSource)
  │           └── .emb: cosine similarity via store-manager
  │               Returns CodebaseSearchResult[] with layer='codebase'
  │               (fail-open: missing/corrupt → empty array)
  │
  ├── 3. Link traversal (if traverseLinks=true):
  │     ├── Collect all links[] from memory results
  │     ├── Deduplicate targetChunkIds
  │     ├── Batch: userStore.getByIds(userChunkIds)
  │     ├── Batch: projectStore.getByIds(projectChunkIds)
  │     └── Attach as linkedMemories[] on each parent result
  │         (broken links silently skipped)
  │
  ├── 4. Profile loading (if includeProfile=true):
  │     └── Read team-profile.json from profilePath
  │         (fail-open: missing → profile=null)
  │
  ├── 5. Merge and rank:
  │     ├── Apply maxResultsPerSource per source
  │     ├── Apply minScore threshold
  │     └── Sort memory results by score descending
  │
  └── 6. Return HybridSearchResult:
        {
          results: [...memoryResults with linkedMemories],
          codebaseResults: [...codeChunks],
          profile: { static: [...], dynamic: [...] },
          sources: { memory: N, codebase: N, profile: true }
        }
  │
  ▼
formatHybridMemoryContext(hybridResult)
  │
  ├── Format team-profile (static + dynamic sections)
  ├── Format memory results with [relationType] annotations for linked memories
  ├── Format codebase results with file paths
  └── Return MEMORY_CONTEXT block (or empty string if no results)
  │
  ▼
Handler uses formatted context as conversation priming
```

## 2. Session End: Async Embedding + Link Creation + Profile Recomputation

```
Analyze handler completes inline roundtable (confirmationState = COMPLETE)
  │
  ├── Playbook curator pass (existing REQ-0064, extended):
  │     ├── Generate summary, context_notes, playbook_entry, importance
  │     └── Annotate relationship_hint on each context_note:
  │           'updates' | 'extends' | 'builds_on' | 'contradicts' | 'supersedes' | null
  │           (NEW values: builds_on, contradicts, supersedes)
  │
  ├── writeSessionRecord(enrichedRecord) — immediate raw JSON write
  │     ├── User: ~/.isdlc/user-memory/sessions/{session_id}.json
  │     └── Project: .isdlc/roundtable-memory.json (append)
  │
  └── Spawn async: embedSession(record, userStore, projectStore, engineConfig, {
        createLinks: true,
        maxLinksPerChunk: 5,
        linkSimilarityRange: [0.70, 0.84],
        recomputeProfile: true,
        profilePaths: { user: '~/.isdlc/user-memory/team-profile.json',
                        project: '.isdlc/team-profile.json' },
        sessionLinksPaths: { user: '~/.isdlc/user-memory/session-links.json',
                             project: '.isdlc/session-links.json' },
        sessionLinkThreshold: 0.60
      })
        │
        ├── Step 1: Embed chunks (existing REQ-0064)
        │     ├── Extract text: record.summary + context_notes[].content
        │     ├── Chunk via knowledge pipeline (maxTokens: 256)
        │     └── Embed via configured engine → Float32Array per chunk
        │
        ├── Step 2: Tiered dedup (existing REQ-0064)
        │     ├── Compare against existing vectors in each store
        │     ├── >= 0.95: Reject (duplicate)
        │     ├── 0.85-0.94 + updates hint: Update (supersede)
        │     ├── 0.85-0.94 + extends/null hint: Extend (merge)
        │     └── < 0.85: New entry
        │
        ├── Step 3: Search-driven link creation (NEW)
        │     FOR each new/extended chunk:
        │     ├── Search same store: similarity 0.70-0.84
        │     ├── For each match (max 5 links per chunk):
        │     │     ├── newChunk.links.push({ target, 'related_to', 'search' })
        │     │     └── store.updateLinks(match, { target: newChunk, 'related_to', 'search' })
        │     └── Count linksCreated
        │
        ├── Step 4: Curator-driven link creation (NEW)
        │     FOR each chunk with hint in (builds_on, contradicts, supersedes):
        │     ├── Link to matched chunk from Step 2 dedup:
        │     │     ├── newChunk.links.push({ target: matched, hint, 'curator' })
        │     │     └── store.updateLinks(matched, { target: newChunk, inverse(hint), 'curator' })
        │     └── Count linksCreated
        │
        ├── Step 5: Session linking (NEW)
        │     ├── Read last 10 raw session JSONs from sessions directory
        │     ├── For each with summary field:
        │     │     ├── Embed summary (if not already embedded)
        │     │     ├── Cosine similarity with current session summary
        │     │     └── If > 0.60: append to session-links.json
        │     └── Count sessionLinksCreated
        │
        ├── Step 6: Team profile recomputation (NEW)
        │     ├── Query user store: top 10 WHERE appeared_count > 3 AND accessed_count > 5
        │     ├── Query project store: top 5 by timestamp DESC
        │     ├── Build { static, dynamic, generatedAt }
        │     └── Write to profilePaths.user and profilePaths.project
        │
        ├── Step 7: Auto-prune if capacity exceeded (existing REQ-0064)
        │
        └── Step 8: Update raw session JSON: embedded=true, embed_model
              └── Return { embedded, vectorsAdded, ..., linksCreated, sessionLinksCreated, profileRecomputed }
```

## 3. Link Lifecycle

```
Session N ends → curator annotates relationship_hint
  │
  ▼
Async embedder processes chunks
  │
  ├── Tiered dedup identifies matched existing chunk (if any)
  │
  ├── Curator-driven link (if hint = builds_on/contradicts/supersedes):
  │     New chunk ──builds_on──→ Matched chunk
  │     Matched chunk ──builds_on──→ New chunk (inverse)
  │
  ├── Search-driven link (for similarity 0.70-0.84):
  │     New chunk ──related_to──→ Similar chunk
  │     Similar chunk ──related_to──→ New chunk (bidirectional)
  │
  └── Links stored in:
        SQLite: memories.links JSON column
        .emb: per-chunk metadata.links array

Session N+1 starts → searchMemory() with traverseLinks=true
  │
  ├── Primary search returns memory results
  ├── Each result has links[] metadata
  ├── traverseLinks() batch-fetches linked chunks
  └── Consumer sees: result + linkedMemories[] with relationType
        "Team chose direct integration (score: 0.87)"
          [builds_on] "Built on auth token analysis from REQ-0042"
          [supersedes] "Previously chose middleware in REQ-0042"
```

## 4. Fallback Paths

```
Hybrid search fallback (any source fails):
  ├── Codebase index missing → codebaseResults: []
  ├── Model mismatch on codebase → skip, codebaseResults: []
  ├── User store corrupt → skip, memory results from project only
  ├── Project store corrupt → skip, memory results from user only
  ├── All stores fail → REQ-0063 flat JSON fallback:
  │     readUserProfile() + readProjectMemory()
  │     mergeMemory() + formatMemoryContext()
  └── Profile missing → profile: null, proceed without

Link traversal fallback:
  ├── Broken link (chunk pruned) → skip silently
  ├── Store query fails → return results without linkedMemories
  └── traverseLinks=false → no traversal, primary results only

Async embedding fallback (any step fails):
  ├── Link creation fails → embedding continues, linksCreated: 0
  ├── Session linking fails → embedding continues, sessionLinksCreated: 0
  ├── Profile recomputation fails → stale profile served, profileRecomputed: false
  └── All new steps fail → core embedding result unchanged (REQ-0064 behavior)
```

## Pending Sections

(none -- all sections complete)
