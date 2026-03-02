# Security Architecture: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## 1. Threat Model (STRIDE)

### 1.1 Trust Boundaries

```
+----------------------------------------------------+
| Developer's Machine (trusted)                       |
|                                                     |
|  +-------------------+    +---------------------+   |
|  | Claude Code CLI   |    | Ollama Server       |   |
|  | (user process)    |--->| localhost:11434      |   |
|  +-------------------+    +---------------------+   |
|         |                                           |
|         | stdin/stdout JSON                          |
|         v                                           |
|  +-------------------+                              |
|  | iSDLC Hooks       |                              |
|  | (provider-router) |                              |
|  +-------------------+                              |
|                                                     |
+----------------------------------------------------+
           |
           | HTTPS (encrypted)
           v
+----------------------------------------------------+
| Cloud (untrusted network)                           |
|  +-------------------+                              |
|  | Anthropic API     |                              |
|  | api.anthropic.com |                              |
|  +-------------------+                              |
+----------------------------------------------------+
```

### 1.2 STRIDE Analysis

| Threat | Category | Risk | Mitigation |
|--------|----------|------|------------|
| Ollama exposed on 0.0.0.0 instead of localhost | Spoofing/Info Disclosure | LOW | Ollama defaults to `127.0.0.1`. Document that users must NOT change `OLLAMA_HOST` to `0.0.0.0` unless behind a firewall. |
| Malicious model responses | Tampering | LOW | Models are pulled from Ollama registry, same trust model as npm packages. Users choose which models to install. |
| Provider detection probes leaking to network | Information Disclosure | VERY LOW | Health check goes to `localhost:11434` only. No external network calls for detection. |
| API key in providers.yaml | Information Disclosure | LOW | Ollama does not use real API keys (`api_key: "ollama"` is a dummy). Anthropic keys are stored in env vars, not config files. |
| providers.yaml committed to git | Information Disclosure | LOW | `.isdlc/` is already in `.gitignore`. No secrets stored in providers.yaml. |
| Denial of service via health check timeout | Denial of Service | VERY LOW | 2s timeout on health checks. Existing architecture handles this. |
| Code injection via YAML config | Elevation of Privilege | VERY LOW | Custom `parseYaml()` does not use `eval()` or `Function()`. Values are treated as strings/numbers/booleans only. |

### 1.3 Overall Security Assessment

**Risk Level: LOW**

This feature introduces minimal security surface because:
1. Ollama runs locally -- no new external network exposure
2. No real secrets are introduced (Ollama uses dummy auth tokens)
3. Health probes go to localhost only
4. The existing `.gitignore` already excludes `.isdlc/`
5. The existing hook protocol (stdin/stdout JSON) is unchanged

---

## 2. Authentication & Authorization

### 2.1 Ollama Authentication

Ollama does not require authentication by default. The framework uses:
- `ANTHROPIC_API_KEY: ""` (empty string)
- `ANTHROPIC_AUTH_TOKEN: "ollama"` (dummy token for Claude Code compatibility)

This is the existing pattern in `getEnvironmentOverrides()` (line 597 of `provider-utils.cjs`). No changes needed.

### 2.2 Anthropic API Authentication

Unchanged. Anthropic API key is read from the `ANTHROPIC_API_KEY` environment variable. The key is never written to `providers.yaml` or any other config file.

### 2.3 Authorization Model

Not applicable. The provider system does not have its own authorization model. Access to providers is controlled by:
- Environment variables (API keys)
- Config file presence (`.isdlc/providers.yaml`)
- Network reachability (health checks)

---

## 3. Data Protection

### 3.1 Data at Rest

| Data | Location | Protection |
|------|----------|------------|
| Provider config | `.isdlc/providers.yaml` | `.gitignore` excludes `.isdlc/` directory |
| Usage logs | `.isdlc/usage-log.jsonl` | `.gitignore` excludes `.isdlc/` directory |
| API keys | Environment variables only | Never written to files by the framework |

