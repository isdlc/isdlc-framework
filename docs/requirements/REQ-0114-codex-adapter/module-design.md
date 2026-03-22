# Design Specification: Codex Provider Adapter

**Item**: REQ-0114 | **GitHub**: #178 | **CODEX**: CODEX-045

---

## 1. Module: `src/providers/codex/index.js` (~15 lines)

### Exports

Barrel re-export file. No logic of its own.

```js
// Config + projection paths
export { getCodexConfig, getProjectionPaths } from './projection.js';

// Installer (REQ-0115)
export { installCodex, updateCodex, uninstallCodex, doctorCodex } from './installer.js';

// Governance (REQ-0117)
export { getGovernanceModel, validateCheckpoint } from './governance.js';
```

---

## 2. Module: `src/providers/codex/projection.js` (~50 lines)

### Exports

#### `getCodexConfig()`

Returns a frozen provider configuration object.

```js
export function getCodexConfig() {
  return Object.freeze({
    provider: 'codex',
    frameworkDir: '.codex',
    instructionFormat: 'markdown-instructions'
  });
}
```

#### `getProjectionPaths()`

Returns a frozen object mapping logical names to Codex instruction file paths (relative to project root).

```js
export function getProjectionPaths() {
  return Object.freeze({
    instructions: '.codex/AGENTS.md',
    teamSpec: '.codex/team-spec.md',
    contentModel: '.codex/content-model.md',
    skillManifest: '.codex/skills.md',
    providerConfig: '.codex/config.json'
  });
}
```

---

## 3. Open Questions

None — the adapter is a direct structural mirror of `src/providers/claude/` with Codex-specific paths and config values.
