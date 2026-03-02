# Module Design M6: Edge Cases, Error Handling, and Backward Compatibility

**Module:** Cross-cutting design for edge cases, error handling, and backward compatibility
**Traces:** FR-007 (AC-007-01..AC-007-03), NFR-001..NFR-004, AC-003-05
**Phase:** 04-design (REQ-0017)

---

## 1. Module Purpose

This module consolidates the edge case handling, error taxonomy, backward compatibility strategy, and validation rules that apply across all modules (M1-M5). It defines how the system degrades gracefully under failure conditions and ensures the implementation team feature does not regress existing behavior.

---

## 2. Max Iterations Reached (AC-003-05)

### Scenario

A file undergoes 3 Reviewer-Updater cycles without achieving a PASS verdict. This happens when:
- The Reviewer identifies a subtle or complex issue the Updater cannot fully resolve
- The Updater disputes a finding but the Reviewer rejects the dispute
- Each Updater fix introduces a new issue caught in the next cycle

### Protocol

```
IF current_cycle >= IMPLEMENTATION_ROUTING.max_cycles AND verdict == REVISE:
  1. Accept the file with verdict = "MAX_ITERATIONS"
  2. Record in per_file_reviews:
     {
       "file": "{file_path}",
       "verdict": "MAX_ITERATIONS",
       "cycles": 3,
       "findings_count": { "blocking": {remaining}, "warning": {remaining}, "info": {count} },
       "remaining_blocking_findings": [
         "B-005: {description of unresolved finding}"
       ]
     }
  3. Move file from files_remaining to files_completed
  4. Log warning in state.json history:
     "File {file_path} accepted with MAX_ITERATIONS after 3 cycles.
      {N} BLOCKING finding(s) remain. Will receive extra scrutiny in Phase 16/08."
  5. Proceed to next file
```

### Downstream impact

- Phase 16 (Final Sweep): MAX_ITERATIONS files get automated code review (QL-010) with explicit attention to remaining findings
- Phase 08 (Human Review): MAX_ITERATIONS files are reviewed at full scope (not reduced)
- per-file-loop-summary.md: Lists MAX_ITERATIONS files in "Files Requiring Extra Scrutiny" section

---

## 3. Sub-Agent Errors (AC-007-03)

### 3.1 Writer Errors

| Error | Detection | Handling | State Update |
|-------|----------|---------|-------------|
| Writer produces no files after delegation | Writer returns without FILE_PRODUCED announcement | Log warning, set implementation_loop_state.status = "completed" with summary.total_files = 0. Proceed to Phase 16. | history: "Writer produced no files. Per-file loop skipped." |
| Writer produces a file that does not exist on disk | Orchestrator tries to verify file exists before Reviewer delegation | Skip file, add to per_file_reviews with verdict "ERROR", log warning. Proceed to next file. | per_file_reviews[].verdict = "ERROR" |
| Writer produces same file twice | Orchestrator checks files_completed before delegation | Skip duplicate, log info. Do not re-review. | No state change |
| Writer crashes mid-file | Task tool returns error or timeout | Log error, mark current_file as "ERROR". Proceed to next file if possible. | implementation_loop_state.current_file = null |
| Writer announces ALL_FILES_COMPLETE prematurely | Fewer files than task plan expected | Accept as complete (orchestrator cannot force Writer to produce more files). Log info. | summary.total_files reflects actual count |

### 3.2 Reviewer Errors

| Error | Detection | Handling | State Update |
|-------|----------|---------|-------------|
| Reviewer output unparseable | Cannot extract "Verdict: PASS" or "Verdict: REVISE" from output | Treat as PASS (fail-open, Article X). Log warning: "Reviewer output malformed, treating as PASS." | per_file_reviews[].verdict = "PASS" (with note) |
| Reviewer cannot read file | File deleted or moved between Writer and Reviewer delegation | Skip file with verdict "ERROR". Log warning. | per_file_reviews[].verdict = "ERROR" |
| Reviewer times out | Task tool timeout | Treat as PASS (fail-open). Log warning. | per_file_reviews[].verdict = "PASS" (with note) |
| Reviewer always returns REVISE | Same BLOCKING findings persist across all cycles | Max 3 cycles, then MAX_ITERATIONS acceptance. | per_file_reviews[].verdict = "MAX_ITERATIONS" |
| Reviewer returns new BLOCKING findings each cycle | Each Updater fix triggers new findings | Same max 3 cycles limit applies. New findings are expected as Updater changes may introduce issues. | Normal cycle_history tracking |

### 3.3 Updater Errors

