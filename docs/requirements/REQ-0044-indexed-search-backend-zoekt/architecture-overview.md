# Architecture Overview: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Architecture Options (high), Selected Architecture (high), Technology Decisions (high), Integration Architecture (high)

---

## 1. Architecture Options

### Decision 1: Which Indexed Search Backend to Integrate

#### Option A: Zoekt (Go, Trigram-Based)

| Aspect | Assessment |
|--------|------------|
| **Summary** | Google's trigram-based code search engine; battle-tested at Sourcegraph scale |
| **Pros** | Proven at massive scale; efficient trigram indexing; strong regex support |
| **Cons** | No file watching (periodic reindex only); no Windows support; Go binary dependency; existing MCP wrappers lack file watching |
| **Pattern** | External binary + MCP wrapper |
| **Verdict** | Rejected -- fails cross-platform and zero-maintenance requirements |

#### Option B: ViperJuice/Code-Index-MCP (Python, BM25 + tree-sitter)

| Aspect | Assessment |
|--------|------------|
| **Summary** | Python MCP server using SQLite FTS5 with BM25 ranking and tree-sitter AST parsing; built-in Watchdog file monitoring |
| **Pros** | Real-time file watching; full cross-platform (Win/macOS/Linux/WSL2); already an MCP server; sub-100ms queries; hybrid BM25 + optional semantic search; pip installable; 46+ language support via tree-sitter |
| **Cons** | Requires Python 3.8+; newer project (less battle-tested than Zoekt); BM25/FTS5 instead of trigram (different search characteristics) |
| **Pattern** | pip-installed MCP server |
| **Verdict** | Selected -- best fit for all five core criteria |

#### Option C: johnhuang316/code-index-mcp (Python, tree-sitter + ripgrep)

| Aspect | Assessment |
|--------|------------|
| **Summary** | Python MCP server using tree-sitter for AST parsing and dispatching to system search tools (ripgrep, ag, grep) |
| **Pros** | File watching; cross-platform; 14 MCP tools; two-tier indexing (shallow + deep) |
| **Cons** | Relies on external search tools (ripgrep) being installed; less integrated indexing approach; shallower symbol extraction than Option B |
| **Pattern** | pip-installed MCP server |
| **Verdict** | Runner-up -- viable alternative if Option B proves unsuitable |

#### Option D: Custom Zoekt MCP Wrapper (Go, Custom)

| Aspect | Assessment |
|--------|------------|
| **Summary** | Fork trondhindenes/code-index-mcp and add file watching via fsnotify |
| **Pros** | Gets Zoekt trigram indexing with file watching; single Go binary |
| **Cons** | Significant development effort; maintenance burden of a fork; still no Windows; Go build dependency |
| **Pattern** | Custom development |
| **Verdict** | Rejected -- build effort disproportionate to value; doesn't solve Windows |

### Decision 2: How to Register the Backend

#### Option A: Hardcoded Registration

Register the indexed backend directly in registry.js initialization alongside grep-glob.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Simple; always available |
| **Cons** | Backend registered even when not installed; violates detection-driven pattern |
| **Verdict** | Rejected -- inconsistent with existing pattern |

#### Option B: Config-Driven Registration (Existing Pattern)

Use the existing `loadFromConfig()` flow: detection adds it to search-config.json, registry reads it on startup.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Consistent with ast-grep and probe; no new patterns; automatically handled by setup pipeline |
| **Cons** | None -- this is how the system already works |
| **Verdict** | Selected -- follows established patterns |

## 2. Selected Architecture

### ADR-001: ViperJuice/Code-Index-MCP as Indexed Backend

**Decision**: Integrate ViperJuice/Code-Index-MCP as the indexed search backend, registered under the `'indexed'` modality in the search backend registry.

**Rationale**:
- Meets all five core criteria: sub-second queries, automatic file watching, cross-platform, MCP-ready, simple installation
- The search abstraction layer already supports the `'indexed'` modality -- this fills the empty slot
- pip installation aligns with the detection/installation pipeline (new package manager, but same pattern)
- The MCP server handles index lifecycle internally -- no custom daemon management needed

**Consequences**:
- Python 3.8+ becomes a soft dependency (only required if user wants indexed search; detection skips gracefully if absent)
- pip is added as a new package manager in the detection module
- A new backend adapter file is created in `lib/search/backends/`
- The registry's inferModality/inferPriority maps gain a new entry

### ADR-002: Config-Driven Backend Registration

**Decision**: Register the indexed backend via the existing config-driven flow. The setup pipeline detects, installs, and writes the backend to search-config.json. The registry loads it from config at startup.

**Rationale**:
- Zero new patterns introduced -- follows the same path as ast-grep and probe
- Backend is only registered when actually installed and configured
- Removal is clean: delete from search-config.json and MCP settings

**Consequences**:
- No changes to registry.js initialization logic
- loadFromConfig() already handles unknown backend IDs via inferModality/inferPriority
- Backend adapter must be loadable by ID from the adapter map

