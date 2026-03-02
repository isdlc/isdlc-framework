# ADR-0003: Phase 16/08 Conditional Scope via state.json Flag

## Status

Accepted

## Context

When the implementation team runs in Phase 06 (per-file loop with Reviewer), Phases 16 and 08 have reduced scope because many individual file checks are already done. Phase 16 becomes a "final sweep" (batch checks only -- test suite, coverage, SAST, audit). Phase 08 becomes "human review only" (architecture, business logic, merge approval).

The question is: how do Phase 16 and Phase 08 agents detect whether the implementation team ran?

## Decision

Phase 16 and Phase 08 agents detect the implementation team by checking for the presence and status of `active_workflow.implementation_loop_state` in state.json:

```
IF active_workflow.implementation_loop_state exists
   AND active_workflow.implementation_loop_state.status == "completed":
     Run in reduced scope mode
ELSE:
     Run in full scope mode (unchanged behavior)
```

## Consequences

**Positive:**
- Simple detection: one field check in state.json -- no new flags, no environment variables, no CLI arguments
- Reliable: state.json is the single source of truth for workflow state (Article XVI)
- Backward compatible: when implementation team did not run, the field does not exist, so behavior is unchanged (NFR-002)
- No coupling: Phase 16/08 agents do not need to know about IMPLEMENTATION_ROUTING -- they only check the state result
- Fail-safe: if state.json is corrupted or field is missing, agents default to full scope (Article X: Fail-Safe Defaults)

**Negative:**
- Phase 16/08 agents must read state.json at startup (they already do this for other reasons)
- If implementation_loop_state is partially written (crash mid-loop), status may not be "completed" -- agents fall back to full scope, which is correct behavior

## Alternatives Considered

**1. Pass a flag from orchestrator in the Task prompt (e.g., "IMPLEMENTATION_TEAM_RAN: true"):**
Rejected -- relies on orchestrator prompt text being correct. state.json is more reliable and verifiable by hooks.

**2. Check debate_mode flag directly:**
Rejected -- debate_mode=true does not necessarily mean the implementation team ran. debate_mode applies to Phases 01/03/04 as well. A Phase 06-specific state field is more precise.

**3. New top-level state.json field (e.g., "implementation_team_completed": true):**
Rejected -- duplicates information already in implementation_loop_state. The loop state already has a status field. Adding another top-level field violates DRY.

## Requirement Traces

- FR-005 (Phase restructuring, 4 ACs): Phase 16 "final sweep" and Phase 08 "human review only"
- AC-005-01, AC-005-02: Phase 16 batch-only when implementation team ran
- AC-005-03, AC-005-04: Phase 08 human-review-only when implementation team ran
- NFR-002: Backward compatibility when debate is off
- Article X: Fail-Safe Defaults -- absent field = full scope
