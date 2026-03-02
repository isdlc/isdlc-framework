# Architecture Overview: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## 1. Architecture Options

### Decision 1: Where to implement the confirmation sequence

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Inside roundtable-analyst.md | Confirmation sequence is a new state within the roundtable agent's conversation loop | Self-contained; uses existing RETURN-FOR-INPUT pattern; no relay changes needed; agent owns its own completion flow | Agent file grows larger; all confirmation logic in one place | Follows existing pattern: roundtable owns entire user-facing experience (Section 2.7) | **Selected** |
| B: In isdlc.md after roundtable returns | Orchestrator handles confirmation as a post-roundtable step | Separates concerns; roundtable stays simpler | Breaks the "orchestrator is invisible relay" principle; requires new orchestrator logic; confirmation exchanges would not benefit from persona voices | Breaks existing pattern: isdlc.md Section 7b says "you are INVISIBLE. You are a relay." | Eliminated |

### Decision 2: Amendment conversation re-entry

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Resume existing roundtable conversation | Amendment opens within the same roundtable session, all three personas available | Natural; no new agent spawning; conversation context preserved; all personas already loaded | Must track confirmation state alongside conversation state | Follows existing pattern: roundtable already handles multi-turn conversation with all three personas | **Selected** |
| B: Spawn a new roundtable session for amendment | Start a fresh roundtable focused on the amendment | Clean separation; no state mixing | Loses conversation context; cold start penalty; user repeats context; wasteful | Breaks existing pattern: unnecessary agent re-initialization | Eliminated |

### Decision 3: Summary generation approach

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Generate from artifacts at confirmation time | Read the detailed artifacts and produce summaries on the fly | Always up-to-date; single source of truth; no sync issues | Generation takes time (mitigated by caching) | Follows existing pattern: artifacts are the source of truth | **Selected** |
| B: Build summaries incrementally during conversation | Track summary content as the conversation progresses | Faster at confirmation time; no artifact re-reading | Two sources of truth; summaries may drift from artifacts; complex bookkeeping | Breaks existing pattern: would require parallel tracking alongside progressive artifact writes | Eliminated |

## 2. Selected Architecture

### ADR-001: Confirmation Sequence in Roundtable Agent

**Status**: Accepted

**Context**: The roundtable analyst currently detects completion (Section 2.5) by checking coverage and artifact status, then presents a metadata summary and asks if the user wants to explore further. This needs to be replaced with a substantive confirmation flow that shows the user what was decided and gets explicit acceptance.

**Decision**: Implement the confirmation sequence as a new state machine within the roundtable analyst agent, triggered when the existing completion detection criteria are met. The confirmation sequence uses the same RETURN-FOR-INPUT pattern as regular conversation exchanges.

**Rationale**: The roundtable agent owns the entire user-facing experience. The orchestrator relay in `isdlc.md` is designed to be invisible -- it simply passes through whatever the roundtable outputs. Placing the confirmation logic in the roundtable keeps this clean separation and avoids making the relay smarter.

**Consequences**:
- `roundtable-analyst.md` Section 2.5 is replaced by the confirmation sequence specification
- A new Section 2.8 (or similar) defines the confirmation state machine
- The relay in `isdlc.md` Section 7b requires no changes
- The `ROUNDTABLE_COMPLETE` signal is emitted only after all summaries are accepted

### ADR-002: Full Sequence Restart on Amendment

**Status**: Accepted

**Context**: When the user amends any summary, downstream artifacts may be affected. The system needs to re-present summaries after amendment. Two approaches: restart from the amended point, or restart from the beginning.

**Decision**: After any amendment conversation concludes, restart the confirmation sequence from the requirements summary regardless of which domain was amended.

**Rationale**: Restarting from the top is simpler to implement (no tracking of "which areas were affected by the ripple") and gives the user a complete view of everything in context. The cost is that the user re-confirms summaries they may have already accepted, but this is fast (Accept is a single response) and provides confidence that everything is aligned.

**Consequences**:
- Users may Accept requirements multiple times during an amendment cycle
- The full sequence is always requirements -> architecture -> design, never a partial sequence
- No complex ripple-effect tracking needed
- Summaries are regenerated from updated artifacts before re-presentation

### ADR-003: Summary Caching and Persistence

**Status**: Accepted

**Context**: Summaries are generated from detailed artifacts. Generating them is fast but not free. During amendment cycles, the same summary may be presented multiple times. Persisting summaries enables fast revisit on future analysis runs.

