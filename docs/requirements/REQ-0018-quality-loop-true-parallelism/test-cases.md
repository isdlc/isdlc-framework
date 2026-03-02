# Test Cases: REQ-0018 Quality Loop True Parallelism

**Phase**: 05-test-strategy
**Test File**: `src/claude/hooks/tests/quality-loop-parallelism.test.cjs`
**Target File**: `src/claude/agents/16-quality-loop-engineer.md`
**Pattern**: Prompt-verification (read .md, assert content with string matching)
**Date**: 2026-02-15

---

## Test File Structure

```
describe('Quality Loop Parallelism (16-quality-loop-engineer.md)')
  +-- describe('FR-001: Parallel Spawning')         // TC-01 to TC-05
  +-- describe('FR-002: Internal Track Parallelism') // TC-06 to TC-10
  +-- describe('FR-003: Grouping Strategy')          // TC-11 to TC-18
  +-- describe('FR-004: Consolidated Result Merging') // TC-19 to TC-22
  +-- describe('FR-005: Iteration Loop')             // TC-23 to TC-26
  +-- describe('FR-006: FINAL SWEEP Compatibility')  // TC-27 to TC-30
  +-- describe('FR-007: Scope Detection')            // TC-31 to TC-33
  +-- describe('NFR: Non-Functional Requirements')   // TC-34 to TC-37
  +-- describe('Regression: Existing Behavior')      // TC-38 to TC-40
```

---

## FR-001: Parallel Spawning (AC-001 to AC-004)

### TC-01: Agent file exists

- **AC**: Precondition
- **Given**: The quality-loop-engineer agent prompt file
- **When**: The test checks for file existence
- **Then**: The file exists at `src/claude/agents/16-quality-loop-engineer.md`
- **Assertion**: `fs.existsSync(AGENT_PATH)` returns true

### TC-02: Two Task tool calls in single response (AC-001)

- **AC**: AC-001
- **Given**: The agent prompt content
- **When**: Phase 16 begins
- **Then**: The prompt instructs exactly two Task tool calls in a single response -- one for Track A, one for Track B
- **Assertion**: Content includes "two Task" or "two parallel Task" AND references both "Track A" and "Track B" in the context of simultaneous spawning
- **Search scope**: Parallel Execution Protocol section

### TC-03: Track A Task call includes full prompt (AC-002)

- **AC**: AC-002
- **Given**: The agent prompt content
- **When**: Track A Task call is defined
- **Then**: The Track A prompt references all Track A checks: build verification (QL-007), test execution (QL-002), mutation testing (QL-003), and coverage analysis (QL-004)
- **Assertion**: The Track A section/prompt includes references to build, test, mutation, and coverage
- **Search scope**: Track A definition section

### TC-04: Track B Task call includes full prompt (AC-002)

- **AC**: AC-002
- **Given**: The agent prompt content
- **When**: Track B Task call is defined
- **Then**: The Track B prompt references all Track B checks: lint (QL-005), type-check (QL-006), SAST (QL-008), dependency audit (QL-009), automated code review (QL-010)
- **Assertion**: The Track B section/prompt includes references to lint, type-check, SAST/security, dependency, and code review
- **Search scope**: Track B definition section

### TC-05: Wait for both results before consolidation (AC-003, AC-004)

- **AC**: AC-003, AC-004
- **Given**: The agent prompt content
- **When**: Both tasks are spawned
- **Then**: The prompt instructs the agent to wait for both Task results before proceeding to consolidation
- **Assertion**: Content includes instruction to wait for both results (e.g., "wait for both", "both complete", "both results")
- **Search scope**: Parallel Execution Protocol or Consolidation section

---

## FR-002: Internal Track Parallelism (AC-005 to AC-008)

### TC-06: Track A MAY split work into sub-groups (AC-005)

- **AC**: AC-005
- **Given**: The agent prompt content
- **When**: Track A has a large workload
- **Then**: The prompt states Track A MAY split work into parallel sub-groups
- **Assertion**: Track A section includes reference to sub-groups, internal parallelism, or splitting work
- **Search scope**: Track A definition

### TC-07: Track B MAY split work into sub-groups (AC-006)

- **AC**: AC-006
- **Given**: The agent prompt content
- **When**: Track B has a large workload
- **Then**: The prompt states Track B MAY split work into parallel sub-groups
- **Assertion**: Track B section includes reference to sub-groups, internal parallelism, or splitting work
- **Search scope**: Track B definition

