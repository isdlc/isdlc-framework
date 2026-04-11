# Project Discovery Report

**Generated:** 2026-04-09T12:00:00Z
**Analyzed by:** iSDLC Discover (full re-discovery, existing project flow)
**Project:** iSDLC Framework v0.1.0-alpha
**Previous Discovery:** 2026-03-27

---

## 1. Executive Summary

The iSDLC framework is a Node.js CLI and agent orchestration platform that installs an AI-powered software development lifecycle into any project via Claude Code (and Codex) integration. Since the last discovery (2026-03-27), the codebase has continued growing: production JS modules increased from ~130 to ~310, agent definitions from 70 to 71, skills from 276 to 280, and hooks from 30 to 30. The dual module system (ESM for core/lib, CJS for hooks) remains intact. The embedding pipeline received significant work (GH-237 Jina v2, GH-238 hardware acceleration in progress). The command model was simplified to add/analyze/build (GH-215). Total test count grew from ~1,600 to ~6,500+ test cases across ~597 test files. Top concern: 420 failing tests concentrated in hooks (379) and core (39) suites, primarily around workflow-finalizer and contract-generator test expectations.

## 2. Architecture Overview

| Layer | Components | Pattern | Notes |
|-------|------------|---------|-------|
| CLI Entry | `bin/isdlc.js` -> `lib/cli.js` | ESM command router | 7 bin entries: isdlc, setup-knowledge, embedding, embedding-server, embedding-mcp, rebuild-cache, generate-contracts |
| CLI Modules | `lib/*.js` (5 prod modules) | Procedural async/await | updater, monorepo-handler, setup-project-knowledge, setup-search |
| CLI Utilities | `lib/utils/*.js` (4 modules) | Shared helpers | fs-helpers, logger, prompts, test-helpers |
| Embedding Pipeline | `lib/embedding/**/*.js` (41 modules) | Multi-engine pipeline | Chunker (tree-sitter + fallback), engine (Jina v2/OpenAI/Voyage + worker pool + device detector), aggregation, distribution, redaction, VCS (git/svn), registry, knowledge, MCP server, package builder, server (HTTP + lifecycle + refresh), incremental, HNSW |
| Search Subsystem | `lib/search/**/*.js` (12 modules) | Backend-routed search | Lexical, enhanced-lexical, semantic, structural, indexed backends + config, detection, install, ranker, registry, router |
| Core Layer | `src/core/**/*.js` (137 modules) | Provider-neutral ESM | 22 domains: analyze, backlog, bridge, compliance, config, content, discover, finalize, hooks, installer, memory, observability, orchestration, providers, roundtable, search, skills, state, tasks, teams, validators, workflow |
| Bridge Layer | `src/core/bridge/*.cjs` (23 modules) | CJS-ESM bridge | Adapters for each core domain callable from CJS hooks |
| Provider: Claude | `src/providers/claude/*.js` (5 modules) | Claude Code adapter | hooks, installer, projection, runtime, index |
| Provider: Codex | `src/providers/codex/*.js` (8 modules) | Codex adapter | governance, installer, projection, runtime, verb-resolver, task-dispatch, commands/, index |
| Runtime Hooks | `src/claude/hooks/*.cjs` (30 hooks) | CJS stdin/stdout JSON | Intercept Claude Code tool calls, enforce gates, inject context |
| Hook Lib | `src/claude/hooks/lib/*.cjs` (14 modules) | Shared CJS utilities | common, gate-logic, state-logic, profile-loader, persona-loader, roundtable-config, performance-budget, three-verb-utils, toon-encoder, user-hooks, provider-utils, gate-requirements-injector |
| Agent Definitions | `src/claude/agents/**/*.md` (71 files) | Markdown specification | SDLC phases 00-16, discover (24), personas (8), roundtable, bug-roundtable, bug-gather, skill-manager |
| Skill Definitions | `src/claude/skills/**/*.md` (280 files) | SKILL.md per skill | 20 categories |
| Command Definitions | `src/claude/commands/*.md` (7 files) | Markdown command spec | add, analyze, build, discover, isdlc, provider, tour |
| Config System | `src/isdlc/config/` (27 files) | JSON + YAML configs | iteration-requirements, phase-topology, profiles, contracts, templates, workflows, tool-routing, coding-standards |
| Packages | `packages/bulk-fs-mcp/` | MCP server | Bulk file operations with section parsing and file locking |
| Shell Scripts | `install.sh`, `uninstall.sh`, `update.sh` | Bash (macOS/Linux) | Parallel to Node.js CLI for non-npm users |
| PowerShell Scripts | `install.ps1`, `uninstall.ps1`, `update.ps1` | PowerShell (Windows) | Windows-native installer |
| CI/CD | `.github/workflows/` (2 files) | GitHub Actions | 3-OS x 3-Node matrix (20, 22, 24), integration tests |

