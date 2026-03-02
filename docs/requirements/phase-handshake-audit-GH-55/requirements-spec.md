# Requirements Specification: Phase Handshake Audit Fixes

**Requirement ID**: REQ-0020
**Source**: GitHub Issue #55
**Category**: Feature (Audit-Driven Fixes)
**Artifact Folder**: `phase-handshake-audit-GH-55`
**Original**: 2026-02-19 (investigation mode)
**Updated**: 2026-02-20 (implementation mode for build workflow)
**Phase**: 01-requirements

---

## 1. Project Overview

### 1.1 Background

A comprehensive audit of the iSDLC phase handshake system (Phases 00-04, analysis pipeline) identified 10 gaps in state consistency checking, regression protection, test coverage, crash recovery, and configuration maintenance. The audit produced detailed analysis artifacts (quick-scan, impact-analysis, architecture-analysis, design-spec) documenting 14 correct behaviors, 10 gaps, and 9 architectural risks.

### 1.2 Purpose

Implement the 6 fixes (FIX-01 through FIX-06) designed during the audit to close the identified gaps. These fixes strengthen the phase handshake system's ability to detect state divergence, protect against regressions during supervised redo, and verify cross-boundary state transitions.

### 1.3 Scope

**In scope**: Implementation of FIX-01 through FIX-06 as defined in `design-spec.md`.
**Out of scope**: FIX-02 Phase B (dual-write removal) is deferred to a separate work item after Phase A bakes.

### 1.4 Stakeholders

- **Framework Developer** (primary): Implements and maintains the hook infrastructure
- **Framework User** (secondary): Benefits from more reliable workflow execution and better error diagnostics

### 1.5 Related Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| Quick Scan | `docs/requirements/phase-handshake-audit-GH-55/quick-scan.md` | Scope estimate and file inventory |
| Impact Analysis | `docs/requirements/phase-handshake-audit-GH-55/impact-analysis.md` | File impact map, risk assessment, coverage gaps |
| Architecture Analysis | `docs/requirements/phase-handshake-audit-GH-55/architecture-analysis.md` | State machines, field-consumer matrix, architectural risks |
| Design Spec | `docs/requirements/phase-handshake-audit-GH-55/design-spec.md` | Detailed fix designs with code-level specifications |

---

## 2. Functional Requirements

### REQ-001: V9 Cross-Location Consistency Check

**Description**: Add a new validation rule (V9) to `state-write-validator.cjs` that detects divergence between mirrored state fields after every `state.json` write. V9 is observational only -- it warns on stderr, never blocks.

**Priority**: Must Have

**Rationale**: The dual-write pattern (`phases[N].status` and `active_workflow.phase_status[N]`) has no cross-check. Silent divergence can cause different hooks to see different phase states, leading to unpredictable gate behavior (RISK-02, RISK-08 from architecture analysis).

**Design Reference**: `design-spec.md` Section 2.1 (FIX-01)

**Sub-requirements**:
- REQ-001a: V9-A checks that `phases[N].status` matches `active_workflow.phase_status[N]` for every phase key present in both locations
- REQ-001b: V9-B checks that `current_phase` (top-level) matches `active_workflow.current_phase`
- REQ-001c: V9-C checks that `active_workflow.phases[current_phase_index]` matches `active_workflow.current_phase`, with suppression of the expected intermediate state between STEP 3e and STEP 3c-prime (where index is one ahead of current_phase)

