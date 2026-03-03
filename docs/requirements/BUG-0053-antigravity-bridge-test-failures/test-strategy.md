# Test Strategy: BUG-0053 — Antigravity Bridge Test Failures

**Bug ID:** BUG-0053-antigravity-bridge-test-failures
**Phase:** 05-test-strategy
**Created:** 2026-03-03
**Workflow:** fix (TDD)

---

## Existing Infrastructure (from test evaluation)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertions**: `node:assert/strict`
- **Test Pattern**: Subprocess-based (spawns `node bin/isdlc.js` in temp directories)
- **Test File Convention**: `*.test.js` co-located with source files
- **Helpers**: `lib/utils/test-helpers.js` (`createTempDir`, `cleanupTempDir`)
- **Current Test Baseline**: 555+ tests (302 ESM lib + 253 CJS hook)
- **Coverage Tool**: None configured (manual validation)
- **Existing Failing Tests**: 29 across 3 files

## Strategy for This Fix

- **Approach**: Fix existing tests -- NOT add new test files. All 29 failures are in existing test suites that need production code fixes (FR-001, FR-002) and one test data update (FR-003).
- **TDD Flow**: Verify RED state (29 failures confirmed), apply fixes, verify GREEN state (0 failures, no regressions).
- **New Test Types Needed**: None. The existing test suites already exercise the correct scenarios -- they just fail due to production bugs.
- **Coverage Target**: All 29 previously failing tests pass. Zero new regressions. Total test count >= 555 baseline.

---

## Test Pyramid

### Unit Tests (Existing)

- `lib/utils/fs-helpers.test.js`: Default export count assertion (FR-003)
  - **Current state**: Expects 19 exports, actual is 20 (missing `symlink`)
  - **Fix**: Update expected list to include `symlink` (test data fix, not production code)

### Integration Tests (Existing)

- `lib/installer.test.js`: Subprocess tests for `isdlc init --force` (FR-001)
  - 2 failing suites: "reinstall on already installed directory" and "BACKLOG.md skip-if-exists guard"
  - Both fail because `init --force` on a pre-installed directory crashes with EEXIST
  - **Fix**: Production code fix in `lib/installer.js` (lstat+remove pattern)

- `lib/updater.test.js`: Subprocess tests for `isdlc update --force` (FR-002)
  - 8 failing suites: every suite that calls `runUpdate()` after `runInit()`
  - All fail with EEXIST when updater encounters pre-existing `.antigravity/` symlinks
  - **Fix**: Production code fix in `lib/updater.js` (same lstat+remove pattern)

### E2E Tests

- Not applicable for this bug fix. The subprocess-based integration tests already serve as end-to-end validation since they invoke the full CLI pipeline.

---

## Test Approach by Requirement

### FR-001: Idempotent Symlink Creation in Installer

**Strategy**: The existing `lib/installer.test.js` test suite at line 281 ("reinstall on already installed directory succeeds") already tests the exact scenario -- running `init --force` twice on the same directory. This test is currently RED because the production code has the `exists()` bug. Once the `lstat()+remove()` fix is applied to `lib/installer.js`, this test will go GREEN without any test code changes.

**Test scenarios covered by existing tests:**
1. Fresh install creates symlinks normally (already passing)
2. Reinstall on pre-installed directory succeeds (currently FAILING -- will pass after fix)
3. BACKLOG.md skip-if-exists guard runs `init --force` on pre-installed dir (currently FAILING -- will pass after fix)

### FR-002: Idempotent Symlink Creation in Updater

**Strategy**: The existing `lib/updater.test.js` test suites all follow the pattern `runInit()` then `runUpdate()`, which is exactly the scenario that triggers EEXIST. These 8 suites with 24 affected tests are currently RED. Once the `lstat()+remove()` fix is applied to `lib/updater.js`, all will go GREEN without test code changes.

**Test scenarios covered by existing tests:**
1. Install then update succeeds (currently FAILING)
2. Update preserves state.json project data (currently FAILING)
3. Update preserves settings.json user keys (currently FAILING)
4. Dry-run update makes no changes (currently FAILING -- runInit in before() triggers EEXIST even though the dry-run part is fine)
5. Update creates history entry (currently FAILING)
6. Update regenerates installed-files.json (currently FAILING)
7. Update with --backup creates backup (currently FAILING)
8. Update preserves CLAUDE.md (currently FAILING)
9. Update warns when Issue Tracker section missing (currently FAILING)

