# Test Cases: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 05-test-strategy
**Created:** 2026-02-15
**Total Test Cases:** 86 across 5 test files
**Validation Rules Covered:** 64/64

---

## Test File 1: design-debate-critic.test.cjs (30 tests)

**Target:** `src/claude/agents/03-design-critic.md` (NEW)
**Module:** M2 -- Design Critic Agent
**Validation Rules:** M2-V01..M2-V28

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-M2-01 | Design critic agent file exists | prerequisite | exists | FR-001 |
| TC-M2-02 | Agent frontmatter contains name: design-critic | M2-V01 | contains | NFR-002 |
| TC-M2-03 | Agent frontmatter contains model: opus | M2-V02 | contains | NFR-002 |
| TC-M2-04 | Agent is invoked only by orchestrator during debate mode | M2-V03 | contains | NFR-002 |
| TC-M2-05 | DC-01 Incomplete API specs check documented | M2-V04 | contains_all | AC-001-01 |
| TC-M2-06 | DC-02 Inconsistent patterns check documented | M2-V05 | contains_all | AC-001-02 |
| TC-M2-07 | DC-03 Module overlap check documented | M2-V06 | contains_all | AC-001-03 |
| TC-M2-08 | DC-04 Validation gaps check documented | M2-V07 | contains_all | AC-001-04 |
| TC-M2-09 | DC-05 Missing idempotency check documented | M2-V08 | contains_all | AC-001-05 |
| TC-M2-10 | DC-06 Accessibility check documented | M2-V09 | contains_all | AC-001-06 |
| TC-M2-11 | DC-07 Error taxonomy holes check documented | M2-V10 | contains_all | AC-001-07 |
| TC-M2-12 | DC-08 Data flow bottlenecks check documented | M2-V11 | contains_all | AC-001-08 |
| TC-M2-13 | Output file is round-N-critique.md | M2-V12 | contains | FR-001, AC-005-01 |
| TC-M2-14 | BLOCKING and WARNING sections in output format | M2-V13 | contains_all | FR-001 |
| TC-M2-15 | Summary table with finding counts | M2-V14 | contains_all | FR-001 |
| TC-M2-16 | API Endpoint Count metric in summary | M2-V15 | contains | AC-005-03 |
| TC-M2-17 | Validation Rule Count metric in summary | M2-V16 | contains | AC-005-03 |
| TC-M2-18 | Error Code Count metric in summary | M2-V17 | contains | AC-005-03 |
| TC-M2-19 | Module Count metric in summary | M2-V18 | contains | AC-005-03 |
| TC-M2-20 | Pattern Consistency Score metric in summary | M2-V19 | contains | AC-005-03 |
| TC-M2-21 | Rule: do not modify input artifacts | M2-V20 | contains | FR-001 |
| TC-M2-22 | Article I (Specification Primacy) constitutional check | M2-V21 | contains_all | AC-006-01 |
| TC-M2-23 | Article IV (Explicit Over Implicit) constitutional check | M2-V22 | contains_all | AC-006-02 |
| TC-M2-24 | Article V (Simplicity First) constitutional check | M2-V23 | contains_all | AC-006-03 |
| TC-M2-25 | Article VII (Artifact Traceability) constitutional check | M2-V24 | contains_all | AC-006-04 |
| TC-M2-26 | Article IX (Quality Gate Integrity) constitutional check | M2-V25 | contains_all | AC-006-05 |
| TC-M2-27 | Structural consistency with Phase 03 critic | M2-V26 | contains_all | NFR-002 |
| TC-M2-28 | Interface type detection documented for non-REST | M2-V27 | contains_all | AC-007-04 |
| TC-M2-29 | DC-06 skip documented for non-UI projects | M2-V28 | contains_any | AC-007-04 |
| TC-M2-30 | Agent file size under 15KB | structural | size_check | NFR-001 |

---

## Test File 2: design-debate-refiner.test.cjs (19 tests)

