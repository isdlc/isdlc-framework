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
| `role_type` | No | string | `primary` or `contributing` (default: `contributing`) |
| `triggers` | No | string[] | Keywords for automatic recommendation matching |
| `owned_skills` | No | string[] | Skill IDs this persona is associated with |
| `version` | No | string | Semver version for override drift detection |

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
