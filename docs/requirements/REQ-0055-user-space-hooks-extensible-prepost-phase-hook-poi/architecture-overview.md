# Architecture Overview: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Architecture Decision: Hook Execution Model

### ADR-001: Separate Engine vs. Extend Existing Hook System

**Context**: The framework has 26 existing hooks using Claude Code's JSON stdin/stdout protocol. User-space hooks need a simpler execution model (shell scripts with exit codes).

**Option A: Extend existing hook system** -- Add user-space hooks as a new hook type within `src/claude/hooks/`
- Pros: Single hook infrastructure, shared utilities
- Cons: Claude Code hooks have a specific JSON protocol (PreToolUse/PostToolUse/Stop); user hooks are shell scripts. Mixing creates coupling. A broken user hook could interfere with framework enforcement hooks.

**Option B: Separate engine** (SELECTED) -- New `user-hooks.cjs` module in `src/claude/hooks/lib/` (alongside `common.cjs` and `gate-logic.cjs`) with its own discovery and execution logic
- Pros: Clean isolation -- user hooks cannot affect framework hooks. Simpler API (exit codes vs. JSON). Independent timeout and error handling. Matches the "isolation between layers" design principle from the hackability roadmap. Lives in the shared harness infrastructure layer, accessible to any consumer (antigravity scripts, future tools). Follows the same pattern as user skills -- engine is framework code, user content is in `.isdlc/`.
- Cons: Minimal -- shares the `lib/` directory with framework hook utilities, but the module is self-contained.

**Decision**: Option B. The engine is harness infrastructure (like the user skills engine), not an antigravity-specific feature. Placing it in `src/claude/hooks/lib/` makes it available to any tool that uses the harness.

---

## 2. Architecture Decision: Directory Model

### ADR-002: Per-Hook Subdirectories vs. Per-Hook-Point Directories

**Context**: Hooks need a file system convention for organization and discovery.

**Option A: Per-hook-point directories** -- Hooks grouped by when they fire (`.isdlc/hooks/pre-gate/`, `.isdlc/hooks/post-implementation/`)
- Pros: Simple directory-as-trigger semantics
- Cons: A hook that fires on multiple phases needs to be duplicated or symlinked. No natural place for per-hook config or logs.

