# Impact Analysis: Phase Handshake Audit Fixes

**Generated**: 2026-02-19 (audit mode)
**Updated**: 2026-02-20 (implementation mode)
**Feature**: Implement 6 fixes (REQ-001 through REQ-006) from phase handshake audit
**Source**: GitHub Issue #55
**Based On**: Phase 01 Requirements Specification (REQ-001 through REQ-006, 24 ACs)
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Phase 00 - Audit) | Clarified (Phase 01 - Implementation) |
|--------|------------------------------|---------------------------------------|
| Description | Verify state transitions and artifact passing across 5 dimensions | Implement 6 fixes: V9 check, V8 extensions, integration tests, config cleanup, stale detection |
| Mode | Investigation (read-only audit) | Implementation (code changes + new test files) |
| Keywords | state.json, phases, gate, artifact, timing, budget, supervised review | V9, V8, regression, supervised redo, dual-write, deprecation, stale phase |
| Estimated Files | 27 primary + 8 test files (audit scope) | 4 files modified + 5 files created = 9 total |
| Requirements | 5 investigation areas (INV-001 through INV-005) | 6 implementation requirements (REQ-001 through REQ-006) |
| Scope Change | - | NARROWED (audit mapped 27 files; implementation touches 9) |

---

## Executive Summary

The implementation scope is well-contained: 3 production files modified (`state-write-validator.cjs`, `gate-blocker.cjs`, `iteration-corridor.cjs`) and 1 prompt specification updated (`isdlc.md`), plus 5 new test files created. The blast radius is **LOW** because changes are additive (V9 is warn-only, V8 redo exception relaxes constraints, V8 `phases[].status` check adds parallel protection to an already-working pattern). The risk level is **LOW-MEDIUM** -- the highest risk is REQ-002 (V8 `phases[].status` regression check) which adds new blocking behavior, mitigated by the supervised redo exception (REQ-003) being implemented first. REQ-005 (config loader consolidation) has the narrowest blast radius but must be validated against standalone execution paths.

**Blast Radius**: LOW (4 production files modified, all additive changes)
**Risk Level**: LOW-MEDIUM
**Files Modified**: 4
**Files Created**: 5
**Total Affected**: 9
**Affected Modules**: 2 (state-write-validator subsystem, config loader subsystem)

---

## Impact Analysis (M1)

### Per-Requirement File Impact Map

#### REQ-001: V9 Cross-Location Consistency Check

| Action | File | Lines Affected | Change Description |
|--------|------|---------------|-------------------|
| MODIFY | `src/claude/hooks/state-write-validator.cjs` | After L344, before `check()` | Add new `checkCrossLocationConsistency()` function (~85 lines) |
| MODIFY | `src/claude/hooks/state-write-validator.cjs` | L400 (inside `check()`) | Add V9 invocation after V8, before V1-V3 |
| CREATE | `src/claude/hooks/tests/v9-cross-location-consistency.test.cjs` | New file | 10 test cases (T-V9-01 through T-V9-10) |

**Outward dependencies** (what could break):
- None. V9 is purely observational (warn-only on stderr). It cannot block any write. It adds no new blocking paths and introduces no new `return { decision: 'block' }` statements.

**Inward dependencies** (what V9 depends on):
- `fs.readFileSync` (for Edit events only -- reads state from disk)
- `toolInput.content` (for Write events -- parses incoming JSON)
- `logHookEvent()` from common.cjs (for observability logging)
- `debugLog()` from common.cjs (for error logging)

**Blast radius**: MINIMAL -- V9 cannot affect any existing behavior. On error, it returns silently (fail-open).

#### REQ-002: V8 phases[].status Coverage + Deprecation (Phase A)

| Action | File | Lines Affected | Change Description |
|--------|------|---------------|-------------------|
| MODIFY | `src/claude/hooks/state-write-validator.cjs` | L335-338 (after V8 Check 2) | Add V8 Check 3: `phases[].status` regression detection with supervised redo exception |
| MODIFY | `src/claude/commands/isdlc.md` | L1136 (STEP 3c-prime, step 4) | Add deprecation comment on `active_workflow.phase_status` write |
| MODIFY | `src/claude/commands/isdlc.md` | L1277 (STEP 3e, step 5) | Add deprecation comment on `active_workflow.phase_status` write |
| MODIFY | `src/claude/commands/isdlc.md` | L1443 (STEP 3e-review, redo path) | Add deprecation comment on `active_workflow.phase_status` write |
| MODIFY | `src/claude/commands/isdlc.md` | L1452 (STEP 3e-review, redo completion) | Add deprecation comment on `active_workflow.phase_status` write |

