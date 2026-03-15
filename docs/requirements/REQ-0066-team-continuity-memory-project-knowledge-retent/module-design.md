# Module Design: Team Continuity Memory

**Status**: Final
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Module Overview

| Module | Responsibility | Status |
|---|---|---|
| `lib/memory-search.js` | Extend hybrid search: codebase index, link traversal, profile loading | Modify |
| `lib/memory-embedder.js` | Extend async embedding: search-driven links, curator links, session linking, profile recomputation | Modify |
| `lib/memory-store-adapter.js` | Extend MemoryStore: schema migration, batch fetch, link updates | Modify |
| REQ-0064 playbook curator (in analyze handler) | Extend relationship_hint values | Modify |

No new modules. All capabilities extend existing REQ-0064 modules.

## 2. Module: `lib/memory-search.js` (Modified)

### 2.1 Extended Function: `searchMemory()`

```typescript
async function searchMemory(
  queryText: string,
  userDbPath: string,
  projectIndexPath: string,
  engineConfig: ModelConfig,
  options?: {
    // Existing REQ-0064 options (preserved):
    maxResults?: number;
    minScore?: number;
    container?: string;
    userSessionsDir?: string;
    projectSessionsDir?: string;
    // NEW options:
    codebaseIndexPath?: string;       // Path to codebase .emb index
    maxResultsPerSource?: number;     // Default: 5 per source (user, project, codebase)
    traverseLinks?: boolean;          // Enable 1-hop traversal, default: true
    traverseMaxHops?: number;         // Default: 1 (only 1-hop supported)
    includeProfile?: boolean;         // Include team profile in results, default: true
    profilePath?: string;             // Path to materialized team-profile.json
  }
): Promise<HybridSearchResult>
```

### 2.2 New Return Type: `HybridSearchResult`

```typescript
interface HybridSearchResult {
  results: MemorySearchResult[];             // Memory results (user + project), with links
  codebaseResults: CodebaseSearchResult[];   // Codebase results
  profile?: TeamProfile;                     // Pre-computed team profile
  sources: {
    memory: number;    // Count of memory results
    codebase: number;  // Count of codebase results
    profile: boolean;  // Whether profile was loaded
  };
}

interface CodebaseSearchResult {
  content: string;
  filePath: string;
  score: number;
  rawSimilarity: number;
  layer: 'codebase';
  chunkId: string;
}

interface TeamProfile {
  static: MemorySearchResult[];   // High-value persistent entries
  dynamic: MemorySearchResult[];  // Last 5 session summaries
  generatedAt: string;            // ISO timestamp
}
```

### 2.3 Extended `MemorySearchResult`

```typescript
interface MemorySearchResult {
  // ... existing fields from REQ-0064 (all preserved) ...
  content: string;
  score: number;
  rawSimilarity: number;
  layer: 'user' | 'project';
  sessionId: string;
  timestamp: string;
  chunkId: string;
  importance: number;
  pinned: boolean;
  hitRate?: number;
  container?: string;
  // NEW fields:
  links?: MemoryLink[];                    // Links metadata from chunk
  linkedMemories?: MemorySearchResult[];   // Fetched linked chunks (1-hop)
}

interface MemoryLink {
  targetChunkId: string;
  relationType: 'builds_on' | 'contradicts' | 'related_to' | 'supersedes';
  createdAt: string;
  createdBy: 'curator' | 'search';
}
```

### 2.4 Behavior

1. **Embed query** (unchanged): embed `queryText` via engine — one call, ~50-200ms
2. **Parallel search** (extended): `Promise.allSettled()` over user, project, and (if provided) codebase stores
3. **Link traversal** (new): if `traverseLinks: true`:
   - Collect unique `targetChunkId` values from all memory results' `links[]`
   - Batch fetch: `userStore.getByIds(userChunkIds)`, `projectStore.getByIds(projectChunkIds)`
   - Deduplicate (same chunk linked from multiple results → fetched once)
   - Attach as `linkedMemories[]` on each parent result
4. **Profile loading** (new): if `includeProfile: true` and `profilePath` exists, read `team-profile.json`
5. **Merge and rank** (extended): apply `maxResultsPerSource` per source, `minScore` threshold, sort by score

### 2.5 New Function: `traverseLinks()`

```typescript
async function traverseLinks(
  results: MemorySearchResult[],
  userStore: MemoryStore,
  projectStore: MemoryStore,
  options?: {
    maxHops?: number;              // Default: 1
    maxLinkedPerResult?: number;   // Default: 5
  }
): Promise<MemorySearchResult[]>
```

