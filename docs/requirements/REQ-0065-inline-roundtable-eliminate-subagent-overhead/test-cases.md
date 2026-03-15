# Test Cases: REQ-0065 -- Inline Roundtable Analysis

**Status**: Complete
**Requirement**: REQ-0065 / GH-124
**Last Updated**: 2026-03-15
**Total Test Cases**: 28 automated + 4 behavioral = 32 total
**Test File**: `tests/prompt-verification/inline-roundtable-execution.test.js`

---

## TG-01: Inline Roundtable Execution (FR-001)

### TC-01.1: Step 7a reads roundtable-analyst.md as protocol reference (positive)

- **Requirement**: FR-001, AC-001-01
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists and contains the analyze handler
- **Input**: Read isdlc.md content
- **Expected Result**: Step 7a contains instruction to read `roundtable-analyst.md` using Read tool as a protocol reference, with explicit note NOT to spawn it as an agent
- **Pass Criteria**: Content includes "protocol reference" AND "Read" AND "roundtable-analyst.md" in the step 7a area; content includes "NOT" and "agent" or "spawn" near the read instruction

### TC-01.2: Step 7b executes roundtable protocol inline (positive)

- **Requirement**: FR-001, AC-001-01
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md content
- **Expected Result**: Step 7b contains inline execution instructions referencing the roundtable conversation protocol (opening as Maya, topic coverage, confirmation sequence)
- **Pass Criteria**: Content includes "inline" AND ("Maya" OR "conversation protocol") in the step 7b area

### TC-01.3: No Task tool dispatch in step 7a (negative)

- **Requirement**: FR-001, AC-001-01
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7a content
- **Expected Result**: Step 7a does NOT contain Task tool dispatch instructions for the roundtable
- **Pass Criteria**: The step 7a section does not contain "Delegate to the `roundtable-analyst` agent via Task tool" or equivalent dispatch language

### TC-01.4: No relay-and-resume loop in step 7b (negative)

- **Requirement**: FR-001, AC-001-02
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7b content
- **Expected Result**: Step 7b does NOT contain a relay-and-resume WHILE loop for the roundtable
- **Pass Criteria**: The step 7b section does not contain "relay-and-resume" or "WHILE not ROUNDTABLE_COMPLETE"

### TC-01.5: No ROUNDTABLE_COMPLETE signal check (negative)

- **Requirement**: FR-001, AC-001-02
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md content around step 7
- **Expected Result**: No ROUNDTABLE_COMPLETE signal parsing exists in the roundtable execution path
- **Pass Criteria**: Content in the step 7 area does not contain "ROUNDTABLE_COMPLETE"

---

## TG-02: Inline Bug-Gather Execution (FR-002)

### TC-02.1: Step 6.5c reads bug-gather-analyst.md as protocol reference (positive)

- **Requirement**: FR-002, AC-002-01
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md content
- **Expected Result**: Step 6.5c contains instruction to read `bug-gather-analyst.md` as a protocol reference, not spawn as agent
- **Pass Criteria**: Content includes "protocol reference" AND "bug-gather-analyst.md" AND "Read" in the step 6.5c area

### TC-02.2: Step 6.5d executes bug-gather protocol inline (positive)

- **Requirement**: FR-002, AC-002-01
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md content
- **Expected Result**: Step 6.5d contains inline execution instructions for the bug-gather conversation protocol
- **Pass Criteria**: Content includes "inline" AND "bug-gather" AND "protocol" in the step 6.5d area

### TC-02.3: No Task tool dispatch in step 6.5c (negative)

- **Requirement**: FR-002, AC-002-01
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 6.5c content
- **Expected Result**: Step 6.5c does NOT contain Task tool dispatch for bug-gather
- **Pass Criteria**: The step 6.5c section does not contain "Delegate to the `bug-gather-analyst` agent via Task tool" or equivalent

### TC-02.4: No relay-and-resume loop in step 6.5d (negative)

- **Requirement**: FR-002, AC-002-02
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 6.5d content
- **Expected Result**: Step 6.5d does NOT contain relay-and-resume WHILE loop for bug-gather
- **Pass Criteria**: The step 6.5d section does not contain "relay-and-resume" or "WHILE not BUG_GATHER_COMPLETE"

### TC-02.5: No BUG_GATHER_COMPLETE signal check (negative)

- **Requirement**: FR-002, AC-002-03
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md content around step 6.5
- **Expected Result**: No BUG_GATHER_COMPLETE signal parsing exists in the bug-gather execution path
- **Pass Criteria**: Content in the step 6.5 area does not contain "BUG_GATHER_COMPLETE"

### TC-02.6: Step 6.5d proceeds directly to step 6.5e (positive)

- **Requirement**: FR-002, AC-002-03
- **Test Type**: positive, structural
- **Priority**: P1
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md content
- **Expected Result**: After inline bug-gather completes, flow proceeds directly to step 6.5e without signal parsing
- **Pass Criteria**: Step 6.5d references proceeding to step 6.5e or meta.json update directly

