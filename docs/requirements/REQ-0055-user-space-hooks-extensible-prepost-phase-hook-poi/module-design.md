# Module Design: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Module: `user-hooks.cjs`

**Location**: `src/claude/hooks/lib/user-hooks.cjs`
**Responsibility**: Discover, configure, execute, and log user-space hooks from `.isdlc/hooks/`
**Dependencies**: `child_process` (Node built-in), `fs`, `path`, `common.cjs` (co-located, for `getProjectRoot`)
**Optional dependency**: `js-yaml` or inline YAML parser for `hook.yaml` parsing
**Update safety**: This file lives in `src/claude/hooks/lib/` and is copied to `.claude/hooks/lib/` during install/update. The user's hook directories in `.isdlc/hooks/` are never touched by the updater.

---

## 2. Exported Functions

### 2.1 `executeHooks(hookPoint, context)`

Main entry point. Discovers and runs all hooks configured for the given hook point.

```javascript
/**
 * @param {string} hookPoint - e.g., 'pre-gate', 'post-implementation', 'post-workflow'
 * @param {HookContext} context - Workflow context for environment variable injection
 * @returns {HookResult} - Aggregated results from all hooks
 */
function executeHooks(hookPoint, context) { ... }
```

**Behavior**:
1. Scan `.isdlc/hooks/` for hook subdirectories with valid `hook.yaml`
2. Resolve hook point name (alias resolution)
3. Filter hooks to those with matching trigger for this hook point
4. Execute matching hooks sequentially (alphabetical by subdirectory name)
5. Write execution logs to each hook's `logs/` directory
6. Collect and return aggregated results

**Error handling**: Never throws. All errors are captured in the result object. A crashed hook is reported as a warning, not a block.

### 2.2 `scanHooks(projectRoot)`

Scans `.isdlc/hooks/` for configured hook subdirectories.

```javascript
/**
 * @param {string} projectRoot - Absolute path to project root
 * @returns {HookConfig[]} - List of parsed hook configurations
 */
function scanHooks(projectRoot) { ... }
```

**Behavior**:
1. Check if `.isdlc/hooks/` exists. If not, return empty array.
2. Read subdirectories (skip files like `hook-template.yaml`).
3. For each subdirectory, check for `hook.yaml`.
4. Parse `hook.yaml`, validate required fields, merge with defaults.
5. Return list of valid hook configs sorted alphabetically by subdirectory name.

### 2.3 `discoverHooksForTrigger(hookPoint, hooks)`

Filters scanned hooks to those matching the given trigger point.

```javascript
/**
 * @param {string} hookPoint - e.g., 'pre-gate', 'post-06-implementation'
 * @param {HookConfig[]} hooks - List from scanHooks()
 * @returns {HookConfig[]} - Hooks that have this trigger enabled
 */
function discoverHooksForTrigger(hookPoint, hooks) { ... }
```

**Behavior**:
1. Resolve hookPoint via alias map (e.g., `post-implementation` -> `post-06-implementation`).
2. For each hook config, check if `triggers[hookPoint]` is `true` (checking both friendly and internal names).
3. Return matching hooks in alphabetical order.

### 2.4 `buildContext(state)`

Builds a context object from the current workflow state.

```javascript
/**
 * @param {object} state - state.json content
 * @returns {HookContext}
 */
function buildContext(state) { ... }
```

### 2.5 `validateHookConfigs(projectRoot)`

Checks for misconfigured hooks and returns warnings.

```javascript
/**
 * @param {string} projectRoot - Absolute path to project root
 * @returns {HookWarning[]} - List of misconfiguration warnings
 */
function validateHookConfigs(projectRoot) { ... }
```

**Checks**:
1. Subdirectory exists but missing `hook.yaml` -> warn
2. `hook.yaml` exists but no triggers set to `true` -> warn (hook will never fire)
3. `hook.yaml` has triggers but entry point script missing -> warn (no script to execute)

---

## 3. Data Structures

### 3.1 `HookConfig`

```javascript
/**
 * @typedef {Object} HookConfig
 * @property {string} name - Hook name (subdirectory name)
 * @property {string} description - Human-readable description
 * @property {string} entryPoint - Script filename (default: 'hook.sh')
 * @property {string} dir - Absolute path to hook subdirectory
 * @property {Object<string, boolean>} triggers - Checklist of trigger points
 * @property {number} timeoutMs - Timeout in milliseconds (default: 60000)
 * @property {number} retryLimit - Max retries before escalation (default: 3)
 * @property {'minor'|'major'|'critical'} severity - Fix scope hint for agent
 * @property {string[]} outputs - Files the hook produces
 */
```

