# Architecture Overview: Multi-Agent Implementation Team

**Feature:** REQ-0017-multi-agent-implementation-team
**Phase:** 03-architecture
**Created:** 2026-02-15
**Status:** Accepted
**Prior Art:** REQ-0014 (Phase 01 debate loop), REQ-0015 (Phase 03 debate loop, generalized DEBATE_ROUTING), REQ-0016 (Phase 04 debate loop)

---

## 1. Architecture Approach

This feature introduces a **fundamentally different debate pattern** for Phase 06 (implementation). Unlike Phases 01/03/04 which use a per-artifact Creator/Critic/Refiner loop (one loop for all phase artifacts), Phase 06 requires a **per-file Writer/Reviewer/Updater loop** where each file is reviewed immediately after writing while context is hot.

**Key Architectural Constraint:** The IMPLEMENTATION_ROUTING mechanism is intentionally **SEPARATE** from DEBATE_ROUTING (AC-006-03) because:
1. The loop granularity is per-file (not per-artifact)
2. The roles are different (Writer/Reviewer/Updater, not Creator/Critic/Refiner)
3. The convergence criteria are per-file (Reviewer verdict PASS, not blocking-count == 0)
4. The orchestrator manages file sequencing, not artifact rounds

**No new runtime code, no new hooks, no new npm dependencies.** The two new agents are markdown prompt files. Modifications to existing agents are prompt-level changes. State tracking uses existing state.json patterns. (Article V: Simplicity First)

**Prior Art Summary:**
- REQ-0014 created the debate loop for Phase 01 (requirements) with Creator/Critic/Refiner
- REQ-0015 generalized Section 7.5 into DEBATE_ROUTING with multi-phase routing
- REQ-0016 extended DEBATE_ROUTING with Phase 04 entry
- REQ-0017 creates a NEW routing mechanism (IMPLEMENTATION_ROUTING) for the per-file pattern

| Existing Component | Extension | FR(s) |
|-------------------|-----------|-------|
| `00-sdlc-orchestrator.md` (after Section 7.5) | New Section 7.6: IMPLEMENTATION_ROUTING table + per-file loop protocol | FR-003, FR-006, FR-007 |
| `05-software-developer.md` | Add WRITER_CONTEXT Mode Detection section | FR-004 |
| `16-quality-loop-engineer.md` | Conditional "final sweep" scope when implementation team ran | FR-005 |
| `07-qa-engineer.md` | Conditional "human review only" scope when implementation team ran | FR-005 |
| `iteration-requirements.json` | Add entries for new reviewer/updater agents | NFR-004 |

| New Component | Type | FR(s) |
|--------------|------|-------|
| `05-implementation-reviewer.md` | New agent (markdown) | FR-001 |
| `05-implementation-updater.md` | New agent (markdown) | FR-002 |

---

## 2. System Context (C4 Level 1)

```
                         +-----------------------+
                         |      Developer         |
                         | (iSDLC User)           |
                         +----------+------------+
                                    |
                   /isdlc feature "description" [--debate|--no-debate]
                                    |
                         +----------v------------+
                         |    Claude Code CLI     |
                         | (CLAUDE.md loaded)     |
                         +----------+------------+
                                    |
                     Phase-Loop Controller (Task tool delegation)
                                    |
            +-----------------------v-----------------------+
            |              iSDLC Framework                   |
            |                                               |
            |  +------------------------------------------+ |
            |  | isdlc.md (command spec)                   | |
            |  |  - Parse --debate / --no-debate flags     | |
            |  |  - Pass debate config to orchestrator     | |
            |  +------------------------------------------+ |
            |                                               |
            |  +------------------------------------------+ |
            |  | 00-sdlc-orchestrator.md                   | |
            |  |  - Resolve debate_mode (flag > sizing)    | |
            |  |                                           | |
            |  |  Section 7.5: DEBATE_ROUTING              | |
            |  |    Phase 01: Creator/Critic/Refiner       | |
            |  |    Phase 03: Creator/Critic/Refiner       | |
            |  |    Phase 04: Creator/Critic/Refiner       | |
            |  |                                           | |
            |  |  Section 7.6: IMPLEMENTATION_ROUTING [NEW]| |
            |  |    Phase 06: Writer/Reviewer/Updater      | |
            |  |    Per-file loop protocol                 | |
            |  +------------------------------------------+ |
            |                                               |
            |  PHASE 01/03/04 DEBATE AGENTS:               |
            |  (Unchanged -- see REQ-0014/0015/0016)       |
            |                                               |
            |  PHASE 06 IMPLEMENTATION AGENTS:              |
            |  +------------------------------------------+ |
            |  | 05-software-developer.md (Writer) [MOD]   | |
            |  | 05-implementation-reviewer.md (Rev.) [NEW]| |
            |  | 05-implementation-updater.md (Upd.) [NEW] | |
            |  +------------------------------------------+ |
            |                                               |
            |  POST-LOOP PHASE AGENTS:                      |
            |  +------------------------------------------+ |
            |  | 16-quality-loop-engineer.md [MOD]         | |
            |  |  (conditional "final sweep" scope)        | |
            |  | 07-qa-engineer.md [MOD]                   | |
            |  |  (conditional "human review only" scope)  | |
            |  +------------------------------------------+ |
            |                                               |
            |  +---------------------+                      |
            |  | state.json          |                      |
            |  |  - debate_mode      |                      |
            |  |  - implementation_  |                      |
            |  |    loop_state       |                      |
            |  +---------------------+                      |
            +-----------------------------------------------+
```

