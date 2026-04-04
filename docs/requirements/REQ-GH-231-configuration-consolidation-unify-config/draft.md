# Configuration consolidation: unify config locations, eliminate duplicates, single config service

**Source**: GitHub #231
**Type**: REQ (Feature)

## Summary

Configuration is spread across ~45 files in 6 directories, 3 formats (JSON, YAML, MD), with at least 3 sets of duplicates and 5 different config readers. This creates confusion about where config lives, which files users can edit, and which is the source of truth when duplicates diverge.

## Problems

### 1. Duplicate files (same data, multiple locations)
- **Skills manifest**: `src/claude/hooks/config/skills-manifest.json` + `src/claude/hooks/config/skills-manifest.yaml` + `src/isdlc/config/skills-manifest.yaml` — 3 copies
- **Phase ordering**: `src/claude/hooks/config/phase-topology.json` + `src/isdlc/config/phase-ordering.json` — overlapping
- **JSON schemas**: `src/core/config/schemas/` + `src/claude/hooks/config/schemas/` — 7 files each, likely mirrors

### 2. Split config.json identity crisis
- `.isdlc/config.json` — read by `common.cjs:readConfig()` for budget_tokens
- `.isdlc/config/config.json` — read by agents for show_subtasks_in_ui
- Two different paths for user project config with no clear reason for the split

### 3. Too many config directories (6)
- `.isdlc/` and `.isdlc/config/` (runtime)
- `src/claude/hooks/config/` (hook config)
- `src/isdlc/config/` (framework config)
- `src/core/config/` (core config)
- `src/claude/config/` (claude config)

### 4. Mixed formats with no convention
- JSON for some (workflows, manifests, routing, schemas)
- YAML for others (providers, roundtable, standards, cloud config)
- No documented rule for when to use which

### 5. No unified config service
- Hooks use `common.cjs:_loadConfigWithCache()` — own caching layer
- Core uses `src/core/config/index.js` — separate loader
- Search uses `lib/search/config.js` — own reader
- State uses `src/core/state/` — another module
- Roundtable uses `roundtable-config.cjs` — yet another

### 6. Shipped vs runtime boundary is blurry
- Framework-shipped config (`src/`) should never be edited by users
- Runtime config (`.isdlc/`) is user-customizable
- Boundary isn't enforced or documented

## Full inventory

### Runtime (`.isdlc/` — user-facing)
- `state.json` — runtime state
- `config.json` — user config (budget_tokens, cache tier)
- `config/config.json` — user config (show_subtasks_in_ui)
- `config/finalize-steps.md` — finalize checklist
- `roundtable.yaml` — roundtable persona config
- `roundtable-memory.json` — roundtable memory state
- `search-config.json` — search backend config
- `providers.yaml` — LLM provider selection

### Claude provider (`src/claude/`)
- `settings.json` — hooks, MCP servers, permissions
- `settings.local.json` — user overrides (gitignored)
- `config/tech-stack-skill-mapping.yaml`

### Hook config (`src/claude/hooks/config/`)
- `iteration-requirements.json`, `skills-manifest.json`, `skills-manifest.yaml`
- `tool-routing.json`, `mcp-tool-routing.json`
- `artifact-paths.json`, `phase-topology.json`, `protocol-mapping.json`
- `profile-schema.json`, `provider-defaults.yaml`
- `contracts/` (5 files), `schemas/` (7 files), `templates/` (8 files)

### Framework config (`src/isdlc/config/`)
- `workflows.json`, `defaults.yaml`, `coding-standards.yaml`
- `testing-standards.yaml`, `roundtable.yaml`, `skills-manifest.yaml`
- `cloud-config-schema.yaml`, `phase-ordering.json`, `reserved-verbs.json`

### Core config (`src/core/config/`)
- `index.js`, `phase-ids.js`, `schemas/` (7 files)

## Scope
This is analysis-only for now — the fix will need careful migration planning since hooks and agents read these paths at runtime.
