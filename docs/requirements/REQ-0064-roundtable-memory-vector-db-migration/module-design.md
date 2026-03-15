# Module Design: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Module Overview

| Module | Responsibility | Owner |
|---|---|---|
| `lib/memory.js` | Core memory read/write/compact with enriched format support and fallback paths | Existing (major modify) |
| `lib/memory-embedder.js` | Async embedding orchestrator — chunks, embeds, and indexes session records | New |
| `lib/memory-search.js` | Semantic search over dual vector indexes with fallback to flat JSON | New |

## 2. Module: `lib/memory.js` (Modified)

### 2.1 Existing Functions (Preserved)

All 6 existing exported functions are preserved for backward compatibility:

- `readUserProfile(userMemoryDir?)` — unchanged, used by flat JSON fallback path
- `readProjectMemory(projectRoot)` — unchanged, used by flat JSON fallback path
- `mergeMemory(userProfile, projectMemory)` — unchanged, used by flat JSON fallback path
- `formatMemoryContext(memoryContext)` — unchanged, used by flat JSON fallback path
- `compact(options)` — extended with vector compaction (Section 2.4)

### 2.2 Modified Function: `writeSessionRecord`

```typescript
async function writeSessionRecord(
  record: EnrichedSessionRecord,  // Extended type (backward-compatible)
  projectRoot: string,
  userMemoryDir?: string
): Promise<{
  userWritten: boolean;
  projectWritten: boolean;
  enriched: boolean;  // New: whether enriched fields were present
}>
```

**Changes**:
- Accepts `EnrichedSessionRecord` (superset of `SessionRecord` — existing callers still work)
- Returns `enriched: boolean` indicating whether the record had NL content
- Raw JSON write behavior unchanged — immediate, fail-safe per layer

### 2.3 New Data Type: `EnrichedSessionRecord`

```typescript
interface EnrichedSessionRecord extends SessionRecord {
  summary: string;           // NL summary of session memory outcomes
  context_notes: string[];   // Per-topic NL notes from conversation
  embedded: boolean;         // false initially, true after embedding
  embed_model?: string;      // Model used for embedding
}
```

**Backward compatibility**: All new fields are optional. A plain `SessionRecord` (from REQ-0063) is still valid input to `writeSessionRecord()`. When enriched fields are absent, `enriched` returns `false` and no async embedding is triggered.

### 2.4 Extended Function: `compact`

```typescript
async function compact(options: {
  user?: boolean;
  project?: boolean;
  projectRoot?: string;
  userMemoryDir?: string;
  vectorPrune?: boolean;      // New: enable vector pruning
  ageThresholdMonths?: number; // New: prune vectors older than N months (default: 6)
  dedupeThreshold?: number;    // New: cosine similarity threshold for dedup (default: 0.95)
}): Promise<CompactionResult & {
  vectorPruned?: { removed: number; remaining: number; rebuilt: boolean };
}>
```

**Changes**:
- New optional parameters for vector index maintenance
- When `vectorPrune: true`, loads `.emb` indexes, removes old/duplicate vectors, rebuilds
- Existing flat JSON compaction behavior unchanged when `vectorPrune` is not set

## 3. Module: `lib/memory-embedder.js` (New)

### 3.1 Responsibility

Async embedding orchestrator. Accepts an enriched session record, chunks the natural language content, generates embeddings, and appends to the appropriate `.emb` index.

### 3.2 Exported Functions

#### `embedSession`

```typescript
async function embedSession(
  record: EnrichedSessionRecord,
  indexPath: string,           // Path to .emb file (user or project)
  engineConfig: ModelConfig    // From lib/embedding/engine
): Promise<{
  embedded: boolean;
  vectorsAdded: number;
  error?: string;
}>
```

**Behavior**:
1. Extract embeddable text: `record.summary` + each entry in `record.context_notes`
2. Chunk text via knowledge pipeline's `chunkDocument()` (format: 'text', maxTokens: 256)
3. Embed chunks via `embed()` from `lib/embedding/engine/`
4. Load existing `.emb` index at `indexPath` (or create new empty index)
5. Append new vectors and metadata to the index
6. Rebuild `.emb` package and write to `indexPath`
7. Update the raw session JSON file: set `embedded: true`, `embed_model: config.provider`
8. Return status

**Error handling**: Never throws. Catches all errors and returns `{ embedded: false, vectorsAdded: 0, error: message }`.

#### `rebuildIndex`

```typescript
async function rebuildIndex(
  sessionsDir: string,         // Directory containing raw session JSON files
  indexPath: string,           // Path to .emb file to (re)build
  engineConfig: ModelConfig
): Promise<{
  vectorCount: number;
  rebuilt: boolean;
  sessionsProcessed: number;
  error?: string;
}>
```

**Behavior**:
1. Read all `.json` files in `sessionsDir`
2. Filter for enriched records (those with `summary` field)
3. Extract embeddable text from each record
4. Batch embed all chunks
5. Build new `.emb` package from scratch
6. Write to `indexPath`

**Use case**: Model mismatch resolution — re-embed everything with the current model.

### 3.3 Dependencies

- `lib/embedding/engine/` — `embed()`, `ModelConfig`
- `lib/embedding/knowledge/pipeline.js` — `chunkDocument()` (via document-chunker)
- `lib/embedding/package/builder.js` — build `.emb` packages
- `lib/embedding/package/reader.js` — read existing `.emb` packages
- `node:fs/promises` — file I/O

