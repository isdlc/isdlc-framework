# Module Design: REQ-GH-253 — Context-Manager Hooks

**Source**: GitHub Issue #253
**Status**: Accepted (with amendments)
**Amendment Cycles**: 2

---

## Module Overview

### New Modules (src/core/roundtable/)

| Module | Type | Responsibility |
|---|---|---|
| state-machine.js | Core runtime | Load definition, track state/sub-task, evaluate transitions, emit events |
| definition-loader.js | Core loader | Load core + workflow-specific JSON, merge, validate against schema |
| state-card-composer.js | Composer | Compose outer affordance card for current user-facing state |
| task-card-composer.js | Composer | Compose inner affordance card for active background sub-task |
| rolling-state.js | State store | Structured in-memory state, updated by trailer + marker extractor |
| trailer-parser.js | Parser | Parse LLM structured trailer per schema |
| markers/ | Extractors | Pluggable per-sub-task modules parsing natural LLM output |

### New Definition Files (src/isdlc/config/roundtable/)

| File | Purpose |
|---|---|
| core.json | Shared invariants: rendering modes, persona model, AMENDING semantics, participation gate |
| analyze.json | Analyze state graph: CONVERSATION + PRESENTING_REQUIREMENTS/ARCHITECTURE/DESIGN/TASKS |
| bug-gather.json | Bug state graph: CONVERSATION + PRESENTING_BUG_SUMMARY/ROOT_CAUSE/FIX_STRATEGY/TASKS |
| state-cards/ | Per-state card templates |
| task-cards/ | Per-sub-task card templates |

### New Schema Files (src/core/roundtable/schemas/)

core.schema.json, workflow.schema.json, trailer.schema.json, rolling-state.schema.json, state-card.schema.json, task-card.schema.json

---

## Module Design

### state-machine.js

- Parse and validate composed definition at load time
- Hold immutable state graph; mutable cursor (currentState, activeSubTask) tracked separately
- evaluateTransitions(rollingState): check exit markers, apply transition rules (next, next_on_accept, next_on_amend), check sub-task completion markers and entry triggers
- External delegation support: optional external_delegation field on state transitions declares between-state delegation (agent name, input mapping, timeout, fail-open behavior)
- Emit transition events for observability (NFR-004)
- Exported API: initialize(definition, entryState), evaluateTransitions(rollingState), currentCard(), currentSubTask()

### definition-loader.js

- Load core.json (shipped) + user override; load {workflow}.json (shipped) + user override
- Merge: workflow inherits rendering modes, persona contracts, amendment semantics, participation gate from core; workflow defines state graph, templates, sub-task graphs, artifact sets, completion signal, tier rules
- Validate against workflow.schema.json; fail-open to prose protocol on schema violation
- Exported API: loadDefinition(workflowType, options)

### state-card-composer.js

- Load card template for current state via template-loader pattern (shipped + override)
- Merge template with runtime context: active personas, rendering mode, amendment_cycles, topic coverage, preferred tools
- Enforce output contract: all required fields present, max ~40 lines
- Exported API: composeStateCard(currentState, context)

### task-card-composer.js

- Receive active sub-task definition from state machine
- Query skill manifest bridge: filter by bindings.sub_tasks[] (or fallback to bindings.phases[]/bindings.agents[])
- Apply max_skills_total budget from .isdlc/config.json (user-configurable, default 8); single total, no per-source bucketing
- Filter order: priority-sorted from manifest; shipped skills get small boost
- Per-sub-task override possible via state machine definition (sub_tasks[X].max_skills_override)
- Render per delivery_type (context/instruction/reference) following SKILL INJECTION B/C pattern
- Add sub-task preferred tools and expected output shape
- Max ~30 lines
- Exported API: composeTaskCard(activeSubTask, manifestContext, config)

### rolling-state.js

- In-memory per-session (not persisted; meta.json remains persistent progress handle)
- Schema-driven fields: coverage_by_topic, scan_complete, scope_accepted, current_persona_rotation, rendering_mode, amendment_cycles, participation_markers, per-sub-task completion markers
- Merge updates from trailer + markers with trailer-wins conflict resolution (AC-003-03)
- Exported API: create(stateMachineDef), update(markers), snapshot()

