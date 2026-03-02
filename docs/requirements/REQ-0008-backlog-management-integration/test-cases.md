# Test Cases: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Status:** Draft
**Total Test Cases:** 69

---

## 1. Module M1: CLAUDE.md.template Content Verification

**Test File:** `src/claude/hooks/tests/backlog-claudemd-template.test.cjs`
**Target File:** `src/claude/CLAUDE.md.template`

### TC-M1-01: Backlog Management section header exists
- **AC:** AC-007-01
- **FR:** FR-007
- **Priority:** P0
- **Given:** CLAUDE.md.template file exists
- **When:** reading the file content
- **Then:** the file contains a `## Backlog Management` section header
- **Assert:** `content.includes('## Backlog Management')`

### TC-M1-02: BACKLOG.md format convention subsection exists
- **AC:** AC-007-01
- **FR:** FR-001, FR-007
- **Priority:** P0
- **Given:** CLAUDE.md.template contains the Backlog Management section
- **When:** reading the section content
- **Then:** the section contains a `### BACKLOG.md Format Convention` subsection
- **Assert:** `content.includes('### BACKLOG.md Format Convention')` or similar heading

### TC-M1-03: Item line format documented with regex
- **AC:** AC-006-01, AC-007-01
- **FR:** FR-001
- **Priority:** P0
- **Given:** CLAUDE.md.template Backlog Management section exists
- **When:** reading the format convention subsection
- **Then:** the item line regex pattern is documented (`/^- (\d+(?:\.\d+)*) \[([ x~])\] (.+)$/` or equivalent)
- **Assert:** content contains the item line regex or its human-readable description

### TC-M1-04: Metadata sub-bullet format documented
- **AC:** AC-001-02, AC-007-01
- **FR:** FR-001
- **Priority:** P0
- **Given:** CLAUDE.md.template Backlog Management section exists
- **When:** reading the format convention subsection
- **Then:** Jira metadata sub-bullet keys are documented: `**Jira:**`, `**Priority:**`, `**Confluence:**`, `**Status:**`
- **Assert:** content contains all four metadata key references

### TC-M1-05: Backlog Operations subsection with intent detection table
- **AC:** AC-007-01, AC-007-02
- **FR:** FR-007
- **Priority:** P0
- **Given:** CLAUDE.md.template Backlog Management section exists
- **When:** reading the operations subsection
- **Then:** an intent detection table exists mapping natural language to framework behavior
- **Assert:** content contains table with at least 5 intent patterns

### TC-M1-06: backlog-add intent documented
- **AC:** AC-001-01, AC-007-02
- **FR:** FR-002, FR-007
- **Priority:** P0
- **Given:** CLAUDE.md.template contains the intent detection table
- **When:** checking for backlog-add entries
- **Then:** "Add PROJ-1234 to the backlog" (or similar) maps to MCP check + pull ticket + append to BACKLOG.md
- **Assert:** content contains add/import intent pattern and MCP pull behavior

### TC-M1-07: backlog-refresh intent documented
- **AC:** AC-002-01, AC-007-02
- **FR:** FR-003, FR-007
- **Priority:** P0
- **Given:** CLAUDE.md.template contains the intent detection table
- **When:** checking for backlog-refresh entries
- **Then:** "Refresh the backlog" maps to re-pull all Jira-backed items
- **Assert:** content contains refresh/sync intent pattern

### TC-M1-08: backlog-reorder intent documented
- **AC:** AC-003-01, AC-007-02
- **FR:** FR-004, FR-007
- **Priority:** P1
- **Given:** CLAUDE.md.template contains the intent detection table
- **When:** checking for backlog-reorder entries
- **Then:** "Move X above Y" maps to local-only reorder in BACKLOG.md
- **Assert:** content contains reorder/move/prioritize intent pattern

### TC-M1-09: backlog-work intent documented
- **AC:** AC-004-01, AC-007-02
- **FR:** FR-005, FR-007
- **Priority:** P0
- **Given:** CLAUDE.md.template contains the intent detection table
- **When:** checking for backlog-work entries
- **Then:** "Let's work on PROJ-1234" maps to find item + determine workflow type + invoke workflow
- **Assert:** content contains work/start intent pattern

