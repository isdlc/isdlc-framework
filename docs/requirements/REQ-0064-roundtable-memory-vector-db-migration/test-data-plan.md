# Test Data Plan: Roundtable Memory Vector DB Migration (REQ-0064)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0064
**Last Updated**: 2026-03-15

---

## Test Data Generation Strategy

All test data is generated programmatically using factory functions. No external test data files are required. This extends the pattern established in REQ-0063's `memory.test.js` (factory helpers like `makeSessionRecord()`, `makeUserProfile()`, `makeProjectMemory()`).

### Vector Generation

Real embedding models are never invoked during unit tests. A deterministic stub generates Float32Arrays from content hashes:

```javascript
/**
 * Generate a deterministic Float32Array from content string.
 * Used as a mock for embed() in all unit tests.
 * Produces consistent vectors for the same input (reproducible tests).
 */
function makeVector(content, dimensions = 384) {
  const hash = simpleHash(content);
  const arr = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    arr[i] = Math.sin(hash * (i + 1)) * 0.5;
  }
  // Normalize to unit vector for valid cosine similarity
  const norm = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));
  for (let i = 0; i < dimensions; i++) arr[i] /= norm;
  return arr;
}

/**
 * Generate a vector with controlled similarity to a reference vector.
 * Used for testing dedup tiers (Reject >= 0.95, Update/Extend 0.85-0.94, New < 0.85).
 */
function makeVectorWithSimilarity(referenceVector, targetSimilarity, dimensions = 384) {
  // Blend reference with random noise to achieve target cosine similarity
  const noise = makeVector('noise_' + Math.random(), dimensions);
  const alpha = targetSimilarity; // simplified linear blend
  const arr = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    arr[i] = alpha * referenceVector[i] + (1 - alpha) * noise[i];
  }
  // Normalize
  const norm = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));
  for (let i = 0; i < dimensions; i++) arr[i] /= norm;
  return arr;
}
```

---

## Factory Functions

### makeEnrichedSessionRecord(overrides)

Extends the existing `makeSessionRecord()` with enriched fields:

```javascript
function makeEnrichedSessionRecord(overrides = {}) {
  return {
    // Base SessionRecord fields (REQ-0063 compatible)
    session_id: 'sess_20260315_001',
    slug: 'REQ-0064-vector-db-migration',
    timestamp: '2026-03-15T10:00:00Z',
    topics: [
      {
        topic_id: 'architecture',
        depth_used: 'deep',
        acknowledged: true,
        overridden: false,
        assumptions_count: 3,
      },
    ],
    // Enriched fields (REQ-0064)
    summary: 'Team chose direct integration over middleware for auth because the custom token format requires access to the raw request. Brief on security — org handles it at policy level.',
    context_notes: [
      {
        topic: 'architecture',
        content: 'Direct integration selected for auth module due to custom token format requiring raw request access.',
        relationship_hint: null,
      },
      {
        topic: 'security',
        content: 'Brief on security because user handles it at the org policy level.',
        relationship_hint: null,
      },
    ],
    playbook_entry: 'Auth integration uses direct approach — no middleware. Security deferred to org policy. Check token format compatibility early.',
    importance: 7,
    container: 'auth',
    ttl: null,
    embedded: false,
    embed_model: null,
    ...overrides,
  };
}
```

### makeMemoryChunk(overrides)

```javascript
function makeMemoryChunk(overrides = {}) {
  const content = overrides.content || 'Default memory chunk content';
  return {
    chunkId: 'chunk_001',
    sessionId: 'sess_20260315_001',
    content,
    vector: makeVector(content),
    timestamp: '2026-03-15T10:00:00Z',
    embedModel: 'openai',
    importance: 5,
    relationshipHint: null,
    container: null,
    mergeHistory: [],
    ...overrides,
  };
}
```

### makeMemorySearchResult(overrides)

