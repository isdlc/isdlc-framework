# Error Taxonomy: Multi-Agent Implementation Team

**Feature:** REQ-0017-multi-agent-implementation-team
**Phase:** 04-design
**Created:** 2026-02-15

---

## 1. Error Code Format

All error codes follow the pattern: `IMPL-{NNN}` where NNN is a sequential number.

Errors are grouped by origin:
- `IMPL-1xx`: Orchestrator / routing errors
- `IMPL-2xx`: Writer errors
- `IMPL-3xx`: Reviewer errors
- `IMPL-4xx`: Updater errors
- `IMPL-5xx`: State / data errors
- `IMPL-6xx`: Phase 16/08 scope errors

---

## 2. Error Catalog

### IMPL-1xx: Orchestrator / Routing Errors

| Code | Name | Description | Severity | Handling | Article |
|------|------|-------------|----------|---------|---------|
| IMPL-100 | ROUTING_NOT_FOUND | current_phase not found in IMPLEMENTATION_ROUTING | INFO | Fall through to DEBATE_ROUTING or standard delegation | X |
| IMPL-101 | DEBATE_MODE_RESOLUTION_FAILED | Cannot resolve debate_mode from flags/sizing | WARN | Default to debate_mode=true (per Section 7.5) | X |
| IMPL-102 | LOOP_STATE_INIT_FAILED | Cannot write implementation_loop_state to state.json | ERROR | Log error, fall back to single-agent delegation | X |
| IMPL-103 | WRITER_DELEGATION_FAILED | Task tool failed to delegate to Writer | ERROR | Log error, set status="aborted", proceed to Phase 16 | X |
| IMPL-104 | REVIEWER_DELEGATION_FAILED | Task tool failed to delegate to Reviewer | ERROR | Skip file with verdict="ERROR", proceed to next file | X |
| IMPL-105 | UPDATER_DELEGATION_FAILED | Task tool failed to delegate to Updater | ERROR | Log error, proceed to Reviewer re-review (Reviewer sees unmodified file) | X |
| IMPL-106 | MAX_ITERATIONS_REACHED | File did not pass after max_cycles Reviewer-Updater cycles | WARN | Accept with MAX_ITERATIONS verdict, log warning | AC-003-05 |
| IMPL-107 | ALL_FILES_COMPLETE_PREMATURE | Writer announced ALL_FILES_COMPLETE before expected file count | INFO | Accept as complete, log info | X |
| IMPL-108 | LOOP_RE_ENTRY | implementation_loop_state already exists on Phase 06 start | INFO | Resume from last incomplete file | XVI |

### IMPL-2xx: Writer Errors

| Code | Name | Description | Severity | Handling | Article |
|------|------|-------------|----------|---------|---------|
| IMPL-200 | WRITER_NO_FILES | Writer returned without producing any files | WARN | Set status="completed" with total_files=0, proceed to Phase 16 | X |
| IMPL-201 | WRITER_FILE_NOT_FOUND | Writer announced a file path that does not exist on disk | WARN | Skip file with verdict="ERROR", proceed to next | X |
| IMPL-202 | WRITER_DUPLICATE_FILE | Writer produced the same file path twice | INFO | Skip duplicate, do not re-review | - |
| IMPL-203 | WRITER_CONTEXT_MISSING | Writer invoked without WRITER_CONTEXT (should not happen in loop) | WARN | Writer operates in standard mode (backward compat) | AC-004-02 |
| IMPL-204 | WRITER_CRASH | Writer agent crashed or timed out mid-file | ERROR | Log error, mark file as ERROR, proceed to next | X |
| IMPL-205 | WRITER_TDD_ORDER_VIOLATION | Writer produced production file before test file | INFO | Review in produced order (not blocked, just logged) | AC-004-03 |

### IMPL-3xx: Reviewer Errors

| Code | Name | Description | Severity | Handling | Article |
|------|------|-------------|----------|---------|---------|
| IMPL-300 | REVIEWER_OUTPUT_MALFORMED | Cannot parse verdict (PASS/REVISE) from Reviewer output | WARN | Treat as PASS (fail-open), log warning | X |
| IMPL-301 | REVIEWER_FILE_UNREADABLE | Reviewer cannot read the file under review | ERROR | Skip file with verdict="ERROR" | X |
| IMPL-302 | REVIEWER_TIMEOUT | Reviewer agent timed out | WARN | Treat as PASS (fail-open), log warning | X |
| IMPL-303 | REVIEWER_STUCK_REVISE | Reviewer returns REVISE on all cycles (bounded by max_cycles) | WARN | MAX_ITERATIONS acceptance after 3 cycles | AC-003-05 |
| IMPL-304 | REVIEWER_COUNTS_MISMATCH | Summary counts do not match actual findings in output | INFO | Use actual findings (parsed), not summary counts | IC-08 |
| IMPL-305 | REVIEWER_MISSING_CATEGORY | Reviewer skipped an applicable check category | INFO | Logged but not blocked (self-check IC-08 should catch) | IC-08 |

