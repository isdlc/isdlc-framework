# Impact Analysis: Manual Code Review Break

**Document ID**: REQ-0002-IA
**Feature**: Manual Code Review Break (Pause Point Before Merge)
**Analysis Date**: 2026-02-08
**Analyst**: Impact Analysis Orchestrator (Phase 02)
**Blast Radius**: Medium (12 files modified, 2 files created)

---

## Executive Summary

This feature introduces a configurable human review checkpoint between the final phase gate and the branch merge step. The blast radius is **medium**: it touches 3 layers of the framework (orchestrator logic, CLI installer, runtime hooks) but does not alter any existing phase agent behavior or break any existing API contract. The primary risk is incorrect orchestrator state management during the new `paused_for_review` state.

**Key finding**: The review pause is NOT a new numbered phase -- it is a workflow-level interstitial between the final gate pass and the merge step. This means no changes to `workflows.json` phase arrays, `iteration-requirements.json`, or any phase agent files.

---

## M1: Impact Analysis (Affected Files Per AC)

### 1. File Impact Matrix

| File | Change Type | ACs Affected | Blast Radius | Coupling |
|------|-------------|-------------|--------------|----------|
| `src/claude/agents/00-sdlc-orchestrator.md` | MODIFY | AC-01.1-4, AC-02.1-6, AC-03.1-3, AC-04.1-4, AC-05.1-4, AC-06.1-7 | HIGH | Central orchestrator -- all workflows pass through |
| `lib/installer.js` | MODIFY | AC-07.1-4, AC-08.1-5 | MEDIUM | Runs once at init; does not affect runtime |
| `src/claude/hooks/lib/common.cjs` | MODIFY | AC-09.1, AC-10.1-6 | MEDIUM | Shared by all 10 hooks; changes are additive |
| `src/claude/settings.json` | MODIFY | AC-10.1 | LOW | Hook registration only |
| `uninstall.sh` | MODIFY | AC-10.1 | LOW | Cleanup list only |
| `lib/updater.js` | NO CHANGE | AC-09.4 | NONE | state.json already preserved by updater |
| `.isdlc/config/workflows.json` | NO CHANGE | N/A | NONE | Phase arrays unchanged; `requires_branch` already exists |
| `src/claude/hooks/config/iteration-requirements.json` | NO CHANGE | N/A | NONE | No new phase = no new iteration requirements |
| **NEW**: `src/claude/hooks/review-reminder.cjs` | CREATE | AC-10.1-6 | LOW | Self-contained hook; fail-open |
| **NEW**: `test/hooks/review-reminder.test.cjs` | CREATE | AC-10.1-6 | NONE | Test file only |

### 2. Detailed File Analysis

#### `src/claude/agents/00-sdlc-orchestrator.md` (PRIMARY IMPACT)

This is the highest-impact file. The orchestrator controls the "Branch Merge (Workflow Completion)" flow at Section 3a (line ~893). The review pause must be inserted as a conditional step BEFORE the merge sequence.

**Current flow** (Section 3a, lines 893-945):
```
GATE-{final} passes → pre-merge commit → git merge --no-ff → post-merge cleanup
```

**New flow**:
```
GATE-{final} passes → [IF code_review.enabled AND requires_branch] → review pause → [A/B/R menu] → merge (or cancel)
                     → [ELSE] → merge as today
```

Specific changes needed:
1. **Section 3a "Branch Merge"**: Add conditional review pause before step 1 ("Pre-merge")
2. **Section 4a "Automatic Phase Transitions"**: Add documented exception for review pause (the ONLY permitted human prompt during workflow)
3. **New section**: "Review Pause Protocol" with A/B/R menu logic, PR creation, review summary generation
4. **Section on cancellation**: Reference existing cancellation flow for [R] Reject option

**Lines affected**: ~893-945 (merge flow), ~1016-1022 (auto-transition exception)
**Risk**: HIGH -- incorrect state management could leave workflow stuck in `paused_for_review`

#### `lib/installer.js` (MODERATE IMPACT)

The `generateState()` function (line 951) needs a new `code_review` section. The installer prompt flow (around line 155-198) needs a team size question after provider mode selection.

