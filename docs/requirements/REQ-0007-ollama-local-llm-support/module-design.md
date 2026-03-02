# Module Design: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Module Overview

This feature modifies 7 existing files across 2 modules. No new files are created. The changes decompose into 4 logical modules:

| Module | Files | Change Type | Complexity |
|--------|-------|-------------|------------|
| M1: Provider Auto-Detection | `provider-utils.cjs` | New function (~40 lines) | Medium |
| M2: Installer Provider Selection | `installer.js`, `install.sh`, `install.ps1` | Un-comment + adapt | Medium |
| M3: Provider Configuration | `provider-defaults.yaml`, `provider.md` | Config/flag toggle | Low |
| M4: Documentation | `CLAUDE.md.template` | New section | Low |

---

## 2. Module M1: Provider Auto-Detection

### 2.1 Responsibility

Detect the active LLM provider at runtime without requiring manual environment variable setup. Implements the tiered detection strategy from ADR-0001.

### 2.2 File: `src/claude/hooks/lib/provider-utils.cjs`

**Change**: Add new exported function `autoDetectProvider()`.
**Location**: Insert after `hasProvidersConfig()` (after line 248), before the `PROVIDER SELECTION` section (line 250).

### 2.3 Function Specification

```javascript
/**
 * Auto-detect the active LLM provider using a tiered strategy.
 * Called by selectProvider() when providers.yaml exists and no
 * explicit provider override is active.
 *
 * Detection priority (first match wins):
 *   1. Environment variable check (synchronous, zero I/O)
 *   2. Config file check (synchronous, already loaded)
 *   3. Health probe (async, up to 2000ms timeout)
 *   4. Fallback to 'anthropic'
 *
 * @param {object} config - Loaded providers config (from loadProvidersConfig())
 * @returns {Promise<{provider: string, healthy: boolean, source: string, reason?: string}>}
 */
async function autoDetectProvider(config)
```

### 2.4 Algorithm (Pseudocode)

```
function autoDetectProvider(config):
    // Tier 1: Environment variable check (synchronous)
    baseUrl = process.env.ANTHROPIC_BASE_URL
    if baseUrl AND baseUrl.includes('localhost:11434'):
        return { provider: 'ollama', healthy: true, source: 'env_var' }

    if process.env.ANTHROPIC_API_KEY AND NOT baseUrl:
        return { provider: 'anthropic', healthy: true, source: 'env_var' }

    // Tier 2: Config file check (synchronous -- config already loaded)
    configProvider = config.defaults?.provider
    if configProvider AND configProvider !== 'anthropic':
        // Tier 3: Health probe for non-Anthropic providers
        if configProvider === 'ollama':
            health = await checkProviderHealth(config, 'ollama')
            return {
                provider: 'ollama',
                healthy: health.healthy,
                source: 'config_file',
                reason: health.healthy ? null : health.reason
            }
        return { provider: configProvider, healthy: true, source: 'config_file' }

    if configProvider === 'anthropic':
        return { provider: 'anthropic', healthy: true, source: 'config_file' }

    // Tier 4: Fallback
    return { provider: 'anthropic', healthy: true, source: 'default_fallback' }
```

### 2.5 Integration Point

The `autoDetectProvider()` function is called from `selectProvider()` at priority level 5 (global defaults), replacing the static config read when the detected provider might differ from the configured default.

**Modification to `selectProvider()` (lines 418-424):**

Current code (global defaults section):
```javascript
// 5. Global defaults
return {
    provider: config.defaults?.provider || 'anthropic',
    model: config.defaults?.model || 'sonnet',
    source: 'global_default',
    fallback: config.defaults?.fallback_chain
};
```

The `selectProvider()` function itself does NOT change. The auto-detection is consumed upstream in `model-provider-router.cjs` when the initial `selectProvider()` returns a provider that may need health verification. The existing `selectWithFallback()` already handles this case -- if the selected provider is unhealthy, it tries the fallback chain.

**However**, when the config says `defaults.provider: "ollama"` but the user has `ANTHROPIC_API_KEY` set (indicating they switched), the auto-detect provides the correct resolution. This is handled by adding one call in the router.

**Modification to `model-provider-router.cjs` (after line 76, before selectWithFallback):**

