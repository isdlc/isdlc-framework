# Module Design: Bug-Specific Roundtable Analysis

**Slug**: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
**Version**: 1.0.0

---

## 1. Module Overview

| Module | File | Operation | Responsibility |
|--------|------|-----------|----------------|
| Bug Roundtable Protocol | `src/claude/agents/bug-roundtable-analyst.md` | CREATE | Full bug roundtable: opening, conversation, bug-report, tracing delegation, fix strategy, 4-domain confirmation, artifact batch write, build kickoff signal |
| Bug Summary Template | `src/claude/hooks/config/templates/bug-summary.template.json` | CREATE | Confirmation template for Domain 1 (Bug Summary) |
| Root Cause Template | `src/claude/hooks/config/templates/root-cause.template.json` | CREATE | Confirmation template for Domain 2 (Root Cause Analysis) |
| Fix Strategy Template | `src/claude/hooks/config/templates/fix-strategy.template.json` | CREATE | Confirmation template for Domain 3 (Fix Strategy) |
| Analyze Handler Routing | `src/claude/commands/isdlc.md` step 6.5c-f | MODIFY | Route bugs to new protocol, execute inline, auto build kickoff |
| Bug Gather Deprecation | `src/claude/agents/bug-gather-analyst.md` | MODIFY | Add deprecation header |

---

## 2. Module Design

### 2.1 Bug Roundtable Protocol (`bug-roundtable-analyst.md`)

**Responsibility**: Define the full bug analysis conversation protocol executed inline by the analyze handler.

**Sections**:

1. **Opening** (Maya)
   - Parse draft content (GitHub/Jira ticket data)
   - Present structured bug summary: what's broken, where it likely lives, severity, reproduction
   - Ask clarifying questions
   - STOP and RETURN for user input

2. **Conversation Loop**
   - Same flow rules as feature roundtable (Section 2.2 of roundtable-analyst.md)
   - Bulleted format, natural steering, all 3 personas within 3 exchanges
   - Maya: severity, reproduction, affected users
   - Alex: affected modules, code path observations from codebase scan
   - Jordan: initial thoughts on fix complexity, interface implications

3. **Bug-Report Production**
   - When conversation reaches sufficient understanding, write `bug-report.md`
   - Structure: Expected Behavior, Actual Behavior, Symptoms, Error Messages, Reproduction Steps, Affected Area, Severity, Additional Context
   - Same structure as current bug-gather output (preserves tracing-orchestrator compatibility)

4. **Tracing Delegation**
   - Spawn tracing-orchestrator via Task tool with prompt:
     - `BUG_REPORT_PATH: docs/requirements/{slug}/bug-report.md`
     - `DISCOVERY_CONTEXT: {discovery context from session cache}`
     - `ANALYSIS_MODE: true` (skip state.json discovery status check)
   - On return: parse trace-analysis.md from result
   - Fail-open: if tracing fails, Alex presents conversation-based hypotheses instead

5. **Root Cause Presentation** (Alex)
   - Present consolidated tracing findings: hypotheses ranked by likelihood, affected code paths, evidence
   - Jordan follows with fix strategy: at least 2 approaches, tradeoffs, regression risk, recommended approach

6. **Confirmation Sequence**
   - State machine: `IDLE → PRESENTING_BUG_SUMMARY → PRESENTING_ROOT_CAUSE → PRESENTING_FIX_STRATEGY → PRESENTING_TASKS → FINALIZING → COMPLETE`
   - Each domain: present substantive summary, STOP and RETURN, parse Accept/Amend
   - Amend at any domain restarts from Domain 1
   - Templates loaded from `src/claude/hooks/config/templates/bug-*.template.json` and `fix-strategy.template.json`

7. **Artifact Batch Write**
   - On final acceptance, write to artifact folder:
     - `root-cause-analysis.md` — from tracing findings + Alex's presentation
     - `fix-strategy.md` — from Jordan's fix strategy presentation
     - `tasks.md` — task list for phases 05/06/16/08 using tasks.template.json format
   - Update meta.json: phases_completed = ["01-requirements", "02-tracing"], acceptance record

8. **Build Kickoff Signal**
   - Emit `BUG_ROUNDTABLE_COMPLETE`
   - The analyze handler reads this and invokes build with START_PHASE: "05-test-strategy"

**Dependencies**: Persona files (read-only), tracing-orchestrator (Task tool delegation), confirmation templates (read-only)

### 2.2 Bug-Specific Confirmation Templates

