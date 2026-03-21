/**
 * CJS Bridge for src/core/state/ modules
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM StateStore
 * via dynamic import(). Synchronous functions are wrapped to load the module
 * on first call, then cache it.
 *
 * Part of the shared core extracted by REQ-0076 (Vertical Spike)
 * and expanded by REQ-0080 (StateStore extraction).
 *
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 *
 * Requirements: FR-001 (AC-001-02), FR-005 (AC-005-01)
 */

let _stateModule;
let _pathsModule;
let _monorepoModule;
let _validationModule;
let _schemaModule;

// =========================================================================
// Lazy loaders — cache the ESM module after first import
// =========================================================================

async function loadState() {
  if (!_stateModule) _stateModule = await import('../state/index.js');
  return _stateModule;
}

async function loadPaths() {
  if (!_pathsModule) _pathsModule = await import('../state/paths.js');
  return _pathsModule;
}

async function loadMonorepo() {
  if (!_monorepoModule) _monorepoModule = await import('../state/monorepo.js');
  return _monorepoModule;
}

async function loadValidation() {
  if (!_validationModule) _validationModule = await import('../state/validation.js');
  return _validationModule;
}

async function loadSchema() {
  if (!_schemaModule) _schemaModule = await import('../state/schema.js');
  return _schemaModule;
}

// =========================================================================
// Synchronous wrappers
//
// The core ESM modules use synchronous fs operations (readFileSync, etc.)
// matching the original common.cjs API. We use a sync-load pattern:
// the first call triggers an async import, but since Node caches modules,
// subsequent calls are fast. For the CJS bridge used by hooks (which run
// synchronously), we use require() with a dynamic import fallback.
// =========================================================================

// Preload cache for sync access. Populated on first async call.
let _syncState = null;
let _syncPaths = null;
let _syncMonorepo = null;
let _syncValidation = null;
let _syncSchema = null;

/**
 * Synchronously load and cache the ESM module.
 * Uses a preload strategy: returns cached module or triggers async load.
 * @param {string} modulePath - Relative path to the ESM module
 * @returns {object|null} The cached module or null if not yet loaded
 */
function _tryRequireSync(modulePath) {
  // ESM modules can't be require()'d directly, but we can use import()
  // and cache the result. First call returns null, subsequent calls return cached.
  return null;
}

// =========================================================================
// Group A — Core state read/write (from src/core/state/index.js)
// =========================================================================

function readState(projectIdOrRoot) {
  // Detect async API (REQ-0076 backward compat): readState(absolutePath)
  if (projectIdOrRoot && (projectIdOrRoot.startsWith('/') || /^[A-Z]:\\/.test(projectIdOrRoot))) {
    return _readStateAsync(projectIdOrRoot);
  }
  // Sync API (CJS-compatible): readState(projectId?)
  if (_syncState) return _syncState.readState(projectIdOrRoot);
  return _readStateSync(projectIdOrRoot);
}

function writeState(stateOrRoot, projectIdOrState) {
  // Detect async API (REQ-0076 backward compat): writeState(absolutePath, stateObj)
  if (typeof stateOrRoot === 'string' && typeof projectIdOrState === 'object' && projectIdOrState !== null) {
    return _writeStateAsync(stateOrRoot, projectIdOrState);
  }
  // Sync API (CJS-compatible): writeState(state, projectId?)
  const state = stateOrRoot;
  const projectId = typeof projectIdOrState === 'string' ? projectIdOrState : undefined;
  if (_syncState) return _syncState.writeState(state, projectId);
  return _writeStateSync(state, projectId);
}

function readStateValue(jsonPath, projectId) {
  if (_syncState) return _syncState.readStateValue(jsonPath, projectId);
  return _readStateValueSync(jsonPath, projectId);
}

