# Module Design — REQ-0129: Provider-Neutral Phase-Loop Orchestrator

## Exports

```js
runPhaseLoop(runtime, workflow, state, options) → Promise<State>
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `runtime` | `RuntimeAdapter` | Provider-specific execution interface |
| `workflow` | `WorkflowDef` | Workflow definition with `phases[]` array |
| `state` | `State` | Current workflow state object |
| `options` | `PhaseLoopOptions` | Optional callbacks and config overrides |

### Options

```js
{
  onPhaseStart: (phase, state) => void,    // Progress callback
  onPhaseComplete: (phase, result) => void, // Completion callback
  onError: (phase, error) => void           // Error callback
}
```

## Internal Steps Per Phase

```
activatePhase(phase, state)
    │
    ▼
projectInstructions(phase, workflow, state)
    │
    ▼
runtime.executeTask(instructions)
    │
    ▼
validateCheckpoint(phase, result)
    │
    ▼
updateState(state, phase, result)
```

### activatePhase(phase, state)

Runs the pre-phase hook: reads state, checks for stale phases, handles
escalations, writes phase activation record.

### projectInstructions(phase, workflow, state)

Builds the instruction payload for the runtime by combining workflow phase
definition, team instances (`getTeamInstancesByPhase()`), skill injection plan
(`computeInjectionPlan()`), and accumulated state context.

### runtime.executeTask(instructions)

Delegates to the provider. For interactive phases, uses
`runtime.presentInteractive()` in a loop until completion signal.

### validateCheckpoint(phase, result)

Calls governance `validateCheckpoint()`. On failure, retries with re-delegation
up to `max_retries`, enriching instructions with failure context each time.

### updateState(state, phase, result)

Runs the post-phase hook: writes completion status, extracts timing metrics,
checks budget. Returns updated state for the next phase iteration.
