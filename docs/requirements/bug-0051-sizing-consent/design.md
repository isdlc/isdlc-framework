# Design: Bug #51 -- Sizing Consent

**Phase**: 04-design (analysis mode)
**Scope**: SMALL -- 2 modified files, 1 new test file
**Generated**: 2026-02-19
**Traces to**: FR-001 through FR-006, AC-001 through AC-011

---

## 1. Module Design

Three files are modified. No new modules, no new dependencies.

| File | Change | Functions Affected |
|------|--------|--------------------|
| `src/claude/hooks/lib/common.cjs` | Add function + extend record | `extractFallbackSizingMetrics()` (new), `applySizingDecision()` (extend record), `module.exports` (add export) |
| `src/claude/commands/isdlc.md` | Restructure S1/S3 control flow | STEP 3e-sizing: S1, S2, S3 |
| `src/claude/hooks/tests/sizing-consent.test.cjs` | New test file | 12 test cases |

---

## 2. Function Design: `extractFallbackSizingMetrics()`

### 2.1 Signature

```javascript
/**
 * Attempt to extract sizing metrics from fallback artifacts when
 * parseSizingFromImpactAnalysis() returns null.
 *
 * @param {string} artifactFolder - e.g. 'bug-0051-sizing-consent'
 * @param {string} projectRoot    - absolute path to project root
 * @returns {{ metrics: object | null, source: string | null }}
 */
function extractFallbackSizingMetrics(artifactFolder, projectRoot)
```

### 2.2 Pseudocode

```
function extractFallbackSizingMetrics(artifactFolder, projectRoot):
    basePath = path.join(projectRoot, 'docs', 'requirements', artifactFolder)

    // --- Fallback 1: quick-scan.md ---
    try:
        content = fs.readFileSync(path.join(basePath, 'quick-scan.md'), 'utf8')
        // Extract last ```json ... ``` block (same regex pattern as parseSizingFromImpactAnalysis)
        jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g
        lastMatch = null
        while (match = jsonBlockRegex.exec(content)):
            lastMatch = match[1]

        if lastMatch:
            parsed = JSON.parse(lastMatch)
            if typeof parsed.affected_file_count === 'number':
                risk = normalizeRiskLevel(parsed.risk_level)
                return {
                    metrics: {
                        file_count: parsed.affected_file_count,
                        module_count: 0,
                        risk_score: risk,
                        coupling: 'unknown',
                        coverage_gaps: 0
                    },
                    source: 'quick-scan'
                }
    catch (e):
        // File not found or parse error -- fall through

    // --- Fallback 2: requirements-spec.md ---
    try:
        content = fs.readFileSync(path.join(basePath, 'requirements-spec.md'), 'utf8')
              OR path.join(basePath, 'requirements.md')  // see note below
        scopeMatch = content.match(/(^|\n)\*?\*?Scope\*?\*?\s*[:=]\s*(SMALL|MEDIUM|LARGE)/im)
        if scopeMatch:
            keyword = scopeMatch[2].toUpperCase()
            SCOPE_MAP = { SMALL: 3, MEDIUM: 10, LARGE: 25 }
            return {
                metrics: {
                    file_count: SCOPE_MAP[keyword],
                    module_count: 0,
                    risk_score: 'medium',
                    coupling: 'unknown',
                    coverage_gaps: 0
                },
                source: 'requirements-spec'
            }
    catch (e):
        // File not found or no match -- fall through

    // --- No fallback available ---
    return { metrics: null, source: null }
```

**Note on filename**: The requirements file is named `requirements.md` in this project (not `requirements-spec.md`). The function should try `requirements-spec.md` first, then fall back to `requirements.md`, to handle both naming conventions. This is a single additional `readFileSync` wrapped in try/catch.

### 2.3 `normalizeRiskLevel()` helper (inline, not exported)

