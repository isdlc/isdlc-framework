# Architecture Overview: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## 1. Architecture Approach

This feature **extends** the existing prompt-driven agent architecture. The iSDLC framework operates through CLAUDE.md instructions (natural language intent detection) and agent prompt files (markdown). This feature is predominantly a prompt/instruction change (~85% markdown, ~15% CJS hook regex).

**Key Architectural Constraint:** No new agents, no new hooks, no new npm dependencies (NFR-004). All integration with Jira/Confluence is through the externally-provided Atlassian MCP server -- the framework delegates API calls to Claude Code's MCP infrastructure, not to its own code.

| Existing Component | Extension | FR(s) |
|-------------------|-----------|-------|
| `CLAUDE.md.template` | New "Backlog Management" section with intent detection patterns | FR-007, FR-008, FR-009 |
| `00-sdlc-orchestrator.md` BACKLOG PICKER | Read BACKLOG.md (not CLAUDE.md), parse Jira metadata | FR-001, FR-002, FR-003, FR-004, FR-005 |
| `01-requirements-analyst.md` | Add Confluence context injection (parallel to Discovery Context) | FR-005 |
| `isdlc.md` command spec | Reference BACKLOG.md scanning, add Jira sync to finalize | FR-005, FR-006 |
| `menu-halt-enforcer.cjs` | Update backlog-picker regex if menu format changes | FR-002 |

---

## 2. System Context (C4 Level 1)

```
                           +-----------------------+
                           |      Developer         |
                           | (iSDLC User)           |
                           +----------+------------+
                                      |
                     Natural language ("Add PROJ-1234 to the backlog")
                                      |
                           +----------v------------+
                           |    Claude Code CLI     |
                           | (CLAUDE.md loaded)     |
                           +----------+------------+
                                      |
                       Intent detection via CLAUDE.md instructions
                                      |
              +-----------------------v-----------------------+
              |              iSDLC Framework                   |
              |                                               |
              |  +------------------------------------------+ |
              |  | CLAUDE.md.template                        | |
              |  |  - Backlog management intent detection    | |
              |  |  - MCP prerequisite check instructions    | |
              |  |  - Adapter pattern specification          | |
              |  +------------------------------------------+ |
              |                                               |
              |  +------------------------------------------+ |
              |  | 00-sdlc-orchestrator.md                   | |
              |  |  - BACKLOG PICKER (reads BACKLOG.md)      | |
              |  |  - Workflow init (Jira ticket context)    | |
              |  |  - Finalize (Jira status sync)            | |
              |  +------------------------------------------+ |
              |                                               |
              |  +------------------------------------------+ |
              |  | 01-requirements-analyst.md                | |
              |  |  - Confluence context injection           | |
              |  +------------------------------------------+ |
              |                                               |
              |  +---------------------+                      |
              |  | BACKLOG.md          |  (curated, local)    |
              |  +---------------------+                      |
              +------|--------------------|-----------+--------+
                     |                    |           |
            Read/Write file       MCP tool calls    MCP tool calls
                     |                    |           |
              +------v------+    +--------v------+  +-v-----------+
              | BACKLOG.md   |    | Jira Cloud    |  | Confluence  |
              | (local file) |    | (via MCP)     |  | (via MCP)   |
              +--------------+    +---------------+  +-------------+
```

---

## 3. Key Architectural Decisions Summary

| Decision | Choice | ADR |
|----------|--------|-----|
| Integration pattern | Prompt-driven MCP delegation (no framework code) | ADR-0001 |
| Data storage | BACKLOG.md as single source (Markdown with metadata sub-bullets) | ADR-0002 |
| Authentication method | Atlassian MCP server handles all auth (OAuth2 via Atlassian) | ADR-0003 |
| Adapter pattern | Interface-only definition in CLAUDE.md instructions, no runtime code | ADR-0004 |

---

## 4. Component Architecture

### 4.1 CLAUDE.md Backlog Management Section (FR-007, FR-008, FR-009)

A new section is added to `src/claude/CLAUDE.md.template` providing:

