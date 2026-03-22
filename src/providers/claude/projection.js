/**
 * Claude Adapter — Projection
 * =============================
 * .claude/ directory projection management (REQ-0087).
 *
 * Manages CLAUDE.md template, settings.json, command markdown
 * packaging paths for the Claude Code provider.
 *
 * @module src/providers/claude/projection
 */

/**
 * Get the Claude provider configuration.
 * Returns identity and framework directory information.
 *
 * @returns {{ provider: string, frameworkDir: string, settingsTemplate: string }}
 */
export function getClaudeConfig() {
  return {
    provider: 'claude',
    frameworkDir: '.claude',
    settingsTemplate: '.claude/settings.json'
  };
}

/**
 * Get the projection paths for the .claude/ directory structure.
 * All paths are relative to the project root.
 *
 * @returns {{ claudeMd: string, settingsJson: string, commandsDir: string, hooksDir: string, agentsDir: string, skillsDir: string }}
 */
export function getProjectionPaths() {
  return {
    claudeMd: 'CLAUDE.md',
    settingsJson: '.claude/settings.json',
    commandsDir: 'src/claude/commands',
    hooksDir: 'src/claude/hooks',
    agentsDir: 'src/claude/agents',
    skillsDir: 'src/claude/skills'
  };
}
