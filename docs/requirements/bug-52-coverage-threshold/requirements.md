# Requirements: Coverage Threshold Discrepancy (#52)

**Bug ID**: #52
**Scope**: SMALL (~5 files, low complexity)
**Generated**: 2026-02-19
**Status**: Draft

---

## Problem Statement

The iSDLC Constitution (Article II) mandates 100% line coverage for unit tests, but enforcement phases use fixed, lower thresholds:

| Location | Threshold | Role |
|----------|-----------|------|
| Constitution Article II | 100% unit line coverage | Aspirational north star |
| Phase 06 (Implementation) `iteration-requirements.json` line 219 | 80% `min_coverage_percent` | Hook enforcement |
| Phase 07 (Testing) `iteration-requirements.json` line 279 | 70% `min_coverage_percent` | Hook enforcement |
| Phase 16 (Quality Loop) `iteration-requirements.json` line 676 | 80% `min_coverage_percent` | Hook enforcement |

These flat thresholds apply identically regardless of workflow intensity (light/standard/epic), even though the framework already has a mature intensity system in `workflows.json` with sizing decisions stored in `state.json`.

**Root cause**: Coverage thresholds in `iteration-requirements.json` are scalar values with no intensity-awareness. The `test-watcher.cjs` hook reads `phaseReq.test_iteration.success_criteria.min_coverage_percent` as a single number.

---

## Design Decisions (Pre-Answered)

These decisions were made during triage and are not open for debate:

1. **Use existing intensity system** from `workflows.json` -- no new infrastructure
2. **Constitution stays aspirational** -- no changes to Article II threshold text
3. **Add constitutional note** clarifying intensity-based practical enforcement
4. **Phase 07 gets its own tiered thresholds**: light: 50%, standard: 70%, epic: 85%
5. **Coverage reads `effective_intensity`** from `state.json` at `active_workflow.sizing.effective_intensity`
6. **Default to "standard" tier** when no sizing decision exists (e.g., fix workflows without sizing)

---

## Functional Requirements

### FR-001: Add tiered unit coverage thresholds to iteration-requirements.json

**Description**: Replace the scalar `min_coverage_percent` in Phase 06 and Phase 16 with an intensity-aware structure that maps intensity tiers to coverage percentages.

**Tiered unit coverage thresholds**:

| Intensity | Unit Coverage (Phase 06, Phase 16) |
|-----------|-----------------------------------|
| light     | 60%                               |
| standard  | 80%                               |
| epic      | 95%                               |

**Schema change in `iteration-requirements.json`**: The `success_criteria.min_coverage_percent` field in phases `06-implementation` and `16-quality-loop` changes from a scalar number to an object keyed by intensity tier. A scalar fallback MUST remain valid for backward compatibility (treated as all-tier default).

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

**Acceptance Criteria**:

- AC-001-01: Given `iteration-requirements.json` is loaded, when phase is `06-implementation`, then `min_coverage_percent` contains keys `light`, `standard`, and `epic` with values 60, 80, and 95 respectively.
- AC-001-02: Given `iteration-requirements.json` is loaded, when phase is `16-quality-loop`, then `min_coverage_percent` contains keys `light`, `standard`, and `epic` with values 60, 80, and 95 respectively.

---

### FR-002: Add tiered integration coverage thresholds to iteration-requirements.json

**Description**: Replace the scalar `min_coverage_percent: 70` in Phase 07 with an intensity-aware structure.

**Tiered integration coverage thresholds**:

| Intensity | Integration Coverage (Phase 07) |
|-----------|---------------------------------|
| light     | 50%                             |
| standard  | 70%                             |
| epic      | 85%                             |

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

**Acceptance Criteria**:

- AC-002-01: Given `iteration-requirements.json` is loaded, when phase is `07-testing`, then `min_coverage_percent` contains keys `light`, `standard`, and `epic` with values 50, 70, and 85 respectively.

---

### FR-003: Update test-watcher.cjs to resolve intensity-aware coverage thresholds

**Description**: Modify the `test-watcher.cjs` hook to resolve the effective coverage threshold from the tiered `min_coverage_percent` object using the current workflow's `effective_intensity`.

