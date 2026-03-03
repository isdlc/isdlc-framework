# Requirements Specification: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Problem Discovery (high), Requirements Definition (high), Technical Context (high), Prioritization (high)
**Source**: REQ-0041 FR-013 (promoted from "Won't Have" to standalone feature)
**Slug**: REQ-0044-indexed-search-backend-zoekt
**Parent**: REQ-0041-improve-search-capabilities-for-claude-effectiveness

---

## 1. Business Context

### Problem Statement

iSDLC agents perform dozens of codebase searches during every workflow (quick-scan, impact analysis, architecture analysis, discovery). On large codebases (10K-500K files), these searches use the grep-glob baseline backend, which scans files sequentially. The cumulative time cost degrades overall workflow performance -- not causing outright failures, but creating a persistent drag on productivity across every agent interaction.

The search abstraction layer (REQ-0041) and its setup pipeline integration (REQ-0042) are fully implemented, providing a pluggable backend architecture with router, registry, detection, installation, and MCP configuration. The `'indexed'` modality is already recognized by the router and registry but has no registered backend. This requirement fills that gap.

### Success Criteria

- Agents can request `modality: 'indexed'` and receive sub-second results on codebases up to 500K files
- The index is automatically maintained via file watching -- zero user intervention after initial setup
- Installation is a single package manager command during `isdlc init`
- The backend works on macOS, Linux, and Windows
- When the indexed backend is unavailable, agents degrade gracefully to grep-glob with no workflow interruption

### Cost of Inaction

Every agent search operation on large codebases remains bounded by grep's sequential scan speed. As the framework scales to larger projects and more agent workflows, this cost compounds. The search abstraction layer's `'indexed'` modality slot remains empty.

## 2. Stakeholders and Personas

### P1: iSDLC End User (Large Codebase)

- **Role**: Developer using iSDLC on a project with 10K-500K files
- **Pain point**: Agent workflows feel sluggish; searches visibly slow down analysis and discovery
- **Interest**: Transparent speed improvement with zero maintenance burden

### P2: iSDLC End User (Small Codebase)

- **Role**: Developer using iSDLC on a project with fewer than 10K files
- **Pain point**: None currently -- grep-glob is adequate at this scale
- **Interest**: Optional enhancement; should not be pressured to install

### P3: iSDLC Agent (Automated Consumer)

- **Role**: Any agent requesting search via the router
- **Pain point**: Token budget constraints mean slow searches return stale or truncated results under timeout pressure
- **Interest**: Faster, more complete search results within token budget

## 3. User Journeys

### UJ-01: First-Time Setup with Indexed Backend

**Entry**: User runs `isdlc init` on a large project (10K+ files).
**Happy path**:
1. Detection step identifies project scale as medium or large
2. Detection checks for Python 3.8+ availability
3. Detection recommends indexed search backend installation
4. User accepts; `pip install code-index-mcp` runs
5. MCP server entry is configured in `.claude/settings.json`
6. On first MCP connection, the server indexes the project directory
7. File watcher starts automatically, maintaining the index going forward
**Opt-out path**: User declines recommendation; grep-glob remains the baseline; no degradation.
**Python missing path**: Detection finds no Python 3.8+; skips indexed backend recommendation with informational message.

### UJ-02: Agent Uses Indexed Search During Analysis

**Entry**: Agent runs a search with `modality: 'indexed'` during quick-scan or impact analysis.
**Happy path**:
1. Router resolves `'indexed'` modality to the code-index backend
2. MCP server returns results in sub-100ms
3. Results are ranked, token-bounded, and returned to the agent
**Fallback path**: Indexed backend unhealthy or unavailable; router degrades to grep-glob; degradation notification emitted once per session.

### UJ-03: Automatic Index Maintenance

**Entry**: User modifies, creates, or deletes files in the project.
**Happy path**:
1. File watcher detects the change
2. Index is incrementally updated in the background
3. Subsequent searches reflect the updated state
**No-action path**: User does nothing; the index stays current automatically.

### UJ-04: Existing Installation Adds Indexed Backend

