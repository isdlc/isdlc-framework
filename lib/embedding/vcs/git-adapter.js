/**
 * Git Adapter — Git CLI wrapper for VCS operations.
 *
 * REQ-0045 / FR-014 / M3 VCS
 * @module lib/embedding/vcs/git-adapter
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Create a Git VCS adapter for the given working copy.
 *
 * @param {string} workingCopyPath - Root of Git working copy
 * @returns {import('./index.js').VcsAdapter}
 */
export function createGitAdapter(workingCopyPath) {
  async function git(...args) {
    const { stdout } = await execFileAsync('git', args, {
      cwd: workingCopyPath,
      maxBuffer: 10 * 1024 * 1024, // 10 MB for large repos
    });
    return stdout.trim();
  }

  return {
    type: 'git',

    /**
     * Get files changed since a given revision.
     * If no revision provided, returns uncommitted changes.
     *
     * @param {string} [since] - Git revision (commit hash, branch, tag)
     * @returns {Promise<import('./index.js').FileChange[]>}
     */
    async getChangedFiles(since) {
      let output;

      if (since) {
        // Changes between revision and HEAD
        output = await git('diff', '--name-status', since, 'HEAD');
      } else {
        // All uncommitted changes (staged + unstaged)
        output = await git('status', '--porcelain', '-z');
        return parseStatusOutput(output);
      }

      return parseDiffOutput(output);
    },

    /**
     * Get the current HEAD revision hash.
     * @returns {Promise<string>}
     */
    async getCurrentRevision() {
      return git('rev-parse', 'HEAD');
    },

    /**
     * Get all tracked files in the repository.
     * @returns {Promise<string[]>}
     */
    async getFileList() {
      const output = await git('ls-files');
      return output.split('\n').filter(Boolean);
    },
  };
}

/**
 * Parse `git diff --name-status` output.
 * @param {string} output
 * @returns {import('./index.js').FileChange[]}
 */
function parseDiffOutput(output) {
  if (!output) return [];

  return output.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t');
    const statusCode = parts[0].charAt(0);
    const path = parts[1];

    const statusMap = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed' };
    const status = statusMap[statusCode] || 'modified';

    const change = { path, status };
    if (statusCode === 'R' && parts[2]) {
      change.oldPath = path;
      change.path = parts[2];
    }

    return change;
  });
}

/**
 * Parse `git status --porcelain -z` output.
 * @param {string} output
 * @returns {import('./index.js').FileChange[]}
 */
function parseStatusOutput(output) {
  if (!output) return [];

  const entries = output.split('\0').filter(Boolean);
  const changes = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;

    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    const code = xy.trim().charAt(0);

    const statusMap = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', '?': 'added' };
    const status = statusMap[code] || 'modified';

    const change = { path, status };

    // Renames have the new path as the next entry
    if (code === 'R') {
      change.oldPath = path;
      if (i + 1 < entries.length) {
        change.path = entries[++i];
      }
    }

    changes.push(change);
  }

  return changes;
}
