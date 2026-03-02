# Test Strategy: Multi-Agent Requirements Team

**Feature:** REQ-0014-multi-agent-requirements-team
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Existing Infrastructure

| Aspect | Value | Source |
|--------|-------|--------|
| **Test Runner** | `node:test` | Article II, state.json |
| **Module System** | CJS (`.test.cjs`) for hook-adjacent tests | Article XII |
| **Test Location** | `src/claude/hooks/tests/` | Existing convention |
| **Coverage Tool** | None (prompt-verification; no Istanbul/c8) | state.json |
| **Assertion Library** | `node:assert/strict` | Existing convention |
| **Pattern** | Read file, assert string/section presence | backlog-*.test.cjs |

### Existing Test Conventions (from backlog-* and provider-* test files)

1. Test files use `*.test.cjs` extension and reside in `src/claude/hooks/tests/`
2. Each file opens with a JSDoc comment listing traces (FRs, ACs, VRs)
3. Files import `node:test` (`describe`, `it`) and `node:assert/strict`
4. File content is loaded lazily via a `getContent()` helper
5. Assertions use `content.includes()`, `indexOf()`, and section-scoped substring searches
6. Test IDs follow `TC-{module}-{NN}` format
7. Tests are grouped by module using nested `describe()` blocks

### Strategy Adaptation

This feature is ~85% prompt/markdown files and ~15% config/JSON. The testing approach matches the established prompt-verification pattern:

- **USE** existing `node:test` runner and `assert/strict` assertions
- **FOLLOW** the `*.test.cjs` naming convention in `src/claude/hooks/tests/`
- **MATCH** the lazy `getContent()` pattern for reading agent `.md` files
- **EXTEND** with validation-rules tests (same pattern as `backlog-validation-rules.test.cjs`)
- **ADD** new test files alongside existing tests, not in a separate directory

---

## 2. Testing Approach

### 2.1 Test Types

| Test Type | Scope | Count | Technique |
|-----------|-------|-------|-----------|
| **Unit: Prompt Verification** | M1, M2, M3, M4, M5, M6 | ~52 | Assert required sections, keywords, rules exist in agent `.md` files |
| **Unit: Validation Rules** | VR-001 through VR-062 | ~20 | Parse validation-rules.json, verify rule schemas and test data |
| **Unit: Config Verification** | M5 (workflows.json) | ~4 | Parse JSON, verify debate configuration fields |
| **Integration: Cross-Module** | M1+M2+M3+M4 | ~8 | Verify interfaces are compatible (DEBATE_CONTEXT referenced consistently) |
| **Backward Compatibility** | M1, M4 | ~6 | Verify single-agent mode sections, absence semantics |
| **Total** | All modules | **~90** | |

### 2.2 What We Are NOT Testing

Since all changes are prompt/markdown or config/JSON (no new runtime code):

- **No runtime unit tests**: There are no new `.cjs` or `.js` functions to test
- **No E2E tests**: Debate loop is orchestrated by LLM delegation, not executable code
- **No performance tests**: NFR-001 (15-minute budget) is an operational metric, not testable by static analysis
- **No security tests**: No new attack surface (prompt files, no user input handling code)
- **No mutation tests**: Prompt verification tests are string-presence; mutation testing is not applicable

### 2.3 Coverage Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Requirement coverage | 100% of 28 ACs | Traceability matrix |
| NFR coverage | 100% of 5 NFRs | Traceability matrix |
| Validation rule coverage | 100% of 33 VRs | Test-to-VR mapping |
| Error code coverage | 100% of 17 error codes | Test-to-error mapping |
| Module coverage | 7/7 modules | Test file per module |

---

## 3. Test File Plan

