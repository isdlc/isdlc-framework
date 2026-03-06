# Module Design: REQ-0045 Semantic Search Backend

**Status**: Complete
**Date**: 2026-03-06
**Designer**: Jordan Park (System Designer persona)

---

## Module Overview

| ID | Module | Responsibility | Location | Dependencies |
|---|---|---|---|---|
| M1 | Chunking Engine | Parse source files into semantic chunks via Tree-sitter | `lib/embedding/chunker/` | tree-sitter, language grammars |
| M2 | Embedding Engine | Generate vector embeddings from chunks via pluggable models | `lib/embedding/engine/` | M1, onnxruntime (CodeBERT) |
| M3 | VCS Adapter | Detect VCS type, enumerate changed files for incremental refresh | `lib/embedding/vcs/` | git CLI, svn CLI |
| M4 | Content Redaction | Strip source to configured security tier before embedding | `lib/embedding/redaction/` | M1 (Chunk type) |
| M5 | Package Builder | Bundle FAISS index + SQLite metadata into .emb package | `lib/embedding/package/` | faiss-node, better-sqlite3, tar |
| M6 | Module Registry | Track module metadata, dependencies, version compatibility | `lib/embedding/registry/` | None (JSON file I/O) |
| M7 | MCP Server | Load packages, serve semantic search via MCP/SSE | `lib/embedding/mcp-server/` | M5 (reader), M6, faiss-node |
| M8 | Distribution Adapters | Publish/fetch packages from artifact repositories | `lib/embedding/distribution/` | M5 (package format) |
| M9 | Aggregation Pipeline | Collect per-module packages into release bundles | `lib/embedding/aggregation/` | M5, M6, M8 |
| M10 | iSDLC Search Backend | Bridge iSDLC search router to MCP server | `lib/search/backends/semantic.js` | M7 (SSE client) |

---

## M1: Chunking Engine

### Responsibility
Parse source files into semantically meaningful chunks using Tree-sitter AST parsing. Each chunk represents a function, class, method, or logical block.

### Public Interface

```javascript
/**
 * @param {string} filePath - Absolute path to source file
 * @param {string} language - Tree-sitter grammar name (e.g., 'java', 'typescript', 'xml')
 * @param {ChunkOptions} [options]
 * @returns {Chunk[]}
 */
export function chunkFile(filePath, language, options) {}

/**
 * @param {string} content - Raw source content
 * @param {string} language - Tree-sitter grammar name
 * @param {ChunkOptions} [options]
 * @returns {Chunk[]}
 */
export function chunkContent(content, language, options) {}

/**
 * @param {string} filePath - File path to detect language for
 * @returns {string|null} - Tree-sitter grammar name or null if unsupported
 */
export function detectLanguage(filePath) {}
```

### Data Structures

```javascript
/** @typedef {Object} Chunk
 * @property {string} id - Deterministic hash of filePath + startLine + endLine
 * @property {string} content - Chunk text content
 * @property {string} filePath - Relative path from module root
 * @property {number} startLine - 1-based start line
 * @property {number} endLine - 1-based end line
 * @property {'function'|'class'|'method'|'interface'|'block'|'module'} type - Semantic type
 * @property {string} language - Source language
 * @property {number} tokenCount - Estimated token count
 * @property {string|null} parentName - Enclosing class/module name
 * @property {string|null} name - Function/class/method name
 * @property {string[]} signatures - Public method signatures (for interface tier)
 */

/** @typedef {Object} ChunkOptions
 * @property {number} [maxTokens=512] - Target max tokens per chunk
 * @property {number} [overlapTokens=64] - Overlap between adjacent chunks
 * @property {boolean} [preserveSignatures=true] - Extract method signatures
 */
```

### Estimated Size
- `index.js` — Main API, orchestration (~100 lines)
- `treesitter-adapter.js` — Tree-sitter parsing and chunk extraction (~250 lines)
- `language-map.js` — File extension to grammar mapping (~50 lines)
- `fallback-chunker.js` — Line-based chunking for unsupported languages (~80 lines)

---

## M2: Embedding Engine

### Responsibility
Generate vector embeddings from text chunks using a pluggable model interface. Supports batch processing with progress reporting.

### Public Interface