| Error | Detection | Handling | State Update |
|-------|----------|---------|-------------|
| Updater fails to return update report | Task returns but output does not contain "# Update Report" | Log warning. Proceed to Reviewer re-review anyway. Reviewer will verify if fixes were applied. | cycle_history entry with updater_actions = null |
| Updater crashes or times out | Task tool error/timeout | Log error. Treat cycle as complete. Proceed to Reviewer re-review (Reviewer will see unmodified file). | cycle_history notes error |
| Updater modifies wrong file | Updater changes a file other than file_path | Not detectable by orchestrator (prompt-level constraint only). Reviewer re-review catches: original file unchanged, BLOCKING findings persist. | Normal flow (Reviewer catches) |
| Updater introduces new defect | Updater fix breaks something | Reviewer catches in re-review cycle. New BLOCKING finding added. Max cycle limit prevents infinite loop. | New findings in cycle_history |
| Updater disputes all findings | All BLOCKING findings disputed | Reviewer re-evaluates in next cycle. If Reviewer re-flags them, Updater must fix or max cycles reached. | disputes array in per_file_reviews |

---

## 4. File Ordering Edge Cases (AC-003-07)

### 4.1 Dependency-Aware Ordering for TDD

The task plan (tasks.md) defines file ordering with dependencies. The orchestrator instructs the Writer to follow this order. Edge cases:

| Scenario | Handling |
|----------|---------|
| Task plan specifies explicit ordering (T0025 before T0027) | Writer follows task plan order. TDD pairing within each task: test file first, production file second. |
| Task plan has parallel tiers (T0025, T0026, T0028 all in Tier 1) | Writer picks any order within the tier. TDD pairing still applies per file pair. |
| Task plan does not specify file ordering | Fallback: test files before production files, foundation/utility before dependent, alphabetical within each group. |
| Writer produces files in wrong order | Orchestrator reviews each file as produced, regardless of expected order. Order mismatch is logged as INFO, not blocked. |
| Circular dependency between files | Not expected in practice (TDD pairs are linear). If detected, orchestrator breaks cycle by reviewing whichever file exists first. |

### 4.2 File Type Determination

The Reviewer needs to determine file type for category applicability (M1 Section 8). Detection:

```
*.test.cjs, *.test.js, *.spec.* -> Test file
*.md in src/claude/agents/ -> Markdown agent
*.json in config/ or hooks/config/ -> JSON config
*.yaml, *.yml -> YAML config
All other *.js, *.cjs, *.mjs -> Production code
```

Edge cases:
| Scenario | Handling |
|----------|---------|
| Unknown file extension | Treat as production code (most restrictive checks apply) |
| File in unexpected directory | Use extension-based detection, not directory |
| Empty file (0 bytes) | Reviewer reports: "File is empty. Verdict: PASS (nothing to review)." |
| Binary file | Reviewer reports: "Binary file, not reviewable. Verdict: PASS." |

---

## 5. Backward Compatibility Matrix (NFR-002)

### 5.1 Invariant: debate_mode == false

When `debate_mode == false` (via --no-debate flag, light sizing, or explicit override):

| Component | Expected Behavior | Verification Method |
|-----------|------------------|---------------------|
| `05-software-developer.md` | No WRITER_CONTEXT injected. Standard single-agent behavior. | Test: delegate without WRITER_CONTEXT, verify standard output |
| `00-sdlc-orchestrator.md` | Phase 06 delegates to software-developer only. No Reviewer, no Updater. No implementation_loop_state created. | Test: debate_mode=false, verify single delegation |
| `16-quality-loop-engineer.md` | No implementation_loop_state in state -> full scope. All Track A + Track B checks. | Test: missing state field, verify full checklist |
| `07-qa-engineer.md` | No implementation_loop_state in state -> full scope. All review checks. | Test: missing state field, verify full checklist |
| `05-implementation-reviewer.md` | Never invoked. | Test: debate_mode=false, Reviewer not delegated to |
| `05-implementation-updater.md` | Never invoked. | Test: debate_mode=false, Updater not delegated to |

### 5.2 Invariant: Existing Debate Tests Pass

The 264 existing debate tests (90 REQ-0014 + 87 REQ-0015 + 87 REQ-0016) must continue to pass:

| Test Suite | What It Tests | Why It Should Still Pass |
|-----------|--------------|------------------------|
| debate-requirements-*.test.cjs | Phase 01 Creator/Critic/Refiner | DEBATE_ROUTING unchanged, Section 7.5 unmodified |
| debate-architecture-*.test.cjs | Phase 03 Creator/Critic/Refiner | DEBATE_ROUTING unchanged, Section 7.5 unmodified |
| debate-design-*.test.cjs | Phase 04 Creator/Critic/Refiner | DEBATE_ROUTING unchanged, Section 7.5 unmodified |