## 4. Module: `lib/memory-search.js` (New)

### 4.1 Responsibility

Semantic search over dual vector indexes (user + project). Embeds a query, searches both indexes independently, merges results with layer tags, and handles fallback to flat JSON.

### 4.2 Exported Functions

#### `searchMemory`

```typescript
async function searchMemory(
  queryText: string,                // Draft content + topic context
  userIndexPath: string,            // ~/.isdlc/user-memory/user-memory.emb
  projectIndexPath: string,         // docs/.embeddings/roundtable-memory.emb
  engineConfig: ModelConfig,
  options?: {
    maxResults?: number;            // Default: 10
    minScore?: number;              // Default: 0.5
    userSessionsDir?: string;      // For lazy embed check
    projectSessionsDir?: string;   // For lazy embed check
  }
): Promise<MemorySearchResult[]>
```

**Behavior**:
1. Check for un-embedded records in sessions directories (if paths provided)
   - If found: attempt lazy embed via `embedSession()` (best-effort)
2. Load user `.emb` index via store-manager (fail-open: skip if missing/corrupt)
3. Load project `.emb` index via store-manager (fail-open: skip if missing/corrupt)
4. Check model consistency for each index via `checkModelConsistency()`
   - Mismatch: log warning, skip that index
5. Embed `queryText` via `embed()` from engine
6. Search user index: `findNearest(queryVector, userVectors, maxResults)`
7. Search project index: `findNearest(queryVector, projectVectors, maxResults)`
8. Merge results, tag with layer ('user' or 'project')
9. Sort by score descending, apply `maxResults` limit and `minScore` threshold
10. Return ranked results

**Error handling**: Never throws. Returns empty array on any unrecoverable error. Individual index failures are isolated — one failing index does not prevent searching the other.

#### `checkModelConsistency`

```typescript
async function checkModelConsistency(
  indexPath: string,
  engineConfig: ModelConfig
): Promise<{
  consistent: boolean;
  indexModel: string;
  currentModel: string;
}>
```

**Behavior**:
1. Read `.emb` package manifest at `indexPath`
2. Compare manifest's model field against `engineConfig.provider`
3. Return consistency status with both model names

#### `formatSemanticMemoryContext`

```typescript
function formatSemanticMemoryContext(
  results: MemorySearchResult[]
): string
```

**Behavior**: Format ranked search results as the new `MEMORY_CONTEXT` block for prompt injection.

**Output format**:
```
MEMORY_CONTEXT:
--- memory-result (score: 0.87, layer: user) ---
User consistently prefers brief on security — handles it at org policy level.

--- memory-result (score: 0.82, layer: project) ---
This project goes deep on architecture due to custom auth integration layer.
```

Returns empty string if no results (MEMORY_CONTEXT omitted from dispatch).

### 4.3 Data Types

```typescript
interface MemorySearchResult {
  content: string;       // The matched text excerpt
  score: number;         // Cosine similarity score [0, 1]
  layer: 'user' | 'project';
  sessionId: string;     // Source session ID
  timestamp: string;     // Source session timestamp
}
```

### 4.4 Dependencies

- `lib/embedding/engine/` — `embed()`, `ModelConfig`
- `lib/embedding/mcp-server/store-manager.js` — `createStoreManager()`, `findNearest()`
- `lib/embedding/package/reader.js` — read `.emb` manifests
- `lib/memory-embedder.js` — `embedSession()` for lazy embed
- `node:fs/promises` — file I/O

## 5. Fallback Path

When vector storage is unavailable (no embedding backend, no `.emb` indexes, corrupted indexes):

```
searchMemory() returns [] (empty)
  → Analyze handler detects empty results
  → Falls back to REQ-0063 path:
    → readUserProfile() + readProjectMemory()
    → mergeMemory() + formatMemoryContext()
    → Injects legacy MEMORY_CONTEXT format
```

The roundtable agent must handle both formats:
- **Legacy**: `--- topic: {id} ---` with structured preference fields
- **New**: `--- memory-result (score: N, layer: L) ---` with NL content

## 6. Module Boundaries

```
┌─────────────────────────────────────────────────┐
│ Analyze Handler (isdlc.md)                      │
│  ├── Session start: searchMemory()              │
│  ├── Session end: writeSessionRecord()          │
│  └── Post-session: spawn embedSession()         │
└─────────┬──────────────┬───────────────┬────────┘
          │              │               │
    ┌─────▼──────┐ ┌────▼────────┐ ┌────▼──────────┐
    │ memory-    │ │ memory.js   │ │ memory-       │
    │ search.js  │ │ (core)      │ │ embedder.js   │
    │            │ │             │ │               │
    │ searchMem  │ │ writeRec    │ │ embedSession  │
    │ checkModel │ │ compact     │ │ rebuildIndex  │
    │ formatCtx  │ │ read*(fb)   │ │               │
    └─────┬──────┘ └─────────────┘ └───┬───────────┘
          │                            │
    ┌─────▼────────────────────────────▼───────────┐
    │ lib/embedding/ (REQ-0045 stack)              │
    │  ├── engine/ (embed, healthCheck)            │
    │  ├── mcp-server/store-manager (search)       │
    │  ├── knowledge/pipeline (chunk)              │
    │  └── package/ (reader, builder)              │
    └──────────────────────────────────────────────┘
```

## Pending Sections

(none -- all sections complete)
