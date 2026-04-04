/**
 * Unified Config Service
 *
 * Single entry point for all config reads across the framework.
 * Replaces: common.cjs _loadConfigWithCache, readConfig, roundtable-config.cjs,
 * lib/search/config.js readSearchConfig, src/core/config/index.js loadCoreSchema.
 *
 * REQ-GH-231 FR-003, AC-003-01, AC-003-03, AC-003-04, AC-003-08
 * @module src/core/config/config-service
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECT_CONFIG } from './config-defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {Map<string, { data: object, mtimeMs: number }>} */
const _frameworkCache = new Map();

/** @type {Map<string, { data: object, mtimeMs: number }>} */
const _projectCache = new Map();

/**
 * Resolve the canonical framework config directory.
 * @returns {string} Absolute path to src/isdlc/config/
 */
function frameworkConfigDir() {
  return resolve(__dirname, '..', '..', 'isdlc', 'config');
}

/**
 * Deep-merge source into target. Source values take precedence.
 * Arrays are replaced, not concatenated.
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Read and cache a JSON file by absolute path with mtime-based invalidation.
 * @param {string} filePath - Absolute path to JSON file
 * @param {Map} cache - Cache map to use
 * @returns {object|null} Parsed JSON or null if missing/invalid
 */
function readCachedJson(filePath, cache) {
  try {
    if (!existsSync(filePath)) return null;

    const stat = statSync(filePath);
    const cached = cache.get(filePath);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }

    const content = readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return null;

    const data = JSON.parse(content);
    cache.set(filePath, { data, mtimeMs: stat.mtimeMs });
    return data;
  } catch {
    return null;
  }
}

/**
 * Load a shipped framework config file by name.
 * Reads from src/isdlc/config/{name}.json with mtime-based caching.
 *
 * @param {string} name - Config file name without extension (e.g., 'skills-manifest')
 * @returns {object|null} Parsed JSON or null if missing
 */
export function loadFrameworkConfig(name) {
  const filePath = join(frameworkConfigDir(), `${name}.json`);
  return readCachedJson(filePath, _frameworkCache);
}

/**
 * Read user project config from .isdlc/config.json.
 * Deep-merges with defaults — missing sections filled from DEFAULT_PROJECT_CONFIG.
 * Returns full config (never null).
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {object} ProjectConfig with all sections
 */
export function readProjectConfig(projectRoot) {
  const filePath = join(projectRoot, '.isdlc', 'config.json');

  try {
    if (!existsSync(filePath)) {
      return { ...structuredClone(DEFAULT_PROJECT_CONFIG) };
    }

    const stat = statSync(filePath);
    const cached = _projectCache.get(filePath);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }

    const content = readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) {
      process.stderr.write('[config] .isdlc/config.json is empty, using defaults\n');
      return { ...structuredClone(DEFAULT_PROJECT_CONFIG) };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      process.stderr.write(`[config] .isdlc/config.json has invalid JSON: ${parseErr.message}, using defaults\n`);
      return { ...structuredClone(DEFAULT_PROJECT_CONFIG) };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      process.stderr.write('[config] .isdlc/config.json must be a JSON object, using defaults\n');
      return { ...structuredClone(DEFAULT_PROJECT_CONFIG) };
    }

    const merged = deepMerge(structuredClone(DEFAULT_PROJECT_CONFIG), parsed);
    _projectCache.set(filePath, { data: merged, mtimeMs: stat.mtimeMs });
    return merged;
  } catch {
    return { ...structuredClone(DEFAULT_PROJECT_CONFIG) };
  }
}

/**
 * Load a JSON schema by ID from src/isdlc/config/schemas/.
 *
 * @param {string} schemaId - Schema ID (e.g., 'constitutional-validation')
 * @returns {object|null} Parsed schema or null if missing
 */
export function loadSchema(schemaId) {
  const filePath = join(frameworkConfigDir(), 'schemas', `${schemaId}.schema.json`);
  return readCachedJson(filePath, _frameworkCache);
}

/**
 * Get the absolute path to the user config file.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {string} Absolute path to .isdlc/config.json
 */
export function getConfigPath(projectRoot) {
  return join(projectRoot, '.isdlc', 'config.json');
}

/**
 * Clear all internal caches. For testing.
 */
export function clearConfigCache() {
  _frameworkCache.clear();
  _projectCache.clear();
}

// Re-export defaults for consumers that need them
export { DEFAULT_PROJECT_CONFIG };
