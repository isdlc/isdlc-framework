# ADR-0001: Provider Auto-Detection Strategy

## Status
Accepted

## Context
REQ-006 requires the framework to auto-detect whether the user is running Ollama or Anthropic API at runtime, without requiring manual environment variable setup (NFR-001: zero-config UX).

The existing `selectProvider()` function in `provider-utils.cjs` already handles provider selection via a 5-level priority chain (CLI override > agent override > phase routing > mode defaults > global defaults). However, it assumes the provider is already configured. We need a mechanism that works when the user has chosen a provider during install but has not set environment variables manually.

Three approaches were evaluated:

1. **Env var check only**: Check `ANTHROPIC_BASE_URL` for `localhost:11434`
2. **Health probe first**: Probe `http://localhost:11434/api/tags` on every invocation
3. **Tiered detection**: Env var > config file > health probe > default

## Decision
Use **tiered detection** (option 3). Implement `autoDetectProvider()` as a new exported function in `provider-utils.cjs` with this priority chain:

1. **Env var check** (synchronous, zero cost): If `ANTHROPIC_BASE_URL` contains `localhost:11434`, return `ollama`. If `ANTHROPIC_API_KEY` is set and no custom base URL, return `anthropic`.
2. **Config file check** (synchronous, negligible cost): Read `defaults.provider` from `.isdlc/providers.yaml` (already loaded by `loadProvidersConfig()`).
3. **Health probe** (async, up to 2s): If config says `ollama`, probe `http://localhost:11434/api/tags` to verify it is running. If not running, return `{detected: 'ollama', healthy: false}` so the caller can decide to fallback or error.
4. **Default**: Return `anthropic` (the existing default).

The function is called from `selectProvider()` only when `defaults.provider` is `ollama` (or when a health-check-on-start mode is active). It is NOT called for existing Anthropic-only users because the `hasProvidersConfig()` guard in the router prevents reaching this code path.

## Consequences

**Positive:**
- Zero-config UX: Users who selected Ollama during install do not need to set env vars
- Fast path: Most detections resolve at tier 1 or 2 (synchronous, no network I/O)
- Health probe only fires when Ollama is the configured provider (avoids unnecessary localhost probes)
- Existing Anthropic users are unaffected (guard clause)

**Negative:**
- Health probe adds up to 2s latency on first invocation when Ollama is configured but not running
- The tiered approach is more complex than a simple env var check (but captures the zero-config requirement)

**Risks:**
- If the health probe timeout is too aggressive (< 1s), slow Ollama starts may be incorrectly detected as "not running"
- Mitigation: Use 2000ms timeout (matches existing `health_check.timeout_ms` for Ollama in provider-defaults.yaml)

## Alternatives Considered

### Option 1: Env var check only
- Pro: Simplest, zero latency
- Con: Requires users to set `ANTHROPIC_BASE_URL` manually, violating NFR-001 (zero-config)
- Rejected because: The whole point of auto-detect is to eliminate manual env var setup

### Option 2: Health probe first
- Pro: Always accurate (if Ollama is running, it responds)
- Con: 2s timeout on every hook invocation when Ollama is not running; no way to skip the probe for Anthropic users
- Rejected because: Performance impact on every tool invocation is unacceptable

## Traces
- REQ-006: Auto-detect provider at runtime
- NFR-001: Zero-config UX
- NFR-003: Graceful degradation (health probe timeout handling)