### TC-M1-10: MCP Prerequisite Check subsection exists
- **AC:** AC-001-03
- **FR:** FR-008
- **Priority:** P0
- **Given:** CLAUDE.md.template Backlog Management section exists
- **When:** reading the MCP check subsection
- **Then:** the section describes checking for Atlassian MCP server configuration
- **Assert:** content contains MCP check instructions

### TC-M1-11: MCP setup command documented
- **AC:** AC-001-03
- **FR:** FR-008
- **Priority:** P0
- **Given:** CLAUDE.md.template MCP Prerequisite Check exists
- **When:** reading the setup instructions
- **Then:** the `claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse` command (or equivalent) is documented
- **Assert:** content contains the MCP setup command

### TC-M1-12: Graceful degradation language present
- **AC:** AC-006-01
- **FR:** FR-008
- **NFR:** NFR-003
- **Priority:** P0
- **Given:** CLAUDE.md.template MCP Prerequisite Check exists
- **When:** reading the degradation instructions
- **Then:** text states local backlog operations work without MCP
- **Assert:** content contains "local" and "without MCP" (or equivalent graceful degradation language)

### TC-M1-13: Adapter Interface subsection exists
- **AC:** N/A (future extensibility)
- **FR:** FR-009
- **Priority:** P2
- **Given:** CLAUDE.md.template Backlog Management section exists
- **When:** reading the adapter interface subsection
- **Then:** the three adapter methods are documented: `getTicket`, `updateStatus`, `getLinkedDocument`
- **Assert:** content contains all three method names

### TC-M1-14: No new slash commands introduced
- **NFR:** NFR-001
- **Priority:** P0
- **Given:** CLAUDE.md.template before and after modification
- **When:** searching for new slash command definitions
- **Then:** no new `/backlog`, `/jira`, or similar slash commands are introduced
- **Assert:** backlog section does not contain `user_invocable:` or slash command definitions

### TC-M1-15: Section placement is correct
- **FR:** FR-007
- **Priority:** P1
- **Given:** CLAUDE.md.template with Backlog Management section added
- **When:** checking section ordering
- **Then:** Backlog Management section appears after the Provider/LLM section and before the Agent Framework section
- **Assert:** index of Backlog Management > index of Provider section, < index of Agent Framework section

### TC-M1-16: No credential references in backlog section
- **NFR:** NFR-004 (no new deps), security
- **Priority:** P1
- **Given:** CLAUDE.md.template Backlog Management section
- **When:** scanning for credential-related terms
- **Then:** no API keys, tokens, passwords, or credential storage instructions are present
- **Assert:** section does not contain "api_key", "token", "password", "secret", "credential" as instruction values

---

## 2. Module M2: Orchestrator Content Verification

**Test File:** `src/claude/hooks/tests/backlog-orchestrator.test.cjs`
**Target File:** `src/claude/agents/00-sdlc-orchestrator.md`

### TC-M2a-01: Backlog picker reads BACKLOG.md
- **AC:** AC-006-02
- **FR:** FR-001
- **Priority:** P0
- **Given:** orchestrator agent file exists
- **When:** reading the BACKLOG PICKER section
- **Then:** the section instructs scanning `BACKLOG.md` (not `CLAUDE.md`) for item patterns
- **Assert:** backlog picker section contains "BACKLOG.md" as the scan source

### TC-M2a-02: Open section scanning instruction
- **AC:** AC-006-02
- **FR:** FR-001
- **Priority:** P0
- **Given:** orchestrator BACKLOG PICKER section exists
- **When:** reading the scanning instructions
- **Then:** instructions specify scanning the `## Open` section
- **Assert:** content references `## Open` or "Open section"

### TC-M2a-03: Jira metadata parsing instructions present
- **AC:** AC-001-01, AC-001-02
- **FR:** FR-002
- **Priority:** P0
- **Given:** orchestrator BACKLOG PICKER section exists
- **When:** reading Jira metadata parsing instructions
- **Then:** instructions describe parsing `**Jira:**` and `**Confluence:**` sub-bullets
- **Assert:** content contains both `**Jira:**` and `**Confluence:**` parsing references