```javascript
function makeMemorySearchResult(overrides = {}) {
  return {
    content: 'User prefers brief on security',
    score: 0.82,
    rawSimilarity: 0.75,
    layer: 'user',
    sessionId: 'sess_20260315_001',
    timestamp: '2026-03-15T10:00:00Z',
    chunkId: 'chunk_001',
    importance: 7,
    pinned: false,
    hitRate: 0.5,
    container: null,
    ...overrides,
  };
}
```

### makeMockMemoryStore(overrides)

Creates a mock MemoryStore for dependency injection in unit tests:

```javascript
function makeMockMemoryStore(overrides = {}) {
  return {
    search: async () => [],
    add: async () => ({ added: 0, updated: 0, extended: 0, rejected: 0 }),
    remove: async () => ({ removed: 0 }),
    incrementAccess: async () => {},
    pin: async () => {},
    archive: async () => {},
    tag: async () => {},
    getModel: async () => 'openai',
    getCount: async () => 0,
    prune: async () => ({ removed: 0 }),
    rebuild: async () => ({ vectorCount: 0 }),
    close: () => {},
    ...overrides,
  };
}
```

---

## Boundary Values

### Cosine Similarity Thresholds (FR-013: 4-Tier Dedup)

| Test Data | Value | Purpose |
|-----------|-------|---------|
| Exact duplicate | similarity = 1.00 | Tier 1 Reject — maximum possible |
| Near-duplicate boundary | similarity = 0.95 | Tier 1 Reject — exact threshold |
| Just below reject | similarity = 0.94 | Tier 2/3 boundary (Update or Extend) |
| Mid-range similar | similarity = 0.90 | Typical Update/Extend scenario |
| Low-end similar | similarity = 0.85 | Tier 2/3 lower boundary |
| Just below update/extend | similarity = 0.84 | Tier 4 New — just below threshold |
| Low similarity | similarity = 0.50 | Clearly novel content |
| Zero similarity | similarity = 0.00 | Completely unrelated |

### Importance Scores (FR-014)

| Test Data | Value | Purpose |
|-----------|-------|---------|
| Minimum | importance = 1 | Lowest priority memory |
| Default | importance = 5 | Middle of range |
| Maximum | importance = 10 | Highest priority memory |
| Below minimum | importance = 0 | Invalid — should default to 1 |
| Above maximum | importance = 11 | Invalid — should cap at 10 |

### Capacity Limits (FR-016)

| Test Data | Value | Purpose |
|-----------|-------|---------|
| At limit | count = 500 | Exactly at default capacity |
| One over limit | count = 501 | Triggers auto-prune |
| At 90% target | count = 450 | Prune target (90% of 500) |
| Custom limit | count = 100 | Test non-default capacity |
| Zero entries | count = 0 | Empty store — no prune needed |
| All pinned | count = 500, all pinned | Prune cannot remove anything |

### Self-Ranking (FR-012)

| Test Data | appeared_count | accessed_count | hit_rate | Purpose |
|-----------|---------------|----------------|----------|---------|
| Never accessed | 5 | 0 | 0.0 | Decay penalty scenario |
| Always accessed | 5 | 5 | 1.0 | Maximum hit_rate |
| High access | 10 | 8 | 0.8 | Frequently useful |
| Low access | 10 | 1 | 0.1 | Rarely useful |
| Single session | 1 | 1 | 1.0 | New but accessed |
| First storage | 1 | 0 | 0.0 | Brand new entry |

### Temporal Values (FR-016)

| Test Data | Value | Purpose |
|-----------|-------|---------|
| TTL in future | `2026-12-31` | Not expired |
| TTL in past | `2026-03-01` | Expired — should be archived |
| TTL today | `2026-03-15` | Edge case — exact expiry date |
| TTL null | `null` | No expiry (default) |
| Timestamp 1 month old | `2026-02-15` | Recent — minimal age decay |
| Timestamp 6 months old | `2025-09-15` | Mid-range age decay |
| Timestamp 12 months old | `2025-03-15` | Maximum age decay (factor 0.1) |

---

## Invalid Inputs

### EnrichedSessionRecord

