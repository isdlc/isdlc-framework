# Trace Analysis: Batch A Gate Bypass Bugs (BUG-0007)

**Generated**: 2026-02-15T15:10:00Z
**Bug**: Batch A -- 3 critical gate bypass bugs (2 genuine, 1 already fixed)
**Workflow**: fix
**Phase**: 02-tracing
**Artifact Folder**: BUG-0007-batch-a-gate-bypass-bugs
**Prior Work**: BUG-0005 Phase 02 trace analysis (cancelled workflow, findings re-verified)

---

## Executive Summary

Three bugs were traced across two hook files (`gate-blocker.cjs` and `state-write-validator.cjs`). All findings from the prior BUG-0005 trace analysis were re-verified against the current codebase -- all bugs remain unfixed and the code is unchanged at the relevant locations. Bug 0.1 is a genuine gate bypass where `active_workflow.phase_status` at line 646 short-circuits all five iteration requirement checks in the gate-blocker. Bug 0.2 was confirmed already fixed -- `PHASE_STATUS_ORDINAL` is correctly defined at lines 181-185. Bug 0.3 is a genuine null-safety gap where `JSON.parse("null")` returns `null`, causing a TypeError that silently disables the version lock check via a fail-open catch block. Both genuine bugs are low-complexity, single-site fixes.

**Root Cause Confidence**: HIGH (both genuine bugs have exact line numbers and reproducible paths)
**Severity**: HIGH (gate bypass undermines all iteration enforcement)
**Estimated Complexity**: LOW (2 localized fixes, no cross-file dependencies)

---

## Symptom Analysis

### Bug 0.1: Dual Phase-Status Tracking

**Symptom**: Gate-blocker allows phase advancement without validating iteration requirements when `active_workflow.phase_status[phase]` equals `'completed'`.

**Error Pattern**: No error is thrown -- the bug manifests as a silent bypass. The gate returns `{ decision: 'allow' }` without checking any of the five requirement types.

**Triggering Conditions**:
- An active workflow is in progress
- The orchestrator has set `active_workflow.phase_status[currentPhase]` to `'completed'`
- The iteration requirement data in `state.phases[currentPhase]` is incomplete or absent
- A gate advancement attempt is detected by `isGateAdvancementAttempt()`

**Impact**: All five iteration requirement checks (test iteration, constitutional validation, interactive elicitation, agent delegation, artifact presence) are bypassed. This means a phase can advance without running tests, without constitutional compliance, without user elicitation, without delegating to the correct agent, and without required artifacts on disk.

**Re-verification (2026-02-15)**: Code at `gate-blocker.cjs:645-649` confirmed unchanged. The early-return block remains:
```javascript
// If the active workflow already marks this phase as completed, skip iteration checks.
if (activeWorkflow?.phase_status?.[currentPhase] === 'completed') {
    debugLog('Phase already completed in active_workflow.phase_status, skipping gate checks');
    return { decision: 'allow', stderr: stderrMessages.trim() || undefined };
}
```

**Test Coverage**: No dedicated test file exists for gate-blocker.cjs. This bug has zero test coverage.

### Bug 0.2: Missing PHASE_STATUS_ORDINAL (ALREADY FIXED)

**Verification**: `PHASE_STATUS_ORDINAL` is defined at `state-write-validator.cjs:181-185`:
```javascript
const PHASE_STATUS_ORDINAL = {
    'pending': 0,
    'in_progress': 1,
    'completed': 2
};
```
Referenced at lines 293 and 294 in `checkPhaseFieldProtection()`. Both references resolve correctly. Existing tests T59 (unknown statuses) confirm fail-open behavior for undefined ordinals. No symptom remains.

**Re-verification (2026-02-15)**: Constant confirmed present and unchanged at lines 181-185.

### Bug 0.3: Null Safety Gap in Version Lock

**Symptom**: `checkVersionLock()` silently disables the entire version lock check when the incoming JSON content parses to `null` (or any non-object primitive).

**Error Pattern**: `TypeError: Cannot read properties of null (reading 'state_version')` -- caught by outer try/catch at line 169, resulting in fail-open `return null` at line 172.