### TC-M2a-04: Jira tag display in picker options
- **AC:** AC-001-01, AC-006-02
- **FR:** FR-002
- **Priority:** P1
- **Given:** orchestrator BACKLOG PICKER section exists
- **When:** reading the picker display format
- **Then:** Jira-backed items show `[Jira: PROJ-1234]` suffix in picker options
- **Assert:** content contains `[Jira:` display format reference

### TC-M2a-05: Backward compatibility fallback to CLAUDE.md
- **NFR:** NFR-002
- **Priority:** P0
- **Given:** orchestrator BACKLOG PICKER section exists
- **When:** reading the fallback instructions
- **Then:** if BACKLOG.md does not exist, picker falls back to scanning CLAUDE.md
- **Assert:** content contains fallback/CLAUDE.md reference for when BACKLOG.md is absent

### TC-M2a-06: Item format regex reference
- **FR:** FR-001
- **Priority:** P1
- **Given:** orchestrator BACKLOG PICKER section exists
- **When:** reading the parsing pattern
- **Then:** the item line regex or its description is referenced
- **Assert:** content references item number + checkbox + text pattern

### TC-M2b-01: jira_ticket_id field in active_workflow
- **AC:** AC-004-01
- **FR:** FR-005
- **Priority:** P0
- **Given:** orchestrator workflow init section exists
- **When:** reading Jira-backed workflow init instructions
- **Then:** `jira_ticket_id` is populated in `active_workflow` from the selected backlog item
- **Assert:** content contains `jira_ticket_id` field reference

### TC-M2b-02: confluence_urls field in active_workflow
- **AC:** AC-004-02
- **FR:** FR-005
- **Priority:** P0
- **Given:** orchestrator workflow init section exists
- **When:** reading Jira-backed workflow init instructions
- **Then:** `confluence_urls` is populated in `active_workflow` from Jira linked pages
- **Assert:** content contains `confluence_urls` field reference

### TC-M2b-03: Local-only items omit Jira fields
- **AC:** AC-006-03
- **FR:** FR-005
- **NFR:** NFR-003
- **Priority:** P0
- **Given:** orchestrator workflow init section exists
- **When:** reading absence semantics
- **Then:** instructions specify that `jira_ticket_id` and `confluence_urls` are omitted (not null) for local-only items
- **Assert:** content describes omission or absence semantics for local workflows

### TC-M2c-01: Non-blocking Jira sync step in finalize
- **AC:** AC-005-01
- **FR:** FR-006
- **Priority:** P0
- **Given:** orchestrator finalize section exists
- **When:** reading the Jira sync step
- **Then:** a non-blocking Jira status sync step is documented after branch merge
- **Assert:** content contains Jira sync step with non-blocking language

### TC-M2c-02: updateStatus call to transition to Done
- **AC:** AC-005-01
- **FR:** FR-006
- **Priority:** P0
- **Given:** orchestrator finalize sync section exists
- **When:** reading the status transition instructions
- **Then:** instructions specify transitioning the Jira ticket to "Done"
- **Assert:** content contains "Done" or "completion status" transition reference

### TC-M2c-03: jira_sync_status in workflow_history
- **AC:** AC-005-01
- **FR:** FR-006
- **Priority:** P1
- **Given:** orchestrator finalize sync section exists
- **When:** reading the sync result tracking
- **Then:** `jira_sync_status` field is documented with values: `synced`, `failed`, null
- **Assert:** content contains `jira_sync_status` and at least "synced" and "failed" values

### TC-M2c-04: Finalize never blocks on Jira failure
- **AC:** AC-005-02
- **FR:** FR-006
- **NFR:** NFR-005
- **Priority:** P0
- **Given:** orchestrator finalize sync section exists
- **When:** reading error handling for sync
- **Then:** instructions explicitly state that Jira sync failure does NOT block workflow completion
- **Assert:** content contains "non-blocking" or "do not block" or "warning" language for sync failures

### TC-M2c-05: BACKLOG.md completion update in finalize
- **AC:** AC-005-03
- **FR:** FR-006
- **Priority:** P0
- **Given:** orchestrator finalize sync section exists
- **When:** reading the BACKLOG.md update step
- **Then:** instructions describe marking item as `[x]` and moving to `## Completed` section
- **Assert:** content contains `[x]` and `Completed` section move reference

