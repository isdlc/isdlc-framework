# Hook Reference

> Complete reference for all 27 runtime enforcement hooks in the iSDLC framework.

The hook system runs **outside the LLM** as separate Node.js processes, intercepting tool calls via Claude Code's `PreToolUse`, `PostToolUse`, and `Stop` events. This means enforcement is deterministic — it cannot be forgotten, reinterpreted, or prompt-injected away.

**Architecture**: 5 dispatchers consolidate 21 hooks for performance; 5 standalone hooks handle cross-cutting concerns. PreToolUse dispatchers short-circuit on first block; PostToolUse dispatchers run all hooks.

For hook architecture details, registration, and deep dives, see [ARCHITECTURE.md](ARCHITECTURE.md#hooks-26).

---

## Hard Blockers

These hooks run on **PreToolUse** (or Stop) and **prevent tool execution** when conditions are violated.

| # | Hook | Trigger | What It Prevents |
|---|------|---------|-----------------|
| 1 | `iteration-corridor` | PreToolUse [Task, Skill] | **Escaping fix loops** — blocks delegation and gate advancement when tests are failing (TEST corridor) or constitutional validation is pending (CONST corridor). The agent can only fix code and re-run tests until the issue is resolved. |
| 2 | `phase-loop-controller` | PreToolUse [Task] | **Invisible phase transitions** — blocks phase delegation when the orchestrator hasn't marked the phase as `in_progress` via TaskUpdate. Ensures the user sees progress spinners for every phase. |
| 3 | `plan-surfacer` | PreToolUse [Task] | **Coding without a plan** — blocks delegation to implementation phases (06+) when the task plan (`docs/isdlc/tasks.md`) hasn't been generated. Ensures the user reviews the roadmap before code is written. |
| 4 | `phase-sequence-guard` | PreToolUse [Task] | **Out-of-order phases** — blocks delegation when the target phase doesn't match the current workflow phase. Prevents skipping ahead or backtracking. |
| 5 | `gate-blocker` | PreToolUse [Task, Skill] | **Premature gate advancement** — blocks advancing past a quality gate unless all iteration requirements are met: tests pass, constitutional validation complete, minimum interactions satisfied. Performs 4 checks. |
| 6 | `constitution-validator` | PreToolUse [Task] | **Skipping governance** — blocks phase completion declarations when constitutional validation hasn't been performed against the project's constitution. |
| 7 | `constitutional-iteration-validator` | PreToolUse [Skill] | **Gate bypass via skill** — blocks `/isdlc advance` and gate-check commands when constitutional validation is incomplete (checks `completed`, `iterations_used`, `status`, and `articles_checked`). |
| 8 | `test-adequacy-blocker` | PreToolUse [Task] | **Upgrades without safety net** — blocks delegation to upgrade phases (14+) when test coverage is inadequate (<50% unit coverage or 0 total tests). Requires a regression baseline before upgrades. |
| 9 | `branch-guard` | PreToolUse [Bash] | **Commits to main** — blocks `git commit` on main/master when the active workflow has a feature branch. Keeps feature work isolated on its own branch. |
| 10 | `explore-readonly-enforcer` | PreToolUse [Write, Edit] | **Writes during exploration** — blocks file writes/edits when Chat/Explore mode is active. Only temp files and `state.json` are exempt. Enforces read-only exploration. |
| 11 | `state-file-guard` | PreToolUse [Bash] | **Direct state.json writes** — blocks Bash commands that attempt to write directly to `state.json` (via redirects, `tee`, `sed -i`, etc.), bypassing the hook enforcement system. Read-only commands like `cat state.json` are allowed. Regex-only, no I/O (<50ms). |
| 12 | `skill-delegation-enforcer` | PostToolUse [Skill] | **Running without orchestrator** — when `/isdlc` or `/discover` skill is loaded, injects mandatory context requiring delegation to the correct orchestrator and writes a `pending_delegation` marker to state. |
| 13 | `delegation-gate` | Stop | **Missing orchestrator delegation** — hard safety net that blocks the response if `/isdlc` or `/discover` was invoked but the required orchestrator delegation never happened. Last line of defense. |

---

## Observers & Warners

These hooks run on **PostToolUse** and **never block** — they log activity, track state, and emit warnings.

| # | Hook | Trigger | What It Watches For |
|---|------|---------|-------------------|
| 13 | `skill-validator` | PreToolUse [Task] | **Cross-phase delegation** — logs all Task delegations with authorization status (orchestrator/setup/phase-match/cross-phase). Observe-only since v3.0.0. |
| 14 | `log-skill-usage` | PostToolUse [Task] | **All agent delegations** — appends every Task delegation to `skill_usage_log` with agent name, phase, timestamp, and authorization status. Audit trail. |
| 15 | `menu-tracker` | PostToolUse [Task] | **Requirements elicitation progress** — counts A/R/C menu presentations and user selections during Phase 01. Tracks interaction depth. |
| 16 | `walkthrough-tracker` | PostToolUse [Task] | **Skipped constitution walkthrough** — warns if `/discover` completes without recording a constitution walkthrough. Ensures governance context is available for downstream phases. |
| 17 | `discover-menu-guard` | PostToolUse [Task] | **Incorrect discover menu** — warns if `/discover` presents the wrong menu structure. Should have exactly 3 options: New Project, Existing Project, Chat/Explore. |
| 18 | `phase-transition-enforcer` | PostToolUse [Task] | **Permission-asking anti-pattern** — warns if an agent asks "Would you like to proceed?" instead of transitioning automatically. Phase transitions should be seamless. |
| 19 | `menu-halt-enforcer` | PostToolUse [Task] | **Runaway output after menu** — warns if an agent continues generating 200+ characters after presenting an interactive menu (A/R/C, numbered, backlog-picker). Should halt and wait for user input. |
| 20 | `state-write-validator` | PostToolUse [Write, Edit] | **Fabricated state data** — validates `state.json` writes for impossible combinations (e.g., `constitutional_validation.completed = true` but `iterations_used = 0`). Detects 6 rule violations. |
| 21 | `output-format-validator` | PostToolUse [Write, Edit] | **Malformed artifacts and template drift** — validates known artifact files (user-stories.json, test-strategy.md, ADR files, template-backed analysis artifacts) against expected schemas and template structure. Checks structure, not content. |
| 22 | `review-reminder` | PostToolUse [Bash] | **Unreviewed team commits** — warns on `git commit` if code review is disabled but team size > 1. Reminds to enable manual code review. |
| 23 | `atdd-completeness-validator` | PostToolUse [Bash] | **Test priority violations** — when `atdd.enabled` and `atdd.enforce_priority_order` are true in `.isdlc/config.json` (both default-on), warns about P0/P1/P2/P3 priority violations and orphaned skipped tests in test output. |

---

## State Management & Auto-Remediation

These hooks **update state** or **auto-fix** issues rather than simply blocking or warning.

| # | Hook | Trigger | What It Does |
|---|------|---------|-------------|
| 24 | `test-watcher` | PostToolUse [Bash] | **Iteration tracking** — parses test pass/fail from Bash output, increments the per-phase iteration counter, tracks coverage, and triggers the circuit breaker (3 identical failures = automatic stop with human escalation). |
| 25 | `workflow-completion-enforcer` | PostToolUse [Write, Edit] | **Clean workflow completion** — detects when `active_workflow` becomes null and auto-adds missing `phase_snapshots` and metrics to `workflow_history`. Also prunes `skill_usage_log`, `completed_phases`, and old history entries. |
| 26 | `model-provider-router` | PreToolUse [Task] | **Provider injection** — intercepts Task calls and injects the correct LLM provider/model configuration based on: CLI overrides > agent overrides > phase routing > mode defaults > global defaults > fallback. |

---

## Dispatcher Architecture

The 21 dispatched hooks are grouped into 5 dispatchers for performance (single process spawn per event instead of many):

| Dispatcher | Event | Hooks Dispatched | Behavior |
|-----------|-------|-----------------|----------|
| `pre-task-dispatcher` | PreToolUse [Task] | iteration-corridor, skill-validator, phase-loop-controller, plan-surfacer, phase-sequence-guard, gate-blocker, constitution-validator, test-adequacy-blocker | **Short-circuit** on first block |
| `pre-skill-dispatcher` | PreToolUse [Skill] | iteration-corridor, gate-blocker, constitutional-iteration-validator | **Short-circuit** on first block |
| `post-task-dispatcher` | PostToolUse [Task] | log-skill-usage, menu-tracker, walkthrough-tracker, discover-menu-guard, phase-transition-enforcer, menu-halt-enforcer | Run **all** hooks |
| `post-bash-dispatcher` | PostToolUse [Bash] | review-reminder, atdd-completeness-validator, test-watcher | Run **all** hooks |
| `post-write-edit-dispatcher` | PostToolUse [Write, Edit] | state-write-validator, output-format-validator, workflow-completion-enforcer | Run **all** hooks |

The 5 standalone hooks (`branch-guard`, `state-file-guard`, `explore-readonly-enforcer`, `skill-delegation-enforcer`, `delegation-gate`) run as their own processes because they match different tool events or require independent lifecycle management.

---

## Enforcement Summary

```
                          ┌─────────────────────────────────┐
                          │       Tool Call Lifecycle        │
                          └─────────────────────────────────┘

  User action ──► Claude Code ──► PreToolUse hooks ──► Tool executes ──► PostToolUse hooks
                                       │                                        │
                                  12 BLOCKERS                          11 OBSERVERS
                                  Can BLOCK execution                  Log, warn, track
                                  (output JSON to deny)                (update state.json)
                                                                              │
                                                                   3 STATE MANAGERS
                                                                   Auto-fix, prune, inject
                                                                              │
                                                                     Agent stops ──► Stop hook
                                                                                    (delegation-gate)
```

| Category | Count | Purpose |
|----------|-------|---------|
| Hard Blockers | 13 | Prevent invalid state transitions, enforce phase ordering, protect branches |
| Observers & Warners | 11 | Log delegations, track menus, validate artifacts, emit warnings |
| State Managers | 3 | Track test iterations, clean up workflow completion, route providers |
| **Total** | **27** | |

**Design principle**: All hooks are **fail-open** — if a hook crashes, times out (10s default), or throws an error, it allows the operation to proceed. Framework bugs never block user work.