### FR-003: Export Count Alignment

**Strategy**: The existing `lib/utils/fs-helpers.test.js` test at line 442 needs its `expectedFunctions` array updated to include `'symlink'`. This is a test data fix -- the count assertion uses `expectedFunctions.length` dynamically, so adding the entry is sufficient.

---

## Flaky Test Mitigation

### Risk Assessment

The tests in this bug fix have LOW flakiness risk because:
1. They are deterministic filesystem operations (no network, no timing)
2. Each test suite uses isolated temp directories
3. The EEXIST error is 100% reproducible -- it fails every time, not intermittently

### Mitigation for Symlink Tests

- Temp directory isolation ensures no cross-test contamination
- The `before()`/`after()` hooks handle setup and cleanup
- The lstat+remove fix is atomic per symlink -- no race conditions possible

### Monitoring

- Run the full test suite (`node --test lib/**/*.test.js`) after fix to confirm zero flakiness
- If any test passes inconsistently, investigate temp directory cleanup order

---

## Performance Test Plan

### Not Applicable

This bug fix does not introduce performance-sensitive changes. The `lstat()+remove()` pattern adds at most one additional filesystem syscall per symlink (4 symlinks total). The overhead is negligible (microseconds) compared to the subprocess spawn overhead in tests.

### Regression Performance

- Existing test suite execution time should not change measurably
- The production code change (lstat+remove vs exists check) may add ~1ms total to a full install/update cycle

---

## Test Execution Commands (existing infrastructure)

```bash
# Run all affected test files individually
node --test lib/installer.test.js
node --test lib/updater.test.js
node --test lib/utils/fs-helpers.test.js

# Run all lib tests (glob pattern)
node --test 'lib/**/*.test.js'

# Run full suite (includes hook tests)
npm test
```

---

## TDD Verification Protocol

### Step 1: RED Confirmation
Before any code changes, run the three affected test files and confirm exactly 29 failures:
- `lib/installer.test.js`: 4 failures (2 suites x cascading cancellations)
- `lib/updater.test.js`: 24 failures (8 suites x cascading cancellations)
- `lib/utils/fs-helpers.test.js`: 1 failure (export count)

### Step 2: Apply Fixes
1. Fix `lib/installer.js` line 445: replace `exists()` with `lstat()+remove()` pattern
2. Fix `lib/updater.js` line 565: same lstat+remove pattern
3. Fix `lib/utils/fs-helpers.test.js` line 443: add `'symlink'` to `expectedFunctions`

### Step 3: GREEN Confirmation
Run the three affected test files and confirm 0 failures:
- All 29 previously failing tests now pass
- No new failures introduced

### Step 4: Regression Check
Run the full test suite (`npm test`) and confirm:
- Total test count >= 555 baseline
- Zero regressions in unrelated tests

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fix introduces new symlink bugs | Low | High | Existing test coverage exercises fresh install, reinstall, and update paths |
| lstat() behaves differently on Windows | Low | Medium | Article XII cross-platform check; lstat is POSIX-standard and available on all Node.js platforms |
| Other tests depend on the buggy exists() behavior | Very Low | Medium | Grep for `exists(linkPath)` patterns in other test files to confirm no dependencies |
| Export count changes again in future | Low | Low | The test uses dynamic length comparison, so adding functions only requires array update |

---

## Acceptance Criteria Mapping

| AC | Requirement | Verified By | Status |
|----|------------|-------------|--------|
| AC-001 | Existing symlink replaced without EEXIST | installer.test.js line 281 | RED (will be GREEN) |
| AC-002 | Broken symlink removed and recreated | installer.test.js line 281 (temp dir creates broken symlinks) | RED (will be GREEN) |
| AC-003 | Clean path creates symlink normally | installer.test.js (fresh install suites) | PASSING |
| AC-004 | Same as AC-001/002/003 for updater | updater.test.js lines 125-397 | RED (will be GREEN) |
| AC-005 | Export count matches actual (20) | fs-helpers.test.js line 442 | RED (will be GREEN) |
| AC-006 | All 29 failing tests pass | All three test files | RED (will be GREEN) |
| AC-007 | No new regressions | Full test suite run | PASSING (verified post-fix) |
| AC-008 | Symlink creation is idempotent | installer.test.js reinstall, updater.test.js update cycles | RED (will be GREEN) |
