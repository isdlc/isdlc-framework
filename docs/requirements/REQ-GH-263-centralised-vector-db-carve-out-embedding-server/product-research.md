# Product Research: Knowledge Management Service (GH-263)

**Date**: 2026-04-25
**Purpose**: Evaluate existing open-source tools against the knowledge management service requirements before building.

---

## Executive Summary

No existing open-source tool covers more than ~47% of the 18 core requirements. The highest scorer (Haystack by deepset) is a framework, not a platform — it requires building the admin UI, project isolation, CI/CD webhooks, and relationship-aware chunking as custom layers. The truly differentiating requirements (relationship-aware embedding, per-project infrastructure selection, model memory management, SVN support) don't exist in any tool.

---

## Requirements Evaluated

| # | Requirement | Category |
|---|---|---|
| 1 | Centralised embedding/vector search server (not local-only) | Infrastructure |
| 2 | Multi-project/multi-tenant with isolated indexes per project (module + version) | Data Model |
| 3 | Relationship-aware embedding — correlates code with docs, tests, and specs before embedding | Core Differentiator |
| 4 | Heterogeneous source connectors (Git, SVN, Confluence, websites, Google Docs, shared folders) | Connectors |
| 5 | Incremental refresh via CI/CD webhooks (GitHub Actions, Jenkins) | Integration |
| 6 | Full rebuild on demand | Operations |
| 7 | Web UI for admin — project CRUD, source management, embedding config, monitoring, audit logs | Admin |
| 8 | MCP (Model Context Protocol) interface for querying | Integration |
| 9 | Per-project embedding model selection (Jina, BGE, etc.) | Configuration |
| 10 | Per-project precision selection (FP4, FP16, FP32) | Configuration |
| 11 | Per-project Vector DB backend selection (SQLite-vec, Qdrant, Milvus, Weaviate, FAISS, Pinecone, OpenSearch, ChromaDB) | Configuration |
| 12 | Support both local model inference (ONNX) and cloud embedding APIs (OpenAI, Cohere, Bedrock) | Infrastructure |
| 13 | Model memory management — pin/unpin models, LRU eviction | Operations |
| 14 | Developer configures which projects to query — cross-project search with merged results tagged by source project | Query |
| 15 | Audit logging of all admin actions | Governance |
| 16 | Prometheus metrics + OpenTelemetry support | Observability |
| 17 | npm package, cross-platform (Windows/Linux/Mac) | Distribution |
| 18 | Standalone — usable without any specific IDE or dev tool | Independence |

---

## Comparison Matrix

### Legend
- **Y** = Fully meets
- **P** = Partially meets (with caveats)
- **N** = Does not meet

### Haystack (by deepset) — Score: ~8.5/18

**Repo**: github.com/deepset-ai/haystack | **License**: Apache 2.0 | **Stack**: Python

| # | Req | Rating | Notes |
|---|---|---|---|
| 1 | Centralised server | Y | Hayhooks wraps pipelines as REST/MCP servers |
| 2 | Multi-tenant | N | Framework, not a platform — you build this yourself |
| 3 | Relationship-aware | N | General-purpose; no code-doc correlation |
| 4 | Connectors | Y | 115 integrations including Confluence, GitHub, web. No SVN |
| 5 | CI/CD refresh | P | Wire yourself via pipeline API |
| 6 | Full rebuild | Y | Pipeline-driven, programmable |
| 7 | Web UI admin | N | No admin UI |
| 8 | MCP interface | Y | Hayhooks exposes pipelines as MCP servers |
| 9 | Per-project model | Y | Fully configurable per pipeline; 30+ embedding providers |
| 10 | Per-project precision | P | Depends on model provider; no first-class precision selection |
| 11 | Per-project Vector DB | Y | 21+ document store backends (Qdrant, Milvus, Weaviate, FAISS, Pinecone, OpenSearch, Chroma, etc.) |
| 12 | Local + cloud | Y | ONNX, HuggingFace, llama.cpp + OpenAI, Cohere, Bedrock, Azure |
| 13 | Model memory mgmt | N | No pin/unpin/LRU |
| 14 | Cross-project search | N | Not built-in |
| 15 | Audit logging | P | Enterprise platform has observability; community needs integration |
| 16 | Prometheus/OTEL | P | Via integrations (Arize Phoenix, Langfuse, OpenLIT) |
| 17 | npm package | N | Python framework |
| 18 | Standalone | Y | Via Hayhooks |

