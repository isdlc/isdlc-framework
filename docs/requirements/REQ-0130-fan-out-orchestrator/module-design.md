# Module Design — REQ-0130: Provider-Neutral Fan-Out Orchestrator

## Exports

```js
runFanOut(runtime, instanceConfig, context) → Promise<FanOutResult>
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `runtime` | `RuntimeAdapter` | Provider-specific execution interface |
| `instanceConfig` | `InstanceConfig` | Team instance with `members[]` and `merge_policy` |
| `context` | `object` | Shared context passed to all member tasks |

### Return Shape

```js
{
  results: Map<string, any>,   // memberId → result
  merged_output: any,          // Output after applying merge policy
  failed_members: string[],    // Member IDs that failed (non-required only)
  duration_ms: number          // Wall-clock time for the entire fan-out
}
```

## Internal Flow

```
instanceConfig.members
    │
    ▼
buildTasks(members, context)
    │  → [{ id, prompt, memberConfig }, ...]
    ▼
runtime.executeParallel(tasks)
    │  → Map<memberId, result | error>
    ▼
partitionResults(rawResults, members)
    │  → { successes, failures, fatalFailures }
    ▼
applyMergePolicy(successes, instanceConfig.merge_policy)
    │  → merged_output
    ▼
return { results, merged_output, failed_members, duration_ms }
```

### buildTasks(members, context)

Iterates `instanceConfig.members`, builds a task object per member containing
the member's configuration and shared context.

### partitionResults(rawResults, members)

Separates successful results from failures. Checks each failure against
`member.required` — if `required: true`, adds to `fatalFailures` (causes
overall failure). If `required: false`, adds to `failed_members` (skipped
during merge).

### applyMergePolicy(successes, policy)

- **`consolidate`**: Combines all success outputs into a single object with
  member attribution.
- **`last_wins`**: Returns the output of the last successful member (by
  completion order).
