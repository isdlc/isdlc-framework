# Module Design: REQ-0139 — Codex Reserved Verb Routing

**Status**: Accepted
**Created**: 2026-03-24

---

## 1. Module: verb-resolver

**Responsibility**: Parse user prompts against the canonical verb spec and return structured detection results.

**Location**: `src/providers/codex/verb-resolver.js`

**Public Interface**:

```js
/**
 * Resolve reserved verbs from a user prompt.
 *
 * @param {string} prompt - Raw user prompt text
 * @param {Object} [options]
 * @param {boolean} [options.activeWorkflow] - Whether a workflow is currently active
 * @param {boolean} [options.isSlashCommand] - Whether the prompt starts with /
 * @returns {VerbResult}
 */
export function resolveVerb(prompt, options = {})

/**
 * Load and return the parsed verb spec. Useful for testing with custom specs.
 *
 * @param {string} [specPath] - Override path to reserved-verbs.json
 * @returns {VerbSpec}
 */
export function loadVerbSpec(specPath)
```

**Return type `VerbResult`**:

```js
{
  detected: boolean,
  verb: string | null,          // "add" | "analyze" | "build"
  command: string | null,       // "/isdlc add" | "/isdlc analyze" | "/isdlc build"
  confirmation_required: boolean, // always true
  ambiguity: boolean,
  ambiguous_verbs: string[],    // e.g. ["add", "analyze"]
  source_phrase: string | null, // the matched phrase from the prompt
  blocked_by: string | null,    // "active_workflow" or null
  reason: string | null         // "excluded" | "slash_command" | "empty_input" | "spec_missing" | null
}
```

**Algorithm**:

1. Guard: empty/null prompt → `{ detected: false, reason: "empty_input" }`
2. Guard: `options.isSlashCommand` → `{ detected: false, reason: "slash_command" }`
3. Guard: verb spec not loaded → `{ detected: false, reason: "spec_missing" }`
4. Normalize: `prompt.toLowerCase().trim()`
5. Check exclusions: for each pattern in `spec.exclusions`, if prompt matches → `{ detected: false, reason: "excluded" }`
6. Match verbs: for each verb (ordered by precedence ascending = highest priority first):
   - Check `phrases[]`: substring match in normalized prompt
   - Check `imperative_forms[]`: start-of-sentence or after "let's"/"can you"/"please" match
   - Record all matching verbs with their matched phrase
7. No matches → `{ detected: false }`
8. Single match → build result with that verb
9. Multiple matches → look up `spec.disambiguation[key]` where key is sorted verb names joined with `+`. Set `ambiguity: true`, `ambiguous_verbs: [...]`, resolved verb per disambiguation map. If no disambiguation rule exists, use highest precedence verb.
10. If `options.activeWorkflow`: set `blocked_by: "active_workflow"`
11. `confirmation_required: true` always

**Dependencies**:
- `src/isdlc/config/reserved-verbs.json` (loaded once at module init)
- No external packages

**Estimated size**: ~80-100 lines

---

## 2. Module: reserved-verbs.json (Config)

**Responsibility**: Single source of truth for reserved verb definitions.

**Location**: `src/isdlc/config/reserved-verbs.json`

**Schema**:

```json
{
  "version": "1.0.0",
  "verbs": {
    "add": {
      "command": "/isdlc add",
      "phrases": ["add to backlog", "track this", "log this", "remember this", "save this idea", "note this down"],
      "imperative_forms": ["add this", "add it"],
      "precedence": 3
    },
    "analyze": {
      "command": "/isdlc analyze",
      "phrases": ["analyze", "think through", "plan this", "review requirements", "assess impact", "design this", "prepare"],
      "imperative_forms": ["analyze it", "analyze this"],
      "precedence": 2
    },
    "build": {
      "command": "/isdlc build",
      "phrases": ["build", "implement", "create", "code", "develop", "ship", "make this", "let's do this", "refactor", "redesign"],
      "imperative_forms": ["build this", "build it", "implement this", "implement it", "code this", "ship it"],
      "precedence": 1
    }
  },
  "disambiguation": {
    "add+analyze": "analyze",
    "analyze+build": "build",
    "add+build": "build",
    "add+analyze+build": "build"
  },
  "exclusions": [
    "explain", "what does", "help me understand", "how does",
    "show me", "describe", "tell me about", "what is"
  ]
}
```

