# Architecture Overview — REQ-0129: Provider-Neutral Phase-Loop Orchestrator

**ADR**: ADR-CODEX-030

## Decision

Extract the Phase-Loop Controller logic currently embedded in `isdlc.md` into a
standalone, provider-neutral module at `src/core/orchestration/phase-loop.js`.

## Context

The phase-loop is the primary orchestration pattern in iSDLC — it drives every
workflow from requirements through finalization. Currently this logic lives in
the Claude-Code-specific command file, making it impossible to reuse with other
runtime providers. This is the largest orchestrator (~250 lines) and the most
critical extraction target.

## File

`src/core/orchestration/phase-loop.js` (~250 lines)

## Dependencies

| Dependency | Module | Usage |
|---|---|---|
| Team instances | `src/core/teams/` | `getTeamInstancesByPhase()` |
| Skill injection | `src/core/skills/` | `computeInjectionPlan()` |
| Governance | `src/core/governance/` | `validateCheckpoint()` |
| State machines | `src/core/state/` | Phase transition models |
| Runtime adapter | Injected | `executeTask()`, `presentInteractive()` |

## Design Principles

- **Provider-neutral**: All provider interaction goes through the injected
  `runtime` object. No imports from `src/claude/`.
- **Hook-in-loop**: Pre/post phase hooks run inside the iteration, not as
  external middleware, keeping the control flow linear and debuggable.
- **Retry with context**: On checkpoint failure, the orchestrator re-delegates
  with failure context rather than silently retrying the same instructions.

## Consequences

- The `isdlc.md` command file becomes a thin shell that constructs the runtime
  adapter and calls `runPhaseLoop()`.
- Other providers (Codex, future) can reuse the same phase sequencing logic.
- Testing becomes possible via mock runtime adapters.
