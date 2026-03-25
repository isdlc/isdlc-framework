# Architecture Overview: Execution Observability

**ID**: REQ-0068
**Status**: Re-analyzed (multi-provider update)
**Re-analysis date**: 2026-03-24
**Reason**: Original architecture assumed Claude-only orchestration via isdlc.md. Now must work across the ProviderRuntime interface (Claude, Codex, Antigravity).

---

## 1. Architecture Options

### Option A: Embedded dashboard in CLI output only (no browser)
- **Summary**: Enrich CLI output with timing, sub-agents, hook events. No browser visualization.
- **Pros**: Simple, zero infrastructure, no server to manage
- **Cons**: No visual DAG, limited for complex workflows, can't share with non-CLI users
- **Pattern alignment**: Follows current CLI-only pattern
- **Verdict**: Eliminated -- user specifically requested browser visualization with DAG

### Option B: Local HTTP server with single-file SPA + enriched CLI (provider-neutral)
- **Summary**: Node.js HTTP server serves a self-contained HTML file. Browser polls state.json via API. CLI output enriched independently. All data written by provider-neutral orchestrators, not by provider adapters.
- **Pros**: Zero dependencies, works offline, self-contained, fast to serve, cross-platform, provider-agnostic
- **Cons**: Hand-rolled SVG layout is more work, no component framework for UI
- **Pattern alignment**: Extends existing bin/isdlc.js CLI, uses existing state.json as data bus, follows established provider-neutral-core + provider-adapter pattern
- **Verdict**: Selected (unchanged from original, but with explicit provider-neutrality requirement)

### Option C: Electron app or React dev server
- **Summary**: Full frontend framework with build tooling
- **Pros**: Rich UI, component reuse, easier to build complex interactions
- **Cons**: Introduces build pipeline, npm dependencies, not self-contained, heavy for a dev tool dashboard
- **Pattern alignment**: Breaks zero-dependency constraint
- **Verdict**: Eliminated -- over-engineered for the requirement

---

## 2. Selected Architecture (ADRs)

### ADR-001: Dashboard server architecture
- **Status**: Accepted (updated for multi-provider)
- **Context**: Need a way to serve the browser visualization. Options: built-in Node.js HTTP, Express, Fastify, or static file serving
- **Decision**: Lightweight HTTP server using Node.js built-in `http` module. Entry point: `bin/isdlc.js dashboard`. Auto-started by the CLI wrapper (not by isdlc.md, which is Claude-specific) when `live_dashboard: true`.
- **Rationale**: Zero dependencies, Node 20+ already required. Serves a single HTML file. Three API endpoints suffice. The CLI wrapper (`bin/isdlc.js`) is provider-neutral -- it works regardless of whether Claude, Codex, or Antigravity is the active provider.
- **Consequences**: No WebSocket -- browser polls `/api/state` at 2s intervals. Server auto-stops after workflow finalize (if auto-started). Port 3456 with fallback to 3457-3460. Binds to 127.0.0.1 only.

### ADR-002: Sub-agent topology as declarative config
- **Status**: Accepted (unchanged)
- **Context**: Need to know which sub-agents exist per phase and their dependency relationships for DAG rendering
- **Decision**: Define phase sub-agent topologies in `src/claude/hooks/config/phase-topology.json`. Each phase declares its agent nodes, edges (dependencies), and parallelism.
- **Rationale**: Topologies are static and known from agent definitions. Declarative config means visualization doesn't parse agent files. Easy to extend. Provider-neutral because topology describes logical structure, not execution mechanism.
- **Consequences**: New sub-agents or phases require a config update. Phases not in the config render as single nodes. The file is read by the dashboard server and included in the `/api/state` response.

### ADR-003: State tracking extensions (provider-neutral write path)
- **Status**: Accepted (updated for multi-provider)
- **Context**: Existing state.json captures timing and phase status but lacks sub-agent execution, hook events, and artifact tracking. Multiple providers now write phase results.
- **Decision**: Add three new append-only arrays to `active_workflow` in state.json: `sub_agent_log[]`, `hook_events[]`, `artifacts_produced[]`. Add `provider` field to `phase_snapshots` entries. All writes go through `writeState()` in `common.cjs` or the core state bridge -- never from provider adapter code.
- **Rationale**: Extends existing patterns (like `skill_usage_log[]`). Minimal schema change. Append-only is safe for sequential writes. Provider adapters return `TaskResult` to the orchestrator; the orchestrator writes state. This preserves the existing separation where adapters are pure execution engines and state management is centralized.
- **Write path**: `phase-loop.js` (or `fan-out.js`, `dual-track.js`) calls `runtime.executeTask()` -> gets `TaskResult` -> writes `sub_agent_log` entry via state bridge -> writes `phase_snapshots` entry with provider field.
- **Consequences**: Hooks need minor updates to call `appendHookEvent()`. Orchestrators write `sub_agent_log` entries around runtime calls. Historical workflows without these arrays degrade gracefully to phase-level views.

