# Impact Analysis: Bulk File I/O MCP Server

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. Change Summary

Introduce a new local MCP server providing bulk file I/O operations (batch read, batch write, section append, directory creation) with atomic write guarantees. Integrate it into the iSDLC framework's add, analyze, and build verbs as an optional performance enhancement with fail-open fallback.

## 2. Codebase Scan Results

### Keywords Searched
`Write tool`, `Read tool`, `MCP`, `mcpServers`, `batch write`, `parallel Write`, `mkdir`, `progressive write`, `artifact write`, `fail-open`, `search-config`

### File Counts
- Agent files referencing Write/Read tools: 6+
- Existing MCP configuration: `.mcp.json` (1 server: `code-index-mcp`)
- Existing I/O optimization tests: `test-io-optimization.test.cjs`
- Roundtable agent with batch write instructions: `roundtable-analyst.md`
- Implementation loop agents: `05-software-developer.md`, `05-implementation-reviewer.md`
- Test design agent: `04-test-design-engineer.md`

## 3. Blast Radius

### Tier 1: Direct Changes (New Files)

| File | Change | Risk |
|------|--------|------|
| `packages/bulk-fs-mcp/index.js` | **New** -- MCP server implementation | Low (new code, no existing behavior affected) |
| `packages/bulk-fs-mcp/package.json` | **New** -- Package manifest | Low |
| `packages/bulk-fs-mcp/README.md` | **New** -- Usage documentation | Low |
| `.mcp.json` | **Modify** -- Add `bulk-fs-mcp` server entry | Low (additive, does not change existing `code-index-mcp` entry) |

### Tier 2: Consumer Integration (Modifications)

| File | Change | Risk |
|------|--------|------|
| `src/claude/agents/roundtable-analyst.md` | **Modify** -- Add bulk write/read instructions for MCP server usage during finalization | Medium (agent behavior change, fail-open mitigates) |
| `src/claude/agents/04-test-design-engineer.md` | **Modify** -- Add bulk write for test artifacts | Medium |
| `src/claude/agents/05-software-developer.md` | **Modify** -- Add bulk read for test case loading | Medium |
| `src/claude/commands/isdlc.md` | **Modify** -- Add MCP availability detection and fail-open logic for add/analyze/build verbs | Medium |
| `src/claude/agents/00-sdlc-orchestrator.md` | **Modify** -- Add MCP server availability context to agent delegations | Low |

### Tier 3: Side Effects

| Area | Impact | Risk |
|------|--------|------|
| Existing test suite (`test-io-optimization.test.cjs`) | May need updates if batch write verification logic changes | Low |
| `.mcp.json` consumers (Claude Code runtime) | New server process spawned -- resource usage | Low |
| Search abstraction layer pattern | Reused as pattern for fail-open detection -- no code change | None |

## 4. Entry Points

1. **Server entry point**: `packages/bulk-fs-mcp/index.js` -- MCP server process
2. **Consumer entry point**: `.mcp.json` -- server registration
3. **Verb integration**: `src/claude/commands/isdlc.md` -- MCP availability detection logic
4. **Agent integration**: Individual agent files that switch from built-in to MCP tools

## 5. Risk Zones

| Zone | Risk Level | Likelihood | Impact | Mitigation |
|------|-----------|------------|--------|------------|
| Atomic rename on Windows | Medium | Low | Medium | Use `fs.rename` with fallback to copy+delete on cross-device errors |
| Agent instruction complexity | Medium | Medium | Low | Keep MCP usage instructions simple: "if bulk-fs-mcp available, use write_files; otherwise, use Write tool" |
| MCP protocol concurrency model | Medium | Medium | High | Batch operations within single calls eliminate dependency on concurrent MCP dispatch |
| Test design agent batch write | Low | Low | Medium | Fail-open ensures test design works without MCP server |

## 6. Implementation Order

1. **packages/bulk-fs-mcp/** -- Server implementation (self-contained, no dependencies on existing code)
2. **Server tests** -- Unit tests for all four operations + atomic write + concurrency
3. **.mcp.json** -- Register the new server
4. **isdlc.md** -- Add MCP availability detection pattern
5. **roundtable-analyst.md** -- Consumer integration for analyze verb
6. **04-test-design-engineer.md** -- Consumer integration for test design
7. **05-software-developer.md** -- Consumer integration for implementation read
8. **00-sdlc-orchestrator.md** -- Pass MCP context to delegated agents

## 7. Dependency Chain

```
packages/bulk-fs-mcp/ (independent)
    |
    v
.mcp.json (depends on server existing)
    |
    v
isdlc.md MCP detection (depends on .mcp.json pattern)
    |
    +---> roundtable-analyst.md (depends on detection pattern)
    +---> 04-test-design-engineer.md (depends on detection pattern)
    +---> 05-software-developer.md (depends on detection pattern)
    +---> 00-sdlc-orchestrator.md (depends on detection pattern)
```

## 8. Estimated File Count

- **New files**: 3-4 (server implementation, package.json, README, tests)
- **Modified files**: 5-6 (`.mcp.json`, `isdlc.md`, 3-4 agent files)
- **Total**: 8-10 files
