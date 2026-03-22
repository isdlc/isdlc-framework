# Implementation Notes — REQ-0136 + REQ-0137

## Files Created

### `src/core/orchestration/instruction-generator.js` (~170 lines)

Provider instruction file generator. Key design decisions:

1. **INSTRUCTION_TEMPLATES** is a deeply frozen object (Object.freeze on the outer map and each inner template + sections array). Immutable at runtime per FR-006.

2. **Section builders** are simple functions that take projectConfig and return strings. Each builder has a try/catch — if any section fails, it's replaced with an HTML comment (fail-open, Article X).

3. **Agent roster** is loaded from `src/core/content/agent-classification.js` via top-level await. If the classification module isn't available (e.g., in a minimal install), it degrades to an empty list.

4. **Format handling**: Markdown providers get `---` separators and `#` headers. Text providers get `===` underlines and double-newline separators.

### `lib/cli.js` (modified — ~70 lines added)

Changes to the CLI command router:

1. **`--provider` flag** added to parseArgs() — stores in `options.provider`, consumed by `detectProvider()`.

2. **`detectProvider(options, projectRoot)`** — exported async function implementing the priority chain:
   - CLI flag (`--provider`) > explicit providers.yaml > autoDetectProvider() > 'claude'
   - Maps 'anthropic' to 'claude' for instruction file naming consistency
   - Wrapped in try/catch at every tier (fail-safe: returns 'claude')

3. **`generateProviderInstructions()`** — internal helper called after init and update:
   - Checks if the instruction file already exists — does NOT overwrite
   - This is critical: the installer creates CLAUDE.md from a template with issue tracker config, suggested prompts, etc. Overwriting that would lose project-specific content.
   - For non-Claude providers (codex, cursor, windsurf), it generates the instruction file since the installer doesn't handle those.

4. **init command** — after `install()`, detects provider and generates instruction file.
5. **update command** — after `update()`, detects provider and regenerates instruction file.
6. **Help text** — added `--provider <name>` to options section.

## Test Suites

### `tests/core/orchestration/instruction-generator.test.js` (26 tests)

Covers INSTRUCTION_TEMPLATES frozen state, generateInstructions for all 4 providers, graceful degradation, getInstructionPath, and listSupportedProviders.

### `lib/cli-provider.test.js` (15 tests)

Covers parseArgs --provider flag, detectProvider priority chain (with temp directories and real providers.yaml files), and CLI subprocess tests for help, init, doctor, and update.

## Design Decisions

1. **No overwrite of existing CLAUDE.md**: The installer creates CLAUDE.md with project-specific content. The instruction generator only creates if the file doesn't exist. This preserves backward compatibility (REQ-0137 FR-005).

2. **Dynamic imports for provider modules**: Both `loadProvidersConfig` and `autoDetectProvider` are loaded via dynamic `import()` to avoid breaking existing installs where those modules might not exist yet.

3. **Anthropic -> Claude mapping**: The provider routing system uses 'anthropic' as the provider name, but the instruction file system uses 'claude'. The mapping happens in detectProvider().

## Constitutional Compliance

- **Article I (Specification Primacy)**: Code implements FR-001 through FR-007 as specified.
- **Article II (Test-First Development)**: Tests written before production code (TDD Red/Green).
- **Article V (Simplicity First)**: Section builders are simple string-returning functions. No complex template engine.
- **Article VII (Artifact Traceability)**: All test IDs trace to FR numbers. Module JSDoc references REQ-0136.
- **Article VIII (Documentation Currency)**: Help text updated, JSDoc on all exports.
- **Article IX (Quality Gate Integrity)**: 41 new tests all passing, 0 regressions.
- **Article X (Fail-Safe Defaults)**: Every failure path returns 'claude' or skips with a comment.
