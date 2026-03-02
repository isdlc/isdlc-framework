# Error Taxonomy: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Error Classification

All errors in this feature follow three principles:
1. **Article X (Fail-Safe Defaults):** Errors never block local operations or workflow completion
2. **NFR-003 (Graceful Degradation):** Non-Jira functionality always works regardless of MCP state
3. **NFR-005 (MCP Auth Resilience):** Auth failures produce actionable messages, never crashes

### Error Severity Levels

| Level | Description | User Impact | Framework Action |
|-------|------------|------------|-----------------|
| **FATAL** | Not used in this feature | N/A | N/A |
| **ERROR** | Operation cannot complete, user action needed | Requested operation fails | Display error + guidance, stop operation |
| **WARNING** | Partial failure, framework continues | Some data missing or sync incomplete | Log warning, continue |
| **INFO** | Operational notice | No impact | Log for observability |

---

## 2. Error Code Taxonomy

### 2.1 MCP Infrastructure Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| BLG-E001 | MCP Not Configured | ERROR | Atlassian MCP server not registered in Claude Code | "Atlassian MCP server not configured. To enable Jira/Confluence integration, run: `claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse`. Local backlog operations continue to work without MCP." | User runs setup command |
| BLG-E002 | MCP Auth Expired | ERROR | Atlassian MCP returns authentication error | "Atlassian authentication expired. Re-authenticate by running: `claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse`" | User re-authenticates |
| BLG-E003 | MCP Connection Failed | ERROR | MCP server unreachable (network error) | "Cannot connect to Atlassian MCP server. Check your network connection. Local backlog operations continue to work." | User checks network |

### 2.2 Jira Operation Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| BLG-E010 | Ticket Not Found | ERROR | Jira returns 404 for ticket ID | "Ticket {TICKET-ID} not found in Jira. Check the ticket ID and try again." | User verifies ticket ID |
| BLG-E011 | Ticket Permission Denied | ERROR | Jira returns 403 for ticket read | "No permission to read ticket {TICKET-ID}. Check your Jira project access." | User checks permissions |
| BLG-E012 | Ticket Already In Backlog | WARNING | Ticket ID already exists in BACKLOG.md | "Ticket {TICKET-ID} is already in the backlog (item {N.N}). Refresh instead?" | User refreshes or skips |
| BLG-E013 | Transition Not Allowed | WARNING | Jira workflow rules block status transition | "Cannot transition {TICKET-ID} to 'Done' -- Jira workflow rules may require intermediate steps. Workflow completion not blocked." | Manual Jira update |
| BLG-E014 | Transition Permission Denied | WARNING | Jira returns 403 for transition | "No permission to transition {TICKET-ID}. Workflow completion not blocked." | Manual Jira update |

### 2.3 Confluence Operation Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| BLG-E020 | Page Not Found | WARNING | Confluence returns 404 for page URL | "Confluence page not found: {URL}. Continuing without this page's context." | Verify URL in Jira |
| BLG-E021 | Page Permission Denied | WARNING | Confluence returns 403 | "No permission to read Confluence page: {URL}. Continuing without this page's context." | Check Confluence access |
| BLG-E022 | Page Content Too Large | INFO | Confluence page exceeds 5000 char limit | "Confluence page '{title}' truncated to 5000 characters for context." | N/A (automatic) |
| BLG-E023 | Page Content Empty | INFO | Confluence page has no body content | "Confluence page '{title}' has no content. Skipping." | N/A |

### 2.4 BACKLOG.md Parse Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| BLG-E030 | File Not Found | WARNING | BACKLOG.md does not exist | "BACKLOG.md not found. Creating empty backlog." | Auto-create |
| BLG-E031 | Missing Open Section | WARNING | BACKLOG.md exists but has no `## Open` section | "BACKLOG.md has no '## Open' section. Appending one." | Auto-fix |
| BLG-E032 | Missing Completed Section | WARNING | BACKLOG.md has no `## Completed` section | "BACKLOG.md has no '## Completed' section. Appending one." | Auto-fix |
| BLG-E033 | Malformed Item Line | WARNING | Item line does not match expected regex pattern | "Could not parse backlog item on line {N}. Skipping." | Manual fix |
| BLG-E034 | Malformed Metadata | WARNING | Sub-bullet does not match metadata pattern | "Could not parse metadata on line {N}. Ignoring." | Manual fix |
| BLG-E035 | Duplicate Item Number | WARNING | Two items share the same N.N number | "Duplicate item number {N.N} found. Items may be ambiguous." | Manual fix |
| BLG-E036 | Item Not Found | ERROR | Referenced item/ticket not found in BACKLOG.md | "Item {reference} not found in BACKLOG.md. Add it first?" | Add item to backlog |

