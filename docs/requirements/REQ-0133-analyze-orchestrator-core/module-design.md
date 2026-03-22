# Module Design — REQ-0133: Provider-Neutral Analyze Orchestrator

## Exports

```js
runAnalyze(runtime, item, options) → Promise<AnalyzeResult>
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `runtime` | `RuntimeAdapter` | Provider-specific execution interface |
| `item` | `AnalyzeItem` | The item to analyze (id, description, flags, prior state) |
| `options` | `AnalyzeOptions` | Lifecycle model, artifact readiness config, finalization chain |

### Return

Returns the final `AnalyzeResult` with classification, conversation history,
confirmation outcomes, and finalization status.

## Internal Flow

### Step 1: Classify Item

```js
signals = lifecycle.getBugClassificationSignals(item)
classification = classifyItem(signals)
// classification: 'bug' | 'feature'
```

Uses the lifecycle model to evaluate bug vs. feature signals. Routes to the
appropriate conversation flow.

### Step 2: Bug-Gather (if bug)

```js
if (classification === 'bug') {
  result = await runtime.presentInteractive(bugGatherPrompt)
  // Single-pass interactive gathering of bug details
}
```

### Step 3: Roundtable (if feature)

```js
if (classification === 'feature') {
  topicTracker = createTopicTracker(artifactReadiness)
  while (!topicTracker.isComplete()) {
    response = await runtime.presentInteractive(
      buildRoundtablePrompt(topicTracker, conversationHistory)
    )
    topicTracker.update(response)
    conversationHistory.push(response)
  }
}
```

Topic coverage is tracked via the artifact-readiness model. Depth adaptation
adjusts the prompt based on user engagement patterns.

### Step 4: Confirmation Sequence

```js
confirmationState = stateMachine.getInitialState()
for (const domain of ['requirements', 'architecture', 'design']) {
  while (confirmationState.currentDomain === domain) {
    response = await runtime.presentInteractive(
      buildConfirmationPrompt(domain, artifacts[domain])
    )
    confirmationState = stateMachine.getTransition(confirmationState, response)
    // 'accept' → advance to next domain
    // 'amend'  → loop with revision context
  }
}
```

Driven by the state-machine model. Each domain is presented sequentially with
accept/amend handling.

### Step 5: Finalization Chain

```js
chain = finalizationChain.getFinalizationChain()
for (const step of chain) {
  await step.execute(item, artifacts, confirmationState)
}
// Steps: writeArtifacts, updateMetaJson, updateBacklog, syncGitHub
```

Executes the finalization chain from the finalization model. Each step is
independent and handles its own error recovery.

## Helper Functions

### classifyItem(signals)

Maps lifecycle signals to a classification. Returns `'bug'` if bug signals
dominate, `'feature'` otherwise.

### buildRoundtablePrompt(topicTracker, history)

Constructs the next roundtable prompt based on uncovered topics and
conversation history. Adjusts depth based on user engagement.

### buildConfirmationPrompt(domain, artifact)

Constructs the confirmation prompt for a specific domain, presenting the
artifact for review with accept/amend options.
