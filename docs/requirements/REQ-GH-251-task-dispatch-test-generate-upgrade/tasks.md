# Task Plan: REQ GH-251-task-dispatch-test-generate-upgrade

## Progress Summary

| Phase | Total | Done | Status |
|-------|-------|------|--------|
| 05 | 1 | 1 | COMPLETE |
| 06 | 5 | 0 | PENDING |
| 16 | 1 | 0 | PENDING |
| 08 | 1 | 0 | PENDING |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Design test strategy for GH-251 Track 1 changes | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006

## Phase 06: Implementation -- PENDING

- [ ] T002 Add precondition gate to isdlc.md test-generate handler | traces: FR-001, AC-001-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocks: [T003, T007]

- [ ] T003 Add artifact folder creation to isdlc.md test-generate handler | traces: FR-002, AC-002-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T002]
  blocks: [T007]

- [ ] T004 Add workflow_type agent_modifier to workflows.json for test-generate | traces: FR-003, FR-005, AC-005-01
  files: src/isdlc/config/workflows.json (MODIFY)
  blocks: [T005]

- [ ] T005 Add TEST-GENERATE MODE section to test-design-engineer agent | traces: FR-003, FR-004, FR-006, AC-003-01, AC-004-01, AC-006-01
  files: src/claude/agents/04-test-design-engineer.md (MODIFY)
  blocked_by: [T004]
  blocks: [T007]

- [ ] T007 Create Codex test-generate projection bundle | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
  files: src/providers/codex/projections/test-generate.md (CREATE)
  blocked_by: [T002, T003, T004, T005]

## Phase 16: Quality Loop -- PENDING

- [ ] T008 Run quality loop for all changes | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006

## Phase 08: Code Review -- PENDING

- [ ] T009 Code review and QA for GH-251 Track 1 | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006

## Dependency Graph

```
T002 (precondition gate)
  ├── T003 (artifact folder) ──┐
  │                            ├── T007 (Codex projection)
T004 (workflow modifier)       │
  └── T005 (TEST-GENERATE MODE)┘

Critical path: T004 → T005 → T007
```

## Traceability Matrix

| FR | AC | Tasks | Coverage |
|----|-----|-------|----------|
| FR-001 | AC-001-01 | T002, T007 | Full |
| FR-002 | AC-002-01 | T003, T007 | Full |
| FR-003 | AC-003-01 | T004, T005, T007 | Full |
| FR-004 | AC-004-01 | T005, T007 | Full |
| FR-005 | AC-005-01 | T004, T007 | Full |
| FR-006 | AC-006-01 | T005, T007 | Full |

**Coverage**: 6/6 FRs covered, 6/6 ACs covered. No orphan tasks.

## Assumptions and Inferences

- T002 and T003 are sequential: both modify isdlc.md — T003 depends on T002 being in place since artifact folder creation only makes sense after the precondition gate passes.
- T005 depends on T004: the agent's TEST-GENERATE MODE section reads the WORKFLOW_TYPE modifier that T004 adds to workflows.json.
- T007 is last tier: the Codex projection mirrors the Claude path, so all Claude-side tasks must complete first.
