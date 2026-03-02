# Requirements Specification: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## 1. Business Context

### Problem Statement

The roundtable analysis flow (Phase A) produces requirements, architecture, and design artifacts through a fluid conversation, but closes without giving the user a chance to review and confirm what was decided. Artifacts are written progressively to disk, and the user sees only a list of file names and statuses at completion. This creates a trust gap -- the user must go read individual files to verify the analysis captured their intent correctly.

### Stakeholders

| Stakeholder | Role | Interest |
|-------------|------|----------|
| Framework User | Primary user running `/isdlc analyze` | Wants to confirm analysis output before it becomes the basis for implementation |
| Framework Developer | Maintainer of iSDLC | Wants the confirmation flow to be simple, maintainable, and consistent across tiers |

### Success Metrics

- Users see a substantive summary of what was analyzed before Phase A closes
- Users have an explicit Accept/Amend choice on requirements, architecture, and design
- Amendment conversations keep all three domains aligned
- Summaries are persisted for fast re-presentation on revisit

### Driving Factors

- Trust: Users need to validate that the analysis captured their intent
- Quality: A review checkpoint catches misunderstandings before they propagate to implementation
- Consistency: The confirmation experience should work across all analysis tiers (trivial, light, standard/epic)

## 2. Stakeholders and Personas

### 2.1 Framework User (Primary)

- **Role**: Developer, tech lead, or product owner using iSDLC to analyze a feature or change
- **Goals**: Confirm that analysis artifacts accurately reflect their intent before moving to implementation
- **Pain Points**: Currently must read raw artifact files to verify analysis output; no review checkpoint exists
- **Proficiency**: Varies -- may be technical or non-technical
- **Tasks**: Runs `/isdlc analyze`, participates in roundtable conversation, reviews summaries, accepts or amends

## 3. User Journeys

### 3.1 Standard/Epic Analysis with Full Acceptance

- **Entry**: Roundtable conversation reaches coverage completion
- **Flow**:
  1. System presents requirements summary with key FRs, priorities, and ACs
  2. User reviews and chooses Accept
  3. System presents architecture summary with key decisions and integration points
  4. User reviews and chooses Accept
  5. System presents design summary with module responsibilities, data flow, and sequence
  6. User reviews and chooses Accept
  7. Summaries are persisted to disk, meta.json updated with acceptance state, analysis closes
- **Exit**: Analysis complete, artifacts and summaries written, ready for build

### 3.2 Standard/Epic Analysis with Amendment

- **Entry**: User chooses Amend on any summary
- **Flow**:
  1. Roundtable conversation reopens with all three personas (Maya, Alex, Jordan)
  2. User discusses changes; all three personas participate to keep domains aligned
  3. Artifacts are updated based on the amendment conversation
  4. Confirmation sequence restarts from requirements summary
  5. User reviews each summary again (requirements, architecture, design)
  6. User accepts all three
- **Exit**: Analysis complete with amended artifacts

### 3.3 Light Analysis

- **Entry**: Roundtable conversation reaches coverage completion under light tier
- **Flow**:
  1. System presents requirements summary. User accepts or amends.
  2. System presents design summary (architecture skipped). User accepts or amends.
  3. If amend at any point: full roundtable conversation, then restart from requirements.
- **Exit**: Analysis complete

### 3.4 Trivial Analysis

- **Entry**: Roundtable conversation reaches coverage completion under trivial tier
- **Flow**:
  1. System presents a brief mention of what is going to change
  2. No formal Accept/Amend -- system proceeds
- **Exit**: Analysis complete

### 3.5 Revisit After Previous Acceptance

- **Entry**: User runs `/isdlc analyze` on a previously analyzed item (codebase unchanged)
- **Flow**:
  1. System detects analysis is complete and current
  2. Persisted summaries are available for immediate presentation if user wants to review
- **Exit**: User confirms or re-analyzes

## 4. Technical Context

### Constraints

- No changes to the build flow (Phase B). The sequential phase execution, debate loop, and gate infrastructure are untouched.
- No `state.json` writes. All tracking via `meta.json` only.
- No branch creation. Analysis operates on the current branch.
- The confirmation sequence runs within the existing roundtable relay-and-resume loop in `isdlc.md`.
- Summary generation must be fast enough to avoid perceived sluggishness after the conversation ends.

### Conventions

- Summaries are standalone markdown documents stored in `docs/requirements/{slug}/`
- Summaries reference detailed artifacts for deeper inspection
- The roundtable analyst agent manages the confirmation sequence internally
- The analyze verb orchestrator (`isdlc.md`) relays the confirmation exchanges like any other roundtable exchange

