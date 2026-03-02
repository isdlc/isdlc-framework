# Impact Analysis: REQ-0005 Advisory Hooks Phase 2

**Generated**: 2026-02-09T10:15:00Z
**Feature**: Add 7 remaining enforcement hooks + centralized hook logging
**Based On**: Phase 01 Requirements (REQ-0005)
**Phase**: 02-impact-analysis

---

## Executive Summary

This feature adds 7 new CJS hook files and a centralized logging function to the existing 18-hook infrastructure, increasing the hook count by 39% (from 18 to 25). The blast radius is **MEDIUM** -- 7 new hook files, 7 new test files, plus modifications to 4 existing files (common.cjs, settings.json, uninstall.sh, .gitignore). Compared to Phase 1 (REQ-0004) which added 7 hooks and had MEDIUM blast radius, this phase has similar scope but is **lower risk** because the patterns are now proven: common.cjs utilities, settings.json registration, and test patterns are all established.

**Blast Radius**: MEDIUM (21 new files, 4+7 modified files)
**Risk Level**: LOW-MEDIUM
**New Files**: 14 (7 hooks + 7 test files)
**Modified Files**: 11 (common.cjs, settings.json, uninstall.sh, .gitignore, + 7 Phase 1 hooks for logging)

---

## Impact by Hook

### FR-01: phase-transition-enforcer.cjs (PostToolUse[Task])

**New files:**
- `src/claude/hooks/phase-transition-enforcer.cjs`
- `src/claude/hooks/tests/phase-transition-enforcer.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add to PostToolUse[Task] (currently 4 hooks: log-skill-usage, menu-tracker, walkthrough-tracker, discover-menu-guard)
- No common.cjs changes needed (uses readStdin, readState, debugLog)

**Dependencies (reads):**
- stdin (PostToolUse task output text)
- `.isdlc/state.json` (checks active_workflow existence)

**Risk**: LOW -- PostToolUse is observational only (warns, never blocks). Regex pattern matching is well-understood.

### FR-02: constitutional-iteration-validator.cjs (PreToolUse[Skill])

**New files:**
- `src/claude/hooks/constitutional-iteration-validator.cjs`
- `src/claude/hooks/tests/constitutional-iteration-validator.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add to PreToolUse[Skill] (currently 2 hooks: iteration-corridor, gate-blocker)

**Dependencies (reads):**
- stdin (Skill invocation -- check for /isdlc gate/advance)
- `.isdlc/state.json` (reads phases[phase].constitutional_validation)

**Risk**: MEDIUM -- This is a PreToolUse blocker on the Skill matcher. Must not interfere with iteration-corridor or gate-blocker. Must correctly distinguish gate-related from non-gate invocations.

**Interaction with gate-blocker.cjs**: gate-blocker already checks some constitutional fields. This hook is complementary -- gate-blocker checks iteration_requirements and elicitation; this hook checks constitutional_validation specifically. They should not conflict.

### FR-03: menu-halt-enforcer.cjs (PostToolUse[Task])

**New files:**
- `src/claude/hooks/menu-halt-enforcer.cjs`
- `src/claude/hooks/tests/menu-halt-enforcer.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add to PostToolUse[Task]

**Dependencies (reads):**
- stdin (PostToolUse task output -- scan for menu patterns)

**Risk**: LOW -- Observational only. The main challenge is accurately detecting "menu followed by too much output" without false positives. The 200-character threshold from the requirements spec is configurable and conservative.

### FR-04: explore-readonly-enforcer.cjs (PreToolUse[Write,Edit])

**New files:**
- `src/claude/hooks/explore-readonly-enforcer.cjs`
- `src/claude/hooks/tests/explore-readonly-enforcer.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add NEW PreToolUse[Write] section and NEW PreToolUse[Edit] section
- These are NEW matcher types that did not exist before (PostToolUse[Write/Edit] exists, but PreToolUse[Write/Edit] is new)

**Dependencies (reads):**
- stdin (Write/Edit tool_input.file_path)
- `.isdlc/state.json` (reads chat_explore_active flag)
- Common.cjs (readStdin, readState, outputBlockResponse)

**Risk**: MEDIUM -- Creates two new PreToolUse matcher sections. Must verify Claude Code supports PreToolUse on Write and Edit tools. Requires the discover-orchestrator to set `chat_explore_active: true` in state.json when entering Chat/Explore mode (this is a protocol addition).

**Protocol addition**: The discover-orchestrator agent file must document that Chat/Explore mode sets `state.json.chat_explore_active = true` on entry and `false` on exit. This is a lightweight agent prompt change, not a hook change.

### FR-05: atdd-completeness-validator.cjs (PostToolUse[Bash])

**New files:**
- `src/claude/hooks/atdd-completeness-validator.cjs`
- `src/claude/hooks/tests/atdd-completeness-validator.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add to PostToolUse[Bash] (currently 2 hooks: test-watcher, review-reminder)

**Dependencies (reads):**
- stdin (PostToolUse bash output -- test execution results)
- `.isdlc/state.json` (reads active_workflow for atdd_mode flag)

**Risk**: LOW -- Observational only. ATDD mode is rarely active (opt-in). The hook silently skips when ATDD is off, adding negligible overhead.

### FR-06: output-format-validator.cjs (PostToolUse[Write])

**New files:**
- `src/claude/hooks/output-format-validator.cjs`
- `src/claude/hooks/tests/output-format-validator.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add to PostToolUse[Write] (currently 1 hook: state-write-validator)

**Dependencies (reads):**
- stdin (PostToolUse Write tool_input.file_path)
- Written file content (fs.readFileSync)

