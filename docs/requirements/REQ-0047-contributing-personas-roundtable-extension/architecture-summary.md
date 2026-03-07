---
Status: Accepted
Last Updated: 2026-03-07
Domain: architecture
Source: REQ-0047 / GH-108a
---

# Architecture Summary: Contributing Personas -- Roundtable Extension

## Architecture Decisions

- **ADR-001 -- Persona Storage**: Built-ins in `src/claude/agents/`, user overrides in `.isdlc/personas/`. Aligns with existing patterns, enables clean framework updates.
- **ADR-002 -- Roster Inference**: Keyword matching from persona `triggers` arrays, uncertain matches flagged for user decision. Deterministic base with contextual flexibility.
- **ADR-003 -- Verbosity Implementation**: Prompt-level rendering directive with three modes (`conversational`, `bulleted`, `silent`). Zero code changes to persona files.
- **ADR-004 -- Override-by-Copy with Version Tracking**: Filename match for override, semver for drift detection, non-blocking notification.

## Integration Points

7 interfaces: config file -> session cache builder -> dispatch prompt, persona loader -> dispatch prompt, triggers -> roster inference, version field -> drift detection, owned_skills -> skill framework.

## Technology Choices

YAML config, Markdown+frontmatter persona format, keyword+judgment roster inference, semver version tracking.

## Key Risks

- Context limits with many personas -- mitigated by compact format + only activated personas loaded
- Override logic bugs -- mitigated by deterministic filename matching + tests
- Silent mode losing depth -- mitigated by internal persona knowledge still active
