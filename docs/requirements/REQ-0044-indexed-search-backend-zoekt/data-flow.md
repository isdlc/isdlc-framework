# Data Flow: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Setup Flow (high), Runtime Flow (high), Index Lifecycle (high)

---

## 1. Setup Pipeline Data Flow

### Source: User runs `isdlc init`

```
User
  |
  v
lib/installer.js install()
  |
  v
lib/setup-search.js setupSearchCapabilities(projectRoot)
  |
  +-- [1] detectSearchCapabilities(projectRoot)
  |         |
  |         +-- detectPackageManagers(execFn)
  |         |     Input:  system PATH
  |         |     Output: Set<string> { 'npm', 'cargo', 'brew', 'pip' }
  |         |     Method: Runs `{pm} --version` for each; adds to set if success
  |         |
  |         +-- detectPython(execFn)                          [NEW]
  |         |     Input:  system PATH
  |         |     Output: { available: true, command: 'python3', version: '3.11.4', pipCommand: 'pip3' }
  |         |     Method: Runs `python3 --version`; parses semver; confirms >= 3.8
  |         |
  |         +-- detectTool('code-index-mcp', availablePMs)    [NEW KNOWN_TOOLS entry]
  |         |     Input:  tool definition, available package managers
  |         |     Output: ToolAvailability { name, installed, version, installMethods }
  |         |     Method: Runs `code-index-mcp --version`
  |         |
  |         +-- assessProjectScale(projectRoot)
  |         |     Input:  project root directory
  |         |     Output: { scaleTier: 'medium', fileCount: 45000 }
  |         |
  |         +-- generateRecommendations(tools, scaleTier, existingMcpServers)
  |               Input:  tool list, scale tier, existing MCP config
  |               Output: ToolRecommendation[] including code-index-mcp
  |               Filter: Skip code-index-mcp if detectPython().available is false
  |
  +-- [2] For each recommendation:
  |         installTool(recommendation, consentCallback)
  |         |
  |         +-- User consent: "Install code-index-mcp? (pip3 install code-index-mcp)"
  |         +-- execFn('pip3 install code-index-mcp')
  |         +-- Output: InstallResult { tool: 'code-index-mcp', success: true, version: '1.2.3' }
  |
  +-- [3] configureMcpServers([{id: 'code-index'}], settingsPath)
  |         Input:  backend list, path to .claude/settings.json
  |         Output: .claude/settings.json updated with:
  |           {
  |             "mcpServers": {
  |               "code-index": {
  |                 "command": "code-index-mcp",
  |                 "args": [],
  |                 "env": {}
  |               }
  |             }
  |           }
  |
  +-- [4] buildSearchConfig(detection, installResults)
  |         Input:  detection result, install results
  |         Output: SearchConfig {
  |           enabled: true,
  |           activeBackends: ['grep-glob', 'code-index'],
  |           preferredModality: 'lexical',
  |           scaleTier: 'medium',
  |           backendConfigs: { 'code-index': { enabled: true } }
  |         }
  |
  +-- [5] writeSearchConfig(projectRoot, config)
            Input:  project root, config object
            Output: .isdlc/search-config.json written to disk
```

## 2. Runtime Search Data Flow

### Source: Agent requests an indexed search

```
Agent (e.g., quick-scan)
  |
  | search({ query: 'createRouter', modality: 'indexed', tokenBudget: 5000 })
  v
lib/search/router.js createRouter().search()
  |
  +-- [1] validateRequest(request, projectRoot)
  |         Checks: query non-empty, modality valid, scope within root
  |
  +-- [2] routeWithFallback(request, 'indexed', 30000, registry)
  |         |
  |         +-- registry.getBackendsForModality('indexed')
  |         |     Returns: [{ id: 'code-index', modality: 'indexed',
  |         |                  priority: 10, health: 'healthy', adapter: {...} }]
  |         |
  |         +-- backend.adapter.search(request)
  |         |     |
  |         |     +-- MCP call to code-index-mcp server:
  |         |     |     Tool: 'search_code_advanced'
  |         |     |     Args: { query: 'createRouter', file_pattern: '*', max_results: 50 }
  |         |     |
  |         |     +-- MCP response:
  |         |     |     [{ file_path: 'lib/search/router.js', line_number: 63,
  |         |     |        content: 'export function createRouter(options) {',
  |         |     |        score: 0.95 }, ...]
  |         |     |
  |         |     +-- normalizeIndexedResults(mcpResults, 'createRouter')
  |         |           Output: [{ filePath: 'lib/search/router.js', line: 63,
  |         |                      matchContent: 'export function createRouter(options) {',
  |         |                      matchType: 'exact', relevanceScore: 0.95 }, ...]
  |         |
  |         +-- Return: { hits: [...], backendUsed: 'code-index',
  |                        modalityUsed: 'indexed', degraded: false }
  |
  +-- [3] rankAndBound(hits, { tokenBudget: 5000, maxResults: 50 })
  |         Input:  raw hits from backend
  |         Output: ranked, deduplicated, token-bounded SearchHit[]
  |
  +-- [4] Return to agent:
            {
              hits: [{ filePath, line, relevanceScore, contextSnippet, ... }],
              meta: {
                backendUsed: 'code-index',
                modalityUsed: 'indexed',
                degraded: false,
                durationMs: 45,
                totalHitsBeforeRanking: 12,
                tokenCount: 1850
              }
            }
```