### 5.3 Invariant: state.json Schema

The `implementation_loop_state` field is **additive**:
- It is only created when Phase 06 starts with debate_mode=true
- It does not modify or remove existing state.json fields
- Existing state.json workflows that never had debate_mode=true will never see this field
- No migration is required

---

## 6. Performance Considerations (NFR-001)

### Per-File Overhead Budget

Each file in the per-file loop incurs:

| Step | Estimated Time | Notes |
|------|---------------|-------|
| Reviewer delegation (Task tool call) | 5-15s | Depends on file size and LLM response time |
| Reviewer review (8 categories) | 5-10s | LLM processing time |
| Orchestrator verdict processing | <1s | JSON parsing, state update |
| Updater delegation (if REVISE) | 5-10s | Only when needed |
| Updater fix + test re-run | 5-15s | Depends on fix complexity and test duration |
| Re-review (if Updater ran) | 5-10s | Reviewer re-check |

**Total per file:** 10-50s depending on verdict
- PASS on first review: ~10-25s
- REVISE with 1 fix cycle: ~25-50s
- MAX_ITERATIONS (3 cycles): ~75-150s (rare)

**AC-NFR-001 compliance:** The per-file review MUST NOT add more than 30s overhead for the common case (PASS on first review). The 10-25s estimate for PASS is within budget. The 25-50s for REVISE is acceptable because the fix happens immediately rather than being deferred to Phase 16/08.

**Net time impact:** The per-file loop adds ~10-25s per file to Phase 06. However, Phase 16 and Phase 08 run in reduced scope, saving time that would have been spent on individual file review. Net time should be approximately neutral or slightly positive.

---

## 7. Observability (NFR-004)

Every per-file review cycle is logged to state.json:

```json
{
  "per_file_reviews": [
    {
      "file": "src/widget.js",
      "verdict": "PASS",
      "cycles": 2,
      "findings_count": { "blocking": 0, "warning": 1, "info": 0 },
      "cycle_history": [
        {
          "cycle": 1,
          "verdict": "REVISE",
          "blocking": 2,
          "warning": 1,
          "timestamp": "2026-02-15T10:35:00Z"
        },
        {
          "cycle": 2,
          "verdict": "PASS",
          "blocking": 0,
          "warning": 0,
          "timestamp": "2026-02-15T10:38:00Z"
        }
      ]
    }
  ]
}
```

The orchestrator can read `implementation_loop_state` at any time to report:
- Which file is currently being reviewed
- How many files are done vs remaining
- How many cycles the current file has been through
- Overall progress percentage

---

## 8. Consistency with Prior Debate Teams (NFR-003)

| Convention | Prior Pattern (REQ-0014/0015/0016) | This Feature (REQ-0017) | Consistent? |
|-----------|----------------------------------|------------------------|-------------|
| Agent file naming | `{NN}-{role}.md` (01-requirements-critic.md) | `05-implementation-reviewer.md`, `05-implementation-updater.md` | Yes |
| Test file naming | `debate-{domain}-{role}.test.cjs` | `implementation-debate-{role}.test.cjs` | Yes |
| resolveDebateMode() | Shared function in Section 7.5 | Reused, not duplicated | Yes |
| debate_mode flag | `active_workflow.debate_mode` | Same field, same semantics | Yes |
| --debate/--no-debate flags | CLI flags parsed by isdlc.md | Same flags, same parsing | Yes |
| State tracking | `debate_state` for per-artifact loop | `implementation_loop_state` for per-file loop (separate key) | Yes (separate but parallel) |
| Convergence criteria | blocking_count == 0 across all artifacts | verdict == PASS per file | Yes (different but analogous) |
| Max iterations | 3 rounds (entire artifact set) | 3 cycles per file | Yes |
| Structured output | B-NNN/W-NNN findings format | Same format | Yes |

---

## 9. AC Coverage Matrix

| AC / NFR | Design Element | Section |
|----------|---------------|---------|
| AC-003-05 | Max 3 cycles per file, then accept with MAX_ITERATIONS | 2 |
| AC-007-01 | Sub-agents as separate Task invocations | (Covered in M3) |
| AC-007-02 | Orchestrator maintains state, not sub-agents | (Covered in M3) |
| AC-007-03 | Error handling: retry, skip with warning, or escalate | 3 |
| NFR-001 | <=30s per file overhead, net-neutral via reduced Phase 16/08 | 6 |
| NFR-002 | debate_mode=false -> unchanged behavior, existing tests pass | 5 |
| NFR-003 | Agent naming, test naming, resolveDebateMode() reuse | 8 |
| NFR-004 | Per-file review logged to state.json with timestamps | 7 |
