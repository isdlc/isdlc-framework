# Architecture Overview: Knowledge Management Service (GH-263)

## 1. Architecture Options

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|---|---|---|---|---|---|
| A: Monolithic single-process | MCP, web UI, pipeline, crawlers all in one Node.js process | Simple deployment, no IPC | Embedding blocks event loop, OOM risk on query path | Matches current iSDLC embedding server | Eliminated |
| B: Two-process split (API + Worker) | API process (MCP + web UI) separate from Worker (embedding + crawling) | API stays responsive, memory isolation, independent restart | Slightly more complex (two processes, job queue) | Standard producer-consumer | Selected |

## 2. Selected Architecture

### ADR-001: API/Worker Process Split
- **Status**: Accepted
- **Context**: Embedding and crawling are CPU/memory intensive. Running them in the same process as the MCP query server would block responses and risk OOM.
- **Decision**: Split into API process (MCP + web UI) and Worker process (embedding pipeline + source crawlers). SQLite-backed job queue coordinates.
- **Rationale**: Memory isolation protects query path. Worker can crash/restart without affecting developer queries.
- **Consequences**: Install script starts two processes. Health check verifies both. Job queue adds coordination.

### ADR-002: Vector DB is Pluggable, No Default
- **Status**: Accepted
- **Context**: Different teams have different infrastructure. Forcing a default adds unnecessary migration.
- **Decision**: No default Vector DB. Install script presents options: local (SQLite-vec, Qdrant, ChromaDB, Milvus, Weaviate, FAISS) or remote (Amazon OpenSearch, Pinecone, Qdrant Cloud, Weaviate Cloud, Milvus Cloud/Zilliz). Team lead chooses during setup.
- **Rationale**: Maximises adoption across teams with different infrastructure.
- **Consequences**: Must abstract vector DB interface. Per-project selection requires multiple adapter implementations.

### ADR-003: JSON File Config Store
- **Status**: Accepted
- **Context**: Need to store project definitions, source lists, model config, and refresh history.
- **Decision**: JSON files under `data/projects/{project-id}/` — `config.json` per project, `refresh-history.json` for audit trail.
- **Rationale**: Human-readable, easy to backup, no database dependency for config.
- **Consequences**: No concurrent write protection (acceptable — single admin). Refresh history may need rotation.

### ADR-004: Dual Model Inference Path
- **Status**: Accepted
- **Context**: Some teams have server hardware for local inference. Others prefer cloud APIs.
- **Decision**: Support both local (ONNX Runtime, FP4/FP16/FP32) and cloud embedding APIs (OpenAI, Cohere, Bedrock) behind a common adapter interface. Per-project selection.
- **Rationale**: Maximises adoption. Cloud API teams avoid model management. Local teams get lower latency.
- **Consequences**: Must abstract embedding interface. Cloud API costs are team's responsibility. FR-011 model pinning only applies to local models.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|---|---|---|---|
| Node.js (ESM) | >= 18 | Consistent with iSDLC ecosystem. ONNX Runtime bindings available. | Python (better ML ecosystem, splits stack) |
| ONNX Runtime | Latest | Already used in GH-237. Supports FP4/FP16/FP32. | Transformers.js (less precision control) |
| Vector DB | Pluggable | Per-project selection. Local: SQLite-vec, Qdrant, ChromaDB, Milvus, Weaviate, FAISS. Remote: OpenSearch, Pinecone, Qdrant Cloud, Weaviate Cloud, Milvus Cloud. | Single DB (limits adoption) |
| Job Queue | BetterSqlite3 | No external deps. Durable. Proven. | Redis/Bull (overkill), pg-boss (Postgres dep) |
| Web UI | Plain HTML + vanilla JS | CON-004. No build step. | React/Vue (unnecessary complexity) |
| Config Store | JSON files | Simple, human-readable, git-friendly. | SQLite (harder to inspect) |
| Source crawling | Node.js native | simple-git, svn CLI wrapper, Confluence REST, cheerio | Scrapy (Python, wrong ecosystem) |
| Observability | Prometheus + OpenTelemetry | Industry standard. Grafana/Zabbix compatible. | Custom metrics (reinventing the wheel) |

## 4. Integration Architecture

| ID | Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|---|
| INT-001 | iSDLC (developer) | API Process | MCP over HTTP | JSON-RPC 2.0 | Standard MCP errors |
| INT-002 | iSDLC (finalize) | API Process | MCP add_content | JSON-RPC 2.0 | Fail-open — finalize continues if unreachable |
| INT-003 | CI/CD (GitHub Actions / Jenkins) | API Process | REST POST /api/refresh | JSON | HTTP 200/400/500, idempotent |
| INT-004 | Team lead | API Process | HTTP (web UI) | HTML + REST | Standard HTTP errors |
| INT-005 | API Process | Worker Process | Job queue (SQLite) | JSON job records | Dead letter, max 3 retries |
| INT-006 | Worker Process | External sources | Source connectors | Per-source protocol | Per-connector, logged in history |
| INT-007 | Worker Process | Vector DB | DB-specific adapter | Vectors + metadata | Transaction-safe, rollback on failure |

### Data Flow

```
Full Rebuild:
  Web UI trigger → API enqueues full_rebuild job
    → Worker dequeues → Connectors crawl all sources
    → Correlation Engine matches code ↔ docs ↔ tests
    → Embedding Pipeline generates vectors (via Model Adapter)
    → Vector DB Adapter clears index, stores new vectors
    → Config Store records refresh history

Incremental Refresh:
  CI/CD POST /api/refresh → API enqueues incremental_refresh job
    → Worker dequeues → Connector fetches diff
    → Correlation Engine re-correlates changed files
    → Embedding Pipeline generates vectors for changed chunks
    → Vector DB Adapter upserts changed vectors
    → Config Store records refresh history

Developer Query:
  iSDLC MCP call → API receives semantic_search
    → Query Engine embeds query text
    → Fan out: search each project index in parallel
    → Merge results, rank by score, tag with source project
    → Return to developer
```

## 5. Summary

| Decision | Choice | Risk Level |
|---|---|---|
| Process architecture | Two-process (API + Worker) | Low |
| Vector DB | Pluggable, no default | Low |
| Model inference | Dual path (local ONNX + cloud API) | Low |
| Config store | JSON files | Low |
| Job queue | SQLite-backed | Low |
| Web UI | Plain HTML, same process | Low |
| Observability | Prometheus + OTLP, domain-specific in web UI | Low |

**Go/No-Go**: Go — architecture is straightforward, all components are well-understood patterns, no high-risk decisions.
