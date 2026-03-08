# Test Strategy: Workflow Recovery (Retry + Rollback)

**Requirements**: REQ-0051 (Retry/Redo) + REQ-0052 (Rollback)
**Last Updated**: 2026-03-08
**Phase**: 05-test-strategy

---

## Existing Infrastructure (from test evaluation)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion Library**: `node:assert/strict`
- **Test Pattern**: CommonJS `.test.cjs` files in `src/claude/hooks/tests/`
- **Hook Test Pattern**: `spawnSync`/`execSync` to run hook scripts with controlled stdin/env
- **Antigravity Script Pattern**: Direct `require()` of shared libs (`common.cjs`, `state-logic.cjs`)
- **Existing Coverage**: state-write-validator.test.cjs covers V8 `checkPhaseFieldProtection` (supervised_review exception path)
- **Conventions**: `setupTestEnv()` creates tmpDir with `.isdlc/` structure; `writeStateFile()` writes mock state; cleanup in `afterEach`

## Strategy for This Requirement

- **Approach**: Extend existing test suite (NOT replace)
- **New Test Files**: 3 new `.test.cjs` files + extend 1 existing file
- **Coverage Target**: >=80% line coverage (per Article II constitution)
- **Critical Paths**: 100% coverage for state mutation logic (retry count, phase reset, V8 exception)

## Test Commands (use existing)

- Unit/Integration: `node --test src/claude/hooks/tests/workflow-retry.test.cjs src/claude/hooks/tests/workflow-rollback.test.cjs src/claude/hooks/tests/v8-recovery-action.test.cjs src/claude/hooks/tests/workflow-recovery-integration.test.cjs`
- All hooks: `node --test src/claude/hooks/tests/*.test.cjs`

---

## Test Pyramid

### Distribution

| Test Type | Count | Percentage | Scope |
|-----------|-------|------------|-------|
| Unit | 48 | 63% | Individual functions: retry logic, rollback logic, V8 exception, arg parsing, validation |
| Integration | 20 | 26% | Cross-module: retry script + state-logic V8, rollback script + state-logic V8, recovery action lifecycle |
| E2E | 8 | 11% | Full script execution: spawn retry/rollback scripts as child processes with real state.json |
| **Total** | **76** | **100%** | |

### Rationale

- **Heavy unit layer (63%)**: The retry and rollback scripts are pure state manipulation functions. Most logic (arg parsing, validation, state clearing, count tracking) is independently testable.
- **Solid integration layer (26%)**: The critical interaction is between recovery scripts and `state-logic.cjs` V8 (`checkPhaseFieldProtection`). The `recovery_action` flag must be recognized by V8 to allow regression.
- **Focused E2E layer (11%)**: Spawn actual scripts with `spawnSync`, verify exit codes, stdout JSON structure, and disk state changes. Matches the existing `workflow-finalizer.test.cjs` pattern.

---

## Test File Organization

| Test File | Module Under Test | Test Type | Count |
|-----------|-------------------|-----------|-------|
| `workflow-retry.test.cjs` | `workflow-retry.cjs` | Unit + E2E | 24 |
| `workflow-rollback.test.cjs` | `workflow-rollback.cjs` | Unit + E2E | 32 |
| `v8-recovery-action.test.cjs` | `state-logic.cjs` (V8 extension) | Unit | 12 |
| `workflow-recovery-integration.test.cjs` | Cross-module interactions | Integration | 8 |

All files placed in `src/claude/hooks/tests/` following existing conventions.

---

## Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| Temp directory cleanup failures | Use `fs.rmSync(tmpDir, { recursive: true, force: true })` in `afterEach` (existing pattern) |
| Timestamp-dependent assertions | Assert ISO-8601 format with regex, not exact value |
| File system race conditions | Each test gets its own `fs.mkdtempSync` directory (no shared state) |
| Process spawn timing | Use `spawnSync` (synchronous) with 5000ms timeout (existing pattern) |
| State version arithmetic | Capture disk version before operation, assert `version === captured + 1` |

---

## Performance Test Plan

| Aspect | Target | Method |
|--------|--------|--------|
| Script execution time | < 200ms per invocation | `spawnSync` with 5000ms timeout; measure wall clock |
| State file read/write | < 50ms for 100KB state.json | Create oversized state fixture, time read-modify-write cycle |
| Test suite total time | < 30s for all 76 tests | Run with `--test-concurrency=4` |

No dedicated performance test file needed -- timing assertions embedded in E2E tests via `spawnSync` result timing.

---

## Coverage Strategy

### Critical Paths (100% coverage required)

1. **Retry state clearing**: `test_iteration`, `constitutional_validation`, `interactive_elicitation` must all be cleared
2. **Rollback multi-phase reset**: Target phase set to `in_progress`, all subsequent phases set to `pending`
3. **V8 recovery_action exception**: Both `retry` and `rollback` types bypass index and status regression blocking
4. **Error paths**: No active workflow, invalid target phase, forward rollback attempt, current phase rollback
5. **Count tracking**: `retry_count` increment, `rollback_count` increment, neither blocks gate

### Secondary Paths (>=80% coverage)

1. **Feedback output structure**: JSON fields present and correctly formatted
2. **Arg parsing**: `--to-phase`, `--confirm` flags
3. **State version bumping**: Atomic increment
4. **Recovery action lifecycle**: Set on operation, cleared after re-advancement

---

## Test Data Strategy

See `test-data-plan.md` for detailed fixture definitions.

Key fixtures:
- `baseWorkflowState`: Active workflow in Phase 06 with prior phases completed
- `noWorkflowState`: State with no `active_workflow`
- `lightModeState`: Workflow with subset of phases (00, 01, 05, 06, 16, 08)
- `retriedPhaseState`: Phase with existing `retry_count` to test increment
- `multiRollbackState`: Workflow with existing `rollback_count` to test increment
- `completedWorkflowState`: All phases completed, no `active_workflow`
