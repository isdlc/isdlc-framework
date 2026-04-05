# Task Plan: REQ-GH-216 make-atdd-the-default-mode-for-all-workflows-remov

## Progress Summary

| Phase | Tasks | Complete | Status |
|-------|-------|----------|--------|
| 05 | 3 | 3 | COMPLETE |
| 06 | 21 | 21 | COMPLETE |
| 16 | 2 | 0 | PENDING |
| 08 | 2 | 0 | PENDING |
| **Total** | **28** | **24** | **86%** |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Design test cases for ConfigService.getAtdd (defaults, partial merge, error fail-open) | traces: FR-003, AC-003-01, AC-003-02
  files: docs/requirements/REQ-GH-216-make-atdd-the-default-mode-for-all-workflows-remov/test-cases.md (CREATE)
- [X] T002 Design test cases for hook config gating (5 hooks across knob states) | traces: FR-005, FR-006, FR-007, FR-008, AC-005-01, AC-006-01, AC-007-01, AC-008-01
  files: docs/requirements/REQ-GH-216-make-atdd-the-default-mode-for-all-workflows-remov/test-cases.md (MODIFY)
- [X] T003 Design test cases for knob-interaction integration matrix (4 knobs x 2 states, core subset) | traces: FR-005, FR-006, FR-007, FR-008, AC-005-02, AC-006-02, AC-007-02, AC-008-02, AC-008-03
  files: docs/requirements/REQ-GH-216-make-atdd-the-default-mode-for-all-workflows-remov/test-cases.md (MODIFY)
  blocked_by: [T001, T002]

## Phase 06: Implementation -- COMPLETE

### Setup

- [X] T004 Add atdd section example to config documentation and .isdlc/config.json.example | traces: FR-003
  files: .isdlc/config/config.json.example (MODIFY), src/isdlc/config/README.md (MODIFY)

### Core Implementation

- [X] T005 Implement ConfigService.getAtdd with defaults and partial-merge logic | traces: FR-003, AC-003-01, AC-003-02
  files: src/core/config/config-service.js (MODIFY)
- [X] T006 Wire CJS bridge for getAtdd passthrough | traces: FR-003
  files: src/core/bridge/config.cjs (MODIFY)
  blocked_by: [T005]
- [X] T007 Add readAtddConfig helper passthrough to common.cjs | traces: FR-003
  files: src/claude/hooks/lib/common.cjs (MODIFY)
  blocked_by: [T006]
- [X] T008 Remove _when_atdd_mode blocks and atdd_mode option from workflows.json (build and test-generate) | traces: FR-001, FR-004, AC-001-01, AC-004-01
  files: src/isdlc/config/workflows.json (MODIFY)
- [X] T009 Remove when atdd_mode guards from iteration-requirements.json (3 blocks) | traces: FR-004, AC-004-02
  files: src/isdlc/config/iteration-requirements.json (MODIFY)
- [X] T010 Gate atdd-completeness-validator.cjs on enabled and require_gwt | traces: FR-005, FR-008, AC-005-01, AC-005-02, AC-008-01
  files: src/claude/hooks/atdd-completeness-validator.cjs (MODIFY)
  blocked_by: [T007]
- [X] T011 Gate test-watcher.cjs on track_red_green | traces: FR-006, AC-006-01, AC-006-02
  files: src/claude/hooks/test-watcher.cjs (MODIFY)
  blocked_by: [T007]
- [X] T012 Gate post-bash-dispatcher.cjs on enabled | traces: FR-008, AC-008-01
  files: src/claude/hooks/dispatchers/post-bash-dispatcher.cjs (MODIFY)
  blocked_by: [T007]
- [X] T013 Gate checkpoint-router.js on enforce_priority_order | traces: FR-007, AC-007-01, AC-007-02
  files: src/core/validators/checkpoint-router.js (MODIFY)
  blocked_by: [T006]
- [X] T014 Update isdlc.md phase-loop controller to inject ATDD_CONFIG block in Phase 05/06 GATE REQUIREMENTS INJECTION | traces: FR-003, FR-004, AC-004-03
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T006]

### Unit Tests

- [X] T015 Add ConfigService.getAtdd unit tests (defaults, partial merge, error paths) | traces: FR-003, AC-003-01, AC-003-02
  files: src/core/config/config-service.test.js (MODIFY)
  blocked_by: [T005]

