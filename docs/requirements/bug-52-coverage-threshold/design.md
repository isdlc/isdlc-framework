# Design Specification: #52 Coverage Threshold Discrepancy

**Scope**: SMALL | **Phase**: 04-Design (analysis mode) | **Date**: 2026-02-19

---

## 1. iteration-requirements.json Schema Change

Three phases have `min_coverage_percent` under `success_criteria`. Each changes from scalar to object.

### Phase 06 (implementation) -- lines 217-220

**Before:**
```json
"success_criteria": {
  "all_tests_passing": true,
  "min_coverage_percent": 80
}
```

**After:**
```json
"success_criteria": {
  "all_tests_passing": true,
  "min_coverage_percent": {
    "light": 60,
    "standard": 80,
    "epic": 95
  }
}
```

### Phase 07 (testing) -- lines 277-280

**Before:**
```json
"success_criteria": {
  "all_tests_passing": true,
  "min_coverage_percent": 70
}
```

**After:**
```json
"success_criteria": {
  "all_tests_passing": true,
  "min_coverage_percent": {
    "light": 50,
    "standard": 70,
    "epic": 85
  }
}
```

### Phase 16 (quality-loop) -- lines 671-677

**Before:**
```json
"success_criteria": {
  "all_tests_passing": true,
  "lint_passing": true,
  "type_check_passing": true,
  "no_critical_vulnerabilities": true,
  "min_coverage_percent": 80
}
```

**After:**
```json
"success_criteria": {
  "all_tests_passing": true,
  "lint_passing": true,
  "type_check_passing": true,
  "no_critical_vulnerabilities": true,
  "min_coverage_percent": {
    "light": 60,
    "standard": 80,
    "epic": 95
  }
}
```

---

## 2. resolveCoverageThreshold() -- Pseudocode

Location: `src/claude/hooks/test-watcher.cjs`, placed after `parseCoverage()` (around line 129).

```js
/**
 * Resolve the effective coverage threshold from a min_coverage_percent config value.
 * Handles both scalar (legacy) and tiered (object) formats.
 *
 * Resolution chain:
 *   null/undefined          --> null  (no enforcement)
 *   number                  --> number (scalar backward compat)
 *   object                  --> lookup by effective_intensity from state
 *     found?                --> return tier value
 *     fallback "standard"   --> return standard tier value
 *     final fallback        --> 80
 *
 * @param {number|object|null|undefined} configValue - min_coverage_percent from config
 * @param {object|null} state - Parsed state.json (reads active_workflow.sizing.effective_intensity)
 * @returns {number|null} Resolved threshold, or null if no coverage enforcement
 */
function resolveCoverageThreshold(configValue, state) {
    // Case 1: null/undefined -- no enforcement
    if (configValue == null) {
        return null;
    }

    // Case 2: scalar number -- backward compat (legacy format or custom overrides)
    if (typeof configValue === 'number') {
        return configValue;
    }

    // Case 3: object -- tiered lookup
    if (typeof configValue === 'object') {
        const intensity = state?.active_workflow?.sizing?.effective_intensity || 'standard';
        if (configValue[intensity] != null) {
            return configValue[intensity];
        }
        // Tier key not found -- fallback to 'standard'
        if (configValue['standard'] != null) {
            return configValue['standard'];
        }
        // Final safety net
        return 80;
    }

    // Unexpected type -- return null (fail-open)
    return null;
}
```

### Integration at line 552 of test-watcher.cjs

**Current** (line 552):
```js
const coverageThreshold = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
```

**New** (two lines, replaces one):
```js
const rawCoverageConfig = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
const coverageThreshold = resolveCoverageThreshold(rawCoverageConfig, state);
```

### Export addition (line 711):

**Current:**
```js
module.exports = { check, normalizeErrorForComparison, isIdenticalFailure, parseCoverage, parseTestResult };
```

**New:**
```js
module.exports = { check, normalizeErrorForComparison, isIdenticalFailure, parseCoverage, parseTestResult, resolveCoverageThreshold };
```

---

## 3. gate-requirements-injector.cjs Display Format

Location: `src/claude/hooks/lib/gate-requirements-injector.cjs`, `formatBlock()` function, around line 229.

### Current code (lines 228-230):

```js
const coverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent) || 'N/A';
lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverage}%)`);
```

### New code:

```js
const rawCoverage = testIter.success_criteria && testIter.success_criteria.min_coverage_percent;
let coverageDisplay;
if (rawCoverage && typeof rawCoverage === 'object') {
    const tiers = Object.entries(rawCoverage).map(([k, v]) => `${k}: ${v}%`).join(', ');
    coverageDisplay = tiers;
} else {
    coverageDisplay = rawCoverage != null ? `${rawCoverage}%` : 'N/A';
}
lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverageDisplay})`);
```

### Example outputs:

Tiered format:
```
  - test_iteration: enabled (max 10 iterations, coverage >= light: 60%, standard: 80%, epic: 95%)
```

Scalar format (backward compat):
```
  - test_iteration: enabled (max 10 iterations, coverage >= 80%)
```

No coverage configured:
```
  - test_iteration: enabled (max 10 iterations, coverage >= N/A)
```

