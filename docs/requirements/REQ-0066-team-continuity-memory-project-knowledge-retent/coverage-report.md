# Coverage Report: REQ-0066 Team Continuity Memory

**Tool**: c8 (Istanbul-compatible coverage for Node.js)
**Framework**: node:test
**Date**: 2026-03-16

---

## Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Line Coverage | 91.35% | 80% | PASS |
| Branch Coverage | 74.37% | — | Info |
| Function Coverage | 93.24% | — | Info |

## Per-Module Breakdown

| File | Statements | Branches | Functions | Lines | Uncovered Lines |
|------|-----------|----------|-----------|-------|----------------|
| memory-store-adapter.js | 94.51% | 69.29% | 100% | 94.51% | Schema edge cases, compact edge paths, rebuild error path |
| memory-search.js | 92.94% | 76.24% | 87.5% | 92.94% | Profile file read error path, empty codebase results edge case |
| memory-embedder.js | 93.40% | 71.28% | 80% | 93.40% | ONNX fallback paths, profile write error recovery |
| memory.js | 92.20% | 83.97% | 100% | 92.20% | writeSessionRecord edge cases for optional enriched fields |
| utils/test-helpers.js | 44.27% | 100% | 50% | 44.27% | Test utility — not production code |

## Test File Summary

| Test File | Tests | Pass | Fail |
|-----------|-------|------|------|
| memory-store-adapter.test.js | 62 | 62 | 0 |
| memory-search.test.js | 53 | 53 | 0 |
| memory-embedder.test.js | 39 | 39 | 0 |
| memory.test.js | 89 | 89 | 0 |
| memory-integration.test.js | 17 | 17 | 0 |
| **Total** | **260** | **260** | **0** |

## Coverage Notes

- **Line coverage (91.35%)** exceeds the 80% threshold by 11.35 percentage points
- **Branch coverage (74.37%)** reflects uncovered error recovery paths that are fail-open by design (try/catch wrapping with empty-result fallback)
- **Function coverage (93.24%)** — uncovered functions are helper utilities called only in specific environment configurations (ONNX availability)
- **utils/test-helpers.js** is a test support module, not production code — excluded from coverage evaluation
