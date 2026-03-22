# Tracing team port to shared orchestration

## Source
- GitHub Issue: #160
- Codex Reference: CODEX-027 — REQ-0096
- Workstream: C (Provider Adapters)
- Phase: 4

## Description
Extract shared orchestration for tracing fan-out team (T1/T2/T3). Preserve Claude parity. Add Codex execution path. Verify outputs, merge behavior, retries, and validator interaction.

## Dependencies
- REQ-0094 (Team spec model) — completed
- REQ-0087 (Claude adapter boundary) — completed

## Context
The tracing orchestrator currently lives in `src/claude/agents/tracing/tracing-orchestrator.md`. It fans out to 3 parallel sub-agents (T1: Symptom Analyzer, T2: Execution Path Tracer, T3: Root Cause Identifier). Results are consolidated into `trace-analysis.md`.

Same `fan_out` team spec as impact analysis. This item extracts the shared orchestration policy into `src/core/teams/` alongside REQ-0095.
