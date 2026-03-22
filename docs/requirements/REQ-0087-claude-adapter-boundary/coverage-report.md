# Coverage Report -- Phase 3 Batch 1

**Date**: 2026-03-22
**Phase**: 16-quality-loop
**Status**: NOT CONFIGURED

## Summary

No coverage tool (c8, istanbul, nyc) is configured for this project. The `package.json` does not include a coverage script or coverage dependency.

## Test Counts by Module

| Module | Test File | Tests | Pass | Fail |
|--------|-----------|-------|------|------|
| src/core/providers/config.js | tests/core/providers/config.test.js | 20 | 20 | 0 |
| src/core/providers/routing.js | tests/core/providers/routing.test.js | 18 | 18 | 0 |
| src/core/providers/usage.js | tests/core/providers/usage.test.js | 5 | 5 | 0 |
| src/core/providers/modes.js | tests/core/providers/modes.test.js | 8 | 8 | 0 |
| src/providers/claude/*.js | tests/providers/claude/adapter.test.js | 10 | 10 | 0 |
| src/core/validators/enforcement.js | tests/core/validators/enforcement.test.js | 5 | 5 | 0 |
| **Total** | | **66** | **66** | **0** |

## Functional Coverage Assessment

Based on manual review of test-to-code mapping:

| Module | Functions Tested | Functions Total | Estimated Coverage |
|--------|-----------------|-----------------|-------------------|
| config.js | 6/6 | 6 | ~100% |
| routing.js | 7/8 | 8 | ~88% (selectWithFallback tested via integration, checkProviderHealth unit test deferred -- requires network) |
| usage.js | 2/2 | 2 | ~100% |
| modes.js | 3/3 | 3 | ~100% |
| enforcement.js | 1/1 | 1 | ~100% |
| claude/index.js | 3/3 | 3 | ~100% (re-export coverage) |
| claude/hooks.js | 1/1 | 1 | ~100% |
| claude/projection.js | 2/2 | 2 | ~100% |
| bridge/providers.cjs | 20/20 | 20 | ~100% (sync + async paths, fallback paths) |

## Recommendation

Configure `c8` or `node:test` built-in coverage (`--experimental-test-coverage`) for future batches.
