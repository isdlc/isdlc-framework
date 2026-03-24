# Requirements Specification: REQ-0138 — Codex Session Cache Re-priming + AGENTS.md Template

## 1. Business Context

Codex loses constitution/workflow/skills context after session clear/resume because there's no SessionStart hook equivalent. Claude restores context via a 25-line hook that reads `.isdlc/session-cache.md`. Codex needs: (1) a shipped instruction template (`AGENTS.md.template`) with full behavioral instructions adapted from CLAUDE.md.template, and (2) a cache re-prime path via the provider adapter.

**Source**: GitHub #204
**Dependencies**: REQ-0114 (Codex adapter), REQ-0116 (instruction projection), REQ-0136 (instruction generation)

## 2. Design Assumptions

1. End-user Codex projects have one primary project instruction file: `AGENTS.md` at project root
2. The framework may also generate provider-owned support files under `.codex/`
3. `AGENTS.md` is the primary conversational control surface, but not the only framework data surface
4. `codex exec` is the execution/delegation primitive for provider-driven task runs
5. Session cache is a provider-neutral artifact with stable section delimiters
6. Cache reading/re-priming is adapter behavior, not something `AGENTS.md` itself guarantees
7. Discovery builds project-specific cache; session clear/resume re-reads it, not rebuilds it
8. Without live hooks, governance splits between: adapter/runtime-enforced checks, instruction-level guidance, and manual fallback procedures

## 3. Functional Requirements

### FR-001: AGENTS.md Template
**Confidence**: High
- AC-001-01: `src/codex/AGENTS.md.template` exists (~300 lines)
- AC-001-02: Template is adapted from CLAUDE.md.template (329 lines) for Codex execution model

### FR-002: Behavioral Instructions
**Confidence**: High
- AC-002-01: Template includes workflow-first development section with intent detection table
- AC-002-02: Template includes consent patterns (good/bad examples)
- AC-002-03: Template includes analysis completion rules (three-domain confirmation sequence)
- AC-002-04: Template includes agent framework context (adapted: codex exec instead of Task tool)
- AC-002-05: Template includes git commit prohibition
- AC-002-06: Template includes constitutional principles preamble reference

### FR-003: Intent Detection Reinforcement
**Confidence**: Medium
- AC-003-01: Intent detection table has reinforced wording ("You MUST classify...")
- AC-003-02: At least 2 worked examples per intent verb (Add, Analyze, Build, Fix, Upgrade, Test)
- AC-003-03: Acknowledges probabilistic routing with fallback: "If uncertain, ask the user"

### FR-004: Conditional Cache Re-prime Instruction
**Confidence**: High
- AC-004-01: Template instructs: on new session or after clear, look for `.isdlc/session-cache.md`
- AC-004-02: If present, use it as the priming source
- AC-004-03: Only rebuild if missing, invalid, or user explicitly asks
- AC-004-04: Reference `bin/rebuild-cache.js` as the manual rebuild command

### FR-005: Three-Tier Governance Section
**Confidence**: High
- AC-005-01: Tier 1 (adapter/runtime-enforced): phase transitions, artifact existence, state schema validation
- AC-005-02: Tier 2 (instruction-level): commit prohibition, constitutional compliance, blast radius awareness
- AC-005-03: Tier 3 (manual fallback): when automated enforcement isn't possible, ask user

### FR-006: Installer Integration
**Confidence**: High
- AC-006-01: `installCodex()` copies template to project root as `AGENTS.md`
- AC-006-02: If `AGENTS.md` already exists, skip with warning (merge-not-overwrite)
- AC-006-03: `updateCodex()` refreshes template (with backup)

### FR-007: Cache Section Injection
**Confidence**: High
- AC-007-01: `projectInstructions()` reads `.isdlc/session-cache.md`
- AC-007-02: Parses `<!-- SECTION: name -->` / `<!-- /SECTION: name -->` delimiters
- AC-007-03: Injects CONSTITUTION, WORKFLOW_CONFIG, SKILL_INDEX, ITERATION_REQUIREMENTS sections
- AC-007-04: Sections appended to per-task instruction content

### FR-008: Fail-Open
**Confidence**: High
- AC-008-01: Missing cache file → no injection, no error
- AC-008-02: Malformed cache file → no injection, no error
- AC-008-03: Missing individual sections → skip that section, continue with others

### FR-009: Core Installer Support
**Confidence**: High
- AC-009-01: Core installer creates `.codex/` directory when provider=codex
- AC-009-02: Provider-neutral assets in core, Codex-specific in Codex installer

## 4. Out of Scope
- Modifying CLAUDE.md.template
- Rebuilding the cache builder (already exists)
- Codex hook surface (doesn't exist)
- Cursor/Windsurf templates (future)

## 5. MoSCoW
All FRs are Must Have.
