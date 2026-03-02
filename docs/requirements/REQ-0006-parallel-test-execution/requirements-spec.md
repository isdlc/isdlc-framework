# Requirements Specification: REQ-0006 Parallel Test Execution

**Feature**: Performance optimization T4: Parallel test execution (T4-B) and parallel test creation (T4-A)
**Workflow**: feature
**Status**: Draft
**Created**: 2026-02-13

---

## 1. Problem Statement

Test execution in iSDLC workflows is currently sequential, running one test file at a time. For projects with large test suites (100+ test files), this creates significant bottlenecks in Phases 07 (Integration Testing), 11 (Local Testing/Environment Build), and 16 (Quality Loop). A typical 500-test suite takes 2-5 minutes sequentially; parallel execution could reduce this to 30-60 seconds.

Similarly, the test design agent (Phase 05) operates sequentially when generating test cases for large codebases, creating tests one module at a time instead of parallelizing across independent modules.

## 2. Users

- **Primary**: iSDLC framework users whose projects have 50+ test files
- **Secondary**: The iSDLC agents themselves (environment-builder, integration-tester, quality-loop-engineer, test-design-engineer, software-developer) that execute or create tests

## 3. Success Criteria

- Test execution phases complete 2-5x faster for projects with parallelizable test suites
- No change in test correctness (same pass/fail results as sequential)
- Graceful fallback to sequential execution when parallel fails (flakiness detection)
- Test creation for large codebases completes faster via parallel sub-agents

---

## 4. Functional Requirements

### FR-01: Test Framework Detection

The system must detect the project's test framework from project files and determine the correct parallel execution flag.

| Test Framework | Detection Method | Parallel Flag |
|---------------|-----------------|---------------|
| Jest | `jest.config.*` or `package.json` jest field | `--workers=<N>` or `--maxWorkers=<N>` |
| Vitest | `vitest.config.*` or `vite.config.*` with test | `--pool=threads` or `--threads` |
| pytest | `pytest.ini`, `pyproject.toml [tool.pytest]`, `conftest.py` | `-n auto` (requires `pytest-xdist`) |
| Go test | `go.mod` | `-parallel <N>` with `-count=1` |
| node:test | `package.json` scripts using `node --test` | `--test-concurrency=<N>` (Node 22+) |
| Cargo test | `Cargo.toml` | `--test-threads=<N>` |
| JUnit/Maven | `pom.xml` | `-T <N>C` (Maven) or `maxParallelForks` (Gradle) |

**AC-01.1**: Agent detects test framework from project files before running tests.
**AC-01.2**: Agent selects the correct parallel flag for the detected framework.
**AC-01.3**: If framework is not recognized, agent falls back to sequential execution with an informational message.

### FR-02: Parallel Test Execution in Agent Prompts

The environment-builder (Agent 10), integration-tester (Agent 06), quality-loop-engineer (Agent 16), and software-developer (Agent 05) agent prompts must be updated to include parallel execution instructions.

**AC-02.1**: Agent 10 (environment-builder) includes parallel flag when running test suites during build verification.
**AC-02.2**: Agent 06 (integration-tester) includes parallel flag when running integration and E2E test suites.
**AC-02.3**: Agent 16 (quality-loop-engineer) includes parallel flag in Track A test execution.
**AC-02.4**: Agent 05 (software-developer) includes parallel flag when running tests during TDD iteration loops.
**AC-02.5**: Each agent prompt includes the framework detection lookup table.

### FR-03: CPU Core Detection

Agents must determine an appropriate parallelism level based on available CPU cores.

**AC-03.1**: Agent determines CPU core count via `os.cpus().length` (Node.js) or equivalent system call.
**AC-03.2**: Default parallelism is set to `max(1, cores - 1)` to leave one core for the system.
**AC-03.3**: For `node:test`, use `--test-concurrency=<N>` where N is the computed value.
**AC-03.4**: For frameworks with `auto` mode (pytest `-n auto`, Jest `--maxWorkers=auto`), prefer `auto` over manual core count.

### FR-04: Sequential Fallback on Failure

If parallel test execution fails (timeout, flaky tests, resource contention), the agent must retry sequentially.

**AC-04.1**: If parallel test run produces failures, agent retries the failing tests sequentially before reporting them as genuine failures.
**AC-04.2**: Agent logs a flakiness warning when tests pass sequentially but fail in parallel.
**AC-04.3**: Flakiness warnings are included in the phase's test results in state.json.
**AC-04.4**: The fallback does NOT re-run all tests -- only the ones that failed in parallel mode.

### FR-05: Parallel Test Creation (T4-A)

The test-design-engineer (Agent 04) should support spawning parallel sub-agents when generating tests for large codebases.

**AC-05.1**: When the codebase has 10+ modules/domains to test, the agent prompt includes instructions to use Task tool for parallel sub-agent creation.
**AC-05.2**: Each sub-agent generates tests for one module/domain independently.
**AC-05.3**: The parent agent consolidates test files and resolves any cross-module test conflicts.
**AC-05.4**: The threshold (10+ modules) is documented in the agent prompt, not hardcoded in a hook.

### FR-06: State Tracking for Parallel Execution

Test execution results in state.json must capture whether parallel mode was used.

**AC-06.1**: `phases[phase].test_results` includes a `parallel_execution` field: `{ enabled: boolean, framework: string, flag: string, workers: number }`.
**AC-06.2**: If fallback occurred, `parallel_execution` includes `fallback_triggered: true` and `flaky_tests: [list]`.
**AC-06.3**: The quality-report.md produced by Agent 16 includes a "Parallel Execution" section summarizing mode, speedup, and any flakiness detected.

---

## 5. Non-Functional Requirements

### NFR-01: Performance

- Parallel execution must achieve at minimum 2x speedup for test suites with 50+ independent test files.
- No individual test should be slower due to parallel execution overhead.

### NFR-02: Compatibility

- Must work with the project's existing test runner (no new dependencies required for basic parallelism).
- For frameworks requiring plugins (e.g., `pytest-xdist`), agent should check if the plugin is installed and suggest installation if not.

### NFR-03: Reliability

- Parallel execution must not introduce false positives (tests that pass sequentially must not be reported as failures).
- The fallback mechanism must be deterministic -- same flaky test set identified on each run.

### NFR-04: Simplicity (Article V)

- Changes are prompt-only (agent .md files). No new hooks, no new CJS modules, no new dependencies.
- The parallel execution lookup table is embedded in agent prompts, not in a separate config file.

---

## 6. Constraints

- **Article XII**: No new CJS modules needed -- changes are to agent .md files (not hooks).
- **Article V**: No new runtime dependencies. Parallel flags use built-in framework capabilities.
- **Article X**: Fail-safe -- if parallel detection fails, sequential execution is the default.
- **Article II**: Tests for the changes themselves are prompt-level (the agents are .md files, tested via E2E workflow execution).

---

## 7. Out of Scope

- Distributed test execution across multiple machines (only local parallelism).
- Test sharding strategies (splitting test files across CI matrix jobs).
- Custom parallel execution orchestration hooks.
- Modifying the hook system or state.json schema beyond adding the `parallel_execution` field to test_results.
