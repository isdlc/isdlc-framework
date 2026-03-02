# BUG-0005: Batch A - Fix 3 Critical Gate Bypass Bugs

**Type:** Bug Fix (batch)
**Priority:** P0 - Critical
**Files Affected:** `gate-blocker.cjs`, `state-write-validator.cjs` (2 files)

---

## Bug 0.1: Dual Phase-Status Tracking Causes Inconsistent Gate Decisions

### Description
`gate-blocker.cjs` line 646 checks `active_workflow.phase_status[phase]` for `'completed'` and early-returns (skipping all iteration requirement checks). Line 652 reads `state.phases[phase]` for detailed iteration data. These two sources can diverge: if `active_workflow.phase_status` is set to `completed` before iteration requirements in `state.phases` are satisfied, the gate passes without validation.

### Root Cause
Line 646-648: `if (activeWorkflow?.phase_status?.[currentPhase] === 'completed')` acts as a bypass that skips all five requirement checks (test iteration, constitutional validation, interactive elicitation, agent delegation, artifact presence).

### Fix
Remove the `active_workflow.phase_status` early-return. Make `state.phases` the single canonical source for gate decisions. The gate should always evaluate all requirement checks regardless of phase_status.

### Acceptance Criteria
- **AC-01a**: Gate-blocker does NOT early-return based on `active_workflow.phase_status[phase] === 'completed'`
- **AC-01b**: Gate decisions are based solely on `state.phases[phase]` iteration requirement data
- **AC-01c**: When `state.phases[phase]` has all requirements satisfied, gate allows advancement regardless of `active_workflow.phase_status` value
- **AC-01d**: When `state.phases[phase]` has unsatisfied requirements, gate blocks even if `active_workflow.phase_status[phase] === 'completed'`
- **AC-01e**: Existing tests continue to pass after the change

---

## Bug 0.2: Missing PHASE_STATUS_ORDINAL (ALREADY FIXED)

### Description
Originally reported: `state-write-validator.cjs:293-294` references `PHASE_STATUS_ORDINAL[incomingStatus]` and `PHASE_STATUS_ORDINAL[diskStatus]` but the constant is never defined.

### Status: ALREADY FIXED
Upon code inspection, `PHASE_STATUS_ORDINAL` is defined at lines 181-185:
```javascript
const PHASE_STATUS_ORDINAL = {
    'pending': 0,
    'in_progress': 1,
    'completed': 2
};
```
No fix required. This bug was resolved prior to this workflow.

### Acceptance Criteria
- **AC-02a**: Verify `PHASE_STATUS_ORDINAL` exists and is correctly defined (validation only)

---

## Bug 0.3: Null Safety Gap in State Version Lock Check

### Description
`state-write-validator.cjs` `checkVersionLock()` at line 128: after `JSON.parse(incomingContent)` succeeds, the result is not validated as an object before accessing `.state_version`. If the parsed result is `null` (valid JSON), `incomingState.state_version` throws `TypeError: Cannot read properties of null`. The outer try/catch catches this and returns `null` (fail-open), silently disabling the version lock check.

### Root Cause
Line 122: `incomingState = JSON.parse(incomingContent)` can return `null`, a number, a string, or a boolean -- all valid JSON.
Line 128: `const incomingVersion = incomingState.state_version` throws if `incomingState` is `null`.
The outer try/catch at line 113 catches this and returns `null`, but this means the entire version check is silently skipped for malformed state data.

### Fix
Add a type check after `JSON.parse`: `if (!incomingState || typeof incomingState !== 'object')` before accessing `.state_version`. Return `null` (fail-open) explicitly with a debug log, rather than falling through to the catch block silently.

### Acceptance Criteria
- **AC-03a**: `checkVersionLock` validates that `JSON.parse` result is a non-null object before accessing properties
- **AC-03b**: When parsed content is `null`, `checkVersionLock` returns `null` (fail-open) with debug log
- **AC-03c**: When parsed content is a primitive (number, string, boolean), `checkVersionLock` returns `null` (fail-open) with debug log
- **AC-03d**: When parsed content is a valid object, version checking proceeds as before
- **AC-03e**: The fix does not change behavior for valid state.json content
- **AC-03f**: Similarly validate disk-side `JSON.parse` result in `checkVersionLock` (lines 141-143)

---

## Non-Functional Requirements

- **NFR-01**: All fixes must maintain fail-open behavior (Article X compliance)
- **NFR-02**: Changes must be backward-compatible with existing state.json formats
- **NFR-03**: All changes must be CJS-compatible (.cjs files, no ESM syntax)
