# Persona Authoring Guide

This guide covers how to create, override, configure, and use personas in the iSDLC roundtable analysis.

## What Are Personas?

Personas are specialized reviewers that participate in the roundtable analysis. Each persona brings domain-specific expertise (business analysis, architecture, security, etc.) and reviews your requirements and designs through that lens.

## Analysis Modes

The framework supports four analysis modes. You choose the mode at the start of each analysis.

| Mode | Description | When to Use |
|------|-------------|-------------|
| **Conversational** | Natural dialogue between active personas | Deep exploration, complex features, unfamiliar domains |
| **Bulleted** | Structured observations from each persona | Standard analysis, clear requirements, time-efficient |
| **Silent** | Personas analyze internally, no visible conversation | Fast analysis, well-understood changes, minimal overhead |
| **No-persona (straight analysis)** | Direct analysis without any persona involvement | Simple changes, documentation updates, when you want a focused pass |

### Selecting a Mode

When you run an analysis, the framework asks how you want to proceed:
- **With personas**: Choose a conversation style (conversational, bulleted, or silent), then select your roster
- **Straight analysis**: No personas loaded, no persona influence -- direct analytical pass

You can also skip the question using flags:
- `--silent` -- personas mode with silent verbosity
- `--verbose` -- personas mode with conversational verbosity
- `--no-roundtable` -- straight analysis, no personas
- `--personas "name1,name2"` -- personas mode with pre-selected roster

## Creating a New Persona

### Step 1: Start from the Domain Expert Template

Create a new file in `.isdlc/personas/` with the naming pattern `persona-{domain-name}.md`:

```markdown
---
name: persona-{domain-name}
description: "Brief description of what this persona reviews"
role_type: contributing
triggers:
  - keyword1
  - keyword2
  - keyword3
owned_skills: []
version: 1.0.0
---

# {Domain Name} Expert

You are a {domain} specialist reviewing requirements and designs.

## Your Expertise
- Area 1
- Area 2

## Review Focus
When reviewing, you focus on:
1. Concern area 1
2. Concern area 2

## Voice Rules
- Be direct and specific
- Reference industry standards where applicable
- Flag risks with severity levels
```

### Step 2: Configure Triggers

Triggers are keywords that determine when your persona is automatically recommended for an analysis. The framework matches these against the issue content.

- **2+ keyword matches** = persona is recommended
- **1 keyword match** = persona is listed as "also considering"
- **0 matches** = persona is listed as "available" (can be manually added)

Choose triggers that are distinctive to your domain.

### Step 3: Place the File

Save your persona file to `.isdlc/personas/persona-{name}.md`. The framework discovers it automatically.

## Frontmatter Schema

Every persona file requires YAML frontmatter with these fields:

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | **Yes** | string | Unique identifier matching the filename (e.g., `persona-security-reviewer`) |
| `description` | No | string | Brief description shown in roster proposals |
| `role_type` | No | string | `primary` or `contributing` (default: `contributing`) — see Persona Extensibility Model |
| `triggers` | No | string[] | Keywords for automatic recommendation matching |
| `owned_skills` | No | string[] | Skill IDs this persona is associated with |
| `version` | No | string | Semver version for override drift detection |

Promoted personas (`role_type: primary`) declare additional fields (`owns_state`, `template`, `inserts_at`, `rendering_contribution`). See **Persona Extensibility Model → Promotion Schema** below for the full schema.

## Persona Extensibility Model

The roundtable state machine is extensible. Personas can participate in one of two ways:

### Contributing Personas (default)

Contributing personas fold their observations into state-owned confirmations presented by the core primary personas (Business Analyst, Solutions Architect, System Designer). They do not own their own confirmation state — their insights are woven into existing requirements, architecture, design, and tasks confirmations.

**Characteristics**:
- `role_type: contributing` (default when omitted)
- No separate confirmation state
- Recommendations from security, devops, UX, QA, performance reviewers surface within primary persona confirmations
- Zero-touch: works with no additional frontmatter fields

