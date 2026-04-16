# Context-manager hooks: inject phase-specific instructions before delegation, not just block after

**Source**: GitHub issue #253
**URL**: https://github.com/vihang-hub/isdlc-framework/issues/253
**Type**: REQ (feature enhancement)
**Created**: 2026-04-13

---

## Summary

Replace post-hoc blocking hooks with pre-delegation context-manager hooks that inject phase-specific instructions before the orchestrator acts. This addresses the fundamental reliability gap: LLMs are good at following immediate instructions but bad at remembering long protocols.

## Problem

The orchestrator (LLM) is the weakest link in protocol adherence. Current approach:
1. Long protocol docs (isdlc.md ~3000 lines, roundtable-analyst.md ~800 lines)
2. LLM reads and remembers (badly, especially in long sessions with context compression)
3. Hooks block after the LLM has already done the wrong thing (e.g., commit guard fires post-commit)

Observed deviations in a single session:
- Skipped staged bug confirmation (collapsed 4 Accept/Amend stages into 1)
- Committed during phase loop instead of at finalize
- Didn't read protocol file before executing bug flow
- Skipped MCP code-index tools
- Incorrectly skipped embeddings finalize

## Proposed Design

PreToolUse context-manager hooks that fire before Task tool delegation and inject a composed instruction block:

```
PHASE CONTEXT: 06-implementation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY:
- Do NOT run git commit — finalize handles this
- Do NOT write to state.json via Bash
- Leave all changes on working tree

CONFIRMATION STATE:
- Required sequence: [bug-summary, root-cause, fix-strategy, tasks]
- Completed: [bug-summary, root-cause, fix-strategy, tasks] ✓
- Artifacts may be written: YES

DISPATCH MODE:
- tasks.md has 3 pending Phase 06 tasks (>= min 3)
- USE task-level dispatch (3d-tasks), NOT single-call
- Tier 0: T002, T003 (parallel)
- Tier 1: T004 (blocked_by T002, T003)
```

The hook reads state.json, workflows.json, tasks.md, meta.json at invocation time and composes instructions specific to this phase at this moment.

## Key Principle

Move enforcement from LLM discipline → hook-composed immediate instructions.

- **Current**: Long doc → LLM remembers → hook blocks on failure
- **Proposed**: Hook reads state → composes context → injects instructions → LLM follows (which it's good at)

## Context Managers Needed

| Hook | Trigger | Reads | Injects |
|------|---------|-------|---------|
| phase-context-manager | PreToolUse on Task (phase delegation) | state.json, workflows.json, tasks.md | Phase constraints, dispatch mode, commit prohibition |
| confirmation-context-manager | PreToolUse on Write (artifact writes) | meta.json confirmation state | Whether staged confirmations are complete, which artifacts may be written |
| roundtable-context-manager | Before analyze dispatch | meta.json, roundtable protocol | Required confirmation stages, stop/wait rules, no-write-before-finalize |
| finalize-context-manager | Before STEP 4 | state.json, finalize-steps.md | Ordered finalize checklist, which steps to run |

## Implementation

- Uses existing PreToolUse hook framework in settings.json
- Each context-manager is a CJS module in `src/claude/hooks/`
- Reads relevant state files and composes a text block
- Returns the instruction block which gets injected into the LLM's context
- Fail-open: if the hook errors, delegation proceeds without context injection

## Acceptance Criteria

- [ ] Phase-context-manager injects dispatch mode + constraints before every phase delegation
- [ ] Confirmation-context-manager blocks artifact writes when confirmation sequence is incomplete
- [ ] Roundtable-context-manager injects staged confirmation requirements before analyze
- [ ] Commit prohibition is enforced via PreToolUse block (not post-tool warning)
- [ ] All context-managers fail-open (hook errors don't block the workflow)
- [ ] Existing hooks (branch-guard, state-file-guard, tool-router) continue to work unchanged

## Follow-up Comment (from triage of #255, 2026-04-15)

Concrete use case: **embedding-search hierarchy as injected content**. GH-252 shipped reactive tool-router redirection (warn-level) but agents never reach for semantic search in the first place. The `roundtable-context-manager` and `phase-context-manager` hooks from this issue are the right injection point for a search hierarchy block that names `mcp__isdlc-embedding__isdlc_embedding_semantic_search` as the preferred tool for conceptual codebase questions. Suggested additions when analyzed:
- Add "search tool hierarchy (MCP-aware)" to the Injects column for `roundtable-context-manager` and `phase-context-manager`
- Add an AC for the search hierarchy injection
- Consider retiring `roundtable-analyst.md` Appendix B.4 "Enhanced Search" (stale `lib/search/` reference)

## Related

- Memory rule #19: "Instructions are binding, not optional"
- Current gate-requirements-injector (partial implementation of this pattern for gate criteria)
- REQ-GH-116 protocol injection (injects CLAUDE.md protocols into delegation prompts)
- REQ-GH-214 PreToolUse tool-router (shipped infrastructure this builds on)
- REQ-GH-252 reactive tool-router embedding routing (shipped; this adds the proactive side)
- GH-254 (duplicate, closed)
