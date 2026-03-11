# Architecture Overview: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## 1. Architecture Options

### Decision 1: Bug Detection Mechanism

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A. Keyword-based detection | Match bug keywords (fix, bug, broken, error, crash) against description | Simple, deterministic, fast | Misses nuanced bugs; false positives on keywords in feature descriptions; labels can be wrong | Matches build handler pattern (line 1096) | Eliminated |
| B. LLM inference from description | LLM reads full description, infers bug vs feature, explains reasoning | Handles nuanced descriptions; understands context; transparent reasoning | Non-deterministic; depends on LLM quality | No existing pattern (new) | **Selected** |

### Decision 2: Analyze-to-Fix Boundary

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A. Analyze chains into fix automatically | Analyze detects bug, gathers, then auto-launches fix workflow | Seamless UX; single command does everything | Violates analyze's non-workflow constraint; blurs verb boundaries | Breaks existing convention | Eliminated |
| B. Analyze produces artifacts, explicit handoff | Analyze gathers+confirms, asks "should I fix it?", user confirms, then fix workflow launches | Clean separation; analyze stays non-workflow; two explicit consent points | Two user interactions required | Preserves existing convention | **Selected** |

### Decision 3: Bug-Gather Agent vs Roundtable Mode

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A. New standalone bug-gather agent | Dedicated agent file for bug analysis | Single responsibility; clean, focused; no roundtable persona complexity | New file to maintain | Matches agent-per-phase pattern | **Selected** |
| B. Bug mode in roundtable-analyst | Add bug-analysis mode to existing roundtable agent | No new files; reuses existing dispatch | Increases roundtable complexity; mixes concerns; roundtable is persona-based, bug-gather is not | Against single-responsibility | Eliminated |

---

## 2. Selected Architecture

### ADR-001: LLM Inference for Bug Detection

- **Status**: Accepted
- **Context**: The analyze handler needs to determine whether an item is a bug or feature to route to the correct analysis flow. Labels exist but are unreliable. Simple keyword matching misses nuanced bug descriptions and produces false positives.
- **Decision**: Use LLM inference from the full issue description to classify bug vs feature. Labels are supplementary evidence. The classification is always confirmed with the user before routing.
- **Rationale**: The LLM can understand context that keyword matching cannot (e.g., "returns 500" is a bug even without the word "bug"). User confirmation provides a safety net for misclassification.
- **Consequences**: Non-deterministic classification; depends on LLM quality; but user confirmation mitigates risk. No new coded functions needed -- classification is a prompt-level instruction in the analyze handler.

### ADR-002: Explicit Handoff from Analyze to Fix

- **Status**: Accepted
- **Context**: Users want the analyze command to lead into the fix workflow for bugs. However, the analyze verb is explicitly non-workflow (no state.json, no branches, no workflow creation).
- **Decision**: Analyze produces artifacts and asks "Should I fix it?" The user confirms, and then the system invokes the fix workflow as a separate action. Analyze never creates a workflow.
- **Rationale**: Preserves the clean separation between analyze (artifact production) and fix (workflow execution). Two explicit consent points: "anything to add?" and "should I fix it?" ensure the user controls the flow.
- **Consequences**: Requires the fix workflow's `computeStartPhase` (REQ-0026) to detect existing Phase 01 artifacts and start from Phase 02. This already works today.

### ADR-003: Standalone Bug-Gather Agent

- **Status**: Accepted
- **Context**: When a bug is detected, the roundtable (Maya/Alex/Jordan) is not the right tool -- bugs need understanding and tracing, not requirements/architecture/design elicitation. A bug-specific analysis agent is needed.
- **Decision**: Create a new standalone `bug-gather-analyst.md` agent that handles the gather, playback, and artifact production stages for bugs.
- **Rationale**: Single responsibility -- the bug-gather agent focuses on understanding bugs, not on persona-based requirements elicitation. Keeps the roundtable unchanged for features. The agent is lightweight and focused.
- **Consequences**: New agent file to maintain. The agent must produce artifacts compatible with the tracing orchestrator's expected input format.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| No new dependencies | N/A | All changes are to agent markdown files and the command handler -- no new packages, libraries, or tools | N/A |
| Existing tracing orchestrator (T0) | Current | Already spawns T1/T2/T3 and produces trace-analysis.md -- no changes needed | Building a new tracing agent (rejected: unnecessary duplication) |
| Existing `computeStartPhase` | Current | Already handles Phase 02 start when Phase 01 artifacts exist | Custom phase-skip logic (rejected: reinvents REQ-0026) |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| INT-001 | Analyze handler | Bug-gather agent | Task tool dispatch | Prompt with SLUG, ARTIFACT_FOLDER, issue description, codebase context | Agent returns error message; handler falls back to roundtable |
| INT-002 | Bug-gather agent | Artifact folder | File write | bug-report.md (markdown), requirements-spec.md (markdown) | Write failure logged; user notified |
| INT-003 | Analyze handler | Fix workflow | `/isdlc fix {slug}` invocation | Command string | Fix handler reports errors normally |
| INT-004 | Fix workflow | Tracing orchestrator | Phase delegation via Task tool | Bug-report.md + requirements-spec.md as input artifacts | Tracing orchestrator pre-phase check validates artifacts exist |

### Data Flow

```
User says "analyze #42"
  -> Analyze handler fetches issue (step 3a)
  -> LLM classifies: bug or feature?
  -> [Bug confirmed by user]
  -> Dispatch to bug-gather agent (Task tool)
    -> Agent reads ticket, scans codebase
    -> Agent plays back understanding
    -> User confirms understanding
    -> Agent writes bug-report.md + requirements-spec.md
    -> Agent asks "Should I fix it?"
    -> [User confirms]
  -> Analyze handler invokes `/isdlc fix {slug}`
  -> Fix workflow: computeStartPhase detects Phase 01 done
  -> Fix starts at Phase 02 (tracing)
    -> T0 spawns T1/T2/T3 in parallel
    -> trace-analysis.md produced
  -> Phase 05 (test strategy) -> Phase 06 (implementation) -> Phase 16 (quality loop) -> Phase 08 (code review)
```

### Synchronization Model

- **Bug detection**: Synchronous -- LLM classifies, user confirms, then dispatch happens
- **Gather stage**: Synchronous conversation between bug-gather agent and user
- **Fix execution**: Autonomous -- Phase-Loop Controller drives phases sequentially with live progress
- **Tracing**: T1/T2/T3 run in parallel within Phase 02 (existing behavior)

---

## 5. Summary

**Key Decisions**:

| Decision | Selected | Trade-off |
|----------|----------|-----------|
| Bug detection | LLM inference + user confirmation | Nuance over determinism, mitigated by user confirmation |
| Analyze/fix boundary | Explicit handoff ("should I fix it?") | Two interactions over one, but preserves architecture |
| Agent design | New standalone bug-gather agent | New file over roundtable modification, but cleaner separation |

**Architecture Principle**: Maximize reuse of existing infrastructure. The tracing orchestrator, fix workflow, auto-detection, and Phase-Loop Controller all work as-is. The only new components are the bug classification logic (prompt-level) and the bug-gather agent.