**Assessment**: Richest ecosystem for Vector DBs and embedding providers. But it's a toolkit, not a platform — requires building the entire application layer (admin UI, multi-tenancy, project isolation, CI/CD integration) on top.

---

### Onyx (formerly Danswer) — Score: ~7/18

**Repo**: github.com/onyx-dot-app/onyx | **License**: MIT (CE) + Enterprise | **Stack**: Python/TypeScript

| # | Req | Rating | Notes |
|---|---|---|---|
| 1 | Centralised server | Y | Full client-server deployment |
| 2 | Multi-tenant | P | Enterprise RBAC and SSO; user/group-based, not project-based isolation |
| 3 | Relationship-aware | N | Indexes documents independently |
| 4 | Connectors | P | 50+ connectors (Confluence, GitHub, Google Drive, Slack, Jira, web). No SVN |
| 5 | CI/CD refresh | P | Background sync workers with continuous indexing; not webhook-triggered |
| 6 | Full rebuild | Y | Admin can re-index connectors |
| 7 | Web UI admin | Y | Full admin UI with connector management, user management, analytics |
| 8 | MCP interface | P | MCP support for actions/tools but limited server exposure for querying |
| 9 | Per-project model | N | Global embedding model config |
| 10 | Per-project precision | N | Not configurable |
| 11 | Per-project Vector DB | N | Uses Vespa internally; not swappable |
| 12 | Local + cloud | P | Cloud providers and self-hosted models |
| 13 | Model memory mgmt | N | Not applicable |
| 14 | Cross-project search | N | Not designed for it |
| 15 | Audit logging | Y | Enterprise edition has query auditing |
| 16 | Prometheus/OTEL | N | Not documented |
| 17 | npm package | N | Python/Docker only |
| 18 | Standalone | Y | Fully standalone web app |

**Assessment**: Best out-of-the-box admin experience with 50+ connectors and full web UI. Missing per-project configuration, MCP server mode, code-awareness, SVN, and cross-project search.

---

### RAGFlow — Score: ~7/18

**Repo**: github.com/infiniflow/ragflow | **License**: Apache 2.0 | **Stack**: Python/TypeScript/Go/C++

| # | Req | Rating | Notes |
|---|---|---|---|
| 1 | Centralised server | Y | Full server deployment |
| 2 | Multi-tenant | P | "Knowledge bases" as isolation units; not true project-based multi-tenancy |
| 3 | Relationship-aware | P | Template-based intelligent chunking with document understanding; not code-aware |
| 4 | Connectors | P | Confluence, S3, Notion, Discord, Google Drive, web. No Git, no SVN |
| 5 | CI/CD refresh | P | Auto-sync from sources; not webhook-triggered |
| 6 | Full rebuild | Y | Re-process knowledge bases |
| 7 | Web UI admin | Y | Full web UI for knowledge base management |
| 8 | MCP interface | Y | Explicit MCP support |
| 9 | Per-project model | P | Configurable per knowledge base via config |
| 10 | Per-project precision | N | Not configurable |
| 11 | Per-project Vector DB | N | Elasticsearch or Infinity only |
| 12 | Local + cloud | Y | Both local and cloud providers |
| 13 | Model memory mgmt | N | No pin/unpin/LRU |
| 14 | Cross-project search | N | Unclear |
| 15 | Audit logging | N | Not documented |
| 16 | Prometheus/OTEL | N | Not documented |
| 17 | npm package | N | Python/Docker |
| 18 | Standalone | Y | Fully standalone |

**Assessment**: Best document understanding and MCP support. Missing Git/SVN connectors, multi-tenancy, per-project model config, and limited VDB options.

---

### R2R (SciPhi) — Score: ~7/18

**Repo**: github.com/SciPhi-AI/R2R | **License**: MIT | **Stack**: Python

