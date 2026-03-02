# Interface & Module Design: Manual Code Review Break

**Document ID**: REQ-0002-DESIGN
**Feature**: Manual Code Review Break (Pause Point Before Merge)
**Design Date**: 2026-02-08
**Designer**: System Designer (Phase 04)

---

## 1. Module Overview

| Module | File | Type | Responsibility |
|--------|------|------|----------------|
| M1: State Schema | `lib/installer.js` | ESM | Define `code_review` schema in `generateState()` |
| M2: Team Size Prompt | `lib/installer.js` | ESM | Capture team size during `isdlc init` |
| M3: Common Utility | `src/claude/hooks/lib/common.cjs` | CJS | `readCodeReviewConfig()` function |
| M4: Review Reminder Hook | `src/claude/hooks/review-reminder.cjs` | CJS | PostToolUse[Bash] reminder on commits |
| M5: Orchestrator Review Protocol | `src/claude/agents/00-sdlc-orchestrator.md` | Markdown | Review pause, PR creation, A/B/R menu |
| M6: Hook Registration | `src/claude/settings.json` | JSON | Register review-reminder.cjs |
| M7: Uninstall Cleanup | `uninstall.sh` | Bash | Add hook to known list |

---

## 2. Module M1: State Schema (`generateState()`)

### Interface

```javascript
// In generateState() return object, add after iteration_enforcement:
code_review: {
  enabled: boolean,    // Default: false (or true if teamSize > 1)
  team_size: number    // Default: 1 (from installer prompt)
}
```

### Integration Point

```javascript
// lib/installer.js, generateState() function (line ~1013)
// Add between iteration_enforcement and skill_usage_log:

function generateState(projectName, isExistingProject, timestamp, teamSize = 1) {
  return {
    // ... existing fields ...
    iteration_enforcement: { enabled: true },
    code_review: {
      enabled: teamSize > 1,
      team_size: teamSize,
    },
    skill_usage_log: [],
    // ... rest of existing fields ...
  };
}
```

Also update `generateProjectState()` (monorepo) with the same `code_review` section.

### Backward Compatibility

Existing state.json files without `code_review` are treated as `{ enabled: false, team_size: 1 }` by all consumers. The `readCodeReviewConfig()` utility handles this default.

---

## 3. Module M2: Team Size Prompt

### Interface

```javascript
// After provider mode selection, before file copy step:
const teamSizeInput = await text(
  'How many developers will work on this project?',
  '1'
);
const teamSize = Math.max(1, parseInt(teamSizeInput, 10) || 1);
```

### Flow

```
Input: User types a number (or presses Enter for default)
Validation: parseInt(), NaN → 1, < 1 → 1
Output: teamSize (positive integer)

Side effects:
  - If teamSize > 1: logger.success('Human code review enabled (team_size > 1)')
  - If teamSize == 1: (no message)

Pass teamSize to generateState() call.
```

### Force Mode

When `--force` flag is active, skip the prompt and use default `teamSize = 1`.

---

## 4. Module M3: Common Utility (`readCodeReviewConfig()`)

### Interface

```javascript
/**
 * Read code_review configuration from state.json
 * @returns {{ enabled: boolean, team_size: number }}
 */
function readCodeReviewConfig() {
  try {
    const state = readState();
    if (state && state.code_review) {
      return {
        enabled: state.code_review.enabled === true,
        team_size: typeof state.code_review.team_size === 'number'
          ? state.code_review.team_size
          : 1
      };
    }
  } catch (e) {
    // Fail-open: return disabled
  }
  return { enabled: false, team_size: 1 };
}
```

### Usage

Called by `review-reminder.cjs` hook. May also be called by other hooks or utilities in the future.

### Export

Add to `module.exports` in `common.cjs`.

---

## 5. Module M4: Review Reminder Hook (`review-reminder.cjs`)

### Interface

```
Input:  stdin JSON from Claude Code (PostToolUse[Bash] event)
Output: stdout JSON message (if warning needed) or empty (exit 0)
```

### Pseudocode

```javascript
#!/usr/bin/env node

const { readStdin, readCodeReviewConfig, debugLog } = require('./lib/common.cjs');

async function main() {
  try {
    const input = await readStdin();
    if (!input) return;

    const parsed = JSON.parse(input);

    // Only trigger on git commit commands
    const command = parsed?.tool_input?.command || '';
    if (!isGitCommit(command)) return;

    // Read config
    const config = readCodeReviewConfig();

    // Only warn if disabled AND team > 1
    if (!config.enabled && config.team_size > 1) {
      const message = 'Manual code review is currently bypassed. ' +
        'If your team has grown beyond 1 developer, consider enabling it ' +
        'by setting code_review.enabled to true in .isdlc/state.json.';
      console.log(JSON.stringify({ warning: message }));
    }
  } catch (e) {
    debugLog('review-reminder error:', e.message);
    // Fail-open: exit silently
  }
}

function isGitCommit(command) {
  return /\bgit\s+commit\b/.test(command);
}

main();
```

### Performance

- stdin read: ~1ms
- JSON parse: ~1ms
- `readCodeReviewConfig()` (file I/O): ~5ms
- Regex test: < 1ms
- Total: < 10ms (well within 100ms budget)

---

## 6. Module M5: Orchestrator Review Protocol

### Interface (Markdown additions to `00-sdlc-orchestrator.md`)

#### New Section: "Review Pause Protocol"

Location: Insert before current Section 3a "Branch Merge (Workflow Completion)"

