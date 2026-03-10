# Architecture Overview: Custom Workflow Definitions

**REQ ID**: REQ-0058
**Source**: GH-102
**Status**: Analyzed

---

## 1. Architecture Options

### Decision 1: Extension Mechanism

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|--------|
| Full phase replacement | `extends` + `phases` replaces base entirely | Simple to implement, explicit | Repetitive, loses base updates | Low — doesn't compose | Eliminated |
| Diff-based operations | `remove_phases`, `add_phases`, `reorder` | Concise, composable, inherits base changes | More complex resolution logic | High — composable pattern | **Selected** |

### Decision 2: Shipped Name Handling

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|--------|
| Allow override | Custom workflows can redefine `feature` | Maximum flexibility | Ambiguity, accidental overrides | Low — unpredictable | Eliminated |
| Reserved names | Shipped names are protected | Predictable, no confusion | Less flexible | High — safe defaults (Article X) | **Selected** |

### Decision 3: Intent Matching

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|--------|
| Keyword matching | Trigger words in YAML matched literally | Simple, fast | Brittle, poor NL understanding | Low — invisible UX needs flexibility | Eliminated |
| LLM intent interpretation | `intent` + `examples` fields, LLM decides | Natural, flexible, handles phrasing variation | Depends on LLM quality | High — matches invisible UX principle | **Selected** |

### Decision 4: Phase Ordering Validation

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|--------|
| Block on bad order | Framework rejects invalid phase sequences | Prevents mistakes | Removes user control | Low — too restrictive | Eliminated |
| Warn on bad order | Framework warns but allows execution | User has full control, gets guidance | User may ignore warnings | High — user control with guidance | **Selected** |

## 2. Selected Architecture

### ADR-001: Diff-Based Workflow Extension
- **Status**: Accepted
- **Context**: Users need to customize shipped workflows without duplicating the full phase list
- **Decision**: Use diff operations (`remove_phases`, `add_phases` with insertion points, `reorder`) applied in fixed order to the base workflow's phases
- **Rationale**: Composable, concise, and inherits base workflow changes automatically. Fixed operation order (remove → add → reorder) ensures deterministic resolution.
- **Consequences**: Requires a diff resolution engine. Max extension depth = 1 (no chaining). Each operation validates against the current phase list at that point.

### ADR-002: Reserved Shipped Workflow Names
- **Status**: Accepted
- **Context**: Custom workflows could collide with shipped workflow names, causing ambiguity
- **Decision**: Shipped workflow names are reserved. Custom workflows that use a shipped name are rejected at load time with a clear error.
- **Rationale**: Predictable behavior. Users always know what `feature` means. Aligns with Article X (Fail-Safe Defaults).
- **Consequences**: Users must choose unique names. Framework must validate name collisions at load time.

### ADR-003: LLM Intent-Based Workflow Matching
- **Status**: Accepted
- **Context**: Custom workflows need to be discoverable via natural conversation without hardcoded keyword tables
- **Decision**: Each workflow declares an `intent` (natural language description) and optional `examples` (sample phrases). The LLM reads all intents from the session cache and matches user input. Confirms before executing.
- **Rationale**: Natural, flexible, consistent with the invisible UX principle. Handles phrasing variation without brittle keyword lists.
- **Consequences**: Session cache must include the merged workflow registry. CLAUDE.md intent detection becomes dynamic. LLM quality determines match accuracy.

### ADR-004: Refactor --light into Workflow Variant
- **Status**: Accepted
- **Context**: `--light` flag is workflow-variant logic hardcoded in `workflow-init.cjs`. Custom workflows make this redundant.
- **Decision**: Ship `feature-light` as a workflow extending `feature` with `remove_phases: [03-architecture, 04-design]`. Remove `--light` flag logic from `workflow-init.cjs`. `--supervised` becomes a workflow-level boolean setting.
- **Rationale**: Dogfoods the extension system. Reduces code paths in workflow-init. Demonstrates the pattern for users.
- **Consequences**: Existing `--light` flag usage breaks — must update CLAUDE.md and any references. `feature-light` becomes a shipped workflow.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| js-yaml | existing dep | Already in project, proven YAML parser | yaml (heavier), manual parsing (fragile) |
| CommonJS module | N/A | Called from CJS scripts (Article XIII) | ESM (breaks hook/script compatibility) |
| Glob via fs.readdirSync | N/A | Simple directory listing, <20 files expected | fast-glob (overkill for small dir) |

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| I1 | prime-session.cjs | workflow-loader.cjs | `loadWorkflows(projectRoot)` | JS object | Returns `{ warnings, errors }` — session continues with shipped-only on error |
| I2 | workflow-init.cjs | workflow-loader.cjs | `loadWorkflows(projectRoot)` | JS object | Exits with error JSON if custom workflow invalid |
| I3 | workflow-loader.cjs | workflows.json | `fs.readFileSync` | JSON | Fatal if shipped config missing |
| I4 | workflow-loader.cjs | .isdlc/workflows/*.yaml | `fs.readdirSync` + `yaml.load` | YAML → JS | Per-file error, skip invalid, continue |
| I5 | installer.js | filesystem | `fs.mkdirSync` | Directory creation | Non-fatal, log warning |
| I6 | updater.js | filesystem | preserve check | File existence | Preserve .isdlc/workflows/ contents |

### Data Flow

```
Install → creates .isdlc/workflows/ directory
    ↓
Session Start → prime-session.cjs
    ↓
loadWorkflows(projectRoot)
    ├── Read src/isdlc/config/workflows.json (shipped)
    ├── Glob .isdlc/workflows/*.yaml (user)
    ├── Parse + validate each user workflow
    ├── Resolve extensions (diff engine)
    ├── Validate phase ordering (warnings)
    └── Return merged registry + warnings
    ↓
Embed in session cache (WORKFLOW_REGISTRY section)
    ↓
User speaks → LLM reads intents from cache → matches → confirms
    ↓
workflow-init.cjs → loadWorkflows() → resolve phases → create active_workflow
    ↓
Phase execution → shipped phases use built-in agent table, custom phases use `agent` field
```

## 5. Summary

| Metric | Value |
|--------|-------|
| New files | 2 (workflow-loader.cjs, phase-ordering.json) |
| Modified files | 6 (workflow-init.cjs, prime-session.cjs, workflows.json, installer.js, updater.js, CLAUDE.md) |
| Documentation files | 3+ (README, hackability-roadmap.md, phase docs) |
| New dependencies | 0 |
| Risk level | Medium — refactoring --light and intent detection are breaking changes |

### Assumptions

- **A1**: YAML format for user workflows — matches existing `.isdlc` config patterns
- **A2**: Workflow loader is synchronous — expected <20 user workflow files
- **A3**: Custom agent files follow shipped agent markdown structure — no new format
- **A4**: Session cache is the single delivery mechanism for workflow intents to the LLM
- **A5**: Max extension depth = 1 — no `extends` of an `extends`
- **A6**: Diff operations applied in fixed order: remove → add → reorder
- **A7**: Custom phases have no iteration requirements by default
- **A8**: Uninstaller leaves `.isdlc/workflows/` in place
- **A9**: Workflow loader shared between Antigravity and Claude Code entry points

## Pending Sections

None — all sections complete.
