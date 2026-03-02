# Impact Analysis: Ollama / Local LLM Support

**Generated**: 2026-02-14T10:40:00Z
**Feature**: Enable Ollama/local LLM support in iSDLC framework -- re-enable /provider skill, update provider-defaults.yaml with current Ollama models, update CLAUDE.md template, add provider selection to installers, add auto-detect provider logic, and document limitations.
**Based On**: Phase 01 Requirements (finalized) -- `docs/requirements/REQ-0007-ollama-local-llm-support/requirements-spec.md`
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Delegation) | Clarified (Phase 01) |
|--------|----------------------|----------------------|
| Description | Enable Ollama/local LLM support | Enable and document Ollama with installer UX, auto-detection, and limitation docs |
| Keywords | ollama, provider, install, detect | ollama, provider, install, detect, VRAM, context-window, zero-config, graceful-degradation |
| Estimated Files | ~7 (from delegation) | 7-8 (refined) |
| Scope Change | - | Refined (same scope, more detail on installer UX and NFRs) |

Phase 00 was skipped (detailed description provided). Scope is consistent between the delegation description and finalized requirements.

---

## Executive Summary

This feature is **enablement of existing infrastructure**, not new plumbing. The iSDLC framework already has comprehensive multi-provider support built into `provider-utils.cjs` (895 lines), `model-provider-router.cjs` (159 lines), and `provider-defaults.yaml` (525 lines). That infrastructure was disabled when the framework became Claude Code-specific. This feature re-enables and updates it for Ollama, adds installer UX for provider selection, and adds an auto-detect function. The blast radius is **low** because changes are concentrated in configuration, documentation, and UI code paths that are currently disabled/commented-out. The primary risk is the **complete absence of test coverage** on all provider-related files.

**Blast Radius**: LOW (7 files directly affected, 2 modules)
**Risk Level**: MEDIUM (zero test coverage on affected files, backward compatibility concern)
**Affected Files**: 7-8 files
**Affected Modules**: 2 (provider infrastructure, installation scripts)

---

## Impact Analysis

### Files Directly Affected

| # | File | REQ(s) | Change Type | Lines | Complexity |
|---|------|--------|-------------|-------|------------|
| 1 | `src/claude/commands/provider.md` | REQ-001 | Toggle flag | ~1 | Trivial |
| 2 | `src/claude/hooks/config/provider-defaults.yaml` | REQ-002, REQ-005 | Config update | ~20 | Low |
| 3 | `src/claude/CLAUDE.md.template` | REQ-003, REQ-005 | Documentation | ~30-40 | Low |
| 4 | `lib/installer.js` | REQ-004 | Un-comment + adapt | ~40-60 | Medium |
| 5 | `install.sh` | REQ-004 | New section | ~30-50 | Medium |
| 6 | `install.ps1` | REQ-004 | New section | ~30-50 | Medium |
| 7 | `src/claude/hooks/lib/provider-utils.cjs` | REQ-006 | New function | ~30-50 | Medium |

### Outward Dependencies (What depends on these files)

| Affected File | Dependents | Risk |
|---------------|-----------|------|
| `provider-utils.cjs` | `model-provider-router.cjs` (imports 7 functions) | Changes to provider selection logic could affect all provider routing |
| `provider-defaults.yaml` | `provider-utils.cjs` via `loadProvidersConfig()` | Config format changes could break YAML parser |
| `lib/installer.js` | `lib/cli.js` (imports `install` function) | Installer is end-user facing |
| `CLAUDE.md.template` | `lib/installer.js` line 556 (copies to target project CLAUDE.md) | Template used during fresh installs |
| `provider.md` | Claude Code command system (reads frontmatter) | User-facing command availability |

### Inward Dependencies (What these files depend on)

| Affected File | Dependencies | Notes |
|---------------|-------------|-------|
| `provider-utils.cjs` | `./common.cjs` (getProjectRoot, readState, writeState), Node.js `fs`, `path`, `http`, `https` | All existing deps, no new ones needed (CON-001) |
| `model-provider-router.cjs` | `./lib/provider-utils.cjs`, `./lib/common.cjs` | No changes expected to imports |
| `lib/installer.js` | `./utils/prompts.js` (confirm, select, text), `./project-detector.js`, `./monorepo-handler.js` | Prompt infrastructure already exists |

