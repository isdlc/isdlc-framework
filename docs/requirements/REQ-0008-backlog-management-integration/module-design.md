# Module Design: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Module Overview

This feature modifies 5 existing files across 4 modules. No new files are created. All modules follow the existing prompt-driven architecture pattern (ADR-0001).

| Module | File | Change Type | Est. Lines | FR(s) |
|--------|------|------------|-----------|-------|
| M1: CLAUDE.md Backlog Instructions | `src/claude/CLAUDE.md.template` | Addition | ~80 | FR-007, FR-008, FR-009 |
| M2: Orchestrator Extensions | `src/claude/agents/00-sdlc-orchestrator.md` | Modification | ~60 | FR-001..FR-006 |
| M3: Requirements Analyst Extension | `src/claude/agents/01-requirements-analyst.md` | Modification | ~40 | FR-005 |
| M4: Command Spec Update | `src/claude/commands/isdlc.md` | Modification | ~20 | FR-005, FR-006 |
| M5: Hook Regex Update | `src/claude/hooks/menu-halt-enforcer.cjs` | Modification | ~5 | FR-002 |

---

## 2. Module M1: CLAUDE.md Backlog Instructions

### 2.1 Responsibility

Add a "Backlog Management" section to `src/claude/CLAUDE.md.template` that provides:
1. Intent detection patterns for all backlog operations (FR-007)
2. MCP prerequisite check instructions (FR-008)
3. Adapter interface specification for future integrations (FR-009)
4. BACKLOG.md format convention documentation (FR-001)

### 2.2 Location

Insert new section between the existing "LLM Provider Configuration" section and the "Agent Framework Context" section. The section header follows the existing pattern: `## Backlog Management`.

### 2.3 Section Structure

```markdown
## Backlog Management

### BACKLOG.md Format Convention

{Format documentation: local-only items, Jira-backed items with metadata sub-bullets}
{Parsing rules reference}
{Section structure: ## Open, ## Completed}

### Backlog Operations

{Intent detection table mapping natural language -> behavior}

| User Says | Framework Does |
|-----------|---------------|
| "Add PROJ-1234 to the backlog" | MCP check -> pull ticket -> append to BACKLOG.md |
| "Refresh the backlog" | For each Jira-backed item -> re-pull from Jira -> update in-place |
| "Move X above Y" | Read BACKLOG.md -> reorder -> write back (local-only) |
| "Let's work on PROJ-1234" | Find in BACKLOG.md -> determine workflow type -> invoke workflow |
| "Show me the backlog" | Read and display BACKLOG.md contents |

### MCP Prerequisite Check

{Instructions for checking Atlassian MCP availability before Jira/Confluence operations}
{Setup instructions to display if not configured}
{Graceful degradation behavior}

### Adapter Interface

{Conceptual interface definition: getTicket, updateStatus, getLinkedDocument}
{Jira+Confluence is the first implementation via MCP}
{Future adapters: add new CLAUDE.md section per tool}
```

### 2.4 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Place section between Provider and Agent Framework | Logical grouping: provider -> backlog -> agent internals |
| Use intent detection table (not slash commands) | NFR-001: zero new slash commands; follows invisible framework pattern |
| Include full format convention inline | Avoids cross-file reference; template is self-contained |
| Adapter interface is documentation, not code | ADR-0004: instruction-based adapter pattern |

### 2.5 Dependencies

- **Inward:** None (standalone template section)
- **Outward:** `lib/installer.js` copies template to project CLAUDE.md (automatic propagation)

### 2.6 Backward Compatibility

The new section is purely additive. Existing CLAUDE.md.template content is unchanged. Projects that already have CLAUDE.md will get the new section on next `isdlc update`.

### 2.7 Traceability

| Requirement | Section | Acceptance Criteria |
|-------------|---------|-------------------|
| FR-001 | BACKLOG.md Format Convention | AC-006-01, AC-006-02 |
| FR-007 | Backlog Operations table + full section | AC-007-01, AC-007-02 |
| FR-008 | MCP Prerequisite Check | AC-001-03 |
| FR-009 | Adapter Interface | N/A (future extensibility) |

---

## 3. Module M2: Orchestrator Extensions

### 3.1 Responsibility

Extend three sections of `src/claude/agents/00-sdlc-orchestrator.md`:
1. **BACKLOG PICKER** -- update to read BACKLOG.md (not CLAUDE.md), parse Jira metadata
2. **Workflow init** -- populate `active_workflow` with `jira_ticket_id` and `confluence_urls`
3. **Finalize step** -- add non-blocking Jira status sync after branch merge

