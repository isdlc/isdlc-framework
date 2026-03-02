# Interface Specification: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Core Interfaces (high), Backend Adapter (high), Detection/Install (medium)

---

## 1. Core Search Interface

### `search(request, options?) -> Promise<SearchResult>`

The primary entry point for all agent search operations.

```ts
interface SearchRequest {
  query: string;                    // Search pattern or natural language query
  modality: Modality;               // 'lexical' | 'structural' | 'semantic' | 'indexed' | 'lsp' | 'any'
  scope?: string;                   // Directory to search within (default: project root)
  fileGlob?: string;                // File pattern filter (e.g., '*.js', '**/*.md')
  tokenBudget?: number;             // Max tokens for results (default: 5000)
  maxResults?: number;              // Max result count (default: 50)
  includeAstContext?: boolean;      // Request AST metadata if available (default: false)
}

interface SearchOptions {
  forceBackend?: string;            // Override routing, use specific backend ID
  skipRanking?: boolean;            // Return raw results without ranking (default: false)
  deduplicate?: boolean;            // Remove duplicate matches (default: true)
  timeout?: number;                 // Timeout in ms (default: 30000)
}

interface SearchResult {
  hits: SearchHit[];
  meta: SearchMeta;
}

interface SearchHit {
  filePath: string;                 // Absolute path
  line: number;                     // Line number (0 for file-level)
  column?: number;                  // Column number if available
  matchType: 'exact' | 'structural' | 'semantic' | 'filename';
  relevanceScore: number;           // 0.0 to 1.0
  contextSnippet: string;           // Code context (3-5 lines)
  ast?: AstMetadata;                // Present when includeAstContext=true and backend supports it
}

interface SearchMeta {
  backendUsed: string;              // Backend ID that served the request
  modalityUsed: Modality;           // Actual modality (may differ on fallback)
  degraded: boolean;                // True if fallback occurred
  durationMs: number;               // Execution time
  totalHitsBeforeRanking: number;   // Pre-ranking hit count
  tokenCount: number;               // Estimated token count of returned hits
}

interface AstMetadata {
  nodeType: string;                 // e.g., 'function_declaration', 'class_definition'
  parentScope: string;              // e.g., 'module', 'class Foo', 'function bar'
  symbolName?: string;              // Symbol name if applicable
  language?: string;                // Source language (e.g., 'javascript', 'python')
}

type Modality = 'lexical' | 'structural' | 'semantic' | 'indexed' | 'lsp' | 'any';
type HealthStatus = 'healthy' | 'degraded' | 'unavailable';
```

### Error Contract

```ts
class SearchError extends Error {
  code: 'BACKEND_UNAVAILABLE' | 'TIMEOUT' | 'INVALID_REQUEST' | 'ALL_BACKENDS_FAILED';
  backendId?: string;               // Which backend failed (if applicable)
  fallbackUsed?: boolean;           // Whether fallback was attempted
}
```

The router NEVER throws `BACKEND_UNAVAILABLE` or `ALL_BACKENDS_FAILED` to the caller when Grep/Glob is available. These errors only surface if the built-in lexical backend itself fails (which would indicate a Claude Code runtime issue, not a search configuration problem).

## 2. Backend Adapter Interface

All search backends implement this interface:

```ts
interface BackendAdapter {
  /** Unique identifier */
  id: string;

  /** Primary modality this backend serves */
  modality: Modality;

  /** Priority within modality (higher = preferred) */
  priority: number;

  /**
   * Execute a search query.
   * @throws SearchError on failure
   */
  search(request: SearchRequest): Promise<RawSearchHit[]>;

  /**
   * Check if this backend is operational.
   * Must complete within 2000ms.
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Human-readable name for user-facing messages.
   */
  displayName: string;

  /**
   * Whether this backend requires an MCP server.
   */
  requiresMcp: boolean;
}

interface RawSearchHit {
  filePath: string;
  line: number;
  column?: number;
  matchContent: string;             // Raw match content (before context extraction)
  relevanceScore?: number;          // Backend-provided score (optional, ranker provides fallback)
  ast?: AstMetadata;
}
```

### Backend Registration Contract

```ts
// Backends register themselves with the registry:
registry.registerBackend({
  id: 'ast-grep',
  modality: 'structural',
  priority: 10,
  health: 'healthy',
  adapter: astGrepBackend,
});

// Registry invariant: 'grep-glob' backend is always registered and cannot be removed.
```

## 3. Detection and Installation Interface

### Detection

```ts
interface DetectionResult {
  scaleTier: 'small' | 'medium' | 'large';
  fileCount: number;
  tools: ToolAvailability[];
  recommendations: ToolRecommendation[];
  existingMcpServers: string[];     // Names of already-configured MCP servers
}

interface ToolAvailability {
  name: string;                     // e.g., 'ast-grep', 'probe', 'zoekt'
  installed: boolean;
  version?: string;                 // Detected version if installed
  installMethods: InstallMethod[];  // Available installation methods
}

interface InstallMethod {
  method: 'npm' | 'cargo' | 'brew' | 'binary';
  command: string;                  // e.g., 'npm install -g @ast-grep/cli'
  available: boolean;               // Whether the package manager is available
}

interface ToolRecommendation {
  tool: ToolAvailability;
  reason: string;                   // User-facing explanation
  priority: 'recommended' | 'optional';
  installMethod: InstallMethod;     // Best available install method
}
```

### Installation

```ts
interface InstallResult {
  tool: string;
  success: boolean;
  version?: string;                 // Installed version on success
  error?: string;                   // Error message on failure
  fallbackAvailable: boolean;       // Whether a fallback option exists
}

// MCP server configuration shape (written to .claude/settings.json):
interface McpServerConfig {
  command: string;                  // e.g., 'ast-grep'
  args: string[];                   // e.g., ['lsp']
  env?: Record<string, string>;
}
```

## 4. Search Configuration Interface

```ts
interface SearchConfig {
  enabled: boolean;                 // Master switch for enhanced search
  activeBackends: string[];         // Backend IDs that are active
  preferredModality: Modality;      // Default modality when agent requests 'any'
  cloudAllowed: boolean;            // Whether cloud backends (embeddings API) are permitted
  scaleTier: 'small' | 'medium' | 'large';
  backendConfigs: {
    [backendId: string]: {
      enabled: boolean;
      mcpServerName?: string;       // Name in .claude/settings.json mcpServers
      options?: Record<string, unknown>;
    };
  };
}
```

Configuration is stored at `{projectRoot}/.isdlc/search-config.json` (gitignored, like state.json).

## 5. Notification Interface

```ts
interface SearchNotification {
  type: 'degradation' | 'installation' | 'configuration';
  message: string;                  // User-facing message
  severity: 'info' | 'warning';
  once: boolean;                    // If true, show only once per session
}

// Degradation notification example:
// {
//   type: 'degradation',
//   message: 'Enhanced search unavailable (ast-grep MCP server not responding). Falling back to standard search. Results may be less precise.',
//   severity: 'warning',
//   once: true
// }
```
