# Test Strategy: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Phase**: 05-test-strategy
**Status**: Complete
**Traces**: FR-001 through FR-017, ADR-001 through ADR-006

---

## 1. Executive Summary

This test strategy covers the rearchitecture of the sequential 5-phase analyze pipeline into a unified concurrent conversation model. The feature affects ~31 files, all of which are markdown prompt files (.md) or their reorganization -- with zero modifications to existing utility code (three-verb-utils.cjs).

### Key Testing Constraint

The primary implementation artifacts are **markdown agent prompt files** (roundtable-lead.md, 3 persona files, 6 topic files) and a **markdown command file** (isdlc.md). These files contain natural language instructions for Claude Code agents. **Automated unit testing is not feasible for prompt files.** The impact analysis confirms: "Prompt files (markdown) -- no automated tests exist or are feasible. Validation is manual end-to-end testing."

### Testing Strategy Summary

| Test Type | Applicability | Rationale |
|-----------|--------------|-----------|
| Unit tests (automated) | Regression only | No new utility code is introduced (ADR-004). Existing `three-verb-utils.cjs` functions are unchanged. Run existing test suite for regression. |
| Integration tests (automated) | Limited: meta.json schema compatibility | Verify `deriveAnalysisStatus()` and `writeMetaJson()` work correctly with the progressive `phases_completed` model. |
| E2E tests (manual) | Primary validation method | End-to-end analyze sessions testing the unified conversation model, persona behavior, progressive artifacts, coverage tracking, and dual execution modes. |
| Manual testing protocols | Primary validation method | Structured manual test scripts with observable pass/fail criteria for each functional requirement. |
| Structural validation (automated) | File presence and format | Verify new files exist, YAML frontmatter is valid, required sections are present, and old files are removed. |

## 2. Existing Infrastructure

### Test Framework
- **Runner**: `node:test` (Node.js built-in test runner)
- **Convention**: `*.test.cjs` for hook tests, `*.test.js` for library tests
- **Location**: `src/claude/hooks/tests/` for hooks, `lib/` for library code
- **Commands**:
  - `npm test` -- library tests
  - `npm run test:hooks` -- hook tests (includes three-verb-utils tests)

### Relevant Existing Tests
- `src/claude/hooks/tests/test-three-verb-utils.test.cjs` -- Tests for `deriveAnalysisStatus()`, `readMetaJson()`, `writeMetaJson()`, `computeRecommendedTier()`, etc.
- `src/claude/hooks/tests/test-three-verb-utils-steps.test.cjs` -- Step-related utility tests
- These tests verify the transitive dependency chain that must remain stable.

### Coverage Assessment from Impact Analysis
| Area | Automated Coverage | Change Required |
|------|-------------------|-----------------|
| `three-verb-utils.cjs` utility functions | Good (existing test suite) | None -- functions are not modified |
| Roundtable agent behavior | None (prompt files) | Manual E2E testing |
| Agent teams integration | None (new feature) | Manual E2E testing |
| `isdlc.md` analyze flow | None (prompt file) | Manual E2E testing |
| Step/topic file consumption | None (internal to agent) | Manual E2E testing |

## 3. Test Pyramid

Given the nature of this feature (prompt engineering, not code), the traditional test pyramid is inverted:

```
        /------------------\          <-- E2E / Manual (PRIMARY)
       /                    \
      /    Manual Protocols   \       <-- Structured observation tests
     /________________________\
    /   Structural Validation   \     <-- Automated file/format checks
   /____________________________\
  /    Regression (Unit/Integ)    \   <-- Existing test suite (UNCHANGED)
 /________________________________\
```

- **Base**: Regression suite (existing, run as-is, zero new tests for unchanged code)
- **Middle**: Structural validation (automated checks for file existence, frontmatter, section presence)
- **Top**: Manual E2E and protocol-based testing (the primary validation method for this feature)

## 4. Test Categories

### 4.1 Regression Tests (Automated)

**Purpose**: Verify that unchanged utility functions continue to work correctly after the feature is deployed.

**Scope**: Run existing test suites with no modifications.

