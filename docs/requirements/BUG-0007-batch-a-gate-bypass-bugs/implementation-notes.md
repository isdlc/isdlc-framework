# Implementation Notes: BUG-0007 Batch A Gate Bypass Bugs

**Phase**: 06-implementation
**Date**: 2026-02-15
**Files Modified**: 2
**Tests**: 16/16 GREEN (9 RED turned GREEN, 7 GREEN preserved)
**Regression**: 0 new failures (43 pre-existing in workflow-finalizer.test.cjs)

## Bug 0.1: Dual Phase-Status Tracking Bypass

**File**: `src/claude/hooks/gate-blocker.cjs` (line 645-649)
**Fix**: Removed the early-return block that checked `active_workflow.phase_status[phase] === 'completed'`.

### Root Cause
The gate-blocker had two sources of truth for phase completion:
1. `active_workflow.phase_status[phase]` -- set by the orchestrator during workflow
2. `state.phases[phase]` -- canonical source with iteration requirements

When `phase_status` was set to `completed` before all iteration requirements were satisfied (constitutional validation, interactive elicitation, test iteration), the gate-blocker would early-return with `allow`, bypassing all five requirement checks.

### Change
Removed 4 lines (the if-block and return statement) at lines 645-649. Replaced with a comment explaining that `state.phases[phase]` is the single canonical source. The five requirement checks at lines 652+ already handle all cases correctly.

### Impact
- No new code paths introduced
- Removes 1 code path (the early-return bypass)
- All gate decisions now flow through the same 5-check pipeline

## Bug 0.2: PHASE_STATUS_ORDINAL (Already Fixed)

**File**: `src/claude/hooks/state-write-validator.cjs`
**Fix**: None required. Verified that `PHASE_STATUS_ORDINAL` constant exists with correct values (pending: 0, in_progress: 1, completed: 2). Test TC-02a confirms.

## Bug 0.3: Null Safety Gap in checkVersionLock

**File**: `src/claude/hooks/state-write-validator.cjs` (lines 128, 143)
**Fix**: Added explicit type guards after JSON.parse() for both incoming content and disk content.

### Root Cause
`JSON.parse()` can return valid JSON values that are not objects: `null`, numbers, booleans, strings. The code assumed the result would always be an object and accessed `.state_version` directly. For `null`, this throws TypeError. For primitives, `.state_version` returns `undefined` silently but no guard log is emitted.

### Change
Added two type guards:

1. **Incoming content** (after line 126): `if (!incomingState || typeof incomingState !== 'object')` with descriptive debug log
2. **Disk content** (after line 150): `if (!diskState || typeof diskState !== 'object')` with descriptive debug log

Both guards:
- Log a descriptive message via `debugLog()` mentioning "V7" and "not an object"
- Return `null` (fail-open behavior per NFR-01)
- Use the same pattern: `!x || typeof x !== 'object'` (catches null, undefined, and all primitives)

### NFR Compliance
- **NFR-01** (Fail-open): Both guards return null (allow), not block
- **NFR-02** (Backward-compatible): Valid object content is unaffected by the guards
- **NFR-03** (CJS-only): All code uses require/module.exports, no ESM syntax

## Iteration History

| Iteration | Action | Result |
|-----------|--------|--------|
| 1 | Applied Bug 0.1 fix (remove early-return) + Bug 0.3 fix (add type guards) | 16/16 GREEN |

Single iteration to green. Both fixes were surgical and well-understood from trace analysis.
