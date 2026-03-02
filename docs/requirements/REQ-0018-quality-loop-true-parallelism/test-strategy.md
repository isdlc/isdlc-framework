# Test Strategy: REQ-0018 Quality Loop True Parallelism

**Phase**: 05-test-strategy
**Feature**: Quality Loop true parallelism -- Track A + Track B as separate sub-agents with internal parallelism
**Date**: 2026-02-15
**Version**: 1.0

---

## 1. Existing Infrastructure

| Aspect | Value |
|--------|-------|
| **Framework** | `node:test` (built-in Node.js test runner) |
| **Module System** | CommonJS (CJS) for hook/test files |
| **Coverage Tool** | None (not configured; constitution requires 100% line coverage) |
| **Test Pattern** | Prompt-verification tests: read `.md` file, assert content with string matching |
| **Test Location** | `src/claude/hooks/tests/` |
| **Naming Convention** | `*.test.cjs` |
| **Existing Coverage for Target** | 0% (zero existing tests for `16-quality-loop-engineer.md`) |
| **Total Project Tests** | 800+ across 50+ test files |

### Existing Test Patterns (from established codebase)

The project follows a well-established prompt-verification pattern. Every test file:

1. Uses `require('node:test')` for `describe` and `it`
2. Uses `require('node:assert/strict')` for assertions
3. Resolves the agent `.md` file path via `path.resolve(__dirname, '..', '..', 'agents', '<agent>.md')`
4. Implements a lazy `getContent()` function with file existence assertion
5. Tests content with `assert.ok(content.includes(...))` or section-level substring extraction
6. Prefixes test names with test case IDs (e.g., `TC-M1-01:`)

This strategy follows these established patterns exactly.

---

## 2. Test Approach

### 2.1 Test Type: Prompt Content Verification

All tests for REQ-0018 are **prompt-verification tests**. They read the agent markdown file and verify that required sections, keywords, patterns, and structural elements are present. This is the established approach for agent prompt features in this codebase.

**Why not behavioral tests?** Agent prompts are markdown instructions consumed by an LLM. There is no executable code to unit-test. The verification approach confirms that the prompt contains all required instructions so the LLM has the correct guidance.

### 2.2 Test File

| Attribute | Value |
|-----------|-------|
| **File** | `src/claude/hooks/tests/quality-loop-parallelism.test.cjs` |
| **Target** | `src/claude/agents/16-quality-loop-engineer.md` |
| **Module** | Single test file covering all 7 FRs and 23 ACs |
| **Pattern** | Prompt-verification (string matching on agent markdown content) |

### 2.3 Test Organization

Tests are organized into `describe` blocks by functional requirement:

| Describe Block | FR | ACs | Test Count |
|---------------|-----|-----|-----------|
| FR-001: Parallel Spawning | FR-001 | AC-001 to AC-004 | 5 |
| FR-002: Internal Track Parallelism | FR-002 | AC-005 to AC-008 | 5 |
| FR-003: Grouping Strategy | FR-003 | AC-009 to AC-012 | 6 |
| FR-004: Consolidated Result Merging | FR-004 | AC-013 to AC-015 | 4 |
| FR-005: Iteration Loop | FR-005 | AC-016 to AC-018 | 4 |
| FR-006: FINAL SWEEP Compatibility | FR-006 | AC-019 to AC-021 | 4 |
| FR-007: Scope Detection | FR-007 | AC-022 to AC-023 | 3 |
| NFR: Non-Functional Requirements | NFR-001 to NFR-004 | - | 4 |
| Regression: Existing Behavior Preserved | NFR-003 | - | 3 |
| **TOTAL** | | | **38** |

---

## 3. Test Cases

### 3.1 FR-001: Parallel Spawning (AC-001 to AC-004)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-01 | Agent file exists | - | File exists at expected path |
| TC-02 | Two Task tool calls in single response | AC-001 | Content instructs exactly two Task tool calls in a single response |
| TC-03 | Track A Task call includes full prompt | AC-002 | Track A Task call references all Track A checks (QL-002, QL-003, QL-004, QL-007) |
| TC-04 | Track B Task call includes full prompt | AC-002 | Track B Task call references all Track B checks (QL-005, QL-006, QL-008, QL-009, QL-010) |
| TC-05 | Wait for both results before consolidation | AC-003, AC-004 | Content contains instruction to wait for both Task results before proceeding |

