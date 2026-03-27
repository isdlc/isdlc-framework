# Architecture Overview: Task List Consumption Model for Build Phase Agents

**Slug**: REQ-GH-212-task-list-consumption-model-for-build-phase-agents
**Version**: 1.0.0

---

## 1. Architecture Options

### Option A: Provider-Neutral Core Module + Prompt Injection

| Aspect | Detail |
|---|---|
| **Summary** | New `src/core/tasks/task-reader.js` parses tasks.md into structured data. Phase-loop injects parsed tasks into delegation prompts (Claude) or instruction bundles (Codex). Each phase agent's spec describes phase-specific consumption logic. |
| **Pros** | Single parse implementation for both providers, provider-neutral orchestration unchanged, agent specs remain the source of phase-specific behavior |
| **Cons** | Task context increases prompt size (~500-1000 tokens per phase), agents must handle the TASK_CONTEXT block format |
| **Pattern Alignment** | Matches existing patterns: GATE REQUIREMENTS and WORKFLOW MODIFIERS are already injected into delegation prompts the same way |
| **Verdict** | **Selected** |

### Option B: Phase-Loop Drives Task Execution Directly

| Aspect | Detail |
|---|---|
| **Summary** | The phase-loop controller iterates over tasks within each phase, delegating per-task instead of per-phase. |
| **Pros** | Finer-grained control, smaller per-delegation prompts |
| **Cons** | Breaks 1-delegation-per-phase model, massive change to phase-loop, per-task delegation overhead, Codex needs N codex exec calls per phase |
| **Pattern Alignment** | Against current architecture |
| **Verdict** | Eliminated — too invasive |

### Option C: Agent-Side Parsing (No Core Module)

| Aspect | Detail |
|---|---|
| **Summary** | Each agent reads and parses tasks.md itself. No shared module. |
| **Pros** | Zero core infrastructure changes |
| **Cons** | 4 agents × 2 providers = 8 parsing implementations, format changes require 8 updates |
| **Pattern Alignment** | Against DRY |
| **Verdict** | Eliminated — unmaintainable |

---

## 2. Selected Architecture (ADRs)

### ADR-001: Provider-Neutral Task Reader in src/core/tasks/

- **Status**: Accepted
- **Context**: Four phases need to parse the same v2.0 tasks.md. Two providers need parsed data in different delivery formats.
- **Decision**: Create `src/core/tasks/task-reader.js` with `readTaskPlan(tasksPath)`. Phase-loop (Claude) and projection layer (Codex) both call this module.
- **Rationale**: Single parse implementation. Provider-neutral. Testable in isolation. Follows existing src/core/ pattern.
- **Consequences**: New module to maintain. Format changes need one update point.

### ADR-002: TASK_CONTEXT Injection Block

- **Status**: Accepted
- **Context**: Phase agents need task data. Existing pattern injects context blocks into delegation prompts.
- **Decision**: Add TASK_CONTEXT block after existing injections. Contains phase-specific tasks, dependency summary, and task-to-test mapping (when available). Claude: injected in phase-loop step 3d. Codex: injected in projection.js.
- **Rationale**: Consistent with GATE REQUIREMENTS and WORKFLOW MODIFIERS injection patterns.
- **Consequences**: Prompt size increases ~500-1000 tokens. Agents handle block format.

### ADR-003: 3e-plan Upgrade Strategy

- **Status**: Accepted
- **Context**: Current 3e-plan produces high-level stubs. File-level detail needed for all phases.
- **Decision**: Upgrade ORCH-012 SKILL.md to produce file-level tasks across all phases at initial generation. When design artifacts unavailable (light workflow), derive file paths from requirements + impact analysis.
- **Rationale**: ORCH-012 already owns task generation. Extending is simpler than new module. v2.0 format unchanged.
- **Consequences**: 3e-refine becomes a refinement pass rather than the only source of file-level tasks.

### ADR-004: Light Workflow Task Generation

- **Status**: Accepted
- **Context**: Light workflows skip Phase 03/04. Roundtable currently skips PRESENTING_TASKS for light.
- **Decision**: Remove the light-workflow skip. Update tierPaths.light to include PRESENTING_TASKS. Roundtable generates tasks from requirements + impact analysis.
- **Rationale**: User requirement: tasks.md must always have file-level detail by Phase 05.
- **Consequences**: Light analysis slightly longer. File paths less precise without design docs.

### ADR-005: Plan-Surfacer Phase 05 Gate

- **Status**: Accepted
- **Context**: Plan-surfacer lists Phase 05 as EARLY_PHASE (no tasks.md required).
- **Decision**: Remove `05-test-strategy` from EARLY_PHASES. Phase 05 blocked if tasks.md missing, triggering 3f-retry-protocol.
- **Rationale**: Enforces the always-file-level guarantee.
- **Consequences**: Builds without prior analysis generate tasks.md between Phase 01 and Phase 05.