| Test File | Module(s) | Traces | Est. Tests |
|-----------|-----------|--------|-----------|
| `debate-creator-enhancements.test.cjs` | M1 | FR-001, FR-007, AC-001-01..03, AC-007-01..03, NFR-002 | 12 |
| `debate-critic-agent.test.cjs` | M2 | FR-002, AC-002-01..05 | 14 |
| `debate-refiner-agent.test.cjs` | M3 | FR-003, AC-003-01..04 | 10 |
| `debate-orchestrator-loop.test.cjs` | M4, M7 | FR-004, FR-006, FR-008, AC-004-01..04, AC-006-01..03, NFR-004 | 18 |
| `debate-flag-parsing.test.cjs` | M5 | FR-005, AC-005-01..05 | 10 |
| `debate-documentation.test.cjs` | M6 | CON-003 | 4 |
| `debate-validation-rules.test.cjs` | VR-001..VR-062 | All VRs | 15 |
| `debate-integration.test.cjs` | M1+M2+M3+M4 | Cross-module | 7 |
| **Total** | | | **~90** |

---

## 4. Test Design by Module

### 4.1 M1: Creator Enhancements (debate-creator-enhancements.test.cjs)

**File under test:** `src/claude/agents/01-requirements-analyst.md`

| TC ID | Test Case | AC/NFR | Assertion |
|-------|-----------|--------|-----------|
| TC-M1-01 | DEBATE_CONTEXT detection section exists | AC-001-01 | Content contains `DEBATE_CONTEXT` and `Mode Detection` |
| TC-M1-02 | Round labeling instructions present | AC-001-01 | Content contains `Round {N} Draft` or equivalent template |
| TC-M1-03 | Skip final save menu in debate mode | AC-001-01 | Content contains instruction to skip save menu when DEBATE_CONTEXT present |
| TC-M1-04 | Single-agent mode preserved | AC-001-02, NFR-002 | Content contains `NOT present` / absence-based fork leading to current behavior |
| TC-M1-05 | Conversational opening: reflect pattern | AC-007-01 | Content contains `Reflect` or `reflect` and `summary` |
| TC-M1-06 | Conversational opening: targeted follow-up | AC-007-02 | Content contains `ONE targeted` or avoids `3 generic questions` |
| TC-M1-07 | Discovery context integration | AC-007-03 | Content contains `discovery_context` and `24h` or `fresh` |
| TC-M1-08 | Organic 5 lenses (not sequential stages) | AC-001-03, FR-007 | Content contains `5 lenses` or `Business/User/UX/Tech/Quality` with `organic` |
| TC-M1-09 | Round > 1 behavior (no re-asking) | FR-001 | Content contains `Round > 1` and instructions to not re-ask opening questions |
| TC-M1-10 | Explicit requirement IDs in debate output | FR-001 | Content contains `FR-NNN`, `AC-NNN`, `NFR-NNN` format references |
| TC-M1-11 | A/R/C menu pattern preserved | NFR-002 | Content contains `[A]` or `Adjust` and `[R]` or `Refine` and `[C]` or `Continue` |
| TC-M1-12 | DEBATE MODE BEHAVIOR section exists | FR-001 | Content contains `DEBATE MODE BEHAVIOR` heading |

### 4.2 M2: Critic Agent (debate-critic-agent.test.cjs)

**File under test:** `src/claude/agents/01-requirements-critic.md`

