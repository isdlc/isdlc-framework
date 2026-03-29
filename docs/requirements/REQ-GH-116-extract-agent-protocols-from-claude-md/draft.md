# Extract agent protocols from CLAUDE.md into shared protocols file

**Source**: GitHub Issue #116
**Type**: Enhancement

## Problem

8 shared protocols (Monorepo Mode, Constitutional Principles, Skill Observability, Suggested Prompts, Iteration Enforcement, Root Resolution, Git Commit Prohibition, Single-Line Bash) live in CLAUDE.md. 31 agent files reference them via one-line pointers. Moving them to `src/claude/protocols.md` and wiring into the session cache would shrink CLAUDE.md significantly.

However, simply moving protocols to a separate file and injecting the whole block into the session cache saves zero tokens — the ~2,000 tokens land in context either way. The real win requires **selective loading**: only inject protocols relevant to the active phase/workflow.

## Scope

- Move protocols to individual files under `src/claude/protocols/` (one file per protocol)
- Map each protocol to the phases/agents that need it
- Update `prime-session.cjs` to selectively inject only relevant protocols based on active workflow phase
- Update 31 agent files, 3 test files, CLAUDE.md.template
- Fallback: inject all protocols when no active workflow exists (session start)

## Expected Savings

- ~2,000 tokens removed from CLAUDE.md (53% of current size)
- Per-session: only ~400-800 tokens injected (phase-relevant subset) vs ~2,000 today
- Net saving: ~1,200-1,600 tokens per session

## Complexity

Medium