---

## 4. Constitution Note

Location: `docs/isdlc/constitution.md`, under Article II, section 2 (after the existing coverage thresholds list).

### Text to add after line 28 ("Critical paths: 100% coverage..."):

```markdown
   - Coverage enforcement is tiered by workflow intensity: light/standard/epic thresholds are defined in `iteration-requirements.json` under each phase's `success_criteria.min_coverage_percent`. The `resolveCoverageThreshold()` function in `test-watcher.cjs` resolves the effective threshold at runtime based on `state.json -> active_workflow.sizing.effective_intensity`.
```

This is a note, not a normative change. The constitution's "100% line coverage" remains the aspirational mandate. The config defines the enforceable thresholds per intensity tier.

---

## 5. Agent Prose Updates

Six agent files contain hardcoded "80%" coverage references. Replace with tier-aware language.

| File | Line(s) | Current Text | New Text |
|------|---------|-------------|----------|
| `src/claude/agents/05-software-developer.md` | 284 | "achieving minimum 80% coverage" | "achieving the minimum coverage threshold for the active workflow intensity (see `iteration-requirements.json`)" |
| `src/claude/agents/05-software-developer.md` | 331 | "achieving >=80% code coverage" | "achieving the configured coverage threshold" |
| `src/claude/agents/05-software-developer.md` | 339 | "Unit test coverage >=80%" | "Unit test coverage meets configured threshold" |
| `src/claude/agents/05-software-developer.md` | 443 | "Code coverage >=80%" | "Code coverage meets configured threshold" |
| `src/claude/agents/05-software-developer.md` | 824 | "80% coverage" | "configured coverage threshold" |
| `src/claude/agents/05-software-developer.md` | 888 | "unit test coverage >=80%" | "unit test coverage meets configured threshold" |
| `src/claude/agents/09-cicd-engineer.md` | 30 | ">=80% unit, >=70% integration" | "coverage gates matching `iteration-requirements.json` thresholds" |
| `src/claude/agents/00-sdlc-orchestrator.md` | 715 | "85% (target: 80%)" | "85% (target: configured threshold)" |
| `src/claude/agents/00-sdlc-orchestrator.md` | 891 | ">=80% unit test coverage" | "unit test coverage meeting configured threshold" |
| `src/claude/agents/00-sdlc-orchestrator.md` | 1389 | "test coverage >=80%" | "test coverage meets configured threshold" |
| `src/claude/agents/16-quality-loop-engineer.md` | 491 | "default: 80%" | "threshold from `iteration-requirements.json`" |
| `src/claude/agents/discover/test-evaluator.md` | 392 | "67% < 80% target" | "67% < configured target" |
| `src/claude/agents/discover/constitution-generator.md` | 287 | "80% coverage" | "tiered coverage thresholds" |
| `src/claude/agents/discover-orchestrator.md` | 2068 | "unit >= 80%, integration >= 70%" | "unit/integration thresholds per `iteration-requirements.json`" |
| `src/claude/agents/discover-orchestrator.md` | 2174 | "constitution requires >= 80%" | "constitution requires configured threshold" |

Note: These are "should change" (non-blocking). Runtime enforcement is entirely in `test-watcher.cjs`.

---

## 6. Test Case Matrix

### 6a. resolveCoverageThreshold() -- Unit Tests

New file: `src/claude/hooks/tests/coverage-threshold.test.cjs`

Pattern: `node:test` + `node:assert/strict` (project standard, see existing `gate-requirements-injector.test.cjs`).

| # | Test Name | configValue | state (effective_intensity) | Expected Return | Category |
|---|-----------|------------|---------------------------|-----------------|----------|
| 1 | returns light tier threshold | `{light:60, standard:80, epic:95}` | `"light"` | `60` | Happy path |
| 2 | returns standard tier threshold | `{light:60, standard:80, epic:95}` | `"standard"` | `80` | Happy path |
| 3 | returns epic tier threshold | `{light:60, standard:80, epic:95}` | `"epic"` | `95` | Happy path |
| 4 | returns scalar unchanged (backward compat) | `80` | `"light"` | `80` | Backward compat |
| 5 | defaults to standard when intensity absent | `{light:60, standard:80, epic:95}` | absent (no sizing block) | `80` | Fallback |
| 6 | falls back to standard when tier key missing | `{light:60, epic:95}` | `"standard"` | `80` | Fallback (safety net) |
| 7 | falls back to standard when unknown intensity | `{light:60, standard:80, epic:95}` | `"unknown"` | `80` | Fallback |
| 8 | returns null for null input | `null` | any | `null` | Null handling |
| 9 | returns null for undefined input | `undefined` | any | `null` | Null handling |

### 6b. gate-requirements-injector -- Display Tests

Extend existing: `src/claude/hooks/tests/gate-requirements-injector.test.cjs`

| # | Test Name | min_coverage_percent | Expected Output Contains |
|---|-----------|---------------------|--------------------------|
| 10 | displays tiered coverage format | `{light:60, standard:80, epic:95}` | `"light: 60%, standard: 80%, epic: 95%"` |
| 11 | displays scalar coverage format | `80` | `"coverage >= 80%"` |