**Acceptance Criteria**:
- AC-001a: Given a state.json write where `phases["03-architecture"].status` is `"completed"` and `active_workflow.phase_status["03-architecture"]` is `"in_progress"`, when the write completes, then V9-A emits a warning to stderr containing the phase key and both status values, and the write is NOT blocked.
- AC-001b: Given a state.json write where `current_phase` is `"03-architecture"` and `active_workflow.current_phase` is `"04-design"`, when the write completes, then V9-B emits a warning to stderr, and the write is NOT blocked.
- AC-001c: Given a state.json write where `active_workflow.current_phase_index` is 3 and `active_workflow.phases[3]` is `"04-design"` but `active_workflow.current_phase` is `"03-architecture"`, and `active_workflow.phases[2]` is `"03-architecture"` (the index-ahead intermediate state), when the write completes, then V9-C does NOT emit a warning (suppressed intermediate state).
- AC-001d: Given a state.json write where `active_workflow` is missing or null, when the write completes, then V9 emits no warnings and does not crash (fail-open).
- AC-001e: Given a state.json write via the Edit tool (not Write), when the write completes, then V9 reads state from disk and performs the same checks.
- AC-001f: Given a malformed JSON content string in the Write tool call, when the write completes, then V9 silently returns with no warnings and no crash.

**Files to modify**: `src/claude/hooks/state-write-validator.cjs`

---

### REQ-002: Dual-Write Deprecation and V8 phases[].status Coverage (Phase A)

**Description**: Extend V8 regression protection to cover `phases[N].status` (currently V8 only checks `active_workflow.phase_status`), and add deprecation markers to the dual-write pattern in `isdlc.md`.

**Priority**: Must Have

**Rationale**: V8 only checks `active_workflow.phase_status` for regression. An agent could regress `phases[N].status` from `completed` to `pending` without V8 catching it. This is the Phase A step toward eventual dual-write elimination (GAP-01, GAP-10).

**Design Reference**: `design-spec.md` Section 2.2 (FIX-02 Phase A)

**Acceptance Criteria**:
- AC-002a: Given a state.json write where the disk has `phases["03-architecture"].status = "completed"` and the incoming state has `phases["03-architecture"].status = "pending"`, when state-write-validator runs, then V8 blocks the write with a regression message mentioning the phase key and both status values.
- AC-002b: Given a state.json write where the disk has `phases["03-architecture"].status = "completed"` and the incoming state has `phases["03-architecture"].status = "in_progress"` AND `active_workflow.supervised_review.status = "redo_pending"`, when state-write-validator runs, then V8 allows the write (supervised redo exception).
- AC-002c: Given a state.json write where the disk has `phases["03-architecture"].status = "pending"` and the incoming state has `phases["03-architecture"].status = "in_progress"`, when state-write-validator runs, then V8 allows the write (forward transition, not regression).
- AC-002d: `isdlc.md` STEP 3c-prime and STEP 3e contain deprecation comments on the `active_workflow.phase_status` write lines, referencing INV-0055 and noting that `phases[N].status` is authoritative.

**Files to modify**: `src/claude/hooks/state-write-validator.cjs`, `src/claude/commands/isdlc.md`

---

### REQ-003: V8 Supervised Redo Exception

**Description**: Add an exception to the V8 `active_workflow.phase_status` regression check that allows the `completed -> in_progress` transition when a supervised redo marker is present.

**Priority**: Must Have

**Rationale**: The supervised redo path legitimately resets `phases[N].status` from `completed` to `in_progress`. Without this exception, V8 blocks the redo write and emits a confusing regression warning. This is especially critical when REQ-002 extends V8 to also cover `phases[N].status` (GAP-06, RISK-07).

**Design Reference**: `design-spec.md` Section 2.6 (FIX-06)

**Acceptance Criteria**:
- AC-003a: Given a state.json write where `active_workflow.phase_status["03-architecture"]` regresses from `"completed"` to `"in_progress"` AND `active_workflow.supervised_review.status = "redo_pending"`, when state-write-validator V8 runs, then V8 allows the write without blocking or warning.
- AC-003b: Given a state.json write where `active_workflow.phase_status["03-architecture"]` regresses from `"completed"` to `"in_progress"` AND no `supervised_review` marker exists, when state-write-validator V8 runs, then V8 blocks the write with a regression message.
- AC-003c: Given a state.json write where `active_workflow.supervised_review.redo_count = 2` (redo already happened) AND `active_workflow.phase_status["03-architecture"]` regresses from `"completed"` to `"in_progress"`, when state-write-validator V8 runs, then V8 allows the write (redo_count > 0 is also a valid redo marker).
- AC-003d: Given a state.json write where `active_workflow.supervised_review` exists but the regression is `"completed"` to `"pending"` (not `"in_progress"`), when state-write-validator V8 runs, then V8 blocks the write (only `completed -> in_progress` is a valid redo regression).