| # | Req | Rating | Notes |
|---|---|---|---|
| 1 | Centralised server | Y | RESTful API server |
| 2 | Multi-tenant | P | Collections + user management; some tenant isolation |
| 3 | Relationship-aware | P | Knowledge graph with entity/relationship extraction; not code-specific |
| 4 | Connectors | P | PDF, TXT, JSON, multimodal. No Git, SVN, Confluence |
| 5 | CI/CD refresh | P | API-driven; could be wired |
| 6 | Full rebuild | Y | Through API |
| 7 | Web UI admin | Y | React+Next.js dashboard |
| 8 | MCP interface | Y | MCP integration confirmed |
| 9 | Per-project model | N | Unclear; likely global |
| 10 | Per-project precision | N | Not documented |
| 11 | Per-project Vector DB | N | PostgreSQL + pgvector only |
| 12 | Local + cloud | P | Multiple providers |
| 13 | Model memory mgmt | N | No pin/unpin/LRU |
| 14 | Cross-project search | P | Collections may allow cross-collection queries |
| 15 | Audit logging | P | User management with auth |
| 16 | Prometheus/OTEL | N | Not documented |
| 17 | npm package | N | Python/Docker; JS SDK for client only |
| 18 | Standalone | Y | Fully standalone |

**Assessment**: Closest architecture to what we need (server + web UI + collections + knowledge graph + MCP). Extensive work needed on connector breadth, VDB flexibility, and per-project config.

---

### txtai — Score: ~6.5/18

**Repo**: github.com/neuml/txtai | **License**: Apache 2.0 | **Stack**: Python/FastAPI

| # | Req | Rating | Notes |
|---|---|---|---|
| 1 | Centralised server | Y | FastAPI-based server mode |
| 2 | Multi-tenant | P | Multiple indexes possible; no built-in tenant isolation |
| 3 | Relationship-aware | N | General-purpose embeddings |
| 4 | Connectors | P | Web, SQL, file formats via pipelines; no Git/SVN/Confluence |
| 5 | CI/CD refresh | P | API-triggered; no webhook system |
| 6 | Full rebuild | Y | API-driven |
| 7 | Web UI admin | N | No web UI; API/config only |
| 8 | MCP interface | Y | Auto-exposes all API endpoints as MCP tools |
| 9 | Per-project model | P | Different config per instance; requires manual setup |
| 10 | Per-project precision | N | Not first-class |
| 11 | Per-project Vector DB | P | Sparse+dense indexes; limited backend options |
| 12 | Local + cloud | Y | HuggingFace local + cloud APIs |
| 13 | Model memory mgmt | N | No pin/unpin/LRU |
| 14 | Cross-project search | P | Could query multiple indexes programmatically |
| 15 | Audit logging | N | None |
| 16 | Prometheus/OTEL | N | Not built in |
| 17 | npm package | N | Python (has JS bindings for client) |
| 18 | Standalone | Y | Fully standalone |

**Assessment**: Best MCP-native design (auto-exposes all APIs as MCP tools). Lightweight and good for building on. Missing web UI, connectors, and multi-tenancy.

---

### AnythingLLM — Score: ~6/18

**Repo**: github.com/Mintplex-Labs/anything-llm | **License**: MIT | **Stack**: JavaScript/Node.js/React

| # | Req | Rating | Notes |
|---|---|---|---|
| 1 | Centralised server | Y | Docker server deployment |
| 2 | Multi-tenant | P | Workspaces with RBAC in Docker mode |
| 3 | Relationship-aware | N | File-level ingestion |
| 4 | Connectors | P | PDF, TXT, DOCX via upload; no Git/SVN/Confluence |
| 5 | CI/CD refresh | N | Manual upload model |
| 6 | Full rebuild | P | Per-workspace re-embedding |
| 7 | Web UI admin | Y | Full admin UI |
| 8 | MCP interface | Y | MCP server mode |
| 9 | Per-project model | N | System-wide selection |
| 10 | Per-project precision | N | Not configurable |
| 11 | Per-project Vector DB | N | System-wide (supports 10+ backends) |
| 12 | Local + cloud | Y | Native embedder + OpenAI, Azure, Ollama |
| 13 | Model memory mgmt | N | None |
| 14 | Cross-project search | N | No cross-workspace search |
| 15 | Audit logging | N | Not documented |
| 16 | Prometheus/OTEL | N | Not built in |
| 17 | npm package | P | JavaScript-based but Docker/desktop distribution |
| 18 | Standalone | Y | Fully standalone |

**Assessment**: Only JavaScript-based contender. Good admin UI and VDB support. Missing per-project config, CI/CD integration, and code-awareness.

---

### Other Tools Evaluated

