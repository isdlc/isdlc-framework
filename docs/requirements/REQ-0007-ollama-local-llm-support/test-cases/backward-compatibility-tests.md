# Test Cases: Backward Compatibility & Error Handling

**Scope:** Cross-cutting concerns for NFR-002, NFR-003
**Traces:** NFR-002, NFR-003, AC-002-02, AC-002-03, VR-017, VR-018, ADR-0004

---

## Backward Compatibility Tests

These test cases ensure existing Anthropic-only users are NOT affected by the Ollama enablement (NFR-002).

---

## TC-BC-01: Guard clause in model-provider-router.cjs is preserved

**Traces:** NFR-002, VR-017, ADR-0004
**Priority:** P0
**File:** `src/claude/hooks/tests/provider-config-validation.test.cjs`

| Field | Value |
|-------|-------|
| **Given** | `src/claude/hooks/model-provider-router.cjs` is read as text |
| **When** | Searching for the hasProvidersConfig() guard clause |
| **Then** | The file contains a call to `hasProvidersConfig()` that acts as an early return |
| **Rationale** | This guard ensures Anthropic-only users (no providers.yaml) bypass all provider routing |

---

## TC-BC-02: No providers.yaml means autoDetectProvider is never called

**Traces:** NFR-002, AC-002-02, ADR-0004
**Priority:** P0
**File:** `src/claude/hooks/tests/provider-utils-autodetect.test.cjs`

| Field | Value |
|-------|-------|
| **Given** | A project with NO `.isdlc/providers.yaml` |
| **When** | hasProvidersConfig() is called |
| **Then** | Returns `false` |
| **Implication** | The router exits at the guard clause; autoDetectProvider() is never reached |

---

## TC-BC-03: Installer --force preserves backward compatible default

**Traces:** NFR-002, VR-008
**Priority:** P0
**File:** `tests/integration/installer-provider-selection.test.js`

| Field | Value |
|-------|-------|
| **Given** | Installer runs with `--force` flag |
| **When** | Provider selection is determined |
| **Then** | Provider defaults to 'claude-code' |
| **And** | No providers.yaml is created |

---

## TC-BC-04: Existing tests pass without modification

**Traces:** NFR-002
**Priority:** P0
**Method:** Run `npm run test:hooks` -- all 23 existing test files must pass

| Field | Value |
|-------|-------|
| **Given** | All existing hook tests exist |
| **When** | `npm run test:hooks` is executed |
| **Then** | All tests pass (exit code 0) |
| **Note** | This is verified in CI, not in a dedicated test case |

---

## Error Handling Tests

These test cases ensure graceful degradation when provider detection fails (NFR-003).

---

## TC-ERR-01: autoDetectProvider handles null config

**Traces:** NFR-003, PROV-DET-005, VR-001
**Priority:** P0
**File:** `src/claude/hooks/tests/provider-utils-autodetect.test.cjs`

| Field | Value |
|-------|-------|
| **Given** | `autoDetectProvider(null)` is called |
| **When** | The function processes the null input |
| **Then** | Returns Anthropic default, does NOT throw |

---

## TC-ERR-02: autoDetectProvider handles undefined config

**Traces:** NFR-003, VR-001
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `autoDetectProvider(undefined)` is called |
| **When** | The function processes the undefined input |
| **Then** | Returns Anthropic default, does NOT throw |

---

## TC-ERR-03: Health probe connection refused is handled

**Traces:** NFR-003, AC-002-03, PROV-DET-002
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | Config says 'ollama', but no server is listening on the health check port |
| **When** | autoDetectProvider attempts the health probe |
| **Then** | Returns `{ provider: 'ollama', healthy: false, reason: '...' }` |
| **And** | Does NOT throw an unhandled exception |

---

## TC-ERR-04: Health probe timeout is bounded

**Traces:** NFR-003, PROV-DET-001
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | Config says 'ollama', mock server never responds |
| **When** | autoDetectProvider attempts the health probe |
| **Then** | Returns within ~2100ms (timeout at 2000ms + small overhead) |
| **And** | `healthy === false`, `reason` mentions timeout |

---

## TC-ERR-05: No installer command installs Ollama software

**Traces:** AC-001-05, VR-018, CON-001
**Priority:** P0
**File:** `tests/integration/installer-provider-selection.test.js`

| Field | Value |
|-------|-------|
| **Given** | `install.sh`, `install.ps1`, and `lib/installer.js` are read |
| **When** | Searching for commands that would install Ollama |
| **Then** | None of the files contain executable `ollama install`, `ollama pull` (outside echo/display), `apt install ollama`, `brew install ollama`, or `winget install ollama` |

---

## TC-ERR-06: writeProviderConfig handles missing defaults file

**Traces:** PROV-CFG-003, INST-PROV-001
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | Framework directory does not contain provider-defaults.yaml |
| **When** | writeProviderConfig() is called |
| **Then** | Does not create providers.yaml |
| **And** | Does not throw (logs warning and continues) |