### Integration Points

- `roundtable-analyst.md` -- Section 2.5 (Completion Detection) is replaced by the confirmation sequence
- `roundtable-analyst.md` -- Section 5.3 (Cross-Check Protocol) continues to run during amendment cycles
- `isdlc.md` -- Section 7b (relay-and-resume loop) unchanged; confirmation exchanges flow through the same relay
- `meta.json` -- New `acceptance` field to record confirmation state

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Usability | Critical | Summaries must be comprehensible without reading detailed artifacts |
| Performance | High | Summary generation and presentation must feel instant (sub-2s perceived latency) |
| Consistency | High | Confirmation experience must be uniform across tiers (with appropriate scoping) |
| Maintainability | Medium | Confirmation sequence logic should be self-contained in the roundtable analyst |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Amendment loops -- user bounces endlessly between Accept and Amend | Low | Medium | User controls the loop; they can Accept at any point to break out. Practical users converge naturally. |
| Summary content too shallow -- user accepts without catching issues | Medium | Medium | Include key FRs with priorities, architecture decisions with tradeoffs, data flow and sequence in design. Enough substance for meaningful review. |
| Summary content too deep -- becomes artifact walkthrough | Medium | Low | Summaries are conversational, not document reviews. Paragraph-level, not section-level. |
| Amendment ripple inconsistency -- architecture amend invalidates accepted requirements | Medium | High | All three personas participate in every amendment. Full sequence restarts from requirements after any amendment. |
| Performance -- summary generation adds noticeable delay | Low | Medium | Cache summaries in memory during confirmation. Persist only on full acceptance. |

## 6. Functional Requirements

### FR-001: Sequential Confirmation Sequence

**Description**: After the roundtable conversation reaches coverage completion, the system enters a sequential confirmation sequence presenting summaries of requirements, architecture (if applicable), and design (if applicable) to the user for explicit acceptance.

**Confidence**: High

**Acceptance Criteria**:

- **AC-001-01**: Given the roundtable conversation has reached coverage completion, when completion is detected, then the system presents a requirements summary to the user with Accept and Amend options.
- **AC-001-02**: Given the user accepts the requirements summary, when architecture artifacts were produced, then the system presents an architecture summary with Accept and Amend options.
- **AC-001-03**: Given the user accepts the architecture summary (or architecture was not produced), when design artifacts were produced, then the system presents a design summary with Accept and Amend options.
- **AC-001-04**: Given the user accepts all applicable summaries, then the analysis is marked complete, summaries are persisted to disk, and meta.json is updated with acceptance state.

### FR-002: Requirements Summary Content

**Description**: The requirements summary presents the substance of what was captured -- functional requirements with priorities and key acceptance criteria -- not a file listing.

**Confidence**: High

**Acceptance Criteria**:

- **AC-002-01**: Given requirements artifacts have been produced, when the requirements summary is presented, then it includes the list of functional requirements with their FR IDs, titles, and MoSCoW priorities.
- **AC-002-02**: Given requirements artifacts have been produced, when the requirements summary is presented, then it includes the core problem statement and primary user types.
- **AC-002-03**: Given requirements artifacts have been produced, when the requirements summary is presented, then it references the detailed artifacts (`requirements-spec.md`, `user-stories.json`) for further inspection.

### FR-003: Architecture Summary Content

**Description**: The architecture summary presents the key decisions, tradeoffs considered, and integration points.

**Confidence**: High

**Acceptance Criteria**:

- **AC-003-01**: Given architecture artifacts have been produced, when the architecture summary is presented, then it includes each significant architecture decision with the chosen option and rationale.
- **AC-003-02**: Given architecture artifacts have been produced, when the architecture summary is presented, then it includes integration points showing how components connect.
- **AC-003-03**: Given architecture artifacts have been produced, when the architecture summary is presented, then it references `architecture-overview.md` for full details.

### FR-004: Design Summary Content

**Description**: The design summary presents module responsibilities, data flow, and sequence of operations.

**Confidence**: High

**Acceptance Criteria**:

- **AC-004-01**: Given design artifacts have been produced, when the design summary is presented, then it includes module names and their responsibilities.
- **AC-004-02**: Given design artifacts have been produced, when the design summary is presented, then it includes the data flow showing how information moves through the system.
- **AC-004-03**: Given design artifacts have been produced, when the design summary is presented, then it includes the sequence of operations showing runtime order.
- **AC-004-04**: Given design artifacts have been produced, when the design summary is presented, then it references the detailed design artifacts (`module-design.md`, `interface-spec.md`, `data-flow.md`) for full specifications.