## 3. Degradation Data Flow

### Source: Indexed backend is unavailable

```
Agent requests modality: 'indexed'
  |
  v
routeWithFallback(request, 'indexed', 30000, registry)
  |
  +-- registry.getBackendsForModality('indexed')
  |     Returns: [{ id: 'code-index', health: 'healthy', adapter: {...} }]
  |
  +-- backend.adapter.search(request)
  |     MCP call fails (server not running, timeout, error)
  |     Adapter returns [] or throws
  |
  +-- catch: registry.updateHealth('code-index', 'degraded')
  |
  +-- Fallback: grepGlob = registry.getBestBackend('lexical')
  |     Returns: { id: 'grep-glob', health: 'healthy', adapter: {...} }
  |
  +-- grepGlob.adapter.search(request)
  |     Executes standard grep search
  |
  +-- Return: { hits: [...], backendUsed: 'grep-glob',
                 modalityUsed: 'lexical', degraded: true }
  |
  v
router: degraded = true
  +-- onNotification({ type: 'degradation',
                       message: 'Enhanced search unavailable...',
                       severity: 'warning', once: true })
```

## 4. Index Lifecycle Data Flow

### 4.1 Initial Index Build

```
Claude Code session starts
  |
  +-- MCP manager reads .claude/settings.json
  +-- Starts code-index-mcp process
  |
  v
code-index-mcp (external process)
  |
  +-- Reads project root from MCP session context
  +-- Checks for existing index in storage location
  |     (e.g., ~/Library/Application Support/code-index/)
  |
  +-- [First time] Full index build:
  |     - Walk project directory
  |     - Parse files with tree-sitter (46+ languages)
  |     - Build SQLite FTS5 index
  |     - Populate BM25 ranking data
  |     - Duration: depends on codebase size (seconds to minutes)
  |
  +-- [Subsequent] Load cached index:
        - Read existing SQLite database
        - Duration: sub-second
```

### 4.2 Incremental Index Updates

```
User edits file (e.g., saves lib/search/router.js)
  |
  v
OS file system event (FSEvents / inotify / ReadDirectoryChangesW)
  |
  v
code-index-mcp Watchdog file watcher
  |
  +-- Event: MODIFIED lib/search/router.js
  +-- Re-parse changed file with tree-sitter
  +-- Update SQLite FTS5 index entry
  +-- Update BM25 statistics
  |
  v
Next search query returns updated results
```

### 4.3 Index Persistence

```
Claude Code session ends
  |
  v
MCP manager terminates code-index-mcp process
  |
  v
SQLite database remains on disk at storage location
  |
  v
Next session: code-index-mcp loads existing index (sub-second)
```

## 5. Configuration Data Flow

```
.isdlc/search-config.json
  |
  | { "activeBackends": ["grep-glob", "code-index"],
  |   "backendConfigs": { "code-index": { "enabled": true } } }
  |
  v
registry.loadFromConfig(config, adapterMap)
  |
  +-- inferModality('code-index') -> 'indexed'
  +-- inferPriority('code-index') -> 10
  +-- registerBackend({ id: 'code-index', modality: 'indexed',
                        priority: 10, health: 'healthy', adapter: ... })
  |
  v
Registry state:
  grep-glob:    { modality: 'lexical',  priority: 0,  health: 'healthy' }
  code-index:   { modality: 'indexed',  priority: 10, health: 'healthy' }

Router resolves:
  modality 'indexed' -> code-index
  modality 'lexical' -> grep-glob
  modality 'any'     -> code-index (highest priority healthy)
```