---

## 3. Key Architectural Decisions Summary

| Decision | Choice | ADR |
|----------|--------|-----|
| IMPLEMENTATION_ROUTING as separate mechanism from DEBATE_ROUTING | Separate table and loop protocol in Section 7.6 | ADR-0001 |
| Per-file loop vs per-artifact loop for implementation review | Per-file loop: Writer->Reviewer->Updater cycle per file | ADR-0002 |
| Phase 16/08 conditional scope detection | Via `implementation_loop_state` presence in `active_workflow` of state.json | ADR-0003 |
| Agent naming for implementation team | `05-implementation-reviewer.md`, `05-implementation-updater.md` (prefix 05 matches software-developer numbering) | ADR-0004 |

---

## 4. Component Architecture

### 4.1 IMPLEMENTATION_ROUTING Table (FR-006, FR-007)

A new Section 7.6 in the orchestrator, placed AFTER Section 7.5 (DEBATE LOOP ORCHESTRATION) and BEFORE Section 8 (Phase Gate Validation).

**IMPLEMENTATION_ROUTING is NOT a row in DEBATE_ROUTING** (AC-006-03). It has a fundamentally different structure because:
- It maps a single phase to Writer/Reviewer/Updater (not Creator/Critic/Refiner)
- It describes a per-file loop (not a per-artifact debate loop)
- The convergence criteria are per-file verdict (not aggregate blocking count)
- The orchestrator manages file ordering from the task plan (not round-based iteration)

**IMPLEMENTATION_ROUTING:**

```
IMPLEMENTATION_ROUTING:

| Phase Key | Writer Agent | Reviewer Agent | Updater Agent | Max Cycles Per File |
|-----------|-------------|---------------|--------------|---------------------|
| 06-implementation | 05-software-developer.md | 05-implementation-reviewer.md | 05-implementation-updater.md | 3 |
```

**Lookup logic:**
- IF current_phase IN IMPLEMENTATION_ROUTING AND debate_mode == true:
  Use per-file loop protocol (Section 7.6 Steps 2-6)
- IF current_phase IN IMPLEMENTATION_ROUTING AND debate_mode == false:
  Delegate to Writer agent only (AC-006-04, no WRITER_CONTEXT, no per-file loop)
- ELSE: Fall through to DEBATE_ROUTING or standard delegation

**Design Note:** The table has only one entry today (Phase 06). It is designed as a table (not hardcoded phase check) for future extensibility -- if additional phases ever need per-file loops, they can be added as rows without changing the loop protocol. This follows the same extensibility pattern as DEBATE_ROUTING.

### 4.2 Per-File Loop Protocol (FR-003)

The orchestrator manages the per-file loop. It is the sole coordinator; Writer, Reviewer, and Updater are stateless sub-agents (AC-007-01, AC-007-02).

**Step 1: Resolve debate mode** (same resolveDebateMode() as Section 7.5, reusing NFR-003)

**Step 2: Initialize implementation_loop_state** (AC-006-02)
```json
{
  "implementation_loop_state": {
    "phase": "06-implementation",
    "status": "in_progress",
    "total_files_planned": null,
    "files_completed": [],
    "files_remaining": [],
    "current_file": null,
    "per_file_reviews": []
  }
}
```
Written to `active_workflow.implementation_loop_state` in state.json.

