/**
 * VCS Adapter — detect VCS type and create appropriate adapter.
 *
 * Supports Git and SVN working copies. Throws if no supported VCS is detected.
 *
 * REQ-0045 / FR-014 / M3 VCS
 * @module lib/embedding/vcs
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createGitAdapter } from './git-adapter.js';
import { createSvnAdapter } from './svn-adapter.js';

/**
 * @typedef {Object} FileChange
 * @property {string} path - Relative file path
 * @property {'added'|'modified'|'deleted'|'renamed'} status
 * @property {string} [oldPath] - Previous path for renames
 */

/**
 * @typedef {Object} VcsAdapter
 * @property {'git'|'svn'} type
 * @property {function} getChangedFiles - (since?: string) => Promise<FileChange[]>
 * @property {function} getCurrentRevision - () => Promise<string>
 * @property {function} getFileList - () => Promise<string[]>
 */

/**
 * Detect VCS type and create the appropriate adapter.
 *
 * Detection order:
 * 1. Git (.git directory)
 * 2. SVN (.svn directory)
 *
 * @param {string} workingCopyPath - Root of working copy
 * @returns {Promise<VcsAdapter>}
 * @throws {Error} If no supported VCS detected
 */
export async function createAdapter(workingCopyPath) {
  if (!workingCopyPath || typeof workingCopyPath !== 'string') {
    throw new Error('workingCopyPath must be a non-empty string');
  }

  // Check for Git
  if (await directoryExists(join(workingCopyPath, '.git'))) {
    return createGitAdapter(workingCopyPath);
  }

  // Check for SVN
  if (await directoryExists(join(workingCopyPath, '.svn'))) {
    return createSvnAdapter(workingCopyPath);
  }

  throw new Error(
    `No supported VCS detected in ${workingCopyPath}. ` +
    'Expected .git or .svn directory.'
  );
}

/**
 * Check if a directory exists.
 * @param {string} dirPath
 * @returns {Promise<boolean>}
 */
async function directoryExists(dirPath) {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
