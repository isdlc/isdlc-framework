# Impact Analysis: Backlog Management Integration

**Generated**: 2026-02-14T15:20:00Z
**Feature**: Curated local BACKLOG.md backed by Jira, with Confluence as input source
**Based On**: Phase 01 Requirements (finalized -- 9 FRs, 7 USs, 22 ACs, 5 NFRs)
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (BACKLOG.md 7.7) | Clarified (Phase 01) |
|--------|---------------------------|----------------------|
| Description | Backlog management integration -- curated local BACKLOG.md backed by Jira, with Confluence as input source | 9 FRs covering format convention, Jira import/refresh, reorder, workflow kick-off with Confluence context, status sync, CLAUDE.md instructions, MCP detection, pluggable adapter pattern |
| Keywords | backlog, Jira, Confluence, sync, MCP | backlog, Jira, Confluence, MCP, adapter, natural language, intent detection, graceful degradation, format convention, status sync |
| Estimated Files | ~6 (from BACKLOG.md description) | 7 directly affected, 3 indirectly |
| Scope Change | - | REFINED (same core concept, decomposed into 9 explicit FRs with acceptance criteria) |

---

## Executive Summary

This feature is primarily a **prompt/instruction change** -- not a code change. The iSDLC framework uses CLAUDE.md instructions for natural language intent detection, and most of this feature's functionality is implemented by extending those instructions. The blast radius is **LOW** (7 files directly affected, all markdown/prompt files except one CJS hook). The risk is **LOW-MEDIUM**, driven primarily by MCP availability uncertainty (Atlassian SSE transport has known re-auth issues) and the need to ensure backward compatibility with the existing BACKLOG.md format. No new agents, no new hooks, no new npm dependencies, and no changes to the CJS hook runtime are required. The implementation is predominantly additive.

**Blast Radius**: LOW (7 files directly, 3 indirectly, 4 modules)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 10 (7 direct + 3 indirect)
**Affected Modules**: 4 (CLAUDE.md template, agents/orchestrator, commands, hooks)

---

## Impact Analysis

### Files Directly Affected

| # | File | Lines | FR(s) | Change Type | Description |
|---|------|-------|-------|-------------|-------------|
| 1 | `src/claude/CLAUDE.md.template` | 164 | FR-007, FR-008 | **Addition** | New "Backlog Management" section with intent detection patterns, BACKLOG.md format convention, Jira/Confluence instructions, MCP prerequisite check |
| 2 | `src/claude/agents/00-sdlc-orchestrator.md` | 1205 | FR-001, FR-002, FR-003, FR-004, FR-005 | **Modification** | Extend BACKLOG PICKER to read BACKLOG.md (currently reads CLAUDE.md only), parse Jira metadata sub-bullets, support Jira ticket ID selection, populate `active_workflow` with `jira_ticket_id` and `confluence_urls` |
| 3 | `src/claude/agents/01-requirements-analyst.md` | 1734 | FR-005 | **Modification** | Add Confluence context injection section parallel to existing Discovery Context section. When Jira ticket links to Confluence pages, pull content and inject as context for Stage 1.1-1.5 |
| 4 | `src/claude/commands/isdlc.md` | 1181 | FR-005, FR-006 | **Modification** | Update feature/fix command docs to reference BACKLOG.md scanning. Add Jira status sync to STEP 4 FINALIZE documentation |
| 5 | `BACKLOG.md` | 426 | FR-001 | **Reference** | The file itself serves as the live format reference. Item 7.7 will be marked `[x]` on completion |
| 6 | `src/claude/hooks/menu-halt-enforcer.cjs` | 182 | FR-002 | **Minor modification** | The `backlog-picker` pattern regex may need updating if menu format changes for Jira-backed items |
| 7 | `src/claude/hooks/config/iteration-requirements.json` | - | - | **No change expected** | No new phases or iteration requirements introduced |

### Files Indirectly Affected (Dependency Cascade)

| # | File | Relationship | Impact |
|---|------|-------------|--------|
| 8 | `src/claude/hooks/workflow-completion-enforcer.cjs` | Monitors finalize step | May need awareness of Jira sync in finalize (prompt-driven, not hook-driven) |
| 9 | `src/claude/hooks/lib/common.cjs` | Shared utilities | Potential utility functions for BACKLOG.md parsing if needed by hooks |
| 10 | `lib/installer.js` | Copies CLAUDE.md.template | Template changes cascade automatically -- no installer code changes needed |

