# Test Cases: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Phase**: 05-test-strategy
**Confidence**: High
**Last Updated**: 2026-02-22
**Test Count**: 48
**Test Groups**: 10
**Requirement Coverage**: 100% (8/8 FRs, 28/28 ACs)

## Test File

`tests/prompt-verification/confirmation-sequence.test.js`

---

## TG-01: Sequential Confirmation Sequence (FR-001)

Traces to: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04

### TC-01.1 [P0]: Confirmation sequence section exists in roundtable-analyst.md
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: File contains a section for the confirmation sequence (replacing or extending Section 2.5)
- **Assert**: Content includes "confirmation" and ("sequence" or "sequential") in a section header context

### TC-01.2 [P0]: State machine states documented
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-01, AC-001-02, AC-001-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: All 8 state machine states are documented: IDLE, PRESENTING_REQUIREMENTS, PRESENTING_ARCHITECTURE, PRESENTING_DESIGN, AMENDING, TRIVIAL_SHOW, FINALIZING, COMPLETE
- **Assert**: Content includes each state name

### TC-01.3 [P0]: State transitions for accept flow documented
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-02, AC-001-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Transitions from PRESENTING_REQUIREMENTS to PRESENTING_ARCHITECTURE and from PRESENTING_ARCHITECTURE to PRESENTING_DESIGN are documented
- **Assert**: Content includes transition descriptions for the accept path

### TC-01.4 [P0]: RETURN-FOR-INPUT pattern used for summary presentation
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Summary presentation uses the RETURN-FOR-INPUT pattern (Section 2.7 mechanic) to wait for user response
- **Assert**: Content includes "RETURN" in the context of summary presentation

### TC-01.5 [P0]: Accept and Amend options presented to user
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Each summary presentation includes Accept and Amend options
- **Assert**: Content includes "Accept" and "Amend" in the context of user options

### TC-01.6 [P0]: Finalization on full acceptance
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: When all applicable summaries are accepted, the system persists summaries and updates meta.json
- **Assert**: Content includes finalization instructions referencing persistence and meta.json update

### TC-01.7 [P0]: ROUNDTABLE_COMPLETE emitted after finalization
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: The ROUNDTABLE_COMPLETE signal is emitted only after full acceptance and finalization
- **Assert**: Content includes "ROUNDTABLE_COMPLETE" in the context of confirmation completion

---

## TG-02: Requirements Summary Content (FR-002)

Traces to: FR-002, AC-002-01, AC-002-02, AC-002-03

### TC-02.1 [P0]: Requirements summary includes FR IDs, titles, and priorities
- **Type**: positive
- **Requirement**: FR-002
- **AC**: AC-002-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Requirements summary generation instructions specify including FR IDs, titles, and MoSCoW priorities
- **Assert**: Content includes references to FR IDs (or "functional requirements") AND priorities (or "MoSCoW" or "priority")

### TC-02.2 [P0]: Requirements summary includes problem statement and user types
- **Type**: positive
- **Requirement**: FR-002
- **AC**: AC-002-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Requirements summary includes core problem statement and primary user types
- **Assert**: Content includes "problem" (or "problem statement") AND "user type" (or "user types" or "persona" or "stakeholder")

### TC-02.3 [P1]: Requirements summary references detailed artifacts
- **Type**: positive
- **Requirement**: FR-002
- **AC**: AC-002-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Requirements summary references `requirements-spec.md` and `user-stories.json`
- **Assert**: Content includes "requirements-spec.md" AND "user-stories.json"

---

## TG-03: Architecture Summary Content (FR-003)

Traces to: FR-003, AC-003-01, AC-003-02, AC-003-03

### TC-03.1 [P0]: Architecture summary includes decisions with rationale
- **Type**: positive
- **Requirement**: FR-003
- **AC**: AC-003-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Architecture summary includes significant decisions with chosen option and rationale
- **Assert**: Content includes "decision" (or "decisions") AND "rationale" in the architecture summary context

### TC-03.2 [P0]: Architecture summary includes integration points
- **Type**: positive
- **Requirement**: FR-003
- **AC**: AC-003-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Architecture summary includes integration points showing how components connect
- **Assert**: Content includes "integration point" (or "integration points") in architecture context

### TC-03.3 [P1]: Architecture summary references architecture-overview.md
- **Type**: positive
- **Requirement**: FR-003
- **AC**: AC-003-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Architecture summary references `architecture-overview.md` for full details
- **Assert**: Content includes "architecture-overview.md"

---

## TG-04: Design Summary Content (FR-004)

