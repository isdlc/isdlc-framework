# Trace Analysis: Batch B Hook Bugs (0.6, 0.7, 0.11, 0.12)

**Generated**: 2026-02-15T13:15:00Z
**Bug**: Batch B -- 4 hook bugs affecting dispatcher, test-adequacy blocker, and menu tracker
**External ID**: BUG-0006
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

Four bugs traced across three hook files. All root causes confirmed with HIGH confidence through direct source code analysis. BUG 0.6 (dispatcher null context) is the highest-impact -- it affects all 9 consolidated hooks whenever state/config files are missing or malformed. BUG 0.7 (wrong phase detection) causes false-positive blocking of quality loop delegations due to incorrect prefix matching (`'16-'` matches `16-quality-loop` when only `15-upgrade` phases should match). BUG 0.11 (menu tracker unsafe init) is a defensive coding gap that only triggers with corrupted state. BUG 0.12 (timeout advisory-only) is a missing feature -- structured degradation hints for downstream consumers.

**Root Cause Confidence**: HIGH (all 4 bugs)
**Severity**: HIGH (0.6, 0.7), MEDIUM (0.11, 0.12)
**Estimated Complexity**: LOW (all 4 are narrow, targeted fixes)

---

## Symptom Analysis

### BUG 0.6: Dispatcher null context

**Error Pattern**: TypeError when hooks access properties on null context fields (e.g., `ctx.state.active_workflow`, `ctx.manifest.skills`, `ctx.requirements.phase_requirements`).

**Source Locations**:
- `pre-task-dispatcher.cjs` line 100: `const state = readState();` -- returns `null` when `.isdlc/state.json` missing or malformed
- `pre-task-dispatcher.cjs` line 103: `const manifest = loadManifest();` -- returns `null` when `skills-manifest.json` not found
- `pre-task-dispatcher.cjs` line 104: `const requirements = loadIterationRequirements();` -- returns `null` when `iteration-requirements.json` not found
- `pre-task-dispatcher.cjs` line 105: `const workflows = loadWorkflowDefinitions();` -- returns `null` when `workflows.json` not found
- `pre-task-dispatcher.cjs` line 108: `const ctx = { input, state, manifest, requirements, workflows };` -- passes null values through

**Confirmed Null Returns**: All four loader functions in `common.cjs` explicitly return `null` on file-not-found or parse error:
- `readState()` at common.cjs:629 and 635
- `loadManifest()` at common.cjs:744 and 750
- `loadIterationRequirements()` at common.cjs:1951 and 1955
- `loadWorkflowDefinitions()` at common.cjs:1979 and 1983

**Impact**: All 9 downstream hooks receive null context fields. The `hasActiveWorkflow` guard (line 55) uses optional chaining safely, but hooks that access other context fields without guards may crash silently (caught by fail-open try/catch) or behave incorrectly.

**Triggering Conditions**: Run dispatcher when any of the 4 config/state files are missing, corrupted, or inaccessible.

### BUG 0.7: test-adequacy-blocker fires on wrong phases

**Error Pattern**: Quality loop delegations (phase `16-quality-loop`) incorrectly trigger upgrade-specific test adequacy validation, causing false-positive blocks on non-upgrade workflows.

**Source Locations**:
- `test-adequacy-blocker.cjs` line 35: `return phase.startsWith('16-') ||` -- matches `16-quality-loop`
- `test-adequacy-blocker.cjs` line 36: `phase.startsWith('14-upgrade') ||` -- incorrect prefix (actual upgrade phases use `15-upgrade`)
- `test-adequacy-blocker.cjs` line 62: `return phase.startsWith('16-') || phase.startsWith('14-upgrade');` -- same wrong prefixes
- `pre-task-dispatcher.cjs` line 73: `return phase.startsWith('15-upgrade');` -- CORRECT prefix in dispatcher guard

**Prefix Confusion**: The codebase has three different phase prefix conventions in play:
- `14-upgrade` (used in test-adequacy-blocker, WRONG)
- `15-upgrade` (used in dispatcher shouldActivate, CORRECT -- matches actual workflow phase keys)
- `16-` (used in test-adequacy-blocker, WRONG -- matches quality loop)

