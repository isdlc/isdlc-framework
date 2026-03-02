# Bug Report: BUG-0001 — Rename /sdlc Command to /isdlc

**Bug ID:** BUG-0001
**Reporter:** User (project owner)
**Date:** 2026-02-09
**Severity:** Medium (naming inconsistency, no runtime breakage)
**Priority:** High (brand consistency)

---

## Summary

The project is named "iSDLC" (integrated Software Development Lifecycle) but the primary slash command is registered as `/sdlc` instead of `/isdlc`. This naming inconsistency creates confusion and misaligns the CLI interface with the project identity.

## Expected Behavior

The slash command should be `/isdlc` to match the project name "iSDLC". All references to `/sdlc` as a command invocation should consistently use `/isdlc`.

## Actual Behavior

The slash command is registered as `/sdlc` in `src/claude/commands/sdlc.md`. All agent files, documentation, configuration, and hooks reference `/sdlc` as the command name.

## Reproduction Steps

1. Install the iSDLC framework via `npx isdlc init`
2. Observe that the command file is `src/claude/commands/sdlc.md`
3. Note that Claude Code registers this as `/sdlc`
4. Compare with project name "iSDLC" -- inconsistency confirmed

## Root Cause

The command was originally defined as `/sdlc` and was never renamed when the project branding settled on "iSDLC".

## Affected Files (Blast Radius)

### Category 1: Command Definition (Critical)
- `src/claude/commands/sdlc.md` -- must be renamed to `isdlc.md`

### Category 2: Agent Files (High -- 17 files, ~205 occurrences)
- `src/claude/agents/00-sdlc-orchestrator.md` (46 refs)
- `src/claude/agents/discover-orchestrator.md` (19 refs)
- `src/claude/commands/discover.md` (5 refs)
- `src/claude/commands/tour.md` (6 refs)
- `src/claude/agents/14-upgrade-engineer.md` (3 refs)
- `src/claude/agents/quick-scan/quick-scan-agent.md` (1 ref)
- `src/claude/agents/discover/atdd-bridge.md` (5 refs)
- `src/claude/agents/discover/feature-mapper.md` (2 refs)
- `src/claude/agents/discover/artifact-integration.md` (1 ref)
- `src/claude/agents/discover/characterization-test-generator.md` (1 ref)
- `src/claude/agents/tracing/tracing-orchestrator.md` (1 ref)

### Category 3: Skill Files (Low -- 2 files)
- `src/claude/skills/upgrade/upgrade-execution/SKILL.md` (1 ref)
- `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md` (2 refs)

### Category 4: Hook Code (Medium -- 3 files, ~5 occurrences)
- `src/claude/hooks/gate-blocker.cjs` (2 refs)
- `src/claude/hooks/skill-delegation-enforcer.cjs` (2 refs)
- `src/claude/hooks/delegation-gate.cjs` (1 ref)

### Category 5: Library/CLI Code (Medium -- 2 files)
- `lib/installer.js` (6 refs)
- `lib/cli.js` (1 ref)

### Category 6: Configuration Files (Medium -- 2 files)
- `src/isdlc/config/workflows.json` (7 refs)
- `src/isdlc/config/cloud-config-schema.yaml` (2 refs)

### Category 7: Documentation (Low -- 6 files, ~29 occurrences)
- `README.md` (7 refs)
- `CLAUDE.md` (7 refs)
- `docs/ARCHITECTURE.md` (11 refs)
- `docs/AGENTS.md` (3 refs)
- `docs/MONOREPO-GUIDE.md` (9 refs)
- `docs/CONSTITUTION-GUIDE.md` (3 refs)
- `docs/project-discovery-report.md` (2 refs)
- `docs/designs/MULTI-PROVIDER-SUPPORT-DESIGN.md` (1 ref)

### Category 8: Template/Checklist Files (Low -- 3 files)
- `src/isdlc/checklists/01-requirements-gate.md` (1 ref)
- `src/isdlc/checklists/11-local-testing-gate.md` (1 ref)
- `src/isdlc/checklists/13-test-deploy-gate.md` (1 ref)

## Total Scope

- **~248+ occurrences** across **~32 files**
- 1 file rename: `sdlc.md` -> `isdlc.md`
- All other changes are text replacements: `/sdlc` -> `/isdlc`

## Non-Functional Requirements

- **NFR-01: Zero Regression** -- All existing tests must pass after rename
- **NFR-02: Backward Compatibility** -- No runtime code changes (hooks check command names via string matching; these must be updated)
- **NFR-03: Installer Impact** -- `lib/installer.js` copies `sdlc.md` to `.claude/commands/sdlc.md` in target projects; this path must change to `isdlc.md`
- **NFR-04: Dual Module Integrity** -- CJS hooks (.cjs) and ESM library (.js) files both reference `/sdlc`; both must be updated consistently

## Acceptance Criteria

- **AC-01:** Command file renamed from `src/claude/commands/sdlc.md` to `src/claude/commands/isdlc.md`
- **AC-02:** All `/sdlc` command references in agent files updated to `/isdlc`
- **AC-03:** All `/sdlc` command references in hook .cjs files updated to `/isdlc`
- **AC-04:** All `/sdlc` command references in lib/*.js files updated to `/isdlc`
- **AC-05:** All `/sdlc` command references in config files updated to `/isdlc`
- **AC-06:** All `/sdlc` command references in documentation updated to `/isdlc`
- **AC-07:** All `/sdlc` command references in template/checklist files updated to `/isdlc`
- **AC-08:** Installer correctly copies `isdlc.md` (not `sdlc.md`) to target projects
- **AC-09:** All existing tests pass after rename (zero regressions)
- **AC-10:** No stale `/sdlc` references remain in the codebase (verified by grep)

## Constraints

- This is a pure text rename operation -- no logic changes
- The command path in Claude Code is determined by the filename in `.claude/commands/` (filename minus .md extension = command name)
- The `/discover` command references `/sdlc` in its suggested next steps -- these must also update
- State.json `discovery_context.user_next_action` contains "/sdlc test generate" -- this is runtime state and should NOT be modified as part of the fix (state.json is gitignored)