### Change Propagation Paths

```
REQ-001: provider.md (toggle) --> No propagation
REQ-002: provider-defaults.yaml --> provider-utils.cjs (reads config) --> model-provider-router.cjs (uses selection)
REQ-003: CLAUDE.md.template --> installer copies to target project
REQ-004: installer.js --> cli.js (entry point) | install.sh (standalone) | install.ps1 (standalone)
REQ-005: CLAUDE.md.template + provider-defaults.yaml comments --> documentation only
REQ-006: provider-utils.cjs (new function) --> model-provider-router.cjs (may consume) --> hook system
```

---

## Entry Points

### Existing Entry Points Affected

| Entry Point | File | How Affected |
|-------------|------|--------------|
| `/provider` command | `src/claude/commands/provider.md` | Re-enabled (user_invocable: true) |
| `npx isdlc install` | `lib/installer.js` via `lib/cli.js` | Provider selection added to install flow |
| `./install.sh` | `install.sh` | Provider selection added |
| `./install.ps1` | `install.ps1` | Provider selection added |
| PreToolUse hook | `model-provider-router.cjs` | May need to call auto-detect if no explicit config |

### New Entry Points Required

| Entry Point | File | Purpose |
|-------------|------|---------|
| `autoDetectProvider()` | `provider-utils.cjs` | New exported function for runtime provider auto-detection |

### Implementation Chain (Entry to Data Layer)

```
User runs `claude` in project
  --> Claude Code loads CLAUDE.md (from template)
  --> CLAUDE.md references Ollama env vars and quick-start
  --> If PreToolUse hook fires (Task tool):
      --> model-provider-router.cjs
      --> loadProvidersConfig() from provider-utils.cjs
      --> selectProvider() checks phase routing
      --> NEW: autoDetectProvider() checks env vars, .isdlc/providers.yaml, localhost:11434
      --> getEnvironmentOverrides() sets ANTHROPIC_BASE_URL etc.
      --> Hook outputs env overrides to Claude Code
```

### Recommended Implementation Order

1. **REQ-001**: Toggle `user_invocable: true` in `provider.md` (trivial, unblocks testing)
2. **REQ-002**: Update `provider-defaults.yaml` Ollama models (config, no code risk)
3. **REQ-005**: Add limitation documentation to `CLAUDE.md.template` and YAML comments (docs only)
4. **REQ-003**: Add Ollama quick-start to `CLAUDE.md.template` (docs only)
5. **REQ-006**: Implement `autoDetectProvider()` in `provider-utils.cjs` (core logic, highest complexity)
6. **REQ-004**: Update `lib/installer.js` -- un-comment and adapt provider selection (UI code)
7. **REQ-004**: Update `install.sh` and `install.ps1` (parallel, UI code)

Rationale: Start with zero-risk config/doc changes, then tackle the core auto-detect logic, then the installer UI. This minimizes risk of breaking existing functionality while building incrementally.

---

## Risk Assessment

### Test Coverage Gaps

| File | Test File | Coverage | Risk |
|------|-----------|----------|------|
| `src/claude/hooks/lib/provider-utils.cjs` | None | 0% | HIGH -- 895 lines of provider logic with no tests |
| `src/claude/hooks/model-provider-router.cjs` | None | 0% | HIGH -- hook entry point with no tests |
| `src/claude/hooks/config/provider-defaults.yaml` | None | 0% | LOW -- config file, validated by YAML parser |
| `src/claude/commands/provider.md` | None | N/A | LOW -- markdown skill file |
| `lib/installer.js` | None | 0% | MEDIUM -- 1008 lines, user-facing install flow |
| `install.sh` | None | 0% | MEDIUM -- bash installer, user-facing |
| `install.ps1` | None | 0% | MEDIUM -- PowerShell installer, user-facing |
| `src/claude/CLAUDE.md.template` | None | N/A | LOW -- template, no logic |

**Coverage Gap Summary**: ALL 7 affected files have ZERO test coverage. The provider infrastructure (provider-utils.cjs, model-provider-router.cjs) is the most critical gap.

### Complexity Hotspots