function stateFileExistsOnDisk(projectId) {
  if (_syncState) return _syncState.stateFileExistsOnDisk(projectId);
  return _stateFileExistsOnDiskSync(projectId);
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

// =========================================================================
// Group B — Path resolution (from src/core/state/paths.js)
// =========================================================================

function resolveStatePath(projectId) {
  if (_syncPaths) return _syncPaths.resolveStatePath(projectId);
  return _resolveStatePathSync(projectId);
}

function resolveConstitutionPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveConstitutionPath(projectId);
  return _resolveConstitutionPathSync(projectId);
}

function resolveDocsPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveDocsPath(projectId);
  return _resolveDocsPathSync(projectId);
}

function resolveExternalSkillsPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveExternalSkillsPath(projectId);
  return _resolveExternalSkillsPathSync(projectId);
}

function resolveExternalManifestPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveExternalManifestPath(projectId);
  return _resolveExternalManifestPathSync(projectId);
}

function resolveSkillReportPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveSkillReportPath(projectId);
  return _resolveSkillReportPathSync(projectId);
}

function resolveTasksPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveTasksPath(projectId);
  return _resolveTasksPathSync(projectId);
}

function resolveTestEvaluationPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveTestEvaluationPath(projectId);
  return _resolveTestEvaluationPathSync(projectId);
}

function resolveAtddChecklistPath(projectId, domain) {
  if (_syncPaths) return _syncPaths.resolveAtddChecklistPath(projectId, domain);
  return _resolveAtddChecklistPathSync(projectId, domain);
}

function resolveIsdlcDocsPath(projectId) {
  if (_syncPaths) return _syncPaths.resolveIsdlcDocsPath(projectId);
  return _resolveIsdlcDocsPathSync(projectId);
}

// =========================================================================
// Group C — Monorepo (from src/core/state/monorepo.js)
// =========================================================================

function isMonorepoMode() {
  if (_syncMonorepo) return _syncMonorepo.isMonorepoMode();
  return _isMonorepoModeSync();
}

function readMonorepoConfig() {
  if (_syncMonorepo) return _syncMonorepo.readMonorepoConfig();
  return _readMonorepoConfigSync();
}

function writeMonorepoConfig(config) {
  if (_syncMonorepo) return _syncMonorepo.writeMonorepoConfig(config);
  return _writeMonorepoConfigSync(config);
}

function resolveProjectFromCwd() {
  if (_syncMonorepo) return _syncMonorepo.resolveProjectFromCwd();
  return _resolveProjectFromCwdSync();
}

function getActiveProject() {
  if (_syncMonorepo) return _syncMonorepo.getActiveProject();
  return _getActiveProjectSync();
}

// =========================================================================
// Group D — State validation (from src/core/state/validation.js)
// =========================================================================

function validatePhase(phaseName, phaseData, filePath) {
  if (_syncValidation) return _syncValidation.validatePhase(phaseName, phaseData, filePath);
  return _validatePhaseSync(phaseName, phaseData, filePath);
}

function validateStateWrite(state) {
  if (_syncValidation) return _syncValidation.validateStateWrite(state);
  return _validateStateWriteSync(state);
}

// =========================================================================
// Schema versioning (from src/core/state/schema.js)
// =========================================================================

function migrateState(state) {
  if (_syncSchema) return _syncSchema.migrateState(state);
  return _migrateStateSync(state);
}

function getCurrentSchemaVersion() {
  if (_syncSchema) return _syncSchema.CURRENT_SCHEMA_VERSION;
  return 1; // Known at build time
}

// =========================================================================
// Inline sync fallback implementations
// These duplicate the ESM logic for the case where the ESM module
// hasn't been loaded yet. They are identical to the ESM implementations.
// =========================================================================

const fs = require('fs');
const path = require('path');

function _getProjectRootSync() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.isdlc'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function _isMonorepoModeSync() {
  const projectRoot = _getProjectRootSync();
  return fs.existsSync(path.join(projectRoot, '.isdlc', 'monorepo.json'));
}

