# Module Design: REQ-GH-216

## Module Overview

This refactor is modification-heavy: no new modules, one new method on an existing module (`ConfigService.getAtdd()`), and targeted edits across ~20 existing files. The four concerns are:

1. **Config reader** — new `getAtdd()` accessor on `ConfigService` (src/core/config/), exposed via CJS bridge and common.cjs helper.
2. **Config schema** — new `atdd` section in `.isdlc/config.json`, with 4 knobs and default-merge semantics.
3. **Runtime consumers** — 5 hooks, 3 phase agents, 1 discover orchestrator, 1 discover sub-agent, and the phase-loop controller all gain config-driven ATDD gating.
4. **Documentation** — 4 doc files updated to reflect config-driven defaults.

## Module Design

### 1. ConfigService.getAtdd() *(new method on existing module)*

- **Location**: `src/core/config/config-service.js` (ESM)
- **Responsibility**: Return the fully-resolved `atdd` config object, merging user overrides with defaults.
- **Public interface**:
  ```
  getAtdd(): { enabled: boolean, require_gwt: boolean, track_red_green: boolean, enforce_priority_order: boolean }
  ```
- **Internal behavior**:
  1. Read cached `.isdlc/config.json` (existing caching layer).
  2. Extract `atdd` section; if missing, use `{}`.
  3. Merge partial user config with all-true defaults.
  4. Return complete object.
- **Error handling**: Catch any error in steps 1–3; return all-true defaults (Article X fail-safe).
- **Testability**: Pure function of cached config; mockable via config fixture injection.
- **Estimated size**: ~15 LoC in config-service.js + ~8 LoC in CJS bridge.

### 2. ConfigService CJS bridge

- **Location**: `src/core/bridge/config.cjs`
- **Responsibility**: Expose `getAtdd()` to CJS callers (hooks, which are .cjs per Article XIII).
- **Public interface**: `module.exports.getAtdd = getAtdd`
- **Dependencies**: Existing bridge mechanism (sync-wrap over ESM).
- **Estimated size**: ~5 LoC added to existing bridge file.

### 3. common.cjs::readAtddConfig() helper *(optional passthrough)*

- **Location**: `src/claude/hooks/lib/common.cjs`
- **Responsibility**: Convenience passthrough for hooks that already import common.cjs.
- **Public interface**: `readAtddConfig(): { enabled, require_gwt, track_red_green, enforce_priority_order }`
- **Dependencies**: `src/core/bridge/config.cjs::getAtdd()`
- **Rationale**: Hooks already read from common.cjs for shared helpers; adding this passthrough avoids each hook importing the bridge directly.
- **Estimated size**: ~3 LoC.

### 4. Configuration schema (`atdd` section)

- **Location**: `.isdlc/config.json` (user file, project-specific)
- **Shape**:
  ```json
  "atdd": {
    "enabled": true,
    "require_gwt": true,
    "track_red_green": true,
    "enforce_priority_order": true
  }
  ```
- **Semantics**:
  - `enabled` — master kill switch; when false, all sub-knobs are no-ops
  - `require_gwt` — hard-block Phase 05 on non-GWT ACs
  - `track_red_green` — record RED→GREEN transitions in atdd-checklist.json
  - `enforce_priority_order` — require priority-ordered test completion
- **Validation**: Trust-the-user model (no strict JSON schema validation) per existing convention; ConfigService merges with defaults.

### 5. Runtime consumers (modified existing modules)

