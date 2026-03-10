# Data Flow: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Hook Discovery Flow

```
Trigger Point (e.g., phase-advance.cjs)
  |
  v
executeHooks(hookPoint, context)
  |
  v
scanHooks(projectRoot)
  |-- Read .isdlc/hooks/ subdirectories
  |-- Skip files (e.g., hook-template.yaml)
  |-- For each subdirectory:
  |     Read hook.yaml -> parse config
  |     Missing hook.yaml? -> skip (warn at session start)
  |-- Sort alphabetically by subdirectory name
  |
  v
discoverHooksForTrigger(hookPoint, hooks)
  |-- Resolve hookPoint via alias map
  |-- Filter hooks where triggers[hookPoint] === true
  |     (check both friendly and resolved trigger keys)
  |
  v
[hookConfig1, hookConfig2, ...]
```

## 2. Hook Execution Flow

```
For each hookConfig in discovery order:
  |
  v
executeOneHook(hookConfig, context)
  |
  |-- Resolve entry point: hookConfig.dir + hookConfig.entryPoint
  |
  |-- Build env vars from context:
  |     ISDLC_PHASE, ISDLC_WORKFLOW_TYPE, ISDLC_SLUG,
  |     ISDLC_PROJECT_ROOT, ISDLC_ARTIFACT_FOLDER, ISDLC_HOOK_POINT
  |
  |-- spawnSync('sh', [scriptPath], { env, timeout: hookConfig.timeoutMs, cwd })
  |
  |-- Capture stdout, stderr, exitCode, duration
  |
  |-- Interpret exit code:
  |     0 -> pass
  |     1 -> warning
  |     2 -> block
  |     3+ -> warning
  |     timeout -> timeout
  |     error -> error
  |
  |-- Write log entry to hookConfig.dir/logs/
  |
  v
HookEntry { name, exitCode, stdout, stderr, durationMs, status, severity }
```

## 3. Result Aggregation Flow

```
All HookEntry results collected
  |
  v
Aggregate into HookResult:
  |-- blocked = any entry.status === 'block'
  |-- warnings = entries where status === 'warning'
  |-- blockingHook = first entry with status === 'block' (or null)
  |     includes severity from hookConfig
  |
  v
Return to caller (phase-advance.cjs / workflow-init.cjs / workflow-finalize.cjs)
```

## 4. Block Handling Flow (Agent Retry)

```
phase-advance.cjs outputs HOOK_BLOCKED
  { result: "HOOK_BLOCKED", hook: "sast-scan", hook_output: "...", severity: "critical" }
  |
  v
Orchestrator agent receives output
  |
  v
Agent reads hook_output + severity
  |-- severity: minor -> targeted file fix
  |-- severity: major -> broader rework
  |-- severity: critical -> fundamental issue review
  |
  v
Agent attempts fix (edits files, adjusts code)
  |
  v
Agent re-triggers: node phase-advance.cjs
  |-- Hook re-runs as part of pre-gate
  |
  |-- Pass (exit 0)?
  |     YES -> Gate proceeds, workflow continues
  |     NO  -> Block again (retry count++)
  |
  v
Retry count >= 3 for this hook?
  |-- NO  -> Agent retries (loop back)
  |-- YES -> Escalate to user:
  |           - Bulleted summary of all 3 failure outputs
  |           - Hook name, description, severity
  |           - User decides: fix manually, skip, override
```

## 5. Integration Point Flows

### 5.1 Pre-Gate (phase-advance.cjs)

```
phase-advance.cjs main()
  |
  v
buildContext(state) -> HookContext
  |
  v
executeHooks('pre-gate', ctx)
  |
  |-- blocked?
  |     YES -> output HOOK_BLOCKED (with severity), exit(1)
  |     NO  -> continue to gate validation
  |
  v
[existing gate validation logic]
  |
  v
[advance phase]
  |
  v
executeHooks('post-{completedPhase}', ctx)  // non-blocking
  |
  v
output ADVANCED
```

### 5.2 Pre-Workflow (workflow-init.cjs)

```
workflow-init.cjs main()
  |
  v
[initialize workflow state]
  |
  v
executeHooks('pre-workflow', ctx)  // informational
  |
  v
[create branch, output INITIALIZED]
```

### 5.3 Post-Workflow (workflow-finalize.cjs)

```
workflow-finalize.cjs main()
  |
  v
[merge branch, update state]
  |
  v
executeHooks('post-workflow', ctx)  // informational
  |
  v
output FINALIZED
```

## 6. Misconfiguration Detection Flow (Session Start)

```
Session start (harness initialization)
  |
  v
validateHookConfigs(projectRoot)
  |
  |-- Scan .isdlc/hooks/ subdirectories
  |
  |-- For each subdirectory:
  |     Missing hook.yaml?
  |       -> warn: "Found {name} without configuration"
  |     hook.yaml exists but no triggers true?
  |       -> warn: "{name} has no triggers -- will never fire"
  |     hook.yaml has triggers but no entry point script?
  |       -> warn: "{name} has triggers but no script"
  |
  v
Return HookWarning[] to harness
  |
  v
Harness displays warnings to user (informational, non-blocking)
```

## 7. Template Delivery Flow (Install/Update)

```
install.sh / update.sh
  |
  v
Create .isdlc/hooks/ directory (if not exists)
  |
  v
Copy hook-template.yaml to .isdlc/hooks/hook-template.yaml
  |-- On install: fresh copy
  |-- On update: overwrite template (refreshes phase list)
  |
  v
Preserve all user hook subdirectories (never touch)
```