```javascript
/**
 * @param {string[]} texts - Array of text chunks to embed
 * @param {ModelConfig} config - Model configuration
 * @param {EmbedOptions} [options]
 * @returns {Promise<EmbeddingResult>}
 */
export async function embed(texts, config, options) {}

/**
 * @param {ModelConfig} config - Model to validate
 * @returns {Promise<{healthy: boolean, dimensions: number, error?: string}>}
 */
export async function healthCheck(config) {}
```

### Data Structures

```javascript
/** @typedef {Object} ModelConfig
 * @property {'codebert'|'voyage-code-3'|'openai'} provider
 * @property {string} [modelId] - Specific model ID (default per provider)
 * @property {string} [apiKey] - Required for cloud providers
 * @property {string} [endpoint] - Custom endpoint URL
 */

/** @typedef {Object} EmbeddingResult
 * @property {Float32Array[]} vectors - Array of embedding vectors
 * @property {number} dimensions - Vector dimensionality
 * @property {string} model - Model ID used
 * @property {number} totalTokens - Total tokens processed
 */

/** @typedef {Object} EmbedOptions
 * @property {number} [batchSize=32] - Chunks per batch
 * @property {function} [onProgress] - Callback: (processed, total) => void
 * @property {AbortSignal} [signal] - Cancellation signal
 */
```

### Estimated Size
- `index.js` — Main API, batching logic (~120 lines)
- `codebert-adapter.js` — ONNX runtime inference (~150 lines)
- `voyage-adapter.js` — Voyage API client (~100 lines)
- `openai-adapter.js` — OpenAI API client (~100 lines)

---

## M3: VCS Adapter

### Responsibility
Detect VCS type in a working copy and enumerate changed files for incremental embedding refresh.

### Public Interface

```javascript
/**
 * @param {string} workingCopyPath - Root of working copy
 * @returns {VcsAdapter}
 * @throws {Error} If no supported VCS detected
 */
export function createAdapter(workingCopyPath) {}

/** @typedef {Object} VcsAdapter
 * @property {'git'|'svn'} type
 * @property {function} getChangedFiles - (since?: string) => Promise<FileChange[]>
 * @property {function} getCurrentRevision - () => Promise<string>
 * @property {function} getFileList - () => Promise<string[]>
 */

/** @typedef {Object} FileChange
 * @property {string} path - Relative file path
 * @property {'added'|'modified'|'deleted'|'renamed'} status
 * @property {string} [oldPath] - Previous path for renames
 */
```

### Estimated Size
- `index.js` — Factory, auto-detection (~60 lines)
- `git-adapter.js` — Git CLI wrapper (~120 lines)
- `svn-adapter.js` — SVN CLI wrapper (~120 lines)

---

## M4: Content Redaction Pipeline

### Responsibility
Filter chunk content to the configured security tier. Interface tier keeps only signatures; Guided tier adds summaries; Full tier passes through unchanged.

### Public Interface

```javascript
/**
 * @param {import('./chunker').Chunk[]} chunks
 * @param {'interface'|'guided'|'full'} tier
 * @param {RedactionOptions} [options]
 * @returns {Promise<import('./chunker').Chunk[]>}
 */
export async function redact(chunks, tier, options) {}

/** @typedef {Object} RedactionOptions
 * @property {import('./engine').ModelConfig} [summaryModel] - Model for generating guided-tier summaries
 * @property {number} [maxSummaryTokens=128] - Max tokens per summary
 */
```

### Tier Behavior

| Tier | Content Retained | Content Removed |
|---|---|---|
| `interface` | Class names, method signatures, parameter types, return types, public constants | Method bodies, private members, comments, implementation logic |
| `guided` | Everything in interface + AI-generated behavioral summaries | Raw method bodies (replaced by summaries) |
| `full` | Complete source code | Nothing removed |

### Estimated Size
- `index.js` — Tier router (~40 lines)
- `interface-tier.js` — Signature extraction from chunks (~150 lines)
- `guided-tier.js` — Summary generation using embedding model (~120 lines)

---

## M5: Package Builder

### Responsibility
Bundle FAISS vector index and SQLite metadata into a portable `.emb` package file. Also provides a reader for loading packages.

### Public Interface

