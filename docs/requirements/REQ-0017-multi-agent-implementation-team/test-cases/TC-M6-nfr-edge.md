# Test Cases: M6 -- NFRs and Edge Cases

**Test File:** Distributed across all 5 test files (tests marked with NFR/edge-case traces)
**Target Files:** All agent files under modification
**Traces:** NFR-001 through NFR-004, AC-003-05, AC-007-01..03
**Phase:** 05-test-strategy (REQ-0017)

---

## Overview

NFR and edge case tests are distributed across the 5 test files rather than being in a separate file, following the established pattern from REQ-0014/0015/0016. This document catalogs all NFR and edge case test cases with their locations.

---

## NFR-001: Performance

### TC-NFR1-01: Max cycles per file is bounded at 3

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-10)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** Orchestrator documents max 3 cycles per file (prevents unbounded iteration)
**Rationale:** Bounded iteration ensures per-file overhead stays within NFR-001's 30-second budget

### TC-NFR1-02: Reviewer agent file size under 15KB

**Location:** `implementation-debate-reviewer.test.cjs` (appended)
**Target:** `05-implementation-reviewer.md`
**Assert:** `fs.statSync().size < 15 * 1024`
**Rationale:** Small agent files load faster, keeping per-file overhead low

### TC-NFR1-03: Updater agent file size under 15KB

**Location:** `implementation-debate-updater.test.cjs` (TC-M2-16)
**Target:** `05-implementation-updater.md`
**Assert:** `fs.statSync().size < 15 * 1024`
**Rationale:** Small agent files load faster, keeping per-file overhead low

---

## NFR-002: Backward Compatibility

### TC-NFR2-01: Software-developer unchanged without WRITER_CONTEXT

**Location:** `implementation-debate-writer.test.cjs` (TC-M4-09)
**Target:** `05-software-developer.md`
**Assert:** File documents standard mode preservation when WRITER_CONTEXT absent

### TC-NFR2-02: Orchestrator debate_mode=false fallback

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-22)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** debate_mode=false path documented as single-agent delegation

### TC-NFR2-03: Phase 16 full scope when no implementation_loop_state

**Location:** `implementation-debate-integration.test.cjs` (TC-M5-11)
**Target:** `16-quality-loop-engineer.md`
**Assert:** Full scope fallback documented

### TC-NFR2-04: Phase 08 full scope when no implementation_loop_state

**Location:** `implementation-debate-integration.test.cjs` (TC-M5-12)
**Target:** `07-qa-engineer.md`
**Assert:** Full scope fallback documented

### TC-NFR2-05: DEBATE LOOP ORCHESTRATION section preserved

**Location:** `implementation-debate-integration.test.cjs` (TC-M5-13)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** Section not removed or renamed

### TC-NFR2-06: Phase 01/03/04 debate routing entries preserved

**Location:** `implementation-debate-integration.test.cjs` (TC-M5-14)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** Existing critic/refiner agent mappings preserved

### TC-NFR2-07: Existing software-developer sections preserved

**Location:** `implementation-debate-writer.test.cjs` (TC-M4-10)
**Target:** `05-software-developer.md`
**Assert:** PHASE OVERVIEW and MANDATORY ITERATION ENFORCEMENT sections still present

---

## NFR-003: Structural Consistency

### TC-NFR3-01: Agent naming follows {NN}-{role}.md pattern

**Location:** `implementation-debate-integration.test.cjs` (TC-M5-16, TC-M5-17)
**Target:** `05-implementation-reviewer.md`, `05-implementation-updater.md`
**Assert:** Files exist at expected paths with correct naming

### TC-NFR3-02: Test file naming follows implementation-debate-{role}.test.cjs pattern

**Location:** Verified by file existence (the test files themselves follow the naming convention)
**Assert:** All 5 test files follow `implementation-debate-*.test.cjs` pattern

### TC-NFR3-03: resolveDebateMode reuse (not duplication)

**Location:** `implementation-debate-integration.test.cjs` (TC-M5-18)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** Implementation section references debate mode resolution from Section 7.5

### TC-NFR3-04: Reviewer frontmatter follows convention

**Location:** `implementation-debate-reviewer.test.cjs` (TC-M1-02, TC-M1-03)
**Target:** `05-implementation-reviewer.md`
**Assert:** name: implementation-reviewer, model: opus

### TC-NFR3-05: Updater frontmatter follows convention

**Location:** `implementation-debate-updater.test.cjs` (TC-M2-02, TC-M2-03)
**Target:** `05-implementation-updater.md`
**Assert:** name: implementation-updater, model: opus

---

## NFR-004: Observability

### TC-NFR4-01: implementation_loop_state fields documented

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-14, TC-M3-16)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** per_file_reviews, files_completed/files_remaining documented in state tracking

### TC-NFR4-02: Per-file review logging to state.json

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-16)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** per_file_reviews array documented with verdict, cycles, findings_count, timestamps

---

## Edge Cases

### TC-EDGE-01: MAX_ITERATIONS acceptance protocol

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-10)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** MAX_ITERATIONS handling documented (accept file, log warning, proceed)

### TC-EDGE-02: Reviewer output unparseable -> fail-open

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-18)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** Unparseable output treated as PASS (fail-open, Article X)

### TC-EDGE-03: Sub-agent error handling

**Location:** `implementation-debate-orchestrator.test.cjs` (TC-M3-17)
**Target:** `00-sdlc-orchestrator.md`
**Assert:** Error handling documented for Writer, Reviewer, and Updater failures

### TC-EDGE-04: Dispute mechanism in Updater

**Location:** `implementation-debate-updater.test.cjs` (TC-M2-10, TC-M2-11)
**Target:** `05-implementation-updater.md`
**Assert:** Dispute mechanism with 20-character minimum rationale documented

### TC-EDGE-05: Empty/trivial file handling by Reviewer

**Location:** Implicitly tested by applicability matrix test (TC-M1-18)
**Target:** `05-implementation-reviewer.md`
**Assert:** File-type applicability matrix determines which checks apply

---

## Summary: NFR/Edge Case Coverage

| NFR/Edge Case | Test Cases | Count |
|---------------|-----------|-------|
| NFR-001 (Performance) | TC-NFR1-01..03 | 3 |
| NFR-002 (Backward Compat.) | TC-NFR2-01..07 | 7 |
| NFR-003 (Consistency) | TC-NFR3-01..05 | 5 |
| NFR-004 (Observability) | TC-NFR4-01..02 | 2 |
| Edge Cases | TC-EDGE-01..05 | 5 |
| **Total** | | **22** |

Note: These test cases overlap with the module-specific test cases (TC-M1..TC-M5). The NFR/edge case IDs are aliases referencing the same underlying test implementations in the 5 test files.
