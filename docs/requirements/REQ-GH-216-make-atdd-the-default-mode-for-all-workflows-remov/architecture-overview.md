# Architecture Overview: REQ-GH-216

## Architecture Options

### Option A: Config-driven via `.isdlc/config.json` *(Selected)*

- **Summary**: Add an `atdd` section to `.isdlc/config.json` with 4 knobs (enabled, require_gwt, track_red_green, enforce_priority_order), all defaults true. Hooks, phase agents, and the phase-loop controller read these values via a new `ConfigService.getAtdd()` accessor.
- **Pros**: Flexible escape hatches for edge cases; consolidates ATDD configuration in one place; leverages existing ConfigService infrastructure from GH-231; zero new dependencies; user-editable.
- **Cons**: One additional config-read per hook invocation (~5ms, file-cached); phase-loop controller gains a new injection block; slightly more runtime code than a pure hardcoded removal.
- **Pattern alignment**: Follows the accessor pattern established by GH-231 (`getMemory()`, `getBranches()`, etc.). Uses the unified `.isdlc/config.json` as the single source of truth.
- **Verdict**: **Selected**. Matches the user's explicit request for config-file configurability with escape hatches.

### Option B: Hardcoded unconditional *(Eliminated)*

- **Summary**: Simply remove all `atdd_mode` conditionals and the flags, with no replacement config surface. ATDD permanently always-on.
- **Pros**: Simplest implementation; smallest diff; no runtime config path.
- **Cons**: No escape hatches if users hit edge cases (e.g., a feature where GWT ACs are genuinely impractical); contradicts the "configurable" requirement.
- **Pattern alignment**: Matches existing simple-refactor patterns but does not provide the escape-hatch model.
- **Verdict**: **Eliminated**. User explicitly requested config-file configurability.

### Option C: Per-phase config granularity *(Eliminated)*

- **Summary**: Expose separate knobs per phase (e.g., `atdd.phase_05.require_gwt`, `atdd.phase_06.track_red_green`).
- **Pros**: Finest-grained control; supports hypothetical phase-specific ATDD profiles.
- **Cons**: Over-engineered for current needs; clutters the config surface; no real use case demands it.
- **Pattern alignment**: Not consistent with the coarse-grained knob model used elsewhere in ConfigService.
- **Verdict**: **Eliminated**. User confirmed 4 global knobs is the right granularity.

## Selected Architecture

### ADR-001: Config-driven ATDD defaults via `.isdlc/config.json`

- **Status**: Accepted
- **Context**: The `--atdd` flag is currently opt-in at build time, and `--atdd-ready` is opt-in at discover time. The user wants ATDD to be the default everywhere, but retain the ability to tune behavior via config file (not CLI flags).
- **Decision**: Add an `atdd` section to `.isdlc/config.json` with 4 knobs (enabled, require_gwt, track_red_green, enforce_priority_order). All defaults true. Expose values through a new `ConfigService.getAtdd()` accessor. Hooks, phase agents, and the phase-loop controller read config values at runtime and gate behavior accordingly.
- **Rationale**: Leverages existing ConfigService infrastructure (GH-231); provides escape hatches for edge cases without CLI flag clutter; centralizes ATDD configuration in one place; maintains a clean separation between "what to run" (workflow definition) and "how to run it" (user configuration).
- **Consequences**: New config-read code path in hooks and agents; workflows.json and iteration-requirements.json lose their `_when_atdd_mode` / `"when": "atdd_mode"` conditional wrappers; phase-loop controller gains an `atdd.*` injection block for Phase 05/06 delegations; CLI parsers no longer define or parse `--atdd` / `--atdd-ready` flags.

### ADR-002: GWT hard-block when `require_gwt: true`

- **Status**: Accepted
- **Context**: The `require_gwt` knob name semantically implies requirement, not advisory behavior. The knob must match its name.
- **Decision**: When `atdd.require_gwt: true` (the default), Phase 05 hard-blocks if Phase 01 produced acceptance criteria without Given/When/Then structure. The `atdd-completeness-validator` hook emits a blocking error naming the non-GWT AC(s).
- **Rationale**: "Require" means require. Advisory behavior would weaken the contract and users would be surprised when the knob didn't enforce anything. When users need to ship a feature with non-GWT ACs, they explicitly flip `require_gwt: false` and accept best-effort scaffolds.
- **Consequences**: Phase 01 requirements output must produce GWT-format ACs to pass Phase 05 (for the default case). The roundtable-analyst must enforce GWT format during the confirmation sequence. Users with fuzzy ACs have two paths: re-run analysis with clearer ACs, or set `require_gwt: false` in config.

### ADR-003: `atdd.enabled: false` as master kill switch

