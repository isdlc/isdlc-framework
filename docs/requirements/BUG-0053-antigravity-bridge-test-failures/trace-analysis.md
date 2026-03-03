# Trace Analysis: Antigravity Bridge Test Failures

**Generated**: 2026-03-03T21:10:00.000Z
**Bug**: BUG-0053 -- 29 pre-existing test failures across 3 test files caused by Antigravity bridge (REQ-0032)
**External ID**: None (internal regression)
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

The Antigravity bridge feature (REQ-0032) introduced `.antigravity/` symlink creation to both the installer and updater without handling the case where symlinks already exist on disk. The `exists()` helper delegates to `fs.pathExists()`, which follows symlinks and returns `false` for broken ones. In test environments using temp directories, symlink targets (relative paths like `../src/claude/agents`) do not resolve, so `exists()` returns `false` even though the symlink filesystem entry exists. The subsequent `fs.symlink()` call throws `EEXIST`. Additionally, the `fs-helpers.test.js` hardcoded export count (19) was not updated when the `symlink` function was added to the default export (actual: 20). All 29 failures trace to these two root causes with high confidence.

**Root Cause Confidence**: high
**Severity**: high
**Estimated Complexity**: low

---

## Symptom Analysis

### Error Messages

1. **EEXIST error** (28 test failures):
   ```
   EEXIST: file already exists, symlink '../src/claude/agents' -> '.../.antigravity/agents'
   ```
   This error appears in the stdout of failed subprocess calls. The error originates from Node.js `fs.symlink()` when the link path already exists.

2. **Export count assertion** (1 test failure):
   ```
   AssertionError [ERR_ASSERTION]: Default export should have exactly 19 keys
   20 !== 19
   ```
   At `lib/utils/fs-helpers.test.js:473`.

### Symptom Classification

| Symptom | Category | Count | Severity |
|---------|----------|-------|----------|
| EEXIST on symlink recreation | Runtime crash | 28 | High |
| Export count mismatch (19 vs 20) | Assertion failure | 1 | Low |

### Reproduction Verified

All failures are deterministically reproducible:
- `node --test lib/installer.test.js` -- 1 test suite failure at line 281 ("reinstall on already installed directory succeeds"), causing 2 child test cancellations. Additionally, line 651 ("emits skip message when BACKLOG.md already exists") fails because it runs `init --force` on a directory that already had init run (from TC-12 setup).
- `node --test lib/updater.test.js` -- 7 test suite failures causing 17 child test cancellations. Every suite that calls `runUpdate()` on a previously-initialized directory fails.
- `node --test lib/utils/fs-helpers.test.js` -- 1 test failure at line 442.

### Failure Cascade Pattern

The EEXIST error is an unhandled exception that crashes the subprocess (exit code 1). When a `before()` hook calls `runInit()` or `runUpdate()` and the subprocess crashes, the suite's child `it()` tests are cancelled ("test did not finish before its parent and was cancelled"). This is why the raw failure count (1 fail + 2 cancelled in installer, 0 fail + 17 cancelled in updater) appears different from the reported 29 -- the cancelled tests are caused by parent suite failures.

**Actual distinct failure points**: 5 (installer: 2 suites, updater: 5 suites, fs-helpers: 1 test)

### Triggering Conditions

The EEXIST error only occurs when:
1. `init --force` or `update --force` is run on a directory that already has `.antigravity/` symlinks from a prior run
2. The symlink targets do not resolve (broken symlinks in temp dirs)
3. `exists(linkPath)` returns `false` for the broken symlink, passing the guard check
4. `symlink(target, linkPath)` then fails because the symlink filesystem entry still exists

---

## Execution Path

### Path 1: Installer EEXIST (lib/installer.js lines 431-449)

