# Implementation Notes: Task List Consumption Model

**Slug**: REQ-GH-212-task-list-consumption-model-for-build-phase-agents
**Phase**: 06 - Implementation
**Date**: 2026-03-26

---

## Key Decisions

### 1. Provider-Neutral Task Reader (ADR-001)

Created `src/core/tasks/task-reader.js` as a pure ESM module with three exports:
- `readTaskPlan(tasksPath)` - Parses v2.0 tasks.md into structured TaskPlan object
- `getTasksForPhase(plan, phaseKey)` - Extracts tasks for a specific phase
- `formatTaskContext(plan, phaseKey, options)` - Formats TASK_CONTEXT block for prompt injection

The module uses synchronous I/O (readFileSync) to avoid async complexity in the hook/projection context. All errors are caught and returned as objects -- the module never throws (AC-011-04).

### 2. TASK_CONTEXT Injection (ADR-002)

Added injection at two points:
- **Claude path**: Step 3d of isdlc.md phase-loop, after BUDGET DEGRADATION INJECTION
- **Codex path**: projection.js `projectInstructions()`, before contract summary injection

Both paths are fail-open: if tasks.md is missing or malformed, injection is skipped silently.

### 3. Plan-Surfacer Phase 05 Gate (ADR-005)

Removed `'05-test-strategy'` from the `EARLY_PHASES` constant in plan-surfacer.cjs. Phase 05 now requires tasks.md to exist before proceeding, same as Phase 06+.

### 4. State Machine (ADR-004)

T0015 was a no-op -- `PRESENTING_TASKS` was already in `tierPaths.light` from REQ-GH-208. Added 3 regression guard tests to prevent future removal.

### 5. Build-Init Copy (FR-004)

Added BUILD-INIT COPY step to isdlc.md between Step 1 (orchestrator init) and Step 2 (foreground tasks). Copies pre-generated tasks.md from the artifact folder to docs/isdlc/ with retry logic (up to 3 retries).

### 6. Light-Workflow Task Derivation (FR-001, FR-002)

Added light-workflow derivation algorithm to ORCH-012 SKILL.md. When design artifacts are unavailable (light workflow), file paths are derived from requirements-spec.md and impact-analysis.md blast radius.

### 7. Team Instance Updates

Added `task_context_instructions` fields to:
- `debate-test-strategy.js` - Creator, Critic, Refiner roles
- `implementation-review-loop.js` - Writer, Reviewer roles
- `quality-loop.js` - Track A, Track B

Updated `specs.test.js` to use `includes()` instead of `deepEqual()` for field validation, allowing optional extension fields.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/core/tasks/task-reader.js` | Provider-neutral task plan parser (180 LOC) |
| `tests/core/tasks/task-reader.test.js` | 48 unit tests for task reader |
| `tests/hooks/plan-surfacer.test.js` | 7 unit tests for plan-surfacer Phase 05 gate |
| `tests/core/tasks/fixtures/*.md` | 7 test fixtures for parser edge cases |

## Files Modified

| File | Change |
|------|--------|
| `src/claude/hooks/plan-surfacer.cjs` | Removed '05-test-strategy' from EARLY_PHASES |
| `src/providers/codex/projection.js` | Added TASK_CONTEXT injection via task-reader |
| `src/claude/commands/isdlc.md` | Added BUILD-INIT COPY step and TASK_CONTEXT INJECTION block |
| `src/claude/skills/orchestration/generate-plan/SKILL.md` | Added light-workflow task derivation section |
| `src/claude/agents/04-test-design-engineer.md` | Added Task-Driven Test Design section |
| `src/claude/agents/05-software-developer.md` | Added Task-Driven Implementation section |
| `src/claude/agents/16-quality-loop-engineer.md` | Added Task-Driven Verification section |
| `src/claude/agents/07-qa-engineer.md` | Added Task-Driven Review section |
| `src/claude/agents/roundtable-analyst.md` | Added PRESENTING_TASKS state, light-tier task generation |
| `src/core/teams/instances/debate-test-strategy.js` | Added task_context_instructions per role |
| `src/core/teams/specs/implementation-review-loop.js` | Added task_context field |
| `src/core/teams/instances/quality-loop.js` | Added task_context_instructions per track |
| `tests/core/analyze/state-machine.test.js` | Added 3 regression guard tests |
| `tests/core/teams/specs.test.js` | Fixed field validation to allow optional fields |

## Test Results

- **New tests added**: 58 (48 task-reader + 7 plan-surfacer + 3 state-machine regression)
- **All new tests passing**: Yes
- **No regressions introduced**: Pre-existing failures unchanged
- **Pre-existing failures**: codex-adapter-parity (missing external module), runtime-validate-gate, prompt-format/invisible-framework (3 in lib/)
