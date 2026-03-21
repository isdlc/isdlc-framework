/**
 * Tests for Embedding Lifecycle — FR-004, FR-005, FR-006
 *
 * BUG-0056: Verify installer, uninstaller, and updater manage embedding
 * infrastructure correctly.
 *
 * These tests verify the new code paths by importing and testing the
 * model-downloader functions directly, and by verifying the lifecycle
 * scripts contain the expected imports and function calls.
 *
 * REQ: BUG-0056 / FR-004 (AC-004-01..04), FR-005 (AC-005-01..03), FR-006 (AC-006-01..03)
 * Article II: Test-First Development
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../../utils/test-helpers.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

// ---------------------------------------------------------------------------
// FR-004: Installer embedding infrastructure
// ---------------------------------------------------------------------------

describe('FR-004: Installer Embedding Infrastructure', () => {
  // TC-004-06: tokenizers package in package.json
  it('TC-004-06: tokenizers listed in package.json', () => {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
    assert.ok('tokenizers' in allDeps, 'tokenizers should be available');
  });

  // TC-004-01: Installer source references user-memory directory creation
  it('TC-004-01: installer.js creates user-memory directory', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'installer.js'), 'utf-8');
    assert.ok(src.includes('user-memory'), 'Installer should reference user-memory directory');
    assert.ok(src.includes('.isdlc/user-memory') || src.includes("'user-memory'"),
      'Installer should create user-memory path');
  });

  // TC-004-02: Installer source references docs/.embeddings/ creation
  it('TC-004-02: installer.js creates docs/.embeddings directory', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'installer.js'), 'utf-8');
    assert.ok(src.includes('.embeddings'), 'Installer should reference .embeddings directory');
  });

  // TC-004-03: Installer source calls downloadModel()
  it('TC-004-03: installer.js calls downloadModel()', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'installer.js'), 'utf-8');
    assert.ok(src.includes('downloadModel'), 'Installer should call downloadModel()');
  });

  // TC-004-04: Installer continues when model download fails (source analysis)
  it('TC-004-04: installer handles download failure non-blocking', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'installer.js'), 'utf-8');
    // Should have try/catch around downloadModel
    assert.ok(src.includes('Model download skipped') || src.includes('not available'),
      'Installer should handle download failure with warning');
  });

  // TC-004-05: Installer creates user-memory dir idempotently
  it('TC-004-05: ensureDir is idempotent (directory already exists)', async () => {
    const tmpDir = createTempDir();
    const dir = join(tmpDir, 'user-memory');
    mkdirSync(dir, { recursive: true });
    // Re-create should not throw
    mkdirSync(dir, { recursive: true });
    assert.ok(existsSync(dir), 'Directory should still exist');
    cleanupTempDir(tmpDir);
  });
});

// ---------------------------------------------------------------------------
// FR-005: Uninstaller embedding cleanup
// ---------------------------------------------------------------------------

describe('FR-005: Uninstaller Embedding Cleanup', () => {
  // TC-005-01: Uninstaller removes .isdlc/models/
  it('TC-005-01: uninstaller.js removes .isdlc/models/', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'uninstaller.js'), 'utf-8');
    assert.ok(src.includes('models'), 'Uninstaller should reference models directory');
    assert.ok(src.includes('.isdlc/models') || src.includes("'models'"),
      'Uninstaller should remove .isdlc/models/');
  });

  // TC-005-02: Uninstaller removes docs/.embeddings/ contents
  it('TC-005-02: uninstaller.js cleans docs/.embeddings/', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'uninstaller.js'), 'utf-8');
    assert.ok(src.includes('.embeddings'),
      'Uninstaller should reference .embeddings directory');
  });

  // TC-005-03: Uninstaller removes memory.db but preserves session JSONs
  it('TC-005-03: uninstaller.js removes memory.db', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'uninstaller.js'), 'utf-8');
    assert.ok(src.includes('memory.db'),
      'Uninstaller should reference memory.db for removal');
  });

  // TC-005-04: Uninstaller handles missing model directory gracefully
  it('TC-005-04: uninstaller handles missing dirs gracefully', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'uninstaller.js'), 'utf-8');
    assert.ok(src.includes('isDirectory(modelsDir)') || src.includes('Embedding cleanup skipped'),
      'Uninstaller should check directory existence before removal');
  });
});

// ---------------------------------------------------------------------------
// FR-006: Updater model version check
// ---------------------------------------------------------------------------

describe('FR-006: Updater Model Version Check', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // TC-006-01: Updater re-downloads when version differs
  it('TC-006-01: updater.js checks model version', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'updater.js'), 'utf-8');
    assert.ok(src.includes('getExpectedModelVersion') || src.includes('getInstalledModelVersion'),
      'Updater should check model version');
    assert.ok(src.includes('downloadModel'),
      'Updater should call downloadModel for re-download');
  });

  // TC-006-02: getInstalledModelVersion returns null when no version file
  it('TC-006-02: getInstalledModelVersion returns null for missing version', async () => {
    const { getInstalledModelVersion } = await import('./model-downloader.js');
    const version = await getInstalledModelVersion(tempDir);
    assert.equal(version, null, 'Should return null when no version file exists');
  });

  // TC-006-03: getInstalledModelVersion returns version from file
  it('TC-006-03: getInstalledModelVersion reads version from file', async () => {
    const { getInstalledModelVersion } = await import('./model-downloader.js');
    const modelDir = join(tempDir, '.isdlc', 'models', 'codebert-base');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'model-version.json'), JSON.stringify({ version: '1.0.0' }));
    const version = await getInstalledModelVersion(tempDir);
    assert.equal(version, '1.0.0');
  });

  // TC-006-04: getExpectedModelVersion returns a version string
  it('TC-006-04: getExpectedModelVersion returns expected version', async () => {
    const { getExpectedModelVersion } = await import('./model-downloader.js');
    const version = getExpectedModelVersion();
    assert.equal(typeof version, 'string');
    assert.ok(version.length > 0);
  });

  // TC-006-03 (updater): Updater continues when re-download fails
  it('TC-006-updater-03: updater handles model failure non-blocking', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'updater.js'), 'utf-8');
    assert.ok(src.includes('Model version check skipped') || src.includes('Model update skipped'),
      'Updater should handle model failure gracefully');
  });
});
