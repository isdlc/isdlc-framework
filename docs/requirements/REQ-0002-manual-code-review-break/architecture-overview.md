# Architecture Assessment: Manual Code Review Break

**Document ID**: REQ-0002-ARCH
**Feature**: Manual Code Review Break (Pause Point Before Merge)
**Assessment Date**: 2026-02-08
**Architect**: Solution Architect (Phase 03)
**Scope**: Impact Assessment (lightweight -- extends existing architecture)

---

## 1. Architecture Decision: Interstitial vs. New Phase

### Decision

The review pause is implemented as a **workflow interstitial** -- a conditional checkpoint between the final gate pass and the merge step. It is NOT a new numbered phase.

### Rationale

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| A: New numbered phase (e.g., Phase 09) | Clean phase-gate model | Requires `workflows.json` changes, new iteration-requirements entry, new gate checklist, new agent file, renumbers downstream phases | REJECTED |
| B: Workflow interstitial (before merge) | Zero changes to phase infrastructure, no new agent, no workflow.json changes, no iteration-requirements changes | Logic embedded in orchestrator markdown | **SELECTED** |

**Justification**: The review pause is fundamentally different from a phase -- it does not produce artifacts, does not have iteration requirements, and does not have a quality gate. It is a human approval step that gates the merge operation. Treating it as a phase would violate Article V (Simplicity First) by adding infrastructure for a simple yes/no decision.

### ADR Record

```
ADR-REQ-0002-001: Review Pause as Workflow Interstitial
Status: Accepted
Context: The feature needs a human checkpoint before merge
Decision: Implement as a conditional block in the orchestrator's merge flow
Consequences:
  - Orchestrator agent file grows by ~100 lines
  - No new files in agents/, skills/, checklists/
  - All workflow infrastructure remains unchanged
```

---

## 2. Component Architecture

### Existing Architecture (No Changes)

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code Host                     │
├─────────────┬───────────────┬───────────────────────────┤
│  Agents     │  Hooks (CJS)  │  State (.isdlc/)          │
│  (markdown) │  (10 hooks)   │  state.json               │
│             │               │  config/                   │
│  00-sdlc-*  │  gate-blocker │  workflows.json            │
│  01-reqs-*  │  test-watcher │  iteration-requirements    │
│  ...        │  ...          │                            │
├─────────────┴───────────────┴───────────────────────────┤
│                 CLI (lib/)                                │
│  installer.js | updater.js | project-detector.js        │
└─────────────────────────────────────────────────────────┘
```

### Changes (Additive Only)

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code Host                     │
├─────────────┬───────────────┬───────────────────────────┤
│  Agents     │  Hooks (CJS)  │  State (.isdlc/)          │
│  (markdown) │  (11 hooks)   │  state.json               │
│             │    +1 NEW     │   + code_review section    │
│  00-sdlc-*  │               │                            │
│  + review   │  review-      │  config/                   │
│    pause    │  reminder.cjs │  (no changes)              │
│    section  │               │                            │
├─────────────┴───────────────┴───────────────────────────┤
│                 CLI (lib/)                                │
│  installer.js (+ team_size prompt, + code_review schema) │
└─────────────────────────────────────────────────────────┘
```

---

## 3. State Schema Extension

### New `code_review` Section in state.json

```json
{
  "code_review": {
    "enabled": false,
    "team_size": 1
  }
}
```

**Schema rules**:
- `enabled`: boolean. Default `false`. Auto-set to `true` when `team_size > 1` at install time. Manually overridable.
- `team_size`: positive integer. Default `1`. Set during `isdlc init`.

### Workflow-Level Review State

When the review pause activates, the orchestrator adds a `review` object to `active_workflow`:

```json
{
  "active_workflow": {
    "review": {
      "status": "awaiting_human_review",
      "activated_at": "ISO-8601",
      "review_summary_path": "docs/requirements/{artifact_folder}/review-summary.md",
      "pr_url": "https://github.com/...",
      "pr_creation_failed": false,
      "bypass_reason": null,
      "completed_at": null,
      "outcome": null
    }
  }
}
```

