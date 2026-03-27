---
name: generate-plan
description: Generate a detailed task plan (tasks.md v2.0) from workflow definition, Phase 01 artifacts, and requirements traceability
skill_id: ORCH-012
owner: sdlc-orchestrator
collaborators: []
project: sdlc-framework
version: 2.0.0
when_to_use: After GATE-01 passes, after branch already created during init, for feature/fix workflows
dependencies: [ORCH-001]
traces: FR-01, FR-02, FR-03, FR-06, ADR-0001, ADR-0004, NFR-02, NFR-04
---

# Generate Plan

## Purpose

Generate a persistent task plan file (`docs/isdlc/tasks.md`) using the v2.0 format that shows the user all planned work across every phase of the active workflow. The plan provides phase-grouped, numbered tasks with progress tracking via checkboxes, traceability annotations linking tasks to requirements, and summary sections for traceability and progress. Phase agents update this file as they complete work, giving the user a single view of overall progress.

## When to Use

- After GATE-01 passes for `feature` or `fix` workflows
- Branch already created during workflow initialization (Section 3a of the orchestrator)
- **Skip** for `test-run` and `test-generate` workflows (too few phases; TaskCreate spinners are sufficient)

## Prerequisites

- GATE-01 has passed
- `active_workflow` exists in state.json with a valid `type`
- Phase 01 artifacts exist (requirements-spec.md or bug-report.md)
- `.isdlc/templates/workflow-tasks-template.md` is accessible

## Process

### Step 1: Read Workflow Context

```
1. Read active_workflow from .isdlc/state.json
2. Extract: type, artifact_folder, phases array
3. Read Phase 01 artifacts to understand scope:
   - feature: docs/requirements/REQ-NNNN-*/requirements-spec.md
   - fix: docs/requirements/BUG-NNNN-*/bug-report.md
4. [NEW] Read requirements-spec.md to extract REQ-NNN and AC-NNx identifiers:
   - Parse all "### FR-NN:" headings to extract functional requirement IDs
   - Parse all "- AC-NNx:" lines to extract acceptance criterion IDs
   - Build a lookup table: { FR-NN: [AC-NNa, AC-NNb, ...] }
   - For fix workflows: extract AC IDs from bug-report.md acceptance criteria
5. [NEW] If requirements-spec.md is not found or has no REQ/AC identifiers:
   - Continue without traceability tags (graceful degradation)
   - Log warning: "No requirement identifiers found; tasks will lack traces"
```

**Inputs**:
| Input | Path | Required | Purpose |
|-------|------|----------|---------|
| state.json | `.isdlc/state.json` | YES | Workflow type, phases, artifact folder |
| requirements-spec.md | `docs/requirements/{folder}/requirements-spec.md` | NO (graceful) | REQ/AC identifiers for traceability |
| bug-report.md | `docs/requirements/{folder}/bug-report.md` | NO (fix only) | AC identifiers for bug fix traceability |

### Step 2: Load Template

```
1. Read .isdlc/templates/workflow-tasks-template.md
2. Locate the section matching active_workflow.type (## feature or ## fix)
3. Extract task descriptions for each phase listed in the workflow
```

No changes from v1.0. The template continues to provide plain-text descriptions.

### Step 3: Generate Task IDs and Format

```
For each phase in the workflow's phases array:
  1. Start task counter at T0001 (incrementing across all phases)
  2. For each task description in the template:
     a. Format base line: - [ ] TNNNN Description
     b. Add [P] marker if phase is parallel-eligible (see Step 4)
     c. [NEW] Add traceability annotation:
        - Map the task description to the most relevant FR-NN and AC-NNx
        - Append after description: | traces: FR-NN, AC-NNa [, AC-NNb ...]
        - Mapping heuristic: match task keywords against FR descriptions
          and AC text. Each task should trace to at least one FR.
        - If no match found: omit traces annotation (do NOT force a match)
     d. [NEW] For implementation phase tasks ONLY:
        - Do NOT add file-level annotations at this stage
        - File-level detail is added later by the refinement step (Section 3c)
        - Implementation tasks remain high-level with traces only
  3. Group under phase header with status:
     - Phase 01: ## Phase NN: Name -- COMPLETE (mark all tasks [X])
     - All others: ## Phase NN: Name -- PENDING
```

### Step 4: Add Parallel Markers

Apply `[P]` markers based on workflow type:

| Workflow | Parallel Phases | Condition |
|----------|-----------------|-----------|
| feature | 06-testing, 09-cicd | Both can start after Phase 10 completes |
| fix | 06-testing, 09-cicd | Both can start after Phase 10 completes |

Markers are **informational only** -- the orchestrator still executes sequentially. They signal future parallelization opportunities.

Format for parallel tasks: `- [ ] TNNNN [P] Description`

### Step 5: Add Summary Sections

After generating all phase sections, add the following sections at the bottom of the document:

#### 5a. Traceability Matrix Section

```markdown
## Traceability Matrix

### Requirement Coverage
| Requirement | ACs | Tasks | Coverage |
|-------------|-----|-------|----------|
| FR-01 | AC-01a, AC-01b, AC-01c | T0001, T0040 | 3/3 (100%) |
| FR-02 | AC-02a, AC-02b | T0002 | 2/2 (100%) |
| ... | ... | ... | ... |

### Orphan Tasks (No Traceability)
- T0055 Description (no matching requirement found)

### Uncovered Requirements
- FR-09 AC-09c (no task covers this acceptance criterion)
```

**Generation algorithm**:
1. Iterate all tasks. Group by their `traces:` values.
2. For each FR-NN: count how many of its ACs appear in task traces.
3. Coverage = (ACs-in-traces / total-ACs-for-FR) as percentage.
4. Orphan tasks: tasks without any `traces:` annotation.
5. Uncovered requirements: ACs not referenced by any task.

#### 5b. Progress Summary Section

```markdown
## Progress Summary

| Phase | Status | Tasks | Complete | Blocked |
|-------|--------|-------|----------|---------|
| 01 Requirements | COMPLETE | 7 | 7 | 0 |
| 02 Architecture | PENDING | 7 | 0 | 0 |
| ... | ... | ... | ... | ... |
| **TOTAL** | | **63** | **7** | **0** |

**Progress**: 7 / 63 tasks (11%) | 0 blocked
**Traceability**: 38/38 AC covered (100%)
```

The Blocked column is always 0 at generation time (BLOCKED status is only set during mechanical execution).

**NOTE**: The Dependency Graph section is NOT generated at this step. It is generated by the refinement step (Section 3c) after design artifacts exist. At initial generation, Phase 06 tasks are high-level and have no inter-task dependencies.

### Step 6: Write tasks.md

```
1. Compose the full document with:
   - Header block (including Format: v2.0)
   - Phase sections with annotated tasks
   - Traceability Matrix section
   - Progress Summary section
2. Write to docs/isdlc/tasks.md (single-project) or
   docs/isdlc/projects/{project-id}/tasks.md (monorepo)
3. Display the full plan to the user with announcement banner
```

### Step 7: Display to User

Output the full plan with a banner:

```
================================================================
  TASK PLAN: {type} {artifact_folder}
================================================================

[Full tasks.md content]

================================================================
  Summary: {total} tasks across {phase_count} phases | {done} completed | {traced} traced | {parallel} parallel phases
================================================================
```

## Output Format

The generated `tasks.md` follows the v2.0 structure:

```markdown
# Task Plan: {type} {artifact_folder}

Generated: {ISO-8601 timestamp}
Workflow: {type}
Format: v2.0
Phases: {count}

---

## Phase 01: Requirements Capture -- COMPLETE
- [X] T0001 Discover project context and business requirements | traces: FR-01, AC-01a
- [X] T0002 Identify users and define personas | traces: FR-01, AC-01b
- [X] T0003 Write user stories with acceptance criteria | traces: FR-01, AC-01c, AC-01d
...

## Phase 03: System Design -- PENDING
- [ ] T0015 Design interface specifications (API contracts) | traces: FR-06, AC-06a, AC-06b
- [ ] T0016 Create module designs | traces: FR-01, AC-01c
...

## Phase 06: Implementation -- PENDING
- [ ] T0030 Check existing test infrastructure | traces: NFR-02
- [ ] T0031 Write failing unit tests (TDD Red) | traces: FR-01, FR-02
- [ ] T0032 Implement code to pass tests (TDD Green) | traces: FR-01, FR-02, FR-03
- [ ] T0033 Iterate until all tests pass with 80% coverage | traces: NFR-01
- [ ] T0034 Refactor and validate code quality | traces: NFR-03
- [ ] T0035 Validate constitutional compliance | traces: C-01, C-02
...

## Phase 07: Integration Testing [P] -- PENDING
- [ ] T0040 [P] Read testing environment URL from state | traces: NFR-01
- [ ] T0041 [P] Run integration tests | traces: FR-01
...

---

## Traceability Matrix

### Requirement Coverage
| Requirement | ACs | Tasks | Coverage |
|-------------|-----|-------|----------|
| FR-01 | AC-01a, AC-01b | T0001, T0002 | 2/2 (100%) |
...

### Orphan Tasks (No Traceability)
(none)

### Uncovered Requirements
(none)

## Progress Summary

| Phase | Status | Tasks | Complete | Blocked |
|-------|--------|-------|----------|---------|
| 01 Requirements | COMPLETE | 7 | 7 | 0 |
| 03 System Design | PENDING | 6 | 0 | 0 |
| 06 Implementation | PENDING | 6 | 0 | 0 |
| **TOTAL** | | **19** | **7** | **0** |

**Progress**: 7 / 19 tasks (37%) | 0 blocked
**Traceability**: 12/12 AC covered (100%)
```

