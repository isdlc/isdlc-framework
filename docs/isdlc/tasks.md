# Task Plan: REQ-GH-212-task-list-consumption-model-for-build-phase-agents

**Source**: github GH-212
**Generated after**: Analysis acceptance
**FRs**: 11 | **ADRs**: 6 | **Estimated LOC**: ~616
**Format**: v2.0

---

## Phase 05: Test Strategy -- COMPLETE

- [X] T0001 [P] Design test cases for task-reader.js parse logic | traces: FR-011, AC-011-01, AC-011-02, AC-011-03, AC-011-04
    files: docs/requirements/REQ-GH-212-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0009
- [X] T0002 [P] Design test cases for formatTaskContext injection | traces: FR-007, AC-007-04, AC-007-05, AC-007-06
    files: docs/requirements/REQ-GH-212-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0012, T0013
- [X] T0003 [P] Design test cases for plan-surfacer Phase 05 gate | traces: FR-006, AC-006-01, AC-006-02, AC-006-03
    files: docs/requirements/REQ-GH-212-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0014
- [X] T0004 [P] Design test cases for state-machine light tier update | traces: FR-002, AC-002-01
    files: docs/requirements/REQ-GH-212-.../test-strategy.md (MODIFY)
    blocked_by: none
    blocks: T0015

## Phase 06: Implementation -- COMPLETE

### Setup

- [X] T0005 Create src/core/tasks/ directory and task-reader.js module skeleton | traces: FR-011, AC-011-01
    files: src/core/tasks/task-reader.js (CREATE)
    blocked_by: none
    blocks: T0009

### Foundational

- [X] T0006 Implement readTaskPlan() v2.0 parser | traces: FR-011, AC-011-01, AC-011-02, AC-011-03, AC-011-04
    files: src/core/tasks/task-reader.js (MODIFY)
    blocked_by: T0005
    blocks: T0007, T0008
- [X] T0007 Implement getTasksForPhase() phase extractor | traces: FR-011, AC-011-01, FR-007, AC-007-01
    files: src/core/tasks/task-reader.js (MODIFY)
    blocked_by: T0006
    blocks: T0008
- [X] T0008 Implement formatTaskContext() prompt injection formatter | traces: FR-007, AC-007-04, AC-007-05, AC-007-06
    files: src/core/tasks/task-reader.js (MODIFY)
    blocked_by: T0007
    blocks: T0012, T0013

### Core Implementation

- [X] T0009 Write task-reader.js unit tests | traces: FR-011, AC-011-01, AC-011-02, AC-011-03, AC-011-04
    files: tests/core/tasks/task-reader.test.js (CREATE)
    blocked_by: T0001, T0005, T0006
    blocks: T0012

- [X] T0010 Upgrade ORCH-012 SKILL.md for file-level task generation across all phases | traces: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
    files: src/claude/skills/orchestration/generate-plan/SKILL.md (MODIFY)
    blocked_by: none
    blocks: T0011

- [X] T0011 Add light-workflow task derivation logic to ORCH-012 | traces: FR-001, AC-001-02, FR-002, AC-002-01
    files: src/claude/skills/orchestration/generate-plan/SKILL.md (MODIFY)
    blocked_by: T0010
    blocks: T0015

- [X] T0012 Add TASK_CONTEXT injection to phase-loop step 3d (Claude path) | traces: FR-007, AC-007-05, FR-003, AC-003-05, FR-008, AC-008-07, FR-009, AC-009-06, FR-010, AC-010-05
    files: src/claude/commands/isdlc.md (MODIFY)
    blocked_by: T0002, T0008, T0009
    blocks: T0016, T0017, T0018, T0019

- [X] T0013 Add TASK_CONTEXT injection to Codex projection.js | traces: FR-007, AC-007-06, FR-003, AC-003-06, FR-008, AC-008-08, FR-009, AC-009-07, FR-010, AC-010-06
    files: src/providers/codex/projection.js (MODIFY)
    blocked_by: T0002, T0008
    blocks: T0020, T0021, T0022, T0023

- [X] T0014 Update plan-surfacer.cjs — remove 05-test-strategy from EARLY_PHASES | traces: FR-006, AC-006-01, AC-006-02
    files: src/claude/hooks/plan-surfacer.cjs (MODIFY)
    blocked_by: T0003
    blocks: T0024

