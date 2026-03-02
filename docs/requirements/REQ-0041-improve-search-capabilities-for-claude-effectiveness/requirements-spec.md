# Requirements Specification: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Problem Discovery (high), Requirements Definition (high), Technical Context (medium)
**Source**: GitHub Issue #34 (GH-34)
**Slug**: REQ-0041-improve-search-capabilities-for-claude-effectiveness

---

## 1. Business Context

### Problem Statement

The iSDLC framework relies exclusively on Claude Code's built-in Grep and Glob tools for all codebase search operations -- during quick scans, impact analysis, discovery, and general agent work. These text-based search tools have fundamental limitations:

- **No code structure awareness**: Cannot distinguish function definitions from comments or string literals
- **No persistent index**: Rescans the entire codebase on every query, compounding across agents that each perform independent searches
- **Keyword ambiguity**: Common identifiers produce hundreds of irrelevant results, consuming context window tokens
- **No semantic understanding**: Cannot find code by intent (e.g., "authentication logic") unless the literal term appears
- **Line-oriented**: Multi-line patterns (function signatures, decorators) require special flags agents often forget

These limitations degrade agent effectiveness at scale. Benchmarks show Claude Code averaging 3.5 minutes per search on large codebases versus 15 seconds for indexed search. The iSDLC framework's own `src/claude/` directory contains 526+ files, and end-user codebases can be significantly larger.

### Success Criteria

- Reduced search time during analysis workflows (measurable via agent execution duration)
- Higher search accuracy -- agents find relevant files with less noise
- Scalable to codebases with up to 500,000 files
- No degradation of existing functionality when enhanced search is unavailable

### Cost of Inaction

As the framework and its users' codebases grow, search-dependent operations (quick scan, impact analysis, discovery) will become progressively slower and less accurate, eroding the quality of analysis artifacts and user confidence in the framework.

## 2. Stakeholders and Personas

### Primary Users

**P1: iSDLC Framework Developer**
- Role: Contributor developing or maintaining the iSDLC framework itself
- Pain points: Redundant searches across 526+ files in `src/claude/`, noise from common identifiers (`search`, `scan`, `config`), slow analysis passes during framework development
- Interest: Faster, more accurate development workflow within the framework

**P2: iSDLC End User (Large Codebase)**
- Role: Developer or team using iSDLC to manage a large project (10K-500K files)
- Pain points: Analysis workflows (quick scan, impact analysis, discovery) hit scaling walls; repeated unindexed scans; poor signal-to-noise ratio in search results
- Interest: Framework-managed search optimization that works out of the box without manual configuration

### Secondary Users

**P3: iSDLC End User (Small Codebase)**
- Role: Developer using iSDLC on a small project (<10K files)
- Pain points: Minimal -- Grep/Glob is adequate at this scale
- Interest: Should not be forced into unnecessary tool installation; existing experience must not degrade

## 3. User Journeys

### UJ-01: First-Time Setup with Search Detection

**Entry**: User runs `isdlc init` or `/discover` on a new or existing project.
**Happy path**:
1. Framework scans system for available search tools (ast-grep, Probe, etc.)
2. Framework assesses project size (file count)
3. Framework recommends search tools based on project size and available tools
4. User is informed: "Your project has ~85K files. I recommend installing ast-grep and Probe for enhanced search. This adds two MCP servers to your configuration. Proceed? (Y/n)"
5. User confirms; framework installs tools and configures MCP servers
6. Search capabilities recorded in project configuration
**Error path**: Installation fails (permissions, network, unsupported platform) -- framework informs user, falls back to next best option, continues setup without blocking.
**Opt-out path**: User declines or passes `--no-search-setup` -- framework proceeds with Grep/Glob baseline.

### UJ-02: Agent Search During Analysis

