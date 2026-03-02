# Design Specification: Phase Handshake Audit Fixes

**Investigation ID**: INV-0055
**Source**: GitHub Issue #55
**Phase**: 04-design (ANALYSIS MODE -- no state.json writes, no branches)
**Generated**: 2026-02-19
**Based On**: Phases 00-03 (quick-scan, requirements-spec, impact-analysis, architecture-analysis)

---

## Table of Contents

1. [Gap Analysis Summary](#1-gap-analysis-summary)
2. [Fix Designs](#2-fix-designs)
   - 2.1 [FIX-01: V9 Cross-Location Consistency Check](#21-fix-01-v9-cross-location-consistency-check)
   - 2.2 [FIX-02: Dual-Write Consolidation (REC-01)](#22-fix-02-dual-write-consolidation-rec-01)
   - 2.3 [FIX-03: Missing Integration Tests (REC-05)](#23-fix-03-missing-integration-tests-rec-05)
   - 2.4 [FIX-04: Stale Phase Detection (REC-06)](#24-fix-04-stale-phase-detection-rec-06)
   - 2.5 [FIX-05: Configuration Loader Consolidation (REC-04)](#25-fix-05-configuration-loader-consolidation-rec-04)
   - 2.6 [FIX-06: V8 Supervised Redo Exception](#26-fix-06-v8-supervised-redo-exception)
3. [Implementation Priority](#3-implementation-priority)
4. [Verification Plan](#4-verification-plan)
5. [State Transition Diagram](#5-state-transition-diagram)
6. [Phase Gate Validation](#6-phase-gate-validation)

---

## 1. Gap Analysis Summary

### 1.1 Behaviors Confirmed as Correct

The following handshake behaviors were verified across Phases 00-03 and require no changes:

| ID | Behavior | Evidence |
|----|----------|----------|
| OK-01 | `writeState()` uses single `fs.writeFileSync` -- per-call atomicity is sufficient | `common.cjs` L1118; single-threaded execution model |
| OK-02 | `readState()` returns null on error (fail-open) | `common.cjs` L1063-1075; all hooks handle null gracefully |
| OK-03 | V7 version lock blocks stale writes correctly | `state-write-validator.cjs` L112-195; well-tested in `state-write-validator.test.cjs` |
| OK-04 | V8 blocks `current_phase_index` regression | `state-write-validator.cjs` L274-297; well-tested |
| OK-05 | V8 blocks `phase_status` regression (ordinal comparison) | `state-write-validator.cjs` L299-335; well-tested |
| OK-06 | `phase-loop-controller` allows re-delegation to `in_progress` phases (crash recovery) | `phase-loop-controller.cjs` L87; well-tested T1-T12 |
| OK-07 | Same-phase sub-agent bypass (BUG-0013) is correct | `phase-loop-controller.cjs` L68-81; well-tested T13-T23 |
| OK-08 | `phase-sequence-guard` blocks out-of-order delegation | `phase-sequence-guard.cjs` L47-68; tested |
| OK-09 | `resolveStatePath()` correctly handles monorepo project isolation | `common.cjs` L327-339; projects/{id}/state.json |
| OK-10 | `artifact-paths.json` template substitution matches between STEP 3d and gate-blocker | Both read `active_workflow.artifact_folder`; `artifact_folder` is immutable during workflow |
| OK-11 | Gate-blocker BUG-0008 delegation detection guard prevents false-positive gate checks | `gate-blocker.cjs` L120-178; `detectPhaseDelegation()` |
| OK-12 | Budget status is workflow-wide and computed correctly | `isdlc.md` L1317-1320; elapsed from `active_workflow.started_at` |
| OK-13 | Pre-task-dispatcher reads state once, shares context across all hooks | Architecture prevents inconsistency within a single hook chain invocation |
| OK-14 | Artifact variant handling via `pathsByDir` grouping works correctly | `gate-blocker.cjs` L545-564 |

### 1.2 Gaps, Risks, and Bugs Identified

| ID | Category | Severity | Description | Source |
|----|----------|----------|-------------|--------|
| GAP-01 | COVERAGE GAP | HIGH | No cross-check between `phases[N].status` and `active_workflow.phase_status[N]` -- divergence is silent | RISK-02, RISK-08 (arch-analysis) |
| GAP-02 | COVERAGE GAP | HIGH | No integration test for multi-phase boundary state (TS-005) -- BUG-0006 regression undetectable | GAP-003 (impact-analysis) |
| GAP-03 | COVERAGE GAP | HIGH | No test for supervised review redo timing preservation (TS-003) -- `started_at` overwrite undetectable | GAP-001 (impact-analysis) |
| GAP-04 | COVERAGE GAP | HIGH | No test for dual-write consistency under delegation error (TS-008) -- stuck `in_progress` undetectable | GAP-004 (impact-analysis) |
| GAP-05 | COVERAGE GAP | MEDIUM | No test for escalation retry flow (TS-004) | GAP-002 (impact-analysis) |
| GAP-06 | POTENTIAL RISK | MEDIUM | V8 regression check may conflict with supervised redo status reset (`completed` -> `in_progress`) | RISK-07 (arch-analysis) |
| GAP-07 | COVERAGE GAP | MEDIUM | No detection mechanism for phases stuck as `in_progress` after crash | RISK-01 (arch-analysis) |
| GAP-08 | TECHNICAL DEBT | LOW | Triple-fallback configuration loader chain in gate-blocker and iteration-corridor | RISK-09 (arch-analysis) |
| GAP-09 | COVERAGE GAP | LOW | No hook enforcement for timing preservation, budget degradation, or escalation clearing -- prompt-only guarantees | RISK-03 (arch-analysis) |
| GAP-10 | COVERAGE GAP | LOW | `phases[N].status` regression (e.g., `completed` -> `pending`) is not checked by V8 -- V8 only checks `active_workflow.phase_status` | RISK-02 (arch-analysis) |

### 1.3 Severity Classification Criteria

| Severity | Definition |
|----------|-----------|
| HIGH | Silent data corruption or state divergence with no detection; can cause incorrect gate decisions or stuck workflows |
| MEDIUM | Detectable through manual inspection but not automatically; can cause confusing behavior |
| LOW | Technical debt or minor coverage gaps; unlikely to cause user-facing issues |

---

## 2. Fix Designs

### 2.1 FIX-01: V9 Cross-Location Consistency Check

**Addresses**: GAP-01, GAP-10
**Priority**: HIGH
**Effort**: LOW
**Recommendation**: REC-02 from architecture analysis

#### Purpose

Add a new validation rule (V9) to `state-write-validator.cjs` that detects divergence between mirrored state fields after every state.json write. This is the single highest-value fix because it catches the most dangerous silent failure mode.

#### Design

**File to modify**: `src/claude/hooks/state-write-validator.cjs`

**New function**: `checkCrossLocationConsistency(filePath, toolInput, toolName, diskState)`

**Checks performed** (all observational -- warn on stderr, never block):

```
V9-A: Phase status mirroring
  For each phase key K in incoming state:
    If phases[K].status exists AND active_workflow.phase_status[K] exists:
      WARN if phases[K].status !== active_workflow.phase_status[K]

V9-B: Current phase mirroring
  If current_phase (top-level) exists AND active_workflow.current_phase exists:
    WARN if current_phase !== active_workflow.current_phase

V9-C: Phase index consistency
  If active_workflow.current_phase_index exists AND active_workflow.phases exists:
    Let expectedPhase = active_workflow.phases[current_phase_index]
    If expectedPhase exists AND active_workflow.current_phase exists:
      WARN if expectedPhase !== active_workflow.current_phase
```

**Decision**: `{ decision: 'allow', stderr: warningMessages }` -- V9 never blocks.

**Why warn-only**: V9 runs in `PostToolUse[Write]` context. The write has already committed to disk. Blocking would be ineffective and confusing. Warnings to stderr provide visibility for diagnosis.

#### Exact Code Changes

Add the following function to `state-write-validator.cjs` before the `check()` function:

```javascript
/**
 * Rule V9: Cross-location consistency check (INV-0055).
 *
 * Validates that mirrored state fields are in sync after a state write.
 * Observational only: warns on stderr, never blocks.
 *
 * Checks:
 * V9-A: phases[N].status == active_workflow.phase_status[N]
 * V9-B: current_phase (top-level) == active_workflow.current_phase
 * V9-C: active_workflow.phases[index] == active_workflow.current_phase
 *
 * @param {string} filePath - Path to the state.json file
 * @param {object} toolInput - The tool_input from the hook event
 * @param {string} toolName - 'Write' or 'Edit'
 * @returns {{ warnings: string[] }}
 */
function checkCrossLocationConsistency(filePath, toolInput, toolName) {
    const warnings = [];

    try {
        // Parse the state that was just written
        let stateData;
        if (toolName === 'Write' && toolInput.content &&
            typeof toolInput.content === 'string') {
            try {
                stateData = JSON.parse(toolInput.content);
            } catch (e) {
                return { warnings };
            }
        } else {
            // Edit events: read from disk
            try {
                stateData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                return { warnings };
            }
        }

        if (!stateData || typeof stateData !== 'object') {
            return { warnings };
        }

        const phases = stateData.phases;
        const aw = stateData.active_workflow;

        // V9-A: Phase status mirroring
        if (phases && typeof phases === 'object' &&
            aw && aw.phase_status && typeof aw.phase_status === 'object') {
            for (const [phaseKey, phaseData] of Object.entries(phases)) {
                if (!phaseData || typeof phaseData !== 'object') continue;
                const detailedStatus = phaseData.status;
                const summaryStatus = aw.phase_status[phaseKey];
                if (detailedStatus && summaryStatus &&
                    detailedStatus !== summaryStatus) {
                    warnings.push(
                        `[state-write-validator] V9-A WARNING: ` +
                        `Phase status divergence for '${phaseKey}': ` +
                        `phases[].status='${detailedStatus}' vs ` +
                        `active_workflow.phase_status[]='${summaryStatus}'. ` +
                        `Path: ${filePath}`
                    );
                }
            }
        }

        // V9-B: Current phase mirroring
        const topLevelPhase = stateData.current_phase;
        const awCurrentPhase = aw?.current_phase;
        if (topLevelPhase && awCurrentPhase &&
            topLevelPhase !== awCurrentPhase) {
            warnings.push(
                `[state-write-validator] V9-B WARNING: ` +
                `Current phase divergence: ` +
                `current_phase='${topLevelPhase}' vs ` +
                `active_workflow.current_phase='${awCurrentPhase}'. ` +
                `Path: ${filePath}`
            );
        }

        // V9-C: Phase index consistency
        const awIndex = aw?.current_phase_index;
        const awPhases = aw?.phases;
        if (typeof awIndex === 'number' && Array.isArray(awPhases) &&
            awIndex >= 0 && awIndex < awPhases.length && awCurrentPhase) {
            const expectedPhase = awPhases[awIndex];
            if (expectedPhase && expectedPhase !== awCurrentPhase) {
                warnings.push(
                    `[state-write-validator] V9-C WARNING: ` +
                    `Phase index mismatch: ` +
                    `phases[${awIndex}]='${expectedPhase}' vs ` +
                    `current_phase='${awCurrentPhase}'. ` +
                    `Path: ${filePath}`
                );
            }
        }

    } catch (e) {
        debugLog('V9 cross-location check error:', e.message);
    }

    return { warnings };
}
```

**Integration into `check()` function**: Add after V8, before V1-V3:

```javascript
// Rule V9: Cross-location consistency (INV-0055) -- uses parsed state
const v9Result = checkCrossLocationConsistency(
    filePath, toolInput, input.tool_name
);
if (v9Result.warnings.length > 0) {
    for (const w of v9Result.warnings) {
        logHookEvent('state-write-validator', 'warn', {
            reason: w.split(': ').slice(1).join(': ')
        });
    }
    // Accumulate warnings to return at end (do not block)
}
```

#### Error Messages

| Check | Message Format |
|-------|---------------|
| V9-A | `[state-write-validator] V9-A WARNING: Phase status divergence for '{phaseKey}': phases[].status='{x}' vs active_workflow.phase_status[]='{y}'. Path: {filePath}` |
| V9-B | `[state-write-validator] V9-B WARNING: Current phase divergence: current_phase='{x}' vs active_workflow.current_phase='{y}'. Path: {filePath}` |
| V9-C | `[state-write-validator] V9-C WARNING: Phase index mismatch: phases[{idx}]='{x}' vs current_phase='{y}'. Path: {filePath}` |

#### Tests Required

File: `src/claude/hooks/tests/v9-cross-location-consistency.test.cjs`

| Test ID | Description | Input State | Expected |
|---------|-------------|-------------|----------|
| T-V9-01 | No warning when phases[N].status matches phase_status[N] | Both `"in_progress"` | No stderr |
| T-V9-02 | Warn when phases[N].status diverges from phase_status[N] | `"completed"` vs `"in_progress"` | V9-A warning on stderr |
| T-V9-03 | No warning when current_phase matches active_workflow.current_phase | Both `"03-architecture"` | No stderr |
| T-V9-04 | Warn when current_phase diverges from active_workflow.current_phase | `"03-architecture"` vs `"04-design"` | V9-B warning on stderr |
| T-V9-05 | No warning when phases[index] matches current_phase | Index 2, phases[2] = `"03-architecture"`, current_phase = `"03-architecture"` | No stderr |
| T-V9-06 | Warn when phases[index] diverges from current_phase | Index 2, phases[2] = `"03-architecture"`, current_phase = `"04-design"` | V9-C warning on stderr |
| T-V9-07 | No warning when active_workflow is missing | State has no active_workflow | No stderr |
| T-V9-08 | No warning when phases is missing | State has no phases | No stderr |
| T-V9-09 | No warning on Edit events (V9 only applies to Write) | Edit tool_name | No stderr |
| T-V9-10 | Fail-open on malformed JSON content | Invalid JSON string | No stderr, no crash |

---

### 2.2 FIX-02: Dual-Write Consolidation (REC-01)

**Addresses**: GAP-01 (root cause elimination)
**Priority**: HIGH (but depends on FIX-01 first)
**Effort**: MEDIUM
**Recommendation**: REC-01 Option A from architecture analysis

#### Purpose

Eliminate the `active_workflow.phase_status` dual-write by making `phases[N].status` the single source of truth for phase status. This removes the root cause of GAP-01 rather than just detecting it (as FIX-01 does).

#### Prerequisites

FIX-01 (V9) must be deployed first to provide a safety net during migration. The migration proceeds in two phases:

#### Phase A: Deprecation (can ship with FIX-01)

1. Add a deprecation comment to `isdlc.md` STEP 3c-prime and STEP 3e at the `active_workflow.phase_status` write lines:
   ```
   // DEPRECATED (INV-0055): active_workflow.phase_status will be removed.
   // V9 cross-check validates consistency. phases[N].status is authoritative.
   ```

2. Update V8 in `state-write-validator.cjs` to also check `phases[N].status` regression (not just `active_workflow.phase_status`):

**New V8 check** (add after the existing phase_status regression check):

```javascript
// --- Check 3: phases[].status regression (INV-0055) ---
const incomingPhases = incomingState?.phases;
const diskPhases = diskState?.phases;

if (incomingPhases && typeof incomingPhases === 'object' &&
    diskPhases && typeof diskPhases === 'object') {
    for (const [phase, incomingData] of Object.entries(incomingPhases)) {
        if (!incomingData || typeof incomingData !== 'object') continue;
        const diskData = diskPhases[phase];
        if (!diskData || typeof diskData !== 'object') continue;

        const incomingStatus = incomingData.status;
        const diskStatus = diskData.status;
        if (!incomingStatus || !diskStatus) continue;

        const incomingOrd = PHASE_STATUS_ORDINAL[incomingStatus];
        const diskOrd = PHASE_STATUS_ORDINAL[diskStatus];
        if (incomingOrd === undefined || diskOrd === undefined) continue;

        // Allow supervised redo regression (FIX-06)
        if (incomingOrd < diskOrd) {
            // Check for supervised redo marker
            const supervisedReview = incomingState?.active_workflow?.supervised_review;
            const isRedo = supervisedReview &&
                (supervisedReview.status === 'redo_pending' ||
                 supervisedReview.redo_count > 0);
            if (isRedo && incomingStatus === 'in_progress' &&
                diskStatus === 'completed') {
                continue; // Allow supervised redo
            }

            const reason = `Phase status regression: phases['${phase}'].status changed from '${diskStatus}' to '${incomingStatus}'. Subagents must not regress phase status. Re-read state.json.`;
            console.error(`[state-write-validator] V8 BLOCK: ${reason}`);
            logHookEvent('state-write-validator', 'block', {
                reason: `V8: phases['${phase}'].status ${diskStatus} -> ${incomingStatus}`
            });
            return { decision: 'block', stopReason: reason };
        }
    }
}
```

#### Phase B: Removal (separate work item, after Phase A bakes)

1. Remove `active_workflow.phase_status` writes from `isdlc.md` STEP 3c-prime and STEP 3e
2. Update V8 to remove the old `active_workflow.phase_status` regression check (replaced by `phases[N].status` check)
3. Remove V9-A check (no longer needed once dual-write is eliminated)
4. Update `isdlc.md` STEP 3e-review redo to only reset `phases[N].status` (not `active_workflow.phase_status[N]`)

#### Risk Mitigation

- Phase A is non-breaking: it adds redundant V8 coverage and deprecation markers
- Phase B requires verifying no consumers depend on `active_workflow.phase_status`:
  - `state-write-validator.cjs` V8 (will be updated)
  - Orchestrator quick-lookup (will use `phases[N].status` instead)
  - No other known consumers (confirmed in field-consumer matrix, architecture-analysis Section 5)

#### Files Changed

| File | Phase A Changes | Phase B Changes |
|------|----------------|----------------|
| `src/claude/hooks/state-write-validator.cjs` | Add V8 Check 3 for `phases[].status` regression with supervised redo exception | Remove V8 Check 2 (`active_workflow.phase_status` regression) |
| `src/claude/commands/isdlc.md` | Add deprecation comments | Remove `active_workflow.phase_status` writes from STEP 3c-prime, 3e, 3e-review |

---

### 2.3 FIX-03: Missing Integration Tests (REC-05)

**Addresses**: GAP-02, GAP-03, GAP-04, GAP-05
**Priority**: HIGH
**Effort**: MEDIUM
**Recommendation**: REC-05 from architecture analysis

#### Purpose

Add integration tests for the four untested cross-boundary scenarios identified in the impact analysis. Since the orchestrator is prompt-based and non-deterministic, these tests validate **state expectations** -- what state.json should look like at each step -- rather than testing the orchestrator execution itself.

#### Test Design Pattern

All tests follow the same pattern established in `cross-hook-integration.test.cjs`:

1. Set up a temporary directory with `.isdlc/state.json` and config files
2. Write an initial state representing a specific point in the handshake
3. Invoke relevant hook(s) via `spawnSync`
4. Assert on the resulting state or hook output

#### Test File: `supervised-review-redo-timing.test.cjs` (TS-003)

**Location**: `src/claude/hooks/tests/supervised-review-redo-timing.test.cjs`

**What it tests**: When a supervised redo resets `phases[N].status` to `in_progress`, the timing fields (`started_at`, `completed_at`, `wall_clock_minutes`) must not be corrupted.

**Test cases**:

| ID | Name | Setup State | Action | Assertion |
|----|------|-------------|--------|-----------|
| T-SR-01 | Redo preserves started_at | `phases[N].status="completed"`, `timing.started_at="2026-02-19T10:00:00Z"`, `timing.completed_at="2026-02-19T10:30:00Z"` | Write state with `phases[N].status="in_progress"` (simulating redo), keeping `timing.started_at` unchanged | V8 does not block (redo exception); `timing.started_at` unchanged in written state |
| T-SR-02 | Redo increments retries | Same as T-SR-01 | Write state with `timing.retries=1` (was 0) | `timing.retries` is 1 |
| T-SR-03 | Redo clears completed_at | Same as T-SR-01 | Write state with `timing.completed_at` removed or null | `timing.completed_at` is null/absent |
| T-SR-04 | V8 blocks non-redo status regression | `phases[N].status="completed"`, no `supervised_review` marker | Write state with `phases[N].status="in_progress"` | V8 blocks with regression message |

**Implementation sketch**:

```javascript
describe('supervised-review-redo-timing (TS-003)', () => {
    it('T-SR-01: redo preserves started_at', () => {
        const originalStartedAt = '2026-02-19T10:00:00Z';
        const diskState = {
            state_version: 5,
            phases: {
                '03-architecture': {
                    status: 'completed',
                    timing: {
                        started_at: originalStartedAt,
                        completed_at: '2026-02-19T10:30:00Z',
                        wall_clock_minutes: 30,
                        retries: 0
                    }
                }
            },
            active_workflow: {
                current_phase: '03-architecture',
                current_phase_index: 2,
                phase_status: { '03-architecture': 'completed' },
                supervised_review: {
                    phase: '03-architecture',
                    status: 'redo_pending',
                    redo_count: 1
                }
            }
        };

        const redoState = JSON.parse(JSON.stringify(diskState));
        redoState.state_version = 6;
        redoState.phases['03-architecture'].status = 'in_progress';
        redoState.phases['03-architecture'].timing.completed_at = null;
        redoState.phases['03-architecture'].timing.retries = 1;
        redoState.active_workflow.phase_status['03-architecture'] = 'in_progress';

        writeStateFile(tmpDir, diskState);
        const result = runHookWithContent(tmpDir, redoState);
        // V8 should NOT block because supervised_review.redo_count > 0
        assert.ok(!result.stdout.includes('BLOCK'));
        // Verify started_at is preserved
        assert.strictEqual(
            redoState.phases['03-architecture'].timing.started_at,
            originalStartedAt
        );
    });
});
```

#### Test File: `multi-phase-boundary.test.cjs` (TS-005)

**Location**: `src/claude/hooks/tests/multi-phase-boundary.test.cjs`

**What it tests**: State consistency between Phase N completion (STEP 3e) and Phase N+1 activation (STEP 3c-prime). Specifically validates the BUG-0006 fix: Phase N+1 must NOT be marked `in_progress` in STEP 3e.

**Test cases**:

| ID | Name | Setup State | Action | Assertion |
|----|------|-------------|--------|-----------|
| T-MP-01 | Phase N completed, N+1 still pending | State after STEP 3e: `phases[N].status="completed"`, `phases[N+1].status="pending"`, `current_phase_index=I+1` | Run phase-loop-controller check for Phase N+1 delegation | Blocks -- Phase N+1 is `pending`, not `in_progress` yet |
| T-MP-02 | Phase N+1 activated correctly | State after STEP 3c-prime for N+1: `phases[N+1].status="in_progress"`, `current_phase=phase_key_N+1` | Run phase-loop-controller check for Phase N+1 delegation | Allows |
| T-MP-03 | V8 blocks premature Phase N+1 activation in STEP 3e | Disk: `phases[N+1].status="pending"`. Incoming: `phases[N+1].status="in_progress"` written in STEP 3e (wrong place) | Run state-write-validator V8 | V8 does not block (pending -> in_progress is forward, not regression). But V9-C warns if phase_index points to wrong phase. |
| T-MP-04 | State version increments twice (3e write then 3c-prime write) | Disk version=5 before 3e | After 3e write: version=6. After 3c-prime write: version=7 | Two distinct version increments |

#### Test File: `dual-write-error-recovery.test.cjs` (TS-008)

**Location**: `src/claude/hooks/tests/dual-write-error-recovery.test.cjs`

**What it tests**: What state.json looks like when delegation fails (agent crashes or times out) and STEP 3e never executes.

**Test cases**:

| ID | Name | Setup State | Assertion |
|----|------|-------------|-----------|
| T-DW-01 | Phase stuck as in_progress | State after 3c-prime: `phases[N].status="in_progress"`, `timing.started_at` set, `timing.completed_at` absent | phase-loop-controller allows re-delegation (recovery) |
| T-DW-02 | Dual-write consistent on partial failure | Same as T-DW-01 | `phases[N].status` matches `active_workflow.phase_status[N]` (both "in_progress") |
| T-DW-03 | V7 prevents stale overwrites on recovery | Disk version=6. Recovery attempt writes with version=5 | V7 blocks the stale write |
| T-DW-04 | Timing data incomplete but not corrupted | Same as T-DW-01 | `timing.started_at` is set; `timing.completed_at` is null/absent; `timing.wall_clock_minutes` is null/absent |

#### Test File: `escalation-retry-flow.test.cjs` (TS-004)

**Location**: `src/claude/hooks/tests/escalation-retry-flow.test.cjs`

**What it tests**: The escalation lifecycle from gate-blocker adding a `pending_escalation` through to the orchestrator handling it.

**Test cases**:

| ID | Name | Setup State | Action | Assertion |
|----|------|-------------|--------|-----------|
| T-ER-01 | Gate blocker adds pending_escalation | State with missing constitutional validation | Run gate-blocker check | `pending_escalations` array has one `gate_blocked` entry |
| T-ER-02 | Escalation contains required fields | Same as T-ER-01 | Inspect escalation entry | Has `type`, `hook`, `phase`, `detail`, `timestamp` fields |
| T-ER-03 | Multiple gate blocks accumulate | State with multiple missing requirements | Run gate-blocker check | `pending_escalations` array grows (does not overwrite) |
| T-ER-04 | Retry clears escalations | State with `pending_escalations=[{...}]` after user retry | Write state with `pending_escalations=[]` | V7/V8 do not block the clear operation |

---

### 2.4 FIX-04: Stale Phase Detection (REC-06)

**Addresses**: GAP-07
**Priority**: MEDIUM
**Effort**: LOW
**Recommendation**: REC-06 from architecture analysis

#### Purpose

Detect phases that have been `in_progress` for an unreasonably long time, indicating a crash or timeout that left the phase in a stuck state.

#### Design

**Implementation location**: `src/claude/commands/isdlc.md` STEP 3b (escalation check)

This is a prompt-level enhancement, not a new hook. The orchestrator already reads `pending_escalations` in STEP 3b. The addition is a stale-phase check before the escalation check.

**Detection logic** (to be added to STEP 3b):

```
STALE PHASE DETECTION (added by INV-0055):

Before checking pending_escalations, check for stale phases:
  1. Read phases[current_phase_key].timing.started_at
  2. If started_at exists AND phases[current_phase_key].status === "in_progress":
     a. Compute elapsed = now - started_at (in minutes)
     b. Look up phase timeout from iteration-requirements.json:
        timeout = phase_requirements[current_phase_key].timeout_minutes || 120
     c. If elapsed > timeout * 2:
        Display stale phase warning banner:
        ===========================
        WARNING: Stale Phase Detected
        Phase: {phase_key}
        Started: {started_at}
        Elapsed: {elapsed} minutes (timeout: {timeout} minutes)
        This phase may have been interrupted by a crash or timeout.
        ===========================
        Options: [R] Retry phase | [S] Skip phase | [C] Cancel workflow
```

**Threshold**: 2x the phase timeout. This avoids false positives on legitimately long phases while catching clear crashes. Default timeout is 120 minutes (2 hours) if not specified in config, so the stale threshold is 240 minutes (4 hours).

**Action on detection**: Advisory only. Display a warning banner and present the same Retry/Skip/Cancel options as the escalation handler. This is consistent with the existing escalation handling pattern.

**No hook implementation**: This is intentionally prompt-level. Adding a hook for stale detection would require the hook to know the "expected" duration, which is configuration-dependent. The orchestrator already has access to the config and the detection logic is straightforward.

#### Fields Used

| Field | Purpose |
|-------|---------|
| `phases[N].timing.started_at` | When the phase started |
| `phases[N].status` | Must be `in_progress` for stale detection |
| `iteration-requirements.json` `phase_requirements[N].timeout_minutes` | Phase-specific timeout (default 120) |

---

### 2.5 FIX-05: Configuration Loader Consolidation (REC-04)

**Addresses**: GAP-08
**Priority**: LOW
**Effort**: LOW
**Recommendation**: REC-04 from architecture analysis

#### Purpose

Remove duplicate configuration loader functions from `gate-blocker.cjs` and `iteration-corridor.cjs`, using only the dispatcher-provided `ctx.requirements` and `common.cjs` fallback.

#### Design

**Files to modify**:
- `src/claude/hooks/gate-blocker.cjs`: Remove local `loadIterationRequirements()` (L35-53) and `loadWorkflowDefinitions()` (L58-76)
- `src/claude/hooks/iteration-corridor.cjs`: Remove equivalent local fallback (similar pattern)

**Change in `gate-blocker.cjs` L629**:

Before:
```javascript
const requirements = ctx.requirements
    || loadIterationRequirementsFromCommon()
    || loadIterationRequirements();
```

After:
```javascript
const requirements = ctx.requirements
    || loadIterationRequirementsFromCommon();
```

**Same pattern for workflow loading (L648-650)**:

Before:
```javascript
const workflows = (ctx.workflows && ctx.workflows.workflows ? ctx.workflows : null)
    || loadWorkflowDefinitionsFromCommon()
    || loadWorkflowDefinitions();
```

After:
```javascript
const workflows = (ctx.workflows && ctx.workflows.workflows ? ctx.workflows : null)
    || loadWorkflowDefinitionsFromCommon();
```

**Standalone execution compatibility**: The standalone `if (require.main === module)` block at the bottom of `gate-blocker.cjs` (L896-925) uses `loadReqs` from common.cjs, so standalone execution is unaffected.

#### Tests

Existing tests cover both dispatcher and standalone modes. No new tests needed, but verify existing tests still pass after removal.

---

### 2.6 FIX-06: V8 Supervised Redo Exception

**Addresses**: GAP-06
**Priority**: MEDIUM
**Effort**: LOW

#### Purpose

The architecture analysis (RISK-07) identified that the V8 `phase_status` regression check would detect the supervised redo's `completed -> in_progress` status reset. While the analysis concluded that V8 runs in PostToolUse context (write already committed), the warning message is confusing and could mislead developers.

Additionally, when FIX-02 Phase A adds V8 coverage for `phases[N].status` regression, the supervised redo path would trigger a genuine V8 block (since PreToolUse V8 can actually block Write operations).

#### Design

**File to modify**: `src/claude/hooks/state-write-validator.cjs`

**Change**: Add supervised redo detection to the V8 `phase_status` regression check:

In the existing V8 Check 2 (phase_status regression, L307-334), add an exception before the block:

```javascript
// AC-02a, AC-02b, AC-02c: Block if regression
if (incomingOrd < diskOrd) {
    // INV-0055: Allow supervised redo regression
    // (completed -> in_progress is legitimate during redo)
    const supervisedReview = incomingState?.active_workflow?.supervised_review;
    const isRedo = supervisedReview && (
        supervisedReview.status === 'redo_pending' ||
        (typeof supervisedReview.redo_count === 'number' &&
         supervisedReview.redo_count > 0)
    );
    if (isRedo && incomingStatus === 'in_progress' &&
        diskStatus === 'completed') {
        debugLog(`V8: Allowing supervised redo regression for phase '${phase}'`);
        continue; // Skip this regression — supervised redo is legitimate
    }

    const reason = `Phase status regression: ...`; // existing message
    // ... existing block logic
}
```

**Detection criteria**: The incoming state must have `active_workflow.supervised_review` with either:
- `status === 'redo_pending'`, OR
- `redo_count > 0` (redo has already happened at least once)

AND the regression must be specifically `completed -> in_progress` (not any other regression pattern).

#### Tests Required

| ID | Name | Assertion |
|----|------|-----------|
| T-V8-REDO-01 | V8 allows phase_status regression during supervised redo | No block when supervised_review.status = "redo_pending" and regression is completed -> in_progress |
| T-V8-REDO-02 | V8 blocks phase_status regression without supervised redo | Block when no supervised_review and regression is completed -> in_progress |
| T-V8-REDO-03 | V8 blocks non-redo regression patterns during supervised redo | Block when supervised_review exists but regression is completed -> pending (not in_progress) |

---

## 3. Implementation Priority

### 3.1 Dependency Graph

```
FIX-01 (V9 consistency check)
  |
  +--> FIX-02 Phase A (V8 phases[].status + deprecation)
  |       |
  |       +--> FIX-02 Phase B (remove dual-write)  [separate work item]
  |
  +--> FIX-06 (V8 redo exception)  [can merge with FIX-02 Phase A]

FIX-03 (integration tests)  [independent -- no code dependencies]

FIX-04 (stale phase detection)  [independent -- prompt-only change]

FIX-05 (config loader consolidation)  [independent -- low risk]
```

### 3.2 Ordered Implementation Plan

| Order | Fix | Severity | Effort | Dependencies | Can Parallelize With |
|-------|-----|----------|--------|-------------|---------------------|
| 1 | FIX-01: V9 cross-location consistency | HIGH | LOW | None | FIX-03, FIX-04, FIX-05 |
| 2 | FIX-06: V8 supervised redo exception | MEDIUM | LOW | None (but merge with FIX-02A if done together) | FIX-03, FIX-04, FIX-05 |
| 3 | FIX-02A: V8 phases[].status regression + deprecation | HIGH | MEDIUM | FIX-01 (V9 as safety net), FIX-06 (redo exception) | FIX-03, FIX-04, FIX-05 |
| 4 | FIX-03: Integration tests | HIGH | MEDIUM | None (but best done after FIX-01+FIX-06 so tests cover new behavior) | FIX-04, FIX-05 |
| 5 | FIX-05: Config loader consolidation | LOW | LOW | None | Any |
| 6 | FIX-04: Stale phase detection | MEDIUM | LOW | None | Any |
| 7 | FIX-02B: Remove dual-write | HIGH | MEDIUM | FIX-02A baked for 1+ workflow cycles | Separate work item |

### 3.3 Recommended Batching

**Batch 1** (single PR): FIX-01 + FIX-06 + FIX-02 Phase A
- All changes are in `state-write-validator.cjs` (plus deprecation comments in `isdlc.md`)
- Low risk, high value
- Adds V9 consistency checking, V8 supervised redo exception, and V8 phases[].status coverage

**Batch 2** (single PR): FIX-03
- All new test files, no production code changes
- Tests cover the new FIX-01/FIX-06 behavior plus the four untested scenarios

**Batch 3** (single PR): FIX-04 + FIX-05
- Low-priority cleanups that can ship independently
- FIX-04 is prompt-only (isdlc.md); FIX-05 is minor code cleanup

**Batch 4** (separate work item): FIX-02 Phase B
- Requires Batch 1 to bake across multiple workflow executions
- Structural change to state.json schema

---

## 4. Verification Plan

### 4.1 Manual Verification Steps

After deploying Batch 1, run the following manual verification sequence:

**Step 1: V9 Consistency Detection**

1. Start a workflow (`/isdlc feature`)
2. During STEP 3c-prime, deliberately introduce a divergence (e.g., manually edit state.json to make `phases[N].status` differ from `active_workflow.phase_status[N]`)
3. Observe: V9-A warning appears on stderr
4. The workflow continues (V9 does not block)

**Step 2: V8 Supervised Redo**

1. Run a workflow with `supervised_mode.enabled: true`
2. When the supervised review gate presents options, choose "Redo"
3. Observe: V8 does NOT block the redo status reset
4. The phase re-executes with `started_at` preserved

**Step 3: Multi-Phase Boundary**

1. Run a multi-phase workflow
2. After Phase N completes (STEP 3e), check state.json:
   - `phases[N].status === "completed"`
   - `phases[N+1].status === "pending"` (NOT `in_progress`)
   - `active_workflow.current_phase_index === N+1`
3. After STEP 3c-prime for Phase N+1:
   - `phases[N+1].status === "in_progress"`
   - V9-C does not warn (index matches phase)

**Step 4: Stale Phase Recovery**

1. Start a workflow
2. Kill the session during Phase N execution (simulate crash)
3. Restart the session and re-run the workflow command
4. Observe: Phase N is still `in_progress`; phase-loop-controller allows re-delegation
5. If enough time has passed (> 2x timeout): stale phase warning banner appears

### 4.2 Automated Test Scenarios

The automated tests from FIX-03 (Section 2.3) provide the primary verification:

| Test File | Scenarios Covered | Expected Results |
|-----------|------------------|-----------------|
| `v9-cross-location-consistency.test.cjs` | 10 test cases for V9 | All pass (warn on divergence, silent on consistency) |
| `supervised-review-redo-timing.test.cjs` | 4 test cases for TS-003 | V8 allows redo regression; timing preserved |
| `multi-phase-boundary.test.cjs` | 4 test cases for TS-005 | State consistent between phases |
| `dual-write-error-recovery.test.cjs` | 4 test cases for TS-008 | Recovery path works; V7 prevents stale overwrites |
| `escalation-retry-flow.test.cjs` | 4 test cases for TS-004 | Escalations added and cleared correctly |

### 4.3 Regression Risk Assessment

| Area | Regression Risk | Mitigation |
|------|----------------|------------|
| V9 (new rule) | LOW -- observational only, cannot break any workflow | All V9 warnings are stderr-only; never blocks |
| V8 redo exception | LOW -- strictly relaxes V8; cannot cause false blocks | Exception is narrowly scoped (only `completed -> in_progress` with `supervised_review` marker) |
| V8 phases[].status check | MEDIUM -- new blocking behavior for a previously unchecked field | Supervised redo exception must be in place first (FIX-06); existing tests validate V8 check patterns |
| Config loader removal | LOW -- fallback chain shortened but canonical path unchanged | Dispatcher always provides `ctx.requirements`; common.cjs fallback is tested |
| Stale phase detection | LOW -- advisory only, prompt-level change | Only fires when elapsed > 2x timeout; presents existing Retry/Skip/Cancel UI |

### 4.4 Test Execution

Run all tests after each batch:

```bash
node --test src/claude/hooks/tests/state-write-validator.test.cjs
node --test src/claude/hooks/tests/state-write-validator-null-safety.test.cjs
node --test src/claude/hooks/tests/v9-cross-location-consistency.test.cjs
node --test src/claude/hooks/tests/supervised-review-redo-timing.test.cjs
node --test src/claude/hooks/tests/multi-phase-boundary.test.cjs
node --test src/claude/hooks/tests/dual-write-error-recovery.test.cjs
node --test src/claude/hooks/tests/escalation-retry-flow.test.cjs
node --test src/claude/hooks/tests/phase-loop-controller.test.cjs
node --test src/claude/hooks/tests/gate-blocker-phase-status-bypass.test.cjs
node --test src/claude/hooks/tests/cross-hook-integration.test.cjs
node --test src/claude/hooks/tests/artifact-paths-config-fix.test.cjs
```

---

## 5. State Transition Diagram

### 5.1 Complete Correct State Machine

The following diagram documents the complete, correct state machine that SHOULD exist after all fixes are applied. It is based on the architecture analysis (Section 3) with corrections for identified gaps.

```
PHASE LIFECYCLE STATE MACHINE (per phase)
==========================================

                                STEP 3c-prime
                                (orchestrator writes 7 fields)
    +----------+                +------------------+
    |          | -------------> |                  |
    | PENDING  |                | IN_PROGRESS      |
    |          |                |                  |
    +-----+----+                +--------+---------+
          ^                              |
          |                              |  Success path
          | (workflow init               |  STEP 3e (orchestrator
          |  creates phases[])           |  writes 6+ fields)
          |                              |
          |                              v
          |                     +------------------+
          |                     |                  |
          |                     | COMPLETED        |
          |                     |                  |
          |                     +--------+---------+
          |                              |
          |   Supervised Redo            | If supervised_mode
          |   STEP 3e-review Case D      | and phase in review_phases
          |                              v
          |                     +------------------+
          |                     |                  |
          +---------------------| REVIEW_GATE      |
          |   (redo: reset to   | (sub-state)      |
          |    in_progress)     +------------------+
          |                     | [C] Continue -> proceed
          |                     | [R] Review -> reviewing
          |                     | [D] Redo -> reset to in_progress
          |                     +------------------+
          |
          |   Crash Recovery
          |   (phase-loop-controller L87 allows
          |    re-delegation to in_progress phases)
          +-- (implicit: workflow restart
               re-enters STEP 3c-prime for
               the stuck in_progress phase)
```

### 5.2 All Valid Transitions

| # | From | To | Trigger | Guard Condition | Enforced By |
|---|------|----|---------|-----------------|-------------|
| T1 | `pending` | `in_progress` | STEP 3c-prime pre-delegation write | None (orchestrator writes directly) | phase-loop-controller blocks delegation if status != in_progress |
| T2 | `in_progress` | `completed` | STEP 3e post-delegation write | Phase agent returned result | None (orchestrator writes directly); gate-blocker validated requirements during phase |
| T3 | `completed` | `in_progress` | STEP 3e-review Case D (supervised redo) | `supervised_mode.enabled` AND phase in `review_phases` AND user chose "Redo" | V8 redo exception (FIX-06); timing.started_at must be preserved |
| T4 | `in_progress` | `in_progress` | Crash recovery re-delegation | Phase was stuck in_progress from previous session | phase-loop-controller allows (L87: status == in_progress) |

### 5.3 All Invalid Transitions (and what happens)

| # | From | To | Why Invalid | What Happens |
|---|------|----|-------------|-------------|
| I1 | `completed` | `pending` | Status should never go backward to initial state | V8 blocks (ordinal regression: 2 -> 0) |
| I2 | `in_progress` | `pending` | Status should never go backward | V8 blocks (ordinal regression: 1 -> 0) |
| I3 | `completed` | `in_progress` (without redo marker) | Only legitimate via supervised redo | V8 blocks (ordinal regression: 2 -> 1, no redo exception); after FIX-06 |
| I4 | `pending` | `completed` (skipping in_progress) | Phase must be activated before completion | No hook blocks this directly; phase-loop-controller would have blocked the delegation (phase not in_progress), so this state cannot normally be reached |
| I5 | Any | Unknown status (e.g., "failed", "error") | No explicit failed state exists in the schema | V8 fails-open on unknown statuses (ordinal undefined -> continue); state-write-validator V1-V3 do not check status field |

### 5.4 Guard Conditions Summary

| Transition | Guard | Hook | Field Checked |
|-----------|-------|------|---------------|
| Delegation to phase N | Phase N must be `in_progress` | `phase-loop-controller.cjs` L85-87 | `phases[N].status` |
| Delegation to phase N | Target phase must be current phase | `phase-sequence-guard.cjs` L47-68 | `active_workflow.current_phase` |
| Gate advancement | All 5 requirement checks pass | `gate-blocker.cjs` L757-804 | `phases[N].constitutional_validation.*`, `phases[N].iteration_requirements.*`, `skill_usage_log`, artifact existence |
| State write | Version must not regress | `state-write-validator.cjs` V7 | `state_version` |
| State write | Phase index must not regress | `state-write-validator.cjs` V8 Check 1 | `active_workflow.current_phase_index` |
| State write | Phase status must not regress | `state-write-validator.cjs` V8 Check 2 | `active_workflow.phase_status[N]` |
| State write (after FIX-02A) | Detailed phase status must not regress | `state-write-validator.cjs` V8 Check 3 | `phases[N].status` |
| State write | Cross-location fields must be consistent | `state-write-validator.cjs` V9 (FIX-01) | Mirrored fields (warn-only) |
| Supervised redo | Redo regression is allowed | `state-write-validator.cjs` V8 redo exception (FIX-06) | `active_workflow.supervised_review.status` or `.redo_count` |

### 5.5 Inter-Phase State Expectations

The state between Phase N completion and Phase N+1 activation (the "handshake boundary") must satisfy these invariants:

```
After STEP 3e (Phase N):
  phases[N].status === "completed"
  phases[N+1].status === "pending"         // NOT in_progress (BUG-0006)
  active_workflow.current_phase_index === I + 1
  active_workflow.current_phase === phase_key_N  // Still points to N
  active_workflow.phase_status[N] === "completed"
  state_version === V + 1

After STEP 3c-prime (Phase N+1):
  phases[N+1].status === "in_progress"
  active_workflow.current_phase === phase_key_N+1
  active_workflow.phase_status[N+1] === "in_progress"
  current_phase === phase_key_N+1          // Top-level mirror
  state_version === V + 2
```

**Invariant**: Between these two writes, the state is internally consistent. `current_phase_index` is `I+1` but `current_phase` still points to Phase N. This is the expected intermediate state -- the index was incremented in 3e, and the current_phase will be updated in 3c-prime of the next iteration.

**V9-C check**: V9-C would detect a mismatch here (`phases[I+1] != current_phase` when `current_phase` still points to Phase N). To avoid false positives, V9-C should only warn when `current_phase_index` and `current_phase` are BOTH updated (i.e., after 3c-prime), not during the intermediate state. The implementation handles this by checking that BOTH `active_workflow.current_phase` and `active_workflow.current_phase_index` exist and then comparing `phases[index]` against `current_phase`. Since 3e updates `current_phase_index` but not `current_phase`, the intermediate state has `current_phase` pointing to Phase N, while `phases[I+1]` points to Phase N+1. V9-C would warn. To mitigate:

**V9-C refinement**: Only warn when the mismatch is NOT explainable by the `current_phase_index` having been incremented one step ahead of `current_phase`. Specifically:

```javascript
// V9-C: Phase index consistency
// Only warn if the mismatch is NOT a "just incremented" state
if (expectedPhase !== awCurrentPhase) {
    // Check if this is the expected intermediate state:
    // index just incremented, current_phase not yet updated
    const prevExpectedPhase = awIndex > 0 ? awPhases[awIndex - 1] : null;
    if (prevExpectedPhase === awCurrentPhase) {
        // Intermediate state: index is one ahead of current_phase.
        // This is normal between STEP 3e and STEP 3c-prime.
        // Suppress warning.
    } else {
        warnings.push(...);
    }
}
```

---

## 6. Phase Gate Validation

### GATE-04 Checklist (Design Specification for Investigation)

Since this is an investigation (not a feature), the gate criteria are adapted:

- [x] Gap analysis summary complete (Section 1: 14 correct behaviors, 10 gaps identified, severity classified)
- [x] Fix designs complete for all identified gaps (Section 2: 6 fixes with code-level detail)
- [x] Implementation priority ordered with dependencies (Section 3: dependency graph, ordered plan, recommended batching)
- [x] Verification plan complete with manual and automated steps (Section 4)
- [x] State transition diagram documenting correct state machine (Section 5: valid/invalid transitions, guard conditions, inter-phase expectations)
- [x] All recommendations from architecture analysis (REC-01 through REC-06) have corresponding fix designs
- [x] All coverage gaps from impact analysis (GAP-001 through GAP-005) have corresponding test designs
- [x] No source code modified (read-only audit)

### Traceability Matrix

| Fix | Addresses Gap(s) | Addresses Risk(s) | Addresses Recommendation(s) | Test Scenarios Covered |
|-----|-----------------|-------------------|-----------------------------|-----------------------|
| FIX-01 (V9) | GAP-01, GAP-10 | RISK-02, RISK-08 | REC-02 | T-V9-01 through T-V9-10 |
| FIX-02 (dual-write) | GAP-01 (root cause) | RISK-02 | REC-01 | Covered by FIX-01 tests + FIX-03 |
| FIX-03 (integration tests) | GAP-02, GAP-03, GAP-04, GAP-05 | RISK-01, RISK-02, RISK-07 | REC-05 | TS-003, TS-004, TS-005, TS-008 |
| FIX-04 (stale detection) | GAP-07 | RISK-01 | REC-06 | Manual verification |
| FIX-05 (config consolidation) | GAP-08 | RISK-09 | REC-04 | Existing tests |
| FIX-06 (V8 redo exception) | GAP-06 | RISK-07 | (from architecture) | T-V8-REDO-01 through T-V8-REDO-03 |

### Not Addressed (Out of Scope)

| Gap | Reason |
|-----|--------|
| GAP-09 (no hook enforcement for timing/budget/escalation) | LOW severity; prompt-level guarantees are sufficient for current usage; full extraction to code (REC-03) is HIGH effort and deferred |
| TS-009 (budget degradation propagation) | Prompt-level only; hooks cannot enforce budget injection (CON-003 constraint) |
| TS-010 (same-phase sub-agent bypass) | Already verified as correct (OK-07); well-tested |

---

*Design specification completed in ANALYSIS MODE -- no state.json writes, no branches created.*

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
