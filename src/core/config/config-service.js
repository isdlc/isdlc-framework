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
import { join, dirname, resolve, parse as parsePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECT_CONFIG } from './config-defaults.js';

/**
 * ATDD config defaults. Exported for consumers that need an in-place fallback
 * object (e.g., fail-open branches in hooks).
 *
 * REQ-GH-216 FR-003 (all defaults true).
 */
export const ATDD_DEFAULTS = Object.freeze({
  enabled: true,
  require_gwt: true,
  track_red_green: true,
  enforce_priority_order: true,
});

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
 * Resolve the project root by checking CLAUDE_PROJECT_DIR env or walking up
 * from CWD to find `.isdlc/`. Returns null if not found.
 *
 * @returns {string|null} Absolute path to project root or null
 */
function autoDetectProjectRoot() {
  try {
    if (process.env.CLAUDE_PROJECT_DIR) {
      return process.env.CLAUDE_PROJECT_DIR;
    }
    let dir = process.cwd();
    while (dir !== parsePath(dir).root) {
      if (existsSync(join(dir, '.isdlc'))) {
        return dir;
      }
      dir = dirname(dir);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return the fully-resolved ATDD config object, merging user overrides with
 * all-true defaults. Per-field fail-open: invalid field types fall back to
 * their defaults, while valid overrides are retained.
 *
 * REQ-GH-216 FR-003, AC-003-01, AC-003-02 (Article X fail-safe).
 *
 * @param {string} [projectRoot] - Optional project root; auto-detected if omitted
 * @returns {{ enabled: boolean, require_gwt: boolean, track_red_green: boolean, enforce_priority_order: boolean }}
 */
export function getAtdd(projectRoot) {
  try {
    const root = projectRoot || autoDetectProjectRoot();
    if (!root) return { ...ATDD_DEFAULTS };

    const full = readProjectConfig(root);
    const section = (full && typeof full.atdd === 'object' && full.atdd !== null && !Array.isArray(full.atdd))
      ? full.atdd
      : {};

    const result = { ...ATDD_DEFAULTS };
    for (const key of Object.keys(ATDD_DEFAULTS)) {
      if (typeof section[key] === 'boolean') {
        result[key] = section[key];
      }
    }
    return result;
  } catch {
    return { ...ATDD_DEFAULTS };
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
 * Check whether the user has explicitly configured embeddings.
 *
 * Reads the RAW .isdlc/config.json file and checks for a top-level
 * `embeddings` key that is not null/undefined. This deliberately bypasses
 * the defaults merge layer used by {@link readProjectConfig} — which
 * always injects an `embeddings` section from DEFAULT_PROJECT_CONFIG —
 * so callers can distinguish "user opted in" from "framework defaulted in".
 *
 * Behavior:
 * - Missing file → false
 * - Malformed JSON → false (fail-open, no exception propagates)
 * - `embeddings: null` → false (explicit null treated as "not configured")
 * - `embeddings: { ... }` (any non-null value) → true
 * - No caching: each call re-reads the file so edits take effect immediately
 *
 * REQ-GH-239 FR-006 (Opt-in via config presence), ERR-F0009-001 (fail-open).
 * Article X (Fail-Safe Defaults — opt-out via silence).
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {boolean} true if user's raw config has an embeddings key (non-null)
 */
export function hasUserEmbeddingsConfig(projectRoot) {
  try {
    const configPath = join(projectRoot, '.isdlc', 'config.json');
    if (!existsSync(configPath)) return false;
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed != null && parsed.embeddings != null;
  } catch {
    return false;
  }
}

/**
 * Valid migration_mode values for roundtable parallel-run toggle.
 * REQ-GH-253 T040.
 */
const VALID_MIGRATION_MODES = ['parallel', 'mechanism', 'prose'];

/**
 * Default roundtable config for task card composition and migration mode.
 * Exported for consumers that need an in-place fallback.
 *
 * REQ-GH-253 FR-004 (max_skills_total budget), T040 (migration_mode).
 */
export const ROUNDTABLE_DEFAULTS = Object.freeze({
  migration_mode: 'mechanism',
  task_card: Object.freeze({
    max_skills_total: 8,
  }),
});

/**
 * Return the fully-resolved roundtable config object, merging user overrides
 * with defaults. Nested fail-open: invalid field types fall back to their
 * defaults, while valid overrides are retained.
 *
 * REQ-GH-253 FR-004, AC-004-01 (Article X fail-safe), T040 (migration_mode).
 *
 * @param {string} [projectRoot] - Optional project root; auto-detected if omitted
 * @returns {{ migration_mode: string, task_card: { max_skills_total: number } }}
 */
export function getRoundtableConfig(projectRoot) {
  try {
    const root = projectRoot || autoDetectProjectRoot();
    if (!root) return { migration_mode: ROUNDTABLE_DEFAULTS.migration_mode, task_card: { ...ROUNDTABLE_DEFAULTS.task_card } };

    const full = readProjectConfig(root);
    const section = (full && typeof full.roundtable === 'object' && full.roundtable !== null && !Array.isArray(full.roundtable))
      ? full.roundtable
      : {};

    // T040: migration_mode — validate against allowed values, fail-open to default
    const migrationMode = (typeof section.migration_mode === 'string' &&
      VALID_MIGRATION_MODES.includes(section.migration_mode))
      ? section.migration_mode
      : ROUNDTABLE_DEFAULTS.migration_mode;

    const taskCard = (section.task_card && typeof section.task_card === 'object' && !Array.isArray(section.task_card))
      ? section.task_card
      : {};

    const maxSkills = (typeof taskCard.max_skills_total === 'number' &&
      Number.isInteger(taskCard.max_skills_total) &&
      taskCard.max_skills_total >= 1 &&
      taskCard.max_skills_total <= 50)
      ? taskCard.max_skills_total
      : ROUNDTABLE_DEFAULTS.task_card.max_skills_total;

    return {
      migration_mode: migrationMode,
      task_card: {
        max_skills_total: maxSkills,
      },
    };
  } catch {
    return { migration_mode: ROUNDTABLE_DEFAULTS.migration_mode, task_card: { ...ROUNDTABLE_DEFAULTS.task_card } };
  }
}

/**
 * Knowledge config defaults. Exported for consumers that need an in-place
 * fallback object (e.g., fail-open branches in hooks).
 *
 * REQ-GH-264 FR-002 (knowledge service integration).
 */
export const KNOWLEDGE_DEFAULTS = Object.freeze({
  url: null,
  projects: Object.freeze([]),
});

/**
 * Return the fully-resolved knowledge config object, merging user overrides
 * with defaults. Per-field fail-open: invalid field types fall back to their
 * defaults, while valid overrides are retained.
 *
 * REQ-GH-264 FR-002, AC-002-01, AC-002-02, AC-002-03 (Article X fail-safe).
 *
 * @param {string} [projectRoot] - Optional project root; auto-detected if omitted
 * @returns {{ url: string|null, projects: string[] }}
 */
export function getKnowledgeConfig(projectRoot) {
  try {
    const root = projectRoot || autoDetectProjectRoot();
    if (!root) return { url: null, projects: [] };

    const full = readProjectConfig(root);
    const section = (full && typeof full.knowledge === 'object' && full.knowledge !== null && !Array.isArray(full.knowledge))
      ? full.knowledge
      : {};

    const url = (typeof section.url === 'string' && section.url.length > 0)
      ? section.url
      : null;

    const projects = (Array.isArray(section.projects))
      ? section.projects.filter(p => typeof p === 'string')
      : [];

    return { url, projects };
  } catch {
    return { url: null, projects: [] };
  }
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