| Test Suite | Command | Expected | Traces |
|------------|---------|----------|--------|
| three-verb-utils | `node --test src/claude/hooks/tests/test-three-verb-utils.test.cjs` | All pass, zero regressions | FR-014 (phases_completed preserved) |
| three-verb-utils-steps | `node --test src/claude/hooks/tests/test-three-verb-utils-steps.test.cjs` | All pass, zero regressions | FR-009 (step file backward compat) |
| Full hook suite | `npm run test:hooks` | All pass, zero regressions | General regression |
| Full library suite | `npm test` | All pass, zero regressions | General regression |

**Pass criteria**: Zero test failures. Zero new tests needed (no code changes).

### 4.2 Structural Validation Tests (Automated)

**Purpose**: Verify the file-level changes are correct -- new files exist, old files removed, frontmatter valid, required sections present.

These tests CAN be automated as a `.test.cjs` file because they validate file system state, not agent behavior.

**Test file**: `src/claude/hooks/tests/concurrent-analyze-structure.test.cjs`

| TC-ID | Test Case | Validates | Traces |
|-------|-----------|-----------|--------|
| SV-01 | New agent files exist | `roundtable-lead.md`, `persona-business-analyst.md`, `persona-solutions-architect.md`, `persona-system-designer.md` all exist in `src/claude/agents/` | FR-008, AC-008-01..04 |
| SV-02 | Old agent file removed | `roundtable-analyst.md` does not exist in `src/claude/agents/` | FR-008 |
| SV-03 | Lead file has valid YAML frontmatter | `roundtable-lead.md` has `name: roundtable-lead`, `model: opus` in frontmatter | FR-008, AC-008-01 |
| SV-04 | Persona files have valid YAML frontmatter | Each persona file has correct `name`, `model`, and `owned_skills` fields | FR-008, AC-008-02..04 |
| SV-05 | Lead file contains required sections | Sections: Execution Modes, Conversation Protocol, Coverage Tracker, Information Threshold Engine, Artifact Coordination, Meta.json Protocol | FR-001, FR-004, FR-005 |
| SV-06 | Persona files are self-contained | Each persona file contains: Identity, Principles, Voice Rules, Artifact Responsibilities sections | FR-008, AC-008-05..06 |
| SV-07 | Topic directories exist (Mode 2) | `src/claude/skills/analysis-topics/` directory exists with subdirectories | FR-009, AC-009-01 |
| SV-08 | Topic files have coverage_criteria frontmatter | Each topic file includes `coverage_criteria` in YAML frontmatter | FR-009, AC-009-03 |
| SV-09 | Security topic file exists | New security considerations topic file created | FR-009, AC-009-04 |
| SV-10 | Phase sequencing metadata removed from topic files | Topic files do not contain `step_id` or `depends_on` in frontmatter | FR-009, AC-009-05 |
| SV-11 | isdlc.md dispatch is single (not loop) | isdlc.md analyze section contains single dispatch to roundtable-lead, not per-phase loop | FR-014, AC-014-01..02 |
| SV-12 | No elaboration mode references | None of the 4 new agent files contain `[E]`, `elaboration`, or `elaboration_config` | FR-016, AC-016-01..02 |
| SV-13 | No menu system references | None of the 4 new agent files contain `[C]`, `[S]`, `step boundary menu`, or `phase boundary menu` | FR-017, AC-017-01..02 |

### 4.3 Manual E2E Test Protocols

**Purpose**: Validate agent behavior, conversation quality, and artifact production through structured observe-and-verify test sessions.

Each manual test protocol specifies:
- **Preconditions**: Setup required before the test
- **Steps**: Exact user actions and inputs
- **Observable criteria**: What the tester looks for in the agent's output
- **Pass/Fail**: Clear binary criteria

#### E2E-01: Unified Conversation Model (FR-001)

**Preconditions**: A BACKLOG.md item exists that has been intaked (draft.md present in artifact folder). Agent teams NOT enabled.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Engage in the conversation naturally for at least 5 exchanges
3. Observe all agent responses

**Observable Pass Criteria**:
- [ ] No phase headers (e.g., "Phase 01: Requirements") appear in any response (AC-001-01)
- [ ] No step headers (e.g., "Step 01-01:") appear in any response (AC-001-02)
- [ ] No numbered question lists of 3+ questions appear in a single turn (AC-001-03)
- [ ] No handover announcements (e.g., "Handing off to Alex") appear (AC-001-04)
- [ ] No step boundary menus ([E], [C], [S]) appear (AC-001-05)
- [ ] All three persona voices (Maya, Alex, Jordan) contribute within the first 3 exchanges (AC-001-06)

