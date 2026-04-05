# Tasks — REQ-GH-235

**Slug**: REQ-GH-235-rewrite-roundtable-analyst-for-consistent-roundtable-ux
**Last Updated**: 2026-04-05
**Total Tasks**: 45
**Coverage**: 10/10 FRs, 40/40 ACs

---

## Progress Summary

| Phase | Complete | Total | Percent |
|-------|----------|-------|---------|
| Phase 05: Test Strategy | 3 | 3 | 100% |
| Phase 06: Implementation | 0 | 42 | 0% |
| **Total** | **3** | **45** | **7%** |

---

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 test-strategy-rewritten-prompt | traces: FR-001, FR-007
  files: tests/prompt-verification (NEW test scaffolds)
  blocked_by: []
  blocks: [T023, T024, T025, T026, T027, T028, T029]

- [X] T002 test-strategy-hook-audit-and-extensions | traces: FR-008
  files: src/claude/hooks/tests (NEW scaffolds)
  blocked_by: []
  blocks: [T032, T041]

- [X] T003 test-strategy-runtime-composer | traces: FR-005
  files: tests/core/roundtable (NEW)
  blocked_by: []
  blocks: [T014]

---

## Phase 06: Implementation -- PENDING

### Runtime composer + persona schema (FR-005)

- [ ] T012 design-persona-frontmatter-promotion-schema | traces: FR-005, AC-005-03
  files: docs/isdlc/persona-authoring-guide.md (MODIFY)
  blocked_by: []
  blocks: [T013, T016]

- [ ] T013 implement-runtime-composer | traces: FR-005, AC-005-04
  files: src/core/roundtable/runtime-composer.js (NEW)
  blocked_by: [T012, T017]
  blocks: [T014, T015]

- [ ] T014 unit-test-runtime-composer | traces: FR-005, AC-005-05
  files: tests/core/roundtable/runtime-composer.test.js (NEW)
  blocked_by: [T003, T013]
  blocks: []

- [ ] T015 wire-composer-into-analyze-handler | traces: FR-005, AC-005-04
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T013]
  blocks: []

- [ ] T016 update-persona-domain-expert-template | traces: FR-005, AC-005-03
  files: src/claude/agents/persona-domain-expert.md (MODIFY)
  blocked_by: [T012]
  blocks: []

- [ ] T017 define-extension-point-taxonomy | traces: FR-005
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: []
  blocks: [T013]

### Prompt rewrite — roundtable-analyst.md (FR-001, FR-002, FR-003, FR-004, FR-006)

- [ ] T004 rewrite-roundtable-analyst-structure | traces: FR-001, AC-001-02
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: []
  blocks: [T005, T006, T007, T008, T009, T010]

- [ ] T005 rewrite-roundtable-analyst-behavior-contract | traces: FR-001, FR-003
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

- [ ] T006 rewrite-roundtable-analyst-state-machine | traces: FR-001, FR-002
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004, T018]
  blocks: []

- [ ] T007 rewrite-roundtable-analyst-domain-contracts | traces: FR-001, FR-002
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004, T006]
  blocks: []

- [ ] T008 rewrite-roundtable-analyst-rendering-modes | traces: FR-004
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

- [ ] T009 rewrite-roundtable-analyst-persona-model | traces: FR-005
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004, T017]
  blocks: []

- [ ] T010 rewrite-roundtable-analyst-appendices | traces: FR-006
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

### Template binding rules (FR-002)

- [ ] T018 bind-templates-inline-per-state | traces: FR-002, AC-002-01
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: [T006]

- [ ] T019 separate-tasks-onscreen-vs-written-rules | traces: FR-002, AC-002-02, AC-002-03
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

### Anti-shortcut rules (FR-003)

- [ ] T020 draft-antishortcut-rules | traces: FR-003, AC-003-01
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

- [ ] T021 draft-preconfirmation-participation-rules | traces: FR-003, AC-003-02
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

- [ ] T022 draft-no-writes-before-confirmation-rule | traces: FR-003, AC-003-04
  files: src/claude/agents/roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: []

### bug-roundtable-analyst rewrite (FR-009)

- [ ] T011 rewrite-bug-roundtable-analyst | traces: FR-009, AC-009-01, AC-009-02, AC-009-03
  files: src/claude/agents/bug-roundtable-analyst.md (MODIFY)
  blocked_by: [T004]
  blocks: [T030]

### New prompt-verification tests (FR-007)

- [ ] T023 test-anti-shortcut-enforcement | traces: FR-007, AC-007-01
  files: tests/prompt-verification/anti-shortcut-enforcement.test.js (NEW)
  blocked_by: [T001, T020]
  blocks: []

- [ ] T024 test-state-local-template-binding | traces: FR-007, AC-007-02
  files: tests/prompt-verification/state-local-template-binding.test.js (NEW)
  blocked_by: [T001, T018]
  blocks: []

- [ ] T025 test-confirmation-sequencing-v2 | traces: FR-007, AC-007-03
  files: tests/prompt-verification/confirmation-sequencing-v2.test.js (NEW)
  blocked_by: [T001, T006]
  blocks: []

- [ ] T026 test-rendering-mode-invariants | traces: FR-007, AC-007-04
  files: tests/prompt-verification/rendering-mode-invariants.test.js (NEW)
  blocked_by: [T001, T008]
  blocks: []

