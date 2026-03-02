# Impact Analysis: Bug #51 -- Sizing Decision Must Always Prompt the User

**Generated**: 2026-02-19
**Bug ID**: #51
**Feature**: Silent fallback paths in adaptive sizing bypass user consent; all paths must provide visibility and prompt where appropriate
**Based On**: Phase 01 Requirements (finalized -- 6 FRs, 11 ACs)
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | 3 silent fallback paths bypass user consent in sizing | PATH 1 stderr warning, PATH 3 fallback+prompt, audit fields on all paths |
| Keywords | sizing, consent, fallback, prompt | sizing, consent, fallback, prompt, extractFallbackSizingMetrics, quick-scan, requirements-spec, epic exclusion, audit trail |
| Estimated Files | 3-5 | 3 (2 modify + 1 create) |
| Scope Change | - | Refined (same scope, sharper requirements) |

---

## Executive Summary

This bug fix is well-isolated to the sizing decision point (STEP 3e-sizing) in `isdlc.md` and the sizing utility functions in `common.cjs`. The blast radius is **low**: only 2 existing files require modification, with 1 new test file to create. The changes are additive -- new stderr warnings, a new fallback extraction function, a new user prompt branch in PATH 3, and new audit fields on sizing records. Four downstream consumers read `active_workflow.sizing` but only access `effective_intensity` and `sizing` (as a whole object for archival), so the new additive fields (`reason`, `fallback_source`, `fallback_attempted`, `user_prompted`) pose zero breaking risk. The happy path (PATH 3 with valid impact analysis) is explicitly unchanged per NFR-001.

**Blast Radius**: low (2 files modified, 1 file created, 0 transitive breakage)
**Risk Level**: low
**Affected Files**: 3
**Affected Modules**: 2 (commands, hooks/lib)

---

## Impact Analysis

### Files Directly Affected

| # | File | Change Type | Lines Affected | FR Trace |
|---|------|-------------|----------------|----------|
| 1 | `src/claude/commands/isdlc.md` | Modify | ~1473-1539 (STEP 3e-sizing: S1, S2, S3) | FR-001, FR-002, FR-004, FR-005, FR-006 |
| 2 | `src/claude/hooks/lib/common.cjs` | Modify | ~2880-2997 (applySizingDecision) + new function | FR-003, FR-005 |
| 3 | `src/claude/hooks/tests/sizing-consent.test.cjs` | Create | New file | All FRs (test coverage) |

### Outward Dependencies (What Reads Our Output)

These files/modules consume `active_workflow.sizing` or call sizing functions. None require changes, but they must be verified for backward compatibility:

| # | Consumer File | What It Reads | Breaking Risk |
|---|---------------|---------------|---------------|
| 1 | `src/claude/commands/isdlc.md` (lines 1248, 1314) | `active_workflow.sizing.effective_intensity` | None -- field unchanged |
| 2 | `src/claude/hooks/workflow-completion-enforcer.cjs` (lines 150, 158, 177) | `lastEntry.sizing` (whole object), `sizing?.effective_intensity` | None -- reads optional fields with `?.` |
| 3 | `src/claude/hooks/lib/performance-budget.cjs` (line 360) | `entry.sizing?.effective_intensity` | None -- reads optional field with `?.` |
| 4 | `src/claude/agents/impact-analysis/impact-analysis-orchestrator.md` (line 404) | References `parseSizingFromImpactAnalysis()` in documentation | None -- no code change, doc reference only |

### Inward Dependencies (What We Depend On)

| # | Dependency | Used By | Purpose |
|---|------------|---------|---------|
| 1 | `src/isdlc/config/workflows.json` (sizing block) | S1 in isdlc.md | Read `sizing.enabled`, `sizing.thresholds` -- no changes to config |
| 2 | `docs/requirements/{artifact_folder}/quick-scan.md` | New `extractFallbackSizingMetrics()` | Fallback source 1: read JSON metadata block |
| 3 | `docs/requirements/{artifact_folder}/requirements-spec.md` | New `extractFallbackSizingMetrics()` | Fallback source 2: read scope keyword |
| 4 | `docs/requirements/{artifact_folder}/impact-analysis.md` | `parseSizingFromImpactAnalysis()` (existing) | Primary sizing source -- no changes |
| 5 | `computeSizingRecommendation()` in common.cjs | S3 in isdlc.md | Recommendation algorithm -- no changes to function itself |