**Current `generateState()` output** (lines 951-1046):
- Returns state object with `project`, `complexity_assessment`, `workflow`, `constitution`, etc.
- No `code_review` section exists

**Changes needed**:
1. Add `code_review: { enabled: false, team_size: 1 }` to `generateState()` return object (line ~1013, after `iteration_enforcement`)
2. Add `code_review` to `generateProjectState()` as well (line ~1088, for monorepo projects)
3. Add team size prompt after provider mode selection (line ~194):
   - Use `text()` from `lib/utils/prompts.js` (already imported at line 28)
   - Parse numeric input, default to 1
   - If > 1, set `enabled: true` and inform user
4. Pass team size value into `generateState()` call

**Coupling**: Low. The installer only runs during `isdlc init`. The new prompt uses existing `text()` utility. The new state field is isolated.

#### `src/claude/hooks/lib/common.cjs` (MODERATE IMPACT)

Add a utility function for reading `code_review` config. This is optional but follows the existing pattern (`readState()`, `readStateValue()`).

**Changes needed**:
1. Add `readCodeReviewConfig()` function (~5 lines): reads `state.code_review`, returns `{ enabled, team_size }`
2. Export the new function

**Risk**: LOW. Additive change only. Existing functions unchanged.

#### `src/claude/settings.json` (LOW IMPACT)

Register the new `review-reminder.cjs` hook.

**Current structure** (lines 197-233):
```json
"PostToolUse": [
  { "matcher": "Task", "hooks": [...] },
  { "matcher": "Skill", "hooks": [...] },
  { "matcher": "Bash", "hooks": [...] }
]
```