```
function normalizeRiskLevel(raw):
    if not raw or typeof raw !== 'string': return 'medium'
    normalized = raw.toLowerCase().trim()
    VALID = ['low', 'medium', 'high']
    if VALID.includes(normalized): return normalized
    // Compound levels like 'low-to-medium' -> take the higher
    if normalized.includes('medium'): return 'medium'
    if normalized.includes('high'): return 'high'
    return 'medium'  // unknown -> conservative default
```

### 2.4 Placement

Insert immediately after `parseSizingFromImpactAnalysis()` (after line 2756 of `common.cjs`). The helper `normalizeRiskLevel` goes directly above or as a nested function. Add to `module.exports` after line 3445 (the sizing utilities block):

```javascript
    parseSizingFromImpactAnalysis,
    computeSizingRecommendation,
    extractFallbackSizingMetrics,   // <-- new
    applySizingDecision,
```

---

## 3. Modified `applySizingDecision()` Sizing Record Schema

### 3.1 Before (current, lines 2907-2921)

```javascript
const sizingRecord = {
    intensity,
    effective_intensity,
    file_count: metrics ? (metrics.file_count || 0) : 0,
    module_count: metrics ? (metrics.module_count || 0) : 0,
    risk_score: metrics ? (metrics.risk_score || 'unknown') : 'unknown',
    coupling: metrics ? (metrics.coupling || 'unknown') : 'unknown',
    coverage_gaps: metrics ? (metrics.coverage_gaps || 0) : 0,
    recommended_by: sizingData.forced_by_flag ? 'user' : 'framework',
    overridden: !!sizingData.overridden,
    overridden_to: sizingData.overridden_to || null,
    decided_at: now,
    forced_by_flag: !!sizingData.forced_by_flag,
    epic_deferred
};
```

### 3.2 After (4 new fields appended)

```javascript
const sizingRecord = {
    // --- Existing fields (unchanged) ---
    intensity,
    effective_intensity,
    file_count: metrics ? (metrics.file_count || 0) : 0,
    module_count: metrics ? (metrics.module_count || 0) : 0,
    risk_score: metrics ? (metrics.risk_score || 'unknown') : 'unknown',
    coupling: metrics ? (metrics.coupling || 'unknown') : 'unknown',
    coverage_gaps: metrics ? (metrics.coverage_gaps || 0) : 0,
    recommended_by: sizingData.forced_by_flag ? 'user' : 'framework',
    overridden: !!sizingData.overridden,
    overridden_to: sizingData.overridden_to || null,
    decided_at: now,
    forced_by_flag: !!sizingData.forced_by_flag,
    epic_deferred,

    // --- New audit fields (FR-005, FR-006) ---
    reason: sizingData.reason || null,
    user_prompted: sizingData.user_prompted !== undefined
        ? !!sizingData.user_prompted : null,
    fallback_source: sizingData.fallback_source || null,
    fallback_attempted: sizingData.fallback_attempted !== undefined
        ? !!sizingData.fallback_attempted : null,
};
```

### 3.3 Backward Compatibility

All four new fields default to `null` when the caller provides no corresponding `sizingData` properties. Existing callers (S3 happy path) will produce `null` for all four until they are updated to pass explicit values. Downstream consumers use optional chaining and only read `effective_intensity` -- confirmed safe (architecture.md section 4.3).

---

## 4. Control Flow Changes in `isdlc.md` STEP 3e-sizing

### 4.1 S1 -- Sizing Disabled (PATH 1)

**Current** (line 1476): Silently writes inline record, skips to 3e-refine.

**New**: Insert stderr warning before the inline record write. Add two fields to the inline record.

```
S1. Read configuration:
   - Read active_workflow.flags.light from state.json
   - Read workflows.json -> workflows.feature.sizing
   - If sizing.enabled is falsy or sizing block is missing:
     a. Emit stderr: [sizing] Adaptive sizing is disabled in workflows.json. Defaulting to standard workflow.
     b. Write sizing record:
        {
          intensity: 'standard',
          effective_intensity: 'standard',
          recommended_by: 'framework',
          overridden: false,
          decided_at: <now>,
          forced_by_flag: false,
          epic_deferred: false,
          reason: 'sizing_disabled',        // NEW
          user_prompted: false,              // NEW
          fallback_source: null,             // NEW
          fallback_attempted: false          // NEW
        }
     c. Write state.json, skip to 3e-refine.
```

