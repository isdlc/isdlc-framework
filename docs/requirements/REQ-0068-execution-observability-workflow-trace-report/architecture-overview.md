# Architecture Overview: Execution Observability

**ID**: REQ-0068
**Status**: Analyzed

---

## 1. Architecture Options

### Option A: Embedded dashboard in CLI output only (no browser)
- **Summary**: Enrich CLI output with timing, sub-agents, hook events. No browser visualization.
- **Pros**: Simple, zero infrastructure, no server to manage
- **Cons**: No visual DAG, limited for complex workflows, can't share with non-CLI users
- **Pattern alignment**: Follows current CLI-only pattern
- **Verdict**: Eliminated — user specifically requested browser visualization with DAG

### Option B: Local HTTP server with single-file SPA + enriched CLI
- **Summary**: Node.js HTTP server serves a self-contained HTML file. Browser polls state.json via API. CLI output enriched independently.
- **Pros**: Zero dependencies, works offline, self-contained, fast to serve, cross-platform
- **Cons**: Hand-rolled SVG layout is more work, no component framework for UI
- **Pattern alignment**: Extends existing bin/isdlc.js CLI, uses existing state.json as data bus
- **Verdict**: Selected

### Option C: Electron app or React dev server
- **Summary**: Full frontend framework with build tooling
- **Pros**: Rich UI, component reuse, easier to build complex interactions
- **Cons**: Introduces build pipeline, npm dependencies, not self-contained, heavy for a dev tool dashboard
- **Pattern alignment**: Breaks zero-dependency constraint
- **Verdict**: Eliminated — over-engineered for the requirement

---

## 2. Selected Architecture (ADRs)

### ADR-001: Dashboard server architecture
- **Status**: Accepted
- **Context**: Need a way to serve the browser visualization. Options: built-in Node.js HTTP, Express, Fastify, or static file serving
- **Decision**: Lightweight HTTP server using Node.js built-in `http` module, started via `bin/isdlc.js dashboard` or auto-started by Phase-Loop Controller when `live_dashboard: true`
- **Rationale**: Zero dependencies, Node 20+ already required. Serves a single HTML file. Three API endpoints suffice.
- **Consequences**: No WebSocket — browser polls `/api/state` at 2s intervals. Server auto-stops after workflow finalize (if auto-started). Port 3456 with fallback to 3457-3460. Binds to 127.0.0.1 only.

### ADR-002: Sub-agent topology as declarative config
- **Status**: Accepted
- **Context**: Need to know which sub-agents exist per phase and their dependency relationships for DAG rendering
- **Decision**: Define phase sub-agent topologies in `src/claude/hooks/config/phase-topology.json`. Each phase declares its agent nodes, edges (dependencies), and parallelism.
- **Rationale**: Topologies are static and known from agent definitions. Declarative config means visualization doesn't parse agent files. Easy to extend.
- **Consequences**: New sub-agents or phases require a config update. Phases not in the config render as single nodes. The file is read by the dashboard server and included in the `/api/state` response.

### ADR-003: State tracking extensions
- **Status**: Accepted
- **Context**: Existing state.json captures timing and phase status but lacks sub-agent execution, hook events, and artifact tracking
- **Decision**: Add three new append-only arrays to `active_workflow` in state.json: `sub_agent_log[]`, `hook_events[]`, `artifacts_produced[]`. Snapshot to `workflow_history` at finalize.
- **Rationale**: Extends existing patterns (like `skill_usage_log[]`). Minimal schema change. Append-only is safe for concurrent hook writes.
- **Consequences**: Hooks need minor updates to call `appendHookEvent()`. Phase-Loop Controller writes `sub_agent_log` entries around Task delegations. Historical workflows without these arrays degrade gracefully to phase-level views.

### ADR-004: Visualization rendering — single-file SPA
- **Status**: Accepted
- **Context**: Need to render a DAG in the browser without external dependencies
- **Decision**: Single HTML file (`src/dashboard/index.html`) with embedded JS and CSS. SVG-based DAG rendering with hand-rolled topological layout.
- **Rationale**: Zero-dependency requirement. Max ~15 nodes per workflow is manageable without a graph library. Self-contained file is serveable from any HTTP server.
- **Alternatives considered**: ReactFlow (needs build), D3.js via CDN (violates offline), Mermaid (static only)
- **Consequences**: More upfront layout code. If DAGs exceed 20 nodes, consider embedding dagre.js (13KB).