**Outward dependencies** (what could break):
- **HIGH RISK**: This adds a new blocking rule to V8. Any state.json write that regresses `phases[N].status` from `completed` to a lower ordinal will now be BLOCKED. The supervised redo exception (REQ-003) must be implemented first to avoid blocking legitimate redo writes.
- Affected writers: `isdlc.md` STEP 3e-review Case D (redo resets `phases[N].status` from `completed` to `in_progress`).
- NOT affected: Normal forward transitions (`pending` -> `in_progress` -> `completed`) -- these are not regressions.

**Inward dependencies**: Same as existing V8 (reads `incomingState.phases`, `diskState.phases`, `PHASE_STATUS_ORDINAL`).

**Blast radius**: MEDIUM -- adds new blocking behavior for a previously unchecked field. Mitigation: REQ-003 redo exception must land first.

#### REQ-003: V8 Supervised Redo Exception

| Action | File | Lines Affected | Change Description |
|--------|------|---------------|-------------------|
| MODIFY | `src/claude/hooks/state-write-validator.cjs` | L322-333 (V8 Check 2, `phase_status` regression block) | Add redo exception before the block statement |

**Outward dependencies** (what could break):
- This RELAXES V8, not tightens. The only risk is if the exception is too broad (allowing non-redo regressions through). Mitigation: Exception is narrowly scoped to `completed -> in_progress` only, and requires `supervised_review.status === 'redo_pending'` OR `supervised_review.redo_count > 0`.

**Inward dependencies**: Reads `incomingState.active_workflow.supervised_review` (new field dependency).

**Blast radius**: LOW -- relaxes existing constraint; cannot cause false blocks.

#### REQ-004: Missing Integration Tests

| Action | File | Lines Affected | Change Description |
|--------|------|---------------|-------------------|
| CREATE | `src/claude/hooks/tests/supervised-review-redo-timing.test.cjs` | New file | 4 test cases (T-SR-01 through T-SR-04) |
| CREATE | `src/claude/hooks/tests/multi-phase-boundary.test.cjs` | New file | 4 test cases (T-MP-01 through T-MP-04) |
| CREATE | `src/claude/hooks/tests/dual-write-error-recovery.test.cjs` | New file | 4 test cases (T-DW-01 through T-DW-04) |
| CREATE | `src/claude/hooks/tests/escalation-retry-flow.test.cjs` | New file | 4 test cases (T-ER-01 through T-ER-04) |

**Outward dependencies**: None. Test files do not affect production code.

**Inward dependencies**: Tests depend on `state-write-validator.cjs` `check()` function, `phase-loop-controller.cjs` `check()` function, `gate-blocker.cjs` `check()` function (invoked via `spawnSync` or direct `require`). Tests also depend on `common.cjs` for state file setup helpers.

**Blast radius**: NONE -- new test files only.

#### REQ-005: Configuration Loader Consolidation

| Action | File | Lines Affected | Change Description |
|--------|------|---------------|-------------------|
| MODIFY | `src/claude/hooks/gate-blocker.cjs` | L35-53 | Remove local `loadIterationRequirements()` function |
| MODIFY | `src/claude/hooks/gate-blocker.cjs` | L58-76 | Remove local `loadWorkflowDefinitions()` function |
| MODIFY | `src/claude/hooks/gate-blocker.cjs` | L629 | Remove 3rd fallback from requirements loading chain |
| MODIFY | `src/claude/hooks/gate-blocker.cjs` | L649-650 | Remove 3rd fallback from workflow loading chain |
| MODIFY | `src/claude/hooks/iteration-corridor.cjs` | L83-101 | Remove local `loadIterationRequirements()` function |
| MODIFY | `src/claude/hooks/iteration-corridor.cjs` | L276 | Remove 3rd fallback from requirements loading chain |

**Outward dependencies** (what could break):
- If `common.cjs` `loadIterationRequirements()` returns null AND the dispatcher does not provide `ctx.requirements`, the hook will get `null` requirements and fail-open. Previously, the local fallback would attempt a direct file read. However, this path is already tested: the dispatcher always provides `ctx.requirements` in normal operation, and standalone execution (L897) uses `common.cjs` directly.
- Risk scenario: standalone `gate-blocker.cjs` execution in an environment where `common.cjs` cannot find the config file AND no dispatcher context exists. This is an edge case that the local fallback covered with identical search paths.

**Inward dependencies**: Relies on `common.cjs` `loadIterationRequirements()` and `loadWorkflowDefinitions()` being reliable.

**Blast radius**: LOW -- removes redundant code; canonical paths unchanged.

#### REQ-006: Stale Phase Detection