### ADR-004: Visualization rendering -- single-file SPA
- **Status**: Accepted (unchanged)
- **Context**: Need to render a DAG in the browser without external dependencies
- **Decision**: Single HTML file (`src/dashboard/index.html`) with embedded JS and CSS. SVG-based DAG rendering with hand-rolled topological layout.
- **Rationale**: Zero-dependency requirement. Max ~15 nodes per workflow is manageable without a graph library. Self-contained file is serveable from any HTTP server.
- **Alternatives considered**: ReactFlow (needs build), D3.js via CDN (violates offline), Mermaid (static only)
- **Consequences**: More upfront layout code. If DAGs exceed 20 nodes, consider embedding dagre.js (13KB).

### ADR-005: Enriched CLI output -- provider-neutral emission
- **Status**: Accepted (updated for multi-provider)
- **Context**: Need to show richer output in the terminal during workflows. On Claude, isdlc.md controls output. On Codex, the adapter runner controls output. Both consume the same state data.
- **Decision**: Enriched CLI output is driven by a shared formatting module (`src/core/observability/cli-formatter.js`) that reads state.json and emits formatted strings. Claude's isdlc.md calls it via bridge. Codex's adapter runner calls it directly. `display_level` is read from CLAUDE.md's `## Observability` section (or from provider-specific config if extended later).
- **Rationale**: Shared formatter ensures identical output across providers. The formatting logic is pure (input state, output string) and testable independently. Follows the established core-ESM + CJS-bridge pattern.
- **Consequences**: CLAUDE.md parsed once at workflow start. Changes mid-workflow require restart. Default is `standard` when section missing. If a provider has no equivalent config surface (e.g., Codex), the CLI wrapper reads CLAUDE.md as fallback.

### ADR-006: Provider attribution in phase snapshots (new)
- **Status**: Accepted
- **Context**: With multiple providers, users need to know which provider executed each phase for debugging and cost analysis.
- **Decision**: Add a `provider` field to each `phase_snapshots` entry in `workflow_history`. The provider-neutral `phase-loop.js` orchestrator writes this field based on the runtime it received. The value comes from provider routing (`src/core/providers/routing.js`).
- **Rationale**: Provider routing already determines which provider runs each phase. Capturing this decision in the snapshot is a single-field addition. No new module needed.
- **Consequences**: Historical entries without this field show "unknown". The field is informational -- no logic branches on it. Dashboard UI shows provider badges per phase node.

### ADR-007: Observability data collection at orchestrator layer (new)
- **Status**: Accepted
- **Context**: In the multi-provider architecture, provider adapters are thin execution engines. Where should observability data be collected?
- **Decision**: All observability data (sub_agent_log, hook_events, artifacts_produced, provider attribution) is collected at the orchestrator layer (`src/core/orchestration/`) via callback hooks (`onPhaseStart`, `onPhaseComplete`, `onError`). Provider adapters MUST NOT write directly to state.json.
- **Rationale**: Maintains the clean separation between execution (providers) and state management (core). The `onPhaseStart`/`onPhaseComplete` callbacks in `phase-loop.js` already exist and are the natural extension point. Adding observability data to these callbacks requires no new interfaces.
- **Consequences**: Codex adapter does not need modification. Claude adapter does not need modification. Only the orchestrator callbacks and the state-writing code need updates.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| Node.js `http` module | Built-in | Zero dependencies, sufficient for 3 endpoints | Express (rejected: dependency), Fastify (rejected: dependency) |
| SVG (inline in HTML) | N/A | Declarative, scriptable, no canvas complexity | Canvas (rejected: harder to make interactive), WebGL (rejected: overkill) |
| `fs.readFileSync` | Built-in | Simple state.json reads on each API request | `fs.watch` (rejected: unreliable cross-platform), chokidar (rejected: dependency) |
| JSON polling | N/A | Browser fetches `/api/state` on interval | WebSocket (rejected: more server complexity), SSE (rejected: overkill for 2s updates) |
| Core ESM + CJS bridge | Established pattern | CLI formatter in ESM, bridge for CJS consumers | CJS-only (rejected: breaks module consistency per Article XIII) |

---

