# Test Cases: Multi-Agent Requirements Team

**Feature:** REQ-0014-multi-agent-requirements-team
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Status:** Draft
**Total Test Cases:** 90

---

## 1. Test File: debate-creator-enhancements.test.cjs (12 tests)

**Module:** M1 (Creator Enhancements)
**File Under Test:** `src/claude/agents/01-requirements-analyst.md`
**Traces:** FR-001, FR-007, AC-001-01, AC-001-02, AC-001-03, AC-007-01, AC-007-02, AC-007-03, NFR-002

### Setup

```javascript
const ANALYST_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-analyst.md');
let content;
function getContent() {
    if (!content) {
        assert.ok(fs.existsSync(ANALYST_PATH), 'Requirements analyst agent file must exist');
        content = fs.readFileSync(ANALYST_PATH, 'utf8');
    }
    return content;
}
```

### Test Cases

**TC-M1-01: DEBATE_CONTEXT detection section exists**
- AC: AC-001-01
- Given: The requirements-analyst.md file
- When: Read and searched
- Then: Contains `DEBATE_CONTEXT` and a `Mode Detection` section
- Assertion: `content.includes('DEBATE_CONTEXT')` AND `content.includes('Mode Detection')`

**TC-M1-02: Round labeling instructions present**
- AC: AC-001-01
- Given: The requirements-analyst.md file with debate mode section
- When: The DEBATE MODE section is searched
- Then: Contains round labeling format instructions
- Assertion: Section contains `Round` and `Draft` referencing round-number labeling

**TC-M1-03: Skip final save menu in debate mode**
- AC: AC-001-01
- Given: The requirements-analyst.md file with debate mode section
- When: The debate mode behavior section is searched
- Then: Contains instruction to skip the final save menu
- Assertion: Content contains `skip` (case-insensitive) and `save` near debate mode context

**TC-M1-04: Single-agent mode preserved (backward compat)**
- AC: AC-001-02, NFR-002
- Given: The requirements-analyst.md file
- When: The INVOCATION PROTOCOL is searched
- Then: Contains a conditional fork preserving single-agent behavior when DEBATE_CONTEXT absent
- Assertion: Content contains `NOT present` or `not present` and reference to single-agent/current behavior

**TC-M1-05: Conversational opening -- reflect pattern**
- AC: AC-007-01
- Given: The requirements-analyst.md file
- When: The conversational opening section is searched
- Then: Contains reflect-back-summary pattern
- Assertion: Content contains `Reflect` (case-insensitive) and `summary` or `summarize`

**TC-M1-06: Conversational opening -- targeted follow-up**
- AC: AC-007-02
- Given: The requirements-analyst.md file
- When: The conversational opening section is searched
- Then: Contains instruction for ONE targeted question instead of 3 generic
- Assertion: Content contains `ONE targeted` or `targeted follow-up`

**TC-M1-07: Discovery context integration**
- AC: AC-007-03
- Given: The requirements-analyst.md file
- When: The content is searched
- Then: Contains reference to `discovery_context` and freshness check
- Assertion: Content contains `discovery_context` AND (`24h` OR `fresh`)

**TC-M1-08: Organic 5 lenses (not rigid sequential)**
- AC: AC-001-03, FR-007
- Given: The requirements-analyst.md file
- When: The content is searched
- Then: References 5 discovery lenses with organic/natural integration
- Assertion: Content contains `lenses` or `Business/User/UX/Tech/Quality` AND `organic` or `natural`

**TC-M1-09: Round > 1 behavior (no re-asking)**
- FR: FR-001
- Given: The requirements-analyst.md file with debate mode section
- When: The DEBATE MODE BEHAVIOR section is searched
- Then: Contains instructions for Round > 1 to not re-ask opening questions
- Assertion: Content contains `Round > 1` or `round > 1` AND instruction to not ask questions again

