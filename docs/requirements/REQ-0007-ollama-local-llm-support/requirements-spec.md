# Requirements Specification: Ollama / Local LLM Support

**ID:** REQ-0007
**Artifact Folder:** REQ-0007-ollama-local-llm-support
**Status:** Draft
**Created:** 2026-02-14
**Priority:** Must Have (Monday beta deadline)

---

## 1. Project Overview

### Problem Statement
Developers want to use free LLM models with iSDLC to avoid Anthropic API costs. Ollama provides local hosting of open models that are compatible with Claude Code via the Anthropic Messages API (Ollama v0.14+).

### Business Drivers
- **Cost reduction**: Anthropic API usage has a cost; Ollama-hosted models are free to run locally
- **Developer accessibility**: Lower the barrier to entry for developers who want to try iSDLC without API costs

### Success Criteria
All iSDLC workflows (feature, fix, test-run, test-generate, upgrade) run end-to-end with Ollama-hosted models via Claude Code integration.

### Scope
This is **enablement and UX**, not new plumbing. The existing provider infrastructure (provider-utils.cjs, model-provider-router.cjs, provider-defaults.yaml) already supports Ollama. This feature re-enables, updates, and documents that support.

---

## 2. Stakeholders & Personas

### Primary Persona: Developer
- **Role:** Software developer using iSDLC for project development
- **Goal:** Use iSDLC with free local models to avoid API costs
- **Technical proficiency:** Comfortable with CLI tools, can install Ollama
- **Pain point:** API costs are a barrier; wants a free alternative

---

## 3. Functional Requirements

### REQ-001: Re-enable /provider Skill
- **Description:** Set `user_invocable: true` in `src/claude/commands/provider.md` to re-enable the `/provider` command for users
- **Trigger:** User runs `/provider` in Claude Code
- **Expected behavior:** The provider management interface is accessible and functional
- **Files affected:** `src/claude/commands/provider.md`

### REQ-002: Update Provider Defaults with Current Ollama Models
- **Description:** Update `src/claude/hooks/config/provider-defaults.yaml` Ollama section with current recommended models (qwen3-coder, glm-4.7, gpt-oss:20b/120b) and ensure minimum 64k context window requirement is documented
- **Current state:** YAML already has Ollama config but with outdated model list (deepseek-coder-v2:16b, codellama:34b, qwen2.5-coder:14b)
- **Expected behavior:** Ollama provider definition reflects current best models for coding tasks with accurate context window sizes and VRAM requirements
- **Files affected:** `src/claude/hooks/config/provider-defaults.yaml`

### REQ-003: Update CLAUDE.md Template with Ollama Examples
- **Description:** Add Ollama quick-start instructions, provider context, and environment variable examples to `src/claude/CLAUDE.md.template`
- **Content to add:**
  - Quick-start: `ollama launch claude` or manual config
  - Env vars: `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_AUTH_TOKEN=ollama`, `ANTHROPIC_API_KEY=""`
  - Recommended models and minimum context window (64k)
- **Files affected:** `src/claude/CLAUDE.md.template`

### REQ-004: Installation Script Provider Selection
- **Description:** Update installation scripts to present a provider choice during install
- **Behavior:**
  a) Present provider choice:
     - [1] Claude Code (Anthropic API)
     - [2] Ollama (local/free models)
  b) Record user's selection (persist to providers.yaml or equivalent config)
  c) Do NOT install Ollama or models -- display instructions only
  d) At end of install output, show "Next Steps" section:
     - **Ollama path:** Instructions to install Ollama + recommended models (qwen3-coder, glm-4.7, gpt-oss)
     - **Anthropic path:** Instructions to set up Anthropic API key
  e) Final step for BOTH paths: "Launch `claude` in your project directory -- the framework auto-detects your provider"
- **Files affected:** `lib/installer.js`, `install.sh`, `install.ps1`
- **Constraint:** Scripts must not attempt to install Ollama or download models

### REQ-005: Document Ollama Limitations and Model Recommendations
- **Description:** Document known risks and recommended models in provider docs and CLAUDE.md template
- **Content to document:**
  - Open models may struggle with complex multi-agent workflows
  - Tool calling support varies by model
  - Large context requirements may exceed some models' windows
  - Structured output reliability varies
  - Recommended models: qwen3-coder, glm-4.7, gpt-oss:20b/120b (minimum 64k context)
- **Files affected:** `src/claude/CLAUDE.md.template`, provider-defaults.yaml comments

### REQ-006: Auto-detect Provider at Runtime
- **Description:** The framework auto-detects whether the user is running Ollama or Anthropic API based on environment and configuration, without requiring manual env var setup
- **Detection logic (priority order):**
  1. Check `ANTHROPIC_BASE_URL` env var for `localhost:11434` (Ollama indicator)
  2. Check `.isdlc/providers.yaml` for saved user preference from install
  3. Check if Ollama is running (`http://localhost:11434/api/tags` responds)
  4. Fall back to Anthropic API default
- **Expected behavior:** User launches `claude` and the framework handles provider selection transparently
- **Files affected:** `src/claude/hooks/lib/provider-utils.cjs` (enhance existing detection), potentially `model-provider-router.cjs`
- **Note:** provider-utils.cjs already recognizes 'ollama' as a local provider (line 281) -- this extends existing detection

---

## 4. Non-Functional Requirements

### NFR-001: Zero-Config UX
- **Category:** Usability
- **Requirement:** After initial install provider selection, users should not need to manually configure environment variables
- **Metric:** Zero manual env var steps in the Ollama happy path
- **Priority:** Must Have

### NFR-002: Backward Compatibility
- **Category:** Compatibility
- **Requirement:** Existing Anthropic API users must not be affected by Ollama enablement
- **Metric:** All existing tests pass without modification
- **Priority:** Must Have

### NFR-003: Graceful Degradation
- **Category:** Reliability
- **Requirement:** If Ollama is not running or a model is unavailable, the framework should fail gracefully with a clear error message, not crash
- **Metric:** No unhandled exceptions from provider detection
- **Priority:** Must Have

---

## 5. Constraints

### CON-001: No New Dependencies
Adding Ollama support must not introduce new npm dependencies. Use existing Node.js APIs (http module for health checks).

### CON-002: Monday Beta Deadline
Scope must stay tight. This is enablement of existing infrastructure, not new plumbing.

### CON-003: Parallel Development
This feature is being developed in PARALLEL with Supervised Mode on another machine. ZERO file overlap between the two features.

---

## 6. Assumptions

- ASM-001: Ollama v0.14+ natively implements the Anthropic Messages API
- ASM-002: Users will install Ollama separately (the framework does not install it)
- ASM-003: The existing provider-utils.cjs and model-provider-router.cjs infrastructure is functional and tested
- ASM-004: Claude Code connects to Ollama via 3 env vars: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY

---

## 7. Out of Scope

- New provider routing plumbing (already exists)
- Cloud variant (`:cloud`) configuration
- Model performance benchmarking
- Automated model capability testing
- Automated Ollama or model installation by the framework
- Support for providers other than Anthropic and Ollama in this iteration

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| Ollama | Open-source tool for running LLMs locally |
| Provider | An LLM service backend (Anthropic API, Ollama, etc.) |
| provider-defaults.yaml | Framework-shipped default provider configuration |
| providers.yaml | User-specific provider configuration (.isdlc/providers.yaml) |
| VRAM | Video RAM -- GPU memory required to run a model |
