# Task Plan: REQ-GH-213-contract-enforcement-must-be-inline

**Source**: github GH-213
**Generated after**: Analysis acceptance
**FRs**: 7 | **ADRs**: 3 | **Estimated LOC**: ~800
**Format**: v2.0

---

## Progress Summary

| Phase | Tasks | Completed | Status |
|-------|-------|-----------|--------|
| 05 - Test Strategy | 8 | 0 | PENDING |
| 06 - Implementation | 25 | 0 | PENDING |
| 16 - Quality Loop | 3 | 0 | PENDING |
| 08 - Code Review | 2 | 0 | PENDING |
| **Total** | **38** | **0** | **0%** |

---

## Phase 05: Test Strategy -- PENDING

- [ ] T0001 [P] Design test cases for ContractViolationError and all 6 check functions | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (CREATE)
    blocked_by: none
    blocks: T0011, T0012
- [ ] T0002 [P] Design test cases for checkDomainTransition — correct sequence, wrong sequence, missing sequence (fail-open) | traces: FR-002, AC-002-01
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0013
- [ ] T0003 [P] Design test cases for checkBatchWrite — all present, missing artifacts, null artifacts_produced (fail-open) | traces: FR-002, AC-002-02
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0014
- [ ] T0004 [P] Design test cases for checkPersonaFormat — bulleted format, numbered violation, table violation, missing template (fail-open) | traces: FR-002, AC-002-03, FR-004, AC-004-01, AC-004-03
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0015
- [ ] T0005 [P] Design test cases for checkPersonaContribution — all contribute, missing persona, dynamic persona list from config | traces: FR-002, AC-002-04, AC-002-05
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0016
- [ ] T0006 [P] Design test cases for template-loader — shipped default, user override, missing template (fail-open), malformed template (fail-open) | traces: FR-004, AC-004-01, AC-004-02, AC-004-04
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0017
- [ ] T0007 [P] Design test cases for checkTaskList — all categories present, missing category, missing metadata, missing required section | traces: FR-004, AC-004-05, AC-004-06
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0037
- [ ] T0038 [P] Design test cases for Codex parity — same check functions produce identical results when called from runtime.js vs analyze handler | traces: FR-007, AC-007-01, AC-007-02, AC-007-04
    files: docs/requirements/REQ-GH-213-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0028, T0029

## Phase 06: Implementation -- PENDING

### Setup

- [ ] T0008 Create src/core/validators/contract-checks.js module skeleton with ContractViolationError class | traces: FR-001, AC-001-04
    files: src/core/validators/contract-checks.js (CREATE)
    blocked_by: none
    blocks: T0011, T0012, T0013, T0014, T0015, T0016
- [ ] T0009 Create src/core/validators/template-loader.js module skeleton | traces: FR-004, AC-004-01
    files: src/core/validators/template-loader.js (CREATE)
    blocked_by: none
    blocks: T0017
- [ ] T0010 Create shipped presentation templates (requirements, architecture, design, tasks) | traces: FR-004, AC-004-01, AC-004-03, AC-004-05
    files: src/claude/hooks/config/templates/requirements.template.json (CREATE), src/claude/hooks/config/templates/architecture.template.json (CREATE), src/claude/hooks/config/templates/design.template.json (CREATE), src/claude/hooks/config/templates/tasks.template.json (CREATE)
    blocked_by: none
    blocks: T0017, T0022, T0037

### Core Check Functions

- [ ] T0011 Implement checkDomainTransition() — validate confirmation domain matches expected sequence position | traces: FR-002, AC-002-01, FR-001, AC-001-04
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0001, T0008
    blocks: T0019
- [ ] T0012 Implement checkBatchWrite() — validate all expected artifacts are in write set | traces: FR-002, AC-002-02, FR-001, AC-001-04
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0001, T0008
    blocks: T0019
- [ ] T0013 Implement checkPersonaFormat() — validate output matches active template format rules | traces: FR-002, AC-002-03, FR-001, AC-001-04
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0002, T0008
    blocks: T0019
- [ ] T0014 Implement checkPersonaContribution() — validate all configured personas have contributed | traces: FR-002, AC-002-04, AC-002-05
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0003, T0008
    blocks: T0019
- [ ] T0015 Implement checkDelegation() — validate correct agent for phase | traces: FR-003, AC-003-01
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0004, T0008
    blocks: T0020
- [ ] T0016 Implement checkArtifacts() — validate required artifacts exist on disk before phase completion | traces: FR-003, AC-003-02
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0005, T0008
    blocks: T0020