| Action | File | Lines Affected | Change Description |
|--------|------|---------------|-------------------|
| MODIFY | `src/claude/commands/isdlc.md` | L1109 (STEP 3b) | Add stale phase detection check before escalation check |

**Outward dependencies** (what could break):
- This is a prompt-level change. It adds an advisory warning banner and Retry/Skip/Cancel options. It cannot break any hook or code path because it operates entirely within the LLM's prompt interpretation.
- Risk: False positives if the 2x timeout threshold is too aggressive. Mitigation: Default timeout is 120 minutes, so stale threshold is 240 minutes (4 hours) -- very conservative.

**Inward dependencies**: Reads `phases[N].timing.started_at`, `phases[N].status`, and `iteration-requirements.json` timeout configuration.

**Blast radius**: MINIMAL -- prompt-level advisory; hooks unaffected.

### Consolidated File Change Map

| File | REQs | Action | LOC Delta (est.) |
|------|------|--------|-----------------|
| `src/claude/hooks/state-write-validator.cjs` | REQ-001, REQ-002, REQ-003 | MODIFY | +120 lines |
| `src/claude/commands/isdlc.md` | REQ-002, REQ-006 | MODIFY | +25 lines |
| `src/claude/hooks/gate-blocker.cjs` | REQ-005 | MODIFY | -45 lines |
| `src/claude/hooks/iteration-corridor.cjs` | REQ-005 | MODIFY | -20 lines |
| `src/claude/hooks/tests/v9-cross-location-consistency.test.cjs` | REQ-001 (via REQ-004) | CREATE | ~200 lines |
| `src/claude/hooks/tests/supervised-review-redo-timing.test.cjs` | REQ-004 | CREATE | ~120 lines |
| `src/claude/hooks/tests/multi-phase-boundary.test.cjs` | REQ-004 | CREATE | ~120 lines |
| `src/claude/hooks/tests/dual-write-error-recovery.test.cjs` | REQ-004 | CREATE | ~120 lines |
| `src/claude/hooks/tests/escalation-retry-flow.test.cjs` | REQ-004 | CREATE | ~120 lines |

**Net change**: +80 production lines, +680 test lines (est.)

### Dependency Graph (Implementation Order)

```
REQ-003 (V8 redo exception)     REQ-001 (V9 consistency check)
   |                                |
   v                                v
REQ-002 (V8 phases[].status)    (independent)
   |
   v
REQ-004 (integration tests -- tests cover REQ-001/002/003 behavior)
   |
   v
REQ-005 (config cleanup)        REQ-006 (stale detection)
   (independent)                  (independent)
```

**Critical ordering**: REQ-003 MUST land before REQ-002 to avoid blocking legitimate supervised redo writes.

---

## Entry Points (M2)

### Implementation Entry Points per Requirement

#### REQ-001 Entry Point: `state-write-validator.cjs` `check()` function

```
Location: src/claude/hooks/state-write-validator.cjs, L354-455
Trigger: PostToolUse[Write,Edit] when file path matches STATE_JSON_PATTERN
Chain: post-write-edit-dispatcher -> state-write-validator.check(ctx) -> V7 -> V8 -> [V9 NEW] -> V1-V3
```

Implementation point: Add `checkCrossLocationConsistency()` function before `check()`, then invoke it inside `check()` after V8 and before V1-V3. V9 runs after V8 because V8 may block the write; V9 only needs to warn on allowed writes.

#### REQ-002 Entry Point: `checkPhaseFieldProtection()` function

```
Location: src/claude/hooks/state-write-validator.cjs, L235-344
Trigger: Same as V8 (PostToolUse[Write] for state.json writes)
Chain: check() -> checkPhaseFieldProtection() -> [Check 3 NEW] after Check 2
```

Implementation point: Add Check 3 (phases[].status regression) after the existing Check 2 (active_workflow.phase_status regression) in `checkPhaseFieldProtection()`. The new check iterates `incomingState.phases` vs `diskState.phases` using the same `PHASE_STATUS_ORDINAL` map.

#### REQ-003 Entry Point: V8 Check 2, line 323

```
Location: src/claude/hooks/state-write-validator.cjs, L322-333
Trigger: V8 Check 2 detects phase_status regression (incomingOrd < diskOrd)
Chain: checkPhaseFieldProtection() -> Check 2 -> [redo exception NEW] -> block
```

Implementation point: Insert supervised redo detection before the existing block statement at L324. Check `incomingState.active_workflow.supervised_review` for `status === 'redo_pending'` or `redo_count > 0`. If redo and regression is specifically `completed -> in_progress`, `continue` to skip the block.

