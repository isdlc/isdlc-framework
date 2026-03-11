# Requirements Specification: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%
**Source**: GH-119

---

## 1. Business Context

### Problem Statement

Phase 02 tracing (symptom analyzer T1, execution path tracer T2, root cause identifier T3) is unreachable in the most common user journey for bugs. Users with a bug ticket naturally say "analyze this," which runs the roundtable (Maya/Alex/Jordan) for requirements/architecture/design analysis. The roundtable is the wrong tool for bugs -- bugs need understanding and tracing, not requirements elicitation. When the user then says "fix it," the analysis is already marked complete, so the fix workflow skips to implementation. The most valuable debugging phase is permanently bypassed.

### Stakeholders

| Stakeholder | Role | Interest |
|-------------|------|----------|
| Developer | Primary user | Wants bugs analyzed and fixed efficiently without running irrelevant analysis phases |
| Framework maintainer | Secondary | Wants clean separation between feature analysis and bug analysis flows |

### Success Metrics

- When a user says "analyze" for a bug, the system detects it as a bug and routes to the bug-gather flow instead of the roundtable
- The tracing agents (T1/T2/T3) fire for every bug that goes through the analyze -> fix path
- The user experience is: gather -> confirm -> "should I fix it?" -> autonomous fix with live progress

### Driving Factors

- **Priority**: Should Have
- **Cost of deferral**: Tracing agents remain unreachable for the most common bug journey; users get suboptimal bug analysis through the feature-oriented roundtable

---

## 2. Stakeholders and Personas

### Developer (Primary)

- **Role**: Developer working on bugs from a ticket system (GitHub Issues, Jira)
- **Goals**: Get bugs analyzed, traced, and fixed with minimal manual intervention
- **Pain Points**: The roundtable asks irrelevant questions about requirements/architecture/design for bugs; tracing never fires; the fix workflow skips the most valuable debugging phase
- **Proficiency**: Technical -- understands code, can confirm bug descriptions, can provide additional context
- **Key Tasks**: Says "analyze #N" for a bug, confirms the system's understanding, says "yes fix it"

---

## 3. User Journeys

### Journey 1: Bug Analysis and Fix (Happy Path)

1. **Entry**: User says "analyze #42" (GitHub issue describing a bug)
2. **Bug Detection**: System reads the issue description, infers it's a bug (not just from labels -- from content), confirms with user: "This looks like a bug because [reasoning]. Use the bug analysis flow?"
3. **User Confirms**: "Yes"
4. **Gather**: System silently reads the ticket, scans the codebase for relevant files, understands the bug in context
5. **Playback**: System presents structured understanding: what's broken, where it likely lives in the code, what's affected, reproduction steps
6. **User Confirms**: "That's all I have" / adds more context
7. **Handoff Gate**: System asks "Should I fix it?"
8. **User Confirms**: "Yes"
9. **Autonomous Execution**: Fix workflow launches from Phase 02 (tracing) through Phase 08 (code review) with live progress on screen
10. **Exit**: Fix complete, user sees results

### Journey 2: Misclassified Bug (User Overrides)

1. **Entry**: User says "analyze #42" (issue labeled "bug" but is actually a feature request)
2. **Bug Detection**: System infers it's a bug based on description/labels, confirms with user
3. **User Overrides**: "No, that's actually a feature request"
4. **Fallback**: System routes to the standard roundtable (Maya/Alex/Jordan) for feature analysis
5. **Exit**: Normal roundtable conversation

### Journey 3: Bug Analysis Without Fix

1. **Entry**: User says "analyze #42" (bug)
2. **Bug Detection + Confirm**: As above
3. **Gather + Playback**: As above
4. **Handoff Gate**: System asks "Should I fix it?"
5. **User Declines**: "No, not now" / "I just wanted to understand it"
6. **Exit**: Artifacts (bug-report.md, requirements-spec.md) are saved. User can later say "fix #42" and the fix workflow auto-detects existing Phase 01 artifacts, starting from Phase 02

---

## 4. Technical Context

### Technical Constraints

