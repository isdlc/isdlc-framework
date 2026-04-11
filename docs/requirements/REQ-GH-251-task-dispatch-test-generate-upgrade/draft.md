# REQ-GH-251: Extend task-level dispatch to /isdlc test generate and /isdlc upgrade workflows

**Source**: github
**Source ID**: GH-251
**Type**: REQ
**Created**: 2026-04-11
**GitHub**: https://github.com/vihang-hub/isdlc-framework/issues/251

---

## Summary

Task-level dispatch (REQ-GH-220) currently benefits only `/isdlc build` because analysis produces `docs/isdlc/tasks.md` which phase 05/06 consume. `/isdlc test generate` and `/isdlc upgrade` run through the same Phase-Loop Controller but fall back to single-call delegation because no `tasks.md` is generated at the start of those workflows.

Extend task-level dispatch as a first-class feature for both commands so that test generation and migration steps get dependency-ordered, parallel-within-tier execution with per-task TaskCreate visibility.

## Current State

- `task_dispatch` config in `src/isdlc/config/workflows.json:185-191` is a top-level block enabled for phases `["05-test-strategy", "06-implementation"]`
- `shouldUseTaskDispatch()` in `src/core/tasks/task-dispatcher.js` checks phase membership AND `tasks.md` existence with >= `min_tasks_for_dispatch` (default 3) pending tasks
- `/isdlc build` → analysis produces `tasks.md` → 3d-tasks fires
- `/isdlc test generate` → no analysis → no `tasks.md` at entry → 3d-single fallback
- `/isdlc upgrade` → phase keys `15-upgrade-plan`, `15-upgrade-execute` are NOT in `task_dispatch.phases` → 3d-single fallback

## Proposed Work

### test-generate
- Phase 05 (test-strategy) already checks for existing `test.skip()` scaffolds in `tests/characterization/` from `/discover`. Extend it to emit one task per scaffold file in `docs/isdlc/tasks.md` with `files:` pointing at the scaffold and `traces:` derived from its AC references.
- Phase 06 (implementation) then picks up task-level dispatch via the existing 3d-check path — one test file per agent, parallel within tiers where scaffolds are independent.
- If no scaffolds exist (test-from-scratch path), Phase 05 still generates a `tasks.md` seeded from the target module/file list.

### upgrade
- Add `15-upgrade-plan` and `15-upgrade-execute` to `task_dispatch.phases` in workflows.json
- Phase 15 plan (upgrade-engineer, `scope: analysis`) emits `tasks.md` where each migration step is a task (with `blocked_by` edges representing step ordering)
- Phase 15 execute then dispatches tasks one-per-agent within each tier, replacing the current monolithic implement-test loop
- Retain `max_iterations` as a per-task retry budget rather than a whole-phase budget

## Benefits

- **Visibility**: users see per-file test generation and per-step migration progress in Claude Code task UI instead of a single opaque phase
- **Parallelism**: independent test files and independent migration steps run concurrently within a tier
- **Retry isolation**: a single failing test file or migration step doesn't reset the entire phase
- **Consistency**: test-generate and upgrade match the UX that `/isdlc build` already delivers

## Acceptance Criteria

- [ ] `/isdlc test generate` Phase 05 produces a `docs/isdlc/tasks.md` with one task per test file (from scaffolds or target modules)
- [ ] Phase 06 of test-generate invokes 3d-tasks dispatch when `tasks.md` has >= `min_tasks_for_dispatch` pending tasks
- [ ] `/isdlc upgrade` Phase 15-upgrade-plan produces a `tasks.md` with one task per migration step, with `blocked_by` dependencies
- [ ] Phase 15-upgrade-execute invokes 3d-tasks dispatch for migration tasks
- [ ] `task_dispatch.phases` in workflows.json includes the upgrade phase keys
- [ ] Existing `/isdlc build` dispatch behavior unchanged
- [ ] Tests cover both the tasks.md generation step and the 3d-tasks trigger path for each workflow

## Reference

- `src/claude/commands/isdlc.md` STEP 3d-check and 3d-tasks — existing task-level dispatch protocol
- `src/core/tasks/task-dispatcher.js` — `shouldUseTaskDispatch()` / `addSubTask()`
- REQ-GH-220 — original task-level dispatch feature
