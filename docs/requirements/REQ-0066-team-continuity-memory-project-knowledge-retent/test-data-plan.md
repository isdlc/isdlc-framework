# Test Data Plan: Team Continuity Memory (REQ-0066)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0066
**Last Updated**: 2026-03-15

---

## 1. Overview

All test data follows REQ-0064's established patterns: dependency injection of mock stores and embedding functions, deterministic `makeVector(seed)` for cosine similarity testing, and temp directory isolation for file I/O. REQ-0066 extends these patterns with additional fixtures for link structures, profile data, and session comparison.

## 2. Mock Stores (Extended)

Existing mock store factories from REQ-0064 tests are extended with new methods:

```javascript
function createMockUserStore(results = [], model = 'test') {
  const entries = new Map();
  const linkStore = new Map();
  results.forEach(r => entries.set(r.chunkId, r));

  return {
    // ... existing REQ-0064 methods (search, getModel, incrementAccess, close) ...
    
    // NEW: getByIds for link traversal
    async getByIds(chunkIds) {
      return chunkIds
        .filter(id => entries.has(id))
        .map(id => entries.get(id));
    },
    
    // NEW: updateLinks for link creation
    async updateLinks(chunkId, links) {
      const existing = linkStore.get(chunkId) || [];
      linkStore.set(chunkId, [...existing, ...links]);
    },
    
    // Test helper: read links for assertions
    _getLinks(chunkId) {
      return linkStore.get(chunkId) || [];
    },
  };
}
```

## 3. Deterministic Vectors for Similarity Testing

Existing `makeVector(seed)` from REQ-0064 produces normalized Float32Arrays. For link creation tests, we need vector pairs with known cosine similarities:

```javascript
// Pre-computed seed pairs with known similarities:
// Seeds (1, 2): similarity ~0.76 (within link range 0.70-0.84)
// Seeds (1, 3): similarity ~0.82 (within link range)
// Seeds (1, 10): similarity ~0.45 (below range — no link)
// Seeds (1, 1): similarity 1.00 (above range — dedup, not link)
// Seeds (5, 6): similarity ~0.71 (at lower boundary)
// Seeds (3, 4): similarity ~0.83 (at upper boundary)

const LINK_RANGE_FIXTURES = {
  withinRange: [
    { seedA: 1, seedB: 2, expectedSim: 0.76, shouldLink: true },
    { seedA: 1, seedB: 3, expectedSim: 0.82, shouldLink: true },
    { seedA: 5, seedB: 6, expectedSim: 0.71, shouldLink: true },
  ],
  belowRange: [
    { seedA: 1, seedB: 10, expectedSim: 0.45, shouldLink: false },
    { seedA: 2, seedB: 20, expectedSim: 0.32, shouldLink: false },
  ],
  aboveRange: [
    { seedA: 1, seedB: 1, expectedSim: 1.00, shouldLink: false },  // dedup
  ],
};
```

**Note**: Actual similarity values will be computed from `makeVector()` and verified in test setup. The seeds above are illustrative; exact values may vary slightly and tests use epsilon=0.05 tolerance.

## Boundary Values

Boundary values for key thresholds in REQ-0066:

| Parameter | Lower Boundary | Upper Boundary | Just Below | Just Above |
|-----------|---------------|----------------|------------|------------|
| Link similarity range | 0.70 | 0.84 | 0.699 (no link) | 0.841 (no link) |
| Session link threshold | 0.60 | 1.00 | 0.599 (no link) | 0.601 (link created) |
| Max links per chunk | 0 | 5 | 4 (can add) | 5 (cap reached) |
| maxResultsPerSource | 1 | unlimited | 0 (edge) | 1 (minimum useful) |
| pastSessionsLimit | 1 | 10 (default) | 0 (skip) | 1 (minimum) |
| Profile static threshold: appeared_count | 3 (exclusive) | - | 3 (excluded) | 4 (included) |
| Profile static threshold: accessed_count | 5 (exclusive) | - | 5 (excluded) | 6 (included) |

### Boundary Test Fixtures

```javascript
const BOUNDARY_FIXTURES = {
  linkSimilarity: {
    atLowerBound: 0.70,    // included
    justBelowLower: 0.699, // excluded
    atUpperBound: 0.84,    // included
    justAboveUpper: 0.841, // excluded
    midRange: 0.77,        // included
  },
  sessionLinkThreshold: {
    atThreshold: 0.60,     // included
    justBelow: 0.599,      // excluded
    wellAbove: 0.85,       // included
  },
  maxLinksPerChunk: {
    atLimit: 5,            // cannot add more
    belowLimit: 4,         // can add 1 more
    empty: 0,             // can add up to 5
  },
  profileStaticThresholds: {
    appearedCount: {
      atThreshold: 3,      // excluded (> not >=)
      aboveThreshold: 4,   // included
    },
    accessedCount: {
      atThreshold: 5,      // excluded (> not >=)
      aboveThreshold: 6,   // included
    },
  },
};
```

