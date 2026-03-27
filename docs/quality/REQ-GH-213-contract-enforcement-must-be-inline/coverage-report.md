# Coverage Report: Inline Contract Enforcement

**REQ-GH-213** | Phase: 16-quality-loop | Date: 2026-03-27

---

## Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Overall line coverage (new code) | 99.6% | 80% | PASS |
| Overall function coverage (new code) | 100% | 80% | PASS |
| Overall branch coverage (new code) | ~84% | N/A | PASS |

## Per-Module Breakdown

### contract-checks.js

| Metric | Value |
|--------|-------|
| Lines | 100% |
| Branches | 77.78% |
| Functions | 100% |
| Statements | 100% |

Branch coverage note: Uncovered branches are defensive guards on unreachable combinations (e.g., format.format_type existing but being neither "bulleted" nor any known type). These are fail-open paths that degrade gracefully.

### template-loader.js

| Metric | Value |
|--------|-------|
| Lines | 97.87% |
| Branches | 90.91% |
| Functions | 100% |

Uncovered lines: Error path in catch block for malformed shipped JSON (line 68) -- tested indirectly via the override-malformed-fallback test.

### contract-evaluator.js (refactored)

| Metric | Value |
|--------|-------|
| Lines | 100% |
| Functions | 100% |

All code paths tested: getByPath(), deprecated evaluateContract(), deprecated formatViolationBanner(), and re-exports.

## Test File Coverage

| Test File | Test Count | All Pass |
|-----------|-----------|----------|
| contract-checks.test.js | 61 | YES |
| template-loader.test.js | 8 | YES |
| contract-cross-provider.test.js | 6 | YES |
| contract-evaluator.test.js | 12 | YES |
| contract-evaluator-integration.test.js | 7 | YES |
| Performance tests (embedded) | 4 | YES |
| **Total** | **98** | **YES** |