**Fail Criteria**: Any of the above observable criteria is violated.

#### E2E-02: Silent Codebase Scan (FR-002)

**Preconditions**: Same as E2E-01.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Observe the first 2 agent responses

**Observable Pass Criteria**:
- [ ] No "scanning codebase" or "Phase 00" messaging visible (AC-002-01)
- [ ] By the second response, Alex references specific codebase details (file names, module names, code patterns) (AC-002-02)
- [ ] Maya engages the user immediately in the first response without waiting for scan results (AC-002-03)

#### E2E-03: Progressive Artifact Production (FR-003)

**Preconditions**: Same as E2E-01.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Engage in conversation for 8+ exchanges, providing rich business and technical context
3. After every 2-3 exchanges, check the artifact folder for new/updated files

**Observable Pass Criteria**:
- [ ] Artifacts appear in the artifact folder during the conversation, not only after completion (AC-003-01)
- [ ] Artifacts are written based on information sufficiency, not at fixed phase transitions (AC-003-02)
- [ ] If conversation is interrupted (Ctrl+C), artifacts written up to that point are preserved (AC-003-03)
- [ ] Subsequent artifact writes update existing files (not create duplicates) (AC-003-04)

#### E2E-04: Information Threshold Engine (FR-004)

**Preconditions**: Same as E2E-01.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Provide only business context initially (problem statement, users, goals)
3. Observe when requirements-spec.md is first written
4. Then provide technical context (architecture preferences, existing code patterns)
5. Observe when architecture-overview.md is first written

**Observable Pass Criteria**:
- [ ] The system evaluates coverage criteria from topic files before writing artifacts (AC-004-01)
- [ ] No user input is required to trigger artifact writing (AC-004-02)
- [ ] Requirements artifacts appear earlier than architecture/design artifacts (AC-004-03)
- [ ] Providing more detail on specific topics results in richer corresponding artifacts (AC-004-04)

#### E2E-05: Invisible Coverage Tracker (FR-005)

**Preconditions**: Same as E2E-01.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Engage in conversation, deliberately avoiding discussion of error handling and security
3. Observe whether the agent steers toward those topics

**Observable Pass Criteria**:
- [ ] The coverage tracker is never displayed to the user -- no "coverage: 60%" or checklist shown (AC-005-01)
- [ ] The lead steers conversation toward uncovered topics without explicit announcements like "Now let's discuss error handling" (AC-005-02)
- [ ] If allowed to complete naturally, all topics are covered before the lead suggests completion (AC-005-03)
- [ ] Topic coverage criteria from topic files are being used (verifiable from artifacts produced) (AC-005-04)

#### E2E-06: Dual Execution Modes (FR-006)

**Preconditions**: Two test sessions: one with agent teams disabled (default), one with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` enabled.

**Steps**:
1. Run analyze on the same item in both modes
2. Compare the user experience and artifact output

**Observable Pass Criteria**:
- [ ] Single-agent mode activates by default (AC-006-01)
- [ ] Agent teams mode activates when env var is set and user opts in (AC-006-02)
- [ ] Conversation experience is visually identical in both modes (AC-006-03)
- [ ] Agent teams mode produces artifacts faster (AC-006-04) -- measure wall clock time
- [ ] Agent teams mode may produce deeper analysis (AC-006-05) -- compare artifact depth

#### E2E-07: Agent Teams Orchestration (FR-007)

**Preconditions**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` enabled.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Observe Task tool spawning and message flow

**Observable Pass Criteria**:
- [ ] Maya is the team lead managing user interaction (AC-007-01)
- [ ] Alex spawned as a teammate (visible in agent teams UI) (AC-007-02)
- [ ] Jordan spawned as a teammate (visible in agent teams UI) (AC-007-03)
- [ ] Teammate findings appear in the conversation at natural break points (AC-007-04, AC-007-05)
- [ ] Teammates write their own artifacts directly (AC-007-06) -- check artifact file timestamps

#### E2E-08: Persona Behavior Verification (FR-008)

**Preconditions**: New agent files deployed.

**Steps**:
1. Invoke `analyze {item-slug}` in single-agent mode
2. Observe each persona's contributions across 10+ exchanges

