# Implementation Notes: BUG-0053 -- Antigravity Bridge Test Failures

**Bug ID:** BUG-0053-antigravity-bridge-test-failures
**Phase:** 06-implementation
**Date:** 2026-03-03

---

## Summary

Fixed 29 pre-existing test failures caused by the Antigravity bridge feature (REQ-0032) introducing non-idempotent symlink creation in the installer and updater, plus an export count mismatch in the fs-helpers test.

## Changes Made

### Fix 1: lib/installer.js (FR-001)

**Root cause:** Line 445 used `exists(linkPath)` to guard symlink creation. `exists()` wraps `fs.pathExists()` which follows symlinks -- for broken symlinks (target does not resolve), it returns `false` even though the symlink file-entry exists on disk. Calling `symlink()` then throws `EEXIST`.

**Fix:** Replaced the `exists()` guard with an `lstat()` + `remove()` pattern. `lstat()` does NOT follow symlinks -- it detects any filesystem entry including broken symlinks. If an entry exists, it is removed before recreating the symlink. If no entry exists, `lstat()` throws and the catch block allows the subsequent `symlink()` call to proceed.

**Import added:** `import { lstat } from 'node:fs/promises';`

**Lines changed:** 8-9, 444-450

### Fix 2: lib/updater.js (FR-002)

**Root cause:** Identical to Fix 1 -- same `exists(linkPath)` guard pattern at line 565.

**Fix:** Same `lstat()` + `remove()` pattern as Fix 1.

**Import added:** `import { lstat } from 'node:fs/promises';`

**Lines changed:** 12, 564-570

### Fix 3: lib/utils/fs-helpers.test.js (FR-003)

**Root cause:** The `symlink` function was added to `fs-helpers.js` by REQ-0032 but the test's `expectedFunctions` array and count assertion were not updated. The test expected 19 functions but there are now 20.

**Fix:** Added `'symlink'` to the `expectedFunctions` array and updated the test description from "all 19 functions" to "all 20 functions".

**Lines changed:** 442-463

## Traceability

| Requirement | File Changed | Lines | Acceptance Criteria |
|-------------|-------------|-------|---------------------|
| FR-001 | lib/installer.js | 8-9, 444-450 | AC-001-01, AC-001-02, AC-001-03 |
| FR-002 | lib/updater.js | 12, 564-570 | AC-002-01, AC-002-02, AC-002-03 |
| FR-003 | lib/utils/fs-helpers.test.js | 442-463 | AC-003-01 |

## Test Results

- **lib/installer.test.js:** 73 pass, 0 fail
- **lib/updater.test.js:** 24 pass, 0 fail
- **lib/utils/fs-helpers.test.js:** 33 pass, 0 fail
- **Total target tests:** 130 pass, 0 fail
- **Full suite delta:** 831 pass -> 852 pass (21 additional tests passing)
- **Pre-existing failures (unrelated):** 9 tests in other files (unchanged by this fix)

## Design Decisions

1. **Used `node:fs/promises.lstat` instead of adding `lstat` to fs-helpers.js** -- Minimal change approach. Adding a new export to fs-helpers would change its public API and require updating the export count again. Using Node's native `lstat` directly keeps the change surgical.

2. **Remove-then-recreate pattern** -- Always removes and recreates the symlink rather than checking if it points to the correct target. This is simpler and handles all edge cases (broken symlinks, symlinks pointing to wrong targets, regular files at the path).

3. **Preserved log messages** -- The `logger.success()` calls now run on every invocation, not just on first creation. This provides visibility that symlinks were refreshed during reinstall/update.
