# Requirements: Bug #51 -- Sizing Decision Must Always Prompt the User

**Bug ID**: #51
**Scope**: SMALL (3-5 files, low complexity)
**Phase**: 01-requirements
**Generated**: 2026-02-19

---

## Problem Statement

The adaptive sizing flow (STEP 3e-sizing in `isdlc.md`) has three code paths that bypass user consent when determining workflow intensity. Two of the three paths silently default to "standard" without informing the user or recording an audit trail:

- **PATH 1** (sizing disabled in config): Silently writes a standard sizing record with no stderr warning and no user visibility.
- **PATH 2** (-light flag): Intentionally user-driven. No change needed.
- **PATH 3** (impact analysis missing or unparseable): `parseSizingFromImpactAnalysis()` returns null, and the orchestrator silently defaults to standard without warning the user that metrics could not be extracted.

All three paths should write a sizing record to `state.json` for audit trail (PATH 1 and PATH 2 already do; PATH 3 does too but with no user awareness).

---

## Functional Requirements

### FR-001: PATH 1 -- Visible logging when sizing is disabled

**Description**: When `workflows.json > workflows.feature.sizing.enabled` is falsy or the `sizing` block is missing entirely, the orchestrator must emit a visible stderr warning before defaulting to standard.

**Current behavior** (lines 1473-1476 of `isdlc.md`, step S1): Silently writes sizing record `{ intensity: 'standard', ... }` and skips to 3e-refine with no log output.

**Required behavior**:
1. Emit a stderr warning: `[sizing] Adaptive sizing is disabled in workflows.json. Defaulting to standard workflow.`
2. Continue to write the sizing record exactly as today (no prompt needed -- this is a config decision, not a data failure).
3. Add `reason: 'sizing_disabled'` to the sizing record for audit.

**Rationale**: Users and log reviewers need visibility into WHY sizing was skipped. Without logging, a misconfigured `workflows.json` (e.g., `sizing.enabled: false` left from debugging) silently degrades the experience with no trail.

---

### FR-002: PATH 3 -- User prompt when impact analysis parsing fails

**Description**: When `parseSizingFromImpactAnalysis()` returns null (impact analysis file missing, empty, or unparseable), the orchestrator must NOT silently default. Instead it must warn the user and present the Accept/Override/Show menu with "standard" as the recommendation.

**Current behavior** (lines 1500-1502 of `isdlc.md`, step S3):
- If file not found: default to standard, log warning, write sizing record, skip to 3e-refine.
- If `parseSizingFromImpactAnalysis()` returns null: default to standard with rationale "Unable to parse impact analysis", write sizing record, skip to 3e-refine.
- In both cases, the user is never prompted.

**Required behavior**:
1. Before defaulting, attempt fallback metrics extraction (see FR-003).
2. After fallback attempt (whether successful or not), display a warning banner:
   ```
   +----------------------------------------------------------+
   |  WARNING: Impact analysis metrics unavailable             |
   |                                                           |
   |  Could not extract sizing metrics from impact-analysis.md |
   |  {if fallback succeeded: "Partial metrics from: {source}"}|
   |  {if fallback failed:    "No metrics available"}          |
   |                                                           |
   |  Recommended: standard                                    |
   |  Rationale: {explanation of why standard is recommended}  |
   +----------------------------------------------------------+
   ```
3. Present the Accept/Override/Show menu:
   - `[A] Accept recommendation (standard)`
   - `[O] Override (choose different intensity)` -- see FR-004 for restricted options
   - `[S] Show available diagnostic info`
4. Handle user choice identically to the existing S3.g logic (lines 1527-1535), with adjustments per FR-004.
5. Write sizing record with `reason: 'ia_parse_failed'` and `fallback_source: '{source or null}'`.

**Rationale**: User consent is the core principle. Even when metrics are unavailable, the user should see what happened, what the system recommends, and have the ability to override.

---

### FR-003: Fallback metrics extraction when primary parsing fails

**Description**: When `parseSizingFromImpactAnalysis()` returns null, attempt to extract partial metrics from alternative artifacts before presenting the user prompt.

**Fallback order** (try each in sequence, stop at first success):

1. **quick-scan.md**: Read `docs/requirements/{artifact_folder}/quick-scan.md`. Extract `file_count_estimate` from the JSON metadata block at the bottom of the file. Map to sizing metrics: `{ file_count: file_count_estimate, module_count: 0, risk_score: risk_level, coupling: 'unknown', coverage_gaps: 0 }`.
2. **requirements-spec.md**: Read `docs/requirements/{artifact_folder}/requirements-spec.md`. Search for scope indicators (e.g., "SMALL", "MEDIUM", "LARGE" in a scope section). Map: SMALL -> `file_count: 3`, MEDIUM -> `file_count: 10`, LARGE -> `file_count: 25`. Use `risk_score: 'medium'` as default.
3. **No fallback available**: Return null. The user prompt (FR-002) will display "No metrics available" and recommend standard.

