# Coverage Report - REQ-0041 Search Abstraction Layer

**Date**: 2026-03-02
**Tool**: node:test --experimental-test-coverage (Node.js v24.10.0)
**Threshold**: 80% line coverage (PASSED)

---

## Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Line coverage | 96.59% | 80% | PASS |
| Branch coverage | 86.45% | 80% | PASS |
| Function coverage | 96.43% | 80% | PASS |

---

## Per-File Breakdown

| File | Line % | Branch % | Function % | Uncovered Lines |
|------|--------|----------|------------|-----------------|
| lib/search/backends/enhanced-lexical.js | 100.00 | 84.21 | 100.00 | -- |
| lib/search/backends/lexical.js | 97.62 | 91.67 | 85.71 | 124-126 |
| lib/search/backends/structural.js | 100.00 | 86.49 | 100.00 | -- |
| lib/search/config.js | 98.26 | 93.33 | 100.00 | 108-109 |
| lib/search/detection.js | 92.31 | 76.92 | 92.86 | 139-140, 146-149, 172-173, 180-181, 263-264, 295-296, 327-338 |
| lib/search/install.js | 89.94 | 77.42 | 85.71 | 186-189, 209-213, 263-264, 266-267, 269-270, 293-308 |
| lib/search/ranker.js | 100.00 | 92.50 | 100.00 | -- |
| lib/search/registry.js | 99.62 | 94.92 | 100.00 | 105 |
| lib/search/router.js | 99.40 | 89.06 | 100.00 | 149-150 |

---

## Analysis

### Highest Coverage Modules
- **ranker.js** (100% line, 92.50% branch, 100% function) -- Core ranking logic fully covered
- **enhanced-lexical.js** (100% line, 84.21% branch, 100% function) -- Probe backend adapter fully covered
- **structural.js** (100% line, 86.49% branch, 100% function) -- ast-grep adapter fully covered

### Lowest Coverage Modules
- **install.js** (89.94% line, 77.42% branch, 85.71% function) -- Some error classification branches and the production `safeExecInstall` function are uncovered (tested via injection)
- **detection.js** (92.31% line, 76.92% branch, 92.86% function) -- Some platform-specific branches in countFiles and production `safeExec` uncovered (tested via injection)

### Uncovered Code Analysis

The uncovered lines fall into two categories:

1. **Production-only code paths** (default implementations replaced by test doubles):
   - `defaultGrep()` / `defaultGlob()` in lexical.js (lines 124-126)
   - `safeExec()` in detection.js (lines 327-338)
   - `safeExecInstall()` in install.js (lines 293-308)

2. **Defensive branches** that are difficult to trigger in test:
   - Error classification edge cases in install.js
   - Permission-denied directory traversal in detection.js

These uncovered lines are acceptable because:
- Production defaults are no-op stubs replaced by injection in actual usage
- Test doubles are used to verify all behavioral paths
- Overall coverage well exceeds the 80% threshold
