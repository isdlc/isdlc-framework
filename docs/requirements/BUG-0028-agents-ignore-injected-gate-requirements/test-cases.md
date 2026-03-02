# Test Cases: BUG-0028 -- Agents Ignore Injected Gate Requirements

**Bug ID**: BUG-0028 / GH-64
**Phase**: 05-test-strategy
**Test File**: `src/claude/hooks/tests/gate-requirements-injector.test.cjs`
**Total New Tests**: 18 (across 3 new describe blocks)
**Traces to**: Requirements Spec, Module Design Section 6

---

## Suite 12: Injection Salience (BUG-0028)

Appended after existing suite 11 (line 958) in the test file.

---

### TC-12-01: CRITICAL CONSTRAINTS precedes Iteration Requirements

**Requirement IDs**: AC-006-01, AC-001-01
**Test Type**: positive
**Priority**: P0 (Critical -- validates primary fix)

**Preconditions**:
- `loadModule()` returns fresh module instance
- `FIXTURE_ITERATION_REQ.phase_requirements['06-implementation']` used as phaseReq (test_iteration enabled, constitutional_validation enabled)

**Input**:
```javascript
mod.formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null, true)
// resolvedPaths = ['docs/requirements/test/coverage-report.html']
// articleMap = { 'I': 'Specification Primacy' }
```

**Expected Result**:
- Output contains the string "CRITICAL CONSTRAINTS"
- Output contains the string "Iteration Requirements:"
- `indexOf('CRITICAL CONSTRAINTS') < indexOf('Iteration Requirements:')`

**Assertions**:
```javascript
assert.ok(ccIndex >= 0, 'Should contain CRITICAL CONSTRAINTS section');
assert.ok(irIndex >= 0, 'Should contain Iteration Requirements section');
assert.ok(ccIndex < irIndex, 'CRITICAL CONSTRAINTS must appear before Iteration Requirements');
```

---

### TC-12-02: Output includes REMINDER line after all sections

**Requirement IDs**: AC-006-02, AC-001-02
**Test Type**: positive
**Priority**: P0 (Critical -- validates recency bias mechanism)

**Preconditions**:
- `loadModule()` returns fresh module instance
- `06-implementation` phaseReq used

**Input**:
```javascript
mod.formatBlock('06-implementation', phaseReq, [], {}, null, true)
```

**Expected Result**:
- Output contains "REMINDER:"
- REMINDER appears after "Iteration Requirements:"

**Assertions**:
```javascript
assert.ok(result.includes('REMINDER:'), 'Should include REMINDER line');
assert.ok(reminderIndex > iterReqIndex, 'REMINDER should appear after Iteration Requirements');
```

---

### TC-12-03: Constitutional validation reminder in CRITICAL CONSTRAINTS

**Requirement IDs**: AC-006-03, AC-001-03
**Test Type**: positive
**Priority**: P0 (Critical -- validates constitutional constraint surfacing)

**Preconditions**:
- `06-implementation` has `constitutional_validation.enabled = true`

**Input**:
```javascript
mod.formatBlock('06-implementation', phaseReq, [], {}, null, true)
```

**Expected Result**:
- The text between the first and second `========` separators contains "Constitutional validation"

**Assertions**:
```javascript
const ccSection = result.substring(ccStart, ccEnd);
assert.ok(ccSection.includes('Constitutional validation'),
    'CRITICAL CONSTRAINTS section should include constitutional validation reminder');
```

---

### TC-12-04: Git commit prohibition for intermediate phases

**Requirement IDs**: AC-002-01
**Test Type**: positive
**Priority**: P0 (Critical -- validates primary git commit prohibition)

**Preconditions**:
- `isIntermediatePhase = true`

**Input**:
```javascript
mod.formatBlock('06-implementation', phaseReq, [], {}, null, true)
```

**Expected Result**:
- Output contains "Do NOT run git commit"

**Assertions**:
```javascript
assert.ok(result.includes('Do NOT run git commit'),
    'Should include git commit prohibition for intermediate phase');
```

---

### TC-12-05: No git commit prohibition for final phase

**Requirement IDs**: CON-003
**Test Type**: negative
**Priority**: P1 (High -- validates fail-open for unconstrained phases)

**Preconditions**:
- `isIntermediatePhase = false`

**Input**:
```javascript
mod.formatBlock('06-implementation', phaseReq, [], {}, null, false)
```

**Expected Result**:
- Output does NOT contain "Do NOT run git commit"

**Assertions**:
```javascript
assert.ok(!result.includes('Do NOT run git commit'),
    'Should NOT include git commit prohibition for final phase');
```

---

### TC-12-06: Character count within 40% growth budget

**Requirement IDs**: NFR-001, AC-001-04
**Test Type**: positive
**Priority**: P1 (High -- validates performance budget)

**Preconditions**:
- Both baseline (no `isIntermediatePhase` param) and enhanced (`isIntermediatePhase=true`) outputs generated
- Full article map with 9 articles for realistic output size

**Input**:
```javascript
const baseline = mod.formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null);
const enhanced = mod.formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null, true);
```

**Expected Result**:
- `enhanced.length <= baseline.length * 1.4`

**Assertions**:
```javascript
assert.ok(enhancedLen <= baselineLen * 1.4,
    `Injection block grew ${growthPercent.toFixed(1)}% ... Must be <= 40% growth.`);
```

---

## Suite 13: buildCriticalConstraints (BUG-0028)

---

### TC-13-01: Git commit prohibition when isIntermediatePhase is true

**Requirement IDs**: FR-002, AC-002-01
**Test Type**: positive
**Priority**: P0

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } },
    null, true)