**Implementation location**: New function `extractFallbackSizingMetrics(artifactFolder, projectRoot)` in `common.cjs`, exported alongside existing sizing functions.

**Return value**: `{ metrics: object | null, source: string | null }` where `source` is `'quick-scan'`, `'requirements-spec'`, or `null`.

**Rationale**: quick-scan.md is produced in Phase 00 and contains a JSON metadata block with `affected_file_count` and `risk_level` -- these are sufficient for a rough sizing recommendation. This avoids forcing "standard" when partial data is available.

---

### FR-004: Epic excluded from override menu when no metrics are available

**Description**: When the user is presented with the override intensity picker (after choosing `[O] Override`), the epic option must be excluded if no metrics are available (i.e., both primary IA parsing AND all fallbacks returned null).

**Current behavior** (line 1531): Override picker always shows `[1] Light  [2] Standard  [3] Epic`.

**Required behavior**:
- If metrics are available (from primary or fallback): show all three options `[1] Light  [2] Standard  [3] Epic` (unchanged).
- If no metrics are available: show only `[1] Light  [2] Standard` with a note: `(Epic requires impact analysis metrics)`.

**Rationale**: Epic workflow implies significant scope. Without file count, module count, or risk data, a user cannot make an informed decision to go epic. Offering it without data creates false confidence.

---

### FR-005: All three paths write sizing record to state.json

**Description**: Every sizing code path must write a `sizing` record to `active_workflow.sizing` in `state.json` for audit trail.

**Current behavior**: All three paths already write a sizing record. However:
- PATH 1 record lacks a `reason` field explaining why standard was chosen.
- PATH 3 record lacks `fallback_source` and `fallback_attempted` fields.

**Required changes to sizing record schema** (additive -- no breaking changes):

| Field | Type | When Set | Description |
|-------|------|----------|-------------|
| `reason` | string | PATH 1, PATH 3 | Why this sizing was applied. Values: `'sizing_disabled'`, `'ia_parse_failed'`, `'ia_file_missing'`, `'user_accepted'`, `'user_overridden'` |
| `fallback_source` | string or null | PATH 3 | Which artifact provided fallback metrics: `'quick-scan'`, `'requirements-spec'`, or `null` |
| `fallback_attempted` | boolean | PATH 3 | Whether fallback extraction was attempted |
| `user_prompted` | boolean | All paths | Whether the user was shown the Accept/Override menu |

PATH 2 (-light flag) already writes a complete record with `forced_by_flag: true`. Add `user_prompted: false` and `reason: 'light_flag'` for consistency.

---

### FR-006: PATH 2 audit trail consistency

**Description**: The `-light` flag path (S2) should also include the new `reason` and `user_prompted` fields in its sizing record for audit trail completeness.

**Required additions to PATH 2 sizing record**:
- `reason: 'light_flag'`
- `user_prompted: false`

**Rationale**: Uniform sizing records across all paths simplify auditing and debugging. A query like "show all workflows where the user was not prompted" should work without path-specific logic.

---

## Non-Functional Requirements

### NFR-001: No new user prompts on happy path

**Category**: User Experience
**Requirement**: When impact analysis parsing succeeds (the normal case), the user experience must be identical to today. No new prompts, no new banners, no behavioral change.
**Metric**: The S3 happy path (lines 1497-1539) must execute identically when `parseSizingFromImpactAnalysis()` returns non-null.
**Priority**: Must Have

### NFR-002: Fallback extraction performance

**Category**: Performance
**Requirement**: `extractFallbackSizingMetrics()` must complete in under 100ms for typical artifact sizes (< 200 lines each).
**Metric**: No file reads beyond quick-scan.md and requirements-spec.md. No network calls. No recursive directory scanning.
**Priority**: Should Have

### NFR-003: Backward compatibility of sizing record

**Category**: Compatibility
**Requirement**: New fields (`reason`, `fallback_source`, `fallback_attempted`, `user_prompted`) must be additive. Existing code that reads `active_workflow.sizing` must not break if these fields are absent (for older state.json files) or present (for new ones).
**Metric**: No existing hook or function that reads `sizing` should require changes to handle the new fields.
**Priority**: Must Have

