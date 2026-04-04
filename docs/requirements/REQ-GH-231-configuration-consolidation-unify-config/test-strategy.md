# Test Strategy: Configuration Consolidation

**Item**: REQ-GH-231
**Phase**: 05-test-strategy

---

## 1. Test Approach

TDD Red-Green-Refactor. Tests are written first as `test.skip()` scaffolds targeting the new modules (config-service, config-bridge, migration). Tests are unskipped and made to pass during Phase 06 implementation.

## 2. Test Files

| File | Type | Module Under Test | Traces |
|------|------|-------------------|--------|
| `tests/core/config/config-service-new.test.js` | Unit (ESM) | `src/core/config/config-service.js` | FR-003, AC-003-01/03/04 |
| `src/core/bridge/config.test.cjs` | Unit (CJS) | `src/core/bridge/config.cjs` | FR-003, AC-003-02 |
| `lib/updater-config-migration.test.js` | Unit (ESM) | `lib/updater.js` migration logic | FR-006, AC-006-01/02/03 |

## 3. Test Cases

### 3.1 config-service.js (T001)

**loadFrameworkConfig(name)**:
- TC-CS-01: Returns parsed JSON for existing config file (e.g., 'skills-manifest') | AC-003-03
- TC-CS-02: Returns null for non-existent config file | AC-003-03
- TC-CS-03: Caches result on second call (same mtime → no re-read) | AC-003-03
- TC-CS-04: Invalidates cache when file mtime changes | AC-003-03
- TC-CS-05: Returns null for malformed JSON (does not throw) | CFG-004

**readProjectConfig(projectRoot)**:
- TC-CS-06: Returns full defaults when config.json is missing | AC-003-04, AC-001-05
- TC-CS-07: Returns full defaults when config.json is empty | AC-001-05
- TC-CS-08: Merges user values with defaults (user overrides take precedence) | AC-003-04
- TC-CS-09: Preserves default sections not present in user file | AC-003-04
- TC-CS-10: Returns all 6 sections: cache, ui, provider, roundtable, search, workflows | AC-001-01
- TC-CS-11: Warns to stderr on malformed JSON, returns defaults | CFG-001
- TC-CS-12: Ignores unknown sections without error | CFG-002
- TC-CS-13: Deep-merges nested objects (e.g., cache.section_priorities) | AC-003-04

**loadSchema(schemaId)**:
- TC-CS-14: Returns parsed schema for existing schema ID | AC-003-08
- TC-CS-15: Returns null for non-existent schema | AC-003-08
- TC-CS-16: Caches schema by mtime | AC-003-08

**clearConfigCache()**:
- TC-CS-17: After clear, next load re-reads from disk | testing utility

### 3.2 config-bridge.cjs (T003)

- TC-CB-01: Exports loadFrameworkConfig, readProjectConfig, loadSchema, getConfigPath, clearConfigCache | AC-003-02
- TC-CB-02: loadFrameworkConfig returns same result as ESM service | AC-003-02
- TC-CB-03: readProjectConfig returns defaults when no config file exists | AC-003-02
- TC-CB-04: Synchronous execution — no promises returned | AC-003-02
- TC-CB-05: Fail-open: returns null/defaults on any internal error | Article X

### 3.3 Config migration (T002)

- TC-MIG-01: Detects and reads old `.isdlc/config.json` (budget_tokens format) | AC-006-01
- TC-MIG-02: Detects and reads `.isdlc/config/config.json` (show_subtasks_in_ui) | AC-006-01
- TC-MIG-03: Detects and reads `.isdlc/providers.yaml` (provider default) | AC-006-01
- TC-MIG-04: Detects and reads `.isdlc/roundtable.yaml` (verbosity, personas) | AC-006-01
- TC-MIG-05: Detects and reads `.isdlc/search-config.json` | AC-006-01
- TC-MIG-06: Merges all old values into unified config.json with correct namespacing | AC-006-01
- TC-MIG-07: Renames old files to .bak after successful migration | AC-006-02
- TC-MIG-08: Logs migration summary listing migrated files | AC-006-03
- TC-MIG-09: Skips gracefully when no old files exist (fresh install) | AC-006-04
- TC-MIG-10: Handles malformed old YAML file — skips that file, warns, continues | CFG-003
- TC-MIG-11: Does not overwrite existing unified config.json if already present | safety
- TC-MIG-12: Handles partial old files — some exist, some don't | edge case

## 4. Coverage Targets

| Module | Target | Rationale |
|--------|--------|-----------|
| config-service.js | 90%+ | Core shared infrastructure — all callers depend on it |
| config-bridge.cjs | 80%+ | Thin wrapper — fewer code paths |
| Migration logic | 85%+ | One-time but critical — data loss risk |

## 5. Error Path Coverage

Per Article XI:
- Every public function has tests for failure cases (missing files, malformed JSON, invalid paths)
- config-service fail-open behavior verified (null/defaults, never throws)
- Migration fail-open behavior verified (skips bad files, continues)

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
