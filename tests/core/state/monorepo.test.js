/**
 * Unit tests for src/core/state/monorepo.js — Monorepo Support (REQ-0080 Group C)
 *
 * Tests: isMonorepoMode, readMonorepoConfig, writeMonorepoConfig,
 *        resolveProjectFromCwd, getActiveProject
 *
 * Requirements: FR-002 (AC-002-01 through AC-002-03)
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  isMonorepoMode,
  readMonorepoConfig,
  writeMonorepoConfig,
  resolveProjectFromCwd,
  getActiveProject
} from '../../../src/core/state/monorepo.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createSingleProject() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-mono-test-')));
  mkdirSync(join(base, '.isdlc'), { recursive: true });
  return base;
}

function createMonorepoBase(projects = {}, defaultProject = null) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-mono-test-')));
  mkdirSync(join(base, '.isdlc'), { recursive: true });

  const config = { projects, default_project: defaultProject };
  writeFileSync(join(base, '.isdlc', 'monorepo.json'), JSON.stringify(config, null, 2), 'utf-8');

  // Create project directories
  for (const [id, cfg] of Object.entries(projects)) {
    if (cfg.path) {
      mkdirSync(join(base, cfg.path), { recursive: true });
    }
  }

  return base;
}

const dirs = [];
function track(dir) { dirs.push(dir); return dir; }

afterEach(() => {
  // Restore env
  delete process.env.ISDLC_PROJECT;
  for (const d of dirs) {
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  dirs.length = 0;
});

// ---------------------------------------------------------------------------
// isMonorepoMode
// ---------------------------------------------------------------------------
describe('isMonorepoMode()', () => {
  it('MONO-01: returns false when monorepo.json does not exist', () => {
    const root = track(createSingleProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(isMonorepoMode(), false);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('MONO-02: returns true when monorepo.json exists', () => {
    const root = track(createMonorepoBase({ app1: { path: 'apps/app1' } }));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(isMonorepoMode(), true);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// readMonorepoConfig
// ---------------------------------------------------------------------------
describe('readMonorepoConfig()', () => {
  it('MONO-03: returns null when no monorepo.json', () => {
    const root = track(createSingleProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(readMonorepoConfig(), null);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('MONO-04: returns parsed monorepo config', () => {
    const root = track(createMonorepoBase({ app1: { path: 'apps/app1' } }, 'app1'));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const config = readMonorepoConfig();
      assert.ok(config);
      assert.equal(config.default_project, 'app1');
      assert.ok(config.projects.app1);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// writeMonorepoConfig
// ---------------------------------------------------------------------------
describe('writeMonorepoConfig()', () => {
  it('MONO-05: writes config and returns true', () => {
    const root = track(createSingleProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const config = { projects: { app1: { path: 'apps/app1' } }, default_project: 'app1' };
      const result = writeMonorepoConfig(config);
      assert.equal(result, true);

      const raw = readFileSync(join(root, '.isdlc', 'monorepo.json'), 'utf-8');
      const written = JSON.parse(raw);
      assert.deepStrictEqual(written, config);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveProjectFromCwd
// ---------------------------------------------------------------------------
describe('resolveProjectFromCwd()', () => {
  it('MONO-06: returns null when not in monorepo mode', () => {
    const root = track(createSingleProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(resolveProjectFromCwd(), null);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('MONO-07: resolves project by CWD longest prefix match', () => {
    const root = track(createMonorepoBase({
      app1: { path: 'apps/app1' },
      app2: { path: 'apps/app2' }
    }));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    const origCwd = process.cwd();
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      process.chdir(join(root, 'apps', 'app1'));
      const result = resolveProjectFromCwd();
      assert.equal(result, 'app1');
    } finally {
      process.chdir(origCwd);
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// getActiveProject
// ---------------------------------------------------------------------------
describe('getActiveProject()', () => {
  it('MONO-08: returns null when not in monorepo mode', () => {
    const root = track(createSingleProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(getActiveProject(), null);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('MONO-09: prefers ISDLC_PROJECT env var', () => {
    const root = track(createMonorepoBase({ app1: { path: 'apps/app1' } }, 'app1'));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    process.env.ISDLC_PROJECT = 'override-project';
    try {
      const result = getActiveProject();
      assert.equal(result, 'override-project');
    } finally {
      delete process.env.ISDLC_PROJECT;
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('MONO-10: falls back to default_project from config', () => {
    const root = track(createMonorepoBase({ app1: { path: 'apps/app1' } }, 'app1'));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    const origCwd = process.cwd();
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      // CWD is project root, not under any project path
      process.chdir(root);
      const result = getActiveProject();
      assert.equal(result, 'app1');
    } finally {
      process.chdir(origCwd);
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});