**Observable Pass Criteria**:
- [ ] Maya focuses on business context, user needs, requirements (AC-008-02)
- [ ] Alex provides codebase observations, impact analysis, architecture options (AC-008-03)
- [ ] Jordan contributes design specifications, interface details, data structures (AC-008-04)
- [ ] Each persona maintains a distinct voice -- no blending or echoing
- [ ] In single-agent mode, the lead reads all persona files (AC-008-05) -- inferred from all 3 voices appearing

#### E2E-09: Topic File Validation (FR-009)

**Preconditions**: Topic files restructured from phase-based to topic-based directories.

**Steps**:
1. Compare content coverage between old step files and new topic files
2. Invoke `analyze {item-slug}` and verify all analytical areas are covered in the conversation

**Observable Pass Criteria**:
- [ ] Topic directories exist: problem-discovery, technical-analysis, architecture, specification (AC-009-01)
- [ ] Analytical knowledge from old step files is preserved in new topic files (AC-009-02) -- spot-check questions and validation criteria
- [ ] Coverage criteria present in topic file frontmatter (AC-009-03)
- [ ] Security considerations topic file exists and is used (AC-009-04)
- [ ] No step_id or depends_on in topic file frontmatter (AC-009-05)
- [ ] All personas reference topic files regardless of original phase association (AC-009-06)

#### E2E-10: Organic Persona Interaction (FR-010)

**Preconditions**: Same as E2E-01.

**Steps**:
1. Invoke `analyze {item-slug}`
2. During conversation, let a technical decision surface naturally (e.g., database choice, API pattern)
3. Observe how Alex/Jordan respond

**Observable Pass Criteria**:
- [ ] Alex and Jordan do not ask open-ended technical questions like "What pattern do you prefer?" (AC-010-01)
- [ ] Technical decisions are presented as options with a recommendation and reasoning (AC-010-02)
- [ ] User can accept, choose differently, or ask for more detail (AC-010-03)
- [ ] If user provides no input, persona proceeds with recommendation (AC-010-04)
- [ ] Persona contributions are batched at natural breaks, not mid-thread (AC-010-05)

#### E2E-11: Confidence Indicators (FR-011)

**Preconditions**: Analyze session completed.

**Steps**:
1. Complete an analyze session
2. Read the produced requirements-spec.md

**Observable Pass Criteria**:
- [ ] Every FR has a confidence indicator (high, medium, or low) (AC-011-01)
- [ ] High confidence corresponds to user-confirmed requirements (AC-011-02)
- [ ] Medium confidence corresponds to inferred requirements (AC-011-03)
- [ ] Low confidence corresponds to extrapolated requirements with flagged assumptions (AC-011-04)
- [ ] Confidence format is machine-readable (consistent marker, not just prose) (AC-011-05)

#### E2E-12: Artifact Cross-Check (FR-012)

**Preconditions**: Same as E2E-01.

**Steps**:
1. Complete an analyze session through to the completion suggestion
2. Observe the cross-check phase

**Observable Pass Criteria**:
- [ ] Lead announces cross-check: "Before we wrap up, I'm having Alex and Jordan verify..." (AC-012-01)
- [ ] Each persona reviews their artifacts (AC-012-02) -- observable from cross-check output
- [ ] Inconsistencies are corrected (AC-012-03) -- check artifact timestamps for updates
- [ ] User is informed of corrections (AC-012-04)

#### E2E-13: Conversation Completion Model (FR-013)

**Preconditions**: Same as E2E-01. Run 3 separate sessions.

**Session A -- Natural Completion**:
1. Engage until lead suggests completion
2. Confirm completion

**Observable Pass Criteria**:
- [ ] Lead suggests completion with artifact summary (AC-013-01)

**Session B -- Early Exit**:
1. After 3 exchanges, say "that's enough"
2. Check artifacts

**Observable Pass Criteria**:
- [ ] Partial artifacts are preserved (AC-013-02)
- [ ] Uncovered topics flagged in artifacts (AC-013-04)

**Session C -- Deeper Exploration**:
1. When lead suggests completion, request more depth on a topic
2. Observe persona continuation

**Observable Pass Criteria**:
- [ ] Relevant persona continues with deeper analysis (AC-013-03)

#### E2E-14: Single Dispatch from isdlc.md (FR-014)

**Preconditions**: Updated isdlc.md deployed.

**Steps**:
1. Invoke `analyze {item-slug}`
2. Observe the dispatch behavior

