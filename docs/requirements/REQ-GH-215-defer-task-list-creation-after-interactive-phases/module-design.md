# Module Design: GH-215

**Slug**: REQ-GH-215-defer-task-list-creation-after-interactive-phases
**Status**: Analyzed
**Confidence**: High
**Last Updated**: 2026-03-31
**Coverage**: Complete

---

## 1. Module Boundaries

### M1: isdlc.md command handler (MODIFY)
- **Responsibility**: Route commands, execute action handlers, run Phase-Loop Controller
- **Changes**:
  - Delete fix action handler block
  - Delete feature action handler block (alias)
  - Delete reverse-engineer action handler block (deprecated alias)
  - Update build handler: remove START_PHASE/computeStartPhase/partial analysis menus (steps 4a-4d), always start Phase 05, reject unanalyzed items, add artifact prefix branch naming
  - Preserve: BUILD-INIT COPY (GH-212 FR-004), TASK_CONTEXT INJECTION (GH-212 FR-007), 3d-relay (for custom workflows)
  - Update SCENARIO 3 menu options
  - Update intent detection table
  - Evaluate 3e-plan (keep for custom workflows) and 3e-refine (no-op when tasks.md exists)
- **Dependencies**: workflows.json, iteration-requirements.json, settings.json

### M2: workflows.json (MODIFY)
- **Responsibility**: Define available workflow types and their phase sequences
- **Changes**:
  - Remove: feature, feature-light, fix workflow definitions
  - Add: build workflow with phases ["05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]
  - Keep: test-run, test-generate, upgrade, reverse-engineer (all unchanged)
- **Dependencies**: None (read by hooks and Phase-Loop Controller)

### M3: iteration-requirements.json (MODIFY)
- **Responsibility**: Define per-phase iteration requirements and workflow overrides
- **Changes**:
  - Remove: workflow_overrides.fix block
  - Remove: workflow_overrides.feature block
  - Phase-level requirements (01-requirements, 02-tracing, etc.) stay — they apply to analyze path
- **Dependencies**: None (read by hooks)

### M4: Hook updates (MODIFY)
- **Responsibility**: Enforce workflow rules at runtime
- **Files**: gate-blocker.cjs, state-write-validator.cjs, phase-sequence-guard.cjs, branch-guard.cjs, common.cjs
- **Changes**:
  - gate-blocker: Remove fix/feature override lookups
  - state-write-validator: Add "build" to allowed active_workflow.type values
  - Others: Verify no hardcoded "fix" or "feature" string literals
- **Dependencies**: workflows.json, iteration-requirements.json

### M5: Skill wrappers — Claude Code (CREATE)
- **Responsibility**: Provide /add, /analyze, /build as top-level slash commands
- **Files**: src/claude/commands/add.md, analyze.md, build.md
- **Interface**: Each parses user args and emits ARGUMENTS: {action} {args} to invoke isdlc.md
- **Dependencies**: isdlc.md

### M6: Codex projections (CREATE)
- **Responsibility**: Provide equivalent commands for Codex provider
- **Files**: src/providers/codex/commands/add.md, analyze.md, build.md
- **Interface**: Codex projection bundle format, delegates to same core logic
- **Dependencies**: isdlc.md (via Codex projection layer)

### M7: Documentation (MODIFY)
- **Responsibility**: Reflect new command model
- **Files**: CLAUDE.md, constitution.md, sdlc-orchestrator.md, workflow-tasks-template.md, README.md, hackability-roadmap.md
- **Changes**: Update all references to fix/feature commands, document add/analyze/build as canonical

## 2. Interface Contracts

### Build handler branch naming
```
Input:  artifact_folder: string (e.g. "BUG-GH-42-login-crash")
Logic:  if (artifact_folder.startsWith("BUG-")) -> "bugfix/"
        else -> "feature/"
Output: branch name (e.g. "bugfix/BUG-GH-42-login-crash")
```

### Build handler analysis guard
```
Input:  meta.json from artifact folder
Logic:  if (meta.phases_completed does not include "01-requirements") -> reject
Output: error "Item not yet analyzed. Run /analyze first."
```

### Skill wrapper delegation
```
Input:  user args (e.g. "/add 'payment processing'")
Output: ARGUMENTS: add "payment processing"
```

## 3. Error Handling

| Error | Trigger | Response |
|-------|---------|----------|
| Removed command invoked | User types /isdlc fix or /isdlc feature | Display: "The fix/feature commands have been removed. Use /analyze to analyze and /build to implement." |
| Unanalyzed item passed to build | meta.json missing or phases_completed empty | Display: "Item not yet analyzed. Run /analyze first." |
| Unknown artifact prefix | Folder name doesn't start with BUG- or REQ- | Default to feature/ branch prefix (Article X fail-safe) |
| Skill wrapper framework not installed | /add invoked without iSDLC | Display: "iSDLC framework not installed. Run init-project.sh first." |
