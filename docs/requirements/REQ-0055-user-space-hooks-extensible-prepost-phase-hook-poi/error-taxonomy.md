# Error Taxonomy: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Hook Execution Errors

| Code | Name | Severity | Recovery |
|------|------|----------|----------|
| `HOOK_TIMEOUT` | Hook exceeded timeout | Warning | Kill process, report to user, log to hook's `logs/`, continue workflow |
| `HOOK_CRASH` | Hook process crashed (signal/exception) | Warning | Report to user, log to hook's `logs/`, continue workflow |
| `HOOK_BLOCK` | Hook exited with code 2 | Block | Agent reads output, assesses severity, attempts fix, retries (up to `retry_limit`). Escalates to user after exhaustion. |
| `HOOK_WARNING` | Hook exited with code 1 or 3+ | Warning | Show output to user, log to hook's `logs/`, continue |
| `HOOK_NOT_FOUND` | No hooks match current trigger point | Silent | No action -- absence of matching hooks is normal |

## 2. Configuration Errors

| Code | Name | Severity | Recovery |
|------|------|----------|----------|
| `CONFIG_MISSING` | Hook subdirectory missing `hook.yaml` | Warning (session start) | Warn user to create config; hook is skipped at runtime |
| `CONFIG_PARSE_ERROR` | `hook.yaml` is invalid YAML | Warning | Log warning, skip this hook; other hooks still execute |
| `CONFIG_NO_TRIGGERS` | `hook.yaml` exists but no triggers set to `true` | Warning (session start) | Warn user that hook will never fire |
| `CONFIG_NO_SCRIPT` | `hook.yaml` has triggers but entry point script missing | Warning (session start) | Warn user that hook has no script to execute |

## 3. Resolution Errors

| Code | Name | Severity | Recovery |
|------|------|----------|----------|
| `ALIAS_UNRESOLVED` | Phase alias in trigger key not found in alias map | Warning | Log warning, skip this trigger key; other triggers still checked |
| `DIR_NOT_READABLE` | Hook directory exists but is not readable | Warning | Log warning, skip directory |

## 4. Error Propagation Rules

1. **Hook errors never crash the framework**: All errors from user hooks are caught and reported, never propagated as exceptions.
2. **Blocks trigger agent retry**: At pre-gate, a hook block drives the agent to fix the issue and retry (up to `retry_limit` per hook, default 3). After exhaustion, the user is escalated with a summary.
3. **Blocks only apply at pre-gate**: Only `pre-gate` hook blocks prevent gate advancement. Blocks at other hook points (post-phase, post-workflow) are downgraded to warnings since the operation has already occurred.
4. **Timeout is a warning, not a block**: A timed-out hook is killed and reported as a warning. If the developer wants timeout to block, they should handle it in their hook's error path (exit 2 on timeout).
5. **Multiple blocks**: If multiple hooks block at the same hook point, the first block is reported. Remaining hooks still execute (to surface all issues), but only the first blockingHook is highlighted in the result. The agent addresses blocks sequentially.
6. **Misconfiguration warnings are non-blocking**: Detected at session start, shown to user, but do not prevent workflow execution.
