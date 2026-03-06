# iSDLC Framework — Hackability & Extensibility Roadmap

**Created**: 2026-03-06
**Status**: Design (pre-analysis)
**Source**: Extensibility research + latent demand analysis + early user feedback

---

## 1. Vision

> Build iSDLC in a way that is hackable — open-ended enough that developers can make it their own.

Today iSDLC ships as a fixed system: 6 workflow types, fixed phase sequences, fixed agent personas, fixed gate thresholds. Developers use it as-is or not at all. The goal is to transform iSDLC from a fixed tool into a **platform** — where the framework provides opinionated defaults and developers can override, extend, and compose at every layer.

The most successful developer tools tap into **latent demand** — needs developers can't articulate because they've accepted friction as normal. Nobody asked VS Code for "50k extensions." They asked for "a fast editor." The extension system unlocked demand nobody could predict.

---

## 2. Research

### 2.1 Case Study: Claude Code — "Hackable by Design"

Source: [AI & I Podcast — Inside Claude Code](https://podcasts.apple.com/us/podcast/inside-claude-code-from-the-engineers-who-built-it/id1719789201?i=1000734060623), [Every.to Transcript](https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it), [Pragmatic Engineer — How Claude Code is Built](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built), [Cloud Native Now — How Anthropic Dogfoods](https://cloudnativenow.com/editorial-calendar/best-of-2025/how-anthropic-dogfoods-on-claude-code-2/)

Key quotes:
- Boris Cherny: *"Build a product in a way that is hackable, that is kind of open-ended enough that people can abuse it for other use cases."*
- Cat Wu: *"Every part of our system is extensible. So everything from your status line to adding your own slash commands through to hooks, which let you insert a bit of determinism at pretty much any step."*
- Boris Cherny: *"Every time there's a new model release, we delete a bunch of code."* — minimalism as a feature.
- 90% of Claude Code's codebase is written by Claude Code itself.
- 70-80% of technical Anthropic employees use Claude Code daily.

Claude Code's extensibility stack — **5 independently hackable layers**:

| Layer | Mechanism | What It Unlocks |
|-------|-----------|----------------|
| **Identity** | CLAUDE.md files (3 tiers: project, user, enterprise) | Institutional knowledge that persists across sessions |
| **Behavior** | Hooks (pre/post on any tool call) | Deterministic control points — "if tests don't pass, keep going" |
| **Capabilities** | MCP servers + custom slash commands | Plug in proprietary tools, internal APIs, team workflows |
| **Guardrails** | settings.json (permission allowlists) | Teams pre-allow commands, block directories — zero-prompt workflows |
| **Style** | Output modes (Explanatory, Learning, custom) | Match the tool to how you think |

Key insight: **each layer is independently hackable**. You don't need to understand hooks to customize CLAUDE.md. You don't need MCP to add slash commands. Entry points at every skill level.

Power user patterns observed internally at Anthropic:
- Large deployments check `settings.json` into codebases — permission-free workflows for entire teams
- Teams share custom slash commands as templating systems with pre-embedded bash and permission pre-allowances
- Developers use stop hooks to enforce determinism: "if the tests don't pass, keep going"
- `claude.md` used to build institutional knowledge: "add this to CLAUDE.md so next time it just knows"
- Non-technical staff (accounting, legal) execute automated workflows via plain text descriptions

### 2.2 Case Study: VS Code — "Stability Through Isolation"

Source: [VS Code Extensibility Principles](https://vscode-docs1.readthedocs.io/en/latest/extensionAPI/patterns-and-principles/), [VS Code Extension API](https://code.visualstudio.com/api/extension-capabilities/overview)

Four architectural decisions that make it work:

1. **Extension host isolation** — extensions run in a separate process. A bad extension can't crash the editor or slow startup.
2. **Manifest-driven contracts** — `package.json` declares what an extension does *before* it runs. The editor can prepare UI without executing code.
3. **Lazy activation** — extensions load only when needed (activation events). A Markdown extension doesn't consume memory until you open a `.md` file.
4. **No DOM access** — extensions use a controlled API surface, not raw UI manipulation. This lets VS Code evolve its UI without breaking extensions.

Design philosophy: **make extension authors powerful, but never let them break the core.**

### 2.3 Synthesis: The Hackability Spectrum

Successful hackable frameworks provide extension at multiple levels. Each level serves a different developer skill level and commitment:

| Level | Mechanism | Example | Barrier to Entry |
|-------|-----------|---------|-----------------|
| **1. Configure** | Toggle flags, set thresholds | `.eslintrc`, `tsconfig.json` | Zero — edit a JSON file |
| **2. Compose** | Mix and match existing pieces | Docker Compose, GitHub Actions | Low — combine known building blocks |
| **3. Extend** | Add new pieces that plug in | VS Code extensions, npm plugins | Medium — follow an API contract |
| **4. Override** | Replace built-in behavior | Webpack loaders, Rust `unsafe` | Medium-high — understand what you're replacing |
| **5. Fork & Remix** | Reshape the core | Neovim from Vim, Next.js from React | High — deep understanding of internals |

### 2.4 Core Design Principle

From both case studies, the winning formula:

> **Opinionated defaults + explicit overrides + isolation between layers**

- **Opinionated defaults**: Ship strict, structured, complete. That's the value prop.
- **Explicit overrides**: Every constraint has a named escape hatch with a clear cost. Like Rust's `unsafe` — the cost is visible, the decision is documented.
- **Isolation between layers**: Customizing one thing doesn't break another. A bad custom workflow can't crash the gate system. A custom persona can't corrupt state.json.

---

## 3. Current State — iSDLC Extensibility Audit

### 3.1 What iSDLC Already Has

| Hackability Level | iSDLC Mechanism | Coverage |
|-------------------|----------------|----------|
| **1. Configure** | `settings.json`, `providers.yaml`, constitution thresholds | Partial — thresholds exist but aren't user-facing |
| **2. Compose** | Workflow definitions (feature, fix, upgrade, test-run, test-generate) | Fixed — users can't create or modify workflows |
| **3. Extend** | External skills (`/isdlc skill add`), MCP servers | Present — skill authoring works but isn't easy |
| **4. Override** | Constitution articles (partially) | Weak — constitution is editable but no override/composition model |
| **5. Fork & Remix** | Not supported | None |

### 3.2 Gap Analysis — Where Latent Demand Is Hiding

| Area | Current State | What Developers Might Want | Hackability Level |
|------|--------------|---------------------------|-------------------|
| **Workflows** | 6 fixed types | Custom workflows: `spike`, `hotfix`, `ui-feature`, `data-migration` | 2. Compose |
| **Phase sequences** | Fixed per workflow type | Composable phases: pick and choose from phase library | 2. Compose |
| **Gate thresholds** | Single strictness level | Profiles: `rapid`, `standard`, `strict` per project or per workflow | 1. Configure |
| **Roundtable depth** | One depth: thorough | Adaptive: `brief`, `standard`, `deep` based on task complexity | 1. Configure |
| **Agent personas** | Fixed (Maya, Alex, Jordan) | Add/remove/tune personas: add security reviewer, skip architect | 4. Override |
| **Phase hooks** | Framework-internal only | User-space hooks: post-implementation SAST, pre-gate custom lint | 3. Extend |
| **Domain validation** | None — framework is domain-agnostic | Plug in domain-specific validators (XML schema, API contract, visual regression) | 3. Extend |
| **Workflow recovery** | Cancel and restart from scratch | Retry current phase, rollback to earlier phase, fork workflow | 1. Configure (redo) / 2. Compose (rollback) |
| **Skill authoring** | External skills work but no scaffold | `isdlc skill create` scaffold + local skill registry | 3. Extend |
| **Constitution** | Per-project markdown, not composable | Base + project articles, team-shared article sets | 4. Override |
| **Templates** | None | Project-local file templates that agents use during implementation | 3. Extend |
| **Implementation summary** | None — developer sees raw file changes | Structured change summary with requirement tracing after each phase | Built-in |
| **Context carry-forward** | Artifacts persist on disk but new workflows don't read them | Detect prior analysis for same area, offer to reuse | Built-in |

### 3.3 Mapping to Claude Code Layers

| Claude Code Layer | iSDLC Equivalent | Gap |
|-------------------|-----------------|-----|
| CLAUDE.md (identity) | Constitution + CLAUDE.md | Constitution not composable (no inheritance/override) |
| Hooks (behavior) | Hook system (26 hooks) | Hooks are framework-internal, not user-extensible |
| MCP/slash commands (capabilities) | Skills (246) + external skills | Skill authoring possible but not scaffolded |
| settings.json (guardrails) | Gate profiles in iteration-requirements.json | Not user-facing — no named profiles, no per-project override |
| Output modes (style) | Agent personas (Maya, Alex, Jordan) | Fixed — can't add, remove, or tune |

---

## 4. What to Build — The Extensibility Architecture

### 4.1 Layer 1: Configure (lowest barrier — edit a file)

#### 4.1.1 Gate Profiles

Named profiles that adjust gate strictness. Set once, applies to all workflows.

```json
"gate_profiles": {
  "rapid": {
    "description": "Minimal gates for simple changes or trusted developers",
    "min_coverage_percent": 60,
    "constitutional_validation": false,
    "interactive_elicitation": { "min_menu_interactions": 1 },
    "test_iteration": { "max_iterations": 3 }
  },
  "standard": {
    "description": "Default — balanced rigor for most work",
    "min_coverage_percent": 80
  },
  "strict": {
    "description": "Maximum rigor for critical/regulated code",
    "min_coverage_percent": 95,
    "require_mutation_testing": true
  }
}
```

- Per-project default in constitution or `.isdlc/config.json`
- Override per-workflow via natural language ("quick build" → rapid, default → standard, "this is critical" → strict)
- Profile selected at workflow start, applied to all gates

#### 4.1.2 Roundtable Depth Control

Adaptive analysis depth based on task complexity.

- `brief`: 1-2 questions per topic, accept user framing, skip probing
- `standard`: current behavior (3-5 questions per topic, probe edge cases)
- `deep`: exhaustive (6+ questions, challenge every assumption)

Infrastructure already exists — topic files have `depth_guidance` with all three levels. What's missing: depth selection isn't wired to the roundtable agent.

Natural language detection:
- "quick", "simple", "just", "straightforward" → suggest brief
- Default → standard
- "thorough", "careful", "complex", "critical" → suggest deep

#### 4.1.3 Workflow Recovery (Retry / Redo / Rollback)

Phase-level recovery without restarting the entire workflow.

| Level | What It Does | Invisible Trigger |
|-------|-------------|-------------------|
| **Redo** | Reset current phase, keep all prior work | "try again", "redo this", "that's wrong" |
| **Rollback** | Go back to a specific phase, redo from there | "go back to requirements", "the design was wrong" |

Implementation:
- `workflow-retry.cjs` — clears current phase iteration state (test iterations, constitutional validation, elicitation). Does not change `current_phase_index`.
- `workflow-rollback.cjs` — resets `current_phase_index` to target, marks subsequent phases `pending`. Preserves artifacts on disk so agent can read and revise.
- Governance: G3b already has exception "supervised redo" — this implements it.

### 4.2 Layer 2: Compose (combine existing pieces)

#### 4.2.1 Custom Workflow Definitions

User-defined workflows that compose from the existing phase library.

```yaml
# .isdlc/workflows/spike.yaml
name: Spike
description: Quick exploration — no gates, no branch
phases: [00-quick-scan, 06-implementation]
gate_mode: permissive
requires_branch: false
```

```yaml
# .isdlc/workflows/hotfix.yaml
name: Hotfix
description: Emergency fix — minimal gates
phases: [06-implementation, 16-quality-loop]
gate_mode: strict
gate_profile: rapid
requires_branch: true
```

```yaml
# .isdlc/workflows/ui-feature.yaml
name: UI Feature
description: Frontend work — emphasize design over architecture
phases: [00-quick-scan, 01-requirements, 04-design, 06-implementation, 16-quality-loop, 08-code-review]
gate_mode: strict
agent_modifiers:
  04-design: { scope: component-design }
  16-quality-loop: { scope: visual-quality }
requires_branch: true
```

Rules:
- Phase library is fixed (framework-defined). Sequencing is user-controlled.
- Custom workflows validated on load: phases must exist, sequences must be valid.
- Framework discovers `.isdlc/workflows/*.yaml` at startup.
- Intent detection extended: custom workflows can declare trigger keywords.

#### 4.2.2 Context Carry-Forward

When a developer starts a new workflow targeting the same area as a previous one:
- Detect existing artifacts in `docs/requirements/` by slug/keyword match
- Offer: "I see prior analysis for this area. Use it as starting context?"
- Reuse artifacts reduce rework — requirements spec, impact analysis, architecture decisions carry forward.

### 4.3 Layer 3: Extend (add new pieces that plug in)

#### 4.3.1 User-Space Hooks

Extension point for domain-specific tooling. Distinct from framework hooks (`src/claude/hooks/`).

```
.isdlc/hooks/
  post-implementation/     ← runs after phase 06 completes
    my-sast-scan.sh
    xml-validator.sh
  post-code-review/        ← runs after phase 08
    jira-updater.sh
  pre-gate/                ← runs before any gate advancement
    custom-lint.sh
  post-workflow/           ← runs after workflow finalize
    slack-notification.sh
```

Execution model:
- Scripts are shell commands (any language)
- Executed sequentially in alphabetical order within each hook point
- Exit 0 = pass, exit 1 = warning (shown to user), exit 2 = block (prevents gate advancement)
- stdout captured and shown to developer
- Timeout: 60 seconds per hook (configurable in `.isdlc/config.json`)
- Hook points: `pre-gate`, `post-{phase-name}`, `post-workflow`, `pre-workflow`

Discovery: framework scans `.isdlc/hooks/` at relevant trigger points. No registration needed — drop a script, it runs.

#### 4.3.2 Skill Authoring Scaffold

Make it easy for developers to capture their own best practices as reusable skills.

- `isdlc skill create "React component best practices"` → generates scaffold in `.isdlc/skills/`
- Local skill registry — skills available to agents during workflow execution
- Share skills across projects by publishing to a shared directory or repo

#### 4.3.3 Template System

Project-local templates that agents use during implementation.

```
.isdlc/templates/
  react-component.template    ← "when creating a React component, use this structure"
  migration.template          ← "when creating a DB migration, follow this pattern"
  api-endpoint.template       ← "when adding an API endpoint, include these elements"
```

Agents read templates during implementation phase and apply them to generated code. Ensures team conventions are followed without relying on agent training data.

#### 4.3.4 Post-Implementation Change Summary

After implementation phase, automatically generate a structured summary:
- Modified files with 1-2 line rationale per file
- New files with purpose
- Requirement tracing (which FR/AC each change addresses)
- Test results summary

This is a built-in behavior change, not an extension point — but it enables the user-space hook pattern (hooks can consume the summary for notifications, Jira updates, etc.).

### 4.4 Layer 4: Override (replace built-in behavior)

#### 4.4.1 Constitution Composition

Allow base + project constitution merge for team-level sharing.

```
docs/isdlc/
  constitution.base.md       ← team-shared articles (security standards, coding practices)
  constitution.project.md    ← project-specific articles (domain constraints, tech choices)
```

Resolution:
- Base articles loaded first
- Project articles override base by article number
- New article numbers in project extend the base
- During `/discover`, offer to import a base constitution from a URL or path

Use cases:
- Company ships a base constitution with security and compliance articles
- Each project adds domain-specific articles
- Update base once → all projects inherit changes

#### 4.4.2 Persona Customization

Allow adding, removing, or tuning roundtable personas.

```
.isdlc/personas/
  security-reviewer.md       ← new persona — always included in roundtable
  maya-override.md           ← tune Maya's behavior ("skip MoSCoW, use P0-P3")
  disabled/
    jordan.md                ← disable Jordan for this project
```

Persona files follow the same format as `src/claude/agents/persona-*.md`. Framework loads project personas alongside or instead of defaults.

---

## 5. Invisible Framework Principle

All extensibility features must follow the invisible framework pattern:

> Users interact through natural conversation — they never need to know internal mechanics exist.

| Feature | Invisible Trigger | What Happens |
|---------|------------------|-------------|
| Gate profiles | "quick build" / "this is critical" | Profile selected automatically |
| Roundtable depth | "just add a config flag" / default / "think through carefully" | Depth adjusted automatically |
| Retry/redo | "try again" / "that's wrong" | Phase reset, no commands |
| Rollback | "go back to requirements" | Phase rollback with confirmation |
| Custom workflows | "spike on this" / "hotfix for prod" | Custom workflow matched by keyword |
| User-space hooks | Developer drops script in `.isdlc/hooks/` | Runs automatically at trigger point |
| Templates | Developer drops template in `.isdlc/templates/` | Agents use during implementation |
| Skill authoring | "capture this as a skill" | Scaffold created |
| Constitution composition | Set up during `/discover` | Merged automatically |
| Persona customization | Drop file in `.isdlc/personas/` | Loaded at roundtable start |
| Change summary | Automatic after implementation | No request needed |
| Context carry-forward | "work on X" where X has prior analysis | Offer to reuse |

Slash command equivalents exist for power users and backward compatibility, but the default path is always conversational.

---

## 6. Priority & Sequencing

### Tier 1: Foundation (enables everything else)

| Item | Layer | Effort | Rationale |
|------|-------|--------|-----------|
| Gate profiles | Configure | Medium | Every subsequent feature needs configurable strictness |
| Workflow recovery (retry/redo/rollback) | Configure | Medium | Core developer experience gap — can't recover from mistakes |
| Roundtable depth control | Configure | Low | Quick win — infrastructure exists, just needs wiring |

### Tier 2: Extension Points (platform primitives)

| Item | Layer | Effort | Rationale |
|------|-------|--------|-----------|
| User-space hooks | Extend | Medium | Enables domain-specific tooling without framework changes |
| Custom workflow definitions | Compose | Medium-Large | Unlocks spike, hotfix, ui-feature, data-migration, etc. |
| Post-implementation change summary | Built-in | Low-Medium | Transparency — feeds into hooks and notifications |

### Tier 3: Developer Productivity

| Item | Layer | Effort | Rationale |
|------|-------|--------|-----------|
| Template system | Extend | Medium | Enforce team conventions during implementation |
| Skill authoring scaffold | Extend | Medium | Make best practices capturable and shareable |
| Context carry-forward | Built-in | Medium | Reduce rework across related workflows |

### Tier 4: Team & Organization Scale

| Item | Layer | Effort | Rationale |
|------|-------|--------|-----------|
| Constitution composition | Override | Medium | Team-level sharing of quality standards |
| Persona customization | Override | High | Most differentiating — reshape how analysis works |

### Recommended Build Order

```
Tier 1 (foundation):
  Gate profiles → Workflow recovery → Roundtable depth
                                          │
Tier 2 (extension points):                ▼
  User-space hooks → Custom workflows → Change summary
                                          │
Tier 3 (productivity):                    ▼
  Templates → Skill scaffold → Context carry-forward
                                          │
Tier 4 (organization):                    ▼
  Constitution composition → Persona customization
```

Each tier builds on the previous. Tier 1 items are prerequisites for making Tier 2 items meaningful (e.g., custom workflows need gate profiles to be useful — a `spike` workflow needs `rapid` gates).

---

## 7. Validation Signals

Early user feedback that confirms latent demand exists in these areas:

| Feedback | Maps To | Tier |
|----------|---------|------|
| "Having to start from the beginning" | Workflow recovery | 1 |
| "Many questions at roundtable" | Roundtable depth control | 1 |
| "Hard time confirming changes" (domain-specific XML) | User-space hooks + change summary | 2 |
| "Not very helpful for UI changes" | Custom workflow definitions | 2 |
| "Considering as a new issue is difficult" | Context carry-forward | 3 |

These are early signals from 2 developers — they validate the direction but do not define the scope. The extensibility architecture is designed generically so it solves these specific cases and any future cases we can't predict.

---

## Appendix A: Enactor Process XML — Example Domain Validator

This section captures a concrete example of the kind of domain-specific tooling that user-space hooks (4.3.1) enable. It is NOT a framework feature — it's an example of what a team would build using the extension point.

### Context

Enactor process XMLs represent visual state machine workflows (rendered in an Eclipse plugin). The XML encodes actions, outcome links, conditions, data mappings, and UI layout hints. When Claude modifies these XMLs, there's no local way to verify correctness without the Eclipse plugin.

### What a Validator Would Check

| # | Check | Severity | Description |
|---|-------|----------|-------------|
| 1 | Reachability | Error | Every action reachable from a state entry point |
| 2 | Data pipeline | Error | Every `required="true"` input has a matching upstream output |
| 3 | State data types | Warning | Every stateDataType has a source |
| 4 | Iterator wiring | Error | Iterator states have Iterable mapped and IteratorItem available |
| 5 | Outcome coverage | Warning | Every declared outcome has a matching outcomeLink |
| 6 | Condition sanity | Warning | Referenced fields exist in declared data types |
| 7 | Orphan actions | Warning | No unreachable actions |
| 8 | End state coverage | Warning | All terminal paths reach an endProcessAction |

### How It Plugs In

```
.isdlc/hooks/
  post-implementation/
    enactor-process-validator.sh    ← team-authored hook
.isdlc/tools/
    enactor-validator.js            ← team-authored validator
```

The framework doesn't know about Enactor. The team drops their validator in the hooks directory. It runs automatically after every implementation phase.

### Patterns Identified (from 3 sample process XMLs)

1. **Iterator pattern**: State → Filter chain → LoadEntityList → Iterator State (Execute/Completed)
2. **Decision pattern**: UINullAction with conditional outcomeLinks
3. **Assignment pattern**: UIAssignAction with dataAssignment expressions
4. **Exception pattern**: Process-level or state-level eventLink for Exception.*
5. **Filter chain pattern**: Sequential AddListFilterAction building query criteria