**Step 3: Writer delegation (first call)**
Delegate to Writer (05-software-developer.md) with WRITER_CONTEXT:
```
WRITER_CONTEXT:
  mode: writer
  per_file_loop: true

{Feature description, design specs, test strategy}

Produce ONE file at a time. After writing each file, announce the file path
and STOP. Wait for review before proceeding to the next file.
TDD ordering: test file FIRST, then production file. Both reviewed.
```

The Writer produces the file and reports its path. The orchestrator records it.

**Step 4: Reviewer delegation (per file)**
For each file produced by the Writer, delegate to Reviewer (05-implementation-reviewer.md):
```
REVIEW_CONTEXT:
  file_path: {path}
  file_number: {N} of {total}
  cycle: 1

Review this file against 8 check categories.
Produce structured output with verdict: PASS or REVISE.
```

**Step 5: Verdict processing**
- IF verdict == PASS (AC-003-02):
  Record in per_file_reviews, move file to files_completed, proceed to next file
- IF verdict == REVISE (AC-003-03):
  Delegate to Updater (Step 5b)
- IF cycle >= 3 and still REVISE (AC-003-05):
  Accept with [MAX_ITERATIONS] warning, move to files_completed, proceed

**Step 5b: Updater delegation**
Delegate to Updater (05-implementation-updater.md):
```
UPDATE_CONTEXT:
  file_path: {path}
  cycle: {N}
  findings: {BLOCKING and WARNING findings from Reviewer}

Address ALL BLOCKING findings. Re-run unit tests for this file.
Produce update report with finding ID, action taken, change made.
```

After Updater returns, delegate back to Reviewer (Step 4) with cycle incremented.

**Step 6: Post-loop finalization** (AC-003-06)
When all files are processed, generate `per-file-loop-summary.md`:
```markdown
# Per-File Loop Summary

| Metric | Value |
|--------|-------|
| Total Files | {N} |
| Passed First Review | {N} |
| Required Revision | {N} |
| Average Cycles | {X.Y} |
| MAX_ITERATIONS Warnings | {N} |

## Per-File Details

| File | Verdict | Cycles | BLOCKING Resolved | WARNING Resolved |
|------|---------|--------|-------------------|------------------|
| ... | PASS | 1 | 0 | 0 |
| ... | PASS | 2 | 3 | 1 |
```

### 4.3 Implementation Reviewer Agent (FR-001) -- New Agent

A new agent file `05-implementation-reviewer.md` that performs per-file code review with 8 mandatory check categories.

**Input:** File path, file content (read from disk), project tech stack (from state.json/constitution), REVIEW_CONTEXT from orchestrator.

**Output:** Structured review with verdict (PASS/REVISE), findings list.

**8 Per-File Check Categories (AC-001-01 through AC-001-07):**

| Check | Category | Applies To | BLOCKING Condition |
|-------|----------|-----------|-------------------|
| IC-01 | Logic correctness | Production code | Off-by-one, null/undefined, boundary, race conditions |
| IC-02 | Error handling | Production code | Missing try/catch, swallowed errors, bad propagation |
| IC-03 | Security | All files | Hardcoded secrets, injection, unsafe path ops, missing input validation |
| IC-04 | Code quality | All files | Naming violations, DRY violations, SRP violations, cyclomatic complexity >10 |
| IC-05 | Test quality | Test files | No meaningful assertions, missing edge cases, false positives, test interdependence |
| IC-06 | Tech-stack alignment | All files | Wrong module system (ESM vs CJS), wrong test runner, wrong patterns |
| IC-07 | Constitutional compliance | All files | Article I, II, V, VII violations |
| IC-08 | Structured output | Review output | Malformed review output (self-check) |

**Review Output Format (AC-001-08):**

```markdown
# Per-File Review: {file_path}

**Verdict:** PASS | REVISE
**Cycle:** {N}
**Reviewed At:** {ISO timestamp}

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | {X} |
| BLOCKING | {Y} |
| WARNING | {Z} |
| INFO | {W} |

## BLOCKING Findings

### B-001: {Short Title}
**Category:** {IC-01..IC-08}
**Line:** {line number or N/A}
**Issue:** {Specific description}
**Recommendation:** {Concrete fix}

## WARNING Findings
...

## INFO Findings
...
```

