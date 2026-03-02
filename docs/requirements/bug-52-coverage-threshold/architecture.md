# Architecture Notes: #52 Coverage Threshold Discrepancy

**Scope**: SMALL | **Phase**: 03-Architecture (analysis mode) | **Date**: 2026-02-19

---

## 1. Schema Design for Tiered Thresholds

### Decision: Object keyed by intensity tier, with scalar backward compatibility

The `min_coverage_percent` field changes from a scalar to a union type: `number | { light: number, standard: number, epic: number }`.

**Before** (Phase 06, line 219):
```json
"min_coverage_percent": 80
```

**After**:
```json
"min_coverage_percent": {
  "light": 60,
  "standard": 80,
  "epic": 95
}
```

**Rationale for object-with-named-keys over array**:
- Keys are self-documenting (no positional ambiguity)
- Direct lookup by intensity name -- O(1), no iteration
- Matches the existing `effective_intensity` enum values already used in `workflows.json` and `state.json`
- An array would require a convention for index-to-tier mapping, adding a failure mode

**Three phases affected**:

| Phase | Field Path | light | standard | epic |
|-------|-----------|-------|----------|------|
| `06-implementation` | `.success_criteria.min_coverage_percent` | 60 | 80 | 95 |
| `07-testing` | `.success_criteria.min_coverage_percent` | 50 | 70 | 85 |
| `16-quality-loop` | `.success_criteria.min_coverage_percent` | 60 | 80 | 95 |

**Backward compatibility**: The resolution function (see section 2) treats `typeof value === 'number'` as the scalar legacy format and returns it directly. No migration step required.

---

## 2. Resolution Function: `resolveCoverageThreshold`

### Location

New exported function in `test-watcher.cjs`. Placed near existing `parseCoverage()` (line ~116) as a peer utility.

### Signature

```js
/**
 * Resolve the effective coverage threshold from a min_coverage_percent config value.
 * Handles both scalar (legacy) and tiered (object) formats.
 *
 * @param {number|object|null|undefined} configValue - min_coverage_percent from iteration-requirements.json
 * @param {object|null} state - Parsed state.json (used to read effective_intensity)
 * @returns {number|null} Resolved threshold, or null if no coverage enforcement
 */
function resolveCoverageThreshold(configValue, state) {
```

### Resolution logic (priority chain)

```
1. If configValue is null/undefined      --> return null (no enforcement, existing behavior)
2. If configValue is a number            --> return configValue (scalar backward compat)
3. If configValue is an object:
   a. Read intensity = state?.active_workflow?.sizing?.effective_intensity || 'standard'
   b. Lookup configValue[intensity]
   c. If found                           --> return it
   d. Else lookup configValue['standard']
   e. If found                           --> return it
   f. Else                               --> return 80 (hardcoded safety net)
```

### Integration point in test-watcher.cjs

**Current code** (line 552):
```js
const coverageThreshold = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
```

**New code**:
```js
const rawCoverageConfig = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
const coverageThreshold = resolveCoverageThreshold(rawCoverageConfig, state);
```

This is a single-line replacement at the consumption site. All downstream code (`parseCoverage`, coverage comparison logic at lines 558-600) continues to work unchanged because `coverageThreshold` remains a `number|null`.

### Why state is passed as a parameter (not read internally)

The `check()` function already receives `ctx.state` from the dispatcher. Passing it through avoids:
- A second `readState()` call (disk I/O)
- A new dependency on `common.cjs` from this function
- Testability issues (state is trivially mockable as a parameter)

### Export

Add `resolveCoverageThreshold` to `module.exports` for direct unit testing:
```js
module.exports = { check, normalizeErrorForComparison, isIdenticalFailure, parseCoverage, parseTestResult, resolveCoverageThreshold };
```

---

## 3. gate-requirements-injector.cjs: Display Update

### Problem

`buildGateRequirementsBlock()` has no access to `state.json`. Its signature is:
```js
function buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot)
```

It is a pure config-to-text formatter. Adding state.json access would break its design principle (config-only, fail-open, no runtime state dependency).

### Decision: Display all tiers inline when object format is detected