#### REQ-004 Entry Points: Test pattern from `cross-hook-integration.test.cjs`

```
Pattern location: src/claude/hooks/tests/cross-hook-integration.test.cjs
Test runner: node:test (node --test)
Setup: tmp dir + .isdlc/state.json + config files
Invocation: spawnSync('node', [hookPath], { input: JSON.stringify(hookInput) })
```

All 4 new test files follow this pattern. Each sets up state representing a specific handshake scenario, invokes the relevant hook, and asserts on stdout/stderr/exit code.

#### REQ-005 Entry Point: Config loading in `gate-blocker.cjs` L629

```
Location: src/claude/hooks/gate-blocker.cjs, L629
Current: ctx.requirements || loadIterationRequirementsFromCommon() || loadIterationRequirements()
After:   ctx.requirements || loadIterationRequirementsFromCommon()
```

Remove the local fallback functions (L35-76) and their references in the loading chains (L629, L649-650). Same pattern for `iteration-corridor.cjs` (L83-101, L276).

#### REQ-006 Entry Point: `isdlc.md` STEP 3b, line 1109

```
Location: src/claude/commands/isdlc.md, L1109
Current: "3b. Read .isdlc/state.json and check for pending_escalations[]."
After: Add stale phase detection BEFORE the escalation check.
```

### Recommended Implementation Order

Based on dependency analysis and risk:

1. **REQ-003** (V8 redo exception) -- prerequisite for REQ-002; LOW risk
2. **REQ-001** (V9 cross-location check) -- independent; no blocking behavior
3. **REQ-002** (V8 phases[].status coverage + deprecation) -- depends on REQ-003
4. **REQ-004** (integration tests) -- tests REQ-001/002/003; validates behavior
5. **REQ-005** (config loader consolidation) -- independent cleanup
6. **REQ-006** (stale phase detection) -- independent prompt change

Batching (per requirements-spec.md Section 8):
- **Batch 1** (single PR): REQ-001 + REQ-003 + REQ-002 -- all in `state-write-validator.cjs` + deprecation in `isdlc.md`
- **Batch 2** (single PR): REQ-004 -- all new test files, no production changes
- **Batch 3** (single PR): REQ-005 + REQ-006 -- low-priority cleanups

---

## Risk Assessment (M3)

### Per-Requirement Risk Matrix

| REQ | Risk Level | Risk Description | Mitigation |
|-----|-----------|------------------|------------|
| REQ-001 | LOW | V9 is warn-only; cannot block or break any workflow | Fail-open on all errors; no new blocking paths |
| REQ-002 | MEDIUM | Adds new V8 blocking rule for `phases[].status` regression | REQ-003 redo exception must land first; ordinal comparison is well-tested pattern |
| REQ-003 | LOW | Relaxes V8; narrowly scoped to `completed -> in_progress` with redo marker | Exception criteria are specific; cannot allow non-redo regressions |
| REQ-004 | NONE | New test files only; no production code changes | N/A |
| REQ-005 | LOW | Removes redundant config loaders; canonical path unchanged | Existing tests verify both dispatcher and standalone execution |
| REQ-006 | LOW | Prompt-level advisory; no hook changes | 4-hour threshold is very conservative |

### Test Coverage Map

#### Existing Tests (covering affected files)

| Test File | Covers | Test Count | Status |
|-----------|--------|-----------|--------|
| `state-write-validator.test.cjs` | V1-V3, V7, V8 | ~70 tests | GOOD |
| `state-write-validator-null-safety.test.cjs` | V7/V8 null handling | ~20 tests | GOOD |
| `phase-loop-controller.test.cjs` | Phase status checks, same-phase bypass | 23 tests | GOOD |
| `gate-blocker-phase-status-bypass.test.cjs` | Gate-blocker blocking behavior | ~12 tests | GOOD |
| `gate-blocker-inconsistent-behavior.test.cjs` | Gate-blocker edge cases | ~8 tests | GOOD |
| `cross-hook-integration.test.cjs` | Multi-hook interaction | ~10 tests | GOOD |
| `artifact-paths-config-fix.test.cjs` | Artifact path config | 13 tests | GOOD |

#### New Tests (to be created)

| Test File | Covers | Test Count | REQ |
|-----------|--------|-----------|-----|
| `v9-cross-location-consistency.test.cjs` | V9-A, V9-B, V9-C, fail-open, Edit events | 10 | REQ-001 |
| `supervised-review-redo-timing.test.cjs` | TS-003: redo timing, V8 redo exception | 4 | REQ-004 |
| `multi-phase-boundary.test.cjs` | TS-005: Phase N -> N+1 state consistency | 4 | REQ-004 |
| `dual-write-error-recovery.test.cjs` | TS-008: delegation failure recovery | 4 | REQ-004 |
| `escalation-retry-flow.test.cjs` | TS-004: escalation lifecycle | 4 | REQ-004 |

