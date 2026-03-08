---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: architecture 90%
Source: REQ-0047 / GH-108a
---

# Architecture Overview: Contributing Personas -- Roundtable Extension

## 1. Architecture Decisions

### ADR-001: Persona Storage Location

**Decision**: Built-in contributing personas stored in `src/claude/agents/` alongside primaries. User overrides and custom personas in `.isdlc/personas/`.

**Options Considered**:

| Option | Pros | Cons |
|--------|------|------|
| A: All in `src/claude/agents/` (built-in), `.isdlc/personas/` (user) | Consistent with existing pattern; override-by-copy is clean filename matching; framework update delivers new persona versions automatically | Two directories to scan |
| B: Separate `src/claude/agents/contributing/` subdirectory | Clear separation of primary vs contributing | Breaks existing `persona-*.md` glob pattern; requires path changes in multiple files |
| C: All personas in `.isdlc/personas/`, framework copies defaults on init | User has one location to manage | Framework update cannot deliver persona improvements; init step required |

**Selected**: Option A -- aligns with existing codebase patterns, minimal path changes, clean update story.

### ADR-002: Roster Inference Strategy

**Decision**: Keyword matching from persona `triggers` frontmatter arrays, with uncertain matches flagged and user confirmation required.

**Options Considered**:

| Option | Pros | Cons |
|--------|------|------|
| A: Keyword matching against `triggers` arrays | Predictable, transparent, easy to debug; users can see why a persona was proposed | May miss semantic relevance without explicit keywords |
| B: LLM-based classification of issue content | More accurate semantic matching | Non-deterministic; harder to debug; adds latency |
| C: Topic file `contributing_personas` arrays only | Already exists in schema | Static -- doesn't account for issue content; would always propose same personas |

**Selected**: Option A with a fallback to judgment -- keyword match drives the confident proposals, uncertain cases are flagged for user decision. The roundtable lead (an LLM agent) naturally applies judgment when presenting the roster, bridging pure keyword matching with contextual understanding.

### ADR-003: Verbosity Implementation

**Decision**: Verbosity is a prompt-level rendering directive with three modes: `conversational`, `bulleted`, and `silent`. The roundtable agent receives `ROUNDTABLE_VERBOSITY` in its dispatch context and adjusts output format accordingly.

**Options Considered**:

| Option | Pros | Cons |
|--------|------|------|
| A: Prompt-level rendering directive | Zero code changes for verbosity itself; persona files unchanged; easy to extend with more modes later | Agent must reliably follow the directive |
| B: Post-processing filter on agent output | Guaranteed format compliance | Adds pipeline complexity; loses conversational context; harder to implement |
| C: Separate agent variants per mode | Each variant optimized for its mode | File duplication; maintenance burden; drift risk |

**Selected**: Option A -- simplest, most extensible, no code changes beyond config reading and prompt injection. The `silent` mode is a natural extension of this approach -- the agent uses persona knowledge internally but suppresses all persona framing in output.

### ADR-004: Override-by-Copy with Version Tracking

**Decision**: User overrides are detected by filename match. Version drift is detected by comparing `version` fields in frontmatter. Notification is non-blocking.

**Options Considered**:

| Option | Pros | Cons |
|--------|------|------|
| A: Filename match + version comparison | Simple, deterministic; user file always wins; notification is informational | User must manually check what changed |
| B: Content hash comparison | Detects any change, not just version bumps | Noisy -- even whitespace changes trigger; no semantic versioning |
| C: No version tracking | Simplest implementation | User never knows their override is stale |

**Selected**: Option A -- balances simplicity with user awareness.

## 2. Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| `.isdlc/roundtable.yaml` | `common.cjs` session cache builder | File read | YAML |
| `common.cjs` | Roundtable dispatch prompt | String injection | `ROUNDTABLE_VERBOSITY`, `ROUNDTABLE_ROSTER_DEFAULTS` |
| `.isdlc/personas/*.md` | `getPersonaPaths()` in `analyze-item.cjs` | Directory scan + file read | Markdown with YAML frontmatter |
| `getPersonaPaths()` | Roundtable dispatch prompt | `persona_paths` array | File path strings |
| Persona `triggers` array | Roundtable lead roster inference | Frontmatter field | YAML string array |
| Persona `version` field | Version drift detection in `getPersonaPaths()` | Frontmatter comparison | Semver string |
| Persona `owned_skills` | Skill framework | Frontmatter field | Skill ID strings |

## 3. Data Flow

```
Startup:
  .isdlc/roundtable.yaml --> common.cjs --> ROUNDTABLE_VERBOSITY in dispatch prompt
  .isdlc/personas/*.md ----\
  src/claude/agents/persona-*.md --> getPersonaPaths() --> persona_paths[] --> dispatch prompt
                                     (override-by-copy)
                                     (version drift check)

Roster Proposal (conversational + bulleted modes only):
  draft content keywords --> match against persona triggers[] --> confident matches + uncertain matches
  --> "I recommend: [confident]. Also considering: [uncertain]. What do you think?"
  --> user confirms/amends --> active roster for session

Silent Mode:
  Personas loaded internally for analytical knowledge
  No roster proposal, no persona names, no domain labels
  Output is unified analysis as if written by single analyst

Mid-Conversation (conversational + bulleted modes only):
  topic shift detected --> check available personas not in roster --> read persona file on demand
  --> "[Name] joining for [domain]" --> persona contributes
```

## 4. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config format | YAML (`.isdlc/roundtable.yaml`) | Consistent with existing `.isdlc/` config patterns; human-readable; simple schema |
| Persona format | Markdown with YAML frontmatter | Identical to existing persona files; no new parser needed |
| Roster inference | Keyword matching + agent judgment | Deterministic base with contextual flexibility |
| Version tracking | Semver in frontmatter `version` field | Lightweight; no external tooling; compatible with framework update mechanism |
| Verbosity modes | Three-tier: conversational / bulleted / silent | Covers full spectrum from full dialogue to zero persona framing |

## 5. Risk Assessment

| Architectural Risk | Likelihood | Impact | Mitigation |
|-------------------|-----------|--------|------------|
| Dispatch prompt exceeds context limits with many personas | Low | High | Only activated personas loaded; contributing format is compact |
| `getPersonaPaths()` override logic introduces subtle bugs | Low | High | Deterministic filename matching; comprehensive test coverage |
| YAML config parsing errors crash persona loading | Low | Medium | Fail-open: missing/malformed config defaults to `bulleted` with no defaults |
| Skill wiring for contributing personas doesn't integrate with observability | Low | Medium | Use identical `owned_skills` pattern as existing agents |
| Silent mode loses analytical depth | Low | Medium | Persona knowledge still used internally; only rendering changes |