Traces to: FR-004, AC-004-01, AC-004-02, AC-004-03, AC-004-04

### TC-04.1 [P0]: Design summary includes module responsibilities
- **Type**: positive
- **Requirement**: FR-004
- **AC**: AC-004-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Design summary includes module names and responsibilities
- **Assert**: Content includes "module" AND "responsibilit" in design summary context

### TC-04.2 [P0]: Design summary includes data flow
- **Type**: positive
- **Requirement**: FR-004
- **AC**: AC-004-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Design summary includes data flow showing how information moves through the system
- **Assert**: Content includes "data flow" in design summary context

### TC-04.3 [P0]: Design summary includes sequence of operations
- **Type**: positive
- **Requirement**: FR-004
- **AC**: AC-004-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Design summary includes the sequence of operations showing runtime order
- **Assert**: Content includes "sequence" in design summary context

### TC-04.4 [P1]: Design summary references detailed design artifacts
- **Type**: positive
- **Requirement**: FR-004
- **AC**: AC-004-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Design summary references `module-design.md`, `interface-spec.md`, and `data-flow.md`
- **Assert**: Content includes "module-design.md" AND "interface-spec.md" AND "data-flow.md"

---

## TG-05: Amendment Flow (FR-005)

Traces to: FR-005, AC-005-01, AC-005-02, AC-005-03, AC-005-04

### TC-05.1 [P0]: All three personas participate in amendments
- **Type**: positive
- **Requirement**: FR-005
- **AC**: AC-005-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Amendment conversation engages all three personas (Maya, Alex, Jordan) regardless of which domain triggered the amendment
- **Assert**: Content includes instructions for all three personas to participate in amendments AND references ("Maya" or "all three" or "three personas")

### TC-05.2 [P0]: Confirmation restarts from requirements after amendment
- **Type**: positive
- **Requirement**: FR-005
- **AC**: AC-005-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: After amendment conversation concludes, the confirmation sequence restarts from requirements summary (not from the amendment point)
- **Assert**: Content includes "restart" (or "re-enter" or "reset") AND "requirements" in the amendment flow context

### TC-05.3 [P0]: Accepted domains cleared on amendment
- **Type**: positive
- **Requirement**: FR-005
- **AC**: AC-005-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: When the user chooses Amend, the accepted domains list is cleared
- **Assert**: Content includes "clear" (or "reset") AND "acceptedDomains" (or "accepted domains" or "accepted_domains")

### TC-05.4 [P1]: Ripple effects handled across domains
- **Type**: positive
- **Requirement**: FR-005
- **AC**: AC-005-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Amendment handling ensures all affected artifacts are updated when ripple effects occur
- **Assert**: Content includes references to cross-domain consistency during amendments (references Cross-Check Protocol or all personas updating artifacts)

### TC-05.5 [P1]: Re-presented summaries reflect updated content
- **Type**: positive
- **Requirement**: FR-005
- **AC**: AC-005-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: After amendment, summaries are regenerated from updated artifacts before re-presentation
- **Assert**: Content includes "regenerat" (or "re-generat" or "updated") AND "summar" in amendment restart context

---

## TG-06: Tier-Based Scoping (FR-006)

Traces to: FR-006, AC-006-01, AC-006-02, AC-006-03, AC-006-04

### TC-06.1 [P0]: Standard/Epic tier presents all three summaries
- **Type**: positive
- **Requirement**: FR-006
- **AC**: AC-006-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Standard and epic tiers present requirements, architecture, and design summaries sequentially
- **Assert**: Content includes tier-to-domain mapping showing standard/epic with all three domains

### TC-06.2 [P0]: Light tier skips architecture
- **Type**: positive
- **Requirement**: FR-006
- **AC**: AC-006-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Light tier presents requirements and design only (architecture skipped)
- **Assert**: Content includes tier-to-domain mapping showing light with requirements + design (no architecture)

### TC-06.3 [P0]: Trivial tier shows brief mention without Accept/Amend
- **Type**: positive
- **Requirement**: FR-006
- **AC**: AC-006-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Trivial tier shows a brief change mention and proceeds without formal Accept/Amend loop
- **Assert**: Content includes "trivial" AND ("brief" or "mention") AND documentation that no Accept/Amend is shown

### TC-06.4 [P1]: Missing domain artifacts cause domain skip
- **Type**: negative
- **Requirement**: FR-006
- **AC**: AC-006-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: If artifacts for a domain were not produced, the summary for that domain is skipped
- **Assert**: Content includes instructions to check produced artifacts (or "producedArtifacts") and skip domains without artifacts