#### Coverage Gap Closure

| Gap (from original analysis) | Closed By | Status |
|-----------------------------|-----------|--------|
| GAP-001 (TS-003: supervised redo timing) | REQ-004 `supervised-review-redo-timing.test.cjs` | CLOSED |
| GAP-002 (TS-004: escalation retry flow) | REQ-004 `escalation-retry-flow.test.cjs` | CLOSED |
| GAP-003 (TS-005: multi-phase boundary) | REQ-004 `multi-phase-boundary.test.cjs` | CLOSED |
| GAP-004 (TS-008: dual-write under error) | REQ-004 `dual-write-error-recovery.test.cjs` | CLOSED |
| GAP-005 (TS-009: budget degradation) | Out of scope (CON-003) | NOT ADDRESSED |

### Complexity Hotspots (Implementation Focus)

| File | Current LOC | After Changes (est.) | Complexity Change |
|------|------------|---------------------|-------------------|
| `state-write-validator.cjs` | 497 | ~617 | +1 function (V9), +1 check block (V8 Check 3), +1 exception in Check 2. Complexity increases from MEDIUM (~15) to MEDIUM-HIGH (~20) |
| `gate-blocker.cjs` | 925 | ~880 | -2 functions (local config loaders). Complexity DECREASES slightly |
| `iteration-corridor.cjs` | 428 | ~408 | -1 function (local config loader). Complexity DECREASES slightly |
| `isdlc.md` | 1754 | ~1779 | +4 deprecation comments, +1 stale phase detection block. Complexity unchanged |

### Regression Risk Assessment

| Change | Regression Risk | Existing Test Coverage | Needs New Tests |
|--------|----------------|----------------------|----------------|
| V9 function addition | NONE (additive, warn-only) | N/A (new code) | YES (10 tests) |
| V8 Check 3 addition | LOW (parallel to Check 2) | V8 pattern well-tested | YES (via REQ-004) |
| V8 redo exception | LOW (relaxes constraint) | No existing redo tests | YES (3 tests via REQ-004) |
| Config loader removal | LOW | Existing gate-blocker tests | NO (verify pass) |
| isdlc.md deprecation comments | NONE (comments only) | N/A | NO |
| isdlc.md stale detection | LOW (prompt-level) | N/A (manual verification) | NO |

### Coupling Impact

Changes affect the following coupling relationships:

| Coupling | Impact | Direction |
|----------|--------|-----------|
| `state-write-validator.cjs` <-> state writers | V8 Check 3 adds new blocking for `phases[].status` regression | TIGHTENS |
| `state-write-validator.cjs` <-> supervised redo path | V8 redo exception allows `completed -> in_progress` with marker | RELAXES |
| `gate-blocker.cjs` <-> `common.cjs` | Config loading chain shortened from 3 to 2 fallbacks | SIMPLIFIES |
| `phases[N].status` <-> `active_workflow.phase_status[N]` | V9 detects divergence; deprecation signals future removal | MONITORS |

---

## Implementation Recommendations

Based on the implementation-focused impact analysis:

1. **Implementation Order**: REQ-003 first (redo exception), then REQ-001 (V9), then REQ-002 (V8 extension), then REQ-004 (tests), then REQ-005/REQ-006 (cleanup)
2. **High-Risk Area**: REQ-002 adds blocking behavior -- run all existing `state-write-validator.test.cjs` tests after each change
3. **Dependencies**: REQ-003 MUST precede REQ-002 to avoid blocking supervised redo
4. **Test-First Opportunity**: REQ-004 tests can be written before Batch 1 code (test-first for redo timing, multi-phase boundary); however, V9 tests (10 cases) should be written alongside REQ-001 implementation
5. **No Common.cjs Changes**: None of the 6 REQs modify common.cjs -- this keeps the universal dependency stable

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-20",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/phase-handshake-audit-GH-55/requirements-spec.md",
  "quick_scan_used": "docs/requirements/phase-handshake-audit-GH-55/quick-scan.md",
  "scope_change_from_original": "narrowed",
  "requirements_keywords": ["V9", "V8", "regression", "supervised redo", "dual-write", "deprecation", "stale phase", "cross-location", "consistency", "integration tests", "config loader"],
  "files_directly_affected": 9,
  "modules_affected": 2,
  "risk_level": "low-medium",
  "blast_radius": "low",
  "coverage_gaps": 0
}
```