**Impact**: When dispatcher runs standalone mode (not via consolidated dispatcher), or when `isUpgradeDelegation()` / `isUpgradePhaseActive()` are called by other code, quality loop phases falsely trigger upgrade checks. The consolidated dispatcher's shouldActivate guard at line 70-73 partially mitigates this by correctly gating on `'15-upgrade'`, but the exported functions remain buggy.

### BUG 0.11: Menu tracker unsafe nested initialization

**Error Pattern**: TypeError when `state.phases[currentPhase].iteration_requirements` is a truthy non-object value.

**Source Locations**:
- `menu-tracker.cjs` line 167: `if (!state.phases[currentPhase].iteration_requirements)` -- only checks falsiness
- `menu-tracker.cjs` line 172: `let elicitState = state.phases[currentPhase].iteration_requirements.interactive_elicitation;` -- accesses `.interactive_elicitation` on potentially non-object value

**Triggering Conditions**: Corrupt `state.json` where `iteration_requirements` is set to a truthy non-object value (e.g., `true`, `1`, `"corrupted"`). The falsy check at line 167 passes, but line 172 attempts property access on a non-object.

**Impact**: TypeError crashes the menu-tracker, caught by fail-open try/catch at line 250. Menu interactions are silently not tracked, potentially causing gate-blocker to block phase advancement due to missing elicitation data.

### BUG 0.12: Phase timeout advisory-only

**Error Pattern**: No structured degradation output when phase timeout exceeded.

**Source Locations**:
- `pre-task-dispatcher.cjs` lines 110-125: Timeout check block
- `pre-task-dispatcher.cjs` line 115: `console.error(...)` -- human-readable text only
- `pre-task-dispatcher.cjs` lines 116-119: `logHookEvent(...)` -- internal log only, not on stderr for downstream
- `common.cjs` lines 1993-2047: `checkPhaseTimeout()` -- returns `{ exceeded, elapsed, limit, phase }` but no action recommendations

**Impact**: Downstream agents/consumers have no machine-parsable signal to adjust behavior when phases exceed time budgets. Debate rounds continue at full intensity, optional sub-steps are not skipped, and no escalation occurs automatically.

---

## Execution Path

### BUG 0.6: Null context propagation path

```
main()
  -> readStdin() [line 88]
  -> readState() [line 100] -> returns null (file missing)
  -> loadManifest() [line 103] -> returns null (file missing)
  -> loadIterationRequirements() [line 104] -> returns null (file missing)
  -> loadWorkflowDefinitions() [line 105] -> returns null (file missing)
  -> ctx = { input, state: null, manifest: null, requirements: null, workflows: null } [line 108]
  -> HOOKS iteration [line 131]
     -> hook.shouldActivate(ctx) [line 132]
        -> hasActiveWorkflow: ctx.state?.active_workflow -> null?.active_workflow -> undefined -> false (SAFE)
     -> hook.check(ctx) [line 136]
        -> Each hook receives ctx with null fields
        -> Hooks that access ctx.state.X without optional chaining CRASH
        -> Caught by fail-open try/catch [line 153-156]
```

### BUG 0.7: False-positive upgrade detection path

```
Via Dispatcher (partially mitigated):
  main() -> HOOKS[7] (test-adequacy-blocker) [line 70-73]
  -> shouldActivate: phase.startsWith('15-upgrade') -> '16-quality-loop'.startsWith('15-upgrade') -> false
  -> SKIPPED (dispatcher guard is correct)

Via Standalone / Direct check() call:
  check(ctx)
  -> detectPhaseDelegation(input) [line 84]
  -> isUpgradeDelegation(delegation) [line 85]
     -> phase.startsWith('16-') [line 35] -> '16-quality-loop'.startsWith('16-') -> TRUE (BUG!)
  -> isUpgrade = true
  -> Enters upgrade adequacy check logic [line 96+]
  -> May block if coverage < 50% [line 156]

Via isUpgradePhaseActive(state) export:
  -> phase.startsWith('16-') [line 62] -> '16-quality-loop' -> TRUE (BUG!)
```