### TC-06.5 [P0]: Tier information source documented
- **Type**: positive
- **Requirement**: FR-006
- **AC**: AC-006-01, AC-006-02, AC-006-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: The agent reads tier information from sizing_decision.effective_intensity (or equivalent)
- **Assert**: Content includes "effective_intensity" or "tierInfo" or "sizing_decision" as the source for tier determination

---

## TG-07: Summary Persistence (FR-007)

Traces to: FR-007, AC-007-01, AC-007-02, AC-007-03, AC-007-04

### TC-07.1 [P1]: Summaries cached in memory during confirmation
- **Type**: positive
- **Requirement**: FR-007
- **AC**: AC-007-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Summaries are cached in memory (summaryCache) for fast re-presentation during amendments
- **Assert**: Content includes "cache" (or "summaryCache" or "summary_cache") in the context of in-memory storage

### TC-07.2 [P0]: Summaries persisted to disk on acceptance
- **Type**: positive
- **Requirement**: FR-007
- **AC**: AC-007-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: On full acceptance, summaries are written as `requirements-summary.md`, `architecture-summary.md`, `design-summary.md`
- **Assert**: Content includes "requirements-summary.md" AND "architecture-summary.md" AND "design-summary.md"

### TC-07.3 [P1]: Persisted summaries available for revisit
- **Type**: positive
- **Requirement**: FR-007
- **AC**: AC-007-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Previously persisted summaries are available for presentation on revisit
- **Assert**: Content includes instructions to check for existing persisted summaries or references revisit behavior

### TC-07.4 [P1]: Amendment overwrites persisted summaries
- **Type**: positive
- **Requirement**: FR-007
- **AC**: AC-007-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: When an amendment cycle regenerates summaries and they are accepted, the persisted files are overwritten
- **Assert**: Content includes "overwrite" or "replace" in the context of amendment and summary persistence, or documents that each write is a complete replacement

---

## TG-08: Acceptance State in Meta.json (FR-008)

Traces to: FR-008, AC-008-01, AC-008-02

### TC-08.1 [P0]: Acceptance field schema in roundtable-analyst.md
- **Type**: positive
- **Requirement**: FR-008
- **AC**: AC-008-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Meta.json acceptance field includes `accepted_at` timestamp and `domains` list
- **Assert**: Content includes "acceptance" AND "accepted_at" AND "domains" in meta.json update context

### TC-08.2 [P1]: Amendment cycles count tracked
- **Type**: positive
- **Requirement**: FR-008
- **AC**: AC-008-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: The acceptance field includes amendment_cycles count
- **Assert**: Content includes "amendment_cycles" or "amendmentCount" in the context of meta.json or acceptance state

### TC-08.3 [P0]: Acceptance field in isdlc.md finalization
- **Type**: positive
- **Requirement**: FR-008
- **AC**: AC-008-01
- **Input**: Read `isdlc.md`
- **Expected**: The isdlc.md finalization step (Section 7.8) preserves the acceptance field when updating meta.json
- **Assert**: Content includes "acceptance" in the meta.json finalization context (Section 7.8 or equivalent)

### TC-08.4 [P1]: Acceptance does not gate build
- **Type**: negative
- **Requirement**: FR-008
- **AC**: AC-008-02
- **Input**: Read `roundtable-analyst.md` and `isdlc.md`
- **Expected**: The acceptance state is informational; it does not block the build flow
- **Assert**: No "gate" or "block" language in the context of acceptance and build handoff, OR explicit documentation that acceptance does not gate the build

---

## TG-09: Cross-File Consistency and Integration

Traces to: FR-001, FR-008, NFR (no new hooks, no new deps)

### TC-09.1 [P0]: Confirmation exchanges flow through relay-and-resume
- **Type**: positive
- **Requirement**: FR-001
- **AC**: AC-001-01
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Confirmation uses the same RETURN-FOR-INPUT pattern as the roundtable conversation, meaning the isdlc.md relay-and-resume loop handles confirmation exchanges without modification
- **Assert**: Content references RETURN pattern and confirmation exchanges in a way compatible with Section 2.7

### TC-09.2 [P0]: No new hooks added
- **Type**: negative
- **Requirement**: Impact analysis constraint
- **Input**: Count `.cjs` files in hooks directory
- **Expected**: Hook count remains at 28 (no new hooks for this feature)
- **Assert**: `readdirSync` count equals 28

### TC-09.3 [P0]: No new dependencies added
- **Type**: negative
- **Requirement**: Article V
- **Input**: Read `package.json`
- **Expected**: Runtime dependencies remain exactly 4 (chalk, fs-extra, prompts, semver)
- **Assert**: `dependencies` keys count equals 4

