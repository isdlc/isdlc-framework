# Design Summary: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## Overview

User-space hooks add a general-purpose extension mechanism to iSDLC. Developers create hook subdirectories in `.isdlc/hooks/`, configure triggers via `hook.yaml`, and the framework executes them at the corresponding workflow lifecycle moments. Hooks are part of the Claude Code ecosystem -- the authoring guide is a brief reference linking to Claude Code documentation for detailed concepts.

## Key Design Decisions

1. **Separate engine in harness layer** (ADR-001): User-space hooks run via a new `user-hooks.cjs` module in `src/claude/hooks/lib/`. Completely isolated from the 26 existing framework hooks. Different execution model (shell + exit codes vs. JSON stdin/stdout), different user content directory (`.isdlc/hooks/` vs. `src/claude/hooks/`).

2. **Per-hook subdirectories with config-driven triggers** (ADR-002): Each hook lives in its own subdirectory (`.isdlc/hooks/my-hook/`) with `hook.yaml`, entry point script, and `logs/` directory. Triggers are declared in `hook.yaml` via a full phase checklist -- hooks don't fire unless explicitly configured.

3. **Phase alias resolution via template** (ADR-003): A `hook-template.yaml` is shipped with install/update, listing all phases with `pre-`/`post-` combinations. Users copy the template, set triggers to `true`. Engine resolves friendly names internally.

4. **Environment variable context** (ADR-004): Workflow context passed via `ISDLC_*` environment variables. Universal access from any language.

5. **Agent retry before user escalation** (ADR-005): Hook blocks are governance/quality signals. The agent reads hook output, assesses severity, attempts a fix, and retries (up to 3 per hook). Escalates to user only after exhaustion. Leverages Claude Code's built-in self-correction.

## Directory Structure

```
.isdlc/hooks/
  hook-template.yaml              (shipped with framework, refreshed on update)
  validate-xml/
    hook.yaml                     (triggers, timeout, severity, etc.)
    hook.sh                       (entry point script)
    logs/                         (execution logs, auto-created)
  sast-scan/
    hook.yaml
    hook.sh
    logs/
```

## Hook Configuration (`hook.yaml`)

- `name`, `description` -- identity
- `entry_point` -- script filename (default: `hook.sh`)
- `triggers` -- full phase checklist (all default to `false`)
- `timeout_ms` -- per-hook timeout (default: 60000)
- `retry_limit` -- retries before escalation (default: 3)
- `severity` -- `minor` | `major` | `critical` (guides agent fix scope)
- `outputs` -- files the hook produces

## Hook Point Pattern

| Pattern | When It Fires |
|---------|--------------|
| `pre-workflow` | After workflow initialization |
| `pre-{phase}` | Before a phase executes |
| `post-{phase}` | After a phase completes |
| `pre-gate` | Before gate validation |
| `post-workflow` | After workflow finalization |

## Safety Model

- Exit 0 = pass, Exit 1 = warning, Exit 2 = block
- Blocks at pre-gate: agent retry (3x per hook), then user escalation
- Blocks at other hook points: downgraded to warnings
- Per-hook configurable timeout with kill enforcement
- Hook failures never crash the framework
- Misconfiguration detected at session start (warnings only)

## Module Structure

- **`src/claude/hooks/lib/user-hooks.cjs`** (new): Core engine -- `executeHooks`, `scanHooks`, `discoverHooksForTrigger`, `buildContext`, `validateHookConfigs`
- **3 integration points**: `phase-advance.cjs` (pre-gate + post-phase), `workflow-init.cjs` (pre-workflow), `workflow-finalize.cjs` (post-workflow)
- **Template**: `.isdlc/hooks/hook-template.yaml` -- shipped with install, refreshed on update
- **Authoring guide**: `docs/isdlc/user-hooks.md` -- brief reference with Claude Code doc links