### 3.2 Sub-Module M2a: Backlog Picker Extension

**Current behavior (lines 269-291):**
- Feature mode: scans CLAUDE.md for `- [ ]` patterns + cancelled workflows from state.json
- Fix mode: scans CLAUDE.md for bug-related keywords + cancelled fixes from state.json

**New behavior:**
- Feature mode: scans **BACKLOG.md** `## Open` section for `- N.N [ ]` patterns + cancelled workflows from state.json
- Fix mode: scans **BACKLOG.md** for bug-related keywords + cancelled fixes from state.json
- Both modes: parse Jira metadata sub-bullets when present
- Display: include `[Jira: PROJ-1234]` suffix in picker options for Jira-backed items

**Format change in picker:**
```
Current:  [1] Backlog management integration -- description (80 chars max)
New:      [1] Backlog management integration -- description [Jira: PROJ-1234]
          [2] Local-only item -- no Jira tag
```

**Source change:**
```
Old: "CLAUDE.md unchecked items: Scan for - [ ] / - [] patterns"
New: "BACKLOG.md unchecked items: Scan BACKLOG.md ## Open section for - N.N [ ] patterns"
```

**Parsing rules for Jira metadata:**
When a selected item has a `**Jira:** TICKET-ID` sub-bullet, extract:
- `jira_ticket_id` from `**Jira:**` sub-bullet
- `confluence_urls` from `**Confluence:**` sub-bullet(s)

**Backward compatibility:** If BACKLOG.md does not exist, fall back to scanning CLAUDE.md (preserving original behavior for projects without BACKLOG.md).

### 3.3 Sub-Module M2b: Workflow Init Extension

**Current behavior:**
`active_workflow` is created with: type, description, phases, current_phase, phase_status, gate_mode, git_branch, artifact_prefix, artifact_folder, counter_used.

**New behavior:**
When the selected backlog item is Jira-backed, add two additional fields:
```json
{
  "jira_ticket_id": "PROJ-1234",
  "confluence_urls": ["https://wiki.example.com/pages/spec-123"]
}
```

**Absence semantics:**
- If item is local-only: fields are omitted entirely (not set to null)
- All downstream consumers check for field presence before using

### 3.4 Sub-Module M2c: Finalize Jira Sync

**Current finalize flow:**
1. Human Review Checkpoint
2. Merge branch to main
3. Collect phase snapshots
4. Prune state
5. Move to workflow_history
6. Clear active_workflow

**New step inserted after step 2 (merge), before step 3 (snapshots):**

```
2.5 JIRA STATUS SYNC (non-blocking):
    a) Read active_workflow.jira_ticket_id
    b) IF jira_ticket_id is null/absent: SKIP (local-only workflow)
    c) IF jira_ticket_id exists:
       i)   Check MCP prerequisite (Atlassian MCP configured?)
       ii)  IF MCP available: call updateStatus(jira_ticket_id, "Done")
       iii) IF transition succeeds: log "Jira PROJ-1234 transitioned to Done"
       iv)  IF transition fails: log WARNING, do NOT block finalize
       v)   IF MCP unavailable: log WARNING, do NOT block finalize
    d) Update BACKLOG.md: find item by jira_ticket_id, mark [x], move to Completed
    e) Set jira_sync_status in workflow_history entry:
       - "synced" if transition succeeded
       - "failed" if transition attempted but failed
       - null/absent if local-only workflow
```

**Critical constraint:** Step 2.5 MUST be non-blocking. Any failure in Jira sync logs a warning and continues to step 3. This follows Article X (Fail-Safe Defaults) and FR-006 error handling requirement.

### 3.5 Dependencies

- **Inward:** BACKLOG.md (reads), `.isdlc/state.json` (reads/writes), Atlassian MCP (external)
- **Outward:** All phase agents (orchestrator coordinates), `isdlc.md` (references), `gate-blocker.cjs` (validates gates)

### 3.6 Traceability

