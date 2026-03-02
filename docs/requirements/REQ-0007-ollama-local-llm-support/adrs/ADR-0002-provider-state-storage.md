# ADR-0002: Provider State Storage

## Status
Accepted

## Context
When a user selects their LLM provider during installation (REQ-004), the choice must be persisted so that runtime auto-detection (REQ-006) can read it. The question is: where to store this preference?

Three options were evaluated:

1. **state.json**: Store in the existing `.isdlc/state.json` project state file
2. **providers.yaml**: Store in `.isdlc/providers.yaml` (existing pattern)
3. **Environment variables**: Generate a `.env` file or shell profile snippet

## Decision
Use **`.isdlc/providers.yaml`** (option 2).

The installer copies the full `provider-defaults.yaml` to `.isdlc/providers.yaml` and modifies the `defaults.provider` and `active_mode` fields based on the user's selection. This file is:
- Already supported by `resolveProvidersConfigPath()` (priority 1 in config resolution)
- Already checked by `hasProvidersConfig()` (the guard clause in the router)
- Already listed as a preserved artifact in Article XIV of the constitution
- Already in `.gitignore` (the `.isdlc/` directory is gitignored)

## Consequences

**Positive:**
- Uses the existing config loading infrastructure, no code changes to `loadProvidersConfig()`
- `hasProvidersConfig()` naturally returns `true` when the installer has run, enabling the provider routing code path
- The file is human-readable YAML, easy for users to inspect and modify
- The file includes the full provider catalog (copied from defaults), so model definitions are available
- Preserved during framework upgrades (Article XIV)

**Negative:**
- The file is ~525 lines (full provider catalog), which may seem large for just storing "I chose Ollama"
- If the framework defaults change (e.g., new providers added), the user's copy becomes stale
- Mitigation: The `/provider` command can offer an "update from defaults" option in the future

## Alternatives Considered

### Option 1: state.json
- Pro: Already the main state file, single source of truth
- Con: `state.json` is for runtime state, not user preferences. Adding provider config to it mixes concerns. The `loadProvidersConfig()` function does not read `state.json`. Would require plumbing changes.
- Rejected because: Violates separation of concerns; requires changes to the config loading pipeline

### Option 3: Environment variables (.env file)
- Pro: Standard pattern in many frameworks
- Con: The framework does not currently use `.env` files. Adding `.env` support requires a new dependency or custom parser. Also, the existing provider routing reads YAML, not env files.
- Rejected because: Adds complexity (Article V); would require a new config loading path

## Traces
- REQ-004: Installation script provider selection (writes the config)
- REQ-006: Auto-detect provider at runtime (reads the config)
- NFR-001: Zero-config UX (config written at install time, no manual steps needed)