**Behavior**:
1. For each result, read `links[]` from metadata
2. Collect unique `targetChunkId` values (deduplicate across all results)
3. Determine store for each chunk ID (user store IDs vs project store IDs — inferred from chunk ID prefix convention or by querying both stores)
4. Batch-query stores: `store.getByIds(chunkIds)`
5. Attach fetched chunks as `linkedMemories[]` on each parent, capped by `maxLinkedPerResult`
6. Skip broken links (chunk not found) silently

### 2.6 New Function: `formatHybridMemoryContext()`

```typescript
function formatHybridMemoryContext(
  result: HybridSearchResult
): string
```

**Behavior**: Format the full hybrid result as the `MEMORY_CONTEXT` block for conversation priming.

**Output format**:
```
MEMORY_CONTEXT:

--- team-profile (static) ---
This project goes deep on architecture due to custom auth integration layer.
Team prefers explicit error handling over silent defaults.

--- team-profile (dynamic) ---
Last session: REQ-0065 inline roundtable analysis. Eliminated subagent dispatch overhead.

--- memory (score: 0.87, layer: user) ---
User prefers brief on security — handles it at org policy level.
  [builds_on] Auth token decision from REQ-0042 influenced this preference.

--- memory (score: 0.82, layer: project) ---
Team chose direct integration over middleware for auth in REQ-0052.
  [supersedes] Previously chose middleware approach in REQ-0042.

--- codebase (score: 0.79, file: lib/memory-store-adapter.js) ---
MemoryStore interface with SQLite user store and .emb project store.
```

Returns empty string if no results (MEMORY_CONTEXT omitted).

### 2.7 Dependencies

- `lib/embedding/engine/` — `embed()`, `ModelConfig`
- `lib/memory-store-adapter.js` — `createUserStore()`, `createProjectStore()`, `MemoryStore` interface (extended)
- `lib/memory-embedder.js` — `embedSession()` for lazy embed
- `node:fs/promises` — file I/O for profile read

## 3. Module: `lib/memory-embedder.js` (Modified)

### 3.1 Extended `embedSession()` Options

```typescript
async function embedSession(
  record: EnrichedSessionRecord,
  userStore: MemoryStore,
  projectStore: MemoryStore,
  engineConfig: ModelConfig,
  options?: {
    // Existing REQ-0064 options (preserved):
    capacityLimit?: number;
    // NEW options:
    createLinks?: boolean;                       // Default: true
    maxLinksPerChunk?: number;                    // Default: 5
    linkSimilarityRange?: [number, number];       // Default: [0.70, 0.84]
    recomputeProfile?: boolean;                   // Default: true
    profilePaths?: { user: string; project: string };
    sessionLinksPaths?: { user: string; project: string };
    sessionLinkThreshold?: number;               // Default: 0.60
    pastSessionsLimit?: number;                   // Default: 10
  }
): Promise<{
  // Existing REQ-0064 return fields (preserved):
  embedded: boolean;
  vectorsAdded: number;
  updated: number;
  extended: number;
  rejected: number;
  pruned: number;
  error?: string;
  // NEW return fields:
  linksCreated: number;
  sessionLinksCreated: number;
  profileRecomputed: boolean;
}>
```

### 3.2 Extended Behavior (New Steps After Tiered Dedup)

**Step A: Search-driven link creation** (after tiered dedup, before auto-prune):
```
IF createLinks === true:
  FOR each newly added chunk (Tier 4 New or Tier 3 Extend):
    1. Search same store for vectors with similarity in linkSimilarityRange [0.70, 0.84]
    2. FOR each match (up to maxLinksPerChunk - existing link count):
       a. Create link on new chunk:
          newChunk.links.push({
            targetChunkId: match.chunkId,
            relationType: 'related_to',
            createdAt: new Date().toISOString(),
            createdBy: 'search'
          })
       b. Create inverse link on matched chunk:
          store.updateLinks(match.chunkId, [{
            targetChunkId: newChunk.chunkId,
            relationType: 'related_to',
            createdAt: new Date().toISOString(),
            createdBy: 'search'
          }])
    3. Increment linksCreated counter
```

**Step B: Curator-driven link creation** (after search-driven links):
```
FOR each newly added/updated chunk:
  IF chunk has relationship_hint in ('builds_on', 'contradicts', 'supersedes'):
    1. The tiered dedup step already identified the matched existing chunk
    2. Create directional link on new chunk:
       newChunk.links.push({
         targetChunkId: matchedChunk.chunkId,
         relationType: hint,
         createdAt: new Date().toISOString(),
         createdBy: 'curator'
       })
    3. Create inverse link on matched chunk:
       INVERSE_MAP = {
         'builds_on': 'builds_on',       // Symmetric
         'contradicts': 'contradicts',    // Symmetric
         'supersedes': 'supersedes'       // Directional (target was superseded)
       }
       store.updateLinks(matchedChunk.chunkId, [{
         targetChunkId: newChunk.chunkId,
         relationType: INVERSE_MAP[hint],
         createdAt: new Date().toISOString(),
         createdBy: 'curator'
       }])
    4. Increment linksCreated counter
```

