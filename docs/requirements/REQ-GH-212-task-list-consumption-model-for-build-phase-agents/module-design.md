# Module Design: Task List Consumption Model for Build Phase Agents

**Slug**: REQ-GH-212-task-list-consumption-model-for-build-phase-agents
**Version**: 1.0.0

---

## 1. Overview

| Change | Location | Type | Responsibility |
|---|---|---|---|
| Task Reader Module | `src/core/tasks/task-reader.js` | New module | Parse v2.0 tasks.md into structured data |
| Phase-Loop TASK_CONTEXT Injection | `src/claude/commands/isdlc.md` step 3d | Step addition | Inject parsed tasks into Claude delegation prompts |
| Codex Projection Injection | `src/providers/codex/projection.js` | Section addition | Include parsed tasks in Codex instruction bundles |
| ORCH-012 Upgrade | `src/claude/skills/orchestration/generate-plan/SKILL.md` | Algorithm change | File-level tasks for all phases at initial generation |
| Plan-Surfacer Update | `src/claude/hooks/plan-surfacer.cjs` | Constant change | Remove 05-test-strategy from EARLY_PHASES |
| State Machine Update | `src/core/analyze/state-machine.js` | Constant change | Add PRESENTING_TASKS to tierPaths.light |
| Roundtable Light Fix | `src/claude/agents/roundtable-analyst.md` | Protocol change | Generate tasks from requirements + IA for light tier |
| Phase 05 Agent Spec | `src/claude/agents/04-test-design-engineer.md` | Section addition | Task-driven test design |
| Phase 06 Agent Spec | `src/claude/agents/05-software-developer.md` | Section addition | Task-driven implementation |
| Phase 16 Agent Spec | `src/claude/agents/16-quality-loop-engineer.md` | Section addition | Task-driven verification |
| Phase 08 Agent Spec | `src/claude/agents/07-qa-engineer.md` | Section addition | Task-driven review |
| Codex Team Instances | `src/core/teams/instances/*.js` | Instruction update | Task context in Creator/Writer/Track roles |

---

## 2. Task Reader Module (`src/core/tasks/task-reader.js`)

### Public Interface

```js
/**
 * Read and parse a v2.0 tasks.md file.
 * @param {string} tasksPath - Absolute path to tasks.md
 * @returns {TaskPlan|null|{error: string, reason: string}}
 */
export function readTaskPlan(tasksPath)

/**
 * Extract tasks for a specific phase.
 * @param {TaskPlan} plan
 * @param {string} phaseKey - e.g. "06"
 * @returns {Task[]}
 */
export function getTasksForPhase(plan, phaseKey)

/**
 * Format tasks as a TASK_CONTEXT block for prompt injection.
 * @param {TaskPlan} plan
 * @param {string} phaseKey - Current phase
 * @param {Object} [options]
 * @param {boolean} [options.includeTestMapping] - Include task-to-test table (Phase 06/16)
 * @param {string} [options.testStrategyPath] - Path to test-strategy.md
 * @returns {string} Formatted TASK_CONTEXT block
 */
export function formatTaskContext(plan, phaseKey, options)
```

### Data Structures

```js
/** @typedef {Object} TaskPlan
 * @property {string} slug
 * @property {string} format - "v2.0"
 * @property {Object<string, PhaseSection>} phases - Keyed by phase number
 * @property {Summary} summary
 * @property {string[]} [warnings] - Non-fatal parse issues
 */

/** @typedef {Object} PhaseSection
 * @property {string} name
 * @property {string} status - "PENDING"|"IN PROGRESS"|"COMPLETE"
 * @property {Task[]} tasks
 */

/** @typedef {Object} Task
 * @property {string} id - e.g. "T0008"
 * @property {string} description
 * @property {boolean} parallel - true if [P] marker
 * @property {boolean} complete - true if [X]
 * @property {TaskFile[]} files
 * @property {string[]} blockedBy
 * @property {string[]} blocks
 * @property {string[]} traces
 */

/** @typedef {Object} TaskFile
 * @property {string} path
 * @property {string} operation - "CREATE"|"MODIFY"|"VERIFY"|"REVIEW"|"EXTEND"
 */

/** @typedef {Object} Summary
 * @property {number} total
 * @property {Object<string, {total: number, done: number}>} byPhase
 */
```

### Parse Algorithm