### 3.2 FR-002: Internal Track Parallelism (AC-005 to AC-008)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-06 | Track A MAY split work into sub-groups | AC-005 | Track A section mentions sub-groups or internal parallelism |
| TC-07 | Track B MAY split work into sub-groups | AC-006 | Track B section mentions sub-groups or internal parallelism |
| TC-08 | Internal parallelism is guidance, not enforcement | AC-007 | Content uses MAY/SHOULD/RECOMMENDED, not MUST for internal parallelism |
| TC-09 | Sub-groups report independently | AC-008 | Content instructs sub-groups to report independently and parent consolidates |
| TC-10 | Parent track consolidates sub-group results | AC-008 | Content mentions consolidation of sub-group results into single track result |

### 3.3 FR-003: Grouping Strategy (AC-009 to AC-012)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-11 | Two grouping modes defined | AC-009 | Content defines both "logical grouping" and "task count" modes |
| TC-12 | Group A1 contains build + lint + type-check | AC-010 | Content defines Group A1 with build verification, lint, type-check |
| TC-13 | Group A2 contains test execution + coverage | AC-010 | Content defines Group A2 with test execution and coverage analysis |
| TC-14 | Group A3 contains mutation testing | AC-010 | Content defines Group A3 with mutation testing |
| TC-15 | Group B1 contains SAST + dependency audit | AC-010 | Content defines Group B1 with SAST security scan and dependency audit |
| TC-16 | Group B2 contains code review + traceability | AC-010 | Content defines Group B2 with automated code review and traceability verification |
| TC-17 | Grouping is a lookup table in prompt, not JS code | AC-011 | Content contains a markdown table or structured format for grouping |
| TC-18 | Unconfigured checks skipped within group | AC-012 | Content instructs skipping unconfigured checks without affecting other group members |

### 3.4 FR-004: Consolidated Result Merging (AC-013 to AC-015)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-19 | Pass/fail status for every check by track and group | AC-013 | Content requires pass/fail for each individual check, organized by track and group |
| TC-20 | ANY failure marks result as FAILED | AC-014 | Content specifies that any check failure marks consolidated result as FAILED |
| TC-21 | Quality report includes Parallel Execution Summary | AC-015 | Content mentions "Parallel Execution Summary" section in quality-report.md |
| TC-22 | Summary shows group composition | AC-015 | Content references group composition and per-track elapsed time in the summary |

### 3.5 FR-005: Iteration Loop (AC-016 to AC-018)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-23 | Failures consolidated from both tracks | AC-016 | Content instructs consolidating ALL failures from both tracks into single list |
| TC-24 | Both tracks re-run after fixes | AC-017 | Content specifies re-running BOTH Track A and Track B after fixes (not just failing track) |
| TC-25 | Circuit breaker referenced | AC-018 | Content references iteration-requirements.json or circuit breaker thresholds |
| TC-26 | Max iterations and circuit breaker threshold | AC-018 | Content mentions max_iterations (10) and/or circuit_breaker_threshold (3) |

### 3.6 FR-006: FINAL SWEEP Compatibility (AC-019 to AC-021)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-27 | FINAL SWEEP exclusions preserved with parallelism | AC-019 | Content maintains FINAL SWEEP exclusion list alongside parallel grouping |
| TC-28 | FINAL SWEEP uses same grouping strategy | AC-020 | Content applies grouping strategy to FINAL SWEEP included checks |
| TC-29 | FULL SCOPE includes all checks | AC-021 | Content includes ALL checks in FULL SCOPE mode |
| TC-30 | FINAL SWEEP and FULL SCOPE both documented | AC-019, AC-021 | Both mode sections exist and are distinct |

### 3.7 FR-007: Scope Detection (AC-022 to AC-023)

| ID | Name | AC | Assertion |
|----|------|-----|-----------|
| TC-31 | 50+ test files threshold for parallel execution | AC-022 | Content specifies 50+ test files as threshold for parallel test execution |
| TC-32 | Small project sub-grouping guidance | AC-023 | Content addresses small projects (<10 test files) with guidance on overhead vs. benefit |
| TC-33 | Scope detection is Track A specific | AC-022 | Scope detection is documented within Track A context |

### 3.8 NFR: Non-Functional Requirements