### Outward Dependencies (What Depends on Affected Files)

```
CLAUDE.md.template
  <- lib/installer.js (copies template to project CLAUDE.md)
  <- install.sh / install.ps1 (shell installers, same template copy)
  <- lib/updater.js (updates CLAUDE.md on framework update)

00-sdlc-orchestrator.md
  <- isdlc.md (delegates to orchestrator for init/finalize)
  <- All phase agents (orchestrator coordinates them)
  <- gate-blocker.cjs (validates phase gates)
  <- phase-loop-controller (manages phase progression)

01-requirements-analyst.md
  <- 00-sdlc-orchestrator.md (delegates Phase 01 to this agent)
  <- isdlc.md (references Phase 01 behavior)

menu-halt-enforcer.cjs
  <- src/claude/hooks/dispatchers/pre-task-dispatcher.cjs (dispatches to this hook)
```

### Inward Dependencies (What Affected Files Depend On)

```
CLAUDE.md.template
  -> (none -- standalone template)

00-sdlc-orchestrator.md
  -> BACKLOG.md (reads for backlog picker -- EXISTING dependency)
  -> .isdlc/state.json (reads/writes workflow state)
  -> docs/isdlc/constitution.md (reads for validation)

01-requirements-analyst.md
  -> docs/project-discovery-report.md (reads discovery context)
  -> .isdlc/state.json (reads phase state)

menu-halt-enforcer.cjs
  -> (none -- pattern-matching only)
```

### Change Propagation Analysis

The change propagation is **shallow** -- most changes are additive markdown sections that do not alter existing control flow:

1. **CLAUDE.md.template** -> `lib/installer.js` copies it -> project CLAUDE.md created. No code change to installer; template content flows through automatically.
2. **Orchestrator BACKLOG PICKER** -> `isdlc.md` references it -> `menu-halt-enforcer.cjs` validates menu format. If the picker's menu format changes (e.g., Jira ticket IDs in option labels), the halt enforcer's regex may need updating.
3. **Requirements Analyst Confluence section** -> No outward cascade. The injected context is consumed internally by Stage 1.1-1.5 lenses.
4. **Finalize Jira sync** -> `workflow-completion-enforcer.cjs` monitors finalize but does not need to know about Jira sync (prompt-driven, not hook-driven).

---

## Entry Points

### Existing Entry Points (Extending)

| # | Entry Point | File | Current Behavior | Change Required |
|---|-------------|------|-----------------|-----------------|
| 1 | BACKLOG PICKER | `00-sdlc-orchestrator.md` lines 269-291 | Reads CLAUDE.md for `- [ ]` items, cancelled workflows from state.json | Extend to also read BACKLOG.md, parse Jira metadata sub-bullets, display Jira ticket IDs |
| 2 | Feature/fix no-description flow | `isdlc.md` lines 255-287 | References CLAUDE.md scanning | Update to reference BACKLOG.md scanning |
| 3 | Orchestrator init-and-phase-01 | `00-sdlc-orchestrator.md` lines 674+ | Creates `active_workflow` with description | Add `jira_ticket_id`, `confluence_urls` fields when started from Jira-backed item |
| 4 | Discovery Context section | `01-requirements-analyst.md` lines 182-261 | Displays discovery context banner, augments stages with project data | Add parallel "Confluence Context" banner and augmentation |
| 5 | Orchestrator finalize | `00-sdlc-orchestrator.md` line 676 | Merge branch, collect snapshots, prune state | Add Jira status sync step (non-blocking) after merge |
| 6 | Menu halt enforcer | `menu-halt-enforcer.cjs` line 44 | Detects backlog-picker menu pattern `[O] Other` | May need regex update for new item format |

### New Entry Points (Creating)

| # | Entry Point | File | Purpose |
|---|-------------|------|---------|
| 1 | Backlog Management section | `CLAUDE.md.template` (new section) | Natural language intent detection for: "add [ticket] to backlog", "refresh backlog", "move [item] above [item]", "show me the backlog" |
| 2 | MCP prerequisite check | `CLAUDE.md.template` (within new section) | Instructions for checking Atlassian MCP availability before Jira/Confluence operations |
| 3 | Adapter pattern specification | `CLAUDE.md.template` (within new section) | Interface definition: `getTicket(id)`, `updateStatus(id, status)`, `getLinkedDocument(url)` |