### Template Loader

- [ ] T0017 Implement loadTemplate() and loadAllTemplates() with override resolution | traces: FR-004, AC-004-01, AC-004-02, AC-004-04
    files: src/core/validators/template-loader.js (MODIFY)
    blocked_by: T0006, T0009, T0010
    blocks: T0022

### Task List Check

- [ ] T0037 Implement checkTaskList() — validate task plan includes all required phases, categories, metadata, and sections per template | traces: FR-004, AC-004-05, AC-004-06
    files: src/core/validators/contract-checks.js (MODIFY)
    blocked_by: T0007, T0008, T0010
    blocks: T0039

### Unit Tests

- [ ] T0039 Write unit tests for checkTaskList | traces: FR-004, AC-004-05, AC-004-06
    files: tests/core/validators/contract-checks.test.js (MODIFY)
    blocked_by: T0037
    blocks: T0030

- [ ] T0018 Write unit tests for ContractViolationError class | traces: FR-001, AC-001-04
    files: tests/core/validators/contract-checks.test.js (CREATE)
    blocked_by: T0008
    blocks: T0030
- [ ] T0019 Write unit tests for checkDomainTransition, checkBatchWrite, checkPersonaFormat, checkPersonaContribution | traces: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-002-05
    files: tests/core/validators/contract-checks.test.js (MODIFY)
    blocked_by: T0011, T0012, T0013, T0014
    blocks: T0030
- [ ] T0020 Write unit tests for checkDelegation and checkArtifacts | traces: FR-003, AC-003-01, AC-003-02
    files: tests/core/validators/contract-checks.test.js (MODIFY)
    blocked_by: T0015, T0016
    blocks: T0030
- [ ] T0021 Write unit tests for template-loader | traces: FR-004, AC-004-01, AC-004-02, AC-004-04
    files: tests/core/validators/template-loader.test.js (CREATE)
    blocked_by: T0017
    blocks: T0030

### Wiring — Claude Path

- [ ] T0022 Add templates to SessionStart cache — update rebuild-cache.js to include PRESENTATION_TEMPLATES section | traces: FR-004, AC-004-01, FR-001, AC-001-01
    files: bin/rebuild-cache.js (MODIFY)
    blocked_by: T0010, T0017
    blocks: T0023, T0024
- [ ] T0023 Wire 4 roundtable checks into analyze handler (isdlc.md step 7b) — checkDomainTransition, checkBatchWrite, checkPersonaFormat, checkPersonaContribution | traces: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04
    files: src/claude/commands/isdlc.md (MODIFY)
    blocked_by: T0019, T0022
    blocks: T0030
- [ ] T0024 Wire 2 phase-loop checks into isdlc.md — checkDelegation at STEP 3d, checkArtifacts at STEP 3e | traces: FR-003, AC-003-01, AC-003-02
    files: src/claude/commands/isdlc.md (MODIFY)
    blocked_by: T0020, T0022
    blocks: T0030
- [ ] T0025 Remove STEP 3e-contract post-phase evaluation from phase-loop controller | traces: FR-005, AC-005-01, AC-005-02
    files: src/claude/commands/isdlc.md (MODIFY)
    blocked_by: T0024
    blocks: T0030
- [ ] T0026 Update roundtable-analyst.md — reference inline contract checks at each protocol transition | traces: FR-002, AC-002-01, AC-002-03, AC-002-04
    files: src/claude/agents/roundtable-analyst.md (MODIFY)
    blocked_by: T0023
    blocks: T0030
- [ ] T0027 Wire discover orchestrator checks — checkDelegation and checkArtifacts at sub-agent boundaries | traces: FR-006, AC-006-01, AC-006-02, AC-006-03
    files: src/claude/agents/discover-orchestrator.md (MODIFY)
    blocked_by: T0020
    blocks: T0030
- [ ] T0040 Wire checkTaskList into analyze handler — validate task plan at "tasks" confirmation domain before presenting to user | traces: FR-004, AC-004-05, AC-004-06
    files: src/claude/commands/isdlc.md (MODIFY)
    blocked_by: T0039, T0022
    blocks: T0030

### Wiring — Codex Path

- [ ] T0028 Replace evaluateContract() call in runtime.js validatePhaseGate() with individual check functions | traces: FR-007, AC-007-02, FR-005, AC-005-03
    files: src/providers/codex/runtime.js (MODIFY)
    blocked_by: T0019, T0020
    blocks: T0030
