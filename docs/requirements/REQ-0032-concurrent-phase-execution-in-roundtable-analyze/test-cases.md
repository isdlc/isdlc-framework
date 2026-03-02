# Test Cases: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Phase**: 05-test-strategy
**Status**: Complete
**Traces**: FR-001 through FR-017

---

## 1. Structural Validation Tests (Automated)

These tests verify file-level correctness and can be implemented as automated `node:test` suites.

### TC-SV: File Structure Validation Suite

**Test file**: `src/claude/hooks/tests/concurrent-analyze-structure.test.cjs`

---

#### SV-01: New Agent Files Exist
- **Requirement**: FR-008, AC-008-01, AC-008-02, AC-008-03, AC-008-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Feature branch with implementation complete
- **Input**: File system paths under `src/claude/agents/`
- **Steps**:
  1. Check `src/claude/agents/roundtable-lead.md` exists
  2. Check `src/claude/agents/persona-business-analyst.md` exists
  3. Check `src/claude/agents/persona-solutions-architect.md` exists
  4. Check `src/claude/agents/persona-system-designer.md` exists
- **Expected Result**: All 4 files exist and are non-empty
- **Pass Criteria**: `fs.existsSync()` returns true for all 4 paths; file size > 100 bytes each

---

#### SV-02: Old Agent File Removed
- **Requirement**: FR-008
- **Test Type**: negative
- **Priority**: P0
- **Preconditions**: Feature branch with implementation complete
- **Input**: File path `src/claude/agents/roundtable-analyst.md`
- **Steps**:
  1. Check `src/claude/agents/roundtable-analyst.md` does NOT exist
- **Expected Result**: File does not exist
- **Pass Criteria**: `fs.existsSync()` returns false

---

#### SV-03: Lead File Has Valid YAML Frontmatter
- **Requirement**: FR-008, AC-008-01
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: `roundtable-lead.md` exists
- **Input**: Contents of `src/claude/agents/roundtable-lead.md`
- **Steps**:
  1. Read file contents
  2. Extract YAML frontmatter (between `---` delimiters)
  3. Parse YAML
  4. Verify `name` field equals `roundtable-lead`
  5. Verify `model` field equals `opus`
- **Expected Result**: Frontmatter is valid YAML with correct name and model
- **Pass Criteria**: YAML parses without error; `name === 'roundtable-lead'`; `model === 'opus'`

---

#### SV-04: Persona Files Have Valid YAML Frontmatter
- **Requirement**: FR-008, AC-008-02, AC-008-03, AC-008-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: All 3 persona files exist
- **Input**: Contents of each persona file
- **Steps**:
  1. For each persona file:
     a. Read file contents
     b. Extract and parse YAML frontmatter
     c. Verify `name` field matches expected value
     d. Verify `model` field is present
- **Expected Result**: Each persona file has valid YAML with correct name
- **Pass Criteria**:
  - `persona-business-analyst.md`: name matches `persona-business-analyst`
  - `persona-solutions-architect.md`: name matches `persona-solutions-architect`
  - `persona-system-designer.md`: name matches `persona-system-designer`

---

#### SV-05: Lead File Contains Required Sections
- **Requirement**: FR-001, FR-004, FR-005, AC-008-01
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: `roundtable-lead.md` exists
- **Input**: Contents of `roundtable-lead.md`
- **Steps**:
  1. Read file contents
  2. Check for presence of section headers:
     - `Execution Modes`
     - `Conversation Protocol`
     - `Coverage Tracker`
     - `Information Threshold Engine` or `Threshold`
     - `Artifact Coordination`
     - `Meta.json` or `Progress`
- **Expected Result**: All required sections present
- **Pass Criteria**: Each section header found via regex match (case-insensitive, `##` or `###` prefix)

---

#### SV-06: Persona Files Are Self-Contained
- **Requirement**: FR-008, AC-008-05, AC-008-06
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: All 3 persona files exist
- **Input**: Contents of each persona file
- **Steps**:
  1. For each persona file, check for presence of:
     - Identity section (name, role description)
     - Principles or approach section
     - Voice rules or communication style section
     - Artifact responsibilities section
