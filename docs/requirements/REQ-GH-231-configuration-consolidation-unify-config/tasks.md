# Task Plan: REQ-GH-231 configuration-consolidation-unify-config

## Progress Summary

| Phase | Tasks | Complete | Status |
|-------|-------|----------|--------|
| 05 | 3 | 0 | PENDING |
| 06 | 10 | 0 | PENDING |
| 16 | 2 | 0 | PENDING |
| 08 | 2 | 0 | PENDING |
| **Total** | **17** | **0** | **0%** |

## Phase 05: Test Strategy -- PENDING

- [ ] T001 Design test cases for config-service.js (loadFrameworkConfig, readProjectConfig, loadSchema, caching, defaults merging) | traces: FR-003, AC-003-01, AC-003-03, AC-003-04
  files: tests/core/config/config-service-new.test.js (CREATE)
- [ ] T002 Design test cases for config migration in updater (old file detection, value extraction, merge, backup, edge cases) | traces: FR-006, AC-006-01, AC-006-02, AC-006-03
  files: lib/updater-config-migration.test.js (CREATE)
- [ ] T003 Design test cases for config-bridge.cjs (CJS-to-ESM bridge, synchronous access, fail-open behavior) | traces: FR-003, AC-003-02
  files: src/core/bridge/config.test.cjs (CREATE)

## Phase 06: Implementation -- PENDING

- [ ] T004 Create config-defaults.js with DEFAULT_PROJECT_CONFIG constant | traces: FR-001, AC-001-02, AC-001-05
  files: src/core/config/config-defaults.js (CREATE)
  blocks: [T005, T006]
- [ ] T005 Create config-service.js with loadFrameworkConfig, readProjectConfig, loadSchema, getConfigPath, clearConfigCache | traces: FR-003, AC-003-01, AC-003-03, AC-003-04, AC-003-08
  files: src/core/config/config-service.js (CREATE)
  blocked_by: [T004]
  blocks: [T006, T007, T008, T009, T010, T011]
- [ ] T006 Create config-bridge.cjs (CJS bridge for hooks) | traces: FR-003, AC-003-02
  files: src/core/bridge/config.cjs (CREATE)
  blocked_by: [T004, T005]
  blocks: [T007, T008]
- [ ] T007 Migrate common.cjs: replace _loadConfigWithCache and readConfig with bridge calls, remove internal cache | traces: FR-003, AC-003-05
  files: src/claude/hooks/lib/common.cjs (MODIFY)
  blocked_by: [T006]
- [ ] T008 Delete roundtable-config.cjs, update callers to use readProjectConfig().roundtable | traces: FR-003, AC-003-06
  files: src/claude/hooks/lib/roundtable-config.cjs (DELETE), src/claude/hooks/lib/common.cjs (MODIFY)
  blocked_by: [T006]
- [ ] T009 Migrate lib/search/config.js: delete readSearchConfig, update callers to readProjectConfig().search | traces: FR-003, AC-003-07
  files: lib/search/config.js (MODIFY), lib/search/router.js (MODIFY)
  blocked_by: [T005]
- [ ] T010 Move config files: hooks/config/ to isdlc/config/, merge schemas, delete duplicates, update all hardcoded paths | traces: FR-004, FR-005, AC-004-01, AC-004-02, AC-004-03, AC-004-04, AC-005-01, AC-005-02, AC-005-03, AC-005-04
  files: src/isdlc/config/ (MODIFY), src/claude/hooks/config/ (MODIFY), src/core/config/index.js (MODIFY), bin/rebuild-cache.js (MODIFY), src/dashboard/server.js (MODIFY), src/core/bridge/workflow.cjs (MODIFY), lib/doctor.js (MODIFY)
  blocked_by: [T005]
- [ ] T011 Update installer.js: simplify config copies, generate unified config.json on fresh install | traces: FR-001, FR-005, AC-001-02, AC-005-04, AC-006-04
  files: lib/installer.js (MODIFY)
  blocked_by: [T005]
- [ ] T012 Update updater.js: add migration logic for old config files, simplify copy steps | traces: FR-006, AC-006-01, AC-006-02, AC-006-03
  files: lib/updater.js (MODIFY)
  blocked_by: [T005]
- [ ] T013 Create config-reference.md documenting all config.json fields | traces: FR-007, AC-007-01, AC-007-02
  files: docs/isdlc/config-reference.md (CREATE)
  blocked_by: [T004]

## Phase 16: Quality Loop -- PENDING

- [ ] T014 Run full test suite, fix regressions from path changes and reader migration | traces: FR-003, FR-004, FR-005
  blocked_by: [T007, T008, T009, T010, T011, T012]
- [ ] T015 Verify dogfooding dual-file sync: .claude/hooks/config/ has only provider-defaults.yaml, .isdlc/config/ has workflows.json | traces: FR-004, FR-005
  blocked_by: [T010]

## Phase 08: Code Review -- PENDING

- [ ] T016 Constitutional review: verify Article X (fail-open defaults), Article XIII (ESM/CJS boundary), Article XIV (config not in state.json) | traces: FR-001, FR-003
  blocked_by: [T014, T015]
- [ ] T017 Verify no config duplicates remain: skills-manifest x1, phase-topology x1, schemas x1 | traces: FR-005, AC-005-01, AC-005-02, AC-005-03
  blocked_by: [T014, T015]

## Dependency Graph

```
T004 (defaults) ──┬──> T005 (service) ──┬──> T006 (bridge) ──┬──> T007 (common.cjs)
                  │                     │                     └──> T008 (roundtable delete)
                  │                     ├──> T009 (search config)
                  │                     ├──> T010 (file moves)
                  │                     ├──> T011 (installer)
                  │                     └──> T012 (updater)
                  └──> T013 (docs)
T007,T008,T009,T010,T011,T012 ──> T014 (quality loop) ──> T016, T017
T010 ──> T015 (dual-file check) ──> T016, T017
```

Critical path: T004 → T005 → T006 → T007 → T014 → T016

## Traceability Matrix

| FR | AC | Tasks |
|----|-----|-------|
| FR-001 | AC-001-01..05 | T004, T005, T011 |
| FR-002 | AC-002-01..05 | T010, T012 |
| FR-003 | AC-003-01..08 | T005, T006, T007, T008, T009 |
| FR-004 | AC-004-01..04 | T010 |
| FR-005 | AC-005-01..04 | T010, T011 |
| FR-006 | AC-006-01..04 | T011, T012 |
| FR-007 | AC-007-01..02 | T013 |