| Area | Complexity | Concern |
|------|-----------|---------|
| `provider-utils.cjs` `selectProvider()` (lines 321-425) | High | 5-level priority chain, mode switching, phase routing |
| `provider-utils.cjs` `selectWithFallback()` (lines 502-542) | Medium | Async health checks, fallback chain iteration |
| `provider-utils.cjs` `parseYaml()` (lines 29-115) | Medium | Custom YAML parser, fragile for complex YAML |
| `lib/installer.js` commented-out provider selection (lines 170-198) | Medium | Code was disabled, may need adaptation |

### Technical Debt Markers

| Marker | Location | Impact |
|--------|----------|--------|
| Custom YAML parser | `provider-utils.cjs` lines 29-115 | Fragile -- does NOT handle anchors, aliases, multi-line strings. Could break on config edits |
| Commented-out code | `lib/installer.js` lines 170-198, 379-398 | Stale code that references old provider modes; needs careful review before un-commenting |
| Disabled command | `provider.md` line 4 | Currently disabled; re-enabling exposes all documented sub-commands |

### Risk Recommendations per Requirement

| REQ | Risk | Recommendation |
|-----|------|---------------|
| REQ-001 | LOW | Simple toggle. Verify /provider command renders correctly after enabling. |
| REQ-002 | LOW | Config change only. Validate YAML still parses correctly with `parseYaml()`. Ensure context_window values meet the 64k minimum for recommended models. |
| REQ-003 | LOW | Documentation only. Review for accuracy of env var names. |
| REQ-004 | MEDIUM | Installer changes are user-facing. The commented-out code in installer.js references modes that may not align with current requirements. Test all 3 installers (npm, bash, PowerShell). |
| REQ-005 | LOW | Documentation only. Ensure limitation warnings are visible and accurate. |
| REQ-006 | MEDIUM-HIGH | New runtime logic in provider-utils.cjs. Must not break existing Anthropic-only flow (NFR-002). The auto-detect function makes HTTP calls (health check to localhost:11434) which adds latency. Must handle timeouts gracefully (NFR-003). |

### Backward Compatibility Risk (NFR-002)

The highest overall risk: changes to `provider-utils.cjs` and `model-provider-router.cjs` affect ALL users, not just Ollama users. The existing flow where `hasProvidersConfig()` returns false (line 54 of router) causes early exit -- this is the safety valve for existing Anthropic users. The auto-detect logic must NOT change this behavior for users who have not opted into Ollama.

**Mitigation**: Auto-detect should only activate when explicitly enabled (via install-time provider selection) or when `ANTHROPIC_BASE_URL` is already set to localhost.

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: REQ-001 > REQ-002 > REQ-005 > REQ-003 > REQ-006 > REQ-004 (least-risk to most-risk, config before code)
2. **High-Risk Areas**: Add tests for `provider-utils.cjs` core functions (`selectProvider`, `checkProviderHealth`, `isLocalProvider`, `parseYaml`) BEFORE modifying. At minimum, add characterization tests to ensure existing behavior is preserved.
3. **Dependencies to Resolve**: None -- all affected files are independent. CON-001 (no new npm deps) is satisfied by using Node.js built-in `http` module for health checks (already used).
4. **Parallel Development Safety (CON-003)**: Verify ZERO file overlap with the Supervised Mode feature being developed on another machine. All affected files (`provider.md`, `provider-defaults.yaml`, `CLAUDE.md.template`, `installer.js`, `install.sh`, `install.ps1`, `provider-utils.cjs`) should be checked against the other branch.

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-14T10:40:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0007-ollama-local-llm-support/requirements-spec.md",
  "quick_scan_used": null,
  "scope_change_from_original": "refined",
  "requirements_keywords": ["ollama", "provider", "install", "detect", "VRAM", "context-window", "zero-config", "graceful-degradation", "local", "LLM", "auto-detect"],
  "files_directly_affected": 7,
  "modules_affected": 2,
  "risk_level": "medium",
  "blast_radius": "low",
  "coverage_gaps": 5
}
```

**`coverage_gaps` derivation**: 5 files from M1's affected list have 0% test coverage in code files: `provider-utils.cjs`, `model-provider-router.cjs`, `installer.js`, `install.sh`, `install.ps1`. The remaining 2 files (`provider.md`, `CLAUDE.md.template`) are markdown/config with no testable logic.