```
1. Read file contents. If file not found → return null.
2. Extract header block (before first ## Phase). Parse slug, format version.
3. Split remaining content by ## Phase NN: headers.
4. For each phase section:
   a. Parse header: phase number, name, status (PENDING|IN PROGRESS|COMPLETE)
   b. For each line matching /^- \[([ X])\] (T\d{4})/
      - Extract: id, complete flag, description
      - Check for [P] marker → parallel = true
      - Check for | traces: → extract FR/AC refs
   c. For each indented sub-line (4-space indent):
      - files: → parse path + operation (CREATE|MODIFY|VERIFY|REVIEW|EXTEND)
      - blocked_by: → parse task ID list
      - blocks: → parse task ID list
5. Build Summary from parsed phases.
6. Validate:
   a. No duplicate task IDs
   b. All blocked_by/blocks references point to existing task IDs
   c. No self-references in blocked_by
7. If validation fails → add to warnings[] (non-fatal)
8. Return TaskPlan object.
```

### Error Handling

- File not found → return `null`
- File exists but empty → return `{ error: "parse_failed", reason: "empty file" }`
- No phase sections found → return `{ error: "parse_failed", reason: "no phase sections" }`
- Partial parse success → return TaskPlan with `warnings[]` array

---

## 3. TASK_CONTEXT Injection — Phase-Loop (Claude)

### Location
`src/claude/commands/isdlc.md` step 3d, after BUDGET DEGRADATION INJECTION.

### Injection Logic

```
TASK_CONTEXT INJECTION (fail-open):
1. Import readTaskPlan, formatTaskContext from src/core/tasks/task-reader.js
2. Call readTaskPlan(path.join(projectRoot, 'docs/isdlc/tasks.md'))
3. If null or error: SKIP injection (log warning if error)
4. Determine options:
   - includeTestMapping = phase_key in ['06-implementation', '16-quality-loop']
   - testStrategyPath = docs/requirements/{artifact_folder}/test-strategy.md
5. Call formatTaskContext(plan, phaseKey, options)
6. Append result to delegation prompt
```

### TASK_CONTEXT Block Format

```
TASK_CONTEXT:
  phase: "05"
  total_tasks: 4
  tasks:
    - id: T0001
      description: "Design test cases for state machine transitions"
      files: [{path: "src/core/analyze/state-machine.js", operation: "MODIFY"}]
      blocked_by: []
      blocks: [T0005]
      traces: [FR-002, AC-002-01]
      status: pending
  dependency_summary:
    critical_path_length: 8
    parallel_tiers: 4
    tier_0_tasks: [T0001, T0003, T0004, T0010]
  test_mapping: null
```

When `includeTestMapping = true` and test-strategy.md contains a task-to-test table:

```
  test_mapping:
    T0005: {test_file: "tests/core/analyze/state-machine.test.js", scenarios: 5}
    T0006: {test_file: "tests/core/orchestration/analyze.test.js", scenarios: 3}
```

---

## 4. TASK_CONTEXT Injection — Codex Projection

### Location
`src/providers/codex/projection.js`, in `projectInstructions()` method.

### Change

```js
// After skills injection, before contract summary:
import { readTaskPlan, formatTaskContext } from '../../core/tasks/task-reader.js';

const tasksPath = path.join(projectRoot, 'docs/isdlc/tasks.md');
const taskPlan = readTaskPlan(tasksPath);
if (taskPlan && !taskPlan.error) {
  const includeTestMapping = ['06-implementation', '16-quality-loop'].includes(phase);
  const testStrategyPath = path.join(projectRoot, 'docs/requirements', artifactFolder, 'test-strategy.md');
  const taskBlock = formatTaskContext(taskPlan, phase, { includeTestMapping, testStrategyPath });
  sections.push(taskBlock);
}
```

---

## 5. ORCH-012 Upgrade (3e-plan)

### Location
`src/claude/skills/orchestration/generate-plan/SKILL.md`

### Algorithm Changes

Current: Phase 06 tasks are high-level (no files:, blocked_by:, blocks:).

Updated: ALL phase tasks have file-level detail at initial generation.

