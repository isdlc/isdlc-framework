---
Status: Accepted
Last Updated: 2026-03-07
Domain: requirements
Source: REQ-0047 / GH-108a
Amendment: 2 (hackability review — 12 user-ownership gaps addressed)
---

# Requirements Summary: Contributing Personas -- Roundtable Extension

**Problem**: Fixed 3-persona roundtable with no user control over participants, verbosity, or persona framing. Users cannot suppress, override, or extend framework defaults without editing source files.

**User types**: Framework user (primary), Framework customizer (secondary), Roundtable lead (system).

## Functional Requirements

| FR | Title | Priority | Confidence |
|----|-------|----------|------------|
| FR-001 | Persona discovery from `.isdlc/personas/` | Must Have | High |
| FR-002 | 5 built-in contributing personas (Security, QA, UX, DevOps, Domain Expert) with authoring guidance | Must Have | High |
| FR-003 | Roster proposal with user confirmation, skipped-file feedback, and full discovery listing | Must Have | High |
| FR-004 | Three verbosity modes: `conversational` / `bulleted` (default) / `silent` (drift warnings suppressed) | Must Have | High |
| FR-005 | Config file `.isdlc/roundtable.yaml` with `default_personas`, `disabled_personas`, and gitignore exception | Must Have | High |
| FR-006 | Mid-conversation persona invitation (disabled in silent mode) | Should Have | High |
| FR-007 | Skill wiring via `owned_skills` for contributing personas | Must Have | High |
| FR-008 | Contributing persona output folded into existing artifacts (no attribution in silent) | Must Have | Medium |
| FR-009 | Override-by-copy mechanism | Must Have | High |
| FR-010 | Version drift notification for overridden personas (suppressed in silent) | Should Have | High |
| FR-011 | Per-analysis override flags (`--verbose`, `--silent`, `--personas`) and natural language mid-session switching | Should Have | High |

## Verbosity Modes

| Mode | Roster Proposal | Persona Voices | Domain Labels | Drift Warnings | Output |
|------|----------------|----------------|---------------|----------------|--------|
| `conversational` | Yes | Named, visible | Yes | Shown | Full dialogue |
| `bulleted` (default) | Yes | Internal only | Yes | Shown | Labeled conclusion bullets |
| `silent` | No | None | None | Suppressed | Unified narrative, no persona framing |

## User Control Summary

| Control | Mechanism | Scope |
|---------|-----------|-------|
| Add personas | Drop `.md` in `.isdlc/personas/` | Project-level |
| Override personas | Same filename in `.isdlc/personas/` | Project-level |
| Suppress personas | `disabled_personas` in config | Project-level |
| Always-include personas | `default_personas` in config | Project-level |
| Set verbosity | `verbosity` in config | Project-level |
| Override verbosity | `--verbose` / `--silent` flags | Per-analysis |
| Pre-select roster | `--personas` flag | Per-analysis |
| Switch verbosity mid-session | Natural language ("switch to conversational") | Per-analysis |
| Share personas with team | `.isdlc/personas/` not gitignored | Project-level |

## Key Acceptance Criteria Highlights

- Bulleted mode: domain-labeled conclusion bullets only, no cross-talk, no persona names
- Silent mode: no persona framing at all, no roster proposal, no drift warnings, unified analysis output
- Roster proposal: shows confident matches, uncertain matches, AND all available personas for discovery
- Skipped-file feedback: malformed persona files mentioned during roster proposal so user can fix them
- Override: same filename in `.isdlc/personas/` replaces shipped version
- Version drift: non-blocking notification when shipped persona is newer (suppressed in silent)
- Fail-open: bad files skipped and reported, never crash
- No format restrictions on user-authored personas (shipped personas use compact format)
- Per-analysis flags do not modify config file
- `disabled_personas` wins over `default_personas` for same persona

## Out of Scope

- Full persona override (#108b), new artifact types, confirmation sequence changes, contributing persona blocker authority