### 3.2 `HookContext`

```javascript
/**
 * @typedef {Object} HookContext
 * @property {string} phase - Current phase identifier (e.g., '06-implementation')
 * @property {string} workflowType - Workflow type (e.g., 'feature', 'fix')
 * @property {string} slug - Workflow slug
 * @property {string} projectRoot - Absolute path to project root
 * @property {string|null} artifactFolder - Artifact folder path (relative to project root)
 * @property {string} hookPoint - The hook point being executed
 */
```

### 3.3 `HookResult`

```javascript
/**
 * @typedef {Object} HookResult
 * @property {string} hookPoint - Resolved hook point name
 * @property {HookEntry[]} hooks - Results per hook
 * @property {boolean} blocked - True if any hook exited with code 2
 * @property {HookEntry[]} warnings - Hooks that exited with code 1 or 3+
 * @property {HookEntry|null} blockingHook - First hook that blocked (if any)
 */
```

### 3.4 `HookEntry`

```javascript
/**
 * @typedef {Object} HookEntry
 * @property {string} name - Hook subdirectory name
 * @property {number} exitCode - Process exit code
 * @property {string} stdout - Captured stdout
 * @property {string} stderr - Captured stderr
 * @property {number} durationMs - Execution duration
 * @property {'pass'|'warning'|'block'|'timeout'|'error'} status - Interpreted status
 * @property {'minor'|'major'|'critical'} severity - From hook.yaml
 */
```

### 3.5 `HookWarning`

```javascript
/**
 * @typedef {Object} HookWarning
 * @property {string} hookName - Subdirectory name
 * @property {string} issue - Description of the misconfiguration
 * @property {string} suggestion - Actionable suggestion for the user
 */
```

---

## 4. Phase Alias Map

