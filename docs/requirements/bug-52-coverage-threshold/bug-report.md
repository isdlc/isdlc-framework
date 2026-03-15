# Bug Report: Coverage Threshold Discrepancy

**Bug ID:** BUG-0054-GH-52
**External Link:** GitHub Issue #52
**External ID:** GH-52
**Source:** github
**Reported:** 2026-02-19
**Phase:** 01-requirements

---

## Summary

Coverage enforcement thresholds in `iteration-requirements.json` use flat scalar values (80% unit, 70% integration) regardless of workflow intensity (light/standard/epic), creating a discrepancy with the Constitution Article II aspirational targets and ignoring the framework's existing intensity system.

## Expected Behavior

Coverage thresholds should be intensity-aware, using tiered values aligned with the workflow sizing decision stored in `state.json` at `active_workflow.sizing.effective_intensity`:

| Intensity | Unit Coverage (Phase 06, 16) | Integration Coverage (Phase 07) |
|-----------|------------------------------|----------------------------------|
| light     | 60%                          | 50%                              |
| standard  | 80%                          | 70%                              |
| epic      | 95%                          | 85%                              |

Fix workflows (which have no sizing block) should default to the `standard` tier.

## Actual Behavior

All three enforcement phases use flat scalar `min_coverage_percent` values:

| Phase | Current Threshold | Applied To |
|-------|-------------------|------------|
| Phase 06 (Implementation) | 80% (scalar) | All workflows equally |
| Phase 07 (Testing) | 70% (scalar) | All workflows equally |
| Phase 16 (Quality Loop) | 80% (scalar) | All workflows equally |

This means:
- Light workflows are held to the same standard as epic workflows
- Epic workflows are not pushed toward the aspirational 95% target
- The existing `effective_intensity` sizing decision in `state.json` is ignored by coverage enforcement

## Reproduction Steps

1. Open `src/claude/hooks/config/iteration-requirements.json`
2. Navigate to Phase 06 (`06-implementation`), line ~219
3. Observe `"min_coverage_percent": 80` -- a scalar number, not intensity-aware
4. Navigate to Phase 07 (`07-testing`), line ~279
5. Observe `"min_coverage_percent": 70` -- same scalar pattern
6. Navigate to Phase 16 (`16-quality-loop`), line ~676
7. Observe `"min_coverage_percent": 80` -- same scalar pattern
8. Open `src/claude/hooks/test-watcher.cjs`, line ~552
9. Observe `const coverageThreshold = phaseReq.test_iteration?.success_criteria?.min_coverage_percent;` -- reads value as scalar, no intensity lookup
10. Start a light-intensity workflow and observe that 80% unit coverage is enforced (should be 60%)

## Root Cause

Coverage thresholds in `iteration-requirements.json` are scalar values with no intensity-awareness. The `test-watcher.cjs` hook reads `phaseReq.test_iteration.success_criteria.min_coverage_percent` as a single number. The framework's existing intensity system (`workflows.json` sizing, `state.json` `effective_intensity`) is not consulted during threshold resolution.

## Environment

- iSDLC Framework v0.1.0-alpha
- Node.js (ESM CLI + CommonJS hooks)
- All platforms (cross-platform issue -- configuration-level, not OS-specific)

## Severity

**Medium** -- The bug does not cause crashes or data loss. It causes incorrect enforcement: light workflows are over-constrained (may fail gates unnecessarily) and epic workflows are under-constrained (may pass gates too easily). The framework functions correctly in all other respects.

## Fix Requirement

The fix must:
1. Replace scalar `min_coverage_percent` values in `iteration-requirements.json` with intensity-keyed objects for phases 06, 07, and 16
2. Update `test-watcher.cjs` to resolve coverage thresholds using `effective_intensity` from `state.json`, with fallback chain: intensity tier -> standard tier -> hardcoded 80
3. Update `gate-requirements-injector.cjs` to display resolved thresholds (not raw config objects)
4. Add a constitutional clarification note to Article II explaining intensity-based practical enforcement
5. Update agent prose files that reference hardcoded 80%/70% thresholds
6. Maintain full backward compatibility with scalar `min_coverage_percent` format
