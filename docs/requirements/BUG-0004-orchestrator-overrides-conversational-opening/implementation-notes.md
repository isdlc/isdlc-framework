# Implementation Notes: BUG-0004 Orchestrator Overrides Conversational Opening

**Phase:** 06-implementation
**Date:** 2026-02-15
**Agent:** software-developer

---

## Summary

Replaced the old Phase 01 INTERACTIVE PROTOCOL block in `00-sdlc-orchestrator.md` (lines ~1007-1016) with the current conversational protocol that matches the requirements analyst's own INVOCATION PROTOCOL (lines 23-65 of `01-requirements-analyst.md`).

## Change Description

### File Modified

**`src/claude/agents/00-sdlc-orchestrator.md`** (Section 7 - Agent Delegation Table)

### What Was Removed

The old INTERACTIVE PROTOCOL block that injected:
- "Your FIRST response must ONLY contain these 3 questions"
- Three rigid generic questions (What problem? Who will use? How to know success?)
- "ONLY ask the 3 questions, then STOP"
- No mode detection, no description-aware branching

### What Was Added

A new CONVERSATIONAL PROTOCOL block that includes:
1. **Mode Detection** -- DEBATE_CONTEXT check with both debate and single-agent branches
2. **Conversational Opening** -- Rich description (>50 words) triggers reflection + 1 targeted follow-up; minimal description triggers at most 2 focused questions
3. **Organic Lens Integration** -- 5 discovery lenses (Business/User/UX/Tech/Quality) woven naturally into conversation
4. **A/R/C Menu Pattern** -- Preserved Adjust/Refine/Continue interaction model
5. **Save Guard** -- Preserved "Only create artifacts when user selects [S] Save in Step 7"

### Section Header Change

- Old: `**Phase 01 INTERACTIVE PROTOCOL**`
- New: `**Phase 01 CONVERSATIONAL PROTOCOL**`

## TDD Results

- **Iteration 1:** 17/17 tests pass (GREEN on first attempt)
- **Tests before fix:** 8 passing, 9 failing (RED baseline confirmed)
- **Tests after fix:** 17 passing, 0 failing (GREEN)

## Acceptance Criteria Verification

| AC | Status | Verification |
|----|--------|-------------|
| AC-1.1 | PASS | "Your FIRST response must ONLY contain these 3 questions" removed |
| AC-1.2 | PASS | All 3 generic questions removed |
| AC-1.3 | PASS | DEBATE_CONTEXT mode detection added with both branches |
| AC-1.4 | PASS | Conversational opening with rich/minimal branching (50-word threshold) |
| AC-1.5 | PASS | Discovery lenses referenced with organic weaving instruction |
| AC-1.6 | PASS | A/R/C menu pattern preserved |
| AC-2.1 | PASS | Orchestrator and analyst protocols are semantically equivalent |
| AC-2.2 | PASS | Both contain DEBATE_CONTEXT mode detection |
| AC-2.3 | PASS | Both contain 50-word threshold for rich descriptions |

## NFR Verification

| NFR | Status | Verification |
|-----|--------|-------------|
| NFR-1 | PASS | Single file changed: `00-sdlc-orchestrator.md` only |
| NFR-2 | PASS | Other sections (DEBATE_ROUTING, delegation table, section headers) untouched |

## Design Decisions

1. **Copied text rather than referencing**: The orchestrator injects the protocol text directly into the Task prompt (it cannot reference another file at runtime). Therefore the replacement text is a verbatim copy of the requirements analyst's INVOCATION PROTOCOL block, ensuring semantic equivalence while maintaining the orchestrator's delegation pattern.

2. **Preserved "Save in Step 7" line**: The original protocol had this guard and it remains valid in the new protocol.

3. **Header renamed to CONVERSATIONAL PROTOCOL**: More accurately describes the new behavior than "INTERACTIVE PROTOCOL".
