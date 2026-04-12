# Test Strategy: GH-251 Track 1 — Task-Level Dispatch for test-generate

**Requirement**: REQ-GH-251-task-dispatch-test-generate-upgrade
**Phase**: 05 - Test Strategy
**Date**: 2026-04-12

---

## Existing Infrastructure (from test evaluation)

- **Framework**: `node --test` (Node.js built-in test runner)
- **Assertion**: `node:assert/strict`
- **Coverage Tool**: None (no c8/istanbul; coverage is aspirational)
- **Current Coverage**: ~85% estimated
- **Existing Patterns**: Prompt verification tests read `.md` and `.json` files and assert content patterns. Core module tests use fixtures in `tests/core/*/fixtures/`. Test IDs follow prefix conventions (e.g., `TD-` for task dispatcher, `TLD-` for task-level dispatch, `TST-` for test-generate scaffold tests).

## Strategy for This Requirement

- **Approach**: Extend existing prompt verification test suite. All changes in GH-251 are to agent markdown files (`isdlc.md`, `04-test-design-engineer.md`) and JSON config (`workflows.json`) plus one new markdown file (`test-generate.md`). There is no JavaScript source code to unit test. The appropriate test type is **prompt content verification** — reading the modified files and asserting that required content patterns exist.
- **New Test Types Needed**: Prompt verification tests for the new content in each modified file. Config validation test for the `workflows.json` `agent_modifiers` addition.
- **Coverage Target**: 100% requirement-to-test traceability (all 6 FRs, all 6 ACs covered by at least one test case).

## Test Pyramid

Given that GH-251's changes are purely agent markdown and JSON configuration (zero JavaScript source code changes), the test pyramid is inverted from a typical code change:

| Layer | Count | Rationale |
|-------|-------|-----------|
| **Prompt verification** (content assertions) | 12 | Primary test type — validates content patterns in `.md` and `.json` files |
| **Config validation** (schema/structure) | 3 | Validates `workflows.json` structural changes |
| **Unit tests** | 0 | No JS code changes — `task-dispatcher.js`, `task-reader.js` are explicitly out of scope (NFR-002) |
| **Integration tests** | 0 | No runtime behavior changes — all changes are agent prompt content |
| **E2E tests** | 0 | Full workflow E2E is a known gap (test-evaluation-report.md Gap #3) — out of scope for this change |

**Justification for zero unit/integration tests**: FR-005 explicitly requires "no modifications to task-dispatcher.js or task-reader.js." The existing `shouldUseTaskDispatch()` tests in `tests/core/tasks/task-dispatcher.test.js` (TD-11 through TD-13) already verify the dispatch infrastructure works when `tasks.md` exists with sufficient tasks. GH-251 does not change that infrastructure — it adds agent-level behavior (markdown content) that produces `tasks.md` as output.

## Flaky Test Mitigation

- **File reading**: Tests use `readFileSync()` with a file cache to avoid repeated I/O. Files are read once per test suite run.
- **Pattern matching**: Assertions use `String.includes()` for content verification rather than exact string matching, making tests resilient to formatting changes.
- **No external dependencies**: Tests have zero network, database, or process dependencies. All assertions are against local files checked into the repository.
- **Deterministic**: No randomness, no timing-dependent behavior, no parallel execution concerns.

## Performance Test Plan

Not applicable for this change. All modifications are to static markdown and JSON configuration files. There are no runtime performance implications. NFR-001 (precondition gate completes in under 2 seconds) is a behavioral property of the glob scan that the agent will perform at runtime — it cannot be tested in a prompt verification context.

## Test Commands (use existing)

- **Run these tests**: `node --test tests/prompt-verification/test-generate-dispatch-gh251.test.js`
- **Run all prompt verification tests**: `node --test tests/prompt-verification/*.test.js`
- **Run full suite**: `npm run test:all`

## Task-to-Test Traceability

| Task | File Under Test | Test File | Traces | Scenarios |
|------|----------------|-----------|--------|-----------|
| T002 | src/claude/commands/isdlc.md | tests/prompt-verification/test-generate-dispatch-gh251.test.js | FR-001, AC-001-01 | Precondition gate references characterization glob, blocks when no scaffolds, directs to /discover |
| T003 | src/claude/commands/isdlc.md | tests/prompt-verification/test-generate-dispatch-gh251.test.js | FR-002, AC-002-01 | Artifact folder creation with TEST-GEN- prefix, meta.json with v2 schema |
| T004 | src/isdlc/config/workflows.json | tests/prompt-verification/test-generate-dispatch-gh251.test.js | FR-003, FR-005, AC-005-01 | workflow_type modifier in agent_modifiers for test-generate |
| T005 | src/claude/agents/04-test-design-engineer.md | tests/prompt-verification/test-generate-dispatch-gh251.test.js | FR-003, FR-004, FR-006, AC-003-01, AC-004-01, AC-006-01 | TEST-GENERATE MODE section with scaffold scan, classification, tier ordering, artifact output |
| T007 | src/providers/codex/projections/test-generate.md | tests/prompt-verification/test-generate-dispatch-gh251.test.js | FR-001-FR-006 | Codex projection with precondition check, WORKFLOW_TYPE, tier dispatch |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stale content expectations | Tests break on unrelated formatting changes | Use partial `includes()` assertions on key phrases, not exact paragraphs |
| Missing test-generate.md at test time | Tests fail because Codex projection file doesn't exist yet | Use `existsSync()` guard — skip T007 tests gracefully if file not yet created |
| Classification heuristic not testable via prompt verification | Cannot validate unit/system classification accuracy | Document as known limitation — classification is agent behavior, tested via E2E workflow |