**Review outcomes**:
- `"approved"`: Human approved. Proceed to merge.
- `"bypassed"`: Human bypassed with documented reason. Proceed to merge.
- `"rejected"`: Human rejected. Workflow cancelled.

### State Transitions

```
                         GATE-{final} passes
                                │
                     ┌──────────▼──────────┐
                     │ code_review.enabled? │
                     └──────────┬──────────┘
                          │           │
                         YES          NO
                          │           │
               ┌──────────▼────┐      │
               │ paused_for    │      │
               │ _review       │      │
               └──────┬───────┘      │
                 ┌────┼────┐         │
                 │    │    │         │
                [A]  [B]  [R]       │
                 │    │    │         │
                 │    │    ▼         │
                 │    │  cancel      │
                 │    │              │
                 │    ▼              │
                 │  bypass + log     │
                 │    │              │
                 ▼    ▼              ▼
              ┌─────────────────────────┐
              │    MERGE TO MAIN        │
              └─────────────────────────┘
```

---

## 4. Hook Architecture

### New Hook: `review-reminder.cjs`

**Type**: PostToolUse[Bash]
**Trigger**: After any Bash command execution
**Pattern**: Follows `test-watcher.cjs`

```
┌──────────────────────────┐
│ Claude Code executes     │
│ `git commit ...`         │
└──────────┬───────────────┘
           │ PostToolUse[Bash]
           ▼
┌──────────────────────────┐
│ review-reminder.cjs      │
│                          │
│ 1. Read stdin            │
│ 2. Is command `git       │
│    commit`?              │
│    NO → exit 0           │
│ 3. Read state.json →     │
│    code_review           │
│ 4. enabled=false AND     │
│    team_size>1?          │
│    YES → output warning  │
│    NO → exit 0           │
└──────────────────────────┘
```

**Performance budget**: < 100ms
- Read stdin: ~1ms
- Regex check: ~1ms
- Read state.json: ~5ms (file I/O)
- Conditional check: ~0ms
- Total: < 10ms typical

**Fail-open**: All code paths wrapped in try/catch. Any error results in `process.exit(0)` with no output.

### Hook Registration

Add to existing `PostToolUse[Bash]` matcher in `settings.json`:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/test-watcher.cjs",
      "timeout": 10000
    },
    {
      "type": "command",
      "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/review-reminder.cjs",
      "timeout": 5000
    }
  ]
}
```

**Timeout**: 5000ms (generous; actual execution < 100ms)

---

## 5. Orchestrator Flow Integration

### Current Merge Flow (Section 3a, lines 893-945)

```
1. Pre-merge: git add -A && git commit
2. Merge: git checkout main && git merge --no-ff
3. On conflict: abort and escalate
4. Post-merge: delete branch, update state
5. Announce
```

### New Merge Flow (with Review Pause)

```
0. [NEW] Review checkpoint:
   a. Read code_review.enabled from state.json
   b. IF enabled AND requires_branch:
      i.   Generate review-summary.md (FR-05)
      ii.  Attempt gh pr create (FR-02) with fallback (FR-03)
      iii. Set active_workflow.review.status = "awaiting_human_review"
      iv.  Present A/B/R menu to user (FR-06)
      v.   STOP and wait for input
      vi.  On [A]: proceed to step 1
      vii. On [B]: record bypass, proceed to step 1
      viii.On [R]: cancel workflow (existing flow)
   c. IF NOT enabled: proceed to step 1 (unchanged)

1-5. (unchanged existing merge flow)
```

### Exception to Auto-Advance (Section 4a)

Current Section 4a states: "Phase transitions are AUTOMATIC when gates pass. Do NOT ask for permission."

New exception:
```
### Exception: Human Review Checkpoint
The ONLY permitted human prompt during automated workflow execution
is the review pause (when code_review.enabled == true). This prompt
occurs AFTER all phase gates have passed but BEFORE the merge step.
It is not a phase transition -- it is a merge pre-condition.
```

---

## 6. PR Creation Strategy

### Decision Tree

```
1. Is git repo? (git rev-parse --is-inside-work-tree)
   NO → Generate review-request.md (FR-03) → DONE

2. Is gh available? (which gh)
   NO → Generate review-summary.md + instruct manual PR → DONE

