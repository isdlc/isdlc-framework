/**
 * Unit tests for src/core/state/paths.js — Path Resolution (REQ-0080 Group B)
 *
 * Tests: resolveStatePath, resolveConstitutionPath, resolveDocsPath,
 *        resolveExternalSkillsPath, resolveExternalManifestPath,
 *        resolveSkillReportPath, resolveTasksPath, resolveTestEvaluationPath,
 *        resolveAtddChecklistPath, resolveIsdlcDocsPath
 *
 * Requirements: FR-004 (AC-004-01)
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

import {
  resolveStatePath,
  resolveConstitutionPath,
  resolveDocsPath,
  resolveExternalSkillsPath,
  resolveExternalManifestPath,
  resolveSkillReportPath,
  resolveTasksPath,
  resolveTestEvaluationPath,
  resolveAtddChecklistPath,
  resolveIsdlcDocsPath
} from '../../../src/core/state/paths.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTempProject() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-paths-')));
  const isdlcDir = join(base, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });
  return base;
}

function createMonorepoProject(projects = {}, defaultProject = null) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'isdlc-paths-mono-')));
  const isdlcDir = join(base, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });

  const config = { projects, default_project: defaultProject };
  writeFileSync(join(isdlcDir, 'monorepo.json'), JSON.stringify(config, null, 2), 'utf-8');

  for (const [id, cfg] of Object.entries(projects)) {
    const projDir = join(isdlcDir, 'projects', id);
    mkdirSync(projDir, { recursive: true });
  }

  return base;
}

const dirs = [];
function track(dir) { dirs.push(dir); return dir; }

afterEach(() => {
  for (const d of dirs) {
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  dirs.length = 0;
});

// ---------------------------------------------------------------------------
// resolveStatePath — single project mode
// ---------------------------------------------------------------------------
describe('resolveStatePath()', () => {
  it('PATH-01: returns .isdlc/state.json in single-project mode', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveStatePath();
      assert.equal(result, join(root, '.isdlc', 'state.json'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('PATH-02: returns monorepo project-specific path', () => {
    const root = track(createMonorepoProject({ myapp: { path: 'apps/myapp' } }, 'myapp'));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveStatePath('myapp');
      assert.equal(result, join(root, '.isdlc', 'projects', 'myapp', 'state.json'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveConstitutionPath
// ---------------------------------------------------------------------------
describe('resolveConstitutionPath()', () => {
  it('PATH-03: prefers docs/isdlc/constitution.md when it exists', () => {
    const root = track(createTempProject());
    const newPath = join(root, 'docs', 'isdlc', 'constitution.md');
    mkdirSync(join(root, 'docs', 'isdlc'), { recursive: true });
    writeFileSync(newPath, '# Constitution', 'utf-8');

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveConstitutionPath();
      assert.equal(result, newPath);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('PATH-04: falls back to .isdlc/constitution.md for legacy', () => {
    const root = track(createTempProject());
    const legacyPath = join(root, '.isdlc', 'constitution.md');
    writeFileSync(legacyPath, '# Legacy Constitution', 'utf-8');

    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveConstitutionPath();
      assert.equal(result, legacyPath);
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('PATH-05: defaults to new location when neither exists', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveConstitutionPath();
      assert.equal(result, join(root, 'docs', 'isdlc', 'constitution.md'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveDocsPath
// ---------------------------------------------------------------------------
describe('resolveDocsPath()', () => {
  it('PATH-06: returns docs/ in single project mode', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      assert.equal(resolveDocsPath(), join(root, 'docs'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveExternalSkillsPath
// ---------------------------------------------------------------------------
describe('resolveExternalSkillsPath()', () => {
  it('PATH-07: returns .claude/skills/external/ in single-project mode', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveExternalSkillsPath();
      assert.ok(result.endsWith(join('skills', 'external')));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveExternalManifestPath
// ---------------------------------------------------------------------------
describe('resolveExternalManifestPath()', () => {
  it('PATH-08: returns new location path when no files exist', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveExternalManifestPath();
      assert.ok(result.includes(join('docs', 'isdlc', 'external-skills-manifest.json')));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveSkillReportPath
// ---------------------------------------------------------------------------
describe('resolveSkillReportPath()', () => {
  it('PATH-09: returns new location by default', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveSkillReportPath();
      assert.ok(result.includes(join('docs', 'isdlc', 'skill-customization-report.md')));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveTasksPath
// ---------------------------------------------------------------------------
describe('resolveTasksPath()', () => {
  it('PATH-10: returns new location by default', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveTasksPath();
      assert.ok(result.includes(join('docs', 'isdlc', 'tasks.md')));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveTestEvaluationPath
// ---------------------------------------------------------------------------
describe('resolveTestEvaluationPath()', () => {
  it('PATH-11: returns new location by default', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveTestEvaluationPath();
      assert.ok(result.includes(join('docs', 'isdlc', 'test-evaluation-report.md')));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveAtddChecklistPath
// ---------------------------------------------------------------------------
describe('resolveAtddChecklistPath()', () => {
  it('PATH-12: returns default path without domain', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveAtddChecklistPath();
      assert.ok(result.endsWith('atdd-checklist.json'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('PATH-13: includes domain suffix when provided', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveAtddChecklistPath(undefined, 'inventory');
      assert.ok(result.endsWith('atdd-checklist-inventory.json'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});

// ---------------------------------------------------------------------------
// resolveIsdlcDocsPath
// ---------------------------------------------------------------------------
describe('resolveIsdlcDocsPath()', () => {
  it('PATH-14: returns docs/isdlc/ in single-project mode', () => {
    const root = track(createTempProject());
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveIsdlcDocsPath();
      assert.equal(result, join(root, 'docs', 'isdlc'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  it('PATH-15: returns project-specific path in monorepo', () => {
    const root = track(createMonorepoProject({ myapp: { path: 'apps/myapp' } }, 'myapp'));
    const origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = root;
    try {
      const result = resolveIsdlcDocsPath('myapp');
      assert.equal(result, join(root, 'docs', 'isdlc', 'projects', 'myapp'));
    } finally {
      if (origEnv !== undefined) process.env.CLAUDE_PROJECT_DIR = origEnv;
      else delete process.env.CLAUDE_PROJECT_DIR;
    }
  });
});
