# ADR-0003: Installer Provider Recording Strategy

## Status
Accepted

## Context
REQ-004 requires the installer to present a provider choice (Anthropic vs Ollama) and record the selection. The key constraint is CON-001: the installer must NOT install Ollama, download models, or modify system configuration. It records a preference and displays next-step instructions.

The installer (`lib/installer.js`) already has commented-out code for provider selection (lines 170-198) that offered 6 modes (claude-code, quality, free, budget, local, hybrid). This code was disabled when the framework became Claude Code-specific. We need a simpler version.

Two approaches were evaluated:

1. **Un-comment and adapt existing code**: Modify the 6-option menu to a 2-option menu
2. **Write new provider selection step**: Ignore the commented code, write a clean new step

## Decision
Use **option 1: un-comment and simplify**.

The existing commented-out code already uses the correct prompt infrastructure (`select()` from `lib/utils/prompts.js`). Simplify it from 6 options to 2:

```
[1] Claude Code (Anthropic API) -- Recommended
[2] Ollama (local/free models)
```

On selection:
1. Copy `provider-defaults.yaml` to `.isdlc/providers.yaml`
2. Modify `defaults.provider` and `active_mode` in the copied file
3. Display provider-specific "Next Steps" at the end of installation

The `const providerMode = 'claude-code';` hardcoded line (line 198) is replaced with the simplified selection logic.

### Installer Output: Next Steps

**If Anthropic selected:**
```
Next Steps:
  1. Set your API key:
     export ANTHROPIC_API_KEY=sk-ant-...
  2. Launch Claude in your project:
     claude
```

**If Ollama selected:**
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

### Shell Installers (install.sh, install.ps1)

The same 2-option provider selection is added to the shell installers. These scripts do not have access to the Node.js prompt library, so they use native shell prompts:

**install.sh:**
```bash
echo "Which LLM provider will you use?"
echo "  [1] Claude Code (Anthropic API) - Recommended"
echo "  [2] Ollama (local/free models)"
read -p "Selection [1]: " provider_choice
```

**install.ps1:**
```powershell
Write-Host "Which LLM provider will you use?"
Write-Host "  [1] Claude Code (Anthropic API) - Recommended"
Write-Host "  [2] Ollama (local/free models)"
$choice = Read-Host "Selection [1]"
```

## Consequences

**Positive:**
- Reuses existing prompt infrastructure (no new code for selection UI)
- Simple 2-option menu is clear and unambiguous
- "Next Steps" provide actionable guidance without installing anything
- Default is Anthropic (pressing Enter without input selects option 1)
- Full `providers.yaml` is available for advanced users to customize later

**Negative:**
- The 2-option menu is less flexible than the original 6-option design
- Users who want hybrid/budget/free modes must use `/provider set <mode>` after install
- Mitigation: This is intentional simplification for MVP. More options can be added later.

## Alternatives Considered

### Option 2: Write new provider selection step
- Pro: Clean code, no legacy concerns
- Con: Duplicates infrastructure that already exists in the commented code
- Rejected because: Violates Article V (Simplicity First) -- the existing code needs minor adaptation, not replacement

## Traces
- REQ-004: Installation script provider selection
- CON-001: No new dependencies
- CON-002: Monday beta deadline (simplicity)
- AC-001-01 through AC-001-05: Installer acceptance criteria
