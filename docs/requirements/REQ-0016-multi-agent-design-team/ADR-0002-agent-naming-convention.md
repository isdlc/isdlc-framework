# ADR-0002: Agent Naming Convention for Phase 04 Debate Agents

## Status

Accepted

## Context

New Critic and Refiner agents must be created for Phase 04 (Design). The iSDLC framework uses a numeric prefix convention for agent files. We must decide the prefix and naming for the new agents.

**Existing convention:**
- Phase 01 agents: `01-requirements-analyst.md`, `01-requirements-critic.md`, `01-requirements-refiner.md`
- Phase 03 agents: `02-solution-architect.md`, `02-architecture-critic.md`, `02-architecture-refiner.md`
- Phase 04 Creator: `03-system-designer.md` (existing)

**Requirements driving this decision:**
- AC-003-01: DEBATE_ROUTING must map to Critic `03-design-critic.md` and Refiner `03-design-refiner.md`
- NFR-002: Pattern consistency with REQ-0014 and REQ-0015

## Decision

Use the **`03-` prefix** for both new agents, matching the existing Creator (`03-system-designer.md`):
- `03-design-critic.md`
- `03-design-refiner.md`

The naming follows the pattern `{prefix}-{domain}-{role}.md` where:
- `{prefix}` = numeric prefix matching the Creator's prefix (`03-`)
- `{domain}` = the phase domain (`design`)
- `{role}` = the debate role (`critic` or `refiner`)

## Consequences

**Positive:**
- Consistent with Phase 01 pattern (`01-` prefix for all three agents)
- Consistent with Phase 03 pattern (`02-` prefix for all three agents)
- Agent files for the same debate team are co-located when sorted alphabetically
- Clear naming makes the agent's purpose obvious: `03-design-critic.md` = Phase 04 design critic

**Negative:**
- The `03-` prefix does not match the SDLC phase number (Phase 04). This is consistent with existing convention (Phase 01 agents use `01-`, Phase 03 agents use `02-`, Phase 04 agents use `03-`), but may be initially confusing to new contributors.

## Alternatives Considered

### Alternative A: Use `04-` Prefix

Name agents `04-design-critic.md` and `04-design-refiner.md` to match the SDLC phase number.

**Rejected because:**
- Breaks existing convention where prefix matches Creator, not phase number
- The Creator is `03-system-designer.md` (not `04-`)
- Would create inconsistency: Creator at `03-`, Critic/Refiner at `04-`
- REQ-0015 established the pattern: Critic/Refiner share prefix with Creator

### Alternative B: Phase-Prefix Mapping

Rename all agents to use SDLC phase numbers consistently.

**Rejected because:**
- Would require renaming existing agents (breaking change)
- Out of scope for REQ-0016
- Violates NFR-003 (backward compatibility)
