# Architecture Overview: GH-251 Track 1 — Task-Level Dispatch for test-generate

**Analysis Date**: 2026-04-12

---

## Architecture Options

### Option A: Workflow-context detection (Selected)
Phase 05 agent (`test-design-engineer`) detects test-generate mode by checking `WORKFLOW_TYPE` from workflow modifiers in the delegation prompt. When detected, it switches from TASK_CONTEXT consumption to scaffold-based task generation. All logic lives in the agent's behavior — no new code modules.

### Option B: Separate agent (Rejected)
Create a dedicated `test-generate-strategist` agent for test-generate Phase 05, distinct from the build's `test-design-engineer`. Rejected: clean separation but duplicates shared logic (ATDD, traceability, artifact writing) and introduces a new agent to maintain.

## Selected Architecture

- **Precondition gate**: Lives in `isdlc.md` test-generate handler, before workflow initialization. Glob `tests/characterization/**/*.characterization.*` — if empty, block with `/discover` guidance. No state.json, no workflow created.
- **Artifact folder**: Created during workflow init by the orchestrator (same as build). Naming: `TEST-GEN-{slug}`. meta.json follows v2 schema.
- **Phase 05 input switching**: `test-design-engineer` reads `WORKFLOW_TYPE` from workflow modifiers. When `test-generate`: scan scaffolds, classify, emit tasks.md. When `build`: existing TASK_CONTEXT path unchanged.
- **Task generation**: Phase 05 globs `tests/characterization/{domain}/*.characterization.*`, parses `AC-RE-{NNN}` from each file, classifies as unit/system, emits tasks.md with tier-ordered dependencies.
- **Phase 06 dispatch**: Zero changes to dispatch infrastructure. Existing `shouldUseTaskDispatch()` fires because phases `["05-test-strategy", "06-implementation"]` are already in `task_dispatch.phases` config and tasks.md will exist with sufficient tasks.

## Technology Decisions

- No new runtime dependencies — scaffold parsing uses Grep/Read tools already available to the agent.
- No new configuration keys in workflows.json — `task_dispatch` config already covers the needed phases.
- `isdlc.md` test-generate handler gains ~20 lines for the precondition gate check and artifact folder creation.
- `04-test-design-engineer.md` gains a new section: `# TEST-GENERATE MODE` describing the scaffold-to-tasks path.

### Dual-Provider Support

**Claude Code path**:
- isdlc.md handler checks precondition, delegates to orchestrator for init
- Phase 05 delegation includes `WORKFLOW_TYPE: test-generate` via workflow modifiers
- Phase 06 dispatches via Task tool — one scaffold per agent, parallel within tiers

**Codex path**:
- New projection bundle at `src/providers/codex/projections/test-generate.md`
- Same precondition gate via shell-based pre-flight check
- `WORKFLOW_TYPE: test-generate` included in projection prompt template
- Task dispatch: sequential within tiers via `codex exec` (no parallel Task tool)

## Integration Architecture

| Integration Point | Mechanism | Direction |
|-------------------|-----------|-----------|
| isdlc.md → orchestrator | Task tool delegation with ARTIFACT_FOLDER | Handler → orchestrator |
| orchestrator → test-design-engineer | Delegation prompt with WORKFLOW_TYPE modifier | Orchestrator → agent |
| test-design-engineer → tasks.md | File write (docs/isdlc/tasks.md) | Agent → filesystem |
| Phase-Loop Controller → task-dispatcher | shouldUseTaskDispatch() check | Controller → dispatcher |
| test-design-engineer → discover scaffolds | Read-only (Glob + Read tools) | Agent → filesystem |

## Assumptions and Inferences

| # | Assumption | Confidence |
|---|-----------|------------|
| A1 | Workflow modifiers are the right injection point — the Phase-Loop Controller already reads agent_modifiers from workflows.json and includes them in delegation prompts | High |
| A2 | Scaffold glob pattern `tests/characterization/**/*.characterization.*` is stable across discover versions | High |
| A3 | No new phase keys needed — test-generate uses the same 05-test-strategy and 06-implementation phase keys as build | High |
| A4 | Codex serial dispatch within tiers is functionally equivalent to Claude parallel dispatch | High |
