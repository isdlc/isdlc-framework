# BUG-0028: Agents ignore injected gate requirements — wasted iterations on hook-blocked actions

**Source**: GitHub Issue #64
**Type**: Bug
**Labels**: bug
**Complexity**: Medium

---

## Problem

Gate requirements pre-injection (REQ-0024, `gate-requirements-injector.cjs`) tells agents what hooks will enforce (e.g., "do not commit during intermediate phases"). But agents sometimes ignore these constraints and attempt the blocked action anyway. The hook safety net catches it, but the iteration is wasted and the agent has to recover.

## Observed

During BUG-0029 Phase 06, the software-developer agent ran `git commit` despite the injected constraint about Git Commit Prohibition. The `branch-guard` hook blocked it correctly, but the commit still partially executed (the commit message appeared in output).

## Root Causes to Investigate

1. Injected gate requirements text gets buried in long agent prompts (context dilution)
2. Agent's own instructions contain competing patterns (e.g., "save your work" or training-data habits)
3. Agents don't treat injected constraints as hard rules vs. suggestions
4. The injection format may not be salient enough (wall of text vs. prominent warning)

## Potential Solutions

- Strengthen injection format (e.g., `CRITICAL CONSTRAINT:` prefix, shorter text, repeated at end of prompt)
- Audit agent files for competing instructions that contradict gate requirements
- Add a "constraint acknowledgment" step where agent echoes back constraints before starting work
- Post-hook feedback loop: when a hook blocks, inject the block reason into the agent's next turn as a high-priority correction

## Impact

Wasted iterations degrade performance budgets (REQ-0025). Each blocked-then-retried action costs ~1-2 min.

## Related

- REQ-0024 (gate requirements pre-injection)
- REQ-0025 (performance budget)
- Git Commit Prohibition in CLAUDE.md