```javascript
// Auto-detect provider if config indicates non-anthropic
// This resolves the case where env vars indicate a different
// provider than what the config file says
if (config.defaults?.provider === 'ollama' || config.active_mode === 'local') {
    const detected = await autoDetectProvider(config);
    if (detected.provider !== selection.provider && detected.source === 'env_var') {
        debugLog(`Auto-detect override: ${selection.provider} -> ${detected.provider} (${detected.source})`);
        selection = {
            ...selection,
            provider: detected.provider,
            model: getDefaultModel(config, detected.provider) || selection.model,
            source: `auto_detect_${detected.source}`
        };
    }
}
```

### 2.6 Exports

Add to `module.exports` (line 860-895):

```javascript
// Auto-detection
autoDetectProvider,
```

### 2.7 Error Handling

All errors in `autoDetectProvider()` are caught and result in fallback to Anthropic:

| Error Condition | Behavior | Source Value |
|----------------|----------|-------------|
| `checkProviderHealth()` throws | Return `{ provider: 'anthropic', healthy: true, source: 'default_fallback' }` | `default_fallback` |
| `config.defaults` is undefined | Return `{ provider: 'anthropic', healthy: true, source: 'default_fallback' }` | `default_fallback` |
| Health probe timeout (2000ms) | Return `{ provider: 'ollama', healthy: false, source: 'config_file', reason: 'Timeout...' }` | `config_file` |
| Network error on probe | Return `{ provider: 'ollama', healthy: false, source: 'config_file', reason: error.message }` | `config_file` |

The function wraps its body in try/catch. On any exception, it returns the Anthropic default. This follows the fail-open pattern (Article X).

### 2.8 Requirement Traceability

| Design Element | Requirement | ADR |
|---------------|-------------|-----|
| Tiered detection chain | REQ-006 | ADR-0001 |
| Env var check (tier 1) | REQ-006, NFR-001 | ADR-0001 |
| Config file check (tier 2) | REQ-006, NFR-001 | ADR-0001, ADR-0002 |
| Health probe (tier 3) | REQ-006, NFR-003 | ADR-0001 |
| Anthropic fallback (tier 4) | NFR-002, NFR-003 | ADR-0004 |
| Fail-open error handling | NFR-003 | ADR-0004 |
| 2000ms health probe timeout | NFR-003 | ADR-0001 |
| Guard clause preserved | NFR-002 | ADR-0004 |

---

## 3. Module M2: Installer Provider Selection

### 3.1 Responsibility

Present a 2-option provider choice during installation and record the selection to `.isdlc/providers.yaml`. Display provider-specific "Next Steps" at installation end.

### 3.2 File: `lib/installer.js`

**Change**: Un-comment lines 170-198, simplify from 6 options to 2, add providers.yaml creation and Next Steps display.

#### 3.2.1 Provider Selection Step

Replace lines 170-198 (the commented block + hardcoded line) with:

```javascript
// Step 3.5: Provider Selection
logger.newline();
logger.step('3.5/7', 'LLM Provider Selection');
logger.newline();

let providerMode;
if (options.providerMode) {
    providerMode = options.providerMode;
    logger.info(`Provider: ${providerMode} (from --provider-mode flag)`);
} else if (force) {
    providerMode = 'claude-code';
    logger.info('Provider: Claude Code / Anthropic API (default for --force)');
} else {
    providerMode = await select('Which LLM provider will you use?', [
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
    ]);
}
logger.newline();
```

**Key differences from the old 6-option menu:**
- 2 options instead of 6 (Article V: Simplicity First)
- `'claude-code'` and `'ollama'` are the only values
- Default selection index is 0 (Claude Code / Anthropic)
- `force` mode defaults to `'claude-code'` (backward compatible)

#### 3.2.2 Providers.yaml Creation

After provider selection, before Step 4 (file copy), add:

```javascript
// Record provider selection to .isdlc/providers.yaml
if (providerMode === 'ollama') {
    await writeProviderConfig(projectRoot, 'ollama', 'local');
} else {
    // claude-code uses default Anthropic, no providers.yaml needed
    // unless user explicitly wants multi-provider routing later
}
```

**New helper function** `writeProviderConfig()` (add to installer.js, not exported):