| Module | Responsibility | Config Keys Read | Gating Behavior |
|--------|---------------|-------------------|-----------------|
| atdd-completeness-validator.cjs | Enforce GWT format on ACs | `enabled`, `require_gwt` | If `!enabled`: pass-through. If `enabled && require_gwt`: validate GWT; else: skip validation. |
| test-watcher.cjs | Observe test state changes | `enabled`, `track_red_green` | If `!enabled` OR `!track_red_green`: skip transition logging. |
| post-bash-dispatcher.cjs | Dispatch post-bash hooks | `enabled` | If `!enabled`: skip atdd-related dispatches. |
| checkpoint-router.js | Route test checkpoints | `enabled`, `enforce_priority_order` | If `!enabled` OR `!enforce_priority_order`: accept any order. |
| Phase 05 agent (04-test-design-engineer.md) | Generate test scaffolds from ACs | `enabled`, `require_gwt` (via delegation prompt) | Instructions gated on config values injected by phase-loop controller. |
| Phase 06 agent (05-software-developer.md) | Implement tests, track RED→GREEN | `track_red_green`, `enforce_priority_order` (via delegation prompt) | Instructions gated on config values. |
| Phase 16 quality-loop agent (06-integration-tester.md) | Run quality gate | (consumes checkpoint-router output) | Indirect gating via checkpoint-router. |
| discover-orchestrator.md | Run discover sub-phases | `enabled` | If `!enabled`: skip sub-phase 1d (atdd-bridge). |
| discover/atdd-bridge.md | Prepare reverse-engineered ACs | — | Invoked only when `atdd.enabled: true` (precondition). |
| phase-loop-controller (isdlc.md) | Orchestrate phase delegations | `atdd.*` full object | Inject atdd.* values into Phase 05/06 delegation prompts via GATE REQUIREMENTS INJECTION. |

### 6. Dependency diagram

```
  ConfigService.getAtdd() <--- [src/core/config/config-service.js]
           |
           v
  config.cjs (bridge) <--- [src/core/bridge/config.cjs]
           |
           v
  common.cjs::readAtddConfig() <--- [src/claude/hooks/lib/common.cjs]
           |
           +---> atdd-completeness-validator.cjs
           +---> test-watcher.cjs
           +---> post-bash-dispatcher.cjs
  config.cjs (bridge)
           |
           +---> checkpoint-router.js (direct import)
           +---> isdlc.md phase-loop-controller (via bash invocation)
```

No circular dependencies. ConfigService is the single reader of `.isdlc/config.json`. Hooks and agents consume through the bridge or the helper passthrough.

## Changes to Existing

### Config files

- **src/isdlc/config/workflows.json**:
  - Remove 2× `_when_atdd_mode` conditional blocks inside `build.agent_modifiers["05-test-strategy"]` and `build.agent_modifiers["06-implementation"]`.
  - Lift their contents (e.g., `generate_skipped_tests`, `require_given_when_then_ac`, `create_atdd_checklist`) into the agent_modifiers directly; they become unconditional modifiers.
  - Remove the `atdd_mode` workflow option definition from `build.options`.
  - Apply identical treatment to the test-generate workflow.

- **src/isdlc/config/iteration-requirements.json**:
  - Remove the `"when": "atdd_mode"` field from each of the 3 `atdd_validation` blocks (phases 05, 06, 16).
  - The blocks themselves remain as gate requirements; gating now occurs at hook runtime via `atdd.enabled` instead of via the `"when"` field.

### Hook modules

Each hook reads atdd config at handler entry, gates behavior on knob values, and fails-open to defaults on error:

- **atdd-completeness-validator.cjs**: Add `const atdd = readAtddConfig()` at entry. If `!atdd.enabled`, return pass. If `atdd.require_gwt`, run the existing GWT check. Else, skip GWT check.
- **test-watcher.cjs**: Gate the RED→GREEN transition logging block on `atdd.enabled && atdd.track_red_green`.
- **post-bash-dispatcher.cjs**: Gate any atdd-specific dispatch calls on `atdd.enabled`.
- **checkpoint-router.js**: Gate priority-order enforcement on `atdd.enabled && atdd.enforce_priority_order`.
- **common.cjs**: Add `readAtddConfig()` passthrough function exporting the bridge call.

### Phase agent files

