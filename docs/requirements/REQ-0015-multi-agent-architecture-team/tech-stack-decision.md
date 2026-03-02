# Technology Stack Decision: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## Context

This is a **prompt-engineering feature** within the iSDLC framework. The technology stack is the existing iSDLC framework stack -- no new runtime dependencies, no new infrastructure. All changes are to markdown agent files and CJS test files.

This document records the technology decisions applicable to this feature and their rationale.

---

## Agent Definition Format

**Choice:** Markdown with YAML frontmatter (`.md` files)
**Rationale:**
- Consistent with all 48 existing agents in `src/claude/agents/`
- YAML frontmatter provides structured metadata (name, description, model, owned_skills)
- Markdown body provides unstructured prompt instructions
- No build step or compilation needed
- Human-readable and version-controllable

**Alternatives Considered:**
- JSON: Too rigid for free-form prompt instructions; poor readability
- YAML-only: Cannot embed long-form markdown prompts ergonomically

---

## Test Framework

**Choice:** `node:test` with CJS modules (`.test.cjs`)
**Rationale:**
- Constitutional requirement (Article II: "All tests must use `node:test`")
- Consistent with existing 90 debate tests from REQ-0014
- CJS format required for hooks and agent content verification tests
- No external test framework dependencies (Article V: Simplicity First)

**Alternatives Considered:**
- Jest: External dependency, violates Article V
- Vitest: External dependency, violates Article V
- ESM test files: Not used for prompt content verification tests (hooks use CJS)

---

## Agent Content Verification Approach

**Choice:** String matching on agent file content (read file, assert keywords present)
**Rationale:**
- Established pattern from REQ-0014 (90 tests use this approach)
- Prompt engineering testing verifies that expected instructions, check categories, and rules are present in the agent file
- No runtime execution of prompts needed -- the test verifies the prompt content itself
- Fast execution (<1ms per test)

**Alternatives Considered:**
- LLM-based evaluation: Too slow, non-deterministic, expensive
- Schema validation: Agents are free-form markdown, not structured data

---

## State Management

**Choice:** `.isdlc/state.json` (existing)
**Rationale:**
- debate_state is already stored here from REQ-0014
- Adding `debate_state.phase` field is additive
- No schema migration needed

**Alternatives Considered:**
- Separate debate state file: Unnecessary fragmentation (Article V)
- Database: Completely unnecessary for this use case

---

## Orchestration Model

**Choice:** Prompt-level orchestration via Task tool delegation
**Rationale:**
- Consistent with existing orchestrator pattern
- No new runtime code or hooks needed
- The orchestrator's markdown instructions define the debate loop pseudocode
- Claude Code follows the instructions and delegates via the Task tool

**Alternatives Considered:**
- Programmatic orchestration (new JS module): Over-engineering for prompt-driven debate loop
- Hook-based orchestration: Hooks are for enforcement, not workflow control

---

## Summary

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Agent definitions | Markdown + YAML frontmatter | Framework standard |
| Test runner | `node:test` (CJS) | Constitutional requirement |
| Test approach | String matching on file content | REQ-0014 pattern |
| State management | `.isdlc/state.json` | Existing infrastructure |
| Orchestration | Prompt-level via Task tool | Framework standard |
| New dependencies | None | Article V compliance |
| New hooks | None | Debate is prompt-level |
| New runtime code | None | Prompt engineering only |

**Total new runtime dependencies:** 0
**Total new dev dependencies:** 0
**Total new infrastructure:** 0