**Entry**: User with existing iSDLC installation re-runs detection (via future `/discover` integration or manual re-init).
**Path**:
1. Detection finds project has grown or user now has Python available
2. Recommends indexed backend
3. User accepts; installation and MCP configuration proceed as in UJ-01

## 4. Technical Context

### Current State

- `lib/search/router.js`: `VALID_MODALITIES` includes `'indexed'`; router routes to it if a backend is registered
- `lib/search/registry.js`: `inferModality('zoekt')` returns `'indexed'`; `inferPriority('zoekt')` returns `10`; `loadFromConfig()` populates from search-config.json
- `lib/search/detection.js`: `KNOWN_TOOLS` array has ast-grep and probe; no indexed backend entry
- `lib/search/install.js`: `MCP_CONFIGS` has ast-grep and probe; no indexed backend entry
- `lib/search/config.js`: Reads/writes `search-config.json` with `activeBackends` array
- `lib/search/backends/`: Has `lexical.js`, `enhanced-lexical.js`, `structural.js`; no indexed backend adapter
- `lib/setup-search.js`: Orchestrates detection, installation, MCP config during `isdlc init`

### Technical Constraints

- **Python runtime required**: The recommended backend (ViperJuice/Code-Index-MCP) requires Python 3.8+
- **Non-blocking**: Installation and index building must not block the installer
- **Fail-open**: If the indexed backend is unavailable at any point, the system degrades to grep-glob
- **Additive only**: No modifications to existing backends, router logic, or registry API
- **MCP transport**: Communication with the backend is via MCP protocol (same as ast-grep and probe)
- **Disk storage**: Index is stored locally; location should be configurable and excluded from git

### Integration Points

| Integration Point | Current State | Required Change |
|-------------------|---------------|-----------------|
| `lib/search/detection.js` KNOWN_TOOLS | ast-grep, probe | Add code-index-mcp entry with pip install method |
| `lib/search/detection.js` PACKAGE_MANAGERS | npm, cargo, brew | Add pip/python detection |
| `lib/search/install.js` MCP_CONFIGS | ast-grep, probe | Add code-index-mcp MCP server config |
| `lib/search/registry.js` inferModality() | zoekt -> indexed | Add code-index -> indexed mapping |
| `lib/search/registry.js` inferPriority() | zoekt -> 10 | Add code-index -> 10 mapping |
| `lib/search/backends/` | lexical, enhanced-lexical, structural | Add indexed.js backend adapter |
| `lib/setup-search.js` | Orchestrates existing tools | No change needed (picks up new KNOWN_TOOLS automatically) |

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Performance | Must Have | Sub-second query response on 500K file codebases |
| Reliability | Must Have | Indexed backend failure never blocks agent workflows |
| Maintainability | Must Have | Zero user intervention for index maintenance after setup |
| Cross-Platform | Must Have | Works on macOS, Linux, and Windows |
| Installability | Should Have | Single package manager command (`pip install`) |
| Disk Efficiency | Should Have | Index storage configurable; reasonable defaults |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R-01: Python not available on user's system | Medium | Low | Detection skips recommendation gracefully; grep-glob baseline unaffected |
| R-02: MCP server process crashes or becomes unresponsive | Low | Low | Router fallback to grep-glob; degradation notification; health check marks backend degraded |
| R-03: Initial index build is slow on very large codebases | Medium | Low | Index builds asynchronously; searches degrade to grep-glob until index is ready |
| R-04: File watcher misses changes (race conditions, OS limits) | Low | Medium | Periodic full reindex as safety net (configurable interval); manual refresh tool available |
| R-05: Disk usage grows unexpectedly for very large projects | Low | Medium | Configurable index storage limits; detection reports estimated disk cost before installation |
| R-06: pip install fails (permissions, network, version conflicts) | Medium | Low | Graceful fallback; error classification in install.js already handles this pattern |
| R-07: Upstream ViperJuice/Code-Index-MCP becomes unmaintained | Low | Medium | Backend is swappable via the abstraction layer; can migrate to alternative without agent changes |
| R-08: Index returns stale results after rapid file changes | Low | Low | File watcher handles typical edit patterns; edge cases degrade to correct-but-slow grep results |

