# Task Plan: REQ-GH-215 defer-task-list-creation-after-interactive-phases

Format: v2.0

## Phase 05: Test Strategy -- PENDING

- [ ] T0001 Design test cases for workflow command removal — verify fix/feature commands are rejected, build workflow type accepted by hooks, SCENARIO 3 menu renders Add/Analyze/Build | traces: FR-001, FR-002, FR-004
- [ ] T0002 Design test cases for build handler simplification — verify build always starts at Phase 05, rejects unanalyzed items, infers branch naming from artifact prefix | traces: FR-006
- [ ] T0003 Design test cases for standalone slash commands — verify /add /analyze /build delegate correctly for Claude and Codex providers | traces: FR-008

## Phase 06: Implementation -- PENDING

- [ ] T0004 Remove fix and feature-light workflow definitions from workflows.json, add build workflow definition | traces: FR-001, FR-002
  files: src/isdlc/config/workflows.json (MODIFY)
  blocks: [T0005, T0010]
- [ ] T0005 Remove fix workflow overrides from iteration-requirements.json | traces: FR-001
  files: src/claude/hooks/config/iteration-requirements.json (MODIFY)
  blocked_by: [T0004]
  blocks: [T0010]
- [ ] T0006 Remove fix action handler from isdlc.md | traces: FR-001
  files: src/claude/commands/isdlc.md (MODIFY)
  blocks: [T0008]
- [ ] T0007 Remove feature action handler and reverse-engineer alias from isdlc.md | traces: FR-002
  files: src/claude/commands/isdlc.md (MODIFY)
  blocks: [T0008]
- [ ] T0008 Update build handler — remove START_PHASE/computeStartPhase/partial analysis menus, always start Phase 05, reject unanalyzed items, infer branch naming from artifact prefix. Preserve BUILD-INIT COPY and TASK_CONTEXT INJECTION from GH-212 | traces: FR-006
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0006, T0007]
  blocks: [T0009]
- [ ] T0009 Update SCENARIO 3 menu — Add/Analyze/Build/Run Tests/Generate Tests/View Status/Upgrade | traces: FR-004
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0008]
- [ ] T0010 Update hooks — gate-blocker remove fix/feature overrides, state-write-validator add build type, verify phase-sequence-guard/branch-guard/common.cjs have no hardcoded fix/feature refs | traces: FR-001, FR-002
  files: src/claude/hooks/gate-blocker.cjs (MODIFY), src/claude/hooks/state-write-validator.cjs (MODIFY), src/claude/hooks/lib/common.cjs (MODIFY)
  blocked_by: [T0004, T0005]
- [ ] T0011 Update constitution — preamble, Article IX, Article II enforcement note, workflow config section | traces: FR-001
  files: docs/isdlc/constitution.md (MODIFY)
- [ ] T0012 Update intent detection table in CLAUDE.md — reroute fix/feature signals to analyze/build | traces: FR-003
  files: CLAUDE.md (MODIFY)
  blocks: [T0016]
- [ ] T0013 Create /add, /analyze, /build skill wrappers for Claude Code | traces: FR-008
  files: src/claude/commands/add.md (CREATE), src/claude/commands/analyze.md (CREATE), src/claude/commands/build.md (CREATE)
  blocks: [T0015]
- [ ] T0014 Create Codex projection equivalents for add/analyze/build | traces: FR-008
  files: src/providers/codex/commands/add.md (CREATE), src/providers/codex/commands/analyze.md (CREATE), src/providers/codex/commands/build.md (CREATE)
  blocks: [T0015]
- [ ] T0015 Register new skills in settings.json and Codex settings | traces: FR-008
  files: .claude/settings.json (MODIFY)
  blocked_by: [T0013, T0014]
- [ ] T0016 Update CLAUDE.md — workflow-first development section, examples, key files, command references | traces: FR-003, FR-004
  files: CLAUDE.md (MODIFY)
  blocked_by: [T0012]
- [ ] T0017 Update sdlc-orchestrator.md — SCENARIO menus, workflow init, backlog picker | traces: FR-004
  files: src/claude/agents/sdlc-orchestrator.md (MODIFY)
- [ ] T0018 Update workflow-tasks-template.md — remove feature/fix sections, add build section | traces: FR-001, FR-002
  files: src/isdlc/templates/workflow-tasks-template.md (MODIFY)
- [ ] T0019 Evaluate 3e-plan and 3e-refine — 3e-plan stays for custom workflows, 3e-refine becomes no-op when tasks.md exists from analyze | traces: FR-001
  files: src/claude/commands/isdlc.md (MODIFY)
  blocked_by: [T0008]
- [ ] T0020 Update remaining docs — README, hackability-roadmap, AGENTS.md regeneration | traces: FR-003
- [ ] T0021 Dual-file sync — mirror all changes to root .isdlc/ and .claude/ | traces: FR-001
  blocked_by: [T0004, T0005, T0010, T0015]
- [ ] T0022 Update GH-215 issue description on GitHub | traces: FR-007

## Phase 16: Quality Loop -- PENDING

- [ ] T0023 Run full test suite, fix regressions from workflow removal
  blocked_by: [T0004, T0005, T0006, T0007, T0008, T0009, T0010]
- [ ] T0024 Verify hooks pass with build workflow type
  blocked_by: [T0010]

## Phase 08: Code Review -- PENDING

- [ ] T0025 Final review and merge
  blocked_by: [T0023, T0024]
