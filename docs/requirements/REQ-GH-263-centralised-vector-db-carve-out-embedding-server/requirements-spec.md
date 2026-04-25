# Requirements Specification: Knowledge Management Service (GH-263)

## 1. Business Context

**Problem**: The current embedding pipeline runs locally per-developer — duplicated indexes, no shared search, no documentation sources, OOM on constrained hardware. This doesn't scale to teams or organisations.

**Product**: A standalone knowledge management service — centrally hosted, team-lead administered, developer-queryable via MCP. Ships in its own repo (`isdlc-knowledge-service`) with independent versioning and releases.

**Value**: Developer asks "how does the payment flow work?" and gets correlated results spanning code, Confluence specs, design docs, and iSDLC analysis artifacts — across modules and versions.

**Stakeholders**:
- **Team lead** (admin): Curates knowledge corpus via web UI — creates projects (module + version), adds sources, configures embedding models and Vector DB, pins models, triggers rebuilds, monitors health, views audit logs.
- **Developer** (consumer): Queries knowledge service via MCP through iSDLC. Configures project scope in `.isdlc/config.json`.
- **Standalone user** (admin + consumer): Uses the knowledge service without iSDLC. Manages refresh triggers manually via web UI or CI/CD.

**Success Metric**: Cross-cutting semantic search returns correlated results from code + documentation + analysis artifacts within a version-scoped project.

## 2. Stakeholders and Personas

### Team Lead (Admin)
- **Role**: Infrastructure owner for the knowledge service
- **Goals**: Curate a comprehensive, up-to-date knowledge corpus for the team
- **Pain points**: Currently no shared search — each developer has isolated local embeddings
- **Proficiency**: Technical enough to run install scripts and manage server infrastructure
- **Tasks**: Create projects, add sources, configure models/precision/VectorDB, pin models, trigger rebuilds, monitor staleness, review audit logs

### Developer (Consumer)
- **Role**: Day-to-day user of semantic search via iSDLC
- **Goals**: Find relevant code, docs, and specs quickly across modules and versions
- **Pain points**: Fragmented search — code in one place, Confluence in another, Jira in another
- **Proficiency**: Uses iSDLC daily, configures local settings
- **Tasks**: Configure project scope, run semantic searches, get cross-project results

### Standalone User
- **Role**: Uses the knowledge service without iSDLC
- **Goals**: Same as team lead + developer combined
- **Pain points**: No automatic refresh integration — must wire CI/CD manually
- **Tasks**: All admin tasks + manual refresh trigger setup

## 3. User Journeys

### Team Lead Setup Journey
1. Installs knowledge service: `npm install -g isdlc-knowledge-service`
2. Runs setup wizard: `isdlc-knowledge setup`
3. Selects embedding model source (local ONNX or cloud API) and Vector DB (local or remote)
4. Opens web UI at configured port
5. Creates project (e.g., "Payments 2.7")
6. Adds sources: repo URL + branch, Confluence page links, website URLs
7. Selects per-project model + precision + Vector DB
8. Pins high-traffic models in memory
9. Triggers full embed
10. System crawls sub-pages and linked content, builds relationship-aware index
11. Shares MCP endpoint URL with developers

### Developer Daily Use Journey
1. Adds projects to `.isdlc/config.json` (`["payments-2.7", "inventory-2.7", "order-management-3.0"]`)
2. Works on a feature — iSDLC semantic search automatically scoped to configured projects
3. Gets results tagged by source project ("this came from Payments 2.7")
4. Merges PR — CI/CD step calls refresh endpoint — index stays current

### Automatic Refresh Journey
1. Developer merges PR to repo
2. GitHub Actions / Jenkins post-build step calls `POST /api/refresh` with repo ID and changed paths
3. Knowledge service re-embeds only changed files + their correlated sources
4. Index updated within minutes

### Manual Refresh Journey
1. Team lead adds new Confluence space in web UI
2. Triggers full rebuild for that project
3. System re-crawls all sources, re-generates embeddings
4. Progress visible in web UI

## 4. Technical Context

**Constraints**:
- CON-001: Separate repo — independent versioning, releases, CI/CD. No build-time dependency on iSDLC.
- CON-002: iSDLC integration via MCP protocol only — no shared code, no imports.
- CON-003: Must support both Git and SVN repositories.
- CON-004: Web UI is plain HTML served by the same process — no separate frontend framework.

