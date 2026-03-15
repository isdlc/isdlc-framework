# Trace Analysis: Coverage Threshold Discrepancy

**Generated**: 2026-03-16T00:06:00.000Z
**Bug**: Coverage threshold discrepancy -- Constitution mandates >=80% unit test coverage but iteration-requirements.json enforces a flat 80% regardless of workflow intensity (light/standard/epic)
**External ID**: GH-52
**Bug ID**: BUG-0054-GH-52
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

Coverage enforcement in the iSDLC framework uses flat scalar thresholds (80% unit, 70% integration) stored in `iteration-requirements.json`, while the framework already has a mature intensity system that sizes workflows as light/standard/epic. The `test-watcher.cjs` hook reads `min_coverage_percent` as a raw number and never consults `state.active_workflow.sizing.effective_intensity`. This creates over-constraint for light workflows (held to 80% when 60% would suffice) and under-constraint for epic workflows (allowed to pass at 80% when 95% is the aspirational target). The fix is straightforward: replace scalar values with intensity-keyed objects in the config, and add ~10 lines of resolution logic in the two consumer hooks.

**Root Cause Confidence**: HIGH
**Severity**: Medium (incorrect enforcement, no crashes or data loss)
**Estimated Complexity**: Low (config change + ~10 lines of resolution logic in 2 hooks)

---

## Symptom Analysis

### Error Manifestation

This is not a runtime error -- it is a configuration/enforcement discrepancy. There are no stack traces or crash logs. The symptoms are behavioral:

1. **Light workflows over-constrained**: A light-intensity workflow that achieves 65% unit coverage will fail the test-watcher gate, even though 60% should be the threshold for light workflows.
2. **Epic workflows under-constrained**: An epic-intensity workflow that achieves 82% unit coverage will pass the test-watcher gate, even though 95% is the target for epic workflows.
3. **Constitution/enforcement mismatch**: The Constitution (Article II) sets aspirational targets, but the enforcement system has no mechanism to vary thresholds by intensity.

### Affected Code Locations

| File | Line(s) | Symptom |
|------|---------|---------|
| `src/claude/hooks/config/iteration-requirements.json` | 219 | Phase 06: `"min_coverage_percent": 80` (scalar) |
| `src/claude/hooks/config/iteration-requirements.json` | 279 | Phase 07: `"min_coverage_percent": 70` (scalar) |
| `src/claude/hooks/config/iteration-requirements.json` | 676 | Phase 16: `"min_coverage_percent": 80` (scalar) |
| `src/claude/hooks/test-watcher.cjs` | 552 | Reads coverage as scalar, no intensity lookup |
| `src/claude/hooks/lib/gate-requirements-injector.cjs` | 226, 320 | Displays raw scalar value, no intensity resolution |
| `src/claude/hooks/lib/profile-loader.cjs` | 400-402 | Validates coverage against hardcoded `< 80` comparison |

### Triggering Conditions

- Any workflow with a sizing decision (light or epic) that reaches Phase 06, 07, or 16
- Fix workflows (which have no sizing block) are unaffected because they default to standard tier, and the current scalar 80% matches the standard tier target

---

## Execution Path

### Entry Point

Test command execution detected by `test-watcher.cjs` PostToolUse hook.

### Full Call Chain (test-watcher.cjs)

```
1. check(ctx)                                          [line 399]
   |
   2. isTestCommand(command)                           [line 418]
   |  - Returns true if command matches TEST_COMMAND_PATTERNS
   |
   3. Load state from ctx.state                        [line 425]
   |
   4. Get currentPhase from active_workflow            [line 442]
   |
   5. Load phaseReq from requirements                  [line 448-458]
   |  - Loads from iteration-requirements.json
   |  - Applies workflow_overrides if present
   |  - ** No intensity-aware override applied here **
   |
   6. parseTestResult(result, exitCode)                [line 465]
   |
   7. [If tests passed] Coverage check                 [line 545-636]
   |  |
   |  8. coverageThreshold = phaseReq                  [line 552]
   |  |    .test_iteration?.success_criteria
   |  |    ?.min_coverage_percent
   |  |  - ** THIS IS THE BUG: reads raw scalar (80) **
   |  |  - ** Never checks state.active_workflow.sizing **
   |  |
   |  9. parseCoverage(result)                         [line 553]
   |  |  - Extracts percentage from test output
   |  |
   |  10. coverage.percentage >= coverageThreshold     [line 558]
   |     - ** Compares against flat scalar **
   |     - ** Would TYPE ERROR if coverageThreshold is an object **
   |     - (e.g., 85.5 >= {light: 60, standard: 80, epic: 95})
   |     - This comparison returns false for objects (NaN comparison)
   |
   8. Save updated iterState to state.phases           [line 695]
```