### TC-08: Internal parallelism is guidance, not enforcement (AC-007)

- **AC**: AC-007
- **Given**: The agent prompt content
- **When**: Internal parallelism is described
- **Then**: The prompt uses MAY/SHOULD/RECOMMENDED language, not MUST, for internal sub-grouping
- **Assertion**: Content includes "MAY" or "SHOULD" or "RECOMMENDED" near sub-group/internal parallelism references
- **Search scope**: Internal parallelism sections

### TC-09: Sub-groups report independently (AC-008)

- **AC**: AC-008
- **Given**: The agent prompt content
- **When**: Internal parallelism is used
- **Then**: The prompt instructs each sub-group to report results independently
- **Assertion**: Content mentions sub-groups reporting independently or each group producing its own result
- **Search scope**: Internal parallelism or consolidation section

### TC-10: Parent track consolidates sub-group results (AC-008)

- **AC**: AC-008
- **Given**: The agent prompt content
- **When**: Sub-groups complete
- **Then**: The parent track consolidates sub-group results into a single track result
- **Assertion**: Content mentions parent consolidation or merging sub-group results into a track-level result
- **Search scope**: Internal parallelism or consolidation section

---

## FR-003: Grouping Strategy (AC-009 to AC-012)

### TC-11: Two grouping modes defined (AC-009)

- **AC**: AC-009
- **Given**: The agent prompt content
- **When**: The grouping strategy is described
- **Then**: Two modes are defined: "logical grouping" and "task count"
- **Assertion**: Content includes both "logical grouping" and "task count" references
- **Search scope**: Grouping Strategy section

### TC-12: Group A1 contains build + lint + type-check (AC-010)

- **AC**: AC-010
- **Given**: The agent prompt content
- **When**: The grouping lookup table is defined
- **Then**: Group A1 includes build verification, lint check, and type check
- **Assertion**: Content defines a group (A1 or similar) containing build, lint, and type-check together
- **Search scope**: Grouping Strategy lookup table

### TC-13: Group A2 contains test execution + coverage (AC-010)

- **AC**: AC-010
- **Given**: The agent prompt content
- **When**: The grouping lookup table is defined
- **Then**: Group A2 includes test execution and coverage analysis
- **Assertion**: Content defines a group (A2 or similar) containing test execution and coverage
- **Search scope**: Grouping Strategy lookup table

### TC-14: Group A3 contains mutation testing (AC-010)

- **AC**: AC-010
- **Given**: The agent prompt content
- **When**: The grouping lookup table is defined
- **Then**: Group A3 includes mutation testing
- **Assertion**: Content defines a group (A3 or similar) containing mutation testing
- **Search scope**: Grouping Strategy lookup table

### TC-15: Group B1 contains SAST + dependency audit (AC-010)

- **AC**: AC-010
- **Given**: The agent prompt content
- **When**: The grouping lookup table is defined
- **Then**: Group B1 includes SAST security scan and dependency audit
- **Assertion**: Content defines a group (B1 or similar) containing SAST/security and dependency audit
- **Search scope**: Grouping Strategy lookup table

### TC-16: Group B2 contains code review + traceability (AC-010)

- **AC**: AC-010
- **Given**: The agent prompt content
- **When**: The grouping lookup table is defined
- **Then**: Group B2 includes automated code review and traceability verification
- **Assertion**: Content defines a group (B2 or similar) containing code review and traceability
- **Search scope**: Grouping Strategy lookup table

### TC-17: Grouping is a lookup table in prompt (AC-011)

- **AC**: AC-011
- **Given**: The agent prompt content
- **When**: The grouping strategy is documented
- **Then**: The grouping is presented as a structured table (markdown table or similar format) in the prompt, not as JavaScript code
- **Assertion**: Content contains a markdown table with Group identifiers (A1, A2, A3, B1, B2) and their member checks
- **Search scope**: Grouping Strategy section

### TC-18: Unconfigured checks skipped within group (AC-012)

- **AC**: AC-012
- **Given**: The agent prompt content
- **When**: A check within a group is not configured
- **Then**: The prompt instructs skipping unconfigured checks without affecting other checks in the same group
- **Assertion**: Content includes instruction about skipping unconfigured or "NOT CONFIGURED" checks within a group
- **Search scope**: Grouping Strategy or Track definition sections

---

## FR-004: Consolidated Result Merging (AC-013 to AC-015)