```
Phase 05 task generation:
  For each FR/AC group in requirements-spec.md:
    Create one task per test file needed
    files: test file path (CREATE or EXTEND)
    traces: matching FR/AC refs
    blocked_by: none (all Phase 05 tasks independent)
    blocks: corresponding Phase 06 task that implements the feature

Phase 06 task generation:
  WITH design artifacts (standard workflow):
    For each module in module-design.md:
      For each file in the module's public interface:
        Create one task per file
        files: file path (CREATE or MODIFY)
        blocked_by: computed from import dependencies
        blocks: computed from inverse dependencies
        traces: FR/AC mapped from module responsibility

  WITHOUT design artifacts (light workflow):
    For each FR in requirements-spec.md:
      Derive likely file paths from impact-analysis.md blast radius
      Create one task per file or tightly coupled file group
      files: best-effort file paths (CREATE or MODIFY)
      blocked_by: inferred from FR dependency mapping
      traces: FR/AC directly from requirements

Phase 16 task generation:
  For each Phase 06 task:
    Create one verification task
    files: same file path (VERIFY)
    blocked_by: none (all verification tasks independent within track)
    blocks: final traceability task
    traces: same traces as the Phase 06 task
  Create one traceability summary task:
    blocked_by: all verification tasks
    traces: all FRs

Phase 08 task generation:
  Group Phase 06 tasks by related modules (2-3 tasks per review unit)
  For each review group:
    Create one review task
    files: all files from grouped tasks (REVIEW)
    blocked_by: none (review units independent)
    blocks: final sign-off task
    traces: union of grouped task traces
  Create one cross-cutting review task:
    blocked_by: all review tasks
    traces: all FRs
```

---

## 6. Plan-Surfacer Update

### Location
`src/claude/hooks/plan-surfacer.cjs`, line 42-50.

### Change

```js
// Before:
const EARLY_PHASES = ['00-quick-scan', '01-requirements', '02-impact-analysis',
  '02-tracing', '03-architecture', '04-design', '05-test-strategy'];

// After:
const EARLY_PHASES = ['00-quick-scan', '01-requirements', '02-impact-analysis',
  '02-tracing', '03-architecture', '04-design'];
```

---

## 7. State Machine Update (Light Tier)

### Location
`src/core/analyze/state-machine.js`

### Change

```js
// Before:
light: Object.freeze(['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN']),

// After:
light: Object.freeze(['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']),
```

---

## 8. Agent Spec Changes

### 04-test-design-engineer.md (Phase 05)

New section: **"Task-Driven Test Design"**

```
When TASK_CONTEXT is present in the delegation prompt:

1. Parse the TASK_CONTEXT block to extract Phase 06 implementation tasks
2. For each Phase 06 task (TNNNN):
   a. Read the task's files[] to identify the file under test
   b. Read the task's traces[] to identify the FR/AC being implemented
   c. Generate one test case:
      - Test file: derive from file under test (e.g., src/core/foo.js → tests/core/foo.test.js)
      - Scenarios: based on the AC descriptions from requirements-spec.md
      - Traces: carry forward from the task
3. Write the task-to-test traceability table in test-strategy.md:
   | Task | File Under Test | Test File | Traces | Scenarios |
4. Phase 05's own tasks (from TASK_CONTEXT phase "05") describe the work units
   for this phase — one task per test design activity

When TASK_CONTEXT is absent:
  Fall back to existing behavior (self-decompose from requirements + design artifacts)
```

### 05-software-developer.md (Phase 06)

New section: **"Task-Driven Implementation"**

```
When TASK_CONTEXT is present in the delegation prompt:

1. Parse the TASK_CONTEXT block to extract Phase 06 tasks
2. Read test_mapping (if present) to get task-to-test file mapping
3. Compute dependency tiers:
   - Tier 0: tasks with empty blocked_by (after excluding completed [X] tasks)
   - Tier N: tasks blocked only by Tier 0..N-1 tasks
4. Execute tasks in tier order (Tier 0 first):
   For each task in the current tier:
     a. If task has [P] marker and other [P] tasks in same tier: can run concurrently
     b. For each file in the task's files[]:
        - If test_mapping has a test file for this task: write test file FIRST (TDD)
        - Then write production file
        - WRITER_CONTEXT includes: { task: { id, traces, testFile } }
        - Reviewer validates against the task's traces (FR/AC)
     c. After all files produced and reviewed: mark task [X] in tasks.md
5. Continue to next tier until all tasks complete

When TASK_CONTEXT is absent:
  Fall back to existing behavior (self-decompose from design artifacts)
```

### 16-quality-loop-engineer.md (Phase 16)

New section: **"Task-Driven Verification"**

