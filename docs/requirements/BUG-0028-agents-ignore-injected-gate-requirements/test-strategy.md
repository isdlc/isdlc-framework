# Test Strategy: BUG-0028 -- Agents Ignore Injected Gate Requirements

**Bug ID**: BUG-0028 / GH-64
**Phase**: 05-test-strategy
**Artifact Folder**: `BUG-0028-agents-ignore-injected-gate-requirements`
**Traces to**: Requirements Specification (Phase 01), Module Design (Phase 04)

---

## 1. Existing Infrastructure

- **Framework**: `node:test` + `node:assert/strict` (CJS pattern per Article XII)
- **Test File**: `src/claude/hooks/tests/gate-requirements-injector.test.cjs`
- **Current Coverage**: 62 assertions across 11 test suites covering `formatBlock()`, `buildGateRequirementsBlock()`, helpers, edge cases, and phase name mapping
- **Test Helpers**: `loadModule()`, `createTestDir()`/`destroyTestDir()`, `writeFixture()`, `setupFullFixtures()`
- **Existing Fixtures**: `FIXTURE_ITERATION_REQ`, `FIXTURE_ARTIFACT_PATHS`, `FIXTURE_CONSTITUTION`, `FIXTURE_WORKFLOWS`
- **Test Runner Command**: `node --test src/claude/hooks/tests/gate-requirements-injector.test.cjs`

**Strategy**: Extend the existing test suite with 3 new `describe` blocks (18 test cases total). Do NOT replace existing infrastructure. Follow all existing conventions (CJS, `loadModule()`, fixture constants, `afterEach` cleanup).

---

## 2. Test Pyramid

### 2.1 Unit Tests (Primary Focus -- 18 new tests)

All new tests are unit tests targeting the two new exported functions (`buildCriticalConstraints`, `buildConstraintReminder`) and the modified `formatBlock()` function.

| Suite | Test Count | Target Function | FR/NFR Coverage |
|-------|-----------|----------------|-----------------|
| 12. Injection salience (BUG-0028) | 6 | `formatBlock()` | AC-006-01, AC-006-02, AC-006-03, AC-002-01, CON-003, NFR-001 |
| 13. buildCriticalConstraints (BUG-0028) | 8 | `buildCriticalConstraints()` | FR-001, FR-002, NFR-002 |
| 14. buildConstraintReminder (BUG-0028) | 4 | `buildConstraintReminder()` | FR-001, NFR-002 |

### 2.2 Integration Tests (Existing -- Verify No Regression)

The existing suite 10 ("Integration - full pipeline") and suite 1 ("buildGateRequirementsBlock") already test the full call chain from `buildGateRequirementsBlock()` through `formatBlock()`. After implementation:

- All 62 existing assertions MUST continue to pass unchanged (NFR-002: backward compatibility)
- The integration test `produces complete output with real-ish fixture configs` verifies the new format does not break existing consumers

### 2.3 Static Content Validation (Manual Audit, Not Automated)

FR-003 (isdlc.md acknowledgment instruction) and FR-004 (agent file inline prohibition) are prompt template changes. These are validated by:

- Code review (Phase 08) verifying text content matches the module design specification
- The agent file changes (FR-004) are static markdown -- not programmatically testable with unit tests
- The isdlc.md change (FR-003) is a prompt template consumed by Claude -- not unit testable

### 2.4 E2E Tests (Not Applicable)

This bug fix modifies internal hook library functions and prompt templates. There is no user-facing UI, CLI command, or API endpoint to E2E test. The hook safety net (`branch-guard.cjs`, `gate-blocker.cjs`) provides runtime enforcement independent of this fix.

---

## 3. Test Types by Requirement

### FR-001: Strengthen Injection Block Format

| AC | Test Type | Test Case | Assertion |
|----|-----------|-----------|-----------|
| AC-001-01 | Unit | Suite 12, Test 1 | `indexOf('CRITICAL CONSTRAINTS') < indexOf('Iteration Requirements:')` |
| AC-001-02 | Unit | Suite 12, Test 2 | `result.includes('REMINDER:')` AND `reminderIndex > iterReqIndex` |
| AC-001-03 | Unit | Suite 12, Test 3 | CRITICAL CONSTRAINTS section contains "Constitutional validation" |
| AC-001-04 | Unit | Suite 12, Test 6 | `enhancedLen <= baselineLen * 1.4` (40% growth budget) |

### FR-002: Phase-Specific Prohibition Lines

| AC | Test Type | Test Case | Assertion |
|----|-----------|-----------|-----------|
| AC-002-01 | Unit | Suite 12, Test 4 | `result.includes('Do NOT run git commit')` when `isIntermediatePhase=true` |
| AC-002-01 (negative) | Unit | Suite 12, Test 5 | `!result.includes('Do NOT run git commit')` when `isIntermediatePhase=false` |
| AC-002-02 | Unit | Suite 13, Test 5 | `result.some(c => c.includes('Required artifacts'))` when artifact_validation enabled with paths |
| AC-002-03 | Unit | Suite 13, Test 6 | `result.some(c => c.includes('failing test'))` when `require_failing_test_first=true` |