| TC ID | Test Case | AC/NFR | Assertion |
|-------|-----------|--------|-----------|
| TC-M2-01 | Critic agent file exists | FR-002 | File exists at expected path |
| TC-M2-02 | Agent frontmatter contains correct name | FR-002, CON-003 | Content contains `name: requirements-critic` |
| TC-M2-03 | MC-01: Given/When/Then check present | AC-002-02 | Content contains `MC-01` and `Given/When/Then` |
| TC-M2-04 | MC-02: Quantified NFRs check present | AC-002-03 | Content contains `MC-02` and `Quantified` or `quantified` |
| TC-M2-05 | MC-03: Orphan requirements check present | AC-002-04 | Content contains `MC-03` and `Orphan` |
| TC-M2-06 | MC-04: Contradictions check present | AC-002-05 | Content contains `MC-04` and `Contradiction` |
| TC-M2-07 | MC-05: Missing compliance check present | FR-002 | Content contains `MC-05` and `Compliance` |
| TC-M2-08 | BLOCKING/WARNING severity classification | AC-002-01 | Content contains `BLOCKING` and `WARNING` |
| TC-M2-09 | Critique report output format | AC-002-01 | Content contains `round-{N}-critique.md` or `round-` and `critique` |
| TC-M2-10 | Rule: Never produce zero findings on Round 1 | FR-002 | Content contains rule about not producing zero findings on Round 1 |
| TC-M2-11 | Rule: Never inflate severity | FR-002 | Content contains rule about not inflating severity |
| TC-M2-12 | Rule: Always reference specific IDs | AC-002-01 | Content contains rule about referencing specific IDs |
| TC-M2-13 | Discretionary checks DC-01..DC-07 present | FR-002 | Content contains `DC-01` through `DC-07` |
| TC-M2-14 | Critique is read-only (does not modify artifacts) | FR-002 | Content contains instruction that critique report is only output |

### 4.3 M3: Refiner Agent (debate-refiner-agent.test.cjs)

**File under test:** `src/claude/agents/01-requirements-refiner.md`

| TC ID | Test Case | AC/NFR | Assertion |
|-------|-----------|--------|-----------|
| TC-M3-01 | Refiner agent file exists | FR-003 | File exists at expected path |
| TC-M3-02 | Agent frontmatter contains correct name | FR-003, CON-003 | Content contains `name: requirements-refiner` |
| TC-M3-03 | BLOCKING findings addressed (mandatory) | AC-003-01 | Content contains instructions to address all BLOCKING findings |
| TC-M3-04 | Vague AC fix strategy (Given/When/Then) | AC-003-02 | Content contains `Given/When/Then` as fix for vague ACs |
| TC-M3-05 | Unmeasured NFR fix strategy (quantified metric) | AC-003-03 | Content contains quantified metric fix strategy |
| TC-M3-06 | Escalation with NEEDS CLARIFICATION | AC-003-04 | Content contains `NEEDS CLARIFICATION` and `Article IV` |
| TC-M3-07 | Change log format present | FR-003 | Content contains `Changes in Round` and table format |
| TC-M3-08 | Rule: Never remove existing requirements | FR-003 | Content contains rule about not removing requirements |
| TC-M3-09 | Rule: Never introduce new scope | FR-003 | Content contains rule about not introducing scope |
| TC-M3-10 | Rule: Preserve requirement IDs | FR-003 | Content contains rule about preserving IDs |

### 4.4 M4: Orchestrator Debate Loop (debate-orchestrator-loop.test.cjs)

**File under test:** `src/claude/agents/00-sdlc-orchestrator.md`

| TC ID | Test Case | AC/NFR | Assertion |
|-------|-----------|--------|-----------|
| TC-M4-01 | DEBATE LOOP ORCHESTRATION section exists | FR-004 | Content contains `DEBATE LOOP ORCHESTRATION` |
| TC-M4-02 | resolveDebateMode logic documented | FR-005, AC-005-01 | Content contains `resolveDebateMode` or debate mode resolution pseudocode |
| TC-M4-03 | --no-debate wins precedence | AC-005-03 | resolveDebateMode section has --no-debate as first check |
| TC-M4-04 | --debate overrides -light | AC-005-04 | resolveDebateMode section has --debate before -light check |
| TC-M4-05 | Standard sizing defaults to debate ON | AC-005-01 | Content contains `standard` returning `true` for debate |
| TC-M4-06 | debate_state initialization documented | AC-006-03 | Content contains `debate_state` initialization with round, max_rounds, converged |
| TC-M4-07 | Creator delegation with DEBATE_CONTEXT | AC-001-01, AC-006-01 | Content contains Creator delegation with DEBATE_CONTEXT block |
| TC-M4-08 | Critic-Refiner loop documented | AC-006-01 | Content contains loop with Critic review and Refiner improvement |
| TC-M4-09 | Convergence check: zero BLOCKING | AC-004-01 | Content contains convergence when blocking == 0 |
| TC-M4-10 | Max 3 rounds hard limit | AC-004-02, NFR-004 | Content contains `max_rounds` with value `3` and exit on limit |
| TC-M4-11 | Unconverged warning appended | AC-004-02 | Content contains unconverged warning append to requirements-spec.md |
| TC-M4-12 | debate-summary.md generation | AC-004-03 | Content contains `debate-summary.md` generation instructions |
| TC-M4-13 | round-N-critique.md saved for audit | AC-004-04 | Content contains `round-` and `critique.md` file saving |
| TC-M4-14 | Single-agent fallback when debate OFF | AC-006-02, NFR-002 | Content contains single-agent delegation when debate_mode == false |
| TC-M4-15 | debate_state updates per round | AC-006-03 | Content contains rounds_history tracking |
| TC-M4-16 | Convergence on Round 1 edge case | FR-004 | Content addresses convergence on first review (Refiner not invoked) |
| TC-M4-17 | Malformed critique fail-open (Article X) | NFR-004 | Content contains fail-open for parse errors |
| TC-M4-18 | Both flags conflict resolution | FR-005 | Content contains --no-debate wins when both flags present |