**Resolution logic** (in priority order):

1. Read `active_workflow.sizing.effective_intensity` from `state.json`
2. If not present (e.g., fix workflows without sizing), default to `"standard"`
3. Look up `phaseReq.test_iteration.success_criteria.min_coverage_percent`:
   - If it is a **number** (scalar): use it directly (backward compatibility)
   - If it is an **object**: look up `min_coverage_percent[effective_intensity]`
   - If the intensity key is missing from the object: fall back to `min_coverage_percent["standard"]`
   - If `"standard"` key is also missing: fall back to `80` (hardcoded safety net)

**Current code** (line 552 of `test-watcher.cjs`):
```js
const coverageThreshold = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;
```

**Required change**: Replace with a resolution function that handles both scalar and object formats, reading `effective_intensity` from the state.

**Acceptance Criteria**:

- AC-003-01: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"light"`, when test-watcher resolves coverage threshold, then the threshold is 60.
- AC-003-02: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"standard"`, when test-watcher resolves coverage threshold, then the threshold is 80.
- AC-003-03: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"epic"`, when test-watcher resolves coverage threshold, then the threshold is 95.
- AC-003-04: Given `min_coverage_percent` is `80` (scalar, legacy format), when test-watcher resolves coverage threshold, then the threshold is 80 regardless of effective_intensity.
- AC-003-05: Given `effective_intensity` is not present in state.json (no sizing decision), when test-watcher resolves coverage threshold, then `"standard"` tier is used as default.
- AC-003-06: Given `min_coverage_percent` is `{"light": 60, "epic": 95}` (missing `"standard"` key) and `effective_intensity` is `"standard"`, when test-watcher resolves coverage threshold, then the fallback value 80 is used.
- AC-003-07: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"unknown_tier"`, when test-watcher resolves coverage threshold, then the `"standard"` value (80) is used.

---

### FR-004: Update gate-requirements-injector.cjs to display intensity-aware thresholds

**Description**: Modify the gate-requirements-injector to display the resolved coverage threshold (accounting for intensity) in its gate output message instead of the raw config value.

**Current code** (line 229 of `gate-requirements-injector.cjs`):
```js
const coverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent) || 'N/A';
lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverage}%)`);
```

**Required change**: When `min_coverage_percent` is an object, resolve it using the same intensity lookup as FR-003, then display the resolved value. Optionally include the tier label in the output for clarity.

**Example output**: `- test_iteration: enabled (max 10 iterations, coverage >= 80% [standard])`

**Acceptance Criteria**:

- AC-004-01: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"standard"`, when gate-requirements-injector formats the message, then the output includes `coverage >= 80%`.
- AC-004-02: Given `min_coverage_percent` is `80` (scalar), when gate-requirements-injector formats the message, then the output includes `coverage >= 80%` (no tier label).

---

### FR-005: Add constitutional clarification note to Article II

**Description**: Add a clarifying note under Article II in `constitution.md` explaining that the 100% thresholds are aspirational and that practical enforcement uses intensity-based tiered thresholds. The article text itself remains unchanged.

**Note to add** (after the Article II coverage thresholds list):

```markdown
> **Enforcement Note**: These thresholds represent the aspirational north star.
> Practical gate enforcement uses intensity-based tiers aligned with workflow
> sizing (light/standard/epic). See `iteration-requirements.json` for
> enforced values per intensity level.
```

**Acceptance Criteria**:

- AC-005-01: Given `constitution.md` is read, when Article II is inspected, then the original threshold text (100% line coverage) is unchanged.
- AC-005-02: Given `constitution.md` is read, when Article II is inspected, then an enforcement note referencing intensity-based tiers is present below the thresholds list.

---

### FR-006: Update agent prose to reference tiered thresholds instead of hardcoded 80%

**Description**: Update the hardcoded "80%" coverage references in agent markdown files to reference intensity-based thresholds. These are prose references that agents read as instructions.

**Files requiring prose updates**:

