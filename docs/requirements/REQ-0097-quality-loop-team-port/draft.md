# Quality loop team port to shared orchestration

## Source
- GitHub Issue: #161
- Codex Reference: CODEX-028 — REQ-0097
- Workstream: C (Provider Adapters)
- Phase: 4

## Description
Extract shared orchestration for quality dual-track (Track A/B) and fan-out chunk teams. Preserve Claude parity. Add Codex execution path. Verify outputs, merge behavior, retries, and validator interaction.

## Dependencies
- REQ-0094 (Team spec model) — completed
- REQ-0087 (Claude adapter boundary) — completed

## Context
The quality loop engineer currently lives in `src/claude/agents/16-quality-loop-engineer.md`. It uses the `dual_track` pattern (Track A: Testing, Track B: Automated QA running in parallel) with optional fan-out for Track A when test count exceeds 250. Results merge at the check level — any failure in either track triggers a full retry.

The `dual_track` team spec from REQ-0094 describes this pattern. This item extracts the shared orchestration policy into `src/core/teams/`.
