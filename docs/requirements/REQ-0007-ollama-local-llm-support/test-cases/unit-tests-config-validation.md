# Test Cases: Provider Configuration Validation

**Module:** M3 - Provider Configuration
**File:** `src/claude/hooks/tests/provider-config-validation.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/provider-config-validation.test.cjs`
**Traces:** REQ-001, REQ-002, REQ-005, AC-003-01, AC-004-01

---

## Test Setup

```
Load provider-defaults.yaml:
  - Read file from src/claude/hooks/config/provider-defaults.yaml
  - Parse using parseYaml() from provider-utils.cjs
  - Extract ollama section for model validation
```

---

## TC-M3-01: All Ollama models have context_window >= 65536

**Traces:** REQ-002, REQ-005, VR-004, AC-004-01
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded and parsed |
| **When** | Iterating over `ollama.models[]` |
| **Then** | Every model has `context_window >= 65536` |
| **Models** | qwen3-coder (131072), glm-4.7 (131072), gpt-oss:20b (65536), gpt-oss:120b (65536) |

---

## TC-M3-02: All Ollama models include 'coding' capability

**Traces:** REQ-002, VR-005
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded and parsed |
| **When** | Iterating over `ollama.models[]` |
| **Then** | Every model's `capabilities` array includes `'coding'` |

---

## TC-M3-03: Model IDs are valid Ollama tags

**Traces:** REQ-002, VR-006
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded and parsed |
| **When** | Checking each model's `id` field |
| **Then** | Each `id` matches `/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/` |

---

## TC-M3-04: Model aliases are unique and valid format

**Traces:** REQ-002, VR-007
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded and parsed |
| **When** | Collecting all model aliases across all providers |
| **Then** | No duplicates exist |
| **And** | Each alias matches `/^[a-z0-9][a-z0-9-]*$/` |

---

## TC-M3-05: Ollama models have required fields

**Traces:** REQ-002, Component spec section 7
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded and parsed |
| **When** | Checking each Ollama model entry |
| **Then** | Each has: `id`, `alias`, `context_window`, `capabilities`, `cost_tier`, `min_vram_gb` |
| **And** | `cost_tier === 'free'` for all Ollama models |
| **And** | `min_vram_gb` is a positive integer |

---

## TC-M3-06: Recommended models are present

**Traces:** REQ-002, AC-004-01
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded and parsed |
| **When** | Checking Ollama model IDs |
| **Then** | Contains: `qwen3-coder`, `glm-4.7`, `gpt-oss:20b`, `gpt-oss:120b` |
| **And** | Does NOT contain deprecated models: `deepseek-coder-v2:16b`, `codellama:34b`, `qwen2.5-coder:14b` |

---

## TC-M3-07: provider.md has user_invocable: true

**Traces:** REQ-001, AC-003-01, VR-015
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `src/claude/commands/provider.md` is read |
| **When** | Parsing the YAML frontmatter |
| **Then** | `user_invocable` is `true` |
| **And** | Description does NOT contain "(currently disabled)" |

---

## TC-M3-08: Ollama health check config is correct

**Traces:** REQ-006, ADR-0001
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | provider-defaults.yaml is loaded |
| **When** | Checking `ollama.health_check` section |
| **Then** | `endpoint === '/api/tags'` |
| **And** | `timeout_ms === 2000` |
