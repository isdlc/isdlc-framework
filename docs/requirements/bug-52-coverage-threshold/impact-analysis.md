# Impact Analysis: Coverage Threshold Discrepancy (#52)

**Generated**: 2026-02-19
**Bug**: #52 -- Coverage threshold discrepancy: Constitution mandates 100% unit coverage but Phase 16 only enforces 80%
**Based On**: Phase 01 Requirements (finalized), Phase 00 Quick Scan
**Phase**: 02-impact-analysis (analysis mode -- no state.json, no branches)

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | Constitution vs Phase 16 threshold gap | Tiered intensity-aware coverage thresholds across Phases 06, 07, and 16 |
| Must-change files | ~3-5 files | 4 files (config, hook, lib, doc) |
| Should-change files | Not identified | 6 agent prose files |
| Keywords | `min_coverage_percent`, `Article II`, `intensity` | + `effective_intensity`, `sizing`, `test-watcher`, `gate-requirements-injector` |
| Key insight added | Quick scan missed test-watcher.cjs | Requirements identified test-watcher.cjs as the primary logic change, not gate-blocker.cjs |
| Scope Change | - | EXPANDED (added Phase 07 tiered thresholds, FR-004 injector update, 6 agent prose files) |

---

## Executive Summary

This bug fix introduces intensity-aware coverage thresholds into three enforcement phases (06, 07, 16) and the two hooks that consume them (`test-watcher.cjs` for threshold evaluation, `gate-requirements-injector.cjs` for display). The change is structurally contained: the schema in `iteration-requirements.json` shifts `min_coverage_percent` from scalar to object-keyed-by-intensity, and a single resolution function in `test-watcher.cjs` (~10 lines) bridges the new format to the existing enforcement pipeline. The gate-blocker is explicitly not affected (CON-001). Six agent markdown files need prose updates to stop hardcoding "80%" as an absolute value. A constitutional clarification note is appended (not modifying existing Article II text). The primary risk is backward compatibility for custom configs using scalar `min_coverage_percent` values, mitigated by the dual-format resolution logic (FR-003).

**Blast Radius**: LOW (10 files total; 4 must-change, 6 should-change prose)
**Risk Level**: LOW-MEDIUM (no existing test-watcher.cjs test file; backward compatibility requires careful dual-format handling)
**Affected Files**: 10 (4 code/config + 6 agent prose)
**Affected Modules**: 3 (hooks/config, hooks/enforcement, agents/prose)

---

## Impact Analysis (M1)

### Directly Affected Files by FR

| FR | File | Change Type | Lines Affected (est.) |
|----|------|-------------|----------------------|
| FR-001, FR-002 | `src/claude/hooks/config/iteration-requirements.json` | Schema change | ~6 lines (3 scalar-to-object replacements) |
| FR-003 | `src/claude/hooks/test-watcher.cjs` | Logic addition | ~15 lines (new resolution function + call site at line 552) |
| FR-004 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | Display logic | ~10 lines (line 229 resolution + optional tier label) |
| FR-005 | `docs/isdlc/constitution.md` | Documentation | ~5 lines (add enforcement note after Article II, line 28) |
| FR-006 | 6 agent `.md` files | Prose updates | ~20 lines total across 6 files |

### Outward Dependencies (what consumes the affected files)

```
iteration-requirements.json
  |
  +-- test-watcher.cjs (reads min_coverage_percent at line 552)
  |     |
  |     +-- All Bash tool executions during phases 06, 07, 16 (PostToolUse hook)
  |
  +-- gate-requirements-injector.cjs (reads min_coverage_percent at line 229)
  |     |
  |     +-- gate-context-injector.cjs (calls buildGateRequirementsBlock)
  |     +-- All PreToolUse prompts during test phases (gate context display)
  |
  +-- gate-blocker.cjs (reads phase_requirements for gate checks)
  |     |
  |     +-- NOT affected: reads test_iteration.completed/status from state.json,
  |         not the raw threshold value (CON-001 confirmed by code review)
  |
  +-- common.cjs loadIterationRequirements() (config loader)
        |
        +-- Used by test-watcher.cjs and gate-blocker.cjs as fallback loader
        +-- NOT affected: loader returns raw JSON, does not interpret min_coverage_percent
```

### Inward Dependencies (what the affected files depend on)