```
When TASK_CONTEXT is present in the delegation prompt:

Track A (Testing):
1. Parse Phase 06 tasks from TASK_CONTEXT (all should be [X] complete)
2. For each task:
   a. Verify test file exists (from test_mapping)
   b. Run tests for that file
   c. Check coverage on the task's files[]
3. Fan-out grouping: files from the same task stay in the same chunk

Track B (Automated QA):
1. Parse all tasks from TASK_CONTEXT
2. For each [X] task:
   a. Verify file changes exist in working tree (git diff)
   b. If no changes found for an [X] task: flag completion gap
3. Cross-reference all traces[] against requirements-spec.md:
   a. For each FR/AC in traces: verify at least one passing test exists
   b. Report traceability coverage percentage

When TASK_CONTEXT is absent:
  Fall back to existing behavior (run checks without task-level granularity)
```

### 07-qa-engineer.md (Phase 08)

New section: **"Task-Driven Review"**

```
When TASK_CONTEXT is present in the delegation prompt:

1. Parse Phase 06 tasks from TASK_CONTEXT
2. Each task becomes one review unit:
   a. Review scope: the task's files[] (all files reviewed together as cohesive change)
   b. Review context: the task's description and traces[]
3. Apply the standard review checklist to each review unit
4. Fan-out grouping: task units are the chunks (not directory grouping)
   - If task count < min_files_threshold: fall back to directory grouping
5. In code-review-report.md, each finding includes:
   - Task ID (TNNNN)
   - FR/AC traces from the task
   - File and line range
6. Cross-cutting review (final task): review interactions BETWEEN task units

When TASK_CONTEXT is absent:
  Fall back to existing behavior (group review by directory)
```

---

## 9. Codex Team Instance Changes

### debate-test-strategy.js (Phase 05)
- Creator role: "Read TASK_CONTEXT, generate 1:1 test cases per Phase 06 task, write task-to-test table"
- Critic role: "Validate every Phase 06 task has a test case, check traces carried forward"
- Refiner role: "Address Critic gaps, ensure traceability table complete"

### implementation-review-loop.js (Phase 06)
- Writer role: "Read TASK_CONTEXT, execute tasks in dependency order, use test_mapping for TDD"
- Reviewer role: "Validate each file against its task's traces"
- Updater role: unchanged (fixes what Reviewer flags)

### quality-loop.js (Phase 16)
- Track A instructions: "Read TASK_CONTEXT, verify test coverage per task file"
- Track B instructions: "Read TASK_CONTEXT, verify traceability per task traces, detect completion gaps"

### Phase 08 projection
- Review instructions: "Read TASK_CONTEXT, structure review by task unit, group fan-out by task"

---

## 10. Estimated Size

| Change | Location | Lines |
|---|---|---|
| task-reader.js (new) | src/core/tasks/ | ~180 |
| task-reader.test.js (new) | tests/core/tasks/ | ~150 |
| Phase-loop TASK_CONTEXT injection | src/claude/commands/isdlc.md | ~25 |
| Codex projection injection | src/providers/codex/projection.js | ~15 |
| ORCH-012 upgrade | src/claude/skills/.../SKILL.md | ~60 |
| Plan-surfacer update | src/claude/hooks/plan-surfacer.cjs | ~3 |
| State machine update | src/core/analyze/state-machine.js | ~3 |
| Roundtable light tier fix | src/claude/agents/roundtable-analyst.md | ~15 |
| Phase 05 agent spec | src/claude/agents/04-test-design-engineer.md | ~40 |
| Phase 06 agent spec | src/claude/agents/05-software-developer.md | ~30 |
| Phase 16 agent spec | src/claude/agents/16-quality-loop-engineer.md | ~30 |
| Phase 08 agent spec | src/claude/agents/07-qa-engineer.md | ~25 |
| Codex team instance updates | src/core/teams/instances/*.js | ~40 |
| **Total** | | **~616 lines** |

### Tests Needed

| Test File | Tests | Scope |
|---|---|---|
| tests/core/tasks/task-reader.test.js (new) | ~20 | Parse v2.0, phase extraction, error handling, null/malformed |
| tests/core/analyze/state-machine.test.js (extend) | ~3 | Light tier includes PRESENTING_TASKS |
| tests/hooks/plan-surfacer.test.js (extend) | ~3 | Phase 05 blocked when tasks.md missing |
| Integration tests for TASK_CONTEXT injection | ~8 | Claude + Codex paths, with/without tasks.md |
| **Total new tests** | **~34** | |
