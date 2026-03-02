# ADR-0004: Gate-Blocker Compatibility with Debate Mode

## Status

Accepted

## Context

The gate-blocker hook (`gate-blocker.cjs`) enforces iteration requirements before allowing phase transitions. For Phase 01, it checks:

1. `interactive_elicitation.completed == true`
2. `interactive_elicitation.menu_interactions >= 3` (from iteration-requirements.json)
3. `interactive_elicitation.final_selection` is one of `["save", "continue"]`
4. `constitutional_validation.completed == true` (if enabled)

In debate mode, Phase 01 involves multiple agent delegations (Creator, Critic, Refiner). The Critic and Refiner do not interact with the user -- they operate on artifacts. Only the Creator (requirements-analyst) interacts with the user via the A/R/C menu pattern.

**Question:** Will the gate-blocker accept Phase 01 completion when debate mode is ON?

### Analysis of Current Hook Behavior

The gate-blocker reads `phases["01-requirements"].iteration_requirements.interactive_elicitation` from state.json. This state is written by the `menu-tracker.cjs` hook (PostToolUse) which tracks AskUserQuestion calls and menu selections.

In debate mode:
- The Creator (Round 1) interacts with the user -> menu-tracker records interactions
- The Critic operates without user interaction -> no menu-tracker activity
- The Refiner operates without user interaction -> no menu-tracker activity
- The orchestrator may present a "debate complete" confirmation -> possible menu-tracker activity

The menu-tracker writes to `phases["01-requirements"]` based on the current phase detected from state.json. Since all debate agents run within Phase 01, their activity (or lack thereof) is attributed to the same phase.

## Decision

**The current gate-blocker hook requires no changes for debate mode compatibility.** The Creator's user interactions satisfy all three interactive_elicitation checks:

1. `completed`: Set to true when the Creator finishes (the orchestrator writes this after the debate loop completes, or the menu-tracker detects "save"/"continue")
2. `menu_interactions >= 3`: The Creator performs at least 3 A/R/C menu interactions during initial requirements capture
3. `final_selection`: The Creator's final selection is "save" or "continue"

The Critic and Refiner do not need to present menus because they are internal processing steps, not user-facing elicitation steps. The gate-blocker does not care how many agent delegations happened within a phase -- it only checks the phase-level iteration state.

**Fallback plan:** If testing reveals that Critic/Refiner delegations reset or corrupt the elicitation state (e.g., if the menu-tracker writes a "no interaction" entry for Critic/Refiner delegations), add a `debate_mode_compatible` flag to the Phase 01 config in iteration-requirements.json:

```json
{
  "01-requirements": {
    "interactive_elicitation": {
      "enabled": true,
      "min_menu_interactions": 3,
      "required_final_selection": ["save", "continue"],
      "debate_mode_compatible": true,
      "_comment": "When debate_mode_compatible is true, elicitation state is only evaluated from Creator delegation, not Critic/Refiner"
    }
  }
}
```

This fallback is documented but NOT implemented unless testing proves it necessary. This follows Article V (Simplicity First) -- do not add configuration until proven needed.

## Consequences

**Positive:**
- No changes to gate-blocker.cjs or iteration-requirements.json (minimal blast radius)
- Existing hook tests continue to pass without modification
- The approach leverages how the hooks already work (phase-level state, not agent-level state)
- Fallback plan is documented if the assumption is wrong

**Negative:**
- Relies on the assumption that Critic/Refiner delegations do not interfere with menu-tracker state
- If the assumption is wrong, a patch to iteration-requirements.json is needed during implementation

**Verification:**
- Phase 05 (Test Strategy) must include a test case that verifies gate-blocker acceptance of Phase 01 completion in debate mode
- Phase 06 (Implementation) must verify menu-tracker behavior during Critic/Refiner delegations