**Observable Pass Criteria**:
- [ ] Single dispatch to roundtable-lead (AC-014-01) -- no multiple phase delegations visible
- [ ] No per-phase delegation loop (AC-014-02)
- [ ] Single validation at the end (AC-014-03)
- [ ] Lead manages progress tracking via meta.json (AC-014-04)

#### E2E-15: Adaptive Artifact Depth (FR-015)

**Preconditions**: Run 2 sessions with different user profiles.

**Session A -- Product Owner Profile**:
1. Provide rich business context but limited technical input
2. When asked technical questions, respond with "I'm not sure about the technical details"

**Session B -- Architect Profile**:
1. Provide rich technical context, limited business context

**Observable Pass Criteria**:
- [ ] Session A: requirements high confidence, architecture/design lighter with assumptions flagged (AC-015-01)
- [ ] Session B: architecture/design high confidence (AC-015-02)
- [ ] Alex fills gaps from codebase analysis when user lacks technical knowledge (AC-015-03)
- [ ] System does not require input outside user's expertise (AC-015-04)

#### E2E-16: Elaboration Mode Removal (FR-016) and Menu System Removal (FR-017)

**Preconditions**: New agent files deployed.

**Steps**:
1. Run a full analyze session
2. Search all 4 new agent files for removed patterns

**Observable Pass Criteria**:
- [ ] No [E] option presented during session (AC-016-01)
- [ ] No elaboration handler, synthesis engine, or state tracker in new files (AC-016-02)
- [ ] No elaboration_config in meta.json output (AC-016-03)
- [ ] No step boundary menus during session (AC-017-01)
- [ ] No phase boundary menus during session (AC-017-02)
- [ ] User controls conversation via natural language (AC-017-03)

### 4.4 meta.json Compatibility Tests (Automated)

**Purpose**: Verify that the progressive `phases_completed` population model used by the new lead orchestrator remains compatible with `deriveAnalysisStatus()` and downstream consumers.

**Test file**: `src/claude/hooks/tests/concurrent-analyze-meta-compat.test.cjs`

| TC-ID | Test Case | Validates | Traces |
|-------|-----------|-----------|--------|
| MC-01 | Progressive phases_completed accumulation | `deriveAnalysisStatus()` returns correct status for partial phase arrays (e.g., just ["00-quick-scan"]) | FR-014, FR-003 |
| MC-02 | Out-of-order phase completion | `deriveAnalysisStatus()` handles phases completed in non-sequential order (e.g., ["00-quick-scan", "03-architecture"]) | FR-003 (progressive writes) |
| MC-03 | Full phases_completed produces "analyzed" | When all 5 phases present, status is "analyzed" | FR-014, backward compat |
| MC-04 | meta.json with topics_covered field | `readMetaJson()` and `writeMetaJson()` handle the new `topics_covered` array without error | FR-009, Design D7 |
| MC-05 | meta.json without steps_completed | `readMetaJson()` handles absence of `steps_completed` when replaced by `topics_covered` | FR-009, backward compat |
| MC-06 | Sizing trigger with concurrent meta.json | `computeRecommendedTier()` works with meta.json written by concurrent model (same schema, different production order) | FR-014, Risk R8 |

## 5. Flaky Test Mitigation

### Automated Tests
The automated tests in this strategy (structural validation, meta.json compatibility) are deterministic:
- Structural validation checks file existence and content -- no timing dependencies
- meta.json compatibility tests use temp directories with controlled input -- no external dependencies
- All tests use `node:test` with synchronous assertions -- no async race conditions

### Manual E2E Tests
Manual tests involve LLM behavior, which is inherently non-deterministic. Mitigation:
- Each manual test has clear, binary observable criteria (present/absent, not quality judgments)
- Run each manual test 2x minimum to confirm consistency
- If a test passes once and fails once, investigate the agent prompt for insufficient constraint specificity
- Focus observation on structural behavior (did phase headers appear? did menus appear?) not on subjective quality (was the analysis good?)
- Document any non-deterministic observations for prompt tuning

## 6. Performance Test Plan

### Metrics to Collect

