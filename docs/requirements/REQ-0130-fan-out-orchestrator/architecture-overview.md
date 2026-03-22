# Architecture Overview — REQ-0130: Provider-Neutral Fan-Out Orchestrator

**ADR**: ADR-CODEX-031

## Decision

Extract the fan-out orchestration pattern into a standalone, provider-neutral
module at `src/core/orchestration/fan-out.js`.

## Context

Fan-out is the standard pattern for dispatching multiple sub-agents in parallel
(roundtable members, parallel analysis tracks, dual-track sub-tasks). The
current implementation dispatches directly through Claude Code's sub-agent
mechanism. Extracting it into a ~100-line module allows any runtime to provide
its own parallel execution strategy.

## File

`src/core/orchestration/fan-out.js` (~100 lines)

## Dependencies

| Dependency | Module | Usage |
|---|---|---|
| Runtime adapter | Injected | `executeParallel()` |
| Instance config | Passed in | Team instance definition with members and merge policy |

## Design Principles

- **Minimal surface**: Single function, single responsibility — dispatch and
  merge. No awareness of what members do.
- **Policy-driven merge**: Merge behavior is data-driven from the instance
  config, not hardcoded branching logic.
- **Fail-open by design**: Optional members are first-class. The `required`
  flag on each member controls whether their failure is fatal.

## Consequences

- Roundtable, analysis, and any multi-agent pattern can reuse this module.
- Runtime adapters only need to implement `executeParallel()` to support
  fan-out orchestration.
- Merge policies are extensible — new policies can be added without changing
  the orchestrator structure.
