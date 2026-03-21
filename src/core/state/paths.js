/**
 * Path Resolution — REQ-0080 Group B
 *
 * All path resolution functions for iSDLC artifacts, extracted from common.cjs.
 * Each function accounts for monorepo mode with new/legacy location fallback.
 *
 * @module src/core/state/paths
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isMonorepoMode,
  readMonorepoConfig,
  getActiveProject,
  _getProjectRootSync
} from './monorepo.js';

/**
 * Detect if the framework is running within an Antigravity environment.
 * @returns {boolean}
 */
function isAntigravity() {
  return process.env.ANTIGRAVITY_AGENT === '1';
}

/**
 * Get the platform-specific framework directory name.
 * @returns {string} '.antigravity' or '.claude'
 */
function getFrameworkDir() {
  return isAntigravity() ? '.antigravity' : '.claude';
}

/**
 * Resolve the path to state.json, accounting for monorepo mode.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to state.json
 */
export function resolveStatePath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      return join(projectRoot, '.isdlc', 'projects', id, 'state.json');
    }
  }

  return join(projectRoot, '.isdlc', 'state.json');
}

/**
 * Resolve the path to the constitution file, accounting for monorepo mode.
 * Prefers docs/isdlc/constitution.md, falls back to .isdlc/constitution.md.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to the effective constitution.md
 */
export function resolveConstitutionPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const newProjectConstitution = join(projectRoot, 'docs', 'isdlc', 'projects', id, 'constitution.md');
      if (existsSync(newProjectConstitution)) return newProjectConstitution;
      const legacyProjectConstitution = join(projectRoot, '.isdlc', 'projects', id, 'constitution.md');
      if (existsSync(legacyProjectConstitution)) return legacyProjectConstitution;
      return newProjectConstitution;
    }
  }

  const newPath = join(projectRoot, 'docs', 'isdlc', 'constitution.md');
  if (existsSync(newPath)) return newPath;

  const legacyPath = join(projectRoot, '.isdlc', 'constitution.md');
  if (existsSync(legacyPath)) return legacyPath;

  return newPath;
}

/**
 * Resolve the docs base path for artifacts.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to docs base directory
 */
export function resolveDocsPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const config = readMonorepoConfig();
      if (config && config.docs_location === 'project') {
        const project = config.projects && config.projects[id];
        if (project && project.path) {
          return join(projectRoot, project.path, 'docs');
        }
      }
      return join(projectRoot, 'docs', id);
    }
  }

  return join(projectRoot, 'docs');
}

/**
 * Resolve the path to the external skills directory.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to external skills directory
 */
export function resolveExternalSkillsPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      return join(projectRoot, '.isdlc', 'projects', id, 'skills', 'external');
    }
  }

  return join(projectRoot, getFrameworkDir(), 'skills', 'external');
}

/**
 * Resolve the path to the external skills manifest.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to external skills manifest
 */
export function resolveExternalManifestPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const newPath = join(projectRoot, 'docs', 'isdlc', 'projects', id, 'external-skills-manifest.json');
      if (existsSync(newPath)) return newPath;
      const legacyPath = join(projectRoot, '.isdlc', 'projects', id, 'external-skills-manifest.json');
      if (existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }

  const newPath = join(projectRoot, 'docs', 'isdlc', 'external-skills-manifest.json');
  if (existsSync(newPath)) return newPath;
  const legacyPath = join(projectRoot, '.isdlc', 'external-skills-manifest.json');
  if (existsSync(legacyPath)) return legacyPath;
  return newPath;
}

/**
 * Resolve the path to the skill customization report.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to skill customization report
 */
export function resolveSkillReportPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const newPath = join(projectRoot, 'docs', 'isdlc', 'projects', id, 'skill-customization-report.md');
      if (existsSync(newPath)) return newPath;
      const legacyPath = join(projectRoot, '.isdlc', 'projects', id, 'skill-customization-report.md');
      if (existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }

  const newPath = join(projectRoot, 'docs', 'isdlc', 'skill-customization-report.md');
  if (existsSync(newPath)) return newPath;
  const legacyPath = join(projectRoot, '.isdlc', 'skill-customization-report.md');
  if (existsSync(legacyPath)) return legacyPath;
  return newPath;
}

/**
 * Resolve the path to the tasks plan file.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to tasks.md
 */
export function resolveTasksPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const newPath = join(projectRoot, 'docs', 'isdlc', 'projects', id, 'tasks.md');
      if (existsSync(newPath)) return newPath;
      const legacyPath = join(projectRoot, '.isdlc', 'projects', id, 'tasks.md');
      if (existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }

  const newPath = join(projectRoot, 'docs', 'isdlc', 'tasks.md');
  if (existsSync(newPath)) return newPath;
  const legacyPath = join(projectRoot, '.isdlc', 'tasks.md');
  if (existsSync(legacyPath)) return legacyPath;
  return newPath;
}

/**
 * Resolve the path to the test evaluation report.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to test-evaluation-report.md
 */
export function resolveTestEvaluationPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const newPath = join(projectRoot, 'docs', 'isdlc', 'projects', id, 'test-evaluation-report.md');
      if (existsSync(newPath)) return newPath;
      const legacyPath = join(projectRoot, '.isdlc', 'projects', id, 'test-evaluation-report.md');
      if (existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }

  const newPath = join(projectRoot, 'docs', 'isdlc', 'test-evaluation-report.md');
  if (existsSync(newPath)) return newPath;
  const legacyPath = join(projectRoot, '.isdlc', 'test-evaluation-report.md');
  if (existsSync(legacyPath)) return legacyPath;
  return newPath;
}

/**
 * Resolve the path to the ATDD checklist.
 * @param {string} [projectId] - Optional project ID override
 * @param {string} [domain] - Optional domain suffix
 * @returns {string} Absolute path to atdd-checklist.json
 */
export function resolveAtddChecklistPath(projectId, domain) {
  const projectRoot = _getProjectRootSync();
  const filename = domain ? `atdd-checklist-${domain}.json` : 'atdd-checklist.json';

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      const newPath = join(projectRoot, 'docs', 'isdlc', 'projects', id, filename);
      if (existsSync(newPath)) return newPath;
      const legacyPath = join(projectRoot, '.isdlc', 'projects', id, filename);
      if (existsSync(legacyPath)) return legacyPath;
      return newPath;
    }
  }

  const newPath = join(projectRoot, 'docs', 'isdlc', filename);
  if (existsSync(newPath)) return newPath;
  const legacyPath = join(projectRoot, '.isdlc', filename);
  if (existsSync(legacyPath)) return legacyPath;
  return newPath;
}

/**
 * Resolve the path to the iSDLC docs folder.
 * @param {string} [projectId] - Optional project ID override
 * @returns {string} Absolute path to docs/isdlc/
 */
export function resolveIsdlcDocsPath(projectId) {
  const projectRoot = _getProjectRootSync();

  if (isMonorepoMode()) {
    const id = projectId || getActiveProject();
    if (id) {
      return join(projectRoot, 'docs', 'isdlc', 'projects', id);
    }
  }

  return join(projectRoot, 'docs', 'isdlc');
}