---

## TG-03: Session Cache Reuse (FR-003)

### TC-03.1: In-memory context references in step 7b (positive)

- **Requirement**: FR-003, AC-003-01, AC-003-02
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7b content
- **Expected Result**: Step 7b references using in-memory/session-cache content for persona, topic, draft, meta, and discovery context -- no re-reads
- **Pass Criteria**: Content includes "in memory" or "in-memory" or "session cache" AND references to slug, meta, draftContent, or discoveryContent as already available

### TC-03.2: No dispatch prompt re-serialization (negative)

- **Requirement**: FR-003, AC-003-01
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7a content
- **Expected Result**: Step 7a does NOT contain dispatch prompt construction with PERSONA_CONTEXT/TOPIC_CONTEXT/DISCOVERY_CONTEXT field serialization for Task tool dispatch
- **Pass Criteria**: The step 7a section does not contain a dispatch prompt block that serializes persona files, topic files, and discovery content into a Task tool invocation

### TC-03.3: No redundant Read tool calls for context (positive)

- **Requirement**: FR-003, AC-003-02
- **Test Type**: positive, structural
- **Priority**: P1
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7b content
- **Expected Result**: Step 7b explicitly states that context variables are "already in memory" from earlier steps
- **Pass Criteria**: Content includes "already in memory" or "no reads needed" or "from step" referencing earlier resolution

---

## TG-04: Protocol Reference Headers (FR-006)

### TC-04.1: Roundtable-analyst.md has protocol reference header (positive)

- **Requirement**: FR-006, AC-006-01
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: roundtable-analyst.md exists
- **Input**: Read roundtable-analyst.md content
- **Expected Result**: File contains a protocol reference header indicating it is read as a reference document, not spawned as an agent
- **Pass Criteria**: Content includes "protocol reference" AND ("not spawned" OR "NOT spawned" OR "is NOT spawned")

### TC-04.2: Bug-gather-analyst.md has protocol reference header (positive)

- **Requirement**: FR-006, AC-006-02
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: bug-gather-analyst.md exists
- **Input**: Read bug-gather-analyst.md content
- **Expected Result**: File contains a protocol reference header indicating it is read as a reference document, not spawned as an agent
- **Pass Criteria**: Content includes "protocol reference" AND ("not spawned" OR "NOT spawned" OR "is NOT spawned")

### TC-04.3: Roundtable header mentions inline execution by isdlc.md (positive)

- **Requirement**: FR-006, AC-006-01
- **Test Type**: positive, structural
- **Priority**: P1
- **Preconditions**: roundtable-analyst.md exists
- **Input**: Read roundtable-analyst.md content
- **Expected Result**: Protocol reference header specifically mentions the isdlc.md analyze handler reads and executes the protocol inline
- **Pass Criteria**: Content includes "isdlc.md" AND "inline" in the header area

### TC-04.4: Bug-gather header mentions inline execution by isdlc.md (positive)

- **Requirement**: FR-006, AC-006-02
- **Test Type**: positive, structural
- **Priority**: P1
- **Preconditions**: bug-gather-analyst.md exists
- **Input**: Read bug-gather-analyst.md content
- **Expected Result**: Protocol reference header specifically mentions the isdlc.md analyze handler reads and executes the protocol inline
- **Pass Criteria**: Content includes "isdlc.md" AND "inline" in the header area

---

## TG-05: Inline Memory Write-Back (FR-007)

### TC-05.1: Step 7.5a constructs session record from in-memory state (positive)

- **Requirement**: FR-007, AC-007-01
- **Test Type**: positive, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7.5a content
- **Expected Result**: Step 7.5a describes constructing the session record from in-memory conversation state (topics covered, depth preferences, overrides) rather than parsing agent output
- **Pass Criteria**: Content includes "in-memory" or "in memory" AND "session record" or "writeSessionRecord" in the step 7.5a area

### TC-05.2: No SESSION_RECORD parsing from agent output (negative)

- **Requirement**: FR-007, AC-007-01
- **Test Type**: negative, structural
- **Priority**: P0
- **Preconditions**: isdlc.md exists
- **Input**: Read isdlc.md step 7.5a content
- **Expected Result**: Step 7.5a does NOT contain SESSION_RECORD JSON block parsing from roundtable output
- **Pass Criteria**: The step 7.5a section does not contain "Parse the SESSION_RECORD JSON block from the roundtable's final output"

---

## TG-06: Cross-File Consistency (Integration)

### TC-06.1: isdlc.md references reading roundtable-analyst.md (positive)

- **Requirement**: FR-001, FR-006
- **Test Type**: positive, integration
- **Priority**: P0
- **Preconditions**: Both files exist
- **Input**: Read isdlc.md content
- **Expected Result**: isdlc.md step 7a explicitly references reading `roundtable-analyst.md`
- **Pass Criteria**: isdlc.md contains "roundtable-analyst.md" in the context of a Read instruction