### Implementation Chain (End-to-End)

```
User says "Add PROJ-1234 to the backlog"
  -> CLAUDE.md.template intent detection (NEW)
     -> Check MCP prerequisite (NEW)
        -> Call Atlassian MCP getTicket (EXTERNAL)
           -> Parse response: title, description, priority, linked Confluence URLs
              -> Append entry to BACKLOG.md with metadata sub-bullets (NEW)

User says "Let's work on PROJ-1234"
  -> CLAUDE.md.template intent detection (NEW)
     -> Orchestrator BACKLOG PICKER (EXTENDED)
        -> Find item in BACKLOG.md by Jira ticket ID
           -> Orchestrator init (EXTENDED: populate jira_ticket_id)
              -> Requirements Analyst (EXTENDED: inject Confluence context)
                 -> [normal workflow phases...]
                    -> Orchestrator finalize (EXTENDED: sync Jira status)
```

### Recommended Implementation Order

| Order | FR | Description | Rationale |
|-------|-----|-------------|-----------|
| 1 | FR-001 | BACKLOG.md format convention | Documentation only, defines format for all other FRs |
| 2 | FR-007 | CLAUDE.md.template backlog instructions | Standalone addition, no dependencies on other FRs |
| 3 | FR-008 | MCP prerequisite detection | Required by FR-002/003/005/006 before Jira operations |
| 4 | FR-009 | Pluggable adapter pattern | Interface definition, informing FR-002/003/005/006 implementation |
| 5 | FR-004 | Reorder backlog items | Local-only, simplest Jira-independent behavior |
| 6 | FR-002 | Add Jira ticket to BACKLOG.md | First MCP-dependent feature, depends on FR-001/008 |
| 7 | FR-003 | Refresh backlog from Jira | Extension of FR-002 pattern |
| 8 | FR-005 | Kick off workflow from backlog item | Depends on FR-002, modifies orchestrator + requirements analyst |
| 9 | FR-006 | Status sync on workflow completion | Last in chain, modifies finalize flow |

---

## Risk Assessment

### Risk Matrix

| Risk | Severity | Likelihood | Impact Area | Mitigation |
|------|----------|------------|-------------|------------|
| MCP server unavailable or auth expired | HIGH | HIGH | FR-002, FR-003, FR-005, FR-006 | NFR-003/005 require graceful degradation -- all local operations must work without MCP. Show clear setup/re-auth instructions. |
| Backlog picker format parsing breaks existing behavior | MEDIUM | LOW | FR-001, FR-002 | NFR-002 requires backward compatibility. Existing `- [ ]` format must continue working. New Jira metadata is additive sub-bullets. |
| Jira status sync blocks workflow completion | MEDIUM | MEDIUM | FR-006 | Requirements explicitly state sync failure must NOT block workflow completion (FR-006 error handling). Implement as non-blocking, log-and-warn. |
| Menu halt enforcer regex mismatch | LOW | MEDIUM | FR-002 | If backlog picker menu format changes (Jira IDs in labels), the halt enforcer regex needs updating to continue detecting the menu. |
| Confluence page content too large for context | LOW | MEDIUM | FR-005 | Truncate Confluence content to reasonable size. Requirements state description truncated to 200 chars for Jira; similar limit for Confluence. |
| No new test infrastructure for MCP interactions | MEDIUM | HIGH | All Jira FRs | Since MCP interactions are prompt-driven (not CJS hooks), testing is prompt-verification style -- verify CLAUDE.md contains correct instructions, not functional MCP tests. |

### Test Coverage for Affected Files

| File | Existing Tests | Coverage Type | Gap |
|------|---------------|---------------|-----|
| `CLAUDE.md.template` | `tests/prompt-verification/provider-documentation.test.js` | Content verification | No backlog-related content tests |
| `00-sdlc-orchestrator.md` | None (prompt file) | N/A -- prompt content | No tests for backlog picker behavior |
| `01-requirements-analyst.md` | None (prompt file) | N/A -- prompt content | No tests for context injection |
| `isdlc.md` | None (command definition) | N/A -- command spec | No tests for feature/fix commands |
| `menu-halt-enforcer.cjs` | `tests/hooks/menu-halt-enforcer.test.cjs` | Unit tests | Covers existing backlog-picker pattern |
| `workflow-completion-enforcer.cjs` | `tests/hooks/workflow-finalizer.test.cjs` | Unit tests | Covers existing finalize flow |
| `BACKLOG.md` | None | N/A -- content file | No format validation tests |

