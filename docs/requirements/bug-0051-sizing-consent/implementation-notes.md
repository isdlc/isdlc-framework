# Implementation Notes: BUG-0051-GH-51 -- Sizing Consent

**Phase**: 06-implementation
**Date**: 2026-02-19
**Traces to**: FR-001 through FR-006, AC-001 through AC-011, NFR-001 through NFR-004

---

## Changes Summary

### 1. `src/claude/hooks/lib/common.cjs` -- New function + record extension

**New function: `extractFallbackSizingMetrics(artifactFolder, projectRoot)`**
- Implements FR-003: fallback metrics extraction chain
- Fallback order: quick-scan.md (JSON metadata) -> requirements-spec.md -> requirements.md (scope keyword) -> null
- Helper `normalizeRiskLevel()` maps compound risk levels (e.g. 'low-to-medium' -> 'medium')
- Input validation: returns `{ metrics: null, source: null }` for empty/missing arguments
- Exported in `module.exports` under sizing utilities block

**Modified: `applySizingDecision()` sizing record**
- Added 4 nullable audit fields: `reason`, `user_prompted`, `fallback_source`, `fallback_attempted`
- All default to `null` when not provided (backward compatible per NFR-003)
- No signature change -- fields read from existing `sizingData` bag

### 2. `src/claude/commands/isdlc.md` -- STEP 3e-sizing paths

**S1 (PATH 1 -- sizing disabled)**:
- Added stderr warning: `[sizing] Adaptive sizing is disabled in workflows.json...`
- Added audit fields to inline sizing record

**S2 (PATH 2 -- light flag)**:
- Added `reason: 'light_flag'` and `user_prompted: false` to `applySizingDecision` call

**S3 (PATH 3 -- standard sizing flow)**:
- Restructured: IA missing/unparseable no longer silently defaults
- Calls `extractFallbackSizingMetrics()` for fallback chain
- Displays WARNING banner with partial metrics info
- Presents Accept/Override/Show menu (user always prompted)
- Epic excluded from override picker when no metrics available (FR-004)
- All paths pass audit fields to `applySizingDecision`

### 3. `src/claude/hooks/tests/sizing-consent.test.cjs` -- 17 tests (Phase 05)

- 11 tests for `extractFallbackSizingMetrics()` (TC-01 through TC-08d)
- 6 tests for `applySizingDecision()` audit fields (TC-09 through TC-12c)
- All 17 pass. Coverage: 88% of new/changed code.

## Key Decisions

1. **`source` field always 'requirements-spec'**: Even when the actual file read is `requirements.md`, the source is reported as `'requirements-spec'` for consistency -- both filenames represent the same artifact type.

2. **`user_prompted` uses explicit undefined check**: `sizingData.user_prompted !== undefined ? !!sizingData.user_prompted : null` distinguishes between "caller explicitly passed false" (-> false) and "caller didn't pass anything" (-> null).

3. **No new dependencies**: The implementation uses only `fs`, `path`, and `JSON.parse` -- all Node.js built-ins already imported in common.cjs.

4. **Happy path unchanged (NFR-001)**: When `parseSizingFromImpactAnalysis()` returns valid metrics, the flow is identical to before. The fallback path only activates on null return.