**Target:** `src/claude/agents/03-design-refiner.md` (NEW)
**Module:** M3 -- Design Refiner Agent
**Validation Rules:** M3-V01..M3-V17

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-M3-01 | Design refiner agent file exists | prerequisite | exists | FR-002 |
| TC-M3-02 | Agent frontmatter contains name: design-refiner | M3-V01 | contains | NFR-002 |
| TC-M3-03 | Agent frontmatter contains model: opus | M3-V02 | contains | NFR-002 |
| TC-M3-04 | Agent is invoked only by orchestrator during debate mode | M3-V03 | contains | NFR-002 |
| TC-M3-05 | API completion fix strategy documented (DC-01) | M3-V04 | contains_any | AC-002-01 |
| TC-M3-06 | Pattern unification fix strategy documented (DC-02) | M3-V05 | contains_any | AC-002-02 |
| TC-M3-07 | Module boundary fix strategy documented (DC-03) | M3-V06 | contains_any | AC-002-03 |
| TC-M3-08 | Validation gap fix strategy documented (DC-04) | M3-V07 | contains_all | AC-002-04 |
| TC-M3-09 | Idempotency fix strategy documented (DC-05) | M3-V08 | contains_all | AC-002-05 |
| TC-M3-10 | Error taxonomy fix strategy documented (DC-07) | M3-V09 | contains_any | AC-002-06 |
| TC-M3-11 | WARNING handling documented (straightforward or NEEDS CLARIFICATION) | M3-V10 | contains_all | AC-002-07 |
| TC-M3-12 | Never-remove rule present | M3-V11 | contains | AC-002-08 |
| TC-M3-13 | Change log format documented with required columns | M3-V12 | contains_all | AC-002-09 |
| TC-M3-14 | Escalation with NEEDS CLARIFICATION documented | M3-V13 | contains | AC-002-07 |
| TC-M3-15 | Input includes critique file reference | M3-V14 | contains | FR-002 |
| TC-M3-16 | Never-introduce-scope rule present | M3-V15 | contains | FR-002 |
| TC-M3-17 | Preserve module names rule present | M3-V16 | contains_any | FR-002 |
| TC-M3-18 | Structural consistency with Phase 03 refiner | M3-V17 | contains_all | NFR-002 |
| TC-M3-19 | Agent file size under 15KB | structural | size_check | NFR-001 |

---

## Test File 3: design-debate-orchestrator.test.cjs (12 tests)

**Target:** `src/claude/agents/00-sdlc-orchestrator.md` (MODIFIED)
**Module:** M1 -- Orchestrator DEBATE_ROUTING Extension
**Validation Rules:** M1-V01..M1-V10

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-M1-01 | Routing table contains Phase 04 entry (04-design) | M1-V01 | contains | AC-003-01 |
| TC-M1-02 | Phase 04 creator maps to 03-system-designer.md | M1-V02 | contains | AC-003-01 |
| TC-M1-03 | Phase 04 critic maps to 03-design-critic.md | M1-V03 | contains | AC-003-01 |
| TC-M1-04 | Phase 04 refiner maps to 03-design-refiner.md | M1-V04 | contains | AC-003-01 |
| TC-M1-05 | Phase 04 artifacts include interface-spec.yaml | M1-V05 | contains | AC-003-02 |
| TC-M1-06 | Phase 04 artifacts include module-designs/ | M1-V06 | contains | AC-003-02 |
| TC-M1-07 | Phase 04 artifacts include error-taxonomy.md | M1-V07 | contains | AC-003-02 |
| TC-M1-08 | Phase 04 artifacts include validation-rules.json | M1-V08 | contains | AC-003-02 |
| TC-M1-09 | Existing Phase 01 routing row preserved | M1-V09 | contains | NFR-003 |
| TC-M1-10 | Existing Phase 03 routing row preserved | M1-V10 | contains | NFR-003 |
| TC-M1-11 | Convergence logic still references zero BLOCKING | structural | contains | AC-003-04 |
| TC-M1-12 | Max rounds still set to 3 | structural | contains | AC-003-04 |

---

## Test File 4: design-debate-creator.test.cjs (8 tests)

