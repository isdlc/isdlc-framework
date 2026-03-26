# Architecture Overview: Structured Task Breakdown from Analysis

**Slug**: REQ-GH-208-generate-structured-task-breakdown-artifact
**Version**: 1.0.0

---

## 1. Architecture Options

### Option A: Inline Generation in Roundtable (No New Modules)

| Aspect | Detail |
|---|---|
| **Summary** | The roundtable-analyst.md protocol gains a task generation step after design acceptance. All logic is in the protocol spec — no new JS modules. The roundtable uses its in-memory knowledge of all three artifacts to produce the task list. |
| **Pros** | Zero new code files, no context switch, all artifacts in memory, single batch write, minimal integration surface |
| **Cons** | Roundtable protocol file grows larger, task generation quality depends on the LLM's ability to derive dependencies from design artifacts |
| **Pattern Alignment** | Matches existing roundtable pattern — requirements, architecture, and design are all generated inline without separate modules |
| **Verdict** | **Selected** |

### Option B: Dedicated Task Generator Module (src/core/)

| Aspect | Detail |
|---|---|
| **Summary** | A new `src/core/planning/task-generator.js` module reads the three artifacts from disk and produces tasks.md programmatically. The roundtable calls this module during the confirmation sequence. |
| **Pros** | Deterministic generation (code, not LLM), testable in isolation, reusable by build workflow |
| **Cons** | Requires parsing markdown artifacts programmatically (brittle), needs file I/O during roundtable (breaks batch-write-only pattern), new module to maintain |
| **Pattern Alignment** | Against the roundtable's "accumulate in memory, write once" pattern |
| **Verdict** | Eliminated — programmatic markdown parsing is fragile, and the roundtable already has all artifacts in memory |

### Option C: Post-Roundtable Agent Delegation

| Aspect | Detail |
|---|---|
| **Summary** | After the roundtable returns, the analyze handler delegates to a separate task-generator agent that reads the three artifacts from disk and produces tasks.md. |
| **Pros** | Clean separation, dedicated agent with focused prompt |
| **Cons** | Re-reads all three artifacts from disk (already in roundtable memory), adds agent delegation overhead (~2 min), breaks the "all artifacts in one batch" model, requires separate confirmation UX |
| **Pattern Alignment** | Against the roundtable's unified conversation model and batch write protocol |
| **Verdict** | Eliminated — redundant I/O, breaks UX flow, adds latency |

---

## 2. Selected Architecture (ADRs)

### ADR-001: Inline Task Generation in Roundtable Protocol

- **Status**: Accepted
- **Context**: The roundtable has all three analysis artifacts (requirements-spec, architecture-overview, module-design) in memory at confirmation time. A separate module or agent would need to re-read them from disk.
- **Decision**: Task generation is added as a step in the roundtable-analyst.md protocol, between design acceptance and batch write. The roundtable derives tasks from its in-memory knowledge. No new JS modules.
- **Rationale**: Zero I/O overhead, same context window, single batch write, consistent with how the other three artifacts are produced.
- **Consequences**: Task generation quality depends on the LLM's ability to derive file-level dependencies. The v2.0 EBNF grammar and validation rules (from ORCH-012) constrain the output format. If generation quality is insufficient, a programmatic validator can be added later as a post-write check.

### ADR-002: PRESENTING_TASKS as 4th Confirmation State

- **Status**: Accepted
- **Context**: The confirmation state machine currently has three domain states. The task breakdown needs user review before the batch write.
- **Decision**: Add `PRESENTING_TASKS` state between `PRESENTING_DESIGN` and `FINALIZING`. The state machine becomes: `IDLE → PRESENTING_REQUIREMENTS → PRESENTING_ARCHITECTURE → PRESENTING_DESIGN → PRESENTING_TASKS → FINALIZING → COMPLETE`.
- **Rationale**: Follows the established pattern — each domain gets its own confirmation step. The user can Amend the task list (remove tasks, defer phases) before committing.
- **Consequences**: The confirmation sequence is now 4 steps. Light workflows skip `PRESENTING_TASKS` (no design detail to derive tasks from). The `AMENDING` state can be entered from `PRESENTING_TASKS` same as from other states.

### ADR-003: Task List in Requirement Folder, Copied at Build Time

- **Status**: Accepted
- **Context**: ORCH-012 writes to `docs/isdlc/tasks.md` (workflow-level). The analyze handler writes to `docs/requirements/{slug}/` (per-requirement). These are different locations.
- **Decision**: The roundtable writes tasks.md to `docs/requirements/{slug}/tasks.md`. At build init, the orchestrator copies it to `docs/isdlc/tasks.md` (the location plan-surfacer checks). This preserves the per-requirement artifact model while satisfying the build workflow's expectation.
- **Rationale**: Analysis artifacts belong in the requirement folder (alongside requirements-spec, architecture-overview, module-design). The build-time copy is a bridge to the existing plan-surfacer hook.
- **Consequences**: Two copies of tasks.md during a build. The requirement folder copy is the source of truth. The `docs/isdlc/tasks.md` copy is a build-time working copy that gets updated as tasks are completed.

### ADR-004: Reuse v2.0 Task Format from ORCH-012