**Entry**: User runs `/isdlc analyze` on a requirement.
**Happy path**:
1. Quick-scan agent requests structural search for relevant patterns
2. Search abstraction routes to best available backend (e.g., ast-grep for structural queries)
3. Agent receives ranked, structured results with AST context
4. Impact analysis agents reuse indexed results instead of rescanning
**Degraded path**: Enhanced backend unavailable (MCP server crashed) -- framework notifies user ("Enhanced search unavailable, falling back to standard search. Results may be less precise."), continues with Grep/Glob.

### UJ-03: Opt-Out and Reconfiguration

**Entry**: User wants to disable enhanced search or change configuration.
**Happy path**:
1. User runs configuration command or edits settings
2. Framework disables MCP servers, reverts to Grep/Glob
3. All agents continue functioning with baseline search

## 4. Technical Context

### Current State

- All 48 agents use Claude Code's built-in Grep and Glob tools directly
- No MCP servers configured in `.claude/settings.json`
- Quick-scan agent has a 30-second search time limit
- Impact analysis sub-agents (4 agents) each run independent Grep/Glob searches
- Discovery orchestrator spawns multiple agents that each scan the codebase
- No search result caching or sharing between agents

### Technical Constraints

- **Local-first**: Prefer fully local tools (no cloud API dependencies by default)
- **Cloud-optional**: Users may opt into cloud-based search (e.g., embedding APIs) if they choose
- **Cross-platform**: Must work on macOS, Linux, and Windows (framework supports all three)
- **Non-blocking installation**: Search tool installation must not block project setup
- **MCP protocol**: Enhanced search backends integrate via MCP servers, which Claude Code already supports
- **Backward compatible**: Existing Grep/Glob search must remain functional as the baseline fallback

### Integration Points

- `lib/installer.js` -- search detection and installation step
- `.claude/settings.json` -- MCP server configuration
- Agent files (48 agents) -- migration to search abstraction
- Quick-scan agent -- primary consumer of enhanced search
- Impact analysis sub-agents (4) -- high-frequency search consumers
- Discovery analyzers -- codebase-wide scanning
- Analysis topic/step files -- reference search methodology

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Performance | Must Have | Sub-second queries for structural/indexed search on 500K file codebases |
| Accuracy | Must Have | Reduced false positives vs raw Grep (measurable via precision metric) |
| Reliability | Must Have | Graceful degradation to Grep/Glob if enhanced backends unavailable |
| Usability | Should Have | Zero-config for users who accept defaults; clear opt-out mechanism |
| Maintainability | Should Have | Adding a new search backend requires no changes to agent code |
| Portability | Must Have | Works on macOS, Linux, Windows |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R-01: MCP server instability causes search failures | Medium | High | Graceful fallback to Grep/Glob with user notification |
| R-02: Tool installation fails on restricted environments | Medium | Medium | Priority-ordered fallback list; never block setup |
| R-03: Search abstraction adds latency for small codebases | Low | Medium | Bypass abstraction when project < threshold size (e.g., 10K files) |
| R-04: Inconsistent results across backends | Medium | High | Uniform result contract; integration tests per backend |
| R-05: 500K file indexing overwhelms user machine resources | Low | High | Resource-aware configuration; index only on demand for very large codebases |

## 6. Functional Requirements

### FR-001: Search Abstraction Layer

**Description**: Define a unified search interface that agents call instead of Grep/Glob directly. The abstraction accepts search requests with intent and modality hints, routes to the best available backend, and returns uniformly structured results.

**Confidence**: High

**Acceptance Criteria**:
- AC-001-01: Agents can request search by intent (e.g., "find functions that handle authentication") with a modality hint (`lexical`, `structural`, `semantic`, `indexed`, `lsp`, `any`)
- AC-001-02: The search router selects the best available backend for the requested modality
- AC-001-03: If the requested modality is unavailable, the router degrades gracefully to the next best option (ultimately Grep/Glob)
- AC-001-04: All backends return results in a uniform contract: file path, match type, relevance score, context snippet, AST metadata (when available)
- AC-001-05: Result sets support pagination and configurable token budget limits

### FR-002: Search Backend Registry

**Description**: Maintain a registry of available search backends with their capabilities, health status, and priority ordering.

