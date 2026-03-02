# Requirements Specification: Backlog Management Integration

**ID:** REQ-0008
**Artifact Folder:** REQ-0008-backlog-management-integration
**Status:** Draft
**Created:** 2026-02-14
**Priority:** Should Have
**BACKLOG.md Reference:** Item 7.7

---

## 1. Project Overview

### Problem Statement
Solo developers and teams need an engaging, prioritized view of their work. Jira boards accumulate hundreds of unsorted, unprioritized tickets that nobody wants to trawl through from the CLI. The project's BACKLOG.md provides a clean, curated, readable experience but is a disconnected island without external tool integration. Developers need a way to pull curated items from Jira into BACKLOG.md, reorder priorities locally, and sync status changes back -- all through natural language, with no explicit commands.

### Business Drivers
- **Work prioritization**: Developers and teams need an engaging way to order and prioritize work
- **Tool integration**: Jira is the canonical source of ticket data in existing teams; disconnected backlogs create drift
- **Context enrichment**: Confluence specs linked to Jira tickets provide rich context for the requirements phase, replacing cold generic questions with informed facilitation
- **Invisible framework**: All interactions via natural language -- users never need to learn backlog commands

### Success Criteria
1. A developer can add a Jira ticket to BACKLOG.md via natural language ("Add PROJ-1234 to the backlog")
2. Jira ticket content (title, description, priority, linked Confluence URLs) flows into BACKLOG.md
3. Workflow completion syncs status back to Jira (In Progress, Done)
4. Confluence specs linked to Jira tickets are automatically pulled as context for the requirements phase
5. Integration is testable end-to-end with Jira and Confluence via Atlassian MCP

### Scope
This is **integration and convention**, not new infrastructure. BACKLOG.md already exists as the framework's curated backlog. The backlog picker already reads it. This feature adds:
1. CLAUDE.md instructions for backlog management conventions
2. Jira ticket import/refresh via Atlassian MCP
3. Status sync back to Jira on workflow completion
4. Confluence content pull for requirements context
5. Pluggable adapter pattern for future integrations (Linear, GitHub Issues, Azure DevOps)

---

## 2. Stakeholders & Personas

### Primary Persona: Solo Developer
- **Role:** Individual developer using iSDLC for personal projects
- **Goal:** Maintain a prioritized, curated backlog without leaving the CLI
- **Context:** May or may not use Jira; always uses BACKLOG.md
- **Pain point:** Manually copying ticket info between tools; losing context when switching between Jira UI and CLI

### Secondary Persona: Team Developer
- **Role:** Developer on a team that uses Jira for project management
- **Goal:** Pull assigned/relevant Jira tickets into a local working set and sync status back
- **Context:** Team uses Jira as source of truth; Confluence for specs/PRDs
- **Pain point:** Jira board has hundreds of tickets; needs a curated view of what matters now

---

## 3. Functional Requirements

### FR-001: BACKLOG.md Format Convention
- **Description:** Define a standardized format for BACKLOG.md entries that supports both local-only items and Jira-backed items
- **Format for Jira-backed items:**
  ```markdown
  - 7.7 [ ] Backlog management integration — curated local BACKLOG.md backed by Jira
    - **Jira:** PROJ-1234
    - **Priority:** High
    - **Confluence:** https://wiki.example.com/pages/spec-123
  ```
- **Format for local-only items:**
  ```markdown
  - 7.7 [ ] Backlog management integration — description here
  ```
- **Behavior:** The framework reads both formats. Jira-backed items include metadata sub-bullets. Local-only items remain as-is.
- **Backward compatibility:** Existing BACKLOG.md entries (without Jira metadata) continue to work unchanged.

### FR-002: Add Jira Ticket to Backlog
- **Description:** When the user says "Add PROJ-1234 to the backlog", the framework pulls the ticket from Jira via Atlassian MCP and appends it to BACKLOG.md
- **Data pulled from Jira:**
  - Ticket title (summary)
  - Description (truncated to first 200 chars if longer)
  - Priority
  - Linked Confluence page URLs (if any)
  - Status (for display)
