# PreToolUse enforcement: route agents to higher-fidelity MCP tools when available

**Source**: GitHub #214
**Labels**: ready-to-build

## Problem

Despite explicit instructions (CLAUDE.md HARD RULE #7, memory feedback), agents default to lower-fidelity tools (Grep, Glob, Read) when higher-fidelity MCP tools are available for the same operation. This wastes context window on irrelevant matches and produces worse results.

## Expected Behavior

A `PreToolUse` hook that detects when an agent is about to use a lower-fidelity tool and redirects to the preferred MCP alternative. The hook should:

1. **Warn or block** when a lower-fidelity tool is used and a higher-fidelity MCP tool covers the same operation
2. **Be extensible** — new MCP tool mappings can be added without code changes (config-driven)
3. **Fail open** — if MCP tools are unavailable or the hook errors, allow the original tool through

## Tool Routing Rules (Initial Set)

| Operation | Lower-Fidelity Tool | Preferred MCP Tool |
|-----------|--------------------|--------------------|
| Codebase search | `Grep` | `mcp__code-index-mcp__search_code_advanced` |
| File discovery | `Glob` | `mcp__code-index-mcp__find_files` |
| File summary | `Read` (full file) | `mcp__code-index-mcp__get_file_summary` |
| Bulk file read | multiple `Read` calls | `mcp__bulk-fs-mcp__read_files` |
| Bulk file write | multiple `Write` calls | `mcp__bulk-fs-mcp__write_files` |
| Directory creation | `Bash mkdir` | `mcp__bulk-fs-mcp__create_directories` |

More MCP tools may be added in the future — the mapping must be config-driven, not hardcoded.

## Design Constraints

- Hook runs as CJS in `src/claude/hooks/` (same as all PreToolUse hooks)
- Config file for tool routing rules (JSON, under `src/claude/hooks/config/`)
- Enforcement levels per rule: `block`, `warn`, `allow` (configurable)
- Must detect MCP tool availability at runtime (don't block if MCP server is down)
- Must not interfere with legitimate direct tool use (e.g., Read for edit prep, Grep in hooks tests)

## Relationship to #213

Split out from #213 (inline contract enforcement). This is an independent enforcement surface that uses PreToolUse hooks directly — it does not depend on the contract evaluator refactor.

## Complexity

Medium — new PreToolUse hook + config file + tests. No changes to existing hooks or contract system.