### BUG 0.11: Corrupted state crash path

```
check(ctx)
  -> state loaded [line 137]
  -> active_workflow check PASS [line 143]
  -> currentPhase = '01-requirements' [line 146]
  -> phase check PASS [line 147]
  -> detectMenuActivity(text) returns activity [line 157]
  -> state.phases exists [line 165]
  -> state.phases['01-requirements'] exists [line 166]
  -> !state.phases['01-requirements'].iteration_requirements [line 167]
     -> value is `true` (corrupted) -> !true -> false -> SKIP init
  -> state.phases['01-requirements'].iteration_requirements.interactive_elicitation [line 172]
     -> true.interactive_elicitation -> undefined (no crash here, but...)
  -> elicitState is undefined -> line 188: activity.menu_presented -> accesses elicitState.menu_interactions
     -> TypeError: Cannot read properties of undefined
  OR if iteration_requirements is a number/string:
     -> Accessing .interactive_elicitation returns undefined
     -> Further access on undefined throws TypeError
```

### BUG 0.12: Advisory-only timeout path

```
main()
  -> state?.active_workflow && requirements [line 111] -> true
  -> checkPhaseTimeout(state, requirements) [line 113]
     -> Returns { exceeded: true, elapsed: 45, limit: 30, phase: '01-requirements' }
  -> timeout.exceeded -> true [line 114]
  -> console.error('TIMEOUT WARNING: ...') [line 115] -- text only, not JSON
  -> logHookEvent('pre-task-dispatcher', 'timeout_warning', {...}) [line 116-119] -- internal log
  -> END of timeout block [line 120]
  -> No structured JSON emitted
  -> No degradation hints
  -> No recommended actions
  -> Downstream agents receive no machine-parsable signal
```

---

## Root Cause Analysis

### BUG 0.6: Dispatcher null context

**Root Cause**: Missing null-to-default coercion at dispatcher context construction (line 108).

**Hypothesis (CONFIRMED -- HIGH confidence)**:
The four loader functions (`readState`, `loadManifest`, `loadIterationRequirements`, `loadWorkflowDefinitions`) are explicitly designed to return `null` on failure -- this is correct defensive behavior in the library. The bug is that the dispatcher does not apply defaults before passing values to hooks. The responsibility for null safety should be centralized in the dispatcher, not distributed across 9 hooks.

**Evidence**:
1. All four loader functions return `null` (common.cjs lines 629/635, 744/750, 1951/1955, 1979/1983)
2. Line 108 passes raw return values: `const ctx = { input, state, manifest, requirements, workflows }`
3. The `hasActiveWorkflow` guard uses optional chaining (safe), but other hooks may not
4. The timeout check at line 111 already guards: `if (state?.active_workflow && requirements)` -- acknowledging null is possible

**Suggested Fix**:
```javascript
// Line 108: Replace direct assignment with null-coalesced defaults
const ctx = {
    input,
    state: state || {},
    manifest: manifest || {},
    requirements: requirements || {},
    workflows: workflows || {}
};
```

**Complexity**: LOW -- single line change, 4 `|| {}` additions.

### BUG 0.7: Wrong phase prefix matching

**Root Cause**: Incorrect phase prefix strings in `isUpgradeDelegation()` and `isUpgradePhaseActive()`.

**Hypothesis (CONFIRMED -- HIGH confidence)**:
The test-adequacy-blocker was written when the upgrade workflow used phase prefix `14-upgrade`. The workflow was later renumbered to `15-upgrade-plan` and `15-upgrade-execute`, but the blocker's internal functions were not updated. Additionally, `'16-'` was added (perhaps intending to match `16-quality-loop` as an upgrade-related phase), but `16-quality-loop` is NOT an upgrade phase -- it is the quality loop phase used by ALL workflow types.