**Technical Environment**:
- Node.js (ESM) runtime
- ONNX Runtime for local model inference
- Two-process architecture: API process (MCP + web UI) and Worker process (embedding pipeline)
- SQLite-backed job queue for async work coordination
- JSON file config store for project definitions
- Pluggable adapters for both model inference and vector storage

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|---|---|---|
| Reliability | Critical | Incremental refresh is idempotent — re-running with same input produces same result |
| Performance | High | Incremental refresh completes within minutes, not hours |
| Isolation | Critical | Project indexes are fully isolated — corrupt index in one project doesn't affect others |
| Memory efficiency | High | Lazy model loading with LRU eviction by default, pinning for high-traffic models |
| Cross-platform | High | Works on Windows, Linux, and macOS without platform-specific scripts |

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Correlation engine accuracy — matching code to wrong docs | Medium | High | Start with filename/path matching heuristics, improve with semantic similarity. Allow manual overrides. |
| Memory pressure from multiple pinned models | Medium | Medium | Web UI shows memory usage. Warn when total pinned model size exceeds 80% available RAM. |
| SVN connector complexity | Medium | Low | Start with `svn` CLI wrapper. Upgrade to library if needed. |
| Vector DB migration when switching backends | Low | Medium | Abstract interface. Migration tool reads from old, writes to new. |
| Web scraper reliability | Medium | Low | Best-effort with depth limits. Log unreachable pages. |

## 6. Functional Requirements

### FR-001: Project Management — Must Have
**Confidence**: High

- AC-001-01: Given a team lead on the web UI, when they create a project with name, version, and description, then the project is persisted and visible in the project list.
- AC-001-02: Given a project exists, when the team lead adds or removes a source (Git repo + branch, SVN repo, Confluence page URL, website URL, Google Docs link, shared folder path), then the source list is updated.
- AC-001-03: Given a source with a root URL, when a crawl is triggered, then the system crawls all sub-pages and linked content from that root.
- AC-001-04: Given multiple projects, when embeddings are generated, then each project has an isolated embedding index.
- AC-001-05: Given a project, then it represents a module + version combination (e.g., "Payments 2.7").

### FR-002: Relationship-Aware Embedding Pipeline — Must Have
**Confidence**: High

- AC-002-01: Given code modules and related documentation, when the pipeline runs, then it correlates code with docs, discover output, tests, and analysis artifacts before embedding.
- AC-002-02: Given a code entity chunk, then it includes pointers to its spec, test coverage, and architectural role.
- AC-002-03: Given a project with discover output, when the pipeline runs, then discover runs as a prerequisite before embedding.
- AC-002-04: Given embedded vectors, then they capture cross-source relationships, not just individual file content.

### FR-003: Source Connectors — Must Have (Git, SVN, Confluence) / Should Have (Website, Google Docs, Shared Folder)
**Confidence**: High

- AC-003-01: Given a Git repo source, when a crawl runs, then the connector clones/pulls and supports diff-based incremental refresh.
- AC-003-02: Given an SVN repo source, when a crawl runs, then the connector checks out/updates and supports revision-based incremental refresh.
- AC-003-03: Given a Confluence page URL, when a crawl runs, then the connector uses the REST API to crawl all sub-pages from that root.
- AC-003-04: Given a website URL, when a crawl runs, then the connector scrapes pages and follows links from the root URL.
- AC-003-05: Given a Google Docs link, when a crawl runs, then the connector uses the Drive API for folder-level crawl.
- AC-003-06: Given a shared folder path, when a crawl runs, then the connector walks the filesystem.
- AC-003-07: Given any connector, then it produces normalised content chunks with metadata (source_type, URL, last_modified).

### FR-004: Incremental Refresh via CI/CD — Must Have
**Confidence**: High

- AC-004-01: Given the knowledge service is running, then it exposes `POST /api/refresh` for refresh triggers.
- AC-004-02: Given a GitHub Actions workflow, when it calls the refresh endpoint after a push with repo ID and changed paths, then the service processes the refresh.
- AC-004-03: Given a Jenkins post-build step for SVN, when it calls the refresh endpoint, then the service processes the refresh.
- AC-004-04: Given a refresh trigger, when the service processes it, then it re-embeds only changed files plus their correlated sources.
- AC-004-05: Given an iSDLC workflow finalize, when it completes, then it pushes the current issue's artifacts to the service via `add_content`.

### FR-005: Full Rebuild — Must Have
**Confidence**: High

- AC-005-01: Given the web UI, when the team lead triggers a full rebuild for a project, then the rebuild is queued.
- AC-005-02: Given a full rebuild job, when it runs, then it re-crawls all sources and re-generates all embeddings for that project.
- AC-005-03: Given a rebuild in progress, then the status (progress, errors, completion) is visible in the web UI.