## 3. Tech Stack

| Component | Technology | Version | Notes |
|-----------|------------|---------|-------|
| Language | JavaScript (ESM + CJS) | ES2022+ | Dual module system: ESM for core/lib, CJS for hooks |
| Runtime | Node.js | 20/22/24 | CI tests all three; local dev on v24 |
| Test Runner | `node --test` | Built-in | No external test framework; native Node.js test runner |
| Assertion | `node:assert` | Built-in | strict mode |
| Dependencies | chalk ^5.3.0, fs-extra ^11.2.0, js-yaml ^4.1.1, @huggingface/transformers ^4, prompts ^2.4.2, semver ^7.6.0 | Production | Minimal dependency footprint (6 packages) |
| Dev Dependencies | None | -- | Zero devDependencies |
| Package Manager | npm | -- | package-lock.json present |
| VCS | Git + GitHub | -- | Main branch, feature branches per workflow |
| CI/CD | GitHub Actions | v4 | ci.yml (lint + test matrix + integration), publish.yml |
| MCP Servers | code-index-mcp, bulk-fs-mcp | -- | Code search and bulk file ops |
| Embedding Engine | Jina v2 Base Code | @huggingface/transformers ^4 | Local offline embeddings with CoreML hardware acceleration |
| State Management | JSON files on filesystem | -- | .isdlc/state.json (main), .isdlc/config.json |
| Configuration | JSON + YAML | -- | skills-manifest.json, iteration-requirements.json, phase-topology.json, profiles/, contracts/ |

## 4. Test Health Dashboard

| Type | Tests | Pass | Fail | Files | Status |
|------|-------|------|------|-------|--------|
| Unit (lib/) | ~900* | ~870 | ~30 | 66 | Warning |
| Unit (hooks) | 4,664 | 4,256 | 379** | 180 | Warning |
| Unit (core) | 1,578 | 1,539 | 39 | 165 | Warning |
| Unit (providers) | 249 | 249 | 0 | ~20 | OK |
| E2E | 20 | 19 | 1 | 2 | Warning |
| Characterization | 0 | 0 | 0 | 0 | N/A |
| **Total** | **~7,400+** | **~6,930** | **~450** | **~597** | **~93% pass rate** |

*Lib tests include embedding tests which may require hardware resources (ONNX runtime).
**Hook failures concentrated in workflow-finalizer and contract-generator expectations.

**Test runner:** Node.js built-in `node --test` (no external test framework)

**Test scripts:**
- `npm test` -- lib/ unit tests (includes embedding)
- `npm run test:hooks` -- hook CJS tests
- `npm run test:core` -- src/core/ tests
- `npm run test:providers` -- provider adapter tests
- `npm run test:e2e` -- CLI end-to-end tests
- `npm run test:char` -- characterization tests (currently empty)
- `npm run test:all` -- all suites combined

