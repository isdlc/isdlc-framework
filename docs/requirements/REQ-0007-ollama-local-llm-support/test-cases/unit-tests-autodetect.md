# Test Cases: autoDetectProvider() Unit Tests

**Module:** M1 - Provider Auto-Detection
**File:** `src/claude/hooks/tests/provider-utils-autodetect.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/provider-utils-autodetect.test.cjs`
**Traces:** REQ-006, NFR-001, NFR-002, NFR-003, ADR-0001, ADR-0004

---

## Test Setup

```
Environment variable isolation:
  - Save process.env snapshot in before()
  - Restore in after()
  - Delete ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY between tests

Mock HTTP server:
  - Create http.createServer() on random port in before()
  - Close server in after()
  - Configure responses per test (200, timeout, connection refused)
```

---

## TC-M1-01: Tier 1 -- Env var ANTHROPIC_BASE_URL with localhost:11434

**Traces:** REQ-006, AC-002-01, VR-002, ADR-0001
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `process.env.ANTHROPIC_BASE_URL = 'http://localhost:11434'` |
| **When** | `autoDetectProvider(config)` is called with any config |
| **Then** | Returns `{ provider: 'ollama', healthy: true, source: 'env_var' }` |
| **Verify** | `provider === 'ollama'`, `healthy === true`, `source === 'env_var'` |

---

## TC-M1-02: Tier 1 -- Env var ANTHROPIC_API_KEY set (no custom base URL)

**Traces:** REQ-006, AC-002-02, ADR-0001
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `process.env.ANTHROPIC_API_KEY = 'sk-ant-test123'`, no `ANTHROPIC_BASE_URL` |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'anthropic', healthy: true, source: 'env_var' }` |

---

## TC-M1-03: Tier 1 -- Both env vars set (base URL overrides)

**Traces:** REQ-006, VR-002
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `ANTHROPIC_BASE_URL = 'http://localhost:11434'` AND `ANTHROPIC_API_KEY = 'sk-ant-...'` |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'ollama', healthy: true, source: 'env_var' }` |
| **Rationale** | Base URL check (tier 1a) runs before API key check (tier 1b) |

---

## TC-M1-04: Tier 2 -- Config says 'ollama', Ollama is healthy

**Traces:** REQ-006, AC-002-01, NFR-001, VR-003
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | No env vars set, `config.defaults.provider = 'ollama'`, mock server returns 200 |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'ollama', healthy: true, source: 'config_file' }` |

---

## TC-M1-05: Tier 2 -- Config says 'ollama', Ollama is not running

**Traces:** REQ-006, AC-002-03, NFR-003, PROV-DET-002
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | No env vars, `config.defaults.provider = 'ollama'`, mock server not running (connection refused) |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'ollama', healthy: false, source: 'config_file', reason: '...' }` |
| **Verify** | `healthy === false`, `reason` contains descriptive message |

---

## TC-M1-06: Tier 2 -- Config says 'anthropic'

**Traces:** REQ-006, NFR-002, AC-002-02
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | No env vars, `config.defaults.provider = 'anthropic'` |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'anthropic', healthy: true, source: 'config_file' }` |
| **Verify** | No health probe is attempted |

---

## TC-M1-07: Tier 4 -- No env vars, no config provider set

**Traces:** REQ-006, NFR-002, ADR-0004
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | No env vars, `config.defaults.provider` is `undefined` |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'anthropic', healthy: true, source: 'default_fallback' }` |

---

## TC-M1-08: Tier 4 -- Empty config object

**Traces:** VR-001, NFR-003
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | No env vars, config is `{}` |
| **When** | `autoDetectProvider({})` is called |
| **Then** | Returns `{ provider: 'anthropic', healthy: true, source: 'default_fallback' }` |

---

## TC-M1-09: Health probe timeout (2000ms)

**Traces:** NFR-003, PROV-DET-001, VR-003
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | Config says 'ollama', mock server delays response beyond 2000ms |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns within ~2100ms with `{ provider: 'ollama', healthy: false, reason: '...timeout...' }` |
| **Verify** | Function does not hang; returns in bounded time |

---

## TC-M1-10: Health probe HTTP error (500)

**Traces:** NFR-003, PROV-DET-003
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | Config says 'ollama', mock server returns HTTP 500 |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'ollama', healthy: false, source: 'config_file', reason: '...500...' }` |

---

## TC-M1-11: Exception in autoDetectProvider -- catch-all

**Traces:** NFR-003, PROV-DET-005, ADR-0004
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | Config is `null` (causes TypeError when accessing `.defaults`) |
| **When** | `autoDetectProvider(null)` is called |
| **Then** | Returns `{ provider: 'anthropic', healthy: true, source: 'default_fallback' }` |
| **Verify** | No thrown exception propagates to caller |

---

## TC-M1-12: Backward compatibility -- hasProvidersConfig() guard

**Traces:** NFR-002, AC-002-02, VR-017, ADR-0004
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | No `.isdlc/providers.yaml` exists in project directory |
| **When** | `hasProvidersConfig()` is called |
| **Then** | Returns `false` |
| **Verify** | This means the router exits at the guard clause, never calling autoDetectProvider |

---

## TC-M1-13: Backward compatibility -- hasProvidersConfig() returns true

**Traces:** NFR-002, VR-017
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `.isdlc/providers.yaml` exists in project directory |
| **When** | `hasProvidersConfig()` is called |
| **Then** | Returns `true` |

---

## TC-M1-14: Health probe targets only localhost

**Traces:** Security, VR-003
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | Config with `ollama.base_url = 'http://localhost:11434'` |
| **When** | Health probe is configured |
| **Then** | The probe URL is constructed from `config.providers.ollama.base_url` + `/api/tags` |
| **Verify** | No external network call is made |

---

## TC-M1-15: Tier 1-2 detection performance (no I/O)

**Traces:** Performance
**Priority:** P2

| Field | Value |
|-------|-------|
| **Given** | Env var `ANTHROPIC_BASE_URL` is set to `localhost:11434` |
| **When** | `autoDetectProvider(config)` is called and timed |
| **Then** | Completes in < 5ms (no I/O needed for tier 1) |

---

## TC-M1-16: Env var with uppercase/mixed case localhost

**Traces:** VR-002
**Priority:** P2

| Field | Value |
|-------|-------|
| **Given** | `ANTHROPIC_BASE_URL = 'http://LOCALHOST:11434'` |
| **When** | `autoDetectProvider(config)` is called |
| **Then** | Returns `{ provider: 'ollama', source: 'env_var' }` |
| **Rationale** | Validation rule says case-insensitive match on 'localhost' |

---

## TC-M1-17: Return value shape validation

**Traces:** Component spec section 1
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | Any valid call to `autoDetectProvider()` |
| **When** | Result is returned |
| **Then** | Result has exactly: `provider` (string), `healthy` (boolean), `source` (string) |
| **And** | `source` is one of: `'env_var'`, `'config_file'`, `'default_fallback'` |
| **And** | `reason` is present only when `healthy === false` |

---

## TC-M1-18: autoDetectProvider is exported from provider-utils.cjs

**Traces:** Module design section 2.6
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `provider-utils.cjs` is loaded via require() |
| **When** | Checking `module.exports` |
| **Then** | `autoDetectProvider` is a function on the exports object |