### NFR-004: Stderr warning format consistency

**Category**: Observability
**Requirement**: PATH 1 stderr warning must follow the existing `[sizing]` prefix convention used by `applySizingDecision()` (see line 2884 and 2982 of `common.cjs`).
**Metric**: Warning format: `[sizing] {message}\n` -- matches existing patterns.
**Priority**: Must Have

---

## Acceptance Criteria

### AC-001: PATH 1 -- Sizing disabled produces visible warning

**Given** `workflows.json` has `sizing.enabled: false` (or `sizing` block missing entirely)
**When** the orchestrator reaches STEP 3e-sizing after Phase 02 completes
**Then** a stderr warning `[sizing] Adaptive sizing is disabled in workflows.json. Defaulting to standard workflow.` is emitted
**And** the sizing record is written with `reason: 'sizing_disabled'` and `user_prompted: false`
**And** the orchestrator proceeds to 3e-refine without prompting the user

### AC-002: PATH 3 -- IA file missing triggers fallback + user prompt

**Given** Phase 02 has completed but `impact-analysis.md` does not exist in the artifact folder
**When** the orchestrator reaches STEP 3e-sizing
**Then** the system attempts fallback metrics extraction from quick-scan.md, then requirements-spec.md
**And** displays a warning banner showing what metrics (if any) were recovered
**And** presents the Accept/Override/Show menu with "standard" as the recommendation
**And** waits for user selection before proceeding

### AC-003: PATH 3 -- IA file exists but unparseable triggers fallback + user prompt

**Given** `impact-analysis.md` exists but contains no valid JSON metadata block and no parseable Executive Summary prose (i.e., `parseSizingFromImpactAnalysis()` returns null)
**When** the orchestrator reaches STEP 3e-sizing
**Then** the same fallback + prompt flow as AC-002 is followed

### AC-004: PATH 3 -- Fallback succeeds from quick-scan.md

**Given** `parseSizingFromImpactAnalysis()` returns null
**And** `quick-scan.md` exists with a valid JSON metadata block containing `affected_file_count` and `risk_level`
**When** `extractFallbackSizingMetrics()` runs
**Then** it returns metrics derived from quick-scan.md with `source: 'quick-scan'`
**And** the warning banner shows `Partial metrics from: quick-scan.md`
**And** the recommendation uses these partial metrics (via `computeSizingRecommendation()`)

### AC-005: PATH 3 -- Fallback succeeds from requirements-spec.md

**Given** `parseSizingFromImpactAnalysis()` returns null
**And** `quick-scan.md` does not exist or has no parseable metadata
**And** `requirements-spec.md` exists with a scope indicator (SMALL/MEDIUM/LARGE)
**When** `extractFallbackSizingMetrics()` runs
**Then** it returns approximate metrics derived from the scope keyword with `source: 'requirements-spec'`

### AC-006: PATH 3 -- All fallbacks fail, user still prompted

**Given** `parseSizingFromImpactAnalysis()` returns null
**And** neither quick-scan.md nor requirements-spec.md provide parseable metrics
**When** the orchestrator reaches the user prompt
**Then** the warning banner shows `No metrics available`
**And** the recommendation is "standard" with rationale "No sizing metrics available from any source"
**And** the override menu shows only Light and Standard (no Epic option)

### AC-007: PATH 3 -- Epic excluded from override when no metrics

**Given** the user is in the PATH 3 prompt flow
**And** no metrics are available (all fallbacks returned null)
**When** the user selects `[O] Override`
**Then** the intensity picker shows `[1] Light  [2] Standard` only
**And** displays a note: `(Epic requires impact analysis metrics)`
**And** does NOT offer Epic as an option

### AC-008: PATH 3 -- Epic available in override when fallback metrics exist

**Given** the user is in the PATH 3 prompt flow
**And** fallback metrics were successfully extracted (from quick-scan or requirements)
**When** the user selects `[O] Override`
**Then** the intensity picker shows all three options: `[1] Light  [2] Standard  [3] Epic`

### AC-009: Sizing record includes new audit fields

**Given** any sizing decision is made (PATH 1, 2, or 3)
**When** the sizing record is written to `active_workflow.sizing`
**Then** the record includes:
- `reason` (string) -- one of: `sizing_disabled`, `light_flag`, `ia_parse_failed`, `ia_file_missing`, `user_accepted`, `user_overridden`
- `user_prompted` (boolean) -- true if Accept/Override menu was shown
- `fallback_source` (string or null) -- only for PATH 3
- `fallback_attempted` (boolean) -- only for PATH 3

### AC-010: Happy path unchanged