## 6. Functional Requirements

### FR-001: Indexed Backend Detection

**Description**: Extend the search capability detection module to detect the code-index-mcp backend and Python runtime availability.

**Confidence**: High

**Priority**: Must Have

**Acceptance Criteria**:
- AC-001-01: `detection.js` KNOWN_TOOLS includes an entry for `code-index-mcp` with `pip install code-index-mcp` as the install method
- AC-001-02: Detection checks for Python 3.8+ availability (`python3 --version` or `python --version`) before recommending the indexed backend
- AC-001-03: `pip` is added to the package manager detection list alongside npm, cargo, and brew
- AC-001-04: The indexed backend is recommended as `'recommended'` for medium/large projects and `'optional'` for small projects
- AC-001-05: If Python is not available, the indexed backend is silently skipped (no error, no recommendation)

### FR-002: Indexed Backend Installation

**Description**: Extend the search tool installation module to install code-index-mcp via pip and configure its MCP server entry.

**Confidence**: High

**Priority**: Must Have

**Acceptance Criteria**:
- AC-002-01: `install.js` MCP_CONFIGS includes a configuration entry for `code-index-mcp` with the correct command and arguments to start the MCP server
- AC-002-02: Installation uses `pip install code-index-mcp` (or `pip3 install code-index-mcp` based on detected Python)
- AC-002-03: After successful installation, MCP server entry is written to `.claude/settings.json` via `configureMcpServers()`
- AC-002-04: Installation failure is logged as a warning and never blocks the setup pipeline
- AC-002-05: The `--force` flag auto-accepts the indexed backend recommendation without prompting

### FR-003: Indexed Backend Adapter

**Description**: Create a backend adapter for the indexed modality that communicates with the code-index-mcp MCP server, conforming to the existing backend adapter interface.

**Confidence**: High

**Priority**: Must Have

**Acceptance Criteria**:
- AC-003-01: A new `lib/search/backends/indexed.js` module exports a `createIndexedBackend()` function matching the adapter interface (search, healthCheck)
- AC-003-02: The adapter routes search requests to the code-index-mcp MCP server via the MCP transport
- AC-003-03: Search results are normalized to the standard `RawSearchHit` format used by the ranker
- AC-003-04: The adapter's `healthCheck()` verifies the MCP server is responsive
- AC-003-05: If the MCP server is unreachable, `search()` returns an empty array (graceful, non-throwing)

### FR-004: Registry Integration

**Description**: Register the indexed backend in the search backend registry so the router can discover and route to it.

**Confidence**: High

**Priority**: Must Have

**Acceptance Criteria**:
- AC-004-01: `registry.js` `inferModality()` maps `'code-index'` to `'indexed'`
- AC-004-02: `registry.js` `inferPriority()` maps `'code-index'` to `10`
- AC-004-03: When `search-config.json` includes `'code-index'` in `activeBackends`, `loadFromConfig()` registers it with modality `'indexed'`
- AC-004-04: The router resolves `modality: 'indexed'` requests to the code-index backend when it is healthy

### FR-005: Automatic Index Maintenance

**Description**: The indexed backend maintains its index automatically via file watching, requiring zero user intervention after initial setup.

**Confidence**: Medium

**Priority**: Must Have

**Acceptance Criteria**:
- AC-005-01: The MCP server starts its file watcher automatically when it connects to a project
- AC-005-02: File creates, modifications, and deletions are reflected in the index without manual intervention
- AC-005-03: The file watcher operates in the background without blocking search queries
- AC-005-04: Standard ignore patterns are applied (node_modules, .git, vendor, __pycache__, .isdlc)

### FR-006: Cross-Platform Support

**Description**: The indexed backend works on all platforms supported by iSDLC.

**Confidence**: Medium

**Priority**: Must Have

