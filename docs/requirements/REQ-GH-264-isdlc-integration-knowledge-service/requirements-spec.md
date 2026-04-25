# Requirements Specification: iSDLC Integration with Knowledge Service (GH-264)

## 1. Business Context

Framework-side changes to connect iSDLC with the knowledge management service (GH-263). The knowledge service runs as a separate product in its own repo. iSDLC needs to: discover and connect to it, route semantic search queries to it, push artifacts after workflow completion, and show its status to the developer.

## 2. Functional Requirements

### FR-001: Install Script Integration — Must Have
**Confidence**: High

- AC-001-01: Given iSDLC install, when the user provides a knowledge service URL, then `.mcp.json` is configured to point the `isdlc-embedding` MCP tools at the remote endpoint.
- AC-001-02: Given a knowledge service URL is provided, then the install script skips downloading embedding models and setting up the local Vector DB.
- AC-001-03: Given no URL is provided, then the install script falls back to local embedding mode (current behavior preserved).
- AC-001-04: Given the install script, when configuring remote mode, then it validates connectivity to the knowledge service by calling `GET /api/system/health`.

### FR-002: Config Schema — Must Have
**Confidence**: High

- AC-002-01: Given `.isdlc/config.json`, then a `knowledge` namespace is supported with `{ url: string, projects: string[] }` fields.
- AC-002-02: Given the config-service, when `knowledge.url` is set, then all embedding operations route to the remote service.
- AC-002-03: Given the config, when `knowledge.projects` is set, then it is passed as the `projects` parameter on every `semantic_search` MCP call.

### FR-003: MCP Routing — Must Have
**Confidence**: High

- AC-003-01: Given `.mcp.json`, when `knowledge.url` is configured in `.isdlc/config.json`, then the `isdlc-embedding` MCP entry points at the remote URL instead of localhost.
- AC-003-02: Given a remote MCP endpoint, then `mcp__isdlc-embedding__isdlc_embedding_semantic_search` transparently routes to the knowledge service.
- AC-003-03: Given the semantic search tool, when called with the developer's configured projects, then the `projects` array is included in the MCP request.

### FR-004: Finalize Step — Must Have
**Confidence**: High

- AC-004-01: Given a workflow finalize, when a knowledge service is configured, then the finalize step calls `add_content` with the current issue's artifact folder contents.
- AC-004-02: Given the `add_content` call, then it includes the project ID from the knowledge service config.
- AC-004-03: Given the knowledge service is unreachable during finalize, then the step fails open (logs warning, continues finalize).

### FR-005: Discover Orchestrator — Must Have
**Confidence**: High

- AC-005-01: Given a remote knowledge service is configured, when `/discover` runs, then steps D7 (embedding generation) and D8 (embedding server startup) are skipped.
- AC-005-02: Given the skip, then a message is displayed: "Knowledge service configured at {url} — skipping local embedding setup."

### FR-006: Status Line — Should Have
**Confidence**: Medium

- AC-006-01: Given a remote knowledge service is configured, then the status line shows: connection status (connected/disconnected), active project count, staleness summary.
- AC-006-02: Given the status line, then data is fetched from the knowledge service's `/metrics` endpoint, cached locally, polled every 60 seconds.
- AC-006-03: Given the knowledge service is unreachable, then the status line shows "disconnected" without errors.

### FR-007: Session Cache — Should Have
**Confidence**: Medium

- AC-007-01: Given a remote knowledge service is configured, then `bin/rebuild-cache.js` includes knowledge service connection info in the `<!-- SECTION: EMBEDDING_STATUS -->` block.
- AC-007-02: Given the cache, then it shows: mode (remote/local), URL, project count, staleness summary.

## 3. Technical Context

**Interface contract**: All communication with the knowledge service is via MCP protocol. The MCP tools are:
- `isdlc_embedding_semantic_search({ query, projects })`
- `isdlc_embedding_add_content({ content, project })`
- `isdlc_embedding_list_modules({ project })`
- `isdlc_embedding_list_projects()`

**REST endpoint** used by status line only: `GET /metrics` (Prometheus format)

## 4. Out of Scope

- Building the knowledge service itself (GH-263, separate repo)
- Changes to the MCP tool interface (that's the knowledge service's contract)
- Multi-server fan-out (v1 is single server)
