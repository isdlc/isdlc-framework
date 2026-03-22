# Implementation Notes — Phase 3 Batch 1

**Items**: REQ-0087 (Claude adapter boundary), REQ-0088 (Enforcement layering), REQ-0127 (Provider routing extraction)
**Date**: 2026-03-22

## Summary

This batch establishes three foundational patterns for the Phase 3 provider abstraction:

1. **Claude adapter boundary** — New `src/providers/claude/` directory defining the Claude-specific adapter interface
2. **Enforcement layering protocol** — New `src/core/validators/enforcement.js` wrapping gate-logic check() with evidence production
3. **Provider routing extraction** — Core logic from `src/claude/hooks/lib/provider-utils.cjs` (964 lines) extracted into 4 focused ESM modules

## Architecture Decisions

### Extraction Pattern: ESM Core + CJS Bridge

Following ADR-CODEX-006 and the proven pattern from Phase 2 (state.cjs, validators.cjs):

- **ESM modules** in `src/core/providers/` are the canonical implementations
- **CJS bridge** in `src/core/bridge/providers.cjs` exposes them to hooks
- **provider-utils.cjs** retains inline code as fallback + delegates to bridge when loaded
- **Zero behavioral change** to existing callers

### Provider-utils.cjs Function Disposition

| Extracted to Core | Stays in provider-utils.cjs |
|---|---|
| parseYaml, parseValue | resolveEnvVars (Claude env injection) |
| resolveProvidersConfigPath, loadProvidersConfig | getEnvironmentOverrides (Claude env mapping) |
| getMinimalDefaultConfig, hasProvidersConfig | debugLog (already duplicated) |
| selectProvider, selectWithFallback | getProvidersStatus (uses resolveEnvVars) |
| parseProviderModel, isLocalProvider | |
| getDefaultModel, resolveModelId | |
| autoDetectProvider, checkProviderHealth | |
| trackUsage, getUsageStats | |
| getActiveMode, setActiveMode, getAvailableModes | |

### Enforcement Layering (REQ-0088)

The pattern demonstrated on gate-blocker.cjs:

```
Hook → try core validateAndProduceEvidence()
     → if available: use structured evidence
     → if unavailable: run inline validation (existing behavior)
```

This establishes the enforcement layering protocol. Remaining hooks will follow in Batch 2.

### Claude Adapter Boundary (REQ-0087)

The `src/providers/claude/` directory defines:

- **index.js** — Entry point re-exporting adapter interface
- **hooks.js** — Hook registration config (8 hooks with events, commands, timeouts)
- **projection.js** — .claude/ directory projection paths (CLAUDE.md, settings.json, commands, hooks, agents, skills)

These are new files defining the adapter interface. The real logic migration happens in Batch 2.

## Files Created

| File | Purpose |
|---|---|
| `src/core/providers/config.js` | YAML parsing, config loading, defaults |
| `src/core/providers/routing.js` | Provider selection, fallback, health, auto-detect |
| `src/core/providers/usage.js` | Usage tracking, statistics |
| `src/core/providers/modes.js` | Mode get/set/list |
| `src/core/providers/index.js` | Re-exports all |
| `src/core/bridge/providers.cjs` | CJS bridge for hooks |
| `src/core/validators/enforcement.js` | Evidence-producing validation wrapper |
| `src/providers/claude/index.js` | Claude adapter entry point |
| `src/providers/claude/hooks.js` | Hook registration config |
| `src/providers/claude/projection.js` | .claude/ directory paths |

## Files Modified

| File | Change |
|---|---|
| `src/claude/hooks/lib/provider-utils.cjs` | Added bridge loader + bridge-first delegation for selectProvider |
| `src/claude/hooks/gate-blocker.cjs` | Added enforcement layering bridge-first pattern |
| `src/core/validators/index.js` | Added validateAndProduceEvidence export |

## Test Results

- **66 new tests** across 6 test files, all passing
- **382 core tests** pass (including new ones)
- **1585 total tests**, **0 new regressions** (3 pre-existing failures in CLAUDE.md/README content tests)

## Key Constraints

- YAML parser is copied exactly from provider-utils.cjs — known limitation with simple array parsing at root level
- Core ESM modules accept explicit `projectRoot` parameter instead of calling `getProjectRoot()` (decoupled from CJS common.cjs)
- Bridge fallback ensures hooks continue working even if ESM modules fail to load
