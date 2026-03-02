# Architecture Overview: REQ-0005 Advisory Hooks Phase 2

**Version:** 1.0
**Date:** 2026-02-09
**Predecessor:** REQ-0004 Architecture (same patterns)

---

## ADR-001: Reuse Phase 1 Hook Architecture

**Status:** Accepted
**Context:** Phase 2 adds 7 hooks to the same infrastructure Phase 1 created.
**Decision:** Reuse all Phase 1 patterns without modification: CJS hooks, stdin/stdout JSON protocol, common.cjs library, settings.json registration, fail-open behavior.
**Consequences:** Faster implementation, proven patterns, no new integration risks.

## ADR-002: Centralized Logging via JSONL File

**Status:** Accepted
**Context:** FR-08 requires centralized logging for all hooks.
**Decision:** Add `logHookEvent()` to common.cjs that appends JSONL entries to `.isdlc/hook-activity.log`. This is a file-based approach rather than a database or in-memory store.
**Rationale:**
- JSONL (one JSON object per line) is simple to write and parse
- File append is atomic at line level on most filesystems
- No additional dependencies (uses fs.appendFileSync)
- Rotation at 1MB prevents unbounded growth
- `.isdlc/` directory already exists and is gitignored
**Consequences:** Log file must be rotated; concurrent writes are not a concern (single-process model).

## ADR-003: PreToolUse[Write/Edit] for Read-Only Enforcement

**Status:** Accepted
**Context:** FR-04 needs to block file writes during Chat/Explore mode.
**Decision:** Register explore-readonly-enforcer.cjs on both PreToolUse[Write] and PreToolUse[Edit] matchers.
**Rationale:** PreToolUse is the only hook point that can block before a write occurs. PostToolUse cannot undo writes.
**Consequences:** Creates two new PreToolUse matcher sections in settings.json. Must verify Claude Code supports these matchers (expected to work based on documentation).

## ADR-004: Chat/Explore State Flag Protocol

**Status:** Accepted
**Context:** The explore-readonly-enforcer needs to know when Chat/Explore mode is active.
**Decision:** The discover-orchestrator sets `state.json.chat_explore_active = true` when entering Chat/Explore mode and `false` when exiting. The hook reads this flag.
**Rationale:** State.json is the canonical communication channel between agents and hooks. A simple boolean flag is sufficient.
**Consequences:** Requires a minor prompt addition to the discover-orchestrator agent. Fail-open: if the flag is missing, the hook allows writes (conservative default).

---

## Component Architecture

```
                    ┌──────────────────────────────┐
                    │      Claude Code Runtime      │
                    │  (PreToolUse / PostToolUse)    │
                    └───────────┬───────────────────┘
                                │ stdin JSON
                    ┌───────────┴───────────────────┐
                    │                               │
            ┌───────┴───────┐               ┌───────┴───────┐
            │  PreToolUse   │               │  PostToolUse  │
            │  (blocking)   │               │ (observational)│
            └───────┬───────┘               └───────┬───────┘
                    │                               │
    ┌───────────────┼───────────────┐   ┌───────────┼──────────────────┐
    │               │               │   │           │                  │
  [Task]         [Skill]      [Write/Edit]  [Task]      [Bash]       [Write]
    │               │               │        │           │              │
 test-adequacy  const-iter   explore-ro    phase-trans  atdd-compl  output-fmt
 -blocker       -validator   -enforcer     -enforcer    -validator   -validator
                                           menu-halt
                                           -enforcer

All hooks use:
  common.cjs { readStdin, readState, outputBlockResponse, debugLog, logHookEvent }
```

## Settings.json Hook Order (After Phase 2)

### PreToolUse[Task] (8 hooks)
1. iteration-corridor.cjs (existing)
2. skill-validator.cjs (existing)
3. phase-loop-controller.cjs (Phase 1)
4. plan-surfacer.cjs (Phase 1)
5. phase-sequence-guard.cjs (Phase 1)
6. gate-blocker.cjs (existing)
7. constitution-validator.cjs (existing)
8. **test-adequacy-blocker.cjs** (NEW - Phase 2)

### PreToolUse[Skill] (3 hooks)
1. iteration-corridor.cjs (existing)
2. gate-blocker.cjs (existing)
3. **constitutional-iteration-validator.cjs** (NEW - Phase 2)

### PreToolUse[Bash] (1 hook)
1. branch-guard.cjs (Phase 1)

### PreToolUse[Write] (1 hook) -- NEW SECTION
1. **explore-readonly-enforcer.cjs** (NEW - Phase 2)

### PreToolUse[Edit] (1 hook) -- NEW SECTION
1. **explore-readonly-enforcer.cjs** (NEW - Phase 2)

### PostToolUse[Task] (6 hooks)
1. log-skill-usage.cjs (existing)
2. menu-tracker.cjs (existing)
3. walkthrough-tracker.cjs (Phase 1)
4. discover-menu-guard.cjs (Phase 1)
5. **phase-transition-enforcer.cjs** (NEW - Phase 2)
6. **menu-halt-enforcer.cjs** (NEW - Phase 2)

### PostToolUse[Skill] (1 hook)
1. skill-delegation-enforcer.cjs (existing)

### PostToolUse[Bash] (3 hooks)
1. test-watcher.cjs (existing)
2. review-reminder.cjs (existing)
3. **atdd-completeness-validator.cjs** (NEW - Phase 2)

### PostToolUse[Write] (2 hooks)
1. state-write-validator.cjs (Phase 1)
2. **output-format-validator.cjs** (NEW - Phase 2)

### PostToolUse[Edit] (1 hook)
1. state-write-validator.cjs (Phase 1)

**Total hooks after Phase 2: 25** (11 original + 7 Phase 1 + 7 Phase 2)

## Logging Architecture

```
logHookEvent(hookName, eventType, details)
  │
  ├── Build JSONL entry: { ts, hook, event, phase, agent, reason }
  ├── Append to .isdlc/hook-activity.log
  ├── Check file size > 1MB → rotate (keep newest 500 lines)
  └── On any error → swallow (never fail)
```

Log entry format:
```json
{"ts":"2026-02-09T10:15:00.123Z","hook":"branch-guard","event":"block","phase":"06-implementation","reason":"Commit to main blocked"}
```
