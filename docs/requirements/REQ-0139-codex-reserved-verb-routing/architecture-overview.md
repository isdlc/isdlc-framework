# Architecture Overview: REQ-0139 — Codex Reserved Verb Routing

**Status**: Accepted
**Created**: 2026-03-24

---

## 1. Architecture Options

### Option A: Single Shared Parser with Two Injection Points (Selected)

**Summary**: One `resolveVerb()` function in a new `verb-resolver.js` module, called by both `projection.js` (prompt-prepend) and `runtime.js` (runtime guard). Config key selects which path is active.

| Aspect | Assessment |
|---|---|
| Pros | Single matching logic — no behavior drift between modes; testable in isolation; config-driven mode switch |
| Cons | New module to maintain; runtime.js gains a dependency on verb-resolver |
| Pattern alignment | Follows existing pattern of shared utilities (e.g., `common.cjs` for hooks) |
| Verdict | **Selected** |

### Option B: Separate Implementations per Enforcement Point

**Summary**: Projection builds its own verb section from the spec. Runtime implements its own matching. No shared code.

| Aspect | Assessment |
|---|---|
| Pros | No coupling between projection and runtime |
| Cons | Duplicated matching logic; behavior drift risk; harder to test consistently |
| Pattern alignment | Against DRY principle |
| Verdict | **Eliminated** — drift risk is the exact problem we're solving |

---

## 2. Selected Architecture

### ADR-001: Single Parser, Two Injection Points

- **Status**: Accepted
- **Context**: Reserved verb routing needs to work identically in both prompt-prepend and runtime guard modes. Different implementations would create the drift the feature aims to eliminate.
- **Decision**: Implement `resolveVerb()` as a pure function in `src/providers/codex/verb-resolver.js`. Both `projection.js` and `runtime.js` import and call it. The verb spec is loaded once from `src/isdlc/config/reserved-verbs.json`.
- **Rationale**: Single source of truth for both the spec (JSON) and the matching logic (JS). Tests cover one function; both paths get the fix.
- **Consequences**: `runtime.js` gains an import dependency on `verb-resolver.js`. This is acceptable — they're in the same provider package.

### ADR-002: Config in .isdlc/config.json Only

- **Status**: Accepted
- **Context**: The enforcement mode needs a config location. Candidates: `.isdlc/config.json`, `providers.yaml`, or both with precedence.
- **Decision**: `.isdlc/config.json` only. Key: `verb_routing: "prompt" | "runtime"`. Default: `"prompt"`.
- **Rationale**: Single location eliminates precedence questions. `.isdlc/config.json` already holds the session cache budget config — adding a sibling key is consistent.
- **Consequences**: Users who prefer `providers.yaml` must use `.isdlc/config.json` for this setting. Acceptable tradeoff for simplicity.

### ADR-003: Pre-Resolved Routing (Model Stays in Loop)

- **Status**: Accepted
- **Context**: The runtime guard could either fully bypass the model (deterministic command execution) or pre-resolve the verb and let the model handle description extraction and consent.
- **Decision**: Pre-resolved. The guard prepends a structured `RESERVED_VERB_ROUTING` block. The model reads it, extracts the description from the user's natural language, and runs the consent step.
- **Rationale**: Full bypass would require the guard to parse descriptions from natural language — reimplementing what the model already does. Pre-resolved gives deterministic routing while keeping the model's natural language understanding for description extraction.
- **Consequences**: The model could theoretically ignore the preamble. Mitigated by injecting at position 0 of the prompt.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|---|---|---|---|
| Regex matching | Native JS | Small closed set of verbs; regex is sufficient and zero-dependency | NLP library (overkill), string.includes (too imprecise) |
| JSON config | Native `readFileSync` | Static file, loaded once at import | YAML (inconsistent with existing config.json pattern) |
| ESM module | Native | Consistent with `src/providers/codex/*.js` | CommonJS (wrong module system for this path) |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|---|
| IP-1 | `verb-resolver.js` | `reserved-verbs.json` | `readFileSync` at import | JSON | Fail-open: return `{ detected: false, reason: "spec_missing" }` |
| IP-2 | `projection.js` | `verb-resolver.js` | `import { loadVerbSpec }` | JS object | Fail-open: omit verb section from bundle |
| IP-3 | `runtime.js` | `verb-resolver.js` | `import { resolveVerb }` | JS object | Fail-open: return unmodified prompt |
| IP-4 | `runtime.js` | `.isdlc/config.json` | `readFileSync` | JSON | Default to `"prompt"` mode |
| IP-5 | `runtime.js` | `.isdlc/state.json` | `readFileSync` | JSON | Treat as no active workflow |

### Data Flow

```
User prompt
  → runtime.js: read config (verb_routing mode?)
  → if "runtime": resolveVerb(prompt, { activeWorkflow, isSlashCommand })
    → load reserved-verbs.json (cached)
    → match against phrases/imperative_forms
    → return structured result
  → if detected: prepend RESERVED_VERB_ROUTING preamble to prompt
  → codex exec receives (possibly modified) prompt
  → model reads preamble, routes to /isdlc command, asks consent
```

---

## 5. Summary

| Metric | Value |
|---|---|
| New files | 2 (`verb-resolver.js`, `reserved-verbs.json`) |
| Modified files | 4 (`projection.js`, `runtime.js`, `AGENTS.md.template`, `docs/AGENTS.md`) |
| Test files | 2 (unit for verb-resolver, integration for runtime guard) |
| Config files | 1 (`.isdlc/config.json` — new key) |
| New dependencies | 0 |
| Risk level | Low — isolated to Codex provider, fail-open on all error paths |