```

**Expected Result**: Array contains string matching "Do NOT run git commit"

**Assertions**:
```javascript
assert.ok(result.some(c => c.includes('Do NOT run git commit')));
```

---

### TC-13-02: No git commit prohibition when isIntermediatePhase is false

**Requirement IDs**: FR-002, CON-003
**Test Type**: negative
**Priority**: P1

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } },
    null, false)
```

**Expected Result**: Array does NOT contain string matching "Do NOT run git commit"

**Assertions**:
```javascript
assert.ok(!result.some(c => c.includes('Do NOT run git commit')));
```

---

### TC-13-03: Test coverage constraint when test_iteration enabled

**Requirement IDs**: FR-001, FR-002
**Test Type**: positive
**Priority**: P0

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: true, success_criteria: { min_coverage_percent: 80 } },
      constitutional_validation: { enabled: false } },
    null, false)
```

**Expected Result**: Array contains string matching "80% coverage"

**Assertions**:
```javascript
assert.ok(result.some(c => c.includes('80% coverage')));
```

---

### TC-13-04: Constitutional constraint when constitutional_validation enabled

**Requirement IDs**: FR-001, AC-001-03
**Test Type**: positive
**Priority**: P0

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: false },
      constitutional_validation: { enabled: true, articles: ['I'] } },
    null, false)
```

**Expected Result**: Array contains string matching "Constitutional validation"

**Assertions**:
```javascript
assert.ok(result.some(c => c.includes('Constitutional validation')));
```

---

### TC-13-05: Artifact constraint when artifact_validation enabled with paths

**Requirement IDs**: FR-002, AC-002-02
**Test Type**: positive
**Priority**: P1

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: false }, constitutional_validation: { enabled: false },
      artifact_validation: { enabled: true, paths: ['some/path.md'] } },
    null, false)
```

**Expected Result**: Array contains string matching "Required artifacts"

**Assertions**:
```javascript
assert.ok(result.some(c => c.includes('Required artifacts')));
```

---

### TC-13-06: Failing test constraint from workflow modifiers

**Requirement IDs**: FR-002, AC-002-03
**Test Type**: positive
**Priority**: P1

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } },
    { require_failing_test_first: true }, false)
```

**Expected Result**: Array contains string matching "failing test"

**Assertions**:
```javascript
assert.ok(result.some(c => c.includes('failing test')));
```

---

### TC-13-07: Empty array when no constraints apply

**Requirement IDs**: CON-003, NFR-002
**Test Type**: negative
**Priority**: P1

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation',
    { test_iteration: { enabled: false }, constitutional_validation: { enabled: false },
      artifact_validation: { enabled: false } },
    null, false)
```

**Expected Result**: Empty array `[]`

**Assertions**:
```javascript
assert.deepEqual(result, []);
```

---

### TC-13-08: Empty array on error (fail-open)

**Requirement IDs**: NFR-002
**Test Type**: negative
**Priority**: P0 (Critical -- validates fail-open design)

**Input**:
```javascript
mod.buildCriticalConstraints('06-implementation', null, null, true)
```

**Expected Result**: Returns an array (specifically `[]` because try/catch wraps entire function)

**Assertions**:
```javascript
assert.ok(Array.isArray(result), 'Should return an array');
assert.deepEqual(result, []);
```

---

## Suite 14: buildConstraintReminder (BUG-0028)

---

### TC-14-01: Joins constraints with REMINDER prefix

**Requirement IDs**: FR-001, AC-001-02
**Test Type**: positive
**Priority**: P0

**Input**:
```javascript
mod.buildConstraintReminder([
    'Do NOT run git commit -- the orchestrator manages all commits.',
    'Constitutional validation MUST complete before gate advancement.'
])
```

**Expected Result**:
- Starts with "REMINDER:"
- Contains "Do NOT run git commit"
- Contains "Constitutional validation"

**Assertions**:
```javascript
assert.ok(result.startsWith('REMINDER:'));
assert.ok(result.includes('Do NOT run git commit'));
assert.ok(result.includes('Constitutional validation'));
```

---

### TC-14-02: Returns empty string for empty array

**Requirement IDs**: NFR-002
**Test Type**: negative
**Priority**: P1

**Input**:
```javascript
mod.buildConstraintReminder([])
```

**Expected Result**: `''`

**Assertions**:
```javascript
assert.equal(mod.buildConstraintReminder([]), '');
```

---

### TC-14-03: Returns empty string for null input

**Requirement IDs**: NFR-002
**Test Type**: negative
**Priority**: P1

**Input**:
```javascript
mod.buildConstraintReminder(null)
```

**Expected Result**: `''`

**Assertions**:
```javascript
assert.equal(mod.buildConstraintReminder(null), '');
```

---

### TC-14-04: Returns empty string for undefined input

**Requirement IDs**: NFR-002
**Test Type**: negative
**Priority**: P1

**Input**:
```javascript
mod.buildConstraintReminder(undefined)
```

**Expected Result**: `''`

**Assertions**:
```javascript
assert.equal(mod.buildConstraintReminder(undefined), '');
```

---

## Test Priority Summary

| Priority | Count | Test Cases |
|----------|-------|------------|
| P0 (Critical) | 8 | TC-12-01, TC-12-02, TC-12-03, TC-12-04, TC-13-01, TC-13-03, TC-13-04, TC-13-08, TC-14-01 |
| P1 (High) | 10 | TC-12-05, TC-12-06, TC-13-02, TC-13-05, TC-13-06, TC-13-07, TC-14-02, TC-14-03, TC-14-04 |
| P2 (Medium) | 0 | -- |
| P3 (Low) | 0 | -- |

All tests are P0 or P1 because this is a bug fix with targeted scope. There are no P2/P3 tests -- every test validates a core requirement or safety property (fail-open).