| ID | Name | NFR | Assertion |
|----|------|-----|-----------|
| TC-34 | No new npm packages or JS files | NFR-002 | Implementation is prompt-only (verified by test file targeting only .md) |
| TC-35 | Backward compatibility for projects without QA tools | NFR-003 | Content handles "NOT CONFIGURED" tools gracefully |
| TC-36 | Parallel execution state tracking extended | NFR-004 | Content includes parallel_execution with track-level timing and group composition |
| TC-37 | Performance section or speedup reference | NFR-001 | Content references performance improvement or reduced wall-clock time |

### 3.9 Regression: Existing Behavior Preserved

| ID | Name | Traces | Assertion |
|----|------|--------|-----------|
| TC-38 | Agent frontmatter unchanged | NFR-003 | Frontmatter contains `name: quality-loop-engineer` |
| TC-39 | GATE-16 checklist still present | NFR-003 | GATE-16 checklist items are preserved |
| TC-40 | Tool Discovery Protocol preserved | NFR-003 | Tool Discovery Protocol section still exists |

---

## 4. Test Data Plan

### 4.1 Test Data Source

The sole test data source is the agent file content itself:
- **File**: `src/claude/agents/16-quality-loop-engineer.md`
- **Read method**: `fs.readFileSync(path, 'utf8')`
- **Assertion method**: String matching via `assert.ok(content.includes(...))` and section-level substring extraction

### 4.2 Test Data Requirements

No external test data is needed. The tests verify prompt content, not runtime behavior. The agent markdown file IS the test data.

### 4.3 Boundary Conditions

- File existence check (TC-01)
- Section existence (e.g., Grouping Strategy section must exist before checking sub-content)
- Substring search scope: some tests extract a section substring first, then search within it (prevents false positives from unrelated sections)

---

## 5. Coverage Targets

| Metric | Target | Justification |
|--------|--------|---------------|
| Requirement Coverage | 100% (23/23 ACs) | Constitution Article VII requires every requirement mapped to at least one test |
| FR Coverage | 100% (7/7 FRs) | Each FR has at least 3 test cases |
| NFR Coverage | 100% (4/4 NFRs) | Each NFR has at least one verification test |
| Test Count | 38 minimum | Covers all ACs plus regression and structural tests |

---

## 6. Critical Paths

| Critical Path | Tests | Risk |
|--------------|-------|------|
| Dual-Task parallel spawning instruction | TC-02, TC-03, TC-04, TC-05 | HIGH -- Core feature, must be explicitly instructed |
| Grouping strategy lookup table | TC-11 to TC-18 | MEDIUM -- Structure must be correct for LLM to follow |
| BOTH tracks re-run after failure | TC-24 | MEDIUM -- Regression risk if only failing track re-runs |
| FINAL SWEEP compatibility | TC-27, TC-28, TC-29 | MEDIUM -- Must not break existing mode |

---

## 7. Test Execution

### Commands

```bash
# Run only quality-loop-parallelism tests
node --test src/claude/hooks/tests/quality-loop-parallelism.test.cjs

# Run all CJS tests (regression)
node --test src/claude/hooks/tests/*.test.cjs
```

### Expected Results

- All 38 tests PASS after implementation
- All 38 tests FAIL before implementation (test-first verification)
- Zero regressions in existing test suite

---

## 8. Constitutional Compliance

| Article | Compliance | Evidence |
|---------|-----------|----------|
| **II (Test-First)** | COMPLIANT | Test cases designed before implementation; test file written before agent prompt changes |
| **VII (Traceability)** | COMPLIANT | Every AC (001-023) maps to at least one test case; traceability matrix provided |
| **IX (Gate Integrity)** | COMPLIANT | GATE-16 checklist preservation tested (TC-39) |
| **XI (Integration Testing)** | COMPLIANT | Tests verify that Track A and Track B integration points are correctly instructed |

---

## 9. GATE-05 Validation

- [x] Test strategy covers all test types applicable to this feature (prompt-verification)
- [x] Test cases exist for all 23 acceptance criteria
- [x] Traceability matrix complete (100% requirement coverage)
- [x] Coverage targets defined (100% AC, 100% FR, 100% NFR)
- [x] Test data strategy documented (agent file content)
- [x] Critical paths identified (4 critical paths)
- [x] Existing test infrastructure leveraged (node:test, CJS, established patterns)
- [x] Regression tests included (3 tests for backward compatibility)