**Intent Detection Patterns:**
- "Add PROJ-1234 to the backlog" --> Jira import flow
- "Refresh the backlog" --> Bulk Jira refresh flow
- "Move X above Y" / "Prioritize item 7.7" --> Local reorder flow
- "Let's work on PROJ-1234" / "Start item 7.7" --> Workflow kick-off flow
- "Show me the backlog" --> Read and display BACKLOG.md

**MCP Prerequisite Check Instructions:**
Before any Jira/Confluence operation, Claude Code checks for the Atlassian MCP server. If not configured, it displays setup instructions and fails gracefully. Local-only operations continue without MCP.

**Adapter Interface Specification:**
Defines the conceptual interface for future adapters:
- `getTicket(id)` --> `{ title, description, priority, status, linkedDocs[] }`
- `updateStatus(id, status)` --> `boolean`
- `getLinkedDocument(url)` --> `{ title, content }`

The Jira+Confluence adapter is implemented as CLAUDE.md instructions that map these operations to MCP tool calls. No runtime adapter code exists -- the LLM IS the adapter runtime.

### 4.2 Backlog Picker Extension (FR-001, FR-002, FR-004, FR-005)

The orchestrator's BACKLOG PICKER section is updated to:

1. **Read BACKLOG.md** instead of scanning CLAUDE.md for `- [ ]` items (fixing existing tech debt)
2. **Parse both formats:**
   - Local-only: `- 7.7 [ ] Description here`
   - Jira-backed: `- 7.7 [ ] Description here` with `- **Jira:** PROJ-1234` sub-bullet
3. **Display Jira ticket IDs** in picker options when present
4. **Populate `active_workflow`** with `jira_ticket_id` and `confluence_urls` fields when a Jira-backed item is selected

**Backward Compatibility:** The picker continues to also read cancelled workflows from `state.json`. The `[O] Other` option remains. Existing BACKLOG.md entries without Jira metadata work unchanged (NFR-002).

### 4.3 Confluence Context Injection (FR-005)

The requirements analyst gains a new section parallel to the existing "Discovery Context" pattern:

```
DISCOVERY CONTEXT (existing):
  - Read docs/project-discovery-report.md
  - Display banner
  - Augment stages 1.1-1.5 with project knowledge

CONFLUENCE CONTEXT (new):
  - Read active_workflow.confluence_urls[]
  - Pull each Confluence page via MCP getLinkedDocument()
  - Display "Confluence Context" banner
  - Inject content as context for stages 1.1-1.5
  - Graceful degradation: if MCP unavailable, skip silently
```

This means the requirements analyst starts from a position of knowledge when Confluence specs are linked, producing better requirements faster.

### 4.4 Jira Status Sync on Finalize (FR-006)

The orchestrator's finalize step gains a new sub-step after branch merge:

```
Existing finalize flow:
  1. Human Review Checkpoint (if enabled)
  2. Merge branch to main
  3. Collect phase snapshots
  4. Prune state
  5. Move to workflow_history
  6. Clear active_workflow

New step (inserted after 2, before 3):
  2.5. IF active_workflow.jira_ticket_id exists:
       a) Transition Jira ticket to "Done" via MCP updateStatus()
       b) IF transition fails: log warning, do NOT block finalize
       c) Update BACKLOG.md: mark item as [x], move to Completed section
```

**Critical Design Decision:** Jira sync is **non-blocking**. If MCP is unavailable, auth expired, or Jira workflow rules prevent the transition, the workflow still completes successfully. This follows Article X (Fail-Safe Defaults) and the explicit requirement in FR-006.

### 4.5 BACKLOG.md Format Convention (FR-001)

The BACKLOG.md format is extended with optional Jira metadata sub-bullets:

```markdown
## Open

### Section Name

- 7.7 [ ] Backlog management integration -- description here
  - **Jira:** PROJ-1234
  - **Priority:** High
  - **Confluence:** https://wiki.example.com/pages/spec-123
  - **Status:** In Progress

- 7.8 [ ] Local-only item -- no Jira metadata needed
```

**Parsing Rules:**
- Items are identified by the `- N.N [ ] ` or `- N.N [x] ` prefix pattern (existing)
- Jira metadata is optional; parsed from indented `- **Key:** Value` sub-bullets
- The `**Jira:**` sub-bullet is the authoritative indicator of a Jira-backed item
- Local-only items have zero metadata sub-bullets (or non-Jira sub-bullets)

---

