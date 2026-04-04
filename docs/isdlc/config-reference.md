# Configuration Reference

All user-configurable settings live in a single file: `.isdlc/config.json`

This file is created automatically on install with default values. Edit it to customize framework behavior.

---

## Sections

### `cache`

Controls the session cache that injects project context into every conversation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `budget_tokens` | number | `100000` | Maximum tokens allocated to session cache content |
| `section_priorities` | object | *(see below)* | Priority weights for cache sections (higher = included first) |

**Default `section_priorities`**:

| Section | Default Priority |
|---------|-----------------|
| `CONSTITUTION` | 100 |
| `WORKFLOW_CONFIG` | 90 |
| `ITERATION_REQUIREMENTS` | 85 |
| `ARTIFACT_PATHS` | 80 |
| `SKILLS_MANIFEST` | 75 |
| `SKILL_INDEX` | 70 |
| `EXTERNAL_SKILLS` | 65 |
| `ROUNDTABLE_CONTEXT` | 60 |
| `DISCOVERY_CONTEXT` | 50 |
| `INSTRUCTIONS` | 40 |

### `ui`

Controls user interface behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `show_subtasks_in_ui` | boolean | `true` | Show sub-task progress entries in the Claude task list |

### `provider`

Controls the LLM provider selection.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default` | string | `"claude"` | Default provider: `"claude"` or `"codex"` |

### `roundtable`

Controls roundtable analysis behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `verbosity` | string | `"bulleted"` | Output format: `"bulleted"` or `"prose"` |
| `default_personas` | string[] | `["persona-business-analyst", "persona-solutions-architect", "persona-system-designer"]` | Active personas for roundtable analysis |
| `disabled_personas` | string[] | `[]` | Personas to exclude from all analyses |

### `search`

Controls the search backend configuration. Empty by default — backends are auto-detected.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| *(extensible)* | object | `{}` | Search backend settings (populated by `isdlc setup-knowledge`) |

### `workflows`

Controls workflow sizing and performance budgets.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sizing_thresholds.light_max_files` | number | `5` | Max affected files for light workflow sizing |
| `sizing_thresholds.epic_min_files` | number | `20` | Min affected files for epic workflow sizing |
| `performance_budgets` | object | `{}` | Per-tier time budgets (populated from `workflows.json` defaults) |

---

## Example

```json
{
  "cache": {
    "budget_tokens": 150000
  },
  "ui": {
    "show_subtasks_in_ui": false
  },
  "roundtable": {
    "verbosity": "bulleted",
    "disabled_personas": ["persona-ux-reviewer"]
  }
}
```

Only include the fields you want to override. Missing fields use defaults.

---

## Files NOT in config.json

| File | Location | Purpose | Editable? |
|------|----------|---------|-----------|
| `state.json` | `.isdlc/` | Runtime workflow state | No (machine-managed) |
| `roundtable-memory.json` | `.isdlc/` | Session memory | No (machine-managed) |
| `finalize-steps.md` | `.isdlc/config/` | Post-workflow checklist | Yes (process definition) |
| `workflows/*.yaml` | `.isdlc/workflows/` | Custom workflow definitions | Yes (optional) |
| `settings.json` | `.claude/` | Claude Code harness config | Yes (Claude-specific) |
| `constitution.md` | `docs/isdlc/` | Project governance | Yes (document) |