## Invalid Inputs

Negative testing fixtures for graceful degradation:

| Input | Value | Expected Behavior |
|-------|-------|-------------------|
| `codebaseIndexPath` | `null` | Skip codebase search, return memory-only |
| `codebaseIndexPath` | `''` (empty string) | Skip codebase search |
| `codebaseIndexPath` | `/nonexistent/path.emb` | codebaseResults:[], no error |
| `profilePath` | `/nonexistent/profile.json` | profile:null, no error |
| `profilePath` points to invalid JSON | `'{broken'` | profile:null, no error |
| `profilePath` points to empty file | `''` | profile:null, no error |
| `sessionLinksPaths` to unreadable dir | `/root/forbidden/` | sessionLinksCreated:0, embedding continues |
| `linkSimilarityRange` | `[0.90, 0.70]` (inverted) | No links created (no match possible) |
| `linkSimilarityRange` | `[-1, 2]` (out of bounds) | Treated as [0, 1] or no matches |
| `maxLinksPerChunk` | `0` | No links created |
| `maxLinksPerChunk` | `-1` | No links created |
| `maxResultsPerSource` | `0` | No results returned |
| `traverseMaxHops` | `0` | No traversal |
| `traverseMaxHops` | `2` | Capped at 1 (only 1-hop supported) |
| `pastSessionsLimit` | `0` | Skip session linking |
| Store `getByIds` throws | `Error('DB locked')` | Broken links skipped silently |
| Store `updateLinks` throws | `Error('Disk full')` | Link creation skipped, embedding continues |
| `ContextNote.relationship_hint` | `'invalid_type'` | Sanitized to null, no curator link |
| Links array with malformed entries | `[{targetChunkId: null}]` | Malformed links skipped during traversal |

### Invalid Input Test Fixtures

```javascript
const INVALID_INPUT_FIXTURES = {
  missingPaths: {
    codebaseIndex: '/tmp/nonexistent/codebase.emb',
    profile: '/tmp/nonexistent/team-profile.json',
    sessionLinks: '/tmp/nonexistent/session-links.json',
  },
  corruptedFiles: {
    invalidJson: '{broken json content',
    emptyFile: '',
    binaryGarbage: Buffer.from([0xFF, 0xFE, 0x00, 0x01]).toString(),
  },
  invalidOptions: {
    invertedRange: [0.90, 0.70],
    outOfBoundsRange: [-1, 2],
    zeroMaxLinks: 0,
    negativeMaxLinks: -1,
    zeroMaxResults: 0,
    zeroHops: 0,
    excessiveHops: 100,
    zeroPastSessions: 0,
  },
  invalidHints: [
    'invalid_type',
    'BUILDS_ON',    // wrong case
    123,            // wrong type
    {},             // wrong type
  ],
  malformedLinks: [
    { targetChunkId: null, relationType: 'related_to', createdAt: 'x', createdBy: 'search' },
    { targetChunkId: 'valid', relationType: 'invalid_rel', createdAt: 'x', createdBy: 'search' },
    { targetChunkId: 'valid' },  // missing fields
    null,
    'string_not_object',
  ],
};
```

## Maximum-Size Inputs

Stress/capacity testing fixtures:

| Scenario | Size | Purpose |
|----------|------|---------|
| Max vectors per store | 500 (capacity limit) | Verify search performance at max capacity |
| Max links per chunk | 5 | Verify cap enforcement with many potential matches |
| Max results per source | 50 (10x default) | Verify merge performance with large result sets |
| Many linked chunks per result | 5 (max links) | Verify traversal efficiency |
| Session comparison at limit | 10 past sessions | Verify session linking scans correct count |
| Profile with many static entries | 50 entries above threshold | Verify profile picks top 10 |
| Large content in memory chunks | 10KB per chunk content | Verify no truncation or overflow |
| Deep link fan-out | 5 results x 5 links each = 25 unique linked chunks | Verify deduplication and batch fetch |
| Concurrent hybrid searches | 5 parallel calls | Verify no race conditions |

### Maximum-Size Test Fixtures

