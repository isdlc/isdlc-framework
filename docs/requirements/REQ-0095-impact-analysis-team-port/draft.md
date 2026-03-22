# Impact analysis team port to shared orchestration

## Source
- GitHub Issue: #159
- Codex Reference: CODEX-026 — REQ-0095
- Workstream: C (Provider Adapters)
- Phase: 4

## Description
Extract shared orchestration policy for impact analysis fan-out team (M1/M2/M3 + verifier). Preserve Claude parity. Add Codex execution path. Verify outputs, merge behavior, retries, and validator interaction.

## Dependencies
- REQ-0094 (Team spec model) — completed
- REQ-0087 (Claude adapter boundary) — completed

## Context
The impact analysis orchestrator currently lives entirely in `src/claude/agents/impact-analysis/impact-analysis-orchestrator.md`. It fans out to 3 parallel sub-agents (M1: Impact Analyzer, M2: Entry Point Finder, M3: Risk Assessor) plus M4 (Cross-Validation Verifier, fail-open). Results are consolidated into `impact-analysis.md`.

The `fan_out` team spec from REQ-0094 describes this pattern. This item extracts the shared orchestration policy (launch, wait, merge, retry) into `src/core/teams/` so Codex can use the same fan-out logic.
