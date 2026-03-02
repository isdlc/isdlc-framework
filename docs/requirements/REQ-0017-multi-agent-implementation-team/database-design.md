# Database Design: Multi-Agent Implementation Team

**Feature:** REQ-0017-multi-agent-implementation-team
**Phase:** 03-architecture
**Created:** 2026-02-15
**Status:** Accepted

---

## Overview

This project does not use a traditional database. All state is stored in `.isdlc/state.json` (a JSON file). This document defines the state.json schema extensions required for the implementation team feature.

---

## 1. Schema Extension: implementation_loop_state

A new field `implementation_loop_state` is added to `active_workflow` in state.json. This field tracks the per-file review loop progress during Phase 06 when the implementation team is active.

### 1.1 Schema Definition

```json
{
  "active_workflow": {
    "implementation_loop_state": {
      "phase": "06-implementation",
      "status": "in_progress | completed | aborted",
      "started_at": "ISO-8601 timestamp",
      "completed_at": "ISO-8601 timestamp | null",
      "total_files_planned": "integer | null",
      "files_completed": ["file_path_1", "file_path_2"],
      "files_remaining": ["file_path_3"],
      "current_file": "file_path | null",
      "current_cycle": "integer (1-3)",
      "per_file_reviews": [
        {
          "file": "relative file path",
          "verdict": "PASS | REVISE | MAX_ITERATIONS",
          "cycles": "integer (1-3)",
          "findings_count": {
            "blocking": "integer",
            "warning": "integer",
            "info": "integer"
          },
          "cycle_history": [
            {
              "cycle": 1,
              "verdict": "REVISE",
              "blocking": 2,
              "warning": 1,
              "timestamp": "ISO-8601"
            },
            {
              "cycle": 2,
              "verdict": "PASS",
              "blocking": 0,
              "warning": 0,
              "timestamp": "ISO-8601"
            }
          ],
          "deferred_warnings": ["W-002: Complex naming refactor"],
          "disputes": [
            {
              "finding_id": "B-003",
              "rationale": "Function is pure with no side effects; null check unnecessary",
              "accepted": false
            }
          ]
        }
      ],
      "summary": {
        "total_files": "integer",
        "passed_first_review": "integer",
        "required_revision": "integer",
        "average_cycles": "float",
        "max_iterations_warnings": "integer"
      }
    }
  }
}
```

### 1.2 Field Descriptions

| Field | Type | Required | Description | Traces To |
|-------|------|----------|-------------|-----------|
| `phase` | string | Yes | Always "06-implementation" | FR-006 |
| `status` | enum | Yes | in_progress, completed, aborted | AC-006-02, Article XVI |
| `started_at` | ISO-8601 | Yes | When the per-file loop started | NFR-004 |
| `completed_at` | ISO-8601 | No | When the per-file loop finished (null while in_progress) | NFR-004 |
| `total_files_planned` | integer | No | Total files in task plan (null until Writer starts) | AC-003-06 |
| `files_completed` | string[] | Yes | Array of file paths that passed review | AC-006-02 |
| `files_remaining` | string[] | Yes | Array of file paths not yet reviewed | AC-006-02 |
| `current_file` | string | No | File currently being reviewed (null between files) | NFR-004 |
| `current_cycle` | integer | No | Current Reviewer-Updater cycle for current_file (1-3) | NFR-004 |
| `per_file_reviews` | array | Yes | Per-file review results | AC-006-02, NFR-004 |
| `per_file_reviews[].file` | string | Yes | Relative file path | AC-003-06 |
| `per_file_reviews[].verdict` | enum | Yes | PASS, REVISE (interim), or MAX_ITERATIONS (final) | AC-001-08 |
| `per_file_reviews[].cycles` | integer | Yes | Total cycles for this file (1-3) | AC-003-05, NFR-004 |
| `per_file_reviews[].findings_count` | object | Yes | Final findings count by severity | NFR-004 |
| `per_file_reviews[].cycle_history` | array | Yes | Per-cycle verdict and findings | NFR-004 |
| `per_file_reviews[].deferred_warnings` | string[] | No | WARNING findings deferred to Phase 16 | AC-002-02 |
| `per_file_reviews[].disputes` | array | No | Disputed findings with rationale | AC-002-05 |
| `summary` | object | No | Populated when status=completed | AC-003-06 |

### 1.3 State Transitions

```
initialization --> in_progress: Created when Phase 06 starts with debate_mode=true
in_progress --> in_progress: Updated after each file review cycle
in_progress --> completed: All files processed (PASS or MAX_ITERATIONS)
in_progress --> aborted: Error during loop (Article X: fail-safe)
```

### 1.4 Lifecycle

| Event | Action | Article |
|-------|--------|---------|
| Phase 06 starts, debate_mode=true | Create implementation_loop_state with status="in_progress" | XVI |
| Writer produces a file | Update current_file, add to files_remaining if not already there | XVI |
| Reviewer reviews a file | Add/update entry in per_file_reviews, update cycle_history | XVI |
| File passes review | Move from files_remaining to files_completed, set verdict=PASS | XVI |
| File hits max cycles | Move to files_completed, set verdict=MAX_ITERATIONS | XVI |
| All files processed | Set status="completed", populate summary, set completed_at | XVI |
| Loop aborted (error) | Set status="aborted", log in history | X, XVI |

---

## 2. Detection by Downstream Agents

Phase 16 and Phase 08 agents use this field to determine their scope:

```
// Phase 16 (quality-loop-engineer) and Phase 08 (qa-engineer)
IF active_workflow.implementation_loop_state exists
   AND active_workflow.implementation_loop_state.status == "completed":
     // Implementation team ran successfully
     // Use reduced scope (final sweep / human review only)
ELSE:
     // Implementation team did not run (debate off, light mode, etc.)
     // Use full scope (unchanged behavior)
```

This detection is fail-safe: if the field is absent, missing, or has status != "completed", agents default to full scope (Article X).

---

## 3. Relationship to Existing State Fields

```
active_workflow:
  debate_mode: true/false          <-- Shared: resolveDebateMode() for both DEBATE/IMPLEMENTATION
  debate_state: {...}              <-- Existing: DEBATE_ROUTING state (Phases 01/03/04)
  implementation_loop_state: {...} <-- NEW: IMPLEMENTATION_ROUTING state (Phase 06)
```

The two state objects are independent:
- `debate_state` tracks per-artifact Creator/Critic/Refiner rounds for Phases 01/03/04
- `implementation_loop_state` tracks per-file Writer/Reviewer/Updater cycles for Phase 06
- Both are created/updated independently during their respective phases
- Both use the same `debate_mode` flag for activation

---

## 4. Example: Complete implementation_loop_state After Successful Loop

```json
{
  "implementation_loop_state": {
    "phase": "06-implementation",
    "status": "completed",
    "started_at": "2026-02-15T10:30:00Z",
    "completed_at": "2026-02-15T10:45:00Z",
    "total_files_planned": 4,
    "files_completed": [
      "src/claude/hooks/tests/widget.test.cjs",
      "src/claude/hooks/lib/widget.cjs",
      "src/claude/agents/05-widget-agent.md",
      "src/claude/hooks/config/widget-config.json"
    ],
    "files_remaining": [],
    "current_file": null,
    "current_cycle": null,
    "per_file_reviews": [
      {
        "file": "src/claude/hooks/tests/widget.test.cjs",
        "verdict": "PASS",
        "cycles": 1,
        "findings_count": { "blocking": 0, "warning": 0, "info": 1 },
        "cycle_history": [
          { "cycle": 1, "verdict": "PASS", "blocking": 0, "warning": 0, "timestamp": "2026-02-15T10:32:00Z" }
        ],
        "deferred_warnings": [],
        "disputes": []
      },
      {
        "file": "src/claude/hooks/lib/widget.cjs",
        "verdict": "PASS",
        "cycles": 2,
        "findings_count": { "blocking": 0, "warning": 0, "info": 0 },
        "cycle_history": [
          { "cycle": 1, "verdict": "REVISE", "blocking": 2, "warning": 1, "timestamp": "2026-02-15T10:35:00Z" },
          { "cycle": 2, "verdict": "PASS", "blocking": 0, "warning": 0, "timestamp": "2026-02-15T10:38:00Z" }
        ],
        "deferred_warnings": ["W-001: Consider extracting helper function"],
        "disputes": []
      },
      {
        "file": "src/claude/agents/05-widget-agent.md",
        "verdict": "PASS",
        "cycles": 1,
        "findings_count": { "blocking": 0, "warning": 1, "info": 0 },
        "cycle_history": [
          { "cycle": 1, "verdict": "PASS", "blocking": 0, "warning": 1, "timestamp": "2026-02-15T10:40:00Z" }
        ],
        "deferred_warnings": [],
        "disputes": []
      },
      {
        "file": "src/claude/hooks/config/widget-config.json",
        "verdict": "PASS",
        "cycles": 1,
        "findings_count": { "blocking": 0, "warning": 0, "info": 0 },
        "cycle_history": [
          { "cycle": 1, "verdict": "PASS", "blocking": 0, "warning": 0, "timestamp": "2026-02-15T10:42:00Z" }
        ],
        "deferred_warnings": [],
        "disputes": []
      }
    ],
    "summary": {
      "total_files": 4,
      "passed_first_review": 3,
      "required_revision": 1,
      "average_cycles": 1.25,
      "max_iterations_warnings": 0
    }
  }
}
```

---

## 5. Migration Strategy

**No migration required.** The `implementation_loop_state` field is additive:
- It is only created when Phase 06 starts with `debate_mode=true`
- It does not modify existing fields in state.json
- Existing workflows that do not use the implementation team will never see this field
- Phase 16/08 agents default to full scope when the field is absent (fail-safe)

---

## 6. Backup and Recovery

State.json is managed by the iSDLC framework:
- Atomic read-modify-write (Article XVI)
- Append-only history array for audit trail
- If `implementation_loop_state` becomes corrupted, the orchestrator can re-initialize it from the file system (check which files exist) and resume the loop from the last completed file

---

## 7. Indexing and Query Patterns

state.json is read as a whole JSON object. No indexing is needed. Key access patterns:

| Consumer | Query | Frequency |
|----------|-------|-----------|
| Orchestrator (per-file loop) | `active_workflow.implementation_loop_state.current_file` | Per file (during Phase 06) |
| Orchestrator (post-loop) | `active_workflow.implementation_loop_state.summary` | Once (end of Phase 06) |
| Phase 16 agent | `active_workflow.implementation_loop_state.status` | Once (start of Phase 16) |
| Phase 08 agent | `active_workflow.implementation_loop_state.status` | Once (start of Phase 08) |
| Hooks (gate-blocker) | `active_workflow.implementation_loop_state` existence check | Per gate |