**Files to modify**: `src/claude/hooks/state-write-validator.cjs`

---

### REQ-004: Missing Integration Tests

**Description**: Add integration tests for four untested cross-boundary scenarios identified in the impact analysis: supervised review redo timing preservation (TS-003), escalation retry flow (TS-004), multi-phase boundary state consistency (TS-005), and dual-write error recovery (TS-008).

**Priority**: Must Have

**Rationale**: 4 of 10 test scenarios have no test coverage. All involve cross-boundary state transitions that are the most likely source of handshake bugs (GAP-02, GAP-03, GAP-04, GAP-05).

**Design Reference**: `design-spec.md` Section 2.3 (FIX-03)

**Acceptance Criteria**:
- AC-004a: Given a state representing a supervised redo (status reset from `completed` to `in_progress` with `supervised_review.redo_count > 0`), when the state-write-validator hook processes this write, then `timing.started_at` in the written state is unchanged from the original value, and V8 does not block.
- AC-004b: Given a state where Phase N has `status = "completed"` and Phase N+1 has `status = "pending"` and `current_phase_index` points to N+1, when phase-loop-controller checks a delegation to Phase N+1, then the delegation is blocked (Phase N+1 is not yet `in_progress`).
- AC-004c: Given a state where a delegation failed (Phase N stuck as `in_progress`, no `completed_at`), when phase-loop-controller checks a re-delegation to Phase N, then the delegation is allowed (recovery path).
- AC-004d: Given a state where gate-blocker added a `pending_escalation` of type `gate_blocked`, when the escalation entry is inspected, then it contains `type`, `hook`, `phase`, `detail`, and `timestamp` fields.

**Test files to create**:
- `src/claude/hooks/tests/supervised-review-redo-timing.test.cjs` (4 test cases)
- `src/claude/hooks/tests/multi-phase-boundary.test.cjs` (4 test cases)
- `src/claude/hooks/tests/dual-write-error-recovery.test.cjs` (4 test cases)
- `src/claude/hooks/tests/escalation-retry-flow.test.cjs` (4 test cases)

**Additional test file**:
- `src/claude/hooks/tests/v9-cross-location-consistency.test.cjs` (10 test cases covering REQ-001)

---

### REQ-005: Configuration Loader Consolidation

**Description**: Remove duplicate configuration loader functions from `gate-blocker.cjs` and `iteration-corridor.cjs`, reducing the triple-fallback chain to a double-fallback chain (dispatcher-provided `ctx.requirements` plus `common.cjs` fallback).

**Priority**: Should Have

**Rationale**: Three copies of configuration loading logic adds maintenance burden and could lead to inconsistencies if search paths diverge between implementations (GAP-08, RISK-09).

**Design Reference**: `design-spec.md` Section 2.5 (FIX-05)

**Acceptance Criteria**:
- AC-005a: Given a hook invocation through the pre-task-dispatcher (normal mode), when gate-blocker loads iteration requirements, then it uses `ctx.requirements` from the dispatcher context (primary source) or `loadIterationRequirements()` from `common.cjs` (fallback). It does NOT call a local `loadIterationRequirements()` function.
- AC-005b: Given a standalone hook invocation (gate-blocker run directly via `require.main === module`), when gate-blocker loads iteration requirements, then it uses `loadIterationRequirements()` from `common.cjs` and loads successfully.
- AC-005c: The local `loadIterationRequirements()` function (lines 35-53 of gate-blocker.cjs) and local `loadWorkflowDefinitions()` function (lines 58-76 of gate-blocker.cjs) are removed.
- AC-005d: All existing gate-blocker tests pass after the removal.