### FR-006: Developer Query Scope — Must Have
**Confidence**: High

- AC-006-01: Given a developer, when they configure project names in `.isdlc/config.json` under `knowledge.projects`, then those projects define their search scope.
- AC-006-02: Given configured projects, when the developer runs a semantic search, then results are scoped to those projects only.
- AC-006-03: Given search results, then each result is tagged by its source project.
- AC-006-04: Given multiple configured projects, when a search runs, then it searches across all project indexes and merges results.

### FR-007: Web UI (Admin Dashboard) — Must Have
**Confidence**: High

- AC-007-01: Given the knowledge service is running, then a simple HTML dashboard is served by the same process as the MCP server.
- AC-007-02: Given the web UI, then it supports project CRUD (create, edit, delete).
- AC-007-03: Given a project in the web UI, then sources can be added, removed, and edited.
- AC-007-04: Given a project in the web UI, then a full rebuild can be triggered.
- AC-007-05: Given a project, then the refresh history shows each event with timestamp, type (full/incremental), trigger source, duration, documents processed, and status.
- AC-007-06: Given the web UI, then embedding status and health is visible per project.
- AC-007-07: Given the web UI, then the content included in the last full build is viewable.

### FR-008: MCP Interface — Must Have
**Confidence**: High

- AC-008-01: Given a developer query, when `semantic_search({ query, projects })` is called, then results are returned from the specified project indexes.
- AC-008-02: Given content to index, when `add_content({ content, project })` is called, then an embedding job is queued for that project.
- AC-008-03: Given a `list_projects()` call, then all available projects are returned.
- AC-008-04: Given a `list_modules({ project })` call, then all indexed sources within that project are returned.

### FR-009: Embedding Configuration (per-project) — Must Have
**Confidence**: High

- AC-009-01: Given a project, when the team lead configures it, then they can select the embedding source — local model (choose model + precision) or cloud API (choose provider + enter API key).
- AC-009-02: Given a local model selection, then the team lead can choose FP4, FP16, or FP32 precision with guidance on the accuracy/performance/memory tradeoff.
- AC-009-03: Given a cloud API selection, then the team lead can choose provider (OpenAI, Cohere, Amazon Bedrock) and enter API key/credentials.
- AC-009-04: Given a project, then the team lead can select the Vector DB backend — local (SQLite-vec, Qdrant, ChromaDB, Milvus, Weaviate, FAISS) or remote (Amazon OpenSearch, Pinecone, Qdrant Cloud, Weaviate Cloud, Milvus Cloud/Zilliz).
- AC-009-05: Given a model or precision change for a project, when saved, then a full rebuild is triggered for that project only.
- AC-009-06: Given the install script, when it runs, then it pre-downloads all available local models so they're ready for selection.

### FR-010: Installation (npm package) — Must Have
**Confidence**: High

- AC-010-01: Given the knowledge service, then it is published as npm package `isdlc-knowledge-service`, installable via `npm install -g`.
- AC-010-02: Given installation, when `isdlc-knowledge setup` runs, then an interactive cross-platform wizard configures the service.
- AC-010-03: Given local model selection during setup, then the wizard downloads models via HTTP.
- AC-010-04: Given Vector DB selection during setup, then the wizard installs local packages or validates remote connectivity.
- AC-010-05: Given setup completion, when `isdlc-knowledge start` runs, then API + Worker processes launch.
- AC-010-06: Given a running service, then a health check confirms model loaded, Vector DB accessible, MCP endpoint responding.
- AC-010-07: Given the CLI, then it works on Windows, Linux, and macOS without platform-specific scripts.

### FR-011: Model Memory Management — Must Have
**Confidence**: High

- AC-011-01: Given the web UI, when the team lead pins a local model, then it stays loaded in memory at all times.
- AC-011-02: Given unpinned models, then they are lazy-loaded on demand with LRU eviction.
- AC-011-03: Given the web UI monitoring tab, then it shows which models are currently loaded, their memory footprint, and pin status.
- AC-011-04: Given the web UI, then it shows total server memory usage vs available for informed pinning decisions.
- AC-011-05: Given the web UI, then it clearly distinguishes local model vs cloud API projects in the model management view.

### FR-012: Standalone Installation — Must Have
**Confidence**: High

- AC-012-01: Given the knowledge service, then it can be installed and used without iSDLC.
- AC-012-02: Given standalone installation, when setup completes, then the script displays refresh integration guidance — how to wire CI/CD triggers manually.
- AC-012-03: Given standalone usage, then the web UI and MCP interface are fully functional without iSDLC.

