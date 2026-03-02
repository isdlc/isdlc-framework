# Technology Stack Decision: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 03-architecture
**Created:** 2026-02-15
**Status:** Accepted

---

## Context

This is a **prompt-engineering feature** within the iSDLC framework, following the exact same technology stack as REQ-0014 (Phase 01 debate) and REQ-0015 (Phase 03 debate). No new runtime dependencies, no new infrastructure. All changes are to markdown agent files and CJS test files.

This document records the technology decisions applicable to this feature and their rationale.

---

## Agent Definition Format

**Choice:** Markdown with YAML frontmatter (`.md` files)
**Rationale:**
- Consistent with all 48+ existing agents in `src/claude/agents/`
- YAML frontmatter provides structured metadata (name, description, model, owned_skills)
- Markdown body provides unstructured prompt instructions
- No build step or compilation needed
- Human-readable and version-controllable
- New files: `03-design-critic.md`, `03-design-refiner.md`

**Alternatives Considered:**
- JSON: Too rigid for free-form prompt instructions; poor readability
- YAML-only: Cannot embed long-form markdown prompts ergonomically

---

## Test Framework

**Choice:** `node:test` with CJS modules (`.test.cjs`)
**Rationale:**
- Constitutional requirement (Article II: "All tests must use `node:test`")
- Consistent with existing 177 debate tests from REQ-0014 (90) and REQ-0015 (87)
- CJS format required for agent content verification tests
- No external test framework dependencies (Article V: Simplicity First)

**Alternatives Considered:**
- Jest: External dependency, violates Article V
- Vitest: External dependency, violates Article V
- ESM test files: Not used for prompt content verification tests (hooks use CJS)

---

## Agent Content Verification Approach

**Choice:** String matching on agent file content (read file, assert keywords present)
**Rationale:**
- Established pattern from REQ-0014 (90 tests) and REQ-0015 (87 tests)
- Prompt engineering testing verifies that expected instructions, check categories, and rules are present in the agent file
- No runtime execution of prompts needed -- the test verifies the prompt content itself
- Fast execution (<1ms per test)
- Proven to catch prompt regressions (drift in required instructions)

**Alternatives Considered:**
- LLM-based evaluation: Too slow, non-deterministic, expensive
- Schema validation: Agents are free-form markdown, not structured data

---

## State Management

**Choice:** `.isdlc/state.json` (existing)
**Rationale:**
- debate_state is already stored here from REQ-0014/REQ-0015
- The `debate_state.phase` field already supports any phase key
- Adding `"04-design"` as a phase value is purely additive
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
- The generalized debate engine (from REQ-0015) handles Phase 04 routing without code changes

**Alternatives Considered:**
- Programmatic orchestration (new JS module): Over-engineering (Article V)
- Hook-based orchestration: Hooks are for enforcement, not workflow control

---

## Agent Naming Convention

**Choice:** `03-` prefix for Phase 04 agents (matching `03-system-designer.md`)
**Rationale:**
- The numeric prefix denotes the iSDLC internal phase grouping, not the SDLC phase number
- Phase 04 agents share the `03-` prefix because system-designer is `03-system-designer.md`
- Critic and Refiner use same prefix as their Creator for agent co-location
- Consistent with Phase 01 pattern (all `01-` prefixed) and Phase 03 pattern (all `02-` prefixed)

**Alternatives Considered:**
- `04-` prefix: Would break the convention that prefix matches the Creator's prefix, not the SDLC phase number

---

## Summary

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Agent definitions | Markdown + YAML frontmatter | Framework standard |
| Test runner | `node:test` (CJS) | Constitutional requirement |
| Test approach | String matching on file content | REQ-0014/REQ-0015 pattern |
| State management | `.isdlc/state.json` | Existing infrastructure |
| Orchestration | Prompt-level via Task tool | Framework standard |
| Agent prefix | `03-` (matching Creator prefix) | Convention from REQ-0014/REQ-0015 |
| New dependencies | None | Article V compliance |
| New hooks | None | Debate is prompt-level |
| New runtime code | None | Prompt engineering only |

**Total new runtime dependencies:** 0
**Total new dev dependencies:** 0
**Total new infrastructure:** 0
