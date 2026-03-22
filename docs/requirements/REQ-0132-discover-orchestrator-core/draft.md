# REQ-0132: Provider-Neutral Discover Orchestrator

**GitHub**: #198
**Codex**: CODEX-063
**Phase**: 10 — Codex Extraction (Batch 2)
**Status**: Analyzed

## Summary

Extract the discover orchestration logic into a provider-neutral
`runDiscover()` function. This orchestrator drives the project discovery flow:
menu presentation, mode selection, sequential agent group execution with
parallel members, state tracking, and resume support.

## Motivation

The discover workflow is the entry point for new projects and returning users.
Currently its orchestration is embedded in Claude-Code-specific command
handling. Extracting it enables any runtime to present the same discovery
experience with consistent state tracking and resume capability.

## Key Decisions

- Single function entry point: `runDiscover(runtime, options)`
- Menu presentation via `runtime.presentInteractive()`
- Agent groups execute sequentially; members within a group execute in parallel
- State tracked via discover-state-schema (createInitialDiscoverState,
  markStepComplete, computeResumePoint)
- Resume support: incomplete state triggers automatic resume from last
  completed step

## Scope

**In scope**: Menu presentation, mode-based agent group execution, state
tracking, resume from incomplete state.

**Out of scope**: What discover agents actually produce (analysis results,
configuration files, etc.).
