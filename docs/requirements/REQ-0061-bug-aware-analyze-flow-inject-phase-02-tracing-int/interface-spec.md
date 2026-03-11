# Interface Specification: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## Interface 1: Analyze Handler -> Bug-Gather Agent (Task Dispatch)

**Source**: Analyze handler (isdlc.md)
**Target**: Bug-gather agent (bug-gather-analyst.md)
**Interface Type**: Task tool dispatch
**Direction**: Handler dispatches agent

### Dispatch Prompt

```
"Analyze bug '{slug}' using the bug-gather flow.

ARTIFACT_FOLDER: docs/requirements/{slug}/
SLUG: {slug}
SOURCE: {meta.source}
SOURCE_ID: {meta.source_id}

META_CONTEXT:
{JSON.stringify(meta, null, 2)}

DRAFT_CONTENT:
{draftContent}

DISCOVERY_CONTEXT:
{discoveryContent}

ANALYSIS_MODE: No state.json writes, no branch creation."
```

### Return Value

The agent returns text output containing:
- Structured playback (for user display)
- "Should I fix it?" question
- Final line: `BUG_GATHER_COMPLETE` (completion signal)

### Validation Rules

- SLUG must be non-empty string
- ARTIFACT_FOLDER must be a valid path
- DRAFT_CONTENT must contain issue description (at minimum)

### Error Cases

| Error | Trigger | Recovery |
|-------|---------|----------|
| Agent fails to scan codebase | Grep/Glob returns no results | Agent reports: "Could not find relevant code. Please provide more context about where the bug occurs." |
| Agent fails to extract bug details | Description too vague | Agent asks user for more detail before producing artifacts |
| Write failure | Disk permission or path issue | Agent reports error; handler falls back to roundtable |

---

## Interface 2: Bug-Gather Agent -> Artifact Folder (File Write)

**Source**: Bug-gather agent
**Target**: `docs/requirements/{slug}/`
**Interface Type**: Write tool
**Direction**: Agent writes files

### Artifacts Produced

**bug-report.md**:
- Must contain: Expected Behavior, Actual Behavior, Symptoms, Affected Area sections
- Optional: Error Messages, Reproduction Steps, Additional Context
- Must satisfy tracing orchestrator pre-phase check (tracing-orchestrator.md lines 42-46)

**requirements-spec.md** (lightweight bug variant):
- Must contain: Problem Statement (Section 1), single FR for the bug fix with acceptance criteria (Section 6)
- Must contain: `analysis_status: "partial"` or equivalent indicator that this is a bug-focused analysis
- Must satisfy `computeStartPhase` detection as Phase 01 completion evidence

### Validation Rules

- bug-report.md must have non-empty Expected Behavior and Actual Behavior sections
- requirements-spec.md must have at least 1 FR with at least 1 AC
- Both files must be valid markdown

---

## Interface 3: Analyze Handler -> Fix Handler (Internal Invocation)

**Source**: Analyze handler (after bug-gather returns and user confirms fix)
**Target**: Fix handler (isdlc.md fix verb)
**Interface Type**: Internal command invocation
**Direction**: Analyze handler invokes fix handler

### Invocation

The analyze handler invokes the fix workflow for the resolved item. This is equivalent to the user typing `/isdlc fix "{slug}"` -- it uses the same code path.

```
Action: fix
Input: {slug}
Flags: (none -- default fix behavior)
```

### Preconditions

- bug-report.md exists in artifact folder
- requirements-spec.md exists in artifact folder
- User has confirmed "yes" to "Should I fix it?"
- meta.json has phases_completed including Phase 01 indicators

### Expected Behavior

The fix handler:
1. Resolves the item (finds existing artifact folder)
2. Reads meta.json
3. Calls `computeStartPhase` which detects Phase 01 artifacts exist
4. Starts fix workflow from Phase 02 (tracing)
5. Phase-Loop Controller drives remaining phases: 02-tracing -> 05 -> 06 -> 16 -> 08

### Error Cases

| Error | Trigger | Recovery |
|-------|---------|----------|
| `computeStartPhase` doesn't detect Phase 01 as complete | Artifacts missing or meta.json not updated | Bug-gather agent must update meta.json phases_completed before handoff |
| Fix handler fails to resolve item | Slug mismatch | Should not happen -- same slug used throughout |
| Workflow creation fails | State.json conflict | Standard fix handler error handling applies |

---

## Interface 4: Bug-Gather Artifacts -> Tracing Orchestrator (Artifact Consumption)

**Source**: Bug-gather agent (artifact files)
**Target**: Tracing orchestrator (T0)
**Interface Type**: File read (artifact consumption)
**Direction**: Tracing orchestrator reads artifacts produced by bug-gather agent

### Expected Input Format (from tracing-orchestrator.md)

The tracing orchestrator's pre-phase check expects:
- `docs/requirements/{slug}/bug-report.md` -- expected vs actual behavior, error messages, stack traces, reproduction steps
- `docs/requirements/{slug}/requirements-spec.md` -- bug report context

### Compatibility Contract

The bug-gather agent MUST produce `bug-report.md` with these sections (matching tracing orchestrator expectations):
- Expected vs actual behavior (for T1 symptom analysis)
- Error messages and stack traces if available (for T1 and T2)
- Reproduction steps if available (for T2 execution path tracing)
- Affected area identification (for T3 root cause narrowing)

### Validation

The tracing orchestrator validates artifact existence at its pre-phase check. If `bug-report.md` is missing, it errors with: "Bug report not found. Phase 01 (Requirements) must complete before Phase 02 (Tracing)."
