# Requirements Specification — REQ-0129: Provider-Neutral Phase-Loop Orchestrator

**GitHub**: #195 | **Codex**: CODEX-060

## Functional Requirements

### FR-001: Phase Loop Execution

`runPhaseLoop(runtime, workflow, state)` iterates through `workflow.phases`. For
each phase it:

1. Validates the checkpoint (governance gate)
2. Projects instructions for the phase
3. Calls `runtime.executeTask()` with projected instructions
4. Validates the result against checkpoint criteria
5. Updates state with phase outcome

Returns the final accumulated state after all phases complete.

### FR-002: Pre-Phase Hook

Before each phase iteration:

- Reads current state
- Checks for stale phases (phases that exceeded time or iteration budgets)
- Handles escalations (blocked hooks, unresolved errors)
- Writes phase activation record to state

### FR-003: Post-Phase Hook

After each phase iteration:

- Updates state with phase completion status
- Extracts timing metrics (duration, start/end timestamps)
- Checks remaining budget (iteration count, wall-clock budget)

### FR-004: Hook Block Handling

On checkpoint failure:

- Retries with re-delegation up to `max_retries` (from workflow config)
- Each retry re-projects instructions with failure context
- If all retries exhausted, marks phase as blocked and returns partial state

### FR-005: Interactive Phase Relay

If a phase is interactive (e.g., `01-requirements`):

- Uses `runtime.presentInteractive()` in a loop
- Continues until the phase signals completion (user acceptance, final selection)
- Passes conversation context between interactive rounds

### FR-006: Consumed Dependencies

Consumes the following from the core layer:

- **Team instances**: `getTeamInstancesByPhase()` — resolve which agents participate
- **Skill injection**: `computeInjectionPlan()` — determine skill set per phase
- **Governance**: `validateCheckpoint()` — gate validation
- **State machine models**: phase transition definitions

## Non-Functional Requirements

- Single file: `src/core/orchestration/phase-loop.js` (~250 lines)
- No provider-specific imports
- All I/O goes through the `runtime` adapter interface

## MoSCoW

| Priority  | Requirements          |
|-----------|-----------------------|
| Must Have | FR-001 through FR-006 |

## Out of Scope

- Provider-specific delegation logic (handled by the runtime adapter)
- Agent prompt content generation
- Artifact file writing