### Data Flow Diagram

```
iteration-requirements.json
  |
  | "min_coverage_percent": 80     (scalar, no intensity info)
  |
  v
test-watcher.cjs (line 552)
  |
  | const coverageThreshold = 80   (used directly as number)
  |
  v
comparison: coverage.percentage >= 80
  |
  | Result: PASS or FAIL
  |
  v
state.phases[phase].iteration_requirements.test_iteration.coverage
  {
    found: true,
    percentage: 85.5,
    threshold: 80,            <-- always 80, regardless of intensity
    met: true
  }
```

### Parallel Path: gate-requirements-injector.cjs

```
1. buildGateRequirementsBlock(phaseKey, ...)            [line 402]
   |
   2. loadIterationRequirements(root)                   [line 410]
   |
   3. formatBlock(phaseKey, phaseReq, ...)              [line 452]
   |  |
   |  4. buildCriticalConstraints(...)                  [line 296]
   |  |  |
   |  |  5. coverage = success_criteria                 [line 226]
   |  |       .min_coverage_percent || 80
   |  |     - ** Reads raw value, displays as scalar **
   |  |     - ** If value is an object, displays "[object Object]%" **
   |  |
   |  6. coverage = success_criteria                    [line 320]
   |       .min_coverage_percent || 'N/A'
   |     - ** Same issue in display line **
```

### Missing Link: effective_intensity

The intensity system already works. The `applySizingDecision()` function in `common.cjs` (line 3546) writes `state.active_workflow.sizing.effective_intensity`. But neither `test-watcher.cjs` nor `gate-requirements-injector.cjs` ever reads this field.

```
state.json:
  active_workflow:
    sizing:
      intensity: "light"              <-- raw user/framework decision
      effective_intensity: "standard"  <-- mapped (epic -> standard)
      epic_deferred: false
```

---

## Root Cause Analysis

### Primary Hypothesis (HIGH confidence)

**Root cause**: Coverage thresholds in `iteration-requirements.json` are scalar values with no intensity-awareness, and the consumer hooks (`test-watcher.cjs`, `gate-requirements-injector.cjs`) read the scalar directly without consulting the intensity system.

**Evidence**:
1. `iteration-requirements.json` lines 219, 279, 676: all use flat numbers
2. `test-watcher.cjs` line 552: reads value as-is, no type checking or intensity lookup
3. `state.active_workflow.sizing.effective_intensity` exists but is never read by coverage enforcement
4. The bug report, requirements spec, and initial requirements.md all converge on this same root cause

**Confidence**: HIGH -- this is a configuration gap, not a subtle logic bug. The missing code path is clearly identifiable.

### Critical Implementation Detail: effective_intensity vs intensity

The `applySizingDecision()` function in `common.cjs` (line 3567-3569) maps `epic` intensity to `effective_intensity: 'standard'`:

```javascript
if (intensity === 'epic') {
    effective_intensity = 'standard';
    epic_deferred = true;
}
```

This means `state.active_workflow.sizing.effective_intensity` is NEVER `'epic'` -- it is always `'light'` or `'standard'`. The raw `sizing.intensity` field preserves the original tier.

**Impact on fix design**: The threshold resolution logic must use `sizing.intensity` (not `sizing.effective_intensity`) to look up the correct tier. Using `effective_intensity` would cause epic workflows to resolve to the standard tier (80%), defeating the purpose of the tiered thresholds.

**Alternative**: The requirements spec says to use `effective_intensity` with a fallback chain. If this is the intended behavior (epic workflows use standard thresholds until epic is "activated"), then the fix is simpler but epic workflows would never enforce the 95% target unless the epic deferral logic changes. This design decision should be confirmed during test strategy.

### Secondary Hypothesis: profile-loader.cjs Type Safety

The `profile-loader.cjs` file (lines 400-402) validates coverage against a hardcoded `< 80` comparison:

```javascript
if (g.test_iteration?.success_criteria?.min_coverage_percent !== undefined &&
    g.test_iteration.success_criteria.min_coverage_percent < 80) {
```