### 4.4 Implementation Updater Agent (FR-002) -- New Agent

A new agent file `05-implementation-updater.md` that applies targeted fixes to files flagged by the Reviewer.

**Input:** File path, Reviewer findings (BLOCKING + WARNING), UPDATE_CONTEXT from orchestrator.

**Output:** Fixed file + update report.

**Updater Protocol:**

| Step | Action | Traces To |
|------|--------|-----------|
| 1 | Read all BLOCKING findings | AC-002-01 |
| 2 | Address ALL BLOCKING findings with minimal targeted fixes | AC-002-01, AC-002-06 |
| 3 | Address straightforward WARNING fixes; mark complex ones [DEFERRED] | AC-002-02 |
| 4 | Re-run unit tests for the file | AC-002-03 |
| 5 | Produce update report with finding ID, action, change | AC-002-04 |
| 6 | If disputing a finding, provide rationale (min 20 chars) | AC-002-05 |

**Update Report Format:**

```markdown
# Update Report: {file_path}

**Cycle:** {N}
**Updated At:** {ISO timestamp}
**Tests:** {pass_count}/{total_count} passing

## Findings Addressed

| Finding | Action | Change |
|---------|--------|--------|
| B-001 | Fixed | Added null check at line 42 |
| W-002 | Deferred | Complex refactor; deferred to Phase 16 |
| B-003 | Disputed | Not applicable: function is pure, no side effects (rationale: 25 chars) |
```

**Updater Enforcement Rules:**
1. NEVER introduce new features -- only fix what the Reviewer flagged (AC-002-06)
2. NEVER remove existing functionality -- fixes must be additive or corrective
3. ALWAYS re-run tests after changes (AC-002-03)
4. Disputes MUST have rationale >= 20 characters (AC-002-05)

### 4.5 Writer Role Enhancement (FR-004)

The existing `05-software-developer.md` gains WRITER_CONTEXT awareness, following the pattern used for DEBATE_CONTEXT in Creator agents (REQ-0014/0015/0016).

**WRITER_CONTEXT Handling:**
- A new section near the top of the agent describes Writer Mode Detection
- If `WRITER_CONTEXT.mode == "writer"` and `WRITER_CONTEXT.per_file_loop == true`:
  - Produce ONE file at a time (AC-004-01)
  - Announce file path and STOP after each file
  - Wait for orchestrator to run review cycle before proceeding
  - TDD ordering: test file FIRST, then production file (AC-004-03)
- If no `WRITER_CONTEXT` is present: current behavior unchanged (AC-004-02, NFR-002)

**Estimated Change:** ~40-60 lines added to `05-software-developer.md` (WRITER_CONTEXT section before the main workflow).

### 4.6 Phase 16 "Final Sweep" Scope (FR-005, AC-005-01, AC-005-02)

The existing `16-quality-loop-engineer.md` gains conditional scope based on whether the implementation team ran in Phase 06.

**Detection Mechanism:** Check `active_workflow.implementation_loop_state` in state.json.
- IF `implementation_loop_state` exists AND `implementation_loop_state.status == "completed"`:
  Run in "final sweep" mode (batch-only checks)
- ELSE: Run full scope as today (NFR-002)

**Final Sweep Mode (when implementation team ran):**
- INCLUDE: Full test suite execution, coverage measurement, mutation testing, npm audit, SAST scan, build verification, lint/type check, traceability matrix
- EXCLUDE: Individual file logic review, individual file quality review (already done by Reviewer in Phase 06)

**Unchanged Mode (when implementation team did NOT run):**
- Full current behavior -- no regression (NFR-002)

**Estimated Change:** ~30-50 lines modified/added to `16-quality-loop-engineer.md`.

### 4.7 Phase 08 "Human Review Only" Scope (FR-005, AC-005-03, AC-005-04)

The existing `07-qa-engineer.md` gains conditional scope based on whether the implementation team ran.

**Detection Mechanism:** Same as Phase 16 -- check `active_workflow.implementation_loop_state`.

**Human Review Only Mode (when implementation team ran):**
- INCLUDE: Architecture decisions, business logic coherence, design pattern compliance, non-obvious security concerns, merge approval
- EXCLUDE: Code quality items already verified by Reviewer (naming, DRY, complexity, error handling)

