# Module Design: Execution Observability

**ID**: REQ-0068
**Status**: Analyzed

---

## Module 1: State Tracking Extensions

**Responsibility**: Capture sub-agent execution, hook events, and artifact creation during workflows

**Location**: `src/claude/hooks/lib/common.cjs` (extend existing)

**Public interface**:
```js
appendSubAgentLog(state, { parent_agent, agent, agent_id, phase, started_at, completed_at, status, tokens_used })
// Appends to state.active_workflow.sub_agent_log[]

appendHookEvent(state, { timestamp, hook, phase, action, reason, resolution })
// Appends to state.active_workflow.hook_events[]

appendArtifactProduced(state, { timestamp, phase, file_path, action })
// Appends to state.active_workflow.artifacts_produced[]

getSubAgentLog(state) → []
// Returns sub_agent_log array, empty array if missing

getHookEvents(state) → []
// Returns hook_events array, empty array if missing

getArtifactsProduced(state) → []
// Returns artifacts_produced array, empty array if missing
```

**Data structures**:
```
sub_agent_log entry:
  parent_agent: string    — e.g. "impact-analysis-orchestrator"
  agent: string           — e.g. "impact-analyzer"
  agent_id: string|null   — Task tool agent ID (for resume tracking)
  phase: string           — e.g. "02-impact-analysis"
  started_at: string      — ISO-8601
  completed_at: string|null
  status: string          — "running" | "completed" | "failed"
  tokens_used: number|null

hook_event entry:
  timestamp: string       — ISO-8601
  hook: string            — e.g. "gate-blocker"
  phase: string           — e.g. "06-implementation"
  action: string          — "blocked" | "warned" | "allowed"
  reason: string          — human-readable explanation
  resolution: string|null — "retry" | "skip" | "fixed" | null

artifact_produced entry:
  timestamp: string       — ISO-8601
  phase: string
  file_path: string       — relative to project root
  action: string          — "created" | "modified"
```

**Dependencies**: None new. Uses existing `writeState()`.

**Estimated size**: ~80 lines (6 functions, append-only logic, null-safe getters)

---

## Module 2: Phase Topology Config

**Responsibility**: Declare the sub-agent DAG structure for each phase

**Location**: `src/claude/hooks/config/phase-topology.json`

**Schema**:
```json
{
  "version": "1.0.0",
  "phases": {
    "{phase_key}": {
      "nodes": [
        { "id": "string", "agent": "string", "label": "string" }
      ],
      "edges": [
        { "from": "string", "to": "string" }
      ]
    }
  }
}
```

**Phase topologies**:

| Phase | Nodes | Edges (dependencies) |
|-------|-------|---------------------|
| `00-quick-scan` | QS (quick-scan-agent) | — |
| `01-requirements` | RA (requirements-analyst) | — |
| `01-requirements` (debate) | CR (creator), CK (critic), RF (refiner) | CR→CK→RF |
| `02-impact-analysis` | IA0 (orchestrator), M1, M2, M3 (parallel), M4 (verifier) | IA0→M1, IA0→M2, IA0→M3, M1→M4, M2→M4, M3→M4 |
| `02-tracing` | T0 (orchestrator), T1, T2, T3 (parallel) | T0→T1, T0→T2, T0→T3 |
| `03-architecture` | SA (solution-architect) | — |
| `03-architecture` (debate) | CR, CK, RF | CR→CK→RF |
| `04-design` | SD (system-designer) | — |
| `04-design` (debate) | CR, CK, RF | CR→CK→RF |
| `05-test-strategy` | TE (test-design-engineer) | — |
| `05-test-strategy` (debate) | CR, CK, RF | CR→CK→RF |
| `06-implementation` | SW (software-developer), IR (implementation-reviewer), IU (implementation-updater) | SW→IR→IU |
| `16-quality-loop` | QL (quality-loop-engineer) | — |
| `08-code-review` | QA (qa-engineer) | — |
| `15-upgrade-plan` | UE (upgrade-engineer) | — |
| `15-upgrade-execute` | UE (upgrade-engineer) | — |

**Dependencies**: None. Static JSON file.

**Estimated size**: ~150 lines of JSON

---

## Module 3: Enriched CLI Output

**Responsibility**: Emit richer phase completion output based on display_level

**Location**: `src/claude/commands/isdlc.md` (Phase-Loop Controller, STEP 3e/3f)