### Wiring Claude

- [X] T016 Remove atdd_mode conditionals from 04-test-design-engineer.md; add ATDD_CONFIG-aware instructions | traces: FR-004, FR-005, AC-005-01
  files: src/claude/agents/04-test-design-engineer.md (MODIFY)
- [X] T017 Remove atdd_mode conditionals from 05-software-developer.md; add track_red_green and enforce_priority_order instructions | traces: FR-004, FR-006, FR-007
  files: src/claude/agents/05-software-developer.md (MODIFY)
- [X] T018 Remove atdd_mode conditionals from 06-integration-tester.md | traces: FR-004
  files: src/claude/agents/06-integration-tester.md (MODIFY)
- [X] T019 Replace --atdd-ready flag check in discover-orchestrator.md with atdd.enabled ConfigService check | traces: FR-002, FR-008, AC-002-01, AC-002-02, AC-008-02
  files: src/claude/agents/discover-orchestrator.md (MODIFY)
- [X] T020 Remove --atdd-ready guard from atdd-bridge.md; add atdd.enabled skip condition | traces: FR-002, FR-008, AC-002-02, AC-008-02
  files: src/claude/agents/discover/atdd-bridge.md (MODIFY)
- [X] T021 Remove --atdd-ready references from feature-mapper.md and artifact-integration.md | traces: FR-002
  files: src/claude/agents/discover/feature-mapper.md (MODIFY), src/claude/agents/discover/artifact-integration.md (MODIFY)
- [X] T022 Remove --atdd-ready flag documentation from discover.md command | traces: FR-002, AC-002-01
  files: src/claude/commands/discover.md (MODIFY)

### Wiring Codex

- [X] T023 Verify Codex projection parity (no atdd-specific files in src/providers/codex, no flag references in build.md or analyze.md) | traces: FR-001, FR-002
  files: src/providers/codex/commands/build.md (MODIFY), src/providers/codex/commands/analyze.md (MODIFY)
  blocked_by: [T008]

### Cleanup

- [X] T024 Update CLAUDE.md, docs/ARCHITECTURE.md, docs/HOOKS.md, docs/AGENTS.md for config-driven ATDD | traces: FR-009, AC-009-01, AC-009-02
  files: CLAUDE.md (MODIFY), docs/ARCHITECTURE.md (MODIFY), docs/HOOKS.md (MODIFY), docs/AGENTS.md (MODIFY)

## Phase 16: Quality Loop -- COMPLETED

### Test Execution

- [X] T025 Run full test suite (unit plus integration); verify all 8 updated test files pass and new getAtdd unit tests pass | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009
  files: src/claude/hooks/tests/atdd-completeness-validator.test.cjs (MODIFY), src/claude/hooks/tests/test-post-bash-dispatcher.test.cjs (MODIFY), src/claude/hooks/tests/test-common.test.cjs (MODIFY), src/claude/hooks/tests/gate-requirements-injector.test.cjs (MODIFY), src/claude/hooks/tests/cross-hook-integration.test.cjs (MODIFY), src/claude/hooks/tests/prune-functions.test.cjs (MODIFY), tests/core/validators/checkpoint-router.test.js (MODIFY), tests/core/state/paths.test.js (MODIFY), tests/integration/atdd-config-knobs.test.js (CREATE)
  blocked_by: [T015, T010, T011, T012, T013, T014]

### Parity Verification

- [X] T026 Verify Claude and Codex projection parity after atdd config landed (projection includes atdd section, no flag refs remain) | traces: FR-001, FR-002
  files: tests/providers/projection-parity.test.js (MODIFY)
  blocked_by: [T023, T025]

## Phase 08: Code Review -- COMPLETE

### Constitutional Review

- [X] T027 Constitutional review (Article IX gate integrity, Article X fail-safe defaults on ConfigService, Article XIII module system consistency in getAtdd wiring) | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009
  files: docs/requirements/REQ-GH-216-make-atdd-the-default-mode-for-all-workflows-remov/code-review-report.md (CREATE)
  blocked_by: [T026]

### Dual-File Check