```
test-watcher.cjs (FR-003)
  |
  +-- READS: state.json -> active_workflow.sizing.effective_intensity (NEW dependency)
  +-- READS: iteration-requirements.json -> phase_requirements[phase].test_iteration.success_criteria
  +-- READS: common.cjs -> debugLog, getTimestamp, loadIterationRequirements
  +-- WRITES: state.json -> phases[phase].iteration_requirements.test_iteration.coverage

gate-requirements-injector.cjs (FR-004)
  |
  +-- READS: iteration-requirements.json (via loadIterationRequirements)
  +-- READS: constitution.md (via parseConstitutionArticles)
  +-- NO direct state.json access (does not know effective_intensity currently)
  +-- NOTE: FR-004 may need state.json access OR accept intensity as a parameter
```

### Change Propagation Assessment

**Propagation is minimal**. The change flows through a single pipeline:

1. `iteration-requirements.json` schema changes (upstream data)
2. `test-watcher.cjs` resolves threshold using new dual-format logic (core logic)
3. `gate-requirements-injector.cjs` displays resolved threshold (presentation)
4. `gate-blocker.cjs` is NOT in the propagation path (reads downstream state, not upstream config)

No cascading changes beyond these files. The 6 agent prose files are cosmetic updates.

---

## Entry Points (M2)

### Primary Entry Points

| # | Entry Point | Type | FR | Description |
|---|-------------|------|----|-------------|
| 1 | `test-watcher.cjs:check()` line 399 | PostToolUse hook | FR-003 | Main entry -- invoked after every Bash tool call; filters for test commands then resolves coverage threshold |
| 2 | `test-watcher.cjs` line 552 | Coverage resolution site | FR-003 | **Exact change point**: `const coverageThreshold = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;` -- must be replaced with intensity-aware resolution |
| 3 | `gate-requirements-injector.cjs:formatBlock()` line 212 | Gate display | FR-004 | Formats threshold for display; line 229 reads `min_coverage_percent` as scalar |
| 4 | `gate-requirements-injector.cjs:buildGateRequirementsBlock()` line 306 | Public API | FR-004 | Top-level function called by gate-context-injector; currently has no state.json access |
| 5 | `iteration-requirements.json` phases 06, 07, 16 | Config | FR-001, FR-002 | `success_criteria.min_coverage_percent` fields (lines 219, 279, 676) |
| 6 | `constitution.md` Article II | Documentation | FR-005 | Lines 24-28 (after the thresholds list) |

### New Entry Points Required

| # | Entry Point | Type | FR | Description |
|---|-------------|------|----|-------------|
| 1 | `resolveCoverageThreshold(minCoveragePercent, state)` | New function | FR-003 | ~10-line utility function in test-watcher.cjs that handles scalar vs object format |
| 2 | None in gate-requirements-injector | N/A | FR-004 | Could reuse the same resolution pattern inline or extract a shared helper |

### Implementation Chain

```
FR-001 + FR-002: iteration-requirements.json (pure config, no logic)
    |
    v
FR-003: test-watcher.cjs
    - Add resolveCoverageThreshold() function
    - Read state.active_workflow.sizing.effective_intensity
    - Replace line 552 with resolution call
    - Backward compat: if typeof min_coverage_percent === 'number', return it directly
    |
    v
FR-004: gate-requirements-injector.cjs
    - Update formatBlock() line 229 to handle object min_coverage_percent
    - Option A: Accept effective_intensity as parameter (requires API change to buildGateRequirementsBlock)
    - Option B: Resolve to "standard" default when intensity unknown (simpler, no API change)
    - Option C: Display all tiers inline e.g., "60/80/95% by tier" (no state needed)
    |
    v
FR-005: constitution.md (add note, no code)
    |
    v
FR-006: Agent prose files (replace hardcoded percentages, no code)
```

### Recommended Implementation Order

1. **FR-001 + FR-002** first (config changes -- enables all downstream)
2. **FR-003** second (core logic -- most complex, most testable)
3. **FR-004** third (display -- depends on FR-001 schema being decided)
4. **FR-005** fourth (documentation)
5. **FR-006** last (prose -- lowest risk, independent)

**Rationale**: FR-001/002 are pure data. FR-003 is the critical logic and should be implemented with tests early. FR-004 depends on understanding the final schema. FR-005 and FR-006 are documentation-only.

---