**TC-M1-10: Explicit requirement IDs in debate output**
- FR: FR-001
- Given: The requirements-analyst.md file with debate mode section
- When: The artifact optimization section is searched
- Then: Contains requirement for explicit IDs (FR-NNN, AC-NNN-NN, NFR-NNN, US-NNN)
- Assertion: Content contains `FR-NNN` or `AC-NNN` or `explicit ID`

**TC-M1-11: A/R/C menu pattern preserved**
- NFR: NFR-002
- Given: The requirements-analyst.md file
- When: The content is searched
- Then: Contains A/R/C menu pattern references
- Assertion: Content contains `[A]` or `Adjust` AND `[R]` or `Refine` AND `[C]` or `Continue`

**TC-M1-12: DEBATE MODE BEHAVIOR section heading exists**
- FR: FR-001
- Given: The requirements-analyst.md file
- When: The content is searched
- Then: Contains a dedicated DEBATE MODE BEHAVIOR section
- Assertion: Content contains `DEBATE MODE BEHAVIOR`

---

## 2. Test File: debate-critic-agent.test.cjs (14 tests)

**Module:** M2 (Critic Agent -- NEW)
**File Under Test:** `src/claude/agents/01-requirements-critic.md`
**Traces:** FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-002-05, CON-003

### Setup

```javascript
const CRITIC_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-critic.md');
let content;
function getContent() {
    if (!content) {
        assert.ok(fs.existsSync(CRITIC_PATH), 'Requirements critic agent file must exist');
        content = fs.readFileSync(CRITIC_PATH, 'utf8');
    }
    return content;
}
```

### Test Cases

**TC-M2-01: Critic agent file exists**
- FR: FR-002
- Given: The agent directory
- When: Checked for critic agent
- Then: `01-requirements-critic.md` exists
- Assertion: `fs.existsSync(CRITIC_PATH)`

**TC-M2-02: Agent frontmatter has correct name**
- FR: FR-002, CON-003
- Given: The critic agent file
- When: The frontmatter is read
- Then: Contains `name: requirements-critic`
- Assertion: Content contains `name: requirements-critic`

**TC-M2-03: MC-01 Given/When/Then check**
- AC: AC-002-02
- Given: The critic agent file
- When: Mandatory checks section is searched
- Then: Contains MC-01 check for Given/When/Then format
- Assertion: Content contains `MC-01` AND `Given/When/Then`

**TC-M2-04: MC-02 Quantified NFRs check**
- AC: AC-002-03
- Given: The critic agent file
- When: Mandatory checks section is searched
- Then: Contains MC-02 check for quantified NFRs
- Assertion: Content contains `MC-02` AND (`Quantified` OR `quantified`)

**TC-M2-05: MC-03 Orphan requirements check**
- AC: AC-002-04
- Given: The critic agent file
- When: Mandatory checks section is searched
- Then: Contains MC-03 check for orphan requirements
- Assertion: Content contains `MC-03` AND `Orphan`

**TC-M2-06: MC-04 Contradictions check**
- AC: AC-002-05
- Given: The critic agent file
- When: Mandatory checks section is searched
- Then: Contains MC-04 check for contradictions
- Assertion: Content contains `MC-04` AND (`Contradiction` OR `contradict`)

**TC-M2-07: MC-05 Missing compliance check**
- FR: FR-002
- Given: The critic agent file
- When: Mandatory checks section is searched
- Then: Contains MC-05 check for compliance
- Assertion: Content contains `MC-05` AND (`Compliance` OR `compliance`)

**TC-M2-08: BLOCKING/WARNING severity classification**
- AC: AC-002-01
- Given: The critic agent file
- When: The content is searched
- Then: Contains both BLOCKING and WARNING severity levels
- Assertion: Content contains `BLOCKING` AND `WARNING`

**TC-M2-09: Critique report output format**
- AC: AC-002-01
- Given: The critic agent file
- When: The output format section is searched
- Then: Contains critique report naming pattern
- Assertion: Content contains `round-` AND `critique`

