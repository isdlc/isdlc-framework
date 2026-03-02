# Test Cases: M5 -- Integration (Phase 16/08 Adjustments + Backward Compatibility)

**Test File:** `src/claude/hooks/tests/implementation-debate-integration.test.cjs`
**Target Files:**
- `src/claude/agents/16-quality-loop-engineer.md` (MODIFIED)
- `src/claude/agents/07-qa-engineer.md` (MODIFIED)
- `src/claude/agents/00-sdlc-orchestrator.md` (cross-module check)
**Traces:** FR-005 (AC-005-01..04), FR-007 (AC-007-01..03), NFR-002, NFR-003
**Validation Rules:** VR-030 through VR-032
**Phase:** 05-test-strategy (REQ-0017)

---

## Test Structure

```
describe('M5-Phase16: Quality Loop Engineer Scope Adjustment (16-quality-loop-engineer.md)')
  TC-M5-01 .. TC-M5-05
describe('M5-Phase08: QA Engineer Scope Adjustment (07-qa-engineer.md)')
  TC-M5-06 .. TC-M5-10
describe('Cross-Module: Backward Compatibility (NFR-002)')
  TC-M5-11 .. TC-M5-15
describe('Cross-Module: Structural Consistency (NFR-003)')
  TC-M5-16 .. TC-M5-18
```

---

## Test Cases

### Phase 16: Quality Loop Engineer Scope Adjustment

#### TC-M5-01: IMPLEMENTATION TEAM SCOPE ADJUSTMENT section exists in Phase 16

**Traces:** AC-005-01
**Validation Rule:** VR-030
**Type:** Content
**Assert:** Phase 16 file includes `IMPLEMENTATION TEAM SCOPE ADJUSTMENT` or `IMPLEMENTATION TEAM` or `implementation_loop_state`
**Failure Message:** "16-quality-loop-engineer.md must contain IMPLEMENTATION TEAM SCOPE ADJUSTMENT section"

#### TC-M5-02: Phase 16 detects implementation_loop_state

**Traces:** AC-005-01
**Validation Rule:** VR-030
**Type:** Content
**Assert:** Phase 16 file includes `implementation_loop_state`
**Failure Message:** "Phase 16 must detect implementation_loop_state from state.json"

#### TC-M5-03: Phase 16 "final sweep" mode documented

**Traces:** AC-005-01
**Validation Rule:** VR-030
**Type:** Content
**Assert:** Phase 16 file includes `final sweep` (case-insensitive) or `FINAL SWEEP` or `reduced scope` or `batch-only`
**Failure Message:** "Phase 16 must document final sweep / reduced scope mode"

#### TC-M5-04: Phase 16 excludes individual file re-review

**Traces:** AC-005-02
**Validation Rule:** VR-031
**Type:** Content
**Assert:** Phase 16 file documents exclusion of individual file logic/quality review (e.g., includes "already done by Reviewer" or "EXCLUDE" list referencing IC-01..IC-07)
**Failure Message:** "Phase 16 must exclude individual file re-review in final sweep mode"

#### TC-M5-05: Phase 16 includes batch-only checks

**Traces:** AC-005-01
**Validation Rule:** VR-030
**Type:** Content
**Assert:** Phase 16 file documents batch-only checks (test suite, coverage, mutation testing, npm audit, SAST, build, lint)
**Failure Message:** "Phase 16 must document batch-only checks for final sweep mode"

### Phase 08: QA Engineer Scope Adjustment

#### TC-M5-06: IMPLEMENTATION TEAM SCOPE ADJUSTMENT section exists in Phase 08

**Traces:** AC-005-03
**Validation Rule:** VR-032
**Type:** Content
**Assert:** Phase 08 file includes `IMPLEMENTATION TEAM SCOPE ADJUSTMENT` or `IMPLEMENTATION TEAM` or `implementation_loop_state`
**Failure Message:** "07-qa-engineer.md must contain IMPLEMENTATION TEAM SCOPE ADJUSTMENT section"

#### TC-M5-07: Phase 08 detects implementation_loop_state

**Traces:** AC-005-03
**Validation Rule:** VR-032
**Type:** Content
**Assert:** Phase 08 file includes `implementation_loop_state`
**Failure Message:** "Phase 08 must detect implementation_loop_state from state.json"

#### TC-M5-08: Phase 08 "human review only" mode documented

