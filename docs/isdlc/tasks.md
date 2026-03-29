# Task Plan: REQ-GH-116 REQ-GH-116-extract-agent-protocols-from-claude-md

**Version**: 2.0
**Generated**: 2026-03-29
**Workflow**: feature
**Artifact Folder**: REQ-GH-116-extract-agent-protocols-from-claude-md

---

## Progress Summary

| Phase | Tasks | Completed | Status |
|-------|-------|-----------|--------|
| 05 — Test Strategy | 4 | 0 | PENDING |
| 06 — Implementation | 14 | 0 | PENDING |
| 16 — Quality Loop | 4 | 0 | PENDING |
| 08 — Code Review | 2 | 0 | PENDING |
| **Total** | **24** | **0** | **0%** |

---

## Phase 05: Test Strategy -- PENDING

### test_case_design

- [ ] T0001 Design test cases for protocol injection — phase filtering, header extraction, multi-section extraction, missing file, malformed markdown, fail-open | traces: FR-002, FR-005, AC-002-01, AC-002-02, AC-005-01
- [ ] T0002 Design test cases for user content extraction — exclusion of SECTION markers, exclusion of protocol range, empty user content, all-framework CLAUDE.md | traces: FR-003, AC-003-01
- [ ] T0003 Design test cases for compliance detection — git_commit_detected signal, timing window, empty violations, check failure fallback | traces: FR-006, AC-006-01, AC-006-02
- [ ] T0004 Design test cases for violation response — remediation prompt content, retry counter, escalation at max retries | traces: FR-007, AC-007-01, AC-007-02

---

## Phase 06: Implementation -- PENDING

### setup

- [ ] T0005 Create protocol-mapping.json with all 9 protocol mappings, phase arrays, checkable flags, source_file config, user content extraction config | traces: FR-001, AC-001-01, AC-001-02
  files: src/claude/hooks/config/protocol-mapping.json (CREATE)
  blocks: [T0006, T0008, T0010]

### core_implementation

- [ ] T0006 Implement PROTOCOL INJECTION step in isdlc.md STEP 3d — read mapping config, read CLAUDE.md or AGENTS.md, extract mapped sections by header, build PROTOCOLS block, append to delegation prompt | traces: FR-002, FR-004, FR-005, AC-002-01, AC-004-01, AC-004-02, AC-005-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0005]
  blocks: [T0007]

- [ ] T0007 Implement user content extraction — exclude SECTION markers, exclude protocol range, build USER INSTRUCTIONS block, append to delegation prompt | traces: FR-003, AC-003-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0006]

- [ ] T0008 Implement checkProtocolCompliance between STEP 3e and 3f — filter checkable protocols for current phase, run check signals, return violations array | traces: FR-006, AC-006-01, AC-006-02
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0005]
  blocks: [T0009, T0010]

- [ ] T0009 Implement git_commit_detected check signal — git log with after/before timing window, parse output | traces: FR-006, AC-006-01
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0008]

- [ ] T0010 Implement 3f-protocol-violation handler — re-delegate with remediation prompt, retry counter via 3f-retry-protocol max 2, escalation menu | traces: FR-007, AC-007-01, AC-007-02
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0008]

### unit_tests

- [ ] T0011 Write unit tests for protocol section extraction — header matching, multi-section, missing sections, malformed CLAUDE.md, fail-open | traces: FR-002, FR-005, AC-002-02
  files: tests/protocol-injection.test.cjs (CREATE)
  blocked_by: [T0006]

- [ ] T0012 Write unit tests for user content extraction — exclusion logic, empty content, all-framework file | traces: FR-003
  files: tests/protocol-injection.test.cjs (MODIFY)
  blocked_by: [T0007, T0011]

- [ ] T0013 Write unit tests for compliance detection — git commit signal, empty violations, timing edge cases, check failure fallback | traces: FR-006
  files: tests/protocol-compliance.test.cjs (CREATE)
  blocked_by: [T0008]

