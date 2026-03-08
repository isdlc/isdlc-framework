# Full Persona Override

**Source**: Backlog #108b
**Type**: Feature
**Depends on**: #108a (Contributing Personas — completed)

## Description

Enable users to fully override, disable, replace, or tune built-in roundtable personas. This is the remainder of the original #108 ticket after #108a (contributing personas) was split out and shipped.

## Key Capabilities

- Disable built-in personas (e.g., skip Jordan/System Designer for lightweight analysis)
- Replace a built-in persona with a custom one (same artifact ownership, different personality/focus)
- Tune persona parameters (communication style, depth preference, domain emphasis)
- Store overrides in `.isdlc/personas/` with convention-based loading
- Artifact ownership model changes to support persona replacement

## Context

- #108a shipped contributing personas that ADD to the roundtable without owning artifacts
- #108b is the deeper story: modifying or replacing the 3 core personas (Maya, Alex, Jordan) who OWN artifacts
- Requires careful handling of artifact ownership — if Maya is replaced, who writes requirements-spec.md?
