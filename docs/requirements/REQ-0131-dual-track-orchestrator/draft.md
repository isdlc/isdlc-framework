# REQ-0131: Provider-Neutral Dual-Track Orchestrator

**GitHub**: #197
**Codex**: CODEX-062
**Phase**: 10 — Codex Extraction (Batch 2)
**Status**: Analyzed

## Summary

Extract the dual-track orchestration pattern into a provider-neutral
`runDualTrack()` function. This orchestrator spawns two parallel tracks
(typically implementation and quality), retries both if either fails, and
optionally fans out Track A into chunks when the workload exceeds a threshold.

## Motivation

The dual-track pattern (build + test in parallel, retry together) is central to
the iSDLC quality loop. Currently this logic is embedded in Claude-Code-specific
delegation. Extracting it enables any runtime to execute the same iterative
dual-track pattern with consistent retry and fan-out behavior.

## Key Decisions

- Single function entry point: `runDualTrack(runtime, instanceConfig, context)`
- Both tracks retry together on any failure (atomic retry)
- Fan-out sub-orchestration activates when test count exceeds threshold
- Uses `runFanOut()` for Track A chunking when fan-out is triggered

## Scope

**In scope**: Parallel track execution, atomic retry, iteration tracking,
fan-out activation based on threshold.

**Out of scope**: What Track A and Track B actually check or produce.
