# iSDLC Framework Configuration

This directory contains the canonical framework configuration files shipped with iSDLC. User-specific project configuration lives in `.isdlc/config.json` at the project root.

## User Config: `.isdlc/config.json`

The user config file is optional. When absent, all values fall back to defaults. Partial configs are merged with defaults on read (see `src/core/config/config-defaults.js`).

An example is available at `.isdlc/config/config.json.example`.

### Sections

#### `task_display`
UI preferences for sub-task visibility.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `show_subtasks_in_ui` | boolean | `true` | Display sub-tasks in the Claude Code task list UI. |

#### `atdd` (REQ-GH-216)

Controls Acceptance-Test-Driven-Development (ATDD) behavior across Phase 05, Phase 06, and the discover flow. ATDD is **default-on** — the `atdd` section is an escape-hatch, not an opt-in.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master kill switch. When `false`, all sub-behaviors become no-ops regardless of sub-knob values. |
| `require_gwt` | boolean | `true` | When `true`, Phase 05 hard-blocks on acceptance criteria lacking Given/When/Then structure. When `false`, Phase 05 generates best-effort scaffolds and flags them as `non_gwt: true` in atdd-checklist.json. |
| `track_red_green` | boolean | `true` | When `true`, the test-watcher hook records RED→GREEN transitions in atdd-checklist.json and detects orphan `test.skip()` calls. When `false`, no transition tracking. |
| `enforce_priority_order` | boolean | `true` | When `true`, Phase 06 requires test completion in priority order (P0 → P1 → P2 → P3). When `false`, any order is accepted. |

All four knobs default to `true`, so the default experience is full ATDD enforcement. Omitting the `atdd` section entirely is equivalent to setting every knob to `true`.

**Precedence**: When `enabled: false`, all sub-knobs are logically irrelevant — the master kill switch wins.

**Partial overrides**: You can override a single knob while letting the others default. Example:
```json
{
  "atdd": {
    "require_gwt": false
  }
}
```
Resolves to: `{ enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: true }`.

**Disable ATDD entirely**:
```json
{
  "atdd": {
    "enabled": false
  }
}
```

## Framework Configs

These files are shipped with iSDLC and are not meant to be edited by users. User customization happens via `.isdlc/config.json`.

| File | Purpose |
|------|---------|
| `workflows.json` | Workflow definitions (build, test-run, test-generate, upgrade, discover). |
| `iteration-requirements.json` | Per-phase gate requirements and iteration limits. |
| `skills-manifest.json` | Registered skills and their metadata. |
| `artifact-paths.json` | Required artifact paths per phase. |
| `phase-topology.json` | Phase sequence definitions. |
| `roundtable.yaml` | Roundtable persona definitions. |
| `testing-standards.yaml` | Testing conventions and thresholds. |
| `coding-standards.yaml` | Code quality conventions. |
