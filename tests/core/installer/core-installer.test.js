/**
 * Tests for src/core/installer/index.js
 *
 * Unit tests for the provider-neutral core installer functions:
 * installCore, updateCore, uninstallCore, doctorCore.
 *
 * REQ-0089: Provider-aware installer/updater/doctor/uninstaller
 *
 * Uses temp directories for isolation. All tests verify that core operations
 * produce the correct shared file structure independent of any provider.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';

// Import the core installer functions under test
import {
  installCore,
  updateCore,
  uninstallCore,
  doctorCore,
} from '../../../src/core/installer/index.js';

/**
 * Scaffold a minimal project directory for testing.
 */
function scaffoldProject(tempDir) {
  const projectDir = join(tempDir, 'test-project');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2),
    'utf-8'
  );
  return projectDir;
}

// ---------------------------------------------------------------------------
// installCore
// ---------------------------------------------------------------------------

describe('core/installer: installCore creates .isdlc directory structure', () => {
  let tempDir;
  let projectDir;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = scaffoldProject(tempDir);
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('creates .isdlc/ directory', async () => {
    await installCore(projectDir, { force: true, dryRun: false });
    assert.ok(existsSync(join(projectDir, '.isdlc')), '.isdlc/ should exist');
  });

  it('creates state.json with framework_version and project keys', async () => {
    await installCore(projectDir, { force: true, projectName: 'test-project' });
    const statePath = join(projectDir, '.isdlc', 'state.json');
    assert.ok(existsSync(statePath), 'state.json should exist');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.ok('framework_version' in state, 'should have framework_version');
    assert.ok('project' in state, 'should have project');
    assert.equal(state.project.name, 'test-project');
  });

  it('creates phase directories', async () => {
    await installCore(projectDir, { force: true });
    const phasesDir = join(projectDir, '.isdlc', 'phases');
    assert.ok(existsSync(phasesDir), '.isdlc/phases/ should exist');
    const entries = readdirSync(phasesDir);
    assert.ok(entries.length >= 13, 'should have at least 13 phase directories');
  });

  it('creates docs/ directory structure', async () => {
    await installCore(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, 'docs')), 'docs/ should exist');
    assert.ok(existsSync(join(projectDir, 'docs', 'requirements')), 'docs/requirements/ should exist');
    assert.ok(existsSync(join(projectDir, 'docs', 'architecture')), 'docs/architecture/ should exist');
  });

  it('creates constitution.md', async () => {
    await installCore(projectDir, { force: true, projectName: 'test-project' });
    const constitutionPath = join(projectDir, 'docs', 'isdlc', 'constitution.md');
    assert.ok(existsSync(constitutionPath), 'constitution should exist');
    const content = readFileSync(constitutionPath, 'utf-8');
    assert.ok(content.includes('test-project'), 'constitution should contain project name');
  });

  it('creates BACKLOG.md with Open and Completed sections', async () => {
    await installCore(projectDir, { force: true });
    const backlogPath = join(projectDir, 'BACKLOG.md');
    assert.ok(existsSync(backlogPath), 'BACKLOG.md should exist');
    const content = readFileSync(backlogPath, 'utf-8');
    assert.ok(content.includes('## Open'), 'should contain ## Open');
    assert.ok(content.includes('## Completed'), 'should contain ## Completed');
  });

  it('copies .isdlc config, checklists, templates, scripts from framework', async () => {
    await installCore(projectDir, { force: true });
    // Config directory should exist (copied from framework source)
    const configDir = join(projectDir, '.isdlc', 'config');
    assert.ok(existsSync(configDir), '.isdlc/config/ should exist');
  });

  it('does not create files in dry-run mode', async () => {
    await installCore(projectDir, { force: true, dryRun: true });
    assert.ok(!existsSync(join(projectDir, '.isdlc', 'state.json')), 'state.json should not exist in dry-run');
  });

  it('does not overwrite existing BACKLOG.md', async () => {
    const backlogPath = join(projectDir, 'BACKLOG.md');
    writeFileSync(backlogPath, '# Custom Backlog\n', 'utf-8');
    await installCore(projectDir, { force: true });
    const content = readFileSync(backlogPath, 'utf-8');
    assert.equal(content, '# Custom Backlog\n', 'BACKLOG.md should be preserved');
  });
});

// ---------------------------------------------------------------------------
// updateCore
// ---------------------------------------------------------------------------