If `min_coverage_percent` becomes an object, this comparison would evaluate as `{light: 60, ...} < 80`, which is `false` in JavaScript (NaN comparison). The validation would silently pass without warning. This file also needs to be updated to handle the object format, or the comparison will become meaningless.

### No Alternative Hypotheses

This is a straightforward configuration gap. There are no competing explanations.

---

## Suggested Fixes

### Fix 1: Replace scalar with intensity-keyed objects (iteration-requirements.json)

Replace `"min_coverage_percent": 80` with:
```json
"min_coverage_percent": {
  "light": 60,
  "standard": 80,
  "epic": 95
}
```

For Phase 07 (integration), replace `"min_coverage_percent": 70` with:
```json
"min_coverage_percent": {
  "light": 50,
  "standard": 70,
  "epic": 85
}
```

### Fix 2: Add resolution logic (test-watcher.cjs)

Replace line 552:
```javascript
const coverageThreshold = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
```

With a resolution function:
```javascript
function resolveCoverageThreshold(minCoverage, state) {
    if (minCoverage == null) return null;
    if (typeof minCoverage === 'number') return minCoverage; // backward compat
    if (typeof minCoverage === 'object') {
        const intensity = state?.active_workflow?.sizing?.intensity || 'standard';
        return minCoverage[intensity] ?? minCoverage['standard'] ?? 80;
    }
    return 80; // hardcoded safety net
}
```

### Fix 3: Update display logic (gate-requirements-injector.cjs)

Lines 226 and 320 need the same resolution logic to display the resolved number, not the raw object.

### Fix 4: Update profile-loader.cjs validation

Lines 400-402 need to handle the case where `min_coverage_percent` is an object (extract the standard tier value for comparison).

### Fix 5: Constitution and agent prose updates

Add enforcement note to Article II. Update 6 agent markdown files to reference intensity-based thresholds instead of hardcoded percentages.

---

## Files Requiring Changes

### Must Change (Enforcement Logic)

| # | File | Lines | Change |
|---|------|-------|--------|
| 1 | `src/claude/hooks/config/iteration-requirements.json` | 219, 279, 676 | Scalar -> intensity-keyed objects |
| 2 | `src/claude/hooks/test-watcher.cjs` | 552 | Add `resolveCoverageThreshold()` function |
| 3 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | 226, 320 | Resolve before display |
| 4 | `src/claude/hooks/lib/profile-loader.cjs` | 400-402 | Handle object format in validation |

### Should Change (Prose/Documentation)

| # | File | Change |
|---|------|--------|
| 5 | `docs/isdlc/constitution.md` | Add enforcement note below Article II |
| 6 | `src/claude/agents/05-software-developer.md` | Replace hardcoded 80% |
| 7 | `src/claude/agents/06-integration-tester.md` | Replace hardcoded 70% |
| 8 | `src/claude/agents/16-quality-loop-engineer.md` | Replace "default: 80%" |
| 9 | `src/claude/agents/09-cicd-engineer.md` | Replace hardcoded 80%/70% |
| 10 | `src/claude/agents/00-sdlc-orchestrator.md` | Replace hardcoded 80% |
| 11 | `src/claude/agents/discover-orchestrator.md` | Replace hardcoded 80%/70% |

### No Changes Required

| File | Reason |
|------|--------|
| `src/claude/hooks/gate-blocker.cjs` | Reads iteration state, not raw thresholds |
| `src/isdlc/config/workflows.json` | Already has sizing/intensity |
| `src/claude/hooks/lib/common.cjs` | `applySizingDecision()` already works |

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-03-16T00:06:00.000Z",
  "sub_agents": ["T1-inline", "T2-inline", "T3-inline"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "error_keywords": ["min_coverage_percent", "coverageThreshold", "effective_intensity"],
  "files_traced": [
    "src/claude/hooks/config/iteration-requirements.json",
    "src/claude/hooks/test-watcher.cjs",
    "src/claude/hooks/lib/gate-requirements-injector.cjs",
    "src/claude/hooks/lib/profile-loader.cjs",
    "src/claude/hooks/lib/common.cjs",
    "docs/isdlc/constitution.md"
  ],
  "critical_finding": "applySizingDecision() maps epic->standard for effective_intensity; fix must use sizing.intensity for threshold lookup",
  "debate_rounds_used": 0,
  "fan_out_chunks": 0
}
```
