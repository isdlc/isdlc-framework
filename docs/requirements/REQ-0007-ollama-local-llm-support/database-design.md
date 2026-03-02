# Configuration Schema Design: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## 1. Overview

This project has no database. Configuration state is stored in YAML and JSON files. This document defines the schema for provider configuration, which is the "data model" for this feature.

---

## 2. Configuration Files

### 2.1 Provider Defaults (framework-shipped)

**Path:** `src/claude/hooks/config/provider-defaults.yaml`
**Owned by:** Framework (read-only for users)
**Written by:** Framework developers at release time
**Read by:** `provider-utils.cjs` via `loadProvidersConfig()`

This file ships with the framework and contains the full provider catalog. Users do not edit it directly. The Ollama section is updated for REQ-002.

### 2.2 User Provider Config (per-project)

**Path:** `.isdlc/providers.yaml`
**Owned by:** User (per-project)
**Written by:** Installer (REQ-004), `/provider` command, user manual edits
**Read by:** `provider-utils.cjs` via `loadProvidersConfig()` (takes priority over defaults)
**Preserved by:** Updater (Article XIV: backward-compatible installation)

This file records the user's provider preference and any customizations. It is created during installation when the user selects a provider.

---

## 3. Schema: providers.yaml (User Config)

### 3.1 Minimal Schema (Installer Output)

When the installer creates `.isdlc/providers.yaml`, it writes the **minimal** config needed to record the user's choice:

**Anthropic selection:**
```yaml
# iSDLC Provider Configuration
# Created by installer on 2026-02-14
# Edit this file or use /provider command to change settings

defaults:
  provider: "anthropic"
  model: "sonnet"

active_mode: "quality"
```

**Ollama selection:**
```yaml
# iSDLC Provider Configuration
# Created by installer on 2026-02-14
# Edit this file or use /provider command to change settings

defaults:
  provider: "ollama"
  model: "qwen-coder"

active_mode: "local"
```

### 3.2 Full Schema Reference

The complete schema is defined by `provider-defaults.yaml`. Key fields relevant to this feature:

```yaml
# Top-level structure
providers:          # Provider definitions (name -> config)
  ollama:
    enabled: true|false
    base_url: string        # Default: "http://localhost:11434"
    api_key: string         # Default: "ollama" (Ollama does not need a real key)
    auth_token: string      # Default: "ollama"
    models:                 # Array of model definitions
      - id: string          # Ollama model name (e.g., "qwen3-coder")
        alias: string       # Short name for routing (e.g., "qwen-coder")
        context_window: int # Token limit (minimum 64k recommended for iSDLC)
        capabilities: []    # ["coding", "tool_use", "reasoning", "vision"]
        cost_tier: string   # "free" for all Ollama models
        min_vram_gb: int    # GPU memory requirement
    health_check:
      endpoint: string      # Default: "/api/tags"
      timeout_ms: int       # Default: 2000

defaults:
  provider: string          # "anthropic" | "ollama" | other configured provider
  model: string             # Model alias from the provider's models list
  fallback_chain: []        # Ordered list of "provider:model" fallback pairs

active_mode: string         # "quality" | "local" | "budget" | "hybrid" | "free"

constraints:
  min_context_window: int            # Default: 16384
  recommended_context_window: int    # Default: 32768
  max_retries_per_provider: int      # Default: 2
  health_check_timeout_ms: int       # Default: 5000
```

---

## 4. Schema: provider-defaults.yaml Changes (REQ-002)

### 4.1 Updated Ollama Models Section

The Ollama `models` array is updated to reflect current recommended models:

**Before (current):**
```yaml
models:
  - id: "qwen3-coder"           # context: 32768  -- KEEP (update context)
  - id: "deepseek-coder-v2:16b" # context: 65536  -- REMOVE (outdated)
  - id: "codellama:34b"         # context: 16384  -- REMOVE (< 64k minimum)
  - id: "qwen2.5-coder:14b"    # context: 32768  -- REMOVE (superseded by qwen3)
```

