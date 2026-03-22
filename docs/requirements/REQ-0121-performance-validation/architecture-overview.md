# Architecture Overview: Performance Validation

**Item**: REQ-0121 | **GitHub**: #185 | **CODEX**: CODEX-052

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Timing assertions + baselines.json | Tests with performance.now() + baseline file for regression detection | Simple, no external deps, deterministic thresholds | Baselines need occasional updates | **Selected** |
| B: Dedicated benchmark framework | Use benchmark.js or similar | Statistical rigor | External dependency, complex setup | Eliminated |
| C: CI-only performance checks | Performance tested only in CI pipeline | No local overhead | Cannot catch regressions during development | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-027: Timing Assertions with Baseline Regression Detection

- **Status**: Accepted
- **Context**: Core operations have implicit performance expectations but no formal benchmarks. Regressions go undetected until they degrade the developer experience. The framework needs frozen thresholds for critical operations and a mechanism to detect >20% regressions.
- **Decision**: Create `tests/verification/performance/` with test files that measure operation duration via `performance.now()`, assert against frozen thresholds, and compare against `baselines.json` for regression detection.
- **Rationale**: `performance.now()` is built into Node.js — no external dependencies needed. Frozen thresholds provide absolute guardrails; baseline comparison provides relative regression detection. Both mechanisms are complementary.
- **Consequences**: Baselines must be regenerated when hardware changes significantly or when intentional performance changes are made.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| `node:test` | Framework standard test runner |
| `performance.now()` | Built-in high-resolution timing |
| `baselines.json` | Version-controlled previous run results |
| Frozen threshold constants | Absolute performance guardrails |

## 4. Integration Architecture

### File Layout

```
tests/verification/performance/
  validation-checkpoints.test.js   (checkpoint operations <100ms)
  artifact-state-validation.test.js (artifact/state validation <500ms)
  analyze-startup.test.js          (analyze initialization <2s)
  cache-efficiency.test.js         (cache hit/miss verification)
  baselines.json                   (previous run medians for regression)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| Test files | Core validation modules | Import | Function calls with timing wrappers |
| Test files | Core state modules | Import | State operations with timing |
| Test files | baselines.json | node:fs | JSON read/write for comparison |
| Test files | performance.now() | Built-in | High-resolution timestamps |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test location | `tests/verification/performance/` | Separate from functional tests |
| Timing method | `performance.now()` | Built-in, high-resolution |
| Regression threshold | >20% degradation | Catches meaningful regressions, ignores noise |
| Size estimate | ~200 lines across 4 test files + baselines.json | Focused timing assertions |