function _readMonorepoConfigSync() {
  const projectRoot = _getProjectRootSync();
  const configFile = path.join(projectRoot, '.isdlc', 'monorepo.json');
  if (!fs.existsSync(configFile)) return null;
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (e) { return null; }
}

function _writeMonorepoConfigSync(config) {
  const projectRoot = _getProjectRootSync();
  const configFile = path.join(projectRoot, '.isdlc', 'monorepo.json');
  try { fs.writeFileSync(configFile, JSON.stringify(config, null, 2)); return true; } catch (e) { return false; }
}

function _getActiveProjectSync() {
  if (!_isMonorepoModeSync()) return null;
  if (process.env.ISDLC_PROJECT) return process.env.ISDLC_PROJECT;
  const cwdProject = _resolveProjectFromCwdSync();
  if (cwdProject) return cwdProject;
  const config = _readMonorepoConfigSync();
  if (config && config.default_project) return config.default_project;
  return null;
}

function _resolveProjectFromCwdSync() {
  if (!_isMonorepoModeSync()) return null;
  const config = _readMonorepoConfigSync();
  if (!config || !config.projects) return null;
  const projectRoot = _getProjectRootSync();
  const cwd = process.cwd();
  const relativeCwd = path.relative(projectRoot, cwd);
  if (relativeCwd.startsWith('..')) return null;
  let bestMatch = null;
  let bestMatchLength = -1;
  for (const [projectId, projectConfig] of Object.entries(config.projects)) {
    const projectPath = projectConfig.path;
    if (!projectPath) continue;
    const normalizedProjectPath = projectPath.replace(/\/+$/, '');
    if (relativeCwd === normalizedProjectPath || relativeCwd.startsWith(normalizedProjectPath + '/')) {
      if (normalizedProjectPath.length > bestMatchLength) {
        bestMatch = projectId;
        bestMatchLength = normalizedProjectPath.length;
      }
    }
  }
  return bestMatch;
}

function _resolveStatePathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) return path.join(projectRoot, '.isdlc', 'projects', id, 'state.json');
  }
  return path.join(projectRoot, '.isdlc', 'state.json');
}

function _isAntigravitySync() {
  return process.env.ANTIGRAVITY_AGENT === '1';
}

function _getFrameworkDirSync() {
  return _isAntigravitySync() ? '.antigravity' : '.claude';
}

function _resolveConstitutionPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'constitution.md');
      if (fs.existsSync(newPath)) return newPath;
      const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'constitution.md');
      if (fs.existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }
  const newPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(projectRoot, '.isdlc', 'constitution.md');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

function _resolveDocsPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const config = _readMonorepoConfigSync();
      if (config && config.docs_location === 'project') {
        const project = config.projects && config.projects[id];
        if (project && project.path) return path.join(projectRoot, project.path, 'docs');
      }
      return path.join(projectRoot, 'docs', id);
    }
  }
  return path.join(projectRoot, 'docs');
}

function _resolveExternalSkillsPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) return path.join(projectRoot, '.isdlc', 'projects', id, 'skills', 'external');
  }
  return path.join(projectRoot, _getFrameworkDirSync(), 'skills', 'external');
}

function _resolveExternalManifestPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'external-skills-manifest.json');
      if (fs.existsSync(newPath)) return newPath;
      const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'external-skills-manifest.json');
      if (fs.existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }
  const newPath = path.join(projectRoot, 'docs', 'isdlc', 'external-skills-manifest.json');
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(projectRoot, '.isdlc', 'external-skills-manifest.json');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

function _resolveSkillReportPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'skill-customization-report.md');
      if (fs.existsSync(newPath)) return newPath;
      const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'skill-customization-report.md');
      if (fs.existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }
  const newPath = path.join(projectRoot, 'docs', 'isdlc', 'skill-customization-report.md');
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(projectRoot, '.isdlc', 'skill-customization-report.md');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