**When to use**: For domain specialists whose input enriches existing confirmations but who do not need their own Accept/Amend cycle. This is the right choice for most custom personas.

### Promoted Personas

Promoted personas own their own confirmation state in the roundtable state machine. They present a dedicated domain artifact using their own template and participate in the Accept/Amend cycle independently.

**Characteristics**:
- `role_type: primary`
- Owns a declared state (e.g., `data_architecture`)
- Binds a state-local template (e.g., `data-architecture.template.json`)
- Inserts into the state machine at a declared extension point (e.g., `after:architecture`)

**When to use**: For domain areas that require their own first-class confirmation artifact distinct from the default requirements/architecture/design/tasks flow. Examples: data architecture for data-heavy systems, compliance review for regulated domains, API contract confirmation for contract-first projects.

### Promotion Schema

A promoted persona's frontmatter MUST declare the following fields. The runtime composer (`src/core/roundtable/runtime-composer.js`) validates these at session build time.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `role_type` | **Yes** | `"primary"` | Marks this persona as promoted |
| `owns_state` | **Yes** | string | State name the persona owns (e.g., `data_architecture`). Must match `[a-z_]+` |
| `template` | **Yes** | string | Template filename ending in `.template.json` (e.g., `data-architecture.template.json`) |
| `inserts_at` | **Yes** | string | Extension point — see taxonomy below. Format: `(before\|after):(requirements\|architecture\|design\|tasks)` |
| `rendering_contribution` | No | string | `"ownership"` (default) or `"rendering-only"` |

**Validation rules** (per `validatePromotionFrontmatter` in `src/core/roundtable/runtime-composer.js`):

- `role_type === "primary"` requires `owns_state`, `template`, and `inserts_at` — all three must be present
- `owns_state` must be a non-empty string matching the regex `[a-z_]+` (lowercase letters and underscores only)
- `template` must end with `.template.json`
- `inserts_at` must match `(before|after):(requirements|architecture|design|tasks)`
- `rendering_contribution` (when present) must be exactly `"ownership"` or `"rendering-only"`

**Fail-open behavior**: Invalid promotion frontmatter does not block analysis. The composer emits a warning and treats the persona as contributing for that session.

### Extension-Point Taxonomy

The stable, named extension points where promoted personas may insert their owned state:

| Extension Point | Insertion Position |
|-----------------|-------------------|
| `before:requirements` | Before the requirements confirmation (useful for discovery/context-gathering personas) |
| `after:requirements` | Between requirements and architecture (useful for compliance or policy review) |
| `after:architecture` | Between architecture and design (useful for data architecture, API contracts) |
| `after:design` | Between design and tasks (useful for quality gate reviewers) |
| `after:tasks` | After tasks, before finalization (useful for handoff or release reviewers) |

Extension points are parsed into `{before|after}:{state_name}`. Unknown extension points are rejected with a warning.

### Examples

**Contributing persona** (existing convention, unchanged):

```yaml
---
name: persona-security-reviewer
role_type: contributing
domain: security
triggers: [auth, encryption, OWASP]
owned_skills: [SEC-001]
---
```

**Promoted persona** (new schema):

```yaml
---
name: persona-data-architect
role_type: primary
domain: data_architecture
owns_state: data_architecture
template: data-architecture.template.json
inserts_at: after:architecture
rendering_contribution: ownership
owned_skills: []
---
```

**Invalid promoted persona** (missing required fields):

```yaml
---
name: persona-broken
role_type: primary
domain: mystery
# MISSING: owns_state, template, inserts_at
---
```

Composer result: warning emitted, persona treated as contributing for this analyze session.

### Conflict Resolution

When two or more promoted personas declare the same `inserts_at` value, the runtime composer applies **first-declared wins** resolution:

- The first persona encountered (by file load order) retains its insertion position
- Subsequent personas targeting the same point are rejected for that session
- A warning is emitted: `WARN: Insertion conflict at '{point}': first-wins -> {chosen}`
- Analysis continues — the composer never blocks