### IMPL-4xx: Updater Errors

| Code | Name | Description | Severity | Handling | Article |
|------|------|-------------|----------|---------|---------|
| IMPL-400 | UPDATER_REPORT_MISSING | Updater did not produce an update report | WARN | Proceed to Reviewer re-review without report confirmation | X |
| IMPL-401 | UPDATER_CRASH | Updater crashed or timed out | ERROR | Log error, proceed to Reviewer re-review (file unchanged) | X |
| IMPL-402 | UPDATER_SCOPE_CREEP | Updater modified files other than the file under review | WARN | Not detectable by orchestrator; Reviewer catches via re-review | AC-002-06 |
| IMPL-403 | UPDATER_DISPUTE_TOO_SHORT | Dispute rationale is less than 20 characters | WARN | Dispute rejected; finding counts as unaddressed | AC-002-05 |
| IMPL-404 | UPDATER_TESTS_FAILED | Tests failed after Updater's fixes | WARN | Noted in update report; Reviewer re-reviews | AC-002-03 |
| IMPL-405 | UPDATER_NEW_DEFECT | Updater fix introduced a new issue caught by Reviewer | INFO | Normal flow -- Reviewer flags new issue in next cycle | AC-002-06 |

### IMPL-5xx: State / Data Errors

| Code | Name | Description | Severity | Handling | Article |
|------|------|-------------|----------|---------|---------|
| IMPL-500 | STATE_READ_FAILED | Cannot read state.json | ERROR | Fall back to single-agent delegation (no per-file loop) | X |
| IMPL-501 | STATE_WRITE_FAILED | Cannot write to state.json during loop | ERROR | Retry once; if still fails, log and continue without state update | XVI |
| IMPL-502 | STATE_CORRUPTED | implementation_loop_state has invalid structure | WARN | Re-initialize from files_completed on disk, resume | XVI |
| IMPL-503 | STATE_LOOP_ABSENT | Downstream agent checks implementation_loop_state but it is absent | INFO | Full scope mode (default behavior) | X |

### IMPL-6xx: Phase 16/08 Scope Errors

| Code | Name | Description | Severity | Handling | Article |
|------|------|-------------|----------|---------|---------|
| IMPL-600 | SCOPE_DETECTION_FAILED | Cannot determine implementation team scope in Phase 16/08 | WARN | Default to full scope (fail-safe) | X |
| IMPL-601 | SCOPE_STATE_INCOMPLETE | implementation_loop_state exists but status != "completed" | INFO | Full scope mode (loop may have been aborted) | X |

---

## 3. Severity Definitions

| Severity | Meaning | User Impact | Action Required |
|----------|---------|-------------|-----------------|
| ERROR | Operation failed, requires fallback | Degraded functionality (e.g., per-file loop disabled) | Automatic fallback + state.json history log |
| WARN | Unexpected condition, handled gracefully | No user impact (handled internally) | state.json history log |
| INFO | Normal but noteworthy condition | No user impact | state.json history log (optional) |

---

## 4. Error Response Format

All errors are logged to `state.json -> history[]`:

```json
{
  "timestamp": "ISO-8601",
  "agent": "sdlc-orchestrator",
  "action": "IMPL-{NNN}: {name} -- {description}. Handling: {action taken}."
}
```

Errors do NOT produce user-facing error messages. The orchestrator handles all errors internally and logs to state.json. The user sees the per-file-loop-summary.md at the end, which reports any files with ERROR or MAX_ITERATIONS verdicts.

---

## 5. Traceability

| Error Range | Module | FR/NFR |
|-------------|--------|--------|
| IMPL-1xx | M3 (Orchestrator routing) | FR-003, FR-006, FR-007 |
| IMPL-2xx | M4 (Writer awareness) | FR-004 |
| IMPL-3xx | M1 (Reviewer) | FR-001 |
| IMPL-4xx | M2 (Updater) | FR-002 |
| IMPL-5xx | M3 (State management) | NFR-004, Article XVI |
| IMPL-6xx | M5 (Phase 16/08 scope) | FR-005, NFR-002 |
