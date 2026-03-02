# Architecture Overview: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Architecture Options (high), Selected Architecture (high), Technology Decisions (medium), Integration Architecture (medium)

---

## 1. Architecture Options

### Option A: Direct MCP Integration (No Abstraction)

Each agent configures and calls MCP search servers directly. Agents choose which MCP server to use based on their own logic.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Simple to implement initially; no abstraction overhead; agents have full control |
| **Cons** | Every agent must handle fallback logic; adding a new backend requires updating all agents; no centralized health monitoring; inconsistent result formats |
| **Pattern** | Point-to-point integration |
| **Verdict** | Rejected -- does not scale to 48 agents or 5+ backends |

### Option B: Search Abstraction Layer with Backend Registry (Recommended)

A centralized search module that agents call with intent-based requests. The module maintains a registry of available backends, routes requests to the best backend, handles fallback, and normalizes results.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Single integration point for agents; centralized fallback and health monitoring; uniform result contract; adding backends requires no agent changes; testable in isolation |
| **Cons** | Abstraction adds a layer of indirection; initial implementation effort; routing logic must be well-designed |
| **Pattern** | Strategy pattern + service registry |
| **Verdict** | Selected -- best balance of maintainability, extensibility, and agent simplicity |

### Option C: Full Search Service (Persistent Daemon)

A long-running search service that maintains indexes, caches results, and serves queries via API. Agents connect to the service rather than calling tools.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Best performance at scale; shared index across agents; cross-session caching |
| **Cons** | Significant infrastructure (daemon management, process lifecycle); overkill for Phase 1; harder to install and configure; resource consumption concerns |
| **Pattern** | Client-server / microservice |
| **Verdict** | Deferred to Phase 2 consideration -- Zoekt backend may require this pattern |

## 2. Selected Architecture

### ADR-001: Search Abstraction Layer with Backend Registry

**Decision**: Implement a search abstraction layer using the strategy pattern with a backend registry. Agents call the abstraction with intent-based requests. The abstraction routes to the best available backend and returns uniformly structured results.

**Rationale**:
- Decouples agents from search implementation details
- Enables incremental backend additions without agent code changes
- Centralizes fallback logic, health monitoring, and result normalization
- Wraps existing Grep/Glob from day one (zero-regression deployment)
- Aligns with the framework's existing pattern of agents calling tools through abstractions

**Consequences**:
- All new search backends are implemented as adapters conforming to a common interface
- Agent migration is incremental and non-breaking
- A routing algorithm must be maintained and tested

### Architecture Diagram (Textual)

```
Agent (e.g., quick-scan)
  |
  v
Search Router
  |-- checks Backend Registry for available backends
  |-- selects best backend for requested modality
  |-- handles fallback on failure
  |
  +---> Lexical Backend (Grep/Glob) -- always available
  +---> Structural Backend (ast-grep MCP) -- Phase 1
  +---> Enhanced Lexical Backend (Probe MCP) -- Phase 1
  +---> Semantic Backend (embeddings) -- Phase 2
  +---> Indexed Backend (Zoekt) -- Phase 2
  |
  v
Uniform Result Contract
  { file_path, match_type, relevance_score, context_snippet, ast_metadata }
  |
  v
Result Ranker + Token Budget Enforcer
  |
  v
Agent receives ranked, bounded results
```

### ADR-002: Local-First Tool Strategy

**Decision**: Default to fully local search tools. Cloud-based backends (embedding APIs) are opt-in only.

**Rationale**:
- Protects user code privacy by default
- Eliminates network dependency for core functionality
- Aligns with user requirement ("prefer local tools, but let users choose cloud")
- All Phase 1 tools (ast-grep, Probe) are fully local

**Consequences**:
- Phase 2 semantic search must ship with a local embedding model as default
- Cloud providers are configured explicitly by the user, never auto-enabled

### ADR-003: Auto-Detect with Opt-Out

**Decision**: Search capability detection and tool installation run automatically during `isdlc init` / `/discover`. Users are informed and can opt out.

**Rationale**:
- Maximizes adoption by reducing configuration burden
- Transparency maintained through user notification
- Opt-out respects constrained environments (air-gapped, corporate policies)

