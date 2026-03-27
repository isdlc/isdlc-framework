# Code Review Report: Task List Consumption Model for Build Phase Agents

**Feature**: REQ-GH-212
**Reviewer**: QA Engineer (Phase 08)
**Date**: 2026-03-27
**Mode**: Human Review Only (Phase 06 per-file Writer/Reviewer/Updater loop completed)
**Verdict**: APPROVED

---

## 1. Review Scope

This review covers cross-cutting concerns only. Per-file logic correctness, error handling, security, code quality, test quality, and tech-stack alignment were already validated by the Phase 06 Reviewer during the per-file implementation loop.

### Files Reviewed

| # | File | Type | Change |
|---|------|------|--------|
| 1 | `src/core/tasks/task-reader.js` | New | Provider-neutral task plan parser (~472 lines) |
| 2 | `tests/core/tasks/task-reader.test.js` | New | 48 unit tests for task reader |
| 3 | `tests/hooks/plan-surfacer.test.js` | New | 7 tests for plan-surfacer Phase 05 gate |
| 4 | `src/claude/hooks/plan-surfacer.cjs` | Modified | Removed `05-test-strategy` from EARLY_PHASES |
| 5 | `src/core/analyze/state-machine.js` | Modified | Added PRESENTING_TASKS to tierPaths.light |
| 6 | `src/providers/codex/projection.js` | Modified | Added TASK_CONTEXT injection (step 7) |
| 7 | `src/claude/commands/isdlc.md` | Modified | Added BUILD-INIT COPY step + TASK_CONTEXT INJECTION block |
| 8 | `src/claude/skills/orchestration/generate-plan/SKILL.md` | Modified | Light-workflow task derivation algorithm |
| 9 | `src/claude/agents/04-test-design-engineer.md` | Modified | Task-Driven Test Design section |
| 10 | `src/claude/agents/05-software-developer.md` | Modified | Task-Driven Implementation section |
| 11 | `src/claude/agents/16-quality-loop-engineer.md` | Modified | Task-Driven Verification section |
| 12 | `src/claude/agents/07-qa-engineer.md` | Modified | Task-Driven Review section |
| 13 | `src/claude/agents/roundtable-analyst.md` | Modified | PRESENTING_TASKS state, light-tier task generation |
| 14 | `src/core/teams/instances/debate-test-strategy.js` | Modified | task_context_instructions per member |
| 15 | `src/core/teams/specs/implementation-review-loop.js` | Modified | task_context field per role |
| 16 | `src/core/teams/instances/quality-loop.js` | Modified | task_context_instructions per track |
| 17 | `tests/core/analyze/state-machine.test.js` | Modified | 3 regression tests for light tier |
| 18 | `tests/core/teams/specs.test.js` | Modified | Relaxed field schema check for task_context |

---

## 2. Cross-Cutting Review Checklist

### 2.1 Architecture Alignment (ADR-001 through ADR-006)

| ADR | Decision | Implementation | Verdict |
|-----|----------|----------------|---------|
| ADR-001 | Provider-neutral task reader in src/core/tasks/ | `task-reader.js` in `src/core/tasks/`, pure ESM, no provider dependencies | PASS |
| ADR-002 | TASK_CONTEXT injection block | Identical injection pattern in isdlc.md (Claude, step 3d) and projection.js (Codex, step 7). Format matches GATE REQUIREMENTS / WORKFLOW MODIFIERS pattern. | PASS |
| ADR-003 | 3e-plan upgrade for file-level tasks | SKILL.md updated with light-workflow derivation algorithm. Note preserved about standard-workflow high-level stubs refined after GATE-04. | PASS |
| ADR-004 | Light workflow task generation | `state-machine.js` tierPaths.light now includes PRESENTING_TASKS. Roundtable analyst has Section 5.6 covering light-tier generation. | PASS |
| ADR-005 | Plan-surfacer Phase 05 gate | `05-test-strategy` removed from EARLY_PHASES. 7 tests verify the change. | PASS |
| ADR-006 | Task-to-test mapping carry-forward | `formatTaskContext()` accepts `includeTestMapping` option. Injection logic enables it only for `06-implementation` and `16-quality-loop`. | PASS |

### 2.2 Business Logic Coherence

The feature establishes a data flow pipeline:

```
tasks.md (analysis output)
  --> BUILD-INIT copies to docs/isdlc/tasks.md
  --> task-reader.js parses v2.0 format
  --> formatTaskContext() renders TASK_CONTEXT block
  --> Phase-loop (Claude) / projection.js (Codex) injects into prompt
  --> Agent specs describe consumption per phase
```

