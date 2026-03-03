/**
 * Search Configuration Management
 *
 * Read and write search configuration for the iSDLC search abstraction layer.
 * Configuration is stored at {projectRoot}/.isdlc/search-config.json (gitignored).
 *
 * REQ-0041 / FR-010: Search Configuration Management
 * @module lib/search/config
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * @typedef {Object} SearchConfig
 * @property {boolean} enabled - Whether enhanced search is enabled
 * @property {string[]} activeBackends - IDs of active backends
 * @property {string} preferredModality - User's preferred default modality
 * @property {boolean} cloudAllowed - Whether cloud backends are permitted
 * @property {string} scaleTier - 'small' | 'medium' | 'large'
 * @property {Object} backendConfigs - Per-backend configuration
 */

/**
 * Default search configuration used when no config file exists or is corrupt.
 * @returns {SearchConfig}
 */
export function getDefaultConfig() {
  return {
    enabled: true,
    activeBackends: ['grep-glob'],
    preferredModality: 'lexical',
    cloudAllowed: false,
    scaleTier: 'small',
    backendConfigs: {},
  };
}

/**
 * Resolve the config file path for a project.
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to search-config.json
 */
function configPath(projectRoot) {
  return join(projectRoot, '.isdlc', 'search-config.json');
}

/**
 * Read search configuration for a project.
 *
 * Returns default config when file is missing or corrupt.
 * Ensures grep-glob is always in activeBackends (invariant).
 *
 * @param {string} projectRoot - Project root directory
 * @returns {SearchConfig}
 */
export function readSearchConfig(projectRoot) {
  const filePath = configPath(projectRoot);

  if (!existsSync(filePath)) {
    return getDefaultConfig();
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Validate and merge with defaults to ensure all fields present
    const defaults = getDefaultConfig();
    const config = { ...defaults, ...parsed };

    // Invariant: grep-glob always active
    if (!Array.isArray(config.activeBackends)) {
      config.activeBackends = defaults.activeBackends;
    }
    if (!config.activeBackends.includes('grep-glob')) {
      config.activeBackends.unshift('grep-glob');
    }

    return config;
  } catch {
    // Corrupt JSON or read error -- return defaults
    return getDefaultConfig();
  }
}

/**
 * Write search configuration to disk.
 *
 * Creates .isdlc directory if it does not exist.
 * Ensures grep-glob invariant before writing.
 *
 * @param {string} projectRoot - Project root directory
 * @param {SearchConfig} config - Configuration to write
 */
export function writeSearchConfig(projectRoot, config) {
  const filePath = configPath(projectRoot);
  const dir = dirname(filePath);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Enforce invariant: grep-glob always in activeBackends
  const toWrite = { ...config };
  if (!Array.isArray(toWrite.activeBackends)) {
    toWrite.activeBackends = ['grep-glob'];
  }
  if (!toWrite.activeBackends.includes('grep-glob')) {
    toWrite.activeBackends.unshift('grep-glob');
  }

  writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf-8');
}