| File | Line(s) | Current Text | Required Change |
|------|---------|-------------|-----------------|
| `05-software-developer.md` | 284, 331, 339, 443, 824, 888 | "80% coverage" / ">=80%" | "coverage threshold for the active intensity tier (see iteration-requirements.json)" |
| `06-integration-tester.md` | 215, 306, 451 | "70% integration coverage" | "integration coverage threshold for the active intensity tier" |
| `16-quality-loop-engineer.md` | 491 | "default: 80%" | "threshold per active intensity tier (light: 60%, standard: 80%, epic: 95%)" |
| `09-cicd-engineer.md` | 30 | ">=80% unit, >=70% integration" | "unit/integration coverage per intensity tier" |
| `discover-orchestrator.md` | 2068 | "unit >= 80%, integration >= 70%" | "unit/integration coverage per intensity tier" |
| `00-sdlc-orchestrator.md` | 715, 891, 1389 | "80%", ">=80%", "test coverage >=80%" | "coverage per intensity tier" |

**Acceptance Criteria**:

- AC-006-01: Given `05-software-developer.md` is read, when coverage threshold references are searched, then no hardcoded "80%" coverage values remain as absolute requirements (contextual examples like "85% (target: 80%)" in status reports are acceptable).
- AC-006-02: Given `16-quality-loop-engineer.md` is read, when the GATE-16 checklist is inspected, then the coverage item references intensity-based thresholds, not a hardcoded 80%.
- AC-006-03: Given `06-integration-tester.md` is read, when integration coverage references are searched, then no hardcoded "70%" integration coverage values remain as absolute gate requirements.

---

## Non-Functional Requirements

### NFR-001: Backward Compatibility

**Description**: The tiered threshold schema MUST be backward-compatible with the existing scalar `min_coverage_percent` format. Any consumer that reads `min_coverage_percent` as a number must continue to work when encountering the old scalar format in custom or overridden configs.

**Metric**: Zero breaking changes for projects using scalar `min_coverage_percent` values.

**Acceptance Criteria**:

- AC-NFR-001-01: Given a project has a custom `iteration-requirements.json` override with `"min_coverage_percent": 90` (scalar), when test-watcher reads this value, then 90 is used as the threshold (no crash, no type error).

---

### NFR-002: Fail-Open Behavior

**Description**: If the intensity tier cannot be determined (missing `effective_intensity` in state.json, missing tier key in config), the system MUST fall back to the `"standard"` tier threshold. It MUST NOT crash, block, or use 0%.

**Metric**: All fallback paths produce the standard tier threshold (80% for unit, 70% for integration).

**Acceptance Criteria**:

- AC-NFR-002-01: Given `state.json` has no `active_workflow.sizing` block, when test-watcher resolves coverage threshold, then the standard tier value is used (not 0, not undefined, not a crash).

---

### NFR-003: No New Dependencies

**Description**: The fix MUST NOT introduce any new runtime or dev dependencies. It uses only existing Node.js APIs and the existing iSDLC hook infrastructure.

**Metric**: `package.json` dependencies and devDependencies remain unchanged.

---

## Constraints

### CON-001: No Changes to Gate-Blocker Logic

The `gate-blocker.cjs` hook reads iteration state from `state.json` -- it does not directly read `iteration-requirements.json` coverage thresholds. The gate-blocker checks whether `test_iteration.completed` and `test_iteration.status` are set correctly. No changes to `gate-blocker.cjs` are required because the threshold resolution happens upstream in `test-watcher.cjs`.

### CON-002: Constitution Article II Text Unchanged

The original Article II threshold text ("Unit tests: 100% line coverage") MUST NOT be modified. Only a clarifying note is added below the existing text.

### CON-003: Fix Workflows Default to Standard

Fix workflows (`/isdlc fix`) do not run Phase 00 sizing. They have no `sizing` block in `workflows.json`. Coverage enforcement for fix workflows MUST default to `"standard"` tier thresholds (80% unit, 70% integration).

---

## File Change List

### Must Change

| # | File | Change Description |
|---|------|--------------------|
| 1 | `src/claude/hooks/config/iteration-requirements.json` | Replace scalar `min_coverage_percent` with intensity-keyed objects in phases 06, 07, and 16 |
| 2 | `src/claude/hooks/test-watcher.cjs` | Add intensity-aware threshold resolution logic (~10 lines) |
| 3 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | Update coverage display to resolve intensity-aware thresholds |
| 4 | `docs/isdlc/constitution.md` | Add enforcement note below Article II thresholds |

