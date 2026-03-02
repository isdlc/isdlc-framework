# Module Design: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Module Boundaries (high), Data Structures (medium), Dependencies (medium)

---

## 1. Module Boundaries

### Module: `lib/search/router.js`

**Responsibility**: Accept search requests from agents, consult the backend registry, route to the best available backend, handle fallback, and return uniformly structured results.

**Single Responsibility**: Request routing and fallback orchestration. Does NOT perform search itself.

**Exports**:
```js
/**
 * Execute a search request against the best available backend.
 * @param {SearchRequest} request - The search request with intent and modality hint
 * @param {SearchOptions} [options] - Optional configuration overrides
 * @returns {Promise<SearchResult>} Uniformly structured search results
 */
async function search(request, options)

/**
 * Check if any enhanced search backends are available.
 * @returns {boolean}
 */
function hasEnhancedSearch()
```

**Dependencies**: `lib/search/registry.js`, `lib/search/ranker.js`

---

### Module: `lib/search/registry.js`

**Responsibility**: Maintain the registry of available search backends with their capabilities, health status, and priority ordering.

**Single Responsibility**: Backend lifecycle management. Does NOT route requests.

**Exports**:
```js
/**
 * Register a search backend.
 * @param {BackendDescriptor} descriptor
 */
function registerBackend(descriptor)

/**
 * Get the best available backend for a given modality.
 * @param {Modality} modality - 'lexical' | 'structural' | 'semantic' | 'indexed' | 'lsp' | 'any'
 * @returns {BackendDescriptor | null}
 */
function getBestBackend(modality)

/**
 * Update health status for a backend.
 * @param {string} backendId
 * @param {HealthStatus} status - 'healthy' | 'degraded' | 'unavailable'
 */
function updateHealth(backendId, status)

/**
 * Get all registered backends with current status.
 * @returns {BackendDescriptor[]}
 */
function listBackends()

/**
 * Populate registry from project search configuration.
 * @param {SearchConfig} config
 */
function loadFromConfig(config)
```

**Dependencies**: None (leaf module)

---

### Module: `lib/search/ranker.js`

**Responsibility**: Rank search results by relevance, deduplicate, and enforce token budget limits.

**Single Responsibility**: Post-processing of raw backend results. Does NOT call backends.

**Exports**:
```js
/**
 * Rank, deduplicate, and trim results to token budget.
 * @param {RawSearchHit[]} hits - Raw results from backend
 * @param {RankingOptions} options - Token budget, dedup settings
 * @returns {SearchHit[]} Ranked, bounded results
 */
function rankAndBound(hits, options)
```

**Dependencies**: None (leaf module)

---

### Module: `lib/search/backends/lexical.js`

**Responsibility**: Adapter wrapping Claude Code's built-in Grep and Glob tools as a search backend.

**Single Responsibility**: Translate search requests into Grep/Glob calls and normalize results.

**Exports**:
```js
/** @type {BackendAdapter} */
const lexicalBackend = {
  id: 'grep-glob',
  modality: 'lexical',
  priority: 0,  // lowest priority within lexical modality
  search: async (request) => { /* ... */ },
  healthCheck: async () => 'healthy',  // always healthy (built-in)
}
```

**Dependencies**: Claude Code Grep/Glob tools (runtime)

---

### Module: `lib/search/backends/structural.js`

**Responsibility**: Adapter for ast-grep MCP server providing AST-aware structural search.

**Exports**:
```js
/** @type {BackendAdapter} */
const structuralBackend = {
  id: 'ast-grep',
  modality: 'structural',
  priority: 10,
  search: async (request) => { /* ... */ },
  healthCheck: async () => { /* check MCP server availability */ },
}
```

**Dependencies**: ast-grep MCP server (external)

---

### Module: `lib/search/backends/enhanced-lexical.js`

**Responsibility**: Adapter for Probe MCP server providing tree-sitter-enhanced ripgrep search.

**Exports**:
```js
/** @type {BackendAdapter} */
const enhancedLexicalBackend = {
  id: 'probe',
  modality: 'lexical',
  priority: 10,  // higher priority than grep-glob within lexical modality
  search: async (request) => { /* ... */ },
  healthCheck: async () => { /* check MCP server availability */ },
}
```

**Dependencies**: Probe MCP server (external)

---

### Module: `lib/search/detection.js`

**Responsibility**: Detect available search tools on the user's system and assess project characteristics.

**Exports**:
```js
/**
 * Detect available search tools and project characteristics.
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<DetectionResult>}
 */
async function detectSearchCapabilities(projectRoot)

/**
 * Determine project scale tier from file count.
 * @param {string} projectRoot
 * @returns {Promise<'small' | 'medium' | 'large'>}
 */
async function assessProjectScale(projectRoot)
```

**Dependencies**: `child_process` (for tool detection)

---

### Module: `lib/search/install.js`

**Responsibility**: Install recommended search tools with user consent. Handle failures gracefully.

