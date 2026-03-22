# Implementation Notes — Orchestration Layer (REQ-0129 through REQ-0133)

## Summary

Implemented 5 provider-neutral orchestrator modules and 1 barrel index totaling
~840 lines of production code and ~83 unit tests. All orchestrators communicate
exclusively through the ProviderRuntime interface — zero provider-specific imports.

## Files Created

### Production Code (src/core/orchestration/)

| File | Lines | Exports | REQ |
|------|-------|---------|-----|
| `phase-loop.js` | ~230 | `runPhaseLoop`, `getAgentForPhase` | REQ-0129 |
| `fan-out.js` | ~100 | `runFanOut` | REQ-0130 |
| `dual-track.js` | ~130 | `runDualTrack` | REQ-0131 |
| `discover.js` | ~170 | `runDiscover` | REQ-0132 |
| `analyze.js` | ~210 | `runAnalyze` | REQ-0133 |
| `index.js` | ~30 | barrel re-export of all | All |

### Test Code (tests/core/orchestration/)

| File | Tests | Covers |
|------|-------|--------|
| `helpers/mock-runtime.js` | (shared helper) | Mock ProviderRuntime |
| `phase-loop.test.js` | 20 | FR-001..FR-006, edge cases |
| `fan-out.test.js` | 13 | FR-001..FR-004, edge cases |
| `dual-track.test.js` | 13 | FR-001..FR-004, edge cases |
| `discover.test.js` | 16 | FR-001..FR-005, edge cases |
| `analyze.test.js` | 21 | FR-001..FR-006, edge cases |
| **Total** | **83** | |

## Key Design Decisions

### 1. Frozen Phase-Agent Lookup Table (phase-loop.js)

The `PHASE_AGENT_MAP` is a `Object.freeze()` lookup table mapping phase keys
to agent names. This is a frozen constant (not computed at runtime) to ensure
deterministic agent resolution and prevent mutation.

### 2. Interactive Phase Detection (phase-loop.js)

Interactive phases (currently only `01-requirements`) are detected via a frozen
`Set`. These phases use `runtime.presentInteractive()` in a loop instead of
`runtime.executeTask()`. The loop terminates when the phase signals completion
via `__PHASE_COMPLETE__` or after a 50-turn safety limit.

### 3. Fan-Out Merge Policies (fan-out.js)

Two merge policies implemented as specified:
- `consolidate`: Array of `{ memberId, output, duration_ms }` objects
- `last_wins`: Last successful result object returned directly

### 4. Dual-Track Fan-Out Integration (dual-track.js)

When `context.test_count >= trigger_threshold`, Track A is split into chunks
of 25 tests each (default chunk size) and dispatched via `runFanOut()`. Track B
remains a single task. Both are dispatched in parallel.

### 5. Discover Resume via State Schema (discover.js)

Resume support uses the existing `computeResumePoint()` and `markStepComplete()`
from `discover-state-schema.js`. Already-completed steps are skipped entirely
on resume. The `last_resumed_at` timestamp is set for audit tracking.

### 6. Analyze Classification Scoring (analyze.js)

Bug vs. feature classification uses a simple signal-counting heuristic from
`getBugClassificationSignals()`. If bug signals score higher than feature
signals, the item is classified as a bug. Ties and zero scores default to
feature.

### 7. Confirmation State Machine (analyze.js)

The confirmation sequence is driven by `getTierPath(sizing)`:
- `standard`: requirements -> architecture -> design
- `light`: requirements -> design
- `trivial`: FINALIZING only (skips all confirmations)

Amend loops are bounded to 5 attempts per domain to prevent infinite loops.

## Mock Runtime Architecture

The shared test helper (`helpers/mock-runtime.js`) provides:

- `createMockRuntime(overrides?)` — Full mock with call tracking
- `createFailThenSucceedRuntime(failCount)` — Fails N times then succeeds
- `createInteractiveRuntime(responses)` — Sequences of interactive responses

All methods are tracked in `runtime.calls[methodName]` for assertion.

## Test Results

- **Total tests**: 83 new (981 total core suite)
- **All passing**: Yes
- **Iterations**: 2 (fixed 2 tests that used interactive phase `01-requirements` where non-interactive was needed)
- **Regressions**: None (898 existing tests still passing)