## 4. Integration Architecture

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| I1 | Phase-Loop Orchestrator | state.json | Write (via state bridge / writeState) | JSON -- sub_agent_log, timing, provider | Fail-open: log warning, continue workflow |
| I2 | Fan-Out Orchestrator | state.json | Write (via state bridge) | JSON -- parallel sub_agent_log entries | Fail-open: collect whatever results are available |
| I3 | Hooks (Claude-only) | state.json | Write (atomic via appendHookEvent) | JSON -- hook_events entry | Fail-open: hook continues if write fails |
| I4 | Codex governance checks | state.json | Write (via adapter runner post-check) | JSON -- hook_events entry (normalized) | Fail-open: governance continues if write fails |
| I5 | Dashboard server | state.json | Read (fs.readFileSync) | Full JSON | Return cached last-good state on read error |
| I6 | Dashboard server | phase-topology.json | Read (once at startup) | JSON -- nodes, edges per phase | Fallback: single node per phase |
| I7 | Dashboard server | Browser | HTTP GET /api/state | JSON response | 500 with error message |
| I8 | Browser | Dashboard server | HTTP polling (2s active, 10s historical) | GET request | Retry on failure, show "reconnecting..." |
| I9 | CLAUDE.md | CLI Formatter | Read (parse ## Observability) | Key-value text | Default to standard on parse failure |
| I10 | bin/isdlc.js | Dashboard server | Child process spawn | Port number on stdout | Try next port on EADDRINUSE |
| I11 | Provider routing | Phase snapshots | Read (selectProvider result) | Provider name string | Default to "unknown" |
| I12 | CLI Formatter | isdlc.md (Claude) | CJS bridge call | Formatted string | Fail-open: return empty string |
| I13 | CLI Formatter | Codex adapter runner | Direct ESM import | Formatted string | Fail-open: return empty string |

---

## 5. Layered Architecture Diagram

```
+---------------------------------------------------------------+
|  Presentation Layer                                            |
|  +-------------------+  +----------------------------------+  |
|  | CLI Formatter     |  | Dashboard SPA (index.html)       |  |
|  | (cli-formatter.js)|  | SVG DAG + polling                |  |
|  +--------+----------+  +--------+-------------------------+  |
|           |                       |                            |
+---------------------------------------------------------------+
|  API Layer                                                     |
|  +-------------------------------------------+                 |
|  | Dashboard Server (server.js)               |                 |
|  | GET /api/state, /api/history, /api/history/:id             |
|  +-------------------------------------------+                 |
|           |                                                    |
+---------------------------------------------------------------+
|  Data Layer (state.json)                                       |
|  +-------------------------------------------+                 |
|  | active_workflow.sub_agent_log[]            |                 |
|  | active_workflow.hook_events[]              |                 |
|  | active_workflow.artifacts_produced[]        |                 |
|  | phase_snapshots[].provider                  |                 |
|  | workflow_history[]                          |                 |
|  +-------------------------------------------+                 |
|           ^                                                    |
+---------------------------------------------------------------+
|  Orchestration Layer (provider-neutral)                        |
|  +------------------+  +-------------+  +-----------------+   |
|  | phase-loop.js    |  | fan-out.js  |  | dual-track.js   |   |
|  | onPhaseComplete  |  | onComplete  |  | onTrackComplete |   |
|  +--------+---------+  +------+------+  +--------+--------+   |
|           |                   |                   |            |
+---------------------------------------------------------------+
|  Provider Runtime Layer                                        |
|  +-------------+  +------------+  +------------------+         |
|  | Claude      |  | Codex      |  | Antigravity      |         |
|  | runtime.js  |  | runtime.js |  | runtime.js (TBD) |         |
|  +-------------+  +------------+  +------------------+         |
+---------------------------------------------------------------+
```

The critical design constraint: observability data flows **up** from the orchestration layer, never **across** from provider adapters. Provider adapters return `TaskResult` to the orchestrator; the orchestrator writes observability data to state.json.

---

## 6. Summary

| Decision | Choice | Risk Level |
|----------|--------|------------|
| Server architecture | Node.js built-in HTTP, 127.0.0.1:3456 | Low |
| Visualization | Single-file SPA, SVG DAG, no dependencies | Low |
| Data tracking | 3 new arrays + provider field in state.json | Low |
| Sub-agent topology | Declarative JSON config | Low |
| CLI enrichment | Shared ESM formatter, bridged to CJS consumers | Low |
| Polling model | 2s active, 10s historical | Low |
| Provider neutrality | All writes at orchestrator layer via callbacks | Low |
| Provider attribution | Single `provider` field in phase_snapshots | Low |
| Overall risk | Low -- builds on existing infrastructure and patterns | |

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
| A11 | Provider adapters never write to state.json directly | Adapter authors add state writes | validateProviderRuntime() only checks interface methods; document constraint clearly in provider-runtime.js |
| A12 | onPhaseStart/onPhaseComplete callbacks in phase-loop.js are the correct extension point | Callbacks don't have enough context | Extend callback signature to include provider name and timing data |
| A13 | CLAUDE.md is readable regardless of active provider | Codex projects may not have CLAUDE.md | Fall back to `display_level: standard` when CLAUDE.md is absent |
