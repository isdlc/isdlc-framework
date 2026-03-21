/**
 * Unit tests for src/core/state/index.js — Expanded StateStore (REQ-0080 Group A)
 *
 * Tests: readState, writeState, readStateValue, getProjectRoot, stateFileExistsOnDisk
 * with monorepo support via injected resolvers.
 *
 * Requirements: FR-001 (AC-001-01 through AC-001-03), FR-005 (AC-005-01)
 *
 * Uses REAL temp filesystem for isolation (no mocks).
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import will be from the expanded core state module
import {
  readState,
  writeState,
  readStateValue,
  getProjectRoot,
  stateFileExistsOnDisk,
  getNestedValue
} from '../../../src/core/state/index.js';

// ---------------------------------------------------------------------------
// Helper: create isolated temp project with .isdlc/state.json
// ---------------------------------------------------------------------------
function createTempProject(stateContent = null) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-expanded-')));
  const isdlcDir = join(base, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });
  if (stateContent !== null) {
    writeFileSync(join(isdlcDir, 'state.json'), JSON.stringify(stateContent, null, 2), 'utf-8');
  }
  return base;
}

function createMonorepoProject(projects = {}, defaultProject = null) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-mono-')));
  const isdlcDir = join(base, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });

  const monorepoConfig = { projects, default_project: defaultProject };
  writeFileSync(join(isdlcDir, 'monorepo.json'), JSON.stringify(monorepoConfig, null, 2), 'utf-8');

  // Create project directories and state files
  for (const [id, config] of Object.entries(projects)) {
    const projectStateDir = join(isdlcDir, 'projects', id);
    mkdirSync(projectStateDir, { recursive: true });
    if (config.state) {
      writeFileSync(join(projectStateDir, 'state.json'), JSON.stringify(config.state, null, 2), 'utf-8');
    }
  }

  return base;
}

function cleanupTemp(dir) {
  if (dir && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// readState — CJS-compatible synchronous API
// ---------------------------------------------------------------------------
describe('readState() — expanded', () => {
  let projectRoot;

  afterEach(() => { cleanupTemp(projectRoot); projectRoot = null; });

  it('EXP-01: returns parsed state from single-project state.json', () => {
    const state = { project_name: 'test', current_phase: '06' };
    projectRoot = createTempProject(state);

    // Simulate the CJS API: readState uses resolveStatePath internally
    // For now we test the CJS-compatible signature: readState(projectId)
    // with CLAUDE_PROJECT_DIR set to our temp dir
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const result = readState();
      assert.deepStrictEqual(result, state);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-02: returns null when state.json does not exist', () => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-expanded-')));
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const result = readState();
      assert.equal(result, null);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-03: returns null on corrupt JSON', () => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-expanded-')));
    const isdlcDir = join(projectRoot, '.isdlc');
    mkdirSync(isdlcDir, { recursive: true });
    writeFileSync(join(isdlcDir, 'state.json'), '{ corrupt!!!', 'utf-8');

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const result = readState();
      assert.equal(result, null);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// writeState — CJS-compatible synchronous API with version increment
// ---------------------------------------------------------------------------
describe('writeState() — expanded', () => {
  let projectRoot;

  afterEach(() => { cleanupTemp(projectRoot); projectRoot = null; });

  it('EXP-04: writes state with state_version auto-increment', () => {
    const initial = { project_name: 'test', state_version: 5 };
    projectRoot = createTempProject(initial);

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const newState = { project_name: 'test', updated: true };
      const result = writeState(newState);
      assert.equal(result, true);

      const raw = readFileSync(join(projectRoot, '.isdlc', 'state.json'), 'utf-8');
      const written = JSON.parse(raw);
      assert.equal(written.state_version, 6, 'state_version should be incremented');
      assert.equal(written.updated, true);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-05: initializes state_version to 1 when no prior version', () => {
    projectRoot = createTempProject({});

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const result = writeState({ project_name: 'fresh' });
      assert.equal(result, true);

      const raw = readFileSync(join(projectRoot, '.isdlc', 'state.json'), 'utf-8');
      const written = JSON.parse(raw);
      assert.equal(written.state_version, 1);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-06: does not mutate the caller object', () => {
    projectRoot = createTempProject({ state_version: 10 });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const callerObj = { project_name: 'immutable' };
      writeState(callerObj);
      assert.equal(callerObj.state_version, undefined, 'Caller object must not be mutated');
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-07: creates directory if missing', () => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-expanded-')));
    // No .isdlc/ exists

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const result = writeState({ created: true });
      assert.equal(result, true);
      assert.ok(existsSync(join(projectRoot, '.isdlc', 'state.json')));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// readStateValue — nested dot-path value access
// ---------------------------------------------------------------------------
describe('readStateValue()', () => {
  let projectRoot;

  afterEach(() => { cleanupTemp(projectRoot); projectRoot = null; });

  it('EXP-08: reads top-level value', () => {
    projectRoot = createTempProject({ project_name: 'test' });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const val = readStateValue('project_name');
      assert.equal(val, 'test');
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-09: reads nested dot-path value', () => {
    projectRoot = createTempProject({
      phases: { '06-implementation': { status: 'active' } }
    });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const val = readStateValue('phases.06-implementation.status');
      assert.equal(val, 'active');
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-10: returns undefined for missing path', () => {
    projectRoot = createTempProject({ project_name: 'test' });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const val = readStateValue('nonexistent.deep.path');
      assert.equal(val, undefined);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-11: returns undefined when state.json missing', () => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-expanded-')));
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      const val = readStateValue('project_name');
      assert.equal(val, undefined);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// stateFileExistsOnDisk
// ---------------------------------------------------------------------------
describe('stateFileExistsOnDisk()', () => {
  let projectRoot;

  afterEach(() => { cleanupTemp(projectRoot); projectRoot = null; });

  it('EXP-12: returns true when state.json exists', () => {
    projectRoot = createTempProject({ ok: true });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      assert.equal(stateFileExistsOnDisk(), true);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('EXP-13: returns false when state.json does not exist', () => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-expanded-')));
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    try {
      assert.equal(stateFileExistsOnDisk(), false);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// getNestedValue — pure utility
// ---------------------------------------------------------------------------
describe('getNestedValue()', () => {
  it('EXP-14: returns nested value by dot path', () => {
    const obj = { a: { b: { c: 42 } } };
    assert.equal(getNestedValue(obj, 'a.b.c'), 42);
  });

  it('EXP-15: returns undefined for missing path', () => {
    const obj = { a: { b: 1 } };
    assert.equal(getNestedValue(obj, 'a.x.y'), undefined);
  });

  it('EXP-16: returns top-level value', () => {
    const obj = { foo: 'bar' };
    assert.equal(getNestedValue(obj, 'foo'), 'bar');
  });
});