**Interface**: No function exports — behavioral changes to existing Phase-Loop Controller steps

**Behavior by display level**:

| Level | After each phase completes | Example output |
|-------|---------------------------|----------------|
| `minimal` | Current behavior — task list update only | `~~[2] Analyze impact (Phase 02)~~` |
| `standard` | Task update + timing + iterations + coverage | `~~[2] Analyze impact (Phase 02)~~ — 3m 12s, 1 iteration, 87% coverage` |
| `detailed` | Standard + sub-agent breakdown + hook events + artifacts | Standard line + indented sub-agent tree + hook event lines + artifact list |

**CLAUDE.md parsing**:
```
## Observability
display_level: standard
live_dashboard: false
```
- Parsed once at workflow start
- Uses same pattern as `## Issue Tracker Configuration`
- Missing section → `{ display_level: "standard", live_dashboard: false }`
- Invalid values → fall back to defaults

**Dependencies**: Reads state.json (existing), reads CLAUDE.md (new parse point)

**Estimated size**: ~60 lines of additions to isdlc.md

---

## Module 4: Dashboard Server

**Responsibility**: Serve the browser visualization and provide state API

**Location**: `src/dashboard/server.js`

**Public interface**:
```js
startDashboardServer(options) → { port, url, close() }
// options: { stateJsonPath, topologyPath, port?, autoStop? }
// Returns server info and close function

// CLI entry: bin/isdlc.js dashboard [--port N]
```

**Routes**:

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | `/` | `index.html` | Serves the SPA |
| GET | `/api/state` | JSON | Current state.json + topology merged |
| GET | `/api/history` | JSON | `workflow_history[]` array |
| GET | `/api/history/:id` | JSON | Single workflow by slug or source_id |

**`/api/state` response shape**:
```json
{
  "active_workflow": { "type", "current_phase", "phases", "phase_status", "sub_agent_log", "hook_events", "artifacts_produced", "budget_status", "timing" },
  "phases": { "{phase_key}": { "status", "timing", "summary" } },
  "topology": { "{phase_key}": { "nodes", "edges" } },
  "workflow_type": "feature|fix|upgrade|test-generate",
  "timestamp": "ISO-8601"
}
```

**Server lifecycle**:
- Auto-start: Phase-Loop Controller spawns as detached child process when `live_dashboard: true`
- Auto-stop: Server watches for `active_workflow` to become null, then exits after 30s grace period
- Manual start: `npx isdlc dashboard` — stays alive until Ctrl+C
- Port selection: Try 3456, fallback 3457-3460. Print chosen port to stdout.
- Bind: 127.0.0.1 only

**Error handling**:
- state.json read failure → return last-good cached response with `stale: true` flag
- Port in use → try next, max 5 attempts
- Server crash → workflow continues unaffected

**Dependencies**: Node.js `http`, `fs`, `path` (all built-in)

**Estimated size**: ~150 lines

---

## Module 5: Dashboard UI

**Responsibility**: Render interactive DAG visualization in the browser

**Location**: `src/dashboard/index.html`

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Header: workflow title, type badge, status, elapsed time │
├──────────────────────────────────────┬──────────────────┤
│                                      │                  │
│          DAG Visualization           │  Detail Panel    │
│                                      │                  │
│  ┌──────┐                            │  Phase: Impact   │
│  │ Reqs │                            │  Agent: M1       │
│  └──┬───┘                            │  Duration: 45s   │
│     │                                │  Iterations: 1   │
│  ┌──┴───┐                            │  Hook events: 0  │
│  │Impact│→ M1, M2, M3 → M4          │  Artifacts:      │
│  └──┬───┘                            │   - impact.md    │
│     │                                │  Tokens: 12,400  │
│  ┌──┴──┐                             │                  │
│  │Arch │                             │                  │
│  └──┬──┘                             │                  │
│    ...                               │                  │
│                                      │                  │
├──────────────────────────────────────┴──────────────────┤
│ Footer: poll status, server URL, workflow ID            │
└─────────────────────────────────────────────────────────┘
```

**DAG rendering (SVG)**:
- Topological sort of phases (vertical flow, top to bottom)
- Each phase is a group (`<g>`) containing:
  - Phase header bar (label, status color)
  - Sub-agent nodes within the phase (horizontal layout for parallel, vertical for sequential)
- Edges between phases: vertical SVG paths with arrowheads
- Edges within phases (sub-agent dependencies): horizontal/diagonal paths

**Node styling**:
```
pending:   fill: #374151 (grey), stroke: #6B7280
running:   fill: #1E40AF (blue), stroke: #3B82F6, pulse animation
completed: fill: #065F46 (green), stroke: #10B981
failed:    fill: #991B1B (red), stroke: #EF4444
skipped:   fill: #374151 (grey), stroke: #6B7280, opacity: 0.5, strikethrough label
```

**Interaction**:
- Click node → right panel shows detail (timing, iterations, hook events, artifacts, tokens)
- Hover node → tooltip with agent name and status
- Auto-scroll to currently running node during live view

**Polling**:
```js
const POLL_ACTIVE = 2000;   // 2s during active workflow
const POLL_HISTORY = 10000; // 10s for historical view