- **Trigger:** Natural language intent detection ("add [ticket-id] to the backlog", "import [ticket-id]", "pull in [ticket-id]")
- **Output:** New entry appended to the appropriate section of BACKLOG.md with Jira metadata sub-bullets
- **Error handling:** If Jira ticket not found or MCP not configured, display clear error message with setup instructions

### FR-003: Refresh Backlog from Jira
- **Description:** When the user says "Refresh the backlog", the framework re-pulls latest title/description/status/priority from Jira for all Jira-backed items in BACKLOG.md
- **Trigger:** Natural language ("refresh the backlog", "update backlog from Jira", "sync backlog")
- **Behavior:** For each entry in BACKLOG.md that has a Jira ticket ID, query Jira for current data and update the entry in-place
- **Conflict resolution:** Jira data wins for title, priority, status. Local ordering and section placement are preserved.

### FR-004: Reorder Backlog Items
- **Description:** The user can reorder items in BACKLOG.md via natural language ("Move PROJ-1235 above PROJ-1234", "Prioritize item 7.7")
- **Trigger:** Natural language reorder intent
- **Behavior:** Read BACKLOG.md, reorder the specified items, write back
- **Scope:** Reorder happens locally in BACKLOG.md only -- does NOT sync priority back to Jira

### FR-005: Kick Off Workflow from Backlog Item
- **Description:** When the user says "Let's work on PROJ-1234", the framework detects intent, finds the item in BACKLOG.md, and kicks off a feature or fix workflow using the Jira ticket data as input
- **Trigger:** Natural language ("work on PROJ-1234", "start PROJ-1234", "let's do item 7.7")
- **Behavior:**
  a) Find item in BACKLOG.md by Jira ticket ID or item number
  b) If Jira-backed: pull latest description + linked Confluence specs as context
  c) Determine workflow type (feature or fix) from Jira ticket type or user clarification
  d) Initialize workflow with ticket description + Confluence context
- **Confluence context injection:** If the Jira ticket links to Confluence pages, pull their content and include it in the Phase 01 requirements context. The agent starts from a position of knowledge rather than asking cold generic questions.

### FR-006: Status Sync on Workflow Completion
- **Description:** When a workflow completes (merge to main), sync the completion status back to Jira for the associated ticket
- **Trigger:** Orchestrator finalize step (after branch merge)
- **Behavior:**
  a) Read the completed workflow's associated Jira ticket ID from active_workflow
  b) Transition the Jira ticket to "Done" (or configured completion status)
  c) Update BACKLOG.md: mark item as `[x]` and move to Completed section
- **Direction:** BACKLOG.md -> Jira (status only, no content pushed back)
- **Error handling:** If Jira transition fails (permissions, workflow rules), log warning but do not block workflow completion

### FR-007: CLAUDE.md Backlog Instructions
- **Description:** Add backlog management conventions to the CLAUDE.md template so the framework knows how to handle backlog-related natural language
- **Content to add:**
  - BACKLOG.md location and format convention
  - Jira ticket format in entries (metadata sub-bullets)
  - When to sync status back to Jira (workflow completion only)
  - How to handle linked Confluence pages (pull as context, never write back)
  - MCP prerequisite check behavior (graceful error if not configured)
- **Files affected:** `src/claude/CLAUDE.md.template`

### FR-008: MCP Prerequisite Detection
- **Description:** Before any Jira/Confluence operation, check if the Atlassian MCP server is configured in Claude Code
- **Detection:** Check for `atlassian` MCP server in Claude Code configuration
- **If not configured:** Display clear setup instructions:
  ```
  Atlassian MCP server not configured.
  Run: claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse
  ```
- **If configured but auth expired:** Detect auth failure and suggest re-authentication
- **Behavior:** Graceful degradation -- BACKLOG.md management works for local-only items even without MCP

### FR-009: Pluggable Adapter Pattern
- **Description:** Design the integration layer so that Jira + Confluence is the first adapter, but the pattern supports future integrations (Linear, GitHub Issues, Azure DevOps)
- **Pattern:** Each adapter implements a common interface:
  - `getTicket(id)` -> { title, description, priority, status, linkedDocs }
  - `updateStatus(id, status)` -> boolean
  - `getLinkedDocument(url)` -> { title, content }
