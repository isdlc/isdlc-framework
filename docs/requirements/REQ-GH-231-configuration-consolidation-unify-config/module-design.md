# Module Design: Configuration Consolidation

**Item**: REQ-GH-231
**Status**: Accepted

---

## 1. Module Overview

| Module | Path | Responsibility | Status |
|--------|------|----------------|--------|
| config-service | `src/core/config/config-service.js` | Unified config reader — framework config, user config, schemas | CREATE |
| config-bridge | `src/core/bridge/config.cjs` | CJS bridge for hooks to call config-service synchronously | CREATE |
| config-defaults | `src/core/config/config-defaults.js` | Default values for unified user config | CREATE |

## 2. Module Design

### 2.1 config-service.js

**Responsibility**: Single entry point for all config reads across the framework.

**Public interface**:

```js
// Read a shipped framework config file by name
// Reads from src/isdlc/config/{name}.json with mtime-based caching
// Returns parsed JSON or null if missing
export function loadFrameworkConfig(name) {}

// Read user project config
// Reads .isdlc/config.json, deep-merges with defaults from config-defaults.js
// Returns full ProjectConfig object (never null — defaults fill gaps)
// Missing file → full defaults (fail-open, Article X)
// Malformed JSON → warn to stderr, full defaults
export function readProjectConfig(projectRoot) {}

// Read a JSON schema by ID
// Reads from src/isdlc/config/schemas/{schemaId}.schema.json
// Cached by mtime
export function loadSchema(schemaId) {}

// Get the absolute path to user config file
// Used by installer/updater for config creation
export function getConfigPath(projectRoot) {}

// Clear internal caches (for testing)
export function clearConfigCache() {}
```

**Internal state**:
- `_configCache: Map<string, { data, mtime }>` — mtime-based cache for framework configs
- `_projectConfigCache: Map<string, { data, mtime }>` — mtime-based cache for user configs

**Caching strategy** (preserving `_loadConfigWithCache` behavior):
1. On read: check if file mtime has changed since last cache entry
2. If unchanged: return cached parsed object
3. If changed or missing: re-parse, update cache, return
4. Cache key: absolute file path

**Dependencies**: `node:fs`, `node:path`, `config-defaults.js`

### 2.2 config-bridge.cjs

**Responsibility**: Synchronous CJS wrapper so hooks can call config-service.

```js
// CJS bridge — synchronous interface for hooks
// Uses require() to load the ESM module via dynamic import cached at startup

module.exports = {
  loadFrameworkConfig(name) {},
  readProjectConfig(projectRoot) {},
  loadSchema(schemaId) {},
  getConfigPath(projectRoot) {},
  clearConfigCache() {},
};
```

**Implementation note**: Since hooks are CJS and config-service is ESM, the bridge uses the same pattern as existing bridges in `src/core/bridge/` — either `createRequire` for JSON reads or synchronous file reads with `JSON.parse`.

### 2.3 config-defaults.js

**Responsibility**: Single source of truth for all user config defaults.

```js
export const DEFAULT_PROJECT_CONFIG = {
  cache: {
    budget_tokens: 100000,
    section_priorities: {
      CONSTITUTION: 100,
      WORKFLOW_CONFIG: 90,
      ITERATION_REQUIREMENTS: 85,
      ARTIFACT_PATHS: 80,
      SKILLS_MANIFEST: 75,
      SKILL_INDEX: 70,
      EXTERNAL_SKILLS: 65,
      ROUNDTABLE_CONTEXT: 60,
      DISCOVERY_CONTEXT: 50,
      INSTRUCTIONS: 40,
    },
  },
  ui: {
    show_subtasks_in_ui: true,
  },
  provider: {
    default: "claude",
  },
  roundtable: {
    verbosity: "bulleted",
    default_personas: [
      "persona-business-analyst",
      "persona-solutions-architect",
      "persona-system-designer",
    ],
    disabled_personas: [],
  },
  search: {},
  workflows: {
    sizing_thresholds: {
      light_max_files: 5,
      epic_min_files: 20,
    },
    performance_budgets: {},
  },
};
```

## 3. Changes to Existing Modules

### 3.1 common.cjs (MODIFY)

- Remove `_configCache` Map and `_loadConfigWithCache()` function body
- Replace with: `const configBridge = require('../../../core/bridge/config.cjs');` then delegate
- Remove `readConfig()` function body — replace with `configBridge.readProjectConfig(root)`
- Remove `DEFAULT_CONFIG` constant — now in `config-defaults.js`
- All callers of `_loadConfigWithCache(path, name)` become `configBridge.loadFrameworkConfig(name)`

### 3.2 roundtable-config.cjs (DELETE — 216 lines)

- All callers (`common.cjs:4520`) switch to `configBridge.readProjectConfig(root).roundtable`
- Hand-rolled YAML parser eliminated
- `formatConfigSection()` utility moves to config-service if still needed

### 3.3 lib/search/config.js (MODIFY)

- Delete `readSearchConfig()` — callers use `readProjectConfig(root).search`
- Keep `writeSearchConfig()` if any callers need to write search config programmatically
- Delete `getDefaultConfig()` — defaults in `config-defaults.js`

### 3.4 src/core/config/index.js (MODIFY)

