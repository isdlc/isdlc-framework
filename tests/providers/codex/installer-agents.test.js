/**
 * Tests for AGENTS.md handling in src/providers/codex/installer.js
 * REQ-0138: Codex Session Cache Re-priming + AGENTS.md Template
 *
 * Tests that installCodex copies AGENTS.md.template to project root,
 * skips if exists, and updateCodex backs up and refreshes.
 *
 * Test ID prefix: INA-
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync, writeFileSync, existsSync, readFileSync, rmSync
} from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';

import {
  installCodex,
  updateCodex
} from '../../../src/providers/codex/installer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scaffoldProject(tempDir) {
  const projectDir = join(tempDir, 'test-project');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2),
    'utf-8'
  );
  const isdlcDir = join(projectDir, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });
  writeFileSync(
    join(isdlcDir, 'state.json'),
    JSON.stringify({
      framework_version: '0.1.0-alpha',
      project: { name: 'test-project' },
      phases: {},
      current_phase: '01-requirements',
    }, null, 2),
    'utf-8'
  );
  return projectDir;
}

// ---------------------------------------------------------------------------
// installCodex: AGENTS.md copy
// ---------------------------------------------------------------------------

describe('installCodex AGENTS.md handling (REQ-0138 FR-006)', () => {
  let tempDir;
  let projectDir;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = scaffoldProject(tempDir);
  });

  afterEach(() => cleanupTempDir(tempDir));

  // INA-01: Copies AGENTS.md to project root
  it('INA-01: copies AGENTS.md.template to project root as AGENTS.md (AC-006-01)', async () => {
    await installCodex(projectDir);
    const agentsPath = join(projectDir, 'AGENTS.md');
    assert.ok(existsSync(agentsPath), 'AGENTS.md should exist at project root');
  });

  // INA-02: AGENTS.md contains template content
  it('INA-02: AGENTS.md contains content from the template (AC-006-01)', async () => {
    await installCodex(projectDir);
    const agentsPath = join(projectDir, 'AGENTS.md');
    const content = readFileSync(agentsPath, 'utf-8');
    assert.ok(content.includes('Workflow-First Development'), 'Should contain workflow section');
    assert.ok(content.includes('Session Cache Re-prime'), 'Should contain cache re-prime section');
    assert.ok(content.includes('Governance'), 'Should contain governance section');
  });

  // INA-03: Skips if AGENTS.md already exists
  it('INA-03: skips AGENTS.md copy if file already exists (AC-006-02)', async () => {
    const agentsPath = join(projectDir, 'AGENTS.md');
    const customContent = '# My Custom AGENTS\n\nDo not overwrite.';
    writeFileSync(agentsPath, customContent, 'utf-8');

    await installCodex(projectDir);

    const content = readFileSync(agentsPath, 'utf-8');
    assert.strictEqual(content, customContent, 'Existing AGENTS.md should be preserved');
  });

  // INA-04: Reports AGENTS.md in filesCreated
  it('INA-04: includes AGENTS.md in filesCreated when newly created (AC-006-01)', async () => {
    const result = await installCodex(projectDir);
    assert.ok(
      result.filesCreated.some(f => f === 'AGENTS.md'),
      'filesCreated should include AGENTS.md'
    );
  });

  // INA-05: Does not report AGENTS.md in filesCreated when skipped
  it('INA-05: does not include AGENTS.md in filesCreated when skipped (AC-006-02)', async () => {
    writeFileSync(join(projectDir, 'AGENTS.md'), '# Existing', 'utf-8');
    const result = await installCodex(projectDir);
    assert.ok(
      !result.filesCreated.includes('AGENTS.md'),
      'filesCreated should not include AGENTS.md when skipped'
    );
  });
});

// ---------------------------------------------------------------------------
// updateCodex: AGENTS.md backup and refresh
// ---------------------------------------------------------------------------

describe('updateCodex AGENTS.md handling (REQ-0138 FR-006)', () => {
  let tempDir;
  let projectDir;

  beforeEach(async () => {
    tempDir = createTempDir();
    projectDir = scaffoldProject(tempDir);
    await installCodex(projectDir);
  });

  afterEach(() => cleanupTempDir(tempDir));

  // INA-06: Creates backup of existing AGENTS.md
  it('INA-06: creates AGENTS.md.backup before updating (AC-006-03)', async () => {
    await updateCodex(projectDir);
    const backupPath = join(projectDir, 'AGENTS.md.backup');
    assert.ok(existsSync(backupPath), 'AGENTS.md.backup should exist');
  });

  // INA-07: Backup contains original content
  it('INA-07: backup contains original AGENTS.md content (AC-006-03)', async () => {
    const originalContent = readFileSync(join(projectDir, 'AGENTS.md'), 'utf-8');
    await updateCodex(projectDir);
    const backupContent = readFileSync(join(projectDir, 'AGENTS.md.backup'), 'utf-8');
    assert.strictEqual(backupContent, originalContent, 'Backup should match original');
  });

  // INA-08: Refreshes AGENTS.md with latest template
  it('INA-08: refreshes AGENTS.md with latest template content (AC-006-03)', async () => {
    // Corrupt the AGENTS.md
    writeFileSync(join(projectDir, 'AGENTS.md'), '# Stale content', 'utf-8');
    await updateCodex(projectDir);

    const content = readFileSync(join(projectDir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('Workflow-First Development'), 'Should have fresh template content');
  });

  // INA-09: Update succeeds even without existing AGENTS.md
  it('INA-09: update creates AGENTS.md if it does not exist (AC-006-03)', async () => {
    const agentsPath = join(projectDir, 'AGENTS.md');
    if (existsSync(agentsPath)) rmSync(agentsPath);

    await updateCodex(projectDir);
    assert.ok(existsSync(agentsPath), 'AGENTS.md should be created on update');
  });

  // INA-10: No backup created if AGENTS.md did not exist
  it('INA-10: no backup created if AGENTS.md was missing (AC-006-03)', async () => {
    const agentsPath = join(projectDir, 'AGENTS.md');
    if (existsSync(agentsPath)) rmSync(agentsPath);

    await updateCodex(projectDir);
    const backupPath = join(projectDir, 'AGENTS.md.backup');
    assert.ok(!existsSync(backupPath), 'Should not create backup when no original exists');
  });
});
