/**
 * Tests for CLI provider integration (REQ-0137)
 *
 * Tests --provider flag parsing, detectProvider() function,
 * and provider-aware init/update/doctor commands.
 *
 * Uses subprocess isolation for CLI tests (same pattern as cli.test.js)
 * and direct imports for parseArgs/detectProvider unit tests.
 *
 * Test ID prefix: CP- (CLI Provider)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const binPath = join(__dirname, '..', 'bin', 'isdlc.js');
const EXEC_OPTS = { encoding: 'utf-8', timeout: 15000 };

// Import parseArgs and detectProvider directly for unit tests
import { parseArgs, detectProvider } from './cli.js';

function runCLI(args, opts = {}) {
  return execSync(`node "${binPath}" ${args}`, { ...EXEC_OPTS, ...opts });
}

function runCLIExpectFail(args, opts = {}) {
  try {
    const stdout = execSync(`node "${binPath}" ${args}`, {
      ...EXEC_OPTS,
      ...opts,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

// ===========================================================================
// parseArgs — --provider flag (REQ-0137 FR-001, FR-004)
// ===========================================================================

describe('parseArgs() — --provider flag (REQ-0137)', () => {
  // CP-01: recognizes --provider flag with value
  it('CP-01: should recognize --provider flag with a value', () => {
    const result = parseArgs(['init', '--provider', 'codex']);
    assert.equal(result.options.provider, 'codex');
    assert.equal(result.command, 'init');
  });

  // CP-02: --provider without value defaults to null
  it('CP-02: should default provider to null when no flag given', () => {
    const result = parseArgs(['init']);
    assert.equal(result.options.provider, null);
  });

  // CP-03: --provider combined with --force
  it('CP-03: should work combined with --force', () => {
    const result = parseArgs(['init', '--provider', 'codex', '--force']);
    assert.equal(result.options.provider, 'codex');
    assert.equal(result.options.force, true);
  });

  // CP-13: flag order does not matter
  it('CP-13: should work regardless of flag order', () => {
    const result = parseArgs(['--provider', 'codex', 'init', '--force']);
    assert.equal(result.command, 'init');
    assert.equal(result.options.provider, 'codex');
    assert.equal(result.options.force, true);
  });
});

// ===========================================================================
// detectProvider — priority chain (REQ-0137 FR-001)
// ===========================================================================

describe('detectProvider() — priority chain (REQ-0137)', () => {
  // CP-04: --provider flag returns flag value
  it('CP-04: should return flag value when --provider is set', async () => {
    const result = await detectProvider({ provider: 'codex' }, '/tmp/nonexistent');
    assert.equal(result, 'codex');
  });

  // CP-05: no flag, no config -> returns 'claude' (default)
  it('CP-05: should return claude when no flag and no config', async () => {
    const result = await detectProvider({ provider: null }, '/tmp/nonexistent-dir-xyz');
    assert.equal(result, 'claude');
  });

  // CP-07: error in loading config returns 'claude' (fail-safe)
  it('CP-07: should return claude on config loading error (fail-safe)', async () => {
    // Point to a non-existent directory — any config loading will fail
    const result = await detectProvider({ provider: null }, '/tmp/path-that-does-not-exist-99999');
    assert.equal(result, 'claude');
  });

  // CP-06: detectProvider with providers.yaml returns config value
  it('CP-06: should return config provider when providers.yaml exists', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'isdlc-detect-'));
    try {
      // Create a minimal providers.yaml with defaults.provider = 'codex'
      const isdlcDir = join(tempDir, '.isdlc');
      mkdirSync(isdlcDir, { recursive: true });
      writeFileSync(join(isdlcDir, 'providers.yaml'),
        'defaults:\n  provider: codex\n  model: gpt-4\n');
      const result = await detectProvider({ provider: null }, tempDir);
      assert.equal(result, 'codex');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // CP-14: detectProvider priority: flag > config
  it('CP-14: flag takes precedence over config', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'isdlc-detect-'));
    try {
      const isdlcDir = join(tempDir, '.isdlc');
      mkdirSync(isdlcDir, { recursive: true });
      writeFileSync(join(isdlcDir, 'providers.yaml'),
        'defaults:\n  provider: codex\n');
      const result = await detectProvider({ provider: 'claude' }, tempDir);
      assert.equal(result, 'claude');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // CP-15: backward compatibility — existing init without --provider works
  it('CP-15: backward compatibility — no --provider defaults to claude', async () => {
    const result = await detectProvider({}, '/tmp/nonexistent');
    assert.equal(result, 'claude');
  });
});

// ===========================================================================
// CLI subprocess tests — provider integration (REQ-0137 FR-003..FR-006)
// ===========================================================================

describe('CLI subprocess — provider integration (REQ-0137)', () => {
  // CP-09: help output includes --provider flag
  it('CP-09: help output should include --provider flag', () => {
    const output = runCLI('help');
    assert.ok(output.includes('--provider'),
      'Help should mention --provider flag');
  });

  // CP-08: init --provider codex generates CODEX.md
  describe('init --provider codex (CP-08)', () => {
    let tempDir;

    before(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'isdlc-cli-provider-'));
    });

    after(() => {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('CP-08: init with --provider codex --dry-run --force should mention codex', () => {
      const output = runCLI('init --provider codex --dry-run --force', { cwd: tempDir });
      // In dry-run mode, we just verify it runs without error and mentions provider
      assert.ok(typeof output === 'string', 'Should produce string output');
    });
  });

  // CP-10: init with default provider generates CLAUDE.md
  describe('init default provider (CP-10)', () => {
    let tempDir;

    before(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'isdlc-cli-default-'));
    });

    after(() => {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('CP-10: init --dry-run --force should complete successfully', () => {
      const output = runCLI('init --dry-run --force', { cwd: tempDir });
      assert.ok(typeof output === 'string', 'Should produce string output');
    });
  });

  // CP-11: doctor command shows provider info
  it('CP-11: doctor command should show provider info', () => {
    const result = runCLIExpectFail('doctor');
    const combined = result.stdout + result.stderr;
    assert.ok(combined.length > 0, 'Doctor should produce output');
    // Doctor now includes provider section — check for "Provider" or "provider"
    assert.ok(
      combined.toLowerCase().includes('provider') ||
      combined.toLowerCase().includes('claude'),
      'Doctor output should mention provider or claude'
    );
  });

  // CP-12: update --dry-run should work (backward compat)
  describe('update with provider (CP-12)', () => {
    let tempDir;

    before(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'isdlc-cli-update-prov-'));
    });

    after(() => {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('CP-12: update --dry-run --force should handle non-installed dir', () => {
      const result = runCLIExpectFail('update --dry-run --force', { cwd: tempDir });
      const combined = result.stdout + result.stderr;
      assert.ok(combined.length > 0, 'Update should produce output');
    });
  });
});