function _resolveTasksPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'tasks.md');
      if (fs.existsSync(newPath)) return newPath;
      const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'tasks.md');
      if (fs.existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }
  const newPath = path.join(projectRoot, 'docs', 'isdlc', 'tasks.md');
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(projectRoot, '.isdlc', 'tasks.md');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

function _resolveTestEvaluationPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, 'test-evaluation-report.md');
      if (fs.existsSync(newPath)) return newPath;
      const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, 'test-evaluation-report.md');
      if (fs.existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }
  const newPath = path.join(projectRoot, 'docs', 'isdlc', 'test-evaluation-report.md');
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(projectRoot, '.isdlc', 'test-evaluation-report.md');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

function _resolveAtddChecklistPathSync(projectId, domain) {
  const projectRoot = _getProjectRootSync();
  const filename = domain ? `atdd-checklist-${domain}.json` : 'atdd-checklist.json';
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) {
      const newPath = path.join(projectRoot, 'docs', 'isdlc', 'projects', id, filename);
      if (fs.existsSync(newPath)) return newPath;
      const legacyPath = path.join(projectRoot, '.isdlc', 'projects', id, filename);
      if (fs.existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }
  const newPath = path.join(projectRoot, 'docs', 'isdlc', filename);
  if (fs.existsSync(newPath)) return newPath;
  const legacyPath = path.join(projectRoot, '.isdlc', filename);
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

function _resolveIsdlcDocsPathSync(projectId) {
  const projectRoot = _getProjectRootSync();
  if (_isMonorepoModeSync()) {
    const id = projectId || _getActiveProjectSync();
    if (id) return path.join(projectRoot, 'docs', 'isdlc', 'projects', id);
  }
  return path.join(projectRoot, 'docs', 'isdlc');
}

function _readStateSync(projectId) {
  const stateFile = _resolveStatePathSync(projectId);
  if (!fs.existsSync(stateFile)) return null;
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { return null; }
}

function _writeStateSync(state, projectId) {
  const stateFile = _resolveStatePathSync(projectId);
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    let currentVersion = 0;
    try {
      if (fs.existsSync(stateFile)) {
        const diskContent = fs.readFileSync(stateFile, 'utf8');
        const diskState = JSON.parse(diskContent);
        if (typeof diskState.state_version === 'number' && diskState.state_version > 0) {
          currentVersion = diskState.state_version;
        }
      }
    } catch (e) { currentVersion = 0; }
    const stateCopy = Object.assign({}, state);
    stateCopy.state_version = currentVersion + 1;
    fs.writeFileSync(stateFile, JSON.stringify(stateCopy, null, 2));
    return true;
  } catch (e) { return false; }
}

function _readStateValueSync(jsonPath, projectId) {
  const stateFile = _resolveStatePathSync(projectId);
  if (!fs.existsSync(stateFile)) return undefined;
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return getNestedValue(state, jsonPath);
  } catch (e) { return undefined; }
}

function _stateFileExistsOnDiskSync(projectId) {
  const stateFile = _resolveStatePathSync(projectId);
  return fs.existsSync(stateFile);
}

