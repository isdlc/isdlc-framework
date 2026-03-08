# Workflow recovery — retry/redo current phase without restarting

## Context

Part of the [Hackability & Extensibility Roadmap](docs/isdlc/hackability-roadmap.md) — Tier 1 (Foundation), Layer 1 (Configure).

## Problem

When a phase produces wrong output (e.g., implementation is incorrect), the developer's only option is to cancel the entire workflow and start from scratch. All prior phase work — requirements gathering, impact analysis, test strategy — is wasted.

## Design

New script: `src/antigravity/workflow-retry.cjs`

- Reads `active_workflow.current_phase` from state.json
- Resets that phase's iteration state (test_iteration, constitutional_validation, interactive_elicitation)
- Adds `retry_count` field to track retries
- Bumps `state_version`
- Does NOT change `current_phase_index` — stays on the same phase
- Optionally reverts file changes from the current phase

State change:
```json
// Before
"phases": {
  "06-implementation": {
    "test_iteration": { "current_iteration": 7 },
    "constitutional_validation": { "iterations_used": 3 }
  }
}

// After redo
"phases": {
  "06-implementation": {
    "test_iteration": {},
    "constitutional_validation": {},
    "retry_count": 1
  }
}
```

Governance: G3b already has exception "supervised redo" — this implements it. `validate-state.cjs` must allow phase reset when `retry_count` is incremented.

## Invisible UX

Developer says "try again" / "that's wrong" / "redo this" → framework detects retry intent → resets current phase → re-reads phase agent → starts fresh with same upstream artifacts.

## Files to change

- `src/antigravity/workflow-retry.cjs` — **New**
- `src/antigravity/validate-state.cjs` — allow reset when retry flag set
- `src/claude/hooks/lib/gate-logic.cjs` — respect retry flag
- `ANTIGRAVITY.md` + template — add Retry intent to detection table

## Effort

Medium

**Labels**: enhancement, hackability