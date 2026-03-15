# Requirements Specification: REQ-0065 — Inline Roundtable Analysis

**Source**: GitHub Issue #124
**Status**: Analyzed
**Confidence**: High (user-confirmed all requirements)

---

## 1. Business Context

The analyze phase takes 3+ minutes before Maya's first question appears on screen. The root cause is the Task tool subagent pattern: spawning a subprocess, re-serializing ~30K tokens of content already in the session cache, and running a relay-and-resume loop for every exchange. With the 1M context window, the subagent's original purpose (context window protection) no longer applies.

**Success metric**: Maya's first question appears within 15 seconds of reaching the roundtable step (excluding network latency for external fetches).

**Stakeholders**: All iSDLC users who run `/isdlc analyze`.

## 2. Stakeholders and Personas

### Primary User: iSDLC Developer
- **Role**: Developer using iSDLC to analyze backlog items
- **Pain point**: 3+ minute wait before the first interactive question during analysis
- **Goal**: Fast, responsive analysis sessions with no quality loss

## 3. User Journeys

### Happy Path
1. User invokes `/isdlc analyze "#N"` (or natural language equivalent)
2. Handler fetches issue, creates/reads backlog folder, classifies as feature or bug
3. **Feature path**: Handler reads `roundtable-analyst.md` as protocol reference, opens as Maya from draft content — first question appears within 15 seconds
4. User replies naturally — each exchange is a direct conversation turn (no relay overhead)
5. Conversation completes, artifacts written, meta.json updated
6. **Bug path**: Handler reads `bug-gather-analyst.md` as protocol reference, executes bug-gather conversation inline — same latency improvement

## 4. Technical Context

- Session cache already contains ROUNDTABLE_CONTEXT (personas, topics), CONSTITUTION, WORKFLOW_CONFIG, ITERATION_REQUIREMENTS, SKILL_INDEX
- The handler already has draft content, meta, and discovery context in memory from steps 3a-6.5
- `roundtable-analyst.md` (~500 lines) and `bug-gather-analyst.md` define conversation protocols that can be followed as inline references
- Agent Teams mode is opt-in and unaffected

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Responsiveness | Critical | First question < 15s after reaching roundtable step |
| Context quality | Critical | Identical to current subagent flow |
| Artifact quality | Critical | No regression in output completeness |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Context window pressure from inline conversation | Low | Medium | 1M context is ~50x larger than a typical analysis session |
| Protocol drift between isdlc.md and roundtable-analyst.md | Medium | Medium | roundtable-analyst.md remains the authoritative protocol reference — isdlc.md reads it, not duplicates it |

## 6. Functional Requirements

### FR-001: Inline Roundtable Execution
**Confidence**: High
The analyze handler MUST execute the roundtable conversation protocol inline (no Task tool dispatch, no subagent spawn) while preserving the full conversation protocol from `roundtable-analyst.md`.

- **AC-001-01**: Given the handler reaches step 7 (roundtable), when it starts the conversation, then it reads `roundtable-analyst.md` as a protocol reference and follows the conversation protocol inline — no Task tool is invoked.
- **AC-001-02**: Given the handler is executing the roundtable inline, when each exchange occurs, then it is a direct conversation turn with no relay-and-resume loop overhead.

### FR-002: Inline Bug-Gather Execution
**Confidence**: High
The analyze handler MUST execute the bug-gather conversation protocol inline (no Task tool dispatch, no subagent spawn) while preserving the full conversation protocol from `bug-gather-analyst.md`.

- **AC-002-01**: Given the handler reaches step 6.5c (bug-gather), when it starts the conversation, then it reads `bug-gather-analyst.md` as a protocol reference and follows the conversation protocol inline — no Task tool is invoked.
- **AC-002-02**: Given the handler is executing the bug-gather inline, when each exchange occurs, then it is a direct conversation turn with no relay-and-resume loop overhead.
- **AC-002-03**: Given the bug-gather completes inline, when the handler proceeds to step 6.5e, then it updates meta.json directly (no BUG_GATHER_COMPLETE signal parsing).

### FR-003: Session Cache Reuse
**Confidence**: High
The inline execution MUST use session cache content directly — no re-serialization of persona, topic, discovery, or memory content into dispatch prompts.

- **AC-003-01**: Given the session cache contains ROUNDTABLE_CONTEXT, when the handler executes the roundtable inline, then it uses persona and topic content from the session cache — no re-reads of persona or topic files.
- **AC-003-02**: Given draft content, meta, and discovery context are already in memory from earlier steps, when the handler starts the roundtable or bug-gather, then it uses these in-memory values — no redundant Read tool calls.

### FR-004: Latency Target
**Confidence**: High
Maya's first question MUST appear within 15 seconds of the analyze handler reaching step 7 (roundtable) or step 6.5c (bug-gather), excluding network latency for external fetches.

- **AC-004-01**: Given the handler reaches the roundtable step with all context in memory, when it opens as Maya, then the first question is emitted within 15 seconds.

### FR-005: Quality Preservation
**Confidence**: High
The conversation quality, topic coverage, confirmation sequence, and artifact output MUST be identical to the current subagent-based flow.

- **AC-005-01**: Given the roundtable runs inline, when the confirmation sequence completes, then all artifacts (requirements-spec.md, architecture-overview.md, module-design.md) are written with the same content quality as the subagent flow.
- **AC-005-02**: Given the roundtable runs inline, when topics are covered, then the same topic coverage tracking and depth adaptation logic applies.

### FR-006: Protocol Reference Retention
**Confidence**: High
The `roundtable-analyst.md` and `bug-gather-analyst.md` files MUST be retained as protocol reference documents.

- **AC-006-01**: Given `roundtable-analyst.md` exists, when the inline handler reads it, then the file contains a header indicating it is a protocol reference (not a spawned agent).
- **AC-006-02**: Given `bug-gather-analyst.md` exists, when the inline handler reads it, then the file contains a header indicating it is a protocol reference (not a spawned agent).

### FR-007: Inline Memory Write-Back
**Confidence**: High
The handler MUST construct and write session records directly from its in-memory conversation state, replacing the SESSION_RECORD parsing from roundtable agent output.

- **AC-007-01**: Given the roundtable completes inline, when the handler writes the session record, then it calls `writeSessionRecord()` with data constructed from in-memory conversation state (topics covered, depth preferences, overrides).

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Agent Teams mode changes | Opt-in feature, unaffected by inline execution |
| Conversation protocol modifications | Protocol stays the same, only execution mode changes |
| New analysis features | Separate tickets |
| Build workflow phase delegation | Uses Phase-Loop Controller, different pattern |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Inline roundtable execution | Must Have | Core of the ticket |
| FR-002 | Inline bug-gather execution | Must Have | Same pattern, same ticket |
| FR-003 | Session cache reuse | Must Have | Key to eliminating redundant reads |
| FR-004 | Latency target | Must Have | Primary success metric |
| FR-005 | Quality preservation | Must Have | Non-negotiable constraint |
| FR-006 | Protocol reference retention | Must Have | Ensures maintainability |
| FR-007 | Inline memory write-back | Must Have | Removes dependency on agent output parsing |