---

## 3. Changes to projection.js

**New function**:

```js
/**
 * Build the verb routing markdown section from the verb spec.
 *
 * @param {VerbSpec} verbSpec - Parsed verb spec
 * @returns {string} Markdown section content
 */
export function buildVerbRoutingSection(verbSpec)
```

**Change to `projectInstructions()`**:
- After assembling all sections, call `buildVerbRoutingSection(loadVerbSpec())`
- Insert returned section at index 0 of the sections array
- Section includes: RESERVED VERBS header, intent table (generated from spec), disambiguation rules, explicit instruction that these verbs MUST route before freeform work

**Estimated change**: ~30 lines added

---

## 4. Changes to runtime.js

**New function**:

```js
/**
 * Apply verb guard to a user prompt based on config mode.
 *
 * @param {string} prompt - Raw user prompt
 * @param {Object} config - Parsed .isdlc/config.json
 * @param {Object|null} stateJson - Parsed .isdlc/state.json (for active workflow check)
 * @returns {{ modifiedPrompt: string, verbResult: VerbResult }}
 */
export function applyVerbGuard(prompt, config, stateJson)
```

**Behavior**:
- If `config.verb_routing !== "runtime"`: return `{ modifiedPrompt: prompt, verbResult: { detected: false } }`
- Call `resolveVerb(prompt, { activeWorkflow: !!stateJson?.active_workflow, isSlashCommand: prompt.startsWith('/') })`
- If `detected: true`: serialize result as structured preamble, prepend to prompt
- Return `{ modifiedPrompt, verbResult }`

**Structured preamble format**:

```
RESERVED_VERB_ROUTING:
  detected: true
  verb: "analyze"
  command: "/isdlc analyze"
  confirmation_required: true
  ambiguity: false
  ambiguous_verbs: []
  source_phrase: "analyze it"
  blocked_by: null
```

**Integration point**: Called before `codex exec` spawn in the task execution path.

**Estimated change**: ~40 lines added

---

## 5. Changes to templates

### src/codex/AGENTS.md.template

- Step 1 intent table: regenerated from `reserved-verbs.json` (same content, now sourced from spec)
- New paragraph after table: "Add, Analyze, and Build are **reserved workflow verbs**. When detected in imperative context, they MUST route to their mapped command before any other work. Do not perform freeform analysis, implementation, or backlog management without first resolving the workflow verb."
- Disambiguation section: updated to reference verb precedence rules

### docs/AGENTS.md

- Same changes as template, applied to the dogfooding AGENTS.md

---

## 6. Error Handling

| Condition | Behavior | Article |
|---|---|---|
| `reserved-verbs.json` missing | `resolveVerb` returns `{ detected: false, reason: "spec_missing" }` | Article X (fail-safe) |
| `verb_routing` config missing | Default to `"prompt"` mode | Article X |
| Empty/null prompt | Return `{ detected: false, reason: "empty_input" }` | Article X |
| Malformed verb spec JSON | Catch parse error, return `{ detected: false, reason: "spec_missing" }` | Article X |
| `state.json` unreadable | Treat as no active workflow | Article X |

---

## 7. Test Strategy Outline

### Unit Tests (`verb-resolver.test.js`)

- Phrase matching: each verb's phrases and imperative forms
- Precedence: build wins over analyze, analyze wins over add
- Ambiguity: multi-verb prompts return correct disambiguation
- Exclusions: non-dev phrases return `detected: false`
- Active workflow: `blocked_by` field set correctly
- Slash commands: skipped correctly
- Edge cases: empty input, missing spec, case insensitivity

### Integration Tests (`runtime-verb-guard.test.js`)

- Runtime mode: prompt modified with structured preamble
- Prompt mode: prompt returned unchanged
- Config missing: defaults to prompt mode
- Active workflow: preamble includes `blocked_by`