**Decision**: Cache generated summaries in agent memory during the confirmation sequence. On full acceptance, persist summaries as standalone markdown files (`requirements-summary.md`, `architecture-summary.md`, `design-summary.md`) in the artifact folder. Regenerate after each amendment.

**Rationale**: Caching avoids redundant generation during amendment cycles. Persistence enables fast re-presentation on revisit and provides a human-readable record of what was confirmed. Standalone files (not embedded in detailed artifacts) maintain clean separation.

**Consequences**:
- 3 new files per analysis session in `docs/requirements/{slug}/`
- Files are complete replacements on each write (consistent with existing progressive write protocol)
- Persisted summaries may become stale if detailed artifacts are modified outside the analyze flow (mitigated by codebase hash staleness check)

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| Markdown | N/A | Summary artifacts are markdown files, consistent with all other analysis artifacts | JSON (rejected: not human-readable for review purpose), YAML (rejected: summaries are prose, not structured data) |

No new dependencies are introduced. The feature uses existing agent infrastructure, existing file I/O patterns, and existing meta.json schema extension patterns.

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface Type | Data Format | Error Handling |
|----|--------|--------|---------------|-------------|----------------|
| IP-001 | Roundtable agent (confirmation trigger) | Detailed artifacts on disk | File read | Markdown | If artifact missing, skip that domain's summary |
| IP-002 | Roundtable agent (summary generation) | User (via relay) | RETURN-FOR-INPUT text | Natural language with Accept/Amend options | User input parsing: Accept or Amend, no other states |
| IP-003 | Roundtable agent (amendment) | Roundtable conversation | Internal state transition | Conversation context | Amendment uses existing conversation flow; no new error paths |
| IP-004 | Roundtable agent (persistence) | Summary artifact files | File write | Markdown | Write failure logged; analysis still completes (summaries are Should Have) |
| IP-005 | Roundtable agent (acceptance state) | meta.json | File write (JSON merge) | JSON | Acceptance field added; existing fields preserved |

### Data Flow

```
Coverage Complete
    |
    v
[Read detailed artifacts from disk]
    |
    v
[Generate requirements summary] --> Cache in memory
    |
    v
[Present to user via RETURN-FOR-INPUT]
    |
    +-- User: Accept --> [Generate architecture summary] --> Cache
    |                        |
    |                        +-- User: Accept --> [Generate design summary] --> Cache
    |                        |                        |
    |                        |                        +-- User: Accept --> [Persist summaries]
    |                        |                        |                        |
    |                        |                        |                        v
    |                        |                        |                   [Update meta.json]
    |                        |                        |                        |
    |                        |                        |                        v
    |                        |                        |                   ROUNDTABLE_COMPLETE
    |                        |                        |
    |                        |                        +-- User: Amend --> [Full roundtable conversation]
    |                        |                                                |
    |                        |                                                v
    |                        |                                           [Update artifacts]
    |                        |                                                |
    |                        |                                                v
    |                        |                                           [Restart from requirements summary]
    |                        |
    |                        +-- User: Amend --> [Full roundtable conversation] --> [Restart]
    |
    +-- User: Amend --> [Full roundtable conversation] --> [Restart]
```

### Synchronization Model

The confirmation sequence is strictly sequential and single-threaded within the roundtable agent. There are no concurrency concerns:
- One summary presented at a time
- One user response processed at a time
- Amendment conversations are single-threaded (same as regular roundtable conversation)
- Summary persistence happens only after full acceptance (no race conditions)

## 5. Summary

The architecture is minimal and well-contained. The confirmation sequence is a state machine within the existing roundtable agent, using the existing RETURN-FOR-INPUT pattern for user interaction. No new agents, no relay changes, no build flow modifications.

### Key Decisions

| Decision | Choice | Impact |
|----------|--------|--------|
| Confirmation location | Inside roundtable agent | Relay unchanged; agent owns experience |
| Amendment re-entry | Resume existing conversation | Context preserved; no cold start |
| Summary generation | From artifacts at confirmation time | Single source of truth |
| Amendment restart | Full sequence from requirements | Simple implementation; complete user view |
| Summary persistence | Cache then persist on acceptance | Fast during confirmation; available on revisit |

### Trade-offs

| Trade-off | Accepted Cost | Gained Benefit |
|-----------|--------------|----------------|
| Full restart on amendment | User re-confirms already-accepted summaries | Simpler implementation; no ripple tracking; complete context |
| Summaries generated from artifacts (not incremental) | Small generation cost at confirmation time | Always up-to-date; no sync issues; single source of truth |
| No Critic/Refiner pass | Summaries show raw conversation output, not refined | Smaller scope; can be layered on later independently |