```javascript
/**
 * Write minimal provider configuration to .isdlc/providers.yaml
 * @param {string} projectRoot - Project root directory
 * @param {string} provider - Selected provider ('anthropic' or 'ollama')
 * @param {string} mode - Active mode ('quality' or 'local')
 */
async function writeProviderConfig(projectRoot, provider, mode) {
    const isdlcDir = path.join(projectRoot, '.isdlc');
    await ensureDir(isdlcDir);

    // Copy provider-defaults.yaml as the base
    const frameworkDir = getFrameworkDir();
    const defaultsPath = path.join(frameworkDir, 'claude', 'hooks', 'config', 'provider-defaults.yaml');
    const targetPath = path.join(isdlcDir, 'providers.yaml');

    if (await exists(defaultsPath)) {
        let content = await readFile(defaultsPath);
        // Update defaults.provider and active_mode
        content = content.replace(
            /^(defaults:[\s\S]*?provider:\s*)"?\w+"?/m,
            `$1"${provider}"`
        );
        if (content.includes('active_mode:')) {
            content = content.replace(
                /active_mode:\s*"?\w+"?/,
                `active_mode: "${mode}"`
            );
        } else {
            content += `\nactive_mode: "${mode}"\n`;
        }
        await writeFile(targetPath, content);
    }
}
```

#### 3.2.3 Next Steps Display

At the end of the install function, after the success message, add provider-specific guidance:

```javascript
// Display provider-specific Next Steps
logger.newline();
logger.header('Next Steps');

if (providerMode === 'ollama') {
    logger.info('1. Install Ollama (if not already installed):');
    logger.info('   https://ollama.ai');
    logger.newline();
    logger.info('2. Pull a recommended model:');
    logger.info('   ollama pull qwen3-coder');
    logger.newline();
    logger.info('3. Start Ollama:');
    logger.info('   ollama serve');
    logger.newline();
    logger.info('4. Launch Claude in your project:');
    logger.info('   claude');
} else {
    logger.info('1. Set your Anthropic API key:');
    logger.info('   export ANTHROPIC_API_KEY=sk-ant-...');
    logger.newline();
    logger.info('2. Launch Claude in your project:');
    logger.info('   claude');
}

logger.newline();
logger.info('The framework auto-detects your provider configuration.');
```

### 3.3 File: `install.sh`

**Change**: Replace commented-out lines 337-371 with simplified 2-option selection.

#### 3.3.1 Provider Selection Section

Replace the commented block with:

```bash
# ============================================================================
# Provider Selection
# ============================================================================
echo -e "${CYAN}+====================================================+${NC}"
echo -e "${CYAN}|           LLM PROVIDER SELECTION                    |${NC}"
echo -e "${CYAN}+====================================================+${NC}"
echo ""
echo -e "${YELLOW}Which LLM provider will you use?${NC}"
echo ""
echo "  [1] Claude Code (Anthropic API) - Recommended"
echo "  [2] Ollama (local/free models)"
echo ""
read -p "Selection [1]: " PROVIDER_CHOICE
PROVIDER_CHOICE=${PROVIDER_CHOICE:-1}

case "$PROVIDER_CHOICE" in
    2)
        PROVIDER_MODE="ollama"
        echo -e "${GREEN}  Provider: Ollama (local/free models)${NC}"
        ;;
    *)
        PROVIDER_MODE="claude-code"
        echo -e "${GREEN}  Provider: Claude Code (Anthropic API)${NC}"
        ;;
esac
echo ""
```

#### 3.3.2 Providers.yaml Creation (install.sh)

After the file copy steps, when `.isdlc/` directory exists:

```bash
# Record provider selection
if [ "$PROVIDER_MODE" = "ollama" ]; then
    if [ -f "$FRAMEWORK_DIR/claude/hooks/config/provider-defaults.yaml" ]; then
        cp "$FRAMEWORK_DIR/claude/hooks/config/provider-defaults.yaml" ".isdlc/providers.yaml"
        # Update defaults.provider to ollama and active_mode to local
        if command -v sed &> /dev/null; then
            sed -i.bak 's/provider: "anthropic"/provider: "ollama"/' ".isdlc/providers.yaml" 2>/dev/null || \
            sed -i '' 's/provider: "anthropic"/provider: "ollama"/' ".isdlc/providers.yaml"
            sed -i.bak 's/active_mode: "hybrid"/active_mode: "local"/' ".isdlc/providers.yaml" 2>/dev/null || \
            sed -i '' 's/active_mode: "hybrid"/active_mode: "local"/' ".isdlc/providers.yaml"
            rm -f ".isdlc/providers.yaml.bak" 2>/dev/null
        fi
        echo -e "${GREEN}  Provider config written to .isdlc/providers.yaml${NC}"
    fi
fi
```

