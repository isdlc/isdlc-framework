/**
 * VCS staleness detection — git + SVN dual-metric abstraction.
 *
 * Exports getCommitsBehind(generatedRef, projectRoot) which returns
 * a StalenessResult with commits_behind (remote delta) and files_changed
 * (local diff since generation commit).
 *
 * Fail-open (Article X): every shell command is wrapped in try/catch
 * with timeouts; failures yield null metrics, never throw.
 *
 * REQ-GH-244 FR-003, AC-003-01 through AC-003-07
 * @module src/core/vcs/staleness
 */

'use strict';

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

/**
 * @typedef {Object} StalenessResult
 * @property {number|null} commits_behind - Remote commits since generation
 * @property {number|null} files_changed  - Local files modified since generation
 * @property {"git"|"svn"|"unknown"} vcs  - Detected VCS type
 * @property {string|null} remote         - Remote ref used (e.g., "origin/main")
 * @property {string|null} error          - Error description if any check failed
 */

/**
 * Run a shell command safely with timeout.
 * @param {string} cmd
 * @param {string} cwd
 * @param {number} [timeoutMs=5000]
 * @returns {string|null} trimmed stdout or null on failure
 */
function safeExec(cmd, cwd, timeoutMs = 5000) {
  try {
    return execSync(cmd, { cwd, timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

/**
 * Detect git staleness against remote and local changes.
 * @param {string} generatedRef
 * @param {string} projectRoot
 * @returns {StalenessResult}
 */
function gitStaleness(generatedRef, projectRoot) {
  let commits_behind = null;
  let files_changed = null;
  let remote = null;

  // 1. Attempt git fetch (fail-open: skip if network unavailable)
  safeExec('git fetch --quiet', projectRoot, 5000);

  // 2. Determine upstream ref
  const upstream = safeExec('git rev-parse --abbrev-ref @{upstream}', projectRoot, 3000);
  if (upstream) {
    remote = upstream;
  }

  // 3. Compute commits_behind: rev-list count from generatedRef to upstream (or HEAD)
  const target = remote || 'HEAD';
  const countStr = safeExec(`git rev-list --count ${generatedRef}..${target}`, projectRoot, 3000);
  if (countStr !== null) {
    const n = parseInt(countStr, 10);
    if (!isNaN(n)) commits_behind = n;
  }

  // 4. Compute files_changed: diff from generatedRef to working tree
  const diffOutput = safeExec(`git diff --name-only ${generatedRef}`, projectRoot, 3000);
  if (diffOutput !== null) {
    files_changed = diffOutput === '' ? 0 : diffOutput.split('\n').filter(Boolean).length;
  }

  return { commits_behind, files_changed, vcs: 'git', remote, error: null };
}

/**
 * Detect SVN staleness.
 * @param {string} generatedRef
 * @param {string} projectRoot
 * @returns {StalenessResult}
 */
function svnStaleness(generatedRef, projectRoot) {
  let commits_behind = null;
  let files_changed = null;

  // 1. Get current revision
  const revStr = safeExec('svn info --show-item revision', projectRoot, 3000);
  if (revStr !== null) {
    const currentRev = parseInt(revStr, 10);
    const genRev = parseInt(generatedRef, 10);
    if (!isNaN(currentRev) && !isNaN(genRev)) {
      commits_behind = Math.max(0, currentRev - genRev);
    }
  }

  // 2. Count local modifications
  const statusOutput = safeExec('svn status', projectRoot, 3000);
  if (statusOutput !== null) {
    files_changed = statusOutput === '' ? 0 : statusOutput.split('\n').filter(Boolean).length;
  }

  return { commits_behind, files_changed, vcs: 'svn', remote: null, error: null };
}

/**
 * Validate that a ref string is safe for shell interpolation.
 * Accepts hex git refs (short or full SHA) and numeric SVN revisions.
 * Rejects anything containing shell metacharacters.
 * @param {string} ref
 * @returns {boolean}
 */
function isSafeRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0 || ref.length > 100) return false;
  return /^[a-fA-F0-9]+$/.test(ref);
}

/**
 * Check staleness against remote and local changes.
 *
 * @param {string} generatedRef - VCS ref when embeddings were generated
 * @param {string} projectRoot  - Absolute path to project root
 * @returns {StalenessResult}
 */
function getCommitsBehind(generatedRef, projectRoot) {
  try {
    // Validate ref to prevent command injection (defense-in-depth, Article III)
    if (!isSafeRef(generatedRef)) {
      return { commits_behind: null, files_changed: null, vcs: 'unknown', remote: null, error: 'invalid ref' };
    }

    // Detect VCS type
    if (existsSync(join(projectRoot, '.git'))) {
      return gitStaleness(generatedRef, projectRoot);
    }
    if (existsSync(join(projectRoot, '.svn'))) {
      return svnStaleness(generatedRef, projectRoot);
    }
    // No VCS detected
    return { commits_behind: null, files_changed: null, vcs: 'unknown', remote: null, error: null };
  } catch (err) {
    // Fail-open: never throw
    return { commits_behind: null, files_changed: null, vcs: 'unknown', remote: null, error: err.message };
  }
}

module.exports = { getCommitsBehind, isSafeRef };
