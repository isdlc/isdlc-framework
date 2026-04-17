# Task Plan: REQ-GH-253 — Context-Manager Hooks

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05 - Test Strategy | 4 | 4 | 0 |
| 06 - Implementation | 48 | 0 | 48 |
| 16 - Quality Loop | 5 | 5 | 0 |
| 08 - Code Review | 3 | 0 | 3 |
| **Total** | **60** | **9** | **51** |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Design test strategy for state machine runtime, composers, markers, trailer parser
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/test-strategy.md (CREATE)
  traces: FR-001, FR-002, FR-003
  blocked_by: [T060]

- [X] T002 Design test strategy for bucketed audit verification
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/test-strategy.md (MODIFY)
  traces: FR-007

- [X] T003 Design test strategy for parallel-run comparison harness
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/test-strategy.md (MODIFY)
  traces: FR-008
  blocked_by: [T060]

- [X] T004 Design cross-provider parity tests
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/test-strategy.md (MODIFY)
  traces: FR-005, NFR-002
  blocked_by: [T060]

## Phase 06: Implementation -- PENDING

### Tier 0: Audit FIRST (no dependencies)

- [ ] T034 Conduct bucketed audit of roundtable-analyst.md
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/audit-roundtable-analyst.md (CREATE)
  traces: FR-007, AC-007-01, AC-007-02, AC-007-03

- [ ] T035 Conduct bucketed audit of bug-roundtable-analyst.md
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/audit-bug-roundtable-analyst.md (CREATE)
  traces: FR-007, AC-007-01, AC-007-02, AC-007-03

### Decision Gate: Scope Calibration (depends on audit)

- [ ] T060 Evaluate audit results and confirm or adjust design scope
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/scope-calibration.md (CREATE)
  traces: FR-007, NFR-005
  blocked_by: [T034, T035]

Decision criteria:
  If heavy bucket-1/2/3/5 (>50% of prose is mechanism-replaceable) -> proceed with full state machine design
  If heavy bucket-4 (>60% is LLM-prose-needed) -> scale down to lighter approach (template inclusion at confirmation boundaries + tool-router extensions only)
  If mixed -> proceed with full design but reduce scope of state machine to confirmed-necessary states only

### Tier 1: Schemas (after scope confirmed)

- [ ] T005 Create core state machine schema
  files: src/core/roundtable/schemas/core.schema.json (CREATE)
  traces: FR-002
  blocked_by: [T060]

- [ ] T006 Create workflow state machine schema
  files: src/core/roundtable/schemas/workflow.schema.json (CREATE)
  traces: FR-002
  blocked_by: [T060]

- [ ] T007 Create trailer schema
  files: src/core/roundtable/schemas/trailer.schema.json (CREATE)
  traces: FR-003
  blocked_by: [T060]

- [ ] T008 Create rolling state schema
  files: src/core/roundtable/schemas/rolling-state.schema.json (CREATE)
  traces: FR-003
  blocked_by: [T060]

- [ ] T009 Create state card schema
  files: src/core/roundtable/schemas/state-card.schema.json (CREATE)
  traces: FR-001
  blocked_by: [T060]

- [ ] T010 Create task card schema
  files: src/core/roundtable/schemas/task-card.schema.json (CREATE)
  traces: FR-001
  blocked_by: [T060]

### Tier 1: Definition files (informed by audit results)

- [ ] T011 Author shared core definition
  files: src/isdlc/config/roundtable/core.json (CREATE)
  traces: FR-002, FR-006
  blocked_by: [T034, T035, T060]

- [ ] T012 Author analyze workflow definition
  files: src/isdlc/config/roundtable/analyze.json (CREATE)
  traces: FR-002, FR-006
  blocked_by: [T034, T060]

- [ ] T013 Author bug-gather workflow definition
  files: src/isdlc/config/roundtable/bug-gather.json (CREATE)
  traces: FR-002, FR-006
  blocked_by: [T035, T060]

- [ ] T014 Author state card templates
  files: src/isdlc/config/roundtable/state-cards/ (CREATE)
  traces: FR-001, AC-001-01
  blocked_by: [T034, T035, T060]

- [ ] T015 Author task card templates
  files: src/isdlc/config/roundtable/task-cards/ (CREATE)
  traces: FR-001, AC-001-02
  blocked_by: [T034, T035, T060]

### Tier 1: Config extensions (parallel with schemas and definitions)

- [ ] T024 Extend config-service with getRoundtableConfig
  files: src/core/config/config-service.js (MODIFY)
  traces: FR-004
  blocked_by: [T060]

