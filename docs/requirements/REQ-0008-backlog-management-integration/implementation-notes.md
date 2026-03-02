# Implementation Notes: REQ-0008 Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 06-implementation
**Created:** 2026-02-14
**Status:** Complete

---

## Summary

Implemented backlog management integration across 5 existing files (no new production files created). All changes are prompt/markdown content additions except M5 which was verified as a no-op.

## Files Modified

| File | Module | Lines Added | Change Type |
|------|--------|-------------|-------------|
| `src/claude/CLAUDE.md.template` | M1 | ~75 | New "Backlog Management" section |
| `src/claude/agents/00-sdlc-orchestrator.md` | M2a/M2b/M2c | ~60 | Updated BACKLOG PICKER + new Jira workflow init + finalize sync |
| `src/claude/agents/01-requirements-analyst.md` | M3 | ~45 | New "CONFLUENCE CONTEXT" section |
| `src/claude/commands/isdlc.md` | M4 | ~15 | Updated no-description flow + STEP 4 FINALIZE |
| `src/claude/hooks/menu-halt-enforcer.cjs` | M5 | 0 | No changes needed (verified) |

## Test Files Created

| File | Tests | Module |
|------|-------|--------|
| `src/claude/hooks/tests/backlog-claudemd-template.test.cjs` | 16 | M1 content verification |
| `src/claude/hooks/tests/backlog-orchestrator.test.cjs` | 14 | M2a/M2b/M2c content verification |
| `src/claude/hooks/tests/backlog-requirements-analyst.test.cjs` | 6 | M3 content verification |
| `src/claude/hooks/tests/backlog-command-spec.test.cjs` | 4 | M4 content verification |
| `src/claude/hooks/tests/backlog-validation-rules.test.cjs` | 18 | VR-001..VR-018 validation |
| `src/claude/hooks/tests/menu-halt-enforcer.test.cjs` (extended) | 3 | M5 regression tests |

**Total new tests:** 62 (59 new files + 3 added to existing file)
**All tests passing:** Yes (72 total including 10 pre-existing menu-halt-enforcer tests)

## Key Implementation Decisions

### M1: CLAUDE.md.template Backlog Management Section
- Placed between "LLM Provider Configuration" and "Agent Framework Context" per module-design.md Section 2.2
- Documented all 5 intent patterns (add, refresh, reorder, work, view) in a table format
- Included MCP setup command (`claude mcp add --transport sse atlassian ...`)
- Documented adapter interface with 3 methods (getTicket, updateStatus, getLinkedDocument) as documentation-only (no runtime code)
- No new slash commands introduced (NFR-001 compliance)

### M2a: Backlog Picker Update
- Changed scan source from CLAUDE.md to BACKLOG.md `## Open` section
- Added Jira metadata parsing instructions for `**Jira:**` and `**Confluence:**` sub-bullets
- Added `[Jira: TICKET-ID]` suffix display format for picker options
- Preserved backward compatibility: falls back to CLAUDE.md if BACKLOG.md doesn't exist

### M2b: Workflow Init Extension
- Added `jira_ticket_id` and `confluence_urls` fields to active_workflow for Jira-backed items
- Fields are omitted entirely (not null) for local-only items per absence semantics spec
- Added workflow type mapping from Jira issue type (Bug->fix, Story/Task/Epic->feature, other->ask)

### M2c: Finalize Jira Sync
- Inserted as step 2.5 between branch merge (step 2) and merge conflict handling (step 3)
- Explicitly marked as non-blocking (Article X: Fail-Safe Defaults)
- Includes BACKLOG.md completion update: change `[ ]` to `[x]`, add `**Completed:**` date, move to `## Completed`
- Sets `jira_sync_status` in workflow_history (`"synced"`, `"failed"`, or absent)

### M3: Confluence Context Injection
- Follows the parallel structure of the existing "Discovery Context" section
- Reads `active_workflow.confluence_urls` from state.json
- Specifies 5000-character truncation limit for Confluence page content
- Per-page MCP call with individual error handling (graceful degradation)
- Skips silently if no confluence_urls (NFR-003: zero impact on non-Jira workflows)

### M4: Command Spec Update
- Updated both feature and fix no-description flow to reference BACKLOG.md scanning
- Added Jira sync documentation to STEP 4 FINALIZE section
- Referenced `jira_ticket_id` as the sync trigger and non-blocking behavior

### M5: Hook Regex Verification
- Verified the existing `backlog-picker` regex pattern in menu-halt-enforcer.cjs
- Pattern: `test: (text) => /\[O\]\s*Other/i.test(text) && /\[\d+\]/.test(text)`
- The `[Jira: PROJ-1234]` suffixes on numbered items do NOT interfere with detection because `\[\d+\]` only matches `[1]`, `[2]`, etc. and the end marker `\[O\]\s*Other` matches the terminal option
- No code changes needed -- added 3 regression tests confirming correct behavior

## Iteration History

| Iteration | Action | Result |
|-----------|--------|--------|
| 1 | Wrote all 59 new test files (TDD Red) | 35 failing, 24 passing |
| 2 | Implemented all 5 modules (M1-M5) | 59 passing, 0 failing |
| 3 | Added 3 M5 regression tests to existing file | 72 passing, 0 failing |

**Iterations to green:** 2 (tests written first, implementation second)

## Architecture Compliance

- **ADR-0001 (Prompt-driven MCP delegation):** All Jira/Confluence operations are instructions in prompt files, not framework API code
- **ADR-0002 (BACKLOG.md as data store):** Format convention fully documented with regex patterns and metadata sub-bullets
- **ADR-0003 (MCP-managed authentication):** Zero credential surface in all additions; MCP handles auth
- **ADR-0004 (Instruction-based adapter pattern):** Adapter interface documented in CLAUDE.md, not as runtime code