### 3.2 Data in Transit

| Path | Protocol | Encryption |
|------|----------|------------|
| Framework --> Ollama | HTTP | None (localhost only, acceptable) |
| Framework --> Anthropic | HTTPS | TLS 1.2+ (Node.js default) |

Localhost HTTP traffic is acceptable because:
- Traffic never leaves the machine
- Ollama binds to `127.0.0.1` by default
- No sensitive data is transmitted (prompts and responses, not credentials)

### 3.3 Data Privacy Consideration

When using Ollama, **all LLM processing stays local**. This is a privacy advantage:
- No code is sent to external APIs
- No prompts are logged by third parties
- Air-gapped/offline operation is possible

This should be documented as a benefit of the local provider option.

---

## 4. Secrets Management

### 4.1 Current State

The framework does not manage secrets directly. API keys are expected to be set as environment variables by the user. This is documented in `CLAUDE.md.template`.

### 4.2 New Considerations

No new secrets are introduced. The Ollama provider uses:
- `api_key: "ollama"` (not a real secret)
- `auth_token: "ollama"` (not a real secret)

These values are hardcoded in `provider-defaults.yaml` and `getEnvironmentOverrides()`. They are not secret and can be committed to the repository.

---

## 5. Input Validation

### 5.1 YAML Parsing

The custom `parseYaml()` function (lines 29-115 of `provider-utils.cjs`) is the primary input parser. It:
- Does NOT use `eval()` or `new Function()`
- Handles only basic YAML types (strings, numbers, booleans, arrays, objects)
- Returns `{}` on parse failure (caught by try/catch in `loadProvidersConfig()`)

**Risk:** Malformed YAML could cause unexpected behavior. **Mitigation:** Existing try/catch around `loadProvidersConfig()` falls back to `getMinimalDefaultConfig()`.

### 5.2 Health Check URL Validation

The health check URL is constructed from `provider.base_url` + `health_check.endpoint`:
```javascript
const url = new URL(healthCheck.endpoint, baseUrl);
```

`new URL()` throws on invalid URLs, caught by the existing try/catch in `checkProviderHealth()`. This prevents URL injection attacks.

### 5.3 Environment Variable Injection

`resolveEnvVars()` (line 553) replaces `${VAR}` placeholders with environment variable values. This is safe because:
- It only reads environment variables, does not execute them
- Output is used as HTTP URL or API key string
- No shell execution or eval

---

## 6. Compliance

### 6.1 Constitutional Compliance

| Article | Requirement | Compliance |
|---------|-------------|------------|
| Article III (Security by Design) | No secrets committed | Ollama uses dummy auth; API keys in env vars only |
| Article III | Safe path joining | All path operations use `path.join()` |
| Article III | JSON parsing with try/catch | Existing pattern in hooks; YAML parsing has try/catch |
| Article X (Fail-Safe Defaults) | Fail-open on errors | Router exits with `process.exit(0)` on any error |
| Article X | Missing config = default behavior | `getMinimalDefaultConfig()` returns Anthropic defaults |
| Article XIV (Backward-Compatible) | Preserve user artifacts | `.isdlc/providers.yaml` listed as preserved artifact |

### 6.2 Regulatory

Not applicable. This is a developer tool framework; no PII, financial data, or healthcare data is processed.

---

## 7. Security Recommendations

1. **Document Ollama binding**: Warn users not to expose Ollama on `0.0.0.0` (in CLAUDE.md template and provider-defaults.yaml comments)
2. **Health check scope**: Ensure auto-detect only probes `localhost` addresses, never external URLs
3. **Config file permissions**: `.isdlc/providers.yaml` should have `600` permissions on Unix (user-only read/write). The installer should set this.
4. **No silent cloud fallback**: When a user chooses "local only" mode, the framework must NOT silently fall back to a cloud provider. The existing `local` mode config has `allow_cloud: false` which enforces this.
