# Interface Specification: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Overview

This feature has no HTTP API, no CLI commands, and no library API. All interfaces are:
1. **File format specification** (BACKLOG.md structured markdown)
2. **MCP tool call interfaces** (Atlassian MCP, invoked via LLM)
3. **State schema extensions** (state.json fields)
4. **Prompt-based interface** (CLAUDE.md intent detection patterns)

This document defines each interface with precision sufficient for implementation.

---

## 2. BACKLOG.md File Format Specification

### 2.1 Document Structure

```
# {Project Name} - Backlog
                                          <- blank line
> {Optional description}                  <- optional blockquote
                                          <- blank line
## Open                                   <- required section header
                                          <- blank line
### {Section Name}                        <- optional subsection header
                                          <- blank line
- {N.N} [ ] {Title} -- {Description}     <- item line (unchecked)
  - **Jira:** {TICKET-ID}               <- optional Jira metadata
  - **Priority:** {Priority}            <- optional priority metadata
  - **Confluence:** {URL}               <- optional, repeatable
  - **Status:** {Status}                <- optional Jira status
                                          <- blank line between items
- {N.N} [ ] {Title}                       <- local-only item (no sub-bullets)
                                          <- blank line
## Completed                              <- required section header
                                          <- blank line
- {N.N} [x] {Title} -- {Description}     <- item line (checked)
  - **Jira:** {TICKET-ID}               <- preserved from Open
  - **Completed:** {ISO-date}            <- added on completion
```

### 2.2 Item Line Format

**Regex pattern:**
```
/^- (\d+(?:\.\d+)*) \[([ x~])\] (.+)$/
```

**Capture groups:**
| Group | Name | Description | Examples |
|-------|------|-------------|---------|
| 1 | `number` | Item number (dot-separated digits) | `7.7`, `1.1`, `10.3` |
| 2 | `status_char` | Check status character | ` ` (open), `x` (done), `~` (in progress) |
| 3 | `text` | Title with optional description | `Title -- description`, `Title` |

**Title/description split:**
```
/^(.+?) -- (.+)$/
```
If ` -- ` (space-dash-dash-space) is present, split into title (group 1) and description (group 2). Otherwise, the entire text is the title with no description.

### 2.3 Metadata Sub-Bullet Format

**Regex pattern:**
```
/^  - \*\*(\w+(?:\s+\w+)*):\*\* (.+)$/
```

**Capture groups:**
| Group | Name | Description | Examples |
|-------|------|-------------|---------|
| 1 | `key` | Metadata key | `Jira`, `Priority`, `Confluence`, `Status`, `Completed` |
| 2 | `value` | Metadata value | `PROJ-1234`, `High`, URL, ISO date |

**Recognized metadata keys:**
| Key | Type | Required | Source | Validation |
|-----|------|----------|--------|------------|
| `Jira` | string | No | Jira MCP | Must match `/^[A-Z][A-Z0-9_]+-\d+$/` |
| `Priority` | enum | No | Jira MCP | One of: `Highest`, `High`, `Medium`, `Low`, `Lowest` |
| `Confluence` | URL string | No | Jira linked pages | Must be valid HTTPS URL |
| `Status` | string | No | Jira MCP | Free text (Jira workflow status) |
| `Completed` | ISO date | No | Framework | Must match `/^\d{4}-\d{2}-\d{2}$/` |

**Jira-backed detection rule:**
An item is Jira-backed if and only if it has at least one sub-bullet with key `Jira`.

### 2.4 Section Rules

| Section Header | Purpose | Item Status | Required |
|---------------|---------|------------|----------|
| `## Open` | Active/unfinished work | `[ ]` or `[~]` | Yes |
| `## Completed` | Finished work | `[x]` | Yes |

Items within `## Open` may be grouped under `### Subsection` headers.
Items under `## Completed` are flat (no subsections required).

### 2.5 Completion Protocol

When an item is marked complete:
1. Change `[ ]` to `[x]`
2. If Jira-backed: add `- **Completed:** {YYYY-MM-DD}` sub-bullet
3. Move entire item block (item line + all sub-bullets) from `## Open` to `## Completed`
4. Preserve all existing metadata sub-bullets

---

## 3. MCP Tool Call Interfaces

These are not framework APIs. They are Atlassian MCP server operations invoked by the LLM via Claude Code's MCP infrastructure. The interface definitions below specify what the LLM should request and what it should expect in return.

### 3.1 getTicket(id) -- Read Jira Ticket

**Purpose:** Retrieve a Jira ticket's data for import into BACKLOG.md

**MCP Tool:** Atlassian MCP `jira_get_issue` (or equivalent)

**Input:**
| Parameter | Type | Required | Validation | Example |
|-----------|------|----------|-----------|---------|
| `ticket_id` | string | Yes | `/^[A-Z][A-Z0-9_]+-\d+$/` | `PROJ-1234` |

