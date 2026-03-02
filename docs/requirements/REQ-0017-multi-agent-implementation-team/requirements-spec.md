# Requirements Specification: Multi-agent Implementation Team

**REQ ID:** REQ-0017
**Feature:** Multi-agent Implementation Team -- Writer/Reviewer/Updater per-file debate loop for Phase 06 implementation
**Backlog Item:** 4.1 Phase 06
**Created:** 2026-02-15
**Status:** Draft

## Problem Statement

Code is written in Phase 06, then waits for Phase 16 (quality loop) and Phase 08 (code review) to find issues. By then context is cold, fixes require re-reading, and the sequential overhead adds 15-30 minutes per workflow. The prior debate teams (REQ-0014 Phase 01, REQ-0015 Phase 03, REQ-0016 Phase 04) use Creator/Critic/Refiner with a per-artifact loop. Phase 06 requires a fundamentally different pattern: Writer/Reviewer/Updater with a per-file loop, where each file is reviewed immediately after writing while context is hot.

## Key Differences from Prior Debate Teams

| Aspect | Phases 01/03/04 (Creator/Critic/Refiner) | Phase 06 (Writer/Reviewer/Updater) |
|--------|----------------------------------------|-------------------------------------|
| Loop granularity | Per-artifact (whole phase output) | Per-file (each individual file) |
| Roles | Creator, Critic, Refiner | Writer, Reviewer, Updater |
| Review timing | After all artifacts produced | After each file produced |
| Convergence | BLOCKING findings = 0 across all artifacts | Reviewer approves individual file |
| Context advantage | Cold review of batch output | Hot review while context is fresh |
| Max iterations | 3 rounds (entire artifact set) | Per-file: max 3 fix cycles per file |

## Personas

- **P-001: Framework Developer** -- Developer using iSDLC to build software. Wants implementation issues caught immediately per-file rather than batched in Phase 16/08.
- **P-002: Orchestrator Agent** -- The SDLC Orchestrator that manages the per-file loop. Needs a new IMPLEMENTATION_ROUTING entry or extension to the existing debate infrastructure.
- **P-003: Writer Agent** -- The software-developer agent in Writer role. Needs awareness of per-file loop so it produces files sequentially with proper handoff.

## Functional Requirements

### FR-001: Implementation Reviewer Agent

Given the per-file implementation loop is active for Phase 06,
When the Writer (software-developer) produces or modifies a file,
Then the Reviewer MUST immediately review that specific file and produce a structured per-file review.

**Acceptance Criteria:**

- AC-001-01: Given a newly written production code file, When the Reviewer reviews it, Then it MUST check logic correctness (off-by-one errors, null/undefined handling, boundary conditions, race conditions if async).
- AC-001-02: Given a newly written production code file, When the Reviewer reviews it, Then it MUST check error handling (try/catch coverage, error propagation, meaningful error messages, no swallowed errors).
- AC-001-03: Given a newly written production code file, When the Reviewer reviews it, Then it MUST check security (injection prevention, no hardcoded secrets, safe path operations, input validation).
- AC-001-04: Given a newly written production code file, When the Reviewer reviews it, Then it MUST check code quality (naming conventions, DRY adherence, single responsibility, cyclomatic complexity <=10).
- AC-001-05: Given a newly written test file, When the Reviewer reviews it, Then it MUST check test quality (meaningful assertions, edge case coverage, no false positives, test isolation, no test interdependence).
- AC-001-06: Given any file and the project's tech stack (from constitution/state.json), When the Reviewer reviews it, Then it MUST check skill/tech-stack alignment (correct module system ESM vs CJS, correct test runner, correct framework patterns).
- AC-001-07: Given any file and applicable constitutional articles, When the Reviewer reviews it, Then it MUST check constitutional compliance (Article I spec primacy, Article II TDD, Article V simplicity, Article VII traceability).
- AC-001-08: Given the Reviewer's review of a file, When producing output, Then it MUST produce a structured review with: file path, verdict (PASS/REVISE), findings list (each with severity BLOCKING/WARNING/INFO, category, description, line reference if applicable), and a 1-line summary.

### FR-002: Implementation Updater Agent

Given the Reviewer has flagged a file with verdict REVISE,
When the orchestrator delegates to the Updater,
Then the Updater MUST apply targeted fixes and re-run relevant tests.

**Acceptance Criteria:**