- The analyze verb is explicitly "no workflow, no state.json, no branches" (`isdlc.md` line 629-630). This constraint must be preserved -- analyze produces artifacts only.
- The fix workflow is the workflow creator. The handoff from analyze to fix is conversational ("should I fix it?" -> user confirms -> system invokes fix workflow).
- The tracing orchestrator expects `bug-report.md` and `requirements-spec.md` as input (tracing-orchestrator.md lines 42-46). The bug-gather agent must produce compatible artifacts.

### Existing Conventions

- The analyze handler dispatches to `roundtable-analyst` via Task tool (isdlc.md line 710)
- The fix workflow has phases: 01-requirements -> 02-tracing -> 05 -> 06 -> 16 -> 08 (workflows.json line 168-174)
- REQ-0026 `computeStartPhase` handles starting from a later phase when artifacts exist
- The build handler has bug keyword detection at line 1096 (simple keyword match -- insufficient for this feature)

### Integration Points

- **Analyze handler** (`isdlc.md`): Bug classification gate added before dispatch
- **Fix workflow** (`workflows.json`): Consumed via `/isdlc fix` -- no changes to workflow definition needed
- **Tracing orchestrator** (`tracing-orchestrator.md`): Consumes bug-report.md and requirements-spec.md -- no changes needed if artifacts are compatible
- **REQ-0026 auto-detection** (`three-verb-utils.cjs`): `computeStartPhase` detects existing Phase 01 artifacts and starts fix from Phase 02

---

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Usability | Critical | Bug detection confirmation takes 1 exchange; gather+playback completes in under 60 seconds |
| Reliability | High | LLM bug detection has >90% accuracy on clearly described bugs; labels supplement but don't override |
| Maintainability | High | Bug-gather agent is a standalone file; no changes to tracing orchestrator or fix workflow internals |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM misclassifies feature as bug | Medium | Medium | Always confirm with user; user can override to roundtable |
| LLM misclassifies bug as feature | Low | Medium | Labels provide supplementary signal; user can correct |
| Bug-gather artifacts incompatible with tracing orchestrator | Low | High | Artifacts follow existing bug-report.md format from tracing-orchestrator.md |
| Analyze -> fix handoff breaks non-workflow constraint | Low | High | Analyze only produces artifacts + asks "should I fix it?"; the fix invocation is a separate command |

---

## 6. Functional Requirements

### FR-001: LLM-Based Bug Detection in Analyze Handler

**Confidence**: High

When the analyze handler resolves an item and has the issue description available, the LLM reads the full description content (not just labels or keywords) to infer whether the subject is a bug or a feature. The inference is based on the description's content: symptoms described, error messages, unexpected behavior, regression language, vs. new capability requests, enhancement descriptions, feature proposals.

- **AC-001-01**: Given an issue with bug-like description content (error messages, unexpected behavior, regression), the system infers it is a bug and presents its reasoning to the user for confirmation
- **AC-001-02**: Given an issue with feature-like description content (new capability, enhancement), the system infers it is a feature and routes directly to the roundtable without bug confirmation
- **AC-001-03**: Labels (e.g., "bug", "enhancement") are used as supplementary evidence but do not override the LLM's inference from description content
- **AC-001-04**: The user can override the LLM's classification in either direction (bug -> feature, or feature -> bug)

### FR-002: Bug-Gather Agent for Bug Analysis

**Confidence**: High

When the user confirms the subject is a bug, the analyze handler dispatches to a new lightweight bug-gather agent (instead of the roundtable-analyst). This agent:
1. Reads the ticket/issue content
2. Scans the codebase for relevant files (using keywords from the bug description)
3. Understands the bug in context of the codebase
4. Plays back a structured understanding to the user

- **AC-002-01**: The bug-gather agent reads the full issue description, extracts symptoms, error messages, reproduction steps, and expected vs actual behavior
- **AC-002-02**: The agent scans the codebase using extracted keywords and identifies likely affected files and code areas
- **AC-002-03**: The agent presents a structured playback to the user: what's broken, where it likely lives in the code, what's affected, reproduction steps if available
- **AC-002-04**: The agent asks the user if they have anything to add before proceeding
- **AC-002-05**: The agent accepts additional context from the user and incorporates it into its understanding

