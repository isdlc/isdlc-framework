# Requirements Specification: Configuration Consolidation

**Item**: REQ-GH-231
**Status**: Accepted
**Confidence**: High (user-confirmed direction)

---

## 1. Business Context

The iSDLC framework's configuration is spread across ~45 files in 6 directories, using 3 formats (JSON, YAML, MD), with at least 3 sets of duplicates and 5 different config readers. This creates:
- Poor end-user experience: new users see a confusing mix of files with no clear documentation on what they can edit
- Inconsistent LLM interpretation: Claude Code treats JSON and YAML differently, causing inconsistent agent behavior
- Maintenance burden: 5 separate config readers, bugs must be fixed in multiple places
- Divergence risk: duplicate files (skills manifest x3, schemas x2) can silently drift

## 2. Stakeholders and Personas

- **End user** (primary): Developer installing iSDLC into their project. Wants minimal, clear config surface.
- **Framework developer** (secondary): Contributor to iSDLC. Wants single source of truth for each config, one reader to maintain.

## 3. User Journeys

**New user installs iSDLC**: After running `init-project.sh`, the user sees `.isdlc/config.json` as the single place to customize framework behavior. A companion `docs/isdlc/config-reference.md` documents every field. No other user-editable config files exist unless the user explicitly creates custom workflows.

**Existing user upgrades**: The updater detects old config files, merges their values into the unified `config.json`, and removes (or backs up) the old files. The user sees a one-time migration message.

---

## 4. Technical Context

- All hooks run as CJS (`.cjs`) in standalone Node processes — they need synchronous config reads
- Core modules are ESM (`.js`) — they need async-compatible imports
- The CJS bridge pattern (`src/core/bridge/*.cjs`) already exists for cross-module-system access
- `common.cjs` has a working mtime-based cache (`_loadConfigWithCache`) that should be preserved in the unified service
- `js-yaml` dependency can be dropped if all user config is JSON (only used by workflow-loader for custom workflow YAML files, which is a separate concern)

### Constraints

- Article XIV (State Management Integrity): User config is NOT state — do not put config in state.json
- Article X (Fail-Safe Defaults): Missing config values must fall back to sensible defaults
- Article XIII (Module System Consistency): Config service must have both ESM and CJS entry points
- Dogfooding dual-file awareness: changes apply to both `src/` (shipped) and root `.isdlc/`/`.claude/` (consumer)

---

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Usability | Critical | User sees exactly 1 editable config file after install |
| Consistency | High | All framework code reads config through a single service |
| Backward compatibility | High | Upgrade migration preserves all existing user settings |
| Performance | Medium | Config reads cached, no slower than current `_loadConfigWithCache` |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hook path breakage during migration | High | High | Comprehensive test coverage on all path references; run full test suite before merge |
| Upgrade migration loses user settings | Medium | High | Migration reads old files, merges into new, creates `.bak` backups |
| Session cache builder breaks | Medium | Medium | Test cache rebuild after config path changes |

---

## 6. Functional Requirements

### FR-001: Unified user config file
**Confidence**: High

All user-editable configuration MUST be consolidated into a single `.isdlc/config.json` file with namespaced sections.

- **AC-001-01**: `.isdlc/config.json` contains sections: `cache`, `ui`, `provider`, `roundtable`, `search`, `workflows`
- **AC-001-02**: Given a fresh install, when the user opens `.isdlc/config.json`, then all sections are present with default values
- **AC-001-03**: Given a user edits `config.json` → `roundtable.verbosity`, when the next roundtable runs, then the new verbosity is applied
- **AC-001-04**: Given a user edits `config.json` → `cache.budget_tokens`, when the session cache rebuilds, then the new budget is used
- **AC-001-05**: Given `config.json` is missing or empty, when any framework component reads config, then sensible defaults are used (fail-open)

### FR-002: Eliminate old user config files
**Confidence**: High

The following files MUST be removed from the runtime `.isdlc/` directory (their content absorbed into `config.json`):

- **AC-002-01**: `.isdlc/config.json` (old format) is migrated to the new namespaced format
- **AC-002-02**: `.isdlc/config/config.json` is eliminated — `show_subtasks_in_ui` moves to `config.json → ui`
- **AC-002-03**: `.isdlc/providers.yaml` is eliminated — provider selection moves to `config.json → provider`
- **AC-002-04**: `.isdlc/roundtable.yaml` is eliminated — roundtable settings move to `config.json → roundtable`
- **AC-002-05**: `.isdlc/search-config.json` is eliminated — search config moves to `config.json → search`

### FR-003: Unified config service
**Confidence**: High