| Requirement | Sub-Module | Acceptance Criteria |
|-------------|-----------|-------------------|
| FR-001 | M2a (picker format parsing) | AC-006-01, AC-006-02 |
| FR-002 | M2a (Jira display in picker) | AC-001-01, AC-001-02 |
| FR-003 | M2a (refresh references) | AC-002-01, AC-002-02 |
| FR-004 | M2a (reorder references) | AC-003-01, AC-003-02 |
| FR-005 | M2a + M2b (workflow init with Jira context) | AC-004-01, AC-004-04 |
| FR-006 | M2c (finalize sync) | AC-005-01, AC-005-02, AC-005-03 |
| NFR-002 | M2a (backward compat) | Existing entries work |
| NFR-003 | M2a + M2c (graceful degradation) | AC-006-01 |

---

## 4. Module M3: Requirements Analyst Confluence Context

### 4.1 Responsibility

Add a "Confluence Context" injection section to `src/claude/agents/01-requirements-analyst.md`, parallel to the existing "Discovery Context" section (lines 175-263).

### 4.2 Location

Insert after the existing "Discovery Context" section and before the requirements capture stages begin. The section follows the same structural pattern.

### 4.3 Section Structure

```markdown
# CONFLUENCE CONTEXT (Jira-Backed Workflows)

Before starting requirements capture, check if this workflow has linked Confluence pages.

## Check for Confluence Context

1. Read `.isdlc/state.json` -> `active_workflow.confluence_urls`
2. If array is present and non-empty: proceed with Confluence context injection
3. If absent, null, or empty: skip this section entirely (local-only workflow)

## If Confluence Context Exists

For each URL in `active_workflow.confluence_urls`:
1. Call Atlassian MCP `getLinkedDocument(url)` to pull page content
2. If MCP call succeeds: store page title and content (truncated to 5000 chars)
3. If MCP call fails: log warning, continue without that page (graceful degradation)

Display the Confluence context banner:

```
{banner template showing Confluence pages loaded, page count, titles}
```

## Confluence Context Mapping

| Confluence Content | How It's Used |
|-------------------|---------------|
| Spec/PRD document | Pre-fill Stage 1.1 (Business Context) -- start informed |
| Technical design | Pre-fill Stage 1.4 (Technical Context) -- know constraints |
| Requirements list | Seed Stage 1.2 (User Context) -- known user stories |
| Acceptance criteria | Seed Stage 1.5 (Quality & Risk) -- known test scenarios |

## Workflow Augmentation

When Confluence context exists, the requirements analyst starts from a
position of knowledge. Instead of cold generic questions, present:
"I've read the linked spec. Here's my understanding: {summary}.
What's missing or different from what you envision?"
```

### 4.4 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Parallel to Discovery Context pattern | Follows established section pattern in this agent |
| Truncate Confluence content to 5000 chars | Prevent context window overflow; specs can be very large |
| Per-page MCP call with individual error handling | Partial success is better than all-or-nothing |
| Skip silently if no confluence_urls | NFR-003: zero impact on non-Jira workflows |

### 4.5 Dependencies

- **Inward:** `.isdlc/state.json` (reads `active_workflow.confluence_urls`), Atlassian MCP (external)
- **Outward:** Requirements artifacts produced by this agent

### 4.6 Traceability

| Requirement | Section | Acceptance Criteria |
|-------------|---------|-------------------|
| FR-005 | Full Confluence Context section | AC-004-02, AC-004-03 |
| NFR-003 | Skip silently behavior | AC-004-03 |
| NFR-005 | MCP auth failure handling | AC-004-03 |

---

## 5. Module M4: Command Spec Update

### 5.1 Responsibility

Update `src/claude/commands/isdlc.md` to:
1. Reference BACKLOG.md scanning in the feature/fix no-description flow
2. Document Jira status sync in the STEP 4 FINALIZE section

### 5.2 Changes

**Change 1: Feature/fix no-description flow (~255-287)**
```
Current: "If no description provided, present backlog picker (scans CLAUDE.md)"
New:     "If no description provided, present backlog picker (scans BACKLOG.md)"
```

**Change 2: STEP 4 FINALIZE documentation**
Add to the finalize step documentation:
```
After branch merge, if active_workflow.jira_ticket_id exists:
- Sync status to Jira via MCP (non-blocking)
- Update BACKLOG.md entry (mark [x], move to Completed)
- Log sync result to workflow_history
```

### 5.3 Dependencies

- **Inward:** References orchestrator behavior
- **Outward:** Guides user understanding of workflow behavior

### 5.4 Traceability

| Requirement | Change | Acceptance Criteria |
|-------------|--------|-------------------|
| FR-005 | BACKLOG.md scanning reference | AC-004-01 |
| FR-006 | Finalize Jira sync documentation | AC-005-01 |