- **Expected Result**: Each persona file is self-contained with all required sections
- **Pass Criteria**: All 4 section categories found in each persona file

---

#### SV-07: Topic Directories Exist
- **Requirement**: FR-009, AC-009-01
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Topic restructuring complete (implementation step 2a)
- **Input**: File system paths under `src/claude/skills/analysis-topics/`
- **Steps**:
  1. Check `src/claude/skills/analysis-topics/` directory exists
  2. Check for expected subdirectories (problem-discovery, technical-analysis, architecture, specification)
- **Expected Result**: Directory and subdirectories exist
- **Pass Criteria**: Directory and at least 4 subdirectories exist

---

#### SV-08: Topic Files Have coverage_criteria Frontmatter
- **Requirement**: FR-009, AC-009-03
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Topic files exist
- **Input**: Contents of each topic file under `analysis-topics/`
- **Steps**:
  1. Glob for all `.md` files under `analysis-topics/`
  2. For each file, extract YAML frontmatter
  3. Verify `coverage_criteria` field is present and non-empty
- **Expected Result**: All topic files have coverage_criteria in frontmatter
- **Pass Criteria**: Every `.md` file in the topic directories has a parseable `coverage_criteria` YAML field

---

#### SV-09: Security Topic File Exists
- **Requirement**: FR-009, AC-009-04
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Topic restructuring complete
- **Input**: File system under `src/claude/skills/analysis-topics/`
- **Steps**:
  1. Search for a file matching `*security*` under `analysis-topics/`
- **Expected Result**: At least one security-related topic file exists
- **Pass Criteria**: Glob returns at least 1 match

---

#### SV-10: Phase Sequencing Metadata Removed
- **Requirement**: FR-009, AC-009-05
- **Test Type**: negative
- **Priority**: P1
- **Preconditions**: Topic files exist
- **Input**: Contents of each topic file
- **Steps**:
  1. For each topic file, extract YAML frontmatter
  2. Check that `step_id` is NOT present
  3. Check that `depends_on` is NOT present
- **Expected Result**: No topic file contains phase sequencing metadata
- **Pass Criteria**: Neither `step_id` nor `depends_on` found in any topic file's frontmatter

---

#### SV-11: isdlc.md Contains Single Dispatch
- **Requirement**: FR-014, AC-014-01, AC-014-02
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: isdlc.md updated
- **Input**: Contents of `src/claude/commands/isdlc.md`
- **Steps**:
  1. Read the analyze section of isdlc.md
  2. Search for `roundtable-lead` dispatch reference
  3. Verify no per-phase delegation loop (no `for each phase` or sequential phase dispatch pattern)
- **Expected Result**: Single dispatch to roundtable-lead, no phase loop
- **Pass Criteria**: `roundtable-lead` referenced; no `roundtable-analyst` referenced; no per-phase iteration pattern

---

#### SV-12: No Elaboration Mode References
- **Requirement**: FR-016, AC-016-01, AC-016-02
- **Test Type**: negative
- **Priority**: P0
- **Preconditions**: All 4 new agent files exist
- **Input**: Contents of the 4 new agent files
- **Steps**:
  1. For each of the 4 new files, search for:
     - `[E]` (elaboration menu option)
     - `elaboration_config`
     - `elaboration_handler`
     - `synthesis_engine`
     - `elaboration_state`
- **Expected Result**: None of these patterns found in any new file
- **Pass Criteria**: Zero matches across all 4 files

---

#### SV-13: No Menu System References
- **Requirement**: FR-017, AC-017-01, AC-017-02
- **Test Type**: negative
- **Priority**: P0
- **Preconditions**: All 4 new agent files exist
- **Input**: Contents of the 4 new agent files
- **Steps**:
  1. For each of the 4 new files, search for:
     - `[C]` as a menu option
     - `[S]` as a menu option
     - `step boundary menu`
     - `phase boundary menu`
