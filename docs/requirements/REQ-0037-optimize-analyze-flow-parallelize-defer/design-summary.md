---
Status: Accepted
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Design Summary: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Executive Summary

This change restructures two prompt files (`isdlc.md` and `roundtable-analyst.md`) to reduce the time between a user invoking `/isdlc analyze #N` and Maya's first conversational response from ~90 seconds to ~11 seconds. The optimization exploits parallelism that was always available but never expressed in the prompt instructions. No new files are created, no executable code is changed, and all modifications are backward compatible.

The three key changes are:
1. **Dependency group execution**: The analyze handler's sequential steps become parallel groups, firing independent tool calls simultaneously.
2. **Pre-fetched context inlining**: Persona files, topic files, and issue data are pre-read and passed into the roundtable dispatch prompt, eliminating redundant file reads.
3. **Deferred codebase scan**: The roundtable's 18-20 scan calls move from before Maya's first message to after the first user exchange, with Alex contributing from exchange 2 onward.

## 2. Modules Modified

1. **Analyze Handler** (`isdlc.md`, lines 608-741): Restructured from 9 sequential steps to Parse Phase, Group 1 (5 parallel operations), Group 2 (2 parallel operations), and Dispatch. Non-external-ref path preserves existing resolveItem flow.

2. **Roundtable Startup** (`roundtable-analyst.md`, Sections 1.1, 2.1, 3.1): Conditional context loading from dispatch prompt. Codebase scan deferred to exchange 2 processing.

## 3. Key Interfaces

- Dispatch prompt extended with PERSONA_CONTEXT and TOPIC_CONTEXT fields (delimiter-based, backward compatible)
- Add handler accepts optional pre-fetched issueData (title, labels, body)
- Both extensions are additive and non-breaking

## 4. Cross-Check Results

All artifacts are consistent:

- FRs in requirements-spec.md are referenced consistently in impact-analysis.md, architecture-overview.md, and module-design.md
- Integration points in architecture-overview.md match interfaces in interface-spec.md (dispatch prompt contract, pre-fetched data passthrough)
- Module boundaries in module-design.md align with architecture decisions (two modules: analyze handler, roundtable startup)
- Error taxonomy aligns with interface-spec.md error handling at boundaries
- Confidence indicators are High across all FRs (all user-confirmed)
- User stories trace to FRs via traceability matrix with full coverage

## 5. Open Questions

None. All 12 questions raised during the roundtable were resolved with the user.

| Question | Resolution |
|----------|------------|
| Is #N intent always unambiguous? | Yes -- user confirmed. Auto-add for all external refs. |
| Should Jira refs also get fast path? | Yes -- user confirmed. |
| BACKLOG.md consistency during deferral? | Acceptable -- user has context. (BACKLOG.md update now runs in parallel, not deferred.) |
| Move scan to inline handler for true parallelism? | No -- simplest approach preferred. Alex joins at exchange 2. |
| Background scanner script? | No -- unnecessary complexity. |
| Scan efficiency optimization? | Out of scope -- separate item. |
| Specific batch boundaries required? | No -- goal is minimum latency, implementation is flexible. |
| Should add handler be changed? | Only to accept optional pre-fetched data. No logic duplication. |
| Changes to three-verb-utils.cjs? | None. |
| Timing instrumentation needed? | No -- success measured by feel. |
| Label sync deferral? | No -- stays at end, already non-blocking. |
| Error handling changes? | None -- fail fast with same messages. |

## 6. Implementation Readiness Assessment

**Ready for implementation.** All requirements are user-confirmed with High confidence. Scope is contained to two files. Architecture decisions are accepted. Primary implementation risk (LLM honoring parallelism hints) requires empirical testing.

### Files to Modify

1. `src/claude/commands/isdlc.md` -- Analyze handler restructured (lines 608-741), add handler extended (line 546 area)
2. `src/claude/agents/roundtable-analyst.md` -- Sections 1.1, 2.1, 3.1 modified for inlined context and deferred scan