**Note on sed portability**: GNU sed uses `-i.bak` while macOS BSD sed uses `-i ''`. The fallback pattern handles both.

#### 3.3.3 Next Steps Display (install.sh)

```bash
# Display Next Steps
echo ""
echo -e "${CYAN}+====================================================+${NC}"
echo -e "${CYAN}|                   NEXT STEPS                        |${NC}"
echo -e "${CYAN}+====================================================+${NC}"
echo ""

if [ "$PROVIDER_MODE" = "ollama" ]; then
    echo -e "${YELLOW}1. Install Ollama (if not already installed):${NC}"
    echo "   https://ollama.ai"
    echo ""
    echo -e "${YELLOW}2. Pull a recommended model:${NC}"
    echo "   ollama pull qwen3-coder"
    echo ""
    echo -e "${YELLOW}3. Start Ollama:${NC}"
    echo "   ollama serve"
    echo ""
    echo -e "${YELLOW}4. Launch Claude in your project:${NC}"
    echo "   claude"
else
    echo -e "${YELLOW}1. Set your Anthropic API key:${NC}"
    echo "   export ANTHROPIC_API_KEY=sk-ant-..."
    echo ""
    echo -e "${YELLOW}2. Launch Claude in your project:${NC}"
    echo "   claude"
fi

echo ""
echo -e "${GREEN}The framework auto-detects your provider configuration.${NC}"
```

### 3.4 File: `install.ps1`

**Change**: Add provider selection section using PowerShell native prompts. Same logic as install.sh.

#### 3.4.1 Provider Selection Section

```powershell
# ============================================================================
# Provider Selection
# ============================================================================
Write-Host ""
Write-Host "  LLM PROVIDER SELECTION" -ForegroundColor Cyan
Write-Host "  ======================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Which LLM provider will you use?" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [1] Claude Code (Anthropic API) - Recommended"
Write-Host "  [2] Ollama (local/free models)"
Write-Host ""

$ProviderChoice = Read-Host "  Selection [1]"
if ([string]::IsNullOrWhiteSpace($ProviderChoice)) { $ProviderChoice = "1" }

switch ($ProviderChoice) {
    "2" {
        $ProviderMode = "ollama"
        Write-Host "  Provider: Ollama (local/free models)" -ForegroundColor Green
    }
    default {
        $ProviderMode = "claude-code"
        Write-Host "  Provider: Claude Code (Anthropic API)" -ForegroundColor Green
    }
}
```

#### 3.4.2 Providers.yaml Creation (install.ps1)

```powershell
# Record provider selection
if ($ProviderMode -eq "ollama") {
    $DefaultsPath = Join-Path $FrameworkDir "claude\hooks\config\provider-defaults.yaml"
    $TargetPath = Join-Path $IsdlcDir "providers.yaml"
    if (Test-Path $DefaultsPath) {
        $content = Get-Content $DefaultsPath -Raw
        $content = $content -replace 'provider: "anthropic"', 'provider: "ollama"'
        $content = $content -replace 'active_mode: "hybrid"', 'active_mode: "local"'
        Set-Content -Path $TargetPath -Value $content -Encoding UTF8
        Write-Host "  Provider config written to .isdlc/providers.yaml" -ForegroundColor Green
    }
}
```

#### 3.4.3 Next Steps Display (install.ps1)

```powershell
# Display Next Steps
Write-Host ""
Write-Host "  NEXT STEPS" -ForegroundColor Cyan
Write-Host "  ==========" -ForegroundColor Cyan
Write-Host ""

if ($ProviderMode -eq "ollama") {
    Write-Host "  1. Install Ollama (if not already installed):" -ForegroundColor Yellow
    Write-Host "     https://ollama.ai"
    Write-Host ""
    Write-Host "  2. Pull a recommended model:" -ForegroundColor Yellow
    Write-Host "     ollama pull qwen3-coder"
    Write-Host ""
    Write-Host "  3. Start Ollama:" -ForegroundColor Yellow
    Write-Host "     ollama serve"
    Write-Host ""
    Write-Host "  4. Launch Claude in your project:" -ForegroundColor Yellow
    Write-Host "     claude"
} else {
    Write-Host "  1. Set your Anthropic API key:" -ForegroundColor Yellow
    Write-Host "     `$env:ANTHROPIC_API_KEY = 'sk-ant-...'"
    Write-Host ""
    Write-Host "  2. Launch Claude in your project:" -ForegroundColor Yellow
    Write-Host "     claude"
}

