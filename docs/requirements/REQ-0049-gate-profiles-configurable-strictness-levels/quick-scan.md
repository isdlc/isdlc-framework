# Quick Scan: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 100%

## Codebase Summary

- **Gate enforcement engine**: `src/claude/hooks/lib/gate-logic.cjs` (322 lines) — contains `mergeRequirements()` deep-merge function and `check()` entry point
- **Iteration requirements config**: `src/claude/hooks/config/iteration-requirements.json` (781 lines) — single source of truth for all gate thresholds across 17 phases
- **Requirements loader**: `src/claude/hooks/lib/common.cjs` — `loadIterationRequirements()` used by 12+ hooks
- **Workflow overrides**: Already exist in `iteration-requirements.json` under `workflow_overrides` — per-workflow-type threshold adjustments that merge with base requirements
- **Intent detection**: `src/claude/commands/isdlc.md` — natural language parsing for workflow type selection
- **External skills pattern**: `.claude/skills/external/` (project), `.isdlc/projects/{id}/skills/external/` (monorepo) — file-based, auto-discovered, manifest-registered

## Key Files (Direct Changes)

| File | Change Type | Rationale |
|------|-------------|-----------|
| `src/claude/hooks/lib/gate-logic.cjs` | Modify | Add profile merge layer between base requirements and workflow overrides |
| `src/claude/hooks/lib/common.cjs` | Modify | Add `loadProfiles()` and `resolveProfile()` functions |
| `src/claude/hooks/config/iteration-requirements.json` | Modify | Add built-in profile definitions or reference structure |
| `src/claude/commands/isdlc.md` | Modify | Add profile resolution to intent detection |
| `src/claude/agents/00-sdlc-orchestrator.md` | Modify | Add profile selection and confirmation at workflow start |

## Key Files (Transitive Impact)

All hooks that call `loadIterationRequirements()` are transitively affected (12+ files), but changes are isolated to the loading/merge layer — individual hooks do not need modification.

## Estimated Scope

- **Direct files**: 5-7
- **Transitive files**: 12+ (hooks consuming requirements)
- **New files**: 3-5 (built-in profile definitions, profile loader, schema)
- **Tier**: Standard
