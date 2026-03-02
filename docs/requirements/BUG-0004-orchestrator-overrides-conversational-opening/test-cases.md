# Test Cases - BUG-0004: Orchestrator Overrides Conversational Opening

**Test File:** `tests/prompt-verification/orchestrator-conversational-opening.test.js`
**Test Runner:** `node:test`
**Pattern:** Prompt content verification (read `.md` files, assert patterns)

---

## TC-01: Old Protocol Removal (FR-1, AC-1.1, AC-1.2)

### TC-01.1: Old 3-question text absent from orchestrator
- **Traces to:** AC-1.1
- **Priority:** P0 (core bug verification)
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The text "Your FIRST response must ONLY contain these 3 questions" does NOT appear anywhere in the file
- **Assertion:** `assert.ok(!content.includes('Your FIRST response must ONLY contain these 3 questions'))`

### TC-01.2: Old 3-question list absent from orchestrator
- **Traces to:** AC-1.2
- **Priority:** P0 (core bug verification)
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The text "What problem are you solving? 2. Who will use this? 3. How will you know this project succeeded?" does NOT appear anywhere in the file
- **Assertion:** `assert.ok(!content.includes('What problem are you solving?'))`

### TC-01.3: Old "ONLY ask the 3 questions" absent
- **Traces to:** AC-1.1 (reinforcement)
- **Priority:** P0
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The text "ONLY ask the 3 questions, then STOP" does NOT appear
- **Assertion:** `assert.ok(!content.includes('ONLY ask the 3 questions'))`

---

## TC-02: New Protocol Content - Mode Detection (FR-1, AC-1.3)

### TC-02.1: DEBATE_CONTEXT check present in orchestrator protocol
- **Traces to:** AC-1.3
- **Priority:** P0 (required element of new protocol)
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The Phase 01 protocol section includes reference to DEBATE_CONTEXT detection
- **Assertion:** Content includes `DEBATE_CONTEXT`

### TC-02.2: Mode detection logic includes both debate and single-agent paths
- **Traces to:** AC-1.3
- **Priority:** P1
- **Given:** The orchestrator content around Phase 01 protocol
- **When:** Searching for mode detection patterns
- **Then:** Content includes both "DEBATE_CONTEXT is present" and "DEBATE_CONTEXT is NOT present" branches
- **Assertion:** Content includes both pathways

---

## TC-03: New Protocol Content - Conversational Opening (FR-1, AC-1.4)

### TC-03.1: Rich description branching present
- **Traces to:** AC-1.4
- **Priority:** P0 (core conversational opening behavior)
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The protocol includes the rich description threshold ("> 50 words" or "> 50")
- **Assertion:** Content includes `50 words` or `> 50`

### TC-03.2: Reflection instruction present
- **Traces to:** AC-1.4
- **Priority:** P0
- **Given:** The orchestrator content
- **When:** Searching for reflection instruction
- **Then:** Content includes instruction to reflect back/summarize the user's description
- **Assertion:** Content includes `Reflect` or `reflect` near the conversational opening

### TC-03.3: Minimal description path present
- **Traces to:** AC-1.4
- **Priority:** P1
- **Given:** The orchestrator content
- **When:** Searching for minimal description handling
- **Then:** Content includes the minimal description path (< 50 words)
- **Assertion:** Content includes reference to minimal descriptions and focused questions

---

## TC-04: New Protocol Content - Organic Lens Integration (FR-1, AC-1.5)

### TC-04.1: Discovery lenses reference present
- **Traces to:** AC-1.5
- **Priority:** P1
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The protocol references the 5 discovery lenses or organic lens integration
- **Assertion:** Content includes `lens` or `lenses` near the Phase 01 protocol section

### TC-04.2: Organic weaving instruction present
- **Traces to:** AC-1.5
- **Priority:** P1
- **Given:** The orchestrator content
- **When:** Searching for lens integration guidance
- **Then:** Content includes guidance to weave lenses organically (not as rigid sequential stages)
- **Assertion:** Content includes `organic` or `weave` or `natural`

