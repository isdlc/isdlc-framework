# ADR-0001: Debate Loop Generalization Approach

## Status

Accepted

## Context

The orchestrator's Section 7.5 ("DEBATE LOOP ORCHESTRATION (Phase 01 Only)") currently hardcodes Phase 01 agent names (`01-requirements-analyst.md`, `01-requirements-critic.md`, `01-requirements-refiner.md`). REQ-0015 requires extending debate support to Phase 03 (Architecture). We must decide how to structure the orchestrator to support multiple debate-enabled phases.

**Requirements driving this decision:**
- FR-003 (AC-003-05): Section header must be generalized from "Phase 01 Only"
- FR-005: Phase-specific agent routing
- NFR-003: Zero regression on existing 90 debate tests

## Decision

Use a **single routing table** within the existing Section 7.5 to map each debate-enabled phase to its Creator/Critic/Refiner agents. The debate loop pseudocode remains in one place; only the agent selection changes based on `current_phase`.

**The routing table:**

```
DEBATE_ROUTING = {
  "01-requirements": {
    "creator":  "01-requirements-analyst.md",
    "critic":   "01-requirements-critic.md",
    "refiner":  "01-requirements-refiner.md",
    "artifacts": ["requirements-spec.md", "user-stories.json", "nfr-matrix.md", "traceability-matrix.csv"],
    "critical_artifact": "requirements-spec.md"
  },
  "03-architecture": {
    "creator":  "02-solution-architect.md",
    "critic":   "02-architecture-critic.md",
    "refiner":  "02-architecture-refiner.md",
    "artifacts": ["architecture-overview.md", "tech-stack-decision.md", "database-design.md", "security-architecture.md"],
    "critical_artifact": "architecture-overview.md"
  }
}
```

## Consequences

**Positive:**
- Single debate loop implementation -- no logic duplication
- Adding a new phase requires only one routing table entry (extensibility)
- Phase 01 agent names remain unchanged (zero regression risk)
- Follows Article V (Simplicity First): one loop, one table, one convergence check

**Negative:**
- The routing table must be maintained alongside the pseudocode (minor editorial overhead)
- Phase-specific edge cases (e.g., Phase 03's `critical_artifact` differs from Phase 01) require parameterization

## Alternatives Considered

### Alternative A: Duplicate Section 7.5 Per Phase

Create separate sections: "7.5a: Phase 01 Debate" and "7.5b: Phase 03 Debate", each with hardcoded agent names.

**Rejected because:**
- Violates DRY principle -- the debate loop logic (resolve mode, initialize state, Creator delegation, Critic-Refiner loop, convergence check, post-loop finalization) is identical across phases
- Adding future phases requires duplicating ~160 lines each time
- Bug fixes to debate logic must be applied to every copy
- Violates Article V (unnecessary complexity)

### Alternative B: External Debate Orchestrator Sub-Agent

Create a new `debate-orchestrator.md` agent that manages the debate loop, invoked by the main orchestrator.

**Rejected because:**
- Adds an unnecessary layer of indirection (the orchestrator already manages phase delegation)
- The main orchestrator already reads state.json and manages phase transitions -- a sub-orchestrator would need the same context passed to it
- Was explicitly rejected in REQ-0014 for the same reasons (Article V)
- Would require designing inter-agent communication for debate state
