/**
 * CJS Bridge for Config Service
 *
 * Synchronous wrapper so CJS hooks can call the ESM config-service.
 * Uses direct file reads (same logic as config-service.js) since
 * CJS cannot await ESM imports.
 *
 * REQ-GH-231 FR-003, AC-003-02
 * @module src/core/bridge/config
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * ATDD config defaults. Used by getAtdd() for fail-open behavior.
 * REQ-GH-216 FR-003.
 */
const ATDD_DEFAULTS = Object.freeze({
  enabled: true,
  require_gwt: true,
  track_red_green: true,
  enforce_priority_order: true,
});

/**
 * Valid migration_mode values for roundtable parallel-run toggle.
 * REQ-GH-253 T040.
 */
const VALID_MIGRATION_MODES = ['parallel', 'mechanism', 'prose'];

/**
 * Roundtable config defaults. Used by getRoundtableConfig() for fail-open behavior.
 * REQ-GH-253 FR-004 (max_skills_total budget), T040 (migration_mode).
 */
const ROUNDTABLE_DEFAULTS = Object.freeze({
  migration_mode: 'mechanism',
  task_card: Object.freeze({
    max_skills_total: 8,
  }),
});

// Cache maps (same mtime-based strategy as ESM service)
const _frameworkCache = new Map();
const _projectCache = new Map();

// Import defaults synchronously
let _defaults = null;
function getDefaults() {
  if (_defaults) return _defaults;
  try {
    const defaultsPath = path.resolve(__dirname, '..', 'config', 'config-defaults.js');
    // Read the ESM file and extract the JSON object
    const content = fs.readFileSync(defaultsPath, 'utf8');
    // Extract the object literal from the export
    const match = content.match(/export const DEFAULT_PROJECT_CONFIG\s*=\s*(\{[\s\S]*\});?\s*$/m);
    if (match) {
      // Use Function constructor to evaluate the object literal safely
      _defaults = new Function('return ' + match[1])();
    }
  } catch { /* fall through */ }

  if (!_defaults) {
    // Hardcoded fallback (Article X: fail-safe defaults)
    _defaults = {
      cache: { budget_tokens: 100000, section_priorities: {} },
      ui: { show_subtasks_in_ui: true },
      provider: { default: 'claude' },
      roundtable: { verbosity: 'bulleted', default_personas: [], disabled_personas: [], migration_mode: 'mechanism', task_card: { max_skills_total: 8 } },
      search: {},
      workflows: { sizing_thresholds: {}, performance_budgets: {} },
    };
  }
  return _defaults;
}

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

function readCachedJson(filePath, cache) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return null;
    const data = JSON.parse(content);
    cache.set(filePath, { data, mtimeMs: stat.mtimeMs });
    return data;
  } catch {
    return null;
  }
}

function frameworkConfigDir() {
  return path.resolve(__dirname, '..', '..', 'isdlc', 'config');
}

function loadFrameworkConfig(name) {
  const filePath = path.join(frameworkConfigDir(), `${name}.json`);
  return readCachedJson(filePath, _frameworkCache);
}

function readProjectConfig(projectRoot) {
  const filePath = path.join(projectRoot, '.isdlc', 'config.json');
  try {
    if (!fs.existsSync(filePath)) {
      return JSON.parse(JSON.stringify(getDefaults()));
    }
    const stat = fs.statSync(filePath);
    const cached = _projectCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return JSON.parse(JSON.stringify(getDefaults()));
    let parsed;
    try { parsed = JSON.parse(content); } catch {
      return JSON.parse(JSON.stringify(getDefaults()));
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return JSON.parse(JSON.stringify(getDefaults()));
    }
    const merged = deepMerge(JSON.parse(JSON.stringify(getDefaults())), parsed);
    _projectCache.set(filePath, { data: merged, mtimeMs: stat.mtimeMs });
    return merged;
  } catch {
    return JSON.parse(JSON.stringify(getDefaults()));
  }
}

/**
 * Resolve project root via CLAUDE_PROJECT_DIR env or walking up from CWD
 * to find `.isdlc/`. Returns null if not found.
 */
function autoDetectProjectRoot() {
  try {
    if (process.env.CLAUDE_PROJECT_DIR) {
      return process.env.CLAUDE_PROJECT_DIR;
    }
    let dir = process.cwd();
    while (dir !== path.parse(dir).root) {
      if (fs.existsSync(path.join(dir, '.isdlc'))) {
        return dir;
      }
      dir = path.dirname(dir);
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
function getAtdd(projectRoot) {
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
 * Return the fully-resolved roundtable config object, merging user overrides
 * with defaults. Nested fail-open: invalid field types fall back to their
 * defaults, while valid overrides are retained.
 *
 * REQ-GH-253 FR-004, AC-004-01 (Article X fail-safe), T040 (migration_mode).
 *
 * @param {string} [projectRoot] - Optional project root; auto-detected if omitted
 * @returns {{ migration_mode: string, task_card: { max_skills_total: number } }}
 */
function getRoundtableConfig(projectRoot) {
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

function loadSchema(schemaId) {
  const filePath = path.join(frameworkConfigDir(), 'schemas', `${schemaId}.schema.json`);
  return readCachedJson(filePath, _frameworkCache);
}

function getConfigPath(projectRoot) {
  return path.join(projectRoot, '.isdlc', 'config.json');
}

function clearConfigCache() {
  _frameworkCache.clear();
  _projectCache.clear();
  _defaults = null;
}

module.exports = {
  loadFrameworkConfig,
  readProjectConfig,
  loadSchema,
  getConfigPath,
  clearConfigCache,
  getAtdd,
  getRoundtableConfig,
  ATDD_DEFAULTS,
  ROUNDTABLE_DEFAULTS,
};