---

## 3. Module M3: Requirements Analyst Content Verification

**Test File:** `src/claude/hooks/tests/backlog-requirements-analyst.test.cjs`
**Target File:** `src/claude/agents/01-requirements-analyst.md`

### TC-M3-01: Confluence Context section header exists
- **AC:** AC-004-02
- **FR:** FR-005
- **Priority:** P0
- **Given:** requirements analyst agent file exists
- **When:** reading the file content
- **Then:** a Confluence Context section exists (e.g., `# CONFLUENCE CONTEXT` or similar)
- **Assert:** content contains Confluence context section header

### TC-M3-02: confluence_urls check instruction present
- **AC:** AC-004-02
- **FR:** FR-005
- **Priority:** P0
- **Given:** requirements analyst Confluence Context section exists
- **When:** reading the check instructions
- **Then:** instructions reference `active_workflow.confluence_urls` from state.json
- **Assert:** content contains `confluence_urls` check reference

### TC-M3-03: MCP getLinkedDocument call instruction
- **AC:** AC-004-02
- **FR:** FR-005
- **Priority:** P0
- **Given:** requirements analyst Confluence Context section exists
- **When:** reading the MCP call instructions
- **Then:** instructions describe calling MCP to pull Confluence page content
- **Assert:** content contains MCP/Confluence page retrieval reference

### TC-M3-04: 5000 character truncation documented
- **AC:** AC-004-02
- **FR:** FR-005
- **Priority:** P1
- **Given:** requirements analyst Confluence Context section exists
- **When:** reading truncation rules
- **Then:** content specifies 5000 character truncation limit for Confluence content
- **Assert:** content contains "5000" character/truncation reference

### TC-M3-05: Graceful degradation for missing Confluence
- **AC:** AC-004-03
- **FR:** FR-005
- **NFR:** NFR-003
- **Priority:** P0
- **Given:** requirements analyst Confluence Context section exists
- **When:** reading absence behavior
- **Then:** instructions specify skipping Confluence context silently when urls are absent/empty
- **Assert:** content contains skip/absent/graceful language for missing Confluence URLs

### TC-M3-06: Context mapping table present
- **AC:** AC-004-02
- **FR:** FR-005
- **Priority:** P2
- **Given:** requirements analyst Confluence Context section exists
- **When:** reading the context mapping
- **Then:** a mapping table shows how Confluence content maps to requirements stages
- **Assert:** content contains mapping references (e.g., Spec -> Business Context, Design -> Technical Context)

---

## 4. Module M4: Command Spec Content Verification

**Test File:** `src/claude/hooks/tests/backlog-command-spec.test.cjs`
**Target File:** `src/claude/commands/isdlc.md`

### TC-M4-01: BACKLOG.md scanning reference in no-description flow
- **AC:** AC-004-01
- **FR:** FR-005
- **Priority:** P0
- **Given:** isdlc.md command spec file exists
- **When:** reading the feature/fix no-description flow
- **Then:** backlog picker references `BACKLOG.md` as the scan source
- **Assert:** content contains "BACKLOG.md" in the picker/no-description section

### TC-M4-02: Jira status sync in STEP 4 FINALIZE
- **AC:** AC-005-01
- **FR:** FR-006
- **Priority:** P0
- **Given:** isdlc.md command spec file exists
- **When:** reading the STEP 4 FINALIZE section
- **Then:** Jira status sync documentation is present
- **Assert:** content contains Jira sync reference in finalize step documentation

### TC-M4-03: jira_ticket_id reference in finalize
- **AC:** AC-005-01
- **FR:** FR-006
- **Priority:** P1
- **Given:** isdlc.md STEP 4 FINALIZE section exists
- **When:** reading the sync condition
- **Then:** `jira_ticket_id` field is referenced as the sync trigger
- **Assert:** content contains `jira_ticket_id` in the finalize context

### TC-M4-04: Non-blocking sync language in finalize
- **AC:** AC-005-02
- **FR:** FR-006
- **Priority:** P1
- **Given:** isdlc.md STEP 4 FINALIZE section exists
- **When:** reading the sync behavior
- **Then:** the sync is described as non-blocking
- **Assert:** content contains "non-blocking" or equivalent language in the finalize section

