# Parallel Workflow Support — Per-Workflow State Isolation

**Source**: GitHub #30

## Problem

`single_active_workflow_per_project` rule blocks parallel work. A developer can't work on one bug while another is in progress. The constraint exists because `state.json` has a single `active_workflow` field and all hooks assume one active context.

## Design

Split state into per-workflow files with a shared index:

```
.isdlc/
  workflows.index.json          <- lightweight: [{ id, type, branch, status, started }]
  workflows/
    BUG-0012/state.json         <- full workflow state (phases, current_phase, escalations, skill_usage_log)
    BUG-0013/state.json         <- full workflow state
  config/                       <- shared (unchanged)
  state.json                    <- project-level only (counters, project info, workflow_history, constitution)
```

### Hook Resolution

Dispatchers resolve `git branch -> workflow ID -> workflow state` once per invocation via `git branch --show-current` (~5ms), pass resolved state to all hooks. Branch name already maps 1:1 to workflow.

### Session Binding

At session start, `/isdlc` (no args) presents a picker if multiple workflows are active. Once selected, CLAUDE.md instruction scopes all operations to that workflow. After selection, hooks only read that workflow's state file.

### Git Parallelism

Requires `git worktree` for true parallel sessions (two checkouts in different directories) or separate clones. Without worktrees, workflows are still sequential but with better state isolation and no cancellation needed to switch.

### Migration Scope

~20 files reference `readState()` — all dispatchers, standalone hooks, and common.cjs utilities need to resolve workflow-scoped state instead of global state.

### Performance Impact

+10-20ms per hook invocation (index read + branch resolution). Mitigated by caching within dispatcher runs.

## Related Items

- **#39**: State.json pruning at workflow completion — should be designed against the new per-workflow state structure
- **#40**: Epic decomposition — tracks parent + sub-features with individual phase progress, depends on parallel workflow state model
- **Prerequisite**: BUG-0013 (phase-loop-controller same-phase bypass) — DONE

## Complexity

Medium-large (2-3 sessions through full iSDLC workflow)
