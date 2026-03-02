# Architecture Notes: Bug #51 -- Sizing Consent

**Phase**: 02-architecture (analysis mode)
**Scope**: SMALL -- control flow fix, no architectural changes
**Generated**: 2026-02-19

---

## 1. Change Summary

This is a control-flow and observability fix within the existing sizing subsystem. No new modules, no new dependencies, no schema migrations. The architecture pattern, tech stack, database, and infrastructure are all unchanged.

Three modifications:
1. **PATH 1** (sizing disabled): Add stderr warning + audit field to existing inline record write.
2. **PATH 3** (IA parse failure): Replace silent default with fallback extraction + user prompt.
3. **All paths**: Add four additive audit fields to the sizing record.

---

## 2. Function Signatures

### 2.1 New Function: `extractFallbackSizingMetrics(artifactFolder, projectRoot)`

**Location**: `src/claude/hooks/lib/common.cjs`, immediately after `parseSizingFromImpactAnalysis()` (after line 2756).

```javascript
/**
 * Attempt to extract sizing metrics from fallback artifacts when
 * parseSizingFromImpactAnalysis() returns null.
 *
 * Fallback order:
 *   1. quick-scan.md   -> JSON metadata block at bottom of file
 *   2. requirements-spec.md -> scope keyword (SMALL/MEDIUM/LARGE)
 *   3. Return { metrics: null, source: null }
 *
 * @param {string} artifactFolder - e.g. 'bug-0051-sizing-consent'
 * @param {string} projectRoot    - absolute path to project root
 * @returns {{ metrics: SizingMetrics | null, source: string | null }}
 */
function extractFallbackSizingMetrics(artifactFolder, projectRoot)
```

**Return type**: `{ metrics: object | null, source: string | null }`
- `source` is one of: `'quick-scan'`, `'requirements-spec'`, or `null`
- `metrics` matches the same shape as `_validateAndNormalizeSizingMetrics()` output:
  `{ file_count, module_count, risk_score, coupling, coverage_gaps }`

**Design decisions**:
- Reads files synchronously via `fs.readFileSync()` -- consistent with all other file reads in common.cjs.
- Constructs paths as: `path.join(projectRoot, 'docs', 'requirements', artifactFolder, filename)`.
- Wraps each read in try/catch -- file-not-found returns null for that source and tries the next.
- Does NOT call `_validateAndNormalizeSizingMetrics()` internally because the field names differ between quick-scan metadata (`affected_file_count`, `risk_level`) and impact-analysis metadata (`files_directly_affected`, `risk_level`). The function performs its own mapping inline.

**Quick-scan mapping** (source: quick-scan.md JSON metadata block):

| Quick-scan field | Maps to | Notes |
|-----------------|---------|-------|
| `affected_file_count` | `file_count` | Direct integer |
| (not available) | `module_count` | Default: `0` |
| `risk_level` | `risk_score` | Normalize to lowercase; accept `'low'`, `'medium'`, `'high'`, `'low-to-medium'` -> `'medium'` |
| (not available) | `coupling` | Default: `'unknown'` |
| (not available) | `coverage_gaps` | Default: `0` |

**Requirements-spec mapping** (source: scope keyword search):

| Scope keyword | `file_count` | `risk_score` |
|--------------|-------------|-------------|
| `SMALL` | `3` | `'medium'` |
| `MEDIUM` | `10` | `'medium'` |
| `LARGE` | `25` | `'medium'` |

Remaining fields default to `module_count: 0`, `coupling: 'unknown'`, `coverage_gaps: 0`.

**Scope keyword detection**: Regex `/(^|\n)\*?\*?Scope\*?\*?\s*[:=]\s*(SMALL|MEDIUM|LARGE)/im` -- matches markdown bold/plain "Scope: SMALL" patterns. Takes the first match.

### 2.2 Modified Function: `applySizingDecision(state, intensity, sizingData)`

**Location**: `src/claude/hooks/lib/common.cjs`, line 2880.

**Signature**: Unchanged. New fields are passed via the existing `sizingData` bag parameter.

**New `sizingData` fields** (all optional, backward compatible):

| Field | Type | Description |
|-------|------|-------------|
| `sizingData.reason` | `string` | `'sizing_disabled'`, `'light_flag'`, `'ia_parse_failed'`, `'ia_file_missing'`, `'user_accepted'`, `'user_overridden'` |
| `sizingData.user_prompted` | `boolean` | Whether Accept/Override menu was shown |
| `sizingData.fallback_source` | `string\|null` | `'quick-scan'`, `'requirements-spec'`, or `null` |
| `sizingData.fallback_attempted` | `boolean` | Whether fallback extraction was tried |

**Sizing record additions** (lines ~2907-2920, additive):

