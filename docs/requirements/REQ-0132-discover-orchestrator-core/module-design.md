# Module Design — REQ-0132: Provider-Neutral Discover Orchestrator

## Exports

```js
runDiscover(runtime, options) → Promise<DiscoverState>
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `runtime` | `RuntimeAdapter` | Provider-specific execution interface |
| `options` | `DiscoverOptions` | Mode override, existing state, UX flow config |

### Return

Returns the final `DiscoverState` with all steps marked complete (or partial
if interrupted).

## Internal Flow

### Step 1: Check Existing State for Resume

```js
if (options.existingState) {
  resumePoint = computeResumePoint(options.existingState)
  if (resumePoint) → skip to that group
}
```

### Step 2: Present Menu (if needed)

```js
if (!options.mode) {
  mode = await runtime.presentInteractive(menuPrompt)
}
```

The menu prompt is sourced from the UX flow definitions (first-time vs.
returning user variant).

### Step 3: Execute Agent Groups

For each agent group in the selected mode's sequence:

```js
for (const group of modeConfig.agentGroups) {
  if (group.parallel) {
    results = await runtime.executeParallel(
      group.members.map(m => buildTask(m, accumulatedContext))
    )
  } else {
    for (const member of group.members) {
      result = await runtime.executeTask(buildTask(member, accumulatedContext))
      accumulatedContext = mergeResult(accumulatedContext, result)
    }
  }
  state = markStepComplete(state, group.id, results)
}
```

### Step 4: Return Final State

```js
return state
```

## Helper Functions

### buildTask(member, context)

Constructs a task object from the agent group member definition and accumulated
context from prior groups.

### mergeResult(context, result)

Merges a single group result into the accumulated context for subsequent groups.

### Resume Logic

`computeResumePoint(state)` scans `state.steps` for the first entry without a
`completed_at` timestamp. The main loop skips all groups before that point,
loading their results from the existing state.