**Files to modify**: `src/claude/hooks/gate-blocker.cjs`, `src/claude/hooks/iteration-corridor.cjs`

---

### REQ-006: Stale Phase Detection

**Description**: Add a stale-phase detection check to `isdlc.md` STEP 3b that warns when a phase has been `in_progress` for more than twice its configured timeout, indicating a possible crash or timeout.

**Priority**: Should Have

**Rationale**: When the orchestrator crashes mid-phase, the phase remains `in_progress` with no mechanism to detect it other than manual inspection. A stale-phase warning provides an automatic detection point (GAP-07, RISK-01).

**Design Reference**: `design-spec.md` Section 2.4 (FIX-04)

**Acceptance Criteria**:
- AC-006a: Given a phase with `status = "in_progress"` and `timing.started_at` set more than 240 minutes ago (2x the default 120-minute timeout), when STEP 3b runs its escalation check, then a stale phase warning banner is displayed showing the phase key, elapsed time, and timeout value.
- AC-006b: Given a phase with `status = "in_progress"` and `timing.started_at` set 60 minutes ago (well within timeout), when STEP 3b runs, then no stale phase warning is displayed.
- AC-006c: The stale phase warning presents the same Retry/Skip/Cancel options as the existing escalation handler.
- AC-006d: Given a phase with `status = "completed"`, regardless of elapsed time, when STEP 3b runs, then no stale phase warning is displayed (only `in_progress` phases are checked).

**Files to modify**: `src/claude/commands/isdlc.md` (STEP 3b)

---

## 3. Non-Functional Requirements

### NFR-001: Fail-Open Behavior

**Description**: All new validation rules (V9, V8 extensions) must fail-open on infrastructure errors. If V9 encounters malformed JSON, missing fields, or parse errors, it must return silently without warnings or crashes.

**Metric**: Zero crashes or false blocks caused by V9/V8-extension code paths under any state.json content (including empty, malformed, or truncated JSON).

**Priority**: Must Have

**Constitutional Reference**: Article X (Fail-Safe Defaults)

### NFR-002: Performance Impact

**Description**: The V9 cross-location check must not measurably increase hook execution time. It parses state from the Write tool content (already available) rather than performing an additional disk read.

**Metric**: V9 adds less than 5ms to the PostToolUse[Write] hook execution time (p99).

**Priority**: Must Have

### NFR-003: CJS Module Compliance

**Description**: All new code in `state-write-validator.cjs` must use CommonJS syntax (`.cjs` extension, `require`, `module.exports`). No ESM imports.

**Priority**: Must Have

**Constitutional Reference**: Article XII (Dual Module System Integrity)

### NFR-004: Test Runner Compliance

**Description**: All new test files must use `node:test` as the test runner. No external test frameworks (jest, mocha, etc.).

**Priority**: Must Have

**Constitutional Reference**: Article II (Test-First Development), Article XI (Integration Testing Integrity)

### NFR-005: Backward Compatibility

**Description**: Existing hook behavior must not change for any state.json content that was previously allowed. V9 is additive (new warnings only). V8 extensions add blocking only for previously unchecked fields. The supervised redo exception relaxes (not tightens) V8.

**Metric**: All existing tests pass without modification (except tests explicitly testing the new behavior).

**Priority**: Must Have

### NFR-006: Observability

**Description**: All V9 warnings and V8 redo-exception allowances must be logged via `logHookEvent()` for diagnostic tracing.

**Metric**: Every V9 warning produces a `logHookEvent('state-write-validator', 'warn', ...)` call. Every V8 redo exception produces a `logHookEvent('state-write-validator', 'allow', ...)` call with reason including "supervised redo".

**Priority**: Should Have

---

## 4. Constraints

### CON-001: No Breaking Changes to Hook Protocol

Hook stdin/stdout JSON protocol must not change. V9 communicates via stderr only.