### TC-06.2: isdlc.md references reading bug-gather-analyst.md (positive)

- **Requirement**: FR-002, FR-006
- **Test Type**: positive, integration
- **Priority**: P0
- **Preconditions**: Both files exist
- **Input**: Read isdlc.md content
- **Expected Result**: isdlc.md step 6.5c explicitly references reading `bug-gather-analyst.md`
- **Pass Criteria**: isdlc.md contains "bug-gather-analyst.md" in the context of a Read instruction

### TC-06.3: Roundtable-analyst.md mentions execution mode in header (positive)

- **Requirement**: FR-006, AC-006-01
- **Test Type**: positive, integration
- **Priority**: P0
- **Preconditions**: roundtable-analyst.md exists
- **Input**: Read roundtable-analyst.md content
- **Expected Result**: Header contains "Execution mode" label
- **Pass Criteria**: Content includes "Execution mode"

### TC-06.4: Bug-gather-analyst.md mentions execution mode in header (positive)

- **Requirement**: FR-006, AC-006-02
- **Test Type**: positive, integration
- **Priority**: P0
- **Preconditions**: bug-gather-analyst.md exists
- **Input**: Read bug-gather-analyst.md content
- **Expected Result**: Header contains "Execution mode" label
- **Pass Criteria**: Content includes "Execution mode"

### TC-06.5: No new dependencies added (negative)

- **Requirement**: NFR (Article V)
- **Test Type**: negative, integration
- **Priority**: P0
- **Preconditions**: package.json exists
- **Input**: Read package.json
- **Expected Result**: Runtime dependencies unchanged
- **Pass Criteria**: Dependencies list matches pre-implementation snapshot

### TC-06.6: Only 3 files are modification targets (positive)

- **Requirement**: Architecture constraint
- **Test Type**: positive, integration
- **Priority**: P1
- **Preconditions**: All 3 target files exist
- **Input**: Read all 3 files
- **Expected Result**: All 3 files (isdlc.md, roundtable-analyst.md, bug-gather-analyst.md) exist and are non-empty
- **Pass Criteria**: All 3 files readable with length > 0

---

## Behavioral Test Cases (Human-Verified)

These test cases cannot be automated with structural grep tests. They are validated by running actual analyze sessions during implementation.

### TC-B01: First question latency under 15 seconds (FR-004)

- **Requirement**: FR-004, AC-004-01
- **Test Type**: positive, behavioral
- **Priority**: P0
- **Preconditions**: All inline changes implemented; user invokes `/isdlc analyze "#N"`
- **Input**: Run analyze on a GitHub issue with roundtable path
- **Expected Result**: Maya's first question appears within 15 seconds of reaching step 7
- **Pass Criteria**: Stopwatch measurement from step 7 entry to first visible question < 15s (excluding network latency for external fetches)
- **Note**: Manual measurement during implementation. Compare against baseline 3+ minute wait.

### TC-B02: Conversation quality identical to subagent flow (FR-005)

- **Requirement**: FR-005, AC-005-01, AC-005-02
- **Test Type**: positive, behavioral
- **Priority**: P0
- **Preconditions**: All inline changes implemented
- **Input**: Run analyze on a feature issue through complete roundtable
- **Expected Result**: All 3 artifacts produced (requirements-spec.md, architecture-overview.md, module-design.md) with same content quality. Confirmation sequence (Requirements -> Architecture -> Design) works correctly. Topic coverage tracking operates normally.
- **Pass Criteria**: Artifacts written to correct folder; confirmation sequence follows Maya -> Alex -> Jordan order; all topics covered

### TC-B03: Bug-gather inline produces correct artifacts (FR-002)

- **Requirement**: FR-002, AC-002-01, AC-002-02, AC-002-03
- **Test Type**: positive, behavioral
- **Priority**: P0
- **Preconditions**: All inline changes implemented
- **Input**: Run analyze on a bug issue through bug-gather path
- **Expected Result**: Bug-gather conversation runs inline. Structured playback presented. Artifacts (bug-report.md, requirements-spec.md) written correctly. Flow proceeds to fix handoff gate.
- **Pass Criteria**: Bug-gather completes without relay loop; artifacts produced; fix handoff presented

### TC-B04: Memory write-back succeeds from in-memory state (FR-007)

- **Requirement**: FR-007, AC-007-01
- **Test Type**: positive, behavioral
- **Priority**: P1
- **Preconditions**: All inline changes implemented; memory layer active
- **Input**: Complete a roundtable analysis session
- **Expected Result**: Session record written via writeSessionRecord() from in-memory conversation state (topics covered, depth preferences). No SESSION_RECORD parsing from agent output.
- **Pass Criteria**: Session record file created; contains topics_covered and depth data; no errors in memory write-back step
