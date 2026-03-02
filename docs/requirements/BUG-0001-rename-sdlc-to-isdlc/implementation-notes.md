# Implementation Notes: BUG-0001 Rename /sdlc to /isdlc

## Summary

Renamed the `/sdlc` slash command to `/isdlc` across the entire codebase for naming consistency with the iSDLC project name.

## Changes Made

### 1. Command File Rename
- `src/claude/commands/sdlc.md` renamed to `src/claude/commands/isdlc.md` via `git mv`

### 2. Command Reference Replacements (36 files)
All `/sdlc` command references replaced with `/isdlc` in:

**Commands (3 files):**
- `src/claude/commands/isdlc.md` -- 107 occurrences
- `src/claude/commands/discover.md` -- 5 occurrences
- `src/claude/commands/tour.md` -- 6 occurrences

**Agents (10 files):**
- `src/claude/agents/00-sdlc-orchestrator.md` -- 77 occurrences
- `src/claude/agents/discover-orchestrator.md` -- 21 occurrences
- `src/claude/agents/tracing/tracing-orchestrator.md` -- 1 occurrence
- `src/claude/agents/quick-scan/quick-scan-agent.md` -- 1 occurrence
- `src/claude/agents/14-upgrade-engineer.md` -- 3 occurrences
- `src/claude/agents/discover/characterization-test-generator.md` -- 1 occurrence
- `src/claude/agents/discover/artifact-integration.md` -- 1 occurrence
- `src/claude/agents/discover/atdd-bridge.md` -- 5 occurrences
- `src/claude/agents/discover/feature-mapper.md` -- 2 occurrences

**Hooks (4 files):**
- `src/claude/hooks/gate-blocker.cjs` -- skill name `'sdlc'` to `'isdlc'`, plus comments
- `src/claude/hooks/iteration-corridor.cjs` -- skill name `'sdlc'` to `'isdlc'`
- `src/claude/hooks/skill-delegation-enforcer.cjs` -- DELEGATION_MAP key `'sdlc'` to `'isdlc'`, plus comments
- `src/claude/hooks/delegation-gate.cjs` -- comment only

**Schema (1 file):**
- `src/claude/hooks/config/schemas/pending-delegation.schema.json` -- description field

**Docs (6 files):**
- `docs/ARCHITECTURE.md`
- `docs/AGENTS.md`
- `docs/MONOREPO-GUIDE.md`
- `docs/CONSTITUTION-GUIDE.md`
- `docs/designs/MULTI-PROVIDER-SUPPORT-DESIGN.md`
- `docs/project-discovery-report.md`

**Lib (2 files):**
- `lib/cli.js`
- `lib/installer.js`

**Config/Templates/Checklists (6 files):**
- `src/isdlc/config/workflows.json`
- `src/isdlc/config/cloud-config-schema.yaml`
- `src/isdlc/checklists/01-requirements-gate.md`
- `src/isdlc/checklists/11-local-testing-gate.md`
- `src/isdlc/checklists/13-test-deploy-gate.md`
- `src/isdlc/templates/devops/local-verification-signoff.md`

**Scripts (2 files):**
- `install.sh`
- `install.ps1`

**Root files (2 files):**
- `README.md`
- `CLAUDE.md`

### 3. What Was NOT Changed (Intentional Exclusions)
- `.isdlc/` directory paths -- already correct
- `docs/isdlc/` paths -- already correct
- `iSDLC` brand name -- already correct
- `SDLC` as an acronym in prose (e.g., "SDLC Orchestrator", "Complete SDLC") -- conceptual names
- `sdlc-orchestrator` agent type name -- internal identifier, not a user command
- `uninstall.sh:399` and `uninstall.ps1:435` -- directory path patterns for skill cleanup, not command references

## Test Results

- **Hook tests**: 164/164 passing (23 suites)
- **Pre-existing E2E failure**: 1 test in `tests/e2e/cli-lifecycle.test.js` fails due to missing `lib/utils/test-helpers.js` -- this is a pre-existing issue on this branch, not caused by our changes.

## Key Decisions

1. **Replace_all approach**: Used `replace_all` for markdown files since all `/sdlc` occurrences in those files are command references. This was safe because no markdown file contained both command references and directory paths with `/sdlc`.

2. **Preserved sdlc-orchestrator**: The agent type name `sdlc-orchestrator` is an internal identifier used in Task tool calls and DELEGATION_MAP values. Changing this would break the delegation infrastructure without any user-facing benefit.

3. **Uninstall path checks untouched**: The `*"/sdlc/"*` directory path patterns in uninstall scripts check for a skills directory that does not exist. These are dead code but are not command references and were left unchanged.
