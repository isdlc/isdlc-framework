# BUG-GH-265: #253 injection mechanism not delivered as designed

**Source**: GitHub Issue #265
**Type**: BUG
**Created**: 2026-04-25

## Summary

REQ-GH-253 was specified as **PreToolUse context-manager hooks** that fire before Task tool delegation, read state, compose phase-specific instruction blocks, and inject them. What actually shipped is a state-machine + JS bridge (`src/core/roundtable/state-card-composer.js`, `src/core/bridge/roundtable.cjs`) that the orchestrator's prose protocol must remember to call. No hook forces the bridge call. No hook composes or injects the cards. The architectural promise of #253 — moving enforcement off LLM-protocol-recall — was lost in implementation.

## Original Design (from GitHub #253 body)

> Replace post-hoc blocking hooks with **pre-delegation context-manager hooks** that inject phase-specific instructions before the orchestrator acts. Move enforcement from LLM discipline → hook-composed immediate instructions.

| Hook (designed) | Trigger | Reads | Injects |
|---|---|---|---|
| phase-context-manager | PreToolUse on Task | state.json, workflows.json, tasks.md | Phase constraints, dispatch mode, commit prohibition |
| confirmation-context-manager | PreToolUse on Write | meta.json confirmation state | Whether staged confirmations complete |
| roundtable-context-manager | Before analyze dispatch | meta.json, roundtable protocol | Confirmation stages, stop/wait rules |
| finalize-context-manager | Before STEP 4 | state.json, finalize-steps.md | Ordered finalize checklist |

## What Actually Shipped

State-machine + JSON state-card composition:
- `src/core/roundtable/state-card-composer.js` — composes a card per turn
- `src/isdlc/config/roundtable/state-cards/*.card.json` — per-state card templates
- `src/core/bridge/roundtable.cjs` — bridge function `composeForTurn`
- `src/claude/commands/isdlc.md:685, 689, 757, 860, 864` — prose protocol asking the orchestrator to call the bridge

No PreToolUse hook exists. No hook composes the cards. No hook injects them into the delegation prompt. The "injection" is a function the orchestrator must remember to invoke from a markdown protocol — exactly what #253 was meant to remove.

## Symptom Surface (one of many possible)

At `PRESENTING_TASKS`:
- `state-card-composer.js:140-142` writes only `Template: traceability.template.json` — filename, not format spec
- `tasks-as-table-validator.cjs` is wired as PostToolUse[Write|Edit] (never sees chat output) and reads a stdin field Claude Code does not populate, so the state guard always short-circuits
- LLM falls back to `roundtable-analyst.md` recall — sometimes renders the 4-column table, sometimes bullets

The traceability matrix is the symptom that surfaced. The same failure mode applies to PRESENTING_BUG_SUMMARY, PRESENTING_ROOT_CAUSE, PRESENTING_FIX_STRATEGY, every phase delegation, every commit prohibition — anywhere #253's instruction injection should fire.

## Why This Is the Right Frame

Treating each PRESENTING_* state separately is whack-a-mole. The architectural gap is the absence of the hook layer. Fix the layer once and every confirmation state, every phase delegation, every commit prohibition gets enforced. Leave the layer absent and we keep finding symptoms one by one.

## Fix Direction (to be confirmed in roundtable)

Bring #253 to its specified design: implement the four context-manager hooks as PreToolUse hooks on Task / Write. Either replace the state-machine (rip-and-replace) or keep the state-machine as the content source and add hooks as the delivery layer. The latter preserves the 589 tests and the JSON state-card schema work; the former matches the original design strictly.

## Related

- #253 — original design (closed as completed; implementation does not match design)
- #254 — closed dup of #253
- #214 — PreToolUse pattern proof (tool-router) — the existing example of what #253 was meant to be
- #235 — origin of `tasks-as-table-validator.cjs`
- Memory rule #19: "Instructions are binding, not optional" — directly motivated by this gap