```javascript
/**
 * Build a .emb package from embeddings and metadata.
 * @param {BuildOptions} options
 * @returns {Promise<string>} Path to created .emb file
 */
export async function buildPackage(options) {}

/**
 * Read a .emb package and return loaded index + metadata.
 * @param {string} packagePath - Path to .emb file
 * @param {ReadOptions} [options]
 * @returns {Promise<LoadedPackage>}
 */
export async function readPackage(packagePath, options) {}

/** @typedef {Object} BuildOptions
 * @property {import('./engine').EmbeddingResult} embeddings
 * @property {import('./chunker').Chunk[]} chunks
 * @property {ModuleMeta} meta - Module metadata for manifest
 * @property {string} outputDir - Where to write the .emb file
 * @property {string} [tier='full'] - Content security tier
 * @property {EncryptionConfig} [encryption] - Encryption settings
 */

/** @typedef {Object} LoadedPackage
 * @property {Object} index - FAISS index handle
 * @property {Object} db - SQLite database handle
 * @property {Object} manifest - Parsed manifest.json
 */
```

### Estimated Size
- `builder.js` — FAISS index creation, SQLite population, tar packaging (~200 lines)
- `reader.js` — Package extraction, index loading, metadata queries (~150 lines)
- `encryption.js` — AES-256-GCM encrypt/decrypt wrapper (~100 lines)
- `manifest.js` — Manifest schema, validation, checksums (~80 lines)

---

## M6: Module Registry

### Responsibility
Central registry of module metadata, domain classification, dependencies, and version compatibility rules.

### Public Interface

```javascript
/**
 * @param {string} registryPath - Path to registry.json
 * @returns {ModuleRegistry}
 */
export function loadRegistry(registryPath) {}

/** @typedef {Object} ModuleRegistry
 * @property {function} getModule - (id: string) => ModuleEntry | null
 * @property {function} listModules - () => ModuleEntry[]
 * @property {function} getCompatibleVersions - (moduleId: string, version: string) => string[]
 * @property {function} getRoutingHints - (query: string) => string[] (module IDs)
 * @property {function} registerModule - (entry: ModuleEntry) => void
 * @property {function} save - () => void
 */

/** @typedef {Object} ModuleEntry
 * @property {string} id - Unique module identifier
 * @property {string} name - Human-readable name
 * @property {string} domain - Hierarchical domain (e.g., 'commerce.order-management')
 * @property {string} description - What this module does
 * @property {string[]} dependencies - IDs of dependent modules
 * @property {string} version - Current version
 * @property {Object} compatibility - Version compatibility rules
 * @property {string[]} keywords - Search routing hints
 */
```

### Estimated Size
- `index.js` — Registry API, JSON I/O (~150 lines)
- `compatibility.js` — Version matching, matrix validation (~120 lines)

---

## M7: MCP Server

### Responsibility
Docker-containerized MCP server that loads embedding packages, orchestrates multi-store queries, and serves results via SSE transport.

### Sub-Components

#### Store Manager
Loads and manages `.emb` packages in memory.

```javascript
/** @typedef {Object} StoreManager
 * @property {function} loadPackage - (path: string) => Promise<StoreHandle>
 * @property {function} unloadPackage - (moduleId: string) => void
 * @property {function} reloadPackage - (moduleId: string, newPath: string) => Promise<void>
 * @property {function} listStores - () => StoreInfo[]
 * @property {function} search - (storeId: string, vector: Float32Array, k: number) => SearchResult[]
 */
```

#### Query Orchestrator
Classifies queries, fans out to relevant stores, merges results.

```javascript
/**
 * @param {string} query - Natural language query
 * @param {OrchestratorOptions} options
 * @returns {Promise<OrchestratorResult>}
 */
export async function orchestrate(query, options) {}

/** @typedef {Object} OrchestratorOptions
 * @property {number} [maxResults=20]
 * @property {number} [timeoutMs=5000]
 * @property {string[]} [moduleFilter] - Limit to specific modules
 * @property {number} [tokenBudget=5000]
 */

/** @typedef {Object} OrchestratorResult
 * @property {SearchHit[]} hits - Merged, re-ranked results
 * @property {string[]} modulesSearched
 * @property {string[]} modulesTimedOut
 * @property {number} totalLatencyMs
 */
```

### MCP Tools Exposed

| Tool Name | Parameters | Returns |
|---|---|---|
| `semantic_search` | `query: string, options?: {modules?, maxResults?, tokenBudget?}` | `{hits: SearchHit[], meta: QueryMeta}` |
| `list_modules` | none | `{modules: ModuleInfo[]}` |
| `module_info` | `moduleId: string` | `{module: ModuleDetail}` |

