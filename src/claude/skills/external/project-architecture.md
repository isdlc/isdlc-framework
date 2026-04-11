---
name: project-architecture
description: Distilled project architecture -- components, boundaries, data flow, key patterns
skill_id: PROJ-001
owner: discover-orchestrator
collaborators: []
project: isdlc-framework
version: 2.0.0
when_to_use: When making architectural decisions, assessing impact, or designing modules
dependencies: []
---

# Project Architecture

## Components
- **CLI Entry** (`bin/isdlc.js` -> `lib/cli.js`): ESM command router; 7 bin entries
- **CLI Modules** (`lib/*.js`): 5 prod modules -- updater, monorepo-handler, setup-project-knowledge, setup-search
- **Embedding Pipeline** (`lib/embedding/`): 41 modules -- chunker (tree-sitter + fallback), engine (Jina v2/OpenAI/Voyage + worker pool + device detector), aggregation, distribution, redaction, VCS (git/svn), registry, knowledge, MCP server, package, server (HTTP + lifecycle + refresh), incremental, HNSW
- **Search Subsystem** (`lib/search/`): 12 modules -- backend-routed (lexical, semantic, structural, indexed), config, router, ranker
- **Core Layer** (`src/core/`): 137 provider-neutral ESM modules across 22 subdomains (analyze, backlog, bridge, compliance, config, content, discover, finalize, hooks, installer, memory, observability, orchestration, providers, roundtable, search, skills, state, tasks, teams, validators, workflow)
- **Bridge Layer** (`src/core/bridge/`): 23 CJS modules wrapping ESM core for hook consumption via dynamic `import()`
- **Provider: Claude** (`src/providers/claude/`): 5 modules -- hooks adapter, installer, projection, runtime
- **Provider: Codex** (`src/providers/codex/`): 8 modules -- governance, installer, projection, runtime, verb-resolver, task-dispatch, commands/
- **Runtime Hooks** (`src/claude/hooks/`): 30 hooks + 14 lib modules (CJS, stdin/stdout JSON protocol)
- **Agent Definitions** (`src/claude/agents/`): 71 markdown agent specs (22 phase + 6 debate + 24 discover + 8 persona + 11 other)
- **Skill Definitions** (`src/claude/skills/`): 280 SKILL.md files across 20 categories
- **Config System** (`src/isdlc/config/`): 27 config files -- iteration-requirements, phase-topology, profiles, contracts, templates, workflows, tool-routing
- **Packages** (`packages/bulk-fs-mcp/`): MCP server for bulk file ops

## Data Flow
- User -> Claude Code -> Hooks (pre/post tool interception) -> Agent delegation -> Phase work -> Gate validation -> Phase advance
- CLI (bin/isdlc.js) -> lib/cli.js -> lib/{updater,setup-search,setup-project-knowledge}.js -> file system operations
- Hooks read stdin JSON -> process via hook lib -> write stdout JSON (allow/block/modify)
- Core bridge: CJS hooks -> bridge/*.cjs -> dynamic import() -> src/core/*.js (ESM)
- Embedding: Source files -> chunker -> engine (Jina v2 via Transformers.js + CoreML acceleration) -> aggregation -> .emb file -> HNSW index

## Integration Points
| Integration | Type | Protocol | Notes |
|-------------|------|----------|-------|
| Claude Code | External | Task tool + hooks (stdin/stdout JSON) | Primary provider |
| Codex | External | codex exec + AGENTS.md projection | Secondary provider |
| GitHub | External | gh CLI + GitHub Actions | CI/CD, issues, labels |
| code-index-mcp | MCP | MCP protocol | Code search and indexing |
| bulk-fs-mcp | MCP (local) | MCP protocol | Bulk file ops |
| Jina v2 Base Code | Local | @huggingface/transformers ^4 | Offline embeddings with CoreML/WASM |

## Architectural Patterns
- **Dual Module System**: ESM for core/lib, CJS for hooks (Claude Code protocol requirement)
- **Bridge Pattern**: src/core/bridge/*.cjs wraps ESM for CJS consumers via dynamic import()
- **Provider Abstraction**: Provider-neutral core + provider-specific adapters (claude, codex)
- **Hook Architecture**: PreToolUse/PostToolUse/Stop/Notification hooks, fail-open on errors
- **Team Patterns**: Debate (Creator->Critic->Refiner), Fan-out (parallel), Dual-track (impl+review), Implementation-Review-Loop
- **Contract Enforcement**: .contract.json files define phase input/output compliance rules
- **Filesystem State**: All persistence via JSON files, schema-validated writes, atomic updates
- **Config Unification**: Single user config (.isdlc/config.json) + framework configs (src/isdlc/config/) + bridge reader (src/core/bridge/config.cjs)

## Provenance
- **Source**: docs/project-discovery-report.md, codebase analysis
- **Distilled**: 2026-04-09
- **Discovery run**: full