**Expected Output:**
| Field | Type | Always Present | Description |
|-------|------|---------------|-------------|
| `key` | string | Yes | Ticket ID (e.g., `PROJ-1234`) |
| `summary` | string | Yes | Ticket title |
| `description` | string | No | Ticket description (may be null) |
| `priority` | string | Yes | Priority name (`High`, `Medium`, etc.) |
| `status` | string | Yes | Current status (`To Do`, `In Progress`, etc.) |
| `issuetype` | string | Yes | Issue type (`Story`, `Bug`, `Task`, etc.) |
| `linked_confluence_pages` | string[] | No | URLs of linked Confluence pages |

**Data Transformation:**
| Jira Field | BACKLOG.md Field | Transform |
|-----------|-----------------|-----------|
| `summary` | Title | Direct copy |
| `description` | Description (after ` -- `) | Truncate to 200 characters |
| `key` | `**Jira:**` sub-bullet | Direct copy |
| `priority` | `**Priority:**` sub-bullet | Direct copy |
| `status` | `**Status:**` sub-bullet | Direct copy |
| `linked_confluence_pages[*]` | `**Confluence:**` sub-bullet(s) | One sub-bullet per URL |

**Error Responses:**
| Error | Detection | Handling |
|-------|-----------|---------|
| Ticket not found | MCP returns 404 or error | Display: "Ticket {id} not found in Jira" |
| Permission denied | MCP returns 403 or auth error | Display: "No permission to read {id}. Check Jira access." |
| MCP unavailable | Tool call fails entirely | Display: MCP setup instructions (see Section 5) |
| Auth expired | MCP returns auth error | Display: re-auth instructions |

### 3.2 updateStatus(id, status) -- Transition Jira Ticket

**Purpose:** Transition a Jira ticket to a new status on workflow completion

**MCP Tool:** Atlassian MCP `jira_transition_issue` (or equivalent)

**Input:**
| Parameter | Type | Required | Validation | Example |
|-----------|------|----------|-----------|---------|
| `ticket_id` | string | Yes | `/^[A-Z][A-Z0-9_]+-\d+$/` | `PROJ-1234` |
| `target_status` | string | Yes | Non-empty string | `Done` |

**Expected Output:**
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the transition was applied |

**Error Responses:**
| Error | Detection | Handling |
|-------|-----------|---------|
| Transition not allowed | Jira workflow rules block it | Log warning, continue (non-blocking) |
| Ticket not found | MCP returns 404 | Log warning, continue |
| Permission denied | MCP returns 403 | Log warning, continue |
| MCP unavailable | Tool call fails | Log warning, continue |

**Non-blocking constraint:** All errors in updateStatus are logged as warnings but NEVER block workflow completion (Article X, FR-006).

### 3.3 getLinkedDocument(url) -- Read Confluence Page

**Purpose:** Pull Confluence page content for requirements context injection

**MCP Tool:** Atlassian MCP `confluence_get_page` (or equivalent)

**Input:**
| Parameter | Type | Required | Validation | Example |
|-----------|------|----------|-----------|---------|
| `page_url` | string | Yes | Valid HTTPS URL | `https://wiki.example.com/pages/spec-123` |

**Expected Output:**
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Page title |
| `content` | string | Page body content (HTML or rendered text) |

**Data Transformation:**
| Confluence Field | Usage | Transform |
|-----------------|-------|-----------|
| `title` | Display in Confluence Context banner | Direct copy |
| `content` | Context for requirements agent | Truncate to 5000 characters |

**Error Responses:**
| Error | Detection | Handling |
|-------|-----------|---------|
| Page not found | MCP returns 404 | Log warning, skip this page |
| Permission denied | MCP returns 403 | Log warning, skip this page |
| MCP unavailable | Tool call fails | Skip all Confluence context (graceful degradation) |

---

## 4. state.json Schema Extension

### 4.1 active_workflow Extension

**New fields (optional, added only for Jira-backed workflows):**

```json
{
  "active_workflow": {
    "type": "feature",
    "description": "...",
    "jira_ticket_id": "PROJ-1234",
    "confluence_urls": ["https://wiki.example.com/pages/spec-123"]
  }
}
```

| Field | Type | Default | Presence | Consumers |
|-------|------|---------|----------|-----------|
| `jira_ticket_id` | string | absent | Only for Jira-backed workflows | M2c (finalize sync), M3 (Confluence check) |
| `confluence_urls` | string[] | absent | Only when Jira ticket links to Confluence | M3 (Confluence context injection) |

**Absence check pattern (for consumers):**
```javascript
// Pseudo-code for checking Jira-backed workflow
const isJiraBacked = active_workflow?.jira_ticket_id != null;
const hasConfluence = Array.isArray(active_workflow?.confluence_urls) && active_workflow.confluence_urls.length > 0;
```

### 4.2 workflow_history Extension

**New fields (added when Jira-backed workflow completes):**