**Risk**: LOW -- Observational only. Reads the file after it has been written to validate structure. Does not block or modify. Main concern is performance if very large files are written, mitigated by only reading files matching known artifact patterns.

### FR-07: test-adequacy-blocker.cjs (PreToolUse[Task])

**New files:**
- `src/claude/hooks/test-adequacy-blocker.cjs`
- `src/claude/hooks/tests/test-adequacy-blocker.test.cjs`

**Integration points:**
- `src/claude/settings.json` -- Add to PreToolUse[Task] (currently 7 hooks)

**Dependencies (reads):**
- stdin (Task delegation -- detect upgrade-engineer agent)
- `.isdlc/state.json` (reads discovery_context.coverage_summary)
- Uses existing detectPhaseDelegation from common.cjs

**Risk**: LOW -- Only triggers for upgrade-engineer delegations (rare). Uses same phase detection logic as Phase 1 hooks.

### FR-08: Centralized Hook Logging (common.cjs addition)

**Modified file:**
- `src/claude/hooks/lib/common.cjs` -- Add `logHookEvent()` function (~60 lines)

**Integration points:**
- 7 new hooks call logHookEvent() for their events
- 7 existing Phase 1 hooks updated to add logHookEvent() calls
- `.isdlc/hook-activity.log` -- New file (JSONL format)
- `.gitignore` -- Add hook-activity.log entry

**Risk**: LOW -- logHookEvent() is purely additive. It appends to a log file and never affects hook decisions. The fail-silent design means any I/O error is swallowed. Log rotation prevents unbounded growth.

---

## Integration Points Summary

| Integration Point | Current State | Change Required |
|---|---|---|
| `src/claude/settings.json` PreToolUse[Task] | 7 hooks | Add 1 more (test-adequacy-blocker) |
| `src/claude/settings.json` PreToolUse[Skill] | 2 hooks | Add 1 more (constitutional-iteration-validator) |
| `src/claude/settings.json` PreToolUse[Bash] | 1 hook | No change |
| `src/claude/settings.json` PreToolUse[Write] | Does NOT exist | Create new section (explore-readonly-enforcer) |
| `src/claude/settings.json` PreToolUse[Edit] | Does NOT exist | Create new section (explore-readonly-enforcer) |
| `src/claude/settings.json` PostToolUse[Task] | 4 hooks | Add 2 more (phase-transition-enforcer, menu-halt-enforcer) |
| `src/claude/settings.json` PostToolUse[Bash] | 2 hooks | Add 1 more (atdd-completeness-validator) |
| `src/claude/settings.json` PostToolUse[Write] | 1 hook | Add 1 more (output-format-validator) |
| `src/claude/settings.json` PostToolUse[Edit] | 1 hook | No change |
| `src/claude/hooks/lib/common.cjs` | 1297 lines | Add ~60 lines (logHookEvent + rotation) |
| `uninstall.sh` FRAMEWORK_PATTERNS | 14 CJS entries | Add 7 more entries |
| `.gitignore` | No hook-activity entry | Add hook-activity.log entry |
| Phase 1 hooks (7 files) | No logging calls | Add logHookEvent() calls (2-4 lines each) |

---

## Risk Matrix

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| PreToolUse[Write/Edit] not supported by Claude Code | HIGH | LOW | Test with a minimal stub hook first; documented as supported in Claude Code docs |
| constitutional-iteration-validator conflicts with gate-blocker | MEDIUM | LOW | Different check domains; test in isolation and together |
| common.cjs exceeds 1400 lines | LOW | HIGH | Acceptable; split backlog item exists |
| Hook timeout cascade (8 PreToolUse[Task] hooks) | MEDIUM | LOW | Each hook is fast (<100ms); total under 1s |
| Log rotation under concurrent writes | LOW | LOW | Single-process model; no concurrent hook execution |
| False positives in menu-halt-enforcer | MEDIUM | MEDIUM | Conservative 200-char threshold; observational only |
| False positives in phase-transition-enforcer | MEDIUM | MEDIUM | Only warn with active workflow; observational only |
| Existing 164 tests regress | MEDIUM | LOW | Run full suite after each hook; same mitigation as Phase 1 |

---

## Recommended Implementation Order

```
1. common.cjs (logHookEvent function)     -- unblocks all hooks
2. phase-transition-enforcer + tests       -- PostToolUse, simple regex
3. constitutional-iteration-validator + tests -- PreToolUse[Skill], medium complexity
4. menu-halt-enforcer + tests              -- PostToolUse, text analysis
5. explore-readonly-enforcer + tests       -- PreToolUse[Write/Edit], new matchers
6. atdd-completeness-validator + tests     -- PostToolUse[Bash], conditional
7. output-format-validator + tests         -- PostToolUse[Write], schema validation
8. test-adequacy-blocker + tests           -- PreToolUse[Task], uses existing detection
9. Update 7 Phase 1 hooks with logging     -- Add logHookEvent calls
10. settings.json registration             -- Register all new hooks
11. uninstall.sh + .gitignore updates      -- Cleanup
```

---

## Impact Analysis Metadata

```json
{
  "analysis_completed_at": "2026-02-09T10:20:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0005-advisory-hooks-phase2/requirements-spec.md",
  "predecessor": "docs/requirements/REQ-0004-advisory-behavior-hooks/impact-analysis.md",
  "scope_change_from_original": "none",
  "files_analyzed": {
    "existing_hooks": 18,
    "existing_hook_tests": 12,
    "existing_cjs_tests": 164,
    "settings_json_lines": 301,
    "common_cjs_lines": 1297,
    "new_files_planned": 14,
    "existing_files_modified": 11,
    "new_tests_planned": "70-85"
  }
}
```
