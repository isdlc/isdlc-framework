# Module Design — REQ-0131: Provider-Neutral Dual-Track Orchestrator

## Exports

```js
runDualTrack(runtime, instanceConfig, context) → Promise<DualTrackResult>
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `runtime` | `RuntimeAdapter` | Provider-specific execution interface |
| `instanceConfig` | `InstanceConfig` | Dual-track config with retry and fan-out policies |
| `context` | `object` | Execution context including `test_count` for fan-out threshold |

### Return Shape

```js
{
  trackA: any,              // Track A final result
  trackB: any,              // Track B final result
  iterations_used: number,  // Total iterations consumed
  fan_out_used: boolean     // Whether fan-out was activated
}
```

## Internal Flow

```
iteration = 0
    │
    ▼
┌─► shouldFanOut(context, instanceConfig.policies.fan_out)
│       │
│       ├─ yes → runFanOut(runtime, trackAChunks, context) → trackAResult
│       └─ no  → runtime.executeTask(trackATask) ──────────→ trackAResult
│       │
│       ▼
│   runtime.executeParallel([trackATask, trackBTask])
│       │
│       ▼
│   bothPassed(trackAResult, trackBResult)?
│       │
│       ├─ yes → return { trackA, trackB, iterations_used, fan_out_used }
│       └─ no  → iteration++ ; if iteration < max → retry ─┐
│                                if iteration >= max → return failure
└───────────────────────────────────────────────────────────┘
```

### shouldFanOut(context, fanOutPolicy)

Returns `true` when `context.test_count >= fanOutPolicy.trigger_threshold`.
When activated, Track A is split into chunks and dispatched via `runFanOut()`.

### Retry Loop

On failure of either track:

1. Increment `iteration`
2. Check against `instanceConfig.policies.retry.max_iterations` (default: 10)
3. If under limit, restart both tracks with updated context (includes previous
   failure information)
4. If at limit, return last results with failure status

### Fan-Out Integration

When fan-out is active, Track A execution is replaced by:

```js
runFanOut(runtime, {
  members: chunkTasks,
  merge_policy: 'consolidate'
}, context)
```

Track B continues as a single task via `runtime.executeTask()`. Both are
dispatched in parallel via `runtime.executeParallel()`.
