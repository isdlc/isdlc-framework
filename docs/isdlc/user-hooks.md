# User-Space Hooks

Create custom hooks that run at specific points in the iSDLC workflow.

## Quick Start

1. Copy the template:
   ```sh
   mkdir -p .isdlc/hooks/my-validator
   cp .isdlc/hooks/hook-template.yaml .isdlc/hooks/my-validator/hook.yaml
   ```

2. Edit `hook.yaml` -- set triggers to `true` for when your hook should fire:
   ```yaml
   name: my-validator
   description: Validate XML config before gate advancement
   entry_point: hook.sh
   severity: major
   triggers:
     pre-gate: true
   ```

3. Create `hook.sh` (or any executable):
   ```sh
   #!/bin/sh
   # Exit codes: 0=pass, 1=warning, 2=block
   if ! xmllint --noout config.xml 2>/dev/null; then
     echo "Invalid XML in config.xml"
     exit 2
   fi
   exit 0
   ```

4. Make it executable: `chmod +x .isdlc/hooks/my-validator/hook.sh`

## Hook Points

| Hook Point | When It Fires |
|------------|---------------|
| `pre-workflow` | After workflow initialization |
| `post-workflow` | After workflow finalization |
| `pre-gate` | Before gate validation (can block advancement) |
| `pre-{phase}` | Before a phase starts |
| `post-{phase}` | After a phase completes |

Phase names use friendly aliases: `implementation`, `requirements`, `architecture`, etc.

## Exit Codes

| Code | Effect |
|------|--------|
| 0 | Pass -- continue normally |
| 1 | Warning -- show output, continue |
| 2 | Block -- agent retries fix, then escalates to user |
| 3+ | Warning -- unknown codes are non-fatal |

## Environment Variables

Your hook script receives these environment variables:

| Variable | Example |
|----------|---------|
| `ISDLC_PHASE` | `06-implementation` |
| `ISDLC_WORKFLOW_TYPE` | `feature` |
| `ISDLC_SLUG` | `REQ-0055-user-space-hooks` |
| `ISDLC_PROJECT_ROOT` | `/home/user/my-project` |
| `ISDLC_ARTIFACT_FOLDER` | `docs/requirements/REQ-0055-user-space-hooks` |
| `ISDLC_HOOK_POINT` | `pre-gate` |

## hook.yaml Schema

```yaml
name: string              # Hook identifier (required)
description: string       # Human-readable description (required)
entry_point: hook.sh      # Script filename (default: hook.sh)
severity: minor           # minor | major | critical (default: minor)
retry_limit: 3            # Max retries before user escalation (default: 3)
timeout_ms: 60000         # Timeout per execution in ms (default: 60000)
outputs: []               # Files this hook produces (informational)
triggers:                 # Set to true for hook points where this hook should fire
  pre-workflow: false
  post-workflow: false
  pre-gate: false
  pre-{phase}: false
  post-{phase}: false
```

## Directory Structure

```
.isdlc/hooks/
  hook-template.yaml       # Template -- copy to create new hooks
  my-validator/            # One subdirectory per hook
    hook.yaml              # Configuration
    hook.sh                # Entry point script
    logs/                  # Execution logs (auto-created)
```

## Execution Order

Hooks fire in alphabetical order by subdirectory name. Use numeric prefixes for explicit ordering: `01-lint/`, `02-test/`.

## Logs

Each hook execution writes a timestamped log to `{hook-dir}/logs/`. Logs include stdout, stderr, exit code, and duration.
