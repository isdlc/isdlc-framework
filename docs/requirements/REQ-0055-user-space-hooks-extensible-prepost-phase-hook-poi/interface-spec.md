# Interface Specification: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Public API: `user-hooks.cjs`

### 1.1 `executeHooks(hookPoint: string, context: HookContext): HookResult`

Execute all hooks configured for the given hook point.

**Parameters**:
- `hookPoint` (string, required): Hook point identifier. Accepts both friendly names (`post-implementation`) and internal names (`post-06-implementation`). Special hook points `pre-workflow`, `post-workflow`, and `pre-gate` are used as-is (no phase resolution).
- `context` (HookContext, required): Workflow context for environment variable injection.

**Returns**: `HookResult` -- aggregated execution results. Never throws.

**Example**:
```javascript
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');
const ctx = buildContext(state);
const result = executeHooks('pre-gate', ctx);
if (result.blocked) {
  // Handle block -- output HOOK_BLOCKED for agent retry
}
```

### 1.2 `buildContext(state: object): HookContext`

Build a HookContext from the current state.json content.

**Parameters**:
- `state` (object, required): Parsed state.json content with `active_workflow` field.

**Returns**: `HookContext`

### 1.3 `validateHookConfigs(projectRoot: string): HookWarning[]`

Check for misconfigured hooks and return warnings.

**Parameters**:
- `projectRoot` (string, required): Absolute path to project root.

**Returns**: `HookWarning[]` -- list of misconfiguration warnings. Empty array if all hooks are valid.

---

## 2. `hook.yaml` Schema

```yaml
# Required
name: string              # Hook identifier
description: string       # Human-readable description

# Optional (defaults shown)
entry_point: hook.sh      # Script filename relative to hook directory
severity: minor           # minor | major | critical
retry_limit: 3            # Max retries before user escalation
timeout_ms: 60000         # Timeout per execution in milliseconds
outputs: []               # List of output file names (informational)

# Required for hook to fire
triggers:                 # Full phase checklist
  pre-workflow: false
  post-workflow: false
  pre-gate: false
  pre-{phase}: false      # For each phase
  post-{phase}: false     # For each phase
```

All trigger keys default to `false`. A hook with no triggers set to `true` will never fire (and generates a misconfiguration warning at session start).

---

## 3. Environment Variable Contract

When executing a hook script, the following environment variables are set:

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `ISDLC_PHASE` | string | `06-implementation` | Current phase identifier |
| `ISDLC_WORKFLOW_TYPE` | string | `feature` | Workflow type |
| `ISDLC_SLUG` | string | `REQ-0055-user-space-hooks` | Workflow slug |
| `ISDLC_PROJECT_ROOT` | string | `/home/user/my-project` | Absolute path to project root |
| `ISDLC_ARTIFACT_FOLDER` | string | `docs/requirements/REQ-0055-user-space-hooks` | Artifact folder (relative path, empty string if N/A) |
| `ISDLC_HOOK_POINT` | string | `pre-gate` | The hook point being executed |

All variables are strings. Empty string for absent values (never undefined).

---

## 4. Exit Code Contract

| Exit Code | Status | Framework Behavior |
|-----------|--------|-------------------|
| 0 | Pass | Continue normally |
| 1 | Warning | Show output to user, continue |
| 2 | Block | Report to agent for retry (up to `retry_limit`), then escalate to user |
| 3+ | Warning | Treated same as exit 1 (unknown codes are non-fatal) |
| -1 (internal) | Timeout/Error | Hook timed out or crashed; reported as warning |

---

## 5. Directory Convention

```
.isdlc/hooks/
  hook-template.yaml       # Shipped with framework; user copies to create new hooks
  {hook-name}/             # One subdirectory per hook
    hook.yaml              # Configuration (triggers, timeout, severity, etc.)
    hook.sh                # Entry point script (or hook.py, hook.js, etc.)
    logs/                  # Execution logs (auto-created by engine)
```

**Hook naming**: Subdirectory name is the hook identifier. Use descriptive names: `validate-xml`, `sast-scan`, `notify-slack`.

**Script format**: Any executable. The framework runs scripts via `sh {scriptPath}`. For non-shell scripts, use a shebang line: `#!/usr/bin/env python3`.

**Execution order**: When multiple hooks match the same trigger point, they execute in alphabetical order by subdirectory name. Use numeric prefixes for explicit ordering: `01-lint/`, `02-test/`.

---

## 6. Output Contract: `phase-advance.cjs`

When a user hook blocks gate advancement, `phase-advance.cjs` outputs:

```json
{
  "result": "HOOK_BLOCKED",
  "phase": "06-implementation",
  "hook": "sast-scan",
  "hook_output": "Critical vulnerability found in auth.js:42",
  "severity": "critical",
  "message": "User hook \"sast-scan\" blocked gate advancement"
}
```

This is a new result type alongside the existing `ADVANCED`, `BLOCKED`, `WORKFLOW_COMPLETE`, and `ERROR` results.

| Field | Type | Description |
|-------|------|-------------|
| `result` | `"HOOK_BLOCKED"` | Distinguishes user-hook blocks from gate-requirement blocks |
| `phase` | string | Current phase |
| `hook` | string | Name of the blocking hook (subdirectory name) |
| `hook_output` | string | Captured stdout from the hook |
| `severity` | `"minor"` \| `"major"` \| `"critical"` | From hook.yaml; guides agent fix scope |
| `message` | string | Human-readable description |

---

## 7. Misconfiguration Warning Contract

`validateHookConfigs()` returns an array of warnings:

```javascript
[
  {
    hookName: 'my-validator',
    issue: 'Missing hook.yaml configuration file',
    suggestion: 'Copy hook-template.yaml to .isdlc/hooks/my-validator/hook.yaml and configure triggers'
  },
  {
    hookName: 'sast-scan',
    issue: 'No triggers set to true -- hook will never fire',
    suggestion: 'Edit .isdlc/hooks/sast-scan/hook.yaml and set at least one trigger to true'
  }
]
```

---

## 8. Internal Interface: Phase Alias Map

```javascript
// Exported for testing, not part of public API
const PHASE_ALIASES = {
  'quick-scan':       '00-quick-scan',
  'requirements':     '01-requirements',
  'impact-analysis':  '02-impact-analysis',
  'architecture':     '03-architecture',
  'design':           '04-design',
  'test-strategy':    '05-test-strategy',
  'implementation':   '06-implementation',
  'testing':          '07-testing',
  'code-review':      '08-code-review',
  'local-testing':    '11-local-testing',
  'upgrade-plan':     '15-upgrade-plan',
  'upgrade-execute':  '15-upgrade-execute',
  'quality-loop':     '16-quality-loop',
  'tracing':          '02-tracing'
};
```

Resolution algorithm:
1. For non-phase hook points (`pre-workflow`, `post-workflow`, `pre-gate`): use as-is
2. For phase-based hook points: extract prefix (`pre-`/`post-`) and phase portion
3. If phase portion matches an alias key: construct resolved name with internal identifier
4. If phase portion matches an internal identifier directly: use as-is
5. If no match: log warning, return null (hook point skipped)
