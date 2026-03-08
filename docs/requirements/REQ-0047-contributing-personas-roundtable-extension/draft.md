# Contributing Personas -- Roundtable Extension

**Source**: Split from GitHub #108 (Persona customization)
**Labels**: enhancement, hackability
**New Issue**: #108a (contributing personas only)
**Related**: #108b (full persona override -- remains Tier 4)

## Context

Part of the [Hackability & Extensibility Roadmap](docs/isdlc/hackability-roadmap.md) -- Tier 1 (Foundation), Layer 4 (Override, lightweight variant).

Split rationale: The original #108 was rated HIGH effort because it bundled two very different capabilities: (1) adding personas that **contribute** observations to existing topics, and (2) allowing personas that **own** new artifact types, disable defaults, or override built-in behavior. Capability (1) is LOW-MEDIUM effort because the topic file format already supports `contributing_personas` and no artifact ownership changes are needed.

## Problem

The roundtable has 3 fixed personas (Maya/BA, Alex/Architect, Jordan/Designer). Users cannot add domain-specific perspectives. Notable gaps:

- **Security**: Covered lightly by Alex but no dedicated security reviewer
- **QA/Test**: Test strategy perspective absent during analysis (only enters at Phase 05)
- **UX/Accessibility**: No persona owns user experience deeply
- **DevOps/SRE**: Deployment and observability concerns not represented
- **Domain expert**: Project-specific expertise (compliance, healthcare, fintech rules)

These perspectives are valuable but should not be forced on every project. Users need a way to opt in.

## Design

### Persona Discovery

Framework scans `.isdlc/personas/*.md` at roundtable startup. Files follow the same format as built-in `persona-*.md` files. Contributing personas are loaded alongside the 3 defaults -- they do NOT replace them.

```
.isdlc/personas/
  security-reviewer.md       <- contributes security observations
  qa-tester.md               <- contributes testability concerns
  compliance-officer.md      <- contributes regulatory flags
```

### Contributing vs Owning Personas

Contributing personas:
- Contribute observations and flag concerns within existing artifact sections
- Do NOT own new artifacts
- Do NOT appear in the confirmation sequence as separate domains
- Participate in roundtable conversation using the same voice integrity rules
- Listed in topic `contributing_personas` arrays (already dynamic)

Owning personas (NOT in scope -- deferred to #108b):
- Own new artifact types
- Appear in confirmation sequence
- Require artifact ownership model changes

### Persona File Format

Same as existing `persona-*.md` with one addition:

```yaml
---
name: persona-security-reviewer
description: "Security Reviewer persona for roundtable analysis."
model: opus
role_type: contributing    # NEW FIELD: "contributing" (no artifact ownership) or "primary" (owns artifacts)
owned_skills: []
---
```

If `role_type` is omitted, defaults to `contributing` for user-defined personas and `primary` for built-in personas.

### Changes Required

1. **`analyze-item.cjs`** `getPersonaPaths()` (line 255-261) -- also scan `.isdlc/personas/*.md` and append to the returned array
2. **`common.cjs`** session cache builder (line 4272-4282) -- also scan `.isdlc/personas/` for the ROUNDTABLE_CONTEXT section
3. **`roundtable-analyst.md`** Section 1.1 -- load dynamic persona files alongside defaults; contributing personas contribute observations but don't own artifacts; update conversation rules to include contributing voices
4. **Topic files** -- no schema change needed; `contributing_personas` is already an array that the roundtable reads dynamically
5. **Tests** -- update `concurrent-analyze-structure.test.cjs` to validate dynamic persona loading

### Conversation Integration

Contributing personas follow the same rules as existing personas:
- Voice integrity rules (DO/DO NOT boundaries)
- Anti-blending rule (stay silent if nothing distinct to add)
- Contribution batching (natural conversation breaks)
- Brevity first (2-4 bullets per turn)

The roundtable lead introduces contributing personas naturally:
- "I also have [Name], our [Role], who'll flag [domain] considerations as they come up."
- Contributing personas do NOT get opening statements -- they join when relevant

### Safety

- Bad persona files degrade quality but cannot corrupt state (no state.json access)
- Malformed persona files are skipped with a warning (fail-open)
- Maximum 3 contributing personas per project (prevent conversation bloat)
- Contributing personas cannot override built-in persona voice integrity rules

## Invisible UX

Developer drops `security-reviewer.md` in `.isdlc/personas/`. Next roundtable analysis automatically includes security observations. No configuration, no commands.

## Files to Change

- `src/antigravity/analyze-item.cjs` -- extend `getPersonaPaths()` (~5 lines)
- `src/claude/hooks/lib/common.cjs` -- extend ROUNDTABLE_CONTEXT builder (~10 lines)
- `src/claude/agents/roundtable-analyst.md` -- dynamic persona loading + contributing persona rules (~30 lines prose)
- `src/claude/hooks/tests/concurrent-analyze-structure.test.cjs` -- new test cases (~40 lines)

## Effort

LOW-MEDIUM -- extends existing infrastructure (persona loading, topic contributing_personas). No new artifact types, no confirmation sequence changes, no ownership model changes.

## Relationship to Other Items

- **Pairs with #100** (roundtable depth control) -- together they customize WHO participates and HOW DEEP they go. Both touch the same dispatch surface.
- **Prerequisite for #108b** (full persona override) -- establishes the dynamic loading mechanism that #108b extends with disable/override.
- **Independent of #97** (gate profiles) -- personas operate at analysis time, gates at workflow time.