describe('core/installer: updateCore updates shared framework files', () => {
  let tempDir;
  let projectDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    projectDir = scaffoldProject(tempDir);
    // Pre-install to have a valid starting state
    await installCore(projectDir, { force: true, projectName: 'test-project' });
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('preserves state.json project data after update', async () => {
    const stateBefore = JSON.parse(readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8'));
    await updateCore(projectDir, { force: true });
    const stateAfter = JSON.parse(readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8'));
    assert.equal(stateAfter.project.name, stateBefore.project.name, 'project.name should be preserved');
  });

  it('adds update history entry to state.json', async () => {
    await updateCore(projectDir, { force: true });
    const state = JSON.parse(readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8'));
    assert.ok(Array.isArray(state.history), 'should have history array');
    const updateEntry = state.history.find(h => h.agent === 'core-updater');
    assert.ok(updateEntry, 'should have core-updater history entry');
  });

  it('does not modify state.json in dry-run mode', async () => {
    const stateBefore = readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8');
    await updateCore(projectDir, { force: true, dryRun: true });
    const stateAfter = readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8');
    assert.equal(stateAfter, stateBefore, 'state.json should be unchanged in dry-run');
  });
});

// ---------------------------------------------------------------------------
// uninstallCore
// ---------------------------------------------------------------------------

describe('core/installer: uninstallCore removes shared framework files', () => {
  let tempDir;
  let projectDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    projectDir = scaffoldProject(tempDir);
    await installCore(projectDir, { force: true, projectName: 'test-project' });
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('removes .isdlc/config/ directory', async () => {
    await uninstallCore(projectDir, { force: true });
    assert.ok(!existsSync(join(projectDir, '.isdlc', 'config')), '.isdlc/config/ should be removed');
  });

  it('removes .isdlc/templates/ directory', async () => {
    await uninstallCore(projectDir, { force: true });
    assert.ok(!existsSync(join(projectDir, '.isdlc', 'templates')), '.isdlc/templates/ should be removed');
  });

  it('preserves .isdlc/state.json', async () => {
    await uninstallCore(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, '.isdlc', 'state.json')), 'state.json should be preserved');
  });

  it('preserves BACKLOG.md', async () => {
    await uninstallCore(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, 'BACKLOG.md')), 'BACKLOG.md should be preserved');
  });

  it('does not remove files in dry-run mode', async () => {
    await uninstallCore(projectDir, { force: true, dryRun: true });
    assert.ok(existsSync(join(projectDir, '.isdlc', 'config')), '.isdlc/config/ should still exist in dry-run');
  });
});

// ---------------------------------------------------------------------------
// doctorCore
// ---------------------------------------------------------------------------

describe('core/installer: doctorCore checks shared installation health', () => {
  let tempDir;
  let projectDir;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = scaffoldProject(tempDir);
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('returns healthy result for valid installation', async () => {
    await installCore(projectDir, { force: true, projectName: 'test-project' });
    const result = await doctorCore(projectDir);
    assert.ok(result.healthy, 'should report healthy for valid install');
    assert.equal(result.issues.length, 0, 'should have no issues');
  });

  it('reports issues when .isdlc/ is missing', async () => {
    const result = await doctorCore(projectDir);
    assert.ok(!result.healthy, 'should not be healthy when .isdlc/ missing');
    assert.ok(result.issues.length > 0, 'should have at least one issue');
  });

  it('reports issue when state.json is missing', async () => {
    mkdirSync(join(projectDir, '.isdlc'), { recursive: true });
    const result = await doctorCore(projectDir);
    assert.ok(!result.healthy, 'should not be healthy without state.json');
    const stateIssue = result.issues.find(i => i.includes('state.json'));
    assert.ok(stateIssue, 'should report state.json issue');
  });

  it('reports issue when constitution is missing', async () => {
    await installCore(projectDir, { force: true, projectName: 'test-project' });
    // Remove constitution
    const { rmSync } = await import('node:fs');
    rmSync(join(projectDir, 'docs', 'isdlc', 'constitution.md'));
    const result = await doctorCore(projectDir);
    const constitutionIssue = result.issues.find(i => i.includes('constitution')) ||
                               result.warnings.find(w => w.includes('constitution'));
    assert.ok(constitutionIssue, 'should report constitution issue or warning');
  });

  it('returns warnings array and passed array', async () => {
    await installCore(projectDir, { force: true, projectName: 'test-project' });
    const result = await doctorCore(projectDir);
    assert.ok(Array.isArray(result.warnings), 'should have warnings array');
    assert.ok(Array.isArray(result.passed), 'should have passed array');
  });
});
