# Test Cases: Updater Symlink Handling (FR-002)

**Requirement:** FR-002 — Graceful Symlink Handling in Updater
**Test File:** `lib/updater.test.js`
**Test Type:** Integration (subprocess)
**Fix Type:** Production code fix (no test code changes needed)

---

## TC-UPD-001: Install then update succeeds

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01, AC-002-02, AC-008
**Test Type:** positive
**Priority:** P0 (Critical)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project directory initialized with `isdlc init --force` (`.antigravity/` symlinks exist as broken symlinks in temp dir)
**When:** `isdlc update --force` is run
**Then:** The update completes without EEXIST errors, output indicates success

**Existing Test Location:** `lib/updater.test.js` line 125
**Test Code Reference:**
```javascript
describe('updater: install --force then update --force succeeds', () => {
  before(() => {
    projectDir = setupProjectDir('update-cycle');
    runInit(projectDir);          // Creates .antigravity/ symlinks
    output = runUpdate(projectDir); // EEXIST crash here
  });
  it('update completes without error', () => { ... });
  it('state.json still exists after update', () => { ... });
});
```

**Why It Fails:** `runUpdate()` calls the updater which encounters pre-existing `.antigravity/` symlinks from `runInit()`. Same `exists()` bug as installer.

---

## TC-UPD-002: Update completes without error (child of TC-UPD-001)

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01
**Test Type:** positive
**Priority:** P0
**Status:** RED (cancelled due to before() crash)

**Existing Test Location:** `lib/updater.test.js` line 137

---

## TC-UPD-003: State.json exists after update (child of TC-UPD-001)

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01
**Test Type:** positive
**Priority:** P1
**Status:** RED (cancelled due to before() crash)

**Existing Test Location:** `lib/updater.test.js` line 141

---

## TC-UPD-004: Update preserves state.json project data

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01, AC-004
**Test Type:** positive
**Priority:** P0 (Critical)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project directory initialized with `isdlc init --force` and state.json containing project data
**When:** `isdlc update --force` is run
**Then:** The project.name and project.created fields in state.json are preserved

**Existing Test Location:** `lib/updater.test.js` line 150
**Child tests:** Lines 165, 169, 173 (preserves project.name, preserves project.created, framework_version present)

---

## TC-UPD-005: Update preserves settings.json user keys

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01, AC-004
**Test Type:** positive
**Priority:** P1 (High)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project with settings.json containing a custom user key (`myUserKey`)
**When:** `isdlc update --force` is run
**Then:** The custom user key survives the update

**Existing Test Location:** `lib/updater.test.js` line 182
**Child tests:** Lines 201, 205 (user key survives, hooks still present)

---

## TC-UPD-006: Dry-run update makes no changes

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01
**Test Type:** positive
**Priority:** P1
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project initialized with `isdlc init --force`
**When:** `isdlc update --dry-run --force` is run
**Then:** state.json and installed-files.json are unchanged

**Existing Test Location:** `lib/updater.test.js` line 214
**Why It Fails:** The `before()` hook calls `runInit()` which creates `.antigravity/` symlinks. Even though the dry-run update itself would not modify symlinks, the `runInit()` step in the `before()` is fine (first install), but the `runUpdate()` in the before() triggers EEXIST when it encounters the symlinks from `runInit()`.

**Note:** Actually, checking the test code at line 214-238, `runInit()` succeeds (first time), then `runUpdate(projectDir, '--dry-run')` is called. The dry-run flag is passed to the update command. If the updater respects `--dry-run` before the symlink block, this test may or may not fail depending on code path. Listed as RED for safety.

---

## TC-UPD-007: Update creates history entry

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01, AC-004
**Test Type:** positive
**Priority:** P1
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project initialized with `isdlc init --force`
**When:** `isdlc update --force` is run
**Then:** state.json contains a history entry from `npm-updater`

**Existing Test Location:** `lib/updater.test.js` line 244

---

## TC-UPD-008: Update regenerates installed-files.json

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01
**Test Type:** positive
**Priority:** P1
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project initialized with `isdlc init --force`
**When:** `isdlc update --force` is run
**Then:** installed-files.json exists with files array and framework_version

**Existing Test Location:** `lib/updater.test.js` line 269

---

## TC-UPD-009: Update with --backup creates backup directory

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01
**Test Type:** positive
**Priority:** P2 (Medium)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project initialized with `isdlc init --force`
**When:** `isdlc update --backup --force` is run
**Then:** An `isdlc-backup-*` directory is created containing `.claude` or `.isdlc`

**Existing Test Location:** `lib/updater.test.js` line 300

---

## TC-UPD-010: Update preserves CLAUDE.md (not overwritten)

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01, AC-004
**Test Type:** positive
**Priority:** P1
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project with a modified CLAUDE.md (Tracker set to jira, Jira Project Key set)
**When:** `isdlc update --force` is run
**Then:** CLAUDE.md content is unchanged, Tracker and Jira Project Key values preserved

**Existing Test Location:** `lib/updater.test.js` line 333

---

## TC-UPD-011: Update warns when Issue Tracker section is missing

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-01
**Test Type:** positive
**Priority:** P2 (Medium)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** A project where the Issue Tracker Configuration section has been removed from CLAUDE.md
**When:** `isdlc update --force` is run
**Then:** Output warns about missing Issue Tracker Configuration section

**Existing Test Location:** `lib/updater.test.js` line 372

---

## TC-UPD-012: Fresh update path creates symlinks normally (regression guard)

**Requirement ID:** FR-002
**Acceptance Criteria:** AC-002-03
**Test Type:** positive (regression)
**Priority:** P0
**Status:** PASSING

**Note:** Covered implicitly by the first `runInit()` call in every test suite's `before()` hook. The first install always succeeds because there are no pre-existing symlinks.

---

## TC-UPD-013: Update on non-installed directory fails gracefully (regression guard)

**Requirement ID:** FR-002
**Acceptance Criteria:** N/A (regression)
**Test Type:** negative
**Priority:** P1
**Status:** PASSING

**Given:** A project directory that has NOT been initialized
**When:** `isdlc update --force` is run
**Then:** Exit with non-zero status and error mentions missing installation

**Existing Test Location:** `lib/updater.test.js` line 92
**Note:** This test already passes and must continue to pass (regression guard).
