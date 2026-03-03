# Test Cases: fs-helpers Export Count (FR-003)

**Requirement:** FR-003 — Correct Export Count in fs-helpers Test
**Test File:** `lib/utils/fs-helpers.test.js`
**Test Type:** Unit
**Fix Type:** Test data fix (update expectedFunctions array)

---

## TC-FSH-001: Default export contains all expected functions

**Requirement ID:** FR-003
**Acceptance Criteria:** AC-005
**Test Type:** positive
**Priority:** P1 (High)
**Status:** RED (pre-fix), expected GREEN (post-fix)

**Given:** The `fs-helpers.js` module exports 20 named functions including `symlink` (added by REQ-0032)
**When:** The default export test checks `Object.keys(defaultExport).length` against `expectedFunctions.length`
**Then:** The count matches (20 === 20) and every function in `expectedFunctions` exists as a function on the default export

**Existing Test Location:** `lib/utils/fs-helpers.test.js` line 442
**Test Code Reference:**
```javascript
describe('default export', () => {
  it('should export an object containing all 19 functions', () => {
    const expectedFunctions = [
      'getFrameworkDir', 'getPackageRoot', 'exists', 'existsSync',
      'ensureDir', 'copy', 'copyDir', 'readJson', 'writeJson',
      'readFile', 'writeFile', 'remove', 'readdir', 'stat',
      'isDirectory', 'isFile', 'findFiles', 'deepMerge', 'convertYamlToJson',
      // MISSING: 'symlink'
    ];
    // ... loop checking typeof === 'function'
    assert.equal(Object.keys(defaultExport).length, expectedFunctions.length, ...);
  });
});
```

**Why It Fails:** The `expectedFunctions` array has 19 entries. The actual default export has 20 keys (includes `symlink`). The assertion `20 !== 19` fails.

**What Makes It Pass:** Add `'symlink'` to the `expectedFunctions` array at line 443. The count assertion at line 473 uses `expectedFunctions.length` dynamically, so it automatically becomes `20 === 20`.

**Test Data Change Required:**
```javascript
const expectedFunctions = [
  'getFrameworkDir', 'getPackageRoot', 'exists', 'existsSync',
  'ensureDir', 'copy', 'copyDir', 'readJson', 'writeJson',
  'readFile', 'writeFile', 'remove', 'readdir', 'stat',
  'isDirectory', 'isFile', 'findFiles', 'deepMerge', 'convertYamlToJson',
  'symlink',  // Added for REQ-0032
];
```

---

## TC-FSH-002: symlink function is callable on default export

**Requirement ID:** FR-003
**Acceptance Criteria:** AC-005
**Test Type:** positive
**Priority:** P1
**Status:** RED (implicitly -- the loop at line 465 only checks the 19 functions in the array)

**Given:** `symlink` is added to `expectedFunctions`
**When:** The loop at line 465 checks `typeof defaultExport['symlink']`
**Then:** It returns `'function'`

**Note:** This is not a separate test case -- it is validated within TC-FSH-001's loop. Listed separately for traceability completeness.

---

## TC-FSH-003: No extra unexpected exports (regression guard)

**Requirement ID:** FR-003
**Acceptance Criteria:** AC-005
**Test Type:** negative (regression)
**Priority:** P2 (Medium)
**Status:** Will be GREEN after fix

**Given:** The `expectedFunctions` array contains exactly 20 entries
**When:** The count assertion compares `Object.keys(defaultExport).length` to `expectedFunctions.length`
**Then:** They are equal (no extra unexpected exports)

**Note:** This is the inverse check -- ensures no new exports are added without updating the test. Already part of TC-FSH-001's assertion.
