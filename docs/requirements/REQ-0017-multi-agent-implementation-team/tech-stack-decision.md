# Technology Stack Decision: Multi-Agent Implementation Team

**Feature:** REQ-0017-multi-agent-implementation-team
**Phase:** 03-architecture
**Created:** 2026-02-15
**Status:** Accepted

---

## Overview

This feature requires NO new technology choices. All components use the existing iSDLC framework technology stack. This document confirms the stack alignment and explains why no changes are needed (Article V: Simplicity First).

---

## Agent Files

**Choice:** Markdown agent prompt files (`.md`)
**Rationale:**
- All iSDLC agents are markdown files with YAML frontmatter (established pattern since v0.1.0-alpha)
- Two new agent files: `05-implementation-reviewer.md`, `05-implementation-updater.md`
- Follows naming convention: `{NN}-{role-name}.md` where NN=05 matches Phase 06 agent numbering (NFR-003)
- No runtime code required -- agents are prompt specifications consumed by Claude Code

**Alternatives Considered:**
- None -- agent files are always markdown in this framework

---

## Test Files

**Choice:** CommonJS test files (`.test.cjs`) using `node:test`
**Rationale:**
- All hook tests in `src/claude/hooks/tests/` use CJS module system with `.cjs` extension (Article XII: Dual Module System Integrity)
- Test runner is `node:test` -- the project's standard (Article II, Article V: no external test frameworks)
- Five new test files follow naming pattern: `implementation-debate-{role}.test.cjs` (NFR-003)
- Tests verify prompt content in agent markdown files (established pattern from REQ-0014/0015/0016)

**Alternatives Considered:**
- None -- CJS + node:test is constitutionally mandated (Article XII)

---

## State Management

**Choice:** JSON state file (`state.json`)
**Rationale:**
- All iSDLC state is tracked in `.isdlc/state.json` (Article XVI: State Machine Consistency)
- New field `implementation_loop_state` added to `active_workflow` -- additive, no schema migration
- Follows existing patterns: `debate_state` (REQ-0014), `phase_status` (core framework)
- Read-modify-write with full object (Article XVI: atomic writes)

**Alternatives Considered:**
- Separate state file for implementation loop: Rejected -- unnecessary fragmentation; state.json already handles debate state

---

## Configuration

**Choice:** Extend existing `iteration-requirements.json`
**Rationale:**
- Hook configuration for gate-blocker already reads this file
- New entries for `05-implementation-reviewer` and `05-implementation-updater` agents
- Additive change -- existing entries unchanged
- No new configuration files needed

**Alternatives Considered:**
- New configuration file: Rejected -- adds complexity without benefit (Article V)

---

## Runtime Dependencies

**New Dependencies:** None (0 added)
**Rationale:**
- This feature is entirely prompt-level (agent markdown files) and test-level (CJS test files)
- No runtime JavaScript code changes beyond configuration JSON
- Article V: "Prefer standard Node.js APIs over third-party packages"

---

## Summary

| Layer | Technology | Status |
|-------|-----------|--------|
| Agent files | Markdown + YAML frontmatter | Existing (extend) |
| Test files | CJS + node:test | Existing (extend) |
| State management | JSON (state.json) | Existing (extend) |
| Configuration | JSON (iteration-requirements.json) | Existing (extend) |
| Runtime code | None added | N/A |
| Dependencies | None added | N/A |

All technology choices align with the existing stack. No evaluation of alternatives is needed because the constitutional articles (V, XII) and project conventions mandate the choices above.
