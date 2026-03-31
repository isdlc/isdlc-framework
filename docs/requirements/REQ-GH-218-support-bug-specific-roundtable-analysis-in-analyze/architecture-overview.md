# Architecture Overview: Bug-Specific Roundtable Analysis

**Slug**: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
**Version**: 1.0.0

---

## 1. Architecture Options

### Decision 1: Separate protocol file vs extending existing roundtable

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: New `bug-roundtable-analyst.md` | Separate protocol file for bug analysis | Clean separation; different topics, artifacts, confirmation domains; easier to maintain | Some duplication of conversation flow rules | Follows existing pattern: `bug-gather-analyst.md` is separate from `roundtable-analyst.md` | **Selected** |
| B: Bug mode in `roundtable-analyst.md` | Add conditional bug/feature mode to existing roundtable | Single file; shared conversation engine | File already 300+ lines; mode-switching complexity; artifacts/domains diverge significantly | Violates Article V (Simplicity First) — adds conditional complexity | Eliminated |

### Decision 2: Tracing invocation timing

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Tracing during analysis | Spawn tracing-orchestrator from bug roundtable during analyze flow | User reviews root cause before build; no redundant tracing during build; single analysis session | Tracing-orchestrator assumes build-phase context (state.json reads) | Requires ANALYSIS_MODE flag to skip state.json checks | **Selected** |
| B: Tracing during build (status quo) | Keep tracing in Phase 02 of fix workflow | No changes to tracing-orchestrator | Redundant with Alex's analysis; user can't review root cause before committing to build | Current pattern — being replaced | Eliminated |

---

## 2. Selected Architecture

### ADR-001: Separate Bug Roundtable Protocol

- **Status**: Accepted
- **Context**: The bug analysis flow needs different artifacts (bug-report, root-cause-analysis, fix-strategy), different confirmation domains (bug-summary, root-cause, fix-strategy, tasks), and different sequencing (conversation → tracing → confirmation) compared to the feature roundtable
- **Decision**: Create a new `bug-roundtable-analyst.md` protocol file rather than extending `roundtable-analyst.md`
- **Rationale**: The feature roundtable produces requirements/architecture/design artifacts with feature-specific topics. The bug roundtable produces bug-report/root-cause/fix-strategy with diagnosis-specific topics. Separate files avoid mode-switching complexity (Article V)
- **Consequences**: Some conversation flow rules are duplicated between the two protocol files. This is acceptable because the rules are stable and the alternative (shared base + mode branching) adds more complexity than it saves.

### ADR-002: Tracing Front-Loaded into Analysis

- **Status**: Accepted
- **Context**: The tracing-orchestrator (T1/T2/T3) currently runs as Phase 02 of the fix workflow during build. Users cannot review root cause findings before committing to a build.
- **Decision**: Invoke the tracing-orchestrator during the bug roundtable analysis session, after `bug-report.md` is written and before the confirmation sequence
- **Rationale**: Front-loading tracing into analysis lets the user review and confirm root cause hypotheses before any code changes. The tracing-orchestrator and T1/T2/T3 are reused without modification — only the invocation point changes.
- **Consequences**: The fix workflow for bugs skips Phase 02 (tracing) since it's already complete. The build workflow starts at Phase 05 (test-strategy). The tracing-orchestrator needs an ANALYSIS_MODE flag to skip state.json discovery status checks.

### ADR-003: Automatic Build Kickoff

- **Status**: Accepted
- **Context**: The current bug flow ends with "Should I fix it?" — a manual handoff gate. The feature flow after GH-208 generates a task list and lets the user review it.
- **Decision**: After the 4th domain (tasks) is accepted, automatically invoke the build workflow starting at Phase 05 with the pre-generated task list
- **Rationale**: The user has already reviewed and accepted the full analysis including task plan. An additional "Should I fix it?" prompt adds friction without value. The build handler's auto-detection (REQ-0026) already supports `START_PHASE` and `ARTIFACT_FOLDER` parameters.
- **Consequences**: The "Should I fix it?" gate (step 6.5f) is replaced. `meta.phases_completed` includes both `"01-requirements"` and `"02-tracing"` so `computeStartPhase()` resolves to Phase 05.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| Existing tracing-orchestrator | As-is | Reuse proven T1/T2/T3 fan-out pattern | Custom inline tracing (rejected — would duplicate existing capability) |
| Existing persona files | As-is | Maya/Alex/Jordan already cover the required domains | New bug-specific personas (rejected — out of scope, existing personas sufficient) |
| tasks.template.json | As-is | GH-208/212 established the format and consumption model | Custom bug task format (rejected — breaks GH-212 agent consumption) |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| INT-001 | isdlc.md step 6.5c | bug-roundtable-analyst.md | Read tool (protocol reference) | Markdown | Fail: cannot proceed without protocol |
| INT-002 | bug-roundtable-analyst.md | bug-report.md | Write tool | Markdown artifact | Fail: cannot proceed to tracing without bug report |
| INT-003 | bug-roundtable-analyst.md | tracing-orchestrator | Task tool | Delegation prompt with BUG_REPORT_PATH, DISCOVERY_CONTEXT, ANALYSIS_MODE | Fail-open: report tracing failure, proceed without root cause (Article X) |
| INT-004 | tracing-orchestrator | T1/T2/T3 | Task tool (parallel) | Sub-agent delegation prompts | Fail: consolidate partial results if any sub-agent fails |
| INT-005 | bug-roundtable-analyst.md | artifact folder | Write tool (batch) | root-cause-analysis.md, fix-strategy.md, tasks.md | Fail: report to user, retry once |
| INT-006 | isdlc.md step 6.5f | build handler | Inline invocation | START_PHASE: "05-test-strategy", ARTIFACT_FOLDER: "{slug}" | Fail: inform user, suggest manual `/isdlc build` |

### Data Flow

```
GitHub/Jira ticket data
  → Maya conversation (clarifying questions, RETURN-FOR-INPUT)
  → bug-report.md (written to disk — only pre-confirmation artifact)
  → tracing-orchestrator delegation (Task tool, ANALYSIS_MODE: true)
    → T1 symptom-analyzer (parallel)
    → T2 execution-path-tracer (parallel)
    → T3 root-cause-identifier (parallel)
  → trace-analysis.md (in-memory, fed to Alex)
  → Alex presents root cause findings to user
  → Jordan proposes fix strategy options
  → 4-domain confirmation sequence (Accept/Amend each)
  → artifact batch write (root-cause-analysis.md, fix-strategy.md, tasks.md)
  → meta.json update (phases_completed: ["01-requirements", "02-tracing"])
  → build kickoff (START_PHASE: "05-test-strategy")
```

### Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Tracing-orchestrator reads state.json for discovery status | Pass discovery context directly in delegation prompt; add ANALYSIS_MODE: true flag so tracing-orchestrator skips state.json discovery check |
| Tracing delegation fails (timeout, sub-agent error) | Fail-open per Article X: report failure to user, proceed with conversation-based root cause analysis from Alex (degraded but functional) |

---

## 5. Summary

| Metric | Value |
|--------|-------|
| New files | 4 (bug-roundtable-analyst.md, 3 templates) |
| Modified files | 2 (isdlc.md, bug-gather-analyst.md) |
| Reused components | 4 (tracing-orchestrator, T1/T2/T3, persona files, tasks.template.json) |
| ADRs | 3 (separate protocol, tracing front-loaded, auto build kickoff) |
| Key risk | Tracing-orchestrator state.json dependency — mitigated with ANALYSIS_MODE flag |