### Estimated Size
- `server.js` — MCP server setup, SSE transport, tool registration (~200 lines)
- `orchestrator.js` — Query classification, fan-out, merge, re-rank (~250 lines)
- `store-manager.js` — Package loading, FAISS search, memory management (~200 lines)
- `Dockerfile` — Multi-arch Docker image definition (~30 lines)
- `docker-compose.yml` — Dev/prod compose templates (~40 lines)

---

## M8: Distribution Adapters

### Responsibility
Pluggable transport adapters for publishing and fetching `.emb` packages from artifact repositories.

### Public Interface

```javascript
/**
 * @param {TransportConfig} config
 * @returns {Transport}
 */
export function createTransport(config) {}

/** @typedef {Object} Transport
 * @property {function} publish - (packagePath: string, meta: PackageMeta) => Promise<PublishResult>
 * @property {function} fetch - (moduleId: string, version: string, destPath: string) => Promise<string>
 * @property {function} listVersions - (moduleId: string) => Promise<VersionInfo[]>
 * @property {function} checkForUpdates - (current: VersionMap) => Promise<UpdateInfo[]>
 */

/** @typedef {Object} TransportConfig
 * @property {'artifactory'|'nexus'|'s3'|'sftp'} type
 * @property {string} url - Repository URL
 * @property {Object} [auth] - Authentication credentials
 * @property {number} [retries=3] - Retry count on failure
 * @property {number} [timeoutMs=60000] - Per-operation timeout
 */
```

### Estimated Size
- `index.js` — Factory, common logic (~80 lines)
- `artifactory.js` — Artifactory REST API client (~150 lines)
- `nexus.js` — Nexus REST API client (~150 lines)
- `s3.js` — AWS S3 client (~120 lines)
- `sftp.js` — SFTP client (~120 lines)

---

## M9: Aggregation Pipeline

### Responsibility
Collect per-module `.emb` packages into a versioned release bundle with cross-module compatibility validation.

### Public Interface

```javascript
/**
 * @param {AggregateOptions} options
 * @returns {Promise<ReleaseBundleResult>}
 */
export async function aggregate(options) {}

/** @typedef {Object} AggregateOptions
 * @property {ModuleRef[]} modules - Modules to include with versions
 * @property {string} releaseVersion - Release version string
 * @property {string} outputDir - Where to write the bundle
 * @property {import('./registry').ModuleRegistry} registry - For compatibility checks
 */

/** @typedef {Object} ReleaseBundleResult
 * @property {string} bundlePath - Path to release bundle
 * @property {Object} manifest - Release manifest
 * @property {string[]} warnings - Non-blocking warnings
 */
```

### Estimated Size
- `index.js` — Aggregation logic, compatibility validation, manifest generation (~200 lines)

---

## M10: iSDLC Search Backend

### Responsibility
Thin adapter that bridges the iSDLC search router to the MCP server. Registers as `semantic` modality.

### Public Interface

```javascript
/**
 * Create the semantic search backend adapter.
 * @param {SemanticBackendConfig} config
 * @returns {SearchAdapter}
 */
export function createSemanticBackend(config) {}

/** @typedef {Object} SearchAdapter
 * @property {function} search - (request: SearchRequest) => Promise<SearchHit[]>
 * @property {function} healthCheck - () => Promise<HealthStatus>
 */

/** @typedef {Object} SemanticBackendConfig
 * @property {string} mcpServerUrl - SSE endpoint URL (e.g., 'http://localhost:3100/sse')
 * @property {string} [fallbackIndexPath] - Direct FAISS index path for fallback
 * @property {number} [timeoutMs=5000]
 */
```

### Estimated Size
- `semantic.js` — Backend adapter, SSE client, fallback logic (~150 lines)

---

## Dependency Diagram

```
M10 (Search Backend)
  └── M7 (MCP Server)
        ├── M5 (Package Reader)
        │     └── faiss-node, better-sqlite3
        └── M6 (Module Registry)

M9 (Aggregation)
  ├── M5 (Package)
  ├── M6 (Registry)
  └── M8 (Distribution)

M8 (Distribution)
  └── M5 (Package format)

M5 (Package Builder)
  ├── M2 (Embedding Engine) — embeddings input
  └── M1 (Chunker) — chunks input

M4 (Redaction)
  └── M1 (Chunk type)

M1 (Chunker)
  └── tree-sitter

M2 (Engine)
  └── onnxruntime (CodeBERT)

M3 (VCS Adapter)
  └── git/svn CLI

No circular dependencies.
```