- **Expected Result**: None of these patterns found in any new file
- **Pass Criteria**: Zero matches across all 4 files

---

## 2. meta.json Compatibility Tests (Automated)

These tests verify backward compatibility of the progressive phases_completed population model.

### TC-MC: Meta.json Compatibility Suite

**Test file**: `src/claude/hooks/tests/concurrent-analyze-meta-compat.test.cjs`

---

#### MC-01: Progressive phases_completed Accumulation
- **Requirement**: FR-014, FR-003
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Temp directory with meta.json
- **Input**: meta.json with `phases_completed: ["00-quick-scan"]`
- **Steps**:
  1. Create meta.json with partial phases_completed
  2. Call `deriveAnalysisStatus(["00-quick-scan"])`
  3. Verify result is not "analyzed" (partial)
  4. Call `deriveAnalysisStatus(["00-quick-scan", "01-requirements"])`
  5. Verify result is still partial
- **Expected Result**: Partial phases_completed returns partial status
- **Pass Criteria**: `deriveAnalysisStatus` returns appropriate partial status for incomplete arrays

---

#### MC-02: Out-of-Order Phase Completion
- **Requirement**: FR-003
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: None
- **Input**: phases_completed arrays in non-sequential order
- **Steps**:
  1. Call `deriveAnalysisStatus(["00-quick-scan", "03-architecture"])` (skipping phases 01, 02)
  2. Call `deriveAnalysisStatus(["04-design", "00-quick-scan", "01-requirements"])` (out of order)
- **Expected Result**: Function handles gracefully, returns appropriate status based on count of completed phases
- **Pass Criteria**: No errors thrown; status reflects completion progress

---

#### MC-03: Full phases_completed Produces "analyzed"
- **Requirement**: FR-014, backward compatibility
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: None
- **Input**: All 5 analysis phases
- **Steps**:
  1. Call `deriveAnalysisStatus(["00-quick-scan", "01-requirements", "02-impact-analysis", "03-architecture", "04-design"])`
- **Expected Result**: Returns "analyzed" status
- **Pass Criteria**: Result equals "analyzed"

---

#### MC-04: meta.json with topics_covered Field
- **Requirement**: FR-009, Design D7
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Temp directory
- **Input**: meta.json with both `steps_completed` and `topics_covered` fields
- **Steps**:
  1. Create meta.json: `{ "phases_completed": ["00-quick-scan"], "steps_completed": [], "topics_covered": ["problem-discovery", "technical-analysis"] }`
  2. Call `readMetaJson(slugDir)`
  3. Verify returned object contains `topics_covered` array
  4. Call `writeMetaJson(slugDir, meta)` with topics_covered
  5. Re-read and verify persistence
- **Expected Result**: `readMetaJson` and `writeMetaJson` handle topics_covered without error
- **Pass Criteria**: No errors thrown; topics_covered preserved through read/write cycle

---

#### MC-05: meta.json Without steps_completed
- **Requirement**: FR-009, backward compatibility
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Temp directory
- **Input**: meta.json without `steps_completed` field
- **Steps**:
  1. Create meta.json: `{ "phases_completed": ["00-quick-scan", "01-requirements"] }` (no steps_completed)
  2. Call `readMetaJson(slugDir)`
  3. Verify no error thrown
  4. Verify `steps_completed` defaults to empty array or undefined (not crash)
- **Expected Result**: `readMetaJson` handles missing steps_completed gracefully
- **Pass Criteria**: No errors thrown; function returns valid meta object

---

#### MC-06: Sizing With Concurrent meta.json
- **Requirement**: FR-014, Risk R8
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Temp directory with meta.json and impact-analysis.md
- **Input**: meta.json with all phases completed (concurrent model output), impact-analysis.md with sizing data
- **Steps**:
  1. Create meta.json with full phases_completed (as written by concurrent model)
  2. Create impact-analysis.md with file count and risk level data
  3. Call `computeRecommendedTier(estimatedFiles, riskLevel)`
  4. Verify correct tier returned