- [ ] T025 Extend config schema with roundtable.task_card.max_skills_total
  files: src/isdlc/config.schema.json (MODIFY)
  traces: FR-004
  blocked_by: [T060]

- [ ] T026 Extend CJS config bridge
  files: src/core/bridge/config.cjs (MODIFY)
  traces: FR-004
  blocked_by: [T024]

- [ ] T027 Extend manifest schema with bindings.sub_tasks additive field
  files: src/isdlc/config/external-skills-manifest.schema.json (MODIFY)
  traces: FR-004, AC-004-03
  blocked_by: [T060]

- [ ] T028 Update manifest loader for additive field tolerance
  files: src/core/skills/manifest-loader.js (MODIFY)
  traces: FR-004
  blocked_by: [T027]

### Tier 2: Core modules (depend on schemas + definitions)

- [ ] T016 Implement definition loader
  files: src/core/roundtable/definition-loader.js (CREATE)
  traces: FR-002, AC-002-01, AC-002-03
  blocked_by: [T005, T006]

- [ ] T017 Implement state machine runtime
  files: src/core/roundtable/state-machine.js (CREATE)
  traces: FR-002, AC-002-01, AC-002-02
  blocked_by: [T005, T006, T016]

- [ ] T018 Implement state card composer
  files: src/core/roundtable/state-card-composer.js (CREATE)
  traces: FR-001, AC-001-01
  blocked_by: [T009, T014]

- [ ] T019 Implement task card composer
  files: src/core/roundtable/task-card-composer.js (CREATE)
  traces: FR-001, AC-001-02, FR-004, AC-004-01, AC-004-02, AC-004-03
  blocked_by: [T010, T015]

- [ ] T020 Implement rolling state store
  files: src/core/roundtable/rolling-state.js (CREATE)
  traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04
  blocked_by: [T008]

- [ ] T021 Implement trailer parser
  files: src/core/roundtable/trailer-parser.js (CREATE)
  traces: FR-003, AC-003-01, AC-003-03
  blocked_by: [T007]

- [ ] T022 Implement per-sub-task marker extractors
  files: src/core/roundtable/markers/scope-framing.markers.js (CREATE), src/core/roundtable/markers/codebase-scan.markers.js (CREATE), src/core/roundtable/markers/blast-radius.markers.js (CREATE), src/core/roundtable/markers/options-research.markers.js (CREATE), src/core/roundtable/markers/dependency-check.markers.js (CREATE), src/core/roundtable/markers/tracing.markers.js (CREATE)
  traces: FR-003, AC-003-02
  blocked_by: [T060]

- [ ] T023 Implement markers index and dispatch
  files: src/core/roundtable/markers/index.js (CREATE)
  traces: FR-003
  blocked_by: [T022]

### Tier 3: Handler restructure (depends on core modules)

- [ ] T029 Restructure analyze handler step 7
  files: src/claude/commands/isdlc.md (MODIFY)
  traces: FR-005, AC-005-01, FR-006, AC-006-02
  blocked_by: [T017, T018, T019, T020, T021, T023]

- [ ] T030 Restructure bug-gather handler step 6.5d
  files: src/claude/commands/isdlc.md (MODIFY)
  traces: FR-005, FR-006, AC-006-02
  blocked_by: [T017, T018, T019, T020, T021, T023, T029]

- [ ] T031 Add fail-open fallback path for definition loader failure
  files: src/claude/commands/isdlc.md (MODIFY)
  traces: FR-002, AC-002-03, NFR-001
  blocked_by: [T029]

- [ ] T032 Add external_delegation field support in state machine
  files: src/core/roundtable/state-machine.js (MODIFY)
  traces: FR-002
  blocked_by: [T017]

- [ ] T033 Wire tracing-orchestrator dispatch via external_delegation
  files: src/isdlc/config/roundtable/bug-gather.json (MODIFY), src/claude/commands/isdlc.md (MODIFY)
  traces: FR-002, FR-006
  blocked_by: [T032, T030]

### Tier 3: Provider wiring (parallel with handler restructure)

- [ ] T045 Wire composed card delivery through Claude runtime
  files: src/providers/claude/runtime.js (MODIFY)
  traces: FR-005, AC-005-01
  blocked_by: [T029]

- [ ] T046 Wire composed card delivery through Codex runtime
  files: src/providers/codex/runtime.js (MODIFY)
  traces: FR-005, AC-005-02
  blocked_by: [T029]

- [ ] T047 Cross-provider parity tests
  files: tests/parity/roundtable-parity.test.js (CREATE)
  traces: FR-005, AC-005-03, NFR-002
  blocked_by: [T045, T046]

### Tier 4: Audit-driven migration (depends on BOTH mechanism stable AND audit done)

