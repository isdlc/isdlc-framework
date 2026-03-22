/**
 * Claude Adapter — Entry Point
 * ==============================
 * Claude adapter boundary for iSDLC (REQ-0087).
 *
 * Exports the Claude-specific adapter interface:
 * - getClaudeConfig() — Provider identity and framework directory
 * - getHookRegistration() — Hook registration config
 * - getProjectionPaths() — .claude/ directory projection paths
 *
 * @module src/providers/claude
 */

export { getClaudeConfig } from './projection.js';
export { getHookRegistration } from './hooks.js';
export { getProjectionPaths } from './projection.js';