### Change Propagation Analysis

```
PATH 1 (sizing disabled):
  isdlc.md S1  --[add stderr warning + reason field]--> state.json sizing record
  No propagation beyond isdlc.md

PATH 2 (light flag):
  isdlc.md S2  --[add reason + user_prompted fields]--> state.json sizing record
  No propagation beyond isdlc.md (applySizingDecision already called with sizingData)

PATH 3 (IA parse failed):
  isdlc.md S3  --[calls]--> extractFallbackSizingMetrics() [NEW in common.cjs]
                              |
                              +--> reads quick-scan.md JSON metadata
                              +--> reads requirements-spec.md scope keyword
                              +--> returns { metrics, source } or { null, null }
                          --[passes metrics to]--> computeSizingRecommendation() [UNCHANGED]
                          --[displays]--> warning banner + Accept/Override/Show menu
                          --[calls]--> applySizingDecision() [MODIFIED: accepts new audit fields]
                          --[writes]--> state.json sizing record (with new fields)
```

**Propagation depth**: 2 hops maximum (isdlc.md -> common.cjs -> file I/O on quick-scan/requirements)

---

## Entry Points

### Entry Point 1: STEP 3e-sizing S1 (PATH 1 -- sizing disabled)

**Location**: `src/claude/commands/isdlc.md`, line 1476
**Current code**: Silently writes sizing record and skips to 3e-refine
**Change**: Add `process.stderr.write('[sizing] ...')` before record write; add `reason: 'sizing_disabled'` and `user_prompted: false` to record
**FR trace**: FR-001, FR-005
**AC trace**: AC-001

**Implementation detail**: This is a self-contained change in the S1 block. The sizing record is written inline (not via `applySizingDecision()`), so the new fields are added directly to the record literal.

### Entry Point 2: STEP 3e-sizing S2 (PATH 2 -- light flag)

**Location**: `src/claude/commands/isdlc.md`, lines 1478-1495
**Current code**: Calls `applySizingDecision(state, 'light', { forced_by_flag: true, config: sizingConfig })`
**Change**: Add `reason: 'light_flag'` and `user_prompted: false` to the sizingData parameter
**FR trace**: FR-006, FR-005
**AC trace**: AC-011

**Implementation detail**: The new fields flow through `applySizingDecision()`, which must be updated to propagate them into the sizing record.

### Entry Point 3: STEP 3e-sizing S3 lines 1500-1502 (PATH 3 -- IA missing/unparseable)

**Location**: `src/claude/commands/isdlc.md`, lines 1497-1539
**Current code**: If `parseSizingFromImpactAnalysis()` returns null, silently defaults to standard
**Change**: Insert new branch after null return: call `extractFallbackSizingMetrics()`, display warning banner, present Accept/Override/Show menu, restrict epic if no metrics
**FR trace**: FR-002, FR-003, FR-004, FR-005
**AC trace**: AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009

**Implementation detail**: This is the largest change. The existing S3.a (file not found) and S3.b (null metrics) early-return paths must be restructured into a fallback-then-prompt flow. The S3.e-j happy path must remain untouched.

### Entry Point 4: `extractFallbackSizingMetrics()` (new function)

**Location**: `src/claude/hooks/lib/common.cjs`, after `parseSizingFromImpactAnalysis()`
**Current code**: Does not exist
**Change**: New exported function that reads quick-scan.md and requirements-spec.md for partial metrics
**FR trace**: FR-003
**AC trace**: AC-004, AC-005, AC-006

**Implementation detail**: Must handle both `affected_file_count` and `file_count_estimate` field names in quick-scan.md (observed variation across existing quick-scan files). Must use `fs.readFileSync` for performance (no async needed, NFR-002 <100ms budget).

### Entry Point 5: `applySizingDecision()` (modified function)

**Location**: `src/claude/hooks/lib/common.cjs`, lines 2880-2997
**Current code**: Builds sizing record from `sizingData` but does not include `reason`, `fallback_source`, `fallback_attempted`, or `user_prompted`
**Change**: Propagate new audit fields from `sizingData` into `sizingRecord`
**FR trace**: FR-005
**AC trace**: AC-009