**Traces to**: FR-001, AC-001

### 4.2 S2 -- Light Flag (PATH 2)

**Current** (line 1479): Calls `applySizingDecision(state, 'light', { forced_by_flag: true, config: sizingConfig })`.

**New**: Add `reason` and `user_prompted` to the sizingData argument.

```
S2. IF -light flag is set:
   a. Call applySizingDecision(state, 'light', {
        forced_by_flag: true,
        config: sizingConfig,
        reason: 'light_flag',           // NEW
        user_prompted: false             // NEW
      })
   b-e. (unchanged)
```

**Traces to**: FR-006, AC-011

### 4.3 S3 -- Standard Sizing Flow (PATH 3)

This is the main restructuring. The current S3.a-b has two early-exit branches that silently default. These are replaced with a fallback chain + user prompt.

**Current flow** (lines 1498-1502):
```
S3.a  Read impact-analysis.md
      [missing] -> default standard, log, write record, skip
S3.b  parseSizingFromImpactAnalysis(content)
      [null] -> default standard, log, write record, skip
S3.c  (thresholds)
S3.d  computeSizingRecommendation()
S3.e  Display banner
S3.f  User menu
S3.g  Handle choice
```

**New flow**:
```
S3.a  Read impact-analysis.md
      [found] -> parseSizingFromImpactAnalysis(content) -> metrics_or_null
      [missing] -> metrics_or_null = null, ia_reason = 'ia_file_missing'

S3.b  IF metrics_or_null is non-null:
        // HAPPY PATH -- unchanged behavior
        metrics = metrics_or_null
        GOTO S3.c (thresholds -> recommendation -> banner -> user menu)
        Pass reason: 'user_accepted' or 'user_overridden' to applySizingDecision
        Pass user_prompted: true, fallback_attempted: false

S3.b-fallback  ELSE (metrics_or_null is null):
        // FALLBACK PATH -- new behavior
        ia_reason = ia_reason || 'ia_parse_failed'
        fallbackResult = extractFallbackSizingMetrics(artifactFolder, projectRoot)
        metrics = fallbackResult.metrics   // may still be null
        source = fallbackResult.source     // 'quick-scan', 'requirements-spec', or null

S3.c  Read thresholds (unchanged)

S3.d  recommendation = computeSizingRecommendation(metrics, thresholds)

S3.e  Display banner:
        IF on fallback path:
          Display WARNING banner:
          +----------------------------------------------------------+
          |  WARNING: Impact analysis metrics unavailable             |
          |                                                           |
          |  Could not extract sizing metrics from impact-analysis.md |
          |  {if source: "Partial metrics from: {source}.md"}         |
          |  {if !source: "No metrics available"}                     |
          |                                                           |
          |  Recommended: {recommendation.intensity}                  |
          |  Rationale: {recommendation.rationale}                    |
          +----------------------------------------------------------+
        ELSE (happy path):
          Display standard recommendation banner (unchanged)

S3.f  Present user menu (Accept / Override / Show):
        [A] Accept recommendation
        [O] Override (choose different intensity)
        [S] Show {fallback ? "available diagnostic info" : "full impact analysis"}

S3.g  Handle user choice:
        [A] Accept:
          Call applySizingDecision(state, recommendation.intensity, {
            metrics,
            config: sizingConfig,
            reason: ia_reason ? ia_reason : 'user_accepted',   // see note
            user_prompted: true,
            fallback_source: source || null,
            fallback_attempted: !!ia_reason
          })
        [O] Override:
          IF metrics is null:
            Show picker: [1] Light  [2] Standard
            Display note: (Epic requires impact analysis metrics)
          ELSE:
            Show picker: [1] Light  [2] Standard  [3] Epic
          Call applySizingDecision(state, chosen, {
            metrics,
            overridden: true,
            overridden_to: chosen,
            recommended_intensity: recommendation.intensity,
            config: sizingConfig,
            reason: 'user_overridden',
            user_prompted: true,
            fallback_source: source || null,
            fallback_attempted: !!ia_reason
          })
        [S] Show:
          IF on fallback path:
            Display: fallback source file contents (or "No diagnostic info available")
          ELSE:
            Display: full impact-analysis.md
          Loop back to S3.f

S3.h-k  (Write state, update tasks, display confirmation -- unchanged)
```