### trailer-parser.js

- Trailer format: ---ROUNDTABLE-TRAILER--- / state: X / sub_task: Y / status: Z / version: 1 / ---END-TRAILER---
- Parse from end of LLM output; return null if absent or invalid (fail-safe)
- Strip trailer from user-visible output
- Exported API: parseTrailer(llmOutput, schema)

### markers/

- One file per sub-task type: scope-framing.markers.js, codebase-scan.markers.js, blast-radius.markers.js, options-research.markers.js, dependency-check.markers.js, tracing.markers.js
- Each exports extractMarkers(llmOutput) returning detected signals
- Rule-based only: regex + key phrases; no LLM calls, no network
- Index file (markers/index.js) dispatches to active sub-task's extractor

---

## Changes to Existing

- **src/claude/commands/isdlc.md** — analyze step 7 and bug-gather step 6.5d restructured: handler drives composition loop (compose cards, inject, parse output, update state, evaluate transitions). Fail-open fallback to prose protocol preserved.
- **src/claude/agents/roundtable-analyst.md** — audited per FR-007: bucket-1/2/3/5 content migrated or deleted; bucket-4 LLM-prose-needed content stays with rationale.
- **src/claude/agents/bug-roundtable-analyst.md** — same audit.
- **src/core/compliance/engine.cjs** — receives migrated bucket-2 validator rules.
- **src/core/config/config-service.js** — new getRoundtableConfig() getter.
- **src/core/bridge/config.cjs** — CJS bridge exposes getRoundtableConfig().
- **src/isdlc/config.schema.json** — new roundtable.task_card.max_skills_total field.
- **REQ-0022 skill manifest schema** — additive bindings.sub_tasks[] field (backward compatible).
- **src/core/skills/manifest-loader.js** — tolerates new additive field.
- **src/providers/claude/runtime.js** — receives composed card string (no API change).
- **src/providers/codex/runtime.js** — receives composed card string (no API change).

---

## Wiring Summary

### Per-Turn Data Flow

1. Handler reads definition + rolling state
2. State machine returns current card template ID + active sub-task ID
3. State card composer composes outer card; task card composer composes inner card
4. Provider adapter injects combined card string
5. LLM produces response + optional trailer
6. Trailer parser reads trailer; marker extractors parse natural output
7. Rolling state updates (trailer wins on conflict)
8. State machine evaluates transitions; fires state/sub-task changes

### Roundtable Startup

1. Handler calls definition-loader.loadDefinition(workflow_type)
2. Loader merges core.json + {workflow_type}.json, validates
3. State machine initializes to CONVERSATION; rolling state primed
4. State card composer composes entry card with personas, rendering mode, tools, initial sub-task
5. Maya opens; handler stops and waits

### State Card Cadence

- Conversation-phase entry: one full card; persists for the phase
- Confirmation sub-states: one fresh card per sub-state entry (includes full template)
- Documentation / finalization: one card describing batch-write contract
- Within long conversation phase: optional lightweight rolling header (2-3 lines) per exchange if empirical variance shows mid-stream drift; default is no per-turn refresh

### External Delegation (Bug-Gather Only)

1. User Accepts PRESENTING_BUG_SUMMARY
2. State machine finds external_delegation on outgoing transition
3. Handler dispatches tracing-orchestrator via Task tool
4. On success: feeds result into rolling state for PRESENTING_ROOT_CAUSE
5. On failure: fail-open; Alex presents conversation-based hypotheses

---

## Assumptions and Inferences

- Assumed: handler can be restructured without CJS bridge for initial build. Confidence: High.
- Inferred: rolling state can live in handler scope per-session. Confidence: Medium; edge case: session interruption.
- Validated: single core + two workflow definitions captures shared vs divergent structure cleanly. Confidence: High.
- Inferred: rule-based marker extraction scales to common sub-tasks. Confidence: Medium.
- Inferred: max_skills_total default of 8 is reasonable without per-source bucketing. Confidence: Low-Medium; empirically calibrated.
- Inferred: escape hatch for novel sub-tasks (generic task card without skill list) is sufficient for first build. Confidence: Medium.
