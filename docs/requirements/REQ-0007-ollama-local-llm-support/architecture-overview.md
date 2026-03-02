# Architecture Overview: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## 1. Architecture Approach

This feature **extends** the existing provider infrastructure, not redesigns it. The iSDLC framework already has a comprehensive multi-provider architecture:

| Component | Lines | Purpose | Status |
|-----------|-------|---------|--------|
| `provider-utils.cjs` | 895 | Provider selection, health checking, env management | Functional, disabled |
| `model-provider-router.cjs` | 159 | PreToolUse hook for routing sub-agent calls | Functional, disabled |
| `provider-defaults.yaml` | 525 | Default provider configuration | Exists, models outdated |
| `provider.md` | ~100 | User-facing /provider command | Exists, `user_invocable: false` |

The architecture decisions in this document focus on the **new behavior** needed: auto-detection, installer UX, and state persistence.

---

## 2. System Context (C4 Level 1)

```
                                    +-------------------+
                                    |    Developer       |
                                    | (iSDLC User)       |
                                    +--------+----------+
                                             |
                            Runs 'claude' in project directory
                                             |
                                    +--------v----------+
                                    |   Claude Code CLI  |
                                    |  (CLAUDE.md loaded) |
                                    +--------+----------+
                                             |
                                   PreToolUse hooks fire
                                             |
                         +-------------------v-------------------+
                         |         iSDLC Framework               |
                         |                                       |
                         |  +-------------------------------+    |
                         |  | model-provider-router.cjs     |    |
                         |  |  - Intercepts Task tool calls |    |
                         |  |  - Calls selectProvider()     |    |
                         |  |  - NEW: Calls autoDetect()    |    |
                         |  +------+---+--------------------+    |
                         |         |   |                         |
                         |    +----v-+ +---v--------+            |
                         |    | provider-utils.cjs  |            |
                         |    | (selection engine)  |            |
                         |    +---------+-----------+            |
                         +--------------|------------------------+
                                        |
               +------------------------+------------------------+
               |                                                 |
      +--------v---------+                            +----------v--------+
      | Anthropic API     |                            | Ollama (local)    |
      | api.anthropic.com |                            | localhost:11434   |
      +-------------------+                            +-------------------+
```

---

## 3. Key Architectural Decisions Summary

| Decision | Choice | ADR |
|----------|--------|-----|
| Auto-detection strategy | Tiered: env var > config file > health probe > default | ADR-0001 |
| Provider state storage | `.isdlc/providers.yaml` (existing pattern) | ADR-0002 |
| Installer provider recording | Write minimal `.isdlc/providers.yaml`, do not install anything | ADR-0003 |
| Backward compatibility strategy | Guard clause in router (`hasProvidersConfig()`) preserved | ADR-0004 |

---

## 4. Component Architecture

### 4.1 Provider Auto-Detection (REQ-006)

A new `autoDetectProvider()` function is added to `provider-utils.cjs`. It is called **only** when multi-provider config exists (i.e., the user opted into it during install). The function implements a tiered detection strategy:

**Priority chain (evaluated top to bottom, first match wins):**

1. **Environment variable check** (instant, no I/O)
   - If `ANTHROPIC_BASE_URL` contains `localhost:11434` --> Ollama
   - If `ANTHROPIC_BASE_URL` is set to any non-Anthropic URL --> custom provider
   - If `ANTHROPIC_API_KEY` is set and no custom base URL --> Anthropic

2. **Config file check** (fast file read, already cached by `loadProvidersConfig()`)
   - Read `.isdlc/providers.yaml` --> `defaults.provider` field
   - This is the install-time recorded preference

3. **Health probe** (async HTTP, up to 2s timeout)
   - If the config says Ollama but it might not be running: probe `http://localhost:11434/api/tags`
   - Only probed when Ollama is the configured or detected provider
   - Timeout: 2000ms (matches existing `health_check.timeout_ms` for Ollama)

4. **Fallback to Anthropic** (the current default behavior)