- AC-002-01: Given BLOCKING findings from the Reviewer for a specific file, When the Updater receives them, Then it MUST address ALL BLOCKING findings before returning the file.
- AC-002-02: Given WARNING findings from the Reviewer, When the Updater processes them, Then it SHOULD address straightforward fixes and mark complex ones with [DEFERRED] for Phase 16.
- AC-002-03: Given the Updater modifies a file, When the modifications are complete, Then it MUST re-run the unit tests for that file and report pass/fail status.
- AC-002-04: Given the Updater's output, When producing the update report, Then it MUST list each finding addressed with: finding ID, action taken (fixed/deferred/disputed), and the specific change made.
- AC-002-05: Given the Updater disputes a finding, When documenting the dispute, Then it MUST provide a rationale (min 20 chars) explaining why the finding is incorrect or inapplicable.
- AC-002-06: Given the Updater modifies a file, When applying fixes, Then it MUST NOT introduce new issues -- fixes must be minimal and targeted.

### FR-003: Per-File Loop Protocol

Given Phase 06 (implementation) is active with the implementation team enabled,
When the orchestrator runs the per-file loop,
Then it MUST follow the Writer-Reviewer-Updater cycle for each file.

**Acceptance Criteria:**

- AC-003-01: Given the Writer produces a new file (production or test), When the file is written to disk, Then the orchestrator MUST delegate to the Reviewer for that specific file before the Writer proceeds to the next file.
- AC-003-02: Given the Reviewer returns verdict PASS for a file, When the orchestrator processes the verdict, Then the Writer MUST proceed to the next file in the task plan.
- AC-003-03: Given the Reviewer returns verdict REVISE for a file, When the orchestrator processes the verdict, Then the orchestrator MUST delegate to the Updater with the file path and findings.
- AC-003-04: Given the Updater returns a fixed file, When the orchestrator processes the update, Then the orchestrator MUST delegate back to the Reviewer for re-review of the same file.
- AC-003-05: Given a file has been through 3 Reviewer-Updater cycles without passing, When the third cycle completes, Then the orchestrator MUST accept the file with a [MAX_ITERATIONS] warning and proceed to the next file.
- AC-003-06: Given all files in the task plan have been processed (PASS or MAX_ITERATIONS), When the per-file loop completes, Then the orchestrator MUST produce a per-file-loop-summary.md with: total files, files passed on first review, files requiring revision, average revision cycles, files with MAX_ITERATIONS warnings.
- AC-003-07: Given the per-file loop, When determining file order, Then files MUST be processed in task plan order (tasks.md sequence). Test files are reviewed immediately after their corresponding production file.

### FR-004: Writer Role Awareness for Software Developer

Given the software-developer agent currently has no awareness of the per-file review loop,
When this feature is complete,
Then the software-developer MUST recognize the Writer role context and produce files optimized for per-file review.

**Acceptance Criteria:**

- AC-004-01: Given a WRITER_CONTEXT in the Task prompt indicating per-file loop is active, When the software-developer writes a file, Then it MUST announce the file path and wait for the review cycle to complete before proceeding to the next file.
- AC-004-02: Given no WRITER_CONTEXT in the Task prompt, When the software-developer produces files, Then it MUST behave exactly as it does today (no regression).
- AC-004-03: Given the WRITER_CONTEXT and TDD mode, When the software-developer writes files, Then it MUST write the test file FIRST, then the production file, and both are reviewed in that order.

### FR-005: Phase Restructuring (06 -> 16 -> 08 Semantics)

Given the current flow is: 06-implementation (write all) -> 16-quality-loop (test + QA) -> 08-code-review (human + automated),
When this feature is complete,
Then the semantic roles of Phases 16 and 08 MUST be adjusted to complement the per-file review loop.

**Acceptance Criteria:**

- AC-005-01: Given Phase 06 now includes per-file reviews that cover logic, security, quality, and constitutional compliance, When Phase 16 (quality-loop) runs afterward, Then Phase 16 MUST focus on batch-only checks: full test suite execution, coverage measurement, mutation testing, npm audit, SAST scan, build verification, lint/type check, and traceability matrix.
- AC-005-02: Given Phase 16 adjusts to "final sweep" scope, When the quality-loop-engineer agent runs, Then it MUST NOT re-review individual file logic/quality (already done by Reviewer in Phase 06).
- AC-005-03: Given Phase 08 adjusts to "human review only" scope, When the qa-engineer runs, Then it MUST focus on: architecture decisions, business logic coherence, design pattern compliance, non-obvious security concerns, and merge approval.
- AC-005-04: Given Phase 08 adjusts scope, When the qa-engineer runs, Then it MUST NOT re-check code quality items already verified by the Reviewer in Phase 06 (naming, DRY, complexity, error handling).

### FR-006: Orchestrator Implementation Routing

