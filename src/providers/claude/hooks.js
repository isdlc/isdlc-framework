/**
 * Claude Adapter — Hook Registration
 * =====================================
 * Defines which hooks are registered for the Claude provider,
 * their timing points, and timeout settings (REQ-0087).
 *
 * This reads from the settings.json template to define the hook
 * registration config. For now, it returns a static list matching
 * the current .claude/settings.json hooks section.
 *
 * @module src/providers/claude/hooks
 */

/**
 * Get the hook registration configuration for the Claude provider.
 * Each hook entry specifies:
 * - name: Hook identifier
 * - event: Claude Code hook event (PreToolUse, PostToolUse, Notification)
 * - command: The command to execute
 * - timeout: Timeout in ms (optional)
 *
 * @returns {Array<{name: string, event: string, command: string, timeout?: number}>}
 */
export function getHookRegistration() {
  return [
    {
      name: 'gate-blocker',
      event: 'PreToolUse',
      command: 'node src/claude/hooks/gate-blocker.cjs',
      timeout: 10000
    },
    {
      name: 'state-file-guard',
      event: 'PreToolUse',
      command: 'node src/claude/hooks/state-file-guard.cjs',
      timeout: 5000
    },
    {
      name: 'branch-guard',
      event: 'PreToolUse',
      command: 'node src/claude/hooks/branch-guard.cjs',
      timeout: 5000
    },
    {
      name: 'delegation-gate',
      event: 'PreToolUse',
      command: 'node src/claude/hooks/delegation-gate.cjs',
      timeout: 5000
    },
    {
      name: 'phase-sequence-guard',
      event: 'PreToolUse',
      command: 'node src/claude/hooks/phase-sequence-guard.cjs',
      timeout: 5000
    },
    {
      name: 'test-watcher',
      event: 'PostToolUse',
      command: 'node src/claude/hooks/test-watcher.cjs',
      timeout: 10000
    },
    {
      name: 'state-write-validator',
      event: 'PreToolUse',
      command: 'node src/claude/hooks/state-write-validator.cjs',
      timeout: 5000
    },
    {
      name: 'context-injector',
      event: 'Notification',
      command: 'node src/claude/hooks/context-injector.cjs',
      timeout: 10000
    }
  ];
}
