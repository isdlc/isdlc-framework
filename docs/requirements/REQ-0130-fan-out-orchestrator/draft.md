# REQ-0130: Provider-Neutral Fan-Out Orchestrator

**GitHub**: #196
**Codex**: CODEX-061
**Phase**: 10 — Codex Extraction (Batch 2)
**Status**: Analyzed

## Summary

Extract the fan-out orchestration pattern into a provider-neutral
`runFanOut()` function. This orchestrator takes a team instance configuration,
builds a task list from its members, executes them in parallel via the runtime
adapter, and merges results according to the configured merge policy.

## Motivation

Fan-out is used whenever multiple sub-agents need to run in parallel (e.g.,
roundtable members, parallel analysis tracks). The current implementation is
coupled to Claude Code's sub-agent dispatch. Extracting it enables any runtime
to execute the same parallel fan-out pattern.

## Key Decisions

- Single function entry point: `runFanOut(runtime, instanceConfig, context)`
- Two merge policies: `consolidate` and `last_wins`
- Fail-open handling: non-required members can fail without blocking
- Returns structured result with per-member outcomes

## Scope

**In scope**: Task list construction from instance members, parallel execution,
merge policy application, fail-open handling.

**Out of scope**: What the sub-agents actually do (that is opaque to this
orchestrator).
