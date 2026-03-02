# Module Design: Phase Handshake Audit Fixes

**Requirement ID**: REQ-0020
**Source**: GitHub Issue #55
**Phase**: 04-design (implementation mode)
**Generated**: 2026-02-20
**Based On**: requirements-spec.md, impact-analysis.md, architecture-overview.md, design-spec.md
**Artifact Folder**: `phase-handshake-audit-GH-55`

---

## Table of Contents

1. [Per-File Change Specifications](#1-per-file-change-specifications)
   - 1.1 [state-write-validator.cjs](#11-state-write-validatorcjs)
   - 1.2 [isdlc.md](#12-isdlcmd)
   - 1.3 [gate-blocker.cjs](#13-gate-blockercjs)
   - 1.4 [iteration-corridor.cjs](#14-iteration-corridorcjs)
2. [V9 Rule Implementation](#2-v9-rule-implementation)
3. [V8 Extensions](#3-v8-extensions)
4. [Test File Designs](#4-test-file-designs)
5. [Config Loader Consolidation](#5-config-loader-consolidation)
6. [Implementation Sequence](#6-implementation-sequence)
7. [Traceability](#7-traceability)
8. [Validation Checklist (GATE-04)](#8-validation-checklist-gate-04)

---

## 1. Per-File Change Specifications

### 1.1 state-write-validator.cjs

**File**: `src/claude/hooks/state-write-validator.cjs`
**Current LOC**: 497
**Estimated After**: ~620
**REQs**: REQ-001, REQ-002, REQ-003

This file receives three changes in this order: (1) supervised redo exception in V8 Check 2, (2) new V8 Check 3 for `phases[].status`, and (3) new V9 `checkCrossLocationConsistency()` function.

#### 1.1.1 Change A: V8 Supervised Redo Exception (REQ-003)

**Location**: Inside `checkPhaseFieldProtection()`, lines 322-333 (V8 Check 2 regression block)

**Current code** (lines 322-333):
```javascript
// AC-02a, AC-02b, AC-02c: Block if regression
if (incomingOrd < diskOrd) {
    const reason = `Phase status regression: phase '${phase}' changed from '${diskStatus}' to '${incomingStatus}'. Subagents must not regress phase_status. Re-read state.json.`;
    console.error(`[state-write-validator] V8 BLOCK: ${reason}`);
    logHookEvent('state-write-validator', 'block', {
        reason: `V8: phase_status '${phase}' ${diskStatus} -> ${incomingStatus}`
    });
    return {
        decision: 'block',
        stopReason: reason
    };
}
```

**Modified code**:
```javascript
// AC-02a, AC-02b, AC-02c: Block if regression
if (incomingOrd < diskOrd) {
    // INV-0055 REQ-003: Allow supervised redo regression
    // (completed -> in_progress is legitimate during supervised redo)
    const supervisedReview = incomingState?.active_workflow?.supervised_review;
    const isRedo = supervisedReview && (
        supervisedReview.status === 'redo_pending' ||
        (typeof supervisedReview.redo_count === 'number' &&
         supervisedReview.redo_count > 0)
    );
    if (isRedo && incomingStatus === 'in_progress' &&
        diskStatus === 'completed') {
        debugLog(`V8: Allowing supervised redo regression for phase_status '${phase}'`);
        logHookEvent('state-write-validator', 'allow', {
            reason: `V8: supervised redo phase_status '${phase}' completed -> in_progress`
        });
        continue; // Skip this regression -- supervised redo is legitimate
    }

    const reason = `Phase status regression: phase '${phase}' changed from '${diskStatus}' to '${incomingStatus}'. Subagents must not regress phase_status. Re-read state.json.`;
    console.error(`[state-write-validator] V8 BLOCK: ${reason}`);
    logHookEvent('state-write-validator', 'block', {
        reason: `V8: phase_status '${phase}' ${diskStatus} -> ${incomingStatus}`
    });
    return {
        decision: 'block',
        stopReason: reason
    };
}
```

**Behavioral change**: When `supervised_review.status === 'redo_pending'` OR `supervised_review.redo_count > 0`, and the regression is specifically `completed -> in_progress`, the block is skipped. All other regressions (e.g., `completed -> pending`, `in_progress -> pending`) are still blocked even with a redo marker.

**Acceptance criteria covered**: AC-003a, AC-003b, AC-003c, AC-003d

---

#### 1.1.2 Change B: V8 Check 3 for phases[].status Regression (REQ-002)

**Location**: Inside `checkPhaseFieldProtection()`, after the Check 2 loop closing brace (line 335), before the `return null;` at line 338.

**New code to insert between lines 335 and 337**:

```javascript
// --- Check 3: phases[].status regression (INV-0055 REQ-002) ---
// Mirrors Check 2 but reads from the detailed phases object.
// Same supervised redo exception applies.
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

        if (incomingOrd < diskOrd) {
            // INV-0055 REQ-003: Allow supervised redo regression
            const supervisedReview = incomingState?.active_workflow?.supervised_review;
            const isRedo = supervisedReview && (
                supervisedReview.status === 'redo_pending' ||
                (typeof supervisedReview.redo_count === 'number' &&
                 supervisedReview.redo_count > 0)
            );
            if (isRedo && incomingStatus === 'in_progress' &&
                diskStatus === 'completed') {
                debugLog(`V8: Allowing supervised redo regression for phases['${phase}'].status`);
                logHookEvent('state-write-validator', 'allow', {
                    reason: `V8: supervised redo phases['${phase}'].status completed -> in_progress`
                });
                continue;
            }

            const reason = `Phase status regression: phases['${phase}'].status changed from '${diskStatus}' to '${incomingStatus}'. Subagents must not regress phase status. Re-read state.json.`;
            console.error(`[state-write-validator] V8 BLOCK: ${reason}`);
            logHookEvent('state-write-validator', 'block', {
                reason: `V8: phases['${phase}'].status ${diskStatus} -> ${incomingStatus}`
            });
            return {
                decision: 'block',
                stopReason: reason
            };
        }
    }
}
```

**Function signature**: No change -- this code is added inside the existing `checkPhaseFieldProtection()`.

**Behavioral change**: State writes that regress `phases[N].status` from `completed` to `pending` or `in_progress` (without redo marker) are now blocked. Forward transitions are unaffected.

**Acceptance criteria covered**: AC-002a, AC-002b, AC-002c

---

#### 1.1.3 Change C: V9 Cross-Location Consistency Check (REQ-001)

**Location**: New function added before the `check()` function (before line 346 in current file; will be after ~line 395 after Changes A and B).

##### Function: `checkCrossLocationConsistency()`

**Signature**:
```javascript
/**
 * Rule V9: Cross-location consistency check (INV-0055 REQ-001).
 *
 * Validates that mirrored state fields are in sync after a state write.
 * Observational only: warns on stderr, never blocks.
 *
 * Checks:
 *   V9-A: phases[N].status == active_workflow.phase_status[N]
 *   V9-B: current_phase (top-level) == active_workflow.current_phase
 *   V9-C: active_workflow.phases[index] == active_workflow.current_phase
 *          (with intermediate state suppression)
 *
 * @param {string} filePath - Path to the state.json file
 * @param {object} toolInput - The tool_input from the hook event
 * @param {string} toolName - 'Write' or 'Edit'
 * @returns {{ warnings: string[] }}
 */
function checkCrossLocationConsistency(filePath, toolInput, toolName)
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `filePath` | `string` | Absolute path to the state.json file being written |
| `toolInput` | `object` | The `tool_input` from the hook event; for Write events, contains `.content` as a JSON string |
| `toolName` | `string` | `'Write'` or `'Edit'` |

**Return value**:
| Field | Type | Description |
|-------|------|-------------|
| `warnings` | `string[]` | Array of warning messages (empty if all checks pass) |

**Implementation**:

```javascript
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
                return { warnings }; // Fail-open: malformed JSON
            }
        } else {
            // Edit events: read from disk (Edit modifies in-place)
            try {
                stateData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                return { warnings }; // Fail-open: read error
            }
        }

        if (!stateData || typeof stateData !== 'object') {
            return { warnings };
        }

        const phases = stateData.phases;
        const aw = stateData.active_workflow;

        // V9-A: Phase status mirroring
        // Compare phases[N].status vs active_workflow.phase_status[N]
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
        // Compare top-level current_phase vs active_workflow.current_phase
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
        // Compare active_workflow.phases[index] vs active_workflow.current_phase
        // With intermediate state suppression: between STEP 3e and STEP 3c-prime,
        // the index is one ahead of current_phase. This is expected.
        const awIndex = aw?.current_phase_index;
        const awPhases = aw?.phases;
        if (typeof awIndex === 'number' && Array.isArray(awPhases) &&
            awIndex >= 0 && awIndex < awPhases.length && awCurrentPhase) {
            const expectedPhase = awPhases[awIndex];
            if (expectedPhase && expectedPhase !== awCurrentPhase) {
                // Check for intermediate state: index just incremented,
                // current_phase not yet updated (normal between 3e and 3c-prime)
                const prevExpectedPhase = awIndex > 0
                    ? awPhases[awIndex - 1]
                    : null;
                if (prevExpectedPhase !== awCurrentPhase) {
                    // Not an intermediate state -- genuine mismatch
                    warnings.push(
                        `[state-write-validator] V9-C WARNING: ` +
                        `Phase index mismatch: ` +
                        `phases[${awIndex}]='${expectedPhase}' vs ` +
                        `current_phase='${awCurrentPhase}'. ` +
                        `Path: ${filePath}`
                    );
                }
            }
        }

    } catch (e) {
        // Fail-open: any unexpected error
        debugLog('V9 cross-location check error:', e.message);
    }

    return { warnings };
}
```

**Error handling**: Every code path that could throw is wrapped in try/catch. On any error, the function returns `{ warnings: [] }` (fail-open). No crashes, no false blocks.

---

##### Integration into `check()` function

**Location**: Inside `check()`, after the V8 call (after `if (v8Result && v8Result.decision === 'block') { return v8Result; }`) and before the V1-V3 validation block.

**New code to insert after line 401** (adjusted for Changes A and B):

```javascript
// Rule V9: Cross-location consistency (INV-0055 REQ-001)
const v9Result = checkCrossLocationConsistency(
    filePath, toolInput, input.tool_name
);
if (v9Result.warnings.length > 0) {
    for (const w of v9Result.warnings) {
        logHookEvent('state-write-validator', 'warn', {
            reason: w.replace(/^\[state-write-validator\]\s*V9-[A-C]\s*WARNING:\s*/, '')
        });
    }
    // Accumulate V9 warnings for the final response (never block)
    allWarnings.push(...v9Result.warnings);
}
```

**Critical change to `check()`**: The `allWarnings` array declaration (currently at line 430) must be moved BEFORE the V9 invocation so V9 warnings can be accumulated alongside V1-V3 warnings. Specifically:

1. Move the `const allWarnings = [];` declaration to just before the V9 call (after the V8 result check).
2. V9 pushes to `allWarnings`.
3. V1-V3 loop pushes to `allWarnings` (unchanged).
4. Final return uses `allWarnings` (unchanged).

**Revised `check()` structure** (lines after V8, showing the restructured flow):

```javascript
// ... V7 result check (unchanged) ...
// ... V8 result check (unchanged) ...

// Accumulate warnings from V9 and V1-V3 (moved up from line 430)
const allWarnings = [];

// Rule V9: Cross-location consistency (INV-0055 REQ-001)
const v9Result = checkCrossLocationConsistency(
    filePath, toolInput, input.tool_name
);
if (v9Result.warnings.length > 0) {
    for (const w of v9Result.warnings) {
        logHookEvent('state-write-validator', 'warn', {
            reason: w.replace(/^\[state-write-validator\]\s*V9-[A-C]\s*WARNING:\s*/, '')
        });
    }
    allWarnings.push(...v9Result.warnings);
}

// V1-V3: Validate state content for suspicious patterns
let stateData;
// ... (existing stateData parsing, unchanged) ...
// ... (existing V1-V3 loop, pushes to allWarnings, unchanged) ...

if (allWarnings.length > 0) {
    return { decision: 'allow', stderr: allWarnings.join('\n') };
}
return { decision: 'allow' };
```

---

#### 1.1.4 Version Header Update

Update the file header comment (line 16):

```
 * Version: 1.2.0
```

Change to:

```
 * Version: 1.3.0
```

Add V9 trace reference to the header (after line 15):

```
 * V9 traces to: INV-0055, REQ-001 (cross-location consistency check)
```

---

### 1.2 isdlc.md

**File**: `src/claude/commands/isdlc.md`
**Current LOC**: ~1754
**Estimated After**: ~1780
**REQs**: REQ-002 (deprecation), REQ-006 (stale detection)

#### 1.2.1 Change D: Deprecation Comments (REQ-002)

Add deprecation comments on every line that writes to `active_workflow.phase_status`. There are 4 locations:

**Location 1: STEP 3c-prime, step 4** (line 1136)

Current:
```
4. Set `active_workflow.phase_status[phase_key]` = `"in_progress"`
```

After:
```
4. Set `active_workflow.phase_status[phase_key]` = `"in_progress"` <!-- DEPRECATED (INV-0055): active_workflow.phase_status will be removed in Phase B. phases[phase_key].status (step 1) is authoritative. V9 cross-check validates consistency. -->
```

**Location 2: STEP 3e, step 5** (line 1277)

Current:
```
5. Set `active_workflow.phase_status[phase_key]` = `"completed"` (BUG-0005: sync phase_status map)
```

After:
```
5. Set `active_workflow.phase_status[phase_key]` = `"completed"` (BUG-0005: sync phase_status map) <!-- DEPRECATED (INV-0055): active_workflow.phase_status will be removed in Phase B. phases[phase_key].status (step 2) is authoritative. -->
```

**Location 3: STEP 3e-review Case D, step h.ii** (line 1443)

Current:
```
      ii. Set `active_workflow.phase_status[phase_key]` = `"in_progress"`
```

After:
```
      ii. Set `active_workflow.phase_status[phase_key]` = `"in_progress"` <!-- DEPRECATED (INV-0055): will be removed in Phase B. phases[phase_key].status (step h.i) is authoritative. -->
```

**Location 4: STEP 3e-review Case D, step j** (line 1452)

Current:
```
      - Set `active_workflow.phase_status[phase_key]` = `"completed"`
```

After:
```
      - Set `active_workflow.phase_status[phase_key]` = `"completed"` <!-- DEPRECATED (INV-0055): will be removed in Phase B. phases[phase_key].status is authoritative. -->
```

**Acceptance criteria covered**: AC-002d

---

#### 1.2.2 Change E: Stale Phase Detection (REQ-006)

**Location**: STEP 3b (line 1109), insert stale detection BEFORE the escalation check.

Current:
```
**3b.** Read `.isdlc/state.json` and check for `pending_escalations[]`.
```

After (replace the single line with the expanded block):

```
**3b.** Read `.isdlc/state.json`. Before checking escalations, perform stale phase detection:

**3b-stale.** STALE PHASE DETECTION (INV-0055 REQ-006):
1. Read `phases[current_phase_key].status` and `phases[current_phase_key].timing.started_at`
2. If `status === "in_progress"` AND `started_at` exists:
   a. Compute `elapsed_minutes = Math.round((Date.now() - new Date(started_at).getTime()) / 60000)`
   b. Read phase timeout from `iteration-requirements.json`: `phase_requirements[current_phase_key].timeout_minutes` (default: 120)
   c. If `elapsed_minutes > timeout * 2`:
      Display stale phase warning banner:
      ```
      ========================================
      WARNING: Stale Phase Detected
      Phase: {current_phase_key}
      Started: {started_at}
      Elapsed: {elapsed_minutes} minutes (timeout: {timeout} minutes)
      This phase may have been interrupted by a crash or timeout.
      ========================================
      ```
      Use `AskUserQuestion` with options:
      - **[R] Retry phase** -- Clear timing, re-run the phase from STEP 3c-prime
      - **[S] Skip phase** -- Mark phase completed with summary "Skipped (stale)", continue
      - **[C] Cancel workflow** -- Launch orchestrator with cancel action, stop loop
3. If status is not `in_progress`, or `started_at` is missing, or elapsed is within threshold: skip silently.

Then check for `pending_escalations[]` (existing behavior, unchanged).
```

**Acceptance criteria covered**: AC-006a, AC-006b, AC-006c, AC-006d

---

### 1.3 gate-blocker.cjs

**File**: `src/claude/hooks/gate-blocker.cjs`
**Current LOC**: 925
**Estimated After**: ~880
**REQ**: REQ-005

#### 1.3.1 Change F: Remove Local Config Loaders (REQ-005)

**Removals**:

1. **Remove `loadIterationRequirements()` function** (lines 35-53, 19 lines)
   The entire function body and JSDoc comment.

2. **Remove `loadWorkflowDefinitions()` function** (lines 58-76, 19 lines)
   The entire function body and JSDoc comment.

3. **Update requirements loading chain** (line 629)

   Current:
   ```javascript
   const requirements = ctx.requirements || loadIterationRequirementsFromCommon() || loadIterationRequirements();
   ```

   After:
   ```javascript
   const requirements = ctx.requirements || loadIterationRequirementsFromCommon();
   ```

4. **Update workflow loading chain** (lines 648-650)

   Current:
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

**No changes to standalone execution**: The `if (require.main === module)` block (lines ~896-925) imports `loadIterationRequirements` and `loadWorkflowDefinitions` directly from `common.cjs`, not from the local functions. It is unaffected.

**Acceptance criteria covered**: AC-005a, AC-005b, AC-005c, AC-005d

---

### 1.4 iteration-corridor.cjs

**File**: `src/claude/hooks/iteration-corridor.cjs`
**Current LOC**: 428
**Estimated After**: ~408
**REQ**: REQ-005

#### 1.4.1 Change G: Remove Local Config Loader (REQ-005)

**Removals**:

1. **Remove `loadIterationRequirements()` function** (lines 83-101, 19 lines)
   The entire function body and JSDoc comment.

2. **Update requirements loading chain** (line 276)

   Current:
   ```javascript
   const requirements = ctx.requirements || loadIterationRequirementsFromCommon() || loadIterationRequirements();
   ```

   After:
   ```javascript
   const requirements = ctx.requirements || loadIterationRequirementsFromCommon();
   ```

**Acceptance criteria covered**: AC-005a, AC-005b (same pattern as gate-blocker)

---

## 2. V9 Rule Implementation

### 2.1 checkCrossLocationConsistency() Function Specification

**Purpose**: Detect divergence between mirrored state.json fields after every state write. Observational only (warn, never block). This is the single highest-value fix because it catches the most dangerous silent failure mode: status divergence between `phases[N].status` and `active_workflow.phase_status[N]`.

**Location in execution pipeline**: After V8, before V1-V3 (see architecture-overview.md Section 2.3 for rationale).

### 2.2 Field Pairs Checked

| Check | Field A (Authoritative) | Field B (Mirror / Deprecated) | Warning Prefix |
|-------|------------------------|-------------------------------|---------------|
| V9-A | `phases[N].status` | `active_workflow.phase_status[N]` | `V9-A WARNING` |
| V9-B | `current_phase` (top-level) | `active_workflow.current_phase` | `V9-B WARNING` |
| V9-C | `active_workflow.phases[current_phase_index]` | `active_workflow.current_phase` | `V9-C WARNING` |

### 2.3 V9-C Intermediate State Suppression

Between STEP 3e and STEP 3c-prime, the state has:
- `current_phase_index` incremented to I+1
- `current_phase` still pointing to Phase N (not yet updated)

This means `phases[I+1]` (Phase N+1) differs from `current_phase` (Phase N). This is the expected "just incremented" intermediate state.

**Suppression logic**: If `phases[index - 1] === current_phase`, the mismatch is the expected intermediate state and V9-C suppresses the warning.

```javascript
const prevExpectedPhase = awIndex > 0 ? awPhases[awIndex - 1] : null;
if (prevExpectedPhase === awCurrentPhase) {
    // Intermediate state -- suppress V9-C warning
}
```

### 2.4 Error Handling (Fail-Open)

| Error Condition | Behavior |
|----------------|----------|
| `toolInput.content` is not a string | Return `{ warnings: [] }` |
| `JSON.parse(toolInput.content)` throws | Return `{ warnings: [] }` |
| `fs.readFileSync(filePath)` throws (Edit events) | Return `{ warnings: [] }` |
| `stateData` is null/undefined/non-object | Return `{ warnings: [] }` |
| `phases` or `active_workflow` is missing | Skip relevant checks, return any already-collected warnings |
| Any unexpected error in outer try/catch | `debugLog()` the error, return `{ warnings: [] }` |

### 2.5 Warning Message Format

Each warning follows a consistent format for log parsing:

```
[state-write-validator] V9-{A|B|C} WARNING: {description}. Path: {filePath}
```

**V9-A example**:
```
[state-write-validator] V9-A WARNING: Phase status divergence for '03-architecture': phases[].status='completed' vs active_workflow.phase_status[]='in_progress'. Path: /tmp/.isdlc/state.json
```

**V9-B example**:
```
[state-write-validator] V9-B WARNING: Current phase divergence: current_phase='03-architecture' vs active_workflow.current_phase='04-design'. Path: /tmp/.isdlc/state.json
```

**V9-C example**:
```
[state-write-validator] V9-C WARNING: Phase index mismatch: phases[3]='04-design' vs current_phase='02-impact-analysis'. Path: /tmp/.isdlc/state.json
```

### 2.6 Observability

Every V9 warning is logged via `logHookEvent()` with:
- Hook name: `'state-write-validator'`
- Event type: `'warn'`
- Reason: The warning text with the `[state-write-validator] V9-X WARNING: ` prefix stripped

---

## 3. V8 Extensions

### 3.1 V8 Check 3: phases[].status Regression (REQ-002)

**Purpose**: Close the gap where V8 only checked `active_workflow.phase_status` for regression, leaving `phases[N].status` unprotected. Check 3 mirrors Check 2 but reads from the detailed `phases` object.

**Ordinal map** (shared with Check 2):
```javascript
const PHASE_STATUS_ORDINAL = {
    'pending': 0,
    'in_progress': 1,
    'completed': 2
};
```

**Iteration pattern**: For each entry in `incomingState.phases`:
1. Look up the corresponding entry in `diskState.phases`
2. Extract `.status` from both
3. Compare ordinals
4. If `incomingOrd < diskOrd` AND NOT a supervised redo exception: BLOCK
5. If `incomingOrd < diskOrd` AND supervised redo exception: CONTINUE (skip)
6. If `incomingOrd >= diskOrd`: CONTINUE (forward transition, allowed)

**Fail-open conditions** (skip without blocking):
- `incomingPhases` or `diskPhases` is null/undefined/non-object
- `incomingData` or `diskData` is null/undefined/non-object
- `.status` is missing from either side
- Ordinal is undefined for either status value (unknown status string)

### 3.2 Supervised Redo Exception Logic (REQ-003)

The redo exception applies identically to both Check 2 and Check 3. The detection criteria are:

```javascript
function isSupervisdRedoException(incomingState, incomingStatus, diskStatus) {
    const supervisedReview = incomingState?.active_workflow?.supervised_review;
    const isRedo = supervisedReview && (
        supervisedReview.status === 'redo_pending' ||
        (typeof supervisedReview.redo_count === 'number' &&
         supervisedReview.redo_count > 0)
    );
    return isRedo &&
           incomingStatus === 'in_progress' &&
           diskStatus === 'completed';
}
```

**Note**: This is NOT extracted as a separate function in the implementation. The logic is inlined in both Check 2 and Check 3 for clarity and to avoid adding a function call for a 6-line check. However, the implementation agent MAY extract it if they prefer DRY. Both approaches are acceptable.

### 3.3 Redo Exception Criteria (All Must Be True)

| Criterion | Field | Required Value |
|-----------|-------|---------------|
| Redo marker present | `incomingState.active_workflow.supervised_review` | Non-null, non-undefined |
| Active redo state | `.status` or `.redo_count` | `status === 'redo_pending'` OR `redo_count > 0` |
| Regression direction | `diskStatus` -> `incomingStatus` | Specifically `'completed'` -> `'in_progress'` |

**Why narrow**: Only `completed -> in_progress` is allowed. `completed -> pending` is NEVER valid even during redo. `in_progress -> pending` is NEVER valid.

### 3.4 Block Message Format

Check 3 block messages follow the Check 2 pattern but reference `phases[].status`:

```
Phase status regression: phases['{phase}'].status changed from '{diskStatus}' to '{incomingStatus}'. Subagents must not regress phase status. Re-read state.json.
```

### 3.5 Complete V8 Check Order (After All Changes)

```
V8 Check 1: current_phase_index regression       -> BLOCK
V8 Check 2: active_workflow.phase_status regression
  -> [REQ-003] supervised redo exception check    -> CONTINUE
  -> BLOCK
V8 Check 3: phases[].status regression            -> NEW
  -> [REQ-003] supervised redo exception check    -> CONTINUE
  -> BLOCK
Return null (V8 passes)
```

---

## 4. Test File Designs

### 4.1 Test File: v9-cross-location-consistency.test.cjs

**File**: `src/claude/hooks/tests/v9-cross-location-consistency.test.cjs`
**REQ**: REQ-001 (via REQ-004)
**Test count**: 10
**Test runner**: `node:test`
**Pattern**: Standalone hook invocation via `spawnSync`

#### Setup/Teardown

```javascript
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'state-write-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v9-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

function writeStateFile(tmpDir, state) {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return statePath;
}

function runHook(tmpDir, stdinJson) {
    const stdinStr = typeof stdinJson === 'string'
        ? stdinJson : JSON.stringify(stdinJson);
    const result = spawnSync('node', [HOOK_PATH], {
        input: stdinStr,
        cwd: tmpDir,
        env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: tmpDir,
            SKILL_VALIDATOR_DEBUG: 'true'
        },
        encoding: 'utf8',
        timeout: 5000
    });
    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.status || 0
    };
}

function makeWriteStdinWithContent(filePath, content) {
    return {
        tool_name: 'Write',
        tool_input: {
            file_path: filePath,
            content: typeof content === 'string'
                ? content : JSON.stringify(content, null, 2)
        }
    };
}
```

#### Test Cases

| Test ID | Name | Description | State Setup | Incoming Content | Assertion |
|---------|------|-------------|-------------|-----------------|-----------|
| T-V9-01 | No warning when phases[N].status matches phase_status[N] | V9-A consistent | Disk: `phases['03-arch'].status = 'in_progress'`, `phase_status['03-arch'] = 'in_progress'` | Same state (version bumped) | stderr does NOT contain `V9-A` |
| T-V9-02 | Warn when phases[N].status diverges from phase_status[N] | V9-A divergent | Disk: `phases['03-arch'].status = 'completed'`, `phase_status['03-arch'] = 'in_progress'` | Same state (reflecting divergence) | stderr contains `V9-A WARNING` and both status values |
| T-V9-03 | No warning when current_phase matches aw.current_phase | V9-B consistent | Disk: `current_phase = '03-arch'`, `aw.current_phase = '03-arch'` | Same state | stderr does NOT contain `V9-B` |
| T-V9-04 | Warn when current_phase diverges from aw.current_phase | V9-B divergent | Disk: `current_phase = '03-arch'`, `aw.current_phase = '04-design'` | Same state | stderr contains `V9-B WARNING` |
| T-V9-05 | No warning when phases[index] matches current_phase | V9-C consistent | Disk: `index=2`, `phases[2]='03-arch'`, `current_phase='03-arch'` | Same state | stderr does NOT contain `V9-C` |
| T-V9-06 | Warn when phases[index] diverges from current_phase | V9-C genuine mismatch | Disk: `index=2`, `phases[2]='03-arch'`, `current_phase='04-design'` (not intermediate) | Same state | stderr contains `V9-C WARNING` |
| T-V9-07 | No warning when active_workflow is missing | Fail-open | Disk: no `active_workflow` | State without `active_workflow` | stderr empty (no V9 warnings) |
| T-V9-08 | No warning when phases is missing | Fail-open | Disk: no `phases` | State without `phases` | stderr empty (no V9 warnings) |
| T-V9-09 | V9 runs on Edit events (reads from disk) | Edit event | Disk: divergent state | Edit stdin (no content) | stderr contains `V9-A WARNING` (read from disk) |
| T-V9-10 | Fail-open on malformed JSON content | Error handling | Disk: valid state | Write stdin with `content: "not valid json {"` | No crash (exitCode 0), no V9 warnings |

#### Fixture: Base State Object

```javascript
const baseState = {
    state_version: 10,
    current_phase: '03-architecture',
    phases: {
        '01-requirements': {
            status: 'completed',
            constitutional_validation: { completed: true, iterations_used: 1 }
        },
        '02-impact-analysis': {
            status: 'completed',
            constitutional_validation: { completed: true, iterations_used: 1 }
        },
        '03-architecture': {
            status: 'in_progress',
            constitutional_validation: { completed: false }
        }
    },
    active_workflow: {
        type: 'feature',
        current_phase: '03-architecture',
        current_phase_index: 2,
        phases: [
            '01-requirements',
            '02-impact-analysis',
            '03-architecture',
            '04-design'
        ],
        phase_status: {
            '01-requirements': 'completed',
            '02-impact-analysis': 'completed',
            '03-architecture': 'in_progress'
        }
    }
};
```

---

### 4.2 Test File: supervised-review-redo-timing.test.cjs

**File**: `src/claude/hooks/tests/supervised-review-redo-timing.test.cjs`
**REQ**: REQ-004 (TS-003)
**Test count**: 4
**Test runner**: `node:test`

#### Test Cases

| Test ID | Name | Setup | Action | Assertion |
|---------|------|-------|--------|-----------|
| T-SR-01 | Redo preserves started_at | Disk: `phases['03-arch'].status='completed'`, `timing.started_at='2026-02-19T10:00:00Z'`, `timing.completed_at='2026-02-19T10:30:00Z'`, `supervised_review.status='redo_pending'`, `supervised_review.redo_count=1` | Write incoming: `status='in_progress'`, `timing.started_at` unchanged, `timing.completed_at=null`, `phase_status='in_progress'` | V8 does NOT block (redo exception). `started_at` is preserved in the incoming state. |
| T-SR-02 | Redo increments retries | Same as T-SR-01 | Incoming: `timing.retries=1` (was 0) | V8 does NOT block. `retries` is 1 in the written state. |
| T-SR-03 | Redo clears completed_at | Same as T-SR-01 | Incoming: `timing.completed_at=null` | V8 does NOT block. `completed_at` is null. |
| T-SR-04 | V8 blocks non-redo status regression | Disk: `phases['03-arch'].status='completed'`, NO `supervised_review` marker | Write incoming: `status='in_progress'` | V8 BLOCKS with regression message |

#### Fixture: Redo State Object

```javascript
function makeRedoState() {
    return {
        state_version: 6,
        current_phase: '03-architecture',
        phases: {
            '03-architecture': {
                status: 'completed',
                timing: {
                    started_at: '2026-02-19T10:00:00Z',
                    completed_at: '2026-02-19T10:30:00Z',
                    wall_clock_minutes: 30,
                    retries: 0
                },
                constitutional_validation: { completed: true, iterations_used: 1 }
            }
        },
        active_workflow: {
            type: 'feature',
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
}
```

---

### 4.3 Test File: multi-phase-boundary.test.cjs

**File**: `src/claude/hooks/tests/multi-phase-boundary.test.cjs`
**REQ**: REQ-004 (TS-005)
**Test count**: 4
**Test runner**: `node:test`
**Hooks tested**: `state-write-validator.cjs`, `phase-loop-controller.cjs`

#### Test Cases

| Test ID | Name | Setup | Action | Assertion |
|---------|------|-------|--------|-----------|
| T-MP-01 | Phase N completed, N+1 pending blocks delegation | After STEP 3e: `phases['03-arch'].status='completed'`, `phases['04-design'].status='pending'`, `current_phase_index=3` | Run phase-loop-controller for delegation to Phase 04-design agent | Blocks delegation (Phase N+1 is `pending`, not `in_progress`) |
| T-MP-02 | Phase N+1 activated allows delegation | After STEP 3c-prime: `phases['04-design'].status='in_progress'`, `current_phase='04-design'` | Run phase-loop-controller for delegation to Phase 04-design agent | Allows delegation |
| T-MP-03 | Forward transition pending to in_progress is allowed by V8 | Disk: `phases['04-design'].status='pending'`. Incoming: `phases['04-design'].status='in_progress'` | Run state-write-validator | V8 allows (forward transition) |
| T-MP-04 | State version increments across boundary writes | Disk version=5 | Write 1 (STEP 3e): version=6. Write 2 (STEP 3c-prime): version=7 | First write allowed (version 6 >= 5). Second write: create new disk with version=6, write version=7, allowed. |

#### Fixture: Boundary State Object

```javascript
function makeBoundaryState(afterStep) {
    if (afterStep === '3e') {
        return {
            state_version: 6,
            current_phase: '03-architecture', // Not yet updated
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'pending' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '03-architecture',
                current_phase_index: 3, // Incremented in 3e
                phases: ['01-requirements', '02-impact-analysis',
                         '03-architecture', '04-design'],
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'pending'
                }
            }
        };
    }
    if (afterStep === '3c-prime') {
        return {
            state_version: 7,
            current_phase: '04-design',
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'in_progress' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '04-design',
                current_phase_index: 3,
                phases: ['01-requirements', '02-impact-analysis',
                         '03-architecture', '04-design'],
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'in_progress'
                }
            }
        };
    }
}
```

---

### 4.4 Test File: dual-write-error-recovery.test.cjs

**File**: `src/claude/hooks/tests/dual-write-error-recovery.test.cjs`
**REQ**: REQ-004 (TS-008)
**Test count**: 4
**Test runner**: `node:test`
**Hooks tested**: `state-write-validator.cjs`, `phase-loop-controller.cjs`

#### Test Cases

| Test ID | Name | Setup | Action | Assertion |
|---------|------|-------|--------|-----------|
| T-DW-01 | Phase stuck in_progress allows re-delegation | After crash: `phases['03-arch'].status='in_progress'`, `timing.started_at` set, `timing.completed_at` absent | Run phase-loop-controller for delegation to same phase agent | Allows re-delegation (phase is in_progress, recovery path) |
| T-DW-02 | Dual-write consistent on partial failure | After crash: `phases['03-arch'].status='in_progress'`, `phase_status['03-arch']='in_progress'` | Run state-write-validator V9 check | No V9-A warning (both locations are consistent at 'in_progress') |
| T-DW-03 | V7 prevents stale overwrites on recovery | Disk version=6. Recovery attempt writes with version=5 | Run state-write-validator | V7 blocks the stale write |
| T-DW-04 | Timing data incomplete but not corrupted | After crash: `timing.started_at` set, `timing.completed_at` absent/null, `timing.wall_clock_minutes` absent/null | Assert on state structure | `started_at` is valid ISO string. `completed_at` is null. `wall_clock_minutes` is null/absent. |

#### Fixture: Crash Recovery State

```javascript
function makeCrashState() {
    return {
        state_version: 6,
        current_phase: '03-architecture',
        phases: {
            '03-architecture': {
                status: 'in_progress',
                timing: {
                    started_at: '2026-02-19T10:00:00Z',
                    retries: 0
                },
                constitutional_validation: { completed: false }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: '03-architecture',
            current_phase_index: 2,
            phases: ['01-requirements', '02-impact-analysis',
                     '03-architecture', '04-design'],
            phase_status: {
                '01-requirements': 'completed',
                '02-impact-analysis': 'completed',
                '03-architecture': 'in_progress'
            }
        }
    };
}
```

---

### 4.5 Test File: escalation-retry-flow.test.cjs

**File**: `src/claude/hooks/tests/escalation-retry-flow.test.cjs`
**REQ**: REQ-004 (TS-004)
**Test count**: 4
**Test runner**: `node:test`
**Hooks tested**: `gate-blocker.cjs`

#### Setup Requirements

This test file needs additional setup compared to the others because gate-blocker requires config files:

```javascript
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esc-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });

    // gate-blocker needs config files
    const configDir = path.join(tmpDir, '.claude', 'hooks', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const srcConfigDir = path.join(__dirname, '..', 'config');
    for (const file of ['iteration-requirements.json', 'skills-manifest.json']) {
        const srcPath = path.join(srcConfigDir, file);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(configDir, file));
        }
    }
    // Copy schema files
    const schemasDir = path.join(configDir, 'schemas');
    const srcSchemasDir = path.join(srcConfigDir, 'schemas');
    if (fs.existsSync(srcSchemasDir)) {
        fs.mkdirSync(schemasDir, { recursive: true });
        for (const f of fs.readdirSync(srcSchemasDir)) {
            fs.copyFileSync(path.join(srcSchemasDir, f), path.join(schemasDir, f));
        }
    }
    return tmpDir;
}
```

#### Test Cases

| Test ID | Name | Setup | Action | Assertion |
|---------|------|-------|--------|-----------|
| T-ER-01 | Gate blocker adds pending_escalation on missing requirements | State: Phase in_progress, `constitutional_validation.completed=false`, `iterations_used=0` | Run gate-blocker with a Task call containing "advance gate" | `pending_escalations` in output contains a `gate_blocked` entry |
| T-ER-02 | Escalation contains required fields | Same as T-ER-01 | Inspect the escalation entry from gate-blocker output | Entry has `type`, `hook`, `phase`, `detail`, `timestamp` fields |
| T-ER-03 | Multiple gate blocks accumulate | State: Phase with missing constitutional AND missing elicitation | Run gate-blocker | Output escalation(s) cover all missing requirements |
| T-ER-04 | Retry clears escalations | State: `pending_escalations=[{...}]`, then write `pending_escalations=[]` | Run state-write-validator on the clearing write | V7/V8 do not block the escalation-clearing write |

#### Fixture: Gate-Blocked State

```javascript
function makeGateBlockedState(phaseKey) {
    return {
        state_version: 10,
        current_phase: phaseKey,
        iteration_enforcement: { enabled: true },
        phases: {
            [phaseKey]: {
                status: 'in_progress',
                constitutional_validation: {
                    completed: false,
                    iterations_used: 0,
                    status: 'pending'
                },
                iteration_requirements: {
                    interactive_elicitation: {
                        completed: false,
                        menu_interactions: 0
                    }
                }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: phaseKey,
            current_phase_index: 0,
            phases: [phaseKey],
            phase_status: { [phaseKey]: 'in_progress' }
        },
        pending_escalations: []
    };
}
```

---

## 5. Config Loader Consolidation

### 5.1 Functions to Remove

| File | Function | Lines | Reason |
|------|----------|-------|--------|
| `gate-blocker.cjs` | `loadIterationRequirements()` | 35-53 | Duplicates `common.cjs` implementation; identical search paths |
| `gate-blocker.cjs` | `loadWorkflowDefinitions()` | 58-76 | Duplicates `common.cjs` implementation; identical search paths |
| `iteration-corridor.cjs` | `loadIterationRequirements()` | 83-101 | Duplicates `common.cjs` implementation; identical search paths |

### 5.2 Functions to Keep (Canonical Implementations)

| File | Function | Export Name |
|------|----------|-------------|
| `lib/common.cjs` | `loadIterationRequirements()` | `loadIterationRequirements` |
| `lib/common.cjs` | `loadWorkflowDefinitions()` | `loadWorkflowDefinitions` |

### 5.3 Import Changes

**gate-blocker.cjs** (lines 14-27): No import changes needed. The file already imports:
```javascript
loadIterationRequirements: loadIterationRequirementsFromCommon,
loadWorkflowDefinitions: loadWorkflowDefinitionsFromCommon
```

The local functions shadow these names. After removing the local functions, the aliased imports become the only implementations. The call sites at lines 629 and 648-650 simply drop the final fallback.

**iteration-corridor.cjs** (lines 19-29): No import changes needed. Same pattern:
```javascript
loadIterationRequirements: loadIterationRequirementsFromCommon
```

### 5.4 Fallback Chain (Before vs After)

**Before** (triple fallback):
```
ctx.requirements --> common.cjs loadIterationRequirements() --> local loadIterationRequirements()
```

**After** (double fallback):
```
ctx.requirements --> common.cjs loadIterationRequirements()
```

**Behavioral equivalence**: The local functions use identical search paths to `common.cjs`. In normal operation, `ctx.requirements` is always provided by the dispatcher. The local fallback was unreachable in practice.

### 5.5 Standalone Execution Paths

The `if (require.main === module)` blocks in both files import directly from `common.cjs` and are unaffected:

```javascript
// gate-blocker.cjs, line ~897
const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');
```

This imports `loadIterationRequirements` from `common.cjs` (not the removed local function).

---

## 6. Implementation Sequence

### 6.1 Ordered Steps

The implementation agent MUST follow this order. REQ-003 before REQ-002 is the critical ordering constraint.

| Step | REQ | Description | File(s) | Dependency |
|------|-----|-------------|---------|------------|
| 1 | REQ-003 | Add supervised redo exception to V8 Check 2 | `state-write-validator.cjs` | None |
| 2 | REQ-002 (partial) | Add V8 Check 3 for `phases[].status` regression with redo exception | `state-write-validator.cjs` | Step 1 (redo exception logic) |
| 3 | REQ-001 | Add V9 `checkCrossLocationConsistency()` function and integrate into `check()` | `state-write-validator.cjs` | None (independent, but do after Steps 1-2 to keep the file modifications sequential) |
| 4 | -- | Run existing tests to verify no regressions | `node --test src/claude/hooks/tests/state-write-validator.test.cjs` | Steps 1-3 |
| 5 | REQ-004 (partial) | Create `v9-cross-location-consistency.test.cjs` | `tests/` | Step 3 |
| 6 | REQ-004 (partial) | Create `supervised-review-redo-timing.test.cjs` | `tests/` | Steps 1-2 |
| 7 | REQ-004 (partial) | Create `multi-phase-boundary.test.cjs` | `tests/` | Steps 1-3 |
| 8 | REQ-004 (partial) | Create `dual-write-error-recovery.test.cjs` | `tests/` | Steps 1-3 |
| 9 | REQ-004 (partial) | Create `escalation-retry-flow.test.cjs` | `tests/` | None (tests gate-blocker) |
| 10 | -- | Run ALL tests (existing + new) | All test files | Steps 5-9 |
| 11 | REQ-005 | Remove local config loaders from gate-blocker.cjs | `gate-blocker.cjs` | None |
| 12 | REQ-005 | Remove local config loader from iteration-corridor.cjs | `iteration-corridor.cjs` | None |
| 13 | -- | Run gate-blocker and iteration-corridor tests | Existing test files | Steps 11-12 |
| 14 | REQ-002 (partial) | Add deprecation comments to isdlc.md | `isdlc.md` | None |
| 15 | REQ-006 | Add stale phase detection to isdlc.md STEP 3b | `isdlc.md` | None |

### 6.2 Batch Boundaries

**Batch 1** (Steps 1-10): All `state-write-validator.cjs` changes + all new test files
- Single PR containing REQ-001, REQ-002 (V8 Check 3), REQ-003, REQ-004
- All production code changes in one file
- All test files validate the new behavior

**Batch 2** (Steps 11-13): Config loader consolidation
- Single PR containing REQ-005
- Removes redundant code from gate-blocker.cjs and iteration-corridor.cjs

**Batch 3** (Steps 14-15): Prompt specification changes
- Single PR containing REQ-002 (deprecation) and REQ-006 (stale detection)
- All changes in isdlc.md (prompt-only, no hook code)

### 6.3 Why REQ-003 Before REQ-002

Without the supervised redo exception (REQ-003), adding V8 Check 3 (REQ-002) would cause the following failure:

1. User triggers supervised redo in STEP 3e-review Case D
2. Redo resets `phases[N].status` from `completed` to `in_progress`
3. V8 Check 3 detects `completed -> in_progress` as a regression
4. V8 BLOCKS the write (breaking supervised redo)

By implementing REQ-003 first, the redo exception is already in place when Check 3 is added. The exception allows the legitimate `completed -> in_progress` transition during redo.

---

## 7. Traceability

### Requirements to Changes

| REQ | Changes | Section |
|-----|---------|---------|
| REQ-001 | Change C (V9 function + check() integration) | 1.1.3 |
| REQ-002 | Change B (V8 Check 3) + Change D (deprecation) | 1.1.2, 1.2.1 |
| REQ-003 | Change A (redo exception in Check 2 + Check 3) | 1.1.1 |
| REQ-004 | Test files (Sections 4.1-4.5) | 4.x |
| REQ-005 | Changes F, G (config loader removal) | 1.3.1, 1.4.1 |
| REQ-006 | Change E (stale phase detection) | 1.2.2 |

### Acceptance Criteria Coverage

| AC | Change | Verified By |
|----|--------|-------------|
| AC-001a | V9-A in Change C | T-V9-02 |
| AC-001b | V9-B in Change C | T-V9-04 |
| AC-001c | V9-C in Change C (with suppression) | T-V9-05, T-V9-06 |
| AC-001d | Fail-open in Change C | T-V9-07, T-V9-08 |
| AC-001e | Edit path in Change C | T-V9-09 |
| AC-001f | Malformed JSON in Change C | T-V9-10 |
| AC-002a | V8 Check 3 blocks regression | T-SR-04, T-MP-03 |
| AC-002b | V8 Check 3 allows with redo | T-SR-01 |
| AC-002c | V8 Check 3 allows forward | T-MP-03 |
| AC-002d | Deprecation comments | Change D (manual verification) |
| AC-003a | Redo exception in Check 2 | T-SR-01 |
| AC-003b | Block without redo marker | T-SR-04 |
| AC-003c | Allow with redo_count > 0 | T-SR-02 |
| AC-003d | Block completed -> pending even with redo | Implementation constraint (only completed -> in_progress allowed) |
| AC-004a | Redo timing preservation | T-SR-01, T-SR-02, T-SR-03 |
| AC-004b | Multi-phase boundary blocking | T-MP-01 |
| AC-004c | Crash recovery re-delegation | T-DW-01 |
| AC-004d | Escalation field presence | T-ER-02 |
| AC-005a | Dispatcher-provided requirements | Change F (existing tests verify) |
| AC-005b | Standalone fallback to common.cjs | Change F (standalone execution unaffected) |
| AC-005c | Local functions removed | Change F, Change G |
| AC-005d | Existing tests pass | Step 13 in implementation sequence |
| AC-006a | Stale warning displayed | Change E (manual verification) |
| AC-006b | No warning within threshold | Change E (manual verification) |
| AC-006c | Same Retry/Skip/Cancel options | Change E (manual verification) |
| AC-006d | No warning for completed phases | Change E (manual verification) |

### Architecture Decision Traces

| ADR | Implementation |
|-----|---------------|
| ADR-001 (dual-write deprecation Phase A/B) | Changes B + D (V8 Check 3 + deprecation comments) |
| ADR-002 (V9 warn-only) | Change C (V9 never returns block) |
| ADR-003 (redo exception narrow scope) | Changes A + B (same redo criteria in Check 2 and Check 3) |
| ADR-004 (config loader reduction) | Changes F + G (remove local fallbacks) |

---

## 8. Validation Checklist (GATE-04)

### Design Completeness

- [x] Per-file change specifications complete (Section 1: 7 changes across 4 files)
- [x] All functions specified with signatures, parameters, return values (Section 1.1.3)
- [x] V9 rule implementation fully specified with field pairs (Section 2)
- [x] V8 extensions specified: Check 3 + redo exception logic (Section 3)
- [x] Test file designs complete: 5 test files, 26 test cases (Section 4)
- [x] Config loader consolidation: functions to remove/keep, import changes (Section 5)
- [x] Implementation sequence ordered with dependency explanation (Section 6)

### Traceability

- [x] All 6 REQs have corresponding changes (Section 7)
- [x] All 24 ACs have corresponding verification method (Section 7)
- [x] All 4 ADRs trace to specific implementation changes (Section 7)
- [x] Test cases trace to specific acceptance criteria

### Constitutional Compliance

- [x] Article I (Specification Primacy): Module design implements architecture specs exactly
- [x] Article IV (Explicit Over Implicit): All function signatures, parameters, return values documented; no ambiguous specifications
- [x] Article V (Simplicity First): V9 is one function; redo exception is 6 lines; no over-engineering
- [x] Article VII (Artifact Traceability): Every change traces to REQ, AC, and ADR
- [x] Article IX (Quality Gate Integrity): All required design artifacts present

### Downstream Readiness

- [x] Implementation agent can follow Section 6 step-by-step without ambiguity
- [x] Test agent can use Section 4 test designs to write tests without ambiguity
- [x] Code review agent can verify changes against the specifications in Section 1

---

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