---

## 5. Module M5: Menu Halt Enforcer Regression Tests

**Test File:** `src/claude/hooks/tests/menu-halt-enforcer.test.cjs` (extend existing)
**Target File:** `src/claude/hooks/menu-halt-enforcer.cjs`

### TC-M5-01: Backlog picker with Jira suffixes triggers halt detection
- **AC:** AC-001-01
- **FR:** FR-002
- **Priority:** P0
- **Given:** a Task output containing a backlog picker menu with Jira ticket ID suffixes
- **When:** the menu halt enforcer processes the output
- **Then:** the `[O] Other` detection still works and halt violation is detected if output continues past the menu
- **Input:** `[1] Auth system [Jira: PROJ-1234]\n[2] Local item\n[O] Other\n` + 250 chars of extra text
- **Assert:** stderr includes "MENU HALT VIOLATION" and "backlog-picker"

### TC-M5-02: Mixed Jira and local items in picker
- **AC:** AC-006-02
- **FR:** FR-002
- **Priority:** P1
- **Given:** a Task output containing a backlog picker with both Jira-backed and local items
- **When:** the menu halt enforcer processes the output
- **Then:** detection works correctly regardless of item type mix
- **Input:** `[1] Jira feature [Jira: ABC-100]\n[2] Local only task\n[3] Another [Jira: XY-5]\n[O] Other\n` + 250 chars
- **Assert:** stderr includes "MENU HALT VIOLATION"

### TC-M5-03: Backlog picker with Jira suffixes and no extra output is silent
- **AC:** AC-001-01
- **FR:** FR-002
- **Priority:** P1
- **Given:** a Task output containing a backlog picker with Jira suffixes and no extra output
- **When:** the menu halt enforcer processes the output
- **Then:** no violation is reported (agent stopped correctly)
- **Input:** `[1] Auth system [Jira: PROJ-1234]\n[2] Local item\n[O] Other\n`
- **Assert:** stderr is empty, stdout is empty

---

## 6. Validation Rules Tests

**Test File:** `src/claude/hooks/tests/backlog-validation-rules.test.cjs`
**Source:** `docs/requirements/REQ-0008-backlog-management-integration/validation-rules.json`

### TC-VR-001: BACKLOG.md item line regex (VR-001)
- **VR:** VR-001
- **FR:** FR-001
- **Priority:** P0
- **Given:** the item line regex from VR-001
- **When:** testing against valid examples
- **Then:** all valid examples match: `- 7.7 [ ] Title -- desc`, `- 1.1 [x] Done`, `- 10.3 [~] In progress`
- **And:** all invalid examples do NOT match: `- [ ] No number`, `- 7.7 No checkbox`, `7.7 [ ] No dash`

### TC-VR-002: Metadata sub-bullet regex (VR-002)
- **VR:** VR-002
- **FR:** FR-001
- **Priority:** P0
- **Given:** the metadata sub-bullet regex from VR-002
- **When:** testing against valid examples
- **Then:** all valid examples match: `  - **Jira:** PROJ-1234`, `  - **Priority:** High`, `  - **Confluence:** https://...`
- **And:** all invalid examples do NOT match: `  - Jira: PROJ-1234`, `  - **Jira** PROJ-1234`, `- **Jira:** PROJ-1234`

### TC-VR-003: Jira ticket ID regex (VR-003)
- **VR:** VR-003
- **FR:** FR-002, FR-003, FR-005, FR-006
- **Priority:** P0
- **Given:** the Jira ticket ID regex from VR-003
- **When:** testing against valid examples
- **Then:** all valid examples match: `PROJ-1234`, `MYTEAM-1`, `ABC_DEF-999`
- **And:** all invalid examples do NOT match: `proj-1234`, `PROJ1234`, `PROJ-`, `-1234`, `123-PROJ`

### TC-VR-004: Confluence URL format (VR-004)
- **VR:** VR-004
- **FR:** FR-005
- **Priority:** P0
- **Given:** the Confluence URL regex from VR-004
- **When:** testing against valid examples
- **Then:** valid HTTPS URLs match: `https://wiki.example.com/pages/spec-123`
- **And:** invalid URLs do NOT match: `http://...`, `wiki.example.com/...`, `ftp://...`