```javascript
const sizingRecord = {
    // ... existing fields unchanged ...
    reason: sizingData.reason || null,
    user_prompted: sizingData.user_prompted !== undefined ? !!sizingData.user_prompted : null,
    fallback_source: sizingData.fallback_source || null,
    fallback_attempted: sizingData.fallback_attempted !== undefined ? !!sizingData.fallback_attempted : null,
};
```

All four fields default to `null` when not provided, ensuring backward compatibility with existing callers (the happy path S3.g lines 1527-1535 will pass `reason: 'user_accepted'` or `reason: 'user_overridden'`).

### 2.3 Unchanged Functions

- `parseSizingFromImpactAnalysis(content)` -- no changes. Its null-return contract is correct.
- `computeSizingRecommendation(metrics, thresholds)` -- no changes. It already handles null metrics correctly and can accept fallback metrics.
- `_validateAndNormalizeSizingMetrics(parsed)` -- no changes. Not used by the fallback function (different field names).
- `_checkSizingInvariants(state)` -- no changes.

---

## 3. Data Flow: Fallback Chain

```
STEP 3e-sizing (isdlc.md)
    |
    S1. Read config -> sizing.enabled?
    |       |
    |   [false] --> stderr warning + write record w/ reason:'sizing_disabled' --> 3e-refine
    |       |
    S2. -light flag?
    |       |
    |   [true] --> applySizingDecision('light', {reason:'light_flag'}) --> 3e-refine
    |       |
    S3. Read impact-analysis.md
    |       |
    |   [file missing] --> FALLBACK CHAIN (new)
    |       |
    |   [file found] --> parseSizingFromImpactAnalysis(content)
    |                       |
    |                   [non-null] --> computeSizingRecommendation() --> user menu (unchanged)
    |                       |
    |                   [null] --> FALLBACK CHAIN (new)
    |
    FALLBACK CHAIN:
    |
    extractFallbackSizingMetrics(artifactFolder, projectRoot)
    |       |
    |   [1] Try quick-scan.md JSON block
    |       |-- success --> { metrics, source: 'quick-scan' }
    |       |-- fail -----> try next
    |       |
    |   [2] Try requirements-spec.md scope keyword
    |       |-- success --> { metrics, source: 'requirements-spec' }
    |       |-- fail -----> { metrics: null, source: null }
    |
    Display WARNING banner (metrics available or not)
    |
    computeSizingRecommendation(fallbackMetrics, thresholds)
    |   (note: if fallbackMetrics is null, returns standard)
    |
    Present Accept/Override/Show menu
    |       |
    |   [A] Accept --> applySizingDecision(intensity, {reason:'user_accepted', fallback_source, ...})
    |   [O] Override --> present picker (epic excluded if no metrics) --> applySizingDecision(...)
    |   [S] Show --> display diagnostic info --> loop back to menu
    |
    Write state.json --> 3e-refine
```

---

## 4. Integration Points

### 4.1 isdlc.md STEP 3e-sizing Changes

**S1 (PATH 1, line 1476)**: Insert stderr write before the existing sizing record write. The inline record construction gains `reason: 'sizing_disabled'` and `user_prompted: false`. No call to `applySizingDecision()` -- PATH 1 writes the record inline today and should continue to do so (see decision D1 below).

**S2 (PATH 2, line 1479)**: Add `reason: 'light_flag'` and `user_prompted: false` to the `sizingData` argument of the existing `applySizingDecision()` call.

**S3 (PATH 3, lines 1498-1539)**: Restructure the null-handling branches (lines 1500-1502) to:
1. Call `extractFallbackSizingMetrics(artifactFolder, projectRoot)`.
2. Display warning banner.
3. Call `computeSizingRecommendation(fallbackResult.metrics, thresholds)`.
4. Present Accept/Override/Show menu.
5. In the override picker, conditionally exclude epic (check `fallbackResult.metrics === null`).

**S3 happy path (non-null IA parse)**: Add `reason` and `user_prompted: true` to existing `applySizingDecision()` calls at lines 1529/1532. No other changes.

### 4.2 common.cjs Changes

1. Add `extractFallbackSizingMetrics()` function (new, ~50-60 lines).
2. Add it to `module.exports` under the sizing utilities block (after line 3445).
3. Modify `applySizingDecision()` to read and write the four new fields from `sizingData` into the sizing record (4 lines added to the record construction at lines 2907-2920).

### 4.3 Downstream Consumers -- No Changes Required

Two references to `active_workflow.sizing` in isdlc.md (lines 1248, 1314) both use optional chaining and `|| "standard"` fallback. They read `effective_intensity` only -- unaffected by new fields. The hooks that read sizing (`workflow-completion-enforcer.cjs`, `gate-blocker.cjs`, `performance-budget.cjs`) all use optional chaining. Zero breaking risk confirmed.

---

## 5. Architectural Decisions