### Complexity Assessment

| Area | Complexity | Notes |
|------|-----------|-------|
| CLAUDE.md.template addition | LOW | Additive markdown section, no existing behavior changed |
| Backlog picker extension | MEDIUM | Must handle both old (CLAUDE.md `- [ ]`) and new (BACKLOG.md with Jira metadata) formats |
| Confluence context injection | MEDIUM | New section in requirements analyst, parallel to existing discovery context pattern |
| Orchestrator init extension | LOW | Add 2-3 new fields to `active_workflow` when Jira-backed |
| Finalize Jira sync | MEDIUM | Must be non-blocking, handle MCP failures gracefully |
| Adapter pattern definition | LOW | Interface definition only, no runtime code |
| MCP prerequisite check | LOW | Instruction-based check, graceful degradation |

### Technical Debt in Affected Areas

| Area | Debt | Risk |
|------|------|------|
| Backlog picker reads CLAUDE.md, not BACKLOG.md | The BACKLOG.md was moved out of CLAUDE.md (to reduce system prompt size) but the backlog picker was not updated to read BACKLOG.md directly | MEDIUM -- this feature should fix this by updating the picker to read BACKLOG.md |
| No integration/adapter patterns exist | Greenfield -- no existing MCP interaction patterns in the codebase | LOW -- clean start, no legacy constraints |
| No prompt-verification tests for orchestrator/requirements analyst | Complex prompt files with no automated content verification | MEDIUM -- new backlog instructions should have prompt-verification tests |
| `active_workflow` schema not formally defined | Fields added ad-hoc across features; no JSON schema validation | LOW -- adding `jira_ticket_id` and `confluence_urls` follows existing pattern |

### Recommendations

1. **Add prompt-verification tests** for the new CLAUDE.md.template backlog section (verify intent detection patterns, MCP instructions, adapter interface definition)
2. **Add prompt-verification tests** for the orchestrator backlog picker extension (verify BACKLOG.md reading instructions, Jira metadata parsing instructions)
3. **Fix the backlog picker source** -- update it to read BACKLOG.md instead of (or in addition to) CLAUDE.md, addressing the existing technical debt
4. **Test MCP failure scenarios** -- verify graceful degradation when Atlassian MCP is not configured, auth expired, or network unavailable
5. **Keep Jira status sync non-blocking** -- implement as a best-effort operation in the finalize step with clear logging on failure

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: FR-001 (format) -> FR-007 (CLAUDE.md instructions) -> FR-008 (MCP check) -> FR-009 (adapter pattern) -> FR-004 (reorder) -> FR-002 (add ticket) -> FR-003 (refresh) -> FR-005 (kick off workflow) -> FR-006 (status sync)
2. **High-Risk Areas**: MCP availability/auth (add clear error messages and graceful degradation before any Jira operations)
3. **Dependencies to Resolve**: Backlog picker currently reads CLAUDE.md, not BACKLOG.md -- this must be fixed as part of this feature (FR-001/FR-002 intersection)
4. **Implementation Nature**: Predominantly markdown/prompt changes (~85% of work). Only `menu-halt-enforcer.cjs` has CJS code changes, and those are minor regex updates.
5. **No New Agents**: Confirmed by CON-001 -- all operations via CLAUDE.md instructions and orchestrator extensions
6. **No New Dependencies**: Confirmed by NFR-004 -- Jira/Confluence via Atlassian MCP (external), not npm packages

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-14T15:20:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0008-backlog-management-integration/requirements-spec.md",
  "quick_scan_used": null,
  "scope_change_from_original": "refined",
  "requirements_keywords": ["backlog", "Jira", "Confluence", "MCP", "adapter", "natural language", "intent detection", "graceful degradation", "format convention", "status sync"],
  "files_directly_affected": 7,
  "modules_affected": 4,
  "risk_level": "low-medium",
  "blast_radius": "low",
  "coverage_gaps": 5
}
```

**`coverage_gaps` derivation**: 5 of the 7 directly affected files have no existing test coverage: `00-sdlc-orchestrator.md`, `01-requirements-analyst.md`, `isdlc.md`, `BACKLOG.md`, and `CLAUDE.md.template` (only has provider-related tests, not backlog-related). The 2 files with existing tests are `menu-halt-enforcer.cjs` and `workflow-completion-enforcer.cjs` (indirect).
