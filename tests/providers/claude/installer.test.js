/**
 * Tests for src/providers/claude/installer.js
 *
 * Unit tests for the Claude-specific installer functions:
 * installClaude, updateClaude, uninstallClaude, doctorClaude.
 *
 * REQ-0089: Provider-aware installer/updater/doctor/uninstaller
 *
 * Uses temp directories for isolation. All tests verify that Claude-specific
 * operations produce the correct .claude/ file structure.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';

// Import the Claude provider installer functions under test
import {
  installClaude,
  updateClaude,
  uninstallClaude,
  doctorClaude,
} from '../../../src/providers/claude/installer.js';

/**
 * Scaffold a minimal project directory with .isdlc pre-created
 * (simulating that installCore already ran).
 */
function scaffoldWithCore(tempDir) {
  const projectDir = join(tempDir, 'test-project');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2),
    'utf-8'
  );
  // Simulate installCore having run
  const isdlcDir = join(projectDir, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });
  writeFileSync(
    join(isdlcDir, 'state.json'),
    JSON.stringify({
      framework_version: '0.1.0-alpha',
      project: { name: 'test-project', created: new Date().toISOString() },
      phases: {},
      current_phase: '01-requirements',
      history: [],
    }, null, 2),
    'utf-8'
  );
  return projectDir;
}

// ---------------------------------------------------------------------------
// installClaude
// ---------------------------------------------------------------------------

describe('providers/claude/installer: installClaude creates .claude directory', () => {
  let tempDir;
  let projectDir;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = scaffoldWithCore(tempDir);
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('creates .claude/ directory', async () => {
    await installClaude(projectDir, { force: true, dryRun: false });
    assert.ok(existsSync(join(projectDir, '.claude')), '.claude/ should exist');
  });

  it('creates .claude/agents/ directory', async () => {
    await installClaude(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, '.claude', 'agents')), '.claude/agents/ should exist');
  });

  it('creates .claude/skills/ directory', async () => {
    await installClaude(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, '.claude', 'skills')), '.claude/skills/ should exist');
  });

  it('creates .claude/hooks/ directory', async () => {
    await installClaude(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, '.claude', 'hooks')), '.claude/hooks/ should exist');
  });

  it('creates .claude/commands/ directory', async () => {
    await installClaude(projectDir, { force: true });
    assert.ok(existsSync(join(projectDir, '.claude', 'commands')), '.claude/commands/ should exist');
  });

  it('creates settings.json with hooks configuration', async () => {
    await installClaude(projectDir, { force: true });
    const settingsPath = join(projectDir, '.claude', 'settings.json');
    assert.ok(existsSync(settingsPath), 'settings.json should exist');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    assert.ok('hooks' in settings, 'settings should have hooks key');
  });

  it('returns list of installed files for manifest tracking', async () => {
    const result = await installClaude(projectDir, { force: true });
    assert.ok(Array.isArray(result.installedFiles), 'should return installedFiles array');
    assert.ok(result.installedFiles.length > 0, 'installedFiles should not be empty');
  });

  it('does not create files in dry-run mode', async () => {
    await installClaude(projectDir, { force: true, dryRun: true });
    // .claude/ may or may not exist but agents/skills should not be populated
    const agentsDir = join(projectDir, '.claude', 'agents');
    if (existsSync(agentsDir)) {
      const entries = readdirSync(agentsDir);
      assert.equal(entries.length, 0, 'agents/ should be empty in dry-run');
    }
  });

  it('merges settings.json preserving existing user keys', async () => {
    // Pre-create settings.json with a custom key
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    writeFileSync(
      join(projectDir, '.claude', 'settings.json'),
      JSON.stringify({ myCustomKey: 'preserve-me' }, null, 2),
      'utf-8'
    );
    await installClaude(projectDir, { force: true });
    const settings = JSON.parse(readFileSync(join(projectDir, '.claude', 'settings.json'), 'utf-8'));
    assert.equal(settings.myCustomKey, 'preserve-me', 'custom key should be preserved');
    assert.ok('hooks' in settings, 'hooks should still be present');
  });
});

// ---------------------------------------------------------------------------
// updateClaude
// ---------------------------------------------------------------------------