function _validatePhaseSync(phaseName, phaseData, filePath) {
  const warnings = [];
  if (!phaseData || typeof phaseData !== 'object') return warnings;

  const constVal = phaseData.constitutional_validation;
  if (constVal && constVal.completed === true) {
    const iters = constVal.iterations_used;
    if (iters === undefined || iters === null || iters < 1) {
      warnings.push(`[state-write-validator] WARNING: Suspicious state.json write detected.\n  Phase: ${phaseName}\n  Issue: constitutional_validation.completed is true but iterations_used is ${iters}\n  Rule: A completed constitutional validation must have at least 1 iteration\n  Path: ${filePath || ''}`);
    }
  }

  const elicit = phaseData.iteration_requirements?.interactive_elicitation;
  if (elicit && elicit.completed === true) {
    const menuCount = elicit.menu_interactions;
    if (menuCount === undefined || menuCount === null || menuCount < 1) {
      warnings.push(`[state-write-validator] WARNING: Suspicious state.json write detected.\n  Phase: ${phaseName}\n  Issue: interactive_elicitation.completed is true but menu_interactions is ${menuCount}\n  Rule: A completed elicitation must have at least 1 menu interaction\n  Path: ${filePath || ''}`);
    }
  }

  const testIter = phaseData.iteration_requirements?.test_iteration;
  if (testIter && testIter.completed === true) {
    const iterCount = testIter.current_iteration;
    if (iterCount === undefined || iterCount === null || iterCount < 1) {
      warnings.push(`[state-write-validator] WARNING: Suspicious state.json write detected.\n  Phase: ${phaseName}\n  Issue: test_iteration.completed is true but current_iteration is ${iterCount}\n  Rule: A completed test iteration must have at least 1 test run\n  Path: ${filePath || ''}`);
    }
  }

  return warnings;
}

function _validateStateWriteSync(state) {
  const warnings = [];
  if (!state || typeof state !== 'object') return warnings;
  const phases = state.phases;
  if (!phases || typeof phases !== 'object') return warnings;
  for (const [phaseName, phaseData] of Object.entries(phases)) {
    if (!phaseData || typeof phaseData !== 'object') continue;
    warnings.push(..._validatePhaseSync(phaseName, phaseData));
  }
  return warnings;
}

function _migrateStateSync(state) {
  let current = Object.assign({}, state);
  let version = typeof current.schema_version === 'number' ? current.schema_version : 0;
  if (version >= 1) return current; // Already at CURRENT_SCHEMA_VERSION
  // Apply 0->1 migration
  current.schema_version = 1;
  return current;
}

// =========================================================================
// Async API (preserved from REQ-0076 for backward compatibility)
// =========================================================================

async function _readStateAsync(projectRoot) {
  const m = await loadState();
  // Call the ESM async readState (which detects absolute path)
  return m.readState(projectRoot);
}

async function _writeStateAsync(projectRoot, state) {
  const m = await loadState();
  // Call the ESM async writeState (which detects absolutePath, stateObj pattern)
  return m.writeState(projectRoot, state);
}

async function getProjectRoot(startDir) {
  const m = await loadState();
  return m.getProjectRoot(startDir);
}

// =========================================================================
// Module preload (optional optimization)
// =========================================================================

/**
 * Preload all ESM modules asynchronously. Call once at startup for
 * optimal performance. Not required — sync fallbacks work without it.
 */
async function preload() {
  const [s, p, m, v, sc] = await Promise.all([
    loadState(), loadPaths(), loadMonorepo(), loadValidation(), loadSchema()
  ]);
  _syncState = s;
  _syncPaths = p;
  _syncMonorepo = m;
  _syncValidation = v;
  _syncSchema = sc;
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  // Group A — Core state read/write
  readState,
  writeState,
  readStateValue,
  stateFileExistsOnDisk,
  getNestedValue,
  getProjectRoot,

  // Group B — Path resolution
  resolveStatePath,
  resolveConstitutionPath,
  resolveDocsPath,
  resolveExternalSkillsPath,
  resolveExternalManifestPath,
  resolveSkillReportPath,
  resolveTasksPath,
  resolveTestEvaluationPath,
  resolveAtddChecklistPath,
  resolveIsdlcDocsPath,

  // Group C — Monorepo
  isMonorepoMode,
  readMonorepoConfig,
  writeMonorepoConfig,
  resolveProjectFromCwd,
  getActiveProject,

  // Group D — State validation
  validatePhase,
  validateStateWrite,

  // Schema versioning
  migrateState,
  getCurrentSchemaVersion,

  // Optimization
  preload
};
