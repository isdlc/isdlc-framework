# Data Flow: REQ-GH-216

## Overview

ATDD configuration flows from a single source (`.isdlc/config.json`) through ConfigService to hooks, phase agents, and the phase-loop controller. There is no atdd-specific persistent state beyond the config file itself. The only atdd-produced artifact is `atdd-checklist.json` (per-feature).

## Data Sources

| Source | Type | Scope | Lifecycle |
|--------|------|-------|-----------|
| `.isdlc/config.json` | JSON file | Project-wide | User-edited; stable per project |
| GATE REQUIREMENTS INJECTION prompts | Agent delegation context | Per-phase invocation | Transient; rebuilt each delegation |
| `atdd-checklist.json` | JSON artifact | Per-feature | Created by Phase 05; updated by Phase 06; overwritten on re-runs |

## Data Sinks

| Sink | Consumer | Contents |
|------|----------|----------|
| ConfigService cache (in-process) | Hooks, phase-loop controller | Parsed JSON, in-memory |
| Phase 05/06 agent prompts | Phase agents | ATDD_CONFIG block with resolved values |
| `atdd-checklist.json` | Developer, Phase 08 review | Test state transitions (RED, GREEN timestamps, priority, completion order) |

## Config Read Flow

```
.isdlc/config.json (on disk)
       |
       | (first call only)
       v
   fs.readFileSync() + JSON.parse()
       |
       v
   ConfigService.cache['atdd'] = merged defaults + user overrides
       |
       v
   getAtdd() returns cached object
       |
       +-------+---------------+------------+-----------+
       |       |               |            |           |
       v       v               v            v           v
  hook     hook           hook        validator    phase-loop
  (1)      (2)            (3)         (4)          controller
                                                       |
                                                       v
                                              injection into
                                              Phase 05/06 prompts
```

**Caching semantics**:
- First call to `getAtdd()` reads and parses `.isdlc/config.json`.
- Subsequent calls within the same process return the cached object.
- Cache is invalidated when the process exits.
- No file watching — config changes require a new invocation to take effect.

## State Mutation Points

### atdd-checklist.json lifecycle

```
Phase 05 (test-design-engineer)
       |
       | CREATES atdd-checklist.json with:
       |   - feature_slug
       |   - acs[] (GWT-validated if require_gwt=true)
       |   - scaffold_tests[] (one per AC)
       |   - non_gwt_flagged[] (ACs that bypassed GWT check, if require_gwt=false)
       v
docs/requirements/{slug}/atdd-checklist.json
       |
       v
Phase 06 (software-developer)
       |
       | APPENDS RED→GREEN transitions (if track_red_green=true):
       |   - transitions[] { test_id, from_state, to_state, timestamp }
       v
docs/requirements/{slug}/atdd-checklist.json (updated)
       |
       v
Phase 16 (quality-loop)
       |
       | READS for coverage verification
       v
Phase 08 (code-review)
       |
       | READS for dual-file check + review
```

**Gating behavior**:
- If `atdd.enabled: false`: Phase 05 skips creation entirely. File does not exist.
- If `atdd.track_red_green: false`: Phase 06 skips appending transitions. File contains only scaffold state.
- If `atdd.enforce_priority_order: false`: Phase 06 does not fail on out-of-order completion (transitions still logged if `track_red_green: true`).

### ConfigService.cache

- **Mutation**: Set once on first config read per process.
- **Readers**: All ATDD-aware hooks, phase-loop controller.
- **Concurrency**: Single-threaded within a hook invocation; no race conditions.

## Concurrency Considerations

- ConfigService is read-only after initialization — no write contention.
- `atdd-checklist.json` is written by one agent at a time (Phase 05 creates, Phase 06 updates); sequential phase execution guarantees no concurrent writes.
- Hook invocations are serialized by Claude Code's hook dispatcher; no parallel hook execution on the same event.

## Persistence Boundaries

| Boundary | Persisted | Not Persisted |
|----------|-----------|---------------|
| `.isdlc/config.json` → process memory | — | Config cache lost at process exit |
| Phase 05 → `atdd-checklist.json` | Scaffold state persists across phases | Scaffold content intermediate state not persisted |
| Phase 06 → `atdd-checklist.json` (append) | RED→GREEN transitions persist | Intermediate test-run state not persisted |
| Phase 08 review outputs | Review artifacts persist (phase-08 review.md) | Reviewer working state not persisted |

## Data Transformation Stages

```
Stage 1: Parse
  Raw JSON string (fs.readFileSync)
       |
       v
  JavaScript object (JSON.parse)

Stage 2: Merge with defaults
  { atdd: { require_gwt: false } }  (partial user config)
       |
       +--- merge with ---
       |
  { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }
       |
       v
  { enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: true }

Stage 3: Consume
  Resolved AtddConfig object
       |
       +--- consumed by hooks (gate behavior on knob values)
       +--- consumed by phase-loop controller (inject into prompts)
       +--- consumed by agents (gate instructions on injected values)
```

## Input Validation Boundaries

| Boundary | Validation | Behavior on Invalid |
|----------|------------|---------------------|
| `.isdlc/config.json` → ConfigService | JSON parse only; no schema validation | Fail-open to defaults (Article X) |
| `atdd` section → getAtdd() merge | Type check per field (expect boolean) | Invalid field defaults; other fields preserved |
| Phase 05/06 prompt injection | — | If injection missing, agent uses defaults |
| Hook invocations | Check atdd.enabled first | Short-circuit on enabled: false |