**Given** `sizing.enabled` is true in `workflows.json`
**And** `-light` flag is NOT set
**And** `impact-analysis.md` exists with a valid JSON metadata block
**When** `parseSizingFromImpactAnalysis()` returns non-null metrics
**Then** the sizing flow executes identically to today (banner + Accept/Override/Show menu with full metrics)
**And** no fallback extraction is attempted
**And** the sizing record includes `reason: 'user_accepted'` or `reason: 'user_overridden'` based on user choice

### AC-011: PATH 2 audit trail fields added

**Given** the `-light` flag is set
**When** the sizing record is written
**Then** it includes `reason: 'light_flag'` and `user_prompted: false` alongside existing fields

---

## File Change List

| File | Change Type | Description |
|------|-------------|-------------|
| `src/claude/commands/isdlc.md` | Modify | STEP 3e-sizing: Add stderr warning to S1 (PATH 1). Restructure S3 to attempt fallback + prompt user on null metrics. Add `reason`/`user_prompted` fields to all sizing record writes. Restrict epic in override picker when no metrics. |
| `src/claude/hooks/lib/common.cjs` | Modify | Add `extractFallbackSizingMetrics(artifactFolder, projectRoot)` function. Export it. Update `applySizingDecision()` to accept and write new audit fields (`reason`, `fallback_source`, `fallback_attempted`, `user_prompted`). |
| `src/isdlc/config/workflows.json` | No change | Sizing config structure unchanged. `sizing.enabled` already exists and is read correctly. |
| `src/claude/hooks/tests/sizing-consent.test.cjs` | Create | New test file covering: PATH 1 logging, PATH 3 fallback extraction (quick-scan, requirements-spec, both missing), epic exclusion, sizing record schema, happy path regression. |

---

## Out of Scope

- **PATH 2 behavior change**: The `-light` flag path is intentional user override. Only audit field additions, no prompt changes.
- **New workflows.json configuration**: No new config keys. `sizing.enabled` and `sizing.thresholds` remain as-is.
- **Restructuring `parseSizingFromImpactAnalysis()`**: The function's return-null-on-failure contract is correct. The fix is in the caller (orchestrator), not the parser.
- **Epic workflow implementation**: Epic is already deferred to standard at line 1528. This bug only addresses the override menu restriction.
- **Hook enforcement of sizing consent**: Sizing runs in the orchestrator (`isdlc.md`), not in hooks. No hook changes needed.

---

## Dependencies

- **ADR-0003** (impact-analysis parsing strategy): Fallback extraction (FR-003) is consistent with the existing strategy of primary-then-fallback parsing documented in the ADR.
- **`quick-scan.md` metadata format**: FR-003 depends on the JSON metadata block at the bottom of quick-scan.md having `affected_file_count` and `risk_level` fields. The quick-scan agent already produces this format (verified in the quick-scan.md for this bug).

---

## Test Matrix

| Test Case | PATH | Input | Expected Outcome |
|-----------|------|-------|------------------|
| Sizing disabled | 1 | `sizing.enabled: false` | Stderr warning, standard record with `reason: 'sizing_disabled'` |
| Sizing block missing | 1 | No `sizing` key in workflows.json | Same as above |
| Light flag set | 2 | `flags.light: true` | Record includes `reason: 'light_flag'`, `user_prompted: false` |
| IA file missing, quick-scan exists | 3 | No impact-analysis.md, valid quick-scan.md | Fallback from quick-scan, user prompted, `fallback_source: 'quick-scan'` |
| IA file missing, no quick-scan, requirements exists | 3 | No IA, no quick-scan, valid requirements | Fallback from requirements, `fallback_source: 'requirements-spec'` |
| IA file exists but unparseable | 3 | Malformed IA content | Same fallback flow as missing file |
| All fallbacks fail | 3 | No IA, no quick-scan, no requirements | User prompted, "No metrics available", epic excluded from override |
| All fallbacks fail + user overrides to light | 3 | No metrics, user picks Light | Record: `reason: 'user_overridden'`, `overridden_to: 'light'` |
| Fallback metrics available + user picks epic | 3 | Fallback metrics exist, user overrides | Epic IS available, record written correctly |
| Happy path (IA parses fine) | 3 | Valid IA with JSON block | No fallback attempted, identical to current behavior |
| Happy path + user accepts | 3 | Valid IA, user picks [A] | `reason: 'user_accepted'`, `user_prompted: true` |
| Happy path + user overrides | 3 | Valid IA, user picks [O] | `reason: 'user_overridden'`, `user_prompted: true` |
