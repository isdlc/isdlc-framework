# Module Design: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Module Identification (high), Data Structures (high), Module Responsibilities (high)

---

## 1. Module Identification

### M1: Indexed Backend Adapter (`lib/search/backends/indexed.js`)

**Responsibility**: Translate search requests into MCP tool calls to the code-index-mcp server and normalize responses to the standard RawSearchHit format.

**Single Responsibility**: MCP transport adapter for the indexed search modality.

**Dependencies**: MCP transport layer (provided by Claude Code runtime)

### M2: Detection Extension (`lib/search/detection.js` -- existing module)

**Responsibility**: Detect Python/pip availability and code-index-mcp installation status.

**Change Scope**: Add entries to KNOWN_TOOLS and PACKAGE_MANAGERS; add Python version parsing.

### M3: Installation Extension (`lib/search/install.js` -- existing module)

**Responsibility**: Install code-index-mcp via pip and configure its MCP server entry.

**Change Scope**: Add entry to MCP_CONFIGS.

### M4: Registry Extension (`lib/search/registry.js` -- existing module)

**Responsibility**: Map the 'code-index' backend ID to the 'indexed' modality.

**Change Scope**: Add entries to inferModality() and inferPriority().

## 2. Data Structures

### 2.1 KNOWN_TOOLS Entry (M2)

```javascript
{
  name: 'code-index-mcp',
  binaries: ['code-index-mcp'],
  versionFlag: '--version',
  installMethods: [
    { method: 'pip', command: 'pip install code-index-mcp' },
    { method: 'pip', command: 'pip3 install code-index-mcp' },
  ],
  modality: 'indexed',
  recommendReason: 'Provides indexed full-codebase search with automatic file watching for sub-second queries on large codebases.',
  requiresPython: '3.8',
}
```

### 2.2 MCP_CONFIGS Entry (M3)

```javascript
'code-index': {
  command: 'code-index-mcp',
  args: [],
  env: {},
}
```

### 2.3 Indexed Backend Adapter Interface (M1)

```javascript
{
  id: 'code-index',
  modality: 'indexed',
  priority: 10,
  displayName: 'Code Index (indexed search)',
  requiresMcp: true,

  async search(request: SearchRequest): Promise<RawSearchHit[]>,
  async healthCheck(): Promise<'healthy' | 'degraded' | 'unavailable'>,
}
```

### 2.4 RawSearchHit (existing, from ranker.js)

```javascript
{
  filePath: string,       // Absolute or project-relative file path
  line: number,           // Line number (1-based)
  column?: number,        // Column number (optional)
  matchContent: string,   // The matched text or snippet
  matchType: 'exact' | 'fuzzy' | 'semantic',
  relevanceScore?: number // Backend-provided relevance score (0-1)
}
```

### 2.5 Python Detection Result (M2, internal)

```javascript
{
  available: boolean,       // Python 3.8+ found
  command: string,          // 'python3' or 'python'
  version: string | null,   // e.g., '3.11.4'
  pipCommand: string | null // 'pip3' or 'pip'
}
```

## 3. Module Responsibilities

### M1: Indexed Backend Adapter

| Method | Input | Output | Behavior |
|--------|-------|--------|----------|
| `createIndexedBackend(options?)` | Optional MCP client config | Backend adapter object | Factory function; returns adapter conforming to BackendAdapter interface |
| `adapter.search(request)` | SearchRequest | Promise<RawSearchHit[]> | Calls code-index-mcp `search_code_advanced` tool via MCP; normalizes results; returns empty array on failure |
| `adapter.healthCheck()` | None | Promise<HealthStatus> | Calls code-index-mcp `get_settings_info` tool; returns 'healthy' if responsive within 2s, 'unavailable' otherwise |
| `normalizeIndexedResults(mcpResults, query)` | MCP response, original query | RawSearchHit[] | Maps MCP response fields to RawSearchHit format; assigns matchType based on response metadata |

### M2: Detection Extension

| Change | Description |
|--------|-------------|
| Add to PACKAGE_MANAGERS | `'pip'` added; detection runs `pip3 --version` then `pip --version` |
| Add Python detection | New `detectPython(execFn)` function: runs `python3 --version`, parses version, confirms >= 3.8 |
| Add to KNOWN_TOOLS | code-index-mcp entry with pip install methods and `requiresPython: '3.8'` |
| Modify generateRecommendations() | Skip code-index-mcp recommendation if Python detection failed |

### M3: Installation Extension

| Change | Description |
|--------|-------------|
| Add to MCP_CONFIGS | `'code-index'` entry with command `'code-index-mcp'` |
| pip install handling | Uses detected pip command (pip3 or pip); follows existing installTool() flow |

### M4: Registry Extension

| Change | Description |
|--------|-------------|
| inferModality() | Add `'code-index': 'indexed'` to mapping |
| inferPriority() | Add `'code-index': 10` to mapping |

## 4. Error Handling

### M1: Backend Adapter Errors

| Error Scenario | Handling | User Impact |
|---------------|----------|-------------|
| MCP server not running | search() returns []; healthCheck() returns 'unavailable' | Router falls back to grep-glob |
| MCP server timeout (>30s) | search() returns [] after router timeout | Router falls back to grep-glob |
| MCP response malformed | normalizeIndexedResults() returns []; logs warning | Router uses empty results, may fall back |
| MCP server crashes mid-query | search() catches error, returns [] | Router marks backend degraded, falls back |

### M2: Detection Errors

| Error Scenario | Handling | User Impact |
|---------------|----------|-------------|
| python3 not found | detectPython() returns { available: false } | code-index-mcp not recommended; no message |
| Python found but < 3.8 | detectPython() returns { available: false } | Same as above |
| pip not found | pip excluded from available PMs | code-index-mcp install method marked unavailable |
| code-index-mcp --version fails | Tool marked as not installed | Recommendation generated if pip available |

### M3: Installation Errors

| Error Scenario | Handling | User Impact |
|---------------|----------|-------------|
| pip install fails (permissions) | classifyInstallError() returns 'INSTALL_PERMISSION_DENIED' | Warning logged; setup continues |
| pip install fails (network) | classifyInstallError() returns 'INSTALL_NETWORK_FAILURE' | Warning logged; setup continues |
| pip install succeeds but binary not in PATH | Post-install version check fails | Warning logged; MCP config not written |