## Risk Assessment (M3)

### Test Coverage Gaps

| File | Existing Test File | Coverage Status | Risk |
|------|-------------------|-----------------|------|
| `test-watcher.cjs` | **NONE** | **No dedicated test file exists** | **HIGH** |
| `gate-requirements-injector.cjs` | `tests/gate-requirements-injector.test.cjs` | Has tests, ~15 test cases | LOW |
| `iteration-requirements.json` | Validated indirectly by gate-blocker tests | LOW | LOW |
| `gate-blocker.cjs` | 2 test files (phase-status-bypass, inconsistent-behavior) | Moderate | NO CHANGE |
| `constitution.md` | No automated tests (documentation) | N/A | N/A |
| Agent `.md` files | No automated tests (prose) | N/A | N/A |

**Critical gap**: `test-watcher.cjs` is a 711-line file with exported functions (`check`, `normalizeErrorForComparison`, `isIdenticalFailure`, `parseCoverage`, `parseTestResult`) but **zero dedicated test files**. The only test coverage comes from cross-hook integration tests that exercise it indirectly.

**Impact**: FR-003 modifies the coverage resolution logic in test-watcher.cjs. Without existing tests, there is no regression safety net. New tests must be written first (Article II: Test-First Development).

### Complexity Hotspots

| File | Cyclomatic Complexity | Concern |
|------|-----------------------|---------|
| `test-watcher.cjs:check()` | HIGH (~15 branches) | The `check()` function has deeply nested if/else chains for test result classification (inconclusive/passed/failed), coverage enforcement, and ATDD mode. Adding intensity resolution adds another branch. |
| `gate-requirements-injector.cjs:formatBlock()` | LOW (~5 branches) | Simple string formatting. Easy to modify. |
| `iteration-requirements.json` | N/A (data) | Schema change is straightforward. |

### Technical Debt Markers

1. **test-watcher.cjs line 552**: The coverage threshold is read as a raw value with no validation. Adding a resolution function actually reduces debt by introducing type checking.
2. **gate-requirements-injector.cjs line 229**: Currently does `|| 'N/A'` fallback for display. Needs to handle object type gracefully.
3. **No shared threshold resolution utility**: Both test-watcher.cjs and gate-requirements-injector.cjs will need similar resolution logic. Risk of code duplication if not extracted to a shared utility (could go in common.cjs, but requirements say "no changes to common.cjs").

### Risk Zones (Intersections of Change + Low Coverage)

| Risk Zone | Severity | Description |
|-----------|----------|-------------|
| test-watcher.cjs coverage resolution | **HIGH** | Core enforcement logic with no existing tests. Must add tests BEFORE modifying. |
| gate-requirements-injector.cjs display | LOW | Has existing test suite. Change is display-only. |
| iteration-requirements.json schema | MEDIUM | Schema change affects all consumers. Must verify gate-blocker still works (it reads structure differently, so risk is low but must be validated). |

### Dependency on #51 (Sizing Decision Correctness)

**Bug #51**: "Sizing decision must always prompt the user -- silent fallback paths bypass user consent."

**Relationship**: #52 reads `active_workflow.sizing.effective_intensity` to determine which coverage tier to apply. If #51's bug causes `effective_intensity` to be set incorrectly (e.g., silently defaulting to "standard" when the user wanted "light"), then #52's tiered thresholds will enforce the wrong tier.

**Assessment**: This is a **weak dependency**, not a blocker:
- #52 explicitly defaults to "standard" when no sizing exists (FR-003 AC-003-05), which is the same behavior as #51's silent fallback
- #52 does not make the #51 bug worse -- it already exists
- #52 can proceed independently because its fallback behavior matches the current system behavior
- When #51 is fixed later (ensuring users always confirm sizing), #52's tiered thresholds will automatically benefit from correct `effective_intensity` values

**Recommendation**: Proceed with #52 independently. Note the dependency in the implementation but do not block on #51.

### Risk Recommendations

