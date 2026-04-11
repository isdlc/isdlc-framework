---
name: project-conventions
description: Distilled project conventions -- naming, error handling, file organization, patterns
skill_id: PROJ-002
owner: discover-orchestrator
collaborators: []
project: isdlc-framework
version: 2.0.0
when_to_use: When writing new code, reviewing code, or making style decisions
dependencies: []
---

# Project Conventions

## Naming Conventions
- Files: `kebab-case.js` (ESM), `kebab-case.cjs` (CommonJS), `kebab-case.test.{js|cjs}` (tests)
- Phase agents: `{NN}-{role}.md` (e.g., `05-software-developer.md`)
- Hooks: `{kebab-case}.cjs` (e.g., `gate-blocker.cjs`)
- Skills: `{skill-name}/SKILL.md` (directory per skill)
- Contracts: `{workflow-type}.contract.json`
- Functions/methods: camelCase
- Constants: UPPER_SNAKE_CASE (exported), camelCase (local)
- Variables: camelCase

## Error Handling Patterns
- Hooks: fail-open by default (log warning, allow operation) unless security-critical
- Gates: fail-closed (block phase advance until all criteria met)
- State writes: validated against JSON schemas before persistence
- Agent failures: retry once, then surface to user with context
- CLI commands: wrap in try/catch, display user-friendly error, exit non-zero
- Bridge modules: catch import errors, return fallback values

## File Organization
- `bin/` -- CLI entry points (ESM): isdlc, setup-knowledge, embedding, embedding-server, embedding-mcp, rebuild-cache, generate-contracts
- `lib/` -- CLI modules, embedding (41 modules), search (12 modules) (ESM, with co-located .test.js files)
- `src/core/` -- Provider-neutral business logic (137 ESM modules, tests in tests/core/)
- `src/core/bridge/` -- CJS wrappers for ESM modules (23 bridge adapters)
- `src/providers/{claude,codex}/` -- Provider-specific adapters
- `src/claude/hooks/` -- Runtime enforcement hooks (30 CJS hooks)
- `src/claude/hooks/lib/` -- Shared hook utilities (14 CJS modules)
- `src/claude/agents/` -- Agent markdown specifications (71 agents)
- `src/claude/skills/` -- Skill definitions (280 SKILL.md across 20 categories)
- `src/claude/commands/` -- Command handler specifications (7 commands)
- `src/isdlc/config/` -- Canonical framework config (iteration-requirements, phase-topology, profiles, contracts, templates, workflows, tool-routing)
- `tests/` -- Test files: core/, e2e/, embedding/, providers/, hooks/, verification/, characterization/
- `docs/` -- Requirements, architecture, design, isdlc config

## Framework Usage
- Node.js built-in test runner (`node --test`) -- no external test framework
- `node:assert` strict mode for assertions
- `chalk` v5 for terminal colors (ESM-only import)
- `fs-extra` for filesystem operations in CLI modules
- `js-yaml` for YAML parsing
- `semver` for version comparison
- `@huggingface/transformers` ^4 for local Jina v2 embeddings with CoreML hardware acceleration
- `prompts` for interactive CLI prompts
- Single-line bash convention: all bash in agent/command files must be one line (for permission auto-allow)
- Dual-file awareness (dogfooding): changes to src/ must also update root .isdlc/ and .claude/
- Three-verb command model: add/analyze/build (no /fix or /feature)

## Provenance
- **Source**: docs/project-discovery-report.md (patterns/conventions section)
- **Distilled**: 2026-04-09
- **Discovery run**: full
