# REQ-0133: Provider-Neutral Analyze Orchestrator

**GitHub**: #199
**Codex**: CODEX-064
**Phase**: 10 — Codex Extraction (Batch 2)
**Status**: Analyzed

## Summary

Extract the analyze orchestration logic into a provider-neutral
`runAnalyze()` function. This is the most complex orchestrator — it drives
entry routing, bug classification, roundtable/bug-gather conversations,
sequential domain confirmation, artifact writing, and finalization.

## Motivation

The analyze workflow is the richest interactive flow in iSDLC, combining
classification logic, multi-turn conversations, state machine-driven
confirmations, and multi-step finalization. Currently all of this is embedded
in Claude-Code-specific command handling. Extracting it enables any runtime to
drive the same analysis experience with consistent routing, confirmation
sequences, and finalization chains.

## Key Decisions

- Single function entry point: `runAnalyze(runtime, item, options)`
- Entry routing and bug classification from lifecycle model
- Roundtable conversation via `runtime.presentInteractive()` with topic
  coverage tracking and depth adaptation
- Confirmation is a state machine: sequential per-domain presentation with
  accept/amend transitions
- Finalization chain executes as a sequence of steps (meta.json, BACKLOG, etc.)

## Scope

**In scope**: Entry routing, bug classification, roundtable/bug-gather
conversation loops, confirmation state machine, finalization chain execution.

**Out of scope**: Persona voice generation, artifact content generation (those
are the provider's responsibility).