| # | Recommendation | Priority | Rationale |
|---|---------------|----------|-----------|
| 1 | **Create test-watcher.test.cjs** before modifying test-watcher.cjs | P0 | Article II compliance; no regression safety net exists |
| 2 | Test the resolution function with all 8 scenarios from requirements | P0 | Covers scalar compat, all tiers, missing keys, unknown tiers |
| 3 | Add integration test: light workflow with 62% coverage passes | P1 | Validates end-to-end tiered enforcement |
| 4 | Add integration test: fix workflow (no sizing) defaults to standard | P1 | Validates fail-open behavior |
| 5 | Verify gate-blocker is unaffected by schema change | P1 | Confirm CON-001 with a test |
| 6 | Consider extracting `resolveCoverageThreshold()` to common.cjs for reuse | P2 | Avoids duplication between test-watcher and gate-requirements-injector |

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: FR-001/002 (config) -> FR-003 (core logic with tests) -> FR-004 (display) -> FR-005 (constitution note) -> FR-006 (agent prose)
2. **High-Risk Areas**: Write test-watcher.cjs tests BEFORE modifying it (zero existing test coverage for this file)
3. **Dependencies to Resolve**: FR-004 design decision -- how does `gate-requirements-injector.cjs` get the intensity? Options: (A) pass as parameter, (B) default to "standard", (C) display all tiers inline. Requirements spec says "same intensity lookup as FR-003" which implies option A or reading state.json.
4. **#51 Dependency**: Weak -- proceed independently, document the relationship

### FR-004 Design Decision (Flagged)

The `buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot)` function currently has **no access to state.json**. To resolve intensity-aware thresholds, one of these approaches is needed:

- **Option A**: Add an optional `state` parameter to the function signature. This is the cleanest but changes the public API.
- **Option B**: Have the function read state.json directly (follows the pattern of other functions in the file that read config files from disk).
- **Option C**: Display all tiers inline (e.g., `coverage >= 60/80/95% [light/standard/epic]`) without resolving. Simplest, no state access needed.

**Recommendation**: Option C for simplicity. The gate-requirements-injector is a display-only component. Showing all tiers is more informative than resolving to one value. The actual enforcement happens in test-watcher.cjs (FR-003).

---

## Coupling Analysis

### Module Coupling Map

```
                    +----------------------------+
                    | iteration-requirements.json |  <-- FR-001, FR-002
                    | (config/data)              |
                    +----------------------------+
                         |              |
                    reads |              | reads
                         v              v
              +------------------+  +---------------------------+
              | test-watcher.cjs |  | gate-requirements-        |
              | (PostToolUse)    |  | injector.cjs (display)    |
              | FR-003           |  | FR-004                    |
              +------------------+  +---------------------------+
                    |                        |
              reads |                   called by
                    v                        v
              +------------------+  +---------------------------+
              | state.json       |  | gate-context-injector.cjs |
              | (effective_      |  | (PreToolUse)              |
              | intensity)       |  |                           |
              +------------------+  +---------------------------+
                    ^
              writes |
                    |
              +------------------+
              | common.cjs       |
              | applySizingDecision|
              | (Phase 02 output) |
              +------------------+
```

### Coupling Assessment

- **Loose coupling**: test-watcher.cjs and gate-requirements-injector.cjs both read iteration-requirements.json but do not depend on each other
- **Data coupling**: test-watcher.cjs couples to state.json via `active_workflow.sizing.effective_intensity` (new read dependency in FR-003)
- **No control coupling**: gate-blocker.cjs is decoupled from threshold values (reads only state, not config thresholds)
- **Stamp coupling risk**: If the `resolveCoverageThreshold()` function is duplicated in both test-watcher and gate-requirements-injector, this creates maintenance risk. Extracting to common.cjs would resolve this but is out of scope per requirements.

---

## Impact Analysis Metadata

```json
{
  "analysis_completed_at": "2026-02-19",
  "sub_agents": ["M1-impact-analyzer", "M2-entry-point-finder", "M3-risk-assessor"],
  "mode": "analysis-only (no state.json, no branches)",
  "requirements_document": "docs/requirements/bug-52-coverage-threshold/requirements.md",
  "quick_scan_used": "docs/requirements/bug-52-coverage-threshold/quick-scan.md",
  "scope_change_from_original": "expanded",
  "requirements_keywords": ["min_coverage_percent", "effective_intensity", "sizing", "test-watcher", "gate-requirements-injector", "iteration-requirements", "Article II", "constitution"],
  "files_directly_affected": 10,
  "modules_affected": 3,
  "risk_level": "low-medium",
  "blast_radius": "low",
  "coverage_gaps": 1,
  "dependency_on_51": "weak (not blocking)"
}
```