---

## 6. Module M5: Hook Regex Update

### 6.1 Responsibility

Update the `backlog-picker` pattern regex in `src/claude/hooks/menu-halt-enforcer.cjs` to continue detecting the backlog picker menu when items include Jira ticket ID suffixes.

### 6.2 Current Pattern

The menu halt enforcer detects the backlog picker menu by matching the `[O] Other` option pattern. This should continue to work because the `[O] Other` option is unchanged.

### 6.3 Assessment

**After analysis of the architectural design, the menu halt enforcer may NOT need changes.** The `[O] Other` option remains the terminal menu item in both feature and fix modes. The regex matches `[O] Other` specifically, not the numbered options above it. Adding `[Jira: PROJ-1234]` suffixes to numbered options does not affect the `[O] Other` pattern.

**Recommendation:** Verify during implementation. If the regex matches on broader menu content (not just `[O] Other`), a minor update may be needed. If it only matches `[O] Other`, no change is required.

### 6.4 Conditional Change

If the regex needs updating:
```javascript
// Current regex (example - verify exact pattern during implementation)
/\[O\] Other/

// If broader matching is needed:
/\[O\] Other|\[\d+\].*\[Jira: [A-Z]+-\d+\]/
```

### 6.5 Dependencies

- **Inward:** None (pattern-matching only)
- **Outward:** `pre-task-dispatcher.cjs` dispatches to this hook

### 6.6 Traceability

| Requirement | Change | Acceptance Criteria |
|-------------|--------|-------------------|
| FR-002 | Regex compatibility with Jira-backed items | AC-001-01 (picker still functions) |

---

## 7. Module Interaction Diagram

```
User (natural language)
  |
  v
CLAUDE.md.template [M1]
  |-- Intent detection
  |-- MCP prerequisite check
  |
  v
00-sdlc-orchestrator.md [M2]
  |-- M2a: BACKLOG PICKER (reads BACKLOG.md)
  |-- M2b: Workflow init (jira_ticket_id, confluence_urls)
  |-- M2c: Finalize sync (Jira status update)
  |
  +---> 01-requirements-analyst.md [M3]
  |       |-- Confluence context injection
  |       |-- Requirements capture (augmented with Confluence data)
  |
  +---> isdlc.md [M4]
  |       |-- BACKLOG.md scanning reference
  |       |-- Finalize Jira sync documentation
  |
  +---> menu-halt-enforcer.cjs [M5]
          |-- Regex validation of picker menu format
```

---

## 8. Implementation Order

Based on dependency analysis (from impact analysis, verified here):

| Order | Module | Rationale |
|-------|--------|-----------|
| 1 | M1 (CLAUDE.md template) | Standalone addition, defines conventions for all other modules |
| 2 | M2a (Backlog Picker) | Depends on M1 conventions; enables FR-001..FR-005 |
| 3 | M2b (Workflow Init) | Depends on M2a (picker provides Jira metadata) |
| 4 | M3 (Confluence Context) | Depends on M2b (reads confluence_urls from active_workflow) |
| 5 | M4 (Command Spec) | Documentation of M2a/M2c behavior |
| 6 | M5 (Hook Regex) | Verify after M2a picker format is finalized |
| 7 | M2c (Finalize Sync) | Last in chain; depends on M2b for jira_ticket_id |

---

## 9. Cross-Cutting Concerns

### 9.1 Error Handling

All modules follow the same error handling pattern (Article X, NFR-003, NFR-005):
- MCP unavailable: graceful degradation to local-only mode
- MCP auth expired: actionable error message, no crash
- Ticket not found: clear error message
- Confluence page unavailable: skip that page, continue
- Jira transition fails: log warning, do NOT block

See `error-taxonomy.md` for the complete error code taxonomy.

### 9.2 State Management

Only M2b and M2c modify `state.json`:
- M2b: adds `jira_ticket_id` and `confluence_urls` to `active_workflow`
- M2c: adds `jira_sync_status` to `workflow_history` entry

All state writes follow Article XVI (atomic read-modify-write).

### 9.3 Testing Strategy

Since ~85% of changes are markdown/prompt files, testing is primarily prompt-verification style:
- Verify CLAUDE.md.template contains required sections and patterns
- Verify orchestrator contains updated backlog picker instructions
- Verify requirements analyst contains Confluence context section
- M5 (hook regex): standard CJS unit test

See test strategy phase for detailed test cases.