```javascript
const MAX_SIZE_FIXTURES = {
  maxCapacityStore: {
    vectorCount: 500,
    chunkContentSize: 500,  // chars per chunk
  },
  maxLinksPerChunk: 5,
  maxResultsPerSource: 50,
  maxLinkedChunksPerResult: 5,
  maxPastSessions: 10,
  maxProfileStaticEntries: 50,
  largeContentChunk: 'x'.repeat(10240),  // 10KB
  maxFanOut: {
    results: 5,
    linksPerResult: 5,
    uniqueLinkedChunks: 25,
  },
  concurrentSearches: 5,
};
```

## 4. Profile Test Data

### Valid Profile Fixture

```javascript
const VALID_PROFILE = {
  static: [
    {
      content: 'Team prefers explicit error handling over silent defaults.',
      score: 8.2,
      layer: 'project',
      sessionId: 'sess_20260215',
      importance: 8,
      hitRate: 0.75,
    },
    {
      content: 'Auth token decisions follow org-level policy.',
      score: 7.8,
      layer: 'user',
      sessionId: 'sess_20260201',
      importance: 7,
      hitRate: 0.60,
    },
  ],
  dynamic: [
    {
      content: 'Last session: REQ-0065 inline roundtable. Eliminated subagent overhead.',
      score: 7.1,
      layer: 'project',
      sessionId: 'sess_20260315',
      importance: 6,
    },
  ],
  generatedAt: '2026-03-15T23:30:00Z',
};
```

## 5. Link Structure Test Data

### Link Fixtures

```javascript
const LINK_FIXTURES = {
  buildsOn: {
    targetChunkId: 'chunk_auth_decision',
    relationType: 'builds_on',
    createdAt: '2026-03-15T10:00:00Z',
    createdBy: 'curator',
  },
  contradicts: {
    targetChunkId: 'chunk_middleware_approach',
    relationType: 'contradicts',
    createdAt: '2026-03-15T10:00:00Z',
    createdBy: 'curator',
  },
  supersedes: {
    targetChunkId: 'chunk_old_approach',
    relationType: 'supersedes',
    createdAt: '2026-03-15T10:00:00Z',
    createdBy: 'curator',
  },
  relatedTo: {
    targetChunkId: 'chunk_similar_topic',
    relationType: 'related_to',
    createdAt: '2026-03-15T10:00:00Z',
    createdBy: 'search',
  },
};
```

## 6. Session Linking Test Data

### Session Fixtures

```javascript
const SESSION_FIXTURES = {
  currentSession: {
    session_id: 'sess_20260315_231000',
    summary: 'Discussed auth integration approach for microservices.',
    timestamp: '2026-03-15T23:10:00Z',
  },
  relatedPastSession: {
    session_id: 'sess_20260301_140000',
    summary: 'Reviewed auth middleware patterns for service communication.',
    // Expected similarity to current: > 0.60
  },
  unrelatedPastSession: {
    session_id: 'sess_20260220_090000',
    summary: 'Set up CI/CD pipeline with GitHub Actions.',
    // Expected similarity to current: < 0.60
  },
};

const SESSION_LINKS_FILE = [
  {
    sessionId: 'sess_20260315_231000',
    relatedSessions: [
      {
        sessionId: 'sess_20260301_140000',
        similarity: 0.72,
        createdAt: '2026-03-15T23:30:00Z',
      },
    ],
  },
];
```

## 7. Enriched Session Record Extensions

```javascript
function makeEnrichedRecordWithHints(overrides = {}) {
  return {
    session_id: overrides.session_id || 'sess_test_066',
    slug: 'req-0066-test',
    timestamp: overrides.timestamp || new Date().toISOString(),
    topics: [{ topic_id: 'auth', depth_used: 'standard' }],
    summary: overrides.summary || 'Auth integration approach — builds on REQ-0042 decision.',
    context_notes: overrides.context_notes || [
      {
        topic: 'auth',
        content: 'Direct integration chosen over middleware.',
        relationship_hint: 'builds_on',  // NEW REQ-0066 hint
      },
      {
        topic: 'auth',
        content: 'Middleware approach from REQ-0042 superseded.',
        relationship_hint: 'supersedes',  // NEW REQ-0066 hint
      },
      {
        topic: 'security',
        content: 'Security handled at org policy level.',
        relationship_hint: null,  // No relationship
      },
    ],
    playbook_entry: 'Brief on security, deep on architecture.',
    importance: overrides.importance ?? 7,
    container: 'auth',
    embedded: false,
  };
}
```
