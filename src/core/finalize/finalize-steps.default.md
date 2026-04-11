# Finalize Steps

<!--
  iSDLC Post-Workflow Finalization Checklist
  ==========================================
  This file defines the steps that run after all workflow phases complete.
  Each step is executed sequentially, with retry on failure.

  FORMAT: Same as tasks.md (parsed by task-reader.js)

  METADATA KEYS:
    critical   - true/false: halt finalization on failure if true
    fail_open  - true/false: warn and continue on failure if true
    max_retries - number: retry count on failure (default: 1)
    type       - internal|shell|mcp|provider: execution method

  CUSTOMIZATION:
    - Add your own steps (e.g., deploy docs, notify Slack)
    - Remove steps you don't need
    - Reorder steps (respect blocked_by dependencies)
    - Change retry counts or critical/fail_open flags

  TYPE VALUES:
    internal  - calls a named function from finalize-utils.js
    shell     - executes a shell command
    mcp       - MCP tool call (Claude Code only, skipped in other providers)
    provider  - provider-specific step (skipped when provider doesn't match)
-->

## Phase FN: Finalize -- PENDING

- [ ] F0001 Merge feature branch to main | critical: true, fail_open: false, max_retries: 1, type: internal
- [ ] F0002 Sync external status (GitHub/Jira/BACKLOG) | critical: false, fail_open: true, max_retries: 1, type: internal
- [ ] F0003 Move workflow to history and clear state | critical: true, fail_open: false, max_retries: 1, type: internal
  blocked_by: [F0001]
- [ ] F0004 Clean up session tasks | critical: false, fail_open: true, max_retries: 0, type: provider
  blocked_by: [F0003]
- [ ] F0005 Rebuild session cache | critical: false, fail_open: true, max_retries: 1, type: shell
  blocked_by: [F0003]
- [ ] F0006 Regenerate contracts | critical: false, fail_open: true, max_retries: 1, type: shell
  blocked_by: [F0003]
- [ ] F0007 Refresh code index | critical: false, fail_open: true, max_retries: 1, type: mcp
  blocked_by: [F0003]
- [ ] F0008 Rebuild memory embeddings | critical: false, fail_open: true, max_retries: 1, type: shell
  blocked_by: [F0003]
- [ ] F0009 Refresh code embeddings | critical: false, fail_open: true, max_retries: 1, type: internal
  blocked_by: [F0003]
