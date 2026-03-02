# Module Design M3: IMPLEMENTATION_ROUTING and Loop Orchestration

**Module:** Orchestrator Section 7.6 addition to `00-sdlc-orchestrator.md`
**Type:** Modified agent (markdown prompt addition)
**Location:** `src/claude/agents/00-sdlc-orchestrator.md` (after Section 7.5, before Section 8)
**Traces:** FR-003 (AC-003-01..AC-003-07), FR-006 (AC-006-01..AC-006-04), FR-007 (AC-007-01..AC-007-03)
**Phase:** 04-design (REQ-0017)

---

## 1. Module Purpose

Add a new Section 7.6 "IMPLEMENTATION LOOP ORCHESTRATION" to the SDLC orchestrator. This section defines the IMPLEMENTATION_ROUTING table and the per-file Writer/Reviewer/Updater loop protocol. It is placed after Section 7.5 (DEBATE LOOP ORCHESTRATION) and before Section 8 (Phase Gate Validation).

The IMPLEMENTATION_ROUTING is intentionally SEPARATE from DEBATE_ROUTING (AC-006-03, ADR-0001) because the loop pattern is fundamentally different: per-file granularity vs per-artifact rounds.

## 2. Section Structure

The new section follows the same structural pattern as Section 7.5 (DEBATE LOOP ORCHESTRATION):

```
## 7.6 IMPLEMENTATION LOOP ORCHESTRATION (Per-File)
  ### Implementation Agent Routing Table
  ### Step 1: Resolve Debate Mode (reuse from 7.5)
  ### Step 2: Initialize implementation_loop_state
  ### Step 3: Writer Delegation (First Call)
  ### Step 4: Per-File Loop
    #### 4a: Reviewer Review
    #### 4b: Verdict Processing
    #### 4c: Updater Fix (if REVISE)
  ### Step 5: Post-Loop Finalization
  ### Edge Cases
```

## 3. IMPLEMENTATION_ROUTING Table (AC-006-01, AC-006-03)

```
IMPLEMENTATION_ROUTING:

| Phase Key         | Writer Agent              | Reviewer Agent                   | Updater Agent                   | Max Cycles/File |
|-------------------|---------------------------|----------------------------------|---------------------------------|-----------------|
| 06-implementation | 05-software-developer.md  | 05-implementation-reviewer.md    | 05-implementation-updater.md    | 3               |
```

**Lookup logic:**
```
IF current_phase IN IMPLEMENTATION_ROUTING AND debate_mode == true:
  Use per-file loop protocol (Section 7.6 Steps 2-6)
IF current_phase IN IMPLEMENTATION_ROUTING AND debate_mode == false:
  Delegate to Writer agent only (no WRITER_CONTEXT, no per-file loop) -- AC-006-04
ELSE:
  Fall through to DEBATE_ROUTING (Section 7.5) or standard delegation
```

**Design note:** The table has one entry today (Phase 06). It uses a table structure (not a hardcoded phase check) for future extensibility, following the same pattern as DEBATE_ROUTING. Per Article V, no additional abstraction is added.

## 4. Step-by-Step Protocol

### Step 1: Resolve Debate Mode (Reuse from Section 7.5)

```
debate_mode = resolveDebateMode()   // Same function as Section 7.5, NFR-003
```

This is the SAME function defined in Section 7.5 Step 1. It reads flags (--debate/--no-debate) and sizing (light/standard/epic) to determine debate mode. No duplication -- Section 7.6 references Section 7.5's resolveDebateMode().

**State write:**
- `active_workflow.debate_mode = {resolved value}` (if not already written by Section 7.5 for earlier phases)

### Step 2: Initialize implementation_loop_state (AC-006-02, AC-007-02)

If `debate_mode == true` and `current_phase IN IMPLEMENTATION_ROUTING`:

```json
active_workflow.implementation_loop_state = {
  "phase": "06-implementation",
  "status": "in_progress",
  "started_at": "{ISO-8601 timestamp}",
  "completed_at": null,
  "total_files_planned": null,
  "files_completed": [],
  "files_remaining": [],
  "current_file": null,
  "current_cycle": null,
  "per_file_reviews": [],
  "summary": null
}
```

Write to state.json immediately. The orchestrator owns this state (AC-007-02) -- sub-agents do not write to it.

**Re-entry handling:** If `implementation_loop_state` already exists AND `status == "in_progress"`:
- Resume from last incomplete file (the file in `current_file` that does not appear in `files_completed`)
- Do not re-initialize -- preserve existing per_file_reviews

### Step 3: Writer Delegation -- First Call (AC-004-01, AC-007-01)

Delegate to the Writer agent (IMPLEMENTATION_ROUTING.writer) with WRITER_CONTEXT:

```
WRITER_CONTEXT:
  mode: writer
  per_file_loop: true
  tdd_ordering: true

{Feature description from user}
{Design specifications from Phase 04}
{Test strategy from Phase 05}
{Task plan from tasks.md -- file ordering for implementation}

Produce ONE file at a time. After writing each file, announce the file path
and STOP. Wait for the review cycle to complete before proceeding to the next file.

TDD ordering: write the test file FIRST, then the production file.
Both files are reviewed individually in that order.
```

The Writer produces a single file (or reports its path if already written) and returns control to the orchestrator.

**Orchestrator actions after Writer returns:**
1. Extract file path from Writer's output
2. Update `implementation_loop_state`:
   - `current_file = {file_path}`
   - `current_cycle = 1`
   - Add to `files_remaining` if not already present
3. Proceed to Step 4

### Step 4: Per-File Loop (AC-003-01 through AC-003-05)

For each file the Writer produces:

#### 4a: Reviewer Review (AC-003-01)

Delegate to Reviewer (IMPLEMENTATION_ROUTING.reviewer) with REVIEW_CONTEXT:

```
REVIEW_CONTEXT:
  file_path: {path to file}
  file_number: {N} of {total_files_planned or "unknown"}
  cycle: {current_cycle}
  tech_stack: {from state.json project.tech_stack}
  constitution_path: {from state.json constitution.path}

Review this file against 8 mandatory check categories.
Produce structured output with verdict: PASS or REVISE.
```

After Reviewer returns:
1. Parse the Reviewer's output for the verdict (PASS or REVISE)
2. Parse BLOCKING count, WARNING count, INFO count from Summary section
3. Record in `per_file_reviews`:
   ```json
   {
     "file": "{file_path}",
     "verdict": "{PASS|REVISE}",
     "cycles": {current_cycle},
     "findings_count": {
       "blocking": {count},
       "warning": {count},
       "info": {count}
     },
     "cycle_history": [
       {
         "cycle": {current_cycle},
         "verdict": "{PASS|REVISE}",
         "blocking": {count},
         "warning": {count},
         "timestamp": "{ISO-8601}"
       }
     ]
   }
   ```
4. Update state.json

#### 4b: Verdict Processing

```
IF verdict == PASS:                                           -- AC-003-02
  Move file from files_remaining to files_completed
  Set current_file = null
  Proceed to next file (delegate back to Writer -- Step 3)

IF verdict == REVISE AND current_cycle < max_cycles:          -- AC-003-03
  Proceed to Step 4c (Updater)

IF verdict == REVISE AND current_cycle >= max_cycles:          -- AC-003-05
  Accept file with [MAX_ITERATIONS] warning
  Update per_file_reviews: verdict = "MAX_ITERATIONS"
  Move file from files_remaining to files_completed
  Set current_file = null
  Log warning in state.json history:
    "File {file_path} accepted with MAX_ITERATIONS warning after {max_cycles} cycles.
     {blocking_count} BLOCKING finding(s) remain."
  Proceed to next file
```

#### 4c: Updater Fix (AC-003-03, AC-003-04)

Delegate to Updater (IMPLEMENTATION_ROUTING.updater) with UPDATE_CONTEXT:

```
UPDATE_CONTEXT:
  file_path: {path to file}
  cycle: {current_cycle}
  reviewer_verdict: REVISE
  findings:
    blocking: [{findings from Reviewer}]
    warning: [{findings from Reviewer}]

Address ALL BLOCKING findings. Re-run tests after fixes.
Produce an update report with each finding's disposition.
```

After Updater returns:
1. Parse the update report for actions taken (fixed/deferred/disputed)
2. Update `per_file_reviews` with updater_actions in cycle_history
3. Record any deferred_warnings and disputes
4. Increment `current_cycle`
5. Delegate back to Reviewer (Step 4a) for re-review -- AC-003-04

### Step 5: Post-Loop Finalization (AC-003-06)

When all files are processed (all files in `files_completed`, `files_remaining` is empty):

1. Update `implementation_loop_state`:
   ```json
   {
     "status": "completed",
     "completed_at": "{ISO-8601}",
     "summary": {
       "total_files": {count of files_completed},
       "passed_first_review": {count where cycles == 1},
       "required_revision": {count where cycles > 1},
       "average_cycles": {mean of all files' cycle counts},
       "max_iterations_warnings": {count where verdict == "MAX_ITERATIONS"}
     }
   }
   ```

2. Generate `per-file-loop-summary.md` in the artifact folder:

```markdown
# Per-File Loop Summary

**Phase:** 06-implementation
**Completed At:** {ISO-8601}
**Debate Mode:** true (per-file implementation loop)

## Metrics

| Metric | Value |
|--------|-------|
| Total Files | {N} |
| Passed First Review | {N} ({pct}%) |
| Required Revision | {N} |
| Average Cycles | {X.Y} |
| MAX_ITERATIONS Warnings | {N} |

## Per-File Details

| # | File | Verdict | Cycles | BLOCKING Found | BLOCKING Resolved | Deferred | Disputed |
|---|------|---------|--------|----------------|-------------------|----------|----------|
| 1 | tests/widget.test.cjs | PASS | 1 | 0 | 0 | 0 | 0 |
| 2 | src/widget.js | PASS | 2 | 3 | 3 | 0 | 0 |
| 3 | src/complex.js | MAX_ITERATIONS | 3 | 1 | 2 | 1 | 0 |

## Files Requiring Extra Scrutiny in Phase 16

{List any files with verdict == MAX_ITERATIONS. These should get additional
attention during Phase 16 batch quality checks.}
```

3. Write state.json with final implementation_loop_state
4. Log completion in state.json history
5. Proceed to phase gate validation (Section 8)

## 5. File Ordering Protocol (AC-003-07)

The orchestrator determines file processing order:

**Primary ordering:** Task plan order from `tasks.md`. The implementation tasks (T0025..T0030) define a dependency-aware file ordering.

**TDD pairing rule (AC-004-03):** When a production file and its test file are both in the plan:
- Test file is reviewed FIRST
- Production file is reviewed SECOND
- Both reviewed individually (separate REVIEW_CONTEXT calls)

**Fallback ordering (if task plan does not specify explicit order):**
1. Test files before production files
2. Foundation/utility files before dependent files
3. Alphabetical within each group

**The Writer controls actual file production order.** The orchestrator does not force ordering -- it relies on WRITER_CONTEXT instructing the Writer to follow task plan order with TDD pairing. If the Writer produces files out of order, the orchestrator still reviews each file as produced.

## 6. Writer Re-delegation Protocol

After a file passes review (or MAX_ITERATIONS), the orchestrator re-delegates to the Writer:

```
WRITER_CONTEXT:
  mode: writer
  per_file_loop: true
  tdd_ordering: true
  files_completed: [{list of completed files}]
  current_file_number: {N+1}

Continue implementation. The following files have been completed and reviewed:
{list of completed files with verdicts}

Produce the NEXT file according to the task plan.
If all files are complete, announce "ALL_FILES_COMPLETE".
```