```json
{
  "workflow_history": [
    {
      "type": "feature",
      "status": "completed",
      "jira_ticket_id": "PROJ-1234",
      "jira_sync_status": "synced"
    }
  ]
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `jira_ticket_id` | string or null | Ticket ID or null | Preserved from active_workflow |
| `jira_sync_status` | string or null | `"synced"`, `"failed"`, null | Result of finalize sync attempt |

---

## 5. Prompt-Based Interface: Intent Detection

### 5.1 Intent Patterns

The CLAUDE.md template defines intent detection patterns that Claude Code uses to classify natural language into backlog operations.

| Intent ID | Signal Patterns | Operation | MCP Required |
|-----------|----------------|-----------|-------------|
| `backlog-add` | "add {ticket-id} to the backlog", "import {ticket-id}", "pull in {ticket-id}" | Pull Jira ticket -> append to BACKLOG.md | Yes |
| `backlog-refresh` | "refresh the backlog", "update backlog from Jira", "sync backlog" | Re-pull all Jira-backed items | Yes |
| `backlog-reorder` | "move X above Y", "prioritize item N.N", "reorder the backlog" | Reorder items in BACKLOG.md | No |
| `backlog-view` | "show me the backlog", "what's in the backlog", "backlog" | Read and display BACKLOG.md | No |
| `backlog-work` | "let's work on {ticket-id}", "start {ticket-id}", "work on item N.N" | Find item -> determine type -> invoke workflow | Conditional |

### 5.2 Ticket ID Detection

**Pattern:** `/\b[A-Z][A-Z0-9_]+-\d+\b/`

When a ticket ID pattern is detected in user input along with backlog-related signal words, classify as the appropriate backlog intent.

### 5.3 MCP Prerequisite Check Flow

Before any MCP-dependent operation:
```
1. Is Atlassian MCP server configured in Claude Code?
   |
   +-- NO --> Display:
   |          "Atlassian MCP server not configured.
   |           To enable Jira/Confluence integration:
   |           claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse
   |
   |           Local backlog operations still work without MCP."
   |          STOP (do not attempt MCP calls)
   |
   +-- YES --> Proceed with MCP tool call
        |
        +-- Auth error? --> Display:
        |    "Atlassian authentication expired.
        |     Re-authenticate by running:
        |     claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse"
        |    STOP (do not retry)
        |
        +-- Success --> Continue operation
```

---

## 6. Adapter Interface Specification

### 6.1 Conceptual Interface

The adapter interface is defined at the instruction level (CLAUDE.md), not as runtime code. Each adapter maps these operations to the corresponding MCP tool calls.

```typescript
// Conceptual interface -- NOT runtime code
interface BacklogAdapter {
  /**
   * Retrieve a ticket from the external tool.
   * @param id - Ticket identifier (e.g., "PROJ-1234" for Jira)
   * @returns Ticket data or error
   */
  getTicket(id: string): {
    key: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    issueType: string;
    linkedDocs: string[];
  };

  /**
   * Update the status of a ticket in the external tool.
   * @param id - Ticket identifier
   * @param status - Target status (e.g., "Done")
   * @returns Whether the transition succeeded
   */
  updateStatus(id: string, status: string): boolean;

  /**
   * Retrieve a linked document's content.
   * @param url - Document URL (e.g., Confluence page URL)
   * @returns Document title and content
   */
  getLinkedDocument(url: string): {
    title: string;
    content: string;
  };
}
```

### 6.2 Jira + Confluence Adapter (First Implementation)

| Interface Method | MCP Tool | Notes |
|-----------------|----------|-------|
| `getTicket(id)` | `jira_get_issue` | Maps Jira fields to adapter interface |
| `updateStatus(id, status)` | `jira_transition_issue` | Maps to Jira transition API |
| `getLinkedDocument(url)` | `confluence_get_page` | Maps Confluence content to adapter interface |

### 6.3 Future Adapter Pattern

To add a new integration (e.g., Linear, GitHub Issues):
1. Add a new section to CLAUDE.md: `### {Tool} Integration`
2. Map the 3 adapter methods to the tool's MCP server calls
3. Define the ticket ID pattern for the new tool
4. No framework code changes required

---

## 7. Interface Versioning

### 7.1 BACKLOG.md Format Version

The BACKLOG.md format is **v1.0** (initial version). Version is implicit, not stored in the file.

**Compatibility rules:**
- Items without metadata sub-bullets are v0 (pre-integration, local-only)
- Items with `**Jira:**` sub-bullets are v1 (Jira-backed)
- Future metadata keys can be added without version bump (additive)
- Removing or renaming existing metadata keys requires a version bump

### 7.2 state.json Extension Version

The `jira_ticket_id` and `confluence_urls` fields follow the existing ad-hoc extension pattern in state.json. No formal versioning is applied (consistent with existing practice).

**Forward compatibility:** If fields are absent, consumers treat the workflow as local-only. This ensures state.json files from before this feature work unchanged.
