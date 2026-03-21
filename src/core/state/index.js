/**
 * StateStore — Core state management for iSDLC
 *
 * Part of the shared core extracted by REQ-0076 (Vertical Spike)
 * and expanded by REQ-0080 (StateStore extraction).
 *
 * Provides two API styles:
 *   1. Async API (original from REQ-0076): readState(projectRoot), writeState(projectRoot, state)
 *   2. Sync API (CJS-compatible, from REQ-0080): readState(projectId), writeState(state, projectId)
 *
 * The sync API matches common.cjs signatures exactly for wrapper compatibility.
 * The async API is preserved for backward compatibility with existing core tests.
 *
 * Requirements: FR-001 (AC-001-01 through AC-001-03), FR-003, FR-005
 *
 * @module src/core/state
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveStatePath } from './paths.js';

// Re-export path resolution and monorepo functions
export {
  resolveStatePath,
  resolveConstitutionPath,
  resolveDocsPath,
  resolveExternalSkillsPath,
  resolveExternalManifestPath,
  resolveSkillReportPath,
  resolveTasksPath,
  resolveTestEvaluationPath,
  resolveAtddChecklistPath,
  resolveIsdlcDocsPath
} from './paths.js';

export {
  isMonorepoMode,
  readMonorepoConfig,
  writeMonorepoConfig,
  resolveProjectFromCwd,
  getActiveProject
} from './monorepo.js';

export {
  validatePhase,
  validateStateWrite
} from './validation.js';

export {
  CURRENT_SCHEMA_VERSION,
  migrateState,
  MIGRATIONS
} from './schema.js';

// =========================================================================
// Sync API — matches common.cjs function signatures exactly
// =========================================================================

/**
 * Read and parse state.json (synchronous, CJS-compatible).
 *
 * When called with no arguments or a string projectId, uses resolveStatePath()
 * to locate the state file (monorepo-aware).
 *
 * When called with a path to a directory that contains .isdlc/state.json,
 * reads from that directory (async API backward compat).
 *
 * @param {string} [projectIdOrRoot] - Optional project ID for monorepo, or absolute project root path
 * @returns {object|null|Promise<object>} Parsed state or null; Promise if called with absolute path
 */
export function readState(projectIdOrRoot) {
  // Detect async API usage: if argument looks like an absolute path, use async API
  if (projectIdOrRoot && (projectIdOrRoot.startsWith('/') || projectIdOrRoot.match(/^[A-Z]:\\/))) {
    // Async API (backward compat with REQ-0076 tests)
    return _readStateAsync(projectIdOrRoot);
  }

  // Sync API (CJS-compatible)
  const stateFile = resolveStatePath(projectIdOrRoot);

  if (!existsSync(stateFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Write state.json with automatic state_version increment (synchronous, CJS-compatible).
 *
 * Before writing, reads the current state_version from the existing file on disk.
 * Sets state_version = current_version + 1 on a COPY of the state object
 * (does NOT mutate the caller's object).
 *
 * When called with (projectRoot, state) signature, uses the async API.
 *
 * @param {object|string} stateOrRoot - State object (sync) or project root path (async)
 * @param {string|object} [projectIdOrState] - Project ID (sync) or state object (async)
 * @returns {boolean|Promise<void>} Success boolean (sync) or Promise (async)
 */
export function writeState(stateOrRoot, projectIdOrState) {
  // Detect async API: if first arg is string (path) and second is object
  if (typeof stateOrRoot === 'string' && typeof projectIdOrState === 'object' && projectIdOrState !== null) {
    return _writeStateAsync(stateOrRoot, projectIdOrState);
  }

  // Sync API: writeState(state, projectId?)
  const state = stateOrRoot;
  const projectId = typeof projectIdOrState === 'string' ? projectIdOrState : undefined;
  const stateFile = resolveStatePath(projectId);

  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  try {
    let currentVersion = 0;
    try {
      if (existsSync(stateFile)) {
        const diskContent = readFileSync(stateFile, 'utf8');
        const diskState = JSON.parse(diskContent);
        if (typeof diskState.state_version === 'number' && diskState.state_version > 0) {
          currentVersion = diskState.state_version;
        }
      }
    } catch (e) {
      currentVersion = 0;
    }

    const stateCopy = Object.assign({}, state);
    stateCopy.state_version = currentVersion + 1;

    writeFileSync(stateFile, JSON.stringify(stateCopy, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read a nested value from state.json by dot-notation path.
 *
 * @param {string} jsonPath - Dot-notation path (e.g., 'phases.06-implementation.status')
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {any} Value at path or undefined
 */
export function readStateValue(jsonPath, projectId) {
  const stateFile = resolveStatePath(projectId);

  if (!existsSync(stateFile)) {
    return undefined;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    return getNestedValue(state, jsonPath);
  } catch (e) {
    return undefined;
  }
}

/**
 * Check if state.json physically exists on disk.
 * @param {string} [projectId] - Optional project ID for monorepo mode
 * @returns {boolean} True if the file exists
 */
export function stateFileExistsOnDisk(projectId) {
  const stateFile = resolveStatePath(projectId);
  return existsSync(stateFile);
}

/**
 * Get nested value from object using dot notation.
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-notation path
 * @returns {any} Value at path or undefined
 */
export function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

// =========================================================================
// Async API — preserved from REQ-0076 for backward compatibility
// =========================================================================

/**
 * Find the project root by walking up from startDir looking for .isdlc/.
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {string} Absolute path to the project root
 * @throws {Error} If no .isdlc/ directory is found in any parent
 */
export function getProjectRoot(startDir = process.cwd()) {
  let current = resolve(startDir);

  while (true) {
    const isdlcDir = join(current, '.isdlc');
    if (
      existsSync(join(isdlcDir, 'state.json')) ||
      existsSync(join(isdlcDir, 'monorepo.json'))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not find .isdlc/ directory in "${startDir}" or any parent directory. ` +
        'Is this an iSDLC project? Run "isdlc discover" to initialize.'
      );
    }
    current = parent;
  }
}

// =========================================================================
// Internal async implementations (backward compat)
// =========================================================================

async function _readStateAsync(projectRoot) {
  const statePath = join(projectRoot, '.isdlc', 'state.json');
  const raw = await readFile(statePath, 'utf-8');
  return JSON.parse(raw);
}

async function _writeStateAsync(projectRoot, state) {
  const isdlcDir = join(projectRoot, '.isdlc');
  const statePath = join(isdlcDir, 'state.json');

  if (!existsSync(isdlcDir)) {
    mkdirSync(isdlcDir, { recursive: true });
  }

  const serialized = JSON.stringify(state, null, 2);
  const tempPath = join(isdlcDir, `.state-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await writeFile(tempPath, serialized, 'utf-8');
    await rename(tempPath, statePath);
  } catch (err) {
    try { await rm(tempPath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}
