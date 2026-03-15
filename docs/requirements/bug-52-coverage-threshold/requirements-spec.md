# Requirements Specification: Coverage Threshold Discrepancy Fix

**Bug ID:** BUG-0054-GH-52
**External Link:** GitHub Issue #52
**Scope:** fix (bug-report)
**Severity:** Medium
**Generated:** 2026-03-15
**Status:** Approved

---

## 1. Bug Summary and Context

The iSDLC framework's coverage enforcement uses flat scalar thresholds in `iteration-requirements.json` (80% unit in phases 06/16, 70% integration in phase 07) regardless of workflow intensity. The framework already has a mature intensity system (`workflows.json` with light/standard/epic sizing stored in `state.json`), but coverage enforcement ignores it. This creates over-constraint for light workflows and under-constraint for epic workflows.

### Design Decisions (Pre-Answered)

These decisions were made during triage and are fixed:
1. Use the existing intensity system from `workflows.json` -- no new infrastructure
2. Constitution Article II text stays aspirational -- no changes to threshold numbers
3. Add a constitutional clarification note about intensity-based practical enforcement
4. Coverage reads `effective_intensity` from `state.json` at `active_workflow.sizing.effective_intensity`
5. Default to `"standard"` tier when no sizing decision exists (e.g., fix workflows)

---

## 2. Fix Requirements (Functional)

### FR-001: Add tiered unit coverage thresholds to iteration-requirements.json

Replace the scalar `min_coverage_percent` in phases `06-implementation` and `16-quality-loop` with an intensity-aware object.

**Tiered unit coverage thresholds:**

| Intensity | Unit Coverage (Phase 06, Phase 16) |
|-----------|-----------------------------------|
| light     | 60%                               |
| standard  | 80%                               |
| epic      | 95%                               |

**Schema change:** `success_criteria.min_coverage_percent` changes from a scalar number to an object keyed by intensity tier. Scalar fallback MUST remain valid for backward compatibility.

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

**Acceptance Criteria:**
- AC-001-01: Given `iteration-requirements.json` is loaded, when phase is `06-implementation`, then `min_coverage_percent` contains keys `light`, `standard`, and `epic` with values 60, 80, and 95 respectively.
- AC-001-02: Given `iteration-requirements.json` is loaded, when phase is `16-quality-loop`, then `min_coverage_percent` contains keys `light`, `standard`, and `epic` with values 60, 80, and 95 respectively.

---

### FR-002: Add tiered integration coverage thresholds to iteration-requirements.json

Replace the scalar `min_coverage_percent: 70` in Phase 07 with an intensity-aware object.

**Tiered integration coverage thresholds:**

| Intensity | Integration Coverage (Phase 07) |
|-----------|---------------------------------|
| light     | 50%                             |
| standard  | 70%                             |
| epic      | 85%                             |

**Acceptance Criteria:**
- AC-002-01: Given `iteration-requirements.json` is loaded, when phase is `07-testing`, then `min_coverage_percent` contains keys `light`, `standard`, and `epic` with values 50, 70, and 85 respectively.

---

### FR-003: Update test-watcher.cjs to resolve intensity-aware coverage thresholds

Modify the `test-watcher.cjs` hook to resolve the effective coverage threshold from the tiered `min_coverage_percent` object using the current workflow's `effective_intensity`.

**Resolution logic (in priority order):**
1. Read `active_workflow.sizing.effective_intensity` from `state.json`
2. If not present (e.g., fix workflows without sizing), default to `"standard"`
3. Look up `phaseReq.test_iteration.success_criteria.min_coverage_percent`:
   - If it is a **number** (scalar): use it directly (backward compatibility)
   - If it is an **object**: look up `min_coverage_percent[effective_intensity]`
   - If the intensity key is missing from the object: fall back to `min_coverage_percent["standard"]`
   - If `"standard"` key is also missing: fall back to `80` (hardcoded safety net)