**Unchanged Mode (when implementation team did NOT run):**
- Full current behavior -- no regression (NFR-002)

**Estimated Change:** ~30-50 lines modified/added to `07-qa-engineer.md`.

### 4.8 Edge Case Handling (FR-007, AC-007-01 through AC-007-03)

| Edge Case | Handling | Rationale |
|-----------|---------|-----------|
| Writer produces no files | Log warning, skip per-file loop, proceed to Phase 16 | Fail-open per Article X |
| Writer produces a file that does not exist on disk | Reviewer reports error, file skipped with warning | Defensive; cannot review non-existent file |
| Reviewer produces malformed output (cannot parse verdict) | Treat as PASS (fail-open per Article X); log warning | AC-007-02 analogy |
| Reviewer always returns REVISE (stuck loop) | Max 3 cycles per file, then accept with [MAX_ITERATIONS] warning (AC-003-05) | Bounded iteration |
| Updater fails to re-run tests | Log warning, proceed to Reviewer re-review anyway | Best-effort; Reviewer catches remaining issues |
| Both --debate and --no-debate flags | --no-debate wins (conservative, per Article X) | Same as existing DEBATE_ROUTING behavior |
| Phase 06 not in active_workflow.phases | Skip per-file loop entirely | Standard phase filtering |
| implementation_loop_state already exists (re-entry) | Resume from last incomplete file | Idempotent restart |
| File ordering ambiguity (task plan not clear) | Fall back to: test files first, then production files, alphabetical within each group | Deterministic ordering |

---

## 5. Data Flow

### 5.1 Per-File Loop (Happy Path -- File Passes on Cycle 2)

```
User: /isdlc feature "Add widget" (standard sizing, debate mode ON)
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = true
  |
  v
Phases 01-05 complete (requirements, architecture, design, test-strategy)
  |
  v
Phase 06 reached
  current_phase = "06-implementation"
  IMPLEMENTATION_ROUTING["06-implementation"] found
  debate_mode == true --> per-file loop
  |
  v
Initialize implementation_loop_state in state.json
  |
  v
Delegate to Writer (software-developer + WRITER_CONTEXT):
  "Produce ONE file at a time. Test file first."
  |
  v
Writer produces: tests/widget.test.cjs
  |
  v
--- FILE 1: tests/widget.test.cjs ---
  |
  v
Delegate to Reviewer (implementation-reviewer):
  REVIEW_CONTEXT: { file_path: "tests/widget.test.cjs", cycle: 1 }
  |
  v
Reviewer checks 8 categories (IC-01..IC-08)
  --> Verdict: REVISE (2 BLOCKING: missing edge case test, test interdependence)
  |
  v
Delegate to Updater (implementation-updater):
  UPDATE_CONTEXT: { file_path, cycle: 1, findings: [...] }
  |
  v
Updater addresses 2 BLOCKING findings, re-runs tests
  --> Update report: 2 fixed, 0 deferred, 0 disputed
  |
  v
Delegate to Reviewer (re-review):
  REVIEW_CONTEXT: { file_path: "tests/widget.test.cjs", cycle: 2 }
  |
  v
Reviewer: Verdict: PASS (0 BLOCKING, 0 WARNING)
  |
  v
Record in per_file_reviews: { file: "tests/widget.test.cjs", verdict: "PASS", cycles: 2 }
  |
  v
--- FILE 2: src/widget.js ---
  |
  v
Delegate to Writer: "Produce next file"
Writer produces: src/widget.js
  |
  v
Delegate to Reviewer: cycle 1
Reviewer: Verdict: PASS
  |
  v
Record: { file: "src/widget.js", verdict: "PASS", cycles: 1 }
  |
  v
All files processed. Generate per-file-loop-summary.md.
  |
  v
Phase 06 complete. Proceed to Phase 16 (final sweep mode).
  |
  v
Phase 16: Batch checks only (tests, coverage, SAST, audit, lint).
  |
  v
Phase 08: Human review only (architecture, business logic, merge approval).
```

### 5.2 Debate OFF (Single-Agent Path)

```
User: /isdlc feature "Small fix" --no-debate
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = false
  |
  v
Phase 06 reached
  IMPLEMENTATION_ROUTING["06-implementation"] found
  debate_mode == false --> single-agent path
  |
  v
Delegate to 05-software-developer.md (NO WRITER_CONTEXT)
  |
  v
Current single-agent behavior -- unchanged from today (NFR-002)
  |
  v
Phase 06 complete
  (implementation_loop_state NOT created)
  |
  v
Phase 16: Full scope (implementation_loop_state absent --> no "final sweep")
  |
  v
Phase 08: Full scope (implementation_loop_state absent --> full code review)
```

