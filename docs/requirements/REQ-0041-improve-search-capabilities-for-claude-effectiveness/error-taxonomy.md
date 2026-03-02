# Error Taxonomy: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Search Errors (high), Installation Errors (high), Configuration Errors (medium)

---

## 1. Search Errors

| Error Code | Category | Description | Recovery |
|------------|----------|-------------|----------|
| `SEARCH_BACKEND_UNAVAILABLE` | Degradation | Enhanced backend not responding or crashed | Fall back to next backend in priority order; notify user once |
| `SEARCH_BACKEND_TIMEOUT` | Degradation | Backend did not respond within timeout (default 30s) | Treat as unavailable; fall back; mark backend health as 'degraded' |
| `SEARCH_ALL_ENHANCED_FAILED` | Degradation | All enhanced backends failed; using grep-glob | Fall back to grep-glob (always available); notify user |
| `SEARCH_INVALID_REQUEST` | Client Error | Malformed search request (missing query, invalid modality) | Return error to calling agent with descriptive message; do not retry |
| `SEARCH_RESULT_EMPTY` | Informational | Search returned zero results | Return empty result set; agent handles empty state |
| `SEARCH_TOKEN_BUDGET_EXCEEDED` | Truncation | Raw results exceeded token budget | Truncate from lowest relevance; set meta.totalHitsBeforeRanking for visibility |

### Severity Classification

- **Fatal** (blocks agent): None -- search never blocks an agent. All errors degrade to grep-glob.
- **Warning** (user-visible): `SEARCH_ALL_ENHANCED_FAILED` -- user notified once per session
- **Info** (logged only): `SEARCH_BACKEND_TIMEOUT`, `SEARCH_RESULT_EMPTY`, `SEARCH_TOKEN_BUDGET_EXCEEDED`

## 2. Installation Errors

| Error Code | Category | Description | Recovery |
|------------|----------|-------------|----------|
| `INSTALL_PERMISSION_DENIED` | Environment | Insufficient permissions to install tool (e.g., global npm without sudo) | Report to user; suggest alternative install method; skip tool |
| `INSTALL_NETWORK_FAILURE` | Environment | Cannot reach package registry | Report to user; skip tool; note for retry later |
| `INSTALL_UNSUPPORTED_PLATFORM` | Environment | Tool not available for this OS/architecture | Skip tool; recommend alternatives if available |
| `INSTALL_PACKAGE_MANAGER_MISSING` | Environment | Required package manager (npm, cargo, brew) not found | Try alternative package manager; report if all fail |
| `INSTALL_VERSION_CONFLICT` | Compatibility | Installed version incompatible with MCP server requirements | Report version mismatch; suggest manual resolution |
| `INSTALL_PARTIAL_SUCCESS` | Mixed | Some tools installed, others failed | Configure installed tools; report failures; continue setup |

### Recovery Strategy

All installation errors follow the same pattern:
1. Report the specific error to the user (transparent)
2. Suggest an alternative if one exists
3. Record the failure in detection results
4. Continue setup without blocking (never fail the init)
5. Grep/Glob remains available regardless of installation outcomes

## 3. Configuration Errors

| Error Code | Category | Description | Recovery |
|------------|----------|-------------|----------|
| `CONFIG_SETTINGS_READ_FAIL` | File I/O | Cannot read .claude/settings.json | Use default configuration; log warning |
| `CONFIG_SETTINGS_WRITE_FAIL` | File I/O | Cannot write to .claude/settings.json | Report to user; search works but MCP not configured |
| `CONFIG_SETTINGS_CORRUPT` | Parse Error | settings.json contains invalid JSON | Preserve original file (backup); report to user; do not overwrite |
| `CONFIG_MCP_CONFLICT` | Conflict | MCP server name already exists with different configuration | Preserve existing configuration; do not overwrite; report conflict |
| `CONFIG_SEARCH_READ_FAIL` | File I/O | Cannot read .isdlc/search-config.json | Use defaults (enabled: true, grep-glob only) |
| `CONFIG_SEARCH_WRITE_FAIL` | File I/O | Cannot write .isdlc/search-config.json | In-memory config works for current session; persists on next successful write |

### Invariant

The system MUST remain functional even if all configuration operations fail. The built-in lexical backend (Grep/Glob) requires no configuration and is always available.

## 4. MCP Server Errors

| Error Code | Category | Description | Recovery |
|------------|----------|-------------|----------|
| `MCP_SERVER_START_FAIL` | Runtime | MCP server process failed to start | Mark backend as unavailable; fall back; notify user |
| `MCP_SERVER_CRASH` | Runtime | MCP server process exited unexpectedly | Mark backend as unavailable; fall back; notify user; do not auto-restart |
| `MCP_PROTOCOL_ERROR` | Runtime | MCP server returned unexpected response format | Log error; treat as unavailable for this request; retry on next request |
| `MCP_VERSION_MISMATCH` | Compatibility | MCP server protocol version incompatible | Report to user; suggest tool update; mark backend unavailable |

### Non-Recovery

The search system does NOT attempt to restart crashed MCP servers. If a user's ast-grep MCP server crashes, the framework:
1. Marks it as unavailable in the registry
2. Falls back to the next backend
3. Notifies the user once
4. The user can restart it manually or it will recover on next session start

## 5. Error Response Format

All errors surfaced to agents use the SearchError class:

```js
{
  name: 'SearchError',
  code: 'SEARCH_BACKEND_UNAVAILABLE',  // One of the codes above
  message: 'ast-grep MCP server not responding after 2000ms',
  backendId: 'ast-grep',               // Which backend (if applicable)
  fallbackUsed: true                    // Whether fallback was attempted
}
```

Agents should NOT need to handle SearchError in most cases -- the router handles fallback internally and returns a valid SearchResult with `meta.degraded = true`. SearchError only surfaces if even the grep-glob fallback fails (extraordinary circumstances).
