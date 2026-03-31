# Root Cause Analysis: GH-218

**Source**: github GH-218
**Status**: Draft
**Generated**: 2026-03-31

## Problem Statement

Bug tickets do not receive the same end-to-end analysis treatment as feature tickets. The current design splits bug understanding across two stages:

- a lightweight bug intake during `analyze`
- deeper technical diagnosis later in fix workflow phase `02-tracing`

That split prevents `analyze` from producing a user-validated bug diagnosis and executable plan.

## Ranked Root Cause Hypotheses

### 1. Product model mismatch between bug intake and feature analysis

**Likelihood**: High

The system models bug analysis as a reduced intake flow rather than a variant of roundtable analysis. This is visible in the dedicated `bug-gather-analyst` protocol and in the orchestrator's explicit `bug_gather` routing.

**Evidence**

- `src/core/orchestration/analyze.js` sends bug items through a single interactive pass.
- `src/claude/commands/isdlc.md` step `6.5` documents bug-gather as a separate inline flow.
- `src/claude/agents/bug-gather-analyst.md` explicitly says it replaces the roundtable for bug subjects.

### 2. Confirmation model is feature-shaped, not analysis-type-shaped

**Likelihood**: High

The existing confirmation sequence assumes feature domains and feature artifacts. Bugs therefore bypass the accept/amend flow instead of getting a bug-specific review sequence.

**Evidence**

- `src/core/orchestration/analyze.js` only runs `runConfirmationSequence()` for feature classifications.
- `src/core/analyze/artifact-readiness.js` only defines readiness for feature artifacts.
- The state machine already supports ordered confirmations, but the domain content is not modeled for bug artifacts.

### 3. Tracing is positioned as a workflow phase instead of an analysis deliverable

**Likelihood**: High

The fix workflow treats tracing as a downstream execution step, which prevents bug analysis from becoming a complete, accepted diagnostic package.

**Evidence**

- `src/isdlc/config/workflows.json` includes `02-tracing` in the fix workflow.
- Current handoff logic in `src/claude/commands/isdlc.md` starts accepted bug work at `02-tracing`.

### 4. Handoff gate is optimized for “understand now, maybe fix later”

**Likelihood**: Medium

The current "Should I fix it?" gate assumes the user may want diagnosis without execution. That is reasonable for lightweight bug intake, but it breaks convergence once bug analysis becomes a full accepted roundtable with tasks.

**Evidence**

- Bug flow ends at a separate handoff decision instead of accepted tasks and automatic continuation.

## Affected Code Paths

1. Bug classification and routing
   - `src/claude/commands/isdlc.md`
   - `src/core/orchestration/analyze.js`
2. Bug analysis protocol
   - `src/claude/agents/bug-gather-analyst.md`
3. Roundtable orchestration and confirmation
   - `src/claude/agents/roundtable-analyst.md`
   - `src/core/analyze/state-machine.js`
   - `src/core/analyze/artifact-readiness.js`
4. Build/fix workflow handoff
   - `src/isdlc/config/workflows.json`
   - `src/claude/commands/isdlc.md`

## Conclusion

The defect is architectural, not incidental. Bug analysis is currently modeled as a lightweight side path. GH-218 requires promoting bug analysis to a first-class roundtable variant with:

- bug-specific topics and artifacts
- bug-specific confirmation domains
- task generation before build
- tracing absorbed into analysis
- direct continuation into build at `05-test-strategy`