**Key constraint:** The auto-detect function must be deterministic for existing Anthropic-only users. When no `.isdlc/providers.yaml` exists, `hasProvidersConfig()` returns false and the router exits early (line 54 of `model-provider-router.cjs`). This guard clause is **not modified**.

### 4.2 Installer Provider Selection (REQ-004)

The installer gains a new step between Step 3 (Claude Code detection) and Step 4 (Copy framework files):

```
Step 3.5: Provider Selection
  [1] Claude Code (Anthropic API) -- Recommended
  [2] Ollama (local/free models)

  Selection recorded. No software installed.
```

On selection:
- **Anthropic:** Write minimal `.isdlc/providers.yaml` with `defaults.provider: anthropic`
- **Ollama:** Write `.isdlc/providers.yaml` with `defaults.provider: ollama` and `active_mode: local`
- **Both paths:** Copy `provider-defaults.yaml` as the base template

The installer **never** installs Ollama, downloads models, or modifies system configuration (CON-001, CON-002).

### 4.3 Configuration Schema (providers.yaml)

The existing `providers.yaml` format is preserved. The only change is updating the Ollama models section in `provider-defaults.yaml`:

**Models to add/update:**
- `qwen3-coder` (replace outdated qwen2.5-coder:14b, keep alias `qwen-coder`)
- `glm-4.7` (new, 128k context, strong coding)
- `gpt-oss:20b` (new, 64k context, budget option)
- `gpt-oss:120b` (new, 64k context, premium local option)

**Models to remove:**
- `deepseek-coder-v2:16b` (outdated)
- `codellama:34b` (low context window, 16k < 64k minimum)

### 4.4 CLAUDE.md Template Additions (REQ-003, REQ-005)

The `CLAUDE.md.template` gains a new section documenting:
- Ollama quick-start instructions
- Environment variables for manual configuration
- Recommended models with context windows
- Known limitations of local models

This is **documentation only** -- no code changes in the template.

---

## 5. Data Flow

### 5.1 Provider Selection at Runtime

```
claude command invoked
  |
  v
Claude Code loads CLAUDE.md (from template)
  |
  v
User invokes a tool (e.g., Task for sub-agent)
  |
  v
PreToolUse: model-provider-router.cjs fires
  |
  +-- tool_name !== 'Task'? --> exit(0), no interference
  |
  +-- hasProvidersConfig() === false? --> exit(0), default Anthropic behavior
  |
  v
loadProvidersConfig()  <-- reads .isdlc/providers.yaml or provider-defaults.yaml
  |
  v
selectProvider(config, state, context)
  |   1. CLI override (ISDLC_PROVIDER_OVERRIDE env)
  |   2. Agent-specific override
  |   3. Phase routing (hybrid mode)
  |   4. Mode defaults
  |   5. Global defaults
  |
  v
selectWithFallback(config, selection)
  |   - Health check primary provider
  |   - If unhealthy, try fallback chain
  |
  v
getEnvironmentOverrides(config, selection)
  |   - Sets ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY, etc.
  |
  v
Output JSON to stdout --> Claude Code applies env overrides
```

### 5.2 Installation Flow (New)

```
npx isdlc install
  |
  v
Step 1: Detect project type
Step 2: Check monorepo
Step 3: Check Claude Code
  |
  v
Step 3.5 (NEW): Provider Selection
  |   "Which LLM provider?"
  |   [1] Claude Code (Anthropic API)
  |   [2] Ollama (local/free)
  |
  +-- Anthropic: write providers.yaml {defaults.provider: "anthropic"}
  +-- Ollama: write providers.yaml {defaults.provider: "ollama", active_mode: "local"}
  |
  v
Step 4: Copy framework files (includes updated provider-defaults.yaml)
Step 5: Configure hooks
Step 6: Generate CLAUDE.md (from updated template)
Step 7: Complete
  |
  v
Display "Next Steps":
  - Ollama: "Install Ollama: https://ollama.ai -- then: ollama pull qwen3-coder"
  - Anthropic: "Set your API key: export ANTHROPIC_API_KEY=sk-..."
  - Both: "Launch 'claude' in your project directory"
```

