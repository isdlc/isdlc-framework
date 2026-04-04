# Architecture Overview: Configuration Consolidation

**Item**: REQ-GH-231
**Status**: Accepted

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A. Big-bang migration | Move all config files, update all readers, migrate all callers in one PR | Clean cut, no transitional shims, no old-path fallbacks | Large blast radius (~20 files), higher merge conflict risk | User requested "one shot" | **Selected** |
| B. Facade-first | Create unified service as facade, then migrate locations behind it | Lower risk per commit, verify each reader independently | Transitional code, two PRs, facade is throwaway | Incremental delivery | Eliminated |

## 2. Selected Architecture

### ADR-001: Config Service Architecture

- **Status**: Accepted
- **Context**: 5 config readers with different caching strategies, path conventions, and format support. Mixed JSON/YAML causes inconsistent LLM interpretation.
- **Decision**: Single `src/core/config/config-service.js` (ESM) with CJS bridge at `src/core/bridge/config.cjs`. All config reads go through this service. User config is JSON only.
- **Rationale**: One cache, one path resolution strategy, one defaults-merging pattern. CJS bridge maintains hook compatibility (Article XIII). JSON chosen for LLM consistency.
- **Consequences**: `roundtable-config.cjs` deleted (216 lines). `lib/search/config.js` reader deleted. `src/core/config/index.js` absorbed. `common.cjs` internal readers replaced with bridge calls.

### ADR-002: Canonical Config Directory

- **Status**: Accepted
- **Context**: Shipped config spread across `src/claude/hooks/config/`, `src/isdlc/config/`, `src/core/config/`, `src/claude/config/` — 4 directories with duplicates.
- **Decision**: `src/isdlc/config/` is the single canonical location for all provider-neutral framework config. `src/claude/hooks/config/` retains only `provider-defaults.yaml` (genuinely provider-specific). `src/core/config/` and `src/claude/config/` absorbed entirely.
- **Rationale**: `src/isdlc/` is provider-neutral — correct home for config shared across providers.
- **Consequences**: ~30 files move from `src/claude/hooks/config/` to `src/isdlc/config/`. Installer/updater copy steps simplified. `phase-ordering.json` and `phase-topology.json` merged into single file.

### ADR-003: Unified User Config Format

- **Status**: Accepted
- **Context**: User config was split across 5 files in 2 formats (JSON and YAML). Mixed formats cause Claude Code to interpret them inconsistently.
- **Decision**: Single `.isdlc/config.json` (JSON) with namespaced sections: `cache`, `ui`, `provider`, `roundtable`, `search`, `workflows`.
- **Rationale**: JSON is the dominant format in the LLM training corpus. Claude Code's own config ecosystem is JSON. No `js-yaml` dependency needed for user config. `_comment` convention for inline documentation.
- **Consequences**: `js-yaml` dependency retained only for custom workflow YAML files (separate concern). Hand-rolled YAML parser in `roundtable-config.cjs` deleted.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| JSON (user config format) | N/A | LLM-native, zero dependency, consistent with ecosystem | YAML (rejected: LLM inconsistency, indentation errors) |
| No new dependencies | N/A | `js-yaml` retained for custom workflows only | TOML (rejected: non-standard in Node ecosystem) |

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| INT-001 | `common.cjs` | `bridge/config.cjs` | CJS require | JSON objects | Fail-open with defaults |
| INT-002 | `roundtable hooks` | `bridge/config.cjs` | CJS require | ProjectConfig.roundtable | Fail-open with defaults |
| INT-003 | `search router` | `config-service.js` | ESM import | ProjectConfig.search | Fail-open with defaults |
| INT-004 | `installer.js` | `config-service.js` | ESM import | Default config generation | Throw on write failure |
| INT-005 | `updater.js` | `config-service.js` | ESM import | Migration + write | Backup old files, warn on parse failure |
| INT-006 | `rebuild-cache.js` | `src/isdlc/config/` | File read | skills-manifest.json | Throw if missing |
| INT-007 | `dashboard/server.js` | `src/isdlc/config/` | File read | phase-topology.json | Fail-open |

### Data Flow

```
User edits .isdlc/config.json
  → readProjectConfig(projectRoot) merges with defaults
  → Returns typed ProjectConfig object
  → Consumed by hooks (via CJS bridge), core modules (via ESM import)

Framework startup / hook execution:
  → loadFrameworkConfig('skills-manifest')
  → Reads src/isdlc/config/skills-manifest.json with mtime cache
  → Returns parsed JSON object
```

## 5. Summary

| Metric | Value |
|--------|-------|
| Files created | 3 (config-service.js, bridge/config.cjs, config-defaults.js) |
| Files deleted | 5 (roundtable-config.cjs, 2x skills-manifest.yaml, phase-ordering.json, core/config/schemas/) |
| Files moved | ~30 (hooks/config/ → isdlc/config/) |
| Files modified | ~15 (common.cjs, installer, updater, cache builder, dashboard, bridge/workflow, etc.) |
| User config files eliminated | 4 (providers.yaml, roundtable.yaml, search-config.json, config/config.json) |
| Config readers eliminated | 4 (of 5 → 1 unified service) |
| Directories eliminated | 2 (src/core/config/, src/claude/config/) |