### 6c. Integration Test (check() full path)

Add to `coverage-threshold.test.cjs` as a separate `describe` block.

| # | Test Name | Config | State | Test Output | Expected Behavior |
|---|-----------|--------|-------|-------------|-------------------|
| 12 | enforces epic threshold via check() | tiered `{light:60, standard:80, epic:95}` | `effective_intensity: "epic"` | `Statements: 82%` | Coverage warning (82% < 95%) |
| 13 | passes standard threshold via check() | tiered `{light:60, standard:80, epic:95}` | `effective_intensity: "standard"` | `Statements: 82%` | Tests PASSED (82% >= 80%) |
| 14 | handles scalar config via check() | scalar `80` | `effective_intensity: "epic"` | `Statements: 82%` | Tests PASSED (82% >= 80%, scalar ignores intensity) |

### 6d. Test Structure Skeleton

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveCoverageThreshold, check } = require('../test-watcher.cjs');

// Helper: build minimal state with effective_intensity
function makeState(intensity) {
    if (!intensity) return {};
    return {
        active_workflow: {
            type: 'feature',
            current_phase: '06-implementation',
            sizing: { effective_intensity: intensity }
        },
        phases: {}
    };
}

// Helper: build tiered config
const TIERED = { light: 60, standard: 80, epic: 95 };

describe('resolveCoverageThreshold', () => {
    it('returns light tier threshold', () => {
        assert.equal(resolveCoverageThreshold(TIERED, makeState('light')), 60);
    });

    it('returns standard tier threshold', () => {
        assert.equal(resolveCoverageThreshold(TIERED, makeState('standard')), 80);
    });

    it('returns epic tier threshold', () => {
        assert.equal(resolveCoverageThreshold(TIERED, makeState('epic')), 95);
    });

    it('returns scalar unchanged (backward compat)', () => {
        assert.equal(resolveCoverageThreshold(80, makeState('light')), 80);
    });

    it('defaults to standard when intensity absent', () => {
        assert.equal(resolveCoverageThreshold(TIERED, {}), 80);
    });

    it('falls back to standard when tier key missing', () => {
        assert.equal(resolveCoverageThreshold({ light: 60, epic: 95 }, makeState('standard')), 80);
    });

    it('falls back to standard when unknown intensity', () => {
        assert.equal(resolveCoverageThreshold(TIERED, makeState('unknown')), 80);
    });

    it('returns null for null input', () => {
        assert.equal(resolveCoverageThreshold(null, makeState('light')), null);
    });

    it('returns null for undefined input', () => {
        assert.equal(resolveCoverageThreshold(undefined, makeState('light')), null);
    });
});

describe('check() integration with tiered coverage', () => {
    // Helper: build minimal ctx for check()
    function makeCtx(coverageConfig, intensity, testOutput) {
        return {
            input: {
                tool_name: 'Bash',
                tool_input: { command: 'npm test' },
                tool_result: testOutput
            },
            state: {
                active_workflow: {
                    type: 'feature',
                    current_phase: '06-implementation',
                    sizing: { effective_intensity: intensity }
                },
                phases: {}
            },
            requirements: {
                phase_requirements: {
                    '06-implementation': {
                        test_iteration: {
                            enabled: true,
                            max_iterations: 10,
                            success_criteria: {
                                all_tests_passing: true,
                                min_coverage_percent: coverageConfig
                            }
                        }
                    }
                }
            }
        };
    }

    it('enforces epic threshold -- 82% below 95% triggers warning', () => {
        const ctx = makeCtx(TIERED, 'epic', 'Tests: 5 passed, 5 total\nStatements : 82.00%');
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.ok(result.stdout.includes('COVERAGE'), 'should mention coverage');
    });

    it('passes standard threshold -- 82% above 80%', () => {
        const ctx = makeCtx(TIERED, 'standard', 'Tests: 5 passed, 5 total\nStatements : 82.00%');
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.ok(result.stdout.includes('PASSED'), 'should report passed');
    });

    it('handles scalar config ignoring intensity', () => {
        const ctx = makeCtx(80, 'epic', 'Tests: 5 passed, 5 total\nStatements : 82.00%');
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.ok(result.stdout.includes('PASSED'), 'scalar 80 should pass with 82%');
    });
});
```

---

## 7. Files Modified (Summary)

| # | File | Change Type | Lines Affected |
|---|------|-------------|---------------|
| 1 | `src/claude/hooks/config/iteration-requirements.json` | Schema | ~219, ~279, ~676 |
| 2 | `src/claude/hooks/test-watcher.cjs` | New function + integration | ~129 (new fn), ~552 (integration), ~711 (export) |
| 3 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | Display logic | ~228-230 |
| 4 | `docs/isdlc/constitution.md` | Documentation | After line 28 |
| 5 | `src/claude/agents/*.md` (6 files) | Prose | See section 5 table |
| 6 | `src/claude/hooks/tests/coverage-threshold.test.cjs` | NEW file | ~120 lines |
| 7 | `src/claude/hooks/tests/gate-requirements-injector.test.cjs` | Extended | 2 new test cases |
