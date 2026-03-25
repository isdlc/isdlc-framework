# Requirements Specification: REQ-0139 — Codex Reserved Verb Routing

**Source**: GitHub Issue #205
**Status**: Analyzed
**Created**: 2026-03-24
**Confidence**: High (user-confirmed all FRs and ACs)

---

## 1. Business Context

### Problem Statement

In Codex, the workflow verbs Add, Analyze, and Build are defined in AGENTS.md as intent-detection triggers, but the enforcement is entirely instruction-based. The model may treat "analyze it" as a generic request instead of routing to `/isdlc analyze`. This creates inconsistent behavior across sessions and makes the invisible framework unreliable as a dogfooding harness.

### Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| Framework developer (dogfooding) | Primary user | Consistent verb routing in Codex sessions |
| Downstream Codex users | Secondary user | Reliable workflow triggers out of the box |

### Success Metrics

- Reserved verbs route consistently to their mapped commands in 100% of imperative contexts
- Behavior survives fresh sessions and post-clear re-priming
- Zero regressions in existing non-verb conversation handling

### Driving Factors

- Live misroute during dogfooding where "analyze it" was handled as generic analysis
- Codex lacks Claude Code's hook infrastructure, so enforcement must be adapter-level

---

## 2. Stakeholders and Personas

### Framework Developer (Primary)

- **Role**: Uses iSDLC to develop the framework itself via Codex
- **Goals**: Predictable workflow triggering from natural language
- **Pain points**: Same phrase produces different behavior across sessions; has to explicitly type `/isdlc analyze` to guarantee routing
- **Proficiency**: Expert — knows the framework internals

### Downstream Codex User (Secondary)

- **Role**: Installs iSDLC into their project and uses Codex as their provider
- **Goals**: Natural conversation triggers workflows without learning slash commands
- **Pain points**: Invisible framework is invisible but inconsistent
- **Proficiency**: Intermediate — understands workflows but not framework internals

---

## 3. User Journeys

### Journey 1: Reliable Verb Routing (Happy Path)

1. User says "analyze it" in a Codex session
2. Verb resolver detects "analyze" as a reserved verb
3. System asks for brief consent ("Ready to kick this off?")
4. User confirms
5. `/isdlc analyze` is invoked

### Journey 2: Active Workflow Conflict

1. User is in Phase 06 of a feature workflow
2. User says "build this component"
3. Verb resolver detects "build" but flags `blocked_by: "active_workflow"`
4. System surfaces the conflict: "You have an active workflow — cancel it first or continue?"

### Journey 3: Non-Development Context

1. User says "explain this code"
2. Verb resolver matches exclusion pattern
3. No verb detection — normal conversation proceeds

---

## 4. Technical Context

### Constraints

- Codex has no hook infrastructure — enforcement must be in the adapter layer
- `codex exec` is the execution primitive — any guard must operate before the spawn
- The verb spec must be a shared config read by both projection and runtime

### Existing Patterns

- `src/providers/codex/projection.js` assembles instruction bundles
- `src/providers/codex/runtime.js` spawns `codex exec` processes
- `src/codex/AGENTS.md.template` is the installable template
- `.isdlc/config.json` is the project-level config file

### Integration Points

- `verb-resolver.js` reads `reserved-verbs.json` at import time
- `runtime.js` reads `.isdlc/config.json` for mode and `state.json` for active workflow
- `projection.js` reads `reserved-verbs.json` to generate instruction-bundle verb section

---

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|---|---|---|
| Consistency | Critical | Same phrase produces same routing 100% of the time |
| Performance | High | Verb resolution < 5ms (regex on small set) |
| Configurability | High | Two enforcement modes selectable via config |
| Fail-safety | High | Missing verb spec or config degrades to prompt-only, never blocks |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| False positives ("analyze" in non-imperative context) | Medium | Medium | Exclusion patterns + imperative position heuristic |
| Structured preamble ignored by model | Low | High | Verb spec injected at position 0 of instruction bundle |
| Config drift between template and runtime | Low | Medium | Single source of truth in reserved-verbs.json |

---

## 6. Functional Requirements

### FR-001: Canonical Verb Spec

**Description**: A shared JSON config file defining reserved verbs, trigger phrases, precedence, disambiguation, and exclusions.
**Confidence**: High

- **AC-001-01**: Verb spec lives at `src/isdlc/config/reserved-verbs.json`
- **AC-001-02**: Spec defines three verbs: add (precedence 3), analyze (precedence 2), build (precedence 1)
- **AC-001-03**: Each verb has `command`, `phrases[]`, `imperative_forms[]`, `precedence`
- **AC-001-04**: Spec includes `disambiguation` map: add+analyze → analyze, analyze+build → build
- **AC-001-05**: Spec includes `exclusions[]` for non-development phrases

### FR-002: Prompt-Prepend Enforcement

