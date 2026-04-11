# Bug Summary: BUG-GH-250

**Severity**: Medium-High
**Slug**: BUG-GH-250-embeddings-opt-in-gap
**Source**: github GH-250

The FR-006 opt-in contract (REQ-GH-239) is respected in 2 code paths but bypassed in 4 others. Users who select "N" at the install-time embeddings prompt get embeddings silently bootstrapped anyway when running `/discover`, invoking the `isdlc-embedding generate` CLI directly, starting the embedding server, or launching a Claude Code session (MCP bridge spawns every time).

**Violation sites**:
1. `bin/isdlc-embedding.js:231-243` (generate CLI)
2. `src/claude/agents/discover-orchestrator.md:2566` (discover Step 7.9)
3. `bin/isdlc-embedding-server.js:43` (server start)
4. `bin/isdlc-embedding-mcp.js:32-47` (MCP stdio bridge)

**Compliant reference**:
- `src/core/finalize/refresh-code-embeddings.js:211-220` (async)
- `src/core/finalize/finalize-utils.js:181-220` (sync F0009)

See `bug-report.md` for full details.
