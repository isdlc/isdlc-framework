# BUG-0007: Batch A - Fix 3 Critical Gate Bypass Bugs

**Type:** Bug Fix (batch)
**Priority:** P0 - Critical
**Files Affected:** `gate-blocker.cjs`, `state-write-validator.cjs` (2 files)
**Prior Work:** BUG-0005 (cancelled) completed Phase 01 + Phase 02 analysis. This workflow re-uses that analysis.

---

## Bug 0.1: Dual Phase-Status Tracking Causes Inconsistent Gate Decisions

### Description
`gate-blocker.cjs` line 646 checks `active_workflow.phase_status[phase]` for `'completed'` and early-returns with `{ decision: 'allow' }`, skipping all five iteration requirement checks. Line 652 reads `state.phases[phase]` for detailed iteration data. These two sources can diverge: if `active_workflow.phase_status` is set to `completed` before iteration requirements in `state.phases` are satisfied, the gate passes without validation.

### Root Cause
Lines 645-649: The `active_workflow.phase_status` early-return acts as a bypass that skips all five requirement checks (test iteration, constitutional validation, interactive elicitation, agent delegation, artifact presence). The `phase_status` field and `state.phases` field are written by different agents at different times with no synchronization.

### Fix
Remove the `active_workflow.phase_status` early-return block (lines 645-649). Make `state.phases` the single canonical source for gate decisions. The five requirement checks at lines 652-700 already handle all cases correctly.

### Acceptance Criteria
- **AC-01a**: Gate-blocker does NOT early-return based on `active_workflow.phase_status[phase] === 'completed'`
- **AC-01b**: Gate decisions are based solely on `state.phases[phase]` iteration requirement data
- **AC-01c**: When `state.phases[phase]` has all requirements satisfied, gate allows advancement regardless of `active_workflow.phase_status` value
- **AC-01d**: When `state.phases[phase]` has unsatisfied requirements, gate blocks even if `active_workflow.phase_status[phase] === 'completed'`
- **AC-01e**: Existing tests continue to pass after the change

---

## Bug 0.2: Missing PHASE_STATUS_ORDINAL (ALREADY FIXED -- verification only)

### Description
Originally reported: `state-write-validator.cjs:293-294` references `PHASE_STATUS_ORDINAL[incomingStatus]` and `PHASE_STATUS_ORDINAL[diskStatus]` but the constant is never defined.

### Status: ALREADY FIXED
`PHASE_STATUS_ORDINAL` is defined at lines 181-185:
```javascript
const PHASE_STATUS_ORDINAL = {
    'pending': 0,
    'in_progress': 1,
    'completed': 2
};
```
No fix required. Confirmed by BUG-0005 trace analysis and re-verified via code inspection.

### Acceptance Criteria
- **AC-02a**: Verify `PHASE_STATUS_ORDINAL` exists and is correctly defined (validation only, no code change)

---

## Bug 0.3: Null Safety Gap in State Version Lock Check

### Description
`state-write-validator.cjs` `checkVersionLock()` at line 122: after `JSON.parse(incomingContent)` succeeds, the result is not validated as an object before accessing `.state_version` at line 128. If the parsed result is `null` (valid JSON), `null.state_version` throws `TypeError`. The outer try/catch catches this and returns `null` (fail-open), silently disabling the version lock check entirely.

The same vulnerability exists on the disk-read side at lines 141-143.

### Root Cause
`JSON.parse()` can return any valid JSON value -- `null`, numbers, strings, booleans -- not just objects. Line 128 accesses `.state_version` without first verifying the result is a non-null object. The resulting TypeError is caught by the outer try/catch and returns `null` (fail-open), completely disabling the version lock check for that write. This converts a deliberate version lock into a silent no-op.

### Fix
Add type guard after each `JSON.parse()`:
- After line 122: `if (!incomingState || typeof incomingState !== 'object') return null;` with debug log
- After line 142: `if (!diskState || typeof diskState !== 'object') return null;` with debug log

This converts implicit fail-open (via caught TypeError) to explicit fail-open with observability.

### Acceptance Criteria
- **AC-03a**: `checkVersionLock` validates that `JSON.parse` result is a non-null object before accessing properties (incoming side)
- **AC-03b**: When parsed incoming content is `null`, `checkVersionLock` returns `null` (fail-open) with debug log
- **AC-03c**: When parsed incoming content is a primitive (number, string, boolean), `checkVersionLock` returns `null` (fail-open) with debug log
- **AC-03d**: When parsed incoming content is a valid object, version checking proceeds as before
- **AC-03e**: The fix does not change behavior for valid state.json content
- **AC-03f**: Same null/type guard applied to disk-side `JSON.parse` result (lines 141-143)
- **AC-03g**: Debug log messages clearly indicate why the version check was skipped

---

## Non-Functional Requirements

- **NFR-01**: All fixes must maintain fail-open behavior (Article X compliance -- hooks never block on infrastructure failure)
- **NFR-02**: Changes must be backward-compatible with existing state.json formats
- **NFR-03**: All changes must be CJS-compatible (.cjs files, no ESM syntax) (Article XII compliance)

---

## Traceability

| AC | Bug | File | Lines |
|----|-----|------|-------|
| AC-01a..AC-01e | 0.1 | gate-blocker.cjs | 645-649 |
| AC-02a | 0.2 | state-write-validator.cjs | 181-185 |
| AC-03a..AC-03g | 0.3 | state-write-validator.cjs | 122, 128, 141-143 |

## Summary

- **3 bugs reported** (BACKLOG.md Batch A items 0.1, 0.2, 0.3)
- **2 genuine bugs** requiring code changes (0.1, 0.3)
- **1 already fixed** (0.2 -- verification only)
- **2 files affected** (`gate-blocker.cjs`, `state-write-validator.cjs`)
- **10 acceptance criteria** (5 for bug 0.1, 1 for bug 0.2 verification, 7 for bug 0.3)
- **3 NFRs** (fail-open, backward-compat, CJS-only)
- **Estimated complexity**: LOW (2 localized fixes, no cross-file dependencies)