### CON-002: State Schema Backward Compatibility

No fields are removed from state.json in this implementation (Phase A only). The `active_workflow.phase_status` field remains; removal is deferred to FIX-02 Phase B (separate work item).

### CON-003: Prompt-Based Orchestration Limitation

REQ-006 (stale phase detection) is a prompt-level change to `isdlc.md`. Its enforcement depends on LLM compliance with the prompt specification. No hook can validate that the LLM correctly displays the stale-phase warning.

---

## 5. Assumptions

### ASM-001: Single-Session Execution

The phase handshake operates in a single LLM session with single-threaded hook execution. No concurrent access to state.json from multiple sessions or processes. This assumption justifies the use of `fs.writeFileSync` without file locking.

### ASM-002: Supervised Review Marker Presence

The supervised redo exception (REQ-003) assumes that the orchestrator always writes `active_workflow.supervised_review.status = "redo_pending"` or increments `redo_count` BEFORE resetting the phase status. If the orchestrator writes the status reset without the marker, V8 will block it. This is considered correct behavior (the marker is required for the exception).

### ASM-003: Existing Test Infrastructure

Integration tests (REQ-004) assume the test pattern from `cross-hook-integration.test.cjs` is reusable: temp directory setup, state file creation, hook invocation via `spawnSync`, assertion on stdout/stderr.

---

## 6. Out of Scope

- **FIX-02 Phase B** (dual-write removal): Deferred to separate work item after Phase A bakes across multiple workflow cycles
- **REC-03** (extract orchestration logic into code): HIGH effort, deferred to long-term roadmap
- **TS-009** (budget degradation propagation testing): Prompt-level only; cannot be enforced by hooks (CON-003)
- **TS-010** (same-phase sub-agent bypass): Already verified correct and well-tested (OK-07)
- **GAP-09** (timing/budget/escalation hook enforcement): LOW severity; prompt-level guarantees sufficient

---

## 7. Prioritization (MoSCoW)

### Must Have (MVP)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| REQ-001 | V9 cross-location consistency check | Highest-value single fix -- catches the most dangerous silent failure |
| REQ-002 | V8 phases[].status coverage + deprecation | Closes regression gap in V8 that only checks summary map |
| REQ-003 | V8 supervised redo exception | Required before REQ-002 to avoid blocking legitimate redo |
| REQ-004 | Missing integration tests | 4/10 scenarios have no coverage; validates REQ-001/002/003 behavior |

### Should Have

| ID | Requirement | Rationale |
|----|-------------|-----------|
| REQ-005 | Config loader consolidation | Reduces maintenance burden; low risk |
| REQ-006 | Stale phase detection | Advisory warning for crash recovery; prompt-level change |

### Won't Have (this release)

| Item | Rationale |
|------|-----------|
| FIX-02 Phase B (dual-write removal) | Needs Phase A to bake first |
| REC-03 (extract orchestration to code) | HIGH effort, disproportionate to risk |

---

## 8. Implementation Batching

Based on dependency analysis from the design spec:

**Batch 1** (single PR): REQ-001 + REQ-003 + REQ-002
- All changes in `state-write-validator.cjs` (plus deprecation comments in `isdlc.md`)
- V9 consistency checking + V8 supervised redo exception + V8 phases[].status coverage
- Low risk, high value

**Batch 2** (single PR): REQ-004
- All new test files, no production code changes
- Tests cover new Batch 1 behavior plus four untested scenarios

**Batch 3** (single PR): REQ-005 + REQ-006
- Low-priority cleanups
- REQ-005 is minor code cleanup; REQ-006 is prompt-only change to isdlc.md

---

## 9. Traceability

### Requirements to Design Spec Fixes