**TC-M2-10: Rule -- never zero findings on Round 1**
- FR: FR-002
- Given: The critic agent file
- When: The rules section is searched
- Then: Contains rule about never producing zero findings on Round 1
- Assertion: Content contains `zero findings` AND `Round 1`

**TC-M2-11: Rule -- never inflate severity**
- FR: FR-002
- Given: The critic agent file
- When: The rules section is searched
- Then: Contains rule about not inflating severity
- Assertion: Content contains `inflate` (case-insensitive) AND `severity`

**TC-M2-12: Rule -- always reference specific IDs**
- AC: AC-002-01
- Given: The critic agent file
- When: The rules section is searched
- Then: Contains rule about referencing specific IDs in every finding
- Assertion: Content contains `specific ID` or `reference` and `FR` or `AC` or `NFR`

**TC-M2-13: Discretionary checks DC-01 through DC-07**
- FR: FR-002
- Given: The critic agent file
- When: The discretionary checks section is searched
- Then: Contains DC-01 through DC-07
- Assertion: Content contains `DC-01`, `DC-02`, `DC-03`, `DC-04`, `DC-05`, `DC-06`, `DC-07`

**TC-M2-14: Critique is read-only**
- FR: FR-002
- Given: The critic agent file
- When: The rules section is searched
- Then: Contains instruction that critique report is the only output
- Assertion: Content contains `only output` or `ONLY output` or `Do not modify`

---

## 3. Test File: debate-refiner-agent.test.cjs (10 tests)

**Module:** M3 (Refiner Agent -- NEW)
**File Under Test:** `src/claude/agents/01-requirements-refiner.md`
**Traces:** FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04, CON-003

### Setup

```javascript
const REFINER_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-refiner.md');
let content;
function getContent() {
    if (!content) {
        assert.ok(fs.existsSync(REFINER_PATH), 'Requirements refiner agent file must exist');
        content = fs.readFileSync(REFINER_PATH, 'utf8');
    }
    return content;
}
```

### Test Cases

**TC-M3-01: Refiner agent file exists**
- FR: FR-003
- Assertion: `fs.existsSync(REFINER_PATH)`

**TC-M3-02: Agent frontmatter has correct name**
- FR: FR-003, CON-003
- Assertion: Content contains `name: requirements-refiner`

**TC-M3-03: BLOCKING findings addressed (mandatory)**
- AC: AC-003-01
- Assertion: Content contains instruction to address `all BLOCKING` or `BLOCKING findings`

**TC-M3-04: Vague AC fix strategy (Given/When/Then rewrite)**
- AC: AC-003-02
- Assertion: Content contains `Given/When/Then` as fix strategy for vague ACs

**TC-M3-05: Unmeasured NFR fix strategy (quantified metric)**
- AC: AC-003-03
- Assertion: Content contains `quantified metric` or `measurable` with NFR context

**TC-M3-06: Escalation with NEEDS CLARIFICATION**
- AC: AC-003-04
- Assertion: Content contains `NEEDS CLARIFICATION` AND `Article IV`

**TC-M3-07: Change log format present**
- FR: FR-003
- Assertion: Content contains `Changes in Round` and table/log format

**TC-M3-08: Rule -- never remove existing requirements**
- FR: FR-003
- Assertion: Content contains rule with `NEVER remove` or `never remove`

**TC-M3-09: Rule -- never introduce new scope**
- FR: FR-003
- Assertion: Content contains `NEVER introduce` or `never introduce` and `scope`

**TC-M3-10: Rule -- preserve requirement IDs**
- FR: FR-003
- Assertion: Content contains `preserve` (case-insensitive) and `ID` near requirements context

---

## 4. Test File: debate-orchestrator-loop.test.cjs (18 tests)

