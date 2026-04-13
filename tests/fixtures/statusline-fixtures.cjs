/**
 * Test fixtures for REQ-GH-244 Status Line Embedding Server
 *
 * Provides data factories for health files, config, VCS staleness results,
 * and boundary/invalid test data for all modules in this feature.
 *
 * Usage:
 *   const fixtures = require('./statusline-fixtures.cjs');
 *   const { healthFile, config, staleness, format } = fixtures;
 */

'use strict';

// ---------------------------------------------------------------------------
// Health File Fixtures
// ---------------------------------------------------------------------------

const healthFile = {
  /**
   * Factory: create a health file object with defaults.
   * @param {Object} overrides - Fields to override
   * @returns {Object} Health file data
   */
  make(overrides = {}) {
    return {
      status: 'healthy',
      checked_at: new Date().toISOString(),
      port: 3100,
      chunks: 19811,
      commits_behind: 0,
      files_changed: 0,
      vcs: 'git',
      generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
      error: null,
      ...overrides,
    };
  },

  healthy: {
    status: 'healthy',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: 3100,
    chunks: 19811,
    commits_behind: 0,
    files_changed: 0,
    vcs: 'git',
    generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
    error: null,
  },

  staleCommitsOnly: {
    status: 'stale',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: 3100,
    chunks: 19811,
    commits_behind: 5,
    files_changed: 0,
    vcs: 'git',
    generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
    error: null,
  },

  staleFilesOnly: {
    status: 'stale',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: 3100,
    chunks: 19811,
    commits_behind: 0,
    files_changed: 3,
    vcs: 'git',
    generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
    error: null,
  },

  staleBoth: {
    status: 'stale',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: 3100,
    chunks: 19811,
    commits_behind: 5,
    files_changed: 3,
    vcs: 'git',
    generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
    error: null,
  },

  offline: {
    status: 'offline',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: null,
    chunks: null,
    commits_behind: null,
    files_changed: null,
    vcs: 'git',
    generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
    error: 'connection_refused',
  },

  loading: {
    status: 'loading',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: null,
    chunks: null,
    commits_behind: null,
    files_changed: null,
    vcs: 'git',
    generated_at_commit: null,
    error: null,
  },

  missing: {
    status: 'missing',
    checked_at: '2026-04-12T10:00:00.000Z',
    port: null,
    chunks: null,
    commits_behind: null,
    files_changed: null,
    vcs: 'unknown',
    generated_at_commit: null,
    error: null,
  },

  corruptJson: '{ "status": "healthy", BROKEN',
};

// ---------------------------------------------------------------------------
// Config Fixtures
// ---------------------------------------------------------------------------

const config = {
  /**
   * Factory: create config object with defaults.
   * @param {Object} overrides - Fields to override within embeddings
   * @returns {Object} Config data
   */
  make(overrides = {}) {
    return {
      embeddings: {
        statusline: { enabled: true },
        health_check_interval_minutes: 5,
        ...overrides,
      },
    };
  },

  enabled: {
    embeddings: {
      statusline: { enabled: true },
      health_check_interval_minutes: 5,
    },
  },

  disabled: {
    embeddings: {
      statusline: { enabled: false },
      health_check_interval_minutes: 5,
    },
  },

  customInterval: {
    embeddings: {
      statusline: { enabled: true },
      health_check_interval_minutes: 2,
    },
  },

  corruptJson: '{ "embeddings": BROKEN',
};

// ---------------------------------------------------------------------------
// VCS Staleness Fixtures
// ---------------------------------------------------------------------------

const staleness = {
  /**
   * Factory: create staleness result with defaults.
   * @param {Object} overrides
   * @returns {Object} StalenessResult
   */
  make(overrides = {}) {
    return {
      commits_behind: 0,
      files_changed: 0,
      vcs: 'git',
      remote: 'origin/main',
      error: null,
      ...overrides,
    };
  },

  gitFresh: {
    commits_behind: 0,
    files_changed: 0,
    vcs: 'git',
    remote: 'origin/main',
    error: null,
  },

  gitStaleCommits: {
    commits_behind: 5,
    files_changed: 0,
    vcs: 'git',
    remote: 'origin/main',
    error: null,
  },

  gitStaleFiles: {
    commits_behind: 0,
    files_changed: 3,
    vcs: 'git',
    remote: 'origin/main',
    error: null,
  },

  gitStaleBoth: {
    commits_behind: 5,
    files_changed: 3,
    vcs: 'git',
    remote: 'origin/main',
    error: null,
  },

  gitNoUpstream: {
    commits_behind: 2,
    files_changed: 1,
    vcs: 'git',
    remote: null,
    error: null,
  },

  gitFetchFailed: {
    commits_behind: 2,
    files_changed: 1,
    vcs: 'git',
    remote: 'origin/main',
    error: null,
  },

  svnFresh: {
    commits_behind: 0,
    files_changed: 0,
    vcs: 'svn',
    remote: null,
    error: null,
  },

  svnStale: {
    commits_behind: 3,
    files_changed: 7,
    vcs: 'svn',
    remote: null,
    error: null,
  },

  noVcs: {
    commits_behind: null,
    files_changed: null,
    vcs: 'unknown',
    remote: null,
    error: null,
  },

  allFailed: {
    commits_behind: null,
    files_changed: null,
    vcs: 'git',
    remote: null,
    error: 'all commands failed',
  },
};

// ---------------------------------------------------------------------------
// Expected Format Strings
// ---------------------------------------------------------------------------

const format = {
  healthy:         'emb: 19811 chunks \u2713',
  staleCommits:    'emb: stale (5 commits behind)',
  staleFiles:      'emb: stale (3 files modified)',
  staleBoth:       'emb: stale (5 commits behind, 3 files modified)',
  offline:         'emb: offline',
  loading:         'emb: loading...',
  missing:         'emb: not configured',
};

// ---------------------------------------------------------------------------
// Boundary / Edge Case Data
// ---------------------------------------------------------------------------

const boundary = {
  largeCommitCount: { commits_behind: 999999, files_changed: 0 },
  largeFileCount: { commits_behind: 0, files_changed: 10000 },
  largeChunkCount: { chunks: 1000000 },
  longGitRef: 'abc1234567890def1234567890abc1234567890de',
  shortGitRef: 'abc1234',
  svnHighRevision: '999999',
  emptyRef: '',
  nullRef: null,
};

const invalid = {
  nullProjectRoot: null,
  numericProjectRoot: 42,
  nonexistentProjectRoot: '/tmp/nonexistent-project-root-xyz',
  nullGeneratedRef: null,
  emptyGeneratedRef: '',
};

module.exports = {
  healthFile,
  config,
  staleness,
  format,
  boundary,
  invalid,
};