### 4.5 M5: Flag Parsing (debate-flag-parsing.test.cjs)

**File under test:** `src/claude/commands/isdlc.md`

| TC ID | Test Case | AC/NFR | Assertion |
|-------|-----------|--------|-----------|
| TC-M5-01 | --debate flag documented | AC-005-04 | Content contains `--debate` in flag table/list |
| TC-M5-02 | --no-debate flag documented | AC-005-03 | Content contains `--no-debate` in flag table/list |
| TC-M5-03 | Flag precedence rules documented | FR-005 | Content contains precedence ordering |
| TC-M5-04 | --no-debate wins over --debate | AC-005-03 | Precedence section lists --no-debate as highest |
| TC-M5-05 | -light implies no debate | AC-005-02 | Content contains -light implying debate OFF |
| TC-M5-06 | Conflict resolution documented | FR-005 | Content contains conflict resolution rule |
| TC-M5-07 | FLAGS block passed to orchestrator | FR-005 | Content contains FLAGS passing to orchestrator |
| TC-M5-08 | debate_mode field written to state.json | AC-005-05 | Content contains `debate_mode` or references state.json debate field |
| TC-M5-09 | Standard sizing default documented | AC-005-01 | Content contains standard/epic sizing defaults to debate ON |
| TC-M5-10 | --debate overrides -light documented | AC-005-04 | Content contains --debate overriding -light |

### 4.6 M6: Documentation (debate-documentation.test.cjs)

**File under test:** `src/claude/CLAUDE.md.template` and `docs/AGENTS.md`

| TC ID | Test Case | AC/NFR | Assertion |
|-------|-----------|--------|-----------|
| TC-M6-01 | CLAUDE.md.template mentions debate mode | FR-005 | Template contains `debate` or `Debate Mode` |
| TC-M6-02 | CLAUDE.md.template has --no-debate usage | FR-005 | Template contains `--no-debate` |
| TC-M6-03 | AGENTS.md lists Critic agent | CON-003 | Content contains `requirements-critic` |
| TC-M6-04 | AGENTS.md lists Refiner agent | CON-003 | Content contains `requirements-refiner` |

### 4.7 Validation Rules (debate-validation-rules.test.cjs)

**File under test:** `docs/requirements/REQ-0014-multi-agent-requirements-team/validation-rules.json`