**Option B: Per-hook subdirectories with config-driven triggers** (SELECTED) -- Each hook gets its own directory under `.isdlc/hooks/` with `hook.yaml` declaring triggers
- Pros: Self-contained hooks (script + config + logs in one place). A single hook can fire on multiple phases via config. Natural location for per-hook logs. Clean to add/remove hooks. Scalable.
- Cons: Requires `hook.yaml` for trigger configuration (hooks won't fire without it -- explicit opt-in).

**Decision**: Option B. Per-hook subdirectories are cleaner, more scalable, and keep all hook assets together. The explicit opt-in via `hook.yaml` prevents accidental execution.

---

## 3. Architecture Decision: Phase Name Resolution Strategy

### ADR-003: Strict Matching vs. Alias Resolution

**Context**: Phases have internal identifiers (e.g., `06-implementation`) that are not intuitive for users to type in `hook.yaml` trigger keys.

**Option A: Strict matching only** -- User must use exact phase identifiers in trigger checklist
- Pros: No ambiguity, simple implementation
- Cons: Poor developer experience; requires documentation lookup for every trigger

**Option B: Alias resolution with template** (SELECTED) -- The `hook-template.yaml` uses friendly names in the trigger checklist. The engine resolves friendly names to internal identifiers.
- Pros: Good developer experience (`post-implementation: true` just works). Template makes all options visible. Internal names also accepted for power users.
- Cons: Alias map must be maintained. Mitigated by deriving aliases from phase identifiers (strip numeric prefix).

**Decision**: Option B. The template solves discoverability and the alias map is small (derived from the fixed phase library).

---

## 4. Architecture Decision: Hook-to-Framework Communication

### ADR-004: Environment Variables vs. JSON Stdin vs. Temporary File

**Context**: Hooks need workflow context (phase, workflow type, slug, project root) to make meaningful decisions.

**Option A: JSON stdin** -- Pipe workflow context as JSON to hook's stdin
- Pros: Structured data, extensible
- Cons: Requires hooks to parse JSON. Adds complexity for simple bash scripts.

**Option B: Environment variables** (SELECTED) -- Set `ISDLC_*` environment variables before execution
- Pros: Universal -- every language and shell can read environment variables. Simple for bash scripts (`$ISDLC_PHASE`). No parsing required. Easy to extend.
- Cons: Flat namespace (no nested data). Mitigated by keeping context shallow.

**Decision**: Option B. Environment variables are the simplest and most universally accessible mechanism.

---

## 5. Architecture Decision: Block Handling Strategy

### ADR-005: Immediate User Escalation vs. Agent Retry

**Context**: When a hook blocks (exit code 2), the framework needs a strategy for resolution. Hooks are governance/quality mechanisms.

**Option A: Immediate user escalation** -- Report block to user, user decides
- Pros: Simple, user always in control
- Cons: Interrupts flow for issues the agent could fix. Treats hooks as obstacles rather than quality signals.

**Option B: Agent retry with escalation** (SELECTED) -- Agent reads hook output, attempts fix, retries (up to 3 per hook). Escalates to user only after retry exhaustion.
- Pros: Treats hooks as quality enforcement. Agent handles fixable issues automatically. Leverages Claude Code's built-in self-correction. User only interrupted for genuine blockers.
- Cons: Retries add time. Mitigated by severity hints in `hook.yaml` guiding fix scope.

**Decision**: Option B. Hooks are quality/governance mechanisms. The agent should try to satisfy them before asking the user. 3 retries per hook, leveraging Claude Code's existing retry patterns.

---

## 6. Component Architecture

```
.isdlc/hooks/                          (User's project -- PRESERVED on update)
  hook-template.yaml                   (Shipped with install/update -- REFRESHED)
  validate-xml/
    hook.yaml                          (Config: triggers, timeout, severity, etc.)
    hook.sh                            (Entry point script)
    logs/                              (Execution logs -- auto-created)
  sast-scan/
    hook.yaml
    hook.sh
    logs/
  notify-slack/
    hook.yaml
    hook.py
    logs/

src/claude/hooks/lib/                  (Framework -- harness infrastructure)
  user-hooks.cjs         <-- NEW: Discovery + Execution engine
  common.cjs             <-- EXISTING: Shared utilities (getProjectRoot, readState)
  gate-logic.cjs         <-- EXISTING: Gate requirement checks

src/antigravity/                       (Framework -- workflow lifecycle)
  phase-advance.cjs      <-- MODIFIED: Calls user-hooks at pre-gate, post-phase
  workflow-init.cjs      <-- MODIFIED: Calls user-hooks at pre-workflow
  workflow-finalize.cjs  <-- MODIFIED: Calls user-hooks at post-workflow
```

### 6.1 `user-hooks.cjs` Responsibilities

1. **scanHooks(projectRoot)**: Scan `.isdlc/hooks/` for subdirectories. Read each `hook.yaml`. Return list of configured hooks.
2. **discoverHooksForTrigger(hookPoint, projectRoot)**: Filter scanned hooks to those with matching trigger. Resolve phase aliases.
3. **executeHooks(hookPoint, context)**: Run matching hooks sequentially (alphabetical by subdirectory name). Set env vars from context. Enforce per-hook timeout. Collect results. Write logs to hook's `logs/` directory.
4. **buildContext(state)**: Build context object from current workflow state.
5. **validateHookConfigs(projectRoot)**: Check for misconfigured hooks (missing yaml, no triggers, missing script). Return warnings list.

### 6.2 Integration Pattern

Each integration point follows the same pattern:

```javascript
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');

// In phase-advance.cjs, before gate validation:
const ctx = buildContext(state);
const preGateResults = executeHooks('pre-gate', ctx);
// If blocked: output HOOK_BLOCKED (agent handles retry)

// After successful advancement:
const postPhaseResults = executeHooks(`post-${previousPhase}`, ctx);
```

### 6.3 Result Object

```javascript
{
  hookPoint: 'pre-gate',
  hooks: [
    { name: 'validate-xml', exitCode: 0, stdout: '...', stderr: '', durationMs: 1200, status: 'pass' },
    { name: 'sast-scan', exitCode: 2, stdout: '...', stderr: '', durationMs: 5400, status: 'block' }
  ],
  blocked: true,
  warnings: [],
  blockingHook: { name: 'sast-scan', stdout: '...', severity: 'critical' }
}
```

---

## 7. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Engine language | Node.js (CJS) | Consistent with harness infrastructure (common.cjs, gate-logic.cjs) |
| Child process API | `spawnSync` | Sequential execution, timeout support via `timeout` option |
| Config format | YAML | Authoring ergonomics (comments, less syntax noise). Consistent with other user-facing configs. |
| Config location | Per-hook `hook.yaml` | Self-contained hooks; all assets in one directory |
| Template location | `.isdlc/hooks/hook-template.yaml` | Shipped with install/update; user copies to create new hooks |
| Alias derivation | Strip numeric prefix from phase ID | `06-implementation` -> `implementation`. Simple, predictable. |
| Log location | Per-hook `logs/` subdirectory | Keeps logs with the hook that produced them |

---

## 8. Integration Points

| Integration Point | Trigger | Hook Points Available |
|-------------------|---------|----------------------|
| `workflow-init.cjs` | After workflow state initialized | `pre-workflow` |
| `phase-advance.cjs` | Before gate validation | `pre-gate`, `pre-{next-phase}` |
| `phase-advance.cjs` | After successful advancement | `post-{completed-phase}` |
| `workflow-finalize.cjs` | After merge/finalize | `post-workflow` |

Note: `pre-{phase}` hooks for the next phase fire during phase-advance after the gate clears, before the next phase's agent starts.

---

## 9. Block Handling Flow

```
Hook exits with code 2 (block)
  |
  v
phase-advance.cjs outputs HOOK_BLOCKED
  { result: "HOOK_BLOCKED", hook: "sast-scan", hook_output: "...", severity: "critical" }
  |
  v
Orchestrator agent reads output
  |-- Assesses severity from hook output + hook.yaml severity field
  |-- Determines fix scope (targeted fix vs. broader rework)
  |
  v
Agent attempts fix
  |
  v
Agent re-triggers gate advancement (re-runs hooks)
  |-- Pass? -> Continue workflow
  |-- Block again? -> Retry (up to 3 per hook)
  |
  v
After 3 blocks from same hook:
  Agent escalates to user with bulleted summary:
  - Hook name and description
  - All 3 failure outputs
  - Suggested actions
  |
  v
User decides: fix manually, skip hook, override
```
