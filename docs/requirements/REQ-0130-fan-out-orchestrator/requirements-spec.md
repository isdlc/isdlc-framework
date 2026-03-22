# Requirements Specification — REQ-0130: Provider-Neutral Fan-Out Orchestrator

**GitHub**: #196 | **Codex**: CODEX-061

## Functional Requirements

### FR-001: Fan-Out Execution

`runFanOut(runtime, instanceConfig, context)` performs the following:

1. Reads members from `instanceConfig.members`
2. Builds a task list (one task per member, with member context and shared context)
3. Calls `runtime.executeParallel(tasks)` to dispatch all tasks concurrently
4. Merges results according to `instanceConfig.merge_policy`
5. Returns the structured result object

### FR-002: Merge Policies

Two merge policies are supported:

- **`consolidate`**: Combines all member outputs into a single merged result,
  preserving each member's contribution with attribution.
- **`last_wins`**: Takes the last successfully completed result as the merged
  output (useful for convergent tasks where later results supersede earlier ones).

### FR-003: Fail-Open Handling

If a member has `required: false` and its task fails:

- The failure is recorded in `failed_members[]` but does not block the
  overall fan-out.
- The merge step skips the failed member's output.
- This follows the existing M4 pattern for optional sub-agent execution.

If a member has `required: true` (default) and its task fails, the entire
fan-out fails.

### FR-004: Return Shape

```js
{
  results: Map<memberId, result>,  // Per-member results
  merged_output: any,              // Merged result per policy
  failed_members: string[],        // IDs of members that failed
  duration_ms: number              // Wall-clock duration of the fan-out
}
```

## Non-Functional Requirements

- Single file: `src/core/orchestration/fan-out.js` (~100 lines)
- No provider-specific imports
- All parallel execution goes through `runtime.executeParallel()`

## MoSCoW

| Priority  | Requirements          |
|-----------|-----------------------|
| Must Have | FR-001 through FR-004 |

## Out of Scope

- What the sub-agents actually do (opaque to this orchestrator)
- Member prompt generation
- Result interpretation