**Module:** M4 + M7 (Orchestrator Debate Loop + Artifact Versioning)
**File Under Test:** `src/claude/agents/00-sdlc-orchestrator.md`
**Traces:** FR-004, FR-005, FR-006, FR-008, AC-004-01..04, AC-005-01..05, AC-006-01..03, NFR-002, NFR-004

### Setup

```javascript
const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');
let content;
function getContent() {
    if (!content) {
        assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator agent file must exist');
        content = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
    }
    return content;
}
```

### Test Cases

**TC-M4-01: DEBATE LOOP ORCHESTRATION section exists**
- FR: FR-004
- Assertion: Content contains `DEBATE LOOP ORCHESTRATION`

**TC-M4-02: resolveDebateMode logic documented**
- FR: FR-005, AC-005-01
- Assertion: Content contains `resolveDebateMode` or a debate mode resolution logic section

**TC-M4-03: --no-debate wins precedence**
- AC: AC-005-03
- Given: The resolveDebateMode section
- Then: --no-debate is the first check in the precedence chain
- Assertion: In the debate mode resolution section, `no_debate` appears before `debate` in the IF chain

**TC-M4-04: --debate overrides -light**
- AC: AC-005-04
- Assertion: In the resolution section, `debate` check appears before `light` check

**TC-M4-05: Standard sizing defaults to debate ON**
- AC: AC-005-01
- Assertion: Content contains `standard` with `true` return for debate

**TC-M4-06: debate_state initialization documented**
- AC: AC-006-03
- Assertion: Content contains `debate_state` initialization with `round`, `max_rounds`, `converged`

**TC-M4-07: Creator delegation with DEBATE_CONTEXT**
- AC: AC-001-01, AC-006-01
- Assertion: Content contains Creator delegation section with `DEBATE_CONTEXT` block

**TC-M4-08: Critic-Refiner loop documented**
- AC: AC-006-01
- Assertion: Content contains loop/WHILE structure with Critic review and Refiner improvement steps

**TC-M4-09: Convergence check -- zero BLOCKING**
- AC: AC-004-01
- Assertion: Content contains `blocking` with `0` or `== 0` convergence condition

**TC-M4-10: Max 3 rounds hard limit**
- AC: AC-004-02, NFR-004
- Assertion: Content contains `max_rounds` with `3` AND exit condition on round limit

**TC-M4-11: Unconverged warning appended**
- AC: AC-004-02
- Assertion: Content contains `unconverged` or `WARNING` and `did not converge`

**TC-M4-12: debate-summary.md generation**
- AC: AC-004-03
- Assertion: Content contains `debate-summary.md` generation instructions

**TC-M4-13: round-N-critique.md saved for audit trail**
- AC: AC-004-04
- Assertion: Content contains `round-` and `critique.md` saving instructions

**TC-M4-14: Single-agent fallback when debate OFF**
- AC: AC-006-02, NFR-002
- Assertion: Content contains delegation to requirements-analyst when `debate_mode == false`

**TC-M4-15: debate_state updates per round**
- AC: AC-006-03
- Assertion: Content contains `rounds_history` tracking with push/append semantics

**TC-M4-16: Convergence on Round 1 edge case**
- FR: FR-004
- Assertion: Content addresses zero BLOCKING on first Critic review (Refiner not invoked)

**TC-M4-17: Malformed critique fail-open**
- NFR: NFR-004
- Assertion: Content contains fail-open/fail-safe handling for parse errors (`0 BLOCKING` default)

**TC-M4-18: Both flags conflict resolution**
- FR: FR-005
- Assertion: Content contains resolution when both --debate and --no-debate present (--no-debate wins)

---

## 5. Test File: debate-flag-parsing.test.cjs (10 tests)

**Module:** M5 (Flag Parsing)
**File Under Test:** `src/claude/commands/isdlc.md`
**Traces:** FR-005, AC-005-01..05

### Test Cases

**TC-M5-01: --debate flag documented**
- AC: AC-005-04
- Assertion: Content contains `--debate` in flag section