- **Expected Result**: Sizing computation works correctly with concurrent model meta.json
- **Pass Criteria**: `computeRecommendedTier` returns expected tier; same result as sequential model

---

## 3. Manual E2E Test Cases

These test cases are executed manually by observing agent behavior during live analyze sessions. Each test case documents the exact observable criteria that determine pass or fail.

---

### TC-E2E-01: Unified Conversation Model
- **Requirement**: FR-001, AC-001-01 through AC-001-06
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**:
  - BACKLOG.md item exists with draft.md in artifact folder
  - Agent teams NOT enabled (single-agent mode)
  - New agent files deployed on feature branch
- **Input**: `analyze {item-slug}` command
- **Steps**:
  1. Invoke `analyze {item-slug}`
  2. Engage in at least 5 conversational exchanges
  3. For each agent response, check for:
     a. Phase headers (e.g., "Phase 01:", "## Phase 02")
     b. Step headers (e.g., "Step 01-01:", "### Step 02-03")
     c. Numbered question lists (3+ sequential numbered items)
     d. Handover announcements ("Handing off to", "Now passing to")
     e. Menu options ([E], [C], [S])
     f. Identify which persona voices are present
  4. Record which exchanges contain Maya, Alex, and Jordan contributions
- **Expected Result**:
  - Zero phase headers in all responses
  - Zero step headers in all responses
  - Zero numbered question lists of 3+ items
  - Zero handover announcements
  - Zero menu options
  - All 3 personas contribute within first 3 exchanges
- **Pass Criteria**: All 6 criteria met. Binary pass/fail per criterion.

---

### TC-E2E-02: Silent Codebase Scan
- **Requirement**: FR-002, AC-002-01 through AC-002-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Same as TC-E2E-01
- **Input**: `analyze {item-slug}`
- **Steps**:
  1. Invoke analyze
  2. Observe first response: does it contain "scanning", "Phase 00", or scan progress indicators?
  3. Respond to Maya's opening question
  4. Observe second response: does Alex reference specific codebase details (file names, module names)?
- **Expected Result**:
  - No scan announcements in any response
  - Alex references specific codebase details by second response
  - Maya engages immediately without waiting
- **Pass Criteria**: Zero scan announcements; Alex has codebase knowledge by turn 2; Maya starts turn 1

---

### TC-E2E-03: Progressive Artifact Production
- **Requirement**: FR-003, AC-003-01 through AC-003-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Clean artifact folder (no prior artifacts for this item)
- **Input**: `analyze {item-slug}` with 8+ exchanges
- **Steps**:
  1. Invoke analyze
  2. After every 2-3 exchanges, check artifact folder:
     a. `ls docs/requirements/{slug}/`
     b. Note which files appeared and when
  3. On subsequent checks, verify files are updated (timestamps change) not replaced (same filenames)
  4. Mid-conversation (around exchange 5), forcefully interrupt (Ctrl+C)
  5. Check artifact folder: are partially written artifacts preserved?
- **Expected Result**:
  - Artifacts appear during conversation (not only at end)
  - Artifacts appear at different points (requirements before architecture)
  - Interrupted session preserves artifacts
  - Updates modify existing files, not create new ones
- **Pass Criteria**: At least 1 artifact appears before conversation ends; forced interrupt preserves files

---

### TC-E2E-04: Information Threshold Engine
- **Requirement**: FR-004, AC-004-01 through AC-004-04
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Clean artifact folder
- **Input**: Phased user responses (business first, technical later)
- **Steps**:
  1. Invoke analyze
  2. For first 3-4 exchanges, provide only business context (problem, users, goals)
  3. Check artifact folder -- requirements-spec.md should appear before architecture-overview.md
  4. For next 3-4 exchanges, provide technical context (code patterns, architecture preferences)
  5. Check artifact folder -- architecture-overview.md should now appear
- **Expected Result**:
  - Artifacts triggered by information sufficiency, not phase transitions
  - Different artifact types reach threshold at different times
  - No user action required to trigger writes
- **Pass Criteria**: requirements-spec.md appears before architecture-overview.md; no explicit trigger needed