- **Status**: Accepted
- **Context**: A single knob to disable all ATDD behaviors (scaffolds, tracking, priority enforcement, discover sub-phase) is simpler than requiring users to flip each sub-knob individually.
- **Decision**: When `atdd.enabled: false`, all ATDD-aware hooks and agents short-circuit regardless of sub-knob values. Phase 05 produces no scaffolds, Phase 06 skips tracking and priority-order enforcement, discover skips sub-phase 1d.
- **Rationale**: Kill switches are a common configuration pattern; they provide a single opt-out point that respects user intent.
- **Consequences**: Sub-knobs (`require_gwt`, `track_red_green`, `enforce_priority_order`) are no-ops when `enabled: false`. All ATDD-aware modules must check `enabled` first before evaluating sub-knobs.

## Technology Decisions

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|-------------------------|
| Config storage location | Reuse `.isdlc/config.json` (GH-231 unified config) | Single source of truth; zero new infrastructure | Separate `atdd-config.json` file (rejected: fragments config) |
| Config reader | Extend existing `ConfigService` with `getAtdd()` accessor | Leverages caching, path resolution, fallbacks already in place | Direct `fs.readFile` in each hook (rejected: duplicates logic, breaks caching) |
| Default-merge semantics | Partial config overrides merged with defaults | Allows users to override one knob without specifying all four | Require full `atdd` block (rejected: user-hostile) |
| Dependencies | None added | Pure refactor; no new external code | — |

## Integration Architecture

### Integration Points

| ID | Source | Target | Interface Type | Data Format | Error Handling |
|----|--------|--------|----------------|-------------|----------------|
| I1 | atdd-completeness-validator.cjs | ConfigService | Synchronous JS call | `{ enabled, require_gwt, track_red_green, enforce_priority_order }` | fail-open to defaults (Article X) |
| I2 | test-watcher.cjs | ConfigService | Synchronous JS call | `atdd.track_red_green` | fail-open to default (true) |
| I3 | post-bash-dispatcher.cjs | ConfigService | Synchronous JS call | `atdd.enabled` | fail-open to default (true) |
| I4 | checkpoint-router.js | ConfigService | Synchronous JS call | `atdd.enforce_priority_order` | fail-open to default (true) |
| I5 | phase-loop-controller (isdlc.md) | ConfigService | Synchronous JS call via bash | `atdd.*` object | fail-open; omit injection block on error |
| I6 | Phase 05 agent delegation | phase-loop-controller | Agent prompt injection | `atdd.*` values in GATE REQUIREMENTS INJECTION block | graceful degradation; agent operates with defaults if block missing |
| I7 | Phase 06 agent delegation | phase-loop-controller | Agent prompt injection | `atdd.*` values in GATE REQUIREMENTS INJECTION block | graceful degradation |
| I8 | discover-orchestrator.md | ConfigService | Synchronous JS call | `atdd.enabled` | fail-open to default (true); runs atdd-bridge |

### Data Flow

```
.isdlc/config.json
       |
       v
ConfigService.getAtdd()  --- cached, synchronous read
       |
       +-----> atdd-completeness-validator.cjs (hook)
       +-----> test-watcher.cjs (hook)
       +-----> post-bash-dispatcher.cjs (hook)
       +-----> checkpoint-router.js (validator)
       +-----> common.cjs::readAtddConfig() (helper passthrough)
       +-----> phase-loop-controller (isdlc.md)
                  |
                  +--> Phase 05 delegation prompt (atdd.* values)
                  +--> Phase 06 delegation prompt (atdd.* values)
       +-----> discover-orchestrator.md (skip sub-phase 1d if disabled)
```

**Config load timing**: ConfigService caches `.isdlc/config.json` on first read. Subsequent calls to `getAtdd()` return from cache — no repeated disk access within a process.

**Scope**: Each hook reads config at handler entry; each agent receives values via delegation prompt injection; each phase-loop iteration builds the prompt from a fresh read. No cross-phase state.

**Defaults handling**: `getAtdd()` always returns a complete object. Missing `atdd` section, missing individual fields, and read errors all resolve to the all-true default (Article X fail-safe).

## Summary

| Metric | Value |
|--------|-------|
| Architecture options evaluated | 3 |
| ADRs accepted | 3 |
| New dependencies | 0 |
| New modules | 0 |
| Integration points | 8 |
| Net LoC delta | ~+50 (getAtdd + common.cjs helper) / ~-100 (removed conditionals) |

**Key decisions**:
- Config-driven via `.isdlc/config.json` (ADR-001)
- GWT hard-block semantics for `require_gwt: true` (ADR-002)
- Kill switch precedence for `atdd.enabled` (ADR-003)

**Tradeoffs accepted**:
- Slight runtime overhead (one cached config read per hook) for configurability
- Tightened AC format expectations (GWT default) in exchange for consistent ATDD behavior
- Additional injection complexity in phase-loop controller in exchange for single-source-of-truth config

**Open questions**: None. All architecture decisions are Accepted.