- [X] T028 Dual-file check (src/ vs .isdlc/ and .claude/ symlink parity; user-facing docs grep for stale --atdd and --atdd-ready references) | traces: FR-009, AC-009-02
  files: docs/requirements/REQ-GH-216-make-atdd-the-default-mode-for-all-workflows-remov/code-review-report.md (MODIFY)
  blocked_by: [T027]

## Dependency Graph

```
T005 (ConfigService.getAtdd) --> T006 (CJS bridge) --> T007 (common.cjs helper)
                                                      --> T010 (atdd-completeness-validator gate)
                                                      --> T011 (test-watcher gate)
                                                      --> T012 (post-bash-dispatcher gate)
                              --> T013 (checkpoint-router gate)
                              --> T014 (isdlc.md injection)
                              --> T015 (getAtdd unit tests)
T008 (workflows.json)         --> T023 (Codex parity verify)

Tier 0 (no blockers, can run in parallel):
  T001, T002 (test design)
  T004 (config example docs)
  T005 (ConfigService.getAtdd)
  T008, T009 (config file edits)
  T016, T017, T018 (phase agent edits)
  T019, T020, T021, T022 (discover flow edits)
  T024 (docs cleanup)

Tier 1 (blocked by T005):
  T006 (CJS bridge)
  T015 (getAtdd unit tests)

Tier 1 (blocked by T006):
  T007 (common.cjs helper)
  T013 (checkpoint-router gate)
  T014 (isdlc.md injection)

Tier 1 (blocked by T008):
  T023 (Codex parity)

Tier 2 (blocked by T007):
  T010 (atdd-completeness-validator gate)
  T011 (test-watcher gate)
  T012 (post-bash-dispatcher gate)

Tier 3 (blocked by tier 2 and T015, T014):
  T025 (full test suite)

Tier 4 (blocked by T023 and T025):
  T026 (Claude/Codex parity)

Tier 5 (blocked by T026):
  T027 (constitutional review)

Tier 6 (blocked by T027):
  T028 (dual-file check)

Critical path: T005 -> T006 -> T007 -> T010 -> T025 -> T026 -> T027 -> T028 (8 tasks)
```

## Traceability Matrix