| Metric | How Measured | Baseline (Current Sequential) | Target (Concurrent) |
|--------|-------------|-------------------------------|---------------------|
| Wall-clock time (single-agent) | Timestamp analyze start to completion | Measure on current codebase | No slower than baseline (FR performance attribute) |
| Wall-clock time (agent teams) | Same as above | Same baseline | Faster than baseline due to parallelism |
| Token usage (single-agent) | Claude Code usage stats | Measure on current codebase | Comparable to baseline |
| Token usage (agent teams) | Sum of all agent usage | Same baseline | ~3x (acknowledged tradeoff) |
| Artifact count and completeness | Count files, check sections | All 12 artifacts present | All 12 artifacts present |
| Turn count to coverage | Count exchanges before completion suggested | Measure on current codebase | Comparable or fewer turns |

### Performance Test Protocol
1. Select 2 representative items: one small (trivial complexity), one medium (standard complexity)
2. Run each through current sequential model and record baseline metrics
3. Run each through new concurrent model (single-agent) and compare
4. Run each through new concurrent model (agent teams) and compare
5. Document findings in test results

### Performance Pass Criteria
- Single-agent mode: wall-clock time within 120% of baseline
- Agent teams mode: wall-clock time under 80% of baseline
- All artifacts produced in both modes
- No artifact quality degradation (same coverage of topics)

## 7. Test Data Plan

### Test Items
To run manual E2E tests, we need prepared analysis items. Use:

1. **Existing item**: Pick a previously analyzed BACKLOG.md item that has a draft.md. Re-analyze it with the new model and compare artifact quality to the previous analysis.
2. **Fresh item**: Create a new BACKLOG.md entry for a simple feature (e.g., "add --verbose flag to analyze"). Intake it to produce a draft.md, then analyze with the new model.
3. **Technical item**: Pick an item that requires deep codebase analysis (e.g., a bug in an existing hook). Tests the silent codebase scan and Alex's technical depth.
4. **Non-technical item**: A business-focused item with minimal code implications. Tests Maya's dominance and adaptive artifact depth for non-technical users.

### Test Environment
- Clean working directory (no uncommitted changes)
- Feature branch with new agent files deployed
- Agent teams environment variable togglable
- Fresh artifact folders (no prior analysis artifacts for test items)

### Boundary Conditions

| Condition | Test Data | Expected Behavior | Traces |
|-----------|-----------|-------------------|--------|
| No draft.md | Item with no prior intake | Lead proceeds with "(No draft available)". Conversation starts from scratch. | AC-002-03, IP-1 |
| Empty meta.json | Item with `{}` meta.json | Lead treats as fresh analysis. All topics to be covered. | DS-7, error handling |
| Corrupt meta.json | Item with malformed JSON in meta.json | Lead logs warning, treats as fresh analysis. | Error taxonomy RT-6xx |
| Prior partial analysis | Item with some phases_completed | Lead picks up from where coverage left off (resume behavior). | Data flow resumability |
| Very large codebase scan | Item that touches many files across the project | Alex's scan completes silently, findings are relevant and focused. | AC-002-01, AC-002-02 |
| User provides minimal input | One-word answers, "I don't know" | System adapts, Alex fills gaps from codebase, confidence indicators show low. | FR-015, AC-015-03 |

### Invalid/Edge Inputs

| Input | Expected Behavior | Traces |
|-------|-------------------|--------|
| User says "stop" mid-conversation | Early exit: partial artifacts preserved, gaps flagged | FR-013, AC-013-02 |
| User asks to go deeper after completion suggested | Relevant persona continues, re-evaluates coverage | FR-013, AC-013-03 |
| User asks a question unrelated to analysis | Lead gracefully redirects to analysis topics | FR-005 coverage tracker |
| Teammate fails in agent teams mode | Lead reads written artifacts, continues in single-agent mode | ADR-006, FR-007 |
| Agent teams not available (env var not set) | Falls back to single-agent mode silently | FR-006, AC-006-01 |

## 8. Coverage Targets

### Automated Test Coverage
| Scope | Target | Rationale |
|-------|--------|-----------|
| three-verb-utils.cjs (regression) | Maintain existing coverage (no changes) | Functions are unchanged; regression only |
| Structural validation tests | 100% of new/modified files | All 4 new agent files, all topic files, isdlc.md dispatch change verified |
| meta.json compatibility tests | 100% of progressive population scenarios | Critical backward compatibility interface |

### Manual Test Coverage
| Scope | Target | Rationale |
|-------|--------|-----------|
| Functional requirements | 100% -- all 17 FRs have at least 1 manual test | Complete requirement coverage per Article VII |
| Acceptance criteria | 100% -- all 64 ACs have observable criteria | Full traceability per Article VII |
| User journeys | 100% -- all 3 journeys (primary, early exit, deeper exploration) tested | End-to-end validation per Article XI |
| Risk zones | 100% -- all 10 risk zones (R1-R10) have a test that exercises the risk | Risk mitigation verification |
| Execution modes | Both modes tested (single-agent, agent teams) | FR-006 dual mode validation |

