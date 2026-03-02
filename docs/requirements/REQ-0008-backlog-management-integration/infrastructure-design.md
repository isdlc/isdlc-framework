# Infrastructure Design: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 03-architecture
**Created:** 2026-02-14

---

## 1. Overview

This feature requires **no new infrastructure**. The iSDLC framework is a local CLI tool that runs on the developer's machine. All external connectivity is through MCP servers managed by Claude Code.

---

## 2. Existing Infrastructure (Unchanged)

| Component | Location | Purpose |
|-----------|----------|---------|
| iSDLC CLI | Developer's machine (npm global) | Framework entry point |
| Claude Code | Developer's machine | LLM runtime |
| Agent prompts | Project's `.claude/` directory | Installed by iSDLC |
| Hook runtime | Project's `.claude/` directory | CJS hooks via Claude Code |
| State files | Project's `.isdlc/` directory | Workflow state |
| BACKLOG.md | Project root | Curated backlog |

---

## 3. External Dependencies

### 3.1 Atlassian MCP Server

| Attribute | Value |
|-----------|-------|
| Provider | Atlassian (Rovo) |
| Transport | SSE (Server-Sent Events) |
| Endpoint | `https://mcp.atlassian.com/v1/sse` |
| Authentication | OAuth2 (browser-based flow) |
| Management | Claude Code (`claude mcp add`) |
| Availability | Depends on Atlassian cloud uptime |
| Known Issues | SSE transport being deprecated; re-auth required multiple times per day (CON-002) |

### 3.2 Connectivity Requirements

```
Developer Machine
  |
  +-- Claude Code CLI (local)
  |     |
  |     +-- Atlassian MCP Server connection (HTTPS/SSE)
  |           |
  |           +-- Jira Cloud (read tickets, transition status)
  |           +-- Confluence Cloud (read pages)
  |
  +-- iSDLC Framework (local)
        |
        +-- BACKLOG.md (local filesystem)
        +-- .isdlc/state.json (local filesystem)
```

**Offline Mode:** The framework operates fully in offline/local mode when:
- No internet connection
- Atlassian MCP not configured
- MCP auth expired

All local backlog operations (view, reorder, start workflow from local items) work without any network connectivity (NFR-003).

---

## 4. Environment Strategy

This feature does not change the environment strategy. iSDLC is a development tool, not a deployed service.

| Environment | Purpose | Jira Integration |
|-------------|---------|-----------------|
| Development | Developer's local machine | Full Jira/Confluence via MCP |
| CI/CD | GitHub Actions | No Jira integration (tests verify prompt content only) |
| Production | N/A (CLI tool, not a service) | N/A |

---

## 5. Monitoring and Logging

### 5.1 Existing Logging (Extended)

| Log Target | What's Logged | Format |
|-----------|--------------|--------|
| `.isdlc/state.json` history[] | Workflow init with Jira ticket ID | JSON entry |
| `.isdlc/state.json` workflow_history[] | Jira sync status on completion | `jira_sync_status` field |
| Console output | MCP prerequisite check results | User-facing messages |
| Console output | Jira sync success/failure on finalize | User-facing messages |

### 5.2 Error Observability

All MCP-related errors are surfaced to the user immediately (not silently swallowed):

| Error Type | Observable In | Action |
|------------|--------------|--------|
| MCP not configured | Console (setup instructions) | User runs `claude mcp add` |
| MCP auth expired | Console (re-auth instructions) | User re-authenticates |
| Jira ticket not found | Console (ticket ID error) | User checks ticket ID |
| Confluence page unavailable | Console (warning) | Workflow continues without context |
| Jira sync failed on finalize | Console (warning) + state.json | User manually updates Jira |

---

## 6. Disaster Recovery

Not applicable in the traditional sense (no deployed service). Recovery mechanisms:

| Failure | Recovery |
|---------|----------|
| BACKLOG.md corruption | `git checkout -- BACKLOG.md` (file is git-tracked) |
| state.json corruption | Delete `.isdlc/state.json`, re-initialize with `/isdlc` |
| MCP server outage | Wait for Atlassian to restore service; local operations unaffected |
| Lost Jira sync (finalize failed) | Manually transition Jira ticket via Jira UI |

---

## 7. Scaling Considerations

Not applicable. This is a single-developer CLI tool, not a service. The backlog is designed for 10-50 curated items.

If MCP call volume becomes a concern (unlikely), the refresh operation could be optimized to batch Jira queries (future enhancement, not in scope).
