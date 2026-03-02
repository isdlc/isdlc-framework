# Quick Scan: Manual Code Review Break

**Generated**: 2026-02-08T13:16:00Z
**Feature**: Add manual code review break (pause point before proceeding)
**Phase**: 00-quick-scan

---

## Scope Estimate

**Estimated Scope**: Medium (~10-15 files)
**File Count Estimate**: ~12 files
**Confidence**: Medium

---

## Keyword Matches

### Domain Keywords
| Keyword | File Matches |
|---------|--------------|
| code review | 35 files (agents, checklists, skills, orchestrator) |
| pause / break / stop | 30+ files (escalation, gate logic, iteration corridor) |
| gate validation | 30+ files (checklists, hooks, orchestrator) |
| phase transition | 30+ files (hooks, orchestrator, agents) |

### Technical Keywords
| Keyword | File Matches |
|---------|--------------|
| gate-blocker | 1 file (src/claude/hooks/gate-blocker.cjs) |
| iteration-corridor | 1 file (src/claude/hooks/iteration-corridor.cjs) |
| workflows.json | 1 file (src/isdlc/config/workflows.json) |
| state.json | All hooks + orchestrator |
| require_user_approval | 1 file (workflows.json -- upgrade workflow only) |

---

## Relevant Modules

Based on discovery report and keyword search:

- `src/claude/agents/00-sdlc-orchestrator.md` -- Phase transition logic (Section 4a: "Automatic Phase Transitions - NO PERMISSION PROMPTS")
- `src/isdlc/config/workflows.json` -- Workflow definitions (currently no `pause_points` config)
- `src/claude/hooks/gate-blocker.cjs` -- Gate enforcement hook (could block at specific phases)
- `src/claude/hooks/iteration-corridor.cjs` -- Iteration enforcement (could add pause logic)
- `src/claude/commands/sdlc.md` -- Command routing (needs `/sdlc advance` awareness)
- `src/isdlc/checklists/08-code-review-gate.md` -- Code review gate checklist
- `src/claude/agents/07-qa-engineer.md` -- QA engineer agent
- `docs/isdlc/constitution.md` -- Article VI: Code Review Required

---

## Key Observations

1. **Current behavior**: Phase transitions are AUTOMATIC after gates pass. The orchestrator explicitly FORBIDS asking "Would you like to proceed?" (Section 4a).
2. **No existing mechanism**: There is no `pause_points` or `manual_gate` concept in `workflows.json`.
3. **Precedent**: The upgrade workflow has `require_user_approval: true` on its plan phase -- similar concept but scoped to a single agent modifier, not a workflow-level pause.
4. **Constitution**: Article VI mandates code review but does not specify when the human pause should occur.
5. **Tension**: This feature creates a deliberate exception to the "no permission prompts" rule in Section 4a.

---

## Notes for Requirements

The following questions may help clarify scope:
1. Should the pause occur BEFORE code review (after implementation/testing) or AFTER code review (before merge)?
2. Should this be a workflow-level config (all workflows) or per-workflow?
3. Should the pause be opt-in (flag like `--pause-before-review`) or opt-out (default with `--no-pause`)?
4. What information should be displayed at the pause point (diff summary, test results, artifacts)?

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-08T13:16:00Z",
  "search_duration_ms": 1200,
  "keywords_searched": 8,
  "files_matched": 12,
  "scope_estimate": "medium"
}
```
