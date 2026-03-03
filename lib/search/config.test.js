/**
 * Tests for lib/search/config.js
 *
 * REQ-0041 / FR-010: Search Configuration Management
 * Tests read/write cycle, missing file defaults, corrupt JSON recovery,
 * and grep-glob invariant enforcement.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers.js';
import { readSearchConfig, writeSearchConfig, getDefaultConfig } from './config.js';

describe('Search Config', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // TC-010-01: View current search configuration
  describe('readSearchConfig', () => {
    it('should return default config when file is missing', () => {
      const config = readSearchConfig(tmpDir);
      assert.equal(config.enabled, true);
      assert.deepStrictEqual(config.activeBackends, ['grep-glob']);
      assert.equal(config.preferredModality, 'lexical');
      assert.equal(config.cloudAllowed, false);
    });

    // TC-010-06: Read config when file corrupt
    it('should return default config when file contains invalid JSON', () => {
      const isdlcDir = join(tmpDir, '.isdlc');
      mkdirSync(isdlcDir, { recursive: true });
      writeFileSync(join(isdlcDir, 'search-config.json'), 'NOT VALID JSON!!!', 'utf-8');

      const config = readSearchConfig(tmpDir);
      assert.equal(config.enabled, true);
      assert.deepStrictEqual(config.activeBackends, ['grep-glob']);
    });

    // TC-010-07: Write and re-read config round-trip
    it('should read back written config correctly', () => {
      const original = {
        enabled: true,
        activeBackends: ['grep-glob', 'ast-grep'],
        preferredModality: 'structural',
        cloudAllowed: true,
        scaleTier: 'medium',
        backendConfigs: {
          'ast-grep': { enabled: true, mcpServerName: 'ast-grep' },
        },
      };

      writeSearchConfig(tmpDir, original);
      const readBack = readSearchConfig(tmpDir);

      assert.equal(readBack.enabled, true);
      assert.ok(readBack.activeBackends.includes('grep-glob'));
      assert.ok(readBack.activeBackends.includes('ast-grep'));
      assert.equal(readBack.preferredModality, 'structural');
      assert.equal(readBack.cloudAllowed, true);
      assert.equal(readBack.scaleTier, 'medium');
    });

    // TC-010-09: Config preserves cloudAllowed setting
    it('should preserve cloudAllowed setting through write-read cycle', () => {
      writeSearchConfig(tmpDir, { ...getDefaultConfig(), cloudAllowed: true });
      const config = readSearchConfig(tmpDir);
      assert.equal(config.cloudAllowed, true);
    });

    // TC-010-10: Config preserves backendConfigs
    it('should preserve per-backend configuration', () => {
      const original = {
        ...getDefaultConfig(),
        backendConfigs: {
          'ast-grep': { enabled: true, options: { timeout: 5000 } },
        },
      };
      writeSearchConfig(tmpDir, original);
      const config = readSearchConfig(tmpDir);
      assert.deepStrictEqual(config.backendConfigs['ast-grep'], { enabled: true, options: { timeout: 5000 } });
    });

    // TC-010-11: Config preferredModality defaults
    it('should have a sensible default for preferredModality', () => {
      const config = getDefaultConfig();
      assert.equal(config.preferredModality, 'lexical');
    });

    it('should enforce grep-glob in activeBackends on read', () => {
      const isdlcDir = join(tmpDir, '.isdlc');
      mkdirSync(isdlcDir, { recursive: true });
      writeFileSync(
        join(isdlcDir, 'search-config.json'),
        JSON.stringify({ enabled: true, activeBackends: ['ast-grep'] }),
        'utf-8'
      );

      const config = readSearchConfig(tmpDir);
      assert.ok(config.activeBackends.includes('grep-glob'));
      assert.ok(config.activeBackends.includes('ast-grep'));
    });

    it('should handle non-array activeBackends gracefully', () => {
      const isdlcDir = join(tmpDir, '.isdlc');
      mkdirSync(isdlcDir, { recursive: true });
      writeFileSync(
        join(isdlcDir, 'search-config.json'),
        JSON.stringify({ enabled: true, activeBackends: 'not-an-array' }),
        'utf-8'
      );

      const config = readSearchConfig(tmpDir);
      assert.ok(Array.isArray(config.activeBackends));
      assert.ok(config.activeBackends.includes('grep-glob'));
    });
  });

  describe('writeSearchConfig', () => {
    // TC-010-08: Write config when .isdlc directory missing
    it('should create .isdlc directory if it does not exist', () => {
      const config = getDefaultConfig();
      writeSearchConfig(tmpDir, config);

      const filePath = join(tmpDir, '.isdlc', 'search-config.json');
      assert.ok(existsSync(filePath));
    });

    it('should enforce grep-glob invariant on write', () => {
      writeSearchConfig(tmpDir, {
        enabled: true,
        activeBackends: ['ast-grep'],
        preferredModality: 'structural',
        cloudAllowed: false,
        scaleTier: 'small',
        backendConfigs: {},
      });

      const filePath = join(tmpDir, '.isdlc', 'search-config.json');
      const written = JSON.parse(readFileSync(filePath, 'utf-8'));
      assert.ok(written.activeBackends.includes('grep-glob'));
    });

    // TC-010-12: Disable all enhanced backends
    it('should keep search enabled with only grep-glob active', () => {
      writeSearchConfig(tmpDir, {
        enabled: true,
        activeBackends: ['grep-glob'],
        preferredModality: 'lexical',
        cloudAllowed: false,
        scaleTier: 'small',
        backendConfigs: {},
      });

      const config = readSearchConfig(tmpDir);
      assert.equal(config.enabled, true);
      assert.deepStrictEqual(config.activeBackends, ['grep-glob']);
    });

    // TC-010-02: Disable specific backend
    it('should allow removing a specific backend', () => {
      const original = {
        ...getDefaultConfig(),
        activeBackends: ['grep-glob', 'ast-grep', 'probe'],
      };
      writeSearchConfig(tmpDir, original);

      // Disable ast-grep by removing from activeBackends
      const updated = { ...original, activeBackends: ['grep-glob', 'probe'] };
      writeSearchConfig(tmpDir, updated);

      const config = readSearchConfig(tmpDir);
      assert.ok(config.activeBackends.includes('grep-glob'));
      assert.ok(config.activeBackends.includes('probe'));
      assert.ok(!config.activeBackends.includes('ast-grep'));
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a new object each call', () => {
      const a = getDefaultConfig();
      const b = getDefaultConfig();
      assert.notEqual(a, b);
      assert.deepStrictEqual(a, b);
    });

    it('should have expected default values', () => {
      const config = getDefaultConfig();
      assert.equal(config.enabled, true);
      assert.deepStrictEqual(config.activeBackends, ['grep-glob']);
      assert.equal(config.preferredModality, 'lexical');
      assert.equal(config.cloudAllowed, false);
      assert.equal(config.scaleTier, 'small');
      assert.deepStrictEqual(config.backendConfigs, {});
    });
  });
});
