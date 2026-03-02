# Component Specifications: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 04-design
**Created:** 2026-02-14

---

## 1. Component: autoDetectProvider()

### Signature

```typescript
// Type definition (for documentation; actual implementation is CJS)
interface AutoDetectResult {
    provider: 'anthropic' | 'ollama' | string;
    healthy: boolean;
    source: 'env_var' | 'config_file' | 'default_fallback';
    reason?: string;
}

function autoDetectProvider(config: ProvidersConfig): Promise<AutoDetectResult>;
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `config` | `object` | Yes | Loaded providers config from `loadProvidersConfig()` |

### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `string` | Detected provider name (`'anthropic'`, `'ollama'`) |
| `healthy` | `boolean` | Whether the provider is reachable |
| `source` | `string` | Detection tier that resolved: `'env_var'`, `'config_file'`, `'default_fallback'` |
| `reason` | `string?` | Explanation when `healthy` is `false` |

### Behavior Matrix

| ANTHROPIC_BASE_URL | ANTHROPIC_API_KEY | config.defaults.provider | Ollama Running | Result |
|-------------------|-------------------|------------------------|---------------|--------|
| `localhost:11434` | any | any | any | `{ provider: 'ollama', healthy: true, source: 'env_var' }` |
| not set | `sk-ant-...` | any | any | `{ provider: 'anthropic', healthy: true, source: 'env_var' }` |
| not set | not set | `'ollama'` | yes | `{ provider: 'ollama', healthy: true, source: 'config_file' }` |
| not set | not set | `'ollama'` | no | `{ provider: 'ollama', healthy: false, source: 'config_file', reason: '...' }` |
| not set | not set | `'anthropic'` | any | `{ provider: 'anthropic', healthy: true, source: 'config_file' }` |
| not set | not set | not set | any | `{ provider: 'anthropic', healthy: true, source: 'default_fallback' }` |

### Performance Characteristics

| Tier | I/O | Latency |
|------|-----|---------|
| 1: Env var check | None (process.env read) | < 1ms |
| 2: Config file check | None (already loaded) | < 1ms |
| 3: Health probe | HTTP GET to localhost:11434 | 5-100ms (success), up to 2000ms (timeout) |
| 4: Fallback | None | < 1ms |

---

## 2. Component: writeProviderConfig()

### Location

`lib/installer.js` (private function, not exported)

### Signature

```javascript
/**
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} provider - 'anthropic' or 'ollama'
 * @param {string} mode - 'quality' or 'local'
 */
async function writeProviderConfig(projectRoot, provider, mode)
```

### Behavior

1. Ensure `.isdlc/` directory exists
2. Locate `provider-defaults.yaml` in framework source
3. Read the defaults file content
4. Replace `defaults.provider` value with the selected provider
5. Replace `active_mode` value with the selected mode
6. Write the modified content to `.isdlc/providers.yaml`

### Error Handling

| Condition | Behavior |
|-----------|----------|
| Framework defaults file missing | Log warning, skip config creation |
| Write permission denied | Throw (installer catches and reports) |
| `.isdlc/` creation fails | Throw (installer catches and reports) |

---

## 3. Component: Provider Selection UI (installer.js)

### Interface

Uses existing `select()` from `lib/utils/prompts.js`.

### Menu Definition

```javascript
const choices = [
    {
        title: 'Claude Code (Anthropic API) - Recommended',
        value: 'claude-code',
        description: 'Requires Anthropic API key or Claude Code subscription'
    },
    {
        title: 'Ollama (local/free models)',
        value: 'ollama',
        description: 'Free local inference, requires Ollama installed'
    },
];
```

### Inputs and Outputs

| Input | Output |
|-------|--------|
| User selects option 1 | `providerMode = 'claude-code'` |
| User selects option 2 | `providerMode = 'ollama'` |
| User presses Ctrl+C | `process.exit(0)` (handled by prompts.js) |
| `--force` flag | `providerMode = 'claude-code'` (no prompt) |
| `--provider-mode ollama` flag | `providerMode = 'ollama'` (no prompt) |

---

## 4. Component: Provider Selection UI (install.sh)

### Interface

Native bash `read` prompt.

### Inputs and Outputs

| Input | Output |
|-------|--------|
| User types `1` or Enter | `PROVIDER_MODE="claude-code"` |
| User types `2` | `PROVIDER_MODE="ollama"` |
| Any other input | `PROVIDER_MODE="claude-code"` (default) |

---

## 5. Component: Provider Selection UI (install.ps1)

### Interface

PowerShell `Read-Host` prompt.

### Inputs and Outputs

| Input | Output |
|-------|--------|
| User types `1` or Enter | `$ProviderMode = "claude-code"` |
| User types `2` | `$ProviderMode = "ollama"` |
| Any other input | `$ProviderMode = "claude-code"` (default) |

---

## 6. Component: Next Steps Display

### Ollama Path Content

```
Next Steps:
  1. Install Ollama (if not already installed):
     https://ollama.ai
  2. Pull a recommended model:
     ollama pull qwen3-coder
  3. Start Ollama:
     ollama serve
  4. Launch Claude in your project:
     claude
```

### Anthropic Path Content

```
Next Steps:
  1. Set your Anthropic API key:
     export ANTHROPIC_API_KEY=sk-ant-...
  2. Launch Claude in your project:
     claude
```

### Common Footer

```
The framework auto-detects your provider configuration.
```

---

## 7. Component: provider-defaults.yaml Ollama Models

### Schema per Model Entry

```yaml
- id: "<ollama-model-tag>"     # Required: Ollama model identifier
  alias: "<short-name>"        # Required: Short alias for routing config
  context_window: <integer>    # Required: Max context tokens (>= 65536)
  capabilities:                # Required: List of capabilities
    - coding                   # All models must have 'coding'
    - tool_use                 # Recommended for iSDLC compatibility
    - reasoning                # Optional
  cost_tier: "free"            # Always "free" for Ollama models
  min_vram_gb: <integer>       # Required: Minimum GPU VRAM in GB
```

### Validation Constraints

| Field | Constraint |
|-------|-----------|
| `id` | Must be a valid Ollama model tag (alphanumeric, colons, hyphens, dots) |
| `alias` | Unique across all providers; lowercase alphanumeric with hyphens |
| `context_window` | Integer >= 65536 (64k minimum for iSDLC, per REQ-002) |
| `capabilities` | Array; must include `'coding'` |
| `cost_tier` | Must be `'free'` for Ollama |
| `min_vram_gb` | Positive integer |

---

## 8. Component: provider.md Frontmatter Toggle

### Before

```yaml
---
name: provider
description: Manage LLM provider configuration for iSDLC multi-provider support (currently disabled -- framework is Claude Code-specific)
user_invocable: false
---
```

### After

```yaml
---
name: provider
description: Manage LLM provider configuration for iSDLC multi-provider support
user_invocable: true
---
```

### Side Effects

When `user_invocable: true`, Claude Code will:
- List `/provider` in available commands
- Allow the user to invoke it
- Execute the instructions in the markdown body

No code changes are needed -- Claude Code reads the YAML frontmatter at startup.