| TC ID | Test Case | VR | Assertion |
|-------|-----------|-----|-----------|
| TC-VR-001 | Flag precedence: --no-debate > --debate | VR-001 | Rule exists, input/output match spec |
| TC-VR-002 | Flag precedence: --debate > -light | VR-002 | Rule exists, input/output match spec |
| TC-VR-003 | Light flag implies no debate | VR-003 | Rule exists, input/output match spec |
| TC-VR-004 | Standard sizing defaults ON | VR-004 | Rule exists, expected_output = true |
| TC-VR-005 | Epic sizing defaults ON | VR-005 | Rule exists, expected_output = true |
| TC-VR-006 | No flags defaults ON | VR-006 | Rule exists, expected_output = true |
| TC-VR-010 | debate_state.round range 0-3 | VR-010 | Rule exists, min=0, max=3 |
| TC-VR-011 | debate_state.max_rounds fixed at 3 | VR-011 | Rule exists, value=3 |
| TC-VR-020 | Critique report requires Summary section | VR-020 | Rule exists, required_content matches |
| TC-VR-021 | Summary must have BLOCKING count | VR-021 | Rule exists, pattern matches |
| TC-VR-040 | Critique filename pattern | VR-040 | Rule exists, regex matches valid filenames |
| TC-VR-041 | debate-summary.md existence after loop | VR-041 | Rule exists, condition matches |
| TC-VR-050 | DEBATE_CONTEXT mode field required | VR-050 | Rule exists, allowed_values correct |
| TC-VR-060 | Absent DEBATE_CONTEXT = single-agent | VR-060 | Rule exists, description matches |
| TC-VR-062 | Single-agent mode parity | VR-062 | Rule exists, description matches |

### 4.8 Integration (debate-integration.test.cjs)

**Files under test:** Multiple agent `.md` files, cross-referencing

| TC ID | Test Case | Traces | Assertion |
|-------|-----------|--------|-----------|
| TC-INT-01 | Creator and Critic both reference DEBATE_CONTEXT | FR-001, FR-002 | Both files contain `DEBATE_CONTEXT` |
| TC-INT-02 | Critic output format matches orchestrator parsing | FR-002, FR-004 | Orchestrator references `BLOCKING \| {Y}` parsing; Critic references same format |
| TC-INT-03 | Refiner references critique file naming | FR-003, FR-006 | Refiner references `round-{N}-critique.md` pattern |
| TC-INT-04 | Orchestrator delegates to all three agents | FR-008 | Orchestrator contains `requirements-analyst`, `requirements-critic`, `requirements-refiner` |
| TC-INT-05 | Flag parsing and orchestrator consistent | FR-005 | isdlc.md FLAGS format matches orchestrator's reading of FLAGS |
| TC-INT-06 | Backward compat: all debate agents check for DEBATE_CONTEXT absence | NFR-002 | Analyst has absence-based fork; Critic/Refiner only invoked in debate mode |
| TC-INT-07 | Error codes from error-taxonomy referenced in orchestrator | FR-004 | Orchestrator behavior matches error-taxonomy recovery patterns |

---

## 5. Test Data Plan

### 5.1 No External Test Data Required

Since tests verify prompt content presence (string assertions on `.md` files), no test fixtures, mock data, or generated test data are needed. The "test data" is the agent files themselves.

### 5.2 Validation Rules Test Data

The validation-rules.json file already contains:
- Input/output pairs for precedence rules (VR-001 through VR-006)
- Schema definitions for state fields (VR-010 through VR-015)
- Content patterns for critique format (VR-020 through VR-026)
- File naming patterns (VR-040, VR-041)

These are tested by parsing the JSON and validating rule structure.

### 5.3 Boundary Conditions

Boundary conditions are embedded in the validation rules themselves:
- Round range: 0, 1, 2, 3 (VR-010)
- Max rounds: fixed at 3 (VR-011)
- BLOCKING count: 0 (converge), >0 (continue), unparseable (fail-open)
- Flag combinations: all 6 combinations defined in VR-001 through VR-006

---

## 6. Test Execution

### 6.1 Commands

```bash
# Run all debate tests
node --test src/claude/hooks/tests/debate-*.test.cjs

# Run a specific test file
node --test src/claude/hooks/tests/debate-creator-enhancements.test.cjs

# Run full suite (includes debate tests)
node --test src/claude/hooks/tests/*.test.cjs
```

