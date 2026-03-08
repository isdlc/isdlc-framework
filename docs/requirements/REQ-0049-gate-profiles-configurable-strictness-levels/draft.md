# Gate profiles — configurable strictness levels (rapid/standard/strict)

**Source**: GitHub #97
**Labels**: enhancement, hackability

## Context

Part of the [Hackability & Extensibility Roadmap](docs/isdlc/hackability-roadmap.md) — Tier 1 (Foundation), Layer 1 (Configure).

## Problem

iSDLC has a single strictness level for all gates. Every project, every workflow, every developer gets the same thresholds. A side project doesn't need 80% coverage. A fintech app might need 95%. There's no way to express this.

## Design

Named profiles that adjust gate strictness:

```json
"gate_profiles": {
  "rapid": {
    "description": "Minimal gates for simple changes or trusted developers",
    "min_coverage_percent": 60,
    "constitutional_validation": false,
    "interactive_elicitation": { "min_menu_interactions": 1 },
    "test_iteration": { "max_iterations": 3 }
  },
  "standard": {
    "description": "Default — balanced rigor for most work",
    "min_coverage_percent": 80
  },
  "strict": {
    "description": "Maximum rigor for critical/regulated code",
    "min_coverage_percent": 95,
    "require_mutation_testing": true
  }
}
```

- Per-project default in constitution or `.isdlc/config.json`
- Override per-workflow via natural language ("quick build" → rapid, default → standard, "this is critical" → strict)
- Profile selected at workflow start, applied to all gates
- Prerequisite for custom workflow definitions (a `spike` workflow needs `rapid` gates to be useful)

## Invisible UX

Developer says "quick build" → framework detects lightweight signal → selects `rapid` profile automatically. No flags or commands needed.

## Effort

Medium — config schema, gate-logic changes, profile resolution.
