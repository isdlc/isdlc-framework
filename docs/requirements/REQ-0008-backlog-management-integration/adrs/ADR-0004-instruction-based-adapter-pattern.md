# ADR-0004: Instruction-Based Adapter Pattern

## Status
Accepted

## Context
FR-009 requires a pluggable adapter pattern so that Jira+Confluence is the first integration but future integrations (Linear, GitHub Issues, Azure DevOps) can be added. Traditional adapter patterns use interfaces and implementation classes in code. However, this feature is predominantly prompt-driven (~85% markdown), and the framework delegates API calls to MCP servers via LLM instructions.

## Decision
Define the adapter pattern as **CLAUDE.md instructions** rather than runtime code. The adapter interface is a conceptual specification that guides the LLM to map operations to the available MCP tools.

## Interface Specification

```
Adapter Interface (conceptual):
  getTicket(id) --> { title, description, priority, status, linkedDocs[] }
  updateStatus(id, status) --> boolean
  getLinkedDocument(url) --> { title, content }
```

**Jira+Confluence Implementation (CLAUDE.md instructions):**
- `getTicket(id)` --> "Use Atlassian MCP to read Jira ticket {id}. Extract summary, description (truncate 200 chars), priority, status, and linked Confluence page URLs."
- `updateStatus(id, status)` --> "Use Atlassian MCP to transition Jira ticket {id} to status {status}."
- `getLinkedDocument(url)` --> "Use Atlassian MCP to read Confluence page at {url}. Extract title and body content."

**Future Linear Implementation (example):**
- `getTicket(id)` --> "Use Linear MCP to read issue {id}. Extract title, description, priority, status, and linked document URLs."

## Rationale
- **Simplicity (Article V):** No interface/class hierarchy, no registry, no factory pattern
- **No runtime code:** The LLM IS the adapter runtime -- it reads instructions and executes MCP calls
- **Easy to extend:** Adding a new adapter means adding a new section to CLAUDE.md
- **No maintenance burden:** No code to version, test, or debug
- **Consistent with architecture:** The entire feature is prompt-driven; the adapter should be too

## Consequences

**Positive:**
- Zero lines of adapter code to maintain
- Adding new integrations is a documentation change, not a code change
- No adapter selection logic or configuration parsing
- No testing overhead for adapter infrastructure

**Negative:**
- Less deterministic than code-level adapters (LLM interpretation may vary)
- No compile-time/runtime type checking on adapter compliance
- Harder to enforce adapter interface contract
- May not scale to very complex integrations (but BACKLOG operations are simple CRUD)

## Future Configuration

If multiple integrations are configured simultaneously, adapter selection could be driven by:
1. BACKLOG.md metadata (e.g., `**Source:** Jira` vs `**Source:** Linear`)
2. `.isdlc/integrations.yaml` configuration file (future, not in scope)

For this feature, only Jira+Confluence is implemented. The interface definition and pattern are the deliverables.

## Alternatives Considered

### Code-level adapter interface (CJS)
- Would require: `IntegrationAdapter` base class, `JiraAdapter` implementation, adapter registry, config-based selection
- Estimated: ~200 lines of new CJS code + tests
- Violates Article V (unnecessary infrastructure for one adapter)
- Rejected: over-engineering for prompt-solvable problem

### Plugin system with dynamic loading
- Would require: plugin discovery, loading mechanism, dependency injection
- Far too complex for current needs
- Rejected: massive YAGNI violation

## Traces To
FR-009, Article V, CON-004