---

## TC-05: New Protocol Content - A/R/C Menu Pattern (FR-1, AC-1.6)

### TC-05.1: A/R/C menu pattern present
- **Traces to:** AC-1.6
- **Priority:** P0
- **Given:** The file `src/claude/agents/00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** The protocol includes the A/R/C menu pattern (Adjust/Refine/Continue)
- **Assertion:** Content includes `A/R/C` or (`[A] Adjust` and `[R] Refine` and `[C] Continue`)

---

## TC-06: Protocol Consistency (FR-2, AC-2.1, AC-2.2, AC-2.3)

### TC-06.1: Orchestrator and requirements analyst share mode detection
- **Traces to:** AC-2.1, AC-2.2
- **Priority:** P0 (cross-file consistency)
- **Given:** Both `00-sdlc-orchestrator.md` and `01-requirements-analyst.md` exist
- **When:** Both files are read
- **Then:** Both include DEBATE_CONTEXT mode detection logic
- **Assertion:** Both files include `DEBATE_CONTEXT`

### TC-06.2: Orchestrator and requirements analyst share conversational opening rules
- **Traces to:** AC-2.1, AC-2.3
- **Priority:** P0
- **Given:** Both files exist
- **When:** Both files are read
- **Then:** Both include the same conversational opening threshold (50 words)
- **Assertion:** Both files include `50 words` or `> 50`

### TC-06.3: Orchestrator and requirements analyst share A/R/C pattern
- **Traces to:** AC-2.1
- **Priority:** P1
- **Given:** Both files exist
- **When:** Both files are read
- **Then:** Both include the A/R/C menu pattern
- **Assertion:** Both files include `A/R/C` or the menu options

---

## TC-07: Non-Functional Requirements

### TC-07.1: Only 00-sdlc-orchestrator.md is modified (NFR-1)
- **Traces to:** NFR-1
- **Priority:** P0
- **Given:** The fix is implemented
- **When:** Checking fix scope
- **Then:** The test file only reads from `00-sdlc-orchestrator.md` and `01-requirements-analyst.md` (reference); the fix only modifies `00-sdlc-orchestrator.md`
- **Note:** This is a design constraint verified during code review, not a runtime test. However, we verify that `01-requirements-analyst.md` still contains its INVOCATION PROTOCOL unchanged.

### TC-07.2: Requirements analyst INVOCATION PROTOCOL unchanged (NFR-2 reinforcement)
- **Traces to:** NFR-2
- **Priority:** P0
- **Given:** The file `01-requirements-analyst.md` exists
- **When:** The file content is read
- **Then:** The INVOCATION PROTOCOL block (lines 19-65) is present and contains the expected conversational opening elements
- **Assertion:** File includes `INVOCATION PROTOCOL FOR ORCHESTRATOR`

### TC-07.3: Other orchestrator sections unchanged (NFR-2)
- **Traces to:** NFR-2
- **Priority:** P1
- **Given:** The file `00-sdlc-orchestrator.md` exists
- **When:** The file content is read
- **Then:** Key structural sections that should NOT change are still present:
  - Section 7 delegation table header
  - DEBATE_ROUTING table
  - Section numbering intact
- **Assertion:** Content includes `## 7.5 DEBATE LOOP ORCHESTRATION` and `DEBATE_ROUTING:`

---

## Test Count Summary

| Test Group | Count | Priority Breakdown |
|------------|-------|-------------------|
| TC-01: Old protocol removal | 3 | 3x P0 |
| TC-02: Mode detection | 2 | 1x P0, 1x P1 |
| TC-03: Conversational opening | 3 | 2x P0, 1x P1 |
| TC-04: Organic lens integration | 2 | 2x P1 |
| TC-05: A/R/C menu pattern | 1 | 1x P0 |
| TC-06: Protocol consistency | 3 | 2x P0, 1x P1 |
| TC-07: Non-functional requirements | 3 | 2x P0, 1x P1 |
| **Total** | **17** | **11x P0, 6x P1** |