- [X] T0015 Update state-machine.js — add PRESENTING_TASKS to tierPaths.light | traces: FR-002, AC-002-01
    files: src/core/analyze/state-machine.js (MODIFY)
    blocked_by: T0004, T0011
    blocks: T0025

### Agent Specs (Claude)

- [X] T0016 Add task-driven test design section to 04-test-design-engineer.md | traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-05
    files: src/claude/agents/04-test-design-engineer.md (MODIFY)
    blocked_by: T0012
    blocks: T0026

- [X] T0017 Add task-driven implementation section to 05-software-developer.md | traces: FR-008, AC-008-01, AC-008-02, AC-008-03, AC-008-04, AC-008-05, AC-008-06, AC-008-07
    files: src/claude/agents/05-software-developer.md (MODIFY)
    blocked_by: T0012
    blocks: T0026

- [X] T0018 Add task-driven verification section to 16-quality-loop-engineer.md | traces: FR-009, AC-009-01, AC-009-02, AC-009-03, AC-009-04, AC-009-05, AC-009-06
    files: src/claude/agents/16-quality-loop-engineer.md (MODIFY)
    blocked_by: T0012
    blocks: T0026

- [X] T0019 Add task-driven review section to 07-qa-engineer.md | traces: FR-010, AC-010-01, AC-010-02, AC-010-03, AC-010-04, AC-010-05
    files: src/claude/agents/07-qa-engineer.md (MODIFY)
    blocked_by: T0012
    blocks: T0026

### Codex Team Instances

- [X] T0020 Update debate-test-strategy.js — Creator/Critic/Refiner task context | traces: FR-003, AC-003-06
    files: src/core/teams/instances/debate-test-strategy.js (MODIFY)
    blocked_by: T0013
    blocks: T0026

- [X] T0021 Update implementation-review-loop.js — Writer/Reviewer task context | traces: FR-008, AC-008-08
    files: src/core/teams/specs/implementation-review-loop.js (MODIFY)
    blocked_by: T0013
    blocks: T0026

- [X] T0022 Update quality-loop.js — Track A/B task context | traces: FR-009, AC-009-07
    files: src/core/teams/instances/quality-loop.js (MODIFY)
    blocked_by: T0013
    blocks: T0026

- [X] T0023 Update Phase 08 Codex projection — task-structured review units | traces: FR-010, AC-010-06
    files: src/providers/codex/projection.js (MODIFY)
    blocked_by: T0013
    blocks: T0026

### Infrastructure

- [X] T0024 Extend plan-surfacer.test.js — Phase 05 block tests | traces: FR-006, AC-006-02, AC-006-03
    files: tests/hooks/plan-surfacer.test.js (MODIFY)
    blocked_by: T0014
    blocks: T0026

- [X] T0025 Extend state-machine.test.js — light tier PRESENTING_TASKS tests | traces: FR-002, AC-002-01
    files: tests/core/analyze/state-machine.test.js (MODIFY)
    blocked_by: T0015
    blocks: T0026

- [X] T0026 Add roundtable light-tier task generation to roundtable-analyst.md | traces: FR-002, AC-002-01, AC-002-02, AC-002-03
    files: src/claude/agents/roundtable-analyst.md (MODIFY)
    blocked_by: T0016, T0017, T0018, T0019, T0020, T0021, T0022, T0023, T0024, T0025
    blocks: none

## Phase 16: Quality Loop -- COMPLETE

- [X] T0027 [P] Verify test coverage for task-reader.js | traces: FR-011
    files: tests/core/tasks/task-reader.test.js (VERIFY)
    blocked_by: none
    blocks: T0033
- [X] T0028 [P] Verify test coverage for plan-surfacer changes | traces: FR-006
    files: tests/hooks/plan-surfacer.test.js (VERIFY)
    blocked_by: none
    blocks: T0033
- [X] T0029 [P] Verify test coverage for state-machine changes | traces: FR-002
    files: tests/core/analyze/state-machine.test.js (VERIFY)
    blocked_by: none
    blocks: T0033
- [X] T0030 [P] Verify TASK_CONTEXT injection works in Claude path | traces: FR-007, AC-007-05
    files: src/claude/commands/isdlc.md (VERIFY)
    blocked_by: none
    blocks: T0033