- **04-test-design-engineer.md** (Phase 05):
  - Remove conditional wording ("If atdd_mode is enabled...").
  - Replace with unconditional instructions referencing `atdd.*` values from the delegation prompt's GATE REQUIREMENTS INJECTION block.
  - Example: "Generate test scaffolds from ACs. If `atdd.require_gwt` is true, validate that all ACs are in Given/When/Then format before proceeding."

- **05-software-developer.md** (Phase 06): Remove atdd_mode conditionals; replace with config-aware instructions for RED→GREEN tracking (`atdd.track_red_green`) and priority-order enforcement (`atdd.enforce_priority_order`).

- **06-integration-tester.md**: Remove atdd_mode conditionals; config-aware instructions for checkpoint evaluation.

### Discover flow

- **discover-orchestrator.md**:
  - Remove the `--atdd-ready` flag check before sub-phase 1d.
  - Replace with: read `atdd.enabled` via ConfigService; skip sub-phase 1d only if `atdd.enabled: false`.

- **discover/atdd-bridge.md**:
  - Remove the "ONLY invoked when --atdd-ready flag is used" precondition.
  - Replace with: "Skipped only when `atdd.enabled: false` in `.isdlc/config.json`."

- **discover/feature-mapper.md**, **discover/artifact-integration.md**: Remove `--atdd-ready` flag references from instructions.

- **src/claude/commands/discover.md**: Remove `--atdd-ready` from the flag documentation table and usage examples.

### Phase-loop controller

- **src/claude/commands/isdlc.md**: Add an atdd.* injection block within GATE REQUIREMENTS INJECTION for Phase 05 and Phase 06 delegations. The block reads `atdd.*` via bridge invocation (bash call into node) and appends to the agent prompt:
  ```
  ATDD_CONFIG:
    enabled: {bool}
    require_gwt: {bool}
    track_red_green: {bool}
    enforce_priority_order: {bool}
  ```

### Documentation

- **CLAUDE.md**, **docs/ARCHITECTURE.md**, **docs/HOOKS.md**, **docs/AGENTS.md**: Replace `--atdd` and `--atdd-ready` references with config-driven descriptions. Describe defaults (all true) and the escape-hatch model.

## Wiring Summary

```
.isdlc/config.json
       |
       v
ConfigService.getAtdd()           <-- NEW method
       |
       v
src/core/bridge/config.cjs        <-- CJS passthrough for hooks
       |
       +---> src/claude/hooks/lib/common.cjs::readAtddConfig()  <-- NEW helper
                |
                +---> atdd-completeness-validator.cjs
                +---> test-watcher.cjs
                +---> post-bash-dispatcher.cjs
       +---> src/core/validators/checkpoint-router.js           <-- direct import
       +---> src/claude/commands/isdlc.md (phase-loop)
                |
                +---> Phase 05 delegation prompt (atdd.* values)
                +---> Phase 06 delegation prompt (atdd.* values)
       +---> src/claude/agents/discover-orchestrator.md         <-- bash invocation
                |
                +---> atdd-bridge sub-phase 1d (skip if !enabled)
```

## Assumptions and Inferences

- `ConfigService.getAtdd()` follows the accessor pattern established by GH-231 (e.g., `getMemory()`, `getBranches()`) — non-breaking addition.
- `src/providers/codex/` has no atdd-specific files (verified via grep), so no Codex-side parallel implementation is required.
- Hooks will import `readAtddConfig` from common.cjs (convenience), avoiding direct bridge imports.
- The phase-loop controller's GATE REQUIREMENTS INJECTION block already supports phase-specific config injection; adding an `ATDD_CONFIG` sub-block fits the existing injection format.
- atdd-checklist.json is created by Phase 05 and updated by Phase 06. Its location is per-feature (`docs/requirements/{slug}/atdd-checklist.json`). Re-runs overwrite. (Inferred from existing artifact lifecycle.)
- Article XIII (module system consistency) requires the new `getAtdd()` to be .js (ESM) with a .cjs bridge for hook consumers. Both files exist in the same location pattern as GH-231 accessors.
