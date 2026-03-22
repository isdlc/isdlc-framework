# Architecture Overview — REQ-0132: Provider-Neutral Discover Orchestrator

**ADR**: ADR-CODEX-033

## Decision

Extract the discover orchestration logic into a standalone, provider-neutral
module at `src/core/orchestration/discover.js`.

## Context

The discover workflow is the first interaction point for new projects. It
presents a menu, executes discovery agents in groups, and tracks progress for
resume. Currently this is embedded in Claude Code's command handling. Extracting
it into a ~150-line module enables any runtime to drive the same discovery
experience.

## File

`src/core/orchestration/discover.js` (~150 lines)

## Dependencies

| Dependency | Module | Usage |
|---|---|---|
| Discover state schema | `src/core/state/` | `createInitialDiscoverState()`, `markStepComplete()`, `computeResumePoint()` |
| UX flows | `src/core/ux/` | Menu definitions for first-time and returning users |
| Runtime adapter | Injected | `presentInteractive()`, `executeParallel()`, `executeTask()` |

## Design Principles

- **Resume-first**: State is persisted after every group. Crashes or
  interruptions resume cleanly from the last completed group.
- **Sequential groups, parallel members**: Groups run in order (each may depend
  on prior group output), but members within a group run concurrently.
- **Menu-driven**: Mode selection happens through `runtime.presentInteractive()`,
  keeping the user interaction provider-neutral.

## Consequences

- The discover command in `src/claude/commands/` becomes a thin adapter that
  constructs the runtime and calls `runDiscover()`.
- Resume support works identically across providers — same state schema, same
  resume logic.
- New discovery modes can be added by defining new agent group sequences
  without changing the orchestrator.
