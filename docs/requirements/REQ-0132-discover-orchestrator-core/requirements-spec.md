# Requirements Specification — REQ-0132: Provider-Neutral Discover Orchestrator

**GitHub**: #198 | **Codex**: CODEX-063

## Functional Requirements

### FR-001: Discover Execution

`runDiscover(runtime, mode, options)` executes the discover flow:

1. Present menu to user (first-time or returning)
2. User selects mode
3. Execute agent groups in sequence for the selected mode
4. Track state throughout execution
5. Handle resume if prior state exists with incomplete steps

### FR-002: Menu Presentation

Menu is presented via `runtime.presentInteractive()`:

- First-time users see the full discovery menu from UX flows
- Returning users see the returning-user menu variant
- Menu selection determines the discovery mode and agent group sequence

### FR-003: Agent Group Execution

For each agent group in the selected mode:

- **Parallel members**: If the group defines multiple members, dispatch via
  `runtime.executeParallel()` (uses fan-out pattern)
- **Sequential groups**: Groups execute one after another in defined order
- Each group receives the accumulated context from prior groups

### FR-004: State Tracking

Uses the discover-state-schema utilities:

- `createInitialDiscoverState()` — initialize state for a new discovery
- `markStepComplete(state, stepId, result)` — record step completion
- `computeResumePoint(state)` — find the first incomplete step

State is written after each group completes to enable crash recovery.

### FR-005: Resume Support

If state has incomplete steps (from a prior interrupted run):

- `computeResumePoint(state)` determines where to continue
- Execution resumes from the first incomplete group
- Already-completed groups are skipped; their results are loaded from state

## Non-Functional Requirements

- Single file: `src/core/orchestration/discover.js` (~150 lines)
- No provider-specific imports
- State persistence delegated to the runtime or state layer

## MoSCoW

| Priority  | Requirements          |
|-----------|-----------------------|
| Must Have | FR-001 through FR-005 |

## Out of Scope

- What discover agents actually produce
- Agent prompt content
- File system scanning or project analysis logic