### 2.5 Sync Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| BLG-E040 | Partial Refresh Failure | WARNING | Some Jira tickets failed during refresh | "Updated {N}/{total} items. Failed: {list of failed ticket IDs}. Errors: {brief reasons}." | Retry or manual check |
| BLG-E041 | Finalize Sync Failed | WARNING | Jira status sync failed during workflow finalize | "Could not sync status to Jira for {TICKET-ID}: {reason}. Workflow completion not affected." | Manual Jira update |
| BLG-E042 | Backlog Update Failed | WARNING | BACKLOG.md write failed after sync | "Could not update BACKLOG.md: {reason}. Jira was updated but local backlog unchanged." | Manual BACKLOG.md edit |

---

## 3. Error Handling Patterns

### 3.1 MCP Check-Before-Call Pattern

All MCP-dependent operations follow this pattern:

```
1. Check MCP configured?
   NO  -> BLG-E001 (display setup instructions, stop operation)
   YES -> proceed

2. Execute MCP call
   Auth error?   -> BLG-E002 (display re-auth instructions, stop operation)
   Network error -> BLG-E003 (display network message, stop operation)
   404 error     -> BLG-E010/E020 (display not-found message, stop operation)
   403 error     -> BLG-E011/E021 (display permission message, stop operation)
   Success       -> continue with response data
```

### 3.2 Non-Blocking Sync Pattern (Finalize Only)

The finalize Jira sync uses a weaker error handling pattern:

```
1. Check jira_ticket_id present?
   NO  -> SKIP entirely (local-only workflow)
   YES -> proceed

2. Check MCP configured?
   NO  -> BLG-E041 (log warning, CONTINUE finalize)
   YES -> proceed

3. Execute updateStatus()
   Any error -> BLG-E041 (log warning, CONTINUE finalize)
   Success   -> log success, CONTINUE finalize

4. Update BACKLOG.md
   Any error -> BLG-E042 (log warning, CONTINUE finalize)
   Success   -> CONTINUE finalize
```

### 3.3 Partial Success Pattern (Refresh)

The backlog refresh uses a per-item error handling pattern:

```
For each Jira-backed item in BACKLOG.md:
  1. Call getTicket(jira_ticket_id)
     Error  -> Record failure, continue to next item
     Success -> Update item in-place

After all items processed:
  If any failures -> BLG-E040 (report partial results)
  If all succeeded -> Report full success
```

---

## 4. Error Response Format

Since this feature operates through LLM natural language (not structured API responses), error messages are presented as conversational text. The format follows the existing iSDLC pattern:

**For blocking errors (operation stops):**
```
I couldn't {operation description}: {reason}.

{Recovery instructions if applicable}
```

**For warnings (operation continues):**
```
Note: {what went wrong}. {what happened instead}.
```

**For finalize warnings (non-blocking sync):**
```
Workflow completed successfully.
Note: Could not sync status to Jira for {TICKET-ID}: {reason}.
You may want to update the Jira ticket manually.
```

---

## 5. Error Traceability

| Error Code | FR | NFR | AC |
|------------|-----|-----|-----|
| BLG-E001 | FR-008 | NFR-003 | AC-001-03 |
| BLG-E002 | FR-008 | NFR-005 | AC-001-03 |
| BLG-E003 | FR-008 | NFR-003 | AC-001-03 |
| BLG-E010 | FR-002 | - | AC-001-04 |
| BLG-E011 | FR-002 | - | AC-001-04 |
| BLG-E012 | FR-002 | - | - |
| BLG-E013 | FR-006 | NFR-005 | AC-005-02 |
| BLG-E014 | FR-006 | NFR-005 | AC-005-02 |
| BLG-E020 | FR-005 | NFR-003 | AC-004-03 |
| BLG-E021 | FR-005 | NFR-003 | AC-004-03 |
| BLG-E022 | FR-005 | - | - |
| BLG-E023 | FR-005 | - | - |
| BLG-E030 | FR-001 | NFR-002 | AC-006-01 |
| BLG-E031 | FR-001 | NFR-002 | - |
| BLG-E032 | FR-001 | NFR-002 | - |
| BLG-E033 | FR-001 | NFR-002 | - |
| BLG-E034 | FR-001 | - | - |
| BLG-E035 | FR-001 | - | - |
| BLG-E036 | FR-002, FR-005 | - | - |
| BLG-E040 | FR-003 | NFR-005 | AC-002-03 |
| BLG-E041 | FR-006 | NFR-005 | AC-005-02 |
| BLG-E042 | FR-006 | - | AC-005-03 |
