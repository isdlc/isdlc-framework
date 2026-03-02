# Test Strategy: Phase Handshake Audit Fixes

**Requirement ID**: REQ-0020
**Source**: GitHub Issue #55
**Phase**: 05-test-strategy
**Generated**: 2026-02-20
**Based On**: requirements-spec.md (6 REQs, 24 ACs), module-design.md (26 test cases), impact-analysis.md, architecture-overview.md
**Artifact Folder**: `phase-handshake-audit-GH-55`

---

## Table of Contents

1. [Test Plan: AC-to-Test-Case Mapping](#1-test-plan-ac-to-test-case-mapping)
2. [Test Architecture](#2-test-architecture)
3. [Test Execution Order](#3-test-execution-order)
4. [Coverage Targets](#4-coverage-targets)
5. [Test Data: State.json Fixtures](#5-test-data-statejson-fixtures)
6. [Regression Strategy](#6-regression-strategy)
7. [Traceability Matrix](#7-traceability-matrix)
8. [Validation Checklist (GATE-05)](#8-validation-checklist-gate-05)

---

## 1. Test Plan: AC-to-Test-Case Mapping

### 1.1 REQ-001: V9 Cross-Location Consistency Check (6 ACs, 10 Tests)

| AC | AC Description | Test ID(s) | Test Name | Verification Method |
|----|---------------|------------|-----------|-------------------|
| AC-001a | V9-A warns on `phases[].status` vs `phase_status[]` divergence, write NOT blocked | T-V9-02 | Warn when phases[N].status diverges from phase_status[N] | Assert stderr contains `V9-A WARNING` with both status values; assert stdout empty (no block) |
| AC-001b | V9-B warns on `current_phase` vs `aw.current_phase` divergence, write NOT blocked | T-V9-04 | Warn when current_phase diverges from aw.current_phase | Assert stderr contains `V9-B WARNING`; assert stdout empty |
| AC-001c | V9-C suppresses warning for intermediate state (index one ahead) | T-V9-05, T-V9-06 | No warning for intermediate state / Warn for genuine mismatch | T-V9-05: assert NO `V9-C` in stderr; T-V9-06: assert `V9-C WARNING` in stderr |
| AC-001d | V9 emits no warnings and does not crash when `active_workflow` is missing or null | T-V9-07, T-V9-08 | No warning when active_workflow missing / No warning when phases missing | Assert stderr does NOT contain any V9 warnings; assert exitCode 0 |
| AC-001e | V9 reads from disk on Edit events and performs same checks | T-V9-09 | V9 runs on Edit events (reads from disk) | Write divergent state to disk; send Edit stdin; assert stderr contains `V9-A WARNING` |
| AC-001f | V9 silently returns on malformed JSON content | T-V9-10 | Fail-open on malformed JSON content | Send Write stdin with `content: "not valid json {"` ; assert exitCode 0, no V9 warnings |

**Supplemental negative tests** (verify V9 does NOT warn when fields are consistent):

| Test ID | Test Name | Verification |
|---------|-----------|-------------|
| T-V9-01 | No warning when phases[N].status matches phase_status[N] | Assert stderr does NOT contain `V9-A` |
| T-V9-03 | No warning when current_phase matches aw.current_phase | Assert stderr does NOT contain `V9-B` |
| T-V9-05 | No warning when phases[index] matches current_phase | Assert stderr does NOT contain `V9-C` |

### 1.2 REQ-002: V8 phases[].status Coverage + Deprecation (4 ACs, 3+ Tests)

| AC | AC Description | Test ID(s) | Test Name | Verification Method |
|----|---------------|------------|-----------|-------------------|
| AC-002a | V8 blocks `phases[].status` regression `completed -> pending` | T-SR-04, T-MP-03 (inverse) | V8 blocks non-redo status regression / Forward transition allowed | T-SR-04: assert stdout contains `"continue":false`; T-MP-03: assert stdout empty (forward allowed) |
| AC-002b | V8 allows `phases[].status` regression with `supervised_review.status = "redo_pending"` | T-SR-01 | Redo preserves started_at | Assert stdout empty (no block); assert V8 does not produce block message |
| AC-002c | V8 allows forward transition `pending -> in_progress` | T-MP-03 | Forward transition pending to in_progress is allowed by V8 | Assert stdout empty (forward transitions never blocked) |
| AC-002d | `isdlc.md` contains deprecation comments on `phase_status` write lines | -- | Manual verification | Inspect `isdlc.md` for `<!-- DEPRECATED (INV-0055)` comments at 4 locations (STEP 3c-prime step 4, STEP 3e step 5, STEP 3e-review Case D steps h.ii and j) |

### 1.3 REQ-003: V8 Supervised Redo Exception (4 ACs, 4 Tests)

| AC | AC Description | Test ID(s) | Test Name | Verification Method |
|----|---------------|------------|-----------|-------------------|
| AC-003a | V8 allows `phase_status` regression `completed -> in_progress` with `redo_pending` | T-SR-01 | Redo preserves started_at | Assert stdout empty (no V8 block) |
| AC-003b | V8 blocks `phase_status` regression `completed -> in_progress` without redo marker | T-SR-04 | V8 blocks non-redo status regression | Assert stdout contains `"continue":false` with regression message |
| AC-003c | V8 allows with `redo_count > 0` (alternative redo marker) | T-SR-02 | Redo increments retries | Assert stdout empty; `redo_count > 0` state triggers redo exception |
| AC-003d | V8 blocks `completed -> pending` even with redo marker (only `-> in_progress` allowed) | T-SR-04 (extended) | Block completed -> pending even with redo | Assert stdout contains `"continue":false`; redo exception is narrow |

### 1.4 REQ-004: Missing Integration Tests (4 ACs, 16 Tests)

| AC | AC Description | Test ID(s) | Test Name | Verification Method |
|----|---------------|------------|-----------|-------------------|
| AC-004a | Supervised redo preserves `timing.started_at` and V8 allows | T-SR-01, T-SR-02, T-SR-03 | Redo preserves started_at / Redo increments retries / Redo clears completed_at | Assert `started_at` unchanged in incoming state; assert V8 does not block |
| AC-004b | Phase N+1 delegation blocked when N+1 is `pending` | T-MP-01 | Phase N completed, N+1 pending blocks delegation | Assert phase-loop-controller blocks or warns about delegation to pending phase |
| AC-004c | Crash recovery re-delegation allowed when Phase N stuck `in_progress` | T-DW-01 | Phase stuck in_progress allows re-delegation | Assert phase-loop-controller allows re-delegation to in_progress phase |
| AC-004d | Escalation entry contains required fields (`type`, `hook`, `phase`, `detail`, `timestamp`) | T-ER-02 | Escalation contains required fields | Assert escalation object in gate-blocker output contains all 5 fields |

### 1.5 REQ-005: Configuration Loader Consolidation (4 ACs, Regression)

| AC | AC Description | Test ID(s) | Test Name | Verification Method |
|----|---------------|------------|-----------|-------------------|
| AC-005a | Hook uses `ctx.requirements` or `common.cjs` fallback (not local function) | Existing tests | gate-blocker-phase-status-bypass.test.cjs, gate-blocker-inconsistent-behavior.test.cjs | Run existing gate-blocker test suites; all pass |
| AC-005b | Standalone execution uses `common.cjs` and loads successfully | Existing tests | Standalone execution test in gate-blocker tests | Verify standalone `require.main === module` path works |
| AC-005c | Local config loader functions are removed | Code review | Manual verification | Confirm lines 35-53 and 58-76 of gate-blocker.cjs are deleted; lines 83-101 of iteration-corridor.cjs are deleted |
| AC-005d | All existing gate-blocker tests pass after removal | Existing tests | All gate-blocker test files | Run: `node --test src/claude/hooks/tests/gate-blocker-*.test.cjs` |

### 1.6 REQ-006: Stale Phase Detection (4 ACs, Manual)

| AC | AC Description | Test ID(s) | Test Name | Verification Method |
|----|---------------|------------|-----------|-------------------|
| AC-006a | Stale warning displayed when elapsed > 2x timeout | -- | Manual verification | Prompt-level change; verify `isdlc.md` STEP 3b contains stale detection logic with 2x threshold |
| AC-006b | No warning when elapsed within timeout | -- | Manual verification | Logic check: `elapsed_minutes > timeout * 2` evaluates false for elapsed=60, timeout=120 |
| AC-006c | Same Retry/Skip/Cancel options as existing escalation handler | -- | Manual verification | Verify `AskUserQuestion` options in STEP 3b-stale match [R] Retry / [S] Skip / [C] Cancel |
| AC-006d | No warning for completed phases | -- | Manual verification | Logic check: stale detection only fires when `status === "in_progress"` |

---

## 2. Test Architecture

### 2.1 Existing Test Infrastructure

The project has a well-established test infrastructure that all new tests MUST follow:

| Aspect | Convention |
|--------|-----------|
| **Test runner** | `node:test` (built-in Node.js test runner) |
| **Module system** | CommonJS (`.cjs` extension) |
| **Assertion library** | `node:assert/strict` |
| **Hook invocation pattern** | `spawnSync('node', [hookPath], { input: stdinStr, cwd: tmpDir, ... })` |
| **Temp directory pattern** | `fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-'))` with `fs.rmSync` in `afterEach` |
| **State file pattern** | Write to `tmpDir/.isdlc/state.json` via `writeStateFile()` helper |
| **Stdin format** | JSON: `{ tool_name: 'Write', tool_input: { file_path, content } }` |
| **Block assertion** | `result.stdout.includes('"continue":false')` or `'"continue": false'` |
| **Warning assertion** | `result.stderr.includes('[state-write-validator] WARNING')` |
| **Test location** | `src/claude/hooks/tests/` |
| **Naming convention** | `{feature-name}.test.cjs` (kebab-case) |
| **Run command** | `node --test src/claude/hooks/tests/{file}.test.cjs` |
| **Run all** | `node --test src/claude/hooks/tests/*.test.cjs` |

### 2.2 Five Test Files: Organization

```
src/claude/hooks/tests/
  v9-cross-location-consistency.test.cjs     (10 tests) -- REQ-001
  supervised-review-redo-timing.test.cjs     (4 tests)  -- REQ-003 + REQ-004 TS-003
  multi-phase-boundary.test.cjs              (4 tests)  -- REQ-004 TS-005
  dual-write-error-recovery.test.cjs         (4 tests)  -- REQ-004 TS-008
  escalation-retry-flow.test.cjs             (4 tests)  -- REQ-004 TS-004
```

### 2.3 Shared Helpers

Each test file defines its own helper functions (matching the existing project convention where each test file is self-contained). The following helpers appear in every file:

```javascript
// Standard imports (every file)
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Hook path resolution (per-file)
const HOOK_PATH = path.join(__dirname, '..', '{hook-name}.cjs');

// Standard setup/teardown
function setupTestEnv() { ... }
function writeStateFile(tmpDir, state) { ... }
function runHook(tmpDir, stdinJson) { ... }
function makeWriteStdinWithContent(filePath, content) { ... }
```

**Why not a shared helper module?** The existing tests do NOT use a shared helper. Each test file defines its own `setupTestEnv`, `writeStateFile`, `runHook`, and `makeWriteStdinWithContent` locally. This avoids cross-file dependencies and makes each test file independently runnable. New tests follow this same convention.

### 2.4 Setup and Teardown Patterns

**Standard pattern** (used by v9, supervised-review-redo-timing, multi-phase-boundary, dual-write-error-recovery):

```javascript
describe('Test Suite Name', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = setupTestEnv(); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });
    // ... tests
});
```

`setupTestEnv()` creates:
```
tmpDir/
  .isdlc/
    state.json  (written per-test by writeStateFile)
```

**Extended pattern** (used by escalation-retry-flow -- tests gate-blocker which needs config files):

```javascript
function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esc-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    // gate-blocker needs config files
    const configDir = path.join(tmpDir, '.claude', 'hooks', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const srcConfigDir = path.join(__dirname, '..', 'config');
    for (const file of ['iteration-requirements.json', 'skills-manifest.json']) {
        const srcPath = path.join(srcConfigDir, file);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(configDir, file));
        }
    }
    const schemasDir = path.join(configDir, 'schemas');
    const srcSchemasDir = path.join(srcConfigDir, 'schemas');
    if (fs.existsSync(srcSchemasDir)) {
        fs.mkdirSync(schemasDir, { recursive: true });
        for (const f of fs.readdirSync(srcSchemasDir)) {
            fs.copyFileSync(path.join(srcSchemasDir, f), path.join(schemasDir, f));
        }
    }
    return tmpDir;
}
```

### 2.5 Hook Stdin Protocol

All hooks receive JSON on stdin and respond via stdout/stderr:

| Output | Meaning |
|--------|---------|
| stdout: `""` (empty) | Hook allows the operation (no block) |
| stdout: `{ "continue": false, "stopReason": "..." }` | Hook blocks the operation |
| stderr: `[hook-name] WARNING: ...` | Advisory warning (operation allowed) |
| stderr: `[hook-name] V8 BLOCK: ...` | Block diagnostic (stdout has the block response) |

### 2.6 Test File to Hook Mapping

| Test File | Primary Hook Tested | Secondary Hook Tested |
|-----------|--------------------|-----------------------|
| `v9-cross-location-consistency.test.cjs` | `state-write-validator.cjs` | -- |
| `supervised-review-redo-timing.test.cjs` | `state-write-validator.cjs` | -- |
| `multi-phase-boundary.test.cjs` | `state-write-validator.cjs` | `phase-loop-controller.cjs` |
| `dual-write-error-recovery.test.cjs` | `state-write-validator.cjs` | `phase-loop-controller.cjs` |
| `escalation-retry-flow.test.cjs` | `gate-blocker.cjs` | `state-write-validator.cjs` |

---

## 3. Test Execution Order

### 3.1 Execution Batches (Matching Implementation Batches)

Tests are organized into three execution batches that mirror the implementation batches from the module design. Tests within a batch can run in any order, but batches themselves must run sequentially.

**Batch 1: V8/V9 Changes + Tests** (Steps 1-10 from module design)

After implementing REQ-003 (redo exception), REQ-002 (V8 Check 3), and REQ-001 (V9):

| Step | Action | Command |
|------|--------|---------|
| 1 | Run existing state-write-validator tests (regression check) | `node --test src/claude/hooks/tests/state-write-validator.test.cjs` |
| 2 | Run existing null-safety tests (regression check) | `node --test src/claude/hooks/tests/state-write-validator-null-safety.test.cjs` |
| 3 | Create and run V9 tests | `node --test src/claude/hooks/tests/v9-cross-location-consistency.test.cjs` |
| 4 | Create and run supervised redo tests | `node --test src/claude/hooks/tests/supervised-review-redo-timing.test.cjs` |
| 5 | Create and run multi-phase boundary tests | `node --test src/claude/hooks/tests/multi-phase-boundary.test.cjs` |
| 6 | Create and run dual-write error recovery tests | `node --test src/claude/hooks/tests/dual-write-error-recovery.test.cjs` |
| 7 | Create and run escalation retry tests | `node --test src/claude/hooks/tests/escalation-retry-flow.test.cjs` |
| 8 | Run ALL tests together | `node --test src/claude/hooks/tests/state-write-validator*.test.cjs src/claude/hooks/tests/v9-*.test.cjs src/claude/hooks/tests/supervised-*.test.cjs src/claude/hooks/tests/multi-*.test.cjs src/claude/hooks/tests/dual-*.test.cjs src/claude/hooks/tests/escalation-*.test.cjs` |

**Batch 2: Config Loader Consolidation** (Steps 11-13 from module design)

After removing local config loaders from gate-blocker.cjs and iteration-corridor.cjs:

| Step | Action | Command |
|------|--------|---------|
| 9 | Run existing gate-blocker tests (regression check) | `node --test src/claude/hooks/tests/gate-blocker-*.test.cjs` |
| 10 | Run cross-hook integration tests | `node --test src/claude/hooks/tests/cross-hook-integration.test.cjs` |
| 11 | Run artifact paths config tests | `node --test src/claude/hooks/tests/artifact-paths-config-fix.test.cjs` |

**Batch 3: Prompt Specification Changes** (Steps 14-15 from module design)

After adding deprecation comments and stale phase detection to `isdlc.md`:

| Step | Action | Command |
|------|--------|---------|
| 12 | Manual verification of deprecation comments in isdlc.md | Inspect 4 locations for `<!-- DEPRECATED (INV-0055)` |
| 13 | Manual verification of stale phase detection in isdlc.md STEP 3b | Inspect STEP 3b-stale block |

### 3.2 Dependency-Driven Test Ordering Within Batch 1

The implementation order within Batch 1 creates test dependencies:

```
REQ-003 (redo exception)  -->  tests T-SR-01..T-SR-04  -->  REQ-002 (V8 Check 3)
                                                               |
                               tests T-MP-01..T-MP-04  <------+
                                                               |
REQ-001 (V9)  ----------->  tests T-V9-01..T-V9-10            |
                                                               |
                               tests T-DW-01..T-DW-04  <------+
                                                               |
(independent)  ----------->  tests T-ER-01..T-ER-04
```

**Critical constraint**: `supervised-review-redo-timing.test.cjs` tests MUST be written after REQ-003 is implemented (they test the redo exception). `multi-phase-boundary.test.cjs` tests MUST be written after REQ-002 is implemented (they test V8 Check 3 forward transitions).

### 3.3 Full Regression Run

After all batches are complete, run the full test suite to verify no cross-cutting regressions:

```bash
node --test src/claude/hooks/tests/*.test.cjs
```

Expected: All existing tests pass plus all 26 new tests pass.

---

## 4. Coverage Targets

### 4.1 Per-File Coverage Requirements

| Test File | Test Count | REQ Coverage | AC Coverage | Priority |
|-----------|-----------|-------------|-------------|----------|
| `v9-cross-location-consistency.test.cjs` | 10 | REQ-001 (100%) | AC-001a through AC-001f (100%) | Must Have |
| `supervised-review-redo-timing.test.cjs` | 4 | REQ-003 (100%), REQ-004/TS-003 (100%) | AC-003a,b,c,d + AC-004a (100%) | Must Have |
| `multi-phase-boundary.test.cjs` | 4 | REQ-004/TS-005 (100%) | AC-004b (100%) | Must Have |
| `dual-write-error-recovery.test.cjs` | 4 | REQ-004/TS-008 (100%) | AC-004c (100%) | Must Have |
| `escalation-retry-flow.test.cjs` | 4 | REQ-004/TS-004 (100%) | AC-004d (100%) | Must Have |

### 4.2 Acceptance Criteria Coverage Summary

| Total ACs | Automated Tests | Manual Verification | Code Review |
|-----------|----------------|--------------------| ------------|
| 24 | 16 (AC-001a through AC-004d) | 4 (AC-006a through AC-006d) | 4 (AC-005a through AC-005d) |

**Coverage percentage**: 24/24 = 100% (all ACs have a defined verification method)

### 4.3 Code Path Coverage Targets

For the modified functions in `state-write-validator.cjs`:

| Function | Target | Rationale |
|----------|--------|-----------|
| `checkCrossLocationConsistency()` (V9) | 100% branch coverage | New function, all branches testable |
| `checkPhaseFieldProtection()` Check 3 (V8) | 100% branch coverage | Mirrors Check 2 which has 100% coverage |
| V8 redo exception (in Check 2 and Check 3) | 100% branch coverage | 4 criteria (redo_pending, redo_count, correct direction, wrong direction) |
| `check()` V9 integration | Line coverage only | V9 invocation and warning accumulation |

### 4.4 Test Type Distribution

| Test Type | Count | Files |
|-----------|-------|-------|
| Unit (single hook, single scenario) | 18 | v9-*, supervised-* |
| Integration (cross-hook) | 8 | multi-phase-*, dual-write-*, escalation-* |
| Regression (existing behavior preserved) | Existing suite (~70+ tests) | state-write-validator.test.cjs, null-safety.test.cjs, gate-blocker-*.test.cjs |
| Manual verification | 4 | isdlc.md inspection |

---

## 5. Test Data: State.json Fixtures

### 5.1 Base State Fixture (Used by V9 Tests)

All V9 tests start from a consistent base state representing a mid-workflow execution at Phase 03 (architecture).

```javascript
const baseState = {
    state_version: 10,
    current_phase: '03-architecture',
    phases: {
        '01-requirements': {
            status: 'completed',
            constitutional_validation: { completed: true, iterations_used: 1 }
        },
        '02-impact-analysis': {
            status: 'completed',
            constitutional_validation: { completed: true, iterations_used: 1 }
        },
        '03-architecture': {
            status: 'in_progress',
            constitutional_validation: { completed: false }
        }
    },
    active_workflow: {
        type: 'feature',
        current_phase: '03-architecture',
        current_phase_index: 2,
        phases: [
            '01-requirements',
            '02-impact-analysis',
            '03-architecture',
            '04-design'
        ],
        phase_status: {
            '01-requirements': 'completed',
            '02-impact-analysis': 'completed',
            '03-architecture': 'in_progress'
        }
    }
};
```

### 5.2 V9 Divergent State Variants

Each V9 test mutates the base state to introduce a specific divergence:

| Test ID | Mutation from Base | Expected Warning |
|---------|-------------------|-----------------|
| T-V9-01 | None (consistent) | None |
| T-V9-02 | Set `phases['03-architecture'].status = 'completed'` but keep `phase_status['03-architecture'] = 'in_progress'` | `V9-A WARNING: Phase status divergence for '03-architecture'` |
| T-V9-03 | None (current_phase consistent) | None |
| T-V9-04 | Set `current_phase = '03-architecture'` but `aw.current_phase = '04-design'` | `V9-B WARNING: Current phase divergence` |
| T-V9-05 | Set `index=2`, `phases[2]='03-architecture'`, `current_phase='03-architecture'` (consistent) | None |
| T-V9-06 | Set `index=2`, `phases[2]='03-architecture'`, `current_phase='04-design'` AND `phases[1] != '04-design'` (genuine mismatch) | `V9-C WARNING: Phase index mismatch` |
| T-V9-07 | Remove `active_workflow` entirely | None (fail-open) |
| T-V9-08 | Remove `phases` entirely | None (fail-open) |
| T-V9-09 | Same divergence as T-V9-02 but sent as Edit event | `V9-A WARNING` (read from disk) |
| T-V9-10 | Send malformed JSON as Write content | None (fail-open) |

### 5.3 V9-C Intermediate State Fixture (Suppression Test)

The intermediate state between STEP 3e and STEP 3c-prime where index is one ahead of current_phase. This is suppressed by V9-C.

```javascript
const intermediateState = {
    state_version: 11,
    current_phase: '03-architecture',
    phases: {
        '03-architecture': { status: 'completed' },
        '04-design': { status: 'pending' }
    },
    active_workflow: {
        type: 'feature',
        current_phase: '03-architecture',    // Still at 03
        current_phase_index: 3,               // Already incremented to 04-design index
        phases: [
            '01-requirements',
            '02-impact-analysis',
            '03-architecture',
            '04-design'
        ],
        phase_status: {
            '03-architecture': 'completed',
            '04-design': 'pending'
        }
    }
};
// V9-C: phases[3] = '04-design' != current_phase = '03-architecture'
// BUT phases[2] = '03-architecture' == current_phase = '03-architecture'
// => Intermediate state, suppress warning
```

### 5.4 Supervised Redo Fixture (Used by Redo Tests)

Represents a completed phase about to be redone via supervised review.

```javascript
function makeRedoState() {
    return {
        state_version: 6,
        current_phase: '03-architecture',
        phases: {
            '03-architecture': {
                status: 'completed',
                timing: {
                    started_at: '2026-02-19T10:00:00Z',
                    completed_at: '2026-02-19T10:30:00Z',
                    wall_clock_minutes: 30,
                    retries: 0
                },
                constitutional_validation: { completed: true, iterations_used: 1 }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: '03-architecture',
            current_phase_index: 2,
            phase_status: { '03-architecture': 'completed' },
            supervised_review: {
                phase: '03-architecture',
                status: 'redo_pending',
                redo_count: 1
            }
        }
    };
}
```

**Redo incoming state** (what the orchestrator writes to reset the phase):

```javascript
function makeRedoIncoming(diskState) {
    const incoming = JSON.parse(JSON.stringify(diskState));
    incoming.state_version = diskState.state_version + 1;
    incoming.phases['03-architecture'].status = 'in_progress';
    incoming.phases['03-architecture'].timing.completed_at = null;
    incoming.phases['03-architecture'].timing.wall_clock_minutes = null;
    incoming.phases['03-architecture'].timing.retries = 1;
    incoming.phases['03-architecture'].constitutional_validation = { completed: false };
    incoming.active_workflow.phase_status['03-architecture'] = 'in_progress';
    return incoming;
}
```

### 5.5 Multi-Phase Boundary Fixtures

Two fixtures representing the state after STEP 3e (Phase N completed) and after STEP 3c-prime (Phase N+1 activated).

```javascript
function makeBoundaryState(afterStep) {
    if (afterStep === '3e') {
        return {
            state_version: 6,
            current_phase: '03-architecture', // Not yet updated
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'pending' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '03-architecture',
                current_phase_index: 3, // Incremented in 3e
                phases: ['01-requirements', '02-impact-analysis',
                         '03-architecture', '04-design'],
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'pending'
                }
            }
        };
    }
    if (afterStep === '3c-prime') {
        return {
            state_version: 7,
            current_phase: '04-design',
            phases: {
                '03-architecture': { status: 'completed' },
                '04-design': { status: 'in_progress' }
            },
            active_workflow: {
                type: 'feature',
                current_phase: '04-design',
                current_phase_index: 3,
                phases: ['01-requirements', '02-impact-analysis',
                         '03-architecture', '04-design'],
                phase_status: {
                    '03-architecture': 'completed',
                    '04-design': 'in_progress'
                }
            }
        };
    }
}
```

### 5.6 Crash Recovery Fixture (Dual-Write Error Recovery)

Represents a phase stuck in_progress after an orchestrator crash.

```javascript
function makeCrashState() {
    return {
        state_version: 6,
        current_phase: '03-architecture',
        phases: {
            '03-architecture': {
                status: 'in_progress',
                timing: {
                    started_at: '2026-02-19T10:00:00Z',
                    retries: 0
                    // completed_at absent (crash before completion)
                    // wall_clock_minutes absent
                },
                constitutional_validation: { completed: false }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: '03-architecture',
            current_phase_index: 2,
            phases: ['01-requirements', '02-impact-analysis',
                     '03-architecture', '04-design'],
            phase_status: {
                '01-requirements': 'completed',
                '02-impact-analysis': 'completed',
                '03-architecture': 'in_progress'
            }
        }
    };
}
```

### 5.7 Gate-Blocked Fixture (Escalation Tests)

Represents a phase in_progress that fails gate-blocker requirements (no constitutional validation, no interactive elicitation).

```javascript
function makeGateBlockedState(phaseKey) {
    return {
        state_version: 10,
        current_phase: phaseKey,
        iteration_enforcement: { enabled: true },
        phases: {
            [phaseKey]: {
                status: 'in_progress',
                constitutional_validation: {
                    completed: false,
                    iterations_used: 0,
                    status: 'pending'
                },
                iteration_requirements: {
                    interactive_elicitation: {
                        completed: false,
                        menu_interactions: 0
                    }
                }
            }
        },
        active_workflow: {
            type: 'feature',
            current_phase: phaseKey,
            current_phase_index: 0,
            phases: [phaseKey],
            phase_status: { [phaseKey]: 'in_progress' }
        },
        pending_escalations: []
    };
}
```

### 5.8 Edge Case Fixtures

| Fixture | Description | Used By |
|---------|-------------|---------|
| Empty state (`{}`) | Empty JSON object | T-V9-07 (fail-open) |
| State with null active_workflow | `{ active_workflow: null }` | T-V9-07 variant |
| Malformed JSON string | `"not valid json {"` | T-V9-10 |
| State with unknown status values | `{ phases: { '03-arch': { status: 'unknown_value' } } }` | V8 Check 3 fail-open (ordinal undefined) |
| State with numeric status | `{ phases: { '03-arch': { status: 42 } } }` | V8 type guard check |

---

## 6. Regression Strategy

### 6.1 Existing Test Suite as Regression Guard

The existing test suite provides comprehensive regression protection for all modified files:

| File Modified | Existing Test Coverage | Test Command |
|--------------|----------------------|--------------|
| `state-write-validator.cjs` | ~70 tests (V1-V3, V7, V8) | `node --test src/claude/hooks/tests/state-write-validator.test.cjs` |
| `state-write-validator.cjs` | ~20 tests (null safety) | `node --test src/claude/hooks/tests/state-write-validator-null-safety.test.cjs` |
| `gate-blocker.cjs` | ~12 tests (phase status bypass) | `node --test src/claude/hooks/tests/gate-blocker-phase-status-bypass.test.cjs` |
| `gate-blocker.cjs` | ~8 tests (inconsistent behavior) | `node --test src/claude/hooks/tests/gate-blocker-inconsistent-behavior.test.cjs` |
| `iteration-corridor.cjs` | Covered via cross-hook integration | `node --test src/claude/hooks/tests/cross-hook-integration.test.cjs` |

### 6.2 Regression Checkpoints

The implementation agent MUST run regression tests at these checkpoints:

| Checkpoint | After | Command | Expected |
|-----------|-------|---------|----------|
| R1 | REQ-003 (redo exception added) | `node --test src/claude/hooks/tests/state-write-validator.test.cjs src/claude/hooks/tests/state-write-validator-null-safety.test.cjs` | All existing tests pass (redo exception relaxes, never tightens) |
| R2 | REQ-002 (V8 Check 3 added) | Same as R1 | All existing tests pass (Check 3 is additive, existing writes do not regress phases[].status) |
| R3 | REQ-001 (V9 added) | Same as R1 | All existing tests pass (V9 is warn-only, no blocking behavior change) |
| R4 | All new tests created | `node --test src/claude/hooks/tests/*.test.cjs` | ALL tests pass (existing + 26 new) |
| R5 | REQ-005 (config loaders removed) | `node --test src/claude/hooks/tests/gate-blocker-*.test.cjs src/claude/hooks/tests/cross-hook-integration.test.cjs` | All existing gate-blocker and cross-hook tests pass |
| R6 | Final full regression | `node --test src/claude/hooks/tests/*.test.cjs` | ALL tests pass |

### 6.3 Regression Risk Matrix

| Change | Why Existing Tests Should Still Pass | Risk If They Fail |
|--------|--------------------------------------|-------------------|
| V8 redo exception (REQ-003) | No existing test writes a state with `supervised_review` marker AND a regression. Existing tests either have forward transitions or regressions without redo markers -- both unaffected. | LOW: indicates logic error in exception condition |
| V8 Check 3 (REQ-002) | Existing tests do not write states that regress `phases[N].status` from completed to a lower ordinal. Forward transitions are allowed. | MEDIUM: indicates Check 3 has false positives on forward transitions |
| V9 (REQ-001) | V9 only writes to stderr (warnings). Existing tests that check stderr for `[state-write-validator] WARNING` use V1-V3 pattern (not V9 pattern). V9 warnings use a distinct `V9-{A|B|C} WARNING` prefix. | LOW: V9 stderr output might trigger an existing assertion that checks for ANY warning text |
| Config loader removal (REQ-005) | The removed functions are identical to `common.cjs` implementations. The fallback chain is shortened but the canonical paths are unchanged. | LOW: indicates `common.cjs` loader differs from removed local loader |

### 6.4 Specific Regression Concerns

**Concern 1: V9 warnings appearing in existing test stderr checks**

Some existing tests assert `!result.stderr.includes('[state-write-validator] WARNING')`. V9 warnings use the prefix `[state-write-validator] V9-{A|B|C} WARNING`. If an existing test uses a base state with divergent fields (phases[].status differs from phase_status[]), V9 could emit a warning that matches the `WARNING` substring.

**Mitigation**: Review existing test fixtures. If any base state has divergent phase status fields, either (a) update the fixture to be consistent, or (b) refine the assertion to check for `V1` or `V2` or `V3` specifically.

**Concern 2: V8 Check 3 blocking writes that existing tests do not expect to be blocked**

Existing V8 tests focus on `current_phase_index` and `phase_status` regression. If an existing test writes a state where `phases[N].status` regresses (but `phase_status[N]` does not), Check 3 could block unexpectedly.

**Mitigation**: Review existing V8 test fixtures to ensure `phases[N].status` is either consistent with `phase_status[N]` or only moves forward. This is likely already the case since existing tests were written before the dual-write gap was identified.

---

## 7. Traceability Matrix

### 7.1 Full Requirement-to-Test Traceability

```csv
REQ_ID,AC_ID,Test_ID,Test_File,Test_Name,Verification_Method,Priority
REQ-001,AC-001a,T-V9-02,v9-cross-location-consistency.test.cjs,Warn when phases[N].status diverges from phase_status[N],Automated,Must Have
REQ-001,AC-001b,T-V9-04,v9-cross-location-consistency.test.cjs,Warn when current_phase diverges from aw.current_phase,Automated,Must Have
REQ-001,AC-001c,T-V9-05,v9-cross-location-consistency.test.cjs,No warning for intermediate state (V9-C suppression),Automated,Must Have
REQ-001,AC-001c,T-V9-06,v9-cross-location-consistency.test.cjs,Warn for genuine V9-C mismatch,Automated,Must Have
REQ-001,AC-001d,T-V9-07,v9-cross-location-consistency.test.cjs,No warning when active_workflow missing,Automated,Must Have
REQ-001,AC-001d,T-V9-08,v9-cross-location-consistency.test.cjs,No warning when phases missing,Automated,Must Have
REQ-001,AC-001e,T-V9-09,v9-cross-location-consistency.test.cjs,V9 runs on Edit events (reads from disk),Automated,Must Have
REQ-001,AC-001f,T-V9-10,v9-cross-location-consistency.test.cjs,Fail-open on malformed JSON content,Automated,Must Have
REQ-001,--,T-V9-01,v9-cross-location-consistency.test.cjs,No warning when phases[N].status matches phase_status[N],Automated,Must Have
REQ-001,--,T-V9-03,v9-cross-location-consistency.test.cjs,No warning when current_phase matches aw.current_phase,Automated,Must Have
REQ-002,AC-002a,T-SR-04,supervised-review-redo-timing.test.cjs,V8 blocks non-redo status regression,Automated,Must Have
REQ-002,AC-002b,T-SR-01,supervised-review-redo-timing.test.cjs,Redo preserves started_at (V8 allows with redo marker),Automated,Must Have
REQ-002,AC-002c,T-MP-03,multi-phase-boundary.test.cjs,Forward transition pending to in_progress allowed by V8,Automated,Must Have
REQ-002,AC-002d,--,--,Deprecation comments in isdlc.md,Manual verification,Must Have
REQ-003,AC-003a,T-SR-01,supervised-review-redo-timing.test.cjs,Redo preserves started_at (redo_pending allows regression),Automated,Must Have
REQ-003,AC-003b,T-SR-04,supervised-review-redo-timing.test.cjs,V8 blocks non-redo status regression,Automated,Must Have
REQ-003,AC-003c,T-SR-02,supervised-review-redo-timing.test.cjs,Redo increments retries (redo_count > 0 triggers exception),Automated,Must Have
REQ-003,AC-003d,T-SR-04,supervised-review-redo-timing.test.cjs,Block completed -> pending even with redo,Automated,Must Have
REQ-004,AC-004a,T-SR-01,supervised-review-redo-timing.test.cjs,Redo preserves started_at,Automated,Must Have
REQ-004,AC-004a,T-SR-02,supervised-review-redo-timing.test.cjs,Redo increments retries,Automated,Must Have
REQ-004,AC-004a,T-SR-03,supervised-review-redo-timing.test.cjs,Redo clears completed_at,Automated,Must Have
REQ-004,AC-004b,T-MP-01,multi-phase-boundary.test.cjs,Phase N completed N+1 pending blocks delegation,Automated,Must Have
REQ-004,AC-004c,T-DW-01,dual-write-error-recovery.test.cjs,Phase stuck in_progress allows re-delegation,Automated,Must Have
REQ-004,AC-004d,T-ER-02,escalation-retry-flow.test.cjs,Escalation contains required fields,Automated,Must Have
REQ-005,AC-005a,--,gate-blocker-phase-status-bypass.test.cjs,Existing tests verify dispatcher and common.cjs loading,Regression,Should Have
REQ-005,AC-005b,--,gate-blocker-phase-status-bypass.test.cjs,Standalone execution test,Regression,Should Have
REQ-005,AC-005c,--,--,Local functions removed,Code review,Should Have
REQ-005,AC-005d,--,gate-blocker-*.test.cjs,All existing gate-blocker tests pass,Regression,Should Have
REQ-006,AC-006a,--,--,Stale warning displayed when elapsed > 2x timeout,Manual verification,Should Have
REQ-006,AC-006b,--,--,No warning when elapsed within timeout,Manual verification,Should Have
REQ-006,AC-006c,--,--,Same Retry/Skip/Cancel options,Manual verification,Should Have
REQ-006,AC-006d,--,--,No warning for completed phases,Manual verification,Should Have
```

### 7.2 Coverage Summary

| Metric | Count |
|--------|-------|
| Total requirements | 6 |
| Total acceptance criteria | 24 |
| ACs with automated tests | 16 (67%) |
| ACs with regression tests | 4 (17%) |
| ACs with manual verification | 4 (17%) |
| ACs with code review verification | 4 (note: overlap with regression) |
| Total AC coverage | 24/24 = 100% |
| New test files | 5 |
| New test cases | 26 |
| Orphan tests (no AC mapping) | 0 |

### 7.3 Test Scenario Coverage (from Impact Analysis)

| Test Scenario | Status Before | Status After | Test File |
|--------------|---------------|-------------|-----------|
| TS-003: Supervised review redo timing | NO COVERAGE | COVERED (4 tests) | supervised-review-redo-timing.test.cjs |
| TS-004: Escalation retry flow | NO COVERAGE | COVERED (4 tests) | escalation-retry-flow.test.cjs |
| TS-005: Multi-phase boundary state | NO COVERAGE | COVERED (4 tests) | multi-phase-boundary.test.cjs |
| TS-008: Dual-write under error | NO COVERAGE | COVERED (4 tests) | dual-write-error-recovery.test.cjs |
| V9 cross-location consistency | N/A (new feature) | COVERED (10 tests) | v9-cross-location-consistency.test.cjs |

---

## 8. Validation Checklist (GATE-05)

### Test Strategy Completeness

- [x] Test strategy covers unit tests (18 tests across v9-*, supervised-*)
- [x] Test strategy covers integration tests (8 tests across multi-phase-*, dual-write-*, escalation-*)
- [x] Test strategy covers regression tests (6 regression checkpoints, existing suite as guard)
- [x] Security testing: N/A (no security-relevant changes; V9 is observational, V8 extensions are validation)
- [x] Performance testing: N/A (V9 adds < 5ms per NFR-002; existing T67 overhead test covers V8)
- [x] E2E testing: N/A (hook-level changes tested via spawnSync invocation)

### Test Case Coverage

- [x] Test cases exist for all 6 requirements (Section 1)
- [x] All 24 acceptance criteria have defined verification methods (Section 1)
- [x] 16 ACs covered by automated tests (Sections 1.1-1.4)
- [x] 4 ACs covered by regression tests (Section 1.5)
- [x] 4 ACs covered by manual verification (Section 1.6)

### Traceability

- [x] Traceability matrix complete (Section 7.1)
- [x] 100% requirement coverage (24/24 ACs mapped)
- [x] No orphan tests (all 26 tests map to at least one AC)
- [x] Test scenarios from impact analysis fully covered (Section 7.3)

### Test Architecture

- [x] Test files organized by feature domain (Section 2.2)
- [x] Shared helpers follow existing project convention (Section 2.3)
- [x] Setup/teardown patterns documented (Section 2.4)
- [x] Hook stdin protocol documented (Section 2.5)

### Coverage Targets

- [x] Per-file coverage requirements defined (Section 4.1)
- [x] Code path coverage targets for modified functions (Section 4.3)
- [x] Test type distribution documented (Section 4.4)

### Test Data

- [x] State.json fixtures for all test scenarios (Section 5)
- [x] Valid states documented (base state, boundary states)
- [x] Edge cases documented (empty state, null active_workflow, malformed JSON)
- [x] Error states documented (crash recovery, divergent fields)

### Regression Strategy

- [x] Existing test suite identified as regression guard (Section 6.1)
- [x] Regression checkpoints defined for each implementation batch (Section 6.2)
- [x] Regression risk matrix documented (Section 6.3)
- [x] Specific regression concerns identified with mitigations (Section 6.4)

### Execution

- [x] Test execution order defined (Section 3)
- [x] Batch boundaries match implementation batches (Section 3.1)
- [x] Dependency-driven ordering within batches (Section 3.2)
- [x] Full regression run defined (Section 3.3)

---

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