**bug-summary.template.json**:
```json
{
  "domain": "bug-summary",
  "version": "1.0.0",
  "format": {
    "format_type": "bulleted",
    "section_order": ["severity", "reproduction_steps", "affected_users", "symptoms", "affected_area"],
    "required_sections": ["severity", "reproduction_steps", "affected_area"]
  }
}
```

**root-cause.template.json**:
```json
{
  "domain": "root-cause",
  "version": "1.0.0",
  "format": {
    "format_type": "bulleted",
    "section_order": ["hypotheses", "affected_code_paths", "blast_radius", "evidence"],
    "required_sections": ["hypotheses", "affected_code_paths"]
  }
}
```

**fix-strategy.template.json**:
```json
{
  "domain": "fix-strategy",
  "version": "1.0.0",
  "format": {
    "format_type": "bulleted",
    "section_order": ["approaches", "recommended_approach", "regression_risk", "test_gaps"],
    "required_sections": ["approaches", "recommended_approach", "regression_risk"]
  }
}
```

### 2.3 Analyze Handler Routing Changes (`isdlc.md`)

**Step 6.5c** (MODIFY): Read `bug-roundtable-analyst.md` instead of `bug-gather-analyst.md`

**Step 6.5d** (MODIFY): Execute bug roundtable protocol inline using the same relay pattern as the feature roundtable (step 7b). The conversation boundary rules apply: during the bug roundtable, the handler is invisible — it relays persona output verbatim and passes user responses back.

**Step 6.5e** (MODIFY): Update `meta.phases_completed` to include both `"01-requirements"` and `"02-tracing"`. Set `meta.bug_classification` with classification, reasoning, and confirmed_by_user.

**Step 6.5f** (MODIFY): Replace "Should I fix it?" gate with automatic build kickoff:
- Display completion message listing all produced artifacts
- Invoke build handler with `START_PHASE: "05-test-strategy"` and `ARTIFACT_FOLDER: "{slug}"`
- Build uses phases `["05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]`

### 2.4 Tracing Delegation Adapter (inline in bug-roundtable-analyst.md)

Not a separate module — a section within the bug roundtable protocol.

**Delegation prompt construction**:
- `BUG_REPORT_PATH`: path to bug-report.md in artifact folder
- `DISCOVERY_CONTEXT`: extracted from session cache (not from state.json)
- `ANALYSIS_MODE: true`: flag for tracing-orchestrator to skip state.json discovery status check

**Return handling**:
- Parse trace-analysis.md content from tracing-orchestrator result
- Feed to Alex for root cause presentation
- On failure: log warning, Alex presents conversation-based hypotheses (degraded mode, Article X)

---

## 3. Changes to Existing Modules

| File | Section | Change | Rationale |
|------|---------|--------|-----------|
| `src/claude/commands/isdlc.md` | Step 6.5c | Read bug-roundtable-analyst.md | New protocol file |
| `src/claude/commands/isdlc.md` | Step 6.5d | Execute bug roundtable inline | Same relay pattern as feature roundtable |
| `src/claude/commands/isdlc.md` | Step 6.5e | Add "02-tracing" to phases_completed | Tracing now happens during analysis |
| `src/claude/commands/isdlc.md` | Step 6.5f | Replace fix handoff with auto build kickoff | Seamless transition per FR-005 |
| `src/claude/agents/bug-gather-analyst.md` | Header | Add deprecation notice | Replaced by bug-roundtable-analyst.md |

---

## 4. Wiring Summary

| File | Operation | What Changes |
|------|-----------|--------------|
| `src/claude/agents/bug-roundtable-analyst.md` | CREATE | Full bug roundtable protocol |
| `src/claude/hooks/config/templates/bug-summary.template.json` | CREATE | Bug summary confirmation template |
| `src/claude/hooks/config/templates/root-cause.template.json` | CREATE | Root cause confirmation template |
| `src/claude/hooks/config/templates/fix-strategy.template.json` | CREATE | Fix strategy confirmation template |
| `src/claude/commands/isdlc.md` | MODIFY | Steps 6.5c, 6.5d, 6.5e, 6.5f |
| `src/claude/agents/bug-gather-analyst.md` | MODIFY | Add deprecation header |
| `.claude/hooks/config/templates/bug-summary.template.json` | CREATE | Dogfooding dual-file copy |
| `.claude/hooks/config/templates/root-cause.template.json` | CREATE | Dogfooding dual-file copy |
| `.claude/hooks/config/templates/fix-strategy.template.json` | CREATE | Dogfooding dual-file copy |