**Evidence**:
1. `isUpgradeDelegation()` line 35: `phase.startsWith('16-')` matches `16-quality-loop`
2. `isUpgradeDelegation()` line 36: `phase.startsWith('14-upgrade')` uses old numbering
3. `isUpgradePhaseActive()` line 62: same two wrong prefixes
4. Dispatcher shouldActivate at line 73: `phase.startsWith('15-upgrade')` is correct
5. State.json workflow_history confirms upgrade phases use `15-upgrade` prefix

**Suggested Fix**:
```javascript
// isUpgradeDelegation (lines 35-36): Replace wrong prefixes
return phase.startsWith('15-upgrade') ||
       agent.includes('upgrade');

// isUpgradePhaseActive (line 62): Replace wrong prefixes
return phase.startsWith('15-upgrade');
```

**Complexity**: LOW -- 2 function edits, remove 2 wrong prefixes, fix 1 to correct value.

### BUG 0.11: Missing typeof guard on iteration_requirements

**Root Cause**: Falsy-only check on `iteration_requirements` does not catch truthy non-object values.

**Hypothesis (CONFIRMED -- HIGH confidence)**:
Line 167 uses `if (!value)` pattern which only catches `null`, `undefined`, `0`, `""`, `false`. A corrupted state where `iteration_requirements` is set to `true`, `1`, or a string would pass this check, and subsequent property access (`.interactive_elicitation`) would either return `undefined` (leading to downstream TypeError) or throw directly.

**Evidence**:
1. Line 167: `if (!state.phases[currentPhase].iteration_requirements)` -- falsy check only
2. Line 172: `state.phases[currentPhase].iteration_requirements.interactive_elicitation` -- assumes object
3. No `typeof` check anywhere in the initialization block (lines 165-182)
4. State corruption is possible via manual editing, race conditions, or other hooks writing unexpected values

**Suggested Fix**:
```javascript
// Line 167-169: Add typeof guard
const iterReq = state.phases[currentPhase].iteration_requirements;
if (!iterReq || typeof iterReq !== 'object' || Array.isArray(iterReq)) {
    state.phases[currentPhase].iteration_requirements = {};
}
```

**Complexity**: LOW -- add typeof check, 3 lines changed.

### BUG 0.12: No structured degradation hints on timeout

**Root Cause**: Timeout handler only emits human-readable warning, no machine-parsable JSON.

**Hypothesis (CONFIRMED -- HIGH confidence)**:
The timeout check was implemented as an advisory-only feature (lines 110-125). The `checkPhaseTimeout()` function in common.cjs returns structured data (`{ exceeded, elapsed, limit, phase }`), but the dispatcher only converts this to a text warning. No JSON degradation hint is emitted on stderr for downstream consumers to parse.

**Evidence**:
1. Line 115: `console.error(...)` outputs plain text only
2. Lines 116-119: `logHookEvent()` writes to internal log, not parsable by downstream
3. `checkPhaseTimeout()` returns structured data but it's not forwarded as JSON
4. No mechanism exists for agents to detect timeout and adjust behavior (reduce debate rounds, skip optional steps)

**Suggested Fix**:
```javascript
// After line 119: Add structured JSON degradation hint
const degradationHint = JSON.stringify({
    type: 'timeout_degradation',
    phase: timeout.phase,
    elapsed: timeout.elapsed,
    limit: timeout.limit,
    actions: ['reduce_debate_rounds', 'skip_optional_steps', 'escalate_to_human']
});
console.error(`DEGRADATION_HINT: ${degradationHint}`);
```

**Complexity**: LOW -- add 7 lines after existing warning, no logic changes.

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-02-15T13:15:00Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "bugs_traced": 4,
  "bugs_confirmed": 4,
  "root_cause_confidence": "high",
  "files_analyzed": [
    "src/claude/hooks/dispatchers/pre-task-dispatcher.cjs",
    "src/claude/hooks/test-adequacy-blocker.cjs",
    "src/claude/hooks/menu-tracker.cjs",
    "src/claude/hooks/lib/common.cjs"
  ],
  "error_keywords": [
    "null context",
    "TypeError",
    "startsWith",
    "16-quality-loop",
    "15-upgrade",
    "14-upgrade",
    "iteration_requirements",
    "typeof",
    "timeout_degradation",
    "console.error"
  ]
}
```
