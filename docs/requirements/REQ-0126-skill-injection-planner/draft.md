# Skill injection planner

## Source
- GitHub Issue: #190
- Codex Reference: CODEX-057 — REQ-0126
- Workstream: B (Core Extraction)
- Phase: 4

## Description
Build provider-neutral skill injection planner: compute injection by workflow, phase, team role, user/project/external skills, conflict/precedence rules. Both Claude and Codex adapters consume the same injection plan. Preserves current manifest, SKILL.md, agent/frontmatter ownership, and mapping docs semantics.

## Dependencies
- REQ-0094 (Team spec model) — completed
- REQ-0084 (Search/memory boundaries) — completed

## Context
Skill injection is currently implemented inline in the Phase-Loop Controller (isdlc.md) via 3 steps: Step A (built-in skill index from session cache or common.cjs), Step B (external skills from manifest), Step C (assembly into delegation prompt). The injection logic is Claude-specific — it reads SKILL_INDEX from session cache, resolves agent names from Claude-specific tables, and formats for Claude's prompt structure.

This item extracts the injection planning logic into `src/core/skills/` so both Claude and Codex adapters can compute the same injection plan. The planner determines WHAT to inject (skill IDs, content, delivery type); the provider adapter determines HOW to deliver it.
