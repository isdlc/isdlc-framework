# Task Plan: REQ-GH-263 centralised-vector-db-carve-out-embedding-server

## Progress Summary

| Phase | Total | Done | Remaining |
|---|---|---|---|
| 05 | 1 | 0 | 1 |
| 06 | 32 | 0 | 32 |
| 16 | 3 | 0 | 3 |
| 08 | 1 | 0 | 1 |
| **Total** | **37** | **0** | **37** |

## Phase 05: Test Strategy -- PENDING

- [ ] T001 Define test strategy — unit tests per module, integration tests for pipeline flow, E2E for MCP + REST | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016

## Phase 06: Implementation -- PENDING

- [ ] T002 Scaffold repo — package.json, directory structure, ESM config, CLI entry point, npm bin | traces: FR-010, CON-001
  files: package.json (CREATE), bin/cli.js (CREATE)

- [ ] T003 Config Store — project CRUD, JSON file read/write, refresh history | traces: FR-001
  files: src/config/index.js (CREATE), src/config/project-store.js (CREATE), src/config/refresh-history.js (CREATE)
  blocked_by: [T002]

- [ ] T004 Job Queue — SQLite-backed, enqueue/dequeue/complete/fail, dead letter | traces: FR-004, FR-005
  files: src/queue/index.js (CREATE), src/queue/queue.js (CREATE)
  blocked_by: [T002]

- [ ] T005 Audit Logger — append-only JSONL, query with filters, rotation | traces: FR-014
  files: src/audit/index.js (CREATE), src/audit/logger.js (CREATE)
  blocked_by: [T002]

- [ ] T006 Model Adapter interface + ONNX local adapter — FP4/FP16/FP32 | traces: FR-002, FR-009
  files: src/models/adapter.js (CREATE), src/models/onnx-local.js (CREATE)
  blocked_by: [T002]

- [ ] T007 Cloud API model adapters — OpenAI, Cohere, Bedrock | traces: FR-009
  files: src/models/openai.js (CREATE), src/models/cohere.js (CREATE), src/models/bedrock.js (CREATE)
  blocked_by: [T002]

- [ ] T008 Model Manager — load, pin, unpin, LRU eviction, memory tracking | traces: FR-011
  files: src/models/manager.js (CREATE)
  blocked_by: [T006]

- [ ] T009 Vector DB Adapter interface + SQLite-vec adapter | traces: FR-006, FR-008
  files: src/vectordb/adapter.js (CREATE), src/vectordb/sqlite-vec.js (CREATE)
  blocked_by: [T002]

- [ ] T010 Vector DB Adapters — Qdrant, ChromaDB, Milvus, Weaviate, FAISS | traces: FR-009
  files: src/vectordb/qdrant.js (CREATE), src/vectordb/chromadb.js (CREATE), src/vectordb/milvus.js (CREATE), src/vectordb/weaviate.js (CREATE), src/vectordb/faiss.js (CREATE)
  blocked_by: [T009]

- [ ] T011 Vector DB Adapters — remote/cloud (OpenSearch, Pinecone, Qdrant Cloud, Weaviate Cloud, Milvus Cloud) | traces: FR-009
  files: src/vectordb/opensearch.js (CREATE), src/vectordb/pinecone.js (CREATE), src/vectordb/qdrant-cloud.js (CREATE), src/vectordb/weaviate-cloud.js (CREATE), src/vectordb/milvus-cloud.js (CREATE)
  blocked_by: [T009]

- [ ] T012 Source Connector interface + Git connector — clone, pull, diff | traces: FR-003
  files: src/connectors/connector.js (CREATE), src/connectors/git.js (CREATE)
  blocked_by: [T002]

- [ ] T013 SVN connector — checkout, update, revision diff | traces: FR-003
  files: src/connectors/svn.js (CREATE)
  blocked_by: [T012]

- [ ] T014 Confluence connector — REST API, sub-page crawl | traces: FR-003
  files: src/connectors/confluence.js (CREATE)
  blocked_by: [T012]

- [ ] T015 Website connector — web scraper, link following | traces: FR-003
  files: src/connectors/web.js (CREATE)
  blocked_by: [T012]

- [ ] T016 Google Docs + Shared folder connectors | traces: FR-003
  files: src/connectors/gdocs.js (CREATE), src/connectors/filesystem.js (CREATE)
  blocked_by: [T012]