- **Status**: Accepted
- **Context**: ORCH-012 defines a v2.0 task format with EBNF grammar, traceability annotations, and phase grouping. The roundtable-generated tasks should be consumable by the same downstream agents.
- **Decision**: The roundtable generates tasks using the exact v2.0 format defined in ORCH-012 SKILL.md (lines 256-280). Same task IDs (T0001+), same sub-lines (files:, blocked_by:, blocks:), same annotations (| traces:), same phase headers.
- **Rationale**: One format for all consumers. No format translation needed. Existing tests and validators work unchanged.
- **Consequences**: The roundtable must produce syntactically valid v2.0 output. Format violations would cause downstream parsing failures. The ORCH-012 validation rules (Step 7 of the skill) serve as the acceptance test.

### ADR-005: Configurable Display and Scope via Execution Contract

- **Status**: Accepted
- **Context**: Task display mode (counter/expanded/phase-only) and scope (full-workflow/implementation-only) should be user-configurable per project.
- **Decision**: Add `task_display` and `task_scope` fields to the execution contract's `presentation` section (REQ-0141). Defaults: `task_display: "counter"`, `task_scope: "full-workflow"`. The contract generator reads these from project config and embeds them in the contract. The phase-loop controller reads them at runtime.
- **Rationale**: Builds on the execution contract system (REQ-0141) rather than introducing a separate config surface. Consistent with the contract-as-configuration model.
- **Consequences**: Depends on REQ-0141 being deployed. If contracts are not available, falls back to defaults.

### ADR-006: Guard-Based Skip for Build Redundancy

- **Status**: Accepted
- **Context**: `3e-plan` and `3e-refine` currently always run during builds. If tasks.md already exists from analysis, they should skip.
- **Decision**: `3e-plan` checks for `docs/requirements/{artifact_folder}/tasks.md` before generating. If found, copies to `docs/isdlc/tasks.md` and skips generation. `3e-refine` checks if Phase 06 tasks already have `files:` sub-lines. If found, skips refinement.
- **Rationale**: Simple file-existence guard. No new infrastructure needed. Backward compatible — builds without pre-existing tasks.md still work as today.
- **Consequences**: The guard must check the artifact folder path, not just `docs/isdlc/tasks.md`. A stale tasks.md (from a previous analysis of a different feature) must not satisfy the guard — the slug must match `active_workflow.artifact_folder`.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|---|---|---|---|
| Roundtable protocol spec (markdown) | N/A | Extends existing roundtable-analyst.md — no new runtime code | Dedicated JS module (rejected — fragile markdown parsing), separate agent (rejected — redundant I/O) |
| v2.0 task format | 2.0 | Existing format from ORCH-012 with EBNF grammar | New format (rejected — breaks downstream consumers), simplified format (rejected — loses traceability) |
| Execution contract presentation fields | 1.0.0 | Extends REQ-0141 contract schema | Separate config file (rejected — yet another config surface) |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|---|
| INT-001 | Roundtable (in-memory) | tasks.md generation | Inline LLM generation | v2.0 markdown | If generation fails, skip task confirmation, write other 3 artifacts, log warning |
| INT-002 | Roundtable batch write | `docs/requirements/{slug}/tasks.md` | File write (Write tool) | v2.0 markdown | Same as other artifacts — fail-open on individual file write |
| INT-003 | Build init (orchestrator) | `docs/isdlc/tasks.md` | File copy | v2.0 markdown | If copy fails, fall back to 3e-plan generation |
| INT-004 | `3e-plan` | `{artifact_folder}/tasks.md` | File existence check | N/A | If not found, generate as today (backward compat) |
| INT-005 | `3e-refine` | Phase 06 tasks in tasks.md | Content check (`files:` sub-lines) | v2.0 markdown | If not refined, refine as today (backward compat) |
| INT-006 | plan-surfacer.cjs | `docs/isdlc/tasks.md` | File existence check | N/A | Blocks if missing (existing behavior, unchanged) |
| INT-007 | Execution contract | `presentation.task_display`, `presentation.task_scope` | JSON field read | String enum | Missing fields → use defaults ("counter", "full-workflow") |

### Data Flow

```
Analyze:
  Roundtable conversation → design accepted
  → Roundtable generates task list (in memory, from 3 artifacts)
  → PRESENTING_TASKS → user Accept/Amend
  → Batch write: requirements-spec.md, architecture-overview.md, module-design.md, tasks.md
  → Written to docs/requirements/{slug}/

Build:
  Orchestrator init → copies {slug}/tasks.md to docs/isdlc/tasks.md
  → 3e-plan checks → pre-existing found → skips
  → 3e-refine checks → already refined → skips
  → Phase 05 reads tasks.md → generates test cases per task
  → Phase 06 reads tasks.md → executes tasks in dependency order
  → Phase 16 reads tasks.md → verifies task completion
  → Phase 08 reads tasks.md → reviews per task unit
```

---

## 5. Summary

| Metric | Value |
|---|---|
| New files | 0 (protocol changes only) |
| Modified files | 3 (`roundtable-analyst.md` — state machine + task generation, `isdlc.md` — 3e-plan/3e-refine guards + build-init copy, `contract-schema.js` — add task_display/task_scope to presentation) |
| New config | 0 (uses existing execution contract presentation section) |
| Risk level | Low behavioral risk (additive confirmation step), Low integration risk (reuses existing format and hooks) |
| Key decision | Inline generation in roundtable (ADR-001) — zero new modules, all artifacts in memory |
| Key trade-off | LLM-generated task quality vs programmatic determinism — accepted because the roundtable already generates all other artifacts this way |
| Dependencies | REQ-0141 (execution contracts) for configurable display/scope fields |
