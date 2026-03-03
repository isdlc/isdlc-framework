# Bug Report: BUG-0053 — Antigravity Bridge Test Failures

**Bug ID:** BUG-0053-antigravity-bridge-test-failures
**External Link:** None (internal regression)
**External ID:** MAN
**Severity:** High
**Date Reported:** 2026-03-03

---

## Summary

29 pre-existing test failures across three test files caused by the Antigravity bridge feature (REQ-0032) introducing `.antigravity/` symlink creation without graceful handling of existing symlinks, and a hardcoded export count in `fs-helpers.test.js` that does not account for the newly added `symlink` export.

---

## Expected Behavior

1. Running `isdlc init --force` on an already-installed project should succeed without errors, gracefully handling pre-existing `.antigravity/` symlinks.
2. Running `isdlc update` on an already-installed project should succeed without errors, gracefully handling pre-existing `.antigravity/` symlinks.
3. The `fs-helpers.test.js` default export count assertion should match the actual number of exported functions (20, including `symlink`).

## Actual Behavior

1. **Installer (4 failures):** `isdlc init --force` crashes with `EEXIST: file already exists, symlink '../src/claude/agents' -> '.../.antigravity/agents'` when `.antigravity/` symlinks already exist from a previous installation.
2. **Updater (24 failures):** `isdlc update` crashes with the same `EEXIST` error when `.antigravity/` symlinks already exist.
3. **fs-helpers (1 failure):** The default export test asserts exactly 19 functions but the actual count is 20 (the `symlink` function was added to the default export by REQ-0032 but the test was not updated).

## Reproduction Steps

1. Clone the repository and run `npm install`.
2. Run `node --test lib/installer.test.js` -- observe 4 failures with EEXIST errors in tests that run `init --force` on pre-installed directories.
3. Run `node --test lib/updater.test.js` -- observe 24 failures with EEXIST errors in tests that run updates on pre-installed directories.
4. Run `node --test lib/utils/fs-helpers.test.js` -- observe 1 failure: "Default export should have exactly 19 keys" (actual: 20).

## Root Cause Analysis

### Root Cause 1: EEXIST on Symlink Recreation

Both `lib/installer.js` (line ~445) and `lib/updater.js` (line ~565) use `exists(linkPath)` to check if a symlink already exists before calling `symlink(target, linkPath)`. However, `exists()` delegates to `fs.pathExists()` which returns `false` for **broken symlinks** (symlinks whose target does not resolve). In test environments where temp directories are used, the relative symlink targets (e.g., `../src/claude/agents`) do not resolve, so `exists()` returns `false` even though the symlink file itself exists on disk. The subsequent `symlink()` call then fails with `EEXIST` because the symlink file-entry already exists.

The fix requires using `fs.lstat()` (which checks the symlink itself, not its target) instead of `fs.pathExists()`, or removing the existing symlink before recreating it.

### Root Cause 2: Hardcoded Export Count

`lib/utils/fs-helpers.test.js` line 475 asserts `Object.keys(defaultExport).length === 19`. When the `symlink` function was added to the default export object in `fs-helpers.js` (as part of REQ-0032), the test was not updated to expect 20 exports.

## Environment

- Node.js: 24.x
- OS: macOS (Darwin 25.2.0)
- Framework version: 0.1.0-alpha

## Files Affected

| File | Role | Issue |
|------|------|-------|
| `lib/installer.js` | Production | EEXIST when recreating `.antigravity/` symlinks |
| `lib/updater.js` | Production | EEXIST when recreating `.antigravity/` symlinks |
| `lib/utils/fs-helpers.js` | Production | Contains the `symlink` function (no code bug here) |
| `lib/installer.test.js` | Test | 4 failures due to EEXIST |
| `lib/updater.test.js` | Test | 24 failures due to EEXIST |
| `lib/utils/fs-helpers.test.js` | Test | 1 failure due to hardcoded export count |