**Step C: Session linking** (after link creation):
```
IF sessionLinksPaths provided:
  1. Read last pastSessionsLimit (10) raw session JSON files from sessions directory
  2. For each past session with a summary field:
     a. Embed past session summary (if not already embedded — check session's embed_model)
     b. Compute cosine similarity between current session summary vector and past session vector
     c. IF similarity > sessionLinkThreshold (0.60):
        Store in session-links.json:
        {
          sessionId: record.session_id,
          relatedSessions: [{ sessionId: past.session_id, similarity, createdAt }]
        }
  3. Append to existing session-links.json (create if missing)
  4. Increment sessionLinksCreated counter
```

**Step D: Team profile recomputation** (after all embedding + linking):
```
IF recomputeProfile === true AND profilePaths provided:
  1. Query user store: top 10 by final_score WHERE appeared_count > 3 AND accessed_count > 5
     → static entries (stable high-value team wisdom)
  2. Query project store: top 5 by timestamp DESC
     → dynamic entries (recent session context)
  3. Build profile:
     {
       static: [...staticEntries],
       dynamic: [...dynamicEntries],
       generatedAt: new Date().toISOString()
     }
  4. Write to profilePaths.user and profilePaths.project
  5. Set profileRecomputed = true
```

### 3.3 Error Handling

All new steps (A-D) are individually wrapped in try/catch. A failure in any step does not affect other steps or the core embedding result. Error details are logged but not surfaced to the user.

### 3.4 Dependencies

- `lib/embedding/engine/` — `embed()`, `ModelConfig`
- `lib/embedding/knowledge/pipeline.js` — `chunkDocument()`
- `lib/memory-store-adapter.js` — `MemoryStore` interface (extended)
- `node:fs/promises` — file I/O for session-links.json and team-profile.json

## 4. Module: `lib/memory-store-adapter.js` (Modified)

### 4.1 Extended `MemoryStore` Interface

```typescript
interface MemoryStore {
  // Existing REQ-0064 methods (all preserved):
  search(queryVector: Float32Array, k: number, options?: { minScore?: number; container?: string }): Promise<MemorySearchResult[]>;
  add(chunks: MemoryChunk[]): Promise<{ added: number; updated: number; extended: number; rejected: number }>;
  remove(filter: { olderThan?: Date; archived?: boolean; expiredTtl?: boolean }): Promise<{ removed: number }>;
  incrementAccess(chunkIds: string[]): Promise<void>;
  pin(chunkId: string): Promise<void>;
  archive(chunkId: string): Promise<void>;
  tag(chunkId: string, tags: string[]): Promise<void>;
  getModel(): Promise<string | null>;
  getCount(): Promise<number>;
  prune(targetCount: number): Promise<{ removed: number }>;
  rebuild(chunks: MemoryChunk[], engineConfig: ModelConfig): Promise<{ vectorCount: number }>;
  close(): void;

  // NEW methods:
  getByIds(chunkIds: string[]): Promise<MemorySearchResult[]>;
  updateLinks(chunkId: string, links: MemoryLink[]): Promise<void>;
}
```

### 4.2 SQLite Schema Migration (User Store)

```sql
-- Run on store open if column doesn't exist
ALTER TABLE memories ADD COLUMN links TEXT DEFAULT '[]';
```

Detection: check `PRAGMA table_info(memories)` for `links` column existence before running ALTER.

### 4.3 `getByIds()` Implementation

**SQLite (user store)**:
```sql
SELECT * FROM memories WHERE chunk_id IN (?, ?, ...) AND archived = 0
```

**.emb (project store)**:
Load package, filter chunks by ID from the in-memory metadata index.

### 4.4 `updateLinks()` Implementation

**SQLite (user store)**:
```sql
UPDATE memories SET links = json_insert(links, '$[#]', json(?)) WHERE chunk_id = ?
```

**.emb (project store)**:
Read chunk metadata, append to links array, trigger `.emb` rebuild. (Same rebuild pattern as pin/archive/tag from REQ-0064 ADR-008.)

### 4.5 Extended `MemoryChunk`