### 5.3 Max Iterations Reached (Per-File)

```
File: src/complex-module.js
  |
  v
Cycle 1: Reviewer --> REVISE (3 BLOCKING)
  Updater fixes 2, disputes 1
Cycle 2: Reviewer --> REVISE (1 BLOCKING -- dispute not accepted, new finding)
  Updater fixes 1
Cycle 3: Reviewer --> REVISE (1 BLOCKING -- subtle issue)
  |
  v
Max cycles (3) reached for this file
  Accept with [MAX_ITERATIONS] warning
  Record: { file: "src/complex-module.js", verdict: "MAX_ITERATIONS", cycles: 3 }
  |
  v
Proceed to next file. MAX_ITERATIONS files will get extra scrutiny in Phase 16.
```

---

## 6. Backward Compatibility Strategy (NFR-002)

The architectural invariant: **when debate mode is OFF, all phase behavior is identical to current production. When debate mode is ON for Phases 01/03/04, behavior is identical to REQ-0014/0015/0016.**

| Component | Invariant | Verification |
|-----------|-----------|-------------|
| `05-software-developer.md` | No WRITER_CONTEXT = current behavior unchanged | Regression test: single-agent mode (AC-004-02) |
| `16-quality-loop-engineer.md` | No implementation_loop_state = full scope unchanged | Regression test: debate_mode=false path |
| `07-qa-engineer.md` | No implementation_loop_state = full scope unchanged | Regression test: debate_mode=false path |
| `00-sdlc-orchestrator.md` | Phase 01/03/04 DEBATE_ROUTING entries unchanged | Existing 264 debate tests pass |
| `00-sdlc-orchestrator.md` | `debate_mode == false` = single-agent delegation as today | Regression test: orchestrator single-agent path |
| Existing 264 debate tests | All tests from REQ-0014 (90) + REQ-0015 (87) + REQ-0016 (87) pass | Full test suite run |
| state.json | implementation_loop_state is additive; existing fields unchanged | No migration needed |

**Migration:** None required. All changes are additive. IMPLEMENTATION_ROUTING does not modify DEBATE_ROUTING entries. The two new agent files have no inward dependencies. Phase 16/08 conditional behavior is gated on implementation_loop_state presence (absent = unchanged behavior).

---

## 7. Extensibility Strategy

The IMPLEMENTATION_ROUTING table and per-file loop protocol are designed for potential future extension:

**Adding a New Per-File Phase (hypothetical):**
1. Create the Reviewer and Updater agent files for the new phase
2. Add the Writer agent's context awareness section
3. Add a new row to IMPLEMENTATION_ROUTING

No changes to the per-file loop protocol, convergence logic, or state management.

**Note:** This extensibility is theoretical. Currently only Phase 06 needs a per-file loop. Per Article V (Simplicity First), the table has one row and no abstraction beyond what is needed.

---

## 8. Relationship Between DEBATE_ROUTING and IMPLEMENTATION_ROUTING

```
DEBATE_ROUTING (Section 7.5):
  Phase 01 --> Creator/Critic/Refiner (per-artifact loop, max 3 rounds)
  Phase 03 --> Creator/Critic/Refiner (per-artifact loop, max 3 rounds)
  Phase 04 --> Creator/Critic/Refiner (per-artifact loop, max 3 rounds)

IMPLEMENTATION_ROUTING (Section 7.6):  [NEW]
  Phase 06 --> Writer/Reviewer/Updater (per-file loop, max 3 cycles/file)

Shared infrastructure:
  - resolveDebateMode() function (same for both)
  - debate_mode flag in state.json (same for both)
  - Same --debate/--no-debate CLI flags

Separate infrastructure:
  - Loop protocol (per-artifact rounds vs per-file cycles)
  - State tracking (debate_state vs implementation_loop_state)
  - Convergence criteria (blocking_count==0 vs verdict==PASS)
  - Agent roles (Creator/Critic/Refiner vs Writer/Reviewer/Updater)
```

---

## 9. Files Changed Summary

