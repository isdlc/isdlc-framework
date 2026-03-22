# Requirements Specification — REQ-0133: Provider-Neutral Analyze Orchestrator

**GitHub**: #199 | **Codex**: CODEX-064

## Functional Requirements

### FR-001: Analyze Execution

`runAnalyze(runtime, item, options)` executes the full analyze flow:

1. Entry routing (determine flow path)
2. Bug classification (route to bug-gather or roundtable)
3. Roundtable or bug-gather conversation loop
4. Sequential domain confirmation
5. Artifact writing
6. Finalization (meta.json, BACKLOG marker, GitHub sync)

### FR-002: Entry Routing

Entry routing is derived from the lifecycle model:

- Reads the prefetch graph to determine item type and prior state
- Applies flag parsing rules to resolve the entry path
- Routes to either bug classification or direct roundtable

### FR-003: Bug Classification

Evaluates signals from the lifecycle model to classify the item:

- If bug signals are present (error keywords, crash reports, fix intent),
  routes to the bug-gather flow
- If feature signals are present, routes to the roundtable flow
- Classification uses `lifecycle.getBugClassificationSignals()`

### FR-004: Roundtable Conversation

Feature items enter the roundtable via `runtime.presentInteractive()` in a
loop:

- Topic coverage is tracked via the artifact-readiness model
- Depth adaptation adjusts question depth based on user engagement
- The loop continues until all required topics are covered and the user
  signals readiness to proceed

### FR-005: Confirmation State Machine

After roundtable/bug-gather completes, confirmations are presented sequentially
per domain:

- Requirements (Maya) -> Architecture (Alex) -> Design (Jordan)
- Each domain is presented via `runtime.presentInteractive()`
- Accept/amend transitions are driven by the state-machine model:
  `stateMachine.getTransition(currentState, userResponse)`
- Amend loops back to the domain for revision; accept advances to the next

### FR-006: Finalization

After all domains are accepted:

- Executes the finalization chain from `finalizationChain.getFinalizationChain()`
- Steps include: write artifacts, update meta.json, update BACKLOG marker,
  sync GitHub labels/comments
- Each step is executed sequentially with error handling

## Non-Functional Requirements

- Single file: `src/core/orchestration/analyze.js` (~200 lines)
- Most complex orchestrator in the system
- No provider-specific imports
- All user interaction goes through `runtime.presentInteractive()`

## MoSCoW

| Priority  | Requirements          |
|-----------|-----------------------|
| Must Have | FR-001 through FR-006 |

## Out of Scope

- Persona voice generation (provider responsibility)
- Artifact content generation (provider responsibility)
- Roundtable prompt construction (handled by persona/prompt layer)