async function poll() {
  const res = await fetch('/api/state');
  const data = await res.json();
  updateDAG(data);
  const interval = data.active_workflow ? POLL_ACTIVE : POLL_HISTORY;
  setTimeout(poll, interval);
}
```

**Dependencies**: None — vanilla JS, SVG, CSS embedded in single HTML file

**Estimated size**: ~500-700 lines (HTML + CSS + JS)

---

## Module 6: Status Command

**Responsibility**: Handle `/isdlc status` with -inline and -visual flags

**Location**: `src/claude/commands/isdlc.md` (new status handler section)

**Interface**:
```
/isdlc status                        → summary of recent workflows (last 5)
/isdlc status -inline {id}           → structured CLI report for specific workflow
/isdlc status -visual {id}           → open browser dashboard for specific workflow
/isdlc status -inline last           → most recent workflow
/isdlc status -visual                → current active workflow (if any)
```

**Identifier resolution**: Uses `resolveItem()` from `three-verb-utils.cjs` for slug/GitHub/Jira resolution, then matches against `workflow_history[].id` or `workflow_history[].source_id`

**Inline report format** (standard display_level):
```
WORKFLOW TRACE: REQ-0066 (feature)
Status: completed | Duration: 55m | Coverage: 91.35%
Branch: feature/REQ-0066-team-continuity-memory

Phase Timeline:
  [done] 05-test-strategy    9m   1 iter   —
  [done] 06-implementation  28m   3 iter   91.35% coverage
  [done] 16-quality-loop     8m   1 iter   all passing
  [done] 08-code-review      4m   1 iter   APPROVED (0 critical)

Sub-Agent Activity:
  06-implementation:
    software-developer     24m  completed
    implementation-reviewer 2m  completed
    implementation-updater  2m  completed

Hook Events: 2
  gate-blocker blocked 06-implementation: test coverage below 80% → fixed
  test-watcher circuit-break 06-implementation: 3 identical failures → resolved

Artifacts Produced: 12 files
  docs/requirements/REQ-0066/test-strategy.md (created)
  lib/memory.js (created)
  tests/lib/memory.test.js (created)
  ...
```

**Dependencies**: `resolveItem()` from three-verb-utils.cjs, state.json read, dashboard server module (for -visual)

**Estimated size**: ~120 lines of additions to isdlc.md

---

## Dependency Map

```
Module 1 (State Tracking)
  ↓ writes data
Module 4 (Dashboard Server) ← reads → state.json
  ↓ serves
Module 5 (Dashboard UI) ← reads → phase-topology.json (Module 2)

Module 3 (Enriched CLI) ← reads → state.json (written by Module 1)
                        ← reads → CLAUDE.md (## Observability)

Module 6 (Status Command) ← reads → state.json / workflow_history
                          ← uses → Module 4 (for -visual mode)
                          ← uses → resolveItem() (existing)
```

No circular dependencies. Module 1 (state tracking) is the foundation — all other modules consume its data.

---

## Implementation Order

| Order | Module | Rationale | Depends On |
|-------|--------|-----------|------------|
| 1 | Module 2: Phase Topology Config | Static JSON, no code dependencies | — |
| 2 | Module 1: State Tracking Extensions | Data foundation for everything else | — |
| 3 | Module 3: Enriched CLI Output | Smallest user-visible change, validates data tracking | Module 1 |
| 4 | Module 4: Dashboard Server | Infrastructure for browser visualization | Module 1, Module 2 |
| 5 | Module 5: Dashboard UI | The primary visual deliverable | Module 4, Module 2 |
| 6 | Module 6: Status Command | Ties everything together | Module 1, Module 4, Module 5 |
