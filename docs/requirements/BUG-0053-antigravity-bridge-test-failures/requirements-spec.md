# Requirements Specification: BUG-0053 — Antigravity Bridge Test Failures

**Bug ID:** BUG-0053-antigravity-bridge-test-failures
**Phase:** 01-requirements
**Scope:** bug-report (fix workflow)
**Created:** 2026-03-03

---

## Context

The Antigravity bridge feature (REQ-0032) added `.antigravity/` symlink creation to both the installer (`lib/installer.js`) and updater (`lib/updater.js`). This introduced 29 test failures:
- 4 in `lib/installer.test.js`
- 24 in `lib/updater.test.js`
- 1 in `lib/utils/fs-helpers.test.js`

The root cause is twofold: (1) `exists()` returns `false` for broken symlinks, causing `EEXIST` errors when the symlink file-entry already exists but its target does not resolve, and (2) a hardcoded export count in the fs-helpers test was not updated when the `symlink` function was added.

---

## Fix Requirements

### FR-001: Graceful Symlink Handling in Installer

The installer's `.antigravity/` symlink creation logic MUST handle pre-existing symlinks gracefully. When a symlink already exists at the target path (whether valid or broken), the installer MUST NOT throw an `EEXIST` error.

**Acceptance Criteria:**

- **AC-001-01:** Given a project directory where `.antigravity/` symlinks already exist (from a prior installation), when `isdlc init --force` is executed, then the installation completes successfully without EEXIST errors.
- **AC-001-02:** Given a project directory where `.antigravity/` contains broken symlinks (targets do not resolve), when `isdlc init --force` is executed, then the broken symlinks are replaced with correct symlinks and installation completes successfully.
- **AC-001-03:** Given a project directory with no prior `.antigravity/` directory, when `isdlc init` is executed, then the `.antigravity/` symlinks are created as before (no regression in fresh install behavior).

### FR-002: Graceful Symlink Handling in Updater

The updater's `.antigravity/` symlink sync logic MUST handle pre-existing symlinks gracefully, using the same approach as FR-001.

**Acceptance Criteria:**

- **AC-002-01:** Given a project directory where `.antigravity/` symlinks already exist, when `isdlc update` is executed, then the update completes successfully without EEXIST errors.
- **AC-002-02:** Given a project directory where `.antigravity/` contains broken symlinks, when `isdlc update` is executed, then the broken symlinks are replaced with correct symlinks and the update completes successfully.
- **AC-002-03:** Given a project directory with no prior `.antigravity/` directory, when `isdlc update` is executed, then the `.antigravity/` symlinks are created as before (no regression in fresh update behavior).

### FR-003: Correct Export Count in fs-helpers Test

The `fs-helpers.test.js` default export assertion MUST reflect the actual number of exported functions, including the `symlink` function added by REQ-0032.

**Acceptance Criteria:**

- **AC-003-01:** Given the `fs-helpers.js` module exports 20 named functions (including `symlink`), when the default export test runs, then it asserts exactly 20 keys and the `symlink` function is included in the expected function list.

---

## Constraints

- **CON-001:** The fix MUST NOT change the public API of `fs-helpers.js` (the `symlink` export stays).
- **CON-002:** The fix MUST use `fs.lstat()` or equivalent to detect symlinks (not `fs.pathExists()` which follows symlinks and returns false for broken ones), OR remove-then-recreate the symlink unconditionally.
- **CON-003:** The fix MUST be cross-platform compatible per Article XII of the constitution.

## Assumptions

- **ASM-001:** The `symlink` function in `fs-helpers.js` is intentional and permanent (added by REQ-0032).
- **ASM-002:** The 29 test failures are all caused by the same two root causes described above (no additional hidden failures).

## Out of Scope

- Refactoring the Antigravity bridge architecture
- Adding new Antigravity bridge features
- Changing how symlink targets are resolved (relative vs absolute paths)

---

## Traceability

| Requirement | Origin | Test File(s) |
|-------------|--------|--------------|
| FR-001 | BUG-0053 (EEXIST in installer) | `lib/installer.test.js` |
| FR-002 | BUG-0053 (EEXIST in updater) | `lib/updater.test.js` |
| FR-003 | BUG-0053 (export count mismatch) | `lib/utils/fs-helpers.test.js` |