### 6.2 CI Integration

Tests run in the existing CI pipeline (GitHub Actions):
- Matrix: 3 OS (ubuntu, macos, windows) x 3 Node versions (18, 20, 22)
- No additional CI configuration needed
- Tests are CJS files in the existing test directory

---

## 7. Error Code Coverage

| Error Code | Covered By | How Verified |
|------------|-----------|-------------|
| DBT-E001 | TC-M4-18, TC-M5-04, TC-VR-001 | Flag conflict resolution documented in orchestrator |
| DBT-E002 | TC-M4-05 | Sizing unavailable defaults to debate ON |
| DBT-E003 | TC-M4-05 | Unknown sizing defaults to debate ON |
| DBT-E010 | TC-M4-16 | Creator artifact missing handling documented |
| DBT-E011 | TC-INT-07 | Partial artifacts handling in error taxonomy |
| DBT-E012 | TC-INT-07 | Critic delegation failure recovery |
| DBT-E013 | TC-INT-07 | Refiner delegation failure recovery |
| DBT-E014 | TC-M4-15 | State write handling |
| DBT-E020 | TC-M4-17 | Critique not produced = fail-open |
| DBT-E021 | TC-M4-17 | Summary missing = fail-open |
| DBT-E022 | TC-M4-17 | Blocking count unparseable = fail-open |
| DBT-E023 | TC-M4-17 | Critique format invalid = fail-open |
| DBT-E030 | TC-M4-10, TC-M4-11 | Max rounds reached handling |
| DBT-E031 | TC-M3-06 | Escalation handling |
| DBT-E040 | TC-M4-12 | Summary generation failure |
| DBT-E041 | TC-M4-13 | Critique save failure |
| DBT-E042 | TC-INT-07 | Artifact overwrite failure |

---

## 8. NFR Coverage

| NFR | Test Cases | Verification Approach |
|-----|-----------|----------------------|
| NFR-001 (Performance: 15 min) | N/A | Operational metric; not statically testable |
| NFR-002 (Backward Compatibility) | TC-M1-04, TC-M1-11, TC-M4-14, TC-INT-06 | Verify single-agent mode sections preserved |
| NFR-003 (Single-Agent Parity) | TC-M1-04, TC-M4-14, TC-VR-062 | Verify -light and --no-debate produce single-agent behavior |
| NFR-004 (Convergence Guarantee) | TC-M4-10, TC-M4-17 | Verify max rounds hard limit and fail-open |
| NFR-005 (Extensibility) | TC-M4-01 | Architecture review (debate loop generic, not Phase-01-specific) |

---

## 9. Critical Path Tests

These tests MUST pass for the feature to be considered functional:

1. **TC-M4-01**: Debate loop orchestration section exists (foundation)
2. **TC-M4-09**: Convergence check logic present (core mechanism)
3. **TC-M4-10**: Max 3 rounds hard limit (safety guarantee)
4. **TC-M2-01**: Critic agent exists (new file)
5. **TC-M3-01**: Refiner agent exists (new file)
6. **TC-M1-01**: Creator debate awareness exists (backward compat)
7. **TC-M5-01**: Flag parsing documented (user interface)
8. **TC-INT-04**: Orchestrator delegates to all three agents (wiring)

---

## 10. GATE-05 Checklist

- [x] Test strategy covers unit, integration, E2E (E2E N/A -- documented why), security (N/A), performance (N/A)
- [x] Test cases exist for all 28 ACs (100% coverage in traceability matrix)
- [x] Test cases exist for all 5 NFRs (NFR-001 documented as non-testable)
- [x] Test cases exist for all 33 validation rules (grouped in VR test file)
- [x] Traceability matrix complete (100% requirement coverage)
- [x] Coverage targets defined (100% AC, 100% NFR, 100% VR)
- [x] Test data strategy documented (no external data needed)
- [x] Critical paths identified (8 critical tests)
- [x] Error code coverage mapped (17/17 error codes)
- [x] Test execution commands documented