- [ ] T0029 Update governance.js — change execution-contract checkpoint to reference contract-checks.js | traces: FR-007, AC-007-03
    files: src/providers/codex/governance.js (MODIFY)
    blocked_by: T0028
    blocks: T0030

### Cleanup

- [ ] T0030 Remove evaluateContract() batch function and formatViolationBanner() from contract-evaluator.js | traces: FR-005, AC-005-02, AC-005-04
    files: src/core/validators/contract-evaluator.js (MODIFY)
    blocked_by: T0019, T0020, T0023, T0024, T0025, T0026, T0027, T0028, T0029
    blocks: T0031
- [ ] T0031 Update existing contract-evaluator tests to remove batch function tests, add redirect tests | traces: FR-005, AC-005-04
    files: tests/core/validators/contract-evaluator.test.js (MODIFY), tests/core/validators/contract-evaluator-integration.test.js (MODIFY)
    blocked_by: T0030
    blocks: none

## Phase 16: Quality Loop -- PENDING

- [ ] T0032 Run full test suite — verify all new tests pass and no regressions in existing 555+ test baseline | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007
    files: (test execution, no file changes)
    blocked_by: T0018, T0019, T0020, T0021, T0031
    blocks: T0034
- [ ] T0033 Run Codex parity tests — verify governance-parity.test.js passes with updated checkpoint references | traces: FR-007, AC-007-04
    files: tests/verification/parity/governance-parity.test.js (MODIFY)
    blocked_by: T0007, T0028, T0029
    blocks: T0034
- [ ] T0034 Verify template override resolution — run with user override template, confirm override takes precedence | traces: FR-004, AC-004-02
    files: (test execution, no file changes)
    blocked_by: T0032, T0033
    blocks: T0035

## Phase 08: Code Review -- PENDING

- [ ] T0035 Review all new and modified files against constitutional articles (I, III, V, VII, IX, X, XIII) | traces: all FRs
    files: docs/requirements/REQ-GH-213-.../code-review-report.md (CREATE)
    blocked_by: T0034
    blocks: T0036
- [ ] T0036 Verify dual-file awareness — confirm both src/ (shipped) and .isdlc/ (dogfooding) template copies exist | traces: FR-004, FR-007
    files: .isdlc/config/templates/ (VERIFY)
    blocked_by: T0035
    blocks: none

---

## Dependency Graph

```
T0001-T0007 (test design, parallel)
    │
    ├── T0008-T0009 (module skeletons, parallel)
    │     │
    │     ├── T0011-T0016 (6 check functions, parallel after T0008)
    │     │     │
    │     │     ├── T0018-T0020 (unit tests for checks)
    │     │     └── T0023-T0024 (Claude wiring, after tests pass)
    │     │           │
    │     │           ├── T0025 (remove STEP 3e-contract)
    │     │           ├── T0026 (roundtable-analyst.md update)
    │     │           └── T0027 (discover orchestrator wiring)
    │     │
    │     └── T0017 (template-loader impl, after T0009+T0010)
    │           │
    │           ├── T0021 (template-loader tests)
    │           └── T0022 (rebuild-cache.js update)
    │
    ├── T0010 (shipped templates, no deps)
    │
    ├── T0028-T0029 (Codex wiring, after check function tests)
    │
    └── T0030-T0031 (cleanup, after ALL wiring complete)
          │
          └── T0032-T0034 (quality loop)
                │
                └── T0035-T0036 (code review)
```

**Critical path**: T0001 → T0008 → T0011 → T0019 → T0023 → T0025 → T0030 → T0032 → T0035

---

## Traceability Matrix

| FR | ACs | Test Design Tasks | Implementation Tasks | Verification Tasks |
|----|-----|-------------------|---------------------|--------------------|
| FR-001 | AC-001-01 to AC-001-04 | T0001 | T0008, T0011-T0016, T0018 | T0032 |
| FR-002 | AC-002-01 to AC-002-05 | T0002-T0005 | T0011-T0014, T0019, T0023, T0026 | T0032 |
| FR-003 | AC-003-01, AC-003-02 | T0001 | T0015, T0016, T0020, T0024 | T0032 |
| FR-004 | AC-004-01 to AC-004-06 | T0004, T0006, T0007 | T0009, T0010, T0017, T0021, T0022, T0037, T0039, T0040 | T0034 |
| FR-005 | AC-005-01 to AC-005-04 | — | T0025, T0028, T0030, T0031 | T0032 |
| FR-006 | AC-006-01 to AC-006-03 | — | T0027 | T0032 |
| FR-007 | AC-007-01 to AC-007-04 | T0007 | T0028, T0029 | T0033 |