**Exports**:
```js
/**
 * Install a search tool if user consents.
 * @param {ToolRecommendation} recommendation
 * @param {ConsentCallback} onConsent - Called to get user confirmation
 * @returns {Promise<InstallResult>}
 */
async function installTool(recommendation, onConsent)

/**
 * Configure MCP servers in .claude/settings.json for installed backends.
 * @param {InstalledBackend[]} backends
 * @param {string} settingsPath
 * @returns {Promise<void>}
 */
async function configureMcpServers(backends, settingsPath)
```

**Dependencies**: `child_process` (for installation commands), `fs` (for settings.json)

---

### Module: `lib/search/config.js`

**Responsibility**: Read and write search configuration. Persist user decisions.

**Exports**:
```js
/**
 * Read search configuration for a project.
 * @param {string} projectRoot
 * @returns {SearchConfig}
 */
function readSearchConfig(projectRoot)

/**
 * Write search configuration.
 * @param {string} projectRoot
 * @param {SearchConfig} config
 */
function writeSearchConfig(projectRoot, config)
```

**Dependencies**: `fs`

## 2. Data Structures

### SearchRequest

```js
/**
 * @typedef {Object} SearchRequest
 * @property {string} query - Search pattern or natural language query
 * @property {Modality} modality - 'lexical' | 'structural' | 'semantic' | 'indexed' | 'lsp' | 'any'
 * @property {string} [scope] - Directory to search within (defaults to project root)
 * @property {string} [fileGlob] - File pattern filter (e.g., '*.js')
 * @property {number} [tokenBudget] - Maximum tokens for results (default: 5000)
 * @property {number} [maxResults] - Maximum number of results (default: 50)
 * @property {boolean} [includeAstContext] - Request AST metadata if available
 */
```

### SearchResult

```js
/**
 * @typedef {Object} SearchResult
 * @property {SearchHit[]} hits - Ranked search results
 * @property {SearchMeta} meta - Metadata about the search execution
 */

/**
 * @typedef {Object} SearchHit
 * @property {string} filePath - Absolute path to the matched file
 * @property {number} line - Line number of match (0 if file-level match)
 * @property {string} matchType - 'exact' | 'structural' | 'semantic' | 'filename'
 * @property {number} relevanceScore - 0.0 to 1.0
 * @property {string} contextSnippet - Code context around the match
 * @property {AstMetadata} [ast] - AST context if available
 */

/**
 * @typedef {Object} SearchMeta
 * @property {string} backendUsed - ID of the backend that served the request
 * @property {Modality} modalityUsed - Actual modality used (may differ from requested if fallback occurred)
 * @property {boolean} degraded - True if fallback occurred
 * @property {number} durationMs - Search execution time
 * @property {number} totalHitsBeforeRanking - Hits before ranking/dedup
 * @property {number} tokenCount - Estimated token count of returned results
 */

/**
 * @typedef {Object} AstMetadata
 * @property {string} nodeType - AST node type (e.g., 'function_declaration', 'class_definition')
 * @property {string} parentScope - Enclosing scope (e.g., 'module', 'class Foo')
 * @property {string} [symbolName] - Symbol name if applicable
 */
```

### BackendDescriptor

```js
/**
 * @typedef {Object} BackendDescriptor
 * @property {string} id - Unique identifier (e.g., 'ast-grep', 'probe', 'grep-glob')
 * @property {Modality} modality - Primary modality this backend serves
 * @property {number} priority - Priority within modality (higher = preferred)
 * @property {HealthStatus} health - 'healthy' | 'degraded' | 'unavailable'
 * @property {BackendAdapter} adapter - The backend implementation
 */
```

### DetectionResult

```js
/**
 * @typedef {Object} DetectionResult
 * @property {'small' | 'medium' | 'large'} scaleTier - Project size classification
 * @property {number} fileCount - Total file count
 * @property {ToolAvailability[]} tools - Detected tools with versions
 * @property {ToolRecommendation[]} recommendations - Recommended installations
 * @property {McpConfig[]} existingMcpServers - Already configured MCP servers
 */
```

### SearchConfig

```js
/**
 * @typedef {Object} SearchConfig
 * @property {boolean} enabled - Whether enhanced search is enabled
 * @property {string[]} activeBackends - IDs of active backends
 * @property {string} preferredModality - User's preferred default modality
 * @property {boolean} cloudAllowed - Whether cloud backends are permitted
 * @property {Object} backendConfigs - Per-backend configuration
 */
```

## 3. Dependency Graph

```
lib/search/router.js
  +-- lib/search/registry.js (leaf)
  +-- lib/search/ranker.js (leaf)

lib/search/backends/lexical.js (leaf -- runtime dep on Grep/Glob)
lib/search/backends/structural.js (leaf -- runtime dep on ast-grep MCP)
lib/search/backends/enhanced-lexical.js (leaf -- runtime dep on Probe MCP)

lib/search/detection.js (leaf -- runtime dep on child_process)
lib/search/install.js
  +-- lib/search/config.js (leaf)

lib/search/config.js (leaf)
```

No circular dependencies. All backend adapters are leaf modules. The router depends only on the registry and ranker.