### D1: PATH 1 inline record vs. applySizingDecision()

**Decision**: Keep PATH 1 writing its sizing record inline (as today). Do NOT refactor to use `applySizingDecision()`.

**Rationale**: `applySizingDecision()` handles phase mutation (for light intensity) and invariant checking. PATH 1 always writes standard with no phase mutations. Routing through `applySizingDecision()` would add unnecessary code paths and make the function signature more complex for a degenerate case. The inline write is simpler and more explicit (Article V: Simplicity First).

**Trade-off**: Two places write sizing records (inline + function). Mitigated by the new audit fields being added to both locations, and tests covering both.

### D2: Quick-scan metadata field name

**Decision**: Use `affected_file_count` (not `file_count_estimate`).

**Rationale**: The quick-scan agent writes `affected_file_count` in its JSON metadata block (confirmed in `docs/requirements/bug-0051-sizing-consent/quick-scan.md`, line 176). The requirements doc mentions both names; the actual field in the artifact is `affected_file_count`.

### D3: Risk level normalization for compound values

**Decision**: Map compound risk levels (e.g., `'low-to-medium'`) to `'medium'`.

**Rationale**: `_validateAndNormalizeSizingMetrics()` only accepts `['low', 'medium', 'high']`. Quick-scan sometimes produces hyphenated ranges. Mapping upward (to the higher of the two) is the conservative choice for sizing decisions. A simple check: if the value is not in the valid set, default to `'medium'`.

### D4: Epic exclusion logic location

**Decision**: Epic exclusion is controlled in `isdlc.md` (the orchestrator), not in `computeSizingRecommendation()`.

**Rationale**: `computeSizingRecommendation()` is a pure function that computes a recommendation. Whether to present epic as an override option is a UX/consent concern that belongs in the orchestrator. The function may still recommend standard when metrics are null -- that is correct. The override picker restriction is a separate concern.

---

## 6. Sizing Record Schema (After Fix)

```javascript
{
    // Existing fields (unchanged)
    intensity: 'light' | 'standard' | 'epic',
    effective_intensity: 'light' | 'standard',
    file_count: number,
    module_count: number,
    risk_score: string,
    coupling: string,
    coverage_gaps: number,
    recommended_by: 'user' | 'framework',
    overridden: boolean,
    overridden_to: string | null,
    decided_at: string,           // ISO timestamp
    forced_by_flag: boolean,
    epic_deferred: boolean,

    // New fields (additive, nullable for backward compat)
    reason: string | null,        // 'sizing_disabled' | 'light_flag' | 'ia_parse_failed' |
                                  // 'ia_file_missing' | 'user_accepted' | 'user_overridden'
    user_prompted: boolean | null, // true if Accept/Override menu was shown
    fallback_source: string | null, // 'quick-scan' | 'requirements-spec' | null
    fallback_attempted: boolean | null // true if extractFallbackSizingMetrics() was called
}
```

---

## 7. Test Strategy

**New file**: `src/claude/hooks/tests/sizing-consent.test.cjs`

Test groups:

| Group | What | Approach |
|-------|------|----------|
| `extractFallbackSizingMetrics()` | Unit tests for fallback chain | Mock `fs.readFileSync` via `jest.spyOn`. Test: quick-scan success, requirements-spec success, both missing, malformed JSON, compound risk level normalization. |
| `applySizingDecision()` audit fields | New fields written to record | Call with various `sizingData` combinations, assert record shape. |
| Sizing record backward compat | Old callers without new fields | Call `applySizingDecision()` without new fields, verify new fields default to `null`. |
| Epic exclusion | Override menu restriction | Not unit-testable (UX in isdlc.md). Document as manual test case. |

Estimated: 12-15 test cases. No existing test coverage for sizing functions to regress against -- this is net-new coverage.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fallback reads wrong file path | Low | Low | Construct path from `artifactFolder` + known filenames; test with mocked fs |
| Quick-scan metadata format changes | Low | Low | Graceful null return on parse failure; logs source for debugging |
| New fields break downstream readers | Very Low | Low | All new fields are nullable; downstream uses optional chaining already verified |
| PATH 1 inline record diverges from applySizingDecision record | Low | Low | Tests assert both record shapes; both include the same four new fields |

---

## 9. Handoff to Implementation

Files to modify (in order):
1. `src/claude/hooks/lib/common.cjs` -- Add `extractFallbackSizingMetrics()`, modify `applySizingDecision()` record construction, update `module.exports`.
2. `src/claude/commands/isdlc.md` -- S1: add stderr warning + audit fields. S2: add audit fields. S3: restructure null branches for fallback + prompt. S3 happy path: add audit fields.
3. `src/claude/hooks/tests/sizing-consent.test.cjs` -- New test file.

No changes to: `workflows.json`, hook files, gate-blocker, performance-budget, or any agent files.
