# Task Plan: BUG-GH-250

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 05-test-strategy | 1 | 1 | 0 |
| 06-implementation | 8 | 8 | 0 |
| 16-quality-loop | 0 | 0 | 0 |
| 08-code-review | 0 | 0 | 0 |
| **Total** | **9** | **9** | **0** |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 design-test-strategy-for-opt-in-enforcement | traces: FR-006, AC-250-01, AC-250-02, AC-250-03, AC-250-04, AC-250-05
  files: docs/requirements/BUG-GH-250-embeddings-opt-in-gap/test-strategy.md (CREATE)

## Phase 06: Implementation -- COMPLETE

- [X] T002 create-tests-for-generate-cli-opt-in | traces: FR-006, AC-250-01
  files: tests/bin/isdlc-embedding.test.js (CREATE)
  blocked_by: [T001]

- [X] T003 create-tests-for-server-refuse-to-start | traces: FR-006, AC-250-03
  files: tests/bin/isdlc-embedding-server.test.js (CREATE)
  blocked_by: [T001]

- [X] T004 create-tests-for-mcp-clean-exit | traces: FR-006, AC-250-04
  files: tests/bin/isdlc-embedding-mcp.test.js (CREATE)
  blocked_by: [T001]

- [X] T005 create-tests-for-discover-step79-pre-check | traces: FR-006, AC-250-02
  files: tests/claude/hooks/tests/discover-step79-optin.test.cjs (CREATE)
  blocked_by: [T001]

- [X] T006 add-opt-in-guard-and-interactive-prompt-to-generate-cli | traces: FR-006, AC-250-01
  files: bin/isdlc-embedding.js (MODIFY)
  blocked_by: [T002]

- [X] T007 add-opt-in-guard-and-refuse-to-start-to-embedding-server | traces: FR-006, AC-250-03
  files: bin/isdlc-embedding-server.js (MODIFY)
  blocked_by: [T003]

- [X] T008 add-module-level-opt-in-guard-and-clean-exit-to-mcp-bridge | traces: FR-006, AC-250-04
  files: bin/isdlc-embedding-mcp.js (MODIFY)
  blocked_by: [T004]

- [X] T009 add-step79-pre-check-bash-block-and-banner-note-to-discover-orchestrator | traces: FR-006, AC-250-02
  files: src/claude/agents/discover-orchestrator.md (MODIFY)
  blocked_by: [T005]

## Phase 16: Quality Loop -- PENDING

Handled automatically by quality-loop-engineer (parallel Track A/B: test execution + build verification + lint + type check + SAST + automated code review). No explicit tasks.

## Phase 08: Code Review -- PENDING

Handled automatically by qa-engineer (constitutional review + dual-file check). No explicit tasks.

## Dependency Graph

```
T001 (Phase 05 - test strategy design)
  |
  +-> T002, T003, T004, T005 (Phase 06 Tier 0 - test files, parallel, ATDD failing-first)
        |
        +-> T006 (blocked_by T002)
        +-> T007 (blocked_by T003)
        +-> T008 (blocked_by T004)
        +-> T009 (blocked_by T005)
              |
              +-> Phase 16 Quality Loop (automatic)
                    |
                    +-> Phase 08 Code Review (automatic)
```

Critical path: T001 -> T002 -> T006 -> Phase 16 -> Phase 08 (5 nodes, 4 edges).

Max parallelism tier: 4 tasks (T002/T003/T004/T005 in Tier 0; T006/T007/T008/T009 in Tier 1).

Task-level dispatch eligible: Phase 06 has 8 tasks >= `min_tasks_for_dispatch=3` per REQ-GH-220.

## Traceability Matrix

| Task | FR | AC | Files |
|------|-----|-----|-------|
| T001 | FR-006 | AC-250-01, AC-250-02, AC-250-03, AC-250-04, AC-250-05 | docs/requirements/BUG-GH-250-embeddings-opt-in-gap/test-strategy.md |
| T002 | FR-006 | AC-250-01 | tests/bin/isdlc-embedding.test.js |
| T003 | FR-006 | AC-250-03 | tests/bin/isdlc-embedding-server.test.js |
| T004 | FR-006 | AC-250-04 | tests/bin/isdlc-embedding-mcp.test.js |
| T005 | FR-006 | AC-250-02 | tests/claude/hooks/tests/discover-step79-optin.test.cjs |
| T006 | FR-006 | AC-250-01 | bin/isdlc-embedding.js |
| T007 | FR-006 | AC-250-03 | bin/isdlc-embedding-server.js |
| T008 | FR-006 | AC-250-04 | bin/isdlc-embedding-mcp.js |
| T009 | FR-006 | AC-250-02 | src/claude/agents/discover-orchestrator.md |

AC coverage: 5/5 (100%). All 4 violation sites addressed. 0 orphan tasks.

## Assumptions and Inferences

- **A1**: Tests are split into separate files per violation site (not bundled with production code) to enable Tier 0 parallel dispatch and ATDD `require_failing_test_first` enforcement.
- **A2**: All four sites use the same `hasUserEmbeddingsConfig` primitive, so T006-T009 share an import pattern — no helper extraction needed (Approach A from fix-strategy).
- **A3**: Phase 16 (quality-loop) and Phase 08 (code-review) do not decompose into tasks — the quality-loop-engineer and qa-engineer self-orchestrate their internal checks.
- **A4**: Test fixture helper for temp `.isdlc/config.json` (with/without `embeddings` key) is created inline in each test file, not extracted — 4 duplications of ~10 lines each is acceptable; extraction is scope-adjacent cleanup.
- **A5**: `src/claude/settings.json` stays unchanged — the fix uses clean-exit from the MCP bridge rather than conditional registration (Approach A, not Approach C from fix-strategy).
- **A6**: No dogfooding dual-file concern for this bug — `bin/*` files are top-level CLIs not duplicated in `.claude/`, and `src/claude/agents/discover-orchestrator.md` is symlinked via `.claude/agents/` so edits propagate automatically.
