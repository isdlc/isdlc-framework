---
Status: Accepted
Last Updated: 2026-03-07
Domain: architecture
Source: REQ-0047 / GH-108a
Amendment: 2 (hackability review)
---

# Architecture Summary: Contributing Personas -- Roundtable Extension

## Architecture Decisions

- **ADR-001 -- Persona Storage**: Built-ins in `src/claude/agents/`, user overrides in `.isdlc/personas/` (not gitignored -- shareable via VCS). Aligns with existing patterns, enables clean framework updates.
- **ADR-002 -- Roster Inference**: Keyword matching from persona `triggers` arrays, uncertain matches flagged for user decision, all available personas shown for discovery. Deterministic base with contextual flexibility.
- **ADR-003 -- Verbosity Implementation**: Prompt-level rendering directive with three modes (`conversational`, `bulleted`, `silent`). Silent mode suppresses all persona framing including drift warnings. Zero code changes to persona files.
- **ADR-004 -- Override-by-Copy with Version Tracking**: Filename match for override, semver for drift detection, non-blocking notification (suppressed in silent mode).
- **ADR-005 -- Per-Analysis Overrides**: CLI flags (`--verbose`, `--silent`, `--personas`) override config for one session. Natural language mid-session switching honored. Config file never modified by flags.
- **ADR-006 -- User Control Completeness**: Three config knobs (`default_personas`, `disabled_personas`, `verbosity`) at project level. Per-analysis flags for session overrides. No format restrictions on user-authored personas. Skipped files reported, not silently dropped.

## Integration Points

9 interfaces: config file -> session cache builder -> dispatch prompt (with disabled_personas), persona loader -> dispatch prompt (with skippedFiles), triggers -> roster inference, version field -> drift detection, owned_skills -> skill framework, CLI flags -> dispatch overrides, .gitignore -> personas exception.

## Technology Choices

YAML config (3 fields), Markdown+frontmatter persona format (no body format restriction for user files), keyword+judgment roster inference, semver version tracking, CLI flags for per-analysis overrides.

## Key Risks

- Context limits with many personas -- mitigated by compact shipped format + only activated personas loaded + user-accepted cost for longer files
- Override logic bugs -- mitigated by deterministic filename matching + tests
- Silent mode losing depth -- mitigated by internal persona knowledge still active
- User personas silently skipped -- mitigated by skipped-file feedback in roster proposal
- Personas not shared -- mitigated by explicit gitignore exception
