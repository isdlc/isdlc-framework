# Test Cases: Installer Symlink Handling (FR-001)

**Requirement:** FR-001 — Graceful Symlink Handling in Installer
**Test File:** `lib/installer.test.js`
**Test Type:** Integration (subprocess)
**Fix Type:** Production code fix (no test code changes needed)

---

## TC-INS-001: Reinstall on already installed directory succeeds

**Requirement ID:** FR-001
**Acceptance Criteria:** AC-001-01, AC-001-02, AC-008
**Test Type:** positive
**Priority:** P0 (Critical)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project directory that has been initialized with `isdlc init --force` (`.antigravity/` symlinks exist but targets do not resolve in the temp directory context, making them broken symlinks)
**When:** `isdlc init --force` is run a second time on the same directory
**Then:** The installation completes without EEXIST errors, and the `.isdlc/state.json` file still exists

**Existing Test Location:** `lib/installer.test.js` line 281
**Test Code Reference:**
```javascript
describe('installer: reinstall on already installed directory succeeds', () => {
  before(() => {
    projectDir = setupProjectDir('reinstall-test');
    runInit(projectDir);    // First install
    runInit(projectDir);    // Second install (reinstall) -- currently fails with EEXIST
  });
  it('succeeds without error and state.json still exists', () => { ... });
  it('installed-files.json is regenerated', () => { ... });
});
```

**Why It Fails:** The `before()` hook calls `runInit()` twice. The second call encounters pre-existing `.antigravity/` symlinks from the first call. `exists(linkPath)` returns `false` for these broken symlinks, so the code attempts `symlink()` which throws EEXIST. The subprocess crashes, and both child `it()` tests fail.

**What Makes It Pass:** Replace `exists()` check in `lib/installer.js` line 445 with `lstat()+remove()` pattern. No test code changes needed.

---

## TC-INS-002: Installed-files.json regenerated after reinstall

**Requirement ID:** FR-001
**Acceptance Criteria:** AC-001-01, AC-008
**Test Type:** positive
**Priority:** P1 (High)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** Same as TC-INS-001 (reinstall scenario)
**When:** The reinstall completes successfully
**Then:** `installed-files.json` exists in `.isdlc/`

**Existing Test Location:** `lib/installer.test.js` line 298
**Cascading Failure:** This test is cancelled because the `before()` hook (TC-INS-001) crashes. Once TC-INS-001 passes, this test will also pass.

---

## TC-INS-003: BACKLOG.md skip-if-exists — does not overwrite

**Requirement ID:** FR-001
**Acceptance Criteria:** AC-001-01
**Test Type:** positive
**Priority:** P1 (High)
**Status:** PASSING (this specific `it()` runs before the second init call)

**Existing Test Location:** `lib/installer.test.js` line 644
**Note:** This test is in a different suite ("BACKLOG.md skip-if-exists guard") where TC-12 runs `runInit()` once. It currently passes because the first init works fine.

---

## TC-INS-004: BACKLOG.md skip-if-exists — emits skip message

**Requirement ID:** FR-001
**Acceptance Criteria:** AC-001-01, AC-001-02
**Test Type:** positive
**Priority:** P1 (High)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project directory with a pre-existing `BACKLOG.md`
**When:** `isdlc init --force` is run (note: this is the second init run -- the first was at line 645)
**Then:** The output includes a message indicating BACKLOG.md creation was skipped

**Existing Test Location:** `lib/installer.test.js` line 651
**Why It Fails:** TC-13 at line 651 calls `runInit(projectDir)` where the project dir was already initialized by TC-12 at line 645. The second `runInit()` hits the EEXIST bug.

**What Makes It Pass:** Same production code fix as TC-INS-001.

---

## TC-INS-005: Fresh install creates symlinks normally (regression guard)

**Requirement ID:** FR-001
**Acceptance Criteria:** AC-001-03, AC-003
**Test Type:** positive (regression)
**Priority:** P0 (Critical)
**Status:** PASSING

**Given:** A clean project directory with no prior `.antigravity/` directory
**When:** `isdlc init --force` is run for the first time
**Then:** `.antigravity/` symlinks are created successfully

**Existing Test Location:** Multiple passing test suites in `lib/installer.test.js` (e.g., "phase directories created", "settings.json merge")
**Note:** This test already passes and must continue to pass after the fix (regression guard).