Write-Host ""
Write-Host "  The framework auto-detects your provider configuration." -ForegroundColor Green
```

### 3.5 Requirement Traceability (M2)

| Design Element | Requirement | AC |
|---------------|-------------|-----|
| 2-option menu (Anthropic/Ollama) | REQ-004 | AC-001-01 |
| providers.yaml creation on Ollama selection | REQ-004 | AC-001-02 |
| Ollama Next Steps (install Ollama, pull model, serve, launch claude) | REQ-004 | AC-001-03 |
| Anthropic Next Steps (set API key, launch claude) | REQ-004 | AC-001-04 |
| Installer never installs Ollama or downloads models | REQ-004, CON-001 | AC-001-05 |
| Default is Anthropic (option 1) | NFR-002 | -- |
| `--force` defaults to claude-code | NFR-002 | -- |

---

## 4. Module M3: Provider Configuration

### 4.1 File: `src/claude/commands/provider.md`

**Change**: Line 4, toggle `user_invocable: false` to `user_invocable: true`.

```yaml
# Before:
user_invocable: false

# After:
user_invocable: true
```

Also update the description on line 3 to remove the "(currently disabled)" note:

```yaml
# Before:
description: Manage LLM provider configuration for iSDLC multi-provider support (currently disabled -- framework is Claude Code-specific)

# After:
description: Manage LLM provider configuration for iSDLC multi-provider support
```

Remove the HTML comment block on lines 7-9 (the "NOTE: This command is disabled" comment).

### 4.2 File: `src/claude/hooks/config/provider-defaults.yaml`

**Change**: Update Ollama models section (lines 47-78). Replace outdated models, add new ones, ensure all meet the 64k context window minimum.

#### Models to Remove

| Model | Reason |
|-------|--------|
| `deepseek-coder-v2:16b` (line 56) | Outdated |
| `codellama:34b` (line 64) | Context window 16k < 64k minimum |
| `qwen2.5-coder:14b` (line 71) | Replaced by qwen3-coder |

#### Models to Add/Update

| Model ID | Alias | Context Window | VRAM | Capabilities |
|----------|-------|---------------|------|-------------|
| `qwen3-coder` | `qwen-coder` | 131072 | 24GB | coding, tool_use |
| `glm-4.7` | `glm` | 131072 | 24GB | coding, tool_use, reasoning |
| `gpt-oss:20b` | `gpt-oss-small` | 65536 | 16GB | coding, tool_use |
| `gpt-oss:120b` | `gpt-oss-large` | 65536 | 48GB | coding, tool_use, reasoning |

#### Resulting YAML (Ollama section)

```yaml
  ollama:
    enabled: true
    base_url: "http://localhost:11434"
    api_key: "ollama"
    auth_token: "ollama"
    # Minimum recommended context window: 64k tokens
    # Models below 64k are not recommended for iSDLC multi-agent workflows
    models:
      - id: "qwen3-coder"
        alias: "qwen-coder"
        context_window: 131072
        capabilities:
          - coding
          - tool_use
        cost_tier: "free"
        min_vram_gb: 24
      - id: "glm-4.7"
        alias: "glm"
        context_window: 131072
        capabilities:
          - coding
          - tool_use
          - reasoning
        cost_tier: "free"
        min_vram_gb: 24
      - id: "gpt-oss:20b"
        alias: "gpt-oss-small"
        context_window: 65536
        capabilities:
          - coding
          - tool_use
        cost_tier: "free"
        min_vram_gb: 16
      - id: "gpt-oss:120b"
        alias: "gpt-oss-large"
        context_window: 65536
        capabilities:
          - coding
          - tool_use
          - reasoning
        cost_tier: "free"
        min_vram_gb: 48
    health_check:
      endpoint: "/api/tags"
      timeout_ms: 2000
