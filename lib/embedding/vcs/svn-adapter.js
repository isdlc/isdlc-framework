/**
 * SVN Adapter — SVN CLI wrapper for VCS operations.
 *
 * REQ-0045 / FR-014 / M3 VCS
 * @module lib/embedding/vcs/svn-adapter
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Create an SVN VCS adapter for the given working copy.
 *
 * @param {string} workingCopyPath - Root of SVN working copy
 * @returns {import('./index.js').VcsAdapter}
 */
export function createSvnAdapter(workingCopyPath) {
  async function svn(...args) {
    const { stdout } = await execFileAsync('svn', args, {
      cwd: workingCopyPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  }

  return {
    type: 'svn',

    /**
     * Get files changed since a given revision.
     *
     * @param {string} [since] - SVN revision number
     * @returns {Promise<import('./index.js').FileChange[]>}
     */
    async getChangedFiles(since) {
      let output;

      if (since) {
        output = await svn('diff', '--summarize', '-r', `${since}:HEAD`);
      } else {
        output = await svn('status');
      }

      return parseSvnOutput(output);
    },

    /**
     * Get the current working copy revision.
     * @returns {Promise<string>}
     */
    async getCurrentRevision() {
      const output = await svn('info', '--show-item', 'revision');
      return output;
    },

    /**
     * Get all versioned files in the working copy.
     * @returns {Promise<string[]>}
     */
    async getFileList() {
      const output = await svn('list', '-R', '--depth', 'infinity');
      return output.split('\n').filter(line => line && !line.endsWith('/'));
    },
  };
}

/**
 * Parse SVN status or diff --summarize output.
 * @param {string} output
 * @returns {import('./index.js').FileChange[]}
 */
function parseSvnOutput(output) {
  if (!output) return [];

  return output.split('\n').filter(Boolean).map(line => {
    const code = line.charAt(0);
    // SVN status format: "X       path/to/file"
    const path = line.slice(8).trim() || line.slice(1).trim();

    const statusMap = { A: 'added', M: 'modified', D: 'deleted' };
    const status = statusMap[code] || 'modified';

    return { path, status };
  });
}
