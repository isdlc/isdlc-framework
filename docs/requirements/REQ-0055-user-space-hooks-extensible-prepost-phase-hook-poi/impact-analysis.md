# Impact Analysis: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Blast Radius

### Tier 1: Direct Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/claude/hooks/lib/user-hooks.cjs` | **New** | Hook discovery, config parsing, execution engine, logging, misconfiguration detection (harness infrastructure) |
| `src/antigravity/phase-advance.cjs` | Modify | Add user-space hook execution before gate validation (pre-gate) and after phase completion (post-phase). Output `HOOK_BLOCKED` result type with severity. |
| `src/antigravity/workflow-init.cjs` | Modify | Add pre-workflow hook execution after initialization |
| `src/antigravity/workflow-finalize.cjs` | Modify | Add post-workflow hook execution before finalization completes |
| `docs/isdlc/user-hooks.md` | **New** | Brief hook authoring reference with Claude Code doc links |

### Tier 2: Transitive Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `install.sh` | Modify | Create `.isdlc/hooks/` directory and copy `hook-template.yaml` during install |
| `update.sh` | Modify | Refresh `hook-template.yaml` on update; document `.isdlc/hooks/` as preserved |
| `lib/updater.js` | Modify | Same as update.sh -- refresh template, preserve user hooks |
| `src/antigravity/ANTIGRAVITY.md.template` | Modify | Document user-space hook mechanism and `HOOK_BLOCKED` result type in orchestrator template |
| `src/claude/hooks/lib/common.cjs` | No change | `getProjectRoot()` imported directly by co-located user-hooks.cjs |
| `src/isdlc/hooks/hook-template.yaml` | **New** | Template file shipped with framework (source copy for install/update) |

### Tier 3: Side Effects

| Area | Risk | Description |
|------|------|-------------|
| Workflow execution time | Low | Each trigger point adds hook discovery scan + execution time. Mitigated by per-hook timeout enforcement. |
| Existing framework hooks | None | User-space hooks are architecturally separate. No interaction with the 26 existing Claude Code hooks. |
| State.json integrity | None | User hooks do not read or write state.json. Context passed via environment variables. |
| Agent retry overhead | Low | Agent retries add time when hooks block. Mitigated by severity-guided fix scope and 3-retry cap. |

---

## 2. Entry Points

| Entry Point | Integration Method |
|-------------|-------------------|
| `phase-advance.cjs` main() | Insert `executeHooks('pre-gate', ctx)` before gate validation logic (line ~69). Insert `executeHooks('post-{phase}', ctx)` after successful advancement. Handle `HOOK_BLOCKED` result type. |
| `workflow-init.cjs` main() | Insert `executeHooks('pre-workflow', ctx)` after state initialization, before output (line ~165). |
| `workflow-finalize.cjs` main() | Insert `executeHooks('post-workflow', ctx)` after merge/finalize, before final output (line ~134). |
| `install.sh` | Add step to create `.isdlc/hooks/` directory and copy `hook-template.yaml`. |
| `update.sh` Step 7 | Add `.isdlc/hooks/` to preserved list. Refresh `hook-template.yaml`. |

---

## 3. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hook execution failure crashes phase-advance | Medium | High | Wrap hook execution in try/catch; report failure but never throw from hook runner |
| Slow hooks delay workflow | Medium | Medium | Per-hook timeout enforcement (default 60s, configurable). Kill after timeout. |
| Hook blocks gate incorrectly | Low | Medium | 3-retry agent mechanism; user escalation with override capability |
| Misconfigured hooks cause confusion | Medium | Low | Runtime misconfiguration detection with actionable warnings at session start |
| Phase alias collision | Low | Low | Aliases are one-to-one; log resolved name for debugging |
| Template becomes stale after phase additions | Low | Low | Template refreshed on every update; derived from phase registry |

---

## 4. Implementation Order

1. **`src/isdlc/hooks/hook-template.yaml`** -- Template with full phase checklist (all `false` defaults)
2. **`src/claude/hooks/lib/user-hooks.cjs`** -- Core engine: discovery, config parsing (YAML), execution, timeout, exit code handling, logging, misconfiguration detection
3. **`phase-advance.cjs`** integration -- pre-gate and post-phase hooks, `HOOK_BLOCKED` output
4. **`workflow-init.cjs`** integration -- pre-workflow hooks
5. **`workflow-finalize.cjs`** integration -- post-workflow hooks
6. **`install.sh` + `update.sh` + `lib/updater.js`** -- Template delivery, hooks directory preservation
7. **`ANTIGRAVITY.md.template`** update -- Document in orchestrator template
8. **`docs/isdlc/user-hooks.md`** -- Brief authoring reference
9. **Tests** -- Unit tests for user-hooks.cjs (discovery, config parsing, execution, timeout, exit codes, logging, misconfiguration detection)

---

## 5. File Count

- **New**: 3 files (user-hooks.cjs, hook-template.yaml, user-hooks.md)
- **Modified**: 3 files (phase-advance.cjs, workflow-init.cjs, workflow-finalize.cjs)
- **Install/update modified**: 3 files (install.sh, update.sh, lib/updater.js)
- **Docs modified**: 1 file (ANTIGRAVITY.md.template)
- **Total**: 10 files
