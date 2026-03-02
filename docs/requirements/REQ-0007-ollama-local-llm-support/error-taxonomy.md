# Error Taxonomy: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 04-design
**Created:** 2026-02-14

---

## 1. Error Handling Philosophy

All errors follow the **fail-open** pattern mandated by Article X of the constitution and ADR-0004. When an error occurs in the provider detection or routing pipeline, the operation is allowed to proceed with default behavior (Anthropic).

**Key principle**: A provider detection error must never block the user from using Claude Code.

---

## 2. Error Codes

### 2.1 Auto-Detection Errors (provider-utils.cjs)

| Code | Severity | Condition | Message | Recovery |
|------|----------|-----------|---------|----------|
| `PROV-DET-001` | Warning | Ollama health probe timeout (2000ms) | `Ollama health check timed out after 2000ms` | Fall back to Anthropic via selectWithFallback() |
| `PROV-DET-002` | Warning | Ollama health probe connection refused | `Cannot connect to Ollama at localhost:11434 -- is Ollama running?` | Fall back to Anthropic via selectWithFallback() |
| `PROV-DET-003` | Warning | Ollama health probe HTTP error | `Ollama returned HTTP {statusCode}` | Fall back to Anthropic via selectWithFallback() |
| `PROV-DET-004` | Info | Config says Ollama but env vars say Anthropic | `Auto-detect override: ollama -> anthropic (env_var)` | Use Anthropic as detected |
| `PROV-DET-005` | Warning | autoDetectProvider() threw exception | `[provider-utils] Auto-detect error: {message}` | Return default Anthropic fallback |

### 2.2 Provider Router Errors (model-provider-router.cjs)

These errors already exist in the router. They are documented here for completeness.

| Code | Severity | Condition | Message | Recovery |
|------|----------|-----------|---------|----------|
| `PROV-RTR-001` | Error | All providers unavailable | `LLM Provider Unavailable\n{details}\nTroubleshooting:\n...` | outputBlockResponse() with troubleshooting |
| `PROV-RTR-002` | Warning | Primary provider failed, using fallback | `Provider Fallback Active\n  Primary ({name}) unavailable: {reason}\n  Using fallback: {name}:{model}` | Use fallback provider |
| `PROV-RTR-003` | Warning | Local provider used for complex phase | Warning from selectProvider() | Log warning, continue |
| `PROV-RTR-004` | Error | Router main() threw exception | `[provider-router] Error: {message}` | process.exit(0) -- fail open |

### 2.3 Configuration Errors

| Code | Severity | Condition | Message | Recovery |
|------|----------|-----------|---------|----------|
| `PROV-CFG-001` | Warning | providers.yaml parse failure | `[provider-utils] Failed to load config: {message}` | Use getMinimalDefaultConfig() (Anthropic) |
| `PROV-CFG-002` | Warning | providers.yaml file not found | (silent -- hasProvidersConfig() returns false) | Router exits at guard clause, default behavior |
| `PROV-CFG-003` | Warning | provider-defaults.yaml missing during install | `Framework defaults file not found at {path}` | Skip providers.yaml creation |

### 2.4 Installer Errors

| Code | Severity | Condition | Message | Recovery |
|------|----------|-----------|---------|----------|
| `INST-PROV-001` | Warning | Cannot copy provider-defaults.yaml to providers.yaml | `Failed to write provider config: {message}` | Continue install without providers.yaml |
| `INST-PROV-002` | Warning | sed replacement fails in install.sh | (silent -- sed errors piped to /dev/null) | providers.yaml has defaults from template |
| `INST-PROV-003` | Info | User selected invalid option (not 1 or 2) | `Invalid choice -- defaulting to Claude Code` | Default to claude-code |

---

## 3. Error Response Format

### 3.1 Hook stderr Output (Debugging)

Provider-related errors are written to stderr (not stdout) to avoid corrupting the JSON protocol:

```
[provider-utils] Auto-detect error: Cannot connect to Ollama at localhost:11434
[provider-router] Provider Fallback Active
  Primary (ollama) unavailable: Connection refused
  Using fallback: anthropic:sonnet
```