**Confidence**: High

**Acceptance Criteria**:
- AC-002-01: Registry tracks five modality categories: `lexical`, `structural`, `semantic`, `indexed`, `lsp`
- AC-002-02: Each backend entry includes: modality, tool name, health status (healthy/degraded/unavailable), priority within its modality
- AC-002-03: Registry is populated during project setup and can be refreshed at runtime
- AC-002-04: Grep/Glob is always registered as the `lexical` fallback with lowest priority (never removed)

### FR-003: Search Capability Detection

**Description**: During `isdlc init` or `/discover`, detect available search tools on the user's system and assess project size to determine recommended configuration.

**Confidence**: High

**Acceptance Criteria**:
- AC-003-01: Detection checks for: ast-grep, Probe, Zoekt, system Node.js version, available package managers (npm, brew, cargo)
- AC-003-02: Detection assesses project file count to determine scale tier (small <10K, medium 10K-100K, large 100K-500K)
- AC-003-03: Detection checks for existing MCP server configurations and respects them
- AC-003-04: Detection results are reported to the user with recommended actions

### FR-004: Search Tool Installation

**Description**: Offer to install recommended search tools that are not present on the user's system. Inform the user about each installation, allow opt-out, and handle failures gracefully.

**Confidence**: High

**Acceptance Criteria**:
- AC-004-01: Framework presents recommended tools with explanation: what each tool does, why it is recommended, what it will install
- AC-004-02: User can accept all, accept selectively, or decline all installations
- AC-004-03: Installation failures are reported to the user with the specific error
- AC-004-04: Failed installations fall back to the next option in the priority list without blocking setup
- AC-004-05: A `--no-search-setup` flag skips the entire detection and installation flow

### FR-005: MCP Server Configuration

**Description**: Automatically configure MCP servers in `.claude/settings.json` for installed search backends.

**Confidence**: High

**Acceptance Criteria**:
- AC-005-01: MCP server entries are added to `.claude/settings.json` under `mcpServers` for each installed backend
- AC-005-02: Existing MCP server configurations are preserved (no overwrites)
- AC-005-03: Configuration includes server command, arguments, and environment variables
- AC-005-04: Configuration can be removed cleanly when user opts out

### FR-006: Graceful Degradation with Notification

**Description**: When an enhanced search backend becomes unavailable during a session, fall back to Grep/Glob and inform the user.

**Confidence**: High

**Acceptance Criteria**:
- AC-006-01: Backend health is checked before routing a search request
- AC-006-02: If a backend is unhealthy, the router falls back to the next available backend in priority order
- AC-006-03: User is notified once per session when degradation occurs: "Enhanced search unavailable, falling back to standard search. Results may be less precise."
- AC-006-04: Degradation does not block or halt the current workflow

### FR-007: Structural Search Backend (Phase 1)

**Description**: Integrate ast-grep as the first structural search backend, enabling AST-aware code search via MCP server.

**Confidence**: Medium

**Acceptance Criteria**:
- AC-007-01: ast-grep MCP server can be installed and configured via the setup flow
- AC-007-02: Structural queries (e.g., "find all async functions", "find console.log calls") route to ast-grep when available
- AC-007-03: Results include AST context (node type, parent scope, file location)
- AC-007-04: Supports JavaScript, TypeScript, Python, and other tree-sitter-supported languages

### FR-008: Enhanced Lexical Search Backend (Phase 1)

**Description**: Integrate Probe as an enhanced lexical search backend that adds tree-sitter context and BM25 ranking on top of ripgrep.

**Confidence**: Medium

**Acceptance Criteria**:
- AC-008-01: Probe MCP server can be installed and configured via the setup flow
- AC-008-02: Lexical queries with structural hints route to Probe when available (preferred over raw Grep)
- AC-008-03: Results include relevance ranking and tree-sitter context
- AC-008-04: Falls back to raw Grep/Glob when Probe is unavailable

### FR-009: Agent Migration Path