- [ ] T036 Migrate bucket-2 rules to compliance engine
  files: src/core/compliance/engine.cjs (MODIFY)
  traces: FR-007, AC-007-01
  blocked_by: [T034, T035, T029]

- [ ] T037 Migrate bucket-3 content to state and task card templates
  files: src/isdlc/config/roundtable/state-cards/ (MODIFY), src/isdlc/config/roundtable/task-cards/ (MODIFY)
  traces: FR-007, AC-007-01
  blocked_by: [T034, T035, T029]

- [ ] T038 Delete bucket-1 and bucket-5 content from protocol files
  files: src/claude/agents/roundtable-analyst.md (MODIFY), src/claude/agents/bug-roundtable-analyst.md (MODIFY)
  traces: FR-007, AC-007-01
  blocked_by: [T034, T035, T036, T037, T042]

### Tier 4: Parallel-run and migration (depends on handler restructure)

- [ ] T039 Implement parallel-run comparison harness
  files: tests/parallel-run/harness.js (CREATE)
  traces: FR-008, AC-008-01
  blocked_by: [T029]

- [ ] T040 Phase-1 migration: introduce mechanism alongside prose protocol
  files: src/claude/commands/isdlc.md (MODIFY)
  traces: FR-008
  blocked_by: [T029, T030, T031]

- [ ] T041 Run analyze parallel sessions and log divergences
  files: tests/parallel-run/analyze-comparison.test.js (CREATE)
  traces: FR-008, AC-008-01
  blocked_by: [T039, T040]

- [ ] T042 Cut over analyze when outputs converge
  files: src/claude/commands/isdlc.md (MODIFY)
  traces: FR-008
  blocked_by: [T041]

- [ ] T043 Run bug-gather parallel sessions
  files: tests/parallel-run/bug-gather-comparison.test.js (CREATE)
  traces: FR-008, AC-008-01
  blocked_by: [T039, T042]

- [ ] T044 Cut over bug-gather when outputs converge
  files: src/claude/commands/isdlc.md (MODIFY)
  traces: FR-008
  blocked_by: [T043]

### Tier 5: Regression and traceability

- [ ] T056 Build workflow regression tests
  files: tests/regression/build-workflow-unchanged.test.js (CREATE)
  traces: FR-006, AC-006-01

- [ ] T057 Verify phase-loop injection unchanged
  files: tests/regression/phase-loop-injection.test.js (CREATE)
  traces: FR-006, AC-006-01

- [ ] T058 Author audit traceability log
  files: docs/requirements/REQ-GH-253-context-manager-hooks-inject-before-delegation/audit-traceability.md (CREATE)
  traces: FR-007, NFR-005
  blocked_by: [T034, T035, T036, T037, T038]

- [ ] T059 Scripted verification of cut-to-mechanism traceability
  files: tests/audit/cut-mechanism-traceability.test.js (CREATE)
  traces: FR-007, NFR-005
  blocked_by: [T058]

## Phase 16: Quality Loop -- COMPLETE

- [X] T048 Execute unit test suite for all new core modules
  traces: FR-001, FR-002, FR-003, FR-004
  blocked_by: [T016, T017, T018, T019, T020, T021, T022, T023]

- [X] T049 Execute integration tests on analyze and bug-gather workflows
  traces: FR-005, FR-006
  blocked_by: [T029, T030]

- [X] T050 Execute performance tests for 200ms budget
  traces: NFR-003
  blocked_by: [T029]

- [X] T051 Execute cross-provider parity tests
  traces: NFR-002
  blocked_by: [T047]

- [X] T052 Execute prompt verification tests for updated roundtable protocols
  traces: FR-007
  blocked_by: [T038]

## Phase 08: Code Review -- PENDING

- [ ] T053 Code review all new core modules
  traces: FR-001, FR-002, FR-003, FR-004, FR-005
  blocked_by: [T048, T049, T050, T051]

- [ ] T054 Constitutional compliance check
  traces: Articles I, II, III, V, VI, VII, VIII, IX, X, XIII
  blocked_by: [T053]

- [ ] T055 Review specification fidelity of audit deletions
  traces: NFR-005
  blocked_by: [T052, T058, T059]

## Dependency Graph

Critical path: T034/T035 -> T060 [decision gate] -> T005/T006 -> T016 -> T017 -> T029 -> T039/T040 -> T041 -> T042 -> T036/T037 -> T038 -> T052 -> T055

Key change from v1: audit (T034/T035) and scope calibration (T060) are now tier 0 — they gate all downstream work. The decision gate at T060 can scale the entire build up or down based on what the audit reveals.
