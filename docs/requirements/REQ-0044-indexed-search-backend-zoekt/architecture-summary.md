# Architecture Summary: Indexed Search Backend

**Accepted**: 2026-03-03

---

## Key Architecture Decisions

- **ADR-001: ViperJuice/Code-Index-MCP selected** over Zoekt, johnhuang316/code-index-mcp, and custom Zoekt wrapper. Only option meeting all five core criteria: sub-second queries, automatic file watching, cross-platform, MCP-ready, pip-installable.
- **ADR-002: Config-driven backend registration** via existing `loadFromConfig()` flow. Zero new patterns.
- **ADR-003: Python/pip as new package manager category** in detection.js, extending npm/cargo/brew pattern.

## Technology Tradeoffs

| Option | Verdict | Key Tradeoff |
|--------|---------|-------------|
| Zoekt (Go, trigram) | Rejected | Battle-tested but no file watching, no Windows |
| ViperJuice/Code-Index-MCP (Python, BM25+tree-sitter) | Selected | All criteria met; Python dependency acceptable |
| johnhuang316/code-index-mcp (Python, tree-sitter+ripgrep) | Runner-up | Relies on external search tools |
| Custom Zoekt wrapper (Go, forked) | Rejected | Build effort disproportionate; still no Windows |

## Integration

Framework's role: detect, install, configure, and route. MCP server handles indexing, file watching, and query execution externally. Zero new npm dependencies. Setup pipeline picks up new tool automatically.

## Risk Assessment

Moderate scope, low risk. Highest-risk area: Python/pip detection (new package manager category), mitigated by established patterns.