### ADR-005: Enriched CLI output integration
- **Status**: Accepted
- **Context**: Need to show richer output in the terminal during workflows without changing the Phase-Loop Controller's core flow
- **Decision**: Extend STEP 3e/3f in the Phase-Loop Controller to emit formatted output based on `display_level` from CLAUDE.md's `## Observability` section.
- **Rationale**: Minimal blast radius — the controller already runs after every phase. Adding formatted output there is natural.
- **Consequences**: CLAUDE.md parsed once at workflow start. Changes mid-workflow require restart. Default is `standard` when section missing.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| Node.js `http` module | Built-in | Zero dependencies, sufficient for 3 endpoints | Express (rejected: dependency), Fastify (rejected: dependency) |
| SVG (inline in HTML) | N/A | Declarative, scriptable, no canvas complexity | Canvas (rejected: harder to make interactive), WebGL (rejected: overkill) |
| `fs.readFileSync` | Built-in | Simple state.json reads on each API request | `fs.watch` (rejected: unreliable cross-platform), chokidar (rejected: dependency) |
| JSON polling | N/A | Browser fetches `/api/state` on interval | WebSocket (rejected: more server complexity), SSE (rejected: overkill for 2s updates) |

---

## 4. Integration Architecture

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| I1 | Phase-Loop Controller | state.json | Write (atomic via writeState) | JSON — sub_agent_log, timing | Fail-open: log warning, continue workflow |
| I2 | Hooks | state.json | Write (atomic via appendHookEvent) | JSON — hook_events entry | Fail-open: hook continues if write fails |
| I3 | Dashboard server | state.json | Read (fs.readFileSync) | Full JSON | Return cached last-good state on read error |
| I4 | Dashboard server | phase-topology.json | Read (once at startup) | JSON — nodes, edges per phase | Fallback: single node per phase |
| I5 | Dashboard server | Browser | HTTP GET /api/state | JSON response | 500 with error message |
| I6 | Browser | Dashboard server | HTTP polling (2s active, 10s historical) | GET request | Retry on failure, show "reconnecting..." |
| I7 | CLAUDE.md | Phase-Loop Controller | Read (parse ## Observability) | Key-value text | Default to standard on parse failure |
| I8 | bin/isdlc.js | Dashboard server | Child process spawn | Port number on stdout | Try next port on EADDRINUSE |

---

## 5. Summary

| Decision | Choice | Risk Level |
|----------|--------|------------|
| Server architecture | Node.js built-in HTTP, 127.0.0.1:3456 | Low |
| Visualization | Single-file SPA, SVG DAG, no dependencies | Low |
| Data tracking | 3 new arrays in state.json active_workflow | Low |
| Sub-agent topology | Declarative JSON config | Low |
| CLI enrichment | Phase-Loop Controller STEP 3e/3f extension | Low |
| Polling model | 2s active, 10s historical | Low |
| Overall risk | Low — builds on existing infrastructure | |

---

## Architecture Assumptions

| # | Assumption | Risk if wrong | Mitigation |
|---|-----------|---------------|------------|
| A1 | DAG complexity stays under ~15 nodes per workflow | Layout breaks with overlapping nodes | Introduce dagre.js (13KB embeddable) as fallback |
| A2 | Polling state.json at 2s is fast enough to feel "live" | Missed phase transitions | Reduce to 500ms or switch to fs.watchFile + SSE |
| A3 | state.json is single-writer (sequential writes) | JSON corruption | Verify atomic writeState() in common.cjs |
| A4 | `open`/`xdg-open`/`start` works cross-platform for browser launch | Fails on headless/WSL/SSH | live_dashboard: false disables auto-open; log URL |
| A5 | Port 3456 is available | Port conflict | Fallback to 3457-3460 |
| A6 | No auth needed on localhost dashboard | Shared machine risk | Bind 127.0.0.1 only |
| A7 | Sub-agent topologies are static per phase | Custom workflows with dynamic agents | Unknown agents fall back to single-node |
| A8 | workflow_history entries preserve new arrays | Pruning strips data | Ensure pruning preserves sub_agent_log, hook_events, artifacts_produced |
| A9 | CLAUDE.md ## Observability parseable as key-value | Unexpected formatting | Fail-open with defaults |
| A10 | Single active workflow constraint holds | Parallel workflows need multi-view | Include workflow_id in all state for migration path |
