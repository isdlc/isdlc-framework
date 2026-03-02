# Interface Specification: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## 1. Confirmation State Machine

The confirmation sequence operates as a state machine with the following states and transitions:

### States

| State | Description | Entry Condition |
|-------|-------------|-----------------|
| `IDLE` | No confirmation active | Default state before coverage completion |
| `PRESENTING_REQUIREMENTS` | Requirements summary shown, awaiting user response | Coverage completion detected (non-trivial tier) |
| `PRESENTING_ARCHITECTURE` | Architecture summary shown, awaiting user response | Requirements accepted AND architecture artifacts exist |
| `PRESENTING_DESIGN` | Design summary shown, awaiting user response | Architecture accepted (or skipped) AND design artifacts exist |
| `AMENDING` | Amendment conversation active with all three personas | User chose Amend on any summary |
| `TRIVIAL_SHOW` | Brief change mention shown, proceeding without acceptance | Coverage completion detected (trivial tier) |
| `FINALIZING` | All applicable summaries accepted, persisting and closing | All applicable domains accepted |
| `COMPLETE` | Confirmation done, ROUNDTABLE_COMPLETE emitted | Finalization complete |

### Transitions

| From | To | Trigger | Action |
|------|-----|---------|--------|
| `IDLE` | `PRESENTING_REQUIREMENTS` | Coverage complete, tier is light/standard/epic | Generate requirements summary, cache it, RETURN |
| `IDLE` | `TRIVIAL_SHOW` | Coverage complete, tier is trivial | Generate brief change mention, present it, proceed |
| `TRIVIAL_SHOW` | `FINALIZING` | (Automatic) | Persist minimal summary, update meta.json |
| `PRESENTING_REQUIREMENTS` | `PRESENTING_ARCHITECTURE` | User accepts requirements AND architecture exists | Record acceptance, generate architecture summary, cache it, RETURN |
| `PRESENTING_REQUIREMENTS` | `PRESENTING_DESIGN` | User accepts requirements AND no architecture AND design exists | Record acceptance, generate design summary, cache it, RETURN |
| `PRESENTING_REQUIREMENTS` | `FINALIZING` | User accepts requirements AND no architecture AND no design | Record acceptance, proceed to finalize |
| `PRESENTING_REQUIREMENTS` | `AMENDING` | User chooses Amend | Clear acceptedDomains, re-enter conversation |
| `PRESENTING_ARCHITECTURE` | `PRESENTING_DESIGN` | User accepts architecture AND design exists | Record acceptance, generate design summary, cache it, RETURN |
| `PRESENTING_ARCHITECTURE` | `FINALIZING` | User accepts architecture AND no design | Record acceptance, proceed to finalize |
| `PRESENTING_ARCHITECTURE` | `AMENDING` | User chooses Amend | Clear acceptedDomains, re-enter conversation |
| `PRESENTING_DESIGN` | `FINALIZING` | User accepts design | Record acceptance, proceed to finalize |
| `PRESENTING_DESIGN` | `AMENDING` | User chooses Amend | Clear acceptedDomains, re-enter conversation |
| `AMENDING` | `PRESENTING_REQUIREMENTS` | User signals amendment complete | Regenerate all summaries from updated artifacts, clear cache, restart |
| `FINALIZING` | `COMPLETE` | Summaries persisted, meta.json updated | Emit ROUNDTABLE_COMPLETE |

## 2. User Response Parsing

The system parses user responses to determine Accept or Amend intent. This is natural language parsing, not strict keyword matching.

### Accept Indicators

Phrases that signal acceptance (case-insensitive, substring match):
- "accept", "looks good", "good", "yes", "fine", "approved", "ok", "okay", "lgtm", "ship it", "move on", "proceed", "correct", "agreed", "confirm"

### Amend Indicators

Phrases that signal amendment (case-insensitive, substring match):
- "amend", "change", "modify", "update", "fix", "wrong", "not quite", "actually", "but", "however", "missing", "add", "remove", "what about", "I think"

### Ambiguous Input

If the response does not clearly match either category, treat it as the start of an amendment conversation. It is safer to let the user clarify than to auto-accept.

## 3. Summary Artifact Schema

Each persisted summary artifact follows this structure:

### requirements-summary.md

```markdown
# Requirements Summary

**Status**: Accepted
**Accepted At**: {ISO timestamp}
**Source Artifacts**: requirements-spec.md, user-stories.json

## Problem

{1-2 sentence problem statement}

## User Types

{Bullet list of identified user types with brief role description}

## Functional Requirements

| FR | Title | Priority | Confidence |
|----|-------|----------|------------|
| FR-001 | {title} | {MoSCoW} | {High/Medium/Low} |
| ... | ... | ... | ... |

## Key Acceptance Criteria

{3-5 most important ACs listed in plain language}

## Artifacts

- Full requirements: `requirements-spec.md`
- User stories: `user-stories.json`
- Traceability: `traceability-matrix.csv`
```

### architecture-summary.md

```markdown
# Architecture Summary

**Status**: Accepted
**Accepted At**: {ISO timestamp}
**Source Artifacts**: architecture-overview.md

## Key Decisions

{For each significant decision:}
### {Decision Title}
- **Chosen**: {option name}
- **Over**: {rejected option(s)}
- **Rationale**: {1-2 sentences}

## Integration Points

{Brief description of how components connect}

## Artifacts

- Full architecture: `architecture-overview.md`
```

### design-summary.md

```markdown
# Design Summary

**Status**: Accepted
**Accepted At**: {ISO timestamp}
**Source Artifacts**: module-design.md, interface-spec.md, data-flow.md

## Modules

| Module | Responsibility |
|--------|---------------|
| {name} | {1-sentence responsibility} |
| ... | ... |

## Data Flow

{Description of how data moves through the system, from source to sink}

## Sequence of Operations

{Ordered list or description of the runtime sequence}

## Artifacts

- Module design: `module-design.md`
- Interface contracts: `interface-spec.md`
- Data flow detail: `data-flow.md`
- Error handling: `error-taxonomy.md`
```

## 4. Meta.json Acceptance Schema

The `acceptance` field is added at the top level of meta.json:

```json
{
  "source": "github",
  "source_id": "GH-22",
  "slug": "REQ-0035-...",
  "analysis_status": "partial",
  "acceptance": {
    "accepted_at": "2026-02-22T14:30:00.000Z",
    "domains": ["requirements", "architecture", "design"],
    "amendment_cycles": 1
  },
  "phases_completed": ["00-quick-scan", "01-requirements", "02-impact-analysis", "03-architecture", "04-design"]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `acceptance.accepted_at` | ISO 8601 string | Timestamp when the user accepted the final summary |
| `acceptance.domains` | string[] | List of domains that were presented and accepted |
| `acceptance.amendment_cycles` | integer | Number of times the user went through an amendment cycle (0 = accepted on first pass) |

The `acceptance` field is only written when all applicable summaries have been accepted. It is not written during partial acceptance or during amendment cycles.

## 5. Presentation Format

### Summary Presentation Template

Each summary is presented conversationally by the owning persona, followed by the Accept/Amend prompt:

```
{Persona}: {Conversational summary of the domain content}

Full details are in `{artifact-reference}`.

Would you like to accept this and move on, or would you like to amend anything?
```

### Trivial Tier Presentation

```
{Persona}: Here's a quick overview of what we're changing: {brief description of the change}.

{Proceeding to close analysis.}
```

No Accept/Amend prompt is shown for trivial tier.
