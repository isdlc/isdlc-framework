# Design Specification: Codex Installation and Doctor Paths

**Item**: REQ-0115 | **GitHub**: #179 | **CODEX**: CODEX-046

---

## 1. Module: `src/providers/codex/installer.js` (~200 lines)

### Exports

#### `installCodex(projectRoot, options)`

Creates Codex instruction directory and generates instruction files.

```js
export async function installCodex(projectRoot, options = {}) {
  // 1. Read config from getCodexConfig() — gets frameworkDir
  // 2. Create frameworkDir (e.g., .codex/) if not exists
  // 3. Copy core provider config (config.json)
  // 4. Load team specs via getTeamSpec()
  // 5. Load team instances via getTeamInstance()
  // 6. Generate instruction files at getProjectionPaths() locations
  //    - AGENTS.md from team spec
  //    - team-spec.md from team spec
  //    - content-model.md from content classifications
  //    - skills.md from skill manifest
  // 7. Return { success, filesCreated, errors }
}
```

#### `updateCodex(projectRoot, options)`

Regenerates instruction files from latest core models, preserving user edits.

```js
export async function updateCodex(projectRoot, options = {}) {
  // 1. For each projection path file:
  //    a. Compute content hash of existing file
  //    b. Compare to stored hash (in config.json metadata)
  //    c. If hashes differ (user edited), skip and add to filesSkipped
  //    d. If hashes match, regenerate and add to filesUpdated
  // 2. Return { success, filesUpdated, filesSkipped, errors }
}
```

#### `uninstallCodex(projectRoot, options)`

Removes generated files, preserves user content.

```js
export async function uninstallCodex(projectRoot, options = {}) {
  // 1. Read projection paths
  // 2. For each generated file:
  //    a. Check content hash vs stored hash
  //    b. If matches (unmodified), remove and add to filesRemoved
  //    c. If differs (user edited), preserve and add to filesPreserved
  // 3. Remove frameworkDir if empty
  // 4. Return { success, filesRemoved, filesPreserved, errors }
}
```

#### `doctorCodex(projectRoot)`

Validates Codex installation health.

```js
export async function doctorCodex(projectRoot) {
  // Checks:
  // 1. Instruction directory exists
  // 2. Core config file (config.json) present and valid JSON
  // 3. Team spec file exists and is non-empty
  // 4. Team specs loadable via getTeamSpec()
  // 5. All projection path files exist
  // Return { healthy, checks: [{ name, passed, message }] }
}
```

---

## 2. Open Questions

None — the API shape is defined by the Claude installer contract (REQ-0089) and the file layout by REQ-0114.