### FR-005: Amendment Flow

**Description**: When the user chooses Amend on any summary, the roundtable conversation reopens with all three personas. After the amendment conversation, the full confirmation sequence restarts from the requirements summary.

**Confidence**: High

**Acceptance Criteria**:

- **AC-005-01**: Given the user chooses Amend on any summary, when the amendment conversation opens, then all three personas (Maya, Alex, Jordan) participate regardless of which domain triggered the amendment.
- **AC-005-02**: Given an amendment conversation has concluded, when the confirmation sequence resumes, then it restarts from the requirements summary (not from the point of amendment).
- **AC-005-03**: Given an amendment to architecture or design has ripple effects on requirements, when artifacts are updated, then all affected artifacts are updated to maintain consistency.
- **AC-005-04**: Given the user amends and the sequence restarts, when the summaries are re-presented, then they reflect the updated artifact content.

### FR-006: Tier-Based Scoping

**Description**: The confirmation sequence adapts to the analysis tier, presenting only the summaries relevant to what was produced.

**Confidence**: High

**Acceptance Criteria**:

- **AC-006-01**: Given a standard or epic tier analysis, when the confirmation sequence runs, then summaries for requirements, architecture, and design are all presented sequentially.
- **AC-006-02**: Given a light tier analysis, when the confirmation sequence runs, then summaries for requirements and design are presented (architecture is skipped).
- **AC-006-03**: Given a trivial tier analysis, when the confirmation sequence runs, then a brief mention of what is changing is shown and the system proceeds without a formal Accept/Amend loop.
- **AC-006-04**: Given any tier, when artifacts for a domain were not produced, then the summary for that domain is skipped.

### FR-007: Summary Persistence

**Description**: Summaries are cached during the confirmation sequence and persisted to disk as standalone artifacts upon full acceptance.

**Confidence**: High

**Acceptance Criteria**:

- **AC-007-01**: Given the confirmation sequence begins, when summaries are generated, then they are cached in memory for fast re-presentation during amendments.
- **AC-007-02**: Given all applicable summaries are accepted, when the analysis closes, then summaries are written to `docs/requirements/{slug}/` as `requirements-summary.md`, `architecture-summary.md`, and `design-summary.md`.
- **AC-007-03**: Given summaries have been persisted from a previous analysis, when the user revisits the same item, then the persisted summaries are available for immediate presentation.
- **AC-007-04**: Given an amendment cycle regenerates summaries, when the updated summaries are accepted, then the persisted files are overwritten with the updated versions.

### FR-008: Acceptance State in Meta.json

**Description**: When all summaries are accepted, the acceptance state is recorded in meta.json for provenance.

**Confidence**: High

**Acceptance Criteria**:

- **AC-008-01**: Given all applicable summaries have been accepted, when meta.json is updated, then it includes an `acceptance` field with a timestamp and a list of which summaries were accepted.
- **AC-008-02**: Given the acceptance state is recorded in meta.json, when the build flow consumes the analysis, then the acceptance state is available but does not gate the build (no change to the analyze-to-build handoff).

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Critic/Refiner pass before presenting summaries | Separate follow-on ticket. Adds complexity and should be validated independently. | Future GH ticket |
| Changes to the build flow (Phase B) | This feature is scoped to the analyze flow only | None |
| Changes to the analyze-to-build handoff | Acceptance state is recorded but not enforced at the handoff | None |
| Summary diff view (showing what changed between amendment cycles) | Nice-to-have for future iteration | FR-005 |
| Artifact-level walkthrough | Summaries present substance, not document structure | None |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Sequential Confirmation Sequence | Must Have | Core feature -- without this, nothing else works |
| FR-002 | Requirements Summary Content | Must Have | Requirements are always produced; users need to confirm them |
| FR-003 | Architecture Summary Content | Must Have | Architecture confirmation is essential for standard/epic tiers |
| FR-004 | Design Summary Content | Must Have | Design confirmation with data flow and sequence is essential |
| FR-005 | Amendment Flow | Must Have | Without amendment, Accept is meaningless -- users need the option to correct |
| FR-006 | Tier-Based Scoping | Must Have | Different tiers produce different artifacts; sequence must adapt |
| FR-007 | Summary Persistence | Should Have | Enables fast revisit experience; not blocking for core flow |
| FR-008 | Acceptance State in Meta.json | Should Have | Provenance tracking; not blocking for core flow |

## Pending Sections

None -- all sections complete.
