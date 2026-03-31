# Bug Report: Bug Analysis Stops Too Early and Cannot Drive Build

**Source**: github GH-218
**Severity**: High
**Status**: Draft
**Generated**: 2026-03-31

## Summary

The current analyze flow treats bug tickets as a lightweight intake path instead of a first-class roundtable. It gathers only enough information to write a minimal `bug-report.md` and `requirements-spec.md`, then asks "Should I fix it?" rather than completing the same structured acceptance flow used for feature analysis.

## Expected Behavior

When a ticket is classified as a bug, the framework should:

1. Pull the ticket content from GitHub or Jira.
2. Present a concise understanding of the bug to the user.
3. Ask clarifying questions through a bug-specific roundtable using Maya, Alex, and Jordan.
4. Produce four reviewable outputs:
   - `bug-report.md`
   - `root-cause-analysis.md`
   - `fix-strategy.md`
   - `tasks.md`
5. Run an Accept/Amend confirmation sequence over those outputs.
6. After final acceptance, create the task plan and continue directly into build at `05-test-strategy`.

## Actual Behavior

The current bug path:

1. Routes to `bug-gather-analyst.md`.
2. Produces only lightweight bug intake artifacts.
3. Skips the richer roundtable confirmation model.
4. Stops at a separate "Should I fix it?" gate.
5. Preserves `02-tracing` as a later fix phase instead of completing that diagnostic work during analysis.

## Reproduction Steps

1. Run `analyze` on a ticket whose description is classified as a bug.
2. Observe that the command routes into the bug-gather protocol rather than the full roundtable flow.
3. Observe that the conversation ends with a fix handoff gate instead of accepted bug-analysis artifacts plus task confirmation.
4. Inspect the configured fix workflow and note that `02-tracing` still occurs after analysis.

## Impact

- Bug analysis is shallower than feature analysis.
- Users cannot validate root-cause reasoning, fix direction, and execution plan before build starts.
- The system duplicates diagnostic work by separating bug intake from later tracing.
- Build convergence is weaker for bug tickets than for feature tickets.

## Affected Area

- **Primary command flow**: `src/claude/commands/isdlc.md`
- **Provider-neutral analyze orchestration**: `src/core/orchestration/analyze.js`
- **Analyze metadata/configuration**: `src/core/analyze/*.js`
- **Bug analysis protocol**: `src/claude/agents/bug-gather-analyst.md`
- **Feature roundtable protocol to reuse/extend**: `src/claude/agents/roundtable-analyst.md`
- **Workflow definition**: `src/isdlc/config/workflows.json`

## User-Validated Direction

- Bug analysis should converge into the normal build path after acceptance.
- Tracing is not removed; it moves forward into the analyze phase.
- The post-analysis handoff should start at `05-test-strategy`, not `06-implementation`.