### ADR-003: Python/pip as New Package Manager Category

**Decision**: Add Python and pip detection to the package manager discovery in detection.js, following the same pattern used for npm, cargo, and brew.

**Rationale**:
- pip is the standard Python package manager and the installation method for code-index-mcp
- Python 3.8+ is widely available on developer machines across all platforms
- Detection gracefully skips if Python/pip is absent -- no degradation to existing functionality

**Consequences**:
- PACKAGE_MANAGERS list grows from 3 entries to 4 (or 5, if pip3 is listed separately)
- Python version parsing is needed to confirm 3.8+ (not just presence)
- detection.test.js gains test cases for Python detection scenarios

## 3. Technology Decisions

### New Dependencies

| Dependency | Type | Justification |
|-----------|------|---------------|
| code-index-mcp | pip package (user-installed) | The indexed search backend MCP server; installed only if user accepts recommendation |

**Note**: This is a user-system dependency, not a project dependency. It does not appear in package.json or go.mod. It is installed globally on the user's machine via pip, similar to how ast-grep is installed via npm/cargo/brew.

### No Project Dependencies Added

The iSDLC framework itself gains zero new npm dependencies. All changes are to existing modules (detection, install, registry) and one new backend adapter file that uses the existing MCP transport mechanism.

### Python Version Requirement

- Minimum: Python 3.8+
- Reason: code-index-mcp requires Python 3.8+ for tree-sitter and Watchdog compatibility
- Detection: `python3 --version` preferred, `python --version` as fallback, version string parsed

## 4. Integration Architecture

### Detection and Installation Flow

```
lib/setup-search.js setupSearchCapabilities()
  |
  +-- detectSearchCapabilities(projectRoot)
  |     |
  |     +-- detectPackageManagers()
  |     |     +-- npm --version    (existing)
  |     |     +-- cargo --version  (existing)
  |     |     +-- brew --version   (existing)
  |     |     +-- pip3 --version   (NEW)
  |     |     +-- python3 --version -> parse >= 3.8  (NEW)
  |     |
  |     +-- detectTool('code-index-mcp')  (NEW entry in KNOWN_TOOLS)
  |     |     +-- code-index-mcp --version
  |     |
  |     +-- generateRecommendations()
  |           +-- code-index-mcp: 'recommended' if medium/large, 'optional' if small
  |
  +-- installTool(recommendation, consentCallback)
  |     +-- pip install code-index-mcp
  |
  +-- configureMcpServers([{id: 'code-index'}], settingsPath)
  |     +-- Writes to .claude/settings.json mcpServers section
  |
  +-- writeSearchConfig(projectRoot, config)
        +-- activeBackends: ['grep-glob', 'code-index']
```

### Runtime Search Flow

```
Agent requests: search({ query: 'SearchRouter', modality: 'indexed' })
  |
  +-- router.search()
  |     +-- validateRequest()
  |     +-- routeWithFallback('indexed')
  |           |
  |           +-- registry.getBackendsForModality('indexed')
  |           |     +-- Returns: [{ id: 'code-index', modality: 'indexed', priority: 10, health: 'healthy' }]
  |           |
  |           +-- backend.adapter.search(request)
  |           |     +-- MCP call to code-index-mcp server
  |           |     +-- Returns: normalized RawSearchHit[]
  |           |
  |           +-- (on failure) -> registry.updateHealth('code-index', 'degraded')
  |           +-- (on failure) -> fallback to grep-glob
  |
  +-- rankAndBound(hits, { tokenBudget, maxResults })
  |
  +-- Return: { hits: SearchHit[], meta: { backendUsed, degraded, durationMs, ... } }
```

### MCP Server Lifecycle

```
Session Start:
  +-- Claude Code starts
  +-- MCP servers from .claude/settings.json are started
  +-- code-index-mcp starts with project root as workspace
  +-- Initial index build (if first time) or cache load (if existing)
  +-- File watcher starts monitoring project directory

During Session:
  +-- File changes detected by Watchdog
  +-- Index incrementally updated in background
  +-- Search queries served from current index state

Session End:
  +-- Claude Code exits
  +-- MCP server processes terminated
  +-- Index persists on disk for next session
```

## 5. Summary

The architecture is deliberately minimal: extend three existing modules (detection, install, registry), add one new backend adapter, and update three agent markdown files. The ViperJuice/Code-Index-MCP server handles the complex parts (indexing, file watching, query execution) as an external MCP server. The iSDLC framework's role is purely to detect, install, configure, and route to it -- the same pattern already established for ast-grep and probe.

Key architectural properties:
- **Zero new patterns**: Every integration point follows the existing detection -> install -> configure -> register -> route chain
- **Fail-open**: Backend absence or failure never impacts existing functionality
- **Swappable**: If a better indexed backend emerges, it can replace code-index-mcp with changes to only detection.js, install.js, and registry.js -- agents and the router remain untouched
- **No project dependencies**: The MCP server is a user-system tool, not a project dependency
