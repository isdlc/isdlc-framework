# Fix Strategy Summary: BUG-GH-250

**Selected**: Approach A — per-site inline guards

Import `hasUserEmbeddingsConfig` at the top of each violation site, add a ~6-line guard at function entry, handle the skip behavior locally based on context:

| Site | Behavior when opted out |
|------|------------------------|
| `bin/isdlc-embedding.js` generate CLI | Interactive prompt (TTY) reusing install-time writer, or silent skip + exit 0 (non-TTY) |
| `src/claude/agents/discover-orchestrator.md` Step 7.9 | Skip the generate block; add note to completion banner pointing at `isdlc-embedding configure` |
| `bin/isdlc-embedding-server.js` main() | stderr message, refuse to start, exit 1 |
| `bin/isdlc-embedding-mcp.js` module top-level | stderr message, exit 0 (clean exit on MCP handshake) |

**Total code delta**: ~41 lines of production code + ~200 lines of tests.

**Regression risk**: LOW (additive guards, opted-in happy path unchanged).

**Rejected alternatives**:
- **Approach B** (shared helper): 4 distinct skip behaviors can't be meaningfully unified; extra indirection for a pattern that only repeats 4 times.
- **Approach C** (conditional MCP registration at install time): requires install.sh/install.ps1 edits, creates settings.json/config coupling for later opt-in; noted as optional hardening for future.

See `fix-strategy.md` for full approach analysis, regression risk table, and test gap inventory.