**Change needed**: Add a new entry to `PostToolUse` with matcher `"Bash"` (or extend the existing Bash matcher's hooks array) for `review-reminder.cjs`. The hook fires on `git commit` commands.

**Alternative**: Register under existing `PostToolUse[Bash]` matcher alongside `test-watcher.cjs`. The hook internally checks if the Bash command is a commit command.

**Risk**: LOW. Hook registration is declarative.

#### `uninstall.sh` (LOW IMPACT)

Add `review-reminder.cjs` to the known hooks list (line ~366).

**Current hooks list** (lines 366-372):
```bash
"gate-blocker.cjs"
"test-watcher.cjs"
"constitution-validator.cjs"
"menu-tracker.cjs"
"skill-validator.cjs"
"log-skill-usage.cjs"
"common.cjs"
```

**Change**: Add `"review-reminder.cjs"` to this list.

#### NEW: `src/claude/hooks/review-reminder.cjs` (NEW FILE)

A new PostToolUse[Bash] hook that fires after git commit commands.

**Behavior**:
1. Read stdin from Claude Code (Bash tool output)
2. Check if the command was a `git commit` variant
3. If yes: read `state.json` -> `code_review` section
4. If `enabled == false` AND `team_size > 1`: output warning message
5. If `enabled == false` AND `team_size == 1`: exit silently
6. If `enabled == true`: exit silently (feature active, no reminder needed)
7. Must complete in < 100ms
8. Must fail-open (any error = silent exit)

**Pattern follows**: `test-watcher.cjs` (PostToolUse[Bash] hook, reads command output, conditionally writes state)

### 3. Module Dependency Map

```
                    ┌────────────────────┐
                    │  00-sdlc-orchestrator │
                    │  (merge flow)        │
                    └─────────┬────────────┘
                              │ reads
                    ┌─────────▼────────────┐
                    │  .isdlc/state.json    │
                    │  code_review section  │
                    └─────────┬────────────┘
            ┌─────────────────┼──────────────────┐
            │                 │                  │
   ┌────────▼──────┐  ┌──────▼───────┐  ┌───────▼────────┐
   │ installer.js  │  │ common.cjs   │  │ review-reminder│
   │ (writes at    │  │ (reads at    │  │ .cjs (reads at │
   │  init time)   │  │  runtime)    │  │  commit time)  │
   └───────────────┘  └──────────────┘  └────────────────┘
```

Dependencies are unidirectional. The orchestrator reads `code_review` from state.json. The installer writes it. The hook reads it. No circular dependencies.

### 4. Blast Radius Classification

**Overall: MEDIUM**

- **Scope**: 3 layers (orchestrator agent, CLI installer, runtime hook)
- **Existing file changes**: 5 files modified
- **New files**: 2 (hook + test)
- **Phase agents affected**: 0 (no phase agent changes)
- **Workflow definitions affected**: 0 (no `workflows.json` changes)
- **Iteration requirements affected**: 0 (no `iteration-requirements.json` changes)
- **Hook count change**: 10 -> 11
- **State schema change**: Additive only (new `code_review` section)

---

## M2: Entry Point Discovery

### 1. Entry Points Mapped to Acceptance Criteria

| Entry Point | Type | ACs Served | Implementation Order |
|-------------|------|-----------|---------------------|
| Orchestrator merge flow (Section 3a) | Agent logic | AC-01.1-4, AC-02.1-6, AC-03.1-3, AC-04.1-4, AC-05.1-4, AC-06.1-7 | 1st (core logic) |
| `generateState()` in `installer.js` | Function | AC-07.1-4, AC-08.3-5 | 2nd (schema foundation) |
| Installer prompt flow in `installer.js` | Interactive | AC-08.1-2, AC-08.5 | 2nd (alongside generateState) |
| `readCodeReviewConfig()` in `common.cjs` | Utility | AC-09.1, AC-10.1-6 | 3rd (utility before hook) |
| `review-reminder.cjs` hook | Runtime hook | AC-10.1-6 | 4th (depends on common.cjs) |
| `settings.json` hook registration | Config | AC-10.1 | 5th (wire hook) |
| `uninstall.sh` hook list | Cleanup | AC-10.1 | 5th (alongside settings) |

### 2. Entry Points Detail

#### Entry Point 1: Orchestrator Merge Flow

**Location**: `src/claude/agents/00-sdlc-orchestrator.md`, Section 3a "Branch Merge (Workflow Completion)"

**Current behavior**: When the final phase gate passes, the orchestrator immediately commits, merges to main, and deletes the branch.

**New behavior**: Before step 1 of the merge sequence, check `code_review.enabled` from state.json. If enabled AND `active_workflow.git_branch` exists (which implies `requires_branch: true`):
1. Generate review summary document (FR-05)
2. Attempt PR creation via `gh pr create` (FR-02) with fallback (FR-03)
3. Present A/B/R menu (FR-06)
4. Wait for user input
5. On [A]: proceed to existing merge flow
6. On [B]: record bypass, proceed to merge
7. On [R]: cancel workflow (existing cancellation flow)

**Relevant APIs**: git CLI, `gh` CLI (optional), state.json read/write

#### Entry Point 2: Installer `generateState()`

**Location**: `lib/installer.js`, line 951

**Change**: Add `code_review` object to the returned state. This establishes the schema that all other components depend on.

**Relevant APIs**: None (pure function, returns JSON object)

#### Entry Point 3: Installer Prompt Flow

**Location**: `lib/installer.js`, after provider mode selection (~line 194)

**Change**: Add interactive prompt using existing `text()` function from `lib/utils/prompts.js`.

**Relevant APIs**: `text()` from `lib/utils/prompts.js` (already imported)

#### Entry Point 4: `common.cjs` Utility

**Location**: `src/claude/hooks/lib/common.cjs`

**Change**: Add `readCodeReviewConfig()` function. Follows existing `readState()` pattern.

**Relevant APIs**: `fs.readFileSync`, `JSON.parse`, `getStatePath()`

#### Entry Point 5: `review-reminder.cjs` Hook

**Location**: NEW file at `src/claude/hooks/review-reminder.cjs`

**Pattern**: Follows `test-watcher.cjs` -- PostToolUse[Bash] hook that reads command output and conditionally writes to state or outputs a message.

**Relevant APIs**: `readStdin()`, `readCodeReviewConfig()` from common.cjs

### 3. Recommended Implementation Order

```
Phase 06 Implementation Order:

1. STATE SCHEMA (foundation)
   - Add code_review section to generateState() in installer.js
   - Add code_review section to generateProjectState() in installer.js

2. INSTALLER PROMPT (user-facing, depends on schema)
   - Add team size prompt after provider mode selection
   - Wire team size into generateState() call

3. UTILITY FUNCTION (shared dependency)
   - Add readCodeReviewConfig() to common.cjs

4. REVIEW-REMINDER HOOK (depends on utility)
   - Create review-reminder.cjs
   - Register in settings.json
   - Add to uninstall.sh known hooks list

5. ORCHESTRATOR LOGIC (core feature, depends on schema)
   - Add review pause protocol to Section 3a
   - Add auto-transition exception to Section 4a
   - Add review summary generation logic
   - Add PR creation logic with fallback
   - Add A/B/R menu logic

6. TESTS
   - Unit tests for review-reminder.cjs
   - Unit tests for readCodeReviewConfig()
   - Update installer tests for team size prompt and code_review schema
```

### 4. N/A Assessments

| Category | Status | Notes |
|----------|--------|-------|
| API endpoints | N/A | CLI framework, no HTTP APIs |
| UI components | N/A | Terminal-based; no UI framework |
| Background jobs | N/A | No cron/worker processes |
| Event handlers | Review-reminder hook acts as event handler | PostToolUse[Bash] event |
| Database migrations | N/A | JSON state file, no database |

---

## M3: Risk Assessment

### 1. Risk Per Acceptance Criterion

| AC | Risk Level | Risk Description | Mitigation |
|----|-----------|------------------|------------|
| AC-01.1 | HIGH | `paused_for_review` state could leave workflow stuck if not properly handled | Add timeout and recovery mechanism; ensure `/sdlc cancel` can clear stuck state |
| AC-01.2 | LOW | Simple boolean check | Unit test the conditional path |
| AC-01.3 | MEDIUM | New state value must be recognized by all hooks | Verify gate-blocker does not block on unknown state |
| AC-01.4 | HIGH | Workflow must genuinely block -- no race condition with auto-advance | Verify Section 4a exception is correctly scoped |
| AC-02.1 | MEDIUM | `gh` CLI detection may fail in some environments | Multiple fallback paths (AC-02.4, AC-02.6) |
| AC-02.2 | LOW | String formatting only | Unit test format |
| AC-02.3 | LOW | PR body is the review summary | Reuse FR-05 artifact |
| AC-02.4 | LOW | Fallback path (no `gh`) | Already handled in existing orchestrator patterns |
| AC-02.5 | LOW | State write | Follow existing state write patterns |
| AC-02.6 | LOW | Error handling fallback | Try/catch with fallback |
| AC-03.1-3 | LOW | File creation and display | Standard markdown generation |
| AC-04.1-4 | MEDIUM | Aggregating artifacts from all phases requires reading entire phase history | Read `phases[].artifacts` from state.json |
| AC-05.1-4 | LOW | Document generation | Template-based markdown |
| AC-06.1 | MEDIUM | A/B/R menu must block workflow | Use same pattern as Phase 01 interactive elicitation |
| AC-06.2-3 | LOW | Input validation | Min-length check |
| AC-06.4-6 | LOW | State writes and logging | Follow existing patterns |
| AC-06.7 | LOW | Delegates to existing `/sdlc cancel` flow | Already implemented |
| AC-07.1 | LOW | Schema addition to state.json | Additive, non-breaking |
| AC-07.2-3 | LOW | Conditional logic in installer | Unit test both paths |
| AC-07.4 | LOW | Manual override | Document in review-summary |
| AC-08.1-5 | MEDIUM | Installer prompt must handle non-numeric input | parseInt with NaN check, default to 1 |
| AC-09.1-3 | LOW | Configuration persistence | state.json already preserved by updater |
| AC-09.4 | NONE | Already handled | Updater preserves state.json (verified in lib/updater.js) |
| AC-10.1-6 | LOW | New hook, self-contained, fail-open | Follow test-watcher pattern; < 100ms budget |

### 2. Test Coverage Gaps

| Area | Current Coverage | Gap | Priority |
|------|-----------------|-----|----------|
| Orchestrator merge flow | Manual (agent-level) | No unit tests for merge logic (agent markdown) | P1 -- validate with E2E test |
| Installer `generateState()` | Covered in existing tests | Need test for `code_review` field | P0 |
| `common.cjs` utilities | 284 CJS tests | Need test for `readCodeReviewConfig()` | P0 |
| `review-reminder.cjs` | Does not exist yet | Full test suite needed | P0 |
| `settings.json` registration | Declarative; no test needed | N/A | N/A |
| `uninstall.sh` cleanup | Manual verification | N/A | P2 |

### 3. Technical Debt Items

| Item | Severity | Notes |
|------|----------|-------|
| Orchestrator agent file is pure markdown -- no unit-testable code | LOW | Industry standard for LLM agent definitions; E2E tests cover behavior |
| `common.cjs` at ~937 lines (pre-existing) | LOW | Already noted in CLAUDE.md backlog for future split |
| No schema validation for state.json | MEDIUM | Pre-existing; adding `code_review` section is safe but unvalidated |

### 4. Risk Zones

```
Risk Zone Map:

    LOW ────────────── MEDIUM ────────────── HIGH ─── CRITICAL
     │                    │                    │
     │  AC-07 (schema)    │  AC-04 (artifacts) │
     │  AC-03 (doc gen)   │  AC-08 (prompt)    │
     │  AC-05 (summary)   │  AC-02.1 (gh CLI)  │  AC-01.1 (stuck state)
     │  AC-09 (config)    │  AC-06.1 (menu)    │  AC-01.4 (auto-advance)
     │  AC-10 (hook)      │  AC-01.3 (hooks)   │
     │                    │                    │
```

### 5. Blocking Risks

| Risk | Probability | Impact | Blocking? | Mitigation |
|------|------------|--------|-----------|------------|
| `paused_for_review` state not recognized by gate-blocker hook | Medium | HIGH | YES | Test that gate-blocker does NOT block when state is `paused_for_review` (hook should only activate on phase advancement, not review pause) |
| Auto-advance (Section 4a) fires during review pause | Low | HIGH | YES | Add explicit check: if `active_workflow.review_status == "awaiting_human_review"`, do NOT auto-advance |
| Existing tests break due to state schema change | Low | MEDIUM | NO | `code_review` is additive; existing tests don't read this field |

### 6. Overall Risk Level

**MEDIUM**

The feature is well-scoped with clear boundaries. The primary risks are in the orchestrator's state management (the new `paused_for_review` interstitial). All other components (installer, hook, utility) are low-risk additive changes. No existing phase agent behavior changes. No workflow definition changes.

---

## Consolidation

### Scope Comparison

| Aspect | Original Description | Clarified Requirements | Delta |
|--------|---------------------|----------------------|-------|
| Pause location | "pause point before proceeding" | After Phase 08 (final phase), before merge | Clarified |
| PR creation | Not specified | `gh pr create` with fallback to document-only | Added |
| Team size | Not specified | Installer prompt, auto-enable when > 1 | Added |
| Bypass | Not specified | Mandatory comment >= 10 chars, logged | Added |
| Reminder hook | Not specified | PostToolUse[Bash] on git commit | Added |
| Workflow scope | Not specified | All `requires_branch: true` workflows | Clarified |
| Reject option | Not specified | Cancel workflow, preserve branch | Added |

### Implementation Recommendations

1. **Start with state schema** (installer.js `generateState()`) -- all other components depend on the `code_review` field existing in state.json

2. **Orchestrator changes are the critical path** -- the review pause protocol in `00-sdlc-orchestrator.md` is the most complex change and should receive the most testing attention

3. **The review-reminder hook is low-risk and independent** -- it can be developed in parallel with the orchestrator changes

4. **No changes needed to**:
   - `workflows.json` (phase arrays unchanged)
   - `iteration-requirements.json` (no new phase)
   - Any phase agent file (01-15)
   - `lib/updater.js` (state.json already preserved)
   - `skills-manifest.json` (no new skills)

5. **Estimated file count**: 7 files modified + 2 files created = 9 total (within the quick-scan estimate of ~12)

### Blocking Risks Summary

Two blocking risks require explicit testing:
1. Gate-blocker hook must NOT interfere with the review pause state
2. Auto-advance logic must NOT fire during `paused_for_review` state

Both are testable and mitigable. No design changes needed.

---

## Appendix: Quick Scan Comparison

| Quick Scan Estimate | Impact Analysis Result |
|--------------------|-----------------------|
| ~12 files | 9 files (7 modified + 2 created) |
| Medium complexity | Confirmed Medium |
| Key areas: orchestrator, installer, hooks | Confirmed |