**Implementation detail**: Add 4 optional fields to the sizing record builder (lines 2907-2921). Fields default to undefined/null if not provided, maintaining backward compatibility per NFR-003.

### Entry Point 6: `module.exports` in common.cjs

**Location**: `src/claude/hooks/lib/common.cjs`, line 3443
**Current code**: Exports `parseSizingFromImpactAnalysis`, `computeSizingRecommendation`, `applySizingDecision`
**Change**: Add `extractFallbackSizingMetrics` to exports
**FR trace**: FR-003

### Recommended Implementation Order

1. **common.cjs: `extractFallbackSizingMetrics()`** -- New function, no dependencies on other changes. Can be implemented and unit-tested independently.
2. **common.cjs: `applySizingDecision()` audit fields** -- Small additive change to propagate new fields. Can be tested independently.
3. **common.cjs: export** -- Trivial one-liner after function exists.
4. **isdlc.md: S1 (PATH 1)** -- Self-contained stderr + audit field addition.
5. **isdlc.md: S2 (PATH 2)** -- Self-contained audit field addition.
6. **isdlc.md: S3 (PATH 3)** -- Largest change. Depends on steps 1-3 (needs `extractFallbackSizingMetrics` to exist). Restructure null-return handling to call fallback, display banner, present menu.
7. **Test file** -- Create `sizing-consent.test.cjs` covering all paths.

---

## Risk Assessment

### Overall Risk: LOW

The changes are additive, well-isolated, and the happy path is explicitly protected by NFR-001 (AC-010).

### Risk Area 1: Zero Existing Test Coverage for Sizing Functions

**Severity**: MEDIUM
**Description**: `parseSizingFromImpactAnalysis()`, `computeSizingRecommendation()`, and `applySizingDecision()` have **zero dedicated test files** in the test suite. The only coverage comes from incidental execution during integration tests (coverage JSON files exist, but no targeted test assertions).
**Impact**: No safety net to catch regressions when modifying `applySizingDecision()` or when the new `extractFallbackSizingMetrics()` interacts with edge cases.
**Mitigation**: FR requirement already mandates `sizing-consent.test.cjs`. Recommend expanding test scope beyond just bug #51 acceptance criteria to include regression tests for existing sizing functions.

### Risk Area 2: Quick-Scan Metadata Field Name Inconsistency

**Severity**: LOW
**Description**: The quick-scan metadata JSON block uses `affected_file_count` in some files and `file_count_estimate` in others. FR-003 specifies `file_count_estimate` as the target field, but the actual quick-scan for this bug uses `affected_file_count`. The requirements text at line 88 also references `affected_file_count`.
**Impact**: `extractFallbackSizingMetrics()` could miss valid data if it only checks one field name.
**Mitigation**: Implementation should check both `affected_file_count` and `file_count_estimate` fields (try `affected_file_count` first, fall back to `file_count_estimate`). The FR-003 requirement already mentions both field names in different places.

### Risk Area 3: isdlc.md is an Instruction File, Not Executable Code

**Severity**: LOW
**Description**: `isdlc.md` is a markdown instruction file consumed by the LLM agent, not executed as JavaScript. Changes to it describe behavior in natural language, which means:
  - No compile-time safety -- errors in the instructions are only caught at runtime when an agent follows them
  - Testing requires end-to-end workflow execution, not unit tests
**Impact**: Logic errors in the restructured PATH 3 flow (FR-002) cannot be caught by unit tests.
**Mitigation**: The test file `sizing-consent.test.cjs` covers the `common.cjs` functions directly. The isdlc.md changes should be reviewed manually for logical consistency. The existing S3.f-j pattern serves as a template for the new PATH 3 prompt flow.

### Risk Area 4: Inline Sizing Record in PATH 1 vs applySizingDecision()

**Severity**: LOW
**Description**: PATH 1 (S1, line 1476) writes the sizing record as an inline object literal, bypassing `applySizingDecision()`. PATH 2 and PATH 3 use `applySizingDecision()`. This means FR-005 audit fields must be added in two different places: the inline literal (S1) and the function (S2/S3).
**Impact**: If a developer adds a new audit field in the future, they must remember to update both the S1 inline record and `applySizingDecision()`.
**Mitigation**: Acceptable for this bug fix (not in scope to refactor S1 to use `applySizingDecision()`). Document the dual-write pattern in a code comment.

