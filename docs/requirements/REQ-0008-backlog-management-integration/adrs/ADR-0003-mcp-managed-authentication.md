# ADR-0003: MCP-Managed Authentication

## Status
Accepted

## Context
Jira and Confluence integration requires authentication. The framework needs to make API calls to Atlassian Cloud services that require OAuth2 credentials. The question is whether the framework should manage authentication or delegate it entirely.

## Decision
**Delegate all authentication to the Atlassian MCP server.** The iSDLC framework has zero involvement in credential management. MCP server registration, OAuth2 flows, token refresh, and re-authentication are all handled by Claude Code and the Atlassian MCP server.

## Rationale
- **Security (Article III):** The framework never handles, stores, or transmits credentials
- **Zero credential surface:** No tokens in config files, no secrets in state.json
- **Existing mechanism:** Claude Code already supports MCP server authentication
- **User trust:** Developers authenticate directly with Atlassian via their browser (OAuth2 consent)
- **Maintainability:** Auth flow changes (Atlassian updating OAuth scopes) require no framework changes

## Setup Flow

```
1. Developer runs: claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse
2. Claude Code registers the MCP server
3. On first MCP call, Atlassian MCP triggers OAuth2 browser flow
4. Developer authenticates with Atlassian account
5. MCP server stores OAuth2 tokens (managed by MCP infrastructure)
6. Subsequent calls use stored tokens with automatic refresh
```

## Consequences

**Positive:**
- Zero security surface in framework code
- No credential storage to audit or secure
- Automatic token refresh handled by MCP server
- Standard OAuth2 flow (user authenticates with Atlassian directly)

**Negative:**
- Framework cannot detect auth state proactively (only learns on first failure)
- SSE transport has known re-auth issues (tokens expire, require browser re-auth)
- User must configure MCP server manually (one-time setup)

## Auth Failure Handling

When MCP auth fails, the framework displays:
```
Atlassian authentication expired. Re-authenticate with:
  claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse
```

The framework never attempts to fix auth issues programmatically.

## Traces To
FR-008, NFR-005, Article III, Article X
