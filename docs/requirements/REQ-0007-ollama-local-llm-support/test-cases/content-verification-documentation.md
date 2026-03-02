# Test Cases: Documentation Content Verification

**Module:** M4 - Documentation (CLAUDE.md.template)
**File:** `tests/prompt-verification/provider-documentation.test.js`
**Runner:** `node --test tests/prompt-verification/provider-documentation.test.js`
**Traces:** REQ-003, REQ-005, AC-004-02, AC-004-03, VR-016

---

## Test Setup

```
Read CLAUDE.md.template:
  - Read from src/claude/CLAUDE.md.template
  - Assert presence of required sections and content
```

---

## TC-M4-01: CLAUDE.md.template contains Ollama quick-start section

**Traces:** REQ-003, AC-004-02, VR-016
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `src/claude/CLAUDE.md.template` is read |
| **When** | Searching for Ollama quick-start content |
| **Then** | Contains `ollama serve` instruction |
| **And** | Contains `ollama pull` instruction |
| **And** | Contains at least one recommended model name (`qwen3-coder` or `glm-4.7`) |

---

## TC-M4-02: CLAUDE.md.template contains environment variable examples

**Traces:** REQ-003, AC-004-02, VR-016
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `src/claude/CLAUDE.md.template` is read |
| **When** | Searching for env var documentation |
| **Then** | Contains `ANTHROPIC_BASE_URL` |
| **And** | Contains `http://localhost:11434` |
| **And** | Contains `ANTHROPIC_AUTH_TOKEN` |
| **And** | Contains `ANTHROPIC_API_KEY` |

---

## TC-M4-03: CLAUDE.md.template contains recommended models table

**Traces:** REQ-003, REQ-005, AC-004-02, VR-016
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `src/claude/CLAUDE.md.template` is read |
| **When** | Searching for models documentation |
| **Then** | Contains `qwen3-coder` |
| **And** | Contains `glm-4.7` |
| **And** | Contains `gpt-oss` |
| **And** | Contains `64k` or `65536` or `64,000` (minimum context reference) |

---

## TC-M4-04: CLAUDE.md.template contains known limitations section

**Traces:** REQ-005, AC-004-03, VR-016
**Priority:** P0

| Field | Value |
|-------|-------|
| **Given** | `src/claude/CLAUDE.md.template` is read |
| **When** | Searching for limitations documentation |
| **Then** | Contains text about multi-agent workflow limitations |
| **And** | Contains text about tool calling variability |
| **And** | Contains text about context window requirements |
| **And** | Contains text about structured output reliability |

---

## TC-M4-05: CLAUDE.md.template contains auto-detection documentation

**Traces:** REQ-006, AC-004-02
**Priority:** P1

| Field | Value |
|-------|-------|
| **Given** | `src/claude/CLAUDE.md.template` is read |
| **When** | Searching for auto-detection documentation |
| **Then** | Contains `auto-detect` or `Auto-detect` or `auto detect` |
| **And** | Mentions at least 2 of: environment variables, configuration, health probe |

---

## TC-M4-06: CLAUDE.md.template mentions /provider command

**Traces:** REQ-001, AC-003-01
**Priority:** P2

| Field | Value |
|-------|-------|
| **Given** | `src/claude/CLAUDE.md.template` is read |
| **When** | Searching for provider command reference |
| **Then** | Contains `/provider` |