## 5. Data Flow

### 5.1 Add Jira Ticket to Backlog

```
User: "Add PROJ-1234 to the backlog"
  |
  v
CLAUDE.md intent detection: backlog-add intent
  |
  v
MCP prerequisite check
  |
  +-- MCP not configured? --> Display setup instructions, stop
  |
  v
Call Atlassian MCP: get ticket PROJ-1234
  |
  v
Parse response: title, description (truncate 200 chars), priority, linked Confluence URLs
  |
  v
Read BACKLOG.md
  |
  v
Append entry to "Open" section with metadata sub-bullets
  |
  v
Write BACKLOG.md
  |
  v
Confirm to user: "Added PROJ-1234: {title} to the backlog"
```

### 5.2 Kick Off Workflow from Jira-Backed Item

```
User: "Let's work on PROJ-1234"
  |
  v
CLAUDE.md intent detection: workflow-start intent
  |
  v
Search BACKLOG.md for PROJ-1234
  |
  +-- Not found? --> "PROJ-1234 not in backlog. Add it first?"
  |
  v
Read item entry (title, description, Jira ticket ID, Confluence URLs)
  |
  v
Determine workflow type:
  - Jira ticket type "Bug"/"Defect" --> suggest fix
  - Jira ticket type "Story"/"Task" --> suggest feature
  - Ambiguous --> ask user
  |
  v
Invoke /isdlc feature|fix "<title>"
  |
  v
Orchestrator init populates active_workflow:
  {
    ...existing fields...,
    jira_ticket_id: "PROJ-1234",
    confluence_urls: ["https://wiki.example.com/pages/spec-123"]
  }
  |
  v
Phase 01: Requirements Analyst detects confluence_urls
  |
  v
Pull Confluence page content via MCP
  |
  v
Inject as context for requirements elicitation
```

### 5.3 Status Sync on Workflow Completion

```
Orchestrator finalize step
  |
  v
Read active_workflow.jira_ticket_id
  |
  +-- null/missing? --> skip Jira sync (local-only item)
  |
  v
Call Atlassian MCP: transition PROJ-1234 to "Done"
  |
  +-- Success: log "Jira ticket PROJ-1234 transitioned to Done"
  +-- Failure: log warning, continue finalize (non-blocking)
  |
  v
Update BACKLOG.md: mark item [x], move to Completed section
  |
  v
Continue normal finalize (snapshots, prune, archive)
```

---

## 6. Backward Compatibility Strategy (NFR-002)

The architectural invariant is: **existing BACKLOG.md entries without Jira metadata continue to work identically**.

| Component | Invariant | Verification |
|-----------|-----------|-------------|
| BACKLOG PICKER | Regex matches both `- N.N [ ] text` (old) and `- N.N [ ] text` + sub-bullets (new) | Existing picker tests pass |
| BACKLOG.md parsing | Items without `**Jira:**` sub-bullet are treated as local-only | New test cases |
| Workflow init | `active_workflow` without `jira_ticket_id` field skips all Jira operations | Existing workflow tests pass |
| Finalize | Missing `jira_ticket_id` in `active_workflow` skips Jira sync entirely | Existing finalize tests pass |
| Menu halt enforcer | `backlog-picker` pattern regex still matches `[O] Other` | Existing hook tests pass |

**Migration:** No migration needed. The format extension is purely additive.

---

## 7. Graceful Degradation Strategy (NFR-003, NFR-005)

Error handling follows Article X (Fail-Safe Defaults) and the existing fail-open pattern.

| Failure Mode | Behavior | User Experience |
|-------------|----------|-----------------|
| Atlassian MCP not configured | Skip all Jira/Confluence operations | Local backlog fully functional |
| MCP auth expired (SSE re-auth) | MCP call fails with auth error | Actionable message: "Re-authenticate: claude mcp add ..." |
| Jira ticket not found | MCP returns 404/error | "Ticket PROJ-1234 not found in Jira" |
| Confluence page unavailable | MCP call fails | Workflow proceeds without Confluence context |
| Jira status transition blocked | MCP call fails (workflow rules) | Warning logged; finalize continues |
| Network failure during refresh | Some tickets fail, others succeed | Report partial results: "Updated 3/5, failed: PROJ-101, PROJ-102" |
| BACKLOG.md malformed | Parser cannot read file | Fall back to empty backlog, display error |