Given the orchestrator needs to manage the Writer/Reviewer/Updater loop,
When Phase 06 is reached in a workflow with the implementation team enabled,
Then the orchestrator MUST use a new IMPLEMENTATION_ROUTING table or extend the existing debate infrastructure.

**Acceptance Criteria:**

- AC-006-01: Given the orchestrator's agent routing, When resolving Phase 06 agents for the implementation team, Then it MUST map: Writer to 05-software-developer.md, Reviewer to 05-implementation-reviewer.md, Updater to 05-implementation-updater.md.
- AC-006-02: Given the implementation team is enabled (same debate_mode resolution as Phases 01/03/04), When the orchestrator initializes Phase 06, Then it MUST create an implementation_loop_state in active_workflow tracking: current_file, files_completed, files_remaining, per_file_reviews (array of { file, verdict, cycles, findings_count }).
- AC-006-03: Given the existing DEBATE_ROUTING table handles Phases 01/03/04, When adding Phase 06 routing, Then it MUST use a SEPARATE routing mechanism (IMPLEMENTATION_ROUTING) because the loop pattern is fundamentally different (per-file vs per-artifact).
- AC-006-04: Given the implementation team is NOT enabled (debate_mode false or --no-debate), When the orchestrator runs Phase 06, Then it MUST delegate to the software-developer as a single agent exactly as today (no regression).

### FR-007: Implementation Option Selection

Given the backlog lists 3 implementation options: (A) Single Task with 3 sub-agents, (B) Phase-Loop Controller manages loop, (C) New collaborative-implementation-engineer agent,
When this feature is implemented,
Then Option (A) MUST be selected: orchestrator manages the loop, delegates to 3 sub-agents via Task tool.

**Acceptance Criteria:**

- AC-007-01: Given Option (A) is selected, When the orchestrator runs the per-file loop, Then it MUST delegate to Writer, Reviewer, and Updater as separate Task agent invocations (not a single monolithic agent).
- AC-007-02: Given Option (A) is selected, When tracking loop state, Then the orchestrator MUST maintain implementation_loop_state in state.json (not delegated to a sub-agent to manage).
- AC-007-03: Given Option (A) is selected, When a sub-agent (Writer/Reviewer/Updater) encounters an error, Then the orchestrator MUST handle the error and decide whether to retry, skip the file with a warning, or escalate to human.

## Non-Functional Requirements

### NFR-001: Performance

- The per-file review loop MUST NOT add more than 30 seconds overhead per file compared to current single-agent Phase 06.
- The total Phase 06 duration with the implementation team SHOULD be offset by reduced Phase 16 + Phase 08 time (batch review becomes simpler when per-file issues are already caught).

### NFR-002: Backward Compatibility

- When the implementation team is disabled (--no-debate or light mode), Phase 06/16/08 MUST behave exactly as they do today.
- Existing tests for software-developer, quality-loop-engineer, and qa-engineer agents MUST continue to pass.

### NFR-003: Consistency with Prior Debate Teams

- Agent file naming MUST follow the established pattern: `{NN}-{role}.md` where NN matches the phase agent numbering (05 for Phase 06 agents, since software-developer is 05).
- Test file naming MUST follow the pattern: `implementation-debate-{role}.test.cjs`.
- The debate mode resolution logic (--debate/--no-debate/light/standard/epic) MUST use the same function as Phases 01/03/04.

### NFR-004: Observability

- Every per-file review cycle MUST be logged to state.json with: file path, verdict, cycle number, findings count, timestamps.
- The implementation_loop_state MUST be readable by the orchestrator at any point to report progress.

## Traceability

| Requirement | Backlog Reference | Constitutional Articles |
|------------|------------------|----------------------|
| FR-001 | 4.1 Phase 06 "In-loop reviewer checks" | I, II, III, V, VII |
| FR-002 | 4.1 Phase 06 "Updater takes reviewer feedback" | I, II, V |
| FR-003 | 4.1 Phase 06 "Per-file loop" | IX, XVI |
| FR-004 | 4.1 Phase 06 "Writer writes code following tasks.md" | I, IV |
| FR-005 | 4.1 Phase 06 "Phase restructuring" | V, IX |
| FR-006 | 4.1 Phase 06 "Implementation options" | IV, XVI |
| FR-007 | 4.1 Phase 06 "Implementation options" (Option A) | V |

## Open Questions

None -- all questions resolved by BACKLOG.md specification:
- Implementation option: (A) selected (orchestrator manages loop with 3 sub-agents)
- Loop pattern: per-file (specified in backlog)
- Role names: Writer/Reviewer/Updater (specified in backlog)
- Phase restructuring: 06-loop -> 16-final-sweep -> 08-human-review (specified in backlog)