**Acceptance Criteria:**
- AC-003-01: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"light"`, when test-watcher resolves coverage threshold, then the threshold is 60.
- AC-003-02: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"standard"`, when test-watcher resolves coverage threshold, then the threshold is 80.
- AC-003-03: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"epic"`, when test-watcher resolves coverage threshold, then the threshold is 95.
- AC-003-04: Given `min_coverage_percent` is `80` (scalar, legacy format), when test-watcher resolves coverage threshold, then the threshold is 80 regardless of effective_intensity.
- AC-003-05: Given `effective_intensity` is not present in state.json (no sizing decision), when test-watcher resolves coverage threshold, then `"standard"` tier is used as default.
- AC-003-06: Given `min_coverage_percent` is `{"light": 60, "epic": 95}` (missing `"standard"` key) and `effective_intensity` is `"standard"`, when test-watcher resolves coverage threshold, then the fallback value 80 is used.
- AC-003-07: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"unknown_tier"`, when test-watcher resolves coverage threshold, then the `"standard"` value (80) is used.

---

### FR-004: Update gate-requirements-injector.cjs to display intensity-aware thresholds

Modify the gate-requirements-injector to display the resolved coverage threshold (accounting for intensity) in its gate output message instead of the raw config value.

**Example output:** `- test_iteration: enabled (max 10 iterations, coverage >= 80% [standard])`

**Acceptance Criteria:**
- AC-004-01: Given `min_coverage_percent` is `{"light": 60, "standard": 80, "epic": 95}` and `effective_intensity` is `"standard"`, when gate-requirements-injector formats the message, then the output includes `coverage >= 80%`.
- AC-004-02: Given `min_coverage_percent` is `80` (scalar), when gate-requirements-injector formats the message, then the output includes `coverage >= 80%` (no tier label).

---

### FR-005: Add constitutional clarification note to Article II

Add a clarifying note under Article II in `constitution.md` explaining that the coverage thresholds are aspirational and practical enforcement uses intensity-based tiers. The article text itself remains unchanged.

**Acceptance Criteria:**
- AC-005-01: Given `constitution.md` is read, when Article II is inspected, then the original threshold text (>=80% unit, >=70% integration) is unchanged.
- AC-005-02: Given `constitution.md` is read, when Article II is inspected, then an enforcement note referencing intensity-based tiers is present below the thresholds list.

---

### FR-006: Update agent prose to reference tiered thresholds instead of hardcoded percentages

Update hardcoded coverage references in agent markdown files to reference intensity-based thresholds.

**Files requiring updates:**

| File | Current Reference | Required Change |
|------|-------------------|-----------------|
| `05-software-developer.md` | "80% coverage" / ">=80%" | Intensity-tier language |
| `06-integration-tester.md` | "70% integration coverage" | Intensity-tier language |
| `16-quality-loop-engineer.md` | "default: 80%" | Tiered thresholds |
| `09-cicd-engineer.md` | ">=80% unit, >=70% integration" | Intensity-tier language |
| `discover-orchestrator.md` | "unit >= 80%, integration >= 70%" | Intensity-tier language |
| `00-sdlc-orchestrator.md` | "80%", ">=80%", "test coverage >=80%" | Intensity-tier language |

**Acceptance Criteria:**
- AC-006-01: Given `05-software-developer.md` is read, when coverage threshold references are searched, then no hardcoded "80%" coverage values remain as absolute requirements.
- AC-006-02: Given `16-quality-loop-engineer.md` is read, when the GATE-16 checklist is inspected, then the coverage item references intensity-based thresholds, not a hardcoded 80%.
- AC-006-03: Given `06-integration-tester.md` is read, when integration coverage references are searched, then no hardcoded "70%" integration coverage values remain as absolute gate requirements.

---

## 3. Non-Functional Requirements

### NFR-001: Backward Compatibility

The tiered threshold schema MUST be backward-compatible with the existing scalar `min_coverage_percent` format. Any consumer that reads `min_coverage_percent` as a number must continue to work with scalar format in custom or overridden configs.

**Metric:** Zero breaking changes for projects using scalar `min_coverage_percent` values.

- AC-NFR-001-01: Given a project has a custom `iteration-requirements.json` override with `"min_coverage_percent": 90` (scalar), when test-watcher reads this value, then 90 is used as the threshold (no crash, no type error).