**After (proposed):**
```yaml
models:
  - id: "qwen3-coder"
    alias: "qwen-coder"
    context_window: 65536       # Updated: qwen3 supports 64k
    capabilities: [coding, tool_use]
    cost_tier: "free"
    min_vram_gb: 24
  - id: "glm-4.7"
    alias: "glm"
    context_window: 128000
    capabilities: [coding, tool_use, reasoning]
    cost_tier: "free"
    min_vram_gb: 24
  - id: "gpt-oss:20b"
    alias: "gpt-oss-small"
    context_window: 65536
    capabilities: [coding, tool_use]
    cost_tier: "free"
    min_vram_gb: 16
  - id: "gpt-oss:120b"
    alias: "gpt-oss-large"
    context_window: 65536
    capabilities: [coding, tool_use, reasoning]
    cost_tier: "free"
    min_vram_gb: 48
```

### 4.2 Validation Rules

The custom `parseYaml()` function in `provider-utils.cjs` must correctly parse these entries. Validation:
- All model `id` values must be valid Ollama model identifiers (alphanumeric + `-` + `:` + `.`)
- `context_window` must be a positive integer >= `constraints.min_context_window` (16384)
- `min_vram_gb` must be a positive integer
- `capabilities` must be a subset of: `coding`, `tool_use`, `reasoning`, `vision`

---

## 5. Config Resolution Priority

When `loadProvidersConfig()` is called, it checks paths in this order:

```
1. .isdlc/providers.yaml     (project-specific, user-owned)
     |
     +-- Found? --> Parse and return
     |
     v
2. src/claude/hooks/config/provider-defaults.yaml  (framework defaults)
     |
     +-- Found? --> Parse and return
     |
     v
3. .claude/hooks/config/provider-defaults.yaml  (alternative location)
     |
     +-- Found? --> Parse and return
     |
     v
4. getMinimalDefaultConfig()  (hardcoded Anthropic-only fallback)
```

The user config (#1) **completely replaces** the framework defaults (#2) -- they are not merged. This is the existing behavior and will not change in this feature. If the user wants the full provider catalog, they copy `provider-defaults.yaml` to `.isdlc/providers.yaml` and edit it.

However, the **minimal** installer-generated config (#1) works because:
- The `defaults.provider` and `active_mode` fields are all the router needs to select a provider
- The full provider definitions (models, health checks, etc.) are read from the framework defaults (#2) when the user config does not include a `providers` section

**[NEEDS CLARIFICATION]**: The current `loadProvidersConfig()` implementation does NOT merge configs -- it returns the first one found. If the installer writes a minimal config to `.isdlc/providers.yaml` without the full `providers` section, the router will not have model definitions. Two options:

**Option A (recommended):** Installer copies the full `provider-defaults.yaml` to `.isdlc/providers.yaml` and modifies only `defaults.provider` and `active_mode`. This ensures all model definitions are available.

**Option B:** Modify `loadProvidersConfig()` to merge user config with framework defaults. This is more elegant but adds complexity to the YAML loader.

**Decision:** Option A. Copy full defaults, modify selection fields. Simpler, no code change to the config loader. Aligns with Article V (Simplicity First).

---

## 6. State Interaction

### 6.1 state.json

The `state.json` file tracks `last_provider_selection` (written by `trackUsage()` in `provider-utils.cjs`):

```json
{
  "last_provider_selection": {
    "provider": "ollama",
    "model": "qwen3-coder",
    "source": "mode_local",
    "timestamp": "2026-02-14T10:15:00Z"
  }
}
```

This is informational only and does not affect provider selection logic. No schema changes needed.

### 6.2 Usage Log

Provider usage is logged to `.isdlc/usage-log.jsonl` (one JSON entry per line). This is the existing pattern, no changes needed.

---

## 7. Migration Strategy

### 7.1 Existing Installations (No providers.yaml)

No migration needed. The `hasProvidersConfig()` guard ensures these installations are unaffected.

### 7.2 Existing Installations (With providers.yaml)

Users who already have `.isdlc/providers.yaml` from prior experimentation:
- Their config is preserved (Article XIV)
- They may have outdated Ollama model references
- The `/provider` command can be used to update models
- No automated migration of existing config files

### 7.3 Fresh Installations

The installer creates `.isdlc/providers.yaml` based on user's provider choice. The file is seeded from `provider-defaults.yaml` (with the updated Ollama models from REQ-002).
