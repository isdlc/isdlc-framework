# Interface Specification: Team Continuity Memory

**Status**: Final
**Confidence**: High
**Last Updated**: 2026-03-15
**Coverage**: Full

---

## 1. Extended `searchMemory()` — lib/memory-search.js

### Signature

```typescript
async function searchMemory(
  queryText: string,
  userDbPath: string,
  projectIndexPath: string,
  engineConfig: ModelConfig,
  options?: SearchMemoryOptions
): Promise<HybridSearchResult>
```

### Input Types

```typescript
interface SearchMemoryOptions {
  // REQ-0064 (preserved):
  maxResults?: number;              // Default: 10
  minScore?: number;                // Default: 0.5
  container?: string;               // FR-017 domain filter
  userSessionsDir?: string;         // For lazy embed check
  projectSessionsDir?: string;      // For lazy embed check
  // REQ-0066 (new):
  codebaseIndexPath?: string;       // Path to codebase .emb index
  maxResultsPerSource?: number;     // Default: 5 per source
  traverseLinks?: boolean;          // Default: true
  traverseMaxHops?: number;         // Default: 1
  includeProfile?: boolean;         // Default: true
  profilePath?: string;             // Path to team-profile.json
}
```

### Output Types

```typescript
interface HybridSearchResult {
  results: MemorySearchResult[];
  codebaseResults: CodebaseSearchResult[];
  profile?: TeamProfile;
  sources: { memory: number; codebase: number; profile: boolean };
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
  static: MemorySearchResult[];
  dynamic: MemorySearchResult[];
  generatedAt: string;
}

interface MemoryLink {
  targetChunkId: string;
  relationType: 'builds_on' | 'contradicts' | 'related_to' | 'supersedes';
  createdAt: string;
  createdBy: 'curator' | 'search';
}
```

### Error Cases

| Condition | Behavior |
|---|---|
| `codebaseIndexPath` provided but file missing | `codebaseResults: []`, no error |
| Model mismatch on codebase index | `codebaseResults: []`, warning logged |
| `profilePath` provided but file missing | `profile: null`, no error |
| `profilePath` file corrupted (invalid JSON) | `profile: null`, no error |
| All three stores fail | `{ results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } }` |

### Example

```javascript
const result = await searchMemory(
  'auth integration approach',
  '~/.isdlc/user-memory/memory.db',
  'docs/.embeddings/roundtable-memory.emb',
  { provider: 'voyage-code-3' },
  {
    codebaseIndexPath: 'docs/.embeddings/codebase.emb',
    maxResultsPerSource: 5,
    traverseLinks: true,
    includeProfile: true,
    profilePath: '.isdlc/team-profile.json'
  }
);
// result.results: memory excerpts with linkedMemories[]
// result.codebaseResults: relevant code chunks
// result.profile: { static: [...], dynamic: [...] }
```

---

## 2. `traverseLinks()` — lib/memory-search.js

### Signature

```typescript
async function traverseLinks(
  results: MemorySearchResult[],
  userStore: MemoryStore,
  projectStore: MemoryStore,
  options?: {
    maxHops?: number;
    maxLinkedPerResult?: number;
  }
): Promise<MemorySearchResult[]>
```

### Behavior

- Returns the same results array with `linkedMemories[]` populated on each result
- Deduplicates: same chunk linked from multiple results → fetched once
- Broken links (chunk not found): skipped silently
- Empty `links[]`: result returned unchanged (no linkedMemories)

---

## 3. `formatHybridMemoryContext()` — lib/memory-search.js

### Signature

```typescript
function formatHybridMemoryContext(result: HybridSearchResult): string
```

### Output Format

```
MEMORY_CONTEXT:

--- team-profile (static) ---
{static entry content, one per line}

--- team-profile (dynamic) ---
{dynamic entry content, one per line}

--- memory (score: {N.NN}, layer: {user|project}) ---
{memory content}
  [{relationType}] {linked memory content}

--- codebase (score: {N.NN}, file: {filePath}) ---
{code chunk content}
```

Returns empty string if all sources empty.

---

## 4. Extended `embedSession()` — lib/memory-embedder.js

### Signature

```typescript
async function embedSession(
  record: EnrichedSessionRecord,
  userStore: MemoryStore,
  projectStore: MemoryStore,
  engineConfig: ModelConfig,
  options?: EmbedSessionOptions
): Promise<EmbedSessionResult>
```

### Input Types

```typescript
interface EmbedSessionOptions {
  // REQ-0064 (preserved):
  capacityLimit?: number;                           // Default: 500
  // REQ-0066 (new):
  createLinks?: boolean;                            // Default: true
  maxLinksPerChunk?: number;                         // Default: 5
  linkSimilarityRange?: [number, number];            // Default: [0.70, 0.84]
  recomputeProfile?: boolean;                        // Default: true
  profilePaths?: { user: string; project: string };
  sessionLinksPaths?: { user: string; project: string };
  sessionLinkThreshold?: number;                     // Default: 0.60
  pastSessionsLimit?: number;                        // Default: 10
}
```

### Output Types

```typescript
interface EmbedSessionResult {
  // REQ-0064 (preserved):
  embedded: boolean;
  vectorsAdded: number;
  updated: number;
  extended: number;
  rejected: number;
  pruned: number;
  error?: string;
  // REQ-0066 (new):
  linksCreated: number;
  sessionLinksCreated: number;
  profileRecomputed: boolean;
}
```

---

## 5. New `MemoryStore` Methods — lib/memory-store-adapter.js

### `getByIds()`

```typescript
async function getByIds(chunkIds: string[]): Promise<MemorySearchResult[]>
```

- Returns results for all found IDs (unfound IDs silently excluded)
- Archived chunks excluded
- Order matches input order (stable)

### `updateLinks()`

```typescript
async function updateLinks(chunkId: string, links: MemoryLink[]): Promise<void>
```

- Appends to existing links array (does not replace)
- If chunk not found: no-op (silent)
- SQLite: JSON array append. .emb: metadata update + rebuild

---

## 6. Extended `ContextNote` — lib/memory.js

```typescript
interface ContextNote {
  topic: string;
  content: string;
  relationship_hint?:
    | 'updates'
    | 'extends'
    | 'builds_on'
    | 'contradicts'
    | 'supersedes'
    | null;
}
```

---

## 7. Data File Schemas

### team-profile.json

```json
{
  "static": [
    {
      "content": "Team prefers explicit error handling over silent defaults.",
      "score": 8.2,
      "layer": "project",
      "sessionId": "sess_20260215",
      "importance": 8,
      "hitRate": 0.75
    }
  ],
  "dynamic": [
    {
      "content": "Last session: REQ-0065 inline roundtable. Eliminated subagent overhead.",
      "score": 7.1,
      "layer": "project",
      "sessionId": "sess_20260315",
      "importance": 6
    }
  ],
  "generatedAt": "2026-03-15T23:30:00Z"
}
```

### session-links.json

```json
[
  {
    "sessionId": "sess_20260315_231000",
    "relatedSessions": [
      {
        "sessionId": "sess_20260301_140000",
        "similarity": 0.72,
        "createdAt": "2026-03-15T23:30:00Z"
      }
    ]
  }
]
```

## Pending Sections

(none -- all sections complete)