### Should Change (Agent Prose)

| # | File | Change Description |
|---|------|--------------------|
| 5 | `src/claude/agents/05-software-developer.md` | Replace hardcoded 80% references with intensity-tier language |
| 6 | `src/claude/agents/06-integration-tester.md` | Replace hardcoded 70% references with intensity-tier language |
| 7 | `src/claude/agents/16-quality-loop-engineer.md` | Replace "default: 80%" in GATE-16 checklist with tiered thresholds |
| 8 | `src/claude/agents/09-cicd-engineer.md` | Replace hardcoded 80%/70% in Article II reference |
| 9 | `src/claude/agents/00-sdlc-orchestrator.md` | Replace hardcoded 80% coverage references |
| 10 | `src/claude/agents/discover-orchestrator.md` | Replace hardcoded 80%/70% in coverage display |

### No Changes Required

| File | Reason |
|------|--------|
| `src/claude/hooks/gate-blocker.cjs` | Reads iteration state, not raw thresholds (CON-001) |
| `src/isdlc/config/workflows.json` | Already has sizing/intensity -- no modifications needed |
| `src/claude/hooks/lib/common.cjs` | Intensity detection (`applySizingDecision`) already works -- no changes needed |

---

## Test Strategy

### Unit Tests for test-watcher.cjs

Test the threshold resolution function with these scenarios:

| Test Case | Input | Expected Threshold |
|-----------|-------|--------------------|
| Scalar value (legacy) | `min_coverage_percent: 80` | 80 |
| Object, light intensity | `{light: 60, standard: 80, epic: 95}`, intensity=`"light"` | 60 |
| Object, standard intensity | `{light: 60, standard: 80, epic: 95}`, intensity=`"standard"` | 80 |
| Object, epic intensity | `{light: 60, standard: 80, epic: 95}`, intensity=`"epic"` | 95 |
| Object, missing intensity key | `{light: 60, epic: 95}`, intensity=`"standard"` | 80 (hardcoded fallback) |
| Object, unknown intensity tier | `{light: 60, standard: 80, epic: 95}`, intensity=`"unknown"` | 80 (standard fallback) |
| No sizing in state.json | `{light: 60, standard: 80, epic: 95}`, no intensity | 80 (standard default) |
| Null/undefined coverage config | `min_coverage_percent: undefined` | null (no enforcement, existing behavior) |

### Unit Tests for gate-requirements-injector.cjs

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Scalar coverage | `min_coverage_percent: 80` | `"coverage >= 80%"` |
| Object coverage, standard | `{light: 60, standard: 80, epic: 95}`, intensity=`"standard"` | `"coverage >= 80%"` (with optional `[standard]` label) |

### Integration Tests

| Test Case | Description |
|-----------|-------------|
| Light workflow end-to-end | Verify that a light-intensity workflow with 62% coverage passes the test-watcher gate |
| Standard workflow end-to-end | Verify that a standard-intensity workflow with 75% coverage fails the test-watcher gate |
| Epic workflow end-to-end | Verify that an epic-intensity workflow with 90% coverage fails (threshold is 95%) |
| Fix workflow (no sizing) | Verify that a fix workflow with no sizing block defaults to standard thresholds |

---

## Traceability

| Requirement | Acceptance Criteria | Files |
|-------------|--------------------|----|
| FR-001 | AC-001-01, AC-001-02 | `iteration-requirements.json` |
| FR-002 | AC-002-01 | `iteration-requirements.json` |
| FR-003 | AC-003-01 through AC-003-07 | `test-watcher.cjs` |
| FR-004 | AC-004-01, AC-004-02 | `gate-requirements-injector.cjs` |
| FR-005 | AC-005-01, AC-005-02 | `constitution.md` |
| FR-006 | AC-006-01, AC-006-02, AC-006-03 | Agent `.md` files (6 files) |
| NFR-001 | AC-NFR-001-01 | `test-watcher.cjs` |
| NFR-002 | AC-NFR-002-01 | `test-watcher.cjs` |