**Note on reason field**: When on the fallback path, the reason reflects how we got there (`ia_parse_failed` or `ia_file_missing`). The `user_prompted: true` field separately records that the user was asked. On the happy path, `reason` is `user_accepted` or `user_overridden` and `fallback_attempted` is `false`.

**Traces to**: FR-002, FR-003, FR-004, AC-002 through AC-010

---

## 5. Error Taxonomy

No new error types. The changes use existing patterns:

| Condition | Handling | Output |
|-----------|----------|--------|
| `sizing.enabled` is falsy | stderr warning + inline record write | `[sizing] Adaptive sizing is disabled in workflows.json. Defaulting to standard workflow.\n` |
| `impact-analysis.md` not found | Fallback chain + user prompt | WARNING banner in user menu |
| `parseSizingFromImpactAnalysis()` returns null | Fallback chain + user prompt | WARNING banner in user menu |
| `quick-scan.md` not found | Skip to next fallback | No output (silent fallthrough within chain) |
| `quick-scan.md` JSON malformed | Skip to next fallback | No output (caught by try/catch) |
| `requirements-spec.md` not found | Return null metrics | No output (caught by try/catch) |
| `requirements-spec.md` no scope keyword | Return null metrics | No output |

---

## 6. Validation Rules

### 6.1 Input Validation in `extractFallbackSizingMetrics()`

| Parameter | Validation | On Failure |
|-----------|-----------|------------|
| `artifactFolder` | Must be non-empty string | Return `{ metrics: null, source: null }` |
| `projectRoot` | Must be non-empty string | Return `{ metrics: null, source: null }` |
| `parsed.affected_file_count` | Must be `typeof === 'number'` | Skip quick-scan fallback |
| `parsed.risk_level` | Passed through `normalizeRiskLevel()` | Defaults to `'medium'` |
| Scope keyword | Must match `SMALL`, `MEDIUM`, or `LARGE` (case-insensitive) | Skip requirements fallback |

### 6.2 Input Validation in `applySizingDecision()` -- New Fields

| Field | Validation | Default |
|-------|-----------|---------|
| `sizingData.reason` | String or falsy | `null` |
| `sizingData.user_prompted` | Boolean-coercible or undefined | `null` |
| `sizingData.fallback_source` | String or falsy | `null` |
| `sizingData.fallback_attempted` | Boolean-coercible or undefined | `null` |

No strict validation -- these are audit fields. The `|| null` / `!== undefined` pattern handles absent values.

---

## 7. Test Case Matrix

**File**: `src/claude/hooks/tests/sizing-consent.test.cjs`
**Framework**: `node:test` + `node:assert/strict` (matching existing test conventions)
**Mocking**: `fs.readFileSync` via module-level stubbing or temp directory with fixture files

### 7.1 `extractFallbackSizingMetrics()` Unit Tests