### FR-003: Constraint Acknowledgment Instruction

| AC | Test Type | Validation |
|----|-----------|------------|
| AC-003-01 | Code Review | Verify isdlc.md STEP 3d contains acknowledgment instruction text |
| AC-003-02 | Observation | Best-effort prompt engineering measure; not deterministically testable |

### FR-004: Agent File Audit

| AC | Test Type | Validation |
|----|-----------|------------|
| AC-004-01 | Code Review | Verify `05-software-developer.md` contains inline prohibition |
| AC-004-02 | Code Review | Verify dead cross-references replaced with inline text |
| AC-004-03 | Code Review | Verify no encouraging-commit language in audited agents |

### FR-005: Post-Hook Block Feedback

| AC | Test Type | Validation |
|----|-----------|------------|
| AC-005-01 | Code Review | Verify branch-guard.cjs block message references CRITICAL CONSTRAINTS |
| AC-005-02 | Code Review | Verify gate-blocker.cjs `action_required` fields are intact (no change needed) |

### FR-006: Regression Tests

| AC | Test Type | Test Case | Assertion |
|----|-----------|-----------|-----------|
| AC-006-01 | Unit | Suite 12, Test 1 | CRITICAL CONSTRAINTS before Iteration Requirements |
| AC-006-02 | Unit | Suite 12, Test 2 | REMINDER line after all sections |
| AC-006-03 | Unit | Suite 12, Test 3 | Constitutional validation in CRITICAL CONSTRAINTS |

---

## 4. Flaky Test Mitigation

**Risk**: LOW. All tests are pure function calls with no I/O, no network, no timers, and no concurrency.

| Risk Factor | Mitigation |
|------------|------------|
| Module caching | `loadModule()` clears `require.cache` before each load (existing pattern) |
| Temp directory leaks | `afterEach` calls `destroyTestDir()` (existing pattern) |
| String matching fragility | Tests use `includes()` and `indexOf()` rather than exact string matching |
| Order dependency | Each test constructs its own inputs; no shared mutable state between tests |
| Character count test (Test 6) | Uses relative percentage (40% growth), not absolute character counts; robust against minor wording changes |

No additional flaky test mitigation is needed. The existing patterns are sufficient.

---

## 5. Performance Test Plan

### 5.1 Character Count Budget Test (NFR-001, AC-001-04)

Suite 12, Test 6 serves as the performance budget test:

```
baseline = formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null)
enhanced = formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null, true)
assert: enhancedLen <= baselineLen * 1.4
```

This measures the injection block size growth and caps it at 40%.

### 5.2 Execution Time (NFR-001)

The `formatBlock()` function performs only string concatenation -- no I/O. Execution time is expected to remain well under 5ms. A benchmark test is not included in the test suite because:
- The function has zero I/O
- node:test does not provide built-in benchmarking
- The 40% character growth test is a sufficient proxy for context window budget

### 5.3 Total Block Size (NFR-003)

The module design examples show typical block output is well under 2000 characters. Test 6 validates relative growth. The absolute 2000-character cap is verified by inspection of the output examples in the module design (Section 2.3).

---

## 6. Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| New function coverage | 100% line coverage for `buildCriticalConstraints()` and `buildConstraintReminder()` | Article II: test-first |
| Modified function coverage | 100% of new code paths in `formatBlock()` | Existing function, new branches |
| Regression coverage | 100% existing tests pass | NFR-002: backward compatibility |
| Requirement coverage | 100% of testable ACs have at least one test | Article VII: traceability |

### Critical Paths

1. `buildCriticalConstraints()` with all constraint types enabled (git commit + test coverage + constitutional + artifact + workflow modifier)
2. `buildCriticalConstraints()` with no constraints (empty array return -- fail-open for unconstrained phases)
3. `buildCriticalConstraints()` with null `phaseReq` (error handling -- fail-open)
4. `formatBlock()` with `isIntermediatePhase=true` (CRITICAL CONSTRAINTS section emitted)
5. `formatBlock()` with `isIntermediatePhase=false` and no constraints (no CRITICAL CONSTRAINTS section -- CON-003)
6. `buildConstraintReminder()` with empty/null input (returns empty string -- fail-open)

---

## 7. Test Data Strategy

### 7.1 Existing Fixtures (Reuse)

All tests reuse the existing `FIXTURE_ITERATION_REQ` constant which defines `06-implementation` (test_iteration enabled, constitutional_validation enabled, artifact_validation disabled) and `01-requirements` (interactive_elicitation enabled, artifact_validation enabled).

### 7.2 Inline Test Data (New)

For `buildCriticalConstraints` and `buildConstraintReminder` tests, minimal inline `phaseReq` objects are constructed per test to isolate each constraint condition:

