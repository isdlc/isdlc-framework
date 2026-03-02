# BUG-0004: Orchestrator Overrides Conversational Opening with Old 3-Question Protocol

**Type:** Bug Fix
**Severity:** Medium
**Priority:** P1
**Reported:** 2026-02-15
**Component:** 00-sdlc-orchestrator.md (Section 7 - Agent Delegation)

---

## Bug Description

The SDLC orchestrator (`00-sdlc-orchestrator.md`) injects an outdated **INTERACTIVE PROTOCOL** block into the Task prompt when delegating to the Phase 01 requirements analyst. This old protocol forces the agent to open with exactly 3 generic questions ("What problem are you solving? Who will use this? How will you know this project succeeded?") and forbids any other opening behavior.

This directly overrides the requirements analyst's own conversational opening protocol (lines 42-58 of `01-requirements-analyst.md`), which was updated in **REQ-0014** to:
- Reflect back the user's description for rich inputs (>50 words)
- Ask at most 1-2 targeted follow-up questions instead of 3 generic ones
- Weave discovery lenses organically rather than presenting rigid sequential stages

## Root Cause

In `00-sdlc-orchestrator.md`, Section 7 (Agent Delegation Table), lines ~1007-1016, the orchestrator includes:

```
**Phase 01 INTERACTIVE PROTOCOL** (include in Task prompt):
CRITICAL INSTRUCTION: You are a FACILITATOR, not a generator.
Your FIRST response must ONLY contain these 3 questions - nothing else:
1. What problem are you solving? 2. Who will use this? 3. How will you know this project succeeded?
Do NOT: do research, present understanding, list features, or provide analysis.
ONLY ask the 3 questions, then STOP and wait for user response.
After user responds, follow the A/R/C menu pattern for each step.
Only create artifacts when user selects [S] Save in Step 7.
```

This was the pre-REQ-0014 protocol. REQ-0014 updated the requirements analyst's own invocation protocol (lines 19-65 of `01-requirements-analyst.md`) to support:
- Mode detection (debate vs single-agent)
- Conversational opening with reflection for rich descriptions
- Focused questions instead of generic ones
- Organic lens integration

But the orchestrator's copy was never updated to match, so it still injects the old text.

## Expected Behavior

The orchestrator should inject the **current** conversational protocol from `01-requirements-analyst.md` (the INVOCATION PROTOCOL FOR ORCHESTRATOR block at lines 23-65) so that the requirements analyst opens conversations naturally, reflecting back the user's description and asking targeted questions.

## Actual Behavior

The orchestrator injects the **old** 3-question protocol, which overrides the agent's updated behavior and forces rigid generic questions regardless of how detailed the user's description is.

## Reproduction Steps

1. Start any feature or fix workflow (`/isdlc feature "detailed description..."`)
2. Observe the Task prompt sent to the requirements analyst
3. The old 3-question protocol is injected, overriding the agent's own conversational opening

## Fix

Replace the `**Phase 01 INTERACTIVE PROTOCOL**` block (lines ~1007-1016 of `00-sdlc-orchestrator.md`) with a reference to the agent's own INVOCATION PROTOCOL, or with the updated conversational protocol text that matches lines 23-65 of `01-requirements-analyst.md`.

---

## Functional Requirements

### FR-1: Remove Old 3-Question Protocol
The old INTERACTIVE PROTOCOL block in `00-sdlc-orchestrator.md` (lines ~1007-1016) MUST be replaced with the current conversational protocol from `01-requirements-analyst.md`.

**Acceptance Criteria:**
- AC-1.1: The text "Your FIRST response must ONLY contain these 3 questions" does NOT appear in `00-sdlc-orchestrator.md`
- AC-1.2: The text "What problem are you solving? 2. Who will use this? 3. How will you know this project succeeded?" does NOT appear in `00-sdlc-orchestrator.md`
- AC-1.3: The replacement text includes mode detection (DEBATE_CONTEXT check)
- AC-1.4: The replacement text includes the conversational opening with rich/minimal description branching
- AC-1.5: The replacement text includes organic lens integration guidance
- AC-1.6: The replacement text includes the A/R/C menu pattern

### FR-2: Protocol Consistency
The orchestrator's Phase 01 delegation protocol MUST match the requirements analyst's own INVOCATION PROTOCOL block.

**Acceptance Criteria:**
- AC-2.1: The orchestrator's Phase 01 protocol and the requirements analyst's INVOCATION PROTOCOL block are semantically equivalent
- AC-2.2: Both contain the same mode detection logic (DEBATE_CONTEXT present vs absent)
- AC-2.3: Both contain the same conversational opening rules (rich >50 words vs minimal)

## Non-Functional Requirements

- NFR-1: Single file change only (`00-sdlc-orchestrator.md`) -- no other files should be modified for the fix itself
- NFR-2: No behavior change to any other section of the orchestrator

## Files Affected

| File | Change Type | Description |
|------|------------|-------------|
| `src/claude/agents/00-sdlc-orchestrator.md` | Modify | Replace old INTERACTIVE PROTOCOL block with current conversational protocol |

## Complexity

**LOW** -- Single text block replacement in one file. No logic changes, no new files.