---

### TC-E2E-05: Invisible Coverage Tracker
- **Requirement**: FR-005, AC-005-01 through AC-005-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Same as TC-E2E-01
- **Input**: Conversation that deliberately avoids certain topics
- **Steps**:
  1. Invoke analyze
  2. Discuss only business context and user needs (avoid error handling, security, performance)
  3. After 5+ exchanges, observe whether the agent steers toward uncovered topics
  4. Check that steering is organic (no "Now let's discuss..." announcements)
  5. Check that no coverage percentage or checklist is displayed
  6. Allow conversation to continue until lead suggests completion
  7. Verify all major topics were covered by reviewing produced artifacts
- **Expected Result**:
  - No coverage metrics or checklists shown to user
  - Agent organically steers toward uncovered topics
  - All topics covered before completion (verifiable from artifact content)
- **Pass Criteria**: Zero coverage displays; organic steering observed; artifact coverage complete

---

### TC-E2E-06: Dual Execution Mode - Single Agent Default
- **Requirement**: FR-006, AC-006-01, AC-006-03
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` NOT set
- **Input**: `analyze {item-slug}`
- **Steps**:
  1. Verify env var is not set
  2. Invoke analyze
  3. Observe that no Task tool spawns occur (no teammates)
  4. Verify all 3 persona voices still appear in conversation
  5. Verify artifacts are produced for all domains
- **Expected Result**: Single-agent mode activates by default; full UX delivered
- **Pass Criteria**: No teammates spawned; all 3 persona voices present; artifacts produced

---

### TC-E2E-07: Dual Execution Mode - Agent Teams
- **Requirement**: FR-006, AC-006-02 through AC-006-05; FR-007, AC-007-01 through AC-007-06
- **Test Type**: positive
- **Priority**: P2
- **Preconditions**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` enabled
- **Input**: `analyze {item-slug}`
- **Steps**:
  1. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
  2. Invoke analyze
  3. Observe Task tool spawns: Alex and Jordan should be spawned as teammates
  4. Observe Maya (team lead) managing user interaction
  5. Observe teammate findings appearing at natural breaks
  6. Check artifact folder: verify teammates write their own artifacts
  7. Record wall-clock time and compare to single-agent baseline
- **Expected Result**:
  - Agent teams mode activates
  - Maya is team lead, Alex and Jordan are teammates
  - Conversation experience identical to single-agent
  - Artifacts produced faster
  - Teammates write directly to artifact folder
- **Pass Criteria**: Teammates spawned; user experience consistent; all artifacts produced

---

