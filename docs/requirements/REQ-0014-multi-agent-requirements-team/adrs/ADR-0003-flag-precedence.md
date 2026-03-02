# ADR-0003: Flag Precedence for Debate Mode Configuration

## Status

Accepted

## Context

Debate mode needs to be configurable. Multiple signals can influence whether debate is ON or OFF: explicit CLI flags, workflow sizing, and the -light flag. These can conflict. For example, a user might run `/isdlc feature "X" -light --debate` -- what should happen?

### Existing Flag Precedent

The iSDLC framework already has flag precedence patterns:
- `-light` flag disables optional phases (established pattern)
- `--supervised` flag enables manual review gates (established pattern)
- Impact analysis sizing (standard/epic) influences phase depth (established pattern)

### Requirements Driving This Decision

- FR-005: Debate mode ON by default for standard/epic, OFF for -light, overridable with --debate/--no-debate
- NFR-002: Backward compatibility (existing -light behavior unchanged)
- NFR-003: -light workflows identical to current behavior
- Article X (Fail-Safe Defaults): Conservative default when signals conflict

## Decision

Use a **strict priority chain** where explicit flags override implicit defaults:

```
Priority (highest to lowest):
  1. --no-debate flag       --> debate_mode = false
  2. --debate flag           --> debate_mode = true
  3. -light flag             --> debate_mode = false
  4. sizing == "standard"    --> debate_mode = true
  5. sizing == "epic"        --> debate_mode = true
  6. fallback               --> debate_mode = true
```

**Key rule:** If both `--debate` and `--no-debate` are provided simultaneously, `--no-debate` wins. This follows Article X (Fail-Safe Defaults) -- the conservative option (less processing) is the safe default when signals conflict.

**Resolution logic location:** The sdlc-orchestrator resolves debate_mode during Phase 01 initialization, after reading flags from the isdlc.md command delegation context and sizing from active_workflow.sizing.

**Storage:** `active_workflow.debate_mode` (boolean) in state.json, written once during resolution and read by the debate loop.

## Consequences

**Positive:**
- Follows existing -light flag precedent (users expect -light to disable optional features)
- Explicit flags always override implicit defaults (user intent is respected)
- Simple priority chain is easy to understand and test
- Conservative default on conflict (Article X)
- Single resolution point (orchestrator) avoids distributed flag interpretation

**Negative:**
- Fallback default is `true` (debate ON), which means existing workflows that do not use -light will now trigger debate mode. This is intentional (the feature's purpose is to improve requirements quality by default), but existing users will notice a behavior change in standard workflows.
- No per-phase debate configuration in this feature (future extensibility, not implemented now)

**Risks:**
- Users unaware of debate mode may be confused by the Creator/Critic/Refiner loop. Mitigation: orchestrator displays a banner when debate mode activates: "Debate mode: ON (standard workflow). Use --no-debate to disable."

## Alternatives Rejected

### Debate OFF by Default
Making debate opt-in (OFF by default) was rejected because it would reduce adoption. The feature's value comes from improving requirements quality for all standard workflows. Users who want to skip debate can use -light or --no-debate.

### Separate Configuration File
A debate.json or debate section in iteration-requirements.json was rejected per Article V (Simplicity First). A boolean flag in active_workflow is sufficient. Per-phase debate configuration is deferred to a future feature when more phases support debate.
