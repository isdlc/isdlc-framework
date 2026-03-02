# Test Cases: M3 -- Orchestrator IMPLEMENTATION_ROUTING and Per-File Loop

**Test File:** `src/claude/hooks/tests/implementation-debate-orchestrator.test.cjs`
**Target File:** `src/claude/agents/00-sdlc-orchestrator.md` (MODIFIED)
**Traces:** FR-003 (AC-003-01..07), FR-006 (AC-006-01..04), FR-007 (AC-007-01..03)
**Validation Rules:** VR-016 through VR-026
**Phase:** 05-test-strategy (REQ-0017)

---

## Test Structure

```
describe('M3: IMPLEMENTATION_ROUTING in Orchestrator (00-sdlc-orchestrator.md)')
  describe('IMPLEMENTATION_ROUTING Table')
    TC-M3-01 .. TC-M3-04
  describe('Per-File Loop Protocol')
    TC-M3-05 .. TC-M3-13
  describe('Implementation Loop State')
    TC-M3-14 .. TC-M3-16
  describe('Error Handling')
    TC-M3-17 .. TC-M3-19
  describe('Separation from DEBATE_ROUTING')
    TC-M3-20 .. TC-M3-22
```

---

## Test Cases

### IMPLEMENTATION_ROUTING Table

#### TC-M3-01: IMPLEMENTATION_ROUTING table exists in Section 7.6

**Traces:** AC-006-03
**Validation Rule:** VR-025
**Type:** Content
**Assert:** File includes `IMPLEMENTATION_ROUTING` AND includes `7.6`
**Failure Message:** "Must contain IMPLEMENTATION_ROUTING table in Section 7.6"

#### TC-M3-02: Writer mapped to 05-software-developer.md

**Traces:** AC-006-01
**Validation Rule:** VR-023
**Type:** Content
**Assert:** Content after `IMPLEMENTATION_ROUTING` includes `05-software-developer.md`
**Failure Message:** "IMPLEMENTATION_ROUTING must map Writer to 05-software-developer.md"

#### TC-M3-03: Reviewer mapped to 05-implementation-reviewer.md

**Traces:** AC-006-01
**Validation Rule:** VR-023
**Type:** Content
**Assert:** Content after `IMPLEMENTATION_ROUTING` includes `05-implementation-reviewer.md`
**Failure Message:** "IMPLEMENTATION_ROUTING must map Reviewer to 05-implementation-reviewer.md"

#### TC-M3-04: Updater mapped to 05-implementation-updater.md

**Traces:** AC-006-01
**Validation Rule:** VR-023
**Type:** Content
**Assert:** Content after `IMPLEMENTATION_ROUTING` includes `05-implementation-updater.md`
**Failure Message:** "IMPLEMENTATION_ROUTING must map Updater to 05-implementation-updater.md"

### Per-File Loop Protocol

#### TC-M3-05: Per-file loop protocol documented

**Traces:** AC-003-01
**Validation Rule:** VR-016
**Type:** Content
**Assert:** File includes `per-file` (case-insensitive) AND includes `loop`
**Failure Message:** "Must document per-file loop protocol"

#### TC-M3-06: Writer -> Reviewer -> Updater cycle documented

**Traces:** AC-003-01, AC-007-01
**Validation Rule:** VR-016
**Type:** Content
**Assert:** File includes `Writer` AND `Reviewer` AND `Updater` in the context of the implementation loop (after IMPLEMENTATION_ROUTING)
**Failure Message:** "Must document Writer -> Reviewer -> Updater cycle"

#### TC-M3-07: PASS verdict leads to next file

**Traces:** AC-003-02
**Validation Rule:** VR-017
**Type:** Content
**Assert:** Content after `IMPLEMENTATION` section includes `PASS` in context of proceeding to next file
**Failure Message:** "Must document PASS verdict -> proceed to next file"

#### TC-M3-08: REVISE verdict leads to Updater delegation

**Traces:** AC-003-03
**Validation Rule:** VR-018
**Type:** Content
**Assert:** Content after `IMPLEMENTATION` section includes `REVISE` in context of Updater delegation
**Failure Message:** "Must document REVISE verdict -> delegate to Updater"

#### TC-M3-09: After Updater, re-review by Reviewer

**Traces:** AC-003-04
**Validation Rule:** VR-019
**Type:** Content
**Assert:** File content documents re-review cycle after Updater returns (Updater -> Reviewer flow)
**Failure Message:** "Must document re-review by Reviewer after Updater returns"

#### TC-M3-10: Max 3 iterations per file

**Traces:** AC-003-05
**Validation Rule:** VR-020
**Type:** Content
**Assert:** File includes `3` in context of max iterations/cycles per file AND includes `MAX_ITERATIONS`
**Failure Message:** "Must document max 3 iterations per file with MAX_ITERATIONS acceptance"

#### TC-M3-11: Per-file loop summary generation

