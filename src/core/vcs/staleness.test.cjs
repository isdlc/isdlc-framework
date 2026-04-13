/**
 * Unit tests for VCS staleness detection
 * REQ-GH-244 FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04, AC-003-05, AC-003-07
 *
 * Uses real temp directories with mock .git/.svn markers and mocks execSync
 * via module-level monkey-patching for deterministic testing.
 *
 * Test commands:
 *   node --test src/core/vcs/staleness.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

describe('VCS staleness detection', () => {
  let tmpDir;
  let originalExecSync;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staleness-test-'));
    // Save and mock execSync
    originalExecSync = childProcess.execSync;
  });

  afterEach(() => {
    // Restore execSync
    childProcess.execSync = originalExecSync;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    // Clear require cache so each test gets a fresh module
    delete require.cache[require.resolve('./staleness.cjs')];
  });

  /**
   * Helper: create a mock execSync that responds to specific commands.
   * @param {Object} responses - command-substring → response string or Error
   */
  function mockExecSync(responses) {
    childProcess.execSync = (cmd, opts) => {
      for (const [key, value] of Object.entries(responses)) {
        if (cmd.includes(key)) {
          if (value instanceof Error) throw value;
          return Buffer.from(value);
        }
      }
      // Default: throw for unmatched commands (fail-open path)
      throw new Error(`mock: unrecognized command: ${cmd}`);
    };
  }

  // ---- P0 Tests (Critical) ----

  it('[P0] AC-003-01: Given Git repo with remote, When getCommitsBehind() is called, Then returns both commits_behind (remote delta) and files_changed (local diff since generation)', () => {
    // Given: a Git repo with remote configured and generatedRef
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '3',
      'diff --name-only': 'file1.js\nfile2.js\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    assert.equal(result.commits_behind, 3);
    assert.equal(result.files_changed, 2);
    assert.equal(result.vcs, 'git');
    assert.equal(result.remote, 'origin/main');
    assert.equal(result.error, null);
  });

  it('[P0] AC-003-02: Given SVN repo with local modifications but no new revisions, When getCommitsBehind() is called, Then files_changed reflects svn status count and commits_behind is 0', () => {
    // Given: an SVN repo where current revision equals generatedRef
    fs.mkdirSync(path.join(tmpDir, '.svn'), { recursive: true });
    mockExecSync({
      'svn info': '100',
      'svn status': 'M       file1.txt\nM       file2.txt\nA       file3.txt\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('100', tmpDir);

    assert.equal(result.commits_behind, 0);
    assert.equal(result.files_changed, 3);
    assert.equal(result.vcs, 'svn');
    assert.equal(result.remote, null);
    assert.equal(result.error, null);
  });

  it('[P0] AC-003-03: Given no VCS detected (.git and .svn absent), When getCommitsBehind() is called, Then returns nulls with vcs unknown', () => {
    // Given: projectRoot has neither .git/ nor .svn/ directory
    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    assert.equal(result.commits_behind, null);
    assert.equal(result.files_changed, null);
    assert.equal(result.vcs, 'unknown');
    assert.equal(result.remote, null);
    assert.equal(result.error, null);
  });

  it('[P0] AC-003-07: Given files modified locally but not committed, When getCommitsBehind() is called, Then status shows stale with file count without waiting for commit', () => {
    // Given: a Git repo with uncommitted local file changes since generatedRef
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '0',
      'diff --name-only': 'modified.js\nnew-file.ts\nchanged.md\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    assert.ok(result.files_changed > 0);
    assert.equal(result.files_changed, 3);
    assert.equal(result.commits_behind, 0);
  });

  it('[P0] AC-003-01: Given Git repo with zero commits behind and zero files changed, When getCommitsBehind() is called, Then returns both as 0', () => {
    // Given: a Git repo at the same commit as generatedRef with no local changes
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '0',
      'diff --name-only': '',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    assert.equal(result.commits_behind, 0);
    assert.equal(result.files_changed, 0);
    assert.equal(result.vcs, 'git');
  });

  it('[P0] AC-003-02: Given SVN repo with zero revisions behind and zero files changed, When getCommitsBehind() is called, Then returns both as 0', () => {
    // Given: an SVN repo at the same revision as generatedRef with no local changes
    fs.mkdirSync(path.join(tmpDir, '.svn'), { recursive: true });
    mockExecSync({
      'svn info': '50',
      'svn status': '',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('50', tmpDir);

    assert.equal(result.commits_behind, 0);
    assert.equal(result.files_changed, 0);
    assert.equal(result.vcs, 'svn');
  });

  // ---- P1 Tests (High) ----

  it('[P1] AC-003-04: Given Git repo with no upstream configured, When getCommitsBehind() is called, Then falls back to local HEAD for commits and still reports local file changes', () => {
    // Given: a Git repo where upstream is not configured
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': new Error('fatal: no upstream configured'),
      'rev-list --count': '2',
      'diff --name-only': 'changed.js\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    // Falls back to HEAD when no upstream
    assert.equal(result.remote, null);
    assert.equal(result.commits_behind, 2);
    assert.equal(result.files_changed, 1);
  });

  it('[P1] AC-003-05: Given git fetch fails due to no network, When getCommitsBehind() is called, Then falls back to local HEAD and still reports local file changes', () => {
    // Given: git fetch throws an error (network unreachable)
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': new Error('fatal: Could not resolve host'),
      '@{upstream}': 'origin/main',
      'rev-list --count': '1',
      'diff --name-only': 'file.js\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    // Still works despite fetch failure
    assert.equal(result.commits_behind, 1);
    assert.equal(result.files_changed, 1);
    assert.equal(result.error, null);
    assert.equal(result.vcs, 'git');
  });

  // ---- P2 Tests (Medium) ----

  it('[P2] AC-003-05: Given git rev-list command fails, When getCommitsBehind() is called, Then commits_behind is null and execution continues', () => {
    // Given: git rev-list throws an error
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list': new Error('bad object abc123'),
      'diff --name-only': 'file.js\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    assert.equal(result.commits_behind, null);
    assert.equal(result.files_changed, 1);
    assert.equal(result.vcs, 'git');
  });

  it('[P2] AC-003-04: Given git diff command fails, When getCommitsBehind() is called, Then files_changed is null and execution continues', () => {
    // Given: git diff throws an error
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    mockExecSync({
      'git fetch': '',
      '@{upstream}': 'origin/main',
      'rev-list --count': '2',
      'diff --name-only': new Error('bad revision'),
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('abc123', tmpDir);

    assert.equal(result.commits_behind, 2);
    assert.equal(result.files_changed, null);
    assert.equal(result.vcs, 'git');
  });

  it('[P2] AC-003-02: Given SVN info command fails, When getCommitsBehind() is called, Then commits_behind is null and execution continues', () => {
    // Given: svn info throws an error
    fs.mkdirSync(path.join(tmpDir, '.svn'), { recursive: true });
    mockExecSync({
      'svn info': new Error('svn: E155007: not a working copy'),
      'svn status': 'M       file1.txt\n',
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('50', tmpDir);

    assert.equal(result.commits_behind, null);
    assert.equal(result.files_changed, 1);
    assert.equal(result.vcs, 'svn');
  });

  it('[P2] AC-003-02: Given SVN status command fails, When getCommitsBehind() is called, Then files_changed is null and execution continues', () => {
    // Given: svn status throws an error
    fs.mkdirSync(path.join(tmpDir, '.svn'), { recursive: true });
    mockExecSync({
      'svn info': '55',
      'svn status': new Error('svn: E155007: not a working copy'),
    });

    const { getCommitsBehind } = require('./staleness.cjs');
    const result = getCommitsBehind('50', tmpDir);

    assert.equal(result.commits_behind, 5);
    assert.equal(result.files_changed, null);
    assert.equal(result.vcs, 'svn');
  });
});