- [ ] T017 Correlation Engine — path/name matching, import graph, iSDLC artifact traces | traces: FR-002
  files: src/correlation/index.js (CREATE), src/correlation/strategies.js (CREATE)
  blocked_by: [T012]

- [ ] T018 Embedding Pipeline — context-enriched chunking, relationship preamble, model adapter integration | traces: FR-002
  files: src/pipeline/index.js (CREATE), src/pipeline/chunker.js (CREATE), src/pipeline/enricher.js (CREATE)
  blocked_by: [T006, T017]

- [ ] T019 Worker process — job loop, full rebuild, incremental refresh orchestration | traces: FR-004, FR-005
  files: src/worker/index.js (CREATE), src/worker/rebuild.js (CREATE), src/worker/refresh.js (CREATE)
  blocked_by: [T004, T012, T017, T018, T009]

- [ ] T020 Query Engine — fan-out across project indexes, merge, rank, tag by project | traces: FR-006, FR-008
  files: src/query/index.js (CREATE), src/query/merger.js (CREATE)
  blocked_by: [T009, T006]

- [ ] T021 MCP Server — JSON-RPC endpoint, semantic_search, add_content, list_projects, list_modules | traces: FR-008
  files: src/api/mcp.js (CREATE), src/api/mcp-handlers.js (CREATE)
  blocked_by: [T020, T003]

- [ ] T022 REST API — refresh endpoint, project CRUD, model management, system health | traces: FR-004, FR-007, FR-011, FR-014, FR-015
  files: src/api/rest.js (CREATE), src/api/routes/refresh.js (CREATE), src/api/routes/projects.js (CREATE), src/api/routes/models.js (CREATE), src/api/routes/system.js (CREATE)
  blocked_by: [T003, T004, T005, T008]

- [ ] T023 API Server — HTTP binding, route registration, static file serving | traces: FR-007
  files: src/api/server.js (CREATE)
  blocked_by: [T021, T022]

- [ ] T024 Web UI — Projects tab (CRUD, sources, embedding config, rebuild) | traces: FR-001, FR-003, FR-005, FR-009
  files: ui/index.html (CREATE), ui/projects.js (CREATE), ui/styles.css (CREATE)
  blocked_by: [T023]

- [ ] T025 Web UI — Monitoring tab (staleness badges, document counts, model pin status) | traces: FR-011, FR-015
  files: ui/monitoring.js (CREATE)
  blocked_by: [T023]

- [ ] T026 Web UI — Refresh History tab (per-project timeline, filterable) | traces: FR-007
  files: ui/refresh-history.js (CREATE)
  blocked_by: [T023]

- [ ] T027 Web UI — Audit Log tab (searchable, filterable, append-only) | traces: FR-014
  files: ui/audit.js (CREATE)
  blocked_by: [T023]

- [ ] T028 Prometheus /metrics endpoint + OpenTelemetry OTLP exporter | traces: FR-015
  files: src/observability/metrics.js (CREATE), src/observability/tracing.js (CREATE)
  blocked_by: [T023, T019]

- [ ] T029 CLI — setup wizard, start, stop, status, logs, reset | traces: FR-010, FR-012
  files: src/cli/setup.js (CREATE), src/cli/start.js (CREATE), src/cli/commands.js (CREATE)
  blocked_by: [T023, T019]

- [ ] T030 Staleness detection — periodic source revision check, badge computation | traces: FR-015
  files: src/observability/staleness.js (CREATE)
  blocked_by: [T003, T012]

- [ ] T031 iSDLC finalize step — push artifacts to knowledge service via add_content | traces: FR-004, FR-013
  files: src/core/finalize/finalize-utils.js (MODIFY)
  blocked_by: [T021]

- [ ] T032 iSDLC install integration — accept URL, configure .mcp.json, skip local embeddings | traces: FR-013
  files: bin/init-project.sh (MODIFY)
  blocked_by: [T023]

- [ ] T033 iSDLC status line — show connection status and staleness from /metrics | traces: FR-016
  files: src/claude/hooks/ (MODIFY)
  blocked_by: [T028]

## Phase 16: Quality Loop -- PENDING

- [ ] T034 Integration tests — full pipeline per connector type | traces: FR-002, FR-003, FR-004
- [ ] T035 E2E tests — MCP query, REST API, web UI | traces: FR-006, FR-007, FR-008
- [ ] T036 Cross-project query tests — merging, tagging, ranking | traces: FR-006

