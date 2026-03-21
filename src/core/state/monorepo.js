/**
 * Monorepo Support — REQ-0080 Group C
 *
 * Functions for monorepo detection, config management, and project resolution.
 * Extracted from common.cjs for shared core use.
 *
 * @module src/core/state/monorepo
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, parse } from 'node:path';

/**
 * Synchronous project root resolver.
 * Matches common.cjs getProjectRoot() behavior:
 *   1. CLAUDE_PROJECT_DIR env var
 *   2. Walk up directories looking for .isdlc/
 *   3. Default to cwd
 * @returns {string} Project root path
 * @private
 */
function _getProjectRootSync() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, '.isdlc'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}

/**
 * Check if this installation is in monorepo mode.
 * Monorepo mode is active when .isdlc/monorepo.json exists.
 * @returns {boolean} True if monorepo mode is active
 */
export function isMonorepoMode() {
  const projectRoot = _getProjectRootSync();
  return existsSync(join(projectRoot, '.isdlc', 'monorepo.json'));
}

/**
 * Read and parse monorepo.json
 * @returns {object|null} Parsed monorepo config or null
 */
export function readMonorepoConfig() {
  const projectRoot = _getProjectRootSync();
  const configFile = join(projectRoot, '.isdlc', 'monorepo.json');

  if (!existsSync(configFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(configFile, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Write monorepo.json
 * @param {object} config - Monorepo config to write
 * @returns {boolean} Success
 */
export function writeMonorepoConfig(config) {
  const projectRoot = _getProjectRootSync();
  const configFile = join(projectRoot, '.isdlc', 'monorepo.json');

  try {
    writeFileSync(configFile, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Resolve project ID from current working directory.
 * Matches CWD against registered project paths (longest prefix match).
 * @returns {string|null} Project ID or null if no match
 */
export function resolveProjectFromCwd() {
  if (!isMonorepoMode()) {
    return null;
  }

  const config = readMonorepoConfig();
  if (!config || !config.projects) {
    return null;
  }

  const projectRoot = _getProjectRootSync();
  const cwd = process.cwd();
  const relativeCwd = relative(projectRoot, cwd);

  if (relativeCwd.startsWith('..')) {
    return null;
  }

  let bestMatch = null;
  let bestMatchLength = -1;

  for (const [projectId, projectConfig] of Object.entries(config.projects)) {
    const projectPath = projectConfig.path;
    if (!projectPath) continue;

    const normalizedProjectPath = projectPath.replace(/\/+$/, '');

    if (relativeCwd === normalizedProjectPath ||
        relativeCwd.startsWith(normalizedProjectPath + '/')) {
      if (normalizedProjectPath.length > bestMatchLength) {
        bestMatch = projectId;
        bestMatchLength = normalizedProjectPath.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Get the active project ID in monorepo mode.
 * Resolution order:
 *   1. ISDLC_PROJECT env var
 *   2. CWD-based project detection
 *   3. monorepo.json default_project
 * @returns {string|null} Project ID or null if not in monorepo mode
 */
export function getActiveProject() {
  if (!isMonorepoMode()) {
    return null;
  }

  if (process.env.ISDLC_PROJECT) {
    return process.env.ISDLC_PROJECT;
  }

  const cwdProject = resolveProjectFromCwd();
  if (cwdProject) {
    return cwdProject;
  }

  const config = readMonorepoConfig();
  if (config && config.default_project) {
    return config.default_project;
  }

  return null;
}

// Export private for bridge use
export { _getProjectRootSync };
