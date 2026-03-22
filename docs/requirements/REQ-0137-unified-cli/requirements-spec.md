# Requirements Specification — REQ-0137 Unified CLI with provider auto-detection

## Functional Requirements

### FR-001: Provider detection
On init/install, detect provider from priority chain: CLI flag (`--provider claude|codex`), `providers.yaml` active_mode, `autoDetectProvider()` from `src/core/providers/routing.js`, fallback to `'claude'`.

**MoSCoW**: Must Have

### FR-002: Runtime loading
Use `createProviderRuntime(providerName, config)` to load the appropriate adapter for the detected provider.

**MoSCoW**: Must Have

### FR-003: Instruction generation on install
After core install + provider install, call `generateInstructions()` to produce the system instruction file for the active provider.

**MoSCoW**: Must Have

### FR-004: CLI commands enhanced
- `init` command accepts `--provider` flag
- `doctor` command validates provider-specific installation
- `update` command regenerates instruction file

**MoSCoW**: Must Have

### FR-005: Backward compatibility
Default provider is `'claude'`. Existing installations continue to work without changes.

**MoSCoW**: Must Have

### FR-006: Provider info display
`doctor` and `status` commands show active provider name in their output.

**MoSCoW**: Must Have

## Out of Scope

- Workflow commands (feature/fix/build — those come from the provider's instruction file and the orchestration layer)
