# Test Strategy: BUG-0057 Fix Prompt-Format Tests

**Phase**: 05 - Test Strategy & Design
**Workflow**: fix
**Bug ID**: BUG-0057-fix-prompt-format-tests
**Generated**: 2026-03-29

---

## Existing Infrastructure (from test evaluation)

- **Framework**: `node --test` (Node.js built-in test runner)
- **Assertion**: `node:assert` (strict mode)
- **Coverage Tool**: None configured (no nyc, c8, or istanbul)
- **Current Coverage**: ~85% estimated (1,600 tests across 365 files)
- **Current Pass Rate**: 1,597/1,600 (99.8%) -- the 3 failures are the subject of this fix
- **Test Commands**:
  - Unit (lib): `npm test`
  - Full suite: `npm run test:all`

---

## Test Approach

This bug fix modifies **existing test assertions only** -- no new test files, no new test cases, no production code changes. The strategy is:

1. **Modify 3 assertions** in 3 existing test files to match current production file content
2. **Verify each fix individually** by running the specific test file
3. **Verify no regressions** by running the full test suite

### What Changes

| Test ID | File | Line | Current (Failing) | Proposed (Passing) |
|---------|------|------|--------------------|--------------------|
| T46 | `lib/invisible-framework.test.js` | 693 | `claudeMd.includes('primary_prompt')` | `claudeMd.includes('primary prompt')` |
| TC-028 | `lib/node-version-update.test.js` | 346 | `readmeContent.includes('**Node.js 20+**')` | `readmeContent.includes('**Node.js**') && readmeContent.includes('20+')` |
| TC-09-03 | `lib/prompt-format.test.js` | 632 | `claudeMd.includes('Start a new workflow')` | `claudeMd.includes('Show workflow status')` |

### What Does NOT Change

- No new test files created
- No test files deleted
- No production files (CLAUDE.md, README.md) modified
- No test infrastructure changes (framework, config, scripts)
- No changes to any other test assertions in these files

---

## Test Pyramid

This fix operates entirely at the **unit test** level. All 3 tests are content-verification unit tests that read a file and check for substring presence. No integration or E2E tests are affected.

| Level | Tests Affected | Action |
|-------|---------------|--------|
| Unit | 3 (T46, TC-028, TC-09-03) | Modify assertions |
| Integration | 0 | No action |
| E2E | 0 | No action |
| Security | 0 | No action -- no security-relevant changes |
| Performance | 0 | No action -- string assertions have negligible overhead |

---

## Verification Plan

### Step 1: Individual Test File Verification

Run each modified test file in isolation to confirm the specific fix works.

```bash
node --test lib/invisible-framework.test.js
```
**Expected**: T46 passes. All other tests in the file continue to pass.

```bash
node --test lib/node-version-update.test.js
```
**Expected**: TC-028 passes. All other tests in the file continue to pass.

```bash
node --test lib/prompt-format.test.js
```
**Expected**: TC-09-03 passes. All other tests in the file continue to pass.

### Step 2: Full Suite Regression Check

Run the complete test suite to verify no regressions.

```bash
npm run test:all
```
**Expected**:
- Total tests >= 1,600 (constitutional baseline, Article II)
- 0 failures (all 1,600 pass, including the 3 previously failing)
- No new skipped or cancelled tests

### Step 3: Result Validation

Parse the test output summary and verify:
- `fail: 0`
- `tests: >= 1600`
- `pass: >= 1600`

---

## Flaky Test Mitigation

These 3 tests are **not flaky** -- they are deterministically failing due to stale string expectations. However, to prevent future recurrence of this class of failure:

- The fix for TC-028 uses a split assertion (`includes('**Node.js**') && includes('20+')`) rather than a single concatenated string. This is more resilient to formatting changes that keep both tokens present but rearrange them.
- Future consideration (out of scope for this fix): content-verification tests could be refactored to use regex patterns or structural assertions rather than exact substring matches. This is documented as a possible follow-up but is explicitly out of scope per the requirements spec.

---

## Performance Test Plan

No performance testing is needed for this fix. The changes are limited to modifying 3 string comparison assertions. The execution time impact is negligible (microseconds per assertion).

---

## Regression Check

Per Constitutional Article II:
- **Baseline**: 1,600 tests
- **Regression threshold**: Total test count MUST NOT decrease
- **Expected after fix**: 1,600 tests, 1,600 passing, 0 failing

The fix does not add or remove any tests. It modifies 3 existing assertions so they match current production content. The total test count remains exactly 1,600.

---

## Coverage Targets

No coverage target changes. This fix does not add new code paths or remove existing ones. The estimated ~85% overall coverage remains unchanged.

---

## Critical Paths

The 3 tests being fixed are content-verification tests for CLAUDE.md and README.md. They are **not** on critical execution paths (installer, updater, hook enforcement). However, they block CI when failing, which indirectly blocks all development. Fixing them restores CI health.

---

## Traceability: FR/AC to Test Mapping

| Requirement | Acceptance Criteria | Test ID | Test File | Line | Test Type |
|-------------|-------------------|---------|-----------|------|-----------|
| FR-001 | AC-001-01 | T46 | `lib/invisible-framework.test.js` | 693 | positive |
| FR-002 | AC-002-01 | TC-028 | `lib/node-version-update.test.js` | 346 | positive |
| FR-003 | AC-003-01 | TC-09-03 | `lib/prompt-format.test.js` | 632 | positive |
| FR-004 | AC-004-01 | (all) | `npm run test:all` | -- | regression |

All 4 functional requirements have 100% test coverage. FR-001 through FR-003 each map to exactly one test assertion modification. FR-004 (no regression) is validated by running the full suite and checking the summary counts.

---

## Constitutional Compliance

| Article | Status | Evidence |
|---------|--------|----------|
| **II (Test-First Development)** | Compliant | Test strategy designed before implementation (Phase 05 before Phase 06). Coverage targets maintained at >= 1,600 baseline. |
| **VII (Artifact Traceability)** | Compliant | Every FR/AC maps to a specific test ID and file location. No orphan requirements. No orphan tests. |
| **IX (Quality Gate Integrity)** | Compliant | GATE-04 checklist satisfied: strategy covers all test types (unit only, as appropriate for scope), test cases exist for all requirements, traceability complete, coverage targets defined. |
| **XI (Integration Testing Integrity)** | Compliant (N/A) | No integration tests affected by this fix. The changes are purely unit-level content assertions. Article XI requirements (mutation testing, real URLs, adversarial testing) do not apply to string assertion corrections. |