**Description**: Provide a migration path for existing agents to use the search abstraction without requiring all agents to migrate simultaneously.

**Confidence**: Medium

**Acceptance Criteria**:
- AC-009-01: Search abstraction wraps existing Grep/Glob as the `lexical` backend from day one
- AC-009-02: Agents can be migrated incrementally -- non-migrated agents continue using Grep/Glob directly
- AC-009-03: High-impact agents migrate first: quick-scan agent, impact analysis sub-agents (4), discovery analyzers
- AC-009-04: Migration guide documents how to convert a direct Grep/Glob call to a search abstraction call

### FR-010: Search Configuration Management

**Description**: Allow users to view, modify, and reset their search configuration after initial setup.

**Confidence**: Medium

**Acceptance Criteria**:
- AC-010-01: Users can view current search configuration (active backends, health status)
- AC-010-02: Users can disable specific backends without affecting others
- AC-010-03: Users can re-run search detection to pick up newly installed tools
- AC-010-04: Users can reset to Grep/Glob baseline with a single action

### FR-011: Result Ranking and Token Budget

**Description**: Search results are ranked by relevance and constrained by a configurable token budget to prevent context window overflow.

**Confidence**: Medium

**Acceptance Criteria**:
- AC-011-01: Results are ranked by relevance score (backend-provided or BM25 post-processing)
- AC-011-02: Agents can specify a maximum token budget for search results
- AC-011-03: Results exceeding the token budget are truncated from the lowest-relevance end
- AC-011-04: Deduplication removes identical matches across multiple search passes

### FR-012: Semantic Search Backend (Phase 2)

**Description**: Integrate embedding-based semantic search for natural language code queries. Local-first with optional cloud provider.

**Confidence**: Low

**Acceptance Criteria**:
- AC-012-01: Local embedding model (e.g., CodeBERT) supported as default
- AC-012-02: Optional cloud embedding providers (Voyage, OpenAI) configurable by user
- AC-012-03: Semantic queries ("where do we handle authentication") return ranked results
- AC-012-04: Index is built locally and persisted between sessions

### FR-013: Indexed Search Backend (Phase 2)

**Description**: Integrate trigram-indexed search (Zoekt or equivalent) for sub-second full-codebase queries on large codebases.

**Confidence**: Low

**Acceptance Criteria**:
- AC-013-01: Trigram index is built during project setup or on first search
- AC-013-02: Index is incrementally updated on file changes
- AC-013-03: Queries execute in sub-second time on 500K file codebases
- AC-013-04: Index storage is resource-aware (configurable limits)

## 7. Out of Scope

- **LSP integration**: Claude Code already ships native LSP support (Dec 2025). This requirement does not duplicate LSP -- it complements it for search use cases LSP does not cover (cross-file pattern search, semantic queries).
- **Custom embedding model training**: Phase 2 semantic search uses pre-trained models. Fine-tuning on user codebases is out of scope.
- **Search UI**: No visual search interface. All search is agent-driven through the abstraction layer.
- **Real-time file watching**: Index updates are triggered during analysis workflows, not via persistent file watchers.
- **Replacing Grep/Glob entirely**: Grep/Glob remains the permanent fallback. The abstraction enhances, not replaces.

## 8. MoSCoW Prioritization

### Must Have
- FR-001: Search Abstraction Layer
- FR-002: Search Backend Registry
- FR-003: Search Capability Detection
- FR-004: Search Tool Installation
- FR-005: MCP Server Configuration
- FR-006: Graceful Degradation with Notification

### Should Have
- FR-007: Structural Search Backend (ast-grep)
- FR-008: Enhanced Lexical Search Backend (Probe)
- FR-009: Agent Migration Path
- FR-011: Result Ranking and Token Budget

### Could Have
- FR-010: Search Configuration Management

### Won't Have (This Iteration)
- FR-012: Semantic Search Backend (Phase 2)
- FR-013: Indexed Search Backend (Phase 2)

## Pending Sections

None -- all sections covered.