- **Configuration:** Adapter selection via CLAUDE.md instructions or `.isdlc/integrations.yaml`
- **Scope for this feature:** Jira + Confluence adapter only. Interface definition + one implementation.

---

## 4. Non-Functional Requirements

### NFR-001: Invisible Framework UX
- **Category:** Usability
- **Requirement:** All backlog operations must be invocable via natural language -- no explicit commands or slash commands required
- **Metric:** Zero new slash commands introduced; all operations via intent detection in CLAUDE.md instructions
- **Priority:** Must Have

### NFR-002: Backward Compatibility
- **Category:** Compatibility
- **Requirement:** Existing BACKLOG.md format (without Jira metadata) must continue to work. The backlog picker must read both old and new formats.
- **Metric:** All existing backlog entries remain valid; backlog picker passes existing tests
- **Priority:** Must Have

### NFR-003: Graceful Degradation
- **Category:** Reliability
- **Requirement:** If Atlassian MCP is not configured or Jira is unreachable, all local backlog operations (view, reorder, kick off workflow from local items) continue to work
- **Metric:** Zero functionality loss for non-Jira users
- **Priority:** Must Have

### NFR-004: No New Runtime Dependencies
- **Category:** Architecture
- **Requirement:** Jira/Confluence integration must use the MCP server provided by Atlassian, not new npm packages
- **Metric:** package.json dependency count unchanged
- **Priority:** Must Have

### NFR-005: MCP Auth Resilience
- **Category:** Reliability
- **Requirement:** Handle Atlassian MCP re-authentication gracefully (known issue: re-auth required multiple times per day with SSE transport)
- **Metric:** Auth failure produces actionable error message, never crashes or hangs
- **Priority:** Should Have

---

## 5. Constraints

### CON-001: No New Agents
Backlog management does not require new agents. All operations are handled via CLAUDE.md instructions (natural language intent detection) and orchestrator hooks.

### CON-002: MCP Dependency
Jira and Confluence integration requires the Atlassian Rovo MCP server. This is an external dependency not controlled by the framework. Known limitation: SSE transport is being deprecated by Atlassian, re-auth required frequently.

### CON-003: One-Way Content Sync
Content flows FROM Jira/Confluence INTO the framework. The framework NEVER writes content back to Jira or Confluence. Only status transitions (In Progress, Done) flow back to Jira.

### CON-004: Local-First Architecture
BACKLOG.md is the primary interface. Jira integration is an enhancement, not a requirement. The framework must work fully without any external integrations.

---

## 6. Assumptions

- ASM-001: Atlassian Rovo MCP server provides read access to Jira tickets and Confluence pages
- ASM-002: Atlassian MCP supports querying tickets by ID (e.g., PROJ-1234)
- ASM-003: Atlassian MCP supports reading Confluence page content by URL
- ASM-004: Jira ticket transitions can be triggered via the MCP server
- ASM-005: BACKLOG.md format is under framework control and can be extended
- ASM-006: The existing backlog picker (orchestrator BACKLOG PICKER section) can be extended to support the new format

---

## 7. Out of Scope

- Full Jira board management (sprint planning, bulk import, board views)
- Two-way content sync (only status flows back to Jira)
- Publishing artifacts to Confluence
- Support for non-Atlassian integrations in this iteration (pattern only)
- Jira JQL query support (individual ticket import only)
- Automatic Jira ticket creation from the framework
- MCP server installation or configuration automation

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| BACKLOG.md | Framework's curated local backlog file, readable and editable |
| MCP | Model Context Protocol -- standard for connecting AI tools to external services |
| Atlassian Rovo MCP | Atlassian's MCP server providing access to Jira and Confluence |
| Backlog picker | Orchestrator's interactive menu for selecting work items from BACKLOG.md |
| Jira-backed item | A BACKLOG.md entry that references a Jira ticket ID |
| Local-only item | A BACKLOG.md entry without external tool references |
| Adapter | Integration module implementing the common interface for a specific tool (Jira, Linear, etc.) |