```markdown
## 3a-pre. Human Review Checkpoint (Before Merge)

When the final phase gate in a workflow passes AND the workflow has
`requires_branch: true`:

### Review Activation Check

1. Read `code_review` from state.json
2. IF `code_review.enabled == false`: skip to Branch Merge (Section 3a)
3. IF `code_review.enabled == true`: proceed with review pause

### Review Summary Generation

1. Create `docs/requirements/{artifact_folder}/review-summary.md`
2. Content:
   - Feature/fix description
   - Workflow type and phases completed
   - All artifacts produced (from phases[].artifacts in state.json)
   - Changed files (git diff main...HEAD --name-only)
   - Test results summary
   - Constitutional compliance status
3. Display summary to user

### PR Creation (Git Projects)

1. Check: `git rev-parse --is-inside-work-tree`
   - FAIL → generate review-request.md (non-git path)
2. Check: `which gh`
   - FAIL → inform user to create PR manually; continue with doc-only
3. Run: `gh pr create --title "[{prefix}-{NNNN}] {description}" --body-file review-summary.md --base main --head {branch}`
   - SUCCESS → record PR URL in active_workflow.review.pr_url
   - FAIL → log error, inform user to create PR manually; continue

### Review Menu

Present to user:
```
[A] Approve  -- Proceed to merge
[B] Bypass   -- Skip review with mandatory comment
[R] Reject   -- Cancel the workflow
```

### Menu Handling

- [A] Approve:
  1. Set active_workflow.review.outcome = "approved"
  2. Set active_workflow.review.completed_at = timestamp
  3. Proceed to Branch Merge (Section 3a)

- [B] Bypass:
  1. Prompt: "Enter bypass reason (minimum 10 characters):"
  2. Validate: len >= 10, re-prompt if too short
  3. Set active_workflow.review.bypass_reason = reason
  4. Set active_workflow.review.outcome = "bypassed"
  5. Append bypass reason to review-summary.md
  6. Log to state.json history[]
  7. Proceed to Branch Merge (Section 3a)

- [R] Reject:
  1. Execute workflow cancellation with reason "rejected at human review"
  2. Branch preserved (not deleted)
  3. Workflow moved to workflow_history with status "cancelled"
```

#### Exception to Section 4a

Add to Section 4a (Automatic Phase Transitions):

```markdown
### Exception: Human Review Checkpoint

The human review pause is the ONLY permitted interactive prompt
during automated workflow execution (besides Phase 01 elicitation).
It occurs AFTER all phase gates have passed but BEFORE the merge.
It is not a phase transition -- it is a merge pre-condition.
```

---

## 7. Module M6: Hook Registration

### Change to `src/claude/settings.json`

Add `review-reminder.cjs` to the existing `PostToolUse[Bash]` matcher:

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

---

## 8. Module M7: Uninstall Cleanup

### Change to `uninstall.sh`

Add `"review-reminder.cjs"` to the known hooks array (after `"common.cjs"`):

```bash
"gate-blocker.cjs"
"test-watcher.cjs"
"constitution-validator.cjs"
"menu-tracker.cjs"
"skill-validator.cjs"
"log-skill-usage.cjs"
"common.cjs"
"review-reminder.cjs"    # NEW
```

---

## 9. Error Taxonomy

| Error | Source | Handling | User Impact |
|-------|--------|----------|-------------|
| `gh` not installed | M5 (orchestrator) | Fall back to doc-only review | Low -- manual PR creation |
| `gh pr create` fails | M5 (orchestrator) | Log error, fall back to doc-only | Low -- manual PR creation |
| Non-numeric team size input | M2 (installer) | Default to 1 | None -- safe default |
| state.json missing `code_review` | M3 (common.cjs) | Return `{ enabled: false, team_size: 1 }` | None -- feature disabled |
| state.json read error in hook | M4 (hook) | Exit 0 silently | None -- fail-open |
| Bypass comment too short | M5 (orchestrator) | Re-prompt | None -- validation loop |
| Workflow stuck in paused_for_review | M5 (orchestrator) | `/sdlc cancel` clears it | Low -- recovery via cancel |
| git not initialized | M5 (orchestrator) | Generate review-request.md | Low -- non-git path |

---

## 10. Test Plan Outline

| Module | Test Type | Key Cases |
|--------|-----------|-----------|
| M1 | Unit | `generateState()` returns `code_review` with correct defaults; `teamSize > 1` sets `enabled: true` |
| M2 | Unit | Numeric input parsed; NaN defaults to 1; negative defaults to 1; force mode skips prompt |
| M3 | Unit | Returns config when present; defaults when missing; defaults on read error |
| M4 | Unit | Triggers on `git commit`; silent on other commands; warns when disabled + team > 1; silent when enabled; silent when team == 1; fails open on error |
| M5 | E2E | Full workflow with review pause; bypass flow; reject flow; non-git flow; disabled flow |
| M6 | Declarative | Verify settings.json has review-reminder.cjs registered |
| M7 | Manual | Verify uninstall removes review-reminder.cjs |

---

## 11. Implementation Dependency Graph

```
M1 (schema) ─────► M2 (prompt) ─────► [installer complete]
     │
     ▼
M3 (utility) ────► M4 (hook) ─────► M6 (registration)
                                          │
                                          ▼
                                     M7 (uninstall)

M5 (orchestrator) ── depends on M1 (schema exists in state.json)
                  ── depends on gh CLI (optional, graceful degradation)

Parallel-safe:
  - M1+M2 (installer) can be done in parallel with M3+M4 (hook)
  - M5 (orchestrator) can be done in parallel with M4 (hook)
  - M6+M7 (registration/cleanup) depend on M4 (hook file existing)
```
