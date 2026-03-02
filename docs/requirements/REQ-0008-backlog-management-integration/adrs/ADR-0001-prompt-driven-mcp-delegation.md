# ADR-0001: Prompt-Driven MCP Delegation

## Status
Accepted

## Context
The backlog management integration requires communication with Jira Cloud and Confluence Cloud APIs for ticket import, refresh, Confluence context retrieval, and status sync. The framework needs to make these API calls without adding npm dependencies (NFR-004).

Three approaches were considered:
1. Direct API calls from CJS hook code (using `http`/`https` modules)
2. npm packages for Jira/Confluence integration
3. Prompt-driven delegation to Claude Code's MCP infrastructure

## Decision
Use **prompt-driven MCP delegation**: define the integration behavior in CLAUDE.md instructions, and let Claude Code's LLM execute the MCP tool calls as instructed. The iSDLC framework does not contain any Jira/Confluence API code.

## Rationale
- **Zero dependencies (NFR-004):** MCP servers are managed by Claude Code, not by the framework
- **Zero auth management:** The Atlassian MCP server handles OAuth2 entirely
- **Simplicity (Article V):** No API endpoint management, no HTTP client code, no error mapping
- **Existing pattern:** The framework already operates via prompt-driven instructions -- this extends that model to external integrations
- **Maintainability:** When Atlassian changes their API, they update the MCP server. Framework code is unaffected.

## Consequences

**Positive:**
- No framework code changes for API communication
- No security surface for credential handling
- Automatic benefit from MCP server improvements
- Consistent with iSDLC's prompt-first architecture
- Testing is prompt-verification (content checks), not integration tests

**Negative:**
- Dependent on Atlassian MCP server availability and behavior
- Less deterministic than code-level API calls (LLM interprets instructions)
- Harder to unit test (MCP interactions are not mockable in framework tests)
- SSE transport has known re-auth issues (CON-002)

## Alternatives Considered

### Direct API calls from hooks
- Would require `http`/`https` module usage in CJS hooks
- Would need OAuth2 token management code
- Would violate Article V (significant new complexity)
- Rejected: too much code for prompt-solvable problem

### npm packages (jira-client, etc.)
- Directly violates NFR-004 (no new runtime dependencies)
- Rejected: hard constraint violation

## Traces To
FR-002, FR-003, FR-005, FR-006, FR-008, NFR-004
