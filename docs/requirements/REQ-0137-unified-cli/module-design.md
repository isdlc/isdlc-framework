# Module Design — REQ-0137 Unified CLI with provider auto-detection

## File: lib/cli.js (~50 lines added to existing 292-line module)

### New function: detectProvider(options, projectRoot)

Priority chain:
1. `options.provider` (from `--provider` CLI flag)
2. `providers.yaml` active_mode field
3. `autoDetectProvider()` from `src/core/providers/routing.js`
4. Fallback: `'claude'`

Returns provider name string.

### Changes to existing commands

#### init command
- Parse `--provider` flag from args, store in `options.provider`
- After `install()` completes: call `detectProvider(options, projectRoot)` to resolve provider
- Call `generateInstructions(provider, projectConfig)` from instruction-generator.js
- Write result to `getInstructionPath(provider, projectRoot)`

#### update command
- After update completes, regenerate instruction file using same detect -> generate -> write flow

#### doctor command
- Add provider check: call `validateRuntime()` on the detected provider's runtime adapter
- Display active provider name in output

### New subcommand: provider

- `isdlc provider` — show current active provider name
- `isdlc provider set <name>` — change active provider in providers.yaml