**Consequences**:
- Setup pipeline gains a new step (detection + installation)
- `--no-search-setup` flag required
- Detection must be fast (< 5 seconds) to not slow down setup

## 3. Technology Decisions

### Phase 1 Tools

| Tool | Role | Installation | License | Notes |
|------|------|-------------|---------|-------|
| **ast-grep** | Structural search | npm/cargo/brew | MIT | Tree-sitter based, MCP server available, zero infrastructure |
| **Probe** | Enhanced lexical | cargo/npm | MIT | Ripgrep + tree-sitter + BM25 ranking, MCP server available |
| **Grep/Glob** | Baseline lexical | Built into Claude Code | N/A | Always available, permanent fallback |

### Phase 2 Tools (Deferred)

| Tool | Role | Installation | License | Notes |
|------|------|-------------|---------|-------|
| **Zoekt** | Trigram indexed search | Go binary | Apache 2.0 | Sub-second queries at scale, requires index daemon |
| **CodeBERT** (or equivalent) | Local embeddings | Python/npm | MIT | Semantic search without cloud dependency |
| **Voyage-3-large** (optional) | Cloud embeddings | API key | Commercial | Higher quality embeddings, user opt-in only |

### Dependency Assessment

- **ast-grep**: Mature, actively maintained (10K+ GitHub stars), Rust-based binary
- **Probe**: Newer but purpose-built for Claude Code integration, Rust-based
- **Zoekt**: Production-proven (powers Sourcegraph), but requires Go runtime
- No new runtime dependencies for Phase 1 (ast-grep and Probe ship as standalone binaries)

## 4. Integration Architecture

### Setup Pipeline Integration

```
isdlc init / /discover
  |
  +-- Existing setup steps (unchanged)
  |
  +-- NEW: Search Capability Detection
  |     |-- Scan system for installed tools
  |     |-- Assess project file count
  |     |-- Determine scale tier
  |     |-- Report findings to user
  |     |
  |     +-- User accepts recommendations
  |     |     |-- Install missing tools
  |     |     |-- Configure MCP servers
  |     |     |-- Record search config
  |     |
  |     +-- User opts out
  |           |-- Record opt-out decision
  |           |-- Continue with Grep/Glob baseline
  |
  +-- Remaining setup steps (unchanged)
```

### Agent Integration Pattern

Non-migrated agents continue using Grep/Glob directly (no change). Migrated agents call the search abstraction:

```
// Before migration (current):
// Agent uses Grep tool directly with pattern and path

// After migration:
// Agent calls search abstraction with intent:
//   modality: "structural"
//   query: "async function $NAME($$$) { $$$ }"
//   scope: "/path/to/project"
//   token_budget: 5000
//
// Search router handles backend selection, fallback, and result formatting
```

### MCP Server Configuration

```json
{
  "mcpServers": {
    "ast-grep": {
      "command": "ast-grep",
      "args": ["lsp"],
      "env": {}
    },
    "probe": {
      "command": "probe-mcp",
      "args": ["--workspace", "{project_root}"],
      "env": {}
    }
  }
}
```

### Health Monitoring

```
On search request:
  1. Check backend health in registry
  2. If healthy -> route request
  3. If unhealthy -> try next backend in priority order
  4. If all enhanced backends unhealthy -> fall back to Grep/Glob
  5. Notify user once per session on first degradation event
```

## 5. Summary

The selected architecture uses a search abstraction layer with a backend registry (Strategy pattern). This provides:

- **Day-one compatibility**: Grep/Glob wrapped as baseline backend, zero behavior change
- **Incremental value**: Phase 1 adds structural (ast-grep) and enhanced lexical (Probe)
- **Future extensibility**: Phase 2 adds semantic and indexed backends with no agent changes
- **Graceful degradation**: Multi-level fallback with user notification
- **Local-first privacy**: No cloud dependencies by default
- **Auto-detect with opt-out**: Reduces configuration burden while respecting user choice

The architecture supports the 500K file scale target through indexed backends (Phase 2) while delivering immediate value through structural search (Phase 1).
