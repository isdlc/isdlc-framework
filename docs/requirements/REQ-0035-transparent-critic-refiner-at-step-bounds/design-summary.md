# Design Summary: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## Executive Summary

This feature adds a sequential confirmation sequence to the end of the roundtable analysis flow. After the fluid conversation produces artifacts, the user is presented with summaries of requirements, architecture, and design for explicit acceptance before the analysis closes. Amendments reopen the full roundtable conversation and restart the confirmation sequence from the top.

The implementation is contained within `roundtable-analyst.md` (new confirmation state machine) and `meta.json` (new acceptance field). No changes to the build flow, no new agents, no new hooks, no config changes.

## Module Summary

| Module | Responsibility | New/Modified |
|--------|---------------|--------------|
| Confirmation Sequence Controller | Sequential summary presentation, Accept/Amend handling, amendment re-entry, summary persistence | New (within existing `roundtable-analyst.md`) |

## Data Flow

The confirmation sequence reads detailed artifacts from disk, generates conversational summaries, presents them to the user one at a time (requirements, then architecture, then design), and collects Accept/Amend responses. On full acceptance, summaries are persisted as standalone markdown files and meta.json is updated with an acceptance record.

```
Detailed Artifacts --> Summary Generation --> Cache --> Present to User
                                                           |
                                                    Accept / Amend
                                                    /            \
                                              Next domain    Reopen conversation
                                              or finalize    (all 3 personas)
                                                    |              |
                                              Persist summaries   Update artifacts
                                              Update meta.json    Restart from top
                                                    |
                                              ROUNDTABLE_COMPLETE
```

Amendment at any point clears all previous acceptances and restarts from the requirements summary, ensuring the user always sees a consistent, complete view.

## Sequence of Operations

### Happy Path (Accept All)

1. Coverage tracker signals completion
2. System determines applicable domains based on tier and produced artifacts
3. Read `requirements-spec.md` and `user-stories.json`
4. Generate requirements summary, cache it
5. Maya presents requirements summary to user via RETURN-FOR-INPUT
6. User responds with Accept
7. Read `architecture-overview.md` (if applicable)
8. Generate architecture summary, cache it
9. Alex presents architecture summary to user via RETURN-FOR-INPUT
10. User responds with Accept
11. Read `module-design.md`, `interface-spec.md`, `data-flow.md` (if applicable)
12. Generate design summary, cache it
13. Jordan presents design summary to user via RETURN-FOR-INPUT
14. User responds with Accept
15. Persist all summaries to disk as `*-summary.md` files
16. Update meta.json with acceptance state
17. Emit ROUNDTABLE_COMPLETE

### Amendment Path

1. Steps 1-5 as above
2. User responds with Amend
3. Clear all accepted domains and cached summaries
4. Re-enter roundtable conversation with all three personas
5. User discusses changes; artifacts updated progressively
6. User signals amendment is complete
7. Restart from step 3 (regenerate all summaries from updated artifacts)
8. Continue until all applicable domains are accepted

### Trivial Path

1. Coverage tracker signals completion
2. Tier is trivial
3. Generate brief change mention
4. Present to user (no Accept/Amend)
5. Persist minimal summary
6. Emit ROUNDTABLE_COMPLETE

## Cross-Check Results

- All FRs (FR-001 through FR-008) are addressed in the module design
- The state machine transitions cover all possible user responses (Accept, Amend, ambiguous)
- The tier-based scoping (FR-006) maps correctly to domain selection logic
- Summary content requirements (FR-002, FR-003, FR-004) are specified in the artifact-to-summary transformation table
- The amendment flow (FR-005) correctly clears state and restarts from requirements
- Error handling follows log-and-continue strategy; no failure blocks analysis completion

## Open Questions

| ID | Question | Impact | Resolution Path |
|----|----------|--------|-----------------|
| OQ-001 | Should the Critic/Refiner pass run before presenting summaries? | Would improve summary quality by catching mechanical issues before user review | Deferred to separate GH ticket. Current feature presents raw conversation output. |
| OQ-002 | Should the build flow check for acceptance state before consuming artifacts? | Would add a quality gate ensuring artifacts were human-reviewed | Deferred. Current analyze-to-build handoff is unchanged. |

## Implementation Readiness

**Ready for implementation**: Yes

**Prerequisites**: None. The roundtable analyst and analyze verb already exist. All changes are additive.

**Key implementation guidance**:
1. Replace Section 2.5 of `roundtable-analyst.md` with the confirmation sequence specification
2. Add a new Section (e.g., 2.8) defining the state machine, summary generation, and amendment flow
3. Update Section 5.3 (Cross-Check Protocol) to note it also runs during amendment cycles
4. Update Section 8 (Meta.json Protocol) to include the acceptance field
5. No changes needed to `isdlc.md` -- the relay-and-resume loop handles confirmation exchanges transparently

**Estimated effort**: Small-Medium. The state machine logic is straightforward; summary generation is the main implementation work (reading artifacts and composing conversational summaries).