**Coherence assessment**: The pipeline is consistent across all files. Every injection point (Claude via isdlc.md, Codex via projection.js) uses the same `readTaskPlan()` / `formatTaskContext()` API. All four agent specs (05, 06, 16, 08) follow the same pattern: "When TASK_CONTEXT is present: ...; When absent: fall back to existing behavior." This backward compatibility pattern is applied uniformly.

**Verdict**: PASS -- business logic is coherent across all 18 files.

### 2.3 Design Pattern Consistency

**TASK_CONTEXT Injection Pattern (Claude vs Codex)**:

Both injection sites follow identical logic:

1. Resolve `tasksPath` from `projectRoot + 'docs/isdlc/tasks.md'`
2. Call `readTaskPlan(tasksPath)`
3. Guard: skip if null or error
4. Determine `includeTestMapping` based on phase
5. Resolve `testStrategyPath` from artifact folder
6. Call `formatTaskContext(plan, phase, options)`
7. Append to content/prompt
8. Fail-open on any error

The Codex implementation in `projection.js` (lines 306-324) mirrors the Claude specification in `isdlc.md` TASK_CONTEXT INJECTION block (7 steps). The code in projection.js is a faithful programmatic implementation of the markdown specification. This pattern consistency means a format change only needs updating in `task-reader.js` (single parse implementation, per ADR-001).

**Team Instance Pattern**:

All three Codex team instances (`debate-test-strategy.js`, `implementation-review-loop.js`, `quality-loop.js`) add `task_context_instructions` strings in the same style. The instructions are role-appropriate: creators/writers read task context, critics validate it, refiners address gaps, tracks verify coverage. The field is frozen via `Object.freeze()` consistent with existing instance patterns.

**Spec Test Adjustment**:

The `specs.test.js` change (TS-05) relaxes the field schema check from "exactly 7 required fields" to "all 7 required fields present (may have optional extras)." This is the correct approach -- the `task_context` field is optional and additive, not replacing a required field. The test still ensures all required fields exist.

**Verdict**: PASS -- patterns are consistently applied.

### 2.4 Non-Obvious Security Concerns

**File I/O in task-reader.js**:

- `readTaskPlan()` uses `existsSync()` + `readFileSync()` with a caller-provided path. The callers always construct the path from `projectRoot` + known constants (`docs/isdlc/tasks.md`), so there is no path injection vector from untrusted input.
- `parseTestMapping()` follows the same pattern with `testStrategyPath` constructed from `projectRoot` + `artifactFolder` (from state.json).
- The module never writes files -- read-only operations only.
- All errors are caught and returned as `{error, reason}` objects -- never thrown (consistent with Article X fail-open).

**Cross-file data flow auth boundaries**:

- The TASK_CONTEXT block is injected into delegation prompts. It contains task descriptions, file paths, and FR/AC references -- no sensitive data (credentials, keys, tokens).
- `formatTaskContext()` output is bounded: the TR-46 test verifies output stays under ~1000 tokens for a typical 4-task phase.

**Verdict**: PASS -- no security concerns identified.

### 2.5 Requirements Completeness (11 FRs)

| FR | Title | Implementation | Status |
|----|-------|----------------|--------|
| FR-001 | 3e-plan File-Level Tasks | SKILL.md light-workflow derivation algorithm added | IMPLEMENTED |
| FR-002 | Light Analysis Task Breakdown | state-machine.js light path updated, roundtable-analyst Section 5.6 | IMPLEMENTED |
| FR-003 | Phase 05 Consumes tasks.md | 04-test-design-engineer.md Task-Driven Test Design section; debate-test-strategy.js task_context_instructions | IMPLEMENTED |
| FR-004 | Build-Init Copy With Retry | isdlc.md BUILD-INIT COPY step (3 retries on failure) | IMPLEMENTED |
| FR-005 | Retry on Generation Failure | Covered by existing 3f-retry-protocol + plan-surfacer gate (FR-006 enables the mechanism) | IMPLEMENTED |
| FR-006 | Plan-Surfacer Blocks Phase 05 | plan-surfacer.cjs EARLY_PHASES updated; 7 tests verify | IMPLEMENTED |
| FR-007 | Consumption Pattern Contract | task-reader.js readTaskPlan/getTasksForPhase/formatTaskContext; isdlc.md TASK_CONTEXT INJECTION; projection.js step 7 | IMPLEMENTED |
| FR-008 | Phase 06 Consumes tasks.md | 05-software-developer.md Task-Driven Implementation section; implementation-review-loop.js task_context | IMPLEMENTED |
| FR-009 | Phase 16 Consumes tasks.md | 16-quality-loop-engineer.md Task-Driven Verification section; quality-loop.js task_context_instructions | IMPLEMENTED |
| FR-010 | Phase 08 Consumes tasks.md | 07-qa-engineer.md Task-Driven Review section | IMPLEMENTED |
| FR-011 | Provider-Neutral Task Reader | task-reader.js in src/core/tasks/; 48 tests; both providers import it | IMPLEMENTED |

