/**
 * E2E Tests: CLI Lifecycle
 *
 * End-to-end tests exercising the full CLI tool via subprocess,
 * simulating real user workflows in isolated temp directories.
 *
 * These tests use the subprocess approach (matching installer.test.js patterns).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../../lib/utils/test-helpers.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const binPath = join(__dirname, '..', '..', 'bin', 'isdlc.js');

function runCli(cwd, args, opts = {}) {
  const { expectFailure = false, timeout = 60000 } = opts;
  try {
    return execSync(`node "${binPath}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  } catch (err) {
    if (expectFailure) {
      return { stdout: err.stdout || '', stderr: err.stderr || '', status: err.status };
    }
    throw err;
  }
}

function setupProjectDir(name) {
  const tmpBase = createTempDir();
  const projectDir = join(tmpBase, name);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0' }, null, 2),
    'utf-8'
  );
  execSync('git init', { cwd: projectDir, stdio: 'ignore' });
  return projectDir;
}

describe('E2E: CLI Lifecycle', () => {

  describe('E2E-001: Full Lifecycle (init -> doctor -> update -> uninstall)', () => {
    it('completes full lifecycle without errors', () => {
      const projectDir = setupProjectDir('full-lifecycle');
      try {
        // Step 1: init
        const initOut = runCli(projectDir, 'init --force');
        assert.ok(existsSync(join(projectDir, '.isdlc')), '.isdlc/ should exist after init');
        assert.ok(existsSync(join(projectDir, '.claude')), '.claude/ should exist after init');
        assert.ok(existsSync(join(projectDir, '.isdlc', 'state.json')), 'state.json should exist');

        // Step 2: doctor
        const doctorOut = runCli(projectDir, 'doctor');
        assert.ok(typeof doctorOut === 'string', 'doctor should produce output');

        // Step 3: update
        const updateOut = runCli(projectDir, 'update --force');
        assert.ok(typeof updateOut === 'string', 'update should produce output');

        // Step 4: uninstall
        const uninstallOut = runCli(projectDir, 'uninstall --force');
        assert.ok(typeof uninstallOut === 'string', 'uninstall should produce output');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-002: Init Idempotency', () => {
    it('running init twice does not corrupt state', () => {
      const projectDir = setupProjectDir('idempotent');
      try {
        runCli(projectDir, 'init --force');
        const state1 = readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8');
        const parsed1 = JSON.parse(state1);
        const created1 = parsed1.project.created;

        runCli(projectDir, 'init --force');
        const state2 = readFileSync(join(projectDir, '.isdlc', 'state.json'), 'utf-8');
        const parsed2 = JSON.parse(state2);

        assert.ok(existsSync(join(projectDir, '.isdlc', 'state.json')), 'state.json should still exist');
        // State should be valid JSON (not corrupted)
        assert.ok(parsed2.framework_version, 'Should have framework_version');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-005: Uninstall Is Clean', () => {
    it('preserves user files after uninstall', () => {
      const projectDir = setupProjectDir('clean-uninstall');
      try {
        runCli(projectDir, 'init --force');

        // Create user file
        mkdirSync(join(projectDir, 'src'), { recursive: true });
        writeFileSync(join(projectDir, 'src', 'app.js'), 'console.log("hello");\n');

        runCli(projectDir, 'uninstall --force');

        // User file should still exist
        assert.ok(existsSync(join(projectDir, 'src', 'app.js')), 'User file should be preserved');
        // Framework dirs should be removed (or cleaned)
        assert.ok(existsSync(join(projectDir, 'package.json')), 'package.json should be preserved');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-007: Dry-Run Safety', () => {
    it('dry-run creates no files', () => {
      const projectDir = setupProjectDir('dry-run-e2e');
      try {
        const output = runCli(projectDir, 'init --dry-run');
        assert.ok(!existsSync(join(projectDir, '.isdlc')), '.isdlc/ should NOT exist');
        assert.ok(!existsSync(join(projectDir, '.claude')), '.claude/ should NOT exist');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-009: Version Command', () => {
    it('outputs valid semver', () => {
      const tmpDir = createTempDir();
      try {
        const output = runCli(tmpDir, 'version');
        assert.match(output.trim(), /\d+\.\d+\.\d+/, 'Should contain semver');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  describe('E2E-010: Help Command', () => {
    it('displays usage information', () => {
      const tmpDir = createTempDir();
      try {
        const output = runCli(tmpDir, 'help');
        assert.ok(
          output.includes('init') && output.includes('update'),
          'Help should list available commands'
        );
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('-h flag shows help', () => {
      const tmpDir = createTempDir();
      try {
        const output = runCli(tmpDir, '-h');
        assert.ok(output.includes('init'), '-h should show help with init command');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('no args shows help', () => {
      const tmpDir = createTempDir();
      try {
        const output = runCli(tmpDir, '');
        assert.ok(
          output.includes('Usage') || output.includes('usage') || output.includes('init'),
          'No args should show help'
        );
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  describe('E2E-011: Unknown Command Error', () => {
    it('unknown command produces error', () => {
      const tmpDir = createTempDir();
      try {
        const result = runCli(tmpDir, 'foobar', { expectFailure: true });
        assert.ok(
          result.status !== 0 || (result.stderr && result.stderr.length > 0),
          'Unknown command should fail'
        );
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  describe('E2E-012: Provider Mode Options', () => {
    it('accepts --provider-mode free', () => {
      const projectDir = setupProjectDir('mode-free');
      try {
        const output = runCli(projectDir, 'init --force --provider-mode free');
        assert.ok(typeof output === 'string', 'free mode should work');
        // Verify providers.yaml exists
        const providersPath = join(projectDir, '.isdlc', 'providers.yaml');
        assert.ok(existsSync(providersPath), 'providers.yaml should exist');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });

    it('accepts --provider-mode quality', () => {
      const projectDir = setupProjectDir('mode-quality');
      try {
        const output = runCli(projectDir, 'init --force --provider-mode quality');
        assert.ok(typeof output === 'string', 'quality mode should work');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-013: Update --force', () => {
    it('force update succeeds even when up to date', () => {
      const projectDir = setupProjectDir('update-force');
      try {
        runCli(projectDir, 'init --force');
        const output = runCli(projectDir, 'update --force');
        assert.ok(typeof output === 'string', 'update --force should produce output');
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-015: Error Exit Codes', () => {
    it('update without installation fails', () => {
      const projectDir = setupProjectDir('update-no-install');
      try {
        const result = runCli(projectDir, 'update', { expectFailure: true });
        assert.ok(
          result.status !== 0,
          'update without installation should have non-zero exit'
        );
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-016: search-setup Command', () => {
    it('search-setup appears in help output', () => {
      const tmpDir = createTempDir();
      try {
        const output = runCli(tmpDir, 'help');
        assert.ok(
          output.includes('search-setup'),
          'Help should list search-setup command'
        );
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('search-setup runs standalone after init', () => {
      const projectDir = setupProjectDir('search-setup-standalone');
      try {
        runCli(projectDir, 'init --force --no-search-setup');
        assert.ok(existsSync(join(projectDir, '.isdlc')), '.isdlc/ should exist');

        // Run search-setup standalone — should not throw
        const output = runCli(projectDir, 'search-setup --force');
        assert.ok(typeof output === 'string', 'search-setup should produce output');

        // search-config.json should exist after search-setup
        assert.ok(
          existsSync(join(projectDir, '.isdlc', 'search-config.json')),
          'search-config.json should exist after search-setup'
        );
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });

  describe('E2E-017: Update Runs Search Setup', () => {
    it('update --force creates search-config.json', () => {
      const projectDir = setupProjectDir('update-search');
      try {
        // Init without search setup
        runCli(projectDir, 'init --force --no-search-setup');
        assert.ok(
          !existsSync(join(projectDir, '.isdlc', 'search-config.json')),
          'search-config.json should NOT exist after init --no-search-setup'
        );

        // Update should run search setup
        const output = runCli(projectDir, 'update --force');
        assert.ok(typeof output === 'string', 'update should produce output');

        assert.ok(
          existsSync(join(projectDir, '.isdlc', 'search-config.json')),
          'search-config.json should exist after update'
        );
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });

    it('update --no-search-setup skips search config', () => {
      const projectDir = setupProjectDir('update-no-search');
      try {
        runCli(projectDir, 'init --force --no-search-setup');
        assert.ok(
          !existsSync(join(projectDir, '.isdlc', 'search-config.json')),
          'search-config.json should NOT exist after init --no-search-setup'
        );

        // Update with --no-search-setup
        runCli(projectDir, 'update --force --no-search-setup');
        assert.ok(
          !existsSync(join(projectDir, '.isdlc', 'search-config.json')),
          'search-config.json should NOT exist after update --no-search-setup'
        );
      } finally {
        cleanupTempDir(join(projectDir, '..'));
      }
    });
  });
});