- [ ] T027 test-persona-extension-composition | traces: FR-007, AC-007-05
  files: tests/prompt-verification/persona-extension-composition.test.js (NEW)
  blocked_by: [T001, T009]
  blocks: []

- [ ] T028 test-participation-gate | traces: FR-007, AC-007-06
  files: tests/prompt-verification/participation-gate.test.js (NEW)
  blocked_by: [T001, T021]
  blocks: []

- [ ] T029 test-tasks-render-as-table | traces: FR-007, AC-007-07
  files: tests/prompt-verification/tasks-render-as-table.test.js (NEW)
  blocked_by: [T001, T019]
  blocks: []

- [ ] T030 test-bug-roundtable-rewritten-contract | traces: FR-009, AC-009-04
  files: tests/prompt-verification/bug-roundtable-rewritten-contract.test.js (NEW)
  blocked_by: [T001, T011]
  blocks: []

### Existing test updates (FR-008)

- [ ] T031 update-8-existing-prompt-verification-tests | traces: FR-008, AC-008-04
  files: tests/prompt-verification/template-confirmation-enforcement.test.js (MODIFY)
  files: tests/prompt-verification/provider-neutral-analysis-contract.test.js (MODIFY)
  files: tests/prompt-verification/confirmation-sequence.test.js (MODIFY)
  files: tests/prompt-verification/inline-roundtable-execution.test.js (MODIFY)
  files: tests/prompt-verification/orchestrator-conversational-opening.test.js (MODIFY)
  files: tests/prompt-verification/depth-control.test.js (MODIFY)
  files: tests/prompt-verification/analyze-flow-optimization.test.js (MODIFY)
  files: tests/prompt-verification/parallel-execution.test.js (MODIFY)
  blocked_by: [T004, T005, T006, T007, T008, T009, T010]
  blocks: []

### Hook audit + updates (FR-008)

- [ ] T032 audit-7-relevant-hooks-align-with-rewrite | traces: FR-008, AC-008-01
  files: docs/requirements/REQ-GH-235-rewrite-roundtable-analyst-for-consistent-roundtable-ux/hook-audit-report.md (NEW)
  blocked_by: [T002, T004]
  blocks: [T033, T034, T035, T036]

- [ ] T033 update-conversational-compliance-hook | traces: FR-008, AC-008-02
  files: src/claude/hooks/conversational-compliance.cjs (MODIFY)
  blocked_by: [T032]
  blocks: []

- [ ] T034 update-output-format-validator-hook | traces: FR-008, AC-008-02
  files: src/claude/hooks/output-format-validator.cjs (MODIFY)
  blocked_by: [T032]
  blocks: []

- [ ] T035 update-menu-halt-enforcer-hook | traces: FR-008, AC-008-02
  files: src/claude/hooks/menu-halt-enforcer.cjs (MODIFY)
  blocked_by: [T032]
  blocks: []

- [ ] T036 update-other-hooks-from-audit-findings | traces: FR-008, AC-008-02
  files: src/claude/hooks (MODIFY, audit-driven)
  blocked_by: [T032]
  blocks: []

- [ ] T037 update-existing-hook-tests | traces: FR-008, AC-008-04
  files: src/claude/hooks/tests (MODIFY)
  blocked_by: [T033, T034, T035, T036]
  blocks: []

### New hooks (FR-008)

- [ ] T038 implement-tasks-as-table-validator | traces: FR-008, AC-008-03, FR-003
  files: src/claude/hooks/tasks-as-table-validator.cjs (NEW)
  blocked_by: [T002]
  blocks: [T041, T042]

- [ ] T039 implement-participation-gate-enforcer | traces: FR-008, AC-008-03, FR-003
  files: src/claude/hooks/participation-gate-enforcer.cjs (NEW)
  blocked_by: [T002]
  blocks: [T041, T042]

- [ ] T040 implement-persona-extension-composer-validator | traces: FR-008, AC-008-03, FR-005
  files: src/claude/hooks/persona-extension-composer-validator.cjs (NEW)
  blocked_by: [T002]
  blocks: [T041, T042]

- [ ] T041 test-3-new-hooks | traces: FR-008, AC-008-04
  files: src/claude/hooks/tests/tasks-as-table-validator.test.cjs (NEW)
  files: src/claude/hooks/tests/participation-gate-enforcer.test.cjs (NEW)
  files: src/claude/hooks/tests/persona-extension-composer-validator.test.cjs (NEW)
  blocked_by: [T038, T039, T040]
  blocks: []

- [ ] T042 register-new-hooks-in-settings-json | traces: FR-008, AC-008-03
  files: .claude/settings.json (MODIFY)
  blocked_by: [T038, T039, T040]
  blocks: []

### Documentation (FR-010)

- [ ] T043 update-CLAUDE-md-persona-extensibility | traces: FR-010, AC-010-01
  files: CLAUDE.md (MODIFY)
  blocked_by: [T009]
  blocks: []

- [ ] T044 regenerate-docs-AGENTS-md | traces: FR-010, AC-010-02
  files: docs/AGENTS.md (REGENERATE)
  blocked_by: [T004, T011]
  blocks: []

- [ ] T045 update-persona-authoring-guide | traces: FR-010, AC-010-03
  files: docs/isdlc/persona-authoring-guide.md (MODIFY)
  blocked_by: [T012]
  blocks: []