| Test Data | Invalid Field | Expected Behavior |
|-----------|--------------|-------------------|
| Missing session_id | `session_id: undefined` | writeSessionRecord throws/rejects (same as REQ-0063) |
| Missing slug | `slug: undefined` | writeSessionRecord throws/rejects |
| Missing timestamp | `timestamp: undefined` | writeSessionRecord throws/rejects |
| Missing topics | `topics: undefined` | writeSessionRecord throws/rejects |
| Empty summary | `summary: ''` | Treated as non-enriched (no embedding) |
| context_notes not array | `context_notes: 'string'` | Graceful handling — treat as empty |
| importance out of range | `importance: -1` | Clamped to 1 |
| importance out of range | `importance: 100` | Clamped to 10 |
| importance non-numeric | `importance: 'high'` | Default to 5 |
| container with spaces | `container: 'error handling'` | Normalized or rejected |
| ttl invalid date | `ttl: 'not-a-date'` | Ignored (treated as null) |
| relationship_hint invalid | `relationship_hint: 'replaces'` | Treated as null (defaults to Extend) |

### Store Operations

| Test Data | Invalid Input | Expected Behavior |
|-----------|--------------|-------------------|
| Empty vector | `vector: new Float32Array(0)` | Store rejects — vector must have dimensions |
| NaN in vector | `vector: Float32Array([NaN, ...])` | Store rejects or handles gracefully |
| Infinity in vector | `vector: Float32Array([Infinity, ...])` | Store rejects or handles gracefully |
| Non-existent chunkId | `pin('nonexistent')` | No-op or returns not found |
| Null query vector | `search(null, 10)` | Returns empty array |
| Negative k | `search(vector, -1)` | Returns empty array |
| Zero k | `search(vector, 0)` | Returns empty array |

### Search Operations

| Test Data | Invalid Input | Expected Behavior |
|-----------|--------------|-------------------|
| Empty query text | `searchMemory('', ...)` | Returns empty array |
| Null engine config | `searchMemory(text, path, path, null)` | Returns empty array (fail-open) |
| Invalid model config | `engineConfig: { provider: 'nonexistent' }` | Fail-open — returns empty results |
| Negative maxResults | `{ maxResults: -5 }` | Treated as 0 — returns empty |
| minScore > 1.0 | `{ minScore: 1.5 }` | No results match — returns empty |

---

## Maximum-Size Inputs

| Test Data | Size | Purpose |
|-----------|------|---------|
| Large summary | 10,000 characters | Test chunking pipeline handles long content |
| Many context_notes | 50 entries | Test batch processing efficiency |
| Large content field | 5,000 characters per note | Test per-note chunking |
| Store at capacity | 500 vectors | Test performance at limit |
| Double capacity | 1,000 vectors | Test behavior above configured limit |
| Maximum dimensions | 1536 dimensions (OpenAI) | Test vector storage at max dimensionality |
| Many tags | 100 tags on one entry | Test tag storage capacity |
| Deep merge_history | 50 session IDs | Test merge_history growth |
| Long container name | 256 characters | Test container field limits |
| Concurrent writes | 10 parallel embedSession calls | Test SQLite write serialization |

---

## Mock Engine Configuration

```javascript
const mockEngineConfig = {
  provider: 'openai',
  modelId: 'text-embedding-3-small',
  apiKey: 'test-key-not-real',
};

// Mock embed function for all unit tests
function mockEmbed(texts, config) {
  return texts.map(text => makeVector(text, 384));
}

// Mock chunkDocument for all unit tests
function mockChunkDocument(text, options) {
  // Simple chunking: split by sentences, max 256 tokens per chunk
  const sentences = text.split('. ');
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if (current.length + s.length > 500) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += (current ? '. ' : '') + s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}
```

---

## Test Isolation Strategy

Every test case that touches the filesystem follows this pattern:

```javascript
let tmpDir;

before(() => {
  tmpDir = createTempDir();  // From lib/utils/test-helpers.js
});

after(() => {
  cleanupTempDir(tmpDir);
});
```

- SQLite databases are created in `tmpDir`
- .emb files are created in `tmpDir`
- Session JSON files are written to `tmpDir/sessions/`
- No real user home directory is ever accessed
- No real project directory is ever modified