**Description**: The projection service injects the verb spec as a high-priority section at position 0 of the instruction bundle. This is the default enforcement mode.
**Confidence**: High

- **AC-002-01**: `projection.js` exports `buildVerbRoutingSection(verbSpec)` that renders the spec as a markdown section
- **AC-002-02**: `projectInstructions()` inserts the verb routing section at index 0
- **AC-002-03**: The section includes the intent table, disambiguation rules, and a "RESERVED VERBS" header
- **AC-002-04**: This mode is active when `verb_routing` is `"prompt"` or absent from config

### FR-003: Runtime Guard Enforcement

**Description**: The runtime adapter calls `resolveVerb()` on the user prompt before `codex exec` and prepends a structured `RESERVED_VERB_ROUTING` preamble when a verb is detected. Activated by config.
**Confidence**: High

- **AC-003-01**: `runtime.js` exports `applyVerbGuard(prompt, config, stateJson)` that returns `{ modifiedPrompt, verbResult }`
- **AC-003-02**: When `verb_routing === "runtime"` and a verb is detected, the structured preamble is prepended with fields: `detected`, `verb`, `command`, `confirmation_required`, `ambiguity`, `ambiguous_verbs`, `source_phrase`, `blocked_by`
- **AC-003-03**: When `verb_routing === "prompt"` or absent, the prompt is returned unmodified
- **AC-003-04**: The guard never auto-executes — `confirmation_required` is always `true`

### FR-004: Configuration

**Description**: A single config key in `.isdlc/config.json` controls the enforcement mode.
**Confidence**: High

- **AC-004-01**: Config key is `verb_routing` with values `"prompt"` (default) or `"runtime"`
- **AC-004-02**: Config lives exclusively in `.isdlc/config.json` — no fallback to other config files
- **AC-004-03**: Missing key defaults to `"prompt"`

### FR-005: Template Update

**Description**: Both `src/codex/AGENTS.md.template` and `docs/AGENTS.md` reference the canonical verb spec with stronger reserved-verb language.
**Confidence**: High

- **AC-005-01**: Intent detection table in templates is generated from `reserved-verbs.json`
- **AC-005-02**: Templates include explicit language: Add, Analyze, Build are reserved workflow verbs that MUST route before freeform work
- **AC-005-03**: Disambiguation section references the canonical spec

### FR-006: Unit Tests

**Description**: Unit tests for `resolveVerb()` covering phrase matching, precedence, ambiguity, exclusions, active workflow, and slash commands.
**Confidence**: High

- **AC-006-01**: `resolveVerb("analyze it")` → `{ detected: true, verb: "analyze", command: "/isdlc analyze" }`
- **AC-006-02**: `resolveVerb("add and analyze this")` → `{ detected: true, verb: "analyze", ambiguity: true, ambiguous_verbs: ["add", "analyze"] }`
- **AC-006-03**: `resolveVerb("explain this code")` → `{ detected: false, reason: "excluded" }`
- **AC-006-04**: `resolveVerb("build it", { activeWorkflow: true })` → `{ detected: true, verb: "build", blocked_by: "active_workflow" }`
- **AC-006-05**: `resolveVerb("/isdlc analyze foo", { isSlashCommand: true })` → `{ detected: false, reason: "slash_command" }`
- **AC-006-06**: `resolveVerb("")` → `{ detected: false, reason: "empty_input" }`

### FR-007: Integration Test

**Description**: Integration test verifying end-to-end behavior of runtime guard mode.
**Confidence**: High

- **AC-007-01**: With `verb_routing: "runtime"`, `applyVerbGuard("analyze it", config, state)` returns a modified prompt containing the structured preamble
- **AC-007-02**: With `verb_routing: "prompt"`, `applyVerbGuard("analyze it", config, state)` returns the original prompt unchanged

---

## 7. Out of Scope

| Item | Reason | Dependency |
|---|---|---|
| Claude Code verb routing | Claude Code has hooks + CLAUDE.md — different enforcement model | None |
| Fix/Upgrade/Test verb reservation | Only Add/Analyze/Build are reserved per issue scope | Future enhancement |
| Multi-language trigger phrases | English-only for now | i18n initiative |
| NLP-based intent detection | Regex sufficient for small closed verb set | None |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|---|---|---|---|
| FR-001 | Canonical verb spec | Must Have | Foundation for all other FRs |
| FR-002 | Prompt-prepend enforcement | Must Have | Default mode, minimal disruption |
| FR-003 | Runtime guard enforcement | Must Have | Core ask from issue — deterministic routing |
| FR-004 | Configuration | Must Have | Enables the two-mode choice |
| FR-005 | Template update | Must Have | User-facing contract |
| FR-006 | Unit tests | Must Have | Prevents regression |
| FR-007 | Integration test | Should Have | End-to-end verification |