describe('providers/claude/installer: updateClaude updates Claude-specific files', () => {
  let tempDir;
  let projectDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    projectDir = scaffoldWithCore(tempDir);
    await installClaude(projectDir, { force: true });
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('preserves settings.json user keys after update', async () => {
    // Inject a user key
    const settingsPath = join(projectDir, '.claude', 'settings.json');
    const existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    existing.userKey = 'survive-update';
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2), 'utf-8');

    await updateClaude(projectDir, { force: true });
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    assert.equal(settings.userKey, 'survive-update', 'user key should survive update');
  });

  it('updates framework directories (agents, skills, commands, hooks)', async () => {
    await updateClaude(projectDir, { force: true });
    // Directories should still exist and have content
    for (const dir of ['agents', 'skills', 'commands', 'hooks']) {
      const dirPath = join(projectDir, '.claude', dir);
      assert.ok(existsSync(dirPath), `${dir}/ should exist after update`);
    }
  });

  it('returns updated installed files list', async () => {
    const result = await updateClaude(projectDir, { force: true });
    assert.ok(Array.isArray(result.installedFiles), 'should return installedFiles');
    assert.ok(result.installedFiles.length > 0, 'installedFiles should not be empty');
  });
});

// ---------------------------------------------------------------------------
// uninstallClaude
// ---------------------------------------------------------------------------

describe('providers/claude/installer: uninstallClaude removes Claude-specific files', () => {
  let tempDir;
  let projectDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    projectDir = scaffoldWithCore(tempDir);
    await installClaude(projectDir, { force: true });
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('strips hooks from settings.json', async () => {
    await uninstallClaude(projectDir, { force: true });
    const settingsPath = join(projectDir, '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(!('hooks' in settings), 'hooks should be removed');
      assert.ok(!('permissions' in settings), 'permissions should be removed');
    }
  });

  it('does not modify files in dry-run mode', async () => {
    const settingsPath = join(projectDir, '.claude', 'settings.json');
    const before = readFileSync(settingsPath, 'utf-8');
    await uninstallClaude(projectDir, { force: true, dryRun: true });
    const after = readFileSync(settingsPath, 'utf-8');
    assert.equal(after, before, 'settings.json should be unchanged in dry-run');
  });

  it('preserves settings.local.json', async () => {
    const localPath = join(projectDir, '.claude', 'settings.local.json');
    writeFileSync(localPath, JSON.stringify({ user: true }), 'utf-8');
    await uninstallClaude(projectDir, { force: true });
    assert.ok(existsSync(localPath), 'settings.local.json should be preserved');
  });
});

// ---------------------------------------------------------------------------
// doctorClaude
// ---------------------------------------------------------------------------

describe('providers/claude/installer: doctorClaude checks Claude installation health', () => {
  let tempDir;
  let projectDir;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = scaffoldWithCore(tempDir);
  });

  afterEach(() => cleanupTempDir(tempDir));

  it('returns healthy result for valid Claude installation', async () => {
    await installClaude(projectDir, { force: true });
    const result = await doctorClaude(projectDir);
    assert.ok(result.healthy, 'should report healthy');
    assert.equal(result.issues.length, 0, 'should have no issues');
  });

  it('reports issue when .claude/ is missing', async () => {
    const result = await doctorClaude(projectDir);
    assert.ok(!result.healthy, 'should not be healthy without .claude/');
    assert.ok(result.issues.length > 0, 'should report at least one issue');
  });

  it('reports warning when settings.json is missing', async () => {
    await installClaude(projectDir, { force: true });
    rmSync(join(projectDir, '.claude', 'settings.json'));
    const result = await doctorClaude(projectDir);
    const settingsIssue = result.issues.find(i => i.includes('settings.json')) ||
                           result.warnings.find(w => w.includes('settings.json'));
    assert.ok(settingsIssue, 'should report settings.json issue or warning');
  });

  it('reports warning when hooks subdirectories are missing', async () => {
    await installClaude(projectDir, { force: true });
    // Remove agents dir
    rmSync(join(projectDir, '.claude', 'agents'), { recursive: true });
    const result = await doctorClaude(projectDir);
    const agentIssue = result.warnings.find(w => w.includes('agents'));
    assert.ok(agentIssue, 'should warn about missing agents/');
  });

  it('returns warnings and passed arrays', async () => {
    await installClaude(projectDir, { force: true });
    const result = await doctorClaude(projectDir);
    assert.ok(Array.isArray(result.warnings), 'should have warnings array');
    assert.ok(Array.isArray(result.passed), 'should have passed array');
  });
});