```typescript
interface MemoryChunk {
  // Existing REQ-0064 fields (all preserved):
  chunkId: string;
  sessionId: string;
  content: string;
  vector: Float32Array;
  timestamp: string;
  embedModel: string;
  importance: number;
  relationshipHint?: 'updates' | 'extends' | null;
  container?: string;
  mergeHistory?: string[];
  // EXTENDED relationshipHint values:
  // Now also supports: 'builds_on' | 'contradicts' | 'supersedes'
  // NEW field:
  links?: MemoryLink[];
}
```

## 5. Extended Playbook Curator Annotation

### 5.1 Extended `ContextNote`

```typescript
interface ContextNote {
  topic: string;
  content: string;
  relationship_hint?:
    | 'updates'      // Existing REQ-0064
    | 'extends'      // Existing REQ-0064
    | 'builds_on'    // NEW: current session builds on past work
    | 'contradicts'  // NEW: current session reverses a past decision
    | 'supersedes'   // NEW: current session replaces past approach entirely
    | null;
}
```

### 5.2 Curator Annotation Rules

The curator (running as part of REQ-0064's existing LLM pass at session end) applies these rules when annotating `relationship_hint`:

- `builds_on`: current topic extends or deepens a past decision without changing it
- `contradicts`: current topic reverses or conflicts with a past decision
- `supersedes`: current topic completely replaces a past approach (stronger than contradicts)
- `updates`: existing — content is newer version of same information
- `extends`: existing — content adds to existing information
- `null`: no clear relationship to past content (default, safe)

No additional LLM call. The curator already has conversation context and past memory excerpts from the hybrid search at startup.

## 6. Error Taxonomy

| Code | Trigger | Severity | Recovery |
|---|---|---|---|
| MEM-SEARCH-001 | Codebase .emb index missing | Info | Skip codebase results, return memory-only |
| MEM-SEARCH-002 | Model mismatch on codebase index | Warning | Skip codebase index, log mismatch |
| MEM-LINK-001 | Link target chunk not found in store | Info | Skip broken link, continue traversal |
| MEM-LINK-002 | Link creation fails during embedding | Info | Skip link, embedding continues |
| MEM-LINK-003 | Max links per chunk exceeded | Info | Stop creating links for this chunk |
| MEM-PROFILE-001 | Profile recomputation fails | Info | Stale profile served at next startup |
| MEM-PROFILE-002 | Profile JSON missing at startup | Info | Proceed without bootstrap context |
| MEM-SESSION-001 | Session linking fails | Info | Embedding completes normally |
| MEM-SCHEMA-001 | SQLite ALTER TABLE fails | Warning | Fall back to store without links column |

## 7. Module Boundaries

```
┌──────────────────────────────────────────────────────┐
│ Analyze Handler (isdlc.md)                           │
│  ├── Startup: searchMemory(..., {                    │
│  │     codebaseIndexPath,                            │
│  │     traverseLinks: true,                          │
│  │     includeProfile: true })                       │
│  ├── Session end: writeSessionRecord(enriched)       │
│  └── Post-session: spawn embedSession(..., {         │
│        createLinks: true,                            │
│        recomputeProfile: true })                     │
└──────┬──────────────┬───────────────┬────────────────┘
       │              │               │
 ┌─────▼──────┐ ┌────▼────────┐ ┌────▼──────────────┐
 │ memory-    │ │ memory.js   │ │ memory-            │
 │ search.js  │ │ (core)      │ │ embedder.js        │
 │            │ │             │ │                    │
 │ searchMem  │ │ writeRec    │ │ embedSession       │
 │  + codebase│ │ compact     │ │  + link creation   │
 │  + traverse│ │ read*(fb)   │ │  + session linking │
 │  + profile │ │             │ │  + profile recomp  │
 │ formatCtx  │ │             │ │ rebuildIndex       │
 └─────┬──────┘ └─────────────┘ └───┬────────────────┘
       │                            │
 ┌─────▼────────────────────────────▼────────────────┐
 │ memory-store-adapter.js                           │
 │  ├── createUserStore(dbPath)  → SQLite            │
 │  │   └── + links column, getByIds, updateLinks    │
 │  └── createProjectStore(embPath) → .emb           │
 │      └── + links metadata, getByIds, updateLinks  │
 └─────────────────┬─────────────────────────────────┘
                   │
 ┌─────────────────▼─────────────────────────────────┐
 │ lib/embedding/ (REQ-0045 stack)                   │
 │  ├── engine/ (embed, healthCheck)                 │
 │  ├── mcp-server/store-manager (search)            │
 │  ├── knowledge/pipeline (chunk)                   │
 │  └── package/ (reader, builder)                   │
 └───────────────────────────────────────────────────┘
```

## Pending Sections

(none -- all sections complete)