### ADR-006: Task-to-Test Mapping Carry-Forward

- **Status**: Accepted
- **Context**: Phase 05 produces task-to-test mapping. Phase 06 needs it for TDD. Phase 16 needs it for coverage.
- **Decision**: Mapping written as section in test-strategy.md. Task reader parses it and includes in TASK_CONTEXT for Phase 06 and 16.
- **Rationale**: Follows existing artifact chain pattern.
- **Consequences**: test-strategy.md gets a new required section.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|---|---|---|---|
| src/core/tasks/task-reader.js (ESM) | N/A | Provider-neutral module following existing src/core/ pattern | Agent-side parsing (rejected — 8 implementations), phase-loop task driving (rejected — too invasive) |
| TASK_CONTEXT prompt injection | N/A | Extends existing injection pattern (GATE REQUIREMENTS, WORKFLOW MODIFIERS) | Separate file read by agent (rejected — duplicated I/O) |
| v2.0 task format (unchanged) | 2.0 | Existing format from ORCH-012 | New format (rejected — breaks downstream consumers) |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|---|
| INT-001 | task-reader.js | docs/isdlc/tasks.md | File read + parse | v2.0 markdown → JSON | null if missing, error object if malformed |
| INT-002 | Phase-loop (step 3d) | task-reader | Function call | readTaskPlan() → JSON | Omit TASK_CONTEXT if null |
| INT-003 | Codex projection.js | task-reader | Function call | readTaskPlan() → JSON | Omit TASK_CONTEXT if null |
| INT-004 | ORCH-012 (3e-plan) | docs/isdlc/tasks.md | File write | v2.0 markdown (file-level) | Retry per FR-005 |
| INT-005 | plan-surfacer | docs/isdlc/tasks.md | File existence check | N/A | Block Phase 05+ if missing |
| INT-006 | Phase 05 agent | TASK_CONTEXT block | Prompt injection | JSON tasks array | Fall back to self-decomposition |
| INT-007 | Phase 05 output | test-strategy.md | File write | Task-to-test table | Phase 06/16 handle absence |
| INT-008 | Phase 06 agent | TASK_CONTEXT block | Prompt injection | JSON tasks + test mapping | Execute in dependency order |
| INT-009 | Phase 16 dual-track | TASK_CONTEXT block | Prompt injection | JSON tasks + test mapping | Verify coverage per task |
| INT-010 | Phase 08 agent | TASK_CONTEXT block | Prompt injection | JSON tasks (review units) | Group review by task |

### Data Flow

```
Analyze:
  Roundtable → generates tasks.md (all phases) → PRESENTING_TASKS → Accept
  → Batch write to docs/requirements/{slug}/tasks.md

Build init:
  Copy {slug}/tasks.md → docs/isdlc/tasks.md
  OR 3e-plan generates file-level tasks.md (if no pre-existing)

Phase 05:
  task-reader.readTaskPlan() → TASK_CONTEXT injected
  → Agent extracts Phase 05 tasks → 1:1 test case mapping per Phase 06 task
  → Writes task-to-test table in test-strategy.md

Phase 06:
  task-reader.readTaskPlan() → TASK_CONTEXT injected (includes test mapping)
  → Agent extracts Phase 06 tasks → dependency-ordered execution
  → Writer/Reviewer/Updater per file within each task (Claude)
  → implementation-review-loop team instance (Codex)
  → Marks tasks [X] as completed

Phase 16:
  task-reader.readTaskPlan() → TASK_CONTEXT injected (includes test mapping)
  → Track A: verify test coverage per task file
  → Track B: verify FR/AC traceability via traces annotations
  → Fan-out chunks grouped by task

Phase 08:
  task-reader.readTaskPlan() → TASK_CONTEXT injected
  → Agent structures review by task unit
  → Fan-out chunks grouped by task (not directory)
  → Findings traced to task ID + FR/AC
```

---

## 5. Summary

| Metric | Value |
|---|---|
| New files | 1 (`src/core/tasks/task-reader.js`) |
| Modified files | ~10 (ORCH-012 skill, plan-surfacer hook, state-machine.js, projection.js, isdlc.md, 4 agent specs, Codex team instances) |
| Risk level | Low — additive changes, provider-neutral pattern, backward compatible |
| Key decision | Provider-neutral task reader + TASK_CONTEXT injection (ADR-001, ADR-002) |
| Key trade-off | Prompt size increase vs duplicated parsing — accepted prompt increase |
| Dependencies | REQ-GH-208 (task generation must be built first) |