```javascript
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

**Resolution logic for trigger matching**: For a trigger key like `post-implementation`:
1. Split on first `-` after `pre`/`post` prefix: prefix = `post`, phase = `implementation`
2. Look up `implementation` in `PHASE_ALIASES` -> `06-implementation`
3. Construct resolved trigger: `post-06-implementation`
4. Match against hook's trigger checklist (checking both friendly and resolved forms)

---

## 5. Hook Execution

```javascript
function executeOneHook(hookConfig, context) {
  const timeoutMs = hookConfig.timeoutMs || 60000;
  const scriptPath = path.join(hookConfig.dir, hookConfig.entryPoint);
  const env = {
    ...process.env,
    ISDLC_PHASE: context.phase,
    ISDLC_WORKFLOW_TYPE: context.workflowType,
    ISDLC_SLUG: context.slug,
    ISDLC_PROJECT_ROOT: context.projectRoot,
    ISDLC_ARTIFACT_FOLDER: context.artifactFolder || '',
    ISDLC_HOOK_POINT: context.hookPoint || ''
  };

  try {
    const start = Date.now();
    const result = spawnSync('sh', [scriptPath], {
      cwd: context.projectRoot,
      env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,  // 1MB stdout/stderr limit
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const durationMs = Date.now() - start;

    if (result.error && result.error.code === 'ETIMEDOUT') {
      return { name: hookConfig.name, exitCode: -1, stdout: '', stderr: 'Hook timed out', durationMs, status: 'timeout', severity: hookConfig.severity };
    }

    const exitCode = result.status ?? -1;
    const status = exitCode === 0 ? 'pass' : exitCode === 2 ? 'block' : 'warning';

    return {
      name: hookConfig.name,
      exitCode,
      stdout: (result.stdout || '').toString().trim(),
      stderr: (result.stderr || '').toString().trim(),
      durationMs,
      status,
      severity: hookConfig.severity
    };
  } catch (err) {
    return { name: hookConfig.name, exitCode: -1, stdout: '', stderr: err.message, durationMs: 0, status: 'error', severity: hookConfig.severity };
  }
}
```

---

## 6. Execution Logging

After each hook execution, write a log entry to the hook's `logs/` directory:

```javascript
function writeHookLog(hookConfig, entry) {
  const logsDir = path.join(hookConfig.dir, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logsDir, `${timestamp}.log`);
  const logContent = [
    `Hook: ${entry.name}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Hook Point: ${entry.hookPoint || 'unknown'}`,
    `Exit Code: ${entry.exitCode}`,
    `Status: ${entry.status}`,
    `Duration: ${entry.durationMs}ms`,
    `--- stdout ---`,
    entry.stdout || '(empty)',
    `--- stderr ---`,
    entry.stderr || '(empty)'
  ].join('\n');

  fs.writeFileSync(logFile, logContent, 'utf8');
}
```

---

## 7. Config Parsing

```javascript
function parseHookConfig(hookDir) {
  const yamlPath = path.join(hookDir, 'hook.yaml');
  if (!fs.existsSync(yamlPath)) return null;

  const raw = fs.readFileSync(yamlPath, 'utf8');
  const config = parseYaml(raw);  // lightweight YAML parser

  return {
    name: config.name || path.basename(hookDir),
    description: config.description || '',
    entryPoint: config.entry_point || 'hook.sh',
    dir: hookDir,
    triggers: config.triggers || {},
    timeoutMs: config.timeout_ms || 60000,
    retryLimit: config.retry_limit || 3,
    severity: config.severity || 'minor',
    outputs: config.outputs || []
  };
}
```

---

## 8. Hook Template

The `hook-template.yaml` shipped with the framework:

```yaml
# Hook Configuration Template
# Copy this file to .isdlc/hooks/<your-hook-name>/hook.yaml
# See docs/isdlc/user-hooks.md for details
# Claude Code hooks documentation: https://docs.anthropic.com/en/docs/claude-code/hooks

name: my-hook
description: Describe what this hook does
entry_point: hook.sh

# Severity hint for the agent when this hook blocks
# minor: targeted file fix | major: broader rework | critical: fundamental issue
severity: minor

# Max retries before escalating to user (default: 3)
retry_limit: 3

# Timeout per execution in milliseconds (default: 60000)
timeout_ms: 60000

# Files this hook produces (informational)
outputs: []

# Trigger checklist -- set to true for hook points where this hook should fire
triggers:
  pre-workflow:             false
  post-workflow:            false
  pre-gate:                 false

  pre-quick-scan:           false
  post-quick-scan:          false
  pre-requirements:         false
  post-requirements:        false
  pre-impact-analysis:      false
  post-impact-analysis:     false
  pre-architecture:         false
  post-architecture:        false
  pre-design:               false
  post-design:              false
  pre-test-strategy:        false
  post-test-strategy:       false
  pre-implementation:       false
  post-implementation:      false
  pre-testing:              false
  post-testing:             false
  pre-code-review:          false
  post-code-review:         false
  pre-local-testing:        false
  post-local-testing:       false
  pre-upgrade-plan:         false
  post-upgrade-plan:        false
  pre-upgrade-execute:      false
  post-upgrade-execute:     false
  pre-quality-loop:         false
  post-quality-loop:        false
  pre-tracing:              false
  post-tracing:             false
```

---

## 9. Integration Modifications

### 9.1 `phase-advance.cjs` Changes

Insert before gate validation:

```javascript
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');

// Before gate validation
const hookCtx = buildContext(state);
const preGateResult = executeHooks('pre-gate', hookCtx);
if (preGateResult.blocked) {
  output({
    result: 'HOOK_BLOCKED',
    phase: currentPhase,
    hook: preGateResult.blockingHook.name,
    hook_output: preGateResult.blockingHook.stdout,
    severity: preGateResult.blockingHook.severity,
    message: `User hook "${preGateResult.blockingHook.name}" blocked gate advancement`
  });
  process.exit(1);
}
```

Insert after successful advancement:

```javascript
// After advancement - fire post-phase hooks (non-blocking)
try {
  const postPhaseResult = executeHooks(`post-${currentPhase}`, hookCtx);
  // Warnings logged but don't block -- phase already advanced
} catch (e) { /* post-phase hooks are non-blocking */ }
```

### 9.2 `workflow-init.cjs` Changes

Insert after state write:

```javascript
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');
try {
  const hookCtx = buildContext(state);
  const preWorkflowResult = executeHooks('pre-workflow', hookCtx);
  // Pre-workflow hooks are informational -- blocks reported but don't prevent init
} catch (e) { /* non-blocking */ }
```

### 9.3 `workflow-finalize.cjs` Changes

Insert after merge, before final output:

```javascript
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');
try {
  const hookCtx = buildContext(state);
  const postWorkflowResult = executeHooks('post-workflow', hookCtx);
  // Post-workflow hooks are informational
} catch (e) { /* non-blocking */ }
```
