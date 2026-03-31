# Fix Strategy: GH-218

**Source**: github GH-218
**Status**: Draft
**Generated**: 2026-03-31

## Recommended Approach

Implement a bug-specific roundtable variant by reusing the existing analyze conversation engine and confirmation machinery, while changing the artifact contract and workflow handoff for bug classifications.

## Option A: Extend existing roundtable engine for bug mode

**Verdict**: Recommended

### Summary

Keep one analyze engine, but add a `bug` analysis mode with:

- bug-specific topic coverage
- bug-specific artifact readiness rules
- bug-specific confirmation domains
- bug-specific finalization outputs
- bug-to-build convergence after task acceptance

### Pros

- Reuses the strongest existing behavior: conversation loop, amendments, confirmations, finalization chain.
- Keeps feature and bug analysis behavior structurally aligned.
- Minimizes duplicated orchestration logic.
- Makes future changes to roundtable behavior easier to apply consistently.

### Cons

- Requires refactoring feature-shaped assumptions in provider-neutral analyze code.
- Requires careful update of prompt-verification and orchestration tests.

## Option B: Expand bug-gather into a second standalone engine

**Verdict**: Reject

### Summary

Keep bug flow separate and make `bug-gather-analyst` more sophisticated until it behaves like a roundtable.

### Pros

- Smaller short-term edits to current bug flow docs.

### Cons

- Duplicates roundtable behavior in a second orchestration path.
- Increases drift between feature and bug analysis.
- Makes accept/amend, task generation, and finalization harder to keep consistent.

## Selected Design

### 1. Analysis Flow

- Keep bug classification gate.
- Replace `bug_gather` with a bug roundtable path.
- Open with ticket summary plus Maya-led clarification.
- Run Alex codebase scan and Jordan fix-shaping contributions inside the same conversation.

### 2. Output Contract

Accepted bug analysis produces:

- `bug-report.md`
- `root-cause-analysis.md`
- `fix-strategy.md`
- `tasks.md`

### 3. Confirmation Sequence

Run sequential Accept/Amend across:

1. bug summary
2. root cause analysis
3. fix strategy
4. tasks

Any amendment resets downstream acceptances and regenerates later summaries from updated artifacts.

### 4. Workflow Handoff

- Remove the separate "Should I fix it?" gate for accepted bug analyses.
- After accepted `tasks.md`, initialize the normal execution path.
- Start execution at `05-test-strategy`.
- Preserve failing-test-first and existing quality gates from build onward.

### 5. Workflow Definition Changes

- Bug tracing is completed during analysis.
- The later fix/build path no longer needs a separate `02-tracing` phase for this route.
- Existing direct `/isdlc fix` entry may still keep `02-tracing` when analysis has not already performed it.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ambiguity between bug and feature outputs | Medium | Add explicit bug-mode artifact contract and tests |
| Regression in current bug analyze flow | High | Keep bug classification tests and add new orchestration tests for bug roundtable path |
| Direct `/isdlc fix` path and analyzed bug path diverge incorrectly | High | Make handoff conditional on analysis artifacts proving tracing and tasks already exist |
| Tasks generated without adequate test design | High | Start accepted bug execution at `05-test-strategy`, not `06-implementation` |

## Acceptance Criteria For The Implementation

- Bugs use roundtable analysis rather than bug-gather.
- Accepted bug analysis writes all four bug artifacts.
- Confirmation sequence includes bug-specific domains and tasks.
- Accepted tasks continue directly into build at `05-test-strategy`.
- Existing direct fix entry remains safe when no prior analysis exists.