- [X] T0031 [P] Verify TASK_CONTEXT injection works in Codex path | traces: FR-007, AC-007-06
    files: src/providers/codex/projection.js (VERIFY)
    blocked_by: none
    blocks: T0033
- [X] T0032 [P] SAST scan and dependency audit on new module | traces: FR-011
    files: src/core/tasks/task-reader.js (VERIFY)
    blocked_by: none
    blocks: T0033
- [X] T0033 Verify traceability — all 11 FRs have passing tests | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011
    files: docs/requirements/REQ-GH-212-.../test-strategy.md (VERIFY)
    blocked_by: T0027, T0028, T0029, T0030, T0031, T0032
    blocks: none

## Phase 08: Code Review -- COMPLETE

- [X] T0034 [P] Review task-reader.js module (parse, extract, format) | traces: FR-011, FR-007
    files: src/core/tasks/task-reader.js (REVIEW), tests/core/tasks/task-reader.test.js (REVIEW)
    blocked_by: none
    blocks: T0038
- [X] T0035 [P] Review ORCH-012 upgrade and light-workflow derivation | traces: FR-001, FR-002
    files: src/claude/skills/orchestration/generate-plan/SKILL.md (REVIEW)
    blocked_by: none
    blocks: T0038
- [X] T0036 [P] Review agent spec changes (Phase 05/06/16/08) and Codex team instances | traces: FR-003, FR-008, FR-009, FR-010
    files: src/claude/agents/04-test-design-engineer.md (REVIEW), src/claude/agents/05-software-developer.md (REVIEW), src/claude/agents/16-quality-loop-engineer.md (REVIEW), src/claude/agents/07-qa-engineer.md (REVIEW), src/core/teams/instances/debate-test-strategy.js (REVIEW), src/core/teams/specs/implementation-review-loop.js (REVIEW), src/core/teams/instances/quality-loop.js (REVIEW)
    blocked_by: none
    blocks: T0038
- [X] T0037 [P] Review infrastructure changes (plan-surfacer, state-machine, injection paths) | traces: FR-004, FR-005, FR-006
    files: src/claude/hooks/plan-surfacer.cjs (REVIEW), src/core/analyze/state-machine.js (REVIEW), src/claude/commands/isdlc.md (REVIEW), src/providers/codex/projection.js (REVIEW)
    blocked_by: none
    blocks: T0038
- [X] T0038 Cross-cutting review — provider parity and consumption contract consistency | traces: FR-007, FR-011
    files: docs/requirements/REQ-GH-212-.../code-review-report.md (CREATE)
    blocked_by: T0034, T0035, T0036, T0037
    blocks: none

---

## Traceability Matrix

| FR | Tasks | Coverage |
|---|---|---|
| FR-001 (3e-plan file-level) | T0010, T0011, T0035 | 100% |
| FR-002 (Light analysis tasks) | T0004, T0011, T0015, T0025, T0026, T0029 | 100% |
| FR-003 (Phase 05 consumes) | T0001, T0016, T0020, T0036 | 100% |
| FR-004 (Build-init copy retry) | T0037 | 100% |
| FR-005 (Retry on failure) | T0037 | 100% |
| FR-006 (Plan-surfacer blocks 05) | T0003, T0014, T0024, T0028 | 100% |
| FR-007 (Consumption contract) | T0002, T0008, T0012, T0013, T0030, T0031, T0034, T0038 | 100% |
| FR-008 (Phase 06 consumes) | T0017, T0021, T0036 | 100% |
| FR-009 (Phase 16 consumes) | T0018, T0022, T0036 | 100% |
| FR-010 (Phase 08 consumes) | T0019, T0023, T0036 | 100% |
| FR-011 (Task reader module) | T0001, T0005, T0006, T0007, T0008, T0009, T0027, T0032, T0034 | 100% |

## Progress Summary

| Phase | Total | Done | % |
|-------|-------|------|---|
| Phase 05: Test Strategy | 4 | 0 | 0% |
| Phase 06: Implementation | 22 | 0 | 0% |
| Phase 16: Quality Loop | 7 | 0 | 0% |
| Phase 08: Code Review | 5 | 0 | 0% |
| **Total** | **38** | **0** | **0%** |