### Risk Area 5: Backward Compatibility of New Sizing Record Fields

**Severity**: VERY LOW
**Description**: New fields `reason`, `fallback_source`, `fallback_attempted`, `user_prompted` are added to the sizing record.
**Impact**: All 3 downstream consumers (`workflow-completion-enforcer.cjs`, `performance-budget.cjs`, `isdlc.md` performance budget reads) use optional chaining (`sizing?.effective_intensity`) and only access `effective_intensity` or the whole `sizing` object. None destructure or validate specific fields.
**Mitigation**: NFR-003 explicitly requires additive-only changes. Verified: no consumer will break.

### Risk Area 6: `requirements-spec.md` vs `requirements.md` Naming

**Severity**: LOW
**Description**: FR-003 fallback source 2 references `requirements-spec.md`, but the artifact folder for this bug contains `requirements.md` (not `requirements-spec.md`). The naming convention varies across the codebase.
**Impact**: The fallback function might look for the wrong filename.
**Mitigation**: The function should try both `requirements-spec.md` and `requirements.md` with graceful file-not-found handling. Alternatively, follow FR-003 exactly and only look for `requirements-spec.md` (the canonical name for the spec produced by the requirements phase).

### Test Coverage Matrix

| Function | Existing Tests | Coverage | Risk |
|----------|---------------|----------|------|
| `parseSizingFromImpactAnalysis()` | 0 test files | Incidental only | MEDIUM |
| `computeSizingRecommendation()` | 0 test files | Incidental only | MEDIUM |
| `applySizingDecision()` | 0 test files | Incidental only | MEDIUM |
| `extractFallbackSizingMetrics()` | N/A (new) | N/A | LOW (new code, full test coverage planned) |
| `_validateAndNormalizeSizingMetrics()` | 0 test files | Incidental only | LOW (private, not modified) |

### Complexity Hotspots

| Location | Cyclomatic Complexity | Concern |
|----------|-----------------------|---------|
| `applySizingDecision()` (lines 2880-2997) | High (~12 branches) | Light intensity rollback logic is the most complex path. Modification is minimal (4 field additions) but proximity to complex code warrants care. |
| S3 in isdlc.md (lines 1497-1539) | Medium (~8 branches) | Restructuring the null-return early exits into a fallback-then-prompt flow adds 2-3 new branches. |
| `extractFallbackSizingMetrics()` (new) | Low (~6 branches) | Two fallback sources with file-not-found guards. Straightforward control flow. |

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: common.cjs functions first (extractFallbackSizingMetrics -> applySizingDecision audit fields -> export), then isdlc.md paths (S1 -> S2 -> S3), then test file last
2. **High-Risk Areas**: Add tests for existing sizing functions (`parseSizingFromImpactAnalysis`, `computeSizingRecommendation`, `applySizingDecision`) BEFORE modifying them -- they have zero dedicated test coverage
3. **Dependencies to Resolve**: None -- all dependencies are inward (we read from existing files/functions; nothing new depends on us)
4. **Quick-scan field name**: Handle both `affected_file_count` and `file_count_estimate` in `extractFallbackSizingMetrics()`
5. **Dual-write pattern**: Document the S1 inline record vs `applySizingDecision()` divergence with a code comment

---

## Impact Analysis Metadata

```json
{
  "analysis_completed_at": "2026-02-19",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/bug-0051-sizing-consent/requirements.md",
  "quick_scan_used": "docs/requirements/bug-0051-sizing-consent/quick-scan.md",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["sizing", "consent", "fallback", "prompt", "extractFallbackSizingMetrics", "quick-scan", "requirements-spec", "epic", "audit", "reason", "user_prompted"],
  "files_directly_affected": 3,
  "modules_affected": 2,
  "risk_level": "low",
  "blast_radius": "low",
  "coverage_gaps": 3
}
```

**`coverage_gaps` derivation**: All 3 directly affected files have zero dedicated test coverage. `isdlc.md` and `common.cjs` have no sizing-specific tests. The test file is new (created by this bug fix).
