# Error Taxonomy: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Error Codes (high), Recovery Strategies (high)

---

## 1. Detection Errors

| Error Code | Description | Source | Recovery | User Impact |
|-----------|-------------|--------|----------|-------------|
| DETECT_PYTHON_MISSING | Python 3.8+ not found on system | detectPython() | Skip code-index-mcp recommendation silently | None -- grep-glob baseline unaffected |
| DETECT_PYTHON_OLD | Python found but version < 3.8 | detectPython() | Skip code-index-mcp recommendation silently | None |
| DETECT_PIP_MISSING | pip/pip3 not found despite Python being available | detectPackageManagers() | Mark pip install methods as unavailable; skip recommendation if no viable install method | None |
| DETECT_TOOL_CHECK_FAIL | `code-index-mcp --version` failed or timed out | detectTool() | Mark tool as not installed; generate recommendation if pip available | None |
| DETECT_SCALE_FAIL | File counting failed (permissions, timeout) | assessProjectScale() | Default to 'small' scale tier | Indexed backend recommended as 'optional' instead of 'recommended' |

## 2. Installation Errors

| Error Code | Description | Source | Recovery | User Impact |
|-----------|-------------|--------|----------|-------------|
| INSTALL_PERMISSION_DENIED | pip install lacks write permissions | installTool() | Retry with `pip install --user`; if still fails, log warning | Warning message; setup continues |
| INSTALL_NETWORK_FAILURE | pip cannot reach PyPI (offline, firewall) | installTool() | Log warning; setup continues | Warning message; grep-glob baseline |
| INSTALL_VERSION_CONFLICT | pip dependency conflict during install | installTool() | Log warning; setup continues | Warning message; grep-glob baseline |
| INSTALL_PACKAGE_MANAGER_MISSING | pip command not found at install time | installTool() | Log warning; setup continues | Warning message; grep-glob baseline |
| INSTALL_UNKNOWN | Unclassified pip install failure | installTool() | Log warning with error details; setup continues | Warning message; grep-glob baseline |
| INSTALL_POST_CHECK_FAIL | pip install succeeded but `code-index-mcp --version` fails | installTool() | Install recorded as success but version unknown; MCP config still written | Backend may not work at runtime; degradation handles it |

## 3. MCP Configuration Errors

| Error Code | Description | Source | Recovery | User Impact |
|-----------|-------------|--------|----------|-------------|
| CONFIG_MCP_CONFLICT | `.claude/settings.json` already has a 'code-index' MCP entry with different command | configureMcpServers() | Preserve existing entry; log warning | Existing config preserved; may need manual update |
| CONFIG_SETTINGS_CORRUPT | `.claude/settings.json` contains invalid JSON | configureMcpServers() | Abort MCP config; log warning | MCP not configured; backend unavailable at runtime; grep-glob fallback |
| CONFIG_SETTINGS_WRITE_FAIL | Cannot write to `.claude/settings.json` (permissions) | configureMcpServers() | Log warning; setup continues | MCP not configured; grep-glob fallback |

## 4. Runtime Search Errors

| Error Code | Description | Source | Recovery | User Impact |
|-----------|-------------|--------|----------|-------------|
| MCP_SERVER_NOT_RUNNING | code-index-mcp process not started or has exited | adapter.search() | Return []; healthCheck marks 'unavailable'; router falls back to grep-glob | Slower searches; degradation notification once per session |
| MCP_SERVER_TIMEOUT | MCP call exceeds router timeout (default 30s) | executeWithTimeout() | Reject promise; router catches and falls back | Slower searches after timeout delay |
| MCP_RESPONSE_MALFORMED | MCP server returns unexpected response format | normalizeIndexedResults() | Return []; log warning | Router uses empty results; may fall back |
| MCP_TOOL_NOT_FOUND | MCP server does not expose expected tool name | adapter.search() | Return []; healthCheck marks 'degraded' | Router falls back; may indicate version mismatch |
| BACKEND_UNAVAILABLE | Forced backend 'code-index' requested but not registered | router.search() | Throw SearchError with code 'BACKEND_UNAVAILABLE' | Agent receives error; should not force backend in practice |

## 5. Index Lifecycle Errors

| Error Code | Description | Source | Recovery | User Impact |
|-----------|-------------|--------|----------|-------------|
| INDEX_BUILD_FAIL | Initial index build fails (disk space, permissions) | code-index-mcp internal | MCP server logs error; searches return empty until resolved | Searches fall back to grep-glob |
| INDEX_CORRUPT | SQLite database corrupted | code-index-mcp internal | Delete and rebuild index on next startup | Temporary search unavailability during rebuild |
| INDEX_WATCH_FAIL | File watcher cannot start (OS limits, permissions) | code-index-mcp internal | MCP server continues without watching; index becomes stale | Searches return stale results; manual refresh available |
| INDEX_STORAGE_FULL | Disk full; cannot write index updates | code-index-mcp internal | MCP server logs error; existing index remains usable for queries | Index stops updating; queries work from last good state |

## 6. Error Severity Classification

| Severity | Errors | User Action Required |
|----------|--------|---------------------|
| **Silent** | DETECT_PYTHON_MISSING, DETECT_PYTHON_OLD, DETECT_PIP_MISSING, DETECT_TOOL_CHECK_FAIL | None -- system works without indexed backend |
| **Warning** | All INSTALL_* errors, CONFIG_* errors | None -- setup completes; grep-glob baseline active |
| **Degraded** | MCP_SERVER_NOT_RUNNING, MCP_SERVER_TIMEOUT, MCP_RESPONSE_MALFORMED, MCP_TOOL_NOT_FOUND | None -- automatic fallback to grep-glob; notification once per session |
| **Error** | BACKEND_UNAVAILABLE (forced backend) | Agent should not force specific backends; programming error |

## 7. Error Recovery Matrix

| Phase | Error Pattern | Automatic Recovery | Manual Recovery |
|-------|--------------|-------------------|-----------------|
| Detection | Python/pip not available | Skip recommendation | User installs Python 3.8+ |
| Installation | pip install fails | Log warning; continue setup | `pip install code-index-mcp` manually |
| Configuration | Settings write fails | Skip MCP config | Add MCP entry to `.claude/settings.json` manually |
| Runtime | MCP server unavailable | Fall back to grep-glob | Restart Claude Code session |
| Index | Build/corruption | Rebuild on next start | Delete index directory; restart session |
| Index | Watcher fails | Serve from stale index | Restart MCP server; check OS limits |