```
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR     | Requirement                          | Design / Blast Radius                | Related Tasks        |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-001 | Eliminates opt-in --atdd CLI flag    | Remove atdd_mode workflow option     | T008 workflows-json  |
|        | gating ATDD activation during build  | plus 2x _when_atdd_mode wrappers     | T023 codex-parity    |
|        | and test-generate. ATDD becomes the  | from build workflow agent_modifiers. |                      |
|        | default for Phase 05/06 in all       | Apply identical treatment to the     |                      |
|        | non-trivial tiers.                   | test-generate workflow. No CLI       |                      |
|        |                                      | parser changes needed.               |                      |
|        | AC-001-01: build invocation ->       |                                      |                      |
|        |   Phase 05 generates scaffolds       | src/isdlc/config/workflows.json      |                      |
|        | AC-001-02: legacy --atdd flag ->     |   (MODIFY)                           |                      |
|        |   no special handling (unreleased)   |                                      |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-002 | Eliminates --atdd-ready opt-in on    | Replace flag guard in                | T019 discover-orch   |
|        | discover command. ATDD bridge sub-   | discover-orchestrator with           | T020 atdd-bridge     |
|        | phase (1d) runs by default on        | atdd.enabled ConfigService check.    | T021 discover-sub    |
|        | existing-project discover runs,      | Remove flag docs from discover       | T022 discover-cmd    |
|        | skippable via atdd.enabled: false.   | command and sub-agents.              |                      |
|        |                                      |                                      |                      |
|        | AC-002-01: discover without flag ->  | src/claude/agents/                   |                      |
|        |   sub-phase 1d runs when enabled     |   discover-orchestrator.md (MODIFY)  |                      |
|        | AC-002-02: atdd.enabled: false ->    | src/claude/agents/discover/          |                      |
|        |   sub-phase 1d skipped               |   atdd-bridge.md (MODIFY)            |                      |
|        |                                      | src/claude/agents/discover/          |                      |
|        |                                      |   feature-mapper.md (MODIFY)         |                      |
|        |                                      | src/claude/agents/discover/          |                      |
|        |                                      |   artifact-integration.md (MODIFY)   |                      |
|        |                                      | src/claude/commands/                 |                      |
|        |                                      |   discover.md (MODIFY)               |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-003 | Introduces atdd config section in    | Add getAtdd method to                | T004 config-schema   |
|        | .isdlc/config.json with 4 knobs      | ConfigService with default-merge     | T005 getAtdd         |
|        | (enabled, require_gwt,               | logic. Expose through CJS bridge     | T006 cjs-bridge      |
|        | track_red_green,                     | and common.cjs helper for hook       | T007 common-helper   |
|        | enforce_priority_order). All         | convenience.                         | T014 phase-loop-inj  |
|        | defaults true. Exposed via new       |                                      | T015 getAtdd-unit    |
|        | ConfigService accessor.              | src/core/config/                     |                      |
|        |                                      |   config-service.js (MODIFY)         |                      |
|        | AC-003-01: missing atdd section ->   | src/core/bridge/config.cjs (MODIFY)  |                      |
|        |   all-true defaults applied          | src/claude/hooks/lib/                |                      |
|        | AC-003-02: partial section ->        |   common.cjs (MODIFY)                |                      |
|        |   merged with defaults               |                                      |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-004 | Replaces declarative atdd_mode       | Remove 2x _when_atdd_mode blocks     | T008 workflows-json  |
|        | conditionals in config files with    | from workflows.json. Remove 3x       | T009 iter-reqs       |
|        | runtime ConfigService checks in      | when atdd_mode guards from           | T010 validator-gate  |
|        | hooks and agents. Config-driven      | iteration-requirements.json. Hooks   | T011 watcher-gate    |
|        | behavior supersedes flag-scoped      | and agents read config via           | T012 dispatcher-gate |
|        | conditional wrappers.                | ConfigService at runtime. Phase      | T013 router-gate     |
|        |                                      | agent files have conditional         | T014 phase-loop-inj  |
|        | AC-004-01: workflows.json has no     | wording replaced with config-aware   | T016 test-design     |
|        |   _when_atdd_mode blocks             | instructions.                        | T017 software-dev    |
|        | AC-004-02: iteration-requirements    |                                      | T018 integration-tst |
|        |   has no when atdd_mode guards       | src/isdlc/config/                    |                      |
|        | AC-004-03: Phase 05/06 delegations   |   workflows.json (MODIFY)            |                      |
|        |   receive atdd.* via GATE REQ INJ    | src/isdlc/config/                    |                      |
|        |                                      |   iteration-requirements.json        |                      |
|        |                                      |   (MODIFY)                           |                      |
|        |                                      | src/claude/agents/                   |                      |
|        |                                      |   04-test-design-engineer.md         |                      |
|        |                                      | src/claude/agents/                   |                      |
|        |                                      |   05-software-developer.md           |                      |
|        |                                      | src/claude/agents/                   |                      |
|        |                                      |   06-integration-tester.md           |                      |
|        |                                      | src/claude/commands/isdlc.md         |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-005 | When require_gwt: true, Phase 05     | atdd-completeness-validator gates    | T010 validator-gate  |
|        | hard-blocks if Phase 01 produced     | GWT format check on require_gwt at   | T016 test-design     |
|        | ACs lacking Given/When/Then          | handler entry. Phase 05 agent        |                      |
|        | structure. The knob name drives      | instructions reflect the             |                      |
|        | the strictness contract.             | strictness contract.                 |                      |
|        |                                      |                                      |                      |
|        | AC-005-01: require_gwt=true +        | src/claude/hooks/                    |                      |
|        |   non-GWT AC -> Phase 05 blocks      |   atdd-completeness-validator.cjs    |                      |
|        | AC-005-02: require_gwt=false +       |   (MODIFY)                           |                      |
|        |   non-GWT AC -> best-effort scaffold | src/claude/agents/                   |                      |
|        |                                      |   04-test-design-engineer.md         |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-006 | When track_red_green: true,          | test-watcher reads                   | T011 test-watcher    |
|        | test-watcher records RED->GREEN      | atdd.track_red_green at entry;       | T017 software-dev    |
|        | state transitions in                 | early-returns from tracking logic    |                      |
|        | atdd-checklist.json. When false,     | when false. Phase 06 agent updated   |                      |
|        | transition tracking skipped.         | to reflect optional tracking.        |                      |
|        |                                      |                                      |                      |
|        | AC-006-01: track_red_green=true ->   | src/claude/hooks/                    |                      |
|        |   checklist records transitions      |   test-watcher.cjs (MODIFY)          |                      |
|        | AC-006-02: track_red_green=false ->  | src/claude/agents/                   |                      |
|        |   no entries written                 |   05-software-developer.md           |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-007 | When enforce_priority_order: true,   | checkpoint-router gates              | T013 router-gate     |
|        | Phase 06 requires tests to complete  | priority-ordered routing logic on    | T017 software-dev    |
|        | in priority order (P0 -> P3). When   | enforce_priority_order. Phase 06     |                      |
|        | false, any completion order          | agent instructions updated.          |                      |
|        | accepted.                            |                                      |                      |
|        |                                      | src/core/validators/                 |                      |
|        | AC-007-01: enforce=true + P1 before  |   checkpoint-router.js (MODIFY)      |                      |
|        |   P0 -> blocked                      | src/claude/agents/                   |                      |
|        | AC-007-02: enforce=false + any       |   05-software-developer.md           |                      |
|        |   order -> accepted                  |                                      |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-008 | Master kill switch - when            | All ATDD-aware hooks and agents      | T010 validator-gate  |
|        | atdd.enabled: false, all sub-        | check atdd.enabled first and short-  | T012 dispatcher-gate |
|        | behaviors become no-ops regardless   | circuit when false.                  | T019 discover-orch   |
|        | of sub-knob values. Phase 05         | discover-orchestrator gates          | T020 atdd-bridge     |
|        | generates no scaffolds, Phase 06     | atdd-bridge invocation on enabled.   |                      |
|        | skips tracking, checklist not        | atdd-bridge adds skip condition.     |                      |
|        | created, discover sub-phase 1d       |                                      |                      |
|        | skipped.                             | src/claude/hooks/                    |                      |
|        |                                      |   atdd-completeness-validator.cjs    |                      |
|        | AC-008-01: enabled=false -> Phase    | src/claude/hooks/dispatchers/        |                      |
|        |   05 produces no atdd-checklist      |   post-bash-dispatcher.cjs           |                      |
|        | AC-008-02: enabled=false -> discover | src/claude/agents/                   |                      |
|        |   sub-phase 1d skipped               |   discover-orchestrator.md           |                      |
|        | AC-008-03: enabled=false -> Phase    | src/claude/agents/discover/          |                      |
|        |   06 skips tracking and priority     |   atdd-bridge.md                     |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
| FR-009 | Documentation reflects               | Single consolidated cleanup task     | T024 docs-update     |
|        | unconditional-by-default ATDD and    | updating four documentation files.   |                      |
|        | the new config surface. CLAUDE.md,   | Changes are thematically identical   |                      |
|        | ARCHITECTURE.md, HOOKS.md,           | across files (replace flag           |                      |
|        | AGENTS.md describe config-driven     | references with config references,   |                      |
|        | behavior consistently.               | describe defaults).                  |                      |
|        |                                      |                                      |                      |
|        | AC-009-01: docs reference atdd.*     | CLAUDE.md (MODIFY)                   |                      |
|        |   config keys not --atdd flag        | docs/ARCHITECTURE.md (MODIFY)        |                      |
|        | AC-009-02: no stale --atdd or        | docs/HOOKS.md (MODIFY)               |                      |
|        |   --atdd-ready references remain     | docs/AGENTS.md (MODIFY)              |                      |
+--------+--------------------------------------+--------------------------------------+----------------------+
```

## Assumptions and Inferences

- `ConfigService.getAtdd` follows the existing accessor pattern from GH-231 (e.g., getMemory, getBranches) — no breaking changes to existing callers.
- Codex provider has no atdd-specific files (verified: grep on src/providers/codex returns zero matches), so T023 is parity verification rather than parallel implementation.
- Test-file updates are covered within each hook/module implementation task per Article II (TDD); separate test-only tasks exist only where new test files are introduced (T015 getAtdd unit tests, T025 new integration test file).
- Docs cleanup (T024) is a single task combining 4 doc files because changes are thematically identical (replace flag references with config references, describe defaults).
- atdd-checklist.json is created by Phase 05 and updated by Phase 06 per-feature at `docs/requirements/{slug}/atdd-checklist.json`, inherited from existing ATDD artifact lifecycle.
