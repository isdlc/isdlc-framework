# REQ-0018: Quality Loop True Parallelism

**Version**: 1.0
**Status**: Draft
**Backlog Reference**: 2.1 (T5: Quality Loop true parallelism)
**Date**: 2026-02-15

---

## 1. Problem Statement

Phase 16 (Quality Loop) currently instructs the agent to "Launch as a Task agent" for Track A (Testing) and Track B (Automated QA) and states "Tasks [2] and [3] should run in parallel." However, the quality-loop-engineer agent processes these sequentially in practice because it lacks explicit sub-agent spawning instructions. The agent creates TaskCreate entries for both tracks but executes them one after the other rather than as true parallel sub-agents.

**Impact**: Phase 16 takes approximately 3-4 minutes when both tracks run sequentially. True parallelism would reduce this to approximately 1.5-2 minutes (the duration of the longer track), yielding a ~2x speedup.

**Root Cause**: The `16-quality-loop-engineer.md` agent prompt says "Launch as a Task agent" but does not provide the concrete parallelization mechanism: spawning two independent Task tool calls in the same response so Claude Code executes them concurrently.

---

## 2. Functional Requirements

### FR-001: Two-Track Parallel Sub-Agent Spawning

The quality-loop-engineer agent MUST spawn Track A (Testing) and Track B (Automated QA) as two separate sub-agents using parallel Task tool calls in a single response. Both tracks execute concurrently and the agent waits for both to complete before consolidating results.

**Acceptance Criteria:**

- AC-001: When Phase 16 begins, the agent MUST invoke exactly two Task tool calls in a single response — one for Track A, one for Track B — so they execute in parallel.
- AC-002: Each Task call MUST include the full prompt for its respective track (all checks, tool discovery results, and file references).
- AC-003: The agent MUST wait for both Task results to return before proceeding to consolidation.
- AC-004: If one track completes before the other, the agent MUST NOT start consolidation or re-dispatch until both results are available.

### FR-002: Internal Track Parallelism via Sub-Agent Grouping

Each track MAY further parallelize its internal work by spawning multiple sub-agents, grouped by either task count or logical grouping.

**Acceptance Criteria:**

- AC-005: Track A (Testing) MAY split its work into parallel sub-groups when the workload is large (e.g., separating build verification from test execution from coverage analysis).
- AC-006: Track B (Automated QA) MAY split its work into parallel sub-groups (e.g., lint+type-check in one group, SAST+dependency-audit in another, automated code review in a third).
- AC-007: Internal parallelism MUST be described as guidance in the agent prompt (not enforced by hooks), using the grouping strategy defined in FR-003.
- AC-008: When internal parallelism is used, each sub-group MUST report results independently, and the parent track MUST consolidate sub-group results into a single track result.

### FR-003: Grouping Strategy for Internal Parallelism

The agent prompt MUST define a grouping strategy that determines how checks within each track are distributed across parallel sub-agents.

**Acceptance Criteria:**

- AC-009: The grouping strategy MUST support two modes: "logical grouping" (group by related functionality) and "task count" (distribute N tasks across M agents where M = ceil(N / tasks_per_agent)).
- AC-010: The default grouping mode MUST be "logical grouping" with the following groups:
  - Track A: Group A1 (build verification + lint + type-check), Group A2 (test execution + coverage analysis), Group A3 (mutation testing)
  - Track B: Group B1 (SAST security scan + dependency audit), Group B2 (automated code review + traceability verification)
- AC-011: The grouping strategy MUST be documented in the agent prompt as a lookup table, not hardcoded in JavaScript or hook code.
- AC-012: When a grouped check is NOT CONFIGURED (e.g., no mutation testing framework), that check MUST be skipped within its group without affecting other checks in the same group.

### FR-004: Consolidated Result Merging

After both tracks complete (and any internal sub-groups within each track), the agent MUST merge all results into a unified report.

**Acceptance Criteria:**

- AC-013: The consolidated result MUST include pass/fail status for every individual check, organized by track and group.
- AC-014: If ANY check fails in either track, the consolidated result MUST be marked as "FAILED" with a structured list of all failures.
- AC-015: The quality-report.md artifact MUST include a "Parallel Execution Summary" section showing which checks ran in parallel, elapsed time per track (if measurable), and group composition.

### FR-005: Iteration Loop with Parallel Re-Execution

When consolidation reveals failures, the agent MUST delegate fixes and re-run both tracks in parallel again (not just the failing track).

**Acceptance Criteria:**

