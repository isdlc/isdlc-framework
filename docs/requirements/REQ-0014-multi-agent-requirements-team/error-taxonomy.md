# Error Taxonomy: Multi-Agent Requirements Team

**Feature:** REQ-0014-multi-agent-requirements-team
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Error Classification

All errors in this feature follow three principles:
1. **Article X (Fail-Safe Defaults):** Errors in debate infrastructure never block workflow completion
2. **NFR-002 (Backward Compatibility):** When debate mode fails, fall back to single-agent mode
3. **NFR-004 (Convergence Guarantee):** The debate loop always terminates, even on errors

### Error Severity Levels

| Level | Description | User Impact | Framework Action |
|-------|------------|------------|-----------------|
| **FATAL** | Not used in this feature | N/A | N/A |
| **ERROR** | Debate mode cannot proceed | Debate disabled, falls back to single-agent | Log error, disable debate, continue workflow |
| **WARNING** | Partial failure, debate continues | Some information lost or degraded | Log warning, continue debate loop |
| **INFO** | Operational notice | No impact | Log for observability |

---

## 2. Error Code Taxonomy

### 2.1 Debate Mode Resolution Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| DBT-E001 | Flag Conflict | INFO | Both `--debate` and `--no-debate` provided | "Both --debate and --no-debate provided. Using --no-debate (conservative default)." | `--no-debate` wins automatically |
| DBT-E002 | Sizing Unavailable | WARNING | `active_workflow.sizing` absent when resolving debate mode | "Sizing information not available. Defaulting to debate mode ON." | Default to debate ON |
| DBT-E003 | Unknown Sizing Value | WARNING | Sizing value not in {standard, epic, light} | "Unknown sizing value '{value}'. Defaulting to debate mode ON." | Default to debate ON |

### 2.2 Debate Loop Orchestration Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| DBT-E010 | Creator Artifact Missing | ERROR | Creator did not produce requirements-spec.md | "Creator did not produce requirements-spec.md. Aborting debate mode, falling back to single-agent requirements." | Abort debate, re-delegate to single-agent mode |
| DBT-E011 | Creator Partial Artifacts | WARNING | Creator produced some but not all 4 artifacts | "Creator produced {N}/4 expected artifacts. Proceeding with available artifacts." | Continue debate with available artifacts |
| DBT-E012 | Critic Delegation Failed | ERROR | Task tool delegation to Critic failed | "Critic agent delegation failed. Saving Creator's artifacts as final output." | Save current artifacts, skip remaining rounds |
| DBT-E013 | Refiner Delegation Failed | ERROR | Task tool delegation to Refiner failed | "Refiner agent delegation failed. Saving current artifacts with unresolved findings." | Save current artifacts, proceed to next Critic round or exit |
| DBT-E014 | State Write Failed | WARNING | Failed to update debate_state in state.json | "Could not update debate state in state.json. Debate loop continues." | Continue without state tracking (in-memory only) |

### 2.3 Critique Parsing Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| DBT-E020 | Critique Not Produced | ERROR | Critic did not produce round-N-critique.md | "Critic did not produce a critique report for round {N}. Treating as 0 BLOCKING findings (converged)." | Treat as converged (fail-open, Article X) |
| DBT-E021 | Critique Summary Missing | WARNING | round-N-critique.md exists but has no Summary section | "Could not parse critique summary for round {N}. Treating as 0 BLOCKING findings." | Treat as converged (fail-open) |
| DBT-E022 | Blocking Count Unparseable | WARNING | Summary section exists but BLOCKING count is not an integer | "Could not parse BLOCKING count from round {N} critique. Treating as 0 BLOCKING findings." | Treat as converged (fail-open) |
| DBT-E023 | Critique Format Invalid | WARNING | round-N-critique.md exists but is not valid markdown | "Critique report for round {N} has unexpected format. Treating as 0 BLOCKING findings." | Treat as converged (fail-open) |

### 2.4 Convergence Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| DBT-E030 | Max Rounds Reached | WARNING | debate_state.round == max_rounds AND blocking > 0 | "Debate did not converge after {max_rounds} rounds. {blocking_count} BLOCKING finding(s) remain. Saving best-effort artifacts. See debate-summary.md." | Save latest artifacts with unconverged warning |
| DBT-E031 | Escalated Finding | INFO | Refiner marked a finding as [NEEDS CLARIFICATION] | "Finding {B-NNN} requires user input: {question}. Marked as [NEEDS CLARIFICATION] in requirements-spec.md." | Continue debate; escalated finding counts as "addressed" |

### 2.5 Artifact Versioning Errors