### TC-19: Pass/fail for every check organized by track and group (AC-013)

- **AC**: AC-013
- **Given**: The agent prompt content
- **When**: Both tracks complete
- **Then**: The consolidated result includes pass/fail status for every individual check, organized by track and group
- **Assertion**: Content references pass/fail per check with track/group organization
- **Search scope**: Consolidation section

### TC-20: ANY failure marks result as FAILED (AC-014)

- **AC**: AC-014
- **Given**: The agent prompt content
- **When**: Any check fails
- **Then**: The consolidated result is marked as "FAILED" with a structured list of all failures
- **Assertion**: Content specifies that any failure -> overall FAILED, with failure list
- **Search scope**: Consolidation section

### TC-21: Quality report includes Parallel Execution Summary (AC-015)

- **AC**: AC-015
- **Given**: The agent prompt content
- **When**: The quality report is generated
- **Then**: The quality-report.md includes a "Parallel Execution Summary" section
- **Assertion**: Content includes "Parallel Execution Summary" as a section or template element
- **Search scope**: Output Artifacts or quality-report template section

### TC-22: Summary shows group composition and elapsed time (AC-015)

- **AC**: AC-015
- **Given**: The agent prompt content
- **When**: The Parallel Execution Summary is generated
- **Then**: The summary shows which checks ran in parallel, elapsed time per track, and group composition
- **Assertion**: Content references group composition, elapsed time, and parallel check listing in the summary
- **Search scope**: Parallel Execution Summary section or template

---

## FR-005: Iteration Loop (AC-016 to AC-018)

### TC-23: ALL failures consolidated from both tracks (AC-016)

- **AC**: AC-016
- **Given**: The agent prompt content
- **When**: Failures are detected
- **Then**: ALL failures from BOTH tracks are consolidated into a single failure list before delegating to software-developer
- **Assertion**: Content instructs consolidating failures from both tracks into one list and delegating to software-developer
- **Search scope**: Iteration or Consolidation section

### TC-24: Both tracks re-run in parallel after fixes (AC-017)

- **AC**: AC-017
- **Given**: The agent prompt content
- **When**: Fixes are applied
- **Then**: BOTH Track A and Track B are re-run in parallel (not just the failing track)
- **Assertion**: Content explicitly states re-running BOTH tracks (not just the failing one) after fixes
- **Search scope**: Iteration loop section

### TC-25: Circuit breaker reference (AC-018)

- **AC**: AC-018
- **Given**: The agent prompt content
- **When**: Iteration loop is described
- **Then**: The prompt references iteration-requirements.json or circuit breaker thresholds
- **Assertion**: Content includes "iteration-requirements" or "circuit breaker" or "circuit_breaker"
- **Search scope**: Iteration loop section

### TC-26: Max iterations and circuit breaker threshold values (AC-018)

- **AC**: AC-018
- **Given**: The agent prompt content
- **When**: Iteration loop parameters are described
- **Then**: The prompt references max_iterations or circuit_breaker_threshold values
- **Assertion**: Content includes "max_iterations" or "circuit_breaker_threshold" or references to numeric limits (10, 3)
- **Search scope**: Iteration loop section or MANDATORY ITERATION ENFORCEMENT section

---

## FR-006: FINAL SWEEP Compatibility (AC-019 to AC-021)

### TC-27: FINAL SWEEP exclusions preserved with parallelism (AC-019)

- **AC**: AC-019
- **Given**: The agent prompt content
- **When**: FINAL SWEEP mode is active
- **Then**: The checks excluded by the implementation loop remain excluded regardless of parallel grouping
- **Assertion**: FINAL SWEEP mode section still contains exclusion list (individual file reviews excluded)
- **Search scope**: FINAL SWEEP Mode section

### TC-28: FINAL SWEEP uses same grouping strategy for included checks (AC-020)

- **AC**: AC-020
- **Given**: The agent prompt content
- **When**: FINAL SWEEP mode runs included checks
- **Then**: The included batch checks are distributed across parallel groups using the same grouping strategy
- **Assertion**: FINAL SWEEP section references grouping strategy or parallel groups for included checks
- **Search scope**: FINAL SWEEP Mode section

### TC-29: FULL SCOPE includes all checks (AC-021)

