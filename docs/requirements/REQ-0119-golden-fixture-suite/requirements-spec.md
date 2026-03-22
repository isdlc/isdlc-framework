# Requirements Specification: Golden Fixture Suite

**Item**: REQ-0119 | **GitHub**: #183 | **CODEX**: CODEX-050 | **Phase**: 9 | **Workstream**: A
**Status**: Analyzed | **Depends on**: REQ-0114, REQ-0090

---

## 1. Business Context

Core model functions (state transitions, resume point computation, migration) lack representative test fixtures. A golden fixture suite provides known-good input/output pairs for every workflow type, enabling deterministic validation of core logic without full agent execution.

## 2. Functional Requirements

### FR-001: Fixture Projects
- **AC-001-01**: Representative state.json + meta.json snapshots exist for each of the following workflow types: discover_existing, feature, fix, test_generate, test_run, upgrade, analyze, implementation_loop, quality_loop.
- **AC-001-02**: Each fixture is a self-contained directory under `tests/verification/fixtures/`.
- **AC-001-03**: Nine fixture directories total, one per workflow type.

### FR-002: Fixture Contents
- **AC-002-01**: Each fixture directory contains `initial-state.json` — the starting state before the workflow step.
- **AC-002-02**: Each fixture directory contains `context.json` — input context describing the workflow action.
- **AC-002-03**: Each fixture directory contains `expected.json` — expected output including `expected_artifacts` (file name list) and `expected_state_mutations` (field paths and values).

### FR-003: Golden Test Runner
- **AC-003-01**: A test file `tests/verification/golden.test.js` loads each fixture, applies core model functions (migrateState, computeResumePoint, etc.), and validates output matches `expected.json`.
- **AC-003-02**: Test runner is approximately 150 lines.
- **AC-003-03**: Tests are runnable via `node --test tests/verification/golden.test.js`.

## 3. Out of Scope

- Full workflow execution (fixtures test state transitions, not agent behavior)
- Agent prompt generation or LLM interaction

## 4. MoSCoW

FR-001, FR-002, FR-003: **Must Have**.
