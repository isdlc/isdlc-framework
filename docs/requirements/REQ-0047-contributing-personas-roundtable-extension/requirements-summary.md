---
Status: Accepted
Last Updated: 2026-03-07
Domain: requirements
Source: REQ-0047 / GH-108a
---

# Requirements Summary: Contributing Personas -- Roundtable Extension

**Problem**: Fixed 3-persona roundtable with no user control over participants, verbosity, or persona framing. Some users want no persona discussion at all.

**User types**: Framework user (primary), Framework customizer (secondary), Roundtable lead (system).

## Functional Requirements

| FR | Title | Priority | Confidence |
|----|-------|----------|------------|
| FR-001 | Persona discovery from `.isdlc/personas/` | Must Have | High |
| FR-002 | 5 built-in contributing personas (Security, QA, UX, DevOps, Domain Expert) | Must Have | High |
| FR-003 | Roster proposal with user confirmation (skipped in silent mode) | Must Have | High |
| FR-004 | Three verbosity modes: `conversational` / `bulleted` (default) / `silent` | Must Have | High |
| FR-005 | Config file `.isdlc/roundtable.yaml` read by CLAUDE.md | Must Have | High |
| FR-006 | Mid-conversation persona invitation (disabled in silent mode) | Should Have | High |
| FR-007 | Skill wiring via `owned_skills` for contributing personas | Must Have | High |
| FR-008 | Contributing persona output folded into existing artifacts (no attribution in silent) | Must Have | Medium |
| FR-009 | Override-by-copy mechanism | Must Have | High |
| FR-010 | Version drift notification for overridden personas | Should Have | High |

## Verbosity Modes

| Mode | Roster Proposal | Persona Voices | Domain Labels | Output |
|------|----------------|----------------|---------------|--------|
| `conversational` | Yes | Named, visible | Yes | Full dialogue |
| `bulleted` (default) | Yes | Internal only | Yes | Labeled conclusion bullets |
| `silent` | No | None | None | Unified narrative, no persona framing |

## Key Acceptance Criteria Highlights

- Bulleted mode: domain-labeled conclusion bullets only, no cross-talk, no persona names
- Silent mode: no persona framing at all, no roster proposal, unified analysis output
- Roster proposal: "Based on this issue, I think we need... What do you think?"
- Override: same filename in `.isdlc/personas/` replaces shipped version
- Version drift: non-blocking notification when shipped persona is newer than user override
- Fail-open: bad files skipped, never crash

## Out of Scope

- Full persona override (#108b), new artifact types, confirmation sequence changes