### TC-E2E-08: Persona Voice Integrity
- **Requirement**: FR-008, AC-008-02 through AC-008-06
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: New agent files deployed, single-agent mode
- **Input**: `analyze {item-slug}` with 10+ exchanges
- **Steps**:
  1. Invoke analyze
  2. For each response, identify which persona is speaking:
     - Maya: business-focused, asks about users/problems/needs
     - Alex: technical, references codebase, discusses architecture
     - Jordan: specification-focused, discusses interfaces/data structures
  3. Check for voice blending (one persona echoing another's domain)
  4. Check anti-blending rule: if a persona has nothing distinct to add, they stay silent
- **Expected Result**:
  - Each persona maintains distinct voice
  - No blending (e.g., Maya discussing module interfaces)
  - Personas stay silent when they have nothing unique to contribute
- **Pass Criteria**: Each persona stays in domain; no echoing observed; silent when appropriate

---

### TC-E2E-09: Topic File Content Preservation
- **Requirement**: FR-009, AC-009-02
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Both old step files and new topic files present (during validation)
- **Input**: Content comparison between old step files and new topic files
- **Steps**:
  1. For each old step file, identify its key questions and validation criteria
  2. Find the corresponding topic file
  3. Verify the key questions and validation criteria are preserved in the topic file
  4. Spot-check at least 5 step files across different phases
- **Expected Result**: All analytical knowledge preserved in new topic files
- **Pass Criteria**: 100% of spot-checked questions/criteria found in corresponding topic files

---

### TC-E2E-10: Organic Persona Interaction
- **Requirement**: FR-010, AC-010-01 through AC-010-05
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Same as TC-E2E-01
- **Input**: Conversation where a technical decision surfaces naturally
- **Steps**:
  1. Invoke analyze on an item that involves a clear technical decision (e.g., database choice, API pattern, concurrency model)
  2. When the decision surfaces, observe Alex or Jordan's response:
     a. Do they ask "What do you prefer?" (FAIL)
     b. Do they present options with a recommendation? (PASS)
  3. Accept the recommendation silently (provide no input on it)
  4. Observe: does the persona proceed with the recommendation? (PASS)
  5. In a subsequent exchange, observe: are persona contributions batched at natural breaks?
- **Expected Result**:
  - Options presented with recommendation and reasoning
  - No open-ended technical questions
  - Default proceeds with recommendation if user is silent
  - Contributions batched at natural breaks
- **Pass Criteria**: Recommendation-with-reasoning observed; no "What do you prefer?" patterns

---

### TC-E2E-11: Confidence Indicators in Artifacts
- **Requirement**: FR-011, AC-011-01 through AC-011-05
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Analyze session completed
- **Input**: Produced `requirements-spec.md`
- **Steps**:
  1. Complete an analyze session
  2. Read `docs/requirements/{slug}/requirements-spec.md`
  3. For each FR in the document:
     a. Check for confidence indicator (high/medium/low)
     b. Verify the format is consistent (e.g., `**Confidence**: High`)
     c. Cross-reference: was this FR discussed with the user? (high) Inferred? (medium) Extrapolated? (low)
- **Expected Result**:
  - Every FR has a confidence indicator
  - Format is machine-readable (consistent syntax)
  - Confidence levels align with how information was gathered
- **Pass Criteria**: 100% of FRs have indicators; format is parseable by regex

---

### TC-E2E-12: Artifact Cross-Check
- **Requirement**: FR-012, AC-012-01 through AC-012-04
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Analyze session reaching completion
- **Input**: Full analyze session
- **Steps**:
  1. Engage in conversation until lead suggests completion
  2. Observe: does the lead announce cross-check? ("Before we wrap up, I'm having Alex and Jordan verify...")
  3. Observe: is there evidence of each persona reviewing their artifacts?
  4. Check artifact timestamps: do any files get updated during cross-check?
  5. Observe: is the user informed of corrections?
- **Expected Result**:
  - Cross-check announced
  - Evidence of persona reviews
  - Corrections made if inconsistencies found
  - User informed
- **Pass Criteria**: Announcement observed; at least one artifact timestamp changes or explicit "no corrections needed" stated

---

### TC-E2E-13A: Natural Completion
- **Requirement**: FR-013, AC-013-01
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Same as TC-E2E-01
- **Input**: Full conversation until completion
- **Steps**:
  1. Engage until lead suggests completion
  2. Observe: does the lead provide a summary of produced artifacts?
  3. Confirm completion
- **Expected Result**: Lead suggests completion with artifact summary
- **Pass Criteria**: Completion suggestion includes artifact summary

---

### TC-E2E-13B: Early Exit
- **Requirement**: FR-013, AC-013-02, AC-013-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Same as TC-E2E-01
- **Input**: "that's enough" after 3 exchanges
- **Steps**:
  1. Invoke analyze
  2. After 3 exchanges, say "that's enough" or "I think we're done"
  3. Observe: does the lead acknowledge early exit?
  4. Check artifact folder: are partial artifacts preserved?
  5. Read artifacts: are uncovered topics flagged?
  6. Check confidence indicators: do they reflect gaps?
- **Expected Result**:
  - Early exit acknowledged
  - Partial artifacts preserved
  - Uncovered topics flagged
  - Low confidence on areas not discussed
- **Pass Criteria**: Artifacts present; gaps explicitly flagged in artifact content

---

### TC-E2E-13C: Deeper Exploration
- **Requirement**: FR-013, AC-013-03
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Same as TC-E2E-01
- **Input**: Request for deeper analysis after completion suggestion
- **Steps**:
  1. Engage until lead suggests completion
  2. Respond: "I want to dig deeper into error handling" (or similar)
  3. Observe: does the relevant persona take over?
  4. Engage for 2-3 more exchanges
  5. Observe: does the lead re-evaluate and suggest completion again?
- **Expected Result**:
  - Relevant persona continues with deeper analysis
  - Artifacts updated with additional depth
  - Lead re-evaluates and suggests completion again
- **Pass Criteria**: Persona continues; artifacts show additional depth

---

### TC-E2E-14: Single Dispatch from isdlc.md
- **Requirement**: FR-014, AC-014-01 through AC-014-04
- **Test Type**: positive
- **Priority**: P0
- **Preconditions**: Updated isdlc.md deployed
- **Input**: `analyze {item-slug}`
- **Steps**:
  1. Invoke analyze
  2. Observe the delegation: is there a single dispatch to roundtable-lead? (not multiple phase delegations)
  3. Observe: are there inter-phase gate checks during the session?
  4. After completion, check meta.json: was it written by the lead orchestrator?
- **Expected Result**:
  - Single dispatch visible (one Task delegation)
  - No inter-phase gates
  - meta.json managed by lead
- **Pass Criteria**: One dispatch observed; no phase gates; meta.json has complete phases_completed

---

### TC-E2E-15A: Adaptive Depth - Product Owner Profile
- **Requirement**: FR-015, AC-015-01, AC-015-03, AC-015-04
- **Test Type**: positive
- **Priority**: P2
- **Preconditions**: Same as TC-E2E-01
- **Input**: Rich business context, limited technical input
- **Steps**:
  1. Invoke analyze
  2. Provide detailed answers about business context, users, and goals
  3. When technical questions arise, respond: "I'm not sure about the technical details"
  4. Complete the session
  5. Read produced artifacts:
     a. requirements-spec.md: check confidence levels
     b. architecture-overview.md: check for flagged assumptions
     c. module-design.md: check for flagged assumptions
- **Expected Result**:
  - Requirements: high confidence
  - Architecture/design: lighter with flagged assumptions
  - Alex fills gaps from codebase analysis
  - System does not demand technical answers
- **Pass Criteria**: Requirements confidence > architecture/design confidence; assumptions flagged; no demanding behavior

---

### TC-E2E-15B: Adaptive Depth - Architect Profile
- **Requirement**: FR-015, AC-015-02
- **Test Type**: positive
- **Priority**: P2
- **Preconditions**: Same as TC-E2E-01
- **Input**: Rich technical context, limited business context
- **Steps**:
  1. Invoke analyze on a technical item
  2. Provide detailed technical architecture input
  3. Give minimal business context
  4. Complete the session
  5. Read produced artifacts: architecture/design should be high confidence
- **Expected Result**: Architecture/design artifacts are high confidence; requirements lighter
- **Pass Criteria**: Architecture confidence >= requirements confidence

---

### TC-E2E-16: Removal Verification
- **Requirement**: FR-016, FR-017, AC-016-01 through AC-016-03, AC-017-01 through AC-017-03
- **Test Type**: negative
- **Priority**: P0
- **Preconditions**: New agent files deployed
- **Input**: Full analyze session
- **Steps**:
  1. Run a complete analyze session
  2. Observe every response for:
     - [E] elaboration option
     - [C] continue option
     - [S] skip option
     - Step boundary menus
     - Phase boundary menus
  3. After session, check meta.json for:
     - `elaboration_config` field
     - `elaborations` array
  4. Verify user controls conversation through natural language
- **Expected Result**:
  - No menu options in any response
  - No elaboration fields in meta.json
  - Conversation controlled by natural language
- **Pass Criteria**: Zero menu options observed; zero elaboration fields in output

---

## 4. Edge Case and Error Handling Tests

---

### TC-EDGE-01: No Draft Available
- **Requirement**: IP-1 error handling, AC-002-03
- **Test Type**: positive (boundary)
- **Priority**: P1
- **Preconditions**: Item with no draft.md in artifact folder
- **Input**: `analyze {item-slug}` where no draft.md exists
- **Steps**:
  1. Create a BACKLOG.md entry without running intake (no draft.md)
  2. Invoke analyze
  3. Observe: does the lead proceed? Does it mention the missing draft?
- **Expected Result**: Lead proceeds with "(No draft available)"; conversation starts from scratch
- **Pass Criteria**: No error; conversation begins; Maya asks discovery questions

---

### TC-EDGE-02: Empty meta.json
- **Requirement**: DS-7, error handling
- **Test Type**: positive (boundary)
- **Priority**: P1
- **Preconditions**: Item with empty or `{}` meta.json
- **Input**: `analyze {item-slug}` with empty meta.json
- **Steps**:
  1. Create artifact folder with `meta.json` containing `{}`
  2. Invoke analyze
  3. Observe: does the lead treat as fresh analysis?
- **Expected Result**: Lead starts fresh analysis, all topics to cover
- **Pass Criteria**: No error; full analysis proceeds

---

### TC-EDGE-03: Resume from Partial Analysis
- **Requirement**: Data flow resumability, DS-6
- **Test Type**: positive
- **Priority**: P1
- **Preconditions**: Item with partial analysis (some phases_completed, some artifacts)
- **Input**: `analyze {item-slug}` on partially analyzed item
- **Steps**:
  1. Create artifact folder with meta.json showing 2/5 phases complete
  2. Create corresponding partial artifacts (requirements-spec.md, quick-scan.md)
  3. Invoke analyze
  4. Observe: does the lead pick up where coverage left off?
  5. Check: are existing artifacts preserved and extended?
- **Expected Result**: Lead resumes from partial state; existing artifacts extended
- **Pass Criteria**: Lead acknowledges existing progress; artifacts updated not overwritten

---

### TC-EDGE-04: User Off-Topic
- **Requirement**: FR-005, coverage tracker
- **Test Type**: positive (boundary)
- **Priority**: P2
- **Preconditions**: Same as TC-E2E-01
- **Input**: Unrelated user input mid-analysis
- **Steps**:
  1. Invoke analyze
  2. After 2 exchanges, provide completely off-topic input ("What's the weather like?")
  3. Observe: does the lead gracefully redirect to analysis?
- **Expected Result**: Lead redirects conversation to analysis topics
- **Pass Criteria**: No error; conversation returns to analysis within 1-2 exchanges

---

### TC-EDGE-05: Teammate Failure (Agent Teams)
- **Requirement**: ADR-006, FR-007
- **Test Type**: positive (error recovery)
- **Priority**: P2
- **Preconditions**: Agent teams enabled
- **Input**: Simulate or observe a teammate failure during analysis
- **Steps**:
  1. Invoke analyze in agent teams mode
  2. If a teammate fails (or simulate by observing error handling behavior):
     a. Check: does the lead read the failed teammate's existing artifacts?
     b. Check: does the lead continue in single-agent mode for that persona's work?
  3. Verify: are all artifacts still produced by the end?
- **Expected Result**: Lead recovers from teammate failure; all artifacts produced
- **Pass Criteria**: Analysis completes; no missing artifacts

---

### TC-EDGE-06: Forced Interrupt Mid-Conversation
- **Requirement**: FR-003, AC-003-03
- **Test Type**: positive (boundary)
- **Priority**: P1
- **Preconditions**: Same as TC-E2E-01
- **Input**: Ctrl+C during analyze session
- **Steps**:
  1. Invoke analyze
  2. Engage for 5+ exchanges (ensure some artifacts have been written)
  3. Press Ctrl+C to interrupt
  4. Check artifact folder: are artifacts from before interrupt preserved?
  5. Check meta.json: does it reflect progress up to the interrupt?
- **Expected Result**: Artifacts preserved; meta.json reflects progress
- **Pass Criteria**: Files present in artifact folder; meta.json has non-empty phases_completed