**Current code** (line 229):
```js
const coverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent) || 'N/A';
lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverage}%)`);
```

**New code**:
```js
const rawCoverage = testIter.success_criteria && testIter.success_criteria.min_coverage_percent;
let coverageDisplay;
if (rawCoverage && typeof rawCoverage === 'object') {
    // Tiered format: show all tiers
    const tiers = Object.entries(rawCoverage).map(([k, v]) => `${k}: ${v}%`).join(', ');
    coverageDisplay = tiers;
} else {
    coverageDisplay = rawCoverage != null ? `${rawCoverage}%` : 'N/A';
}
lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverageDisplay})`);
```

**Example output**:
```
  - test_iteration: enabled (max 10 iterations, coverage >= light: 60%, standard: 80%, epic: 95%)
```

**Rationale**: No signature change, no state dependency, no breaking change. The agent reading this output sees all tiers and can cross-reference with its own `effective_intensity`. This is informational -- enforcement happens in `test-watcher.cjs`.

### Alternative rejected: Pass state.json into buildGateRequirementsBlock

Would require changing the function signature (breaking existing callers), adding state-reading logic to a config-only module, and increasing coupling. Not worth it for a display string.

---

## 4. Data Flow Summary

```
iteration-requirements.json         state.json
        |                               |
        v                               v
  min_coverage_percent        active_workflow.sizing
  (object or scalar)          .effective_intensity
        |                               |
        +----------- merge ------------>+
                        |
                        v
            resolveCoverageThreshold()
                        |
                        v
                 coverageThreshold (number)
                        |
              +---------+---------+
              |                   |
              v                   v
    test-watcher.cjs      gate-requirements-
    (enforcement)         injector.cjs
                          (display only,
                           shows all tiers)
```

---

## 5. Test Architecture

### test-watcher.cjs tests (NEW FILE: `tests/test-watcher.test.cjs`)

The `resolveCoverageThreshold` function is a pure function (no I/O, no side effects). Test it directly via the export.

**8 test cases** (from requirements FR-003 AC-003-01 through AC-003-07, plus null case):

| # | configValue | state.effective_intensity | Expected |
|---|-------------|--------------------------|----------|
| 1 | `{light:60, standard:80, epic:95}` | `"light"` | 60 |
| 2 | `{light:60, standard:80, epic:95}` | `"standard"` | 80 |
| 3 | `{light:60, standard:80, epic:95}` | `"epic"` | 95 |
| 4 | `80` (scalar) | `"light"` | 80 |
| 5 | `{light:60, standard:80, epic:95}` | absent | 80 |
| 6 | `{light:60, epic:95}` (no standard key) | `"standard"` | 80 |
| 7 | `{light:60, standard:80, epic:95}` | `"unknown"` | 80 |
| 8 | `null` | any | null |

### gate-requirements-injector.cjs tests (EXTEND existing `tests/gate-requirements-injector.test.cjs`)

Add 2 test cases for the display logic:

| # | configValue | Expected output substring |
|---|-------------|---------------------------|
| 1 | `{light:60, standard:80, epic:95}` | `"light: 60%, standard: 80%, epic: 95%"` |
| 2 | `80` (scalar) | `"coverage >= 80%"` |

### Integration test (within test-watcher full check() function)

Test the full `check()` path with a mock `ctx` containing:
- Tiered config in requirements
- `effective_intensity` in state
- Verify the correct threshold is applied to coverage comparison

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Custom project overrides use scalar format | HIGH | LOW | Backward compat handles scalars natively |
| `effective_intensity` missing in fix workflows | HIGH | LOW | Default to `"standard"` (CON-003) |
| Test-watcher reads stale state | LOW | LOW | State is passed from dispatcher, always fresh |
| Agent prose updates missed | MEDIUM | LOW | FR-006 is "should change", not blocking |

---

## 7. Implementation Order (Confirmed)

1. **iteration-requirements.json** -- Schema change (3 phases). No code dependency.
2. **test-watcher.cjs** -- Add `resolveCoverageThreshold()` function, write tests FIRST (TDD), then integrate at line 552. Export for testing.
3. **gate-requirements-injector.cjs** -- Display update at line 229. Extend existing tests.
4. **constitution.md** -- Add enforcement note below Article II thresholds.
5. **Agent prose** (6 files) -- Replace hardcoded percentages with tier-aware language.

Steps 1-3 are the critical path. Steps 4-5 are documentation/prose with no runtime impact.