## 9. Critical Paths

The following test sequences represent critical paths that must pass before the feature can be considered validated:

### Critical Path 1: Core Conversation Model
E2E-01 (unified conversation) -> E2E-05 (coverage tracker) -> E2E-03 (progressive artifacts) -> E2E-12 (cross-check) -> E2E-13A (natural completion)

### Critical Path 2: Persona Architecture
SV-01..SV-06 (structural validation) -> E2E-08 (persona behavior) -> E2E-10 (organic interaction) -> E2E-02 (silent scan)

### Critical Path 3: Backward Compatibility
MC-01..MC-06 (meta.json compat) -> Regression suite (all pass) -> E2E-14 (single dispatch) -> E2E-11 (confidence indicators)

### Critical Path 4: Agent Teams Mode
E2E-06 (dual modes) -> E2E-07 (agent teams orchestration) -> Performance tests

### Critical Path 5: Removal Verification
SV-02 (old file removed) -> SV-12 (no elaboration) -> SV-13 (no menus) -> E2E-16 (removal verification)

## 10. Test Execution Plan

### Phase 1: Pre-Implementation Validation
1. Run full regression suite -- confirm baseline is green
2. Record performance baseline metrics on current sequential model

### Phase 2: During Implementation (Per Implementation Step)
After each implementation step (Steps 1-5 from impact analysis):

| Step | Tests to Run |
|------|-------------|
| Step 1 (Persona split) | SV-01..SV-06, SV-12, SV-13 |
| Step 2a (Topic restructuring) | SV-07..SV-10 |
| Step 2b (Lead orchestrator) | E2E-01, E2E-03, E2E-04, E2E-05, E2E-08, E2E-10 |
| Step 3 (Silent scan) | E2E-02 |
| Step 4 (isdlc.md dispatch) | SV-11, E2E-14, MC-01..MC-06, full regression |
| Step 5 (Cross-check) | E2E-12 |

### Phase 3: Full Validation (All Steps Complete)
1. Run all structural validation tests (SV-01..SV-13)
2. Run all meta.json compatibility tests (MC-01..MC-06)
3. Run full regression suite
4. Run all E2E manual tests (E2E-01..E2E-16)
5. Run performance comparison
6. Verify all critical paths pass

## 11. Test Artifacts Produced

| Artifact | Location | Format |
|----------|----------|--------|
| Test strategy (this document) | `docs/requirements/REQ-0032-concurrent-phase-execution-in-roundtable-analyze/test-strategy.md` | Markdown |
| Test cases | `docs/requirements/REQ-0032-concurrent-phase-execution-in-roundtable-analyze/test-cases.md` | Markdown |
| Traceability matrix | `docs/requirements/REQ-0032-concurrent-phase-execution-in-roundtable-analyze/traceability-matrix.csv` | CSV |
| Structural validation tests (automated) | `src/claude/hooks/tests/concurrent-analyze-structure.test.cjs` | CJS test file |
| Meta.json compat tests (automated) | `src/claude/hooks/tests/concurrent-analyze-meta-compat.test.cjs` | CJS test file |

## 12. Constitutional Compliance

| Article | Compliance | Evidence |
|---------|------------|----------|
| Article II (Test-First Development) | Compliant | Tests designed before implementation. Automated tests (structural validation, meta.json compat) will be written as .test.cjs files before production code. Manual test protocols defined with observable criteria. Coverage targets defined. |
| Article VII (Artifact Traceability) | Compliant | Every FR maps to at least one test case. Every AC has an observable criterion. Traceability matrix provides 100% coverage. |
| Article IX (Quality Gate Integrity) | Compliant | All required test artifacts produced. Coverage targets defined. Critical paths identified. Execution plan staged per implementation step. |
| Article XI (Integration Testing Integrity) | Compliant | Integration tests validate component interactions: meta.json schema compatibility tests verify progressive population model works with existing consumers. E2E manual tests verify cross-component behavior (isdlc.md dispatch -> lead -> personas -> artifacts). Agent teams mode tests verify concurrent teammate coordination. |
