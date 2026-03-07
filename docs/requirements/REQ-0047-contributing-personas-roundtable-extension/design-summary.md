---
Status: Accepted
Confidence: High
Last Updated: 2026-03-07
Coverage: specification 85%
Source: REQ-0047 / GH-108a
---

# Design Summary: Contributing Personas -- Roundtable Extension

## Overview

This feature extends the roundtable analysis from 3 fixed personas to a dynamic roster of primary + contributing personas. It adds user control over which personas participate, how verbose the output is (including the option to disable persona framing entirely), and how the framework proposes relevant perspectives.

## Key Design Decisions

- **Persona storage**: Built-ins in `src/claude/agents/`, user overrides/additions in `.isdlc/personas/`
- **Override model**: Override-by-copy (same filename in user dir replaces shipped version)
- **Version tracking**: Semver `version` field in frontmatter; non-blocking drift notification
- **Roster inference**: Keyword matching from `triggers` arrays + agent judgment for uncertain cases + user confirmation
- **Verbosity**: Three modes via prompt-level rendering directive:
  - `conversational` -- full persona dialogue (current behavior)
  - `bulleted` -- domain-labeled conclusion bullets, no cross-talk (default)
  - `silent` -- unified analysis, no persona framing, no roster proposal
- **Config**: `.isdlc/roundtable.yaml` with `verbosity` and `default_personas` fields, read by CLAUDE.md
- **Skill wiring**: Contributing personas use `owned_skills` identically to all other agents
- **Fail-open**: Every error path degrades gracefully; bad files are skipped, not fatal

## Verbosity Mode Comparison

| Aspect | conversational | bulleted | silent |
|--------|---------------|----------|--------|
| Roster proposal | Yes | Yes | No |
| Persona names in output | Yes | No | No |
| Domain labels | Yes | Yes | No |
| Cross-talk visible | Yes | No | No |
| Mid-conversation invitations | Yes (announced) | Yes (announced) | No (knowledge used internally) |
| Internal deliberation | Visible | Hidden | Hidden |
| Output format | Full dialogue | Labeled bullets | Unified narrative |

## Module Summary

| Module | Purpose | Change Type |
|--------|---------|-------------|
| Persona Loader | Dynamic discovery + override + drift detection | Extend existing |
| Config Reader | Read `.isdlc/roundtable.yaml`, inject into dispatch | New section in existing |
| Roster Proposer | Infer + propose + confirm persona roster (skipped in silent) | New protocol in roundtable agent |
| Verbosity Renderer | Three-mode output format switching | New rules in roundtable agent |
| Contributing Persona Files | 5 new built-in personas | New files |
| Late-Join Handler | Mid-conversation persona addition (disabled in silent) | New protocol in roundtable agent |

## Interface Contracts Summary

- `getPersonaPaths()` returns `{ paths: string[], driftWarnings: DriftWarning[] }`
- Config schema: `verbosity` (`conversational` | `bulleted` | `silent`), `default_personas` (string array)
- Persona frontmatter: `name`, `role_type`, `domain`, `version`, `triggers`, `owned_skills`
- Dispatch adds: `ROUNDTABLE_VERBOSITY`, `ROUNDTABLE_ROSTER_DEFAULTS`, `ROUNDTABLE_DRIFT_WARNINGS`

## Blast Radius

- **4 existing files modified** (analyze-item.cjs, common.cjs, roundtable-analyst.md, ANTIGRAVITY.md.template)
- **5 new persona files** created
- **4 transitively affected** (topic files, tests, CLAUDE.md, manifest)
- **Overall risk**: LOW -- additive changes, fail-open design, no breaking changes

## Implementation Order

1. Config file + verbosity (FR-004, FR-005)
2. Persona discovery + override-by-copy (FR-001, FR-009)
3. Built-in contributing personas + skill wiring (FR-002, FR-007)
4. Roster proposal + user confirmation (FR-003)
5. Mid-conversation invitation (FR-006)
6. Output integration rules (FR-008)
7. Version drift notification (FR-010)
8. Tests
