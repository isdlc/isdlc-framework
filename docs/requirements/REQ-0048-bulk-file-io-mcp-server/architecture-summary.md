# Architecture Summary: Bulk File I/O MCP Server

**Accepted**: 2026-03-07

---

**Key Architecture Decisions**:

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | MCP Server (not shared library) | Protocol-standard, reusable across projects, matches existing `code-index-mcp` pattern |
| ADR-002 | Temp file + rename in same directory | POSIX atomic rename guaranteed when same filesystem; crash-safe by construction |
| ADR-003 | Per-path mutex for concurrency | Prevents write races; cheap for typical workloads; 30s timeout prevents deadlocks |
| ADR-004 | Heading text + optional marker override for sections | Default works with standard markdown; markers add precision when needed |
| ADR-005 | `packages/bulk-fs-mcp/` location | Clear package boundary; clean extraction path to independent repo later |

**Technology Stack**:
- Node.js 18+, MCP SDK (`@modelcontextprotocol/sdk`), stdio transport
- Zero external runtime dependencies beyond MCP SDK
- Under 300 lines of implementation

**Integration Points**:
- `.mcp.json`: New `bulk-fs-mcp` entry alongside existing `code-index-mcp`
- Three verbs consume the server: add (directory creation), analyze (batch write/read), build (batch write/read, section update)
- Fail-open architecture: agents detect server via `.mcp.json`, fall back to built-in tools if unavailable (same pattern as search abstraction layer)

**Risk Assessment**:
- Cross-device rename: mitigated by temp file in same directory as target
- MCP protocol serialization: mitigated by batch operations as primary parallelism mechanism
- Agent instruction complexity: mitigated by simple if/else detection pattern and tool selection guidance

**Assumptions and Inferences**: None. Architecture decisions were discussed and confirmed during conversation.

Detailed artifact: `architecture-overview.md`
