# Design Specification: Performance Validation

**Item**: REQ-0121 | **GitHub**: #185 | **CODEX**: CODEX-052

---

## 1. Frozen Thresholds

```js
const THRESHOLDS = Object.freeze({
  VALIDATION_CHECKPOINT_MS: 100,
  ARTIFACT_STATE_VALIDATION_MS: 500,
  ANALYZE_STARTUP_MS: 2000,
  REGRESSION_PERCENT: 20,
});
```

## 2. Test Pattern: Timing Assertions

Each performance test follows the same pattern: record start, execute operation, record end, assert duration within threshold.

```js
import { describe, it } from 'node:test';
import { ok } from 'node:assert';

describe('Validation checkpoint performance', () => {
  it('completes within 100ms', () => {
    const start = performance.now();

    // Execute: run a validation checkpoint
    validateCheckpoint('01-requirements', testState);

    const duration = performance.now() - start;
    ok(duration < THRESHOLDS.VALIDATION_CHECKPOINT_MS,
      `Validation took ${duration.toFixed(1)}ms, threshold is ${THRESHOLDS.VALIDATION_CHECKPOINT_MS}ms`);
  });
});
```

## 3. Test File: `cache-efficiency.test.js`

```js
describe('Cache efficiency', () => {
  it('second call is faster than first (cache hit)', () => {
    // First call — cold cache
    const start1 = performance.now();
    computeExpensiveResult(input);
    const cold = performance.now() - start1;

    // Second call — warm cache
    const start2 = performance.now();
    computeExpensiveResult(input);
    const warm = performance.now() - start2;

    ok(warm <= cold, `Cache hit (${warm.toFixed(1)}ms) should be <= cold (${cold.toFixed(1)}ms)`);
  });

  it('cache invalidation triggers recomputation', () => {
    computeExpensiveResult(input);       // warm cache
    modifyInput(input);                  // invalidate
    const start = performance.now();
    computeExpensiveResult(input);       // should recompute
    const duration = performance.now() - start;
    // Duration should be closer to cold than warm
    ok(duration > 0, 'Recomputation occurred after invalidation');
  });
});
```

## 4. Baselines File: `baselines.json`

```json
{
  "generated_at": "2026-03-22T22:30:00.000Z",
  "entries": [
    {
      "operation": "validation-checkpoint",
      "median_ms": 45,
      "threshold_ms": 100,
      "samples": 10
    },
    {
      "operation": "artifact-state-validation",
      "median_ms": 180,
      "threshold_ms": 500,
      "samples": 10
    },
    {
      "operation": "analyze-startup",
      "median_ms": 900,
      "threshold_ms": 2000,
      "samples": 5
    }
  ]
}
```

## 5. Regression Detection Pattern

```js
import { readFileSync } from 'node:fs';

describe('Regression detection', () => {
  const baselines = JSON.parse(readFileSync(baselinesPath, 'utf8'));

  for (const baseline of baselines.entries) {
    it(`${baseline.operation} within ${THRESHOLDS.REGRESSION_PERCENT}% of baseline`, () => {
      const duration = measureOperation(baseline.operation);
      const regressionThreshold = baseline.median_ms * (1 + THRESHOLDS.REGRESSION_PERCENT / 100);
      ok(duration < regressionThreshold,
        `${baseline.operation}: ${duration.toFixed(1)}ms exceeds ${THRESHOLDS.REGRESSION_PERCENT}% regression threshold (${regressionThreshold.toFixed(1)}ms from baseline ${baseline.median_ms}ms)`);
    });
  }
});
```

## 6. Open Questions

None — thresholds are defined, measurement method is standard `performance.now()`, and baselines are updatable.
