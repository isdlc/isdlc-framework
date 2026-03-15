# Interface Specification: Roundtable Memory Vector DB Migration

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Memory Embedder API (`lib/memory-embedder.js`)

### 1.1 embedSession

```typescript
async function embedSession(
  record: EnrichedSessionRecord,
  indexPath: string,
  engineConfig: ModelConfig
): Promise<{
  embedded: boolean;
  vectorsAdded: number;
  error?: string;
}>
```

**Preconditions**: `record` has `summary` field (enriched); `indexPath` is a writable path; `engineConfig` has a valid provider
**Postconditions**: Returns embedding status; never throws; `.emb` file at `indexPath` is created or updated
**Error handling**: Catches all exceptions; returns `{ embedded: false, vectorsAdded: 0, error: message }`

**Behavior**:
1. Extract embeddable text: `[record.summary, ...record.context_notes]`
2. Chunk via `chunkDocument(text, { format: 'text', maxTokens: 256 })`
3. Embed via `embed(chunks, engineConfig)`
4. Load or create `.emb` index at `indexPath`
5. Append vectors with metadata: `{ sessionId, timestamp, layer, chunkIndex }`
6. Rebuild and write `.emb` package
7. Update raw session file: `embedded: true`, `embed_model: config.provider`

### 1.2 rebuildIndex

```typescript
async function rebuildIndex(
  sessionsDir: string,
  indexPath: string,
  engineConfig: ModelConfig
): Promise<{
  vectorCount: number;
  rebuilt: boolean;
  sessionsProcessed: number;
  error?: string;
}>
```

**Preconditions**: `sessionsDir` exists and contains `.json` files; `engineConfig` is valid
**Postconditions**: `.emb` file at `indexPath` is created from scratch; all enriched sessions are re-embedded
**Error handling**: Returns `{ rebuilt: false, error: message }` on failure; never throws

## 2. Memory Search API (`lib/memory-search.js`)

### 2.1 searchMemory

```typescript
async function searchMemory(
  queryText: string,
  userIndexPath: string,
  projectIndexPath: string,
  engineConfig: ModelConfig,
  options?: {
    maxResults?: number;         // Default: 10
    minScore?: number;           // Default: 0.5
    userSessionsDir?: string;
    projectSessionsDir?: string;
  }
): Promise<MemorySearchResult[]>
```

**Preconditions**: `queryText` is non-empty; `engineConfig` has a valid provider
**Postconditions**: Returns ranked search results from both indexes; never throws
**Error handling**: Returns `[]` on any unrecoverable error; individual index failures are isolated
**Invariants**:
- Results are sorted by score descending
- Results with score < `minScore` are excluded
- Results are capped at `maxResults`
- Each result is tagged with its source layer

### 2.2 checkModelConsistency

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

**Preconditions**: `indexPath` points to an existing `.emb` file
**Postconditions**: Returns consistency status with model names
**Error handling**: Returns `{ consistent: false, indexModel: 'unknown', currentModel: config.provider }` if index cannot be read

### 2.3 formatSemanticMemoryContext

```typescript
function formatSemanticMemoryContext(
  results: MemorySearchResult[]
): string
```

**Preconditions**: `results` is a valid array (may be empty)
**Postconditions**: Returns formatted MEMORY_CONTEXT block or empty string
**Format**:
```
MEMORY_CONTEXT:
--- memory-result (score: 0.87, layer: user) ---
User consistently prefers brief on security — handles it at org policy level.

--- memory-result (score: 0.82, layer: project) ---
This project goes deep on architecture due to custom auth integration layer.
```

## 3. Modified Memory API (`lib/memory.js`)

### 3.1 writeSessionRecord (Extended)

```typescript
async function writeSessionRecord(
  record: EnrichedSessionRecord,
  projectRoot: string,
  userMemoryDir?: string
): Promise<{
  userWritten: boolean;
  projectWritten: boolean;
  enriched: boolean;
}>
```

**Changes from REQ-0063**:
- Accepts `EnrichedSessionRecord` (backward-compatible superset of `SessionRecord`)
- Returns `enriched: boolean` indicating presence of NL content
- Write behavior unchanged — immediate, fail-safe per layer

### 3.2 compact (Extended)

```typescript
async function compact(options: {
  user?: boolean;
  project?: boolean;
  projectRoot?: string;
  userMemoryDir?: string;
  vectorPrune?: boolean;
  ageThresholdMonths?: number;  // Default: 6
  dedupeThreshold?: number;     // Default: 0.95
}): Promise<CompactionResult & {
  vectorPruned?: {
    removed: number;
    remaining: number;
    rebuilt: boolean;
  };
}>
```