**Verdict**: PASS -- all 11 FRs implemented.

### 2.6 Integration Points

| Integration | Source | Target | Verification |
|-------------|--------|--------|-------------|
| INT-001 | task-reader.js | docs/isdlc/tasks.md | 48 tests with fixture files covering valid, empty, malformed, duplicate, self-reference cases |
| INT-002 | Phase-loop (isdlc.md step 3d) | task-reader | Markdown spec describes 7-step injection with fail-open |
| INT-003 | Codex projection.js | task-reader | Import at line 21; injection at lines 306-324; fail-open catch |
| INT-005 | plan-surfacer | tasks.md existence | 7 new tests + existing suite; Phase 05 no longer bypassed |
| INT-006 | Phase 05 agent | TASK_CONTEXT block | Agent spec + debate-test-strategy.js task_context_instructions |
| INT-008 | Phase 06 agent | TASK_CONTEXT block | Agent spec + implementation-review-loop.js task_context |
| INT-009 | Phase 16 dual-track | TASK_CONTEXT block | Agent spec + quality-loop.js task_context_instructions per track |
| INT-010 | Phase 08 agent | TASK_CONTEXT block | Agent spec describes task-structured review units |

All integration points are connected. The import chain is clean: `projection.js` -> `task-reader.js` (line 21), and the Claude path uses the markdown specification in `isdlc.md`.

**Verdict**: PASS -- integration points are correct.

### 2.7 Unintended Side Effects

**Assessed risks and mitigations**:

1. **Spec test TS-05 relaxation**: Changed from strict "exactly 7 fields" to "all 7 required fields present." This is correct because `task_context` is an optional addition. The test still validates all required fields exist. No regression risk -- adding optional fields is a standard extension pattern.

2. **State machine tierPaths.light change**: Adding `PRESENTING_TASKS` to the light path means light analyses will now present a task breakdown for user acceptance. This is the intended behavior (FR-002). The change is additive -- standard and trivial tier paths are unchanged. 3 regression tests guard the exact values.

3. **Plan-surfacer EARLY_PHASES removal of 05-test-strategy**: This means Phase 05 now requires tasks.md. Builds that previously ran Phase 05 without tasks.md will now be blocked by plan-surfacer, triggering the 3f-retry-protocol to generate tasks.md via 3e-plan. This is the intended behavior (FR-006, ADR-005). The fail-open design of plan-surfacer (no state.json = allow, no workflow = allow) prevents edge-case blocks.

4. **Codex projection.js reindexing**: Step numbers shifted (old step 7 became step 8). The `contractSummaryInjected` metadata flag is preserved, and the return object correctly includes both `taskContextInjected` and `contractSummaryInjected`. No functional regression.

**Verdict**: PASS -- no unintended side effects.

### 2.8 Overall Code Quality Impression

The implementation is clean, well-structured, and follows established project patterns:

- **task-reader.js** is well-organized with clear separation between public API (3 exported functions), internal helpers (parseHeader, splitPhaseSections, parsePhaseSection, buildSummary, computeDependencySummary, assignTiers, parseTestMapping), and comprehensive JSDoc annotations. The module is purely synchronous, uses `readFileSync` (appropriate for single-file reads in a CLI context), and never throws.

- **Test coverage** is thorough: 48 tests for the task reader covering positive paths, negative paths (empty file, no phases, malformed content, duplicate IDs, self-references), and edge cases. 7 tests for plan-surfacer changes. 3 regression tests for state machine. The test fixtures directory has 8 purpose-built fixture files covering the v2.0 format variations.

- **Agent spec updates** follow a consistent structure: "When TASK_CONTEXT is present: ... steps; When absent: fall back to existing behavior." This backward-compatible pattern is correctly applied to all four agent specs.

- **Documentation** is current: agent specs, roundtable analyst, SKILL.md, and isdlc.md all updated to reflect the new behavior.