A single config service MUST replace all 5 existing config readers.

- **AC-003-01**: `src/core/config/config-service.js` (ESM) exports `loadFrameworkConfig(name)`, `readProjectConfig(projectRoot)`, `loadSchema(schemaId)`
- **AC-003-02**: `src/core/bridge/config.cjs` (CJS bridge) exports the same functions synchronously for hooks
- **AC-003-03**: `loadFrameworkConfig(name)` reads from `src/isdlc/config/` with mtime-based caching (absorbs `_loadConfigWithCache` behavior)
- **AC-003-04**: `readProjectConfig(projectRoot)` reads `.isdlc/config.json`, merges with defaults, returns typed config object (absorbs `readConfig`, `readSearchConfig`, `readRoundtableConfig`)
- **AC-003-05**: All existing callers of the old readers are migrated to use the new service
- **AC-003-06**: `src/claude/hooks/lib/roundtable-config.cjs` is deleted
- **AC-003-07**: `lib/search/config.js` reader functions are deleted (write function may remain if needed)
- **AC-003-08**: `src/core/config/index.js` `loadCoreProfile`/`loadCoreSchema` are absorbed into the service

### FR-004: Consolidate framework config directories
**Confidence**: High

Shipped framework config MUST be consolidated from 3 directories to 1 canonical location (`src/isdlc/config/`).

- **AC-004-01**: `src/core/config/schemas/` is deleted — schemas move to `src/isdlc/config/schemas/`
- **AC-004-02**: `src/claude/config/tech-stack-skill-mapping.yaml` moves to `src/isdlc/config/`
- **AC-004-03**: `src/claude/hooks/config/` retains ONLY Claude-provider-specific files: contracts, templates, and files that hooks read at runtime via the config service
- **AC-004-04**: All consumers that hardcode paths to the old locations are updated

### FR-005: Eliminate config duplicates
**Confidence**: High

Each piece of config data MUST have exactly one source file.

- **AC-005-01**: Skills manifest: single `src/isdlc/config/skills-manifest.json`. The YAML copies (`src/claude/hooks/config/skills-manifest.yaml`, `src/isdlc/config/skills-manifest.yaml`) are deleted. Session cache builder and hooks both read the single JSON file.
- **AC-005-02**: Phase ordering: single `src/isdlc/config/phase-topology.json` (merged from `phase-ordering.json` and `phase-topology.json`). Both old files deleted.
- **AC-005-03**: JSON schemas: single `src/isdlc/config/schemas/`. `src/core/config/schemas/` deleted.
- **AC-005-04**: Installer and updater copy steps are simplified — no more multi-destination copies for the same file

### FR-006: Upgrade migration
**Confidence**: High

Users upgrading from the current version MUST have their config automatically migrated.

- **AC-006-01**: Given old config files exist, when the user runs `isdlc update`, then values are merged into the new unified `config.json`
- **AC-006-02**: Old files are renamed with `.bak` extension (not deleted) for safety
- **AC-006-03**: A migration message is displayed listing what was migrated
- **AC-006-04**: Given no old config files exist (fresh install), when the user runs install, then the unified `config.json` is created with defaults

### FR-007: Config reference documentation
**Confidence**: Medium

- **AC-007-01**: `docs/isdlc/config-reference.md` documents every field in `config.json` with type, default, and description
- **AC-007-02**: The reference document is generated or validated against the actual defaults in the config service

---

## 7. Out of Scope

| Item | Reason |
|------|--------|
| `state.json` restructuring | State management is a separate concern (Article XIV) |
| `settings.json` / `settings.local.json` | Claude Code harness files — not framework-owned |
| Custom workflow YAML files (`.isdlc/workflows/`) | Already well-separated, stays as-is |
| `finalize-steps.md` | Process definition, not config — stays as separate file |
| `constitution.md` | Document, not config — stays as-is |
| CLAUDE.md | Project instructions — stays as-is |
| `.isdlc/roundtable-memory.json` | Machine-managed state, not user config |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Unified user config file | Must Have | Core user-facing change |
| FR-002 | Eliminate old user config files | Must Have | Can't have unified config alongside old files |
| FR-003 | Unified config service | Must Have | Can't have single file without single reader |
| FR-004 | Consolidate framework config dirs | Must Have | User requested maintainability in same shot |
| FR-005 | Eliminate config duplicates | Must Have | Core maintainability goal |
| FR-006 | Upgrade migration | Must Have | Can't break existing users |
| FR-007 | Config reference documentation | Should Have | Important but not blocking |

---

## Pending Sections

None — all sections written.