**Coverage estimate:** No formal coverage tool configured. Based on file analysis:
- Core modules (137 prod files): ~85% coverage (165 test files)
- Hooks (30 hooks + 14 lib): ~90% coverage (180 test files)
- Lib (69 prod files): ~80% coverage (66 test files)
- Providers (13 modules): ~85% coverage (20 test files)
- Embedding pipeline (41 modules): ~75% coverage
- Critical paths (installer, updater, hook enforcement): ~95%

## 5. Data Model

**No database.** All state is managed via JSON files on the filesystem.

| Store | File | Format | Purpose |
|-------|------|--------|---------|
| Runtime State | `.isdlc/state.json` | JSON | Active workflow, phases, counters, history |
| User Config | `.isdlc/config.json` | JSON | Cache budget, embedding config, tier defaults |
| Constitution | `docs/isdlc/constitution.md` | Markdown | 15 articles governing development |
| Skills Manifest | `src/isdlc/config/skills-manifest.json` | JSON | Skill metadata, bindings, injection rules |
| Iteration Requirements | `src/isdlc/config/iteration-requirements.json` | JSON | Phase iteration limits, circuit breakers |
| Phase Topology | `src/isdlc/config/phase-topology.json` | JSON | Phase ordering, team type, debatable flag |
| Profiles | `src/isdlc/config/profiles/*.json` | JSON | Quality profiles (speed, balanced, paranoid) |
| Contracts | `src/isdlc/config/contracts/*.contract.json` | JSON | Phase input/output contracts |
| Tool Routing | `src/isdlc/config/tool-routing.json` | JSON | MCP tool preference rules |
| Provider Config | `src/claude/hooks/config/provider-defaults.yaml` | YAML | Multi-provider model definitions |
| Embedding Index | `.emb` package | Binary | HNSW vector index + chunked embeddings |
| Settings | `.claude/settings.json` | JSON | Claude Code permissions, hooks config |

**Entity Relationships:**
- `state.json` -> references `phases` -> references `artifacts` -> stored in `docs/requirements/{slug}/`
- `state.json.active_workflow` -> tracks current workflow with phase_status map
- `state.json.workflow_history` -> append-only log of completed workflows
- `skills-manifest.json` -> maps skills to agents via `bindings.agents[]`
- `phase-topology.json` -> defines phase sequence, team types, debate configuration
- `contracts/*.contract.json` -> define required inputs/outputs per phase

## 6. Functional Features

**Workflows (4 types):**

| Workflow | Phases | Triggered By |
|----------|--------|--------------|
| Build | 05-test-strategy -> 06-implementation -> 16-quality-loop -> 08-code-review | `/isdlc build`, "build", "implement" |
| Analyze | roundtable (requirements -> impact -> architecture -> design -> tasks) | `/isdlc analyze`, "analyze", "plan" |
| Upgrade | 01-requirements -> 02-impact -> 05-test-strategy -> 06-impl -> 16-ql -> 08-cr | `/isdlc upgrade` |
| Test | 05-test-strategy -> 06-implementation -> 16-quality-loop | `/isdlc test generate` |

**Commands (7 slash commands):**
/add, /analyze, /build, /discover, /isdlc, /provider, /tour

**CLI Commands (7 bin entries):**
isdlc (init/update/version/doctor/uninstall), isdlc-setup-knowledge, isdlc-embedding (generate/serve), isdlc-embedding-server, isdlc-embedding-mcp, rebuild-cache, generate-contracts

**Agent Categories:**

| Category | Count | Key Agents |
|----------|-------|------------|
| SDLC Phase | 22 | orchestrator, requirements-analyst, solution-architect, software-developer |
| Debate | 6 | requirements-critic/refiner, architecture-critic/refiner, design-critic/refiner |
| Discover | 24 | architecture-analyzer, feature-mapper, constitution-generator, data-model-analyzer |
| Persona | 8 | business-analyst, solutions-architect, qa-tester, security-reviewer, domain-expert |
| Roundtable | 2 | roundtable-analyst, bug-roundtable-analyst |
| Other | 9 | skill-manager, bug-gather-analyst, upgrade-engineer, quality-loop-engineer |

**Skill Categories (20):**

