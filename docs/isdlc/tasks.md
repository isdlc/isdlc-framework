# Task Plan: REQ-GH-218 support-bug-specific-roundtable-analysis-in-analyze

## Progress Summary

| Phase | Total | Done | Status |
|-------|-------|------|--------|
| 05    | 3     | 0    | PENDING |
| 06    | 8     | 0    | PENDING |
| 16    | 2     | 0    | PENDING |
| 08    | 2     | 0    | PENDING |
| **Total** | **15** | **0** | **0%** |

## Phase 05: Test Strategy -- PENDING

- [ ] T0001 Design test cases for bug-specific confirmation templates (JSON schema validation) | traces: FR-004, AC-004-01, AC-004-02, AC-004-03
  files: tests/hooks/config/templates/bug-templates.test.js (CREATE)

- [ ] T0002 Design test cases for isdlc.md step 6.5 routing and build kickoff logic | traces: FR-005, FR-006, AC-005-02, AC-005-03, AC-006-01
  files: tests/commands/isdlc-bug-roundtable.test.js (CREATE)

- [ ] T0003 Design test cases for tracing delegation adapter (ANALYSIS_MODE flag, discovery context passthrough) | traces: FR-002, AC-002-01, AC-002-02, AC-002-03
  files: tests/commands/isdlc-bug-tracing-delegation.test.js (CREATE)

## Phase 06: Implementation -- PENDING

- [ ] T0004 Create bug-summary.template.json | traces: FR-004, AC-004-01
  files: src/claude/hooks/config/templates/bug-summary.template.json (CREATE)

- [ ] T0005 Create root-cause.template.json | traces: FR-004, AC-004-02
  files: src/claude/hooks/config/templates/root-cause.template.json (CREATE)

- [ ] T0006 Create fix-strategy.template.json | traces: FR-003, FR-004, AC-003-01, AC-003-02, AC-003-03, AC-004-03
  files: src/claude/hooks/config/templates/fix-strategy.template.json (CREATE)

- [ ] T0007 Create bug-roundtable-analyst.md protocol (opening, conversation, bug-report production, tracing delegation, fix strategy, confirmation sequence, artifact batch write, build kickoff signal) | traces: FR-001, FR-002, FR-003, FR-004, AC-001-01, AC-001-02, AC-001-03, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-003-01, AC-003-02, AC-003-03, AC-004-01, AC-004-02, AC-004-03, AC-004-04, AC-004-05, AC-004-06
  files: src/claude/agents/bug-roundtable-analyst.md (CREATE)
  blocked_by: [T0004, T0005, T0006]
  blocks: [T0008, T0009]

- [ ] T0008 Modify isdlc.md step 6.5c-f: route to bug-roundtable-analyst.md, execute inline, update meta with 01-requirements and 02-tracing, replace fix handoff with auto build kickoff via START_PHASE 05-test-strategy | traces: FR-004, FR-005, FR-006, AC-004-06, AC-005-01, AC-005-02, AC-005-03, AC-006-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0007]
  blocks: [T0009, T0010]

- [ ] T0009 Add deprecation header to bug-gather-analyst.md | traces: FR-006, AC-006-02
  files: src/claude/agents/bug-gather-analyst.md (MODIFY)
  blocked_by: [T0008]

- [ ] T0010 Write unit tests for template validation, routing logic, and tracing delegation | traces: FR-001, FR-002, FR-004, FR-005, FR-006
  files: tests/hooks/config/templates/bug-templates.test.js (MODIFY), tests/commands/isdlc-bug-roundtable.test.js (MODIFY), tests/commands/isdlc-bug-tracing-delegation.test.js (MODIFY)
  blocked_by: [T0008]
  blocks: [T0011]

- [ ] T0011 Copy bug-specific templates to root .claude/hooks/config/templates/ (dogfooding dual-file) | traces: FR-004
  files: .claude/hooks/config/templates/bug-summary.template.json (CREATE), .claude/hooks/config/templates/root-cause.template.json (CREATE), .claude/hooks/config/templates/fix-strategy.template.json (CREATE)
  blocked_by: [T0010]

## Phase 16: Quality Loop -- PENDING

- [ ] T0012 Run full test suite, verify all T0001-T0003 test cases pass, verify no regressions in existing bug-gather and roundtable tests | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
  blocked_by: [T0011]
  blocks: [T0013]

- [ ] T0013 Verify dual-file consistency between src/ and root .claude/ for all new templates | traces: FR-004, FR-006
  blocked_by: [T0012]

## Phase 08: Code Review -- PENDING

- [ ] T0014 Constitutional review: Article I (spec primacy), Article V (simplicity), Article VIII (documentation — deprecation notice), Article IX (gate integrity), Article X (fail-safe — tracing delegation failure handling) | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
  blocked_by: [T0013]

- [ ] T0015 Verify all ACs are covered: trace each AC back through task traces to test cases (T0001-T0003) and implementation tasks (T0004-T0011) | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
  blocked_by: [T0013]

## Dependency Graph

T0004 ─┐
T0005 ─┼─> T0007 ──> T0008 ──> T0009
T0006 ─┘              │
                      ├──> T0010 ──> T0011 ──> T0012 ──> T0013 ──> T0014
                      │                                         └──> T0015
                      └──> T0010

Critical path: T0004 → T0007 → T0008 → T0010 → T0011 → T0012 → T0013 → T0014 (8 tasks)

## Traceability Matrix

| FR | ACs | Test Tasks (05) | Impl Tasks (06) | QA Tasks (08) |
|----|-----|-----------------|------------------|---------------|
| FR-001 | AC-001-01, AC-001-02, AC-001-03 | T0002 | T0007, T0010 | T0015 |
| FR-002 | AC-002-01, AC-002-02, AC-002-03, AC-002-04 | T0003 | T0007, T0010 | T0015 |
| FR-003 | AC-003-01, AC-003-02, AC-003-03 | T0001 | T0006, T0007 | T0015 |
| FR-004 | AC-004-01 thru AC-004-06 | T0001, T0002 | T0004, T0005, T0006, T0007, T0008, T0011 | T0015 |
| FR-005 | AC-005-01, AC-005-02, AC-005-03 | T0002 | T0008 | T0015 |
| FR-006 | AC-006-01, AC-006-02 | T0002 | T0008, T0009, T0011 | T0014, T0015 |
