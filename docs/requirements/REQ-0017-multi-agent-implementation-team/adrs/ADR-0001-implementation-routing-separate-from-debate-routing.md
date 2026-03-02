# ADR-0001: IMPLEMENTATION_ROUTING Separate from DEBATE_ROUTING

## Status

Accepted

## Context

REQ-0017 introduces a per-file Writer/Reviewer/Updater loop for Phase 06 (implementation). The existing DEBATE_ROUTING table in orchestrator Section 7.5 maps Phases 01/03/04 to Creator/Critic/Refiner agents with a per-artifact debate loop. The question is whether Phase 06 should be added as a row in DEBATE_ROUTING or use a separate mechanism.

AC-006-03 explicitly requires: "it MUST use a SEPARATE routing mechanism (IMPLEMENTATION_ROUTING) because the loop pattern is fundamentally different."

## Decision

Create a new IMPLEMENTATION_ROUTING table in a new orchestrator Section 7.6, separate from the existing DEBATE_ROUTING table in Section 7.5.

## Consequences

**Positive:**
- Clear separation of concerns: per-artifact debate loop vs per-file review loop
- No risk of breaking existing DEBATE_ROUTING behavior for Phases 01/03/04 (264 existing tests)
- Each table has its own state key (debate_state vs implementation_loop_state) -- no schema overlap
- The two mechanisms share the same `resolveDebateMode()` function and `debate_mode` flag, avoiding duplication
- Easier to reason about each pattern independently

**Negative:**
- Two routing tables in the orchestrator instead of one -- slight documentation overhead
- Orchestrator file grows by ~150-200 lines (from ~1478 to ~1650)
- If future phases need per-file loops, IMPLEMENTATION_ROUTING grows as a separate table

## Alternatives Considered

**1. Add Phase 06 as a row in DEBATE_ROUTING with different column semantics:**
Rejected -- DEBATE_ROUTING columns are Creator/Critic/Refiner with per-artifact semantics. Repurposing them as Writer/Reviewer/Updater would create confusion. The loop protocol (per-file vs per-artifact) cannot be captured in a single routing table row.

**2. Generalize DEBATE_ROUTING into a universal AGENT_ROUTING with a "loop_type" column:**
Rejected -- premature abstraction (Article V). Only two patterns exist today. A universal table would add complexity without benefit. If a third pattern emerges, refactoring is straightforward.

**3. Extend DEBATE_ROUTING with a "variant" column (debate|implementation):**
Rejected -- this blurs the boundary between two fundamentally different loop protocols. The convergence logic, state tracking, and delegation patterns differ enough to warrant separation.

## Requirement Traces

- AC-006-03: "MUST use a SEPARATE routing mechanism (IMPLEMENTATION_ROUTING)"
- NFR-003: "resolveDebateMode() reused" (shared function, separate tables)
- Article V: Simplicity First (two simple tables > one complex table)