```

### 4.3 Requirement Traceability (M3)

| Design Element | Requirement | AC |
|---------------|-------------|-----|
| `user_invocable: true` toggle | REQ-001 | AC-003-01 |
| Updated Ollama models with context windows | REQ-002 | AC-004-01 |
| 64k minimum context window comment | REQ-005 | AC-004-01 |
| VRAM requirements documented | REQ-002 | AC-004-01 |

---

## 5. Module M4: Documentation (CLAUDE.md.template)

### 5.1 File: `src/claude/CLAUDE.md.template`

**Change**: Add new section after the "Agent Framework Context" section (approximately after line 50).

#### New Section Content

```markdown
## LLM Provider Configuration

The framework supports multiple LLM providers. Your provider was configured during installation.

### Active Provider

The framework auto-detects your provider based on:
1. Environment variables (`ANTHROPIC_BASE_URL`)
2. Project configuration (`.isdlc/providers.yaml`)
3. Health probe (localhost:11434 for Ollama)
4. Default: Anthropic API

### Ollama Quick Start

If using Ollama for local inference:

```bash
# Start Ollama server
ollama serve

# Pull a recommended model (choose based on your VRAM)
ollama pull qwen3-coder       # 24GB VRAM - Best for iSDLC
ollama pull glm-4.7            # 24GB VRAM - Strong reasoning
ollama pull gpt-oss:20b        # 16GB VRAM - Budget option

# Launch Claude Code (auto-detects Ollama)
claude
```

### Manual Environment Variables

For advanced users or custom setups:

```bash
# Ollama
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""

# Anthropic API (default)
export ANTHROPIC_API_KEY=sk-ant-...
```

### Recommended Models (Minimum 64k Context)

| Model | VRAM | Context | Best For |
|-------|------|---------|----------|
| qwen3-coder | 24GB | 128k | General coding, tool use |
| glm-4.7 | 24GB | 128k | Reasoning + coding |
| gpt-oss:20b | 16GB | 64k | Budget local inference |
| gpt-oss:120b | 48GB | 64k | Premium local inference |

### Known Limitations of Local Models

- **Complex multi-agent workflows**: Open models may struggle with iSDLC's multi-phase orchestration. Quality may vary for architecture, design, and code review phases.
- **Tool calling**: Support for structured tool calls varies by model. Some models may fail to produce valid JSON tool responses.
- **Large context requirements**: iSDLC agents exchange large prompts. Models with less than 64k context may truncate important context.
- **Structured output reliability**: JSON schema adherence varies. Gate validation and state management may encounter parsing errors.

Use `/provider status` to check your provider health and `/provider set <mode>` to adjust routing.
```

### 5.2 Requirement Traceability (M4)

| Design Element | Requirement | AC |
|---------------|-------------|-----|
| Ollama quick-start instructions | REQ-003 | AC-004-02 |
| Environment variable documentation | REQ-003 | AC-004-02 |
| Recommended models table | REQ-003, REQ-005 | AC-004-02 |
| Known limitations section | REQ-005 | AC-004-03 |
| Minimum 64k context documented | REQ-005 | AC-004-02 |

---

## 6. Cross-Module Dependencies

```
M3 (Config) ──── provides ──── M1 (Auto-Detection)
     |                              |
     |                         reads providers.yaml
     |                              |
M2 (Installer) ── creates ──> .isdlc/providers.yaml
     |                              |
     |                         M1 detects at runtime
     |
M4 (Docs) ──── documents ──── all modules
```

- M2 creates `.isdlc/providers.yaml` during install
- M1 reads `.isdlc/providers.yaml` at runtime
- M3 provides the default template that M2 copies
- M4 documents the user-facing behavior

**Implementation order** (from impact analysis):
1. M3 (config/flag toggle) -- zero risk
2. M4 (documentation) -- zero risk
3. M1 (auto-detect function) -- core logic, medium risk
4. M2 (installer UI) -- user-facing, medium risk

---

## 7. Backward Compatibility Invariant

The `hasProvidersConfig()` guard clause in `model-provider-router.cjs` (line 54) is NOT modified. This is the architectural invariant from ADR-0004.

**Existing Anthropic users** (no `.isdlc/providers.yaml`):
- Router exits at line 54 before reaching any provider selection logic
- `autoDetectProvider()` is never called
- Zero behavioral change

**New Ollama users** (`.isdlc/providers.yaml` exists with `provider: "ollama"`):
- Router proceeds past line 54
- `selectProvider()` returns Ollama based on config
- `autoDetectProvider()` may be called to verify Ollama is running
- `selectWithFallback()` handles health check failure

This guard is verified by tests for AC-002-02 (no regression for Anthropic users).