| # | Test Case | Input Setup | Expected Output | Traces |
|---|-----------|-------------|-----------------|--------|
| 1 | Quick-scan fallback succeeds | Temp dir with `quick-scan.md` containing valid JSON block with `affected_file_count: 3, risk_level: 'low'` | `{ metrics: { file_count: 3, module_count: 0, risk_score: 'low', coupling: 'unknown', coverage_gaps: 0 }, source: 'quick-scan' }` | FR-003, AC-004 |
| 2 | Quick-scan with compound risk level | `quick-scan.md` with `risk_level: 'low-to-medium'` | `risk_score: 'medium'` | FR-003, architecture D3 |
| 3 | Quick-scan missing, requirements fallback succeeds | No `quick-scan.md`; `requirements.md` with `**Scope**: SMALL` | `{ metrics: { file_count: 3, ... }, source: 'requirements-spec' }` | FR-003, AC-005 |
| 4 | Quick-scan malformed JSON, requirements fallback | `quick-scan.md` with invalid JSON; valid `requirements.md` | Falls through to requirements; `source: 'requirements-spec'` | FR-003 |
| 5 | Quick-scan has no `affected_file_count` field | `quick-scan.md` JSON block missing the field | Falls through to requirements fallback | FR-003 |
| 6 | Both files missing | Empty temp dir | `{ metrics: null, source: null }` | FR-003, AC-006 |
| 7 | Requirements with LARGE scope | `requirements.md` with `Scope: LARGE` | `file_count: 25` | FR-003 |
| 8 | Invalid arguments (empty strings) | `artifactFolder: ''` | `{ metrics: null, source: null }` | defensive |

### 7.2 `applySizingDecision()` Audit Field Tests

| # | Test Case | sizingData Input | Expected Record Fields | Traces |
|---|-----------|------------------|----------------------|--------|
| 9 | New fields written when provided | `{ reason: 'sizing_disabled', user_prompted: false, fallback_source: null, fallback_attempted: false }` | Record contains all four fields with exact values | FR-005, AC-009 |
| 10 | Backward compat: new fields default to null | `{}` (no new fields) | `reason: null, user_prompted: null, fallback_source: null, fallback_attempted: null` | NFR-003, AC-009 |
| 11 | PATH 2 audit fields | `{ forced_by_flag: true, reason: 'light_flag', user_prompted: false }` | `reason: 'light_flag', user_prompted: false, forced_by_flag: true` | FR-006, AC-011 |
| 12 | PATH 3 fallback fields | `{ reason: 'ia_parse_failed', user_prompted: true, fallback_source: 'quick-scan', fallback_attempted: true }` | All four fields match input | FR-005, AC-009 |

### 7.3 Not Unit-Testable (Manual / Integration)

| Item | Reason | Verification |
|------|--------|-------------|
| S1 stderr warning emitted | Orchestrator logic lives in `isdlc.md` (prompt text, not executable code) | Manual: run workflow with `sizing.enabled: false`, check stderr |
| S3 user menu displayed on fallback | Same -- UX flow in orchestrator prompt | Manual: corrupt `impact-analysis.md`, verify menu appears |
| Epic excluded from override picker | Menu construction in orchestrator prompt | Manual: ensure no metrics, verify picker shows 2 options |

---

## 8. Integration Points

### 8.1 `module.exports` Update

The `extractFallbackSizingMetrics` function must be added to the exports block in `common.cjs` (around line 3443-3445) for it to be importable in tests:

```javascript
    // Sizing utilities (REQ-0011)
    parseSizingFromImpactAnalysis,
    computeSizingRecommendation,
    extractFallbackSizingMetrics,  // NEW -- Bug #51
    applySizingDecision,
```

### 8.2 Test File Import

```javascript
const { extractFallbackSizingMetrics, applySizingDecision } = require('../lib/common.cjs');
```

### 8.3 Downstream Impact -- None

Verified in architecture.md section 4.3: all downstream consumers of `active_workflow.sizing` use optional chaining and only read `effective_intensity`. No changes required to:
- `workflow-completion-enforcer.cjs`
- `gate-blocker.cjs`
- `performance-budget.cjs`
- Any agent files

---

## 9. Implementation Order

1. **`common.cjs`**: Add `extractFallbackSizingMetrics()` + helper. Extend `applySizingDecision()` record. Update exports.
2. **`sizing-consent.test.cjs`**: Write all 12 test cases. Run and verify they pass against the updated `common.cjs`.
3. **`isdlc.md`**: Update S1 (stderr + inline record fields), S2 (audit fields), S3 (fallback + prompt restructure).

This order allows tests to validate the library functions before modifying the orchestrator prompt.
