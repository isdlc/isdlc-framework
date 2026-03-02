# ADR-0002: Agent Routing Strategy

## Status

Accepted

## Context

The generalized debate engine (ADR-0001) needs a mechanism to determine which agents to delegate to based on the current phase. We must decide how the routing information is stored and accessed.

**Requirements driving this decision:**
- FR-005 (AC-005-01 through AC-005-04): Phase-specific agent routing
- NFR-002: Pattern consistency with REQ-0014

## Decision

Use a **phase-keyed lookup table** defined inline in the orchestrator's Section 7.5. The table maps `current_phase` values to Creator/Critic/Refiner agent filenames, the list of phase artifacts, and the critical artifact (the one that must exist for debate to proceed).

**Lookup logic:**

```
IF current_phase IN DEBATE_ROUTING:
  routing = DEBATE_ROUTING[current_phase]
  creator_agent = routing.creator
  critic_agent = routing.critic
  refiner_agent = routing.refiner
ELSE:
  // Phase does not support debate -- delegate to primary agent
  delegate to phase's standard agent (no DEBATE_CONTEXT)
```

**Why inline (not in a config file):**
- The routing table is small (2 entries for now, growing slowly)
- Keeping it in the orchestrator's markdown keeps all debate logic colocated
- No JSON config file parsing needed (Article V: Simplicity First)
- When the table grows to 4+ phases, extraction to a config file can be reconsidered

## Consequences

**Positive:**
- Simple, explicit mapping -- no indirection or lookup chains
- Each routing entry is self-documenting (creator, critic, refiner, artifacts, critical_artifact)
- Easy to verify: Phase 01 routing produces the exact same agents as the current hardcoded Section 7.5
- Phases not in the table gracefully fall through to single-agent mode

**Negative:**
- Adding a new phase requires editing the orchestrator file (acceptable for a slowly-growing table)
- The orchestrator file is already large (~1400 lines); adding a routing table adds ~20 lines (minimal)

## Alternatives Considered

### Alternative A: Config File (debate-routing.json or iteration-requirements.json)

Store routing configuration in a separate JSON file.

**Rejected because:**
- Adds file I/O at prompt interpretation time (the orchestrator is a markdown prompt, not runtime code)
- The orchestrator cannot "parse JSON" -- it follows markdown instructions. A routing table in its own markdown is more natural.
- Over-engineering for 2 entries (Article V)
- Could be revisited if debate expands to 5+ phases

### Alternative B: Convention-Based Routing

Derive agent names from phase number and role (e.g., `{phase_prefix}-{role}.md`).

**Rejected because:**
- Phase prefixes are not consistent (Phase 01 agents use prefix `01-`, Phase 03 agents use prefix `02-`). The prefix is the agent number, not the phase number.
- Convention-based routing would require a separate mapping from phase to agent prefix anyway
- Explicit is better than implicit (Article IV)