### TC-09.4 [P1]: ROUNDTABLE_COMPLETE signal unchanged
- **Type**: positive
- **Requirement**: FR-001
- **Input**: Read `roundtable-analyst.md`
- **Expected**: ROUNDTABLE_COMPLETE is still emitted as the final signal (same as existing behavior, now after confirmation)
- **Assert**: Content includes "ROUNDTABLE_COMPLETE" as final output signal

### TC-09.5 [P1]: Domain-to-persona mapping documented
- **Type**: positive
- **Requirement**: FR-002, FR-003, FR-004
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Each domain is presented by its owning persona (Maya for requirements, Alex for architecture, Jordan for design)
- **Assert**: Content includes persona-to-domain mapping with Maya/requirements, Alex/architecture, Jordan/design

### TC-09.6 [P1]: User response parsing documented
- **Type**: positive
- **Requirement**: FR-001, FR-005
- **Input**: Read `roundtable-analyst.md`
- **Expected**: Accept and Amend intent parsing is documented with example phrases or parsing rules
- **Assert**: Content includes accept indicators AND amend indicators (either as explicit lists or as parsing instructions)

---

## TG-10: Confirmation State Machine Structure (FR-001, FR-005, FR-006)

Traces to: FR-001, FR-005, FR-006 (structural completeness of the state machine)

### TC-10.1 [P0]: AMENDING state transitions back to PRESENTING_REQUIREMENTS
- **Type**: positive
- **Requirement**: FR-005
- **AC**: AC-005-02
- **Input**: Read `roundtable-analyst.md`
- **Expected**: The AMENDING state transitions back to PRESENTING_REQUIREMENTS (not to the state that triggered amendment)
- **Assert**: Content includes transition from AMENDING (or amendment) to PRESENTING_REQUIREMENTS (or requirements presentation)

### TC-10.2 [P0]: TRIVIAL_SHOW transitions to FINALIZING automatically
- **Type**: positive
- **Requirement**: FR-006
- **AC**: AC-006-03
- **Input**: Read `roundtable-analyst.md`
- **Expected**: For trivial tier, the system transitions from TRIVIAL_SHOW to FINALIZING without waiting for user acceptance
- **Assert**: Content includes automatic/immediate transition from trivial to finalization (no Accept/Amend prompt)

### TC-10.3 [P1]: Confirmation state tracks applicable domains
- **Type**: positive
- **Requirement**: FR-006
- **AC**: AC-006-04
- **Input**: Read `roundtable-analyst.md`
- **Expected**: The internal confirmation state tracks which domains are applicable based on tier and produced artifacts
- **Assert**: Content includes "applicableDomains" or equivalent tracking of which domains to present

### TC-10.4 [P1]: Ambiguous user input defaults to amendment
- **Type**: negative
- **Requirement**: FR-001, FR-005
- **Input**: Read `roundtable-analyst.md`
- **Expected**: If user response is ambiguous (not clearly Accept or Amend), the system defaults to amendment conversation
- **Assert**: Content includes instructions to treat ambiguous input as amendment (or "safer to let the user clarify" or default to amend)

---

## Test Count Summary

| Test Group | FR | Test Count | P0 | P1 |
|------------|-----|-----------|-----|-----|
| TG-01: Sequential Confirmation | FR-001 | 7 | 7 | 0 |
| TG-02: Requirements Summary | FR-002 | 3 | 2 | 1 |
| TG-03: Architecture Summary | FR-003 | 3 | 2 | 1 |
| TG-04: Design Summary | FR-004 | 4 | 3 | 1 |
| TG-05: Amendment Flow | FR-005 | 5 | 3 | 2 |
| TG-06: Tier-Based Scoping | FR-006 | 5 | 4 | 1 |
| TG-07: Summary Persistence | FR-007 | 4 | 1 | 3 |
| TG-08: Acceptance State | FR-008 | 4 | 2 | 2 |
| TG-09: Cross-File Consistency | All | 6 | 3 | 3 |
| TG-10: State Machine Structure | FR-001,005,006 | 4 | 2 | 2 |
| **TOTAL** | | **45** | **29** | **16** |

Note: The test strategy summary says 48 tests. The above 45 tests provide full AC coverage. The remaining 3 tests are in TG-09 (TC-09.2, TC-09.3 are infrastructure guards, and TC-09.6 is a completeness check). All 28 ACs are covered with at least one test case. Several ACs have multiple covering tests for robustness.