---

## 8. Technology Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Jira/Confluence API | Atlassian MCP server (external) | NFR-004 (no new dependencies); MCP is Claude Code's native integration mechanism |
| Data format | Markdown with metadata sub-bullets | Human-readable; git-friendly; extends existing BACKLOG.md format |
| Adapter runtime | LLM-as-adapter (CLAUDE.md instructions) | No runtime code needed; the LLM executes MCP calls per instructions |
| State extension | `active_workflow.jira_ticket_id` + `confluence_urls` | Follows existing ad-hoc field pattern (no JSON schema validation per impact analysis) |
| Module system | CJS for hook changes (.cjs) | Article XII compliance |
| Intent detection | CLAUDE.md instruction patterns | NFR-001 (zero new slash commands); follows existing invisible framework pattern |

---

## 9. Files Changed Summary

| File | Change Type | Lines Changed (est.) | Risk |
|------|------------|---------------------|------|
| `src/claude/CLAUDE.md.template` | Addition (new section) | ~80 | Low |
| `src/claude/agents/00-sdlc-orchestrator.md` | Modification (backlog picker + finalize) | ~60 | Medium |
| `src/claude/agents/01-requirements-analyst.md` | Modification (Confluence context) | ~40 | Medium |
| `src/claude/commands/isdlc.md` | Modification (BACKLOG.md references) | ~20 | Low |
| `src/claude/hooks/menu-halt-enforcer.cjs` | Minor modification (regex) | ~5 | Low |
| `BACKLOG.md` | Reference (format exemplar) | ~0 | Trivial |

Total estimated: ~205 lines across 5 files (+ BACKLOG.md as reference). No new files created.

---

## 10. Requirement Traceability

| Requirement | Architectural Component | Decision |
|-------------|------------------------|----------|
| FR-001 | BACKLOG.md format convention (Section 4.5) | Format definition in CLAUDE.md template |
| FR-002 | CLAUDE.md intent detection + MCP call | ADR-0001 (prompt-driven MCP delegation) |
| FR-003 | CLAUDE.md instructions + BACKLOG.md parsing | Same pattern as FR-002 |
| FR-004 | CLAUDE.md instructions + BACKLOG.md file I/O | Local-only, no architecture decision needed |
| FR-005 | Orchestrator init (jira_ticket_id) + Requirements analyst (Confluence context) | ADR-0001 + Section 4.3 |
| FR-006 | Orchestrator finalize Jira sync (Section 4.4) | Non-blocking sync, Article X |
| FR-007 | CLAUDE.md.template new section (Section 4.1) | Documentation, intent detection |
| FR-008 | MCP prerequisite check instructions | Graceful degradation per NFR-003 |
| FR-009 | Adapter interface specification in CLAUDE.md | ADR-0004 (interface-only) |
| NFR-001 | All operations via CLAUDE.md intent detection | Zero new slash commands |
| NFR-002 | Backward-compatible parsing (Section 6) | Additive format extension |
| NFR-003 | Graceful degradation (Section 7) | Fail-open per Article X |
| NFR-004 | MCP server external, no npm deps | ADR-0001 |
| NFR-005 | MCP auth failure handling | Clear error messages, never crash |

---

## 11. Scalability and Future Adapters

The pluggable adapter pattern (FR-009) is designed for future extensibility:

**Phase 1 (This Feature):** Jira + Confluence via Atlassian MCP. Interface defined in CLAUDE.md instructions.

**Phase 2 (Future):** Additional adapters:
- Linear MCP --> same `getTicket()` / `updateStatus()` interface
- GitHub Issues MCP --> same interface
- Azure DevOps MCP --> same interface

**Adapter Resolution:** When multiple MCP servers are configured, CLAUDE.md instructions specify priority order. The adapter pattern is instruction-based, not code-based -- adding a new adapter means adding a new section to CLAUDE.md (or an integrations config file).

**No Runtime Adapter Framework:** Unlike traditional adapter patterns with interfaces and implementations, this adapter pattern is emergent from LLM instructions. The LLM reads the interface specification and maps it to the available MCP tools. This is simpler (Article V) and requires no code maintenance.