**TC-M5-02: --no-debate flag documented**
- AC: AC-005-03
- Assertion: Content contains `--no-debate` in flag section

**TC-M5-03: Flag precedence rules documented**
- FR: FR-005
- Assertion: Content contains `precedence` (case-insensitive) in debate flag section

**TC-M5-04: --no-debate wins over --debate**
- AC: AC-005-03
- Assertion: Precedence documentation lists --no-debate as highest priority

**TC-M5-05: -light implies no debate**
- AC: AC-005-02
- Assertion: Content contains -light implying `--no-debate` or debate OFF

**TC-M5-06: Conflict resolution documented**
- FR: FR-005
- Assertion: Content contains conflict resolution for both flags present

**TC-M5-07: FLAGS block passed to orchestrator**
- FR: FR-005
- Assertion: Content contains `FLAGS:` or `FLAGS` block with `debate` field

**TC-M5-08: debate_mode written to state.json**
- AC: AC-005-05
- Assertion: Content contains `debate_mode` reference

**TC-M5-09: Standard sizing defaults documented**
- AC: AC-005-01
- Assertion: Content contains standard/epic defaulting to debate ON

**TC-M5-10: --debate overrides -light documented**
- AC: AC-005-04
- Assertion: Content contains --debate overriding -light behavior

---

## 6. Test File: debate-documentation.test.cjs (4 tests)

**Module:** M6 (Documentation Updates)
**Files Under Test:** `src/claude/CLAUDE.md.template`, `docs/AGENTS.md`
**Traces:** FR-005, CON-003

### Test Cases

**TC-M6-01: CLAUDE.md.template mentions debate mode**
- FR: FR-005
- File: `src/claude/CLAUDE.md.template`
- Assertion: Content contains `debate` or `Debate Mode`

**TC-M6-02: CLAUDE.md.template has --no-debate usage**
- FR: FR-005
- File: `src/claude/CLAUDE.md.template`
- Assertion: Content contains `--no-debate`

**TC-M6-03: AGENTS.md lists Critic agent**
- CON: CON-003
- File: `docs/AGENTS.md`
- Assertion: Content contains `requirements-critic`

**TC-M6-04: AGENTS.md lists Refiner agent**
- CON: CON-003
- File: `docs/AGENTS.md`
- Assertion: Content contains `requirements-refiner`

---

## 7. Test File: debate-validation-rules.test.cjs (15 tests)

**Module:** Validation Rules
**File Under Test:** `docs/requirements/REQ-0014-multi-agent-requirements-team/validation-rules.json`
**Traces:** VR-001..VR-062

### Test Cases

**TC-VR-001: Flag precedence --no-debate > --debate**
- VR: VR-001
- Assertion: Rule exists, input `{no_debate: true, debate: true}`, expected_output `false`

**TC-VR-002: Flag precedence --debate > -light**
- VR: VR-002
- Assertion: Rule exists, input `{debate: true, light: true}`, expected_output `true`

**TC-VR-003: Light flag implies no debate**
- VR: VR-003
- Assertion: Rule exists, input `{light: true}`, expected_output `false`

**TC-VR-004: Standard sizing defaults ON**
- VR: VR-004
- Assertion: Rule exists, input `{sizing: "standard"}`, expected_output `true`

**TC-VR-005: Epic sizing defaults ON**
- VR: VR-005
- Assertion: Rule exists, input `{sizing: "epic"}`, expected_output `true`

**TC-VR-006: No flags defaults ON**
- VR: VR-006
- Assertion: Rule exists, input `{}`, expected_output `true`

**TC-VR-010: debate_state.round range 0-3**
- VR: VR-010
- Assertion: Rule exists, min=0, max=3, required=true

**TC-VR-011: max_rounds fixed at 3**
- VR: VR-011
- Assertion: Rule exists, value=3, required=true

