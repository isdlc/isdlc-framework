# Test Cases: Installer Provider Selection (Integration)

**Module:** M2 - Installer Provider Selection
**Files:**
  - `tests/integration/installer-provider-selection.test.js` (installer.js logic)
  - Content verification embedded in tests for install.sh and install.ps1
**Runner:** `node --test tests/integration/installer-provider-selection.test.js`
**Traces:** REQ-004, AC-001-01 through AC-001-05, VR-008 through VR-014, NFR-002

---

## Test Setup

```
Temp directory per test:
  - Create temp dir with fs.mkdtempSync()
  - Create .isdlc/ subdirectory
  - Copy provider-defaults.yaml to expected framework location
  - Cleanup in after()

For script content tests:
  - Read install.sh and install.ps1 from source
  - Assert expected patterns
```

---

## TC-M2-01: installer.js -- Ollama selection creates providers.yaml

**Traces:** REQ-004, AC-001-02, VR-011, VR-013, ADR-0003
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | A temp project directory with `.isdlc/` and framework `provider-defaults.yaml` accessible |
| **When** | `writeProviderConfig(projectRoot, 'ollama', 'local')` is called |
| **Then** | `.isdlc/providers.yaml` is created |
| **And** | File contains `provider: "ollama"` (or `provider: ollama`) |
| **And** | File contains `active_mode: "local"` (or `active_mode: local`) |

---

## TC-M2-02: installer.js -- Anthropic selection does NOT create providers.yaml

**Traces:** REQ-004, NFR-002, AC-001-04
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | A temp project directory |
| **When** | Provider selection is `'claude-code'` |
| **Then** | No `.isdlc/providers.yaml` is created |
| **Rationale** | Anthropic users should not get providers.yaml (guard clause depends on its absence) |

---

## TC-M2-03: installer.js -- --force flag defaults to claude-code

**Traces:** REQ-004, NFR-002, VR-008
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | Installer is run with `--force` flag |
| **When** | Provider selection is evaluated |
| **Then** | `providerMode = 'claude-code'` (no prompt shown) |

---

## TC-M2-04: installer.js -- --provider-mode ollama flag

**Traces:** REQ-004, VR-008
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | Installer is run with `--provider-mode ollama` flag |
| **When** | Provider selection is evaluated |
| **Then** | `providerMode = 'ollama'` (no prompt shown) |

---

## TC-M2-05: installer.js -- providers.yaml preserves valid YAML structure

**Traces:** VR-013, VR-014
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `writeProviderConfig()` is called with provider='ollama', mode='local' |
| **When** | The resulting providers.yaml is parsed with parseYaml() |
| **Then** | The file parses without error |
| **And** | `parsed.defaults.provider === 'ollama'` |
| **And** | The parsed object contains expected sections (providers, defaults, models) |

---

## TC-M2-06: install.sh -- Contains 2-option provider selection

**Traces:** REQ-004, AC-001-01, VR-009
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `install.sh` file is read |
| **When** | Searching for provider selection content |
| **Then** | Contains `[1] Claude Code (Anthropic API)` |
| **And** | Contains `[2] Ollama (local/free models)` |
| **And** | Default is option 1 (pattern: `${PROVIDER_CHOICE:-1}` or equivalent) |

---

## TC-M2-07: install.sh -- Contains Ollama Next Steps

**Traces:** REQ-004, AC-001-03
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `install.sh` file is read |
| **When** | Checking for Ollama Next Steps content |
| **Then** | Contains `ollama serve` (start instruction) |
| **And** | Contains `ollama pull qwen3-coder` (model pull instruction) |
| **And** | Contains `ollama.ai` (install URL) |
| **And** | Contains `claude` (launch instruction) |

---

## TC-M2-08: install.sh -- Contains Anthropic Next Steps

**Traces:** REQ-004, AC-001-04
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `install.sh` file is read |
| **When** | Checking for Anthropic Next Steps content |
| **Then** | Contains `ANTHROPIC_API_KEY` |
| **And** | Contains `claude` (launch instruction) |

---

## TC-M2-09: install.sh -- Does NOT install Ollama or download models

**Traces:** REQ-004, AC-001-05, VR-018, CON-001
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `install.sh` file is read |
| **When** | Searching for prohibited commands |
| **Then** | Does NOT contain `ollama install` |
| **And** | Does NOT contain `curl.*ollama` (download Ollama binary) |
| **And** | Does NOT contain `apt.*ollama` or `brew.*ollama` (package manager install) |
| **And** | The only `ollama` references are in echo/display statements |

---

## TC-M2-10: install.ps1 -- Contains 2-option provider selection

**Traces:** REQ-004, AC-001-01, VR-010
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `install.ps1` file is read |
| **When** | Searching for provider selection content |
| **Then** | Contains `[1] Claude Code (Anthropic API)` |
| **And** | Contains `[2] Ollama (local/free models)` |
| **And** | Default is option 1 |