**Target:** `src/claude/agents/03-system-designer.md` (MODIFIED)
**Module:** M4 -- System Designer Creator Awareness
**Validation Rules:** M4-V01..M4-V06

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-M4-01 | System designer agent file exists | prerequisite | exists | FR-004 |
| TC-M4-02 | DEBATE_CONTEXT mode detection documented | M4-V01 | contains_all | AC-004-01 |
| TC-M4-03 | Self-assessment section with required subsections | M4-V02 | contains_all | AC-004-01 |
| TC-M4-04 | No-debate fallback preserves current behavior | M4-V03 | contains_all | AC-004-02 |
| TC-M4-05 | Round labeling documented (Round N Draft) | M4-V04 | contains | FR-004 |
| TC-M4-06 | Skip final menu documented | M4-V05 | contains_any | FR-004 |
| TC-M4-07 | Round > 1 behavior documented (use Refiner output) | M4-V06 | contains_all | FR-004 |
| TC-M4-08 | Backward compatibility -- agent name unchanged | structural | contains | NFR-003 |

---

## Test File 5: design-debate-integration.test.cjs (17 tests)

**Target:** Cross-module: M1 + M2 + M3 + M4 + M5
**Validation Rules:** M5-V01..M5-V03 + cross-module integration checks

### M5: isdlc.md Command Description Updates (3 tests)

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-M5-01 | Debate-enabled phases lists Phase 04 (Design) | M5-V01 | contains_all | FR-003 |
| TC-M5-02 | Phase 01 still listed in debate-enabled phases | M5-V02 | contains | NFR-003 |
| TC-M5-03 | Phase 03 still listed in debate-enabled phases | M5-V03 | contains | NFR-003 |

### Cross-Module: Debate Artifacts (FR-005) (4 tests)

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-INT-01 | Critic output naming matches orchestrator parse expectation | cross-module | cross-check | AC-005-01 |
| TC-INT-02 | debate-summary.md referenced in orchestrator | cross-module | contains | AC-005-02 |
| TC-INT-03 | Design metrics in critic summary (5 metrics) | cross-module | contains_all | AC-005-03 |
| TC-INT-04 | Design metrics match FR-005 list | cross-module | contains_all | AC-005-03, FR-005 |

### Cross-Module: Edge Cases (FR-007) (4 tests)

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-INT-05 | Missing critical artifact handling documented | cross-module | contains | AC-007-01 |
| TC-INT-06 | Malformed critique fail-open documented | cross-module | contains | AC-007-02 |
| TC-INT-07 | Unconverged debate warning documented | cross-module | contains | AC-007-03 |
| TC-INT-08 | Non-REST interface type adaptation documented | cross-module | contains_all | AC-007-04 |

### Cross-Module: Backward Compatibility (NFR-003) (3 tests)

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-INT-09 | Orchestrator still contains DEBATE LOOP ORCHESTRATION section | cross-module | contains | NFR-003 |
| TC-INT-10 | Phase 01 routing entries preserved | cross-module | contains_all | NFR-003 |
| TC-INT-11 | Refiner has never-remove rule | cross-module | contains | NFR-003, AC-002-08 |

### Cross-Module: Agent File Size (NFR-001) (3 tests)

| Test ID | Description | Validation Rule | Type | Traces |
|---------|-------------|----------------|------|--------|
| TC-INT-12 | Design critic file under 15KB | structural | size_check | NFR-001 |
| TC-INT-13 | Design refiner file under 15KB | structural | size_check | NFR-001 |
| TC-INT-14 | isdlc.md command file exists | structural | exists | FR-003 |

---

## Summary

| Test File | Count | Modules | Key Traces |
|-----------|-------|---------|------------|
| design-debate-critic.test.cjs | 30 | M2 | FR-001, FR-006, AC-001-*, AC-006-*, NFR-002, NFR-004 |
| design-debate-refiner.test.cjs | 19 | M3 | FR-002, AC-002-*, NFR-002 |
| design-debate-orchestrator.test.cjs | 12 | M1 | FR-003, AC-003-*, NFR-003 |
| design-debate-creator.test.cjs | 8 | M4 | FR-004, AC-004-*, NFR-003 |
| design-debate-integration.test.cjs | 17 | M1-M5 | FR-005, FR-007, NFR-001, NFR-003, NFR-004 |
| **Total** | **86** | **5 modules** | **7 FRs, 34 ACs, 4 NFRs** |
