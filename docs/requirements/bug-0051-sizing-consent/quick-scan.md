# Quick Scan: Bug #51 — Sizing Decision Must Always Prompt User

**Generated**: 2026-02-19T14:30:00Z
**Bug ID**: #51
**Issue**: Sizing decision must always prompt the user — silent fallback paths bypass user consent
**Phase**: 00-quick-scan

---

## Issue Summary

The adaptive sizing flow (STEP 3e-sizing in `isdlc.md`) has **3 silent fallback paths** that skip the user prompt and auto-default to standard workflow intensity without user consent or awareness:

- **PATH 1** (sizing disabled): When `sizing.enabled` is falsy or missing in `workflows.json`, the system silently defaults to standard without logging visibility that sizing was skipped.
- **PATH 2** (light flag): `-light` flag intentional; keep as-is (user explicitly opted for light).
- **PATH 3** (impact analysis parsing failed): When `parseSizingFromImpactAnalysis()` returns null due to malformed or missing metrics, system silently defaults to standard. **User never knows parsing failed.**

**Impact**: Violates user consent principle. Users cannot see when the system is auto-deciding their workflow intensity due to missing or unparseable impact analysis data.

---

## Scope Estimate

**Estimated Scope**: SMALL
**File Count Estimate**: ~3-5 files affected
**Confidence**: HIGH
**Complexity**: Low to Medium (logic changes, not architectural)

### Rationale

- **Well-isolated changes**: The issue is confined to the sizing decision point in STEP 3e-sizing flow
- **Limited file footprint**: 2 primary files (isdlc.md + common.cjs) + potential supporting files
- **No breaking changes**: All fixes are additive (warnings/prompts) or improve existing paths
- **Clear acceptance criteria**: PATH 1 needs logging visibility, PATH 3 needs user prompt + fallback metrics

---

## Keyword Matches

### Domain Keywords

| Keyword | File Matches | Context |
|---------|--------------|---------|
| sizing | 6 files | Core sizing logic across hooks, commands, workflow definitions |
| workflow intensity | 2 files | light/standard/epic decision logic |
| impact analysis | 3 files | Metrics extraction, parsing, validation |
| consent | 0 files | Not yet mentioned; new pattern to introduce |
| user prompt | 2 files | `AskUserQuestion` calls in STEP 3e |

### Technical Keywords

| Keyword | File Matches | Context |
|---------|--------------|---------|
| parseSizingFromImpactAnalysis | 6 files | Function definition, calls, tests, coverage |
| computeSizingRecommendation | 6 files | Sizing recommendation logic |
| applySizingDecision | 6 files | Applies chosen intensity to state |
| default.*standard | 4 files | Silent fallback behavior to address |
| workflows.json | 2 files | Sizing configuration, thresholds |

---

## Affected Code Locations

### Primary Files

**1. `/src/claude/commands/isdlc.md`**
- **Section**: STEP 3e-sizing (lines 1460-1540)
- **Current behavior**:
  - S1: Reads `sizing.enabled`; if falsy, **silently skips to 3e-refine** with no logging
  - S2: `-light` flag path (no change needed; intentional user choice)
  - S3: Calls `parseSizingFromImpactAnalysis()`; if returns null, **silently defaults to standard** (line 1502)
- **Required changes**:
  - S1: Add visible logging that sizing was skipped due to config
  - S3: If parsing fails, warn user AND present Accept/Override menu (still need user consent)

**2. `/src/claude/hooks/lib/common.cjs`**
- **Functions**:
  - `parseSizingFromImpactAnalysis()` (lines 2713-2756) — Returns null on parse failure
  - `computeSizingRecommendation()` (lines 2774-2818) — Handles null metrics with silent default
- **Current behavior**:
  - `parseSizingFromImpactAnalysis()` returns null if JSON parse fails or fallback regex fails
  - `computeSizingRecommendation()` when metrics=null → returns standard with rationale "Unable to parse..." (line 2790-2794)
- **Required changes**:
  - Add fallback metrics extraction from quick-scan.md or requirements.md as secondary attempt
  - Make caller aware of parse failure vs. deliberate null return