Debug logging (when `ISDLC_PROVIDER_DEBUG=true`) adds detailed traces:

```
[provider-utils] autoDetectProvider: tier 1 (env vars) -- no match
[provider-utils] autoDetectProvider: tier 2 (config file) -- ollama
[provider-utils] autoDetectProvider: tier 3 (health probe) -- timeout after 2000ms
[provider-utils] autoDetectProvider: returning { provider: 'ollama', healthy: false }
```

### 3.2 Hook stdout Output (Block Response)

When ALL providers are unavailable, the router outputs a block response via `outputBlockResponse()`:

```json
{
    "decision": "block",
    "reason": "LLM Provider Unavailable\n\nAll providers unavailable. Primary (ollama): Connection refused\n\nTroubleshooting:\n  - Check your internet connection\n  - Verify API keys are set (ANTHROPIC_API_KEY, etc.)\n  - If using Ollama, ensure it's running: ollama serve\n  - Run /provider status to check all providers\n"
}
```

### 3.3 Installer Output

Installer errors use the existing `logger` utility:

```
[WARNING] Failed to write provider config: EACCES: permission denied
[INFO] Continuing installation without provider configuration.
       You can configure providers later with: /provider init
```

---

## 4. Failure Mode Decision Tree

```
autoDetectProvider() called
  |
  +-- Tier 1: Check ANTHROPIC_BASE_URL
  |     +-- Contains localhost:11434 --> return ollama/healthy
  |     +-- Check ANTHROPIC_API_KEY (no custom base URL) --> return anthropic/healthy
  |     +-- Neither set --> continue to tier 2
  |
  +-- Tier 2: Check config.defaults.provider
  |     +-- 'ollama' --> continue to tier 3 (verify health)
  |     +-- 'anthropic' --> return anthropic/healthy
  |     +-- undefined --> continue to tier 4
  |
  +-- Tier 3: Health probe for Ollama
  |     +-- HTTP 200 --> return ollama/healthy
  |     +-- Timeout --> return ollama/unhealthy (PROV-DET-001)
  |     +-- Connection refused --> return ollama/unhealthy (PROV-DET-002)
  |     +-- HTTP error --> return ollama/unhealthy (PROV-DET-003)
  |     +-- Exception --> return anthropic/fallback (PROV-DET-005)
  |
  +-- Tier 4: Fallback
        +-- return anthropic/healthy
```

When `autoDetectProvider()` returns `healthy: false`:
```
selectWithFallback() handles it:
  +-- Try fallback chain from config
  |     +-- anthropic healthy? --> use anthropic (PROV-RTR-002)
  |     +-- all fallbacks fail --> block response (PROV-RTR-001)
  |
  +-- No fallback chain --> block response (PROV-RTR-001)
```

---

## 5. Troubleshooting Messages

### User-Facing (from block response)

| Scenario | Message |
|----------|---------|
| Ollama not running | `If using Ollama, ensure it's running: ollama serve` |
| No API key | `Verify API keys are set (ANTHROPIC_API_KEY, etc.)` |
| Network issue | `Check your internet connection` |
| General | `Run /provider status to check all providers` |

### Developer-Facing (from debug log)

| Scenario | Debug Output |
|----------|-------------|
| Successful Ollama detection | `Auto-detect: ollama via env_var` |
| Ollama configured but not running | `Primary provider ollama unhealthy: Connection refused` |
| Fallback to Anthropic | `Falling back to anthropic:sonnet` |
| Config parse failure | `Failed to load config: unexpected token at line X` |

---

## 6. Requirement Traceability

| Error Handling Design | Requirement | Notes |
|----------------------|-------------|-------|
| Fail-open on all auto-detect errors | NFR-003 | No unhandled exceptions |
| Clear error message when no provider available | NFR-003, AC-002-03 | Block response with troubleshooting |
| Anthropic users unaffected | NFR-002, AC-002-02 | Guard clause prevents auto-detect code path |
| Health probe timeout at 2000ms | NFR-003 | From ADR-0001, matches existing timeout_ms |
| All errors logged to stderr | Article X, XIII | Hooks must not corrupt stdout JSON |