**Triggering Conditions**:
- A Write event targets a state.json file
- The `tool_input.content` is a valid JSON string that parses to a non-object value (e.g., `"null"`, `"42"`, `"true"`, `"\"hello\""`)
- `JSON.parse()` succeeds (no exception), but the result is not an object
- Property access on the non-object value throws TypeError

**Re-verification (2026-02-15)**: Code at `state-write-validator.cjs:122-128` and `141-143` confirmed unchanged. No type guard present after either `JSON.parse()` call.

**Test Coverage**: The V7 tests (T16-T30) in `state-write-validator.test.cjs` do not test null-parse or non-object-parse scenarios. This specific bug path has zero test coverage.

---

## Execution Path

### Bug 0.1: gate-blocker.cjs Call Chain

```
check(ctx)                          [line 518]
  |
  +-> isGateAdvancementAttempt()    [line 526] -- returns true
  |
  +-> Load state, check enforcement [lines 550-568]
  |
  +-> Determine currentPhase        [line 577] -- from active_workflow.current_phase
  |
  +-> Normalize phase key            [line 617]
  |
  +-> Load phase requirements        [line 627]
  |
  +-> Apply workflow overrides       [lines 637-643]
  |
  +-> *** BUG: Early-return check ***
  |   if (activeWorkflow?.phase_status?.[currentPhase] === 'completed')
  |   return { decision: 'allow' }   [lines 646-648]
  |
  +-> [NEVER REACHED when above is true]
      phaseState = state.phases[currentPhase]  [line 652]
      checkTestIterationRequirement()          [line 658]
      checkConstitutionalRequirement()         [line 667]
      checkElicitationRequirement()            [line 676]
      checkAgentDelegationRequirement()        [line 685]
      checkArtifactPresenceRequirement()       [line 694]
```

**Data divergence point**: `active_workflow.phase_status` (line 646) vs `state.phases` (line 652). These are two separate state structures updated by different agents at different times. The orchestrator writes `phase_status` as workflow bookkeeping. Individual phase agents write `state.phases[phase]` with iteration data. There is no synchronization guarantee.

### Bug 0.3: state-write-validator.cjs Call Chain

```
check(ctx)                                    [line 333]
  |
  +-> Verify tool is Write/Edit               [line 341]
  |
  +-> Match STATE_JSON_PATTERN                 [line 349]
  |
  +-> checkVersionLock(filePath, toolInput, toolName) [line 356]
      |
      +-> Verify toolName === 'Write'          [line 109]
      |
      +-> Parse incoming content
      |   incomingContent = toolInput.content   [line 115]
      |   incomingState = JSON.parse(content)   [line 122]
      |   // If content is "null", incomingState === null (no exception)
      |
      +-> *** BUG: No null guard ***
      |   incomingVersion = incomingState.state_version  [line 128]
      |   // TypeError: Cannot read properties of null
      |
      +-> Outer try/catch catches TypeError    [line 169]
      |   debugLog('V7 version check error:')  [line 171]
      |   return null  // fail-open            [line 172]
      |
      +-> [Version lock check COMPLETELY DISABLED]

Same pattern on disk side:
      +-> diskContent = fs.readFileSync()      [line 141]
      |   diskState = JSON.parse(diskContent)  [line 142]
      |   // If disk content is "null", diskState === null
      |
      +-> *** BUG: No null guard ***
      |   diskVersion = diskState.state_version [line 143]
      |   // TypeError caught by inner try/catch at line 144
      |   return null  // fail-open
```

---

## Root Cause Analysis

### Bug 0.1: Root Cause CONFIRMED

**Hypothesis**: Dual-authority data model with unsynchronized early-return bypass.

**Root Cause**: Line 646 of `gate-blocker.cjs` checks `active_workflow.phase_status[currentPhase]` and returns early (allowing gate advancement) before any of the five iteration requirement checks execute. The iteration checks read from `state.phases[currentPhase]`, a completely separate data structure. These two structures can and do diverge because they are written by different agents at different times.