| Code | Name | Severity | Trigger | User Message | Recovery |
|------|------|----------|---------|-------------|----------|
| DBT-E040 | Summary Generation Failed | WARNING | Failed to write debate-summary.md | "Could not generate debate-summary.md. Round history available in state.json instead." | Skip summary, state.json has rounds_history |
| DBT-E041 | Critique Save Failed | WARNING | Failed to save round-N-critique.md | "Could not save round {N} critique report. Critique content lost but convergence check still performed." | Continue loop, lose audit trail for this round |
| DBT-E042 | Artifact Overwrite Failed | ERROR | Failed to overwrite standard artifact (e.g., requirements-spec.md) | "Could not save updated requirements-spec.md. Aborting debate, preserving original artifacts." | Abort debate, keep original artifacts |

---

## 3. Error Handling Patterns

### 3.1 Fail-Open Debate Pattern

The debate loop uses a fail-open strategy: when debate infrastructure fails, the system falls back to the most recent valid state rather than blocking.

```
1. Debate mode resolution fails?
   -> Default to debate ON (DBT-E002, DBT-E003)

2. Creator fails to produce artifacts?
   -> If requirements-spec.md missing: abort debate, single-agent mode (DBT-E010)
   -> If other artifacts missing: continue with partial set (DBT-E011)

3. Critic delegation fails?
   -> Save Creator's artifacts as final output (DBT-E012)
   -> Skip remaining rounds

4. Critique parsing fails?
   -> Treat as 0 BLOCKING = converged (DBT-E020..E023)
   -> Save current artifacts

5. Refiner delegation fails?
   -> Save current artifacts (DBT-E013)
   -> Proceed to next round or exit

6. Max rounds reached?
   -> Save latest artifacts with unconverged warning (DBT-E030)
```

### 3.2 Single-Agent Fallback Pattern

When a critical debate error occurs (DBT-E010, DBT-E012, DBT-E042), the system falls back to single-agent mode:

```
1. Abort debate loop
2. Set active_workflow.debate_mode = false
3. Set active_workflow.debate_state.converged = false
4. Log error in state.json history
5. IF requirements-spec.md exists: use it as final output
   ELSE: re-delegate to 01-requirements-analyst.md in single-agent mode
6. Proceed to Phase 01 gate validation
```

### 3.3 Convergence Failure Pattern

When the loop reaches max rounds without convergence (DBT-E030):

```
1. Save the latest version of all 4 artifacts
2. Append unconverged warning to requirements-spec.md:
   "[WARNING: Debate did not converge after 3 rounds.
    {N} BLOCKING finding(s) remain. See debate-summary.md.]"
3. Generate debate-summary.md with UNCONVERGED status
4. Set debate_state.converged = false in state.json
5. Log warning in state.json history
6. Allow Phase 01 to complete (DO NOT block the gate)
7. Downstream phases are aware of unconverged status via debate_summary
```

---

## 4. Error Response Format

Since this feature operates through LLM prompt orchestration (not structured API responses), error messages are presented as conversational text in the orchestrator's output. The format follows the existing iSDLC pattern:

**For debate loop errors (falls back):**
```
Debate mode encountered an issue: {reason}.
Falling back to single-agent requirements mode.
```

**For convergence warnings (continues):**
```
Note: {what went wrong}. {what happened instead}.
```

**For unconverged completion:**
```
Phase 01 requirements complete (debate mode).
Note: Debate did not fully converge after 3 rounds.
{N} BLOCKING finding(s) remain -- see debate-summary.md for details.
Downstream phases should be aware of these open issues.
```

---

## 5. Error Traceability

| Error Code | FR | NFR | AC |
|------------|-----|-----|-----|
| DBT-E001 | FR-005 | - | AC-005-03 |
| DBT-E002 | FR-005 | - | AC-005-01 |
| DBT-E003 | FR-005 | - | AC-005-01 |
| DBT-E010 | FR-004 | NFR-002 | AC-004-01 |
| DBT-E011 | FR-004 | - | AC-004-01 |
| DBT-E012 | FR-004 | NFR-002 | AC-004-01 |
| DBT-E013 | FR-004 | - | AC-004-02 |
| DBT-E014 | FR-008 | - | AC-008-03 |
| DBT-E020 | FR-002 | - | AC-002-01 |
| DBT-E021 | FR-002 | - | AC-002-01 |
| DBT-E022 | FR-002 | - | AC-002-01 |
| DBT-E023 | FR-002 | - | AC-002-01 |
| DBT-E030 | FR-004 | NFR-004 | AC-004-03 |
| DBT-E031 | FR-003 | - | AC-003-03 |
| DBT-E040 | FR-006 | - | AC-006-03 |
| DBT-E041 | FR-006 | - | AC-006-01 |
| DBT-E042 | FR-004 | NFR-002 | AC-004-01 |