**Changes from REQ-0063**:
- New optional `vectorPrune`, `ageThresholdMonths`, `dedupeThreshold` parameters
- When `vectorPrune: true`: loads `.emb` indexes, removes old/duplicate vectors, rebuilds
- Existing flat JSON compaction unchanged when `vectorPrune` is absent or false

## 4. Data Type Definitions

### 4.1 EnrichedSessionRecord

```typescript
interface EnrichedSessionRecord extends SessionRecord {
  summary: string;            // NL summary of session's memory-relevant outcomes
  context_notes: string[];    // Per-topic NL notes from conversation
  embedded: boolean;          // false initially, true after successful embedding
  embed_model?: string;       // Embedding model used (e.g., 'openai', 'codebert')
}
```

**Backward compatibility**: All enriched fields are optional at the type level. A plain `SessionRecord` (REQ-0063) remains valid input. Functions detect enrichment by checking for the `summary` field.

### 4.2 MemorySearchResult

```typescript
interface MemorySearchResult {
  content: string;            // Matched text excerpt
  score: number;              // Cosine similarity [0, 1]
  layer: 'user' | 'project';  // Source index
  sessionId: string;          // Source session ID
  timestamp: string;          // Source session timestamp
}
```

### 4.3 ModelConfig (from REQ-0045, unchanged)

```typescript
interface ModelConfig {
  provider: 'codebert' | 'voyage-code-3' | 'openai';
  modelId?: string;
  apiKey?: string;
  endpoint?: string;
  modelPath?: string;
}
```

## 5. MEMORY_CONTEXT Format

### 5.1 Legacy Format (REQ-0063, preserved for fallback)

```
MEMORY_CONTEXT:
--- topic: problem-discovery ---
user_preference: standard (weight: 0.8)
project_history: standard (5 sessions)
conflict: false

--- topic: security ---
user_preference: brief (weight: 0.7)
project_history: deep (5 sessions)
conflict: true
```

### 5.2 Semantic Format (New)

```
MEMORY_CONTEXT:
--- memory-result (score: 0.87, layer: user) ---
User consistently prefers brief on security — handles it at org policy level.
Override count: 2 across 5 sessions.

--- memory-result (score: 0.82, layer: project) ---
This project goes deep on architecture due to custom auth integration layer.
Team typically spends 2-3 exchanges on integration points.

--- memory-result (score: 0.74, layer: project) ---
Error handling was amended once — team wanted explicit retry semantics.
```

### 5.3 Format Detection

The roundtable agent distinguishes formats by the delimiter pattern:
- `--- topic: {id} ---` → legacy structured format
- `--- memory-result (score: N, layer: L) ---` → semantic excerpt format

Both formats are valid. The roundtable agent handles either without error.

## 6. CLI Interface Changes

### 6.1 `isdlc memory compact` (Extended)

```
Usage: isdlc memory compact [options]

Options:
  --user         Compact user memory only
  --project      Compact project memory only
  --vectors      Include vector index pruning (prune old/duplicate vectors)
  --age N        Prune vectors older than N months (default: 6, requires --vectors)
  (default)      Compact both layers, flat JSON only (backward-compatible)

Exit codes:
  0  Success
  1  Error during compaction
```

### 6.2 `isdlc memory status` (New, potential extension)

```
Usage: isdlc memory status

Output:
  User memory:    ~/.isdlc/user-memory/
    Sessions:     12 raw records (3 un-embedded)
    Vector index: user-memory.emb (9 vectors, model: openai)
    Profile:      profile.json (last compacted: 2026-03-10)

  Project memory: docs/.embeddings/
    Sessions:     24 raw records (0 un-embedded)
    Vector index: roundtable-memory.emb (24 vectors, model: openai)
    Summary:      roundtable-memory.json (last compacted: 2026-03-12)
```

## 7. Validation Rules

### 7.1 EnrichedSessionRecord Validation

| Field | Required? | Default if Missing |
|---|---|---|
| `session_id` | Yes | (error — same as REQ-0063) |
| `slug` | Yes | (error — same as REQ-0063) |
| `timestamp` | Yes | (error — same as REQ-0063) |
| `topics` | Yes | (error — same as REQ-0063) |
| `summary` | No | Record treated as non-enriched; no embedding triggered |
| `context_notes` | No | Default `[]` |
| `embedded` | No | Default `false` |
| `embed_model` | No | Set by embedder after successful embedding |

### 7.2 Model Consistency Validation

| Check | Action on Failure |
|---|---|
| Index `.emb` manifest missing model field | Treat as unknown model; skip index in search |
| Index model differs from configured model | Log warning; return empty results for that index |
| Index file missing | Skip silently; search other index |
| Index file corrupted | Skip silently; fall back to flat JSON if both indexes fail |

## Pending Sections

(none -- all sections complete)
