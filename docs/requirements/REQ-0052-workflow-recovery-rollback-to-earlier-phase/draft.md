# Workflow recovery — rollback to earlier phase

## Context

Part of the [Hackability & Extensibility Roadmap](docs/isdlc/hackability-roadmap.md) — Tier 1 (Foundation), Layer 1 (Configure).

## Problem

Sometimes the problem isn't in the current phase — the requirements or architecture were wrong. The developer needs to go back to a specific earlier phase and redo from there, without losing the entire workflow.

## Design

New script: `src/antigravity/workflow-rollback.cjs`

- Takes `--to-phase <phase>` argument
- Resets `current_phase_index` to target phase
- Marks target phase as `in_progress`
- Marks all subsequent phases as `pending`
- Preserves artifacts on disk (agent can read and revise existing work)
- Requires explicit user confirmation (destructive to phase state)

State change:
```json
// Before: at phase 06, phases 01-05 completed
"current_phase": "06-implementation",
"current_phase_index": 5,
"phase_status": {
  "01-requirements": "completed",
  "02-impact-analysis": "completed",
  "05-test-strategy": "completed",
  "06-implementation": "in_progress"
}

// After: rollback --to-phase 02-impact-analysis
"current_phase": "02-impact-analysis",
"current_phase_index": 2,
"phase_status": {
  "01-requirements": "completed",
  "02-impact-analysis": "in_progress",
  "05-test-strategy": "pending",
  "06-implementation": "pending"
}
```

## Invisible UX

Developer says "go back to requirements" / "the architecture was wrong" → framework detects rollback intent → confirms with developer → resets to target phase.

## Depends on

- #98 (retry/redo — shares governance changes for G3b exception)

## Effort

Medium

**Labels**: enhancement, hackability