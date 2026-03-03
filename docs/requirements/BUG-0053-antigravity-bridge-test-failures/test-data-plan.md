# Test Data Plan: BUG-0053 — Antigravity Bridge Test Failures

**Bug ID:** BUG-0053-antigravity-bridge-test-failures
**Phase:** 05-test-strategy
**Created:** 2026-03-03

---

## Overview

This bug fix operates on **existing test infrastructure** that already has well-defined test data. The tests use temp directories with real filesystem operations (subprocess-based). No new test data factories need to be created -- the existing setup functions (`setupProjectDir`, `runInit`, `runUpdate`) provide all necessary test data.

---

## Existing Test Data (No Changes Required)

### Installer Test Data

| Data Element | Source | Description |
|--------------|--------|-------------|
| Temp project directory | `setupProjectDir(name)` | Creates temp dir with `package.json` + `git init` |
| First install state | `runInit(projectDir)` | Full `isdlc init --force` output, creates `.isdlc/`, `.claude/`, `.antigravity/` |
| Pre-existing BACKLOG.md | `writeFileSync(...)` | Custom content written before init for skip-if-exists tests |

### Updater Test Data

| Data Element | Source | Description |
|--------------|--------|-------------|
| Installed project | `runInit(projectDir)` | Project with full installation (state.json, settings.json, manifests) |
| Custom settings key | `writeFileSync(...)` | `myUserKey: 'should-survive-update'` injected into settings.json |
| Modified CLAUDE.md | `content.replace(...)` | Tracker changed to jira, Jira Project Key set |
| Stripped CLAUDE.md | `content.replace(regex)` | Issue Tracker Configuration section removed |

### fs-helpers Test Data

| Data Element | Source | Description |
|--------------|--------|-------------|
| Default export object | `import defaultExport from ...` | The actual fs-helpers module default export |
| Expected functions array | Hardcoded in test | Array of 19 function names (needs `'symlink'` added) |

---

## Boundary Values

### Symlink States (FR-001, FR-002)

The lstat+remove pattern must handle these filesystem states correctly:

| State | `lstat()` Result | Action | Expected Outcome |
|-------|-----------------|--------|-----------------|
| No symlink exists | Throws ENOENT | Skip remove, create symlink | Symlink created |
| Valid symlink (target resolves) | Returns stats | Remove, recreate | Symlink replaced |
| Broken symlink (target does not resolve) | Returns stats (lstat does NOT follow) | Remove, recreate | Symlink replaced |
| Regular file at path | Returns stats (isSymbolicLink=false) | Remove, recreate | File replaced with symlink |
| Directory at path | Returns stats (isDirectory=true) | Remove, recreate | Directory replaced with symlink |

**Critical boundary**: The broken symlink case is the PRIMARY failure scenario. `lstat()` returns stats for the symlink entry itself (unlike `stat()`/`pathExists()` which follow the symlink to its target and throw ENOENT when the target is missing).

### Export Count (FR-003)

| Value | Description | Expected |
|-------|-------------|----------|
| 19 (current) | Missing `symlink` | FAIL (20 !== 19) |
| 20 (fixed) | Includes `symlink` | PASS (20 === 20) |
| 21+ (future) | If another export added without test update | FAIL (future regression caught) |

---

## Invalid Inputs

### Symlink Creation Edge Cases

These cases are NOT tested by the existing test suite (out of scope for this bug fix) but are documented for completeness:

| Invalid Input | Current Behavior | Risk |
|---------------|-----------------|------|
| `linkPath` is `null`/`undefined` | TypeError from fs.lstat | Low -- linkMap is hardcoded |
| `target` is empty string | fs.symlink creates invalid symlink | Low -- linkMap is hardcoded |
| `antigravityTarget` directory doesn't exist | `ensureDir()` creates it first | None -- already handled |
| Filesystem is read-only | fs.symlink throws EROFS | Low -- test temp dirs are writable |
| Symlink path exceeds OS limit | fs.symlink throws ENAMETOOLONG | Very Low -- paths are short |

### Export Count Edge Cases

| Invalid Input | Current Behavior | Risk |
|---------------|-----------------|------|
| Export removed from fs-helpers.js | Count decreases, assertion fails | Good -- catches regressions |
| Export renamed | Old name check fails | Good -- catches API changes |
| Non-function exported | `typeof` check fails | Good -- catches type errors |

---

## Maximum-Size Inputs

### Not Applicable

The symlink operations involve fixed-size data:
- Link names: 6-8 characters (`agents`, `skills`, `hooks`, `commands`)
- Target paths: ~25 characters (`../src/claude/agents`)
- Export count: 20 (trivially small)

There are no variable-size inputs that could trigger performance or memory issues. The test data is deterministic and small.

---

## Test Data Lifecycle

### Setup Phase
1. `createTempDir()` creates isolated temp directory under OS temp path
2. `setupProjectDir(name)` creates project structure with `package.json` + `git init`
3. `runInit(projectDir)` runs full installation (creates all framework files including `.antigravity/` symlinks)

### Exercise Phase
4. For reinstall tests: `runInit(projectDir)` again (second call)
5. For update tests: `runUpdate(projectDir)` or `runUpdate(projectDir, flags)`

### Cleanup Phase
6. `cleanupTempDir(join(projectDir, '..'))` removes the entire temp directory tree

### Data Isolation Guarantee
- Each `describe()` block creates its own temp directory via `before()` hook
- Each `after()` hook cleans up its temp directory
- No shared state between test suites
- Temp directory names are unique (UUID-based via `createTempDir()`)