**Traces:** AC-005-03
**Validation Rule:** VR-032
**Type:** Content
**Assert:** Phase 08 file includes `human review only` (case-insensitive) or `HUMAN REVIEW ONLY` or `reduced scope`
**Failure Message:** "Phase 08 must document human review only / reduced scope mode"

#### TC-M5-09: Phase 08 focuses on architecture and business logic

**Traces:** AC-005-03
**Validation Rule:** VR-032
**Type:** Content
**Assert:** Phase 08 file includes `architecture` AND `business logic` in context of reduced scope review items
**Failure Message:** "Phase 08 must focus on architecture and business logic in reduced scope mode"

#### TC-M5-10: Phase 08 excludes per-file quality items

**Traces:** AC-005-04
**Validation Rule:** VR-032
**Type:** Content
**Assert:** Phase 08 file documents exclusion of naming, DRY, complexity, error handling re-checks (e.g., includes "already verified by" or "EXCLUDE" referencing IC-01..IC-06 items)
**Failure Message:** "Phase 08 must exclude per-file quality items already verified by Reviewer"

### Backward Compatibility (NFR-002)

#### TC-M5-11: Phase 16 preserves full scope fallback

**Traces:** NFR-002
**Validation Rule:** VR-030
**Type:** Content
**Assert:** Phase 16 file includes `full scope` (case-insensitive) or `FULL SCOPE` in context of fallback when implementation_loop_state absent
**Failure Message:** "Phase 16 must preserve full scope fallback when implementation_loop_state absent"

#### TC-M5-12: Phase 08 preserves full scope fallback

**Traces:** NFR-002
**Validation Rule:** VR-032
**Type:** Content
**Assert:** Phase 08 file includes `full scope` (case-insensitive) or `FULL SCOPE` in context of fallback
**Failure Message:** "Phase 08 must preserve full scope fallback when implementation_loop_state absent"

#### TC-M5-13: Existing DEBATE LOOP ORCHESTRATION section preserved

**Traces:** NFR-002
**Validation Rule:** --
**Type:** Content
**Assert:** Orchestrator file includes `DEBATE LOOP ORCHESTRATION`
**Failure Message:** "Orchestrator must still contain DEBATE LOOP ORCHESTRATION section (not removed or renamed)"

#### TC-M5-14: Phase 01/03/04 debate routing entries preserved

**Traces:** NFR-002
**Validation Rule:** --
**Type:** Content
**Assert:** Orchestrator file includes `01-requirements-critic.md` AND `02-architecture-critic.md` AND `03-design-critic.md`
**Failure Message:** "Existing debate routing entries for Phase 01/03/04 must be preserved"

#### TC-M5-15: Phase 16 existing sections not removed

**Traces:** NFR-002
**Validation Rule:** --
**Type:** Content
**Assert:** Phase 16 file includes `MANDATORY ITERATION ENFORCEMENT` (existing section preserved)
**Failure Message:** "Phase 16 existing sections must not be removed by scope adjustment addition"

### Structural Consistency (NFR-003)

#### TC-M5-16: Reviewer agent file follows naming convention

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Existence
**Assert:** `05-implementation-reviewer.md` exists at expected path (NN-role.md pattern)
**Failure Message:** "Reviewer agent must follow {NN}-{role}.md naming convention"

#### TC-M5-17: Updater agent file follows naming convention

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Existence
**Assert:** `05-implementation-updater.md` exists at expected path (NN-role.md pattern)
**Failure Message:** "Updater agent must follow {NN}-{role}.md naming convention"

#### TC-M5-18: resolveDebateMode referenced in orchestrator implementation section

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** Orchestrator content after `IMPLEMENTATION` includes `resolveDebateMode` or `debate_mode` or `debate mode` in context of reusing existing debate mode resolution
**Failure Message:** "Orchestrator implementation section must reference debate mode resolution (shared with Section 7.5)"

---

## AC Coverage Summary

| AC | Test Case(s) |
|----|-------------|
| AC-005-01 | TC-M5-01, TC-M5-02, TC-M5-03, TC-M5-05 |
| AC-005-02 | TC-M5-04 |
| AC-005-03 | TC-M5-06, TC-M5-07, TC-M5-08, TC-M5-09 |
| AC-005-04 | TC-M5-10 |
| AC-007-01 | (covered in TC-M3-06, TC-M3-19) |
| AC-007-02 | (covered in TC-M3-15) |
| AC-007-03 | (covered in TC-M3-17, TC-M3-18) |