| File | Change Type | Lines Changed (est.) | Risk |
|------|------------|---------------------|------|
| `src/claude/agents/05-implementation-reviewer.md` | **New file** | ~200-300 | Medium (new agent) |
| `src/claude/agents/05-implementation-updater.md` | **New file** | ~200-300 | Medium (new agent) |
| `src/claude/agents/00-sdlc-orchestrator.md` | ADD section 7.6 | +150-200 | Medium (orchestrator growth) |
| `src/claude/agents/05-software-developer.md` | ADD section | +40-60 | Low (additive) |
| `src/claude/agents/16-quality-loop-engineer.md` | MODIFY scope | ~30-50 | Medium (behavioral change) |
| `src/claude/agents/07-qa-engineer.md` | MODIFY scope | ~30-50 | Medium (behavioral change) |
| `src/claude/hooks/config/iteration-requirements.json` | ADD entries | +20-30 | Low (additive) |
| `src/claude/hooks/tests/implementation-debate-reviewer.test.cjs` | **New file** | ~120 | Low (test) |
| `src/claude/hooks/tests/implementation-debate-updater.test.cjs` | **New file** | ~120 | Low (test) |
| `src/claude/hooks/tests/implementation-debate-orchestrator.test.cjs` | **New file** | ~150 | Low (test) |
| `src/claude/hooks/tests/implementation-debate-writer.test.cjs` | **New file** | ~100 | Low (test) |
| `src/claude/hooks/tests/implementation-debate-integration.test.cjs` | **New file** | ~130 | Low (test) |

Total estimated: ~1,200-1,500 lines across 12 files (5 modified, 7 new).

---

## 10. Requirement Traceability

| Requirement | Architectural Component | Section |
|-------------|------------------------|---------|
| FR-001 (Reviewer, 8 ACs) | New 05-implementation-reviewer.md | 4.3 |
| FR-002 (Updater, 6 ACs) | New 05-implementation-updater.md | 4.4 |
| FR-003 (Per-file loop, 7 ACs) | Orchestrator Section 7.6 per-file loop protocol | 4.2 |
| FR-004 (Writer awareness, 3 ACs) | WRITER_CONTEXT handling in software-developer | 4.5 |
| FR-005 (Phase restructuring, 4 ACs) | Conditional scope in quality-loop-engineer + qa-engineer | 4.6, 4.7 |
| FR-006 (IMPLEMENTATION_ROUTING, 4 ACs) | Orchestrator Section 7.6 routing table | 4.1 |
| FR-007 (Option A + error handling, 3 ACs) | Orchestrator-managed loop with Task delegation; edge cases | 4.1, 4.8 |
| NFR-001 (Performance) | Sequential per-file delegation; net-neutral via reduced Phase 16/08 | 4.2 |
| NFR-002 (Backward compat) | Conditional behavior gated on implementation_loop_state presence | 6 |
| NFR-003 (Consistency) | Agent naming 05-*, test naming implementation-debate-*, resolveDebateMode() reused | 4.1, 4.3, 4.4 |
| NFR-004 (Observability) | Per-file review logged in implementation_loop_state.per_file_reviews | 4.2 |

---

## 11. Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Phase 16 scope narrowing + zero test coverage | Add backward compatibility tests BEFORE modifying scope. Integration test file covers debate_mode=true AND debate_mode=false paths. | Test Strategy |
| Phase 08 scope narrowing + zero test coverage | Same as above for Phase 08. | Test Strategy |
| IMPLEMENTATION_ROUTING interference with DEBATE_ROUTING | Separate sections (7.5 vs 7.6), separate state keys (debate_state vs implementation_loop_state). Orchestrator test verifies DEBATE_ROUTING entries unchanged. | Implementation |
| Orchestrator file size growth (1478 + ~175 = ~1653 lines) | New section 7.6 is self-contained. Uses same structural patterns as 7.5. Monitor in future REQs for refactoring need. | Architecture (this doc) |
| Writer producing files out of TDD order | WRITER_CONTEXT explicitly instructs test-first ordering (AC-004-03). Writer awareness tests verify. | Implementation |
| Reviewer always returning REVISE (infinite loop) | Max 3 cycles per file with [MAX_ITERATIONS] escape (AC-003-05). | Architecture (this doc) |
| Per-file loop adding excessive time | NFR-001: <=30s per file. Offset by reduced Phase 16+08 scope. Performance tracked in implementation_loop_state. | Quality Loop |