- Remove `loadCoreProfile()`, `loadCoreSchema()`, `listCoreProfiles()`, `listCoreSchemas()`
- Keep phase-id re-exports only: `KNOWN_PHASE_KEYS`, `normalizePhaseKey`, etc.
- Callers of `loadCoreSchema` use `config-service.loadSchema()` instead

### 3.5 lib/installer.js (MODIFY)

- Simplify config copy steps: single source `src/isdlc/config/` instead of multi-source copies
- On fresh install: generate `.isdlc/config.json` with full defaults from `config-defaults.js`
- Remove skills-manifest multi-copy logic (lines 583-612)
- Remove phase-ordering copy logic (lines 617-622)

### 3.6 lib/updater.js (MODIFY)

- Add migration function: `migrateOldConfigFiles(projectRoot)`
  1. Detect old files: `config.json` (old), `config/config.json`, `providers.yaml`, `roundtable.yaml`, `search-config.json`
  2. For each existing file: parse (JSON or YAML), extract values, map to new sections
  3. Deep-merge all collected values with defaults
  4. Write unified `.isdlc/config.json`
  5. Rename old files to `{name}.bak`
  6. Log migration summary
- Simplify config copy steps (same as installer)
- Remove multi-destination copy logic for skills-manifest and phase-ordering

### 3.7 bin/rebuild-cache.js (MODIFY)

- Update skills-manifest path from `src/claude/hooks/config/skills-manifest.json` to `src/isdlc/config/skills-manifest.json`

### 3.8 src/dashboard/server.js (MODIFY)

- Update topology path from `src/claude/hooks/config/phase-topology.json` to `src/isdlc/config/phase-topology.json`

### 3.9 src/core/bridge/workflow.cjs (MODIFY)

- Update phase-ordering path to `src/isdlc/config/phase-topology.json`

### 3.10 lib/doctor.js (MODIFY)

- Update validation paths for config files to reflect new locations

## 4. File Moves

### From `src/claude/hooks/config/` → `src/isdlc/config/`

| File | Notes |
|------|-------|
| `iteration-requirements.json` | Framework config |
| `skills-manifest.json` | Single source (YAML copies deleted) |
| `artifact-paths.json` | Framework config |
| `phase-topology.json` | Merged with `phase-ordering.json` |
| `protocol-mapping.json` | Framework config |
| `profile-schema.json` | Framework config |
| `tool-routing.json` | Provider-neutral |
| `mcp-tool-routing.json` | MCP is provider-neutral |
| `contracts/` (5 files) | Provider-neutral workflow validation |
| `templates/` (8 files) | Provider-neutral artifact structure |
| `schemas/` (7 files) | Merging with `src/core/config/schemas/` |

### From `src/core/config/` → `src/isdlc/config/`

| File | Notes |
|------|-------|
| `schemas/` (7 files) | Merged into single schemas/ location |

### From `src/claude/config/` → `src/isdlc/config/`

| File | Notes |
|------|-------|
| `tech-stack-skill-mapping.yaml` | Framework config |

### Deletions

| File | Reason |
|------|--------|
| `src/claude/hooks/config/skills-manifest.yaml` | Duplicate — JSON source kept |
| `src/isdlc/config/skills-manifest.yaml` | Duplicate — JSON source kept |
| `src/isdlc/config/phase-ordering.json` | Merged into `phase-topology.json` |
| `src/claude/hooks/lib/roundtable-config.cjs` | Replaced by config-service |

### Remaining in `src/claude/hooks/config/`

| File | Reason |
|------|--------|
| `provider-defaults.yaml` | Genuinely provider-specific |

## 5. Error Taxonomy

| Code | Trigger | Severity | Recovery |
|------|---------|----------|----------|
| CFG-001 | `.isdlc/config.json` has invalid JSON | Warning | Warn to stderr, use full defaults |
| CFG-002 | `.isdlc/config.json` has unknown section | Info | Ignore unknown section, warn |
| CFG-003 | Migration fails to parse old YAML file | Warning | Skip that file, warn, continue migration |
| CFG-004 | Framework config file missing from `src/isdlc/config/` | Warning | Return null, caller handles |
| CFG-005 | Schema file missing | Warning | Return null, caller handles |

## 6. Wiring Summary

**Session cache**: `bin/rebuild-cache.js` reads `skills-manifest.json` from new path via `loadFrameworkConfig('skills-manifest')`.

**Hook execution**: All hooks call `require('src/core/bridge/config.cjs')` instead of internal `_loadConfigWithCache`. The bridge resolves `src/isdlc/config/` paths internally.

**Installer/Updater**: Both use `config-service.getConfigPath()` and `DEFAULT_PROJECT_CONFIG` from `config-defaults.js` to generate the unified user config on install. Updater adds migration step before config generation.

**Dogfooding**: `.claude/hooks/config/` is symlinked to `src/claude/hooks/config/`. After consolidation, the symlinked directory has only `provider-defaults.yaml`. All other config is in `src/isdlc/config/` (shipped) and `.isdlc/config.json` (runtime). The `.isdlc/config/workflows.json` manual copy (per CLAUDE.md memory rule 9) is unaffected — `workflows.json` stays in `src/isdlc/config/`.
