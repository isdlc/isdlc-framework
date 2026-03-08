---
Status: Accepted
Confidence: High
Last Updated: 2026-03-07
Coverage: specification 95%
Source: REQ-0047 / GH-108a
Amendment: 2 (hackability review — user ownership gaps addressed)
---

# Design Summary: Contributing Personas -- Roundtable Extension

## Overview

This feature extends the roundtable analysis from 3 fixed personas to a dynamic roster of primary + contributing personas. It adds user control over which personas participate, how verbose the output is (including the option to disable persona framing entirely), and how the framework proposes relevant perspectives. Every framework default can be overridden, suppressed, or extended by the user.

## Key Design Decisions

- **Persona storage**: Built-ins in `src/claude/agents/`, user overrides/additions in `.isdlc/personas/` (version-controlled, not gitignored)
- **Override model**: Override-by-copy (same filename in user dir replaces shipped version)
- **Version tracking**: Semver `version` field in frontmatter; non-blocking drift notification (suppressed in silent mode)
- **Roster inference**: Keyword matching from `triggers` arrays + agent judgment for uncertain cases + user confirmation. All available personas shown for discovery, not just matched ones.
- **Roster control**: `default_personas` (always-include), `disabled_personas` (never-auto-propose, user can still manually add), `--personas` flag (pre-select, skip proposal)
- **Verbosity**: Three modes via prompt-level rendering directive:
  - `conversational` -- full persona dialogue (current behavior)
  - `bulleted` -- domain-labeled conclusion bullets, no cross-talk (default)
  - `silent` -- unified analysis, no persona framing, no roster proposal, no drift warnings
- **Per-analysis overrides**: `--verbose`, `--silent`, `--personas` flags override config for one session. Natural language override ("switch to conversational") honored mid-analysis.
- **Config**: `.isdlc/roundtable.yaml` with `verbosity`, `default_personas`, and `disabled_personas` fields
- **Skill wiring**: Contributing personas use `owned_skills` identically to all other agents
- **User-authored format**: No format restrictions on user personas (user accepts context cost). Shipped personas use compact bullet format. Domain Expert template includes inline authoring guidance.
- **Fail-open**: Every error path degrades gracefully; bad files are skipped and mentioned during roster proposal, not silently dropped
- **Gitignore**: `.isdlc/personas/` explicitly not gitignored -- personas are shareable project config

## Verbosity Mode Comparison

| Aspect | conversational | bulleted | silent |
|--------|---------------|----------|--------|
| Roster proposal | Yes | Yes | No |
| Persona names in output | Yes | No | No |
| Domain labels | Yes | Yes | No |
| Cross-talk visible | Yes | No | No |
| Mid-conversation invitations | Yes (announced) | Yes (announced) | No (knowledge used internally) |
| Drift warnings | Shown | Shown | Suppressed (logged only) |
| Skipped-file feedback | Shown | Shown | Suppressed (logged only) |
| Internal deliberation | Visible | Hidden | Hidden |
| Output format | Full dialogue | Labeled bullets | Unified narrative |

## Module Summary

| Module | Purpose | Change Type |
|--------|---------|-------------|
| Persona Loader | Dynamic discovery + override + drift detection + skipped-file collection | Extend existing |
| Config Reader | Read `.isdlc/roundtable.yaml` (3 fields), merge with per-analysis flags | New section in existing |
| Roster Proposer | Infer + filter disabled + propose + show all available + confirm (skipped in silent; skipped with --personas) | New protocol in roundtable agent |
| Verbosity Renderer | Three-mode output format switching + mid-analysis natural language override | New rules in roundtable agent |
| Contributing Persona Files | 5 new built-in personas with authoring-guided template | New files |
| Late-Join Handler | Mid-conversation persona addition (disabled in silent) | New protocol in roundtable agent |

## Interface Contracts Summary

- `getPersonaPaths()` returns `{ paths: string[], driftWarnings: DriftWarning[], skippedFiles: SkippedFile[] }`
- Config schema: `verbosity`, `default_personas`, `disabled_personas` (all optional with defaults)
- Precedence: disabled > default (for same persona); per-analysis flag > config > built-in default
- Persona frontmatter: `name`, `role_type`, `domain`, `version`, `triggers`, `owned_skills`
- Dispatch adds: `ROUNDTABLE_VERBOSITY`, `ROUNDTABLE_ROSTER_DEFAULTS`, `ROUNDTABLE_ROSTER_DISABLED`, `ROUNDTABLE_DRIFT_WARNINGS`, `ROUNDTABLE_SKIPPED_FILES`, `ROUNDTABLE_PRESELECTED_ROSTER`
- Per-analysis flags: `--verbose`, `--silent`, `--personas <list>`

## Blast Radius

- **4 existing files modified** (analyze-item.cjs, common.cjs, roundtable-analyst.md, ANTIGRAVITY.md.template)
- **5 new persona files** created
- **4 transitively affected** (topic files, tests, CLAUDE.md, manifest)
- **1 gitignore update** (.gitignore exception for `.isdlc/personas/`)
- **Overall risk**: LOW -- additive changes, fail-open design, no breaking changes

## Implementation Order

1. Config file + verbosity + disabled_personas (FR-004, FR-005)
2. Persona discovery + override-by-copy + skipped-file collection (FR-001, FR-009)
3. Built-in contributing personas + skill wiring + template authoring guidance (FR-002, FR-007)
4. Roster proposal + user confirmation + all-available listing + skipped feedback (FR-003)
5. Per-analysis override flags (FR-011)
6. Mid-conversation invitation (FR-006)
7. Output integration rules (FR-008)
8. Version drift notification + silent mode suppression (FR-010)
9. Gitignore exception (AC-005-08)
10. Tests