| Test Scenario | Input Data |
|--------------|------------|
| Git commit prohibition | `{ test_iteration: { enabled: false }, constitutional_validation: { enabled: false } }`, `isIntermediatePhase=true` |
| Test coverage constraint | `{ test_iteration: { enabled: true, success_criteria: { min_coverage_percent: 80 } } }` |
| Constitutional constraint | `{ constitutional_validation: { enabled: true, articles: ['I'] } }` |
| Artifact constraint | `{ artifact_validation: { enabled: true, paths: ['some/path.md'] } }` |
| Workflow modifier | `phaseReq` minimal + `workflowModifiers: { require_failing_test_first: true }` |
| No constraints | All disabled, `isIntermediatePhase=false` |
| Error / null input | `phaseReq=null` |

### 7.3 Boundary Values

| Boundary | Value | Expected |
|----------|-------|----------|
| Empty constraints array | `[]` | `buildConstraintReminder` returns `''` |
| Single constraint | `['One constraint.']` | `REMINDER: One constraint.` |
| Five constraints (all types) | All conditions true | `REMINDER: c1 c2 c3 c4 c5` |
| `isIntermediatePhase=undefined` | Not passed | Defaults to `true` (fail-safe) |
| `phaseReq=null` | null | `buildCriticalConstraints` returns `[]` |
| `workflowModifiers=null` | null | Modifier constraints skipped |

### 7.4 Invalid Inputs

| Input | Function | Expected |
|-------|----------|----------|
| `null` | `buildConstraintReminder(null)` | `''` |
| `undefined` | `buildConstraintReminder(undefined)` | `''` |
| `null` | `buildCriticalConstraints(..., null, ...)` | `[]` (phaseReq=null triggers try/catch) |
| Non-array | `buildConstraintReminder('not an array')` | `''` |

---

## 8. Test Execution

### 8.1 Run Command

```bash
node --test src/claude/hooks/tests/gate-requirements-injector.test.cjs
```

### 8.2 Expected Output After Implementation

- **Total test suites**: 14 (11 existing + 3 new)
- **Total assertions**: 80 (62 existing + 18 new)
- **Expected result**: All pass, zero failures

### 8.3 Backward Compatibility Verification

Run the full existing test suite BEFORE any code changes to establish the green baseline. Then run again AFTER implementation to verify no regressions. The existing tests use `includes()` assertions that are robust against additive format changes.

---

## 9. Test File Location and Conventions

| Aspect | Convention |
|--------|-----------|
| File path | `src/claude/hooks/tests/gate-requirements-injector.test.cjs` (extend existing file) |
| Module format | CJS (`.cjs` extension, `require()`) per Article XII |
| Test runner | `node:test` per Article II |
| Assertion library | `node:assert/strict` per project convention |
| Test naming | `describe('BUG-0028: {Suite Name}', () => { it('{description}', ...) })` |
| Suite numbering | Continue from existing: 12, 13, 14 |
| Cleanup | `afterEach(() => { destroyTestDir(); })` in suites that use temp dirs |
| Module loading | `loadModule()` for fresh module instance per test |

---

## 10. Traceability Summary

| Requirement | Testable? | Test Case(s) | Validation Method |
|-------------|-----------|-------------|-------------------|
| FR-001 (AC-001-01 through AC-001-04) | Yes | Suite 12: Tests 1, 2, 3, 6 | Unit test |
| FR-002 (AC-002-01 through AC-002-03) | Yes | Suite 12: Tests 4, 5; Suite 13: Tests 5, 6 | Unit test |
| FR-003 (AC-003-01, AC-003-02) | No (prompt template) | N/A | Code review |
| FR-004 (AC-004-01 through AC-004-03) | No (static markdown) | N/A | Code review |
| FR-005 (AC-005-01, AC-005-02) | Partially | N/A | Code review + integration observation |
| FR-006 (AC-006-01 through AC-006-03) | Yes | Suite 12: Tests 1, 2, 3 | Unit test |
| NFR-001 (40% growth budget) | Yes | Suite 12: Test 6 | Unit test |
| NFR-002 (fail-open) | Yes | Suite 13: Test 8 | Unit test |
| NFR-003 (< 2000 chars) | Partially | Suite 12: Test 6 (relative) | Unit test + design inspection |
| CON-003 (unconstrained phases unchanged) | Yes | Suite 12: Test 5; Suite 13: Test 7 | Unit test |

**Coverage**: 100% of testable requirements have at least one test case. Non-testable requirements (FR-003, FR-004, FR-005) are validated by code review in Phase 08.

---

## 11. GATE-05 Checklist

- [X] Test strategy covers unit, integration, E2E (where applicable), security, performance
- [X] Test cases exist for all testable requirements (FR-001, FR-002, FR-006, NFR-001, NFR-002, CON-003)
- [X] Non-testable requirements documented with alternative validation method (code review)
- [X] Traceability matrix complete (100% requirement coverage)
- [X] Coverage targets defined (100% new function line coverage, 100% existing tests pass)
- [X] Test data strategy documented (fixtures, boundary values, invalid inputs)
- [X] Critical paths identified (6 critical paths enumerated)
- [X] Existing test infrastructure reused (same framework, conventions, fixtures)
- [X] No schema changes to `iteration-requirements.json` (CON-004)
- [X] Test file follows CJS convention (Article XII)