### FR-013: iSDLC Install Integration — Must Have
**Confidence**: High

- AC-013-01: Given iSDLC installation, when the user provides a knowledge service URL, then `.mcp.json` is configured to point at it.
- AC-013-02: Given a knowledge service URL is provided, then iSDLC does not install local embedding pipeline components.
- AC-013-03: Given no knowledge service URL is provided, then iSDLC falls back to local embedding mode (solo dev).
- AC-013-04: Given an iSDLC workflow finalize, then the finalize step sends artifacts to the configured knowledge service endpoint.

### FR-014: Audit Logging — Must Have
**Confidence**: High

- AC-014-01: Given any admin action via web UI, then it is logged with timestamp, action type, and details.
- AC-014-02: Given any CI/CD refresh trigger, then it is logged with repo ID and change count.
- AC-014-03: Given the web UI audit log tab, then the log is viewable with search and filter.
- AC-014-04: Given the audit log storage, then entries are append-only and cannot be modified or deleted via the UI.
- AC-014-05: Given the audit log file, then it rotates when it exceeds a configurable size limit.

### FR-015: Operational Monitoring — Must Have
**Confidence**: High

- AC-015-01: Given the knowledge service, then it exposes a Prometheus-compatible `/metrics` endpoint with job queue depth, success/failure counts, document counts, staleness age, model memory, throughput, and API latency.
- AC-015-02: Given the service processes, then they emit structured JSON logs to stdout.
- AC-015-03: Given OpenTelemetry configuration, then the service supports OTLP export for traces and metrics.
- AC-015-04: Given the CLI, then `isdlc-knowledge logs` streams stdout logs for local debugging.
- AC-015-05: Given per-project sources, then staleness is detected by comparing last indexed revision vs current source state (green/amber/red badges).
- AC-015-06: Given the web UI monitoring tab, then it shows per-project status cards with staleness badges, document counts, last refresh, active jobs, and model memory.
- AC-015-07: Given external monitoring tools, then `GET /api/system/health` returns structured health status.
- AC-015-08: Given a project, then `GET /api/projects/:id/status` returns staleness, document count, last refresh, and active jobs.

### FR-016: iSDLC Status Line Integration — Should Have
**Confidence**: Medium

- AC-016-01: Given iSDLC connected to a knowledge service, then the status line shows connection status, active project count, and staleness summary.
- AC-016-02: Given the status line, then data is fetched from the `/metrics` endpoint — lightweight, cached, polled periodically.

## 7. Out of Scope

| Item | Reason | Dependency |
|---|---|---|
| Solo developer local mode as part of this service | Current local pipeline stays in iSDLC | None |
| Access control between teams/projects | Can be added later when org-scale adoption requires it | FR-001 |
| Multi-server fan-out / MCP aggregation layer | Single server per org is sufficient for v1 | None |
| Jira connector | iSDLC analysis artifacts in the repo are sufficient | FR-003 |
| Fixed project groups | Developers pick projects ad-hoc | FR-006 |
| Cross-project relationship correlation | Correlation is within a project only for v1 | FR-002 |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|---|---|---|---|
| FR-001 | Project Management | Must Have | Core data model |
| FR-002 | Relationship-Aware Embedding | Must Have | Without it value is minimal |
| FR-003 (Git, SVN, Confluence) | Source Connectors (primary) | Must Have | Primary source types |
| FR-003 (Website, GDocs, Folder) | Source Connectors (secondary) | Should Have | Can be added incrementally |
| FR-004 | Incremental Refresh | Must Have | Keeps index fresh |
| FR-005 | Full Rebuild | Must Have | Required when sources change |
| FR-006 | Developer Query Scope | Must Have | Core developer experience |
| FR-007 | Web UI | Must Have | Admin interface |
| FR-008 | MCP Interface | Must Have | Integration contract |
| FR-009 | Embedding Configuration | Must Have | Per-project flexibility |
| FR-010 | Installation | Must Have | First-time setup |
| FR-011 | Model Memory Management | Must Have | Resource efficiency |
| FR-012 | Standalone Installation | Must Have | Usable without iSDLC |
| FR-013 | iSDLC Install Integration | Must Have | Primary integration path |
| FR-014 | Audit Logging | Must Have | Accountability |
| FR-015 | Operational Monitoring | Must Have | Observability |
| FR-016 | iSDLC Status Line | Should Have | Nice-to-have integration |

## Pending Sections

(none — all sections complete)