**ALL_FILES_COMPLETE detection:** When the Writer announces all files are done (or the task plan's file list is fully covered), the orchestrator proceeds to Step 5 (Post-Loop Finalization).

## 7. Sub-Agent Error Handling (AC-007-03)

| Error | Handling | Rationale |
|-------|---------|-----------|
| Writer produces no files | Log warning, set status="completed" with 0 files, proceed to Phase 16 | Fail-open per Article X |
| Writer produces a file path that does not exist on disk | Skip file with WARNING in per_file_reviews, proceed to next file | Defensive; cannot review non-existent file |
| Reviewer output unparseable (cannot extract verdict) | Treat as PASS (fail-open per Article X); log warning | Prevents infinite stuck loop |
| Reviewer always returns REVISE | Max 3 cycles per file, then accept with MAX_ITERATIONS (AC-003-05) | Bounded iteration |
| Updater fails to return update report | Log warning, proceed to Reviewer re-review without update confirmation | Best-effort; Reviewer catches remaining issues |
| Updater crashes or times out | Log error, treat current cycle as complete, proceed to Reviewer re-review | Fail-open |
| Task tool delegation fails | Log error to state.json history, skip file with [ERROR] tag, proceed to next file | Article X: fail-safe |

## 8. Interaction with DEBATE_ROUTING (Section 7.5)

```
Phase Resolution Order:
  1. Check IMPLEMENTATION_ROUTING first (Section 7.6)
  2. If not found, check DEBATE_ROUTING (Section 7.5)
  3. If not found, use standard single-agent delegation

Phase 06 is ONLY in IMPLEMENTATION_ROUTING.
Phases 01/03/04 are ONLY in DEBATE_ROUTING.
No phase appears in both tables.
```

Both routing mechanisms share:
- `resolveDebateMode()` function
- `debate_mode` flag in state.json
- Same CLI flags (--debate/--no-debate)

Both routing mechanisms have separate:
- Loop protocol (per-artifact rounds vs per-file cycles)
- State tracking (debate_state vs implementation_loop_state)
- Convergence criteria (blocking_count==0 vs verdict==PASS)
- Agent roles (Creator/Critic/Refiner vs Writer/Reviewer/Updater)

## 9. Estimated Change to Orchestrator

**Lines added:** ~150-200 lines in Section 7.6
**Insertion point:** After line ~1212 (end of Section 7.5), before Section 8 (Phase Gate Validation)
**No lines modified** in Section 7.5 -- the new section is entirely additive

## 10. AC Coverage Matrix

| AC | Design Element | Section |
|----|---------------|---------|
| AC-003-01 | Reviewer delegated per file before Writer proceeds to next | 4 (Step 4a) |
| AC-003-02 | Verdict PASS -> proceed to next file | 4 (Step 4b) |
| AC-003-03 | Verdict REVISE -> delegate to Updater | 4 (Step 4b, 4c) |
| AC-003-04 | After Updater, delegate back to Reviewer | 4 (Step 4c, last line) |
| AC-003-05 | Max 3 cycles -> accept with MAX_ITERATIONS warning | 4 (Step 4b, third condition) |
| AC-003-06 | per-file-loop-summary.md with metrics | 5 (Step 5) |
| AC-003-07 | Files processed in task plan order, test files with production | 5 |
| AC-006-01 | Writer->05-software-developer, Reviewer->05-implementation-reviewer, Updater->05-implementation-updater | 3 |
| AC-006-02 | implementation_loop_state created in active_workflow | 4 (Step 2) |
| AC-006-03 | SEPARATE from DEBATE_ROUTING | 3, 8 |
| AC-006-04 | debate_mode==false -> single-agent as today | 3 (Lookup logic) |
| AC-007-01 | Writer/Reviewer/Updater as separate Task invocations | 4 (Steps 3, 4a, 4c) |
| AC-007-02 | Orchestrator maintains implementation_loop_state (not sub-agents) | 4 (Step 2, note) |
| AC-007-03 | Error handling: retry, skip with warning, or escalate | 7 |