**Acceptance Criteria**:
- AC-006-01: Installation succeeds on macOS (Intel and Apple Silicon)
- AC-006-02: Installation succeeds on Linux (Ubuntu, Debian, Fedora tested)
- AC-006-03: Installation succeeds on Windows 10/11 with Python 3.8+
- AC-006-04: File watching uses platform-appropriate mechanisms (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows)

### FR-007: Graceful Degradation

**Description**: When the indexed backend is unavailable, all search operations degrade to the grep-glob baseline without user intervention or workflow interruption.

**Confidence**: High

**Priority**: Must Have

**Acceptance Criteria**:
- AC-007-01: If the indexed backend's health check fails, the registry marks it as `'degraded'`
- AC-007-02: The router's fallback chain skips degraded backends and falls through to grep-glob
- AC-007-03: A degradation notification is emitted once per session (not per query) via the existing `onNotification` callback
- AC-007-04: Agent workflows complete successfully regardless of indexed backend availability

### FR-008: Index Storage Configuration

**Description**: The index storage location is configurable and uses sensible platform-specific defaults.

**Confidence**: Medium

**Priority**: Should Have

**Acceptance Criteria**:
- AC-008-01: The default index location follows platform conventions (macOS: `~/Library/Application Support/code-index/`, Linux: `~/.local/share/code-index/`, Windows: `%APPDATA%/code-index/`)
- AC-008-02: The index location can be overridden via environment variable (`CODE_INDEX_DIR`)
- AC-008-03: The index directory is excluded from git (not inside the project tree by default)
- AC-008-04: Detection reports estimated disk usage before recommending installation

### FR-009: Agent Search Pattern Documentation

**Description**: Update agent markdown instructions to describe using indexed search for full-codebase queries on large projects.

**Confidence**: Medium

**Priority**: Should Have

**Acceptance Criteria**:
- AC-009-01: High-impact agents (quick-scan, impact-analyzer, entry-point-finder) include guidance for requesting `modality: 'indexed'` when performing full-codebase scans
- AC-009-02: Agent instructions describe the indexed modality as optional -- agents must continue to function with grep-glob alone
- AC-009-03: Existing search abstraction sections (from REQ-0042/REQ-0043 migrations) are extended, not replaced
- AC-009-04: Agent frontmatter is NOT modified

### FR-010: Backend Health Monitoring

**Description**: The indexed backend supports health checks that the registry uses to maintain accurate availability status.

**Confidence**: High

**Priority**: Should Have

**Acceptance Criteria**:
- AC-010-01: The backend adapter exposes a `healthCheck()` method that returns `'healthy'`, `'degraded'`, or `'unavailable'`
- AC-010-02: Health checks complete within 2 seconds (timeout)
- AC-010-03: The registry periodically evaluates backend health (on search failure, not on a polling interval)
- AC-010-04: A backend marked `'degraded'` is retried on subsequent searches; if it recovers, health is restored to `'healthy'`

## 7. Out of Scope

- **Semantic search (FR-012)**: Embedding-based natural language code search is a separate requirement with different infrastructure needs
- **Custom index configuration UI**: Users configure via environment variables, not a dedicated settings UI
- **Multi-project index sharing**: Each project maintains its own independent index
- **Cloud-hosted index**: Index is always local; no remote indexing service
- **Index backup/restore**: Index can be rebuilt from source; no backup mechanism needed
- **MCP server development**: This requirement integrates an existing MCP server; it does not build a new one

## 8. MoSCoW Prioritization

### Must Have
- FR-001: Indexed Backend Detection
- FR-002: Indexed Backend Installation
- FR-003: Indexed Backend Adapter
- FR-004: Registry Integration
- FR-005: Automatic Index Maintenance
- FR-006: Cross-Platform Support
- FR-007: Graceful Degradation

### Should Have
- FR-008: Index Storage Configuration
- FR-009: Agent Search Pattern Documentation
- FR-010: Backend Health Monitoring

### Could Have
- (None identified)

### Won't Have (This Iteration)
- (None -- all deferred items are in Out of Scope)

## Pending Sections

None -- all sections covered.
