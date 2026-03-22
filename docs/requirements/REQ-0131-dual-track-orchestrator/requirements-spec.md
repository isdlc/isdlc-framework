# Requirements Specification — REQ-0131: Provider-Neutral Dual-Track Orchestrator

**GitHub**: #197 | **Codex**: CODEX-062

## Functional Requirements

### FR-001: Dual-Track Execution

`runDualTrack(runtime, instanceConfig, context)` performs the following:

1. Spawns Track A and Track B via `runtime.executeParallel([trackA, trackB])`
2. Checks results of both tracks
3. If both pass, returns immediately with results
4. If either fails, retries both tracks (atomic retry — both restart together)
5. Continues until both pass or max iterations reached

### FR-002: Max Iterations

Maximum iteration count is read from
`instanceConfig.policies.retry.max_iterations` with a default of 10. Each
retry increments the iteration counter. When max iterations is reached without
both tracks passing, returns with the last failure state.

### FR-003: Fan-Out Sub-Orchestration

When `context.test_count >= instanceConfig.policies.fan_out.trigger_threshold`:

- Track A is split into chunks
- Each chunk is dispatched via `runFanOut()` (from REQ-0130)
- Chunk results are consolidated before comparison with Track B
- This handles large workloads that exceed single-task capacity

### FR-004: Return Shape

```js
{
  trackA: any,            // Track A final result
  trackB: any,            // Track B final result
  iterations_used: number, // How many iterations were consumed
  fan_out_used: boolean    // Whether fan-out was activated for Track A
}
```

## Non-Functional Requirements

- Single file: `src/core/orchestration/dual-track.js` (~120 lines)
- No provider-specific imports
- Depends on `runFanOut()` from `src/core/orchestration/fan-out.js`

## MoSCoW

| Priority  | Requirements          |
|-----------|-----------------------|
| Must Have | FR-001 through FR-004 |

## Out of Scope

- What Track A and Track B actually check or produce
- Track-specific prompt generation
- Test result interpretation