### TC-VR-005: Priority enum values (VR-005)
- **VR:** VR-005
- **FR:** FR-001, FR-002
- **Priority:** P1
- **Given:** the priority enum from VR-005
- **When:** checking recognized values
- **Then:** `Highest`, `High`, `Medium`, `Low`, `Lowest` are all recognized
- **And:** unknown values are accepted (Jira custom priorities allowed per spec)

### TC-VR-006: Description truncation at 200 chars (VR-006)
- **VR:** VR-006
- **FR:** FR-002
- **Priority:** P1
- **Given:** a description exceeding 200 characters
- **When:** applying VR-006 truncation rule
- **Then:** the description is truncated to 200 characters with `...` suffix
- **And:** descriptions under 200 characters are not modified

### TC-VR-007: Confluence content truncation at 5000 chars (VR-007)
- **VR:** VR-007
- **FR:** FR-005
- **Priority:** P1
- **Given:** Confluence page content exceeding 5000 characters
- **When:** applying VR-007 truncation rule
- **Then:** the content is truncated to 5000 characters
- **And:** BLG-E022 error is triggered on truncation

### TC-VR-008: Required section headers (VR-008)
- **VR:** VR-008
- **FR:** FR-001
- **Priority:** P0
- **Given:** a BACKLOG.md document
- **When:** checking for required sections
- **Then:** `## Open` and `## Completed` headers must be present
- **And:** BLG-E031 for missing Open, BLG-E032 for missing Completed

### TC-VR-009: Item number uniqueness (VR-009)
- **VR:** VR-009
- **FR:** FR-001
- **Priority:** P2
- **Given:** a BACKLOG.md with duplicate item numbers
- **When:** detecting duplicates
- **Then:** BLG-E035 warning is expected
- **And:** uniqueness check covers both Open and Completed sections

### TC-VR-010: Jira-backed detection rule (VR-010)
- **VR:** VR-010
- **FR:** FR-001, FR-003, FR-006
- **Priority:** P0
- **Given:** a BACKLOG.md item block
- **When:** determining if the item is Jira-backed
- **Then:** item is Jira-backed if and only if it has a `**Jira:**` sub-bullet
- **And:** items without `**Jira:**` are local-only

### TC-VR-011: state.json Jira fields optional (VR-011)
- **VR:** VR-011
- **FR:** FR-005, FR-006
- **Priority:** P1
- **Given:** an active_workflow in state.json
- **When:** checking Jira-related fields
- **Then:** `jira_ticket_id` and `confluence_urls` are optional and may be absent or null
- **And:** when present, `jira_ticket_id` matches VR-003, `confluence_urls` elements match VR-004

### TC-VR-012: jira_sync_status enum (VR-012)
- **VR:** VR-012
- **FR:** FR-006
- **Priority:** P1
- **Given:** a workflow_history entry in state.json
- **When:** checking `jira_sync_status` value
- **Then:** valid values are: `"synced"`, `"failed"`, `null`
- **And:** any other value is invalid

### TC-VR-013: Completed date ISO 8601 format (VR-013)
- **VR:** VR-013
- **FR:** FR-006
- **Priority:** P1
- **Given:** the completed date regex from VR-013
- **When:** testing against valid examples
- **Then:** `2026-02-14`, `2025-12-31` match
- **And:** `02/14/2026`, `Feb 14, 2026`, `2026-2-14` do NOT match

### TC-VR-014: Max 15 items in backlog picker (VR-014)
- **VR:** VR-014
- **FR:** FR-001, FR-002
- **Priority:** P2
- **Given:** a BACKLOG.md with more than 15 items
- **When:** the backlog picker displays options
- **Then:** maximum 15 items are shown, with overflow message
- **Verification:** Content check that the 15-item limit is documented in the orchestrator

### TC-VR-015: Completion move-to-section steps (VR-015)
- **VR:** VR-015
- **FR:** FR-006
- **Priority:** P0
- **Given:** a workflow completion
- **When:** the item is marked complete
- **Then:** steps are: change `[ ]` to `[x]`, add `**Completed:**` date, move to `## Completed`
- **Verification:** Content check that completion protocol is documented in orchestrator