| Requirement | Design Fix | Gaps Addressed | Risks Addressed |
|-------------|-----------|----------------|-----------------|
| REQ-001 | FIX-01 | GAP-01, GAP-10 | RISK-02, RISK-08 |
| REQ-002 | FIX-02 Phase A | GAP-01 (root cause) | RISK-02 |
| REQ-003 | FIX-06 | GAP-06 | RISK-07 |
| REQ-004 | FIX-03 | GAP-02, GAP-03, GAP-04, GAP-05 | RISK-01, RISK-02, RISK-07 |
| REQ-005 | FIX-05 | GAP-08 | RISK-09 |
| REQ-006 | FIX-04 | GAP-07 | RISK-01 |

### Requirements to Test Scenarios

| Requirement | Test Scenarios Covered |
|-------------|----------------------|
| REQ-001 | T-V9-01 through T-V9-10 (10 test cases) |
| REQ-002 | T-V8-REDO-01 through T-V8-REDO-03, plus REQ-004 integration tests |
| REQ-003 | T-V8-REDO-01 through T-V8-REDO-03 (3 test cases) |
| REQ-004 | TS-003 (4 tests), TS-004 (4 tests), TS-005 (4 tests), TS-008 (4 tests) |
| REQ-005 | Existing gate-blocker tests (regression verification) |
| REQ-006 | Manual verification (prompt-level change) |

### Requirements to Files

| Requirement | Files Modified | Files Created |
|-------------|---------------|---------------|
| REQ-001 | `src/claude/hooks/state-write-validator.cjs` | `src/claude/hooks/tests/v9-cross-location-consistency.test.cjs` |
| REQ-002 | `src/claude/hooks/state-write-validator.cjs`, `src/claude/commands/isdlc.md` | -- |
| REQ-003 | `src/claude/hooks/state-write-validator.cjs` | -- |
| REQ-004 | -- | 4 test files in `src/claude/hooks/tests/` |
| REQ-005 | `src/claude/hooks/gate-blocker.cjs`, `src/claude/hooks/iteration-corridor.cjs` | -- |
| REQ-006 | `src/claude/commands/isdlc.md` | -- |

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **V8** | Rule 8 in state-write-validator.cjs: phase field regression protection (BUG-0011) |
| **V9** | New Rule 9 in state-write-validator.cjs: cross-location consistency check (INV-0055) |
| **Dual-write** | Writing phase status to both `phases[N].status` and `active_workflow.phase_status[N]` |
| **Supervised redo** | When a phase completes but the user chooses "Redo" during supervised review, resetting it to `in_progress` |
| **Stale phase** | A phase stuck as `in_progress` for longer than 2x its configured timeout |
| **Phase A / Phase B** | Two-stage migration: Phase A adds coverage and deprecation markers; Phase B removes the dual-write entirely |
| **Fail-open** | On error, allow the operation to proceed rather than blocking it |

---

## Phase Gate Validation (GATE-01)

### Requirements Completeness
- [x] All functional requirements documented (REQ-001 through REQ-006)
- [x] All non-functional requirements documented (NFR-001 through NFR-006)
- [x] All constraints identified (CON-001 through CON-003)
- [x] All assumptions documented (ASM-001 through ASM-003)

### Requirements Quality
- [x] Each requirement has a unique ID (REQ-001 through REQ-006, NFR-001 through NFR-006, CON-001 through CON-003)
- [x] Each requirement has a clear description
- [x] Each requirement has a priority (MoSCoW in Section 7)
- [x] No ambiguous requirements
- [x] No conflicting requirements

### Acceptance Criteria
- [x] All functional requirements have acceptance criteria (AC-001a through AC-006d)
- [x] Acceptance criteria use Given/When/Then format
- [x] 24 acceptance criteria across 6 requirements

### Traceability
- [x] Requirements linked to design spec fixes (Section 9)
- [x] Requirements linked to test scenarios (Section 9)
- [x] Requirements linked to files (Section 9)
- [x] No orphan requirements
- [x] Dependencies documented (implementation batching in Section 8)

### Stakeholder Approval
- [x] Requirements reviewed and approved (user selected [S] Save)

---

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