**Verdict**: PASS -- high quality implementation.

### 2.9 Merge Approval

**Decision**: APPROVED for merge to main.

**Rationale**:
- All 11 FRs implemented and traceable
- All 6 ADRs faithfully implemented
- Provider-neutral architecture maintained (single parser, identical injection for Claude and Codex)
- 58 new tests, all passing, 0 regressions
- Backward compatible: agents fall back to self-decomposition when TASK_CONTEXT is absent
- Constitutional compliance verified (Articles V, VI, VII, VIII, IX)

---

## 3. Findings

### 3.1 Critical Findings

None.

### 3.2 High Severity Findings

None.

### 3.3 Medium Severity Findings

None.

### 3.4 Low Severity Findings

| # | File | Lines | Category | Description |
|---|------|-------|----------|-------------|
| L-001 | `src/core/tasks/task-reader.js` | 403-431 | Robustness | `assignTiers()` uses recursive `getTier()` which could stack overflow on deeply nested dependency chains (>10,000 tasks). For realistic task counts (<100), this is not a concern. No action needed -- current usage is bounded. |
| L-002 | `src/core/tasks/task-reader.js` | 210-213 | Parsing | `parseHeader()` slug regex `^# Task Plan:\s*\w+\s+(.+)` requires the header to match a specific format. If the header format varies (e.g., extra words), the slug may be empty string. This is handled gracefully (empty slug, no crash). |

---

## 4. Blast Radius Cross-Check

Impact analysis artifact (`impact-analysis.md`) was not generated for this feature (the artifact folder does not contain it). This is acceptable because:
- The feature was analyzed with a light workflow (requirements + design, no separate impact analysis phase)
- All files listed in the module-design.md as needing changes are present in the working tree modifications
- No expected files are missing from the changeset

---

## 5. Test Results Summary

| Suite | Tests | Pass | Fail | Notes |
|-------|-------|------|------|-------|
| task-reader.test.js | 48 | 48 | 0 | New -- full v2.0 parser coverage |
| plan-surfacer.test.js | 7 | 7 | 0 | New -- EARLY_PHASES + check() behavior |
| state-machine.test.js | 31 | 31 | 0 | 3 new regression tests |
| specs.test.js | 16 | 16 | 0 | TS-05 field check relaxed correctly |
| **Core suite (npm run test:core)** | **1389** | **1388** | **1** | Pre-existing: codex-adapter-parity (unrelated) |

---

## 6. Build Integrity

Build verification: `npm run test:core` completes successfully. The 1 failing test (`codex-adapter-parity.test.js`) is a pre-existing failure unrelated to REQ-GH-212. All 58 new tests pass. No compilation errors. The project is ESM-based with no build step beyond test execution.

**Verdict**: PASS -- build is clean (pre-existing failure documented).

---

## 7. Constitutional Compliance

| Article | Requirement | Status |
|---------|-------------|--------|
| **V (Simplicity First)** | No unnecessary complexity | COMPLIANT -- Single module (task-reader.js) serves both providers. No over-engineering: the parser is straightforward regex-based, the injection pattern reuses existing prompt injection mechanisms. |
| **VI (Code Review Required)** | Code reviewed before gate passage | COMPLIANT -- This report constitutes the Phase 08 code review. All 18 files reviewed. |
| **VII (Artifact Traceability)** | Code traces to requirements | COMPLIANT -- Every file change traces to specific FRs and ADRs. Module-design.md lists all 12 changes with their FR references. Test files carry TR- prefixes and reference AC identifiers. No orphan code, no unimplemented requirements. |
| **VIII (Documentation Currency)** | Documentation updated with code | COMPLIANT -- Agent specs updated for all 4 phases (04, 05, 07, 16). Roundtable analyst updated with PRESENTING_TASKS state and Section 5.6. SKILL.md updated with light-workflow derivation. isdlc.md updated with BUILD-INIT COPY and TASK_CONTEXT INJECTION. |
| **IX (Quality Gate Integrity)** | All required artifacts exist, quality standards met | COMPLIANT -- code-review-report.md (this document) produced. 58 new tests passing. 0 regressions. All 11 FRs verified. |

---

## 8. QA Sign-Off

**Status**: QA APPROVED

**Conditions**: None. The implementation is complete, well-tested, architecturally sound, and constitutionally compliant.

**Phase Timing Report**: `{ "debate_rounds_used": 0, "fan_out_chunks": 0 }`