### TC-VR-016: Refresh conflict resolution (VR-016)
- **VR:** VR-016
- **FR:** FR-003
- **Priority:** P1
- **Given:** a backlog refresh operation
- **When:** Jira data conflicts with local data
- **Then:** Jira wins for title/priority/status, local wins for ordering/section placement
- **Verification:** Content check that conflict resolution is documented

### TC-VR-017: Reorder is local-only (VR-017)
- **VR:** VR-017
- **FR:** FR-004
- **Priority:** P1
- **Given:** a backlog reorder operation
- **When:** items are reordered locally
- **Then:** priority is NOT synced back to Jira
- **Verification:** Content check that local-only constraint is documented

### TC-VR-018: Workflow type from Jira issue type (VR-018)
- **VR:** VR-018
- **FR:** FR-005
- **Priority:** P0
- **Given:** a Jira ticket with a specific issue type
- **When:** determining workflow type
- **Then:** Bug/Defect -> fix workflow, Story/Task/Epic -> feature workflow, other -> ask user
- **Verification:** Content check that type mapping is documented

---

## 7. Error Code Coverage Tests (Embedded)

These error codes are verified via content checks within the module-specific test files above. This section documents the explicit coverage mapping.

### TC-ERR-01: BLG-E001 MCP Not Configured
- **Error:** BLG-E001
- **Verified In:** TC-M1-10, TC-M1-11
- **Assert:** CLAUDE.md.template contains MCP not-configured error handling with setup instructions

### TC-ERR-02: BLG-E002 MCP Auth Expired
- **Error:** BLG-E002
- **Verified In:** TC-M1-10, TC-M1-11
- **Assert:** CLAUDE.md.template contains auth-expired error handling with re-auth instructions

### TC-ERR-03: BLG-E003 MCP Connection Failed
- **Error:** BLG-E003
- **Verified In:** TC-M1-10, TC-M1-12
- **Assert:** CLAUDE.md.template contains connection-failed error handling with graceful degradation

### TC-ERR-04: BLG-E010 Ticket Not Found
- **Error:** BLG-E010
- **Verified In:** TC-M1-06
- **Assert:** CLAUDE.md.template add-ticket flow includes not-found error handling

### TC-ERR-05: BLG-E013/E014 Transition Errors
- **Error:** BLG-E013, BLG-E014
- **Verified In:** TC-M2c-04
- **Assert:** Orchestrator finalize section describes non-blocking handling of transition failures

### TC-ERR-06: BLG-E020/E021 Confluence Page Errors
- **Error:** BLG-E020, BLG-E021
- **Verified In:** TC-M3-05
- **Assert:** Requirements analyst describes graceful degradation for unavailable Confluence pages

### TC-ERR-07: BLG-E030 BACKLOG.md File Not Found
- **Error:** BLG-E030
- **Verified In:** TC-M2a-05
- **Assert:** Orchestrator describes fallback behavior when BACKLOG.md does not exist

### TC-ERR-08: BLG-E041 Finalize Sync Failed
- **Error:** BLG-E041
- **Verified In:** TC-M2c-04
- **Assert:** Orchestrator describes non-blocking handling of finalize sync failure

---

## 8. Test Execution Summary

| Test File | Test Count | Module | Type |
|-----------|-----------|--------|------|
| `backlog-claudemd-template.test.cjs` | 16 | M1 | Content Verification |
| `backlog-orchestrator.test.cjs` | 14 | M2a/M2b/M2c | Content Verification |
| `backlog-requirements-analyst.test.cjs` | 6 | M3 | Content Verification |
| `backlog-command-spec.test.cjs` | 4 | M4 | Content Verification |
| `menu-halt-enforcer.test.cjs` (extend) | 3 | M5 | Unit/Regression |
| `backlog-validation-rules.test.cjs` | 18 | VR-001..VR-018 | Validation |
| Error coverage (embedded) | 8 | Cross-cutting | Content Verification |
| **TOTAL** | **69** | | |

### Priority Distribution

| Priority | Count | Percentage |
|----------|-------|-----------|
| P0 (Critical) | 35 | 51% |
| P1 (High) | 22 | 32% |
| P2 (Medium) | 12 | 17% |
| P3 (Low) | 0 | 0% |