The runtime composer emits warnings through the `persona-extension-composer-validator.cjs` hook. Warnings surface in the analysis output but do not halt the roundtable.

**Recommendation**: If two promoted personas genuinely need to participate at the same point, use distinct `inserts_at` values (e.g., one at `after:architecture`, the other at `after:design`) or collapse them into a single composite persona.

### Migration

**Existing contributing personas** (e.g., `persona-security-reviewer`, `persona-devops-engineer`, `persona-ux-reviewer`, `persona-qa-tester`, `persona-performance-engineer`): Zero-touch. They continue to work as-is with no frontmatter changes required. The default `role_type: contributing` is applied when `role_type` is omitted.

**Adding a new contributing persona**: Create `persona-{name}.md` in `.isdlc/personas/` with `role_type: contributing` (or omit the field). No promotion fields are needed.

**Promoting an existing persona** to primary status:

1. Open the persona's `.md` file
2. Change or add `role_type: primary` in the frontmatter
3. Add the three required promotion fields:
   - `owns_state: <snake_case_state_name>`
   - `template: <name>.template.json`
   - `inserts_at: <before|after>:<requirements|architecture|design|tasks>`
4. Optionally declare `rendering_contribution` (defaults to `ownership`)
5. Create the declared template file under the framework template directory
6. Run the analysis — the composer validates the promotion and inserts the new state

**Rollback**: To revert a promoted persona to contributing, change `role_type` back to `contributing` and remove the promotion fields. The composer will ignore the promotion schema.

## Overriding a Built-in Persona

To customize a built-in persona (e.g., the Business Analyst):

1. Copy the built-in file to your user personas directory:
   ```
   cp src/claude/agents/persona-business-analyst.md .isdlc/personas/persona-business-analyst.md
   ```
2. Edit the copy in `.isdlc/personas/` to match your needs
3. The framework uses your version instead of the built-in (override-by-copy)

**Version drift detection**: If the built-in persona is updated to a newer version than your override, the framework warns you so you can review the changes.

## Disabling Personas via Config

To exclude personas from automatic recommendations, add them to your `.isdlc/roundtable.yaml`:

```yaml
# Verbosity preference (pre-populates the style question)
verbosity: bulleted

# Personas to include in recommendations by default
default_personas:
  - security-reviewer
  - devops-engineer

# Personas to exclude from recommendations (still available for manual add)
disabled_personas:
  - ux-reviewer
```

Note: `disabled_personas` are excluded from automatic recommendations but remain available. You can still add them manually to any analysis roster.

### Config as Pre-population

The config file pre-populates your preferences -- it does not enforce them silently. You are always asked to confirm or change:
- **verbosity**: Pre-selects the conversation style option
- **default_personas**: Included in the recommended roster
- **disabled_personas**: Excluded from recommendations but shown as available

## Built-in Personas

The framework ships with these personas:

### Primary (recommended by default)
- **Business Analyst** (Maya Chen) -- requirements clarity, user journeys, acceptance criteria
- **Solutions Architect** (Alex Rivera) -- system design, integration points, scalability
- **System Designer** (Jordan Park) -- module design, interfaces, implementation patterns

### Contributing (recommended by trigger match)
- **Security Reviewer** -- authentication, authorization, OWASP, input validation
- **DevOps Engineer** -- CI/CD, deployment, infrastructure, monitoring
- **UX Reviewer** -- user experience, accessibility, interaction design
- **QA Tester** -- test strategy, edge cases, quality assurance
- **Performance Engineer** -- performance, scalability, resource optimization

## Tips

- **Start simple**: Use the built-in personas first. Add custom ones when you have recurring domain needs.
- **Keep triggers specific**: Generic triggers (like "code" or "feature") match too broadly. Use domain-specific terms.
- **Version your personas**: Increment the version when making significant changes so drift detection works correctly.
- **One persona per file**: Each `.md` file represents exactly one persona.