**Evidence**:
1. Line 646: `if (activeWorkflow?.phase_status?.[currentPhase] === 'completed')` -- early return
2. Line 652: `const phaseState = state.phases?.[currentPhase] || {}` -- never reached when line 646 is true
3. Lines 658-700: All five checks use `phaseState` from `state.phases` -- all bypassed
4. No code synchronizes `active_workflow.phase_status` with `state.phases` requirements
5. Current state.json confirms both structures exist independently (`active_workflow.phase_status` at state key `active_workflow` and `phases` at top-level `phases` key)
6. No gate-blocker test file exists -- zero test coverage for this function

**Confidence**: HIGH -- direct code reading, no ambiguity. Re-confirmed against current code.

**Fix**: Remove lines 645-649 (the 5-line block including comment and blank line). The five requirement checks at lines 652-700 already handle all cases correctly. If all requirements are satisfied, the gate allows advancement (line 703). If not, it blocks. The `phase_status` check adds no value and creates a bypass vector.

**Affected Lines**: `gate-blocker.cjs:645-649` (remove)

### Bug 0.2: CONFIRMED ALREADY FIXED

No root cause to address. `PHASE_STATUS_ORDINAL` exists at `state-write-validator.cjs:181-185` and is used correctly at lines 293-294.

### Bug 0.3: Root Cause CONFIRMED

**Hypothesis**: Missing type guard after `JSON.parse()` allows null/primitive values to cause TypeError, which is caught by fail-open error handling, silently disabling the version lock.

**Root Cause**: `JSON.parse()` can return any valid JSON value, not just objects. The spec allows `null`, numbers, strings, and booleans as top-level values. After parsing, line 128 accesses `.state_version` without verifying the result is a non-null object. The resulting TypeError is caught by the outer try/catch, which returns `null` (fail-open), completely disabling the version lock check for that write.

**Evidence**:
1. `JSON.parse("null")` === `null` -- no exception thrown at line 122
2. `null.state_version` throws `TypeError` at line 128
3. Outer try/catch at line 169-173 catches it, returns `null`
4. `null` return from `checkVersionLock()` means "no opinion, continue" at caller line 356-359
5. Same vulnerability exists on disk side at line 142-143 (inner try/catch catches and returns `null`)
6. Existing V7 tests (T16-T30) do not cover null-parse or non-object-parse scenarios

**Confidence**: HIGH -- reproducible with `JSON.parse("null")`. Re-confirmed against current code.

**Fix**: Add type guard after each `JSON.parse()`:
- After line 122: `if (!incomingState || typeof incomingState !== 'object') { debugLog('V7: incoming state is not an object, skipping version check'); return null; }`
- After line 142: `if (!diskState || typeof diskState !== 'object') { debugLog('V7: disk state is not an object, skipping version check'); return null; }`

This converts the implicit fail-open (via caught TypeError) to an explicit fail-open with debug logging, making the behavior intentional and observable.

**Affected Lines**:
- `state-write-validator.cjs:122` (add guard after)
- `state-write-validator.cjs:142` (add guard after)

---

## Suggested Fixes Summary

| Bug | File | Action | Lines | Complexity |
|-----|------|--------|-------|------------|
| 0.1 | gate-blocker.cjs | Remove early-return bypass | 645-649 | LOW |
| 0.2 | state-write-validator.cjs | No action (already fixed) | 181-185 | NONE |
| 0.3 | state-write-validator.cjs | Add null/type guards after JSON.parse | 122, 142 | LOW |

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-02-15T15:10:00Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "prior_trace_reused": "docs/requirements/BUG-0005-batch-a-gate-bypass-bugs/trace-analysis.md",
  "files_traced": [
    "src/claude/hooks/gate-blocker.cjs",
    "src/claude/hooks/state-write-validator.cjs"
  ],
  "error_keywords": ["TypeError", "Cannot read properties of null", "phase_status", "state_version", "early-return", "bypass"],
  "bugs_genuine": 2,
  "bugs_already_fixed": 1,
  "root_cause_confidence": "high",
  "existing_test_coverage": {
    "gate-blocker.cjs": "No dedicated test file found -- zero coverage for check() function",
    "state-write-validator.cjs": "src/claude/hooks/tests/state-write-validator.test.cjs (67+ tests, covers V1-V8 but not null-parse edge case)"
  }
}
```