```
Test: "reinstall on already installed directory succeeds" (line 281)
  |
  +-> before() hook (line 284-289)
  |     |
  |     +-> setupProjectDir('reinstall-test')    -- creates temp dir with package.json + git init
  |     +-> runInit(projectDir)                  -- FIRST install succeeds
  |     |     |
  |     |     +-> installer.js install()
  |     |     +-> line 434: ensureDir(antigravityTarget)     -- creates .antigravity/
  |     |     +-> line 445: exists(linkPath)                 -- returns false (no symlink yet)
  |     |     +-> line 446: symlink(target, linkPath)        -- creates symlinks OK
  |     |     +-> SUCCEEDS: .antigravity/agents -> ../src/claude/agents (etc.)
  |     |
  |     +-> runInit(projectDir)                  -- SECOND install (reinstall) FAILS
  |           |
  |           +-> installer.js install()
  |           +-> line 434: ensureDir(antigravityTarget)     -- .antigravity/ already exists, OK
  |           +-> line 445: exists(linkPath)                 -- .antigravity/agents symlink exists
  |           |     |                                            but target ../src/claude/agents
  |           |     |                                            does NOT resolve from temp dir
  |           |     +-> fs.pathExists(linkPath)               -- follows symlink, target gone
  |           |     +-> returns FALSE                         -- BUG: filesystem entry exists but
  |           |                                                   pathExists returns false
  |           +-> line 446: symlink(target, linkPath)        -- symlink file-entry exists on disk
  |                 |
  |                 +-> fs.symlink(target, linkPath)          -- THROWS EEXIST
  |                 +-> CRASH: process exits with code 1
```

### Path 2: Updater EEXIST (lib/updater.js lines 552-569)

```
Test: "install --force then update --force succeeds" (line 125)
  |
  +-> before() hook (line 129-133)
  |     |
  |     +-> setupProjectDir('update-cycle')
  |     +-> runInit(projectDir)                  -- initial install creates .antigravity/ symlinks
  |     +-> runUpdate(projectDir)                -- update FAILS
  |           |
  |           +-> updater.js update()
  |           +-> line 554: ensureDir(antigravityTarget)     -- .antigravity/ already exists, OK
  |           +-> line 565: exists(linkPath)                 -- broken symlink exists
  |           |     +-> fs.pathExists(linkPath)               -- returns FALSE (target unresolvable)
  |           +-> line 566: symlink(target, linkPath)        -- THROWS EEXIST
  |                 +-> CRASH
```

### Path 3: Export Count (lib/utils/fs-helpers.test.js line 442)

```
Test: "should export an object containing all 19 functions" (line 442)
  |
  +-> expectedFunctions array = 19 entries (does NOT include 'symlink')
  +-> line 473: assert.equal(Object.keys(defaultExport).length, expectedFunctions.length)
  |     |
  |     +-> Object.keys(defaultExport).length = 20 (includes 'symlink' added by REQ-0032)
  |     +-> expectedFunctions.length = 19
  |     +-> 20 !== 19 -> ASSERTION FAILURE
```

### Data Flow Analysis

The critical data flow is:

```
exists(linkPath) -> fs.pathExists(linkPath) -> fs.stat(linkPath)
                                                     |
                                                follows symlink
                                                     |
                                            target doesn't exist
                                                     |
                                              throws ENOENT
                                                     |
                                            pathExists returns false
```

The correct check would use `fs.lstat(linkPath)` which checks the symlink entry itself (not its target):

```
lstat(linkPath) -> checks symlink filesystem entry -> exists on disk -> returns stats
```

### Affected Test Suites (Complete List)

**Installer (lib/installer.test.js)**:
- Line 281: "reinstall on already installed directory succeeds" -- `before()` runs `runInit()` twice, second fails
- Line 631: "BACKLOG.md skip-if-exists guard" -- TC-13 at line 651 runs `runInit()` on pre-installed dir

**Updater (lib/updater.test.js)** -- every suite that calls `runUpdate()` after `runInit()`:
- Line 125: "install --force then update --force succeeds"
- Line 150: "update --force preserves state.json project data"
- Line 182: "update --force preserves settings.json user keys"
- Line 244: "update --force creates history entry"
- Line 269: "update --force regenerates installed-files.json"
- Line 300: "update --backup --force creates backup"
- Line 333: "update --force preserves CLAUDE.md (not overwritten)"
- Line 372: "update --force warns when Issue Tracker section is missing"

**fs-helpers (lib/utils/fs-helpers.test.js)**:
- Line 442: "should export an object containing all 19 functions"

---

## Root Cause Analysis

### Hypothesis 1: exists() uses pathExists which follows symlinks (CONFIRMED -- HIGH CONFIDENCE)