Note: Phase 06 tasks are HIGH-LEVEL at initial generation when design artifacts are available (standard workflow). The refinement step after GATE-04 adds full file-level detail. For light workflows without design artifacts, file-level detail is derived at generation time using the light-workflow derivation logic below.

### Light-Workflow Task Derivation (REQ-GH-212 FR-001, AC-001-02)

When design artifacts are NOT available (light workflow), derive file-level tasks from requirements and impact analysis:

```
For each phase in [05-test-strategy, 06-implementation, 16-quality-loop, 08-code-review]:

  Phase 05 task generation:
    For each FR/AC group in requirements-spec.md:
      Create one task per test file needed
      files: test file path (CREATE or EXTEND)
      traces: matching FR/AC refs
      blocked_by: none (all Phase 05 tasks independent)
      blocks: corresponding Phase 06 task that implements the feature

  Phase 06 task generation (WITHOUT design artifacts):
    For each FR in requirements-spec.md:
      Derive likely file paths from impact-analysis.md blast radius
      Create one task per file or tightly coupled file group
      files: best-effort file paths (CREATE or MODIFY)
      blocked_by: inferred from FR dependency mapping
      blocks: computed from inverse dependencies
      traces: FR/AC directly from requirements

  Phase 16 task generation:
    For each Phase 06 task:
      Create one verification task
      files: same file path (VERIFY)
      blocked_by: none (all verification tasks independent within track)
      blocks: final traceability task
      traces: same traces as the Phase 06 task

  Phase 08 task generation:
    Group Phase 06 tasks by related modules (2-3 tasks per review unit)
    For each review group:
      Create one review task
      files: all files from grouped tasks (REVIEW)
      blocked_by: none (review units independent)
      blocks: final sign-off task
      traces: union of grouped task traces
```

**Inputs for light-workflow derivation**:
- `requirements-spec.md` — FR/AC identifiers and descriptions
- `impact-analysis.md` — blast radius file paths for best-effort file targeting

**Validation**: At least 80% of FRs should have at least one task with matching traces annotation. File paths are best-effort and may be less precise without design artifacts.

### Task Line EBNF

```ebnf
task_line     ::= checkbox SPACE task_id SPACE description [SPACE parallel_marker]
                  [SPACE pipe annotations] NEWLINE [sub_lines]
checkbox      ::= "- [ ]" | "- [X]" | "- [BLOCKED]"
task_id       ::= "T" DIGIT{4}
description   ::= TEXT
parallel_marker ::= "[P]"
pipe          ::= "|"
annotations   ::= annotation ("," annotation)*
annotation    ::= SPACE key ":" SPACE value
key           ::= "traces" | "effort" | "priority" | IDENTIFIER
value         ::= TEXT

sub_lines     ::= (sub_line NEWLINE)*
sub_line      ::= INDENT structured_annotation
INDENT        ::= "  "
structured_annotation ::= dependency_annotation | file_annotation | blocked_annotation
dependency_annotation ::= ("blocked_by" | "blocks") ":" SPACE "[" task_id_list "]"
file_annotation       ::= "files:" SPACE file_spec ("," SPACE file_spec)*
blocked_annotation    ::= "reason:" SPACE TEXT
task_id_list  ::= task_id ("," SPACE task_id)*
file_spec     ::= file_path SPACE "(" file_action ")"
file_action   ::= "CREATE" | "MODIFY"
```

### Traceability Annotation Rules

