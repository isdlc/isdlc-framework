# Interface Specification: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Interface Contracts (high), Function Signatures (high)

---

## 1. Backend Adapter Interface (M1)

### 1.1 createIndexedBackend(options?)

**Purpose**: Factory function that creates the indexed backend adapter.

```typescript
function createIndexedBackend(options?: {
  mcpClient?: McpClient;       // Injected MCP client (for testing)
  healthTimeout?: number;       // Health check timeout in ms (default: 2000)
}): BackendAdapter

interface BackendAdapter {
  id: string;                   // 'code-index'
  modality: string;             // 'indexed'
  priority: number;             // 10
  displayName: string;          // 'Code Index (indexed search)'
  requiresMcp: boolean;         // true

  search(request: SearchRequest): Promise<RawSearchHit[]>;
  healthCheck(): Promise<'healthy' | 'degraded' | 'unavailable'>;
}
```

**Preconditions**: None (adapter can be created even if MCP server is not running).

**Postconditions**: Returns an adapter object that conforms to BackendAdapter interface. Adapter is safe to call even when MCP server is unavailable.

### 1.2 adapter.search(request)

**Purpose**: Execute an indexed search query via MCP.

```typescript
async function search(request: SearchRequest): Promise<RawSearchHit[]>

// SearchRequest (existing, from router.js)
interface SearchRequest {
  query: string;                // Search pattern
  modality: string;             // 'indexed'
  scope?: string;               // Directory to search within
  fileGlob?: string;            // File pattern filter
  tokenBudget?: number;         // Max tokens (default: 5000)
  maxResults?: number;          // Max results (default: 50)
  includeAstContext?: boolean;  // Request AST metadata
}
```

**Preconditions**:
- `request.query` is a non-empty string
- `request.modality` is `'indexed'`

**Postconditions**:
- Returns `RawSearchHit[]` (possibly empty)
- Never throws -- catches all errors and returns `[]`

**MCP Tool Call**: Maps to `search_code_advanced` tool on code-index-mcp server:
```json
{
  "tool": "search_code_advanced",
  "arguments": {
    "query": "<request.query>",
    "file_pattern": "<request.fileGlob or '*'>",
    "max_results": "<request.maxResults or 50>"
  }
}
```

### 1.3 adapter.healthCheck()

**Purpose**: Verify MCP server is responsive.

```typescript
async function healthCheck(): Promise<'healthy' | 'degraded' | 'unavailable'>
```

**Preconditions**: None.

**Postconditions**:
- Returns `'healthy'` if MCP server responds within timeout
- Returns `'unavailable'` if MCP server does not respond or is not running
- Never throws

**MCP Tool Call**: Maps to `get_settings_info` tool (lightweight, no search execution):
```json
{
  "tool": "get_settings_info",
  "arguments": {}
}
```

### 1.4 normalizeIndexedResults(mcpResults, query)

**Purpose**: Convert MCP server response format to standard RawSearchHit format.

```typescript
function normalizeIndexedResults(
  mcpResults: McpSearchResult[],
  query: string
): RawSearchHit[]

interface McpSearchResult {
  file_path: string;
  line_number?: number;
  content?: string;
  score?: number;
  language?: string;
}

interface RawSearchHit {
  filePath: string;
  line: number;
  column?: number;
  matchContent: string;
  matchType: 'exact' | 'fuzzy' | 'semantic';
  relevanceScore?: number;
}
```

**Preconditions**: `mcpResults` is an array (possibly empty or null).

**Postconditions**: Returns `RawSearchHit[]` with all fields populated. Missing fields use sensible defaults (line: 0, matchContent: '', matchType: 'fuzzy').

**Mapping Rules**:
| MCP Field | RawSearchHit Field | Transformation |
|-----------|--------------------|---------------|
| file_path | filePath | Direct copy |
| line_number | line | Default 0 if missing |
| content | matchContent | Default '' if missing |
| score | relevanceScore | Normalize to 0-1 range if needed |
| (none) | matchType | 'exact' if query is substring of content, else 'fuzzy' |
| (none) | column | undefined (MCP server does not provide column) |

## 2. Detection Extension Interface (M2)

### 2.1 detectPython(execFn)

**Purpose**: Detect Python 3.8+ availability on the system.

```typescript
function detectPython(
  execFn: (cmd: string) => { success: boolean; output: string }
): PythonDetection

interface PythonDetection {
  available: boolean;
  command: string | null;       // 'python3' or 'python'
  version: string | null;       // e.g., '3.11.4'
  pipCommand: string | null;    // 'pip3' or 'pip'
}
```

**Preconditions**: `execFn` is callable.

**Postconditions**: Returns detection result. `available` is true only if Python >= 3.8 is found.

**Detection Order**:
1. Try `python3 --version` -- parse version, confirm >= 3.8
2. If not found, try `python --version` -- parse version, confirm >= 3.8
3. If Python found, try `pip3 --version` then `pip --version`
4. If Python < 3.8 or not found: `{ available: false, command: null, version: null, pipCommand: null }`

### 2.2 KNOWN_TOOLS Entry Extension

```typescript
// New entry appended to KNOWN_TOOLS array
{
  name: 'code-index-mcp',
  binaries: ['code-index-mcp'],
  versionFlag: '--version',
  installMethods: [
    { method: 'pip', command: 'pip3 install code-index-mcp' },
    { method: 'pip', command: 'pip install code-index-mcp' },
  ],
  modality: 'indexed',
  recommendReason: 'Provides indexed full-codebase search with automatic file watching for sub-second queries on large codebases.',
  requiresPython: '3.8',
}
```

### 2.3 generateRecommendations() Extension

**Modified behavior**: Before generating a recommendation for a tool with `requiresPython`, check that `detectPython()` returned `{ available: true }`. If Python is not available, skip the recommendation entirely (no error, no message).

## 3. Installation Extension Interface (M3)

### 3.1 MCP_CONFIGS Entry

```typescript
// New entry in MCP_CONFIGS object
'code-index': {
  command: 'code-index-mcp',
  args: [],
  env: {},
}
```

**Note**: The command is `code-index-mcp` (the binary name after pip install). No workspace argument is needed -- the MCP server discovers the project root from the Claude Code session context.

## 4. Registry Extension Interface (M4)

### 4.1 inferModality() Extension

```typescript
// Added to existing map
const map = {
  'ast-grep': 'structural',
  'probe': 'lexical',
  'zoekt': 'indexed',
  'code-index': 'indexed',     // NEW
};
```

### 4.2 inferPriority() Extension

```typescript
// Added to existing map
const map = {
  'ast-grep': 10,
  'probe': 10,
  'zoekt': 10,
  'code-index': 10,            // NEW
};
```