**TC-VR-020: Critique report requires Summary section**
- VR: VR-020
- Assertion: Rule exists, required_content = `## Summary`

**TC-VR-021: Summary must have BLOCKING count**
- VR: VR-021
- Assertion: Rule exists, pattern matches `| BLOCKING | \\d+ |`

**TC-VR-040: Critique filename pattern**
- VR: VR-040
- Assertion: Rule exists, regex matches `round-1-critique.md`, `round-2-critique.md`, `round-3-critique.md`, rejects `round-4-critique.md`

**TC-VR-041: debate-summary.md existence after loop**
- VR: VR-041
- Assertion: Rule exists, file = `debate-summary.md`

**TC-VR-050: DEBATE_CONTEXT mode field values**
- VR: VR-050
- Assertion: Rule exists, allowed_values = `["creator", "critic", "refiner"]`

**TC-VR-060: Absent DEBATE_CONTEXT = single-agent**
- VR: VR-060
- Assertion: Rule exists, type = `absence`

**TC-VR-062: Single-agent mode parity**
- VR: VR-062
- Assertion: Rule exists, type = `regression`

---

## 8. Test File: debate-integration.test.cjs (7 tests)

**Module:** Cross-Module Integration
**Files Under Test:** Multiple agent `.md` files
**Traces:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-008, NFR-002

### Test Cases

**TC-INT-01: Creator and Critic both reference DEBATE_CONTEXT**
- FR: FR-001, FR-002
- Files: requirements-analyst.md, requirements-critic.md
- Assertion: Both files contain `DEBATE_CONTEXT`

**TC-INT-02: Critic output format matches orchestrator parsing**
- FR: FR-002, FR-004
- Files: requirements-critic.md, 00-sdlc-orchestrator.md
- Assertion: Critic references `BLOCKING` count format; orchestrator references parsing the same format

**TC-INT-03: Refiner references critique file naming**
- FR: FR-003, FR-006
- Files: requirements-refiner.md
- Assertion: Refiner references `round-` and `critique` file pattern matching orchestrator's naming

**TC-INT-04: Orchestrator delegates to all three agents**
- FR: FR-008
- File: 00-sdlc-orchestrator.md
- Assertion: Contains `requirements-analyst`, `requirements-critic`, `requirements-refiner`

**TC-INT-05: Flag parsing and orchestrator consistent**
- FR: FR-005
- Files: isdlc.md, 00-sdlc-orchestrator.md
- Assertion: Both reference FLAGS format with `debate` field

**TC-INT-06: Backward compat -- absence-based mode detection**
- NFR: NFR-002
- Files: requirements-analyst.md, 00-sdlc-orchestrator.md
- Assertion: Analyst has DEBATE_CONTEXT absence fork; orchestrator has debate_mode=false path

**TC-INT-07: Error taxonomy recovery patterns in orchestrator**
- FR: FR-004
- Files: error-taxonomy.md, 00-sdlc-orchestrator.md
- Assertion: Orchestrator contains fail-open/fallback language matching error taxonomy patterns

---

## 9. Summary

| Test File | Tests | Module | Key Traces |
|-----------|-------|--------|-----------|
| debate-creator-enhancements.test.cjs | 12 | M1 | FR-001, FR-007, NFR-002 |
| debate-critic-agent.test.cjs | 14 | M2 | FR-002 |
| debate-refiner-agent.test.cjs | 10 | M3 | FR-003 |
| debate-orchestrator-loop.test.cjs | 18 | M4+M7 | FR-004, FR-006, FR-008, NFR-004 |
| debate-flag-parsing.test.cjs | 10 | M5 | FR-005 |
| debate-documentation.test.cjs | 4 | M6 | CON-003 |
| debate-validation-rules.test.cjs | 15 | VRs | VR-001..VR-062 |
| debate-integration.test.cjs | 7 | Cross-module | FR-001..FR-008, NFR-002 |
| **Total** | **90** | | |