**Traces:** AC-003-06
**Validation Rule:** VR-021
**Type:** Content
**Assert:** File includes `per-file-loop-summary` or `loop-summary` or `summary` in context of post-loop finalization
**Failure Message:** "Must document per-file-loop-summary.md generation"

#### TC-M3-12: File ordering protocol

**Traces:** AC-003-07
**Validation Rule:** VR-022
**Type:** Content
**Assert:** File includes `task plan order` or `file order` or `ordering` in context of implementation loop
**Failure Message:** "Must document file ordering protocol"

#### TC-M3-13: WRITER_CONTEXT injection format

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `WRITER_CONTEXT` in the implementation loop section
**Failure Message:** "Must document WRITER_CONTEXT injection format for Writer delegation"

### Implementation Loop State

#### TC-M3-14: implementation_loop_state creation

**Traces:** AC-006-02
**Validation Rule:** VR-024
**Type:** Content
**Assert:** File includes `implementation_loop_state` in context of state initialization
**Failure Message:** "Must document implementation_loop_state creation in active_workflow"

#### TC-M3-15: Orchestrator maintains state (not sub-agents)

**Traces:** AC-007-02
**Validation Rule:** VR-024
**Type:** Content
**Assert:** File content documents orchestrator ownership of state (sub-agents do not write to state.json)
**Failure Message:** "Must document orchestrator as owner of implementation_loop_state"

#### TC-M3-16: implementation_loop_state update protocol

**Traces:** AC-006-02, NFR-004
**Validation Rule:** VR-024
**Type:** Content
**Assert:** File includes `per_file_reviews` AND (`files_completed` or `files_remaining`) in state tracking context
**Failure Message:** "Must document implementation_loop_state update protocol with per_file_reviews"

### Error Handling

#### TC-M3-17: Sub-agent error handling documented

**Traces:** AC-007-03
**Validation Rule:** --
**Type:** Content
**Assert:** File content after `IMPLEMENTATION` section includes error handling documentation (e.g., `fail-open`, `Article X`, `skip`, `warning`)
**Failure Message:** "Must document sub-agent error handling in implementation loop"

#### TC-M3-18: Reviewer output unparseable handling

**Traces:** AC-007-03
**Validation Rule:** --
**Type:** Content
**Assert:** File content documents handling of unparseable Reviewer output (treat as PASS or fail-open)
**Failure Message:** "Must document handling for unparseable Reviewer output"

#### TC-M3-19: Task tool delegation for sub-agents

**Traces:** AC-007-01
**Validation Rule:** --
**Type:** Content
**Assert:** File content documents Task tool delegation for Writer, Reviewer, and Updater as separate invocations
**Failure Message:** "Must document separate Task tool delegation for each sub-agent"

### Separation from DEBATE_ROUTING

#### TC-M3-20: Section 7.6 separate from Section 7.5

**Traces:** AC-006-03
**Validation Rule:** VR-025
**Type:** Content (structural)
**Assert:** File includes `7.6` AND `IMPLEMENTATION` section marker that is separate from `7.5` / `DEBATE LOOP`
**Failure Message:** "Section 7.6 (IMPLEMENTATION) must be separate from Section 7.5 (DEBATE)"

#### TC-M3-21: DEBATE_ROUTING does not contain Phase 06

**Traces:** AC-006-03
**Validation Rule:** VR-025
**Type:** Content (negative)
**Assert:** Extract text between `DEBATE_ROUTING` and `IMPLEMENTATION_ROUTING` (Section 7.5 content). Verify it does NOT contain `06-implementation` as a phase key in the DEBATE_ROUTING table rows.
**Failure Message:** "DEBATE_ROUTING must NOT contain 06-implementation -- it belongs in IMPLEMENTATION_ROUTING"

#### TC-M3-22: No-debate fallback to single-agent

**Traces:** AC-006-04
**Validation Rule:** VR-026
**Type:** Content
**Assert:** File content documents debate_mode=false path: single delegation to software-developer only, no WRITER_CONTEXT, no loop
**Failure Message:** "Must document no-debate fallback to single-agent delegation"

---

## AC Coverage Summary

| AC | Test Case(s) |
|----|-------------|
| AC-003-01 | TC-M3-05, TC-M3-06 |
| AC-003-02 | TC-M3-07 |
| AC-003-03 | TC-M3-08 |
| AC-003-04 | TC-M3-09 |
| AC-003-05 | TC-M3-10 |
| AC-003-06 | TC-M3-11 |
| AC-003-07 | TC-M3-12 |
| AC-006-01 | TC-M3-02, TC-M3-03, TC-M3-04 |
| AC-006-02 | TC-M3-14, TC-M3-15, TC-M3-16 |
| AC-006-03 | TC-M3-01, TC-M3-20, TC-M3-21 |
| AC-006-04 | TC-M3-22 |
| AC-007-01 | TC-M3-06, TC-M3-19 |
| AC-007-02 | TC-M3-15 |
| AC-007-03 | TC-M3-17, TC-M3-18 |
