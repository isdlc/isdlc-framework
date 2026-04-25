# Module Design: Knowledge Management Service (GH-263)

## Module 1: API Server (`src/api/`)
- **Responsibility**: Serves MCP protocol, REST API, and web UI. Stateless query routing.
- **Public Interface**: `startServer(config) → void`
- **Routes**: `POST /mcp`, `POST /api/refresh`, `GET/POST/PUT/DELETE /api/projects`, `POST /api/projects/:id/rebuild`, `GET /api/projects/:id/status`, `GET /api/models`, `POST/DELETE /api/models/:name/pin`, `GET /api/system/health`, `GET /api/system/memory`, `GET /metrics`
- **Dependencies**: Query Engine, Config Store, Job Queue

## Module 2: Query Engine (`src/query/`)
- **Responsibility**: Fan-out search across per-project Vector DB indexes, merge, rank, tag results.
- **Public Interface**: `search({ query, projects }) → SearchResult[]`
- **SearchResult**: `{ content, score, project, source_type, source_url, related_sources[] }`
- **Dependencies**: Vector DB Adapters, Model Adapters

## Module 3: Worker (`src/worker/`)
- **Responsibility**: Process jobs — full rebuilds and incremental refreshes.
- **Public Interface**: `startWorker(config) → void`
- **Job Types**: `full_rebuild`, `incremental_refresh`, `add_content`
- **Dependencies**: Source Connectors, Correlation Engine, Embedding Pipeline, Vector DB Adapters, Model Manager

## Module 4: Source Connectors (`src/connectors/`)
- **Responsibility**: Pluggable crawlers producing normalised chunks.
- **Interface per connector**: `crawl(config) → NormalisedChunk[]`, `diff(config, since) → NormalisedChunk[]`
- **NormalisedChunk**: `{ content, path, source_type, source_url, last_modified, metadata }`
- **Implementations**: GitConnector, SvnConnector, ConfluenceConnector, WebConnector, GDocsConnector, FilesystemConnector

## Module 5: Correlation Engine (`src/correlation/`)
- **Responsibility**: Create relationship links between chunks from multiple sources within a project.
- **Public Interface**: `correlate(chunks, project_config) → CorrelatedChunk[]`
- **CorrelatedChunk**: `{ ...NormalisedChunk, related: RelatedSource[] }`
- **RelatedSource**: `{ path, source_type, relationship: "spec"|"test"|"doc"|"impl", confidence }`
- **Strategies**: Path/name matching, iSDLC artifact trace matching, Confluence title ↔ module matching, import graph analysis

## Module 6: Embedding Pipeline (`src/pipeline/`)
- **Responsibility**: Enrich correlated chunks with relationship context, generate vectors.
- **Public Interface**: `embed(chunks, model_adapter) → EmbeddedChunk[]`
- **EmbeddedChunk**: `{ vector: float[], content, metadata, related_sources[] }`
- **Chunking**: Context-enriched with relationship preambles, respects model max tokens, overlapping windows

## Module 7: Model Adapters (`src/models/`)
- **Responsibility**: Unified embedding interface — local or cloud.
- **Interface**: `embed(text) → float[]`, `batchEmbed(texts) → float[][]`, `getInfo() → ModelInfo`
- **Implementations**: OnnxLocalAdapter (FP4/FP16/FP32), OpenAiAdapter, CohereAdapter, BedrockAdapter

## Module 8: Model Manager (`src/models/manager.js`)
- **Responsibility**: Model lifecycle — loading, pinning, LRU eviction, memory tracking. Local models only.
- **Public Interface**: `getAdapter(config) → ModelAdapter`, `pin(name)`, `unpin(name)`, `getStatus() → ModelStatus`

## Module 9: Vector DB Adapters (`src/vectordb/`)
- **Responsibility**: Unified vector storage interface — local or remote.
- **Interface**: `store(vectors)`, `search(query_vector, options) → VectorResult[]`, `delete(ids)`, `deleteAll()`, `stats() → IndexStats`
- **Implementations**: SqliteVecAdapter, QdrantAdapter, ChromaDbAdapter, MilvusAdapter, WeaviateAdapter, FaissAdapter, OpenSearchAdapter, PineconeAdapter

## Module 10: Job Queue (`src/queue/`)
- **Responsibility**: Durable async job queue. API enqueues, Worker dequeues.
- **Interface**: `enqueue(type, payload) → id`, `dequeue() → Job`, `complete(id, result)`, `fail(id, error)`, `getStatus(id)`, `listJobs(filters)`
- **Implementation**: SQLite-backed (BetterSqlite3)

## Module 11: Config Store (`src/config/`)
- **Responsibility**: Project config CRUD and refresh history.
- **Interface**: `listProjects()`, `getProject(id)`, `createProject(config)`, `updateProject(id, config)`, `deleteProject(id)`, `addRefreshRecord(id, record)`, `getRefreshHistory(id)`
- **Storage**: JSON files at `data/projects/{id}/config.json` and `refresh-history.json`

## Module 12: CLI (`src/cli/`)
- **Responsibility**: npm bin entry point — setup wizard, start/stop, status, logs.
- **Commands**: `setup`, `start`, `stop`, `status`, `logs`, `reset <project-id>`
- **Cross-platform**: Pure Node.js, no shell scripts

## Module 13: Audit Logger (`src/audit/`)
- **Responsibility**: Append-only admin action log.
- **Interface**: `log(action, details)`, `query(filters) → AuditEntry[]`
- **Storage**: JSONL at `data/audit.jsonl`, rotated by size

## Module 14: Observability (`src/observability/`)
- **Responsibility**: Prometheus metrics, OpenTelemetry traces, staleness detection.
- **Submodules**: `metrics.js` (/metrics endpoint), `tracing.js` (OTLP exporter), `staleness.js` (revision comparison + badge computation)

## Dependency Diagram

```
API Server ──→ Query Engine ──→ Vector DB Adapters
    │                              ↑
    │              Model Adapters ──┘
    │
    ├──→ Config Store
    ├──→ Job Queue ←── Worker
    ├──→ Audit Logger      │
    └──→ Observability     ├──→ Source Connectors
                           ├──→ Correlation Engine
                           ├──→ Embedding Pipeline ──→ Model Adapters
                           ├──→ Vector DB Adapters
                           └──→ Model Manager ──→ Model Adapters
```

No circular dependencies. All modules have single responsibility.