### FR-003: Artifact Production by Bug-Gather Agent

**Confidence**: High

After the user confirms the bug understanding is complete, the bug-gather agent produces artifacts compatible with the tracing orchestrator's expected input.

- **AC-003-01**: The agent produces `bug-report.md` with: expected vs actual behavior, error messages, stack traces (if available), reproduction steps, affected area, severity
- **AC-003-02**: The agent produces a lightweight `requirements-spec.md` with: problem statement, affected user type, and the bug as a single FR with acceptance criteria
- **AC-003-03**: Both artifacts are written to the item's artifact folder (`docs/requirements/{slug}/`)
- **AC-003-04**: The artifacts satisfy the tracing orchestrator's pre-phase check (tracing-orchestrator.md lines 39-76)

### FR-004: Explicit Fix Handoff Gate

**Confidence**: High

After producing artifacts, the bug-gather agent asks the user "Should I fix it?" as an explicit consent gate before any workflow is created.

- **AC-004-01**: After artifact production, the system presents "Should I fix it?" to the user
- **AC-004-02**: If user confirms (yes/go ahead/fix it): the system invokes the fix workflow for the item
- **AC-004-03**: If user declines (no/not now): artifacts are preserved, no workflow is created, user can later invoke fix separately
- **AC-004-04**: The fix workflow auto-detects existing Phase 01 artifacts (via REQ-0026 `computeStartPhase`) and starts from Phase 02 (tracing)

### FR-005: Feature Fallback on User Override

**Confidence**: High

If the user overrides the LLM's bug classification and says the subject is a feature, the analyze handler falls through to the standard roundtable.

- **AC-005-01**: When the user says "no, it's a feature" (or equivalent), the system dispatches to the roundtable-analyst as normal
- **AC-005-02**: No artifacts from the bug-gather agent are produced in this case
- **AC-005-03**: The roundtable conversation proceeds identically to the current behavior for features

### FR-006: Live Progress During Autonomous Fix Execution

**Confidence**: Medium

When the fix workflow runs after user confirmation, the Phase-Loop Controller provides live progress updates on screen.

- **AC-006-01**: Each phase transition is visible to the user (tracing -> test strategy -> implementation -> quality loop -> code review)
- **AC-006-02**: The tracing orchestrator's progress display (T1/T2/T3 parallel status) is visible
- **AC-006-03**: The user does not need to interact during autonomous execution (no "continue" prompts between phases)

**Note**: This is largely satisfied by the existing Phase-Loop Controller behavior. This FR confirms the expectation rather than requiring new implementation.

---

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Changes to intent detection signal words | Explicitly excluded by design -- "analyze" still means analyze, "fix" still means fix | None |
| Changes to the tracing orchestrator (T0/T1/T2/T3) | Existing infrastructure works as-is if artifacts are compatible | FR-003 artifact compatibility |
| Changes to the fix workflow phase sequence | Existing phases (01 -> 02 -> 05 -> 06 -> 16 -> 08) are correct | None |
| Changes to `computeStartPhase` logic | Existing auto-detection handles Phase 02 start when Phase 01 artifacts exist | None |
| Parallel roundtable + tracing execution | Replaced by the sequential gather -> confirm -> fix flow | N/A |
| Bug-specific roundtable (Maya/Alex/Jordan for bugs) | Roundtable is skipped entirely for bugs | N/A |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | LLM-Based Bug Detection | Must Have | Core gate -- without this, the system can't route bugs differently |
| FR-002 | Bug-Gather Agent | Must Have | Core functionality -- replaces the roundtable for bugs |
| FR-003 | Artifact Production | Must Have | Tracing orchestrator requires these artifacts |
| FR-004 | Explicit Fix Handoff | Must Have | User consent gate before workflow creation |
| FR-005 | Feature Fallback | Must Have | Safety net -- misclassified bugs must not be stuck |
| FR-006 | Live Progress | Should Have | Largely already exists; confirms UX expectation |
