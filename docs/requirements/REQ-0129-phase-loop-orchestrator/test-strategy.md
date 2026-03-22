# Test Strategy — Orchestration Layer (REQ-0129 through REQ-0133)

## Scope

Five provider-neutral orchestrator modules and one shared test helper:

| Module | File | Est. Lines | Test File |
|--------|------|-----------|-----------|
| Phase Loop | `src/core/orchestration/phase-loop.js` | ~250 | `tests/core/orchestration/phase-loop.test.js` |
| Fan-Out | `src/core/orchestration/fan-out.js` | ~100 | `tests/core/orchestration/fan-out.test.js` |
| Dual-Track | `src/core/orchestration/dual-track.js` | ~120 | `tests/core/orchestration/dual-track.test.js` |
| Discover | `src/core/orchestration/discover.js` | ~150 | `tests/core/orchestration/discover.test.js` |
| Analyze | `src/core/orchestration/analyze.js` | ~200 | `tests/core/orchestration/analyze.test.js` |
| Barrel | `src/core/orchestration/index.js` | ~20 | (covered by import checks in each test) |

Shared helper: `tests/core/orchestration/helpers/mock-runtime.js`

## Test Framework

- **Runner**: `node:test` (project standard)
- **Assertions**: `node:assert/strict`
- **Module system**: ESM (`import`/`export`)
- **Command**: `npm run test:core` (runs `node --test tests/core/**/*.test.js`)

## Mock Strategy

All tests use a **mock ProviderRuntime** — no real provider is ever called. The
mock implements all 5 interface methods (`executeTask`, `executeParallel`,
`presentInteractive`, `readUserResponse`, `validateRuntime`) with controllable
return values and call tracking.

### Mock Runtime Design

```js
createMockRuntime(overrides?) → {
  executeTask: async (phase, agent, context) => TaskResult,
  executeParallel: async (tasks) => TaskResult[],
  presentInteractive: async (prompt) => string,
  readUserResponse: async (options) => string,
  validateRuntime: async () => ValidationResult,
  // Inspection helpers:
  calls: { executeTask: [], executeParallel: [], presentInteractive: [] },
  reset: () => void
}
```

Overrides allow tests to inject specific behaviors (failures, delays, sequences).

## Test Categories Per Module

### phase-loop.test.js (~25 tests)

| Category | Tests | Covers |
|----------|-------|--------|
| Happy path | Phase sequence, accumulated results | FR-001 |
| Pre-phase hook | Activation record written | FR-002 |
| Post-phase hook | Timing metrics, budget check | FR-003 |
| Retry on failure | Retries up to maxRetries, error callback | FR-004 |
| Interactive phase | presentInteractive loop, completion signal | FR-005 |
| Skill injection | computeInjectionPlan called per phase | FR-006 |
| Edge cases | Empty phases array, single phase, all fail | Robustness |

### fan-out.test.js (~15 tests)

| Category | Tests | Covers |
|----------|-------|--------|
| Happy path | All members succeed, results map | FR-001 |
| Consolidate merge | All outputs combined with attribution | FR-002 |
| Last-wins merge | Last successful result taken | FR-002 |
| Fail-open | Optional member fails, skipped in merge | FR-003 |
| Required failure | Required member fails, overall failure | FR-003 |
| Return shape | results, merged_output, failed_members, duration_ms | FR-004 |
| Edge cases | Empty members, single member | Robustness |

### dual-track.test.js (~15 tests)

| Category | Tests | Covers |
|----------|-------|--------|
| Both pass first try | Immediate return | FR-001 |
| Track A fails, retry | Both tracks retry together | FR-001 |
| Track B fails, retry | Both tracks retry together | FR-001 |
| Max iterations | Returns failure after limit | FR-002 |
| Fan-out trigger | test_count >= threshold activates fan-out | FR-003 |
| Return shape | trackA, trackB, iterations_used, fan_out_used | FR-004 |
| Edge cases | Zero max iterations, threshold exactly met | Robustness |

### discover.test.js (~18 tests)

| Category | Tests | Covers |
|----------|-------|--------|
| Fresh discovery | Menu presented, mode selected, groups executed | FR-001 |
| Menu presentation | First-time vs returning menu | FR-002 |
| Agent group execution | Parallel and sequential dispatch | FR-003 |
| State tracking | createInitialDiscoverState, markStepComplete | FR-004 |
| Resume | computeResumePoint, skip completed groups | FR-005 |
| Edge cases | Mode override (skip menu), empty groups | Robustness |

### analyze.test.js (~25 tests)

| Category | Tests | Covers |
|----------|-------|--------|
| Bug classification | Bug signals route to bug-gather | FR-001, FR-003 |
| Feature classification | Feature signals route to roundtable | FR-001, FR-003 |
| Entry routing | Prefetch graph, flag parsing | FR-002 |
| Roundtable loop | Topic coverage tracking, depth adaptation | FR-004 |
| Confirmation FSM | Sequential domain accept, amend-loops-back | FR-005 |
| Finalization chain | All 6 steps executed in order | FR-006 |
| Edge cases | Ambiguous classification, all domains amend | Robustness |

## Coverage Target

- **Line coverage**: >= 80% per module
- **Branch coverage**: >= 75% per module
- **Function coverage**: 100% of exported functions

## Test Naming Convention

Following existing project pattern:
- Test ID prefix per module: `PL-` (Phase Loop), `FO-` (Fan-Out), `DT-` (Dual-Track), `DC-` (Discover), `AZ-` (Analyze)
- Format: `it('PL-01: description (AC-NNN-NN)', ...)`

## Dependencies

Tests import production code from `src/core/orchestration/*.js` and the shared
mock from `tests/core/orchestration/helpers/mock-runtime.js`. No other test
infrastructure is needed.

## Execution

```bash
npm run test:core
```

All new test files are under `tests/core/orchestration/` and will be picked up
by the existing glob pattern `tests/core/**/*.test.js`.