### wiring_claude

- [ ] T0014 Wire protocol injection into Phase-Loop Controller STEP 3d — position after SKILL INJECTION, before GATE REQUIREMENTS. Wire compliance check between 3e and 3f. | traces: FR-002, FR-006
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0006, T0008]

### wiring_codex

- [ ] T0015 Verify Codex adapter reads AGENTS.md for protocol extraction — confirm source_file.codex path resolves, document adjustments | traces: FR-004
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0006]

### cleanup

- [ ] T0016 Copy protocol-mapping.json to .claude/hooks/config/protocol-mapping.json for dogfooding dual-file | traces: FR-001
  files: .claude/hooks/config/protocol-mapping.json (CREATE)
  blocked_by: [T0005]

---

## Phase 16: Quality Loop -- PENDING

### test_execution

- [ ] T0017 Run full test suite — all existing tests plus new protocol-injection and protocol-compliance tests | traces: NFR-001
- [ ] T0018 Verify fail-open behavior end-to-end — missing CLAUDE.md, missing mapping config, malformed JSON, git log failure | traces: FR-002, AC-002-02, NFR-001

### parity_verification

- [ ] T0019 Verify src/ and .claude/ protocol-mapping.json copies are identical | traces: FR-001
- [ ] T0020 Verify protocol injection produces identical output for a known CLAUDE.md input — snapshot test | traces: FR-002, FR-005

---

## Phase 08: Code Review -- PENDING

### constitutional_review

- [ ] T0021 Constitutional review — verify Article X fail-open, Article IX no gate bypass, Article V simplicity | traces: NFR-001

### dual_file_check

- [ ] T0022 Dual-file check — confirm src/ and .claude/ protocol-mapping.json in sync, verify isdlc.md changes work for both providers | traces: FR-001, FR-004

---

## Dependency Graph

```
T0005 ──┬──→ T0006 ──┬──→ T0007
        │            ├──→ T0011 ──→ T0012
        │            ├──→ T0014
        │            └──→ T0015
        ├──→ T0008 ──┬──→ T0009
        │            ├──→ T0010
        │            ├──→ T0013
        │            └──→ T0014
        └──→ T0016
T0001-T0004 (independent — Phase 05)
T0017 ──→ T0018 ──→ T0019 ──→ T0020
T0021 ──→ T0022
```

**Critical Path**: T0005 → T0006 → T0014 → T0017 → T0018 → T0019 → T0020 → T0021 → T0022 (9 tasks)

---

## Traceability Matrix

| Task | FR | AC |
|------|----|----|
| T0001 | FR-002, FR-005 | AC-002-01, AC-002-02, AC-005-01 |
| T0002 | FR-003 | AC-003-01 |
| T0003 | FR-006 | AC-006-01, AC-006-02 |
| T0004 | FR-007 | AC-007-01, AC-007-02 |
| T0005 | FR-001 | AC-001-01, AC-001-02 |
| T0006 | FR-002, FR-004, FR-005 | AC-002-01, AC-004-01, AC-004-02, AC-005-01 |
| T0007 | FR-003 | AC-003-01 |
| T0008 | FR-006 | AC-006-01, AC-006-02 |
| T0009 | FR-006 | AC-006-01 |
| T0010 | FR-007 | AC-007-01, AC-007-02 |
| T0011 | FR-002, FR-005 | AC-002-02 |
| T0012 | FR-003 | — |
| T0013 | FR-006 | — |
| T0014 | FR-002, FR-006 | — |
| T0015 | FR-004 | — |
| T0016 | FR-001 | — |
| T0017 | NFR-001 | — |
| T0018 | FR-002 | AC-002-02 |
| T0019 | FR-001 | — |
| T0020 | FR-002, FR-005 | — |
| T0021 | NFR-001 | — |
| T0022 | FR-001, FR-004 | — |
