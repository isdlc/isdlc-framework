# REQ-0129: Provider-Neutral Phase-Loop Orchestrator

**GitHub**: #195
**Codex**: CODEX-060
**Phase**: 10 — Codex Extraction (Batch 2)
**Status**: Analyzed

## Summary

Extract the phase-loop controller logic from `isdlc.md` into a provider-neutral
`runPhaseLoop()` function. This is the largest orchestrator — it drives the
sequential iteration through workflow phases, delegating execution to the
runtime adapter while managing state transitions, checkpoints, hooks, and
interactive relays.

## Motivation

The current phase-loop logic is embedded in the Claude-Code-specific command
file. Extracting it into `src/core/orchestration/phase-loop.js` enables any
runtime (Claude Code, Codex, future providers) to execute the same workflow
sequence with consistent checkpoint validation and state management.

## Key Decisions

- Single function entry point: `runPhaseLoop(runtime, workflow, state, options)`
- Pre/post phase hooks run inside the loop, not as external middleware
- Hook block handling uses retry with re-delegation (not immediate failure)
- Interactive phases relay through `runtime.presentInteractive()` in a loop
- Consumes team instances, skill injection, governance, and state machine models

## Scope

**In scope**: Phase iteration, checkpoint validation, instruction projection,
state updates, hook handling, interactive relay, timing/budget tracking.

**Out of scope**: Provider-specific delegation (that is the runtime adapter's
responsibility).
