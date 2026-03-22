# Architecture Overview — REQ-0131: Provider-Neutral Dual-Track Orchestrator

**ADR**: ADR-CODEX-032

## Decision

Extract the dual-track orchestration pattern into a standalone, provider-neutral
module at `src/core/orchestration/dual-track.js`.

## Context

The dual-track pattern (implementation + quality running in parallel, retrying
together on failure) is the core quality loop in iSDLC. It powers phases 05-06
(build + test) and 07-08 (code review + quality). Currently this logic is
embedded in Claude-Code-specific delegation. Extracting it into a ~120-line
module makes it reusable across runtime providers.

## File

`src/core/orchestration/dual-track.js` (~120 lines)

## Dependencies

| Dependency | Module | Usage |
|---|---|---|
| Fan-out orchestrator | `src/core/orchestration/fan-out.js` | `runFanOut()` for Track A chunking |
| Runtime adapter | Injected | `executeParallel()` |
| Instance config | Passed in | Retry and fan-out policies |

## Design Principles

- **Atomic retry**: Both tracks restart together on any failure. This ensures
  Track A and Track B always evaluate against the same iteration state.
- **Threshold-driven fan-out**: Fan-out activation is data-driven from
  `policies.fan_out.trigger_threshold`, not hardcoded.
- **Composable**: Uses `runFanOut()` internally rather than reimplementing
  parallel dispatch for chunked execution.

## Consequences

- The quality loop becomes testable via mock runtimes.
- Fan-out threshold is configurable per workflow, enabling different strategies
  for small vs. large codebases.
- Runtime adapters only need `executeParallel()` — the dual-track retry logic
  is handled entirely by this module.