### NFR-002: Fail-Open Behavior

If the intensity tier cannot be determined (missing `effective_intensity` in state.json, missing tier key in config), the system MUST fall back to the `"standard"` tier threshold. It MUST NOT crash, block, or use 0%.

**Metric:** All fallback paths produce the standard tier threshold (80% for unit, 70% for integration).

- AC-NFR-002-01: Given `state.json` has no `active_workflow.sizing` block, when test-watcher resolves coverage threshold, then the standard tier value is used (not 0, not undefined, not a crash).

### NFR-003: No New Dependencies

The fix MUST NOT introduce any new runtime or dev dependencies. It uses only existing Node.js APIs and the existing iSDLC hook infrastructure.

**Metric:** `package.json` dependencies and devDependencies remain unchanged.

---

## 4. Constraints

### CON-001: No Changes to Gate-Blocker Logic

The `gate-blocker.cjs` hook reads iteration state from `state.json`, not raw thresholds from `iteration-requirements.json`. No changes to `gate-blocker.cjs` are required.

### CON-002: Constitution Article II Text Unchanged

The original Article II threshold text MUST NOT be modified. Only a clarifying enforcement note is added below the existing text.

### CON-003: Fix Workflows Default to Standard

Fix workflows (`/isdlc fix`) do not run Phase 00 sizing. They have no `sizing` block. Coverage enforcement for fix workflows MUST default to `"standard"` tier thresholds (80% unit, 70% integration).

---

## 5. Files to Change

### Must Change

| # | File | Change |
|---|------|--------|
| 1 | `src/claude/hooks/config/iteration-requirements.json` | Replace scalar `min_coverage_percent` with intensity-keyed objects (phases 06, 07, 16) |
| 2 | `src/claude/hooks/test-watcher.cjs` | Add intensity-aware threshold resolution (~10 lines) |
| 3 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | Display resolved thresholds in gate output |
| 4 | `docs/isdlc/constitution.md` | Add enforcement note below Article II thresholds |

### Should Change (Agent Prose)

| # | File | Change |
|---|------|--------|
| 5 | `src/claude/agents/05-software-developer.md` | Replace hardcoded 80% with intensity-tier language |
| 6 | `src/claude/agents/06-integration-tester.md` | Replace hardcoded 70% with intensity-tier language |
| 7 | `src/claude/agents/16-quality-loop-engineer.md` | Replace "default: 80%" with tiered thresholds |
| 8 | `src/claude/agents/09-cicd-engineer.md` | Replace hardcoded 80%/70% |
| 9 | `src/claude/agents/00-sdlc-orchestrator.md` | Replace hardcoded 80% |
| 10 | `src/claude/agents/discover-orchestrator.md` | Replace hardcoded 80%/70% |

### No Changes Required

| File | Reason |
|------|--------|
| `src/claude/hooks/gate-blocker.cjs` | Reads iteration state, not raw thresholds (CON-001) |
| `src/isdlc/config/workflows.json` | Already has sizing/intensity -- no modifications needed |
| `src/claude/hooks/lib/common.cjs` | Intensity detection already works |

---

## 6. Traceability

| Requirement | Acceptance Criteria | Target Files |
|-------------|--------------------|----|
| FR-001 | AC-001-01, AC-001-02 | `iteration-requirements.json` |
| FR-002 | AC-002-01 | `iteration-requirements.json` |
| FR-003 | AC-003-01 through AC-003-07 | `test-watcher.cjs` |
| FR-004 | AC-004-01, AC-004-02 | `gate-requirements-injector.cjs` |
| FR-005 | AC-005-01, AC-005-02 | `constitution.md` |
| FR-006 | AC-006-01, AC-006-02, AC-006-03 | Agent `.md` files (6 files) |
| NFR-001 | AC-NFR-001-01 | `test-watcher.cjs` |
| NFR-002 | AC-NFR-002-01 | `test-watcher.cjs` |
| NFR-003 | (no AC -- verified by package.json diff) | `package.json` |