## Phase 08: Code Review -- PENDING

- [ ] T037 Code review — architecture compliance, adapter consistency, error handling, credential security | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016

## Dependency Graph

Critical path: T002 → T012 → T017 → T018 → T019 → T021 → T023 → T024 → T029

Tier 0 (no deps): T002
Tier 1 (T002): T003, T004, T005, T006, T007, T009, T012
Tier 2 (Tier 1): T008, T010, T011, T013, T014, T015, T016, T017, T030
Tier 3 (Tier 2): T018, T020
Tier 4 (Tier 3): T019, T021, T022
Tier 5 (Tier 4): T023
Tier 6 (Tier 5): T024, T025, T026, T027, T028, T029
Tier 7 (Tier 6): T031, T032, T033

## Traceability Matrix

| FR | Requirement | Design / Blast Radius | Related Tasks |
|---|---|---|---|
| FR-001 | Project management — CRUD, sources, isolated indexes, module+version model | Config Store JSON files, REST endpoints, Web UI Projects tab | T003, T022, T024 |
| FR-002 | Relationship-aware embedding — correlate code with docs/tests/specs before embedding | Correlation Engine + Embedding Pipeline with enriched chunking | T017, T018 |
| FR-003 | Source connectors — Git, SVN, Confluence, Website, GDocs, Filesystem | Pluggable connector interface, normalised chunks | T012, T013, T014, T015, T016 |
| FR-004 | Incremental refresh — POST /api/refresh from CI/CD, re-embed changed files only | REST endpoint, Worker incremental job, iSDLC finalize step | T019, T022, T031 |
| FR-005 | Full rebuild — team lead triggers per project, re-crawl + re-embed all | Worker full_rebuild job, Web UI trigger, job status tracking | T019, T024 |
| FR-006 | Developer query scope — project list in config, cross-project search, tagged results | Query Engine fan-out + merge, MCP semantic_search with projects param | T020, T021 |
| FR-007 | Web UI — HTML dashboard, project CRUD, source mgmt, rebuild, refresh history | Static HTML served by API, 4 tabs (Projects, Monitoring, History, Audit) | T023, T024, T025, T026, T027 |
| FR-008 | MCP interface — semantic_search, add_content, list_projects, list_modules | MCP JSON-RPC handlers delegating to Query Engine and Config Store | T021 |
| FR-009 | Embedding config per project — model, precision, VectorDB, local or cloud | Model Adapters (ONNX/OpenAI/Cohere/Bedrock), VectorDB Adapters (11 backends) | T006, T007, T009, T010, T011, T024 |
| FR-010 | Installation — npm package, cross-platform CLI, setup wizard | bin/cli.js entry point, src/cli/ commands, pure Node.js | T002, T029 |
| FR-011 | Model memory management — pin/unpin, LRU eviction, memory tracking | Model Manager with pin registry and OS memory APIs | T008, T025 |
| FR-012 | Standalone installation — usable without iSDLC, refresh guidance at completion | No iSDLC dependency, setup completion message | T029 |
| FR-013 | iSDLC install integration — accept URL, configure .mcp.json, finalize pushes artifacts | iSDLC install script changes, finalize-utils.js add_content call | T031, T032 |
| FR-014 | Audit logging — append-only JSONL, all admin actions, searchable in web UI | Audit Logger module, Web UI Audit Log tab | T005, T027 |
| FR-015 | Operational monitoring — Prometheus /metrics, OTLP, staleness detection, web UI monitoring | Observability module, staleness checker, Monitoring tab | T028, T030, T025 |
| FR-016 | iSDLC status line — connection status + staleness from /metrics | iSDLC hooks polling /metrics endpoint | T033 |

## Assumptions and Inferences

- **Assumption**: Node.js >= 18 available on target servers (ESM, fetch API, ONNX Runtime bindings)
- **Assumption**: Team lead has network access from server to Confluence, Git remotes, and cloud APIs
- **Inference**: SVN connector uses CLI wrapper (svn command) — Medium confidence
- **Inference**: FAISS adapter uses faiss-node npm binding — Medium confidence (may need native build tools)
- **Assumption**: New repo — no existing code to modify. T031-T033 are the only tasks touching iSDLC framework repo.