---

## 6. Backward Compatibility Strategy (NFR-002)

The existing safety mechanism is the `hasProvidersConfig()` guard in `model-provider-router.cjs` (line 54):

```javascript
if (!hasProvidersConfig()) {
    debugLog('No providers.yaml found, using default Anthropic');
    process.exit(0);
    return;
}
```

This ensures that **existing users who never ran the new installer** (and therefore have no `.isdlc/providers.yaml`) are completely unaffected. The router exits immediately, and Claude Code uses its built-in Anthropic connection.

The auto-detection function is only invoked **inside** the `selectProvider()` chain, which is only reached when `hasProvidersConfig()` returns true. This is the architectural invariant that guarantees backward compatibility.

**Verification:** All existing tests must pass without modification (NFR-002 metric).

---

## 7. Graceful Degradation Strategy (NFR-003)

Error handling follows the existing pattern: **fail-open** (Article X of the constitution).

| Failure Mode | Behavior | User Experience |
|-------------|----------|-----------------|
| Ollama not running | Health check returns `{healthy: false}` | Falls back to Anthropic or shows clear error message |
| Model not pulled | Ollama returns 404 on model | Falls back to next model in config |
| providers.yaml malformed | `parseYaml()` returns `{}` | Uses `getMinimalDefaultConfig()` (Anthropic) |
| Health probe timeout | 2s timeout, resolves `{healthy: false}` | Falls to fallback chain |
| No provider available | All health checks fail | `outputBlockResponse()` with troubleshooting steps |

The router already handles all of these cases (see `selectWithFallback()` at line 502). The auto-detect function simply feeds into the existing selection pipeline.

---

## 8. Technology Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| HTTP health check | Node.js built-in `http` module | Already used in `provider-utils.cjs`; CON-001 (no new deps) |
| Config format | YAML (via existing `parseYaml()`) | Existing pattern; human-readable; already parsed |
| State persistence | `.isdlc/providers.yaml` file | Existing pattern; Article XIV (preserve user artifacts) |
| Module system | CJS (`.cjs`) for all hook code | Article XII compliance |
| Installer prompts | Existing `select()` from `lib/utils/prompts.js` | Existing infrastructure; no new deps |

---

## 9. Files Changed Summary

| File | Change Type | Lines Changed (est.) | Risk |
|------|------------|---------------------|------|
| `src/claude/commands/provider.md` | Toggle flag | ~2 | Trivial |
| `src/claude/hooks/config/provider-defaults.yaml` | Update models | ~25 | Low |
| `src/claude/CLAUDE.md.template` | Add Ollama docs | ~40 | Low |
| `lib/installer.js` | Un-comment + adapt provider selection | ~50 | Medium |
| `install.sh` | Add provider selection section | ~40 | Medium |
| `install.ps1` | Add provider selection section | ~40 | Medium |
| `src/claude/hooks/lib/provider-utils.cjs` | Add `autoDetectProvider()` | ~40 | Medium |

Total estimated: ~237 lines across 7 files. No new files created.

---

## 10. Requirement Traceability

| Requirement | Architectural Component | Decision |
|-------------|------------------------|----------|
| REQ-001 | provider.md frontmatter toggle | No architectural decision needed |
| REQ-002 | provider-defaults.yaml model list | Update within existing schema |
| REQ-003 | CLAUDE.md.template new section | Documentation, no code architecture |
| REQ-004 | installer.js provider selection step | ADR-0003 (installer recording) |
| REQ-005 | CLAUDE.md.template + YAML comments | Documentation, no code architecture |
| REQ-006 | provider-utils.cjs `autoDetectProvider()` | ADR-0001 (detection strategy) |
| NFR-001 | Combination of auto-detect + installer | ADR-0001 + ADR-0003 |
| NFR-002 | `hasProvidersConfig()` guard clause | ADR-0004 (backward compat) |
| NFR-003 | Existing fail-open pattern + health checks | Built into existing architecture |