**Evidence**:
1. `lib/utils/fs-helpers.js` line 39: `exists()` delegates to `fs.pathExists()` which follows symlinks
2. `lib/installer.js` line 445: `if (!(await exists(linkPath)))` -- guard check uses `exists()`
3. `lib/updater.js` line 565: identical pattern `if (!(await exists(linkPath)))`
4. Error output confirms `EEXIST: file already exists, symlink '../src/claude/agents'` -- the first symlink in the linkMap is the one that triggers the crash
5. First install succeeds (no pre-existing symlinks), second fails (symlinks exist but targets unresolvable in temp dir)
6. The `fs.pathExists()` function is documented in fs-extra to resolve symlinks: "Tests whether or not the given path exists by checking with the file system. Like `fs.exists` but follows symlinks."

**Root Cause**: The guard `if (!(await exists(linkPath)))` returns `false` for broken symlinks (where the target path does not resolve), causing the subsequent `symlink()` call to encounter the existing filesystem entry and throw `EEXIST`.

**Affected Files**:
- `lib/installer.js` line 445
- `lib/updater.js` line 565

**Suggested Fix**: Replace the `exists()` check with a try/remove/recreate pattern:
```javascript
for (const [name, target] of Object.entries(linkMap)) {
  const linkPath = path.join(antigravityTarget, name);
  try {
    await fs.lstat(linkPath);
    await remove(linkPath);  // Remove existing (valid or broken) symlink
  } catch {
    // Does not exist, no action needed
  }
  await symlink(target, linkPath);
}
```

Alternatively, use `fs.lstat()` to check and only recreate if the target has changed.

### Hypothesis 2: Hardcoded export count not updated (CONFIRMED -- HIGH CONFIDENCE)

**Evidence**:
1. `lib/utils/fs-helpers.js` lines 264-285: default export object has 20 keys (includes `symlink` at line 282)
2. `lib/utils/fs-helpers.test.js` line 443-463: `expectedFunctions` array has 19 entries, does NOT include `'symlink'`
3. Test output confirms: `20 !== 19`
4. The `symlink` function was added by REQ-0032 but the test was not updated

**Root Cause**: The `expectedFunctions` array in the test does not include `'symlink'`, and the count assertion at line 473 expects 19 keys but finds 20.

**Affected Files**:
- `lib/utils/fs-helpers.test.js` lines 443 and 473

**Suggested Fix**:
1. Add `'symlink'` to the `expectedFunctions` array (line 443)
2. The count assertion at line 473 uses `expectedFunctions.length` dynamically, so it will automatically become 20 once `'symlink'` is added

### No Additional Hidden Root Causes

Both root causes fully explain all 29 test failures. There are no unexplained failures or intermittent issues.

---

## Suggested Fixes

### Fix 1: Idempotent Symlink Creation (FR-001, FR-002)

**Files**: `lib/installer.js` (lines 443-449), `lib/updater.js` (lines 563-569)

**Approach**: Replace `exists()` check with `lstat()` + `remove()` pattern:

```javascript
// Before (buggy):
if (!(await exists(linkPath))) {
  await symlink(target, linkPath);
}

// After (idempotent):
try {
  await fs.lstat(linkPath);
  await remove(linkPath);
} catch { /* does not exist */ }
await symlink(target, linkPath);
```

**Complexity**: Low -- identical change in two files, 4 lines each.

### Fix 2: Export Count Update (FR-003)

**File**: `lib/utils/fs-helpers.test.js` (line 443)

**Approach**: Add `'symlink'` to the `expectedFunctions` array.

**Complexity**: Trivial -- add one string to an array.

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-03-03T21:10:00.000Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "error_keywords": ["EEXIST", "symlink", "pathExists", "exists", "antigravity", "export count"],
  "files_analyzed": [
    "lib/installer.js",
    "lib/updater.js",
    "lib/utils/fs-helpers.js",
    "lib/installer.test.js",
    "lib/updater.test.js",
    "lib/utils/fs-helpers.test.js"
  ],
  "root_causes_confirmed": 2,
  "hypotheses_generated": 2,
  "hypotheses_confirmed": 2,
  "actual_failure_counts": {
    "installer.test.js": { "suites_failing": 2, "tests_affected": 3 },
    "updater.test.js": { "suites_failing": 8, "tests_affected": 17 },
    "fs-helpers.test.js": { "tests_failing": 1 }
  }
}
```