### Supporting Files (Likely to be read/reviewed)

| File | Reason |
|------|--------|
| `/workflows.json` | Read sizing.enabled config; verify defaults |
| `/docs/requirements/{artifact-folder}/impact-analysis.md` | Test parsing logic against real artifacts |
| `/src/claude/agents/impact-analysis/` | May need to verify impact analysis output format stability |
| `BACKLOG.md` | Track completed work |

---

## Risk Assessment

### Technical Risk: LOW

1. **Localized change scope**: Sizing logic is contained; no cross-system dependencies
2. **Backward compatibility**: Changes are additive (new prompts, fallback attempts); existing Accept/Override paths unchanged
3. **No state structure changes**: The fix doesn't require new state.json fields
4. **Testable**: Each PATH (1, 3) has discrete test cases

### User-Facing Risk: MEDIUM

1. **PATH 3 fix introduces new prompt**: Will add interaction where there was none before
   - **Mitigation**: Prompt is opt-in to existing user menu; not a breaking change
2. **Fallback metrics from other artifacts**: If quick-scan/requirements are malformed, fallback may also fail
   - **Mitigation**: Graceful degradation — if all parsing fails, still prompt user with "Unable to determine sizing" message

### Integration Risk: LOW

1. **No hook changes**: Sizing is enforced via isdlc.md orchestrator logic, not hooks
2. **No phase order changes**: STEP 3e-sizing runs in existing flow; no new dependencies
3. **Configuration changes**: May need to document fallback_enabled in workflows.json

---

## Questions for Requirements Phase

1. **For PATH 1 (sizing disabled)**:
   - Should we log to console, task list, or both?
   - Should sizing-disabled state affect phase selection, or just informational?

2. **For PATH 3 (parsing failure)**:
   - If fallback metrics extraction from quick-scan/requirements fails, what should the prompt say?
   - Should we extract file_count from artifact names (e.g., "12 files affected based on...)as absolute last resort?
   - Should epic be included in the override menu if we have no metrics?

3. **Fallback metrics implementation**:
   - In what order should we try to extract metrics? quick-scan → requirements → impact-analysis fallback regex?
   - Should we cache the fallback extraction for reuse?

4. **Testing**:
   - Are there existing impact-analysis.md files we can use for regression testing?
   - Should we add a test case for malformed JSON blocks?

---

## Implementation Estimate

Based on scope analysis:

| Task | Est. Time | Notes |
|------|-----------|-------|
| Add PATH 1 logging | 30 min | Straightforward log statement in isdlc.md |
| Implement PATH 3 fallback metrics | 1-2 hrs | Extract from quick-scan/requirements; validate extraction logic |
| Add PATH 3 user prompt | 45 min | Reuse existing AskUserQuestion pattern |
| Update state.json record | 15 min | Add fallback_used flag to sizing record |
| Test all three paths | 1 hr | Unit tests + manual walkthrough |
| **Total** | **4-5 hrs** | Low complexity, well-scoped work |

---

## Precedent & Related Work

- **REQ-0011** (src/claude/hooks/lib/common.cjs): Sizing utilities already defined; no new abstractions needed
- **REQ-0013** (state.json structure): Sizing record structure exists; minimal changes needed
- **Blast Radius Validation** (STEP 3f-blast-radius): Similar retry/escalation pattern for user interaction
- **ADR-0003** (impact-analysis parsing strategy): Already documents fallback order; consistency check needed

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-19T14:30:00Z",
  "search_duration_ms": 45,
  "keywords_searched": 8,
  "files_matched": 6,
  "scope_estimate": "small",
  "affected_file_count": 3,
  "lines_of_code_estimated": 150,
  "risk_level": "low-to-medium",
  "implementation_hours": 4.5,
  "gate_readiness": "ready_for_requirements"
}
```

---

## Next Steps (Requirements Phase)

1. Clarify prompt behavior for PATH 3 user interaction
2. Define fallback metrics extraction order and completeness
3. Determine visibility level for PATH 1 logging
4. Establish test matrix (3 paths × happy + error cases)
5. Review workflows.json structure for any config changes

**Ready to advance to Phase 01: Requirements**