1. Every task SHOULD have a `| traces:` annotation.
2. The traces value is a comma-separated list of FR-NNN, AC-NNx, NFR-NN, or C-NN identifiers.
3. At least one identifier per task (FR-NN level minimum).
4. AC-level granularity is preferred when the mapping is clear.
5. If no mapping is found, omit the traces annotation entirely (do not fabricate).
6. Multiple tasks may trace to the same FR/AC (many-to-many).

### Traceability Mapping Heuristic

Since the generate-plan skill is executed by an LLM (not deterministic code), the mapping uses natural language understanding:

```
For each task description:
  1. Read the task description text
  2. Read all FR-NN descriptions and their AC-NNx text
  3. Identify the FR(s) whose description most closely matches the task
  4. Within those FRs, identify the specific AC(s) the task addresses
  5. Assign: | traces: FR-NN, AC-NNa [, AC-NNb ...]

Validation:
  - After all tasks are annotated, check for uncovered FRs
  - If an FR has zero tasks tracing to it, emit a warning in the
    Traceability Matrix "Uncovered Requirements" section
  - If a task has no matching FR, list it in "Orphan Tasks"
```

## Phase Name Mapping

Use these display names for phase headers:

| Phase Key | Display Name |
|-----------|-------------|
| 00-quick-scan | Quick Scan |
| 01-requirements | Requirements Capture |
| 02-impact-analysis | Impact Analysis |
| 02-tracing | Bug Tracing |
| 03-architecture | Architecture Assessment |
| 04-design | System Design |
| 05-test-strategy | Test Strategy |
| 06-implementation | Implementation |
| 16-quality-loop | Quality Loop |
| 07-testing | Integration Testing |
| 08-code-review | Code Review & QA |
| 09-validation | Security Validation |
| 10-cicd | CI/CD Pipeline |
| 11-local-testing | Environment Build (Local) |
| 12-remote-build | Environment Build (Remote) |
| 12-test-deploy | Staging Deployment |
| 13-production | Production Release |
| 14-operations | Operations & Monitoring |

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| state.json | JSON | Yes | Active workflow with type, phases, artifact_folder |
| Phase 01 artifacts | Markdown | Yes | Requirements or bug report from Phase 01 |
| requirements-spec.md | Markdown | No (graceful) | REQ/AC identifiers for traceability annotations |
| workflow-tasks-template.md | Markdown | Yes | Template task descriptions by workflow and phase |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| docs/isdlc/tasks.md | Markdown (v2.0) | Persistent task plan with checkboxes, traceability, and progress |

## Monorepo Support

In monorepo mode, write the tasks file to the project-scoped path:
- **Single-project**: `docs/isdlc/tasks.md`
- **Monorepo**: `docs/isdlc/projects/{project-id}/tasks.md`

## Integration Points

- **Orchestrator (Agent 00)**: Invokes this skill after GATE-01; reads tasks.md for progress summaries at phase transitions
- **All Phase Agents (01-14)**: Read and update tasks.md via the PLAN INTEGRATION PROTOCOL v2
- **workflow-management (ORCH-001)**: Provides workflow definition as input
- **Refinement Step (Section 3c)**: After GATE-04, refines high-level Phase 06 tasks into file-level tasks

## Validation

After generating the complete tasks.md, validate:

1. **Sequential IDs**: Task IDs are T0001, T0002, ... with no gaps
2. **Phase coverage**: Every phase in `active_workflow.phases` has a section
3. **Phase 01 complete**: All Phase 01 tasks are marked `[X]`
4. **Others pending**: All non-Phase-01 tasks are marked `[ ]`
5. **Traceability coverage**: At least 80% of FRs have at least one task with traces (warning if below)
6. **No orphan phases**: No phase section exists for phases not in the workflow
7. **Format header**: `Format: v2.0` is present in the header block
8. **Progress consistency**: Progress Summary counts match actual checkbox counts
- `[P]` markers appear only on phases designated as parallel for the workflow type

## Backward Compatibility

Existing agents using the PLAN INTEGRATION PROTOCOL match these patterns:
- `## Phase NN:` -- locate phase section (UNCHANGED)
- `PENDING` / `IN PROGRESS` / `COMPLETE` -- phase status (UNCHANGED)
- `- [ ]` / `- [X]` -- checkbox toggle (UNCHANGED)
- `TNNNN` -- task IDs (UNCHANGED)

Pipe-delimited annotations after the description are ignored by agents that only regex-match `^- \[[ X]\] T\d{4}`. The `Format: v2.0` header signals enhanced format to parsers that want to consume annotations. Absence of this header means legacy format.
