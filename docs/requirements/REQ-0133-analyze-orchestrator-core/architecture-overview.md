# Architecture Overview — REQ-0133: Provider-Neutral Analyze Orchestrator

**ADR**: ADR-CODEX-034

## Decision

Extract the analyze orchestration logic into a standalone, provider-neutral
module at `src/core/orchestration/analyze.js`.

## Context

The analyze workflow is the most complex orchestrator in iSDLC. It combines
classification routing, multi-turn interactive conversations (roundtable and
bug-gather), a state-machine-driven confirmation sequence, and a multi-step
finalization chain. Currently all of this logic is embedded in Claude-Code-
specific command handling. Extracting it into a ~200-line module is essential
for multi-provider support.

## File

`src/core/orchestration/analyze.js` (~200 lines)

Most complex orchestrator in the system.

## Dependencies

| Dependency | Module | Usage |
|---|---|---|
| Lifecycle model | `src/core/lifecycle/` | `getBugClassificationSignals()`, prefetch graph, flag parsing |
| Artifact readiness | `src/core/artifacts/` | Topic coverage tracking for roundtable |
| State machine | `src/core/state/` | Confirmation transitions: `getTransition()` |
| Finalization chain | `src/core/finalization/` | `getFinalizationChain()` for post-acceptance steps |
| Runtime adapter | Injected | `presentInteractive()`, `executeTask()` |

## Design Principles

- **Classification-first**: Entry routing and bug classification happen before
  any user interaction, ensuring the correct flow is selected immediately.
- **State-machine confirmations**: The confirmation sequence is driven by a
  state machine, not hardcoded if/else branches. This makes the domain sequence
  and accept/amend transitions explicit and testable.
- **Finalization as chain**: Post-acceptance steps are defined as a chain of
  operations, making them composable and independently testable.

## Consequences

- The analyze command in `src/claude/commands/` becomes a thin adapter.
- Roundtable depth adaptation and topic coverage work identically across
  providers.
- The confirmation state machine can be tested without any runtime — pure
  state transitions.
- New finalization steps (e.g., additional sync targets) can be added to the
  chain without modifying the orchestrator.
