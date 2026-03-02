# Implementation Notes: REQ-0007 Ollama / Local LLM Support

**Phase:** 06-implementation
**Date:** 2026-02-14
**Status:** Complete (excluding Module M2 - Installer Scripts, deferred)

---

## Summary

Implemented 3 of 4 modules for Ollama/local LLM support:
- **M3: Configuration** -- Enabled `/provider` command, updated Ollama models
- **M4: Documentation** -- Added Ollama quick-start section to CLAUDE.md.template
- **M1: Auto-Detection** -- Added `autoDetectProvider()` function to provider-utils.cjs
- **M2: Installer Scripts** -- DEFERRED (user constraint: installer changes handled separately)

## Files Modified

### Production Code

1. **`src/claude/commands/provider.md`** (M3)
   - Set `user_invocable: true` (was `false`)
   - Removed "(currently disabled)" from description
   - Removed disabled HTML comment block
   - Traces: REQ-001, AC-003-01

2. **`src/claude/hooks/config/provider-defaults.yaml`** (M3)
   - Replaced outdated Ollama models with 4 new models:
     - `qwen3-coder` (131072 context, 24GB VRAM)
     - `glm-4.7` (131072 context, 24GB VRAM)
     - `gpt-oss:20b` (65536 context, 16GB VRAM)
     - `gpt-oss:120b` (65536 context, 48GB VRAM)
   - Removed deprecated: `deepseek-coder-v2:16b`, `codellama:34b`, `qwen2.5-coder:14b`
   - Added VRAM requirement comments
   - All models meet 64k minimum context window
   - Traces: REQ-002, REQ-005, AC-004-01

3. **`src/claude/CLAUDE.md.template`** (M4)
   - Added "LLM Provider Configuration" section with:
     - Active provider auto-detection documentation
     - Ollama quick-start instructions
     - Manual environment variable examples
     - Recommended models table (4 models with VRAM/context)
     - Known limitations section (multi-agent, tool calling, context, structured output)
     - `/provider` command reference
   - Traces: REQ-003, REQ-005, AC-004-02, AC-004-03

4. **`src/claude/hooks/lib/provider-utils.cjs`** (M1)
   - Added `autoDetectProvider(config)` async function (~55 lines)
   - Tiered detection: env var > config file > health probe > fallback
   - Case-insensitive localhost:11434 matching
   - Fail-open behavior (Article X): any exception returns Anthropic default
   - Health probe uses existing `checkProviderHealth()` with 2000ms timeout
   - Exported via `module.exports`
   - Traces: REQ-006, NFR-001, NFR-002, NFR-003, ADR-0001, ADR-0004

### Test Files Created

5. **`src/claude/hooks/tests/provider-utils-autodetect.test.cjs`** -- 18 unit tests
   - Tier 1 env var detection (3 tests)
   - Tier 2 config file detection (3 tests)
   - Tier 4 fallback (2 tests)
   - Health probe behavior (3 tests: timeout, HTTP 500, connection refused)
   - Backward compatibility (2 tests: hasProvidersConfig guard)
   - Edge cases (5 tests: null config, mixed case, performance, shape, export)

6. **`src/claude/hooks/tests/provider-config-validation.test.cjs`** -- 9 unit tests
   - Model context windows >= 64k (1 test)
   - Model capabilities and required fields (3 tests)
   - Model ID/alias format validation (2 tests)
   - Recommended models present, deprecated removed (1 test)
   - provider.md frontmatter validation (1 test)
   - Health check config validation (1 test)

7. **`tests/prompt-verification/provider-documentation.test.js`** -- 6 content tests
   - Ollama quick-start section verification
   - Environment variable documentation
   - Recommended models table
   - Known limitations section
   - Auto-detection documentation
   - /provider command reference

## Key Implementation Decisions

1. **YAML parser workaround**: The existing `parseYaml()` function has known limitations with deeply nested array-of-object structures containing sub-arrays (e.g., `capabilities` within model array items). Config validation tests use direct string extraction from raw YAML instead. This is appropriate because the tests validate the YAML content itself, and the parser works correctly for the simpler structures consumed at runtime.

2. **Fail-open pattern**: `autoDetectProvider()` wraps its entire body in try/catch. Any exception (including null config) returns the Anthropic default. This follows Article X (Fail-Safe Defaults) and ADR-0004 (Backward Compatibility).

3. **No router modification**: The module design specified a modification to `model-provider-router.cjs`. This was not implemented in this phase because:
   - The auto-detect function is already exported and available for the router to use
   - The router modification is tightly coupled with the installer flow (M2), which is deferred
   - The existing `selectWithFallback()` handles health check failures
   - The auto-detect function can be integrated into the router when M2 is implemented

## Deferred Work

- **Module M2 (Installer Scripts)**: Changes to `lib/installer.js`, `install.sh`, `install.ps1` are deferred per user constraint. These will be handled in a separate session.
- **Router integration**: The `autoDetectProvider()` call in `model-provider-router.cjs` (lines 76-125 in module design) is deferred until M2 is complete.

## Test Results

```
33 tests total, 33 passing, 0 failing
- provider-utils-autodetect.test.cjs: 18/18 pass
- provider-config-validation.test.cjs: 9/9 pass
- provider-documentation.test.js: 6/6 pass
```

No regressions in existing test suite (26 parallel-execution tests pass).