- AC-016: On failure, the agent MUST consolidate ALL failures from both tracks into a single failure list before delegating to the software-developer agent.
- AC-017: After fixes are applied, the agent MUST re-run BOTH Track A and Track B in parallel from scratch (not just the track that failed).
- AC-018: The iteration loop MUST respect the circuit breaker from iteration-requirements.json (max_iterations: 10, circuit_breaker_threshold: 3).

### FR-006: FINAL SWEEP Mode Compatibility

The parallel execution model MUST work correctly in both FULL SCOPE mode and FINAL SWEEP mode (when the implementation loop from Phase 06 already ran per-file reviews).

**Acceptance Criteria:**

- AC-019: In FINAL SWEEP mode, the checks excluded by the implementation loop (individual file reviews) MUST remain excluded regardless of parallelism.
- AC-020: In FINAL SWEEP mode, the included batch checks MUST still be distributed across parallel groups using the same grouping strategy.
- AC-021: In FULL SCOPE mode, ALL checks MUST be included, distributed across the same parallel group structure.

### FR-007: Scope Detection for Track A Internal Parallelism

Track A SHOULD detect the project's test suite size and apply internal parallelism only when beneficial.

**Acceptance Criteria:**

- AC-022: Track A MUST use parallel test execution flags (existing behavior) for test suites with 50+ test files.
- AC-023: Track A internal sub-grouping (splitting build from tests from mutation) is RECOMMENDED for all project sizes but MAY be skipped for very small projects (<10 test files) where the overhead of sub-agent spawning exceeds the benefit.

---

## 3. Non-Functional Requirements

### NFR-001: Performance

Phase 16 wall-clock time MUST decrease by at least 30% compared to sequential execution for projects with both testing and QA infrastructure configured.

### NFR-002: No New Dependencies

The implementation MUST NOT introduce any new npm packages, JavaScript files, or hook code. This is a prompt-only change to `16-quality-loop-engineer.md`.

### NFR-003: Backward Compatibility

Projects that only have Track A configured (no linter, no SAST) MUST NOT experience any behavioral change. The parallel structure MUST gracefully handle tracks/groups with no applicable checks.

### NFR-004: Observability

All parallel executions MUST be logged to state.json `phases[16-quality-loop].test_results.parallel_execution` with track-level timing and group composition data.

---

## 4. User Stories

### US-001: Developer Running Quality Loop on Feature Branch

As a developer completing Phase 06 implementation, I want Track A (testing) and Track B (QA) to run simultaneously so that Phase 16 completes in half the time.

### US-002: Developer with Large Test Suite

As a developer with 500+ tests, I want Track A to internally parallelize build verification, test execution, and mutation testing so that the longest track completes faster.

### US-003: Developer with Full QA Tooling

As a developer with ESLint, TypeScript, Snyk, and npm audit configured, I want Track B to run lint+type-check in parallel with SAST+dependency-audit so that QA checks don't bottleneck the quality loop.

### US-004: Developer with Minimal Tooling

As a developer with only unit tests and no QA tools, I want Track B to gracefully skip all checks and report "NOT CONFIGURED" without errors, while Track A runs normally.

### US-005: Developer Iterating on Failures

As a developer whose quality loop finds failures, I want both tracks to re-run in parallel after I fix the issues, maintaining the speedup benefit across iterations.

---

## 5. Constraints

- C-001: Implementation is limited to modifying `src/claude/agents/16-quality-loop-engineer.md` (prompt changes only).
- C-002: No new agents, skills, or hooks are created.
- C-003: The existing Task List section in the agent prompt is updated to reflect the parallel execution model.
- C-004: Constitutional articles II (Test-First), IX (Gate Integrity), and XI (Integration Testing) remain enforced.

---

## 6. Out of Scope

- Fan-out/fan-in infrastructure shared across phases (backlog item 4.3) -- this is a Phase 16-specific prompt change, not a reusable framework feature.
- Hook-level enforcement of parallel execution -- parallelism is guided by the prompt, not enforced by code.
- Phase 08 (Code Review) fan-out -- addressed separately in backlog 4.3.
- Performance budget system (backlog 2.4) -- separate feature.

---

## 7. Traceability Matrix

| Requirement | Acceptance Criteria | Backlog Ref |
|-------------|-------------------|-------------|
| FR-001 | AC-001, AC-002, AC-003, AC-004 | 2.1 |
| FR-002 | AC-005, AC-006, AC-007, AC-008 | 2.1 |
| FR-003 | AC-009, AC-010, AC-011, AC-012 | 2.1 |
| FR-004 | AC-013, AC-014, AC-015 | 2.1 |
| FR-005 | AC-016, AC-017, AC-018 | 2.1 |
| FR-006 | AC-019, AC-020, AC-021 | 2.1 |
| FR-007 | AC-022, AC-023 | 2.1 |