| Category | Skills | Primary Domain |
|----------|--------|---------------|
| discover | 30+ | Discovery orchestration |
| analysis-steps | 24 | Roundtable analysis |
| reverse-engineer | 21 | Behavior extraction |
| testing | 18 | Test design and execution |
| tracing | 12 | Bug diagnosis |
| architecture | 10 | Architecture design |
| development | 10 | Implementation |
| security | 8 | Security analysis |
| operations | 6 | DevOps and deployment |
| (10 more categories) | ~141 | Various |

**Runtime Hooks (30):**

| Hook | Type | Purpose |
|------|------|---------|
| branch-guard | PreToolUse | Prevent commits to main during active workflow |
| gate-blocker | PreToolUse | Block phase advancement without passing gates |
| state-file-guard | PreToolUse | Force state.json writes through Edit/Write tools |
| inject-session-cache | PreToolUse | Inject constitution and skills into session |
| phase-sequence-guard | PreToolUse | Enforce phase ordering |
| delegation-gate | PreToolUse | Validate agent delegation |
| iteration-corridor | Notification | Track iteration counts and circuit breakers |
| constitution-validator | PostToolUse | Verify constitutional compliance attestation |
| mcp-tool-router | PreToolUse | Route to higher-fidelity MCP tools |
| (21 more hooks) | Various | Gate enforcement, observability, compliance |

## 7. Action Items

| # | Action | Priority | Effort | Rationale |
|---|--------|----------|--------|-----------|
| 1 | Fix 379 failing hook tests (workflow-finalizer, contract-generator) | P0 | M | 8.1% failure rate in hooks suite; likely stale test expectations |
| 2 | Fix 39 failing core tests (profile-loader, contract-generator expectations) | P0 | S | Validator tests referencing moved config paths |
| 3 | Add code coverage tooling (c8 or node --test --experimental-test-coverage) | P1 | M | No formal coverage metrics; can't validate constitution thresholds |
| 4 | Complete GH-238 embedding hardware acceleration build | P1 | M | Active workflow in implementation phase; OOM bug reported |
| 5 | Re-extract AC for new domains (core orchestration, teams, validators, search, embedding) | P1 | L | 9+ new domains lack behavior specs |
| 6 | Add linter (ESLint) | P2 | M | `npm run lint` echoes "No linter configured"; CI lint job is a no-op |
| 7 | Add integration tests for embedding pipeline | P2 | M | 41 modules with unit tests but no integration validation |
| 8 | Populate characterization tests | P2 | M | test:char suite currently empty |
| 9 | Add E2E tests for workflow lifecycle (beyond CLI lifecycle and status) | P2 | M | Only 2 E2E tests; workflow flows untested end-to-end |
| 10 | Update constitution baseline (1600 -> current test count) | P2 | S | Article II baseline should reflect actual ~7,400+ tests |

## 8. Patterns and Conventions

**File Naming:**
- Production files: `kebab-case.js` (ESM) or `kebab-case.cjs` (CJS hooks)
- Test files: `kebab-case.test.js` or `kebab-case.test.cjs` co-located with or mirroring production structure
- Agent files: `NN-agent-name.md` (phase agents) or `agent-name.md` (non-phase)
- Skill files: `SKILL.md` inside category/skill-name/ directories

**Error Handling:**
- Hooks MUST fail-open (exit 0, no output) on errors -- Article X
- All hooks validate stdin JSON before processing
- Bridge modules catch ESM import errors and fall back gracefully

**Module System Boundaries:**
- ESM: `lib/`, `src/core/`, `src/providers/`, `bin/`
- CJS: `src/claude/hooks/`, `src/core/bridge/`
- Bridge pattern: CJS hook requires bridge module, bridge dynamically imports ESM core module

**State Mutation:**
- All state writes go through `writeState()` / Edit/Write tools (enforced by state-file-guard hook)
- state.json is the single source of runtime truth
- Append-only arrays: `workflow_history`, `skill_usage_log`