- **AC**: AC-021
- **Given**: The agent prompt content
- **When**: FULL SCOPE mode is active
- **Then**: ALL checks are included, distributed across the parallel group structure
- **Assertion**: FULL SCOPE section specifies ALL checks run using the grouping structure
- **Search scope**: FULL SCOPE Mode section

### TC-30: Both FINAL SWEEP and FULL SCOPE documented distinctly (AC-019, AC-021)

- **AC**: AC-019, AC-021
- **Given**: The agent prompt content
- **When**: Both modes are described
- **Then**: Both FINAL SWEEP and FULL SCOPE mode sections exist and are distinct
- **Assertion**: Content contains both "FINAL SWEEP" and "FULL SCOPE" as distinct sections
- **Search scope**: Entire file

---

## FR-007: Scope Detection (AC-022 to AC-023)

### TC-31: 50+ test files threshold for parallel execution (AC-022)

- **AC**: AC-022
- **Given**: The agent prompt content
- **When**: Track A scope detection is described
- **Then**: The prompt specifies 50+ test files as the threshold for parallel test execution
- **Assertion**: Content includes "50" in the context of test files and parallel execution
- **Search scope**: Track A or Parallel Test Execution section

### TC-32: Small project sub-grouping guidance (AC-023)

- **AC**: AC-023
- **Given**: The agent prompt content
- **When**: Track A internal parallelism is described for small projects
- **Then**: The prompt addresses small projects (<10 test files) with guidance on overhead vs. benefit of sub-grouping
- **Assertion**: Content includes "10" in the context of small project threshold and sub-grouping
- **Search scope**: Track A internal parallelism section

### TC-33: Scope detection is Track A specific (AC-022)

- **AC**: AC-022
- **Given**: The agent prompt content
- **When**: Scope-based parallelism detection is described
- **Then**: The scope detection is documented within Track A context (not Track B)
- **Assertion**: Scope detection (50+ test files) appears within or near Track A section, not in Track B
- **Search scope**: Track A section

---

## NFR: Non-Functional Requirements

### TC-34: Prompt-only change verified (NFR-002)

- **AC**: NFR-002
- **Given**: The test file structure
- **When**: The test is designed
- **Then**: The only target file is a .md file (no .js, .cjs, or .mjs files created)
- **Assertion**: Test target is `16-quality-loop-engineer.md` (a prompt file, not code)
- **Verification**: Structural (test file only reads .md)

### TC-35: Backward compatibility for projects without QA tools (NFR-003)

- **AC**: NFR-003
- **Given**: The agent prompt content
- **When**: A project has no QA tools configured
- **Then**: The prompt handles "NOT CONFIGURED" tools gracefully
- **Assertion**: Content includes "NOT CONFIGURED" handling instruction
- **Search scope**: Tool Discovery Protocol section

### TC-36: Parallel execution state tracking with track timing (NFR-004)

- **AC**: NFR-004
- **Given**: The agent prompt content
- **When**: Parallel execution state is tracked
- **Then**: State tracking includes track-level timing and group composition data
- **Assertion**: Content includes parallel_execution state with references to track timing and/or group composition
- **Search scope**: State Tracking or Parallel Execution State section

### TC-37: Performance improvement referenced (NFR-001)

- **AC**: NFR-001
- **Given**: The agent prompt content
- **When**: Parallel execution is described
- **Then**: The prompt references performance improvement from parallelism
- **Assertion**: Content includes reference to speedup, faster, or reduced time from parallel execution
- **Search scope**: Phase overview or Parallel Execution Protocol section

---

## Regression: Existing Behavior Preserved

### TC-38: Agent frontmatter unchanged (NFR-003)

- **AC**: NFR-003
- **Given**: The agent prompt content
- **When**: The frontmatter is read
- **Then**: The frontmatter still contains `name: quality-loop-engineer`
- **Assertion**: `content.includes('name: quality-loop-engineer')`

### TC-39: GATE-16 checklist still present (NFR-003)

- **AC**: NFR-003
- **Given**: The agent prompt content
- **When**: The GATE-16 section is checked
- **Then**: The GATE-16 checklist section exists with required items
- **Assertion**: Content includes "GATE-16" and checklist items (clean build, all tests pass, coverage)

### TC-40: Tool Discovery Protocol preserved (NFR-003)

- **AC**: NFR-003
- **Given**: The agent prompt content
- **When**: The Tool Discovery section is checked
- **Then**: The Tool Discovery Protocol section still exists
- **Assertion**: Content includes "Tool Discovery Protocol"