| Tool | Status | Key Issue |
|---|---|---|
| Sourcegraph | Proprietary (no longer open source since v5.1) | Code search focused, no MCP, no multi-VDB |
| Bloop | Archived Jan 2025 | Dead project |
| Greptile | Proprietary SaaS | Not open source; has MCP but commercial only |
| Glean | Proprietary SaaS | Not open source |
| Cursor | Proprietary, IDE-embedded | Not open source, not standalone |
| Continue.dev | IDE plugin | Not a server; local-only indexing |
| PrivateGPT | OSS but limited | Personal use, no multi-tenancy, no MCP |
| Vectara | Proprietary SaaS | Not open source (OSS demo only) |
| Khoj | AGPL-3.0 | Personal AI assistant; not project-based (~3/18) |
| Quivr | Apache 2.0 | Standard chunking, limited connectors (~4/18) |
| Tabby | Apache 2.0 (Rust) | Code completion focused, not knowledge management (~5/18) |
| Cognita | MIT (archived March 2026) | Dead project |
| ChromaDB | OSS | Vector DB only, not a platform |
| LlamaIndex | OSS | Framework like Haystack; requires assembly |

---

## Gap Analysis: Requirements Nobody Meets

These are the differentiating requirements that make the knowledge management service unique:

| Requirement | Gap | Impact |
|---|---|---|
| **Relationship-aware embedding** | Zero tools correlate code with tests, docs, and specs before embedding. R2R has knowledge graph extraction on document content, not code-to-test mapping. | Core value proposition — without this, search returns fragments instead of correlated knowledge |
| **SVN support** | Zero tools support SVN. Everything assumes Git. | Team blocker — SVN is the primary VCS for the target team |
| **Per-project Vector DB backend** | Zero tools let different projects use different vector databases simultaneously | Flexibility requirement — different projects have different performance/cost needs |
| **Per-project precision (FP4/FP16/FP32)** | Zero tools expose this as a per-project config option | Fine-grained accuracy/performance tradeoff per project |
| **Model memory management (pin/unpin/LRU)** | Zero tools have this concept | Resource efficiency for multi-model servers |
| **Cross-project search with tagged results** | No tool provides this as a first-class feature | Developer works across modules (POS + Payments) and needs merged results |
| **npm package distribution** | All serious contenders are Python-based | Ecosystem consistency with iSDLC (Node.js) |

---

## Recommendation

### Option 1: Build on Haystack (Recommended for Pipeline Layer)

Use Haystack as the internal pipeline engine — it provides 21+ Vector DB backends, 30+ embedding providers, and MCP via Hayhooks. Build the following as custom layers:

- Multi-tenant admin UI (web dashboard)
- Project isolation and configuration store
- CI/CD webhook integration (refresh endpoint)
- SVN connector
- Relationship-aware correlation engine
- Model memory management (pin/unpin/LRU)
- Cross-project search merger
- Audit logging
- npm package wrapper

**Tradeoff**: Python dependency for the pipeline layer inside a Node.js service. Could use Haystack as a subprocess or via REST API.

### Option 2: Build from Scratch (Recommended Overall)

Given that the truly differentiating features don't exist anywhere and the pipeline layer (embedding + vector storage) is well-understood, building a purpose-built Node.js service is justified:

- ONNX Runtime has Node.js bindings for local inference
- Vector DB client libraries exist for Node.js (better-sqlite3, qdrant-js, @pinecone-database/pinecone, etc.)
- Source connectors are straightforward (simple-git, Confluence REST API, cheerio for web scraping)
- The novel value is in the correlation engine and the admin/config layer — those must be custom regardless

**Tradeoff**: More initial work, but no Python dependency, full control, and ecosystem consistency with iSDLC.

### Option 3: Fork and Extend R2R

R2R has the closest existing architecture. Fork and extend with:

- Additional connectors (Git, SVN, Confluence)
- Replace pgvector-only with pluggable VDB backends
- Add per-project model/precision/VDB selection
- Add model memory management
- Replace generic knowledge graph with code-aware correlation engine

**Tradeoff**: Python codebase, significant refactoring, upstream divergence.

---

## Decision

**To be decided by team.** This document provides the evidence base. Key factors:

- If ecosystem consistency (Node.js) matters → Option 2 (build from scratch)
- If time-to-market matters and Python is acceptable → Option 1 (Haystack pipeline layer)
- If closest starting point matters → Option 3 (fork R2R)

All options require building the relationship-aware correlation engine, SVN connector, per-project infrastructure selection, and model memory management from scratch — these are novel and differentiate the product.