3. Try: gh pr create --title "[{prefix}] {description}" --body "{summary}"
   SUCCESS → Record PR URL in state.json → DONE
   FAILURE → Fallback: generate review-summary.md + log error + instruct manual PR → DONE
```

### PR Template

```
Title: [{artifact_prefix}-{NNNN}] {workflow.description}
Body:  Contents of review-summary.md
Base:  main
Head:  {active_workflow.git_branch.name}
```

---

## 7. Review Summary Document Structure

```markdown
# Review Summary: {artifact_folder}

## Workflow
- Type: {workflow type}
- Description: {description}
- Started: {started_at}
- Branch: {git_branch.name}

## Phases Completed
| Phase | Status | Gate |
|-------|--------|------|
| 01-requirements | Completed | PASSED |
| ... | ... | ... |

## Artifacts Produced
### Documentation
- docs/requirements/{artifact_folder}/requirements-spec.md
- ...

### Source Code
- {list from git diff --name-only, filtered to src/}

### Tests
- {list from git diff --name-only, filtered to test/}

### Configuration
- {list from git diff --name-only, filtered to .isdlc/, .claude/}

## Test Results
- Unit: {pass}/{total} ({coverage}%)
- Integration: {pass}/{total}
- E2E: {pass}/{total}

## Constitutional Compliance
All phase gates passed constitutional validation.

## Changed Files
{git diff main...HEAD --stat}
```

---

## 8. Installer Integration

### Prompt Placement

The team size prompt is placed AFTER provider mode selection and BEFORE the file copy step:

```
Step 3: Claude Code detection
Step 4: Provider mode selection
Step 4b: [NEW] Team size prompt     ← here
Step 5: File copy
Step 6: State generation
Step 7: Finalize
```

### Prompt Design

```
How many developers will work on this project? (1): _
```

- Default: `1` (solo developer)
- Validation: `parseInt()`, if `NaN` or `< 1`, default to `1`
- If `> 1`: set `code_review.enabled = true`, log: "Human code review enabled (team_size > 1)"
- If `== 1`: set `code_review.enabled = false`, no message

### Force Mode

When `--force` is passed, team_size defaults to `1` and code_review is disabled (consistent with non-interactive install behavior).

---

## 9. Constitutional Compliance Check

| Article | Compliance | Notes |
|---------|-----------|-------|
| I (Specification Authority) | PASS | Requirements spec is the source of truth for this feature |
| III (Security) | PASS | No new security surfaces; PR creation uses existing `gh` CLI |
| IV (No Ambiguity) | PASS | All edge cases resolved in requirements (Section 9) |
| V (Simplicity First) | PASS | Interstitial design avoids new phase infrastructure |
| VII (Artifact Traceability) | PASS | All ACs mapped to files in impact analysis |
| IX (Gate Integrity) | PASS | Review pause does not bypass any existing gate |
| X (Fail-Safe Defaults) | PASS | Hook is fail-open; PR failure falls back to document |
| XII (Dual Module) | PASS | New hook is .cjs (CJS); installer changes in .js (ESM) |
| XIII (Hook Protocol) | PASS | Hook follows existing PostToolUse[Bash] pattern |
| XIV (Backward Compatible) | PASS | `code_review` section additive; existing installs unaffected |
| XVI (State Machine) | PASS | New state transitions documented; recovery path exists |

---

## 10. Technology Decisions

No new technology decisions required. This feature uses:
- Existing `gh` CLI for PR creation (already in settings.json `allow` list)
- Existing CJS hook pattern
- Existing `state.json` persistence
- Existing `text()` prompt from `lib/utils/prompts.js`

---

## 11. Summary

| Aspect | Value |
|--------|-------|
| Architecture approach | Workflow interstitial (not a new phase) |
| Files modified | 5 (orchestrator, installer, common.cjs, settings.json, uninstall.sh) |
| Files created | 2 (review-reminder.cjs, review-reminder.test.cjs) |
| New dependencies | None |
| State schema changes | Additive only (new `code_review` section) |
| Breaking changes | None |
| Backward compatibility | Full -- existing installs without `code_review` section default to disabled |
